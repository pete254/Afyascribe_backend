# Commissioning the backup system (2 November 2026)

This replaces the earlier arrangement (a readable copy of the database on Neon,
and age-encrypted copies of uploaded files on Cloudinary). Afterwards:

| Copy | Where | Medium | Kept |
|---|---|---|---|
| 1. Live data | The Kenyan server (Host Africa) | Server disk | — |
| 2. Encrypted backups | The same server | Server disk | 14 days |
| 3. Encrypted backups, **locked** | The vault: a database on Neon | Cloud database | 35 days; monthly 13 months; yearly 20 years |
| 4. Encrypted backups, **offline** | An encrypted USB drive in the safe | Removable drive, disconnected | 13 months; January's 20 years |

Everything that leaves the database is encrypted with **AES-256** (OpenPGP) to
the company backup key. Neon and the drive hold only ciphertext; the private
key is never on the server.

Allow about an hour. Steps A and E are on your own computer; B in the Neon
console; C and D on the server.

---

## A. Make the backup key (your computer, once)

```bash
gpg --quick-generate-key "AfyaScribe Backup <info@afyascribe.co.ke>" rsa4096 encr never
# choose a long passphrase; store it in the password manager
gpg --fingerprint "AfyaScribe Backup"                      # note the fingerprint
gpg --armor --export "AfyaScribe Backup" > afyascribe-backup-PUBLIC.asc
gpg --armor --export-secret-keys "AfyaScribe Backup" > afyascribe-backup-PRIVATE.asc
```

- Put **afyascribe-backup-PRIVATE.asc** and the passphrase in the company
  password manager, entry "AfyaScribe backup key". Print the private key
  (`paperkey` or the .asc file) and put it in the safe, in a sealed envelope.
  James Mwando must know where both are.
- Then delete the private file from the computer: `shred -u afyascribe-backup-PRIVATE.asc`.
- Keep **afyascribe-backup-PUBLIC.asc**; it is pasted onto the server in C2.
  It is safe to share.

## B. Create the vault (Neon console, once)

1. console.neon.tech → the existing project → **Databases → New database**,
   name `afyascribe_vault`, owner: the project's owner role.
2. **Connect** → choose database `afyascribe_vault` → copy the connection string.
   Keep it to hand for C3; do not save it anywhere else.
3. Check the plan's storage limit. The vault starts small but grows with the
   35 days of backups; the nightly job warns at 80% of `VAULT_QUOTA_MB` (500 MB).
   Raise the plan before that, and set `VAULT_QUOTA_MB` to the new limit.

## C. Server

```bash
cd /opt/afyascribe/backend
git pull
sudo bash deploy/backup.sh --install          # C1: tools, settings, schedules
sudo bash deploy/backup.sh --import-key       # C2: paste the PUBLIC key, then Ctrl-D
                                              #     check the fingerprint matches step A
sudo bash deploy/vault-setup.sh               # C3: paste the owner connection string (hidden)
                                              #     → save the READER string it prints in the
                                              #       password manager: "AfyaScribe backup vault — reader"
sudo docker compose up -d                     # C4: restarts the database with log archiving (a few seconds)
sudo bash deploy/backup.sh                    # C5: the first backup — a full one
tail -30 /var/log/afyascribe-backup.log       #     must end with "done"
sudo bash deploy/restore.sh list              #     the vault now holds a dump, a base backup, files
```

After 10 minutes, check the transaction log is leaving the server:

```bash
grep ' wal: ' /var/log/afyascribe-backup.log | tail -3
sudo bash deploy/backup-watch.sh && echo "watchdog: all well"
```

## D. Commissioning test (server, with the private key)

```bash
sudo bash deploy/restore.sh test all
```

It asks for the private key (paste it from the password manager, Ctrl-D) and the
passphrase, then restores from the **vault**: the latest dump into a throwaway
database, every uploaded file, and the database to 10 minutes ago from the base
backup and log. Each writes a dated report under
`/var/backups/afyascribe/restore-tests/`. All three must say **PASS**. Send me
the three reports; they go into the Backup and Recovery Policy.

Then send yourself a test alert, to prove failures reach you:

```bash
sudo bash -c '. deploy/backup-common.sh; load_settings; alert "test alert" "If you can read this, backup alerts reach you."'
```

## E. Retire the old copies (only after D passes)

1. **Neon:** in the console, delete the old database that held the readable
   copy (the project's original database, usually `neondb` — **not**
   `afyascribe_vault`). Neon's own history keeps it for its history window, then
   it is gone.
2. **Cloudinary:** Media Library → delete the folder `afyascribe-backup`; then
   Settings → API Keys → delete the key the server used. Cloudinary is then no
   longer used at all.
3. **Laptop copy and offline drive** (your computer):

   ```bash
   bash deploy/pull-backups.sh --install     # if not already set up: hourly pull of the nightly set
   ```

   Buy a USB drive for the safe and encrypt it (Ubuntu: Disks → format →
   "Password protected volume (LUKS)"). Then, the first working day of each month:

   ```bash
   bash deploy/pull-backups.sh --copy-to /media/$USER/<drive>
   ```

   It must say "verified". Unmount, unplug, back in the safe.

## The calendar from now on

| When | What | Who |
|---|---|---|
| Every 5 minutes | Transaction log shipped (automatic) | — |
| Nightly 02:30 | Backups, lifecycle (automatic); failures emailed | — |
| Hourly | Watchdog (automatic); silence emailed | — |
| Sundays | Vault checksum check (automatic) | — |
| Monthly, first working day | Offline drive copy; `restore.sh test logical` and `test uploads` | Peter Njuguna |
| Quarterly | `restore.sh test pitr` | Peter Njuguna |
| Twice a year | Full rebuild drill on a spare VPS (Disaster Recovery Plan R1) | Peter Njuguna, James Mwando |
| Yearly | Review the Backup and Recovery Policy | Peter Njuguna; approved by the CEO |
