#!/usr/bin/env bash
#
# Off-site copy of uploaded files (patient documents, staff documents, logos):
# each file encrypted to the backup key and kept on Cloudinary.
#
#   sudo bash deploy/offsite-uploads.sh             # send new files, purge expired copies (backup.sh runs this nightly)
#   sudo bash deploy/offsite-uploads.sh --test      # prove every copy decrypts to the file on this server
#   sudo bash deploy/offsite-uploads.sh --restore   # bring every missing file back onto this server
#
# The database's off-site copy (Neon) holds the records but not the files; this
# is the files' off-site copy. Cloudinary receives only age-encrypted files —
# without the private key, held off this server in the company password
# manager, they are unreadable. The application itself no longer talks to
# Cloudinary; only this script does, with credentials kept here rather than in
# the application's .env.
#
# Settings, in /etc/afyascribe/backup.env:
#
#   AGE_RECIPIENT           the backup public key (age1…), as for backup.sh
#   CLOUDINARY_CLOUD_NAME   } the Cloudinary account
#   CLOUDINARY_API_KEY      }
#   CLOUDINARY_API_SECRET   }
#   PURGE_DAYS              days a deleted file's copy is kept (default 30)
#
# Each file is sent once, under its own name (afyascribe-backup/<key>.age);
# /var/lib/afyascribe/offsite-uploads.sent lists what has been sent.
#
# Deleted files (Data Retention Policy R-3). When a file is deleted here — by a
# user, or when its record is disposed of — its copy is kept PURGE_DAYS more,
# so a deletion made by mistake can still be undone, and then deleted from
# Cloudinary. When each file was first found missing is kept in
# offsite-uploads.missing. Nothing is purged when a large share of files is
# missing at once: that is a damaged disk or a rebuilt server awaiting
# --restore, not deletions, and those copies are what would bring them back.
#
# Cloudinary's free plan takes at most 10 MB per file; uploads are capped at
# 9.5 MB (src/files/file-store.ts) so every encrypted file fits.
set -Eeuo pipefail
# A failure inside $(…) must stop the script too: a listing that failed must
# never pass for an empty one, or every file would look deleted.
shopt -s inherit_errexit

cd "$(dirname "$0")/.."
REPO="$(pwd)"
CONF=/etc/afyascribe/backup.env
STATE_DIR=/var/lib/afyascribe
SENT="$STATE_DIR/offsite-uploads.sent"
MISSING="$STATE_DIR/offsite-uploads.missing"
REPORTS=/var/backups/afyascribe/restore-tests
PREFIX=afyascribe-backup
LIMIT=$((10 * 1024 * 1024))
# The same shape the application generates (src/files/file-store.ts).
KEY_RE='^[a-z]+/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$'
log() { printf '%s uploads: %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }
trap 'log "ERROR: stopped at line $LINENO (could not list the files here or on Cloudinary?). Nothing was purged."' ERR

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -f "$CONF" ] && . "$CONF"
[ -n "${CLOUDINARY_CLOUD_NAME:-}" ] && [ -n "${CLOUDINARY_API_KEY:-}" ] && [ -n "${CLOUDINARY_API_SECRET:-}" ] \
  || die "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set in $CONF"
API="https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME"
PURGE_DAYS="${PURGE_DAYS:-30}"

# Inside the loops below, a call that needs no input must be given /dev/null:
# `exec -T` would otherwise swallow the list the loop is reading.
in_backend() { docker compose -f "$REPO/docker-compose.yml" exec -T backend "$@"; }

# Cloudinary signs requests with SHA-1 over the sorted parameters plus the secret.
sign() { printf '%s%s' "$1" "$CLOUDINARY_API_SECRET" | sha1sum | cut -d' ' -f1; }

# Every file on this server, one storage key per line.
server_files() {
  local all
  all="$(in_backend sh -c 'cd /data/uploads && find . -type f ! -name "*.partial" | sed "s|^\./||"' </dev/null)"
  grep -E "$KEY_RE" <<<"$all" || true
}

# Every off-site copy, "<storage key> <download address>" per line. Fails,
# rather than returning a short list, if Cloudinary cannot be read.
offsite_files() {
  local cursor="" page
  while :; do
    # The secret goes to curl on stdin, not on its command line, where any
    # user could read it.
    page="$(printf 'user = "%s:%s"\n' "$CLOUDINARY_API_KEY" "$CLOUDINARY_API_SECRET" \
      | curl -sSf --max-time 60 -K- "$API/resources/raw/upload?prefix=$PREFIX/&max_results=500${cursor:+&next_cursor=$cursor}")"
    printf '%s' "$page" | python3 -c 'import sys, json
for r in json.load(sys.stdin)["resources"]:
    print(r["public_id"][len(sys.argv[1]) + 1:-len(".age")], r["secure_url"])' "$PREFIX" \
      | grep -E "^[^ ]+ " | while read -r key url; do [[ "$key" =~ $KEY_RE ]] && echo "$key $url"; done || true
    cursor="$(printf '%s' "$page" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("next_cursor") or "")')"
    [ -n "$cursor" ] || break
  done
}

ask_key() {
  read -rsp "Private backup key, AGE-SECRET-KEY-1… (input hidden): " KEY; echo
  case "$KEY" in AGE-SECRET-KEY-1*) ;; *) die "That is not an age private key." ;; esac
}

# ── Restore ─────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--restore" ]; then
  ask_key
  restored=0; present=0; failed=0
  here="$(server_files)"
  while read -r key url; do
    [ -n "$key" ] || continue
    if grep -qxF "$key" <<<"$here"; then present=$((present + 1)); continue; fi
    # Written under a temporary name and renamed, as the application does.
    if curl -sSf --max-time 120 "$url" </dev/null | age -d -i <(printf '%s\n' "$KEY") \
       | in_backend sh -c 'mkdir -p "$(dirname "$1")" && cat > "$1.partial" && mv "$1.partial" "$1"' -- "/data/uploads/$key"; then
      restored=$((restored + 1))
    else
      log "FAILED $key"; failed=$((failed + 1))
    fi
  done < <(offsite_files)
  unset KEY
  log "restored $restored; already here $present; failed $failed"
  [ "$failed" -eq 0 ] || exit 1
  exit 0
fi

# ── Test ────────────────────────────────────────────────────────────────────
# Reads only. Each copy is downloaded, decrypted in memory and its SHA-256
# compared with the file on this server; nothing is written to the uploads.
if [ "${1:-}" = "--test" ]; then
  ask_key
  install -d -m 700 "$REPORTS"
  REPORT="$REPORTS/uploads-$(date +%F-%H%M%S).txt"
  here="$(server_files)"
  offsite="$(offsite_files)"
  match=0; differ=0; unreadable=0; deleted_ok=0; not_sent=0
  {
    echo "Off-site uploads restore test — $(date '+%F %T')"
    echo "Files on this server: $(grep -c . <<<"$here" || true); copies on Cloudinary: $(grep -c . <<<"$offsite" || true)"
    echo
  } >"$REPORT"
  while read -r key url; do
    [ -n "$key" ] || continue
    got="$(curl -sSf --max-time 120 "$url" </dev/null | age -d -i <(printf '%s\n' "$KEY") | sha256sum | cut -d' ' -f1)" \
      || { echo "UNREADABLE  $key" >>"$REPORT"; unreadable=$((unreadable + 1)); continue; }
    if grep -qxF "$key" <<<"$here"; then
      want="$(in_backend sha256sum "/data/uploads/$key" </dev/null | cut -d' ' -f1)"
      if [ "$got" = "$want" ]; then
        echo "MATCH       $key" >>"$REPORT"; match=$((match + 1))
      else
        echo "DIFFERS     $key" >>"$REPORT"; differ=$((differ + 1))
      fi
    else
      echo "DECRYPTS    $key (deleted here; kept until purged)" >>"$REPORT"; deleted_ok=$((deleted_ok + 1))
    fi
  done <<<"$offsite"
  unset KEY
  while read -r key; do
    [ -n "$key" ] || continue
    grep -q "^$key " <<<"$offsite" || { echo "NOT YET OFF-SITE  $key (sent by the next nightly run)" >>"$REPORT"; not_sent=$((not_sent + 1)); }
  done <<<"$here"
  result=PASS; { [ "$differ" -eq 0 ] && [ "$unreadable" -eq 0 ] && [ "$match" -gt 0 ]; } || result=FAIL
  {
    echo
    echo "Identical to the server's file: $match. Different: $differ. Could not decrypt: $unreadable."
    echo "Copies of deleted files that decrypt: $deleted_ok. Files not yet off-site: $not_sent."
    echo "Result: $result"
  } >>"$REPORT"
  chmod 600 "$REPORT"
  log "test $result — $match identical, $differ different, $unreadable unreadable, $not_sent not yet off-site. Report: $REPORT"
  [ "$result" = PASS ] || exit 1
  exit 0
fi

# ── Send new files ──────────────────────────────────────────────────────────
[ -n "${AGE_RECIPIENT:-}" ] || die "AGE_RECIPIENT is not set in $CONF — files are only ever sent encrypted."
install -d -m 700 "$STATE_DIR"
touch "$SENT" "$MISSING"; chmod 600 "$SENT" "$MISSING"
TMP="$(mktemp /var/tmp/afyascribe-upload.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

here="$(server_files)"
sent=0; skipped=0; failed=0
while read -r key; do
  [ -n "$key" ] || continue
  grep -qxF "$key" "$SENT" && { skipped=$((skipped + 1)); continue; }
  # Encrypted as it is read: the plain file never leaves the container
  # unencrypted, and only ciphertext is written here.
  if ! in_backend cat "/data/uploads/$key" </dev/null | age -r "$AGE_RECIPIENT" -o "$TMP"; then
    log "FAILED to read or encrypt $key"; failed=$((failed + 1)); continue
  fi
  size=$(stat -c %s "$TMP")
  if [ "$size" -gt "$LIMIT" ]; then
    log "FAILED $key: $size bytes encrypted, over Cloudinary's 10 MB per-file limit"; failed=$((failed + 1)); continue
  fi
  pid="$PREFIX/$key.age"; ts=$(date +%s)
  if curl -sSf --max-time 300 -o /dev/null "$API/raw/upload" \
       -F "file=@$TMP" -F "public_id=$pid" -F "timestamp=$ts" \
       -F "api_key=$CLOUDINARY_API_KEY" -F "signature=$(sign "public_id=$pid&timestamp=$ts")"; then
    printf '%s\n' "$key" >> "$SENT"; sent=$((sent + 1))
  else
    log "FAILED to send $key"; failed=$((failed + 1))
  fi
done <<<"$here"
log "sent $sent new file(s), encrypted; $skipped already off-site; $failed failed"

# ── Purge copies of files deleted more than PURGE_DAYS ago ─────────────────
offsite="$(offsite_files | cut -d' ' -f1)"
total=$(grep -c . <<<"$offsite" || true)
gone="$(comm -23 <(sort -u <<<"$offsite" | grep .) <(sort -u <<<"$here" | grep .) || true)"
ngone=$(grep -c . <<<"$gone" || true)
# More than a fifth of the copies (and more than five) at once, or every one
# of them, is not a deletion; leave everything, and say so.
if { [ "$ngone" -gt 5 ] && [ $((ngone * 5)) -gt "$total" ]; } || { [ "$ngone" -gt 0 ] && [ "$ngone" -eq "$total" ]; }; then
  log "WARNING: $ngone of $total off-site files are missing from this server — purging nothing. If the server was rebuilt, run --restore."
  exit $((failed > 0))
fi
now=$(date +%s); purged=0; waiting=0
: >"$MISSING.new"
while read -r key; do
  [ -n "$key" ] || continue
  since="$(awk -v k="$key" '$1 == k {print $2}' "$MISSING")"
  since="${since:-$now}"
  if [ $((now - since)) -lt $((PURGE_DAYS * 86400)) ]; then
    printf '%s %s\n' "$key" "$since" >>"$MISSING.new"; waiting=$((waiting + 1)); continue
  fi
  pid="$PREFIX/$key.age"; ts=$(date +%s)
  resp="$(curl -sS --max-time 60 "$API/raw/destroy" \
            -F "public_id=$pid" -F "timestamp=$ts" -F "api_key=$CLOUDINARY_API_KEY" \
            -F "signature=$(sign "public_id=$pid&timestamp=$ts")" </dev/null || true)"
  if grep -qE '"result" *: *"(ok|not found)"' <<<"$resp"; then
    grep -vxF "$key" "$SENT" >"$SENT.new" || true; mv "$SENT.new" "$SENT"; chmod 600 "$SENT"
    purged=$((purged + 1))
  else
    log "FAILED to purge $key: ${resp:-no answer}"; failed=$((failed + 1))
    printf '%s %s\n' "$key" "$since" >>"$MISSING.new"
  fi
done <<<"$gone"
mv "$MISSING.new" "$MISSING"; chmod 600 "$MISSING"
log "deleted files: $purged copy(ies) purged after $PURGE_DAYS days; $waiting kept until then"
exit $((failed > 0))
