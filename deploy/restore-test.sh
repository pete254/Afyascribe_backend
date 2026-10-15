#!/usr/bin/env bash
#
# Prove a backup can be restored: decrypt it, restore it into a throwaway
# database, and check it is complete and unaltered.
#
#   cd /opt/afyascribe/backend
#   sudo bash deploy/restore-test.sh                     # the newest backup here
#   sudo bash deploy/restore-test.sh /tmp/afyascribe-….dump.age   # a given one
#
# For the Disaster Recovery Test, test the OFF-SITE copy, not the server's own:
# copy it up from the machine that keeps it (scp …dump.age …counts to /tmp),
# then name it here. That proves the copy you would actually depend on.
#
# It asks for the private backup key (the AGE-SECRET-KEY-1… line) with input
# hidden. The key is held in memory for the length of the test and is never
# written to this server's disk.
#
# The throwaway database lives in memory (tmpfs, 1 GB by default; set
# RESTORE_MEMORY=2g once the database outgrows it) on a private Docker network
# with no published port, so the decrypted records never touch the disk and
# vanish when the test ends. It does not touch the live database.
#
# Checks, in order:
#   1. The file decrypts with the key.
#   2. It restores, all or nothing.
#   3. Every table recorded at backup time is present, with its row count
#      (from the companion .counts file).
#   4. The audit chain verifies — using the application's own code, so "pass"
#      means exactly what "Verify the ledger" in the web app means.
#
# The report is printed and kept under /var/backups/afyascribe/restore-tests/.
# It is the evidence the Disaster Recovery Test Report is written from.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
OUT=/var/backups/afyascribe
REPORTS="$OUT/restore-tests"
PG_IMAGE=postgres:17-alpine
APP_IMAGE=afyascribe-backend:latest
TAG="afyascribe-restore-test-$$"

say()  { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { warn "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
command -v age >/dev/null || die "age is not installed:  sudo apt install age"
docker image inspect "$APP_IMAGE" >/dev/null 2>&1 || die "No $APP_IMAGE image — build it first:  sudo docker compose build"

# ── Which backup ───────────────────────────────────────────────────────────
FILE="${1:-}"
if [ -z "$FILE" ]; then
  FILE="$(ls -1t "$OUT"/afyascribe-*.dump.age 2>/dev/null | head -1 || true)"
  [ -n "$FILE" ] || die "No backups in $OUT. Run:  sudo bash deploy/backup.sh"
fi
[ -s "$FILE" ] || die "No such backup: $FILE"
COUNTS="${FILE%.dump.age}.counts"
[ -s "$COUNTS" ] || warn "No $(basename "$COUNTS") beside it — row counts will be reported but not compared."

say "Backup"
echo "  $FILE"
echo "  $(du -h "$FILE" | cut -f1), sha256 $(sha256sum "$FILE" | cut -c1-16)…"

read -rsp "Private backup key, AGE-SECRET-KEY-1… (input hidden): " KEY; echo
case "$KEY" in AGE-SECRET-KEY-1*) ;; *) die "That is not an age private key." ;; esac

# ── Throwaway database ─────────────────────────────────────────────────────
cleanup() {
  docker rm -f "$TAG" >/dev/null 2>&1 || true
  docker network rm "$TAG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

say "Starting a throwaway database in memory"
t0=$(date +%s)
PW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
docker network create --internal "$TAG" >/dev/null
docker run -d --name "$TAG" --network "$TAG" \
  --tmpfs /var/lib/postgresql/data:rw,size="${RESTORE_MEMORY:-1g}" \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=restore \
  "$PG_IMAGE" >/dev/null
# Over TCP, which only answers once initialisation has finished and the
# server has restarted for real.
for _ in $(seq 60); do
  docker exec "$TAG" pg_isready -q -h 127.0.0.1 -U restore 2>/dev/null && break
  sleep 1
done
docker exec "$TAG" pg_isready -q -h 127.0.0.1 -U restore || die "The throwaway database did not start."

# ── 1 + 2. Decrypt and restore ─────────────────────────────────────────────
say "Decrypting and restoring — all or nothing"
start=$(date +%s)
# The key reaches age through a pipe, not a file.
if ! age -d -i <(printf '%s\n' "$KEY") "$FILE" \
   | docker exec -i "$TAG" pg_restore -U restore -d restore \
       --no-owner --no-acl --single-transaction --exit-on-error; then
  die "Decrypt or restore FAILED. Wrong key, a damaged file, or a dump this Postgres cannot read."
fi
unset KEY
restore_s=$(( $(date +%s) - start ))
echo "  restored in ${restore_s}s"

# ── 3. Completeness ────────────────────────────────────────────────────────
say "Comparing row counts with the backup's record"
got="$(docker exec "$TAG" psql -U restore -d restore -v ON_ERROR_STOP=1 -tA -c \
  "select table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
     from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name")"
tables=$(echo "$got" | wc -l)
rows=$(echo "$got" | awk -F'|' '{s+=$2} END {print s}')
counts_result="not compared (no .counts file)"
counts_ok=1
if [ -s "$COUNTS" ]; then
  missing="$(comm -23 <(cut -d'|' -f1 "$COUNTS") <(echo "$got" | cut -d'|' -f1))"
  differ="$(diff <(cat "$COUNTS") <(echo "$got") | grep '^[<>]' || true)"
  if [ -n "$missing" ]; then
    counts_ok=0
    counts_result="FAIL — tables missing: $(echo "$missing" | tr '\n' ' ')"
  elif [ -z "$differ" ]; then
    counts_result="all $tables tables match exactly"
  else
    # The counts are taken just after the dump; a row written in between
    # explains a small difference. Shown, not hidden, for a person to judge.
    counts_result="all tables present; counts differ in $(echo "$differ" | grep -c '^<') table(s) — see below"
  fi
fi
echo "  $tables tables, $rows rows — $counts_result"
[ -n "${differ:-}" ] && echo "$differ" | sed 's/^</  at backup: /; s/^>/  restored:  /'

# ── 4. The audit chain ─────────────────────────────────────────────────────
say "Verifying the audit chain with the application's own code"
set +e
chain="$(docker run --rm --network "$TAG" \
  -e PGHOST="$TAG" -e PGUSER=restore -e PGPASSWORD="$PW" -e PGDATABASE=restore \
  -v "$REPO/deploy/verify-chain.js:/app/verify-chain.js:ro" \
  "$APP_IMAGE" node /app/verify-chain.js)"
chain_rc=$?
set -e
echo "  $chain"

# ── Report ─────────────────────────────────────────────────────────────────
total_s=$(( $(date +%s) - t0 ))
verdict=PASS
[ "$chain_rc" -eq 0 ] && [ "$counts_ok" -eq 1 ] || verdict=FAIL

install -d -m 700 "$REPORTS"
REPORT="$REPORTS/$(date +%F-%H%M%S).txt"
cat >"$REPORT" <<EOF
AfyaScribe restore test
Run at:         $(date '+%F %T %Z') on $(hostname)
Backup:         $FILE
Backup taken:   $(basename "$FILE" | sed -E 's/^afyascribe-([0-9-]{10})-([0-9]{2})([0-9]{2})([0-9]{2}).*/\1 \2:\3:\4/')
Size / sha256:  $(du -h "$FILE" | cut -f1) / $(sha256sum "$FILE" | cut -d' ' -f1)
Decrypt+restore: ${restore_s}s
Empty server to verified data: ${total_s}s
Tables / rows:  $tables / $rows
Row counts:     $counts_result
Audit chain:    $chain
Result:         $verdict
EOF
chmod 600 "$REPORT"

say "Result: $verdict"
echo "  Report kept at $REPORT"
[ "$verdict" = PASS ] || exit 1
