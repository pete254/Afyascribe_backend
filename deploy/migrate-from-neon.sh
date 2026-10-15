#!/usr/bin/env bash
#
# Copy the production database from Neon into Postgres on this server, and
# prove the copy is complete.
#
#   cd /opt/afyascribe/backend
#   sudo docker compose up -d postgres          # the database only
#   sudo bash deploy/migrate-from-neon.sh       # asks for the Neon URL
#
# Run it twice:
#   - a REHEARSAL, any time, while Render keeps serving. Proves the copy works
#     and how long it takes. Re-run with REPLACE=1 to overwrite the rehearsal.
#   - the CUTOVER, in a maintenance window, after Render is stopped so nothing
#     writes to Neon mid-copy: REPLACE=1 sudo -E bash deploy/migrate-from-neon.sh
#
# The Neon connection string is the one in Render's DATABASE settings
# (postgresql://user:password@host/db?sslmode=require). It is read without
# echo so it never lands in shell history.
#
# The backend must not be running: on an empty database it would create the
# schema itself, and the restore would then collide with it.
set -euo pipefail

cd "$(dirname "$0")/.."
say()  { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { warn "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -f .env ] || die "No .env here — copy deploy/env.production.example and fill it in first."
set -a; . ./.env; set +a
: "${DB_USERNAME:?missing in .env}" "${DB_DATABASE:?missing in .env}"

PG_IMAGE=postgres:17-alpine
OUT=/var/backups/afyascribe
STAMP="$(date +%F-%H%M%S)"
DUMP="$OUT/neon-$STAMP.dump"
install -d -m 700 "$OUT"

target_psql() { docker compose exec -T postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 -tA "$@"; }
source_psql() { docker run --rm -e NEON_URL "$PG_IMAGE" sh -c 'psql "$NEON_URL" -v ON_ERROR_STOP=1 -tA "$@"' -- "$@"; }

# Exact row counts for every table, one "table|count" line each, sorted.
COUNT_SQL="select table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
           from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE'
           order by table_name"

# ── Preconditions ──────────────────────────────────────────────────────────
say "Checking"
if docker compose ps --status running --services 2>/dev/null | grep -qx backend; then
  die "The backend is running. Stop it first:  sudo docker compose stop backend"
fi
docker compose ps --status running --services | grep -qx postgres \
  || die "Postgres is not running. Start it:  sudo docker compose up -d postgres"

if [ -z "${NEON_URL:-}" ]; then
  read -rsp "Neon connection string (input hidden): " NEON_URL; echo
fi
export NEON_URL
case "$NEON_URL" in postgres://*|postgresql://*) ;; *) die "That does not look like a postgres:// URL." ;; esac

src_ver="$(source_psql -c 'show server_version_num')"
echo "  Neon is PostgreSQL $src_ver; this server runs 17"
[ "$src_ver" -lt 180000 ] || die "Neon is newer than 17. Raise the postgres image in docker-compose.yml to match, then re-run."

existing="$(target_psql -c "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$existing" -gt 0 ]; then
  if [ "${REPLACE:-0}" = "1" ]; then
    warn "Replacing the $existing tables already here (REPLACE=1)."
    target_psql -c 'drop schema public cascade; create schema public;' >/dev/null
  else
    die "This database already has $existing tables. Re-run with REPLACE=1 to overwrite them."
  fi
fi

# ── Dump ───────────────────────────────────────────────────────────────────
say "Dumping Neon (this holds every patient record — it stays on this server, root-only)"
start=$(date +%s)
docker run --rm -e NEON_URL -v "$OUT:/out" "$PG_IMAGE" \
  sh -c 'pg_dump "$NEON_URL" --format=custom --no-owner --no-acl --file=/out/'"$(basename "$DUMP")"
chmod 600 "$DUMP"
echo "  $(du -h "$DUMP" | cut -f1) in $(( $(date +%s) - start ))s → $DUMP"

# ── Restore ────────────────────────────────────────────────────────────────
say "Restoring — all or nothing"
start=$(date +%s)
docker compose exec -T postgres pg_restore -U "$DB_USERNAME" -d "$DB_DATABASE" \
  --no-owner --no-acl --single-transaction --exit-on-error < "$DUMP"
echo "  restored in $(( $(date +%s) - start ))s"

# ── Verify ─────────────────────────────────────────────────────────────────
say "Comparing exact row counts, table by table"
src_counts="$(source_psql -c "$COUNT_SQL")"
dst_counts="$(target_psql -c "$COUNT_SQL")"
if [ "$src_counts" = "$dst_counts" ]; then
  echo "  all $(echo "$dst_counts" | wc -l) tables match; $(echo "$dst_counts" | awk -F'|' '{s+=$2} END {print s}') rows"
else
  warn "Counts differ (Neon on the left, this server on the right):"
  diff <(echo "$src_counts") <(echo "$dst_counts") | sed 's/^/  /' || true
  warn "If Render was still running, rows written during the copy explain it — fine for a rehearsal, not for the cutover."
  exit 1
fi

say "Done"
cat <<EOF

  Start the API:            sudo docker compose up -d --build
  Then, in the web app as an administrator, verify the audit ledger
  (People → Audit log → Verify the ledger). The hash chain must verify on
  this server exactly as it did on Neon — that proves no record was altered
  in transit, which row counts alone cannot.

  The dump at $DUMP is a full copy of every
  patient record. Once the cutover is verified, remove it:
      sudo shred -u $DUMP

EOF
