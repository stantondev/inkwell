#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Inkwell Deploy Script
# Deploys the Phoenix API and Next.js frontend to Fly.io
#
# Prerequisites:
#   1. Install Fly CLI: curl -L https://fly.io/install.sh | sh
#   2. Sign up / log in: fly auth login
#
# Usage:
#   ./deploy.sh          Full first-time deployment
#   ./deploy.sh api      Deploy only the API
#   ./deploy.sh web      Deploy only the frontend
#   ./deploy.sh status   Check deployment status
#   ./deploy.sh pause    Pause Sentinel alerts (default 10 min)
#   ./deploy.sh unpause  Resume Sentinel alerts immediately
#
# The `api`, `web`, and `deploy` subcommands automatically pause Sentinel
# for the deploy window and unpause on completion (or interrupt). Set
# SENTINEL_DISABLE=1 to skip.
# ──────────────────────────────────────────────────────────────

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${YELLOW}…${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}$1${NC}\n"; }

# ── Sentinel Maintenance Mode ────────────────────────────────
# Pauses Sentinel incident creation / alerts for the duration of a deploy.
# Writes a maintenance.json file to the Sentinel repo's gh-pages branch.
# Sentinel's workflow reads this file and skips alerting when paused_until
# is in the future. The file auto-expires, so a dropped unpause just
# means alerts return in SENTINEL_PAUSE_MIN minutes naturally.
#
# Override via env: SENTINEL_REPO (default stantondev/sentinel),
# SENTINEL_PAUSE_MIN (default 10), SENTINEL_DISABLE=1 to skip.

SENTINEL_REPO="${SENTINEL_REPO:-stantondev/sentinel}"
SENTINEL_PAUSE_MIN="${SENTINEL_PAUSE_MIN:-10}"

sentinel_pause() {
  [ "${SENTINEL_DISABLE:-0}" = "1" ] && return 0
  if ! command -v gh &>/dev/null; then
    info "gh CLI not found — skipping Sentinel pause (alerts may fire during deploy)"
    return 0
  fi

  local until
  if date -u -v +"${SENTINEL_PAUSE_MIN}"M +"%Y-%m-%dT%H:%M:%SZ" &>/dev/null; then
    until=$(date -u -v +"${SENTINEL_PAUSE_MIN}"M +"%Y-%m-%dT%H:%M:%SZ")  # BSD/macOS
  else
    until=$(date -u -d "+${SENTINEL_PAUSE_MIN} minutes" +"%Y-%m-%dT%H:%M:%SZ")  # GNU/Linux
  fi

  info "Pausing Sentinel until ${until} (${SENTINEL_PAUSE_MIN}m)"
  local content
  content=$(printf '{"paused_until":"%s","reason":"Inkwell deploy","set_by":"deploy.sh"}\n' "$until" | base64)

  local sha
  sha=$(gh api "/repos/${SENTINEL_REPO}/contents/maintenance.json?ref=gh-pages" --jq '.sha' 2>/dev/null || echo "")

  local args=(
    --method PUT "/repos/${SENTINEL_REPO}/contents/maintenance.json"
    -f "message=Pause for Inkwell deploy"
    -f "branch=gh-pages"
    -f "content=${content}"
  )
  [ -n "$sha" ] && args+=(-f "sha=${sha}")

  if gh api "${args[@]}" >/dev/null 2>&1; then
    ok "Sentinel paused"
  else
    info "Sentinel pause failed — alerts may fire; proceeding anyway"
  fi
}

sentinel_unpause() {
  [ "${SENTINEL_DISABLE:-0}" = "1" ] && return 0
  if ! command -v gh &>/dev/null; then
    return 0
  fi

  local sha
  sha=$(gh api "/repos/${SENTINEL_REPO}/contents/maintenance.json?ref=gh-pages" --jq '.sha' 2>/dev/null || echo "")
  if [ -z "$sha" ]; then
    return 0  # already unpaused or never paused
  fi

  if gh api --method DELETE "/repos/${SENTINEL_REPO}/contents/maintenance.json" \
       -f "message=Deploy complete — unpause Sentinel" \
       -f "branch=gh-pages" \
       -f "sha=${sha}" >/dev/null 2>&1; then
    ok "Sentinel unpaused"
  else
    info "Sentinel unpause failed — will auto-expire in ${SENTINEL_PAUSE_MIN}m"
  fi
}

# Wrap a deploy function so Sentinel is paused before and unpaused after
# (even on failure or interrupt).
with_sentinel_pause() {
  local fn="$1"
  sentinel_pause
  # shellcheck disable=SC2064
  trap "sentinel_unpause; trap - EXIT INT TERM" EXIT INT TERM
  "$fn"
  local rc=$?
  sentinel_unpause
  trap - EXIT INT TERM
  return $rc
}

# ── Preflight Checks ─────────────────────────────────────────

preflight() {
  step "Preflight checks"

  if ! command -v fly &>/dev/null; then
    fail "Fly CLI not found"
    echo ""
    echo "  Install it with:"
    echo "    curl -L https://fly.io/install.sh | sh"
    echo ""
    echo "  Then log in:"
    echo "    fly auth login"
    echo ""
    exit 1
  fi
  ok "Fly CLI installed"

  if ! fly auth whoami &>/dev/null 2>&1; then
    fail "Not logged in to Fly.io"
    echo ""
    echo "  Run: fly auth login"
    echo ""
    exit 1
  fi
  ok "Logged in as $(fly auth whoami 2>/dev/null)"

  if ! command -v git &>/dev/null; then
    fail "git not found — install it first"
    exit 1
  fi
  ok "git installed"
}

# ── Create Fly Apps ───────────────────────────────────────────

create_apps() {
  step "Creating Fly.io apps"

  # API app
  if fly apps list 2>/dev/null | grep -q "inkwell-api"; then
    info "inkwell-api already exists"
  else
    fly apps create inkwell-api --org personal 2>/dev/null
    if [ $? -eq 0 ]; then
      ok "Created inkwell-api"
    else
      fail "Could not create inkwell-api (name may be taken)"
      echo "  Edit fly.api.toml and fly.web.toml to use a different app name"
      exit 1
    fi
  fi

  # Web app
  if fly apps list 2>/dev/null | grep -q "inkwell-web"; then
    info "inkwell-web already exists"
  else
    fly apps create inkwell-web --org personal 2>/dev/null
    if [ $? -eq 0 ]; then
      ok "Created inkwell-web"
    else
      fail "Could not create inkwell-web (name may be taken)"
      echo "  Edit fly.api.toml and fly.web.toml to use a different app name"
      exit 1
    fi
  fi
}

# ── Provision Database ────────────────────────────────────────

provision_postgres() {
  step "Provisioning PostgreSQL"

  # Check if already attached
  if fly postgres list 2>/dev/null | grep -q "inkwell-db"; then
    info "inkwell-db already exists"
  else
    info "Creating PostgreSQL cluster (this takes ~60 seconds)..."
    fly postgres create \
      --name inkwell-db \
      --region ord \
      --vm-size shared-cpu-1x \
      --volume-size 1 \
      --initial-cluster-size 1 \
      --org personal
    ok "PostgreSQL cluster created"
  fi

  # Attach to API app (sets DATABASE_URL automatically)
  if fly postgres list -a inkwell-api 2>/dev/null | grep -q "inkwell-db"; then
    info "Database already attached to inkwell-api"
  else
    info "Attaching database to inkwell-api..."
    fly postgres attach inkwell-db --app inkwell-api 2>/dev/null || true
    ok "Database attached (DATABASE_URL set automatically)"
  fi
}

# ── Provision Redis ───────────────────────────────────────────

provision_redis() {
  step "Provisioning Redis (via Upstash)"

  if fly redis list 2>/dev/null | grep -q "inkwell-redis"; then
    info "inkwell-redis already exists"
  else
    info "Creating Redis instance..."
    fly redis create \
      --name inkwell-redis \
      --region ord \
      --no-eviction \
      --org personal 2>/dev/null
    ok "Redis created"
  fi

  # The REDIS_URL needs to be set manually from the redis dashboard
  info "Note: You may need to set REDIS_URL manually."
  info "Run: fly redis status inkwell-redis"
  info "Then: fly secrets set REDIS_URL=<url> --app inkwell-api"
}

# ── Set Secrets ───────────────────────────────────────────────

set_secrets() {
  step "Setting secrets"

  # Generate a secret key if not already set
  local existing_secrets
  existing_secrets=$(fly secrets list --app inkwell-api 2>/dev/null || echo "")

  if echo "$existing_secrets" | grep -q "SECRET_KEY_BASE"; then
    info "SECRET_KEY_BASE already set"
  else
    local secret_key
    secret_key=$(openssl rand -hex 64)
    fly secrets set SECRET_KEY_BASE="$secret_key" --app inkwell-api
    ok "SECRET_KEY_BASE generated and set"
  fi

  # Set the frontend URL for CORS
  if echo "$existing_secrets" | grep -q "FRONTEND_URL"; then
    info "FRONTEND_URL already set"
  else
    fly secrets set FRONTEND_URL="https://inkwell.social" --app inkwell-api
    ok "FRONTEND_URL set"
  fi
}

# ── Deploy API ────────────────────────────────────────────────

deploy_api() {
  step "Deploying Phoenix API"

  cd "$ROOT"
  info "Building and deploying (this takes 3-5 minutes the first time)..."
  fly deploy --config fly.api.toml --wait-timeout 300

  if [ $? -eq 0 ]; then
    ok "API deployed successfully!"
    echo ""
    echo -e "  API URL: ${CYAN}https://inkwell-api.fly.dev${NC}"
  else
    fail "API deployment failed"
    echo "  Check logs: fly logs --app inkwell-api"
    exit 1
  fi
}

# ── Deploy Web ────────────────────────────────────────────────

deploy_web() {
  step "Deploying Next.js Frontend"

  cd "$ROOT"
  info "Building and deploying..."
  fly deploy --config fly.web.toml --wait-timeout 300

  if [ $? -eq 0 ]; then
    ok "Frontend deployed successfully!"
    echo ""
    echo -e "  Frontend URL: ${CYAN}https://inkwell.social${NC}"
  else
    fail "Frontend deployment failed"
    echo "  Check logs: fly logs --app inkwell-web"
    exit 1
  fi
}

# ── Status ────────────────────────────────────────────────────

show_status() {
  step "Inkwell Deployment Status"

  echo -e "${CYAN}API:${NC}"
  fly status --app inkwell-api 2>/dev/null || fail "inkwell-api not found"
  echo ""
  echo -e "${CYAN}Frontend:${NC}"
  fly status --app inkwell-web 2>/dev/null || fail "inkwell-web not found"
  echo ""
  echo -e "${CYAN}Database:${NC}"
  fly postgres list 2>/dev/null | grep inkwell || fail "No database found"
}

# ── Full Deploy ───────────────────────────────────────────────

full_deploy() {
  echo ""
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${BOLD}${GREEN}  Inkwell — Deploy to Fly.io${NC}"
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"

  preflight
  create_apps
  provision_postgres
  provision_redis
  set_secrets
  # One pause window covers both API and web. Manual unpause happens after
  # both deploys succeed (or on interrupt via trap).
  sentinel_pause
  trap "sentinel_unpause; trap - EXIT INT TERM" EXIT INT TERM
  deploy_api
  deploy_web
  sentinel_unpause
  trap - EXIT INT TERM

  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Inkwell is live!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Frontend  →  ${CYAN}https://inkwell.social${NC}"
  echo -e "  API       →  ${CYAN}https://api.inkwell.social${NC}"
  echo ""
  echo -e "  Useful commands:"
  echo -e "    fly logs --app inkwell-api     View API logs"
  echo -e "    fly logs --app inkwell-web     View frontend logs"
  echo -e "    fly status --app inkwell-api   Check API status"
  echo -e "    ./deploy.sh api               Redeploy API only"
  echo -e "    ./deploy.sh web               Redeploy frontend only"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────

case "${1:-deploy}" in
  deploy)  full_deploy ;;
  api)     preflight && with_sentinel_pause deploy_api ;;
  web)     preflight && with_sentinel_pause deploy_web ;;
  status)  show_status ;;
  pause)   sentinel_pause ;;
  unpause) sentinel_unpause ;;
  *)
    echo "Usage: ./deploy.sh [deploy|api|web|status|pause|unpause]"
    echo ""
    echo "  deploy   Full first-time deployment (default)"
    echo "  api      Deploy only the Phoenix API"
    echo "  web      Deploy only the Next.js frontend"
    echo "  status   Check deployment status"
    echo "  pause    Manually pause Sentinel alerts (\$SENTINEL_PAUSE_MIN min, default 10)"
    echo "  unpause  Clear the Sentinel maintenance file immediately"
    echo ""
    echo "Env: SENTINEL_DISABLE=1 to skip pause entirely"
    exit 1
    ;;
esac
