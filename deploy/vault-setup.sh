#!/usr/bin/env bash
#
# Create the off-site backup vault on Neon. Run once, on the server.
#
#   cd /opt/afyascribe/backend
#   sudo bash deploy/vault-setup.sh
#
# Before running it, in the Neon console (console.neon.tech):
#   1. In the existing project, create a database named   afyascribe_vault
#      (Databases → New database; owner: the project's owner role).
#   2. Copy that database's connection string, for the OWNER role. You paste
#      it here once; it is read without echo and never saved on this server.
#
# What it does:
#   - applies deploy/vault-schema.sql (write-once, locked, logged objects);
#   - gives the writer and reader logins new random passwords;
#   - saves the WRITER connection string in /etc/afyascribe/backup.env;
#   - prints the READER connection string once, for the password manager.
#
# Run it again at any time to re-apply the schema and change both passwords
# (for example after someone leaves): the old ones stop working at once.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
CONF=/etc/afyascribe/backup.env
PG_IMAGE=postgres:17-alpine
say() { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -f "$CONF" ] || die "No $CONF — run first:  sudo bash deploy/backup.sh --install"

read -rsp "Owner connection string for the afyascribe_vault database (input hidden): " OWNER_URL; echo
case "$OWNER_URL" in postgres*://*/afyascribe_vault*) ;; *) die "That is not a connection string for a database named afyascribe_vault." ;; esac

psql_owner() { docker run --rm -i "$PG_IMAGE" psql "$OWNER_URL" -v ON_ERROR_STOP=1 -qtA "$@"; }

say "Applying the vault schema"
psql_owner < "$REPO/deploy/vault-schema.sql" >/dev/null
echo "  done"

say "Setting new passwords for the writer and reader logins"
WPW="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
RPW="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
psql_owner -c "alter role afyascribe_vault_writer password '$WPW'" >/dev/null
psql_owner -c "alter role afyascribe_vault_reader password '$RPW'" >/dev/null

# Same host and options as the owner's string; only the login changes.
rewrite() { python3 -c 'import sys, urllib.parse as u
p = u.urlsplit(sys.argv[1]); host = p.hostname + (f":{p.port}" if p.port else "")
print(u.urlunsplit((p.scheme, f"{sys.argv[2]}:{u.quote(sys.argv[3])}@{host}", p.path, p.query, "")))' "$OWNER_URL" "$1" "$2"; }
WRITER_URL="$(rewrite afyascribe_vault_writer "$WPW")"
READER_URL="$(rewrite afyascribe_vault_reader "$RPW")"
unset OWNER_URL

say "Checking the writer login, and that the lock holds"
docker run --rm -i "$PG_IMAGE" psql "$WRITER_URL" -v ON_ERROR_STOP=1 -qtA \
  -c "select count(*) from backup_vault.objects" >/dev/null || die "The writer login does not work."
if docker run --rm -i "$PG_IMAGE" psql "$WRITER_URL" -v ON_ERROR_STOP=1 -qtA \
     -c "alter table backup_vault.objects disable trigger objects_guard" >/dev/null 2>&1; then
  die "The writer login could switch off the lock — it must not own the vault. Stop and check."
fi
echo "  the writer can read the list and cannot switch off the lock"

if grep -q '^VAULT_URL=' "$CONF"; then
  python3 - "$CONF" "$WRITER_URL" <<'PY'
import sys
path, url = sys.argv[1], sys.argv[2]
lines = open(path).read().splitlines()
open(path, "w").write("\n".join(f"VAULT_URL='{url}'" if l.startswith("VAULT_URL=") else l for l in lines) + "\n")
PY
else
  printf "VAULT_URL='%s'\n" "$WRITER_URL" >> "$CONF"
fi
chmod 600 "$CONF"
echo "  writer connection saved in $CONF"

say "Save this in the company password manager, as 'AfyaScribe backup vault — reader'"
echo "  $READER_URL"
echo
echo "It is needed for restores and the monthly offline copy. It is shown only now."
