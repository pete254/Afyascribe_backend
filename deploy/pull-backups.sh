#!/usr/bin/env bash
#
# Keep the off-site copy of AfyaScribe's backups on this machine — a second
# machine, in Kenya, away from the server.
#
#   bash deploy/pull-backups.sh --install             # once: key, permission, hourly timer
#   bash deploy/pull-backups.sh                       # pull now
#   bash deploy/pull-backups.sh --status              # what is here, and how fresh
#   bash deploy/pull-backups.sh --copy-to /media/$USER/USB   # the weekly removable copy
#
# Run as yourself, not with sudo. Needs the server's backup.sh to have
# OFFSITE_USER set (it is, by `backup.sh --install`).
#
# How it is kept safe:
#   - The backups are encrypted on the server to a key whose private half is
#     NOT on this machine. Keep it on a USB stick and on paper, apart from the
#     backups — a stolen laptop then yields nothing readable.
#   - The pull runs unattended, so its SSH key has no passphrase. It is a
#     separate key, and the server confines it (rrsync -ro) to reading the
#     backup outbox: no shell, no writing, nothing else on the server. Losing
#     it exposes only files that are already encrypted.
#   - Nothing here is ever deleted automatically. Backups are small; prune by
#     hand if this disk ever needs the room.
#   - Every copy stays in Kenya. Do not point this at cloud-synced folders
#     (Google Drive, Dropbox, OneDrive): that would carry the backups abroad.
set -euo pipefail

VPS_HOST="${VPS_HOST:-102.68.87.161}"
VPS_USER="${VPS_USER:-pete}"
# The ordinary administrator SSH alias. Used only by --install, to authorise
# the pull key.
ADMIN_SSH="${ADMIN_SSH:-afyascribe-vps}"
OUTBOX=/var/backups/afyascribe-outbox
KEY="$HOME/.ssh/afyascribe-backup-pull"
DEST="${AFYASCRIBE_BACKUPS:-$HOME/AfyaScribe-backups}"
LOG="$DEST/pull.log"
STALE_HOURS=36
UNIT=afyascribe-pull-backups

# -F none: the pull must use only its own confined key, never fall back to the
# administrator key in ~/.ssh/config, which would get a full shell.
SSH_CMD="${PULL_SSH:-ssh -F none -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20}"

say()  { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { warn "$*"; exit 1; }
log()  { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
alert() {
  log "WARNING: $*"
  command -v notify-send >/dev/null && notify-send -u critical "AfyaScribe backups" "$*" 2>/dev/null || true
}

[ "$(id -u)" -ne 0 ] || die "Run as yourself, not with sudo."
install -d -m 700 "$DEST"
install -d -m 700 "$DEST"

newest() { ls -1t "$DEST"/afyascribe-*.dump.age 2>/dev/null | head -1 || true; }
# Backups and their .counts companions; never the log.
nfiles() { find "$1" -maxdepth 1 -name "afyascribe-*${2:-}" 2>/dev/null | wc -l; }

status() {
  local n f age_h
  n=$(nfiles "$DEST" .dump.age)
  f="$(newest)"
  echo "  $n backup(s) in $DEST ($(du -sh "$DEST" 2>/dev/null | cut -f1))"
  if [ -n "$f" ]; then
    age_h=$(( ($(date +%s) - $(stat -c %Y "$f")) / 3600 ))
    echo "  newest: $(basename "$f"), ${age_h} hour(s) old"
  fi
  if systemctl --user is-enabled -q "$UNIT.timer" 2>/dev/null; then
    echo "  hourly pull: on; last result $(systemctl --user show -P Result "$UNIT.service" 2>/dev/null)"
  else
    echo "  hourly pull: not installed (bash deploy/pull-backups.sh --install)"
  fi
}

pull() {
  install -d -m 700 "$DEST"
  [ -f "$KEY" ] || [ -n "${PULL_SSH:-}" ] || die "No pull key — run:  bash deploy/pull-backups.sh --install"

  local before after f bad=0
  before=$(nfiles "$DEST")
  # --ignore-existing: a backup, once here, is never overwritten — not even by
  # a damaged or replaced file on the server. Dot-files are uploads in progress.
  if ! rsync -a --ignore-existing --exclude='.*' -e "$SSH_CMD" "$VPS_USER@$VPS_HOST:" "$DEST/" 2>>"$LOG"; then
    alert "could not reach the server to pull backups (see $LOG)"
  fi
  after=$(nfiles "$DEST")
  # rsync -a carries the server folder's mode over; this one stays private.
  chmod 700 "$DEST"
  chmod 600 "$DEST"/afyascribe-* 2>/dev/null || true

  # Each backup must be an age file. Anything else is not a backup that can
  # be restored, whatever its name says.
  for f in "$DEST"/afyascribe-*.dump.age; do
    [ -e "$f" ] || continue
    head -n1 "$f" | grep -qx 'age-encryption.org/v1' || { bad=1; alert "$(basename "$f") is not an encrypted backup"; }
  done

  log "pulled $((after - before)) new file(s)"

  f="$(newest)"
  if [ -z "$f" ]; then
    alert "no backups here yet"
  elif [ $(( $(date +%s) - $(stat -c %Y "$f") )) -gt $(( STALE_HOURS * 3600 )) ]; then
    alert "newest backup is over $STALE_HOURS hours old — is the server's nightly backup running?"
  fi
  return $bad
}

case "${1:-}" in
  --install)
    say "Pull key"
    if [ ! -f "$KEY" ]; then
      ssh-keygen -q -t ed25519 -N '' -C "afyascribe-backup-pull@$(hostname)" -f "$KEY"
      echo "  created $KEY"
    else
      echo "  $KEY already exists"
    fi

    say "Authorising it on the server — read-only, backup outbox only"
    line="command=\"/usr/bin/rrsync -ro $OUTBOX/\",restrict $(cat "$KEY.pub")"
    # The line travels on stdin, so no shell on either side re-parses it.
    printf '%s\n' "$line" | ssh "$ADMIN_SSH" '
      set -e
      line="$(cat)"
      [ -x /usr/bin/rrsync ] || { echo "  /usr/bin/rrsync is missing on the server (it comes with rsync)"; exit 1; }
      touch ~/.ssh/authorized_keys
      if grep -qxF "$line" ~/.ssh/authorized_keys; then
        echo "  already authorised"
      else
        printf "%s\n" "$line" >> ~/.ssh/authorized_keys
        echo "  authorised"
      fi'

    say "Hourly timer"
    install -d "$HOME/.local/bin" "$HOME/.config/systemd/user"
    install -m 700 "$0" "$HOME/.local/bin/$UNIT"
    cat >"$HOME/.config/systemd/user/$UNIT.service" <<EOF
[Unit]
Description=Pull AfyaScribe's encrypted backups from the server

[Service]
Type=oneshot
Environment=AFYASCRIBE_BACKUPS=$DEST
ExecStart=%h/.local/bin/$UNIT
EOF
    # Persistent: a pull missed while the laptop was off runs when it is next on.
    cat >"$HOME/.config/systemd/user/$UNIT.timer" <<EOF
[Unit]
Description=Pull AfyaScribe's encrypted backups hourly

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$UNIT.timer" >/dev/null
    echo "  enabled"

    say "First pull"
    pull || true
    status
    cat <<EOF

  Once a week, plug in a USB drive and run:
      bash deploy/pull-backups.sh --copy-to /media/$USER/<drive>
  Keep that drive somewhere other than this laptop.

EOF
    ;;
  --copy-to)
    target="${2:-}"
    [ -n "$target" ] && [ -d "$target" ] || die "Name a mounted drive:  --copy-to /media/$USER/<drive>"
    say "Copying to $target"
    install -d -m 700 "$target/AfyaScribe-backups"
    rsync -a --ignore-existing "$DEST/" "$target/AfyaScribe-backups/"
    sync
    echo "  $(nfiles "$target/AfyaScribe-backups" .dump.age) backup(s) on the drive"
    log "copied to $target"
    ;;
  --status)
    status
    ;;
  "")
    install -d -m 700 "$DEST"
    pull
    ;;
  *)
    die "Unknown option: $1"
    ;;
esac
