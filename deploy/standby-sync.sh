#!/usr/bin/env bash
#
# Keep the previous hosting (Neon database, Render API kept suspended) as a
# warm standby: copy this server's database into Neon every night, so that if
# this server is lost the old service can be resumed with recent data.
# Decided by the owner, 20 October 2026 (Disaster Recovery Plan, 2.3).
#
#   sudo bash deploy/standby-sync.sh            # sync now (backup.sh also runs it nightly)
#   sudo bash deploy/standby-sync.sh --check    # say whether a sync would be allowed
#
# Configuration, in /etc/afyascribe/backup.env:
#
#   STANDBY_URL   the Neon connection string (postgresql://…?sslmode=require).
#                 Empty = no standby.
#
# It REPLACES Neon's contents with this server's, in one transaction: Neon ends
# up an exact copy, or is left exactly as it was.
#
# Two guards, because a copy the wrong way round would destroy records:
#
#  1. Neon must be BEHIND this server, never ahead. The audit ledger is a hash
#     chain, so this is checked exactly: Neon's newest ledger line must exist
#     here with the same hash. If Neon has lines this server lacks, the standby
#     has been used (a failover) and those records must come back here first,
#     with deploy/migrate-from-neon.sh. Before cutover Neon is production and
#     is ahead, so this guard also stops any sync until then.
#  2. Nothing else may be connected to Neon. A running Render service would be
#     writing to it: suspend Render first.
#
# This is a transfer of health data outside Kenya (Neon is in AWS us-east-1).
# The Privacy Policy, DPIA and Information Security Policy record it and the
# safeguards relied on. The copy travels over TLS; the URL is refused unless
# it requires TLS.
set -Eeuo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
CONF=/etc/afyascribe/backup.env
PG_IMAGE=postgres:17-alpine
log() { printf '%s standby: %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -f "$CONF" ] && . "$CONF"
[ -n "${STANDBY_URL:-}" ] || die "STANDBY_URL is not set in $CONF"
case "$STANDBY_URL" in
  postgres://*sslmode=require*|postgresql://*sslmode=require*|postgres://*sslmode=verify-*|postgresql://*sslmode=verify-*) ;;
  *) die "STANDBY_URL must be a postgres URL that requires TLS (…?sslmode=require)" ;;
esac
export STANDBY_URL
set -a; . "$REPO/.env"; set +a

# Any step that fails says so, and where. Without this a failed lookup inside
# $(…) ended the script with only psql's own message (26 Oct 2026).
ON_ERR='log "ERROR: stopped at line $LINENO. The standby is either unchanged or fully replaced but not verified — run --check. Nothing on this server was changed."'
trap "$ON_ERR" ERR

local_psql() { docker compose -f "$REPO/docker-compose.yml" exec -T postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 -tA "$@"; }
standby_psql_once() { docker run --rm -i -e STANDBY_URL "$PG_IMAGE" sh -c 'psql "$STANDBY_URL" -v ON_ERROR_STOP=1 -tA "$@"' -- "$@"; }
# Reads only, so safe to repeat: one dropped DNS answer or network blip on the
# way to Neon must not sink the night's sync.
standby_psql() {
  local n
  for n in 1 2 3 4; do
    standby_psql_once "$@" && return 0
    [ "$n" -lt 4 ] && { log "could not reach the standby (attempt $n of 4) — retrying in 15s" >&2; sleep 15; }
  done
  return 1
}

COUNT_SQL="select table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
             from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE'
            order by table_name"
TIP_SQL="select seq || '|' || hash from audit_events where seq is not null order by seq desc limit 1"

# ── Guards ──────────────────────────────────────────────────────────────────
guards() {
  local others has_ledger tip seq hash here
  others="$(standby_psql -c "select count(*) from pg_stat_activity
                              where datname = current_database() and pid <> pg_backend_pid()
                                and usename = current_user and backend_type = 'client backend'")"
  [ "$others" -eq 0 ] || die "$others other connection(s) to the standby — is Render running? Suspend it first. Nothing changed."

  has_ledger="$(standby_psql -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'audit_events'")"
  if [ "$has_ledger" -eq 0 ]; then
    log "standby is empty — first sync"
    return 0
  fi
  tip="$(standby_psql -c "$TIP_SQL")"
  [ -n "$tip" ] || { log "standby ledger is empty"; return 0; }
  seq="${tip%%|*}"; hash="${tip#*|}"
  here="$(local_psql -c "select hash from audit_events where seq = $seq")"
  if [ -z "$here" ]; then
    die "the standby is AHEAD of this server (its ledger reaches line $seq, which is not here). Either it has been used — fail back first (Disaster Recovery Plan, Failback) — or this is before cutover. Nothing changed."
  fi
  [ "$here" = "$hash" ] || die "the standby and this server have DIVERGED at ledger line $seq. Investigate before any sync. Nothing changed."
  log "standby is behind this server (ledger line $seq matches) — safe to replace"
}

guards
[ "${1:-}" = "--check" ] && exit 0

# ── Sync ────────────────────────────────────────────────────────────────────
start=$(date +%s)
log "replacing the standby's contents — one transaction"
# Plain SQL piped straight into psql: no file of records is written anywhere.
# The schema drop and the whole dump commit together or not at all.
# psql exits 2 when the connection fails — before anything was sent, or
# part-way, when Neon rolls the transaction back. Either way the standby is as
# it was, so another try is safe. Any other failure is a failure.
attempt=1
while :; do
  set +e; trap - ERR
  {
  # Every application schema, not only public: the database also carries
  # `afyahims`, and the dump recreates it — it must not already exist.
  echo "set client_min_messages = warning;"
  echo "do \$\$ declare s text; begin
          for s in select nspname from pg_namespace
                    where nspname not in ('pg_catalog', 'information_schema') and nspname not like 'pg\\_%'
          loop execute format('drop schema %I cascade', s); end loop;
          create schema public;
        end \$\$;"
  docker compose -f "$REPO/docker-compose.yml" exec -T postgres \
    pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" --format=plain --no-owner --no-acl
  } | docker run --rm -i -e STANDBY_URL "$PG_IMAGE" \
        sh -c 'psql "$STANDBY_URL" -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null'
  status=$?
  set -e; trap "$ON_ERR" ERR
  [ "$status" -eq 0 ] && break
  if [ "$status" -eq 2 ] && [ "$attempt" -lt 3 ]; then
    log "could not connect to the standby (attempt $attempt of 3) — retrying in 30s"
    attempt=$((attempt + 1)); sleep 30; continue
  fi
  die "sync FAILED — the standby is unchanged"
done

# ── Verify ──────────────────────────────────────────────────────────────────
here_counts="$(local_psql -c "$COUNT_SQL")"
there_counts="$(standby_psql -c "$COUNT_SQL")"
there_tip="$(standby_psql -c "$TIP_SQL")"
rows=$(echo "$there_counts" | awk -F'|' '{s+=$2} END {print s}')
if [ "$here_counts" = "$there_counts" ]; then
  counts="all $(echo "$there_counts" | wc -l) tables match"
else
  # Rows written here during the copy explain a small difference; the next
  # sync carries them.
  counts="$(diff <(echo "$here_counts") <(echo "$there_counts") | grep -c '^<') table(s) differ by rows written during the copy"
fi
if [ -n "$there_tip" ]; then
  [ "${there_tip#*|}" = "$(local_psql -c "select hash from audit_events where seq = ${there_tip%%|*}")" ] \
    || die "after the sync the standby's ledger does not match this server's — investigate"
fi
log "synced in $(( $(date +%s) - start ))s: $rows rows; $counts; ledger to line ${there_tip%%|*} matches"
