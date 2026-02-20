#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Inkwell Dev Script — supervisord backend
# Manages PostgreSQL, Redis, Phoenix API, and Next.js frontend
# via supervisord for reliable auto-restart on failure.
#
# Usage:
#   ./dev.sh              Start all services (default)
#   ./dev.sh stop         Stop all services + supervisord
#   ./dev.sh status       Show service status
#   ./dev.sh restart      Restart all services
#   ./dev.sh restart <s>  Restart one service (postgresql|redis|phoenix|nextjs)
#   ./dev.sh logs <s>     Tail logs for a service
#   ./dev.sh setup        First-time setup (install supervisor, create dirs)
# ──────────────────────────────────────────────────────────────

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
export INKWELL_ROOT="$ROOT"

# mise-installed tool paths
# Source mise's PATH additions if available, otherwise use known paths
if command -v mise &>/dev/null; then
  eval "$(mise env 2>/dev/null)" || true
fi
# Ensure known tool paths are always present
export PATH="$HOME/.local/share/mise/installs/elixir/1.18.4-otp-27/bin:$HOME/.local/share/mise/installs/erlang/27.3.4.7/bin:$HOME/pgsql/bin:$HOME/.local/share/mise/installs/redis/7.4.7/bin:$PATH"
# Add any mise node install to PATH (version-agnostic)
for d in "$HOME"/.local/share/mise/installs/node/*/bin; do
  [ -d "$d" ] && export PATH="$d:$PATH" && break
done

CONF="$ROOT/supervisord.conf"
PIDFILE="$HOME/.inkwell/supervisord.pid"
SOCK="$HOME/.inkwell/supervisor.sock"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${YELLOW}…${NC} $1"; }

# ── Helpers ───────────────────────────────────────────────────

supervisor_running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null
}

ctl() {
  supervisorctl -c "$CONF" "$@"
}

ensure_dirs() {
  mkdir -p "$HOME/.inkwell/logs"
}

# ── Setup ─────────────────────────────────────────────────────

do_setup() {
  echo -e "\n${CYAN}Setting up Inkwell process management…${NC}\n"

  # Install supervisord if missing
  if ! command -v supervisord &>/dev/null; then
    info "Installing supervisor…"
    if pip3 install --break-system-packages supervisor 2>/dev/null; then
      ok "supervisor installed via pip"
    elif sudo apt-get update -qq && sudo apt-get install -y -qq supervisor 2>/dev/null; then
      ok "supervisor installed via apt"
    else
      fail "Could not install supervisor. Try: pip3 install --break-system-packages supervisor"
      exit 1
    fi
  else
    ok "supervisor already installed"
  fi

  ensure_dirs
  ok "Created ~/.inkwell/logs"

  # Detect node path and update config if needed
  NODE_DIR=$(dirname "$(which node 2>/dev/null)" 2>/dev/null || echo "")
  if [ -n "$NODE_DIR" ]; then
    ok "Node found at: $NODE_DIR"
    # Check if config matches
    if ! grep -q "$NODE_DIR" "$CONF" 2>/dev/null; then
      echo ""
      echo -e "  ${YELLOW}WARNING:${NC} Node path in supervisord.conf may not match your system."
      echo -e "  Detected: $NODE_DIR"
      echo -e "  Please verify the [program:nextjs] section in supervisord.conf"
    fi
  fi

  echo ""
  echo -e "${GREEN}Setup complete!${NC} Run ${CYAN}./dev.sh start${NC} to launch."
  echo ""
}

# ── Start ─────────────────────────────────────────────────────

start_all() {
  echo -e "\n${CYAN}Starting Inkwell services…${NC}\n"
  ensure_dirs

  if supervisor_running; then
    info "supervisord already running, ensuring all services are up…"
    ctl start all 2>/dev/null
  else
    # Kill any orphaned processes from old nohup approach
    pkill -f "next-server" 2>/dev/null || true
    pkill -f "beam.smp" 2>/dev/null || true
    redis-cli shutdown 2>/dev/null || true
    pg_ctl -D "$HOME/pgdata" stop -m fast 2>/dev/null || true
    sleep 1

    info "Starting supervisord…"
    supervisord -c "$CONF"
    sleep 1

    if supervisor_running; then
      ok "supervisord started"
    else
      fail "supervisord failed to start — check ~/.inkwell/logs/supervisord.log"
      exit 1
    fi
  fi

  # Wait for services to come up
  info "Waiting for services…"
  sleep 3

  # Health-check loop
  local all_ok=true
  for i in $(seq 1 30); do
    all_ok=true
    pg_ctl -D "$HOME/pgdata" status &>/dev/null || all_ok=false
    redis-cli ping &>/dev/null || all_ok=false
    curl -sf http://localhost:4000 &>/dev/null || all_ok=false
    curl -sf http://localhost:3000 &>/dev/null || all_ok=false
    if $all_ok; then break; fi
    sleep 2
  done

  # Report status
  echo ""
  if pg_ctl -D "$HOME/pgdata" status &>/dev/null; then
    ok "PostgreSQL running"
  else fail "PostgreSQL not ready"; fi

  if redis-cli ping &>/dev/null; then
    ok "Redis running"
  else fail "Redis not ready"; fi

  if curl -sf http://localhost:4000 &>/dev/null; then
    ok "Phoenix running (port 4000)"
  else fail "Phoenix not ready (may still be compiling — check logs)"; fi

  if curl -sf http://localhost:3000 &>/dev/null; then
    ok "Next.js running (port 3000)"
  else fail "Next.js not ready"; fi

  VM_IP=$(ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[^/]+' || echo "192.168.64.2")

  echo ""
  echo -e "${GREEN}────────────────────────────────────────${NC}"
  echo -e "${GREEN}  Inkwell is running!${NC}"
  echo -e "${GREEN}────────────────────────────────────────${NC}"
  echo -e "  Frontend  →  ${CYAN}http://${VM_IP}:3000${NC}"
  echo -e "  API       →  ${CYAN}http://${VM_IP}:4000${NC}"
  echo ""
  echo -e "  ${YELLOW}Services auto-restart on crash.${NC}"
  echo -e "  Logs: ${CYAN}./dev.sh logs <postgresql|redis|phoenix|nextjs>${NC}"
  echo ""
}

# ── Stop ──────────────────────────────────────────────────────

stop_all() {
  echo -e "\n${CYAN}Stopping Inkwell services…${NC}\n"

  if supervisor_running; then
    ctl stop all 2>/dev/null
    ok "All services stopped"
    supervisorctl -c "$CONF" shutdown 2>/dev/null
    ok "supervisord shut down"
  else
    info "supervisord not running"
    # Clean up any stragglers
    pkill -f "next-server" 2>/dev/null || true
    pkill -f "beam.smp" 2>/dev/null || true
    redis-cli shutdown 2>/dev/null || true
    pg_ctl -D "$HOME/pgdata" stop -m fast 2>/dev/null || true
  fi

  echo ""
}

# ── Status ────────────────────────────────────────────────────

show_status() {
  echo -e "\n${CYAN}Inkwell service status${NC}\n"

  if supervisor_running; then
    ok "supervisord running (PID $(cat "$PIDFILE"))"
    echo ""
    ctl status
  else
    fail "supervisord not running"
    echo ""
    # Fall back to process checks
    if pg_ctl -D "$HOME/pgdata" status &>/dev/null; then
      ok "PostgreSQL running (orphaned)"
    else fail "PostgreSQL stopped"; fi

    if redis-cli ping &>/dev/null; then
      ok "Redis running (orphaned)"
    else fail "Redis stopped"; fi

    if pgrep -f "phx.server" &>/dev/null; then
      ok "Phoenix running (orphaned)"
    else fail "Phoenix stopped"; fi

    if pgrep -f "next-server" &>/dev/null; then
      ok "Next.js running (orphaned)"
    else fail "Next.js stopped"; fi
  fi

  echo ""
}

# ── Restart ───────────────────────────────────────────────────

do_restart() {
  local service="${1:-}"

  if [ -n "$service" ]; then
    # Restart a single service
    if supervisor_running; then
      echo -e "\n${CYAN}Restarting $service…${NC}\n"
      ctl restart "$service"
    else
      fail "supervisord not running — run ./dev.sh start first"
    fi
  else
    stop_all
    sleep 2
    start_all
  fi
}

# ── Logs ──────────────────────────────────────────────────────

show_logs() {
  local service="${1:-}"
  local logfile=""

  case "$service" in
    postgresql|postgres|pg) logfile="$HOME/.inkwell/logs/postgresql.log" ;;
    redis)                  logfile="$HOME/.inkwell/logs/redis.log" ;;
    phoenix|api)            logfile="$HOME/.inkwell/logs/phoenix.log" ;;
    nextjs|next|web)        logfile="$HOME/.inkwell/logs/nextjs.log" ;;
    supervisor|supervisord) logfile="$HOME/.inkwell/logs/supervisord.log" ;;
    "")
      echo "Usage: ./dev.sh logs <postgresql|redis|phoenix|nextjs|supervisor>"
      exit 1
      ;;
    *)
      fail "Unknown service: $service"
      echo "  Available: postgresql, redis, phoenix, nextjs, supervisor"
      exit 1
      ;;
  esac

  if [ -f "$logfile" ]; then
    echo -e "${CYAN}Tailing $logfile${NC} (Ctrl-C to stop)\n"
    tail -f "$logfile"
  else
    fail "Log file not found: $logfile"
    echo "  Services may not have started yet."
  fi
}

# ── Main ──────────────────────────────────────────────────────

case "${1:-start}" in
  start)    start_all ;;
  stop)     stop_all ;;
  status)   show_status ;;
  restart)  do_restart "${2:-}" ;;
  logs)     show_logs "${2:-}" ;;
  setup)    do_setup ;;
  *)
    echo "Usage: ./dev.sh [start|stop|status|restart|logs|setup]"
    echo ""
    echo "  start              Start all services (default)"
    echo "  stop               Stop all services"
    echo "  status             Show service status"
    echo "  restart [service]  Restart all or one service"
    echo "  logs <service>     Tail logs (postgresql|redis|phoenix|nextjs)"
    echo "  setup              First-time setup"
    exit 1
    ;;
esac
