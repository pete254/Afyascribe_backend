#!/usr/bin/env bash
#
# Ship the database's transaction log (WAL) off the server, every 5 minutes.
#
#   sudo bash deploy/wal-ship.sh      # cron runs it (backup.sh --install)
#
# Postgres hands each completed log segment to its archive_command, which puts
# it in the spool (docker-compose.yml: archive_mode, archive_timeout=300). This
# compresses each one, encrypts it (AES-256, to the backup key), keeps it here
# for KEEP_DAYS and in the vault for LOCK_DAYS, and only then removes it from
# the spool. With the base backups, that restores the database to any moment
# in the last 35 days, losing at most the last few minutes (Recovery Point
# Objective: 15 minutes).
#
# A segment is removed from the spool only once the vault has it, so an
# outage of Neon delays shipping but loses nothing; backup-watch.sh raises the
# alarm if the spool is not emptied within 20 minutes.
set -Eeuo pipefail
JOB=wal
. "$(dirname "$0")/backup-common.sh"
load_settings
check_key
exec 8>"$STATE/wal.lock"
flock -n 8 || exit 0    # the previous run is still shipping
install -d -m 700 "$OUT/wal"
[ -d "$WAL_SPOOL" ] || die "no WAL spool at $WAL_SPOOL — run backup.sh --install"

shipped=0
while IFS= read -r f; do
  seg="$(basename "$f")"
  name="db/wal/$seg.gz.gpg"
  if ! vault_has "$name"; then
    local_copy="$OUT/wal/$seg.gz.gpg"
    gzip -c "$f" | encrypt > "$local_copy.part"
    mv "$local_copy.part" "$local_copy"; chmod 600 "$local_copy"
    if ! vault_put "$name" "$local_copy" wal daily "$(lock_until "$LOCK_DAYS days")" "{\"segment\":\"$seg\"}"; then
      log "could not send $seg to the vault — will retry"
      exit 1
    fi
    shipped=$((shipped + 1))
  fi
  rm -f "$f"
done < <(find "$WAL_SPOOL" -maxdepth 1 -type f ! -name '*.part' | sort)

[ "$shipped" -eq 0 ] || log "shipped $shipped log segment(s)"
mark_ok wal
