#!/usr/bin/env bash
#
# Every kind of recovery from the AfyaScribe backups, and the restore tests.
# Backup and Recovery Policy, section 6 (standard operating procedures).
#
#   sudo bash deploy/restore.sh list [kind]           what the vault holds (kind: logical, base, wal, upload, secrets)
#   sudo bash deploy/restore.sh verify                checksums of a sample of the vault — no key needed
#
#   sudo bash deploy/restore.sh secrets <path>        the settings file (.env), onto a rebuilt server
#   sudo bash deploy/restore.sh file <key>            ONE uploaded file back onto the server
#   sudo bash deploy/restore.sh uploads               every uploaded file missing from the server
#   sudo bash deploy/restore.sh table <table> [dump]  one table, restored beside the live one for comparison
#   sudo bash deploy/restore.sh db [dump] --replace-live
#                                                     the whole database from a nightly dump
#   sudo bash deploy/restore.sh pitr "<time>" [--apply]
#                                                     the database as it was at <time> (EAT), e.g. "2026-11-02 14:05"
#                                                     without --apply: rebuilt and checked aside, live untouched
#
#   sudo bash deploy/restore.sh test [logical|pitr|uploads|all] ["<time>"]
#                                                     restore tests; each writes a dated test report
#
# Everything except list and verify asks for the PRIVATE backup key (the file
# from the password manager, or pasted) and its passphrase. They are held in
# memory (/dev/shm) for the length of the run and never written to disk.
# Decrypted data is handled in memory too, in throwaway databases on private
# networks, and removed when the run ends.
#
# Copies are taken from this server when they are here (the last 14 days) and
# from the vault on Neon otherwise; FROM=vault forces the vault, which is what
# a disaster recovery test should prove.
set -Eeuo pipefail
JOB=restore
. "$(dirname "$0")/backup-common.sh"
load_settings

CMD="${1:-}"; shift || true
REPORTS="$OUT/restore-tests"
WORK="${RESTORE_WORK:-$(mktemp -d /dev/shm/afyascribe-restore.XXXXXX)}"
chmod 700 "$WORK"
TAG="afyascribe-restore-$$"
say()  { printf '\n\033[1;36m══ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
fail() { warn "$*"; exit 1; }

cleanup() {
  [ -n "${BACKUP_LOCAL:-}" ] && [ -f "$WORK/scratch/postmaster.pid" ] && pg_ctl -D "$WORK/scratch" -m immediate stop >/dev/null 2>&1 || true
  [ -n "${BACKUP_LOCAL:-}" ] && [ -f "$WORK/pg/data/postmaster.pid" ] && pg_ctl -D "$WORK/pg/data" -m immediate stop >/dev/null 2>&1 || true
  if [ -z "${BACKUP_LOCAL:-}" ]; then
    docker rm -f "$TAG" >/dev/null 2>&1 || true
    docker network rm "$TAG" >/dev/null 2>&1 || true
  fi
  [ -n "${RESTORE_KEEP_WORK:-}" ] || rm -rf "$WORK"
}
trap cleanup EXIT

# ── Fetching ───────────────────────────────────────────────────────────────
# fetch NAME FILE: the local copy if it is here and intact, else the vault.
fetch() {
  local name="$1" file="$2" local_path
  local_path="$OUT/$(sed -E 's#^db/##; s#^(logical|base|wal|secrets)/#\1/#' <<<"$name")"
  case "$name" in uploads/*) local_path="" ;; esac
  if [ "${FROM:-}" != vault ] && [ -n "$local_path" ] && [ -s "$local_path" ]; then
    local want
    want="$(vault_sql -c "select sha256 from backup_vault.objects where name = \$n\$$name\$n\$")"
    if [ -z "$want" ] || [ "$(sha256 "$local_path")" = "$want" ]; then
      cp "$local_path" "$file"; return 0
    fi
    warn "the copy on this server of $name does not match the vault's checksum — using the vault"
  fi
  vault_get "$name" "$file"
}

# ── The private key ────────────────────────────────────────────────────────
KEYHOME=""
need_key() {
  [ -z "$KEYHOME" ] || return 0
  if [ -n "${RESTORE_KEYHOME:-}" ]; then KEYHOME="$RESTORE_KEYHOME"; PASSPHRASE="${RESTORE_PASSPHRASE:-}"; return 0; fi
  KEYHOME="$WORK/gnupg"; install -d -m 700 "$KEYHOME"
  local keytext
  if [ -n "${RESTORE_KEY_FILE:-}" ]; then
    keytext="$(cat "$RESTORE_KEY_FILE")"
  else
    echo "The PRIVATE backup key: give the path to the key file, or paste it and press Ctrl-D."
    read -rp "Path (or Enter to paste): " p
    if [ -n "$p" ]; then keytext="$(cat "$p")"; else keytext="$(cat)"; fi
  fi
  case "$keytext" in *"BEGIN PGP PRIVATE KEY BLOCK"*) ;; *) fail "That is not a PGP private key." ;; esac
  printf '%s\n' "$keytext" | gpg --homedir "$KEYHOME" --batch --quiet --import 2>/dev/null
  unset keytext
  if [ -n "${RESTORE_PASSPHRASE+x}" ]; then PASSPHRASE="$RESTORE_PASSPHRASE"
  else read -rsp "Passphrase of the backup key (input hidden): " PASSPHRASE; echo; fi
}
decrypt() {  # stdin → stdout
  need_key
  gpg --homedir "$KEYHOME" --batch --quiet --no-tty --pinentry-mode loopback \
      --passphrase-fd 3 --decrypt 3<<<"$PASSPHRASE"
}

# ── A throwaway database ───────────────────────────────────────────────────
# Docker: in memory, on a private network with no published port.
# Test harness (BACKUP_LOCAL): a local cluster on a socket in WORK.
SCRATCH_PW=""
scratch_start() {
  say "Starting a throwaway database"
  if [ -n "${BACKUP_LOCAL:-}" ]; then
    initdb -D "$WORK/scratch" -U restore -A trust >/dev/null
    pg_ctl -D "$WORK/scratch" -o "-k $WORK -c listen_addresses='' -p 54329" -w start >/dev/null
    createdb -h "$WORK" -p 54329 -U restore restore
  else
    SCRATCH_PW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
    docker network create --internal "$TAG" >/dev/null
    docker run -d --name "$TAG" --network "$TAG" \
      --tmpfs /var/lib/postgresql/data:rw,size="${RESTORE_MEMORY:-2g}" \
      -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$SCRATCH_PW" -e POSTGRES_DB=restore \
      "$PG_IMAGE" >/dev/null
    for _ in $(seq 60); do docker exec "$TAG" pg_isready -q -h 127.0.0.1 -U restore 2>/dev/null && break; sleep 1; done
    docker exec "$TAG" pg_isready -q -h 127.0.0.1 -U restore || fail "The throwaway database did not start."
  fi
}
in_scratch() {
  if [ -n "${BACKUP_LOCAL:-}" ]; then PGHOST="$WORK" PGPORT=54329 PGUSER=restore PGDATABASE=restore "$@"
  else docker exec -i -e PGUSER=restore -e PGDATABASE=restore "$TAG" "$@"; fi
}
scratch_sql() { in_scratch psql -v ON_ERROR_STOP=1 -qtA "$@"; }

COUNT_SQL="select coalesce(json_object_agg(table_name, n), '{}') from (
  select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint n
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') t"

# The audit chain, checked with the application's own code (verify-chain.js).
chain_check() {
  if [ -n "${BACKUP_LOCAL:-}" ]; then echo '{"ok":null,"note":"not checked in the test harness"}'; return 0; fi
  docker image inspect afyascribe-backend:latest >/dev/null 2>&1 || { echo '{"ok":null,"note":"no backend image to check with"}'; return 0; }
  docker run --rm --network "$TAG" -e PGHOST="$TAG" -e PGUSER=restore -e PGPASSWORD="$SCRATCH_PW" -e PGDATABASE=restore \
    -v "$REPO/deploy/verify-chain.js:/app/verify-chain.js:ro" afyascribe-backend:latest node /app/verify-chain.js
}

compare_counts() {  # expected-json got-json → prints verdict line; returns 1 on a missing table
  python3 - "$1" "$2" <<'PY'
import json, sys
want, got = json.loads(sys.argv[1] or "{}"), json.loads(sys.argv[2] or "{}")
missing = sorted(set(want) - set(got))
differ = sorted(t for t in want if t in got and want[t] != got[t])
rows = sum(got.values())
if missing:
    print(f"FAIL — tables missing: {', '.join(missing)}"); sys.exit(1)
if not want:
    print(f"{len(got)} tables, {rows} rows (no counts recorded to compare)")
elif differ:
    print(f"all {len(want)} tables present, {rows} rows; counts differ in {len(differ)}: " + ", ".join(f"{t} {want[t]}→{got[t]}" for t in differ))
else:
    print(f"all {len(want)} tables match exactly, {rows} rows")
PY
}

# ── Report ─────────────────────────────────────────────────────────────────
report() {  # scenario result body
  install -d -m 700 "$REPORTS"
  local f="$REPORTS/$(date +%F-%H%M%S)-$1.txt"
  {
    echo "AfyaScribe — Backup Restore Test Report"
    echo "========================================"
    echo "Date and time:   $(date '+%F %T %Z')"
    echo "Server:          $(hostname)"
    echo "Run by:          ${SUDO_USER:-$(id -un)}"
    echo "Scenario:        $1"
    echo "Result:          $2"
    echo
    printf '%s\n' "$3"
    echo
    echo "Failures and remediation (complete by hand if any):"
    echo "  -"
    echo
    echo "Reviewed by: ______________________   Date: ____________   Signature: ______________"
  } > "$f"
  chmod 600 "$f"
  say "Report: $f"
}

latest() { vault_sql -c "select name from backup_vault.objects where kind = '$1' order by created_at desc limit 1"; }

# ════════════════════════════════════════════════════════════════════════════
case "$CMD" in

list)
  vault_sql -c "select to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') || '  ' || rpad(kind, 8) || rpad(tier, 8) || lpad(pg_size_pretty(size), 9) || '  locked to ' || to_char(retain_until, 'YYYY-MM-DD') || '  ' || name
                from backup_vault.objects ${1:+where kind = '$1'} order by created_at"
  ;;

verify)
  # Ciphertext only: each sampled copy downloaded and compared with the
  # checksum recorded when it was stored, and its header checked to be
  # encrypted to the backup key. Proves the off-site copies are intact
  # without the private key.
  # Encrypted to one of the backup key's (sub)keys, and to nothing else.
  encrypted_to_backup_key() {
    local ids got
    ids="$(gpg --batch --with-colons --list-keys "$GPG_RECIPIENT" | awk -F: '$1=="pub"||$1=="sub" {print $5}')"
    got="$( { gpg --batch --list-packets "$1" 2>&1 || true; } | sed -n 's/^:pubkey enc packet:.* keyid \([0-9A-F]*\).*/\1/p')"
    [ -n "$got" ] || return 1
    while read -r k; do grep -qx "$k" <<<"$ids" || return 1; done <<<"$got"
  }
  say "Checking a sample of the vault"
  names="$( { latest logical; latest base; latest secrets
             vault_sql -c "select name from backup_vault.objects where kind = 'wal' order by random() limit 3"
             vault_sql -c "select name from backup_vault.objects where kind = 'upload' order by random() limit 3"; } | sed '/^$/d')"
  bad=0; n=0
  while read -r name; do
    n=$((n + 1))
    if vault_get "$name" "$WORK/obj" && encrypted_to_backup_key "$WORK/obj"; then
      echo "  ok   $name"
    else
      echo "  BAD  $name"; bad=$((bad + 1))
    fi
    rm -f "$WORK/obj"
  done <<<"$names"
  log "vault check: $n sampled, $bad bad"
  [ "$bad" -eq 0 ] || exit 1
  ;;

file)
  key="${1:?which file? e.g. patients/<facility>/<file>.pdf}"
  name="$(vault_sql -c "select name from backup_vault.objects where kind = 'upload' and meta->>'key' = \$k\$$key\$k\$ order by created_at desc limit 1")"
  [ -n "$name" ] || fail "No copy of $key in the vault."
  want="$(vault_sql -c "select meta->>'sha256_plain' from backup_vault.objects where name = \$n\$$name\$n\$")"
  fetch "$name" "$WORK/f.gpg"
  decrypt < "$WORK/f.gpg" > "$WORK/f"
  [ "$(sha256 "$WORK/f")" = "$want" ] || fail "The decrypted file does not match its original checksum."
  in_app sh -c "mkdir -p \"\$(dirname '$UPLOADS_ROOT/$key')\" && cat > '$UPLOADS_ROOT/$key'" < "$WORK/f"
  say "Restored $key (checksum matches the original)"
  ;;

uploads)
  mapfile -t here < <(in_app sh -c "cd '$UPLOADS_ROOT' 2>/dev/null && find . -type f | sed 's|^\./||'" || true)
  declare -A present=(); for k in "${here[@]}"; do [ -n "$k" ] && present["$k"]=1; done
  restored=0; failed=0
  while IFS='|' read -r key name want; do
    [ -n "$key" ] || continue
    [ -z "${present[$key]:-}" ] || continue
    if fetch "$name" "$WORK/f.gpg" && decrypt < "$WORK/f.gpg" > "$WORK/f" && [ "$(sha256 "$WORK/f")" = "$want" ] \
       && in_app sh -c "mkdir -p \"\$(dirname '$UPLOADS_ROOT/$key')\" && cat > '$UPLOADS_ROOT/$key'" < "$WORK/f"; then
      restored=$((restored + 1))
    else
      failed=$((failed + 1)); warn "could not restore $key"
    fi
  done < <(vault_sql -c "select distinct on (meta->>'key') meta->>'key', name, meta->>'sha256_plain' from backup_vault.objects where kind = 'upload' order by meta->>'key', created_at desc")
  say "Restored $restored missing file(s); failed $failed"
  [ "$failed" -eq 0 ]
  ;;

secrets)
  # The settings file (.env), for rebuilding a lost server (Disaster Recovery
  # Plan R1). Written to the given path, readable by root only.
  dest="${1:?where to write it, e.g. /opt/afyascribe/backend/.env}"
  [ ! -e "$dest" ] || fail "$dest already exists; move it aside first."
  name="$(latest secrets)"; [ -n "$name" ] || fail "No settings file in the vault."
  fetch "$name" "$WORK/s.gpg"
  ( umask 077; decrypt < "$WORK/s.gpg" > "$dest" )
  say "Settings file from $name written to $dest"
  ;;

db|table)
  if [ "$CMD" = table ]; then TABLE="${1:?which table?}"; shift; fi
  NAME="${1:-}"; [ "${NAME:0:2}" = -- ] && NAME=""
  [ -n "$NAME" ] || NAME="$(latest logical)"
  [ -n "$NAME" ] || fail "No database dump in the vault."
  meta="$(vault_sql -c "select meta from backup_vault.objects where name = \$n\$$NAME\$n\$")"
  say "Dump: $NAME"
  fetch "$NAME" "$WORK/db.gpg"
  decrypt < "$WORK/db.gpg" > "$WORK/db.dump"; rm -f "$WORK/db.gpg"
  want="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("sha256_plain",""))' "$meta")"
  [ -z "$want" ] || [ "$(sha256 "$WORK/db.dump")" = "$want" ] || fail "The decrypted dump does not match its original checksum."
  echo "  decrypted; checksum matches the original"
  if [ "$CMD" = table ]; then
    scratch_start
    in_scratch pg_restore --no-owner --no-acl --exit-on-error --section=pre-data -d restore < "$WORK/db.dump" >/dev/null
    in_scratch pg_restore --no-owner --no-acl --exit-on-error --data-only -t "$TABLE" -d restore < "$WORK/db.dump"
    say "Table $TABLE as it was in that dump: $(scratch_sql -c "select count(*) from \"$TABLE\"") rows"
    echo "Compare and copy what is needed, then press Enter to end (the copy is discarded):"
    echo "  sudo docker exec -it $TAG psql -U restore -d restore"
    read -r _
  elif [[ " $* " == *" --replace-live "* ]]; then
    read -rp "This REPLACES the live database with $NAME. Type RESTORE to continue: " ok
    [ "$ok" = RESTORE ] || fail "Stopped; nothing changed."
    docker compose -f "$REPO/docker-compose.yml" stop backend
    in_db pg_restore -U "$(db_user)" -d "$(db_name)" --clean --if-exists --no-owner --single-transaction --exit-on-error < "$WORK/db.dump"
    got="$(prod_sql -c "$COUNT_SQL")"
    say "Restored: $(compare_counts "$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1]).get("counts",{})))' "$meta")" "$got")"
    docker compose -f "$REPO/docker-compose.yml" up -d backend
    rm -f "$STATE/last_manifest"
    echo "Next: check the audit ledger in the web app (Audit log → Verify), and run sudo bash deploy/backup.sh"
  else
    fail "Say --replace-live to replace the live database, or use 'test logical' to restore it aside."
  fi
  ;;

pitr)
  T="${1:?the time to restore to, in EAT, e.g. \"2026-11-02 14:05\"}"
  T_UTC="$(TZ=UTC date -d "TZ=\"Africa/Nairobi\" $T" '+%Y-%m-%d %H:%M:%S+00')" || fail "Cannot read the time '$T'."
  APPLY=""; [ "${2:-}" = --apply ] && APPLY=1
  started=$(date +%s)
  say "Restoring the database as it was at $T EAT ($T_UTC)"
  full="$(vault_sql -c "select name from backup_vault.objects where kind = 'base' and meta->>'mode' = 'full' and created_at <= '$T_UTC' order by created_at desc limit 1")"
  [ -n "$full" ] || fail "No full base backup before $T."
  mapfile -t chain < <(echo "$full"; vault_sql -c "select name from backup_vault.objects where kind = 'base' and meta->>'mode' = 'incremental' and meta->>'full' = '$full' and created_at <= '$T_UTC' order by created_at")
  start_wal="$(vault_sql -c "select meta->>'start_wal' from backup_vault.objects where name = '$full'")"
  echo "  base: ${#chain[@]} backup(s) from $(basename "$full"), log from segment $start_wal"
  install -d -m 700 "$WORK/pg" "$WORK/pg/b" "$WORK/pg/wal"
  i=0
  for name in "${chain[@]}"; do
    fetch "$name" "$WORK/pg/b.gpg"
    install -d -m 700 "$WORK/pg/b/$i"
    decrypt < "$WORK/pg/b.gpg" | gunzip | tar -C "$WORK/pg/b/$i" -xf -
    rm -f "$WORK/pg/b.gpg"; i=$((i + 1))
  done
  # The log from the full backup's start to an hour past the target.
  mapfile -t segs < <(vault_sql -c "select name from backup_vault.objects where kind = 'wal' and (meta->>'segment' >= '$start_wal' or meta->>'segment' like '%.history') and created_at <= timestamptz '$T_UTC' + interval '1 hour' order by meta->>'segment'")
  for name in "${segs[@]}"; do
    [ -n "$name" ] || continue
    seg="$(basename "$name" .gz.gpg)"
    fetch "$name" "$WORK/w.gpg"
    decrypt < "$WORK/w.gpg" | gunzip > "$WORK/pg/wal/$seg"
  done
  rm -f "$WORK/w.gpg"
  echo "  log: ${#segs[@]} segment(s)"
  if [ "${#chain[@]}" -gt 1 ]; then
    dirs=(); for j in $(seq 0 $((i - 1))); do dirs+=("$WORK/pg/b/$j"); done
    [ -n "${BACKUP_LOCAL:-}" ] || chown -R 70:70 "$WORK/pg"
    WORK="$WORK/pg" PGTOOL_USER=70:70 pgtool pg_combinebackup "${dirs[@]}" -o "$WORK/pg/data"
  else
    mv "$WORK/pg/b/0" "$WORK/pg/data"
  fi
  rm -rf "$WORK/pg/b"
  if [ -n "${BACKUP_LOCAL:-}" ]; then walpath="$WORK/pg/wal"; else walpath=/restore/wal; fi
  touch "$WORK/pg/data/recovery.signal"
  cat >> "$WORK/pg/data/postgresql.auto.conf" <<EOF
restore_command = 'cp $walpath/%f "%p"'
recovery_target_time = '$T_UTC'
recovery_target_action = 'promote'
archive_mode = 'off'
EOF
  chmod 700 "$WORK/pg/data"
  say "Replaying the log to $T EAT"
  if [ -n "${BACKUP_LOCAL:-}" ]; then
    pg_ctl -D "$WORK/pg/data" -o "-k $WORK -c listen_addresses='' -p 54330" -w -t 600 start >/dev/null
    rsql() { PGHOST="$WORK" PGPORT=54330 psql -U "$(db_user)" -d "$(db_name)" -v ON_ERROR_STOP=1 -qtA "$@"; }
  else
    chown -R 70:70 "$WORK/pg"
    docker network create --internal "$TAG" >/dev/null
    docker run -d --name "$TAG" --network "$TAG" -v "$WORK/pg/data:/var/lib/postgresql/data" -v "$WORK/wal:/restore/wal:ro" "$PG_IMAGE" >/dev/null
    rsql() { docker exec -i "$TAG" psql -U "$(db_user)" -d "$(db_name)" -v ON_ERROR_STOP=1 -qtA "$@"; }
  fi
  for _ in $(seq 600); do
    [ "$(rsql -c 'select pg_is_in_recovery()' 2>/dev/null || true)" = f ] && break
    sleep 1
  done
  [ "$(rsql -c 'select pg_is_in_recovery()' 2>/dev/null || true)" = f ] || fail "Recovery did not finish. See: docker logs $TAG"
  got="$(rsql -c "$COUNT_SQL")"
  last_event="$(rsql -c "select coalesce(max(created_at)::text, 'none') from audit_events" 2>/dev/null || echo unknown)"
  if [ -n "${BACKUP_LOCAL:-}" ]; then
    pchain='{"ok":null,"note":"not checked in the test harness"}'
  else
    set +e
    pchain="$(docker run --rm --network "$TAG" -e PGHOST="$TAG" -e PGUSER="$(db_user)" -e PGPASSWORD="${DB_PASSWORD:-}" -e PGDATABASE="$(db_name)" \
      -v "$REPO/deploy/verify-chain.js:/app/verify-chain.js:ro" afyascribe-backend:latest node /app/verify-chain.js 2>&1)"
    [ $? -eq 0 ] || PITR_FAILED=1
    set -e
  fi
  took=$(( $(date +%s) - started ))
  summary="Target time:     $T EAT ($T_UTC)
Base backups:    ${chain[*]}
Log segments:    ${#segs[@]}
Recovered:       $(compare_counts '{}' "$got")
Last audit entry in the restored data: $last_event (UTC)
Audit chain:     $pchain
Time taken:      ${took}s (Recovery Time Objective: 4 hours)"
  echo "$summary"
  if [ -n "$APPLY" ]; then
    [ -z "${PITR_FAILED:-}" ] || fail "The audit chain of the restored data did not verify. Not applying it."
    read -rp "Replace the LIVE database with this one? Type RESTORE to continue: " ok
    [ "$ok" = RESTORE ] || fail "Stopped; the live database is unchanged."
    rsql -c "alter system reset restore_command; alter system reset recovery_target_time; alter system reset recovery_target_action; alter system reset archive_mode" >/dev/null
    docker stop "$TAG" >/dev/null
    docker compose -f "$REPO/docker-compose.yml" stop backend postgres
    vol="$(docker volume ls -q | grep -E '(^|_)postgres_data$' | head -1)"
    [ -n "$vol" ] || fail "Cannot find the postgres_data volume."
    docker run --rm -v "$vol:/target" -v "$WORK/pg/data:/src:ro" "$PG_IMAGE" sh -c 'rm -rf /target/* /target/.[!.]* 2>/dev/null; cp -a /src/. /target/'
    docker compose -f "$REPO/docker-compose.yml" up -d
    rm -f "$STATE/last_manifest"   # a new timeline: the next base backup must be full
    say "The live database is now as it was at $T EAT. Run a backup now: sudo bash deploy/backup.sh"
  elif [ -n "${PITR_REPORT:-}" ]; then
    report pitr "$([ -n "${PITR_FAILED:-}" ] && echo FAIL || echo PASS)" "$summary"
  fi
  [ -z "${PITR_FAILED:-}" ] || exit 1
  ;;

test)
  what="${1:-all}"
  if [ "$what" = logical ] || [ "$what" = all ]; then
    started=$(date +%s)
    NAME="$(latest logical)"
    meta="$(vault_sql -c "select meta from backup_vault.objects where name = \$n\$$NAME\$n\$")"
    FROM=vault fetch "$NAME" "$WORK/db.gpg"
    decrypt < "$WORK/db.gpg" > "$WORK/db.dump"; rm -f "$WORK/db.gpg"
    want="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("sha256_plain",""))' "$meta")"
    sum_ok="matches the original"; [ "$(sha256 "$WORK/db.dump")" = "$want" ] || sum_ok="DOES NOT MATCH"
    scratch_start
    in_scratch pg_restore --no-owner --no-acl --single-transaction --exit-on-error -d restore < "$WORK/db.dump"
    rm -f "$WORK/db.dump"
    got="$(scratch_sql -c "$COUNT_SQL")"
    set +e
    counts="$(compare_counts "$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1]).get("counts",{})))' "$meta")" "$got")"; crc=$?
    chain="$(chain_check)"; chain_rc=$?
    set -e
    result=PASS; { [ "$crc" -eq 0 ] && [ "$chain_rc" -eq 0 ] && [ "$sum_ok" = "matches the original" ]; } || result=FAIL
    report logical "$result" "Backup:          $NAME (taken from the off-site vault)
Checksum:        decrypted dump $sum_ok
Row counts:      $counts
Audit chain:     $chain
Time taken:      $(( $(date +%s) - started ))s from download to verified data (Recovery Time Objective: 4 hours)"
    if [ -z "${BACKUP_LOCAL:-}" ]; then docker rm -f "$TAG" >/dev/null 2>&1; docker network rm "$TAG" >/dev/null 2>&1 || true
    else pg_ctl -D "$WORK/scratch" -m fast stop >/dev/null; rm -rf "$WORK/scratch"; fi
    [ "$result" = PASS ] || exit 1
  fi
  if [ "$what" = uploads ] || [ "$what" = all ]; then
    total=0; ok=0
    while IFS='|' read -r key name want; do
      [ -n "$key" ] || continue
      total=$((total + 1))
      if FROM=vault fetch "$name" "$WORK/f.gpg" && [ "$(decrypt < "$WORK/f.gpg" | sha256sum | cut -d' ' -f1)" = "$want" ]; then ok=$((ok + 1)); else warn "BAD: $key"; fi
      rm -f "$WORK/f.gpg"
    done < <(vault_sql -c "select distinct on (meta->>'key') meta->>'key', name, meta->>'sha256_plain' from backup_vault.objects where kind = 'upload' order by meta->>'key', created_at desc")
    result=PASS; [ "$ok" -eq "$total" ] || result=FAIL
    report uploads "$result" "Every uploaded file's newest off-site copy downloaded, decrypted in memory and compared with the checksum of the original.
Files:           $ok of $total identical"
    [ "$result" = PASS ] || exit 1
  fi
  if [ "$what" = pitr ] || [ "$what" = all ]; then
    # To a given moment, or by default 10 minutes ago: proves base backups,
    # increments and the log together.
    at="${2:-$(TZ=Africa/Nairobi date -d '-10 min' '+%F %T')}"
    if [ -n "$KEYHOME" ]; then export RESTORE_KEYHOME="$KEYHOME" RESTORE_PASSPHRASE="$PASSPHRASE"; fi
    PITR_REPORT=1 FROM=vault bash "$0" pitr "$at"
  fi
  ;;

*)
  sed -n '3,30p' "$0"; exit 1 ;;
esac
