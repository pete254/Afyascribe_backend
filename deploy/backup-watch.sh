#!/usr/bin/env bash
#
# Hourly: raise the alarm when a backup has NOT happened. A failed job emails
# by itself; this catches the silent failures — a job that never ran, a full
# disk, a transaction log that is not leaving the server.
#
#   sudo bash deploy/backup-watch.sh      # cron runs it (backup.sh --install)
#
# Each kind of alarm is repeated at most every 6 hours while it lasts.
set -Eeuo pipefail
JOB=watch
. "$(dirname "$0")/backup-common.sh"
load_settings

problems=()
nightly=$(age_of nightly)
[ "$nightly" -lt $((26 * 3600)) ] || problems+=("nightly|No successful nightly backup for $((nightly / 3600)) hours.")
wal=$(age_of wal)
[ "$wal" -lt $((30 * 60)) ] || problems+=("wal|The transaction-log shipper has not completed for $((wal / 60)) minutes.")
oldest="$(find "$WAL_SPOOL" -maxdepth 1 -type f ! -name '*.part' -mmin +20 2>/dev/null | head -1)"
[ -z "$oldest" ] || problems+=("spool|Transaction-log segments have waited over 20 minutes to leave the server (oldest: $(basename "$oldest")).")
for d in "$OUT" /var/lib/docker; do
  [ -d "$d" ] || continue
  used=$(df --output=pcent "$d" | tail -1 | tr -dc 0-9)
  [ "$used" -lt "$DISK_WARN_PCT" ] || problems+=("disk|$d is ${used}% full.")
done
# Postgres's own view of archiving: failing, or never started.
arch="$(prod_sql -c "select current_setting('archive_mode') || '|' || failed_count || '|' || coalesce(last_failed_time > coalesce(last_archived_time, 'epoch'), false) from pg_stat_archiver" 2>/dev/null || echo 'unknown||')"
IFS='|' read -r amode _ afailing <<<"$arch"
[ "$amode" = on ] || problems+=("archive|Transaction-log archiving is not on in the database (archive_mode=$amode).")
[ "$afailing" != t ] || problems+=("archive|The database's archive_command is failing.")
vault_sql -c "select 1" >/dev/null 2>&1 || problems+=("vault|The off-site vault on Neon cannot be reached.")

for p in "${problems[@]}"; do
  kind="${p%%|*}"; msg="${p#*|}"
  stamp="$STATE/alerted.$kind"
  if [ ! -f "$stamp" ] || [ $(( $(date +%s) - $(cat "$stamp") )) -gt $((6 * 3600)) ]; then
    alert "$msg" "$msg"
    date +%s > "$stamp"
  fi
done
# A problem that has cleared may alert again next time it happens.
for s in "$STATE"/alerted.*; do
  [ -e "$s" ] || continue
  k="${s##*.}"
  printf '%s\n' "${problems[@]}" | grep -q "^$k|" || rm -f "$s"
done
[ "${#problems[@]}" -eq 0 ] && exit 0 || exit 1
