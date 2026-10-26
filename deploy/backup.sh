#!/usr/bin/env bash
#
# Nightly backup of the AfyaScribe database: dump, encrypt, keep, copy off-site.
#
#   sudo bash deploy/backup.sh            # run once by hand to test
#   sudo bash deploy/backup.sh --install  # schedule it nightly at 02:30
#
# Configuration lives in /etc/afyascribe/backup.env (created on --install):
#
#   AGE_RECIPIENT   the PUBLIC key backups are encrypted to (age1…). The
#                   private key must NOT be on this server: kept offline, it
#                   means a stolen backup — or a stolen server — cannot be
#                   read. Generate it on your own machine with `age-keygen`.
#   OFFSITE_USER    the account a second machine pulls backups as (set to the
#                   installing user). Each backup is also placed in
#                   /var/backups/afyascribe-outbox, readable by that account
#                   alone, for deploy/pull-backups.sh to collect. The pull key
#                   is confined to that folder, read-only.
#   RCLONE_REMOTE   optionally, an rclone remote and path to push to as well
#                   (e.g. "offsite:afyascribe-backups"). Empty = none.
#   KEEP_DAYS       copies to keep on this server (default 14).
#
# With neither a pull nor a push, a backup is NOT a backup: a copy on the same
# disk dies with it.
#
# Where the off-site copy goes is a data-protection decision, not a technical
# one: a backup outside Kenya is a transfer outside Kenya (Act s.48-50). Keep
# every copy in Kenya. Encryption to a key held offline is what makes any
# location defensible.
#
# Each backup has a companion .counts file: the row count of every table, taken
# straight after the dump. deploy/restore-test.sh compares a restore against
# it. It holds table names and numbers only, no records.
#
# And a companion .uploads.tar.age: every uploaded document and logo (the
# `uploads` volume), archived and encrypted the same way. The database names
# each file; without this archive a restore has the names and not the files.
#
# And a companion .env.age: the application's settings file (.env), encrypted
# to the same offline key. Rebuilding a lost server needs those secrets as much
# as the data, and without a copy every third-party key would have to be
# reissued (Disaster Recovery Plan, runbook R1 step 6).
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
CONF=/etc/afyascribe/backup.env
OUT=/var/backups/afyascribe
OUTBOX=/var/backups/afyascribe-outbox
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."

if [ "${1:-}" = "--install" ]; then
  apt-get install -y -qq age rclone >/dev/null
  install -d -m 700 /etc/afyascribe
  if [ ! -f "$CONF" ]; then
    cat >"$CONF" <<EOF
# AfyaScribe backup settings. See deploy/backup.sh.
AGE_RECIPIENT=
STANDBY_URL=
OFFSITE_USER=${SUDO_USER:-}
RCLONE_REMOTE=
KEEP_DAYS=14
EOF
    chmod 600 "$CONF"
  fi
  cat >/etc/cron.d/afyascribe-backup <<EOF
# Nightly database backup. Output to the log so a failure is visible.
30 2 * * * root bash $REPO/deploy/backup.sh >> /var/log/afyascribe-backup.log 2>&1
EOF
  chmod 644 /etc/cron.d/afyascribe-backup
  echo "Scheduled nightly at 02:30. Now set, in $CONF:"
  echo "  STANDBY_URL    the Neon connection string — the warm standby (deploy/standby-sync.sh)"
  echo "  AGE_RECIPIENT  optional: a public key, to also keep 14 days of encrypted copies here"
  echo "and test with:   sudo bash deploy/backup.sh"
  exit 0
fi

[ -f "$CONF" ] || die "No $CONF — run with --install first."
. "$CONF"
[ -n "${AGE_RECIPIENT:-}${STANDBY_URL:-}" ] || die "Neither STANDBY_URL nor AGE_RECIPIENT is set in $CONF — nothing would be backed up."
set -a; . "$REPO/.env"; set +a

# ── Encrypted copies (when AGE_RECIPIENT is set) ───────────────────────────
# Kept alongside the standby because a standby is overwritten every night: a
# mass deletion or ransomware reaches it by the next morning, and Neon's free
# plan keeps only hours of its own history. These keep KEEP_DAYS of history.
if [ -n "${AGE_RECIPIENT:-}" ]; then

  install -d -m 700 "$OUT"
  NAME="afyascribe-$(date +%F-%H%M%S)"
  FILE="$OUT/$NAME.dump.age"
  COUNTS="$OUT/$NAME.counts"
  SECRETS="$OUT/$NAME.env.age"
  UPLOADS="$OUT/$NAME.uploads.tar.age"
  # A half-written file from a failed run must not sit there looking like a backup.
  trap 'rm -f "$FILE" "$COUNTS" "$SECRETS" "$UPLOADS"' ERR

  log "dumping"
  # Streamed straight into age: the unencrypted dump never touches the disk.
  docker compose -f "$REPO/docker-compose.yml" exec -T postgres \
    pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" --format=custom \
    | age -r "$AGE_RECIPIENT" -o "$FILE"
  chmod 600 "$FILE"
  size=$(stat -c %s "$FILE")
  # An encrypted dump of a real database is never this small; a broken pipe is.
  [ "$size" -gt 10240 ] || { rm -f "$FILE"; die "dump is only $size bytes — something failed"; }
  log "wrote $(du -h "$FILE" | cut -f1) to $FILE"

  # Taken after the dump, not inside its snapshot, so a row written in the
  # seconds between shows up as a difference at restore — at 02:30, rare, and
  # the restore test reports it rather than hiding it.
  docker compose -f "$REPO/docker-compose.yml" exec -T postgres \
    psql -U "$DB_USERNAME" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 -tA -c \
    "select table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
       from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name" > "$COUNTS"
  chmod 600 "$COUNTS"
  [ -s "$COUNTS" ] || die "could not record row counts"

  age -r "$AGE_RECIPIENT" -o "$SECRETS" "$REPO/.env"
  chmod 600 "$SECRETS"

  # Read through the running API container, which owns the files; streamed
  # into age like the dump, so no unencrypted archive is written.
  docker compose -f "$REPO/docker-compose.yml" exec -T backend tar -C /data/uploads -cf - . \
    | age -r "$AGE_RECIPIENT" -o "$UPLOADS"
  chmod 600 "$UPLOADS"
  log "wrote $(du -h "$UPLOADS" | cut -f1) of uploaded files to $UPLOADS"

  if [ -n "${OFFSITE_USER:-}" ]; then
    id "$OFFSITE_USER" >/dev/null 2>&1 || die "OFFSITE_USER '$OFFSITE_USER' does not exist"
    install -d -m 700 -o "$OFFSITE_USER" -g "$OFFSITE_USER" "$OUTBOX"
    # Into a dot-name first and renamed, so a pull never collects half a file.
    for f in "$FILE" "$COUNTS" "$SECRETS" "$UPLOADS"; do
      tmp="$OUTBOX/.$(basename "$f").partial"
      install -m 600 -o "$OFFSITE_USER" -g "$OFFSITE_USER" "$f" "$tmp"
      mv "$tmp" "$OUTBOX/$(basename "$f")"
    done
    log "placed in $OUTBOX for the off-site pull"
  fi

  if [ -n "${RCLONE_REMOTE:-}" ]; then
    rclone copy "$FILE" "$RCLONE_REMOTE/" --quiet
    rclone copy "$COUNTS" "$RCLONE_REMOTE/" --quiet
    rclone copy "$SECRETS" "$RCLONE_REMOTE/" --quiet
    rclone copy "$UPLOADS" "$RCLONE_REMOTE/" --quiet
    log "copied off-site to $RCLONE_REMOTE"
  elif [ -z "${OFFSITE_USER:-}" ]; then
    log "WARNING: neither OFFSITE_USER nor RCLONE_REMOTE set — this backup exists only on this server"
  fi

  for d in "$OUT" "$OUTBOX"; do
    [ -d "$d" ] || continue
    find "$d" -maxdepth 1 \( -name 'afyascribe-*.dump.age' -o -name 'afyascribe-*.counts' -o -name 'afyascribe-*.env.age' -o -name 'afyascribe-*.uploads.tar.age' \) \
      -mtime +"${KEEP_DAYS:-14}" -delete
  done
else
  log "AGE_RECIPIENT not set — no encrypted copies kept on this server"
fi

# ── Warm standby on Neon (when STANDBY_URL is set) ─────────────────────────
# A standby failure is logged but never undoes the encrypted copy above. Until
# cutover it is expected to refuse: Neon is still production, and ahead.
if [ -n "${STANDBY_URL:-}" ]; then
  bash "$REPO/deploy/standby-sync.sh" || log "WARNING: the standby was not updated — see the lines above"
fi
log "done"
