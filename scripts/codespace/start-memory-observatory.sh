#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
OBSERVATORY_ROOT="$REPO_ROOT/SubProject/Memory-Observatory"
STATE_DIR="${MEMORY_OBSERVATORY_LIFECYCLE_DIR:-/workspaces/.agent-core-codespace/memory-observatory}"
PID_FILE="$STATE_DIR/memory-observatory.pid"
LOG_FILE="$STATE_DIR/memory-observatory.log"
HOST="127.0.0.1"
PORT="3697"
AGENT_CORE_URL="${MEMORY_OBSERVATORY_AGENT_CORE_URL:-http://127.0.0.1:8865}"
WORKSPACE_ROOT="${MEMORY_OBSERVATORY_WORKSPACE_ROOT:-/workspaces/Agent-Core}"
HEALTH_URL="http://127.0.0.1:3697/api/health"

safe_ready() {
  printf '%s\n' \
    'Memory Observatory READY' \
    'Local URL: http://127.0.0.1:3697' \
    'Mode: shadow' \
    'Agent Core target: loopback'
}

fail() {
  printf 'Memory Observatory ERROR: %s\n' "$1" >&2
  exit 1
}

is_loopback_origin() {
  [[ "$1" =~ ^http://127\.0\.0\.1:([1-9][0-9]{0,4})$ ]] || return 1
  local port="${BASH_REMATCH[1]}"
  (( port <= 65535 ))
}

pid_is_alive() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] && (( pid > 1 )) && kill -0 "$pid" 2>/dev/null
}

health_ok() {
  curl --silent --show-error --fail --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

stop_owned_process() {
  local pid="${1:-}"
  if ! pid_is_alive "$pid"; then return 0; fi
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do
    if ! pid_is_alive "$pid"; then return 0; fi
    sleep 0.1
  done
  kill -KILL "$pid" 2>/dev/null || true
}

is_loopback_origin "$AGENT_CORE_URL" || fail 'AGENT_CORE_TARGET_NOT_LOOPBACK'
[[ -d "$WORKSPACE_ROOT" ]] || fail 'WORKSPACE_ROOT_MISSING'
mkdir -p "$STATE_DIR"
umask 077

if [[ -f "$PID_FILE" ]]; then
  owned_pid="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)"
  if pid_is_alive "$owned_pid" && health_ok; then
    safe_ready
    exit 0
  fi
  if pid_is_alive "$owned_pid"; then
    stop_owned_process "$owned_pid"
  fi
  rm -f "$PID_FILE"
fi

if health_ok; then
  fail 'PORT_3697_ALREADY_OWNED_BY_ANOTHER_PROCESS'
fi

if [[ ! -f "$OBSERVATORY_ROOT/server-dist/server.js" || ! -f "$OBSERVATORY_ROOT/dist/index.html" ]]; then
  npm --prefix "$OBSERVATORY_ROOT" run build >/dev/null 2>&1 || fail 'BUILD_FAILED'
fi

: > "$LOG_FILE"
MEMORY_OBSERVATORY_HOST="$HOST" \
MEMORY_OBSERVATORY_PORT="$PORT" \
MEMORY_OBSERVATORY_AGENT_CORE_URL="$AGENT_CORE_URL" \
MEMORY_OBSERVATORY_WORKSPACE_ROOT="$WORKSPACE_ROOT" \
nohup node "$OBSERVATORY_ROOT/server-dist/server.js" >>"$LOG_FILE" 2>&1 </dev/null &
observatory_pid=$!
printf '%s\n' "$observatory_pid" > "$PID_FILE"

for _ in $(seq 1 80); do
  if ! pid_is_alive "$observatory_pid"; then
    rm -f "$PID_FILE"
    fail 'PROCESS_EXITED_BEFORE_READY'
  fi
  if health_ok; then
    safe_ready
    exit 0
  fi
  sleep 0.1
done

stop_owned_process "$observatory_pid"
rm -f "$PID_FILE"
fail 'HEALTH_CHECK_TIMEOUT'
