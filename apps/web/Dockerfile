# ──────────────────────────────────────────────────────────────
# Inkwell Next.js Frontend — Multi-stage Dockerfile
# Produces a minimal production image with standalone output
#
# Build context: project root (not apps/web/)
# Called via: fly deploy --config fly.web.toml
# ──────────────────────────────────────────────────────────────

FROM node:20-slim AS base

# ── Stage 1: Install dependencies ─────────────────────────────
FROM base AS deps
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm install

# ── Stage 2: Build ────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm install

COPY apps/web/ .

# API URL is baked into the client bundle at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# ── Stage 3: Runtime ─────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (requires output: "standalone" in next.config)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
