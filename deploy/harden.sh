#!/usr/bin/env bash
#
# First-boot hardening for the AfyaScribe VPS.
#
# Run this as root in your first SSH session, before installing anything else.
# It is safe to run more than once.
#
#   scp -i ~/.ssh/afyascribe deploy/harden.sh root@<ip>:/root/
#   ssh -i ~/.ssh/afyascribe root@<ip> 'bash /root/harden.sh pete'
#
# ── Before you run it ──────────────────────────────────────────────────────
#
# Open a SECOND terminal and leave it logged in to the server. If anything
# here goes wrong, that session is how you get back in. Do not close it until
# you have proved a fresh login works.
#
# What this does, in order, and why that order:
#   1. Refuses to continue unless an SSH key is already installed. Turning off
#      passwords without a working key is how people lock themselves out of a
#      machine they cannot walk up to.
#   2. Patches the system.
#   3. Creates a non-root user with sudo and copies your key to them.
#   4. Opens 22, 80 and 443 in the firewall BEFORE enabling it — enabling a
#      default-deny firewall without allowing SSH first cuts your own session.
#   5. Installs fail2ban so repeated SSH guessing gets banned.
#   6. Turns off password authentication and direct root login, validating the
#      configuration before reloading, and reloading rather than restarting so
#      the session you are sitting in survives.
#   7. Enables automatic security updates.
#
set -euo pipefail

NEW_USER="${1:-afyascribe}"
SSHD_CONFIG=/etc/ssh/sshd_config
say() { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run this as root."; exit 1; }

# ── 1. Refuse to proceed without a key ─────────────────────────────────────
say "Checking for an installed SSH key"
KEYS=/root/.ssh/authorized_keys
if [ ! -s "$KEYS" ]; then
  warn "No key in $KEYS."
  warn "If you did not paste a public key when ordering, add it now:"
  warn "  ssh-copy-id -i ~/.ssh/afyascribe.pub root@<ip>"
  warn "Refusing to disable passwords without a key — that would lock you out."
  exit 1
fi
printf '  %s key(s) installed:\n' "$(grep -c '^ssh-' "$KEYS" || echo 0)"
ssh-keygen -lf "$KEYS" 2>/dev/null | sed 's/^/    /' || true

# ── 2. Patch ────────────────────────────────────────────────────────────────
say "Updating the system (this takes a few minutes)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades chrony

# Logs and reports should read in local time; MOH returns are filed by Kenyan
# dates and a server an hour out puts a case in the wrong day.
timedatectl set-timezone Africa/Nairobi || true

# ── 3. A non-root user ──────────────────────────────────────────────────────
say "Creating the non-root user: $NEW_USER"
if id "$NEW_USER" &>/dev/null; then
  echo "  already exists"
else
  adduser --disabled-password --gecos "" "$NEW_USER"
fi
usermod -aG sudo "$NEW_USER"

install -d -m 700 -o "$NEW_USER" -g "$NEW_USER" "/home/$NEW_USER/.ssh"
cp "$KEYS" "/home/$NEW_USER/.ssh/authorized_keys"
chown "$NEW_USER:$NEW_USER" "/home/$NEW_USER/.ssh/authorized_keys"
chmod 600 "/home/$NEW_USER/.ssh/authorized_keys"
echo "  key copied to $NEW_USER"

# Passwordless sudo is NOT set: a stolen session should still have to prove
# itself before changing the system. Set a password for sudo now.
if ! passwd -S "$NEW_USER" | grep -qE ' P '; then
  warn "Set a sudo password for $NEW_USER when prompted:"
  passwd "$NEW_USER"
fi

# ── 4. Firewall — allow first, enable second ───────────────────────────────
say "Firewall"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP (ACME + redirect)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
# Postgres is deliberately absent. The database is reached over the Docker
# network by the backend container and must never be published to the host's
# public interface.
ufw --force enable >/dev/null
ufw status numbered | sed 's/^/  /'

# ── 5. fail2ban ─────────────────────────────────────────────────────────────
say "fail2ban"
cat >/etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban >/dev/null 2>&1 || systemctl restart fail2ban
echo "  5 failures in 10 minutes earns a 1 hour ban"

# ── 6. SSH: keys only ───────────────────────────────────────────────────────
say "Locking SSH to keys"
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%F-%H%M%S)"
mkdir -p /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/10-afyascribe.conf <<'EOF'
# AfyaScribe hardening. A drop-in rather than edits to sshd_config, so a
# package upgrade cannot quietly revert it.
PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
EOF

# Validate before reloading. A bad config plus a restart is a locked door.
if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "  password authentication disabled; configuration validated and reloaded"
else
  warn "sshd configuration is invalid — NOT reloading. Nothing has changed."
  rm -f /etc/ssh/sshd_config.d/10-afyascribe.conf
  exit 1
fi

# ── 7. Automatic security updates ──────────────────────────────────────────
say "Automatic security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
echo "  enabled"

# ── Done ────────────────────────────────────────────────────────────────────
say "Done"
cat <<EOF

  Prove it worked BEFORE closing your second session. From your laptop:

      ssh -i ~/.ssh/afyascribe $NEW_USER@$(hostname -I | awk '{print $1}')

  That must succeed. Then check a password login is refused:

      ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no \\
          $NEW_USER@$(hostname -I | awk '{print $1}')

  It should say "Permission denied (publickey)". If it asks for a password,
  something did not apply — say so before going further.

  Still to do, in order:
    1. Point app.afyascribe.co.ke at this server (A record).
    2. Install Docker and nginx.
    3. Keep Postgres on 127.0.0.1 — never publish 5432.
    4. Let's Encrypt for app.afyascribe.co.ke.
    5. Backups to a second location, before any real data lands here.

EOF
