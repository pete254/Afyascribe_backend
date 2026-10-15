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

**8. Backups — before any real data lands:**

On your laptop, make the backup key and keep the private half off the server:

```
sudo apt install age
age-keygen -o ~/afyascribe-backup.key     # prints the public key: age1…
```

Store `~/afyascribe-backup.key` somewhere safe and offline as well; without it
no backup can ever be read. On the server:

```
sudo bash deploy/backup.sh --install
sudo nano /etc/afyascribe/backup.env      # AGE_RECIPIENT=age1…  RCLONE_REMOTE=…
sudo rclone config                         # the off-site destination
sudo bash deploy/backup.sh                 # must succeed, and copy off-site
```

Then **test a restore** — a backup that has never been restored is not yet
evidence that it works. That test is also what the DHA Disaster Recovery Test
Report needs.

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
5. **Point the clients at the new addresses:**
   - Web: in AfyaHIMS, set `apps/web/.env.production` to
     `VITE_API_URL=https://api.afyascribe.co.ke`, commit.
   - Mobile: in Afyascribe, switch `DEFAULT_API_URL` in `src/config/api.js`,
     build and publish.
6. **Tell staff the new address:** `https://app.afyascribe.co.ke`. Bookmarks
   to the Vercel address stop being useful once Vercel is retired.
7. **Re-print self-registration QR posters** — they encode the address of the
   site that printed them, so posters printed from Vercel point at Vercel.
8. **HIE:** if DHA registered a callback address on Render, give them the new
   one.

## Part 3 — Retire the old hosting (only after a few days running cleanly)

1. Take and keep one final encrypted backup.
2. **Delete the Neon project.** Until this is done a copy of every patient
   record is still in the USA, and regulation 26 is not yet met.
3. Delete the Render service and the Vercel projects.
4. `sudo shred -u /var/backups/afyascribe/neon-*.dump` — the migration dumps.
5. Update the Privacy Policy, DPIA and Information Security Policy: hosting is
   now in Kenya (exception E-1 closes; E-2 closes once the restore test passes).

## Day to day

| Task | Command |
|---|---|
| Deploy a backend change | `cd /opt/afyascribe/backend && git pull && sudo docker compose up -d --build` |
| Deploy a web change | laptop: `bash deploy/web-release.sh` |
| Roll back the web app | laptop: `bash deploy/web-release.sh --rollback` |
| API logs | `sudo docker compose logs --tail 200 backend` |
| Backup log | `sudo tail /var/log/afyascribe-backup.log` |
| Certificate status | `sudo certbot certificates` |

## What stays outside Kenya after this

Moving hosting does not move these; each is an open exception in the
Information Security Policy:

- **Cloudinary** — uploaded documents and logos (E-6).
- **Groq** — dictation transcription and proofreading (E-8).
- **Resend** — email, including consultation summaries (E-8).
- **Google Gemini** — the mobile app sends clinical text to it directly (E-11).
