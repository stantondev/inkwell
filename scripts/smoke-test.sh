#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Inkwell production smoke test
#
# Read-only checks of the things that must always work: API health, the
# main pages, sign-in pages, profiles and entries, federation endpoints
# (WebFinger, actor, outbox, NodeInfo, entry objects) and RSS. Run it before
# and after every deploy; deploy.sh runs it automatically after deploying.
#
# Usage:
#   scripts/smoke-test.sh                      # production
#   WEB=http://localhost:3000 API=http://localhost:4000 scripts/smoke-test.sh
#
# Optional signed-in checks: set INKWELL_SMOKE_TOKEN to a session token (the
# inkwell_token cookie value) for an account you own. Never paste someone
# else's token.
# ──────────────────────────────────────────────────────────────

set -uo pipefail

WEB="${WEB:-https://inkwell.social}"
API="${API:-https://api.inkwell.social}"
USER_HANDLE="${SMOKE_USER:-stanton}"
TOKEN="${INKWELL_SMOKE_TOKEN:-}"

pass=0
fail=0
failures=()

green='\033[0;32m'; red='\033[0;31m'; dim='\033[2m'; nc='\033[0m'

# check NAME EXPECTED_STATUS URL [curl args...]
check() {
  local name="$1" expected="$2" url="$3"
  shift 3
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$@" "$url")
  if [[ "$code" == "$expected" ]]; then
    pass=$((pass + 1))
    printf "  ${green}✓${nc} %-44s ${dim}%s${nc}\n" "$name" "$code"
  else
    fail=$((fail + 1))
    failures+=("$name (expected $expected, got $code) $url")
    printf "  ${red}✗${nc} %-44s ${red}%s (expected %s)${nc}\n" "$name" "$code" "$expected"
  fi
}

# check_body NAME URL PATTERN [curl args...] — 200 and body contains PATTERN
check_body() {
  local name="$1" url="$2" pattern="$3"
  shift 3
  local body code
  body=$(curl -s --max-time 20 -w $'\n%{http_code}' "$@" "$url")
  code="${body##*$'\n'}"
  body="${body%$'\n'*}"
  if [[ "$code" == "200" ]] && grep -q -- "$pattern" <<<"$body"; then
    pass=$((pass + 1))
    printf "  ${green}✓${nc} %-44s ${dim}200${nc}\n" "$name"
  else
    fail=$((fail + 1))
    failures+=("$name (status $code, pattern '$pattern') $url")
    printf "  ${red}✗${nc} %-44s ${red}%s, missing '%s'${nc}\n" "$name" "$code" "$pattern"
  fi
}

AP='Accept: application/activity+json'

echo "API"
check_body "health"                      "$API/health"                       '"ok"'
check_body "web → API reachability"      "$WEB/api/healthcheck/api"          '"ok":true'

echo "Pages"
for path in / /login /get-started /explore /about /help /help/faq /roadmap /roadmap/releases /polls /circles /transparency /guidelines /terms /privacy /developers /switch; do
  check "page $path" 200 "$WEB$path"
done
check "signed-out /feed → login"  307 "$WEB/feed"
check "signed-out /settings → login" 307 "$WEB/settings/top-friends"
check_body "profile /$USER_HANDLE" "$WEB/$USER_HANDLE" "$USER_HANDLE"
check "unknown profile is 404" 404 "$WEB/this-user-should-not-exist-$RANDOM$RANDOM"

# A real public entry, taken from the explore feed.
entry=$(curl -s --max-time 20 "$API/api/explore?per_page=5" |
  python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  for e in d.get("data", []):
    a=(e.get("author") or {}).get("username")
    if a and e.get("slug") and e.get("source") != "remote":
      print(a, e["slug"], e["id"]); break
except Exception: pass' 2>/dev/null)
if [[ -n "$entry" ]]; then
  read -r e_user e_slug e_id <<<"$entry"
  check "entry page /$e_user/$e_slug" 200 "$WEB/$e_user/$e_slug"
  check_body "entry AP object /entries/:id" "$WEB/entries/$e_id" '"Article"' -H "$AP"
  check_body "entry AP by slug URL" "$WEB/$e_user/$e_slug" '"Article"' -H "$AP"
else
  fail=$((fail + 1)); failures+=("couldn't find a public entry in $API/api/explore")
  printf "  ${red}✗${nc} %-44s\n" "find a public entry to test"
fi

echo "Federation"
check_body "WebFinger"            "$WEB/.well-known/webfinger?resource=acct:$USER_HANDLE@inkwell.social" '"self"'
check_body "actor (Person)"       "$WEB/users/$USER_HANDLE" '"Person"' -H "$AP"
check_body "outbox"               "$WEB/users/$USER_HANDLE/outbox" 'OrderedCollection' -H "$AP"
check_body "NodeInfo discovery"   "$WEB/.well-known/nodeinfo" 'nodeinfo'
check_body "NodeInfo 2.1"         "$WEB/nodeinfo/2.1" '"inkwell"'
check "avatar"                    200 "$WEB/api/avatars/$USER_HANDLE"

echo "RSS"
check_body "profile feed"  "$WEB/api/users/$USER_HANDLE/feed.xml" '<rss'
check_body "site feed"     "$WEB/api/explore/feed.xml" '<rss'

if [[ -n "$TOKEN" ]]; then
  echo "Signed in"
  C="Cookie: inkwell_token=$TOKEN"
  check_body "session"            "$WEB/api/session" '"username"' -H "$C"
  check "feed page"               200 "$WEB/feed" -H "$C"
  check "Top 6 settings page"     200 "$WEB/settings/top-friends" -H "$C"
  check "profile settings page"   200 "$WEB/settings" -H "$C"
  check "pinned settings page"    200 "$WEB/settings/pinned" -H "$C"
  check "billing page"            200 "$WEB/settings/billing" -H "$C"
  check "editor"                  200 "$WEB/editor" -H "$C"
  check "notifications"           200 "$WEB/notifications" -H "$C"
  check_body "top friends API"    "$WEB/api/top-friends" '"data"' -H "$C"
  check_body "billing status API" "$WEB/api/billing/status" 'subscription_tier' -H "$C"
fi

echo
if [[ $fail -eq 0 ]]; then
  echo -e "${green}All $pass checks passed.${nc}"
  exit 0
else
  echo -e "${red}$fail failed${nc}, $pass passed:"
  for f in "${failures[@]}"; do echo "  - $f"; done
  exit 1
fi
