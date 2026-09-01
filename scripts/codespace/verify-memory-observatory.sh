#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STATE_DIR="${MEMORY_OBSERVATORY_LIFECYCLE_DIR:-/workspaces/.agent-core-codespace/memory-observatory}"
PID_FILE="$STATE_DIR/memory-observatory.pid"
PORT="${MEMORY_OBSERVATORY_PORT:-3697}"
AGENT_CORE_URL="${MEMORY_OBSERVATORY_AGENT_CORE_URL:-http://127.0.0.1:8865}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

safe_ready() {
  printf '%s\n' \
    'Memory Observatory READY' \
    "Local URL: http://127.0.0.1:${PORT}" \
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

[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )) || fail 'PORT_INVALID'
is_loopback_origin "$AGENT_CORE_URL" || fail 'AGENT_CORE_TARGET_NOT_LOOPBACK'
[[ -f "$PID_FILE" ]] || fail 'NOT_RUNNING'
pid="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)"
[[ "$pid" =~ ^[0-9]+$ ]] && (( pid > 1 )) || fail 'PID_INVALID'
kill -0 "$pid" 2>/dev/null || fail 'PROCESS_NOT_RUNNING'
curl --silent --show-error --fail --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 || fail 'HEALTH_CHECK_FAILED'
safe_ready
