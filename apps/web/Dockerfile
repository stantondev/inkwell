# ──────────────────────────────────────────────────────────────
# Inkwell Next.js Frontend — Multi-stage Dockerfile
# Produces a minimal production image with standalone output
#
# Build context: project root (not apps/web/)
# Called via: fly deploy --config fly.web.toml
#
# Note: This project uses npm workspaces with the lock file at
# the repo root. We copy both the root and web package files so
# npm can resolve dependencies correctly.
# ──────────────────────────────────────────────────────────────

FROM node:20-slim AS base

# ── Stage 1: Build ────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy root workspace config + lock file, then web package.json
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json

# Install only the web workspace dependencies
RUN npm ci --workspace=apps/web

# Copy web source
COPY apps/web/ ./apps/web/

# API URL is baked into the client bundle at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build Next.js from the web workspace
RUN npm run build --workspace=apps/web

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (requires output: "standalone" in next.config)
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
