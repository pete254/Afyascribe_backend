# The first hour on a new VPS

How exposed is a fresh server, really, and what to do in what order.

## How much of a hurry are you in?

Less than it feels. A fresh Ubuntu image has exactly one service listening:
SSH. Everything else that could be attacked does not exist yet.

- **If you pasted a public key when ordering**, most providers start the box
  key-only. Guessing a password is then not a route in at all, and the
  realistic risk window is days, not minutes.
- **If you did not**, the provider sets a root password and emails it.
  Password authentication is on, automated guessing starts within the hour,
  and you should harden in your first session.

The genuinely dangerous moment is not provisioning. It is **later, when
Docker starts**: `docker-compose.yml` publishes `5432:5432`, which on a public
IP puts the patient database on the open internet. Fix that before the first
`docker compose up`, not after.

So: do this in your first sitting, unhurried, with two terminals open. Do not
install anything else until it is done.

## Order of operations

### 0. Open two terminals

Log in twice. Keep the second session untouched throughout. If a change goes
wrong, that session is how you get back in without a support ticket.

```
ssh -i ~/.ssh/afyascribe root@<ip>
```

### 1. Run the hardening script

```
scp -i ~/.ssh/afyascribe deploy/harden.sh root@<ip>:/root/
ssh -i ~/.ssh/afyascribe root@<ip> 'bash /root/harden.sh pete'
```

It patches the system, creates a non-root user with your key, sets the
firewall to allow only 22/80/443, installs fail2ban, disables password
authentication and direct root login, and turns on automatic security updates.

It refuses to run if no SSH key is installed, because disabling passwords
without a working key is how people lock themselves out of a machine they
cannot walk up to.

### 2. Prove it before closing anything

From your laptop, in a new terminal:

```
ssh -i ~/.ssh/afyascribe pete@<ip>                       # must succeed
ssh -o PreferredAuthentications=password \
    -o PubkeyAuthentication=no pete@<ip>                 # must be refused
```

The second must say `Permission denied (publickey)`. If it asks for a
password, the configuration did not apply — stop and find out why. Only once
both behave should you close the spare session.

### 3. Then, and only then, the rest

1. DNS: `app.afyascribe.co.ke` → this server's IP (A record).
2. Docker and nginx.
3. **Change the compose file so Postgres binds to `127.0.0.1:5432` or
   publishes no port at all.** The backend reaches it over the Docker network
   and never needs the host port.
4. Let's Encrypt for `app.afyascribe.co.ke`.
5. Backups to a second location — before any real patient data lands here.
   Until that exists, this server is a single point of failure with no
   recovery, which is worse than what Neon was providing.

## What this gives you on paper

These are not only operational hygiene; they are most of what two of the
required DHA documents have to describe:

| Control | Document it answers |
|---|---|
| Key-only SSH, no root login | Access Control Policy |
| Non-root user, sudo with a password | Access Control Policy |
| Default-deny firewall, three ports | Information Security Policy |
| fail2ban, 5 failures per 10 minutes | Information Security Policy |
| Automatic security updates | Information Security Policy |
| Postgres not publicly reachable | System Architecture |

Doing them now means those documents report what is true rather than
describing an intention.

## What this does not fix

Hardening the box does not address the gaps already on the register:

- **Off-site backup** still does not exist, and moving off Neon removes its
  point-in-time restore. This gets *more* urgent, not less.
- **One server is one point of failure.** DHA's System Architecture template
  asks about load balancing, replication and failover; a single VPS answers
  "No" to all of them. That is a defensible trade against Reg 26 compliance,
  but it belongs in the document rather than left for a reviewer to notice.
- **Cloudinary and Groq** still process data outside Kenya until the document
  storage move and the transcription decision are made.
