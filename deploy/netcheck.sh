#!/usr/bin/env bash
#
# Log the network path between AfyaScribe's server and its users, every five
# minutes, as evidence for a provider ticket. Two ends, one script:
#
#   On a user's machine (no sudo) — measures the way users experience it:
#     bash deploy/netcheck.sh --install           # every 5 minutes while it is on
#   On the server (sudo) — runs 24/7, whatever any laptop is doing:
#     sudo bash deploy/netcheck.sh --install-server 102.215.12.253
#       (the user network's public IP; its router answers when the PC is off)
#
#   bash deploy/netcheck.sh --report               # summary of the log
#   bash deploy/netcheck.sh --uninstall            # stop, keep the log
#
# The laptop end pings the server and a control address (Cloudflare), and
# downloads the web app's main file as a browser would. Its CSV records: loss, round trip, how long the connection
# took to open (a dropped connection attempt shows as seconds, not ms), and
# the whole download.
#
# The server end pings the user network and two control addresses — Cloudflare
# and Google, both with Nairobi presence. Slow to the user network but fast to
# the controls means the fault is the route between those two networks, not
# the server and not the user's line.
#
# Nothing is sent anywhere. The logs stay where they are written.
set -euo pipefail

SERVER_IP=102.68.87.161
APP=https://app.afyascribe.co.ke
CONTROLS="1.1.1.1 8.8.8.8"
PINGS=10
UNIT=afyascribe-netcheck

die() { printf '!! %s\n' "$*"; exit 1; }
now() { date '+%F %T'; }

# "loss%,avg_ms" from ping's summary; avg is empty when nothing came back.
ping_stats() {
  local out loss avg
  out="$(ping -n -q -c "$PINGS" -i 0.5 -W 2 "$1" 2>/dev/null || true)"
  loss="$(echo "$out" | grep -oE '[0-9.]+% packet loss' | cut -d% -f1)"
  avg="$(echo "$out" | awk -F/ '/^rtt|^round-trip/ {print $5}')"
  echo "${loss:-100},${avg:-}"
}

laptop_check() {
  local log="${NETCHECK_LOG:-$HOME/afyascribe-netcheck.csv}" js t
  [ -s "$log" ] || echo "time,ping_loss_pct,ping_avg_ms,control_loss_pct,control_avg_ms,connect_s,download_s,http,bytes" > "$log"
  # The main file's name changes with each release; read it from the page.
  js="$(curl -s --max-time 30 "$APP/" | grep -oE 'src="/assets/[^"]+\.js' | head -1 | cut -d'"' -f2 || true)"
  if [ -n "$js" ]; then
    t="$(curl -s -o /dev/null --max-time 180 -H 'Accept-Encoding: gzip, br' \
          -w '%{time_connect},%{time_total},%{http_code},%{size_download}' "$APP$js" || true)"
  fi
  # A request that never completed is logged as such, never left out.
  [ -n "${t:-}" ] || t=",,000,0"
  # The control on the same line at the same moment: loss to it as well means
  # the user's own connection, not the route to the server.
  echo "$(now),$(ping_stats "$SERVER_IP"),$(ping_stats "${CONTROLS%% *}"),$t" >> "$log"
}

server_check() {
  local log=/var/log/afyascribe-netcheck.csv conf=/etc/afyascribe/netcheck.env target
  [ -f "$conf" ] && . "$conf"
  [ -n "${USER_NET:-}" ] || die "No USER_NET in $conf — run --install-server <ip>"
  [ -s "$log" ] || echo "time,target,role,ping_loss_pct,ping_avg_ms" > "$log"
  echo "$(now),$USER_NET,user-network,$(ping_stats "$USER_NET")" >> "$log"
  for target in $CONTROLS; do
    echo "$(now),$target,control,$(ping_stats "$target")" >> "$log"
  done
}

report() {
  local log
  for log in "${NETCHECK_LOG:-$HOME/afyascribe-netcheck.csv}" /var/log/afyascribe-netcheck.csv; do
    [ -r "$log" ] || continue
    echo "== $log"
    python3 - "$log" <<'EOF'
import csv, sys, statistics as st
rows = list(csv.DictReader(open(sys.argv[1])))
if not rows:
    sys.exit(print("  empty"))
print(f"  {len(rows)} checks, {rows[0]['time']} to {rows[-1]['time']}")
def f(v):
    try: return float(v)
    except (TypeError, ValueError): return None
def summary(rs, label):
    loss = [f(r["ping_loss_pct"]) or 0 for r in rs]
    rtt = [x for x in (f(r["ping_avg_ms"]) for r in rs) if x is not None]
    lossy = sum(1 for x in loss if x > 0)
    line = f"  {label}: median round trip {st.median(rtt):.0f} ms" if rtt else f"  {label}: no replies at all"
    line += f"; packet loss in {lossy}/{len(rs)} checks ({100*lossy/len(rs):.0f}%), average loss {st.mean(loss):.1f}%"
    print(line)
if "download_s" in rows[0]:
    summary(rows, "ping to server")
    summary([dict(r, ping_loss_pct=r["control_loss_pct"], ping_avg_ms=r["control_avg_ms"]) for r in rows], "ping to control (1.1.1.1)")
    dl = [f(r["download_s"]) for r in rows]
    cn = [f(r["connect_s"]) for r in rows]
    failed = sum(1 for r in rows if r["http"] != "200")
    slow = sum(1 for x in dl if x is not None and x > 10)
    slowconn = sum(1 for x in cn if x is not None and x > 3)
    ok = sorted(x for x in dl if x is not None and x > 0)
    print(f"  page download: failed {failed}, over 10 s {slow}, of {len(rows)} ({100*(failed+slow)/len(rows):.0f}% bad)")
    print(f"  connection took over 3 s to open: {slowconn} times (dropped connection attempts)")
    if ok:
        print(f"  download time: median {st.median(ok):.1f} s, worst {ok[-1]:.1f} s")
    worst = sorted((r for r in rows if f(r["download_s"]) and f(r["download_s"]) > 10), key=lambda r: -f(r["download_s"]))[:10]
    for r in worst:
        print(f"    {r['time']}  download {f(r['download_s']):.1f} s, connect {f(r['connect_s']) or 0:.1f} s, loss {r['ping_loss_pct']}%")
else:
    for target in dict.fromkeys(r["target"] for r in rows):
        rs = [r for r in rows if r["target"] == target]
        summary(rs, f"{target} ({rs[0]['role']})")
EOF
  done
}

case "${1:-}" in
  --install)
    [ "$(id -u)" -ne 0 ] || die "On a laptop, run as yourself. On the server, use --install-server."
    install -d "$HOME/.local/bin" "$HOME/.config/systemd/user"
    install -m 755 "$0" "$HOME/.local/bin/$UNIT"
    cat >"$HOME/.config/systemd/user/$UNIT.service" <<EOF
[Unit]
Description=Log the network path to AfyaScribe's server

[Service]
Type=oneshot
ExecStart=%h/.local/bin/$UNIT
EOF
    cat >"$HOME/.config/systemd/user/$UNIT.timer" <<EOF
[Unit]
Description=Log the network path to AfyaScribe's server every 5 minutes

[Timer]
OnCalendar=*:0/5
AccuracySec=10s

[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$UNIT.timer" >/dev/null
    echo "Logging every 5 minutes to ~/afyascribe-netcheck.csv while this machine is on."
    echo "Summary any time:  bash deploy/netcheck.sh --report"
    ;;
  --install-server)
    [ "$(id -u)" -eq 0 ] || die "Run with sudo."
    [ -n "${2:-}" ] || die "Give the user network's public IP:  --install-server 102.215.12.253"
    install -d -m 700 /etc/afyascribe
    echo "USER_NET=$2" > /etc/afyascribe/netcheck.env
    REPO="$(cd "$(dirname "$0")/.." && pwd)"
    cat >/etc/cron.d/$UNIT <<EOF
# Network-path evidence for the provider ticket. Remove when resolved.
*/5 * * * * root bash $REPO/deploy/netcheck.sh --server-check
EOF
    chmod 644 /etc/cron.d/$UNIT
    echo "First check now:"
    server_check
    tail -n 3 /var/log/afyascribe-netcheck.csv
    echo "Logging every 5 minutes to /var/log/afyascribe-netcheck.csv."
    ;;
  --uninstall)
    if [ "$(id -u)" -eq 0 ]; then
      rm -f /etc/cron.d/$UNIT
    else
      systemctl --user disable --now "$UNIT.timer" 2>/dev/null || true
    fi
    echo "Stopped. The log is kept."
    ;;
  --server-check) server_check ;;
  --report) report ;;
  "") laptop_check ;;
  *) die "Unknown option: $1" ;;
esac
