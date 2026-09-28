#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Self-hosting smoke test
#
# Boots docker-compose.selfhosted.yml exactly as SELF_HOSTING.md describes,
# at a made-up domain, and checks what an operator would: the site answers
# as itself, sign-in works without email, the admin is the admin, fediverse
# handles use the domain, and nothing of inkwell.social's business shows.
#
# Until 2026-09-28 a self-hosted server showed "Domain Not Connected" on
# every page and nobody noticed for six months. This is what notices now.
#
#   scripts/selfhost-smoke.sh
#   API_IMAGE=inkwell-api:dev WEB_IMAGE=inkwell-web:dev scripts/selfhost-smoke.sh
#
# Caddy isn't started (a made-up domain can't get a certificate); requests
# go to the web container with the domain in the Host header, which is what
# Caddy would send.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_IMAGE="${API_IMAGE:-ghcr.io/stantondev/inkwell-api:latest}"
WEB_IMAGE="${WEB_IMAGE:-ghcr.io/stantondev/inkwell-web:latest}"
DOMAIN="${DOMAIN:-journal.test}"
ADMIN="${ADMIN:-owner@example.org}"
PORT="${SMOKE_PORT:-38080}"
PROJECT="inkwell-selfhost-smoke"

WORK="$(mktemp -d)"
cp "$ROOT/docker-compose.selfhosted.yml" "$ROOT/Caddyfile" "$WORK/"
mkdir -p "$WORK/legal"

cat > "$WORK/.env" <<EOF
DOMAIN=$DOMAIN
ADMIN_EMAIL=$ADMIN
SECRET_KEY_BASE=$(openssl rand -base64 64 | tr -d '\n')
INSTANCE_NAME=Smoke Test Journal
EOF

cat > "$WORK/override.yml" <<EOF
services:
  api:
    image: $API_IMAGE
  web:
    image: $WEB_IMAGE
    ports:
      - "127.0.0.1:$PORT:3000"
EOF

dc() { docker compose -p "$PROJECT" --project-directory "$WORK" -f "$WORK/docker-compose.selfhosted.yml" -f "$WORK/override.yml" "$@"; }

cleanup() {
  status=$?
  if [ $status -ne 0 ]; then
    echo "── api log (last 60 lines) ──"; dc logs --tail 60 api || true
    echo "── web log (last 30 lines) ──"; dc logs --tail 30 web || true
  fi
  dc down -v >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit $status
}
trap cleanup EXIT

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# A request as a browser at https://$DOMAIN would make, through Caddy.
req() { curl -s --max-time 20 -H "Host: $DOMAIN" -H "X-Forwarded-Proto: https" -H "X-Forwarded-For: 203.0.113.5" "$@"; }
url() { echo "http://127.0.0.1:$PORT$1"; }

echo "Starting the stack ($API_IMAGE, $WEB_IMAGE) at $DOMAIN…"
dc up -d db api web >/dev/null

for i in $(seq 1 90); do
  if req -o /dev/null -w "%{http_code}" "$(url /api/healthcheck/api)" 2>/dev/null | grep -q 200; then break; fi
  sleep 2
  [ "$i" = 90 ] && { echo "The stack didn't come up in 3 minutes."; exit 1; }
done
echo "Up. Checking:"

# ── The site answers as itself ────────────────────────────────
home="$(req "$(url /)")"
check "home page is not 'Domain Not Connected'" '! grep -q "Domain Not Connected" <<<"$home"'
check "home page title is the instance name" 'grep -q "<title>Smoke Test Journal</title>" <<<"$home"'
check "canonical URLs use https://$DOMAIN" 'grep -q "rel=\"canonical\" href=\"https://$DOMAIN\"" <<<"$home"'
check "no pricing on the home page" '! grep -qi "Founding Member\|Choose your ink" <<<"$home"'
check "no inkwell.social share images" '! grep -q "https://inkwell.social/api/og" <<<"$home"'

about="$(req "$(url /about)")"
check "/about describes this server" 'grep -q "About Smoke Test Journal" <<<"$about"'
check "/transparency is not served" '[ "$(req -o /dev/null -w "%{http_code}" "$(url /transparency)")" = 404 ]'
terms="$(req "$(url /terms)")"
check "/terms is this server's (not inkwell.social's)" 'grep -q "published its" <<<"$terms" && ! grep -q "Last Updated" <<<"$terms"'
check "robots.txt allows crawling and names this sitemap" 'req "$(url /robots.txt)" | grep -q "Sitemap: https://$DOMAIN/sitemap.xml"'
check "the manifest uses the instance name" 'req "$(url /manifest.webmanifest)" | grep -q "\"name\":\"Smoke Test Journal\""'

# ── Sign-in without email ─────────────────────────────────────
ml="$(req -X POST -H 'content-type: application/json' -d "{\"email\":\"$ADMIN\",\"terms_accepted\":true}" "$(url /api/auth/magic-link)")"
check "sign-in request succeeds" 'grep -q "\"ok\":true" <<<"$ml"'
check "the sign-in link is NOT in the response" '! grep -q "dev_magic_link" <<<"$ml"'

link=""
for i in $(seq 1 10); do
  link="$(dc logs api 2>/dev/null | grep -o "magic link: https://$DOMAIN/auth/verify?[^ ]*" | tail -1 | sed 's/^magic link: //')" || true
  [ -n "$link" ] && break
  sleep 1
done
check "the sign-in link is in the API log, on https://$DOMAIN" '[ -n "$link" ]'

token="$(sed -E 's/.*token=([^&]+).*/\1/' <<<"$link")"
headers="$(req -D - -o /dev/null -X POST -H 'content-type: application/json' -d "{\"token\":\"$token\"}" "$(url /api/auth/verify)")"
cookie="$(grep -i '^set-cookie: inkwell_token=' <<<"$headers" | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: (inkwell_token=[^;]+).*/\1/' | tr -d '\r')"
check "the link signs in" '[ -n "$cookie" ]'

authed() { req -H "Cookie: $cookie" "$@"; }
check "choosing a username works" '[ "$(authed -o /dev/null -w "%{http_code}" -X PATCH -H "content-type: application/json" -d "{\"username\":\"smoke\"}" "$(url /api/me/username)")" = 200 ]'
session="$(authed "$(url /api/session)")"
check "ADMIN_EMAIL is an admin from the first sign-in" 'grep -q "\"is_admin\":true" <<<"$session"'
check "the session says self-hosted" 'grep -q "\"self_hosted\":true" <<<"$session"'

# ── Fediverse identity ───────────────────────────────────────
wf="$(req "$(url "/.well-known/webfinger?resource=acct:smoke@$DOMAIN")")"
check "WebFinger answers for @smoke@$DOMAIN" 'grep -q "\"subject\":\"acct:smoke@$DOMAIN\"" <<<"$wf"'
actor="$(req -H 'Accept: application/activity+json' "$(url /users/smoke)")"
check "actor id is https://$DOMAIN/users/smoke" 'grep -q "\"id\":\"https://$DOMAIN/users/smoke\"" <<<"$actor"'
check "shared inbox is on $DOMAIN" 'grep -q "\"sharedInbox\":\"https://$DOMAIN/inbox\"" <<<"$actor"'
profile="$(req "$(url /smoke)")"
check "the profile shows @smoke@$DOMAIN" 'grep -q "@smoke@$DOMAIN" <<<"$profile"'
check "the profile never shows @smoke@inkwell.social" '! grep -q "@smoke@inkwell.social" <<<"$profile"'
check "the profile's canonical URL is on $DOMAIN" 'grep -q "rel=\"canonical\" href=\"https://$DOMAIN/smoke\"" <<<"$profile"'
check "NodeInfo names the instance" 'req "$(url /nodeinfo/2.1)" | grep -q "\"nodeName\":\"Smoke Test Journal\""'

# ── No payments ──────────────────────────────────────────────
check "checkout is refused" '[ "$(authed -o /dev/null -w "%{http_code}" -X POST -H "content-type: application/json" -d "{}" "$(url /api/billing/checkout)")" = 404 ]'

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
