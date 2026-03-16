# Inkwell Project Memory

## Infrastructure

### Fly.io Services (as of 2026-02-24)
- `inkwell-api` — Elixir/Phoenix API, shared-cpu-1x, **512MB RAM** (upgraded from 256MB after OOM crash)
- `inkwell-web` — Next.js frontend, shared-cpu-1x, 256MB RAM
- `inkwell-db` — Fly Postgres (postgres-flex 17.2), shared-cpu-1x, **512MB RAM** (upgraded from 256MB after OOM crash)

**Do NOT create Redis.** The project uses Postgres for everything (auth tokens, sessions, jobs via Oban). An unused `inkwell-redis` (Upstash Pay-as-you-go + ProdPack + 2 regions) was accidentally left running and cost $35/mo before being deleted on 2026-02-24. There is no Redis dependency anywhere in the codebase.

---

## Local Dev Environment (as of 2026-02-24)

### What's Installed
- **Docker Desktop** — installed and working
- **Elixir 1.19.5 + Erlang/OTP 28** — installed via Homebrew (`brew install elixir`)
- **Node.js** — for Next.js frontend

### How to Restart the Dev Server

**Step 1:** Open Docker Desktop (must be running)

**Step 2:** Start services (from project root):
```bash
docker compose up -d
```

**Step 3:** Start Phoenix API (Terminal 1):
```bash
cd /Users/stanton/Documents/Claude/inkwell/apps/api
mix phx.server
```

**Step 4:** Start Next.js (Terminal 2):
```bash
cd /Users/stanton/Documents/Claude/inkwell
npm run dev:web
```

Frontend: http://localhost:3000
API: http://localhost:4000

### Logging In Locally
No email setup needed. Go to `/get-started` or `/login`, enter any email, and a **"Dev mode"** blue box appears with a clickable magic link. Click it to sign in instantly.

### First-Time DB Setup (only after `mix ecto.drop` or fresh machine)
```bash
cd apps/api && mix setup
```
If `mix compile` errors with "Oban.Worker is not loaded":
```bash
mix deps.compile oban --force && mix compile
```
This is a one-time Elixir 1.19 compile ordering issue. Doesn't recur after first successful compile.

### Local DB
Starts empty — no seed data. To see content on Explore/Feed, sign up and publish a public entry.

---

## Key Decisions

- **Local-first workflow**: All changes tested locally before deploying to prod. Do NOT push untested code directly.
- **Docker Compose has no Redis** — removed from docker-compose.yml on 2026-02-24 (nothing uses it)
- **Pool size is 5** — `POOL_SIZE=5` in fly.api.toml. Do not raise to 10; it overwhelmed Postgres on cold starts and contributed to the 2026-02-24 outage.
- **Resilient docker entrypoint** — `apps/api/rel/docker-entrypoint.sh` retries DB connection up to 15 times (5s delay) before running migrations, and never crashes the container if migrations fail. This prevents the restart-loop that caused the 2026-02-24 outage.

---

## Past Incidents

### 2026-02-24 — Production Outage (Postgres OOM + API Restart Loop)
- **Root cause**: Fly Postgres had 256MB RAM and OOM-killed under load. API entrypoint had `set -e`, so migration failures crashed the process → machine restarted → 10 restarts → Fly gave up.
- **Fixes applied**:
  - Upgraded Postgres machine: 256MB → 512MB
  - Rewrote `docker-entrypoint.sh`: removed `set -e`, added 15-retry wait loop, made migrations non-fatal
  - Added `Inkwell.Release.check_db/0` for the wait loop to use
  - Reverted `POOL_SIZE` from 10 → 5
