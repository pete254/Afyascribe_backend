#!/usr/bin/env bash
#
# Shared by the backup scripts: settings, logging, alerts, encryption, and the
# off-site vault on Neon. Sourced, not run.
#
#   backup.sh         nightly: database (logical + physical), secrets, uploaded
#                     files, lifecycle purge — scheduled at 02:30
#   wal-ship.sh       every 5 minutes: the database's transaction log
#   backup-watch.sh   hourly: raises the alarm when something has not happened
#   restore.sh        every kind of recovery, and the restore tests
#   offline-copy.sh   monthly, on your own computer: the air-gapped copy
#   vault-setup.sh    once: creates the vault on Neon
#
# Settings: /etc/afyascribe/backup.env (root only). See backup.sh --install.
#
# ── Encryption ─────────────────────────────────────────────────────────────
# Every copy that leaves the database is encrypted with OpenPGP (GnuPG) to the
# company's backup key: AES-256 for the data, the key itself wrapped with the
# backup key's public half. Only the public half is on this server
# (/etc/afyascribe/gnupg). The private half is kept off it — in the company
# password manager and on paper in the safe — so a stolen backup, or a stolen
# server, yields nothing readable.
#
# ── The vault ──────────────────────────────────────────────────────────────
# A Postgres database on Neon (a second provider) holding only ciphertext, in
# 8 MB parts. Every object is write-once and carries a lock (retain_until): the
# database itself refuses to change it, or to delete it before the lock ends,
# whoever asks — see vault-schema.sql. This server holds a writer login that can
# add objects and remove expired ones, nothing more, so an intruder here cannot
# destroy the off-site history. Every read and write is logged in the vault.
#
# ── Testing ────────────────────────────────────────────────────────────────
# BACKUP_LOCAL=1 runs the database commands directly (PGHOST etc. from the
# environment) instead of through Docker, for the test harness.

set -Eeuo pipefail
shopt -s inherit_errexit

BACKUP_COMMON_LOADED=1
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONF="${BACKUP_CONF:-/etc/afyascribe/backup.env}"
GNUPGHOME="${BACKUP_GNUPGHOME:-/etc/afyascribe/gnupg}"
OUT="${BACKUP_OUT:-/var/backups/afyascribe}"
STATE="${BACKUP_STATE:-/var/lib/afyascribe/backup}"
WAL_SPOOL="${WAL_SPOOL:-/var/lib/afyascribe/wal-spool}"
# Inside the database container (a tmpfs, so a plaintext base backup never
# reaches a disk) and inside the API container.
STAGE="${BACKUP_STAGE:-/backup-stage}"
UPLOADS_ROOT="${UPLOADS_ROOT:-/data/uploads}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
PART_BYTES=$((8 * 1024 * 1024))
export GNUPGHOME

JOB="${JOB:-backup}"
log()  { printf '%s %s: %s\n' "$(date '+%F %T')" "$JOB" "$*"; }
die()  { log "ERROR: $*"; alert "FAILED: $JOB" "$*"; exit 1; }

load_settings() {
  [ "$(id -u)" -eq 0 ] || [ -n "${BACKUP_LOCAL:-}" ] || { echo "Run with sudo." >&2; exit 1; }
  [ -f "$CONF" ] || { echo "No $CONF — run: sudo bash deploy/backup.sh --install" >&2; exit 1; }
  # shellcheck disable=SC1090
  . "$CONF"
  if [ -f "$REPO/.env" ]; then set -a; . "$REPO/.env"; set +a; fi
  : "${GPG_RECIPIENT:?GPG_RECIPIENT (the backup key fingerprint) is not set in $CONF}"
  : "${VAULT_URL:?VAULT_URL (the vault writer login) is not set in $CONF}"
  KEEP_DAYS="${KEEP_DAYS:-14}"
  LOCK_DAYS="${LOCK_DAYS:-35}"
  MONTHLY_MONTHS="${MONTHLY_MONTHS:-13}"
  YEARLY_YEARS="${YEARLY_YEARS:-20}"
  FULL_WEEKDAY="${FULL_WEEKDAY:-7}"        # 1 = Monday … 7 = Sunday
  MAX_RUN_MIN="${MAX_RUN_MIN:-90}"
  DISK_WARN_PCT="${DISK_WARN_PCT:-80}"
  VAULT_QUOTA_MB="${VAULT_QUOTA_MB:-500}"
  PURGE_DAYS="${PURGE_DAYS:-30}"
  install -d -m 700 "$OUT" "$STATE"
}

# ── Alerts ─────────────────────────────────────────────────────────────────
# By email, at once, to BACKUP_ALERT_EMAIL, through the same email service the
# application uses (RESEND_API_KEY from .env); also to syslog. An alert that
# cannot be sent is still logged — and the hourly watchdog notices the silence.
alert() {
  local subject="$1" body="$2"
  logger -t afyascribe-backup "$subject — $body" 2>/dev/null || true
  [ -n "${BACKUP_ALERT_EMAIL:-}" ] && [ -n "${RESEND_API_KEY:-}" ] || { log "ALERT (not emailed: BACKUP_ALERT_EMAIL or RESEND_API_KEY unset): $subject — $body"; return 0; }
  local payload
  payload="$(python3 -c 'import json,sys; print(json.dumps({"from":"Afyascribe Backups <info@afyascribe.co.ke>","to":[a.strip() for a in sys.argv[1].split(",") if a.strip()],"subject":"[AfyaScribe backup] "+sys.argv[2],"text":sys.argv[3]+"\n\nServer: "+sys.argv[4]+"\nLog: /var/log/afyascribe-backup.log"}))' \
    "$BACKUP_ALERT_EMAIL" "$subject" "$body" "$(hostname)")"
  if curl -sS --max-time 20 -o /dev/null -w '%{http_code}' https://api.resend.com/emails \
       -H "Authorization: Bearer $RESEND_API_KEY" -H 'Content-Type: application/json' \
       -d "$payload" | grep -q '^2'; then
    log "alert emailed: $subject"
  else
    log "ALERT (email failed): $subject — $body"
  fi
}

mark_ok() { date +%s > "$STATE/$1.ok"; }
age_of()  { local f="$STATE/$1.ok"; [ -f "$f" ] && echo $(( $(date +%s) - $(cat "$f") )) || echo 999999999; }

# ── Running database tools ─────────────────────────────────────────────────
# in_db: a command inside the production database container.
# in_app: a command inside the API container (which owns the uploaded files).
# pgtool: a Postgres client tool in a throwaway container, with WORK mounted.
in_db() {
  if [ -n "${BACKUP_LOCAL:-}" ]; then "$@"
  else docker compose -f "$REPO/docker-compose.yml" exec -T postgres "$@"; fi
}
in_app() {
  if [ -n "${BACKUP_LOCAL:-}" ]; then "$@"
  else docker compose -f "$REPO/docker-compose.yml" exec -T backend "$@"; fi
}
pgtool() {
  if [ -n "${BACKUP_LOCAL:-}" ]; then "$@"
  else docker run --rm -i --network host ${PGTOOL_USER:+--user "$PGTOOL_USER"} -v "${WORK:-/tmp}:${WORK:-/tmp}" -w "${WORK:-/tmp}" "$PG_IMAGE" "$@"; fi
}
db_user() { echo "${DB_USERNAME:-${PGUSER:-postgres}}"; }
db_name() { echo "${DB_DATABASE:-${PGDATABASE:-postgres}}"; }
prod_sql() { in_db psql -U "$(db_user)" -d "$(db_name)" -v ON_ERROR_STOP=1 -qtA "$@"; }

# ── Encryption ─────────────────────────────────────────────────────────────
encrypt() {  # stdin → stdout
  gpg --batch --quiet --no-tty --trust-model always --cipher-algo AES256 \
      --compress-algo none --recipient "$GPG_RECIPIENT" --encrypt
}
check_key() {
  gpg --batch --list-keys "$GPG_RECIPIENT" >/dev/null 2>&1 \
    || die "the backup public key $GPG_RECIPIENT is not in $GNUPGHOME — see backup.sh --install"
}
sha256() { sha256sum "$1" | cut -d' ' -f1; }

# ── The vault ──────────────────────────────────────────────────────────────
vault_sql() { pgtool psql "$VAULT_URL" -v ON_ERROR_STOP=1 -qtA "$@"; }

# vault_put NAME FILE KIND TIER RETAIN_UNTIL META_JSON
# One transaction: every part, then the object row. All or nothing.
vault_put() {
  local name="$1" file="$2" kind="$3" tier="$4" until="$5" meta="${6:-{\}}"
  local size sum parts
  size=$(stat -c %s "$file"); sum=$(sha256 "$file")
  parts=$(( (size + PART_BYTES - 1) / PART_BYTES )); [ "$parts" -ge 1 ] || parts=1
  python3 - "$name" "$file" "$PART_BYTES" "$kind" "$tier" "$until" "$size" "$sum" "$parts" "$meta" <<'PY' | vault_sql >/dev/null
import sys
name, path, chunk, kind, tier, until, size, sha, parts, meta = sys.argv[1:]
chunk = int(chunk)
w = sys.stdout.write
w("BEGIN;\nCOPY backup_vault.parts(name, part, data) FROM STDIN;\n")
with open(path, "rb") as f:
    i = 0
    while True:
        b = f.read(chunk)
        if not b and i > 0:
            break
        w(f"{name}\t{i}\t\\\\x{b.hex()}\n")
        i += 1
        if not b:
            break
w("\\.\n")
w(f"INSERT INTO backup_vault.objects(name, kind, tier, retain_until, size, sha256, parts, meta) "
  f"VALUES ($n${name}$n$, $n${kind}$n$, $n${tier}$n$, $n${until}$n$::timestamptz, {int(size)}, '{sha}', {int(parts)}, $j${meta}$j$::jsonb);\n")
w("COMMIT;\n")
PY
}

# vault_get NAME FILE — fetch and check the sha256 recorded when it was stored.
vault_get() {
  local name="$1" file="$2" want
  want="$(vault_sql -c "select sha256 from backup_vault.objects where name = \$n\$$name\$n\$")"
  [ -n "$want" ] || { log "not in the vault: $name"; return 1; }
  vault_sql -c "select hex from backup_vault.fetch(\$n\$$name\$n\$) order by part" \
    | python3 -c 'import sys
out = open(sys.argv[1], "wb")
for line in sys.stdin:
    line = line.strip()
    if line:
        out.write(bytes.fromhex(line))
out.close()' "$file"
  [ "$(sha256 "$file")" = "$want" ] || { log "CHECKSUM MISMATCH for $name"; return 1; }
}

vault_has() { [ -n "$(vault_sql -c "select 1 from backup_vault.objects where name = \$n\$$1\$n\$")" ]; }

# A lock date N days / months / years from now, as Postgres reads it.
lock_until() { date -u -d "+$1" '+%Y-%m-%d %H:%M:%S+00'; }
