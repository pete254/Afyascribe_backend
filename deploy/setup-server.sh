#!/usr/bin/env bash
#
# Install what AfyaScribe runs on, after harden.sh. Run once, with sudo:
#
#   sudo CERTBOT_EMAIL=you@example.com bash deploy/setup-server.sh
#
# from the backend checkout on the server (/opt/afyascribe/backend). Safe to
# run again.
#
# What it does, in order:
#   1. Installs Docker (Ubuntu's own packages, so unattended-upgrades patches
#      them), nginx and certbot.
#   2. Checks both DNS names point at this server — Let's Encrypt fails
#      otherwise, and repeated failures are rate-limited.
#   3. Serves the certificate challenge over plain HTTP, gets ONE certificate
#      for both names, and only then installs the HTTPS configuration that
#      depends on it.
#   4. Arranges for renewal to reload nginx.
#
# It does not start the application or touch any data. That is
# `docker compose up` and deploy/migrate-from-neon.sh, deliberately separate.
set -euo pipefail

DOMAINS=(app.afyascribe.co.ke api.afyascribe.co.ke)
CERT_NAME=afyascribe
HERE="$(cd "$(dirname "$0")" && pwd)"
OWNER="${SUDO_USER:-pete}"

say()  { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { warn "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -n "${CERTBOT_EMAIL:-}" ] || die "Set CERTBOT_EMAIL — Let's Encrypt writes there before a certificate expires."

# ── 1. Packages ─────────────────────────────────────────────────────────────
say "Installing Docker, nginx and certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 nginx certbot curl rsync
systemctl enable --now docker nginx >/dev/null

# The owner is NOT added to the docker group: membership is root in all but
# name, and would let a stolen session skip the sudo password harden.sh set.
# Run compose with sudo.

# ── 2. DNS ──────────────────────────────────────────────────────────────────
say "Checking DNS"
MY_IP="$(curl -fsS4 --max-time 10 https://ifconfig.me || hostname -I | awk '{print $1}')"
for d in "${DOMAINS[@]}"; do
  got="$(getent ahostsv4 "$d" | awk 'NR==1{print $1}')"
  if [ "$got" != "$MY_IP" ]; then
    die "$d resolves to '${got:-nothing}', not this server ($MY_IP). Fix the A record and wait for it to spread."
  fi
  echo "  $d → $got"
done

# ── 3. Directories ──────────────────────────────────────────────────────────
say "Directories"
install -d -m 755 /var/www/certbot
# The web app's releases. Owned by the deploying user so a release can be
# copied up without sudo; nginx only needs to read it.
install -d -m 755 -o "$OWNER" -g "$OWNER" /var/www/afyascribe-web /var/www/afyascribe-web/releases
if [ ! -e /var/www/afyascribe-web/current ]; then
  # A placeholder until the first release, so nginx has something to serve.
  install -d -m 755 -o "$OWNER" -g "$OWNER" /var/www/afyascribe-web/releases/placeholder
  echo '<!doctype html><title>AfyaScribe</title><p>Deploying.</p>' \
    > /var/www/afyascribe-web/releases/placeholder/index.html
  ln -sfn /var/www/afyascribe-web/releases/placeholder /var/www/afyascribe-web/current
  chown -h "$OWNER:$OWNER" /var/www/afyascribe-web/current
fi
install -d -m 700 /var/backups/afyascribe

# ── 4. Certificate ──────────────────────────────────────────────────────────
say "Certificate"
rm -f /etc/nginx/sites-enabled/default
if [ ! -s "/etc/letsencrypt/live/$CERT_NAME/fullchain.pem" ]; then
  # Port 80 only, just for the challenge. The real configuration names the
  # certificate files, and nginx will not start while they do not exist.
  cat >/etc/nginx/sites-available/afyascribe-bootstrap.conf <<EOF
server {
    listen 80;
    server_name ${DOMAINS[*]};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
EOF
  ln -sfn /etc/nginx/sites-available/afyascribe-bootstrap.conf /etc/nginx/sites-enabled/afyascribe.conf
  nginx -t && systemctl reload nginx

  args=()
  for d in "${DOMAINS[@]}"; do args+=(-d "$d"); done
  certbot certonly --webroot -w /var/www/certbot --cert-name "$CERT_NAME" "${args[@]}" \
    --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email --non-interactive
  rm -f /etc/nginx/sites-available/afyascribe-bootstrap.conf
else
  echo "  already issued"
fi

# ── 5. The real configuration ───────────────────────────────────────────────
say "nginx"
install -m 644 "$HERE/nginx/tls.conf" /etc/nginx/snippets/afyascribe-tls.conf
install -m 644 "$HERE/nginx/security-headers.conf" /etc/nginx/snippets/afyascribe-security-headers.conf
install -m 644 "$HERE/nginx/afyascribe.conf" /etc/nginx/sites-available/afyascribe.conf
ln -sfn /etc/nginx/sites-available/afyascribe.conf /etc/nginx/sites-enabled/afyascribe.conf
# Test before reloading: a bad configuration plus a reload is an outage.
nginx -t
systemctl reload nginx

# Renewal runs from certbot's own timer; nginx must reload to pick it up.
install -d /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
certbot renew --dry-run --cert-name "$CERT_NAME" >/dev/null && echo "  renewal dry-run passed"

say "Done"
cat <<EOF

  https://app.afyascribe.co.ke  serves a placeholder until the first web release.
  https://api.afyascribe.co.ke  answers 502 until the backend is started.

  Next, from /opt/afyascribe/backend:
    1. cp deploy/env.production.example .env && chmod 600 .env   — and fill it in
    2. sudo docker compose up -d postgres
    3. sudo bash deploy/migrate-from-neon.sh                       — copies the data
    4. sudo docker compose up -d --build                           — starts the API

EOF
