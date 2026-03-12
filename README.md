# Inkwell

A federated social journaling platform — LiveJournal meets MySpace, reimagined for 2026 with ActivityPub federation. No algorithms, no ads, user-owned spaces.

**Live instance:** [inkwell.social](https://inkwell.social)

## Features

### Writing & Publishing
- Rich text editor (TipTap) with 17+ extensions — formatting, tables, task lists, image uploads, smart typography
- Drafts, excerpts, cover images, word count & reading time
- Series & collections for organizing entries
- 21 content categories, tags, mood & music metadata
- Distraction-free writing mode
- Post by Email (Plus) — publish by sending to a unique email address
- Cross-posting to Mastodon/fediverse accounts

### Social & Discovery
- Pen Pals (follow/accept) with pending state
- Stamps — 7 postage-stamp-styled reaction types per entry
- Inks — community discovery signal with trending & "Most Inked" sorting
- Threaded comments ("Marginalia") with @mentions
- Guestbooks on profile pages
- Circles — group discussion spaces with a Writer's Salon aesthetic
- Native polling (entry polls & platform-wide community polls)
- Direct messaging ("Letters") with rich text
- User blocking with full visibility enforcement

### Profile Customization (MySpace-style)
- 8 theme presets, 8 fonts, 4 layouts, 3 color pickers
- Background images, banner images, profile music player
- Avatar frames (10 decorative SVG overlays)
- Avatar builder (DiceBear Croodles hand-drawn doodle style)
- Widget ordering, custom CSS, custom HTML (full-page mode with template tags)
- AIM-style status messages, social links, tag cloud
- 3 entry display modes (cards, full post, timeline)

### Federation (ActivityPub)
- Fully interoperable with Mastodon and the fediverse
- Users followable at `@username@inkwell.social`
- Entries federated as `Article` objects (FEP-b2b8)
- Inbound/outbound: follows, comments, inks (boosts), stamps (likes)
- Relay support for bootstrapping fediverse content on Explore
- WebFinger, HTTP Signatures, actor endpoints

### Newsletters
- Double opt-in email subscribers (CAN-SPAM/GDPR compliant)
- Send published entries as emails with one-click unsubscribe
- Scheduled sends (Plus), custom newsletter name & reply-to

### Monetization & Support
- Plus subscription ($5/mo) via Stripe
- Ink Donor voluntary donations ($1/$2/$3/mo)
- Postage — reader-to-writer payments via Stripe Connect (8% commission)
- Writer Subscription Plans — recurring paid content access
- External support links (Ko-fi, BMC, Patreon, etc.)

### Platform
- Community feedback board & roadmap at `/roadmap`
- Content translation (DeepL, 15 languages)
- Sensitive content labeling & reporting system
- Redactions (keyword-based content muting)
- Custom domains (Plus)
- Public API with `ink_`-prefixed API keys
- Full-text search (Meilisearch with Postgres fallback)
- Self-hosting support via Docker Compose

## Architecture

- **Backend**: Elixir/Phoenix 1.8 — OTP release deployed to Fly.io
- **Frontend**: Next.js 16 + React — standalone output deployed to Fly.io
- **Federation**: ActivityPub handled natively in Phoenix (no sidecar)
- **Database**: PostgreSQL 16
- **Search**: Meilisearch (optional, graceful fallback to Postgres ILIKE)
- **Email**: SMTP via `gen_smtp` or Resend API (transactional + newsletters)
- **Background Jobs**: Oban (Postgres-backed)
- **Payments**: Stripe (subscriptions, Connect, donations)

## Project Structure

```
inkwell/
  apps/
    api/          # Elixir/Phoenix backend (mix project)
    web/          # Next.js frontend (npm workspace member)
  services/
    federation/   # Unused — federation is native in Phoenix
  packages/
    types/        # Shared TypeScript types (npm workspace member)
```

npm workspaces monorepo. Lock file lives at root, not in individual apps.

## Getting Started

### Prerequisites

- Elixir 1.19+ / Erlang/OTP 28+ (install via `brew install elixir` on macOS)
- Node.js 20+
- Docker Desktop (for PostgreSQL and Meilisearch)

### First-Time Setup

```bash
# 1. Start Docker services (Postgres + Meilisearch)
docker compose up -d

# 2. Install JS dependencies
npm install

# 3. Install Elixir deps, create DB, run migrations
cd apps/api && mix setup

# 4. Start Phoenix API (Terminal 1)
mix phx.server
# Wait for: Running InkwellWeb.Endpoint at 0.0.0.0:4000

# 5. Start Next.js frontend (Terminal 2, from project root)
npm run dev:web
# Wait for: Ready in ...ms
```

### Development URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Phoenix API | http://localhost:4000 |
| API Health Check | http://localhost:4000/health |
| Meilisearch | http://localhost:7700 |

### Logging In Locally

No email service is needed for local development. The API runs in "dev mode" — after entering any email on the login/signup page, a clickable magic link appears on screen instead of being emailed.

### If `mix compile` Fails

On first compile with Elixir 1.19, you may hit a one-time ordering issue:

```bash
mix deps.compile oban --force
mix compile
```

## Self-Hosting

Inkwell can run on any server with Docker Compose. The self-hosted mode unlocks all Plus features for every user without Stripe.

See **[SELF_HOSTING.md](SELF_HOSTING.md)** for the full guide, including:
- Quick start (5 steps)
- SMTP email configuration (Gmail, Fastmail, Mailgun examples)
- Caddy reverse proxy with automatic HTTPS
- Backup, restore, and upgrade instructions

Pre-built Docker images are published to GitHub Container Registry on every push to `main`:
- `ghcr.io/stantondev/inkwell-api:latest`
- `ghcr.io/stantondev/inkwell-web:latest`

## Deployment (Fly.io)

The hosted instance runs on Fly.io. Deploy commands:

```bash
# API (runs migrations automatically)
fly deploy --config fly.api.toml --wait-timeout 600

# Frontend
fly deploy --config fly.web.toml --wait-timeout 600

# Meilisearch
fly deploy --config fly.search.toml --wait-timeout 600
```

CI/CD via GitHub Actions (`.github/workflows/docker-publish.yml`) builds and pushes Docker images on every push to `main`.

## License

[GNU Affero General Public License v3.0](LICENSE)
