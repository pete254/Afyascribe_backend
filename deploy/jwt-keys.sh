#!/usr/bin/env bash
#
# Make the ES256 key pair that signs session tokens, and put it in .env.
#
#   sudo bash deploy/jwt-keys.sh            # once; then: sudo docker compose up -d
#
# Run on the server itself, so the private key is made where it is used and
# never travels. Nothing is printed but the public key's fingerprint. It
# refuses to replace keys already in .env: a new pair signs everyone out, so
# to rotate, delete the two lines from .env and run it again.
#
# Keep a copy of .env in the company password manager as before — it now
# holds this key too (backup.sh already keeps an encrypted copy nightly).
set -euo pipefail

cd "$(dirname "$0")/.."
ENV=.env
log() { printf '%s jwt-keys: %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -f "$ENV" ] || die "No $ENV here."
grep -qE '^JWT_(PRIVATE|PUBLIC)_KEY=' "$ENV" && die "$ENV already has JWT keys. To rotate, delete both lines first (this signs everyone out)."

umask 077
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$dir/private.pem"
openssl ec -in "$dir/private.pem" -pubout -out "$dir/public.pem" 2>/dev/null

# One line each, with the breaks written as \n (src/auth/jwt-keys.ts), and in
# single quotes: backup.sh and standby-sync.sh read .env as shell, where the
# spaces in "BEGIN PRIVATE KEY" would otherwise run as a command. Docker
# Compose reads single-quoted values literally too.
{
  echo
  echo "# Session token signing (ES256), made by deploy/jwt-keys.sh on $(date +%F)."
  printf "JWT_PRIVATE_KEY='%s'\n" "$(awk 'NF {printf "%s\\n", $0}' "$dir/private.pem" | sed 's/\\n$//')"
  printf "JWT_PUBLIC_KEY='%s'\n" "$(awk 'NF {printf "%s\\n", $0}' "$dir/public.pem" | sed 's/\\n$//')"
} >>"$ENV"
chmod 600 "$ENV"

log "added an ES256 key pair to $ENV — public key SHA-256 $(openssl ec -pubin -in "$dir/public.pem" -outform der 2>/dev/null | sha256sum | cut -c1-16)"
log "now: sudo docker compose up -d   (everyone signs in again once)"
