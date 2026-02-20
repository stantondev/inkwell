# Inkwell

A federated social journaling platform — your journal, your friends, your space.

Inkwell combines the rich blogging of LiveJournal with the profile customization of MySpace, reimagined for 2026 with modern tech and open standards. No algorithms. No ads. You own your corner of the internet.

## Architecture

- **Backend**: Elixir + Phoenix 1.8 (real-time, fault-tolerant)
- **Frontend**: Next.js 16 + React (SSR, Tiptap editor)
- **Federation**: Fedify (ActivityPub, interoperable with Mastodon)
- **Database**: PostgreSQL 16+
- **Search**: Meilisearch
- **Cache**: Redis

## Project Structure

```
inkwell/
  apps/
    api/          # Elixir/Phoenix backend
    web/          # Next.js frontend
  services/
    federation/   # Fedify ActivityPub sidecar (Node.js)
  packages/
    types/        # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 20+
- Elixir 1.17+ / Erlang 27+
- Docker (for PostgreSQL, Redis, Meilisearch)

### Setup

```bash
# Start infrastructure
docker compose up -d

# Install JS dependencies
npm install

# Start Phoenix backend
cd apps/api && mix setup && mix phx.server

# Start Next.js frontend (in another terminal)
npm run dev:web

# Start Federation service (in another terminal)
npm run dev:federation
```

### Development URLs

- Frontend: http://localhost:3000
- Phoenix API: http://localhost:4000
- Federation service: http://localhost:4002
- Meilisearch dashboard: http://localhost:7700
