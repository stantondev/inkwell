# Inkwell — Production Launch Checklist

This document covers everything needed to move Inkwell from its current
`*.fly.dev` deployment to a fully production-ready launch on a custom domain.
Work through these sections in order; each section notes its current status.

---

## Current Production State

The app is **already deployed and running** — not in a dev environment:

| Service | URL | Status |
|---|---|---|
| Frontend | https://inkwell-web.fly.dev | ✅ Live |
| API | https://inkwell-api.fly.dev | ✅ Live |
| Federation sidecar | (not deployed) | ❌ Not deployed |
| Meilisearch / Search | (not deployed) | ❌ Not deployed |

Every `fly deploy` goes directly to production. There is no staging environment.

---

## 1. Custom Domain

**Goal:** Replace `inkwell-web.fly.dev` with `inkwell.social` (or your chosen domain).

### DNS Setup

Point the domain to Fly.io. After purchasing the domain, add these DNS records:

```
# Frontend (e.g. inkwell.social)
CNAME  @          inkwell-web.fly.dev.
# Or use Fly's dedicated IPs (fly ips list --app inkwell-web)
A      @          <fly-ipv4>
AAAA   @          <fly-ipv6>

# API subdomain (e.g. api.inkwell.social)
CNAME  api        inkwell-api.fly.dev.
```

### Fly Certificate Commands

```bash
# Add TLS cert for frontend
fly certs add inkwell.social --app inkwell-web
fly certs add www.inkwell.social --app inkwell-web

# Add TLS cert for API
fly certs add api.inkwell.social --app inkwell-api
```

Fly provisions Let's Encrypt certificates automatically. Run `fly certs check --app inkwell-web` to verify.

### Update Environment Variables

After DNS is live, update the Fly secrets to use the real domain:

```bash
fly secrets set FRONTEND_URL=https://inkwell.social --app inkwell-api
```

In `fly.web.toml`, update the `API_URL` env vars:
```toml
[env]
  API_URL = "https://api.inkwell.social"
  NEXT_PUBLIC_API_URL = "https://api.inkwell.social"
```

Then redeploy web:
```bash
fly deploy --config fly.web.toml --wait-timeout 600
```

### Code References to Update

- `apps/web/src/app/layout.tsx` — `metadataBase: new URL("https://inkwell.social")` ✅ (already set correctly)
- CORS on the API: the `FRONTEND_URL` secret is used by the runtime CORS plug, so updating the secret is sufficient

---

## 2. Stripe: Test Mode → Live Mode

**Goal:** Accept real payments for Inkwell Plus ($5/mo).

### Step 1: Complete Stripe Account Verification

In the Stripe Dashboard (https://dashboard.stripe.com):
- Verify identity
- Add business details
- Add bank account for payouts
- Complete any compliance requirements

This is required before live mode payments are enabled.

### Step 2: Create Live Mode Product & Price

In the Stripe Dashboard, **toggle to Live mode** (top-left switch), then:

1. Go to **Products** → **Add product**
2. Name: "Inkwell Plus"
3. Add a price: $5.00 / month / recurring
4. Copy the **Price ID** (format: `price_live_...`)

### Step 3: Create Live Webhook

In Live mode → **Developers** → **Webhooks** → **Add endpoint**:

- Endpoint URL: `https://inkwell-api.fly.dev/api/billing/webhook`
  (or `https://api.inkwell.social/api/billing/webhook` after custom domain)
- Events to listen for:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `customer.subscription.deleted`
- Copy the **Webhook signing secret** (format: `whsec_live_...`)

### Step 4: Update Fly Secrets (all three at once)

```bash
fly secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_live_... \
  STRIPE_PRICE_ID=price_live_... \
  --app inkwell-api
```

The API restarts automatically. No code changes needed.

### Step 5: Verify End-to-End

Buy a Plus subscription with a real card and confirm:
- Checkout session opens correctly
- Payment completes
- Webhook fires (visible in Stripe Dashboard → Webhooks → Recent deliveries)
- User's `subscription_tier` flips to `"plus"` in the database
- Plus badge appears in the nav

### Relevant Code

- `apps/api/lib/inkwell/billing.ex` — Stripe API calls
- `apps/api/lib/inkwell_web/controllers/billing_controller.ex` — checkout, portal, webhook handler

---

## 3. Email: Resend Domain Verification

**Goal:** Send emails from `hello@inkwell.social` (or similar) instead of `onboarding@resend.dev`.

Currently using Resend's shared test sender. Production emails should come from your domain.

### Steps

1. In the **Resend Dashboard** (https://resend.com/domains):
   - Click **Add Domain**
   - Enter `inkwell.social`
   - Add the DNS records Resend provides (SPF, DKIM, DMARC)

2. Update the "from" address in the API code:

   **File:** `apps/api/lib/inkwell/email.ex`

   Find the `from:` field in the magic link email and change:
   ```elixir
   # Change from:
   from: {"Inkwell", "onboarding@resend.dev"},
   # To:
   from: {"Inkwell", "hello@inkwell.social"},
   ```

3. Redeploy API:
   ```bash
   fly deploy --config fly.api.toml --wait-timeout 600
   ```

4. Test by requesting a magic link and verifying email delivery in the Resend dashboard logs.

---

## 4. Redis (Known Issue — Low Priority)

**Current status:** The Redix connection pool starts but fails with `ConnectionError{reason: :closed}` because Upstash Redis requires TLS that isn't configured. Auth was migrated off Redis to Postgres as a workaround, so the app functions correctly.

**Options:**

**Option A: Remove Redis entirely (recommended for now)**
- Remove Redix from `mix.exs`
- Remove Redis pool from `apps/api/lib/inkwell/application.ex`
- Delete `apps/api/lib/inkwell/redis.ex`
- Remove `REDIS_URL` from Fly secrets if desired

**Option B: Fix the TLS connection**
- Configure Redix with `ssl: true` option
- See: https://hexdocs.pm/redix/Redix.html#start_link/1 (`:ssl` option)
- The `REDIS_URL` secret (`rediss://...` with double-s) already implies TLS

---

## 5. Auth Token Cleanup (Scheduled Job)

**Current status:** Expired auth tokens accumulate in the `auth_tokens` table. The cleanup function exists but is never called.

**Fix:** Add an Oban job to periodically clean up expired tokens.

**File to create:** `apps/api/lib/inkwell/workers/token_cleanup_worker.ex`

```elixir
defmodule Inkwell.Workers.TokenCleanupWorker do
  use Oban.Worker, queue: :default

  alias Inkwell.Auth

  @impl true
  def perform(_job) do
    Auth.cleanup_expired_tokens()
    :ok
  end
end
```

**File to update:** `apps/api/lib/inkwell/application.ex` — add a cron schedule:
```elixir
# In Oban config, add:
cron: [{"0 3 * * *", Inkwell.Workers.TokenCleanupWorker}]  # 3am daily
```

---

## 6. GitHub CI/CD (Optional but Recommended)

**Current status:** `.github/workflows/deploy.yml` exists but the `FLY_API_TOKEN` secret hasn't been set in the GitHub repo.

**To enable automatic deploys on push to main:**

1. Generate a Fly API token:
   ```bash
   fly tokens create deploy -x 999999h
   ```

2. Add it to GitHub:
   - Go to your repo → **Settings** → **Secrets and variables** → **Actions**
   - Add secret: `FLY_API_TOKEN` = (the token from step 1)

After this, every push to `main` will automatically deploy both the API and web app.

---

## 7. Features Not Yet in Production

These features exist in code but are not deployed:

| Feature | Status | Notes |
|---|---|---|
| ActivityPub Federation | Code complete, not deployed | `services/federation/` has no Fly.io config |
| Search (Meilisearch) | Not deployed | Search UI exists but returns no results in prod |

### Deploying Federation (when ready)

The federation service (`services/federation/`) needs:
1. A `fly.federation.toml` Fly config file created
2. A Fly app provisioned: `fly apps create inkwell-federation`
3. Env vars set: API URL, signing keys
4. Deployed: `fly deploy --config fly.federation.toml`

### Deploying Meilisearch (when ready)

Option A: Fly.io volume-based Meilisearch instance
Option B: Meilisearch Cloud (managed, https://cloud.meilisearch.com)

The API already has `MEILISEARCH_URL` and `MEILISEARCH_KEY` config in `runtime.exs` — just set the secrets and the search feature activates.

---

## 8. Pre-Launch Security Review

Quick checklist before opening to the public:

- [ ] Verify CORS only allows `https://inkwell.social` (not `*.fly.dev`) after domain switch
- [ ] Confirm `force_ssl` or HSTS headers are in place (currently removed due to Fly health check conflict — Fly terminates TLS at the edge, so this may be acceptable)
- [ ] Review `ADMIN_USERNAMES` secret — ensure only intended accounts have admin access
- [ ] Rotate `SECRET_KEY_BASE` if it was ever committed to git: `fly secrets set SECRET_KEY_BASE=$(mix phx.gen.secret) --app inkwell-api`
- [ ] Check Resend dashboard — confirm magic link emails are actually being delivered

---

## Deploy Commands Reference

```bash
# API only (runs Ecto migrations automatically on startup)
fly deploy --config fly.api.toml --wait-timeout 600

# Web only
fly deploy --config fly.web.toml --wait-timeout 600

# Check app status
fly status --app inkwell-api
fly status --app inkwell-web

# View logs
fly logs --app inkwell-api
fly logs --app inkwell-web

# Set a secret
fly secrets set KEY=value --app inkwell-api

# List secrets (names only, not values)
fly secrets list --app inkwell-api

# Open a remote console to the API
fly ssh console --app inkwell-api
# Then: /app/bin/inkwell remote  (to open IEx shell)
```

---

## Architecture Summary (for onboarding new developers)

```
Browser
  │
  ▼
Next.js (inkwell-web.fly.dev)          — Server-rendered React, handles auth cookies
  │  apiFetch() with Bearer token
  ▼
Phoenix API (inkwell-api.fly.dev)       — Elixir/Phoenix, JSON API
  │
  ├── PostgreSQL (Fly Postgres)         — Primary database (UUID PKs throughout)
  ├── Stripe                            — Billing / Plus subscriptions
  ├── Resend                            — Transactional email (magic links)
  └── Upstash Redis                     — Currently unused (TLS issue, auth moved to Postgres)

services/federation/  (NOT deployed)   — Fedify ActivityPub sidecar (Node.js)
```

**Auth flow:** Magic link email → token in `auth_tokens` table → httpOnly cookie on Next.js → Bearer token on API requests.

**Key environment variables:**

| Secret | App | Description |
|---|---|---|
| `DATABASE_URL` | inkwell-api | Postgres connection string |
| `SECRET_KEY_BASE` | inkwell-api | Phoenix signing key |
| `FRONTEND_URL` | inkwell-api | Allowed CORS origin |
| `RESEND_API_KEY` | inkwell-api | Email sending |
| `ADMIN_USERNAMES` | inkwell-api | Comma-separated admin usernames |
| `STRIPE_SECRET_KEY` | inkwell-api | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | inkwell-api | Stripe webhook signing |
| `STRIPE_PRICE_ID` | inkwell-api | Stripe price ID for Plus ($5/mo) |
| `API_URL` | inkwell-web | Backend URL (set in fly.web.toml) |
| `NEXT_PUBLIC_API_URL` | inkwell-web | Public backend URL (build arg) |
