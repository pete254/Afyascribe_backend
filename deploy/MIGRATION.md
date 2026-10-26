# Moving AfyaScribe to the Kenyan VPS

From Render (API), Vercel (web app) and Neon (database, USA) to one server in
Kenya, so that patient data is processed and held in Kenya as regulation 26 of
the Data Protection (General) Regulations, 2021 requires.

| | Before | After |
|---|---|---|
| Web app | Vercel | nginx on the VPS — `https://app.afyascribe.co.ke` |
| API | Render | Docker on the VPS — `https://api.afyascribe.co.ke` |
| Database | Neon, AWS us-east-1 | Postgres in Docker on the VPS, not reachable from outside |

The order is built so that nothing goes dark: everything is built and
rehearsed on the VPS while Render, Vercel and Neon keep serving, and the
switch is one short maintenance window.

---

## Part 1 — Build (no downtime)

**Done already:** `harden.sh` (see [FIRST-HOUR.md](FIRST-HOUR.md)); DNS A
records for `app` and `api` → `102.68.87.161`.

**1. Get the code onto the server** (as `pete`):

```
sudo install -d -o pete -g pete /opt/afyascribe
git clone https://github.com/pete254/Afyascribe_backend.git /opt/afyascribe/backend
cd /opt/afyascribe/backend
```

**2. Install Docker, nginx and the certificate:**

```
sudo CERTBOT_EMAIL=you@example.com bash deploy/setup-server.sh
```

Afterwards `https://app.afyascribe.co.ke` shows a placeholder and
`https://api.afyascribe.co.ke` answers 502 — both correct at this point.

**3. Settings:**

```
cp deploy/env.production.example .env && chmod 600 .env
nano .env
```

Fill every blank. Copy the third-party keys and endpoints from Render's
Environment tab; generate new `DB_PASSWORD` and `JWT_SECRET` as the file says.

**4. Rehearse the data copy** (Render keeps running; this copy is thrown away):

```
sudo docker compose up -d postgres
sudo bash deploy/migrate-from-neon.sh
```

It asks for the Neon connection string (Render → Environment). It refuses if
the API is running, if Neon is a newer Postgres than the server, or if the
target already has data. It ends by comparing exact row counts table by table.
On a rehearsal, small differences from rows written during the copy are
expected.

**5. Start the API and test against the rehearsal copy:**

```
sudo docker compose up -d --build
sudo docker compose logs -f backend    # Ctrl-C to stop watching
curl -s https://api.afyascribe.co.ke/ | head -c 200
```

**6. Publish the web app** — from the laptop, in the AfyaHIMS checkout:

```
bash deploy/web-release.sh
```

**7. Test on `https://app.afyascribe.co.ke`:** sign in (the daily code
arrives by email), open patients, a consultation, a lab result, a bill; upload
a document; dictate a note; run a report; **verify the audit ledger** (People →
Audit log → Verify the ledger). Anything you do here is on the rehearsal copy
and will be overwritten at cutover — but tell no one to use it yet.

**8. Backups — the warm standby (owner's decision, 20 Oct 2026):**

The previous hosting becomes the backup: every night from cutover, the server's
database is copied in full to Neon (Render kept suspended beside it), ready to
be served if this server is lost. See `deploy/standby-sync.sh` and the Disaster
Recovery Plan, 2.3.

```
sudo bash deploy/backup.sh --install
sudo nano /etc/afyascribe/backup.env      # STANDBY_URL='postgresql://…?sslmode=require&channel_binding=require'
sudo bash deploy/standby-sync.sh --check   # before cutover it must REFUSE: Neon is still production
```

Use Neon's connection string with pooling **off**. Done and checked 20 Oct 2026:
the check refused, reporting the ledgers diverged at line 4862 — correct, since
Neon is production until cutover.

Optional but recommended — **encrypted copies on this server (14 days)**, because
the standby is overwritten nightly and Neon's free plan keeps only hours of
history. On any machine with `age`: `age-keygen -o key.txt`; put the private
key in the company password manager (never on this server); put the public
`age1…` line in `AGE_RECIPIENT` in `backup.env`; then `sudo bash deploy/backup.sh`.
Test with `sudo bash deploy/restore-test.sh` (it asks for the private key).

(`deploy/pull-backups.sh` — pulling the encrypted copies to a second machine in
Kenya — remains available if that is wanted later.)

---

## Part 2 — Cutover (maintenance window, about 30 minutes)

Tell facilities the time in advance; staff should fall back to paper for the
window.

1. **Stop writes to Neon:** in Render, suspend the service. From here nothing
   changes in Neon.
2. **Final copy:**

   ```
   cd /opt/afyascribe/backend
   sudo docker compose stop backend
   REPLACE=1 sudo -E bash deploy/migrate-from-neon.sh
   ```

   This time the row counts **must** match exactly.
3. **Start the API:** `sudo docker compose up -d`
4. **Verify the audit ledger** on `https://app.afyascribe.co.ke`. The hash
   chain must verify — that proves no record changed in transit.
4a. **Start the standby:** `sudo bash deploy/standby-sync.sh` — the first sync
   copies the server to Neon. It must report every table matching. **Leave
   Render suspended** from now on: the standby check cannot see an idle Render.
5. **Point the clients at the new addresses:**
   - Web: in AfyaHIMS, set `apps/web/.env.production` to
     `VITE_API_URL=https://api.afyascribe.co.ke`, commit.
   - Mobile: in Afyascribe, switch `DEFAULT_API_URL` in `src/config/api.js`,
     build and publish.
   - **Vercel stays the standby front end:** in the Vercel project's settings set
     `VITE_API_URL=https://afyascribe-backend.onrender.com` and redeploy once, so
     it keeps pointing at Render after the code switches.
6. **Tell staff the new address:** `https://app.afyascribe.co.ke`. The Vercel
   address becomes the standby — not to be used unless a failover is declared.
7. **Re-print self-registration QR posters** — they encode the address of the
   site that printed them, so posters printed from Vercel point at Vercel.
8. **HIE:** if DHA registered a callback address on Render, give them the new
   one.

## Part 3 — The old hosting becomes the standby (after a few days running cleanly)

The owner decided (20 Oct 2026) to keep Neon, Render and Vercel as the warm
standby rather than delete them.

1. Confirm the nightly standby sync succeeds: `sudo tail /var/log/afyascribe-backup.log`.
2. Render stays **suspended**; Vercel stays pointed at Render. Neither is used
   unless a failover is declared (Disaster Recovery Plan).
3. `sudo shred -u /var/backups/afyascribe/neon-*.dump` — the migration dumps.
4. Run a **failover drill** once: resume Render, sign in on the Vercel address,
   create and read a test record, then fail back (Backup & Recovery Policy 4.2).
5. Update the Privacy Policy (the post-cutover table), DPIA and Information
   Security Policy: processing is in Kenya (E-1 closes); the standby in the USA
   is recorded as E-15.

## Day to day

| Task | Command |
|---|---|
| Deploy a backend change | `cd /opt/afyascribe/backend && git pull && sudo docker compose up -d --build` |
| Deploy a web change | laptop: `bash deploy/web-release.sh` |
| Roll back the web app | laptop: `bash deploy/web-release.sh --rollback` |
| API logs | `sudo docker compose logs --tail 200 backend` |
| Backup log | `sudo tail /var/log/afyascribe-backup.log` |
| Off-site copy status | laptop: `bash deploy/pull-backups.sh --status` |
| Restore test (quarterly) | `sudo bash deploy/restore-test.sh` |
| Certificate status | `sudo certbot certificates` |

## What stays outside Kenya after this

Moving hosting does not move these; each is an open exception in the
Information Security Policy:

- **Groq** — dictation transcription and proofreading (E-8).
- **Resend** — email, including consultation summaries (E-8).
- **Google Gemini** — the mobile app sends clinical text to it directly (E-11).
