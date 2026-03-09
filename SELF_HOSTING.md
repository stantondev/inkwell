# Self-Hosting Inkwell

> **Alpha** — Self-hosting support is new. Please report issues at [github.com/stantondev/inkwell/issues](https://github.com/stantondev/inkwell/issues).

## Overview

Inkwell can run on your own server with Docker Compose. Self-hosted instances get all Plus features unlocked automatically — no Stripe subscription required.

Self-hosted instances participate in the fediverse via ActivityPub. Your users get `@username@yourdomain.com` identities and can interact with Mastodon, Misskey, and other fediverse platforms.

## Prerequisites

- Docker and Docker Compose v2
- A domain name with DNS pointing to your server (for HTTPS and federation)
- SMTP access (Gmail, Fastmail, Mailgun, Postfix, etc.)
- 1 GB RAM minimum, 2 GB recommended
- Ports 80 and 443 open

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/stantondev/inkwell.git
cd inkwell

# 2. Copy and edit environment variables
cp .env.example .env

# 3. Generate a secret key and paste it as SECRET_KEY_BASE in .env
openssl rand -base64 64

# 4. Edit .env — set your domain and email config:
#    DOMAIN=inkwell.example.com
#    API_HOST=api.inkwell.example.com
#    FRONTEND_URL=https://inkwell.example.com
#    API_URL=https://api.inkwell.example.com
#    SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, FROM_EMAIL

# 5. Point DNS to your server
#    A record: inkwell.example.com → your server IP
#    A record: api.inkwell.example.com → your server IP

# 6. Start everything
docker compose -f docker-compose.selfhosted.yml up -d
```

That's it. Caddy automatically provisions HTTPS certificates via Let's Encrypt. Give it a minute for certs, then visit `https://yourdomain.com`.

Create your first account, then add your username to `ADMIN_USERNAMES` in `.env` and restart:

```bash
docker compose -f docker-compose.selfhosted.yml restart api
```

## How It Works

The Docker Compose stack includes 4 services:

| Service | What it does |
|---------|-------------|
| **db** | PostgreSQL 16 — stores everything |
| **api** | Elixir/Phoenix backend — handles auth, federation, email |
| **web** | Next.js frontend — serves the UI |
| **caddy** | Reverse proxy — automatic HTTPS via Let's Encrypt |

Pre-built Docker images are pulled from GitHub Container Registry (`ghcr.io/stantondev/inkwell-api` and `ghcr.io/stantondev/inkwell-web`). No compilation needed.

To build from source instead, edit `docker-compose.selfhosted.yml` — comment out the `image:` lines and uncomment the `build:` blocks.

## Email Configuration

Inkwell needs email for magic link authentication. Without email configured, it falls back to "dev mode" where magic links are shown on screen (fine for testing, not for production).

### SMTP (Recommended)

Set these in your `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-username
SMTP_PASSWORD=your-password
FROM_EMAIL=Inkwell <noreply@yourdomain.com>
```

#### Common Provider Examples

**Gmail / Google Workspace**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=your-app-password
```
Use an [App Password](https://myaccount.google.com/apppasswords), not your regular password.

**Fastmail**
```env
SMTP_HOST=smtp.fastmail.com
SMTP_PORT=587
SMTP_USERNAME=you@fastmail.com
SMTP_PASSWORD=your-app-password
```

**Mailgun**
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USERNAME=postmaster@mg.yourdomain.com
SMTP_PASSWORD=your-mailgun-password
```

**Local Postfix (no auth)**
```env
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_AUTH=false
```

### Resend API (Alternative)

If you prefer Resend over SMTP:

```env
RESEND_API_KEY=re_your_api_key
FROM_EMAIL=Inkwell <noreply@yourdomain.com>
```

If both SMTP and Resend are configured, SMTP takes priority.

## Federation

Self-hosted instances federate automatically via ActivityPub. Users get `@username@yourdomain.com` identities.

Requirements for federation:
- HTTPS (required by ActivityPub spec — Caddy handles this automatically)
- A public domain name
- Port 443 accessible from the internet

Set your domain in `.env`:

```env
DOMAIN=inkwell.example.com
FRONTEND_URL=https://inkwell.example.com
API_URL=https://api.inkwell.example.com
API_HOST=api.inkwell.example.com
```

## Using Your Own Reverse Proxy

Caddy is included by default for automatic HTTPS. If you already run Nginx, Traefik, or another reverse proxy:

1. Edit `docker-compose.selfhosted.yml`:
   - Remove or comment out the `caddy` service
   - Uncomment the `ports:` lines on `api` and `web` services
2. Point your proxy at `localhost:4000` (API) and `localhost:3000` (web)

### Nginx Example

```nginx
server {
    listen 443 ssl;
    server_name inkwell.example.com;

    ssl_certificate /etc/letsencrypt/live/inkwell.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/inkwell.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name api.inkwell.example.com;

    ssl_certificate /etc/letsencrypt/live/api.inkwell.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.inkwell.example.com/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Billing & Plus Features

With `INKWELL_SELF_HOSTED=true` (the default in `docker-compose.selfhosted.yml`), all Plus features are unlocked for every user. No Stripe keys are needed.

If you want to run your own paid instance with Stripe billing, set `INKWELL_SELF_HOSTED` to `false` in the compose file and configure your Stripe keys in `.env`.

## Admin Setup

1. Create an account through the web interface
2. Add your username to `ADMIN_USERNAMES` in `.env`
3. Restart the API: `docker compose -f docker-compose.selfhosted.yml restart api`
4. You'll see the Admin link in the sidebar

## Search (Optional)

Full-text search requires Meilisearch. To enable it:

```bash
# Start with the search profile
docker compose -f docker-compose.selfhosted.yml --profile search up -d
```

Set in `.env`:
```env
MEILI_MASTER_KEY=a-secure-key
MEILI_URL=http://meilisearch:7700
```

Without Meilisearch, search falls back to PostgreSQL ILIKE (functional but slower).

## Backups

### Database

```bash
# Dump the database
docker compose -f docker-compose.selfhosted.yml exec db \
  pg_dump -U inkwell inkwell > backup_$(date +%Y%m%d).sql

# Restore from backup
docker compose -f docker-compose.selfhosted.yml exec -T db \
  psql -U inkwell inkwell < backup_20260315.sql
```

### Volumes

```bash
# Back up all Docker volumes
docker run --rm \
  -v inkwell_pgdata:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/pgdata_backup.tar.gz -C /data .
```

## Upgrading

```bash
docker compose -f docker-compose.selfhosted.yml pull
docker compose -f docker-compose.selfhosted.yml up -d
```

Database migrations run automatically on API container startup.

To build from source instead of pulling images:
```bash
git pull
docker compose -f docker-compose.selfhosted.yml up -d --build
```

## Known Limitations

- **Custom domains** feature requires Fly.io Certificates API and won't work on self-hosted instances
- **Postage/tipping** requires Stripe Connect and needs additional configuration
- **Post by Email** requires Postmark for inbound email processing
- **Images stored in PostgreSQL** — works well for small instances; S3-compatible storage planned for a future release

## Branding

Inkwell is open source, but the name and logo are trademarked. If you substantially modify the software (not just configuration), please rename your fork to avoid confusion. See the [Brand Policy](/brand) for details.
