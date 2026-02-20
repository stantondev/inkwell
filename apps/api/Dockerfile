# ──────────────────────────────────────────────────────────────
# Inkwell Phoenix API — Multi-stage Dockerfile
# Produces a minimal OTP release image (~60MB)
#
# Build context: project root (not apps/api/)
# Called via: fly deploy --config fly.api.toml
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────
ARG ELIXIR_VERSION=1.18.4
ARG OTP_VERSION=27.3.4
ARG DEBIAN_VERSION=bookworm-20250428-slim
ARG BUILDER_IMAGE="hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-debian-${DEBIAN_VERSION}"
ARG RUNNER_IMAGE="debian:${DEBIAN_VERSION}"

FROM ${BUILDER_IMAGE} AS builder

RUN apt-get update -y && \
    apt-get install -y build-essential git && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV MIX_ENV="prod"

# Install hex + rebar (build tools)
RUN mix local.hex --force && \
    mix local.rebar --force

# Copy only dependency files first for better caching
# (build context is project root, so paths are apps/api/...)
COPY apps/api/mix.exs apps/api/mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config

# Copy compile-time config files
COPY apps/api/config/config.exs apps/api/config/prod.exs config/
RUN mix deps.compile

# Copy application source
COPY apps/api/lib lib
COPY apps/api/priv priv

# Compile the application
RUN mix compile

# Copy runtime config (needed in release)
COPY apps/api/config/runtime.exs config/

# Build the OTP release
COPY apps/api/rel rel
RUN mix release

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM ${RUNNER_IMAGE}

RUN apt-get update -y && \
    apt-get install -y libstdc++6 openssl libncurses5 locales ca-certificates curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set locale
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

WORKDIR /app
RUN chown nobody /app

# Copy the release from builder
COPY --from=builder --chown=nobody:root /app/_build/prod/rel/inkwell ./

# Copy the migration runner entrypoint
COPY --chown=nobody:root apps/api/rel/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nobody

ENV HOME=/app
ENV PORT=4000

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bin/inkwell", "start"]
