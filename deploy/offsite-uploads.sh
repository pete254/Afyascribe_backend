#!/usr/bin/env bash
#
# Off-site copy of uploaded files (patient documents, staff documents, logos):
# each file encrypted to the backup key and kept on Cloudinary.
#
#   sudo bash deploy/offsite-uploads.sh             # send files not yet sent (backup.sh runs this nightly)
#   sudo bash deploy/offsite-uploads.sh --restore   # bring every file back onto this server
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
#
# Each file is sent once, under its own name (afyascribe-backup/<key>.age);
# /var/lib/afyascribe/offsite-uploads.sent lists what has been sent. Files
# are never overwritten or deleted on Cloudinary by this script, so a file
# deleted or damaged here can still be recovered.
#
# Cloudinary's free plan takes at most 10 MB per file; uploads are capped at
# 9.5 MB (src/files/file-store.ts) so every encrypted file fits.
set -Eeuo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
CONF=/etc/afyascribe/backup.env
STATE_DIR=/var/lib/afyascribe
SENT="$STATE_DIR/offsite-uploads.sent"
PREFIX=afyascribe-backup
LIMIT=$((10 * 1024 * 1024))
# The same shape the application generates (src/files/file-store.ts).
KEY_RE='^[a-z]+/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$'
log() { printf '%s uploads: %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -f "$CONF" ] && . "$CONF"
[ -n "${CLOUDINARY_CLOUD_NAME:-}" ] && [ -n "${CLOUDINARY_API_KEY:-}" ] && [ -n "${CLOUDINARY_API_SECRET:-}" ] \
  || die "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set in $CONF"
API="https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME"

# Inside the loops below, a call that needs no input must be given /dev/null:
# `exec -T` would otherwise swallow the list the loop is reading.
in_backend() { docker compose -f "$REPO/docker-compose.yml" exec -T backend "$@"; }

# Cloudinary signs requests with SHA-1 over the sorted parameters plus the secret.
sign() { printf '%s%s' "$1" "$CLOUDINARY_API_SECRET" | sha1sum | cut -d' ' -f1; }

# ── Restore ─────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--restore" ]; then
  read -rsp "Private backup key, AGE-SECRET-KEY-1… (input hidden): " KEY; echo
  case "$KEY" in AGE-SECRET-KEY-1*) ;; *) die "That is not an age private key." ;; esac
  restored=0; present=0; failed=0; cursor=""
  while :; do
    # The secret goes to curl on stdin, not on its command line, where any
    # user could read it.
    page="$(printf 'user = "%s:%s"\n' "$CLOUDINARY_API_KEY" "$CLOUDINARY_API_SECRET" \
      | curl -sSf -K- "$API/resources/raw/upload?prefix=$PREFIX/&max_results=500${cursor:+&next_cursor=$cursor}")"
    while read -r pid url; do
      [ -n "$pid" ] || continue
      key="${pid#"$PREFIX"/}"; key="${key%.age}"
      [[ "$key" =~ $KEY_RE ]] || { log "skipping unexpected name $pid"; continue; }
      if in_backend test -f "/data/uploads/$key" </dev/null; then present=$((present + 1)); continue; fi
      # Written under a temporary name and renamed, as the application does.
      if curl -sSf "$url" | age -d -i <(printf '%s\n' "$KEY") \
         | in_backend sh -c 'mkdir -p "$(dirname "$1")" && cat > "$1.partial" && mv "$1.partial" "$1"' -- "/data/uploads/$key"; then
        restored=$((restored + 1))
      else
        log "FAILED $key"; failed=$((failed + 1))
      fi
    done < <(printf '%s' "$page" | python3 -c 'import sys, json
for r in json.load(sys.stdin)["resources"]: print(r["public_id"], r["secure_url"])')
    cursor="$(printf '%s' "$page" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("next_cursor") or "")')"
    [ -n "$cursor" ] || break
  done
  unset KEY
  log "restored $restored; already here $present; failed $failed"
  [ "$failed" -eq 0 ] || exit 1
  exit 0
fi

# ── Send new files ──────────────────────────────────────────────────────────
[ -n "${AGE_RECIPIENT:-}" ] || die "AGE_RECIPIENT is not set in $CONF — files are only ever sent encrypted."
install -d -m 700 "$STATE_DIR"
touch "$SENT"; chmod 600 "$SENT"
TMP="$(mktemp /var/tmp/afyascribe-upload.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

sent=0; skipped=0; failed=0
while read -r key; do
  [ -n "$key" ] || continue
  grep -qxF "$key" "$SENT" && { skipped=$((skipped + 1)); continue; }
  [[ "$key" =~ $KEY_RE ]] || { log "ignoring unexpected file $key"; continue; }
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
  if curl -sSf -o /dev/null "$API/raw/upload" \
       -F "file=@$TMP" -F "public_id=$pid" -F "timestamp=$ts" \
       -F "api_key=$CLOUDINARY_API_KEY" -F "signature=$(sign "public_id=$pid&timestamp=$ts")"; then
    printf '%s\n' "$key" >> "$SENT"; sent=$((sent + 1))
  else
    log "FAILED to send $key"; failed=$((failed + 1))
  fi
done < <(in_backend sh -c 'cd /data/uploads && find . -type f ! -name "*.partial" | sed "s|^\./||"')

log "sent $sent new file(s), encrypted; $skipped already off-site; $failed failed"
[ "$failed" -eq 0 ]
