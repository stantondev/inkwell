# Self-Hosting Inkwell

Run your own Inkwell: a social journal for you, your family, a class, a club or a community, on your own server and your own domain. It federates like inkwell.social does, so your members can be followed from Mastodon and the rest of the fediverse as `@name@yourdomain`.

On a self-hosted server every feature is on for everyone. There's nothing to pay for and no billing to set up.

> **Beta.** Self-hosting was rebuilt in September 2026 (before that, a server on any real domain didn't work). Tell us how it goes: [github.com/stantondev/inkwell/issues](https://github.com/stantondev/inkwell/issues).

## What you need

- A Linux server with Docker and Docker Compose v2. **1 GB of RAM** is enough for a small server (the whole stack uses about 500 MB at rest); 2 GB is comfortable.
- **An x86-64 (amd64) server.** The published images aren't built for ARM yet (Raspberry Pi, Oracle's free ARM tier, Hetzner's ARM plans). On ARM, build from source (see below).
- A domain name pointing at the server, with ports 80 and 443 open.
- An email account that can send mail by SMTP (Fastmail, Gmail, Mailgun, Postmark, your own server…). Inkwell signs people in with emailed links. You can start without it and add it later.

## Choose your domain first

Your domain becomes part of every member's fediverse address (`@name@journal.example.org`). Other servers remember it, so **it can't be changed once people have signed up and been followed.** Pick the one you'll keep. A subdomain (`journal.example.org`) is fine.

## Install

```bash
# 1. Get the files
git clone https://github.com/stantondev/inkwell.git
cd inkwell

# 2. Settings
cp .env.example .env
openssl rand -base64 64        # copy the output into SECRET_KEY_BASE
```

Open `.env` and fill in the three required settings:

```env
DOMAIN=journal.example.org
ADMIN_EMAIL=you@example.org
SECRET_KEY_BASE=<the output of openssl>
```

Optionally name your server (`INSTANCE_NAME=Our Journal`; it defaults to the domain) and fill in the email settings (next section).

```bash
# 3. Point DNS at the server: an A (and AAAA) record for DOMAIN

# 4. Start it
docker compose -f docker-compose.selfhosted.yml up -d
```

Caddy fetches an HTTPS certificate on its own. Give it a minute, then visit `https://journal.example.org` and sign up **with your ADMIN_EMAIL address**. That account is the admin from its first sign-in (the Admin link is in the sidebar's account menu).

### Trying it on your own computer

Set `DOMAIN=localhost` and start as above, then open `https://localhost`. Caddy uses its own certificate for localhost, so your browser will warn once; that's expected. Fediverse features need a real public domain.

## Email

Inkwell sends sign-in links, notifications and newsletters by email.

**Until email is set up, nothing is sent.** Sign-in links are written to the API's log instead, so you can still get in:

```bash
docker compose -f docker-compose.selfhosted.yml logs api | grep "magic link"
```

(They're never shown on the page: on a public server that would let anyone sign in as anyone.) That's fine for trying Inkwell out; set up email before inviting people.

### SMTP

```env
SMTP_HOST=smtp.fastmail.com
SMTP_PORT=587
SMTP_USERNAME=you@example.org
SMTP_PASSWORD=an-app-password
FROM_EMAIL=Our Journal <you@example.org>
```

`FROM_EMAIL` must be an address your provider lets you send as; it defaults to `noreply@DOMAIN`, which only works if your provider sends for that domain. Use port 587 with `SMTP_SSL=false` (STARTTLS), or port 465 with `SMTP_SSL=true`. For a relay that needs no login (a local Postfix), set `SMTP_AUTH=false`.

Common providers:

| Provider | SMTP_HOST | Notes |
|---|---|---|
| Fastmail | `smtp.fastmail.com` | Use an app password |
| Gmail / Google Workspace | `smtp.gmail.com` | Use an [app password](https://myaccount.google.com/apppasswords); Gmail limits daily sending |
| Mailgun | `smtp.mailgun.org` | Username `postmaster@mg.yourdomain` |
| Postmark | `smtp.postmarkapp.com` | Username and password are your server token |

### Resend

Instead of SMTP you can set `RESEND_API_KEY`. If both are set, SMTP is used.

After changing `.env`, apply it with:

```bash
docker compose -f docker-compose.selfhosted.yml up -d
```

## Your Terms and Privacy Policy

Your server needs its own. You run it, so they're between you and your members; inkwell.social's name inkwell.social as the operator and don't apply to you. Until you add them, `/terms` and `/privacy` say they haven't been published and give your contact address.

Put them in the `legal/` folder as Markdown (`legal/terms.md`, `legal/privacy.md`), or set `TERMS_URL` / `PRIVACY_URL` in `.env` to link to where they live. See `legal/README.md`.

Members' questions, reports and appeals go to `ADMIN_EMAIL` (or `CONTACT_EMAIL` if you set it). Nothing from your server is sent to inkwell.social.

## What's different from inkwell.social

- **No payments.** Plus, Founding Members, Ink Donor, trials, pricing and the transparency page are all gone; everyone has every feature.
- **Pages about inkwell.social itself** (its transparency figures, "For Writers", "Switch to Inkwell") aren't served. `/about` describes your server.
- **Not available:**
  - **Custom domains for members.** They need inkwell.social's certificate service.
  - **Post by Email**, unless you set up a [Postmark inbound server](https://postmarkapp.com/inbound-email) yourself. Set `POSTMARK_INBOUND_TOKEN` and `POST_EMAIL_DOMAIN`, point the inbound webhook at `https://DOMAIN/api/email/inbound?token=<token>`, and add an MX record for `POST_EMAIL_DOMAIN`.
  - **The public developer API.** It isn't published by default (the API runs inside Docker). To publish it, give the API its own address in your proxy and set `PUBLIC_API_URL` on the web container so `/developers` shows it.
- **Images are stored in PostgreSQL.** That's fine for small servers; back it up (below).

## Optional features

| Feature | Settings in `.env` |
|---|---|
| Full-text search | Start with `--profile search`, set `MEILI_MASTER_KEY` (long random string) and `MEILI_URL=http://meilisearch:7700`. Without it, search still works (slower). |
| Browser push notifications | `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Generate a pair: `docker compose -f docker-compose.selfhosted.yml exec api bin/inkwell eval 'IO.inspect(WebPushEncryption.generate_vapid_key())'` |
| Translation | `DEEPL_API_KEY` (DeepL's free tier allows 500K characters a month) |
| Admin notices in Slack | `SLACK_WEBHOOK_URL` |

## Using your own reverse proxy

If you already run Nginx, Traefik or similar, remove the `caddy` service, uncomment the `ports:` lines on the `web` service, and proxy `https://DOMAIN` to `localhost:3000`. **Keep the Host header** and send `X-Forwarded-Proto`: fediverse signatures and sign-in depend on them.

```nginx
server {
    listen 443 ssl;
    server_name journal.example.org;

    ssl_certificate     /etc/letsencrypt/live/journal.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/journal.example.org/privkey.pem;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backups

Everything, including images, is in the database:

```bash
# Back up
docker compose -f docker-compose.selfhosted.yml exec -T db \
  pg_dump -U inkwell inkwell | gzip > inkwell-$(date +%Y%m%d).sql.gz

# Restore into a fresh install (before anyone signs up)
gunzip -c inkwell-20260928.sql.gz | docker compose -f docker-compose.selfhosted.yml exec -T db psql -U inkwell inkwell
```

Keep your `.env` too: `SECRET_KEY_BASE` must stay the same, or everyone is signed out.

## Upgrading

```bash
git pull
docker compose -f docker-compose.selfhosted.yml pull
docker compose -f docker-compose.selfhosted.yml up -d
```

Database changes run automatically when the API starts. Every image published as `latest` has first been started with this exact setup and checked by an automated test ([`scripts/selfhost-smoke.sh`](scripts/selfhost-smoke.sh)). To stay on a particular build, set `INKWELL_VERSION` in `.env` to the full commit id of a push to `main`; every one is published under that tag.

## Building from source

For ARM servers, or to run your own changes: in `docker-compose.selfhosted.yml`, comment out the `image:` lines of `api` and `web` and uncomment their `build:` blocks, then:

```bash
docker compose -f docker-compose.selfhosted.yml up -d --build
```

Building needs about 4 GB of RAM (the web app's build is the heavy part).

## Troubleshooting

- **Nothing loads / certificate errors:** check that DNS for `DOMAIN` points at this server and ports 80 and 443 are open, then look at `docker compose -f docker-compose.selfhosted.yml logs caddy`.
- **"We couldn't send your sign-in email":** your SMTP settings are wrong. `docker compose -f docker-compose.selfhosted.yml logs api | grep SMTP` shows the error.
- **Not admin after signing in:** you must sign in with exactly the `ADMIN_EMAIL` address. More admins: `ADMIN_EMAIL=you@example.org,friend@example.org`, then `up -d`.
- **The API won't start:** `docker compose -f docker-compose.selfhosted.yml logs api`. A missing setting is named in the error.

## Branding

Inkwell is open source (AGPL-3.0); the name and logo are trademarks. Running it unchanged under your own server name is fine. If you substantially modify the software, please give your version a different name. See the [Brand Policy](https://inkwell.social/brand).
