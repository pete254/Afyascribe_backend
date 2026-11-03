#!/usr/bin/env bash
#
# Nightly backup of AfyaScribe (Backup and Recovery Policy, DHA-BRP-ASH-2026-001).
#
#   sudo bash deploy/backup.sh --install      # once: tools, settings, schedules
#   sudo bash deploy/backup.sh --import-key   # once: the backup PUBLIC key (paste it)
#   sudo bash deploy/backup.sh                # run now (cron runs it at 02:30)
#
# Each night, every copy encrypted (AES-256, OpenPGP) to the backup key and
# kept twice — 14 days on this server, and in the locked vault on Neon:
#
#   1. Database, logical: a full pg_dump, checked readable (pg_restore --list)
#      before it is encrypted, with its row counts and plaintext checksum.
#      The first of each month is kept 13 months, the first of each year 20
#      years (statutory health-record retention); the rest 35 days.
#   2. Database, physical: a FULL base backup on Sundays (or when none exists),
#      an INCREMENTAL one (PostgreSQL 17) on other nights. With the transaction
#      log (wal-ship.sh, every 5 minutes) these restore the database to any
#      moment in the last 35 days.
#   3. The settings file (.env), so a rebuilt server has its secrets.
#   4. Uploaded files: each file's copy in the vault, refreshed before its lock
#      ends; plus a nightly archive of them all on this server.
#   5. Lifecycle: expired copies removed, here and in the vault; a deleted
#      file's copy goes 30 days after the file did (Data Retention Policy).
#   6. On Sundays, a checksum check of a sample of the vault (restore.sh verify).
#
# Any failure, an overrun (MAX_RUN_MIN), a nearly full disk or vault: an email
# to BACKUP_ALERT_EMAIL at once. backup-watch.sh, hourly, raises the alarm if a
# night is missed altogether.
set -Eeuo pipefail
JOB=nightly
. "$(dirname "$0")/backup-common.sh"

# ── Install ────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--install" ]; then
  [ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
  apt-get install -y -qq gnupg python3 curl util-linux >/dev/null
  install -d -m 700 /etc/afyascribe "$GNUPGHOME" "$OUT" "$STATE"
  # The database container writes the transaction log here (uid 70 is
  # postgres in the alpine image); wal-ship.sh encrypts and sends it.
  install -d -m 700 -o 70 -g 70 "$WAL_SPOOL"
  # New settings are added to an existing file; nothing already set is changed.
  touch "$CONF"; chmod 600 "$CONF"
  while IFS= read -r line; do
    case "$line" in
      ''|'#'*) grep -qxF "$line" "$CONF" || echo "$line" >> "$CONF" ;;
      *) grep -q "^${line%%=*}=" "$CONF" || echo "$line" >> "$CONF" ;;
    esac
  done <<EOF
# AfyaScribe backup settings — see deploy/backup.sh and deploy/backup-common.sh.
# The backup key's fingerprint (set by: sudo bash deploy/backup.sh --import-key)
GPG_RECIPIENT=
# The vault writer login (set by: sudo bash deploy/vault-setup.sh)
VAULT_URL=
# Who is emailed when anything fails (comma-separated)
BACKUP_ALERT_EMAIL=info@afyascribe.co.ke
KEEP_DAYS=14
LOCK_DAYS=35
MONTHLY_MONTHS=13
YEARLY_YEARS=20
FULL_WEEKDAY=7
MAX_RUN_MIN=90
DISK_WARN_PCT=80
VAULT_QUOTA_MB=500
PURGE_DAYS=30
# The administrator account that collects the nightly set for the laptop copy
# and the monthly offline drive (deploy/pull-backups.sh)
OFFSITE_USER=${SUDO_USER:-}
EOF
  # Settings of the arrangement this replaced (2 Nov 2026), kept as comments.
  sed -i -E 's/^(AGE_RECIPIENT|STANDBY_URL|CLOUDINARY_[A-Z_]+|RCLONE_REMOTE)=/# retired 2 Nov 2026: \1=/' "$CONF"
  cat >/etc/cron.d/afyascribe-backup <<EOF
# AfyaScribe backups (deploy/backup.sh). Output to the log; failures are emailed.
30 2 * * *   root bash $REPO/deploy/backup.sh      >> /var/log/afyascribe-backup.log 2>&1
*/5 * * * *  root bash $REPO/deploy/wal-ship.sh    >> /var/log/afyascribe-backup.log 2>&1
15 * * * *   root bash $REPO/deploy/backup-watch.sh >> /var/log/afyascribe-backup.log 2>&1
EOF
  chmod 644 /etc/cron.d/afyascribe-backup
  rm -f /etc/logrotate.d/afyascribe-backup
  cat >/etc/logrotate.d/afyascribe-backup <<'EOF'
/var/log/afyascribe-backup.log {
  weekly
  rotate 26
  compress
  missingok
  notifempty
}
EOF
  echo "Installed. Next:"
  echo "  1. sudo bash deploy/backup.sh --import-key     (paste the backup PUBLIC key)"
  echo "  2. sudo bash deploy/vault-setup.sh             (creates the vault on Neon)"
  echo "  3. sudo docker compose up -d                   (turns on transaction-log archiving)"
  echo "  4. sudo bash deploy/backup.sh                  (first backup — a full one)"
  exit 0
fi

if [ "${1:-}" = "--import-key" ]; then
  [ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
  install -d -m 700 "$GNUPGHOME"
  echo "Paste the backup PUBLIC key (from -----BEGIN PGP PUBLIC KEY BLOCK----- to the END line), then press Ctrl-D:"
  key="$(cat)"
  case "$key" in *"PRIVATE KEY"*) echo "That is the PRIVATE key. It must never be on this server. Nothing was imported." >&2; exit 1 ;; esac
  case "$key" in *"BEGIN PGP PUBLIC KEY BLOCK"*) ;; *) echo "That is not a PGP public key." >&2; exit 1 ;; esac
  printf '%s\n' "$key" | gpg --batch --import 2>&1 | sed 's/^/  /'
  fpr="$(printf '%s\n' "$key" | gpg --batch --with-colons --import-options show-only --import 2>/dev/null | awk -F: '/^fpr:/ {print $10; exit}')"
  [ -n "$fpr" ] || { echo "Could not read the key's fingerprint." >&2; exit 1; }
  if grep -q '^GPG_RECIPIENT=' "$CONF" 2>/dev/null; then sed -i "s/^GPG_RECIPIENT=.*/GPG_RECIPIENT=$fpr/" "$CONF"; else echo "GPG_RECIPIENT=$fpr" >> "$CONF"; fi
  echo "Backups will be encrypted to $fpr."
  echo "Check that fingerprint against the one on your computer:  gpg --fingerprint"
  exit 0
fi

# ── Supervisor: run the work under a time limit, and say so if it overruns ──
if [ "${1:-}" != "--run" ]; then
  load_settings
  exec 9>"$STATE/nightly.lock"
  flock -n 9 || { log "another backup is still running — not starting a second"; alert "backup already running" "The 02:30 backup found the previous one still running."; exit 1; }
  set +e
  timeout --signal=TERM "${MAX_RUN_MIN}m" bash "$0" --run < /dev/null  # never read the terminal: a container step would wait on it
  rc=$?
  set -e
  if [ "$rc" -eq 124 ]; then
    alert "backup overran" "The nightly backup did not finish within ${MAX_RUN_MIN} minutes and was stopped. Copies made before that point are kept."
  fi
  exit "$rc"
fi

load_settings
check_key
trap 'rc=$?; log "ERROR at line $LINENO (exit $rc)"; alert "nightly backup FAILED" "Stopped at line $LINENO of deploy/backup.sh (exit $rc). See the log."; exit $rc' ERR

TS="$(date -u +%Y%m%dT%H%M%SZ)"
SHM="$(mktemp -d /dev/shm/afyascribe-backup.XXXXXX)"
trap 'rm -rf "$SHM"' EXIT
install -d -m 700 "$OUT"/{logical,base,secrets,uploads,wal}
log "starting $TS"

# ── Space ──────────────────────────────────────────────────────────────────
for d in "$OUT" /var/lib/docker; do
  [ -d "$d" ] || continue
  used=$(df --output=pcent "$d" | tail -1 | tr -dc 0-9)
  if [ "$used" -ge "$DISK_WARN_PCT" ]; then
    alert "disk ${used}% full" "$d is ${used}% full (warning at ${DISK_WARN_PCT}%). Backups may soon fail."
  fi
done

# ── 1. Logical dump ────────────────────────────────────────────────────────
tier_for_today() {
  local y m
  y="$(date -u +%Y)"; m="$(date -u +%Y-%m)"
  if [ -z "$(vault_sql -c "select 1 from backup_vault.objects where kind = 'logical' and tier = 'yearly' and to_char(created_at at time zone 'UTC', 'YYYY') = '$y' limit 1")" ]; then
    echo yearly
  elif [ -z "$(vault_sql -c "select 1 from backup_vault.objects where kind = 'logical' and tier in ('monthly','yearly') and to_char(created_at at time zone 'UTC', 'YYYY-MM') = '$m' limit 1")" ]; then
    echo monthly
  else
    echo daily
  fi
}
retain_for() {
  case "$1" in
    yearly)  lock_until "$YEARLY_YEARS years" ;;
    monthly) lock_until "$MONTHLY_MONTHS months" ;;
    *)       lock_until "$LOCK_DAYS days" ;;
  esac
}

log "database: logical dump"
PLAIN="$SHM/db.dump"   # tmpfs: the plaintext never reaches a disk
in_db pg_dump -U "$(db_user)" -d "$(db_name)" --format=custom > "$PLAIN"
entries=$(in_db pg_restore --list < "$PLAIN" | grep -vc '^;' || true)
[ "$entries" -gt 20 ] || die "the dump lists only $entries entries — it is not a usable backup"
counts="$(prod_sql -c "select coalesce(json_object_agg(table_name, n), '{}') from (
  select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint n
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') t")"
plain_sum=$(sha256 "$PLAIN"); plain_size=$(stat -c %s "$PLAIN")
NAME="db/logical/afyascribe-$TS.dump.gpg"
LOCAL="$OUT/logical/afyascribe-$TS.dump.gpg"
encrypt < "$PLAIN" > "$LOCAL"; chmod 600 "$LOCAL"
rm -f "$PLAIN"
tier="$(tier_for_today)"
meta="$(python3 -c 'import json,sys; print(json.dumps({"sha256_plain":sys.argv[1],"plain_size":int(sys.argv[2]),"toc_entries":int(sys.argv[3]),"counts":json.loads(sys.argv[4])}))' "$plain_sum" "$plain_size" "$entries" "$counts")"
vault_put "$NAME" "$LOCAL" logical "$tier" "$(retain_for "$tier")" "$meta"
log "  $(du -h "$LOCAL" | cut -f1), $entries entries, kept as $tier"

# ── 2. Physical base backup: full or incremental ───────────────────────────
base_backup() {
  local mode="$1" name dir manifest_new label start_file start_time
  in_db sh -c "rm -rf '$STAGE/cur' '$STAGE/prev_manifest' && mkdir -p '$STAGE'" || return 1
  local inc=()
  if [ "$mode" = incremental ]; then
    in_db sh -c "cat > '$STAGE/prev_manifest'" < "$STATE/last_manifest" || return 1
    inc=(--incremental="$STAGE/prev_manifest")
  fi
  in_db pg_basebackup -U "$(db_user)" -D "$STAGE/cur" -Fp -X none -c fast \
    --manifest-checksums=SHA256 "${inc[@]}" || return 1
  in_db pg_verifybackup -n "$STAGE/cur" >/dev/null || return 1
  label="$(in_db cat "$STAGE/cur/backup_label")"
  start_file="$(sed -n 's/^START WAL LOCATION: .* (file \([0-9A-F]*\)).*/\1/p' <<<"$label")"
  start_time="$(sed -n 's/^START TIME: //p' <<<"$label")"
  manifest_new="$SHM/manifest"
  in_db cat "$STAGE/cur/backup_manifest" > "$manifest_new" || return 1
  name="db/base/afyascribe-$TS-$mode.tar.gz.gpg"
  dir="$OUT/base/afyascribe-$TS-$mode.tar.gz.gpg"
  { in_db tar -C "$STAGE/cur" -cf - . | gzip -1 | encrypt > "$dir"; } || return 1
  chmod 600 "$dir"
  in_db rm -rf "$STAGE/cur" "$STAGE/prev_manifest" || return 1
  local parent full
  parent="$(cat "$STATE/last_base" 2>/dev/null || true)"
  if [ "$mode" = full ]; then full="$name"; parent=""; else full="$(cat "$STATE/last_full")"; fi
  meta="$(python3 -c 'import json,sys; print(json.dumps({"mode":sys.argv[1],"start_wal":sys.argv[2],"start_time":sys.argv[3],"parent":sys.argv[4] or None,"full":sys.argv[5]}))' "$mode" "$start_file" "$start_time" "$parent" "$full")"
  vault_put "$name" "$dir" base daily "$(lock_until "$LOCK_DAYS days")" "$meta" || return 1
  mv "$manifest_new" "$STATE/last_manifest"
  echo "$name" > "$STATE/last_base"
  [ "$mode" = full ] && { echo "$name" > "$STATE/last_full"; date +%s > "$STATE/last_full_at"; }
  log "  $mode base backup: $(du -h "$dir" | cut -f1), starts at WAL $start_file"
}

mode=incremental
if [ "$(date +%u)" = "$FULL_WEEKDAY" ] || [ ! -s "$STATE/last_manifest" ] || [ ! -s "$STATE/last_full" ] \
   || [ $(( $(date +%s) - $(cat "$STATE/last_full_at" 2>/dev/null || echo 0) )) -gt $((8 * 86400)) ]; then
  mode=full
fi
log "database: $mode base backup"
if ! base_backup "$mode"; then
  [ "$mode" = incremental ] || die "the full base backup failed"
  log "  incremental failed — taking a full one instead"
  base_backup full
fi

# ── 3. Settings file ───────────────────────────────────────────────────────
if [ -f "$REPO/.env" ]; then
  LOCAL="$OUT/secrets/afyascribe-$TS.env.gpg"
  encrypt < "$REPO/.env" > "$LOCAL"; chmod 600 "$LOCAL"
  vault_put "secrets/afyascribe-$TS.env.gpg" "$LOCAL" secrets daily "$(lock_until "$LOCK_DAYS days")" '{}'
  log "settings file: encrypted"
fi

# ── 4. Uploaded files ──────────────────────────────────────────────────────
log "uploaded files"
mapfile -t here < <(in_app sh -c "cd '$UPLOADS_ROOT' 2>/dev/null && find . -type f ! -name '.*' | sed 's|^\./||' | sort" || true)
# The newest copy of each file in the vault, and how long it is locked.
declare -A locked_until=()
while IFS='|' read -r key until; do
  [ -n "$key" ] && locked_until["$key"]="$until"
done < <(vault_sql -c "select meta->>'key', extract(epoch from max(retain_until))::bigint from backup_vault.objects where kind = 'upload' group by 1")
soon=$(( $(date +%s) + 7 * 86400 ))
sent=0; failed=0
for key in "${here[@]}"; do
  [ -n "$key" ] || continue
  if [ -n "${locked_until[$key]:-}" ] && [ "${locked_until[$key]}" -gt "$soon" ]; then continue; fi
  f="$SHM/upload"
  if in_app cat "$UPLOADS_ROOT/$key" > "$f" && [ -s "$f" ]; then
    psum=$(sha256 "$f")
    encrypt < "$f" > "$f.gpg"
    obj="uploads/$key@$TS.gpg"
    if vault_put "$obj" "$f.gpg" upload daily "$(lock_until "$LOCK_DAYS days")" \
         "$(python3 -c 'import json,sys; print(json.dumps({"key":sys.argv[1],"sha256_plain":sys.argv[2]}))' "$key" "$psum")"; then
      sent=$((sent + 1))
    else
      failed=$((failed + 1)); log "  could not send $key"
    fi
  else
    failed=$((failed + 1)); log "  could not read $key"
  fi
  rm -f "$f" "$f.gpg"
done
log "  ${#here[@]} file(s) here; $sent copied or re-locked; $failed failed"
[ "$failed" -eq 0 ] || alert "uploaded files not backed up" "$failed uploaded file(s) could not be copied to the vault tonight."

# All of them, archived, for a quick restore from this server.
LOCAL="$OUT/uploads/afyascribe-$TS.uploads.tar.gpg"
in_app tar -C "$UPLOADS_ROOT" -cf - . | encrypt > "$LOCAL"; chmod 600 "$LOCAL"

# The night's set, for the laptop copy and the monthly offline drive
# (deploy/pull-backups.sh), readable by OFFSITE_USER alone. Ciphertext only.
if [ -n "${OFFSITE_USER:-}" ] && id "$OFFSITE_USER" >/dev/null 2>&1; then
  OUTBOX="${OUTBOX:-/var/backups/afyascribe-outbox}"
  install -d -m 700 -o "$OFFSITE_USER" -g "$OFFSITE_USER" "$OUTBOX"
  set_files=("$OUT/logical/afyascribe-$TS.dump.gpg" "$OUT/uploads/afyascribe-$TS.uploads.tar.gpg")
  [ -f "$OUT/secrets/afyascribe-$TS.env.gpg" ] && set_files+=("$OUT/secrets/afyascribe-$TS.env.gpg")
  for f in "${set_files[@]}"; do
    install -m 600 -o "$OFFSITE_USER" -g "$OFFSITE_USER" "$f" "$OUTBOX/.$(basename "$f").partial"
    mv "$OUTBOX/.$(basename "$f").partial" "$OUTBOX/$(basename "$f")"
  done
  # Written last: its presence means the set is complete.
  ( cd "$OUTBOX" && sha256sum $(for f in "${set_files[@]}"; do basename "$f"; done) ) > "$OUTBOX/.afyascribe-$TS.sha256"
  chown "$OFFSITE_USER:$OFFSITE_USER" "$OUTBOX/.afyascribe-$TS.sha256"; chmod 600 "$OUTBOX/.afyascribe-$TS.sha256"
  mv "$OUTBOX/.afyascribe-$TS.sha256" "$OUTBOX/afyascribe-$TS.sha256"
  find "$OUTBOX" -maxdepth 1 -type f -name 'afyascribe-*' -mtime +"$KEEP_DAYS" -delete
fi

# Files that have gone from here: when each was first missed.
MISSING="$STATE/uploads.missing"; touch "$MISSING"
declare -A present=(); for k in "${here[@]}"; do [ -n "$k" ] && present["$k"]=1; done
declare -A since=(); while IFS='|' read -r k d; do [ -n "$k" ] && since["$k"]="$d"; done < "$MISSING"
: > "$MISSING.new"; gone=0
for k in "${!locked_until[@]}"; do
  [ -n "${present[$k]:-}" ] && continue
  gone=$((gone + 1))
  printf '%s|%s\n' "$k" "${since[$k]:-$(date +%s)}" >> "$MISSING.new"
done
mv "$MISSING.new" "$MISSING"
known=${#locked_until[@]}
purge_uploads=1
# Many at once (at least 5 and over a fifth), or every one: damage, not deletions.
if { [ "$gone" -ge 5 ] && [ $(( gone * 5 )) -gt "$known" ]; } || { [ "$gone" -gt 1 ] && [ "$gone" -eq "$known" ]; }; then
  purge_uploads=0
  alert "many uploaded files missing" "$gone of $known files in the vault are no longer on the server. That looks like damage, not deletions: nothing is being purged. If the server was rebuilt, run: sudo bash deploy/restore.sh uploads"
fi

# ── 5. Lifecycle ───────────────────────────────────────────────────────────
log "lifecycle"
find "$OUT"/{logical,base,secrets,uploads,wal} -maxdepth 1 -type f -mtime +"$KEEP_DAYS" -delete
# Old-style copies from before 2 Nov 2026 (age-encrypted), as they expire.
find "$OUT" -maxdepth 1 -type f -name 'afyascribe-*' -mtime +"$KEEP_DAYS" -delete
now=$(date +%s)
expired_uploads="$(vault_sql -c "select name, meta->>'key', created_at from backup_vault.objects o
  where kind = 'upload' and retain_until < now()
    and exists (select 1 from backup_vault.objects n where n.kind = 'upload' and n.meta->>'key' = o.meta->>'key' and n.created_at > o.created_at)" | cut -d'|' -f1)"
gone_uploads=""
if [ "$purge_uploads" = 1 ]; then
  while IFS='|' read -r k d; do
    [ -n "$k" ] || continue
    if [ $(( now - d )) -gt $(( PURGE_DAYS * 86400 )) ]; then
      gone_uploads+="$(vault_sql -c "select name from backup_vault.objects where kind = 'upload' and meta->>'key' = \$k\$$k\$k\$ and retain_until < now()")"$'\n'
    fi
  done < "$MISSING"
fi
purge="$(printf '%s\n%s\n' "$expired_uploads" "$gone_uploads"; vault_sql -c "select name from backup_vault.objects where kind <> 'upload' and retain_until < now()")"
purge="$(printf '%s\n' "$purge" | sed '/^$/d' | sort -u)"
if [ -n "$purge" ]; then
  n=$(printf '%s\n' "$purge" | wc -l)
  printf '%s\n' "$purge" | python3 -c 'import sys
names = [l.strip() for l in sys.stdin if l.strip()]
q = ",".join("$n$" + x + "$n$" for x in names)
print(f"BEGIN; DELETE FROM backup_vault.parts WHERE name IN ({q}); DELETE FROM backup_vault.objects WHERE name IN ({q}); COMMIT;")' | vault_sql_in >/dev/null
  log "  removed $n expired object(s) from the vault"
fi

# ── Vault capacity ─────────────────────────────────────────────────────────
mb=$(vault_sql -c "select pg_database_size(current_database()) / 1048576")
log "vault holds ${mb} MB of ${VAULT_QUOTA_MB} MB"
if [ $(( mb * 100 )) -ge $(( VAULT_QUOTA_MB * DISK_WARN_PCT )) ]; then
  alert "vault ${mb} MB of ${VAULT_QUOTA_MB} MB" "The off-site vault on Neon is nearly full. Raise the Neon plan, or VAULT_QUOTA_MB if it has been raised."
fi

# ── 6. Sunday: check a sample of the vault against its checksums ────────────
if [ "$(date +%u)" = 7 ]; then
  bash "$REPO/deploy/restore.sh" verify || alert "vault check FAILED" "A copy in the vault did not match its checksum. See the log."
fi

mark_ok nightly
log "done"
