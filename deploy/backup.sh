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
#   RCLONE_REMOTE   where the off-site copy goes, as an rclone remote and path
#                   (e.g. "offsite:afyascribe-backups"). Empty = local only,
#                   which is NOT a backup: a copy on the same disk dies with it.
#   KEEP_DAYS       local copies to keep (default 14).
#
# Where the off-site copy goes is a data-protection decision, not a technical
# one: a backup outside Kenya is a transfer outside Kenya (Act s.48-50). Prefer
# a second Kenyan provider. Encryption to a key held offline is what makes any
# location defensible.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
CONF=/etc/afyascribe/backup.env
OUT=/var/backups/afyascribe
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."

if [ "${1:-}" = "--install" ]; then
  apt-get install -y -qq age rclone >/dev/null
  install -d -m 700 /etc/afyascribe
  if [ ! -f "$CONF" ]; then
    cat >"$CONF" <<'EOF'
# AfyaScribe backup settings. See deploy/backup.sh.
AGE_RECIPIENT=
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
  echo "Scheduled nightly at 02:30. Now set AGE_RECIPIENT and RCLONE_REMOTE in $CONF,"
  echo "configure the remote with:  sudo rclone config"
  echo "and test with:              sudo bash deploy/backup.sh"
  exit 0
fi

[ -f "$CONF" ] || die "No $CONF — run with --install first."
. "$CONF"
[ -n "${AGE_RECIPIENT:-}" ] || die "AGE_RECIPIENT is not set in $CONF. Backups are never stored unencrypted."
set -a; . "$REPO/.env"; set +a

install -d -m 700 "$OUT"
FILE="$OUT/afyascribe-$(date +%F-%H%M%S).dump.age"
# A half-written file from a failed run must not sit there looking like a backup.
trap 'rm -f "$FILE"' ERR

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

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE/" --quiet
  log "copied off-site to $RCLONE_REMOTE"
else
  log "WARNING: RCLONE_REMOTE not set — this backup exists only on this server"
fi

find "$OUT" -name 'afyascribe-*.dump.age' -mtime +"${KEEP_DAYS:-14}" -delete
log "done"
