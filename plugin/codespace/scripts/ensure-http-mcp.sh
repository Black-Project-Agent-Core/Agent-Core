#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_NAME="${CODESPACE_MCP_HTTP_SESSION:-codespace-mcp-http}"
HOST="${CODESPACE_MCP_HTTP_HOST:-127.0.0.1}"
PORT="${CODESPACE_MCP_HTTP_PORT:-38765}"
URL_FILE="${CODESPACE_MCP_HTTP_URL_FILE:-$ROOT/runtime/state/http-mcp.url}"
LOG_FILE="${CODESPACE_MCP_HTTP_LOG_FILE:-$ROOT/runtime/state/logs/http-mcp.log}"
LIFECYCLE_FILE="${CODESPACE_MCP_HTTP_LIFECYCLE_FILE:-$ROOT/runtime/state/http-mcp.lifecycle.json}"
LIFECYCLE_MODE="${CODESPACE_MEMORY_LIFECYCLE_MODE:-disabled}"
LEASE_URL="${CODESPACE_AGENT_CORE_MEMORY_LEASE_URL:-}"
LEASE_TIMEOUT_MS="${CODESPACE_MEMORY_LEASE_TIMEOUT_MS:-2000}"
SHARED_MEMORY_URL="${CODESPACE_AGENT_CORE_SHARED_MEMORY_URL:-}"
SHARED_MEMORY_TIMEOUT_MS="${CODESPACE_SHARED_MEMORY_TIMEOUT_MS:-2000}"

if [[ "$HOST" != "127.0.0.1" ]]; then
  printf '%s\n' "[codespace] ERROR: HTTP MCP host must be 127.0.0.1." >&2
  exit 1
fi
if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  printf '%s\n' "[codespace] ERROR: HTTP MCP port must be an integer between 1 and 65535." >&2
  exit 1
fi

MCP_SERVER_URL="http://127.0.0.1:${PORT}/mcp"
HEALTH_URL="http://127.0.0.1:${PORT}/healthz"

command -v tmux >/dev/null 2>&1 || {
  printf '%s\n' "[codespace] ERROR: tmux is required to supervise the loopback MCP server." >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  printf '%s\n' "[codespace] ERROR: curl is required to probe the loopback MCP server." >&2
  exit 1
}
command -v timeout >/dev/null 2>&1 || {
  printf '%s\n' "[codespace] ERROR: timeout is required to bound the MCP protocol probe." >&2
  exit 1
}

mkdir -p "$(dirname "$URL_FILE")" "$(dirname "$LOG_FILE")" "$(dirname "$LIFECYCLE_FILE")"

health_ok() {
  curl --noproxy '*' --fail --silent --show-error --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

protocol_ok() {
  timeout 15 node "$ROOT/dist/http-probe.js" "$MCP_SERVER_URL" >/dev/null 2>&1
}

url_file_matches() {
  [[ -f "$URL_FILE" ]] && [[ "$(tr -d '\r\n' < "$URL_FILE")" == "$MCP_SERVER_URL" ]]
}

lifecycle_config_matches() {
  [[ -f "$LIFECYCLE_FILE" ]] || return 1
  node - "$LIFECYCLE_FILE" "$LIFECYCLE_MODE" "$LEASE_URL" "$LEASE_TIMEOUT_MS" "$SHARED_MEMORY_URL" "$SHARED_MEMORY_TIMEOUT_MS" <<'NODE'
const fs = require('node:fs');
const [file, expectedMode, expectedEndpoint, expectedTimeout, expectedSharedEndpoint, expectedSharedTimeout] = process.argv.slice(2);
try {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  const endpoint = expectedEndpoint || null;
  const sharedMemoryEndpoint = expectedSharedEndpoint || null;
  process.exit(value.mode === expectedMode
    && value.endpoint === endpoint
    && value.timeoutMs === Number(expectedTimeout)
    && value.sharedMemoryEndpoint === sharedMemoryEndpoint
    && value.sharedMemoryTimeoutMs === Number(expectedSharedTimeout) ? 0 : 1);
} catch { process.exit(1); }
NODE
}

build_is_current() {
  [[ -f "$URL_FILE" ]] || return 1
  ! find "$ROOT/dist" -type f -newer "$URL_FILE" -print -quit | grep -q .
}

if health_ok && url_file_matches && lifecycle_config_matches && build_is_current && protocol_ok; then
  printf '%s\n' "[codespace] loopback MCP is healthy at $MCP_SERVER_URL"
  exit 0
fi

# Only terminate the tmux session owned by this bridge. An unrelated process on
# the configured port is never adopted or killed.
tmux kill-session -t "$SESSION_NAME" >/dev/null 2>&1 || true
rm -f "$URL_FILE" "$LIFECYCLE_FILE"

printf -v launch_command \
  'exec env CODESPACE_MCP_HTTP_HOST=%q CODESPACE_MCP_HTTP_PORT=%q CODESPACE_MCP_HTTP_URL_FILE=%q CODESPACE_MCP_HTTP_LIFECYCLE_FILE=%q CODESPACE_MEMORY_LIFECYCLE_MODE=%q CODESPACE_AGENT_CORE_MEMORY_LEASE_URL=%q CODESPACE_MEMORY_LEASE_TIMEOUT_MS=%q CODESPACE_AGENT_CORE_SHARED_MEMORY_URL=%q CODESPACE_SHARED_MEMORY_TIMEOUT_MS=%q bash %q >>%q 2>&1' \
  "$HOST" "$PORT" "$URL_FILE" "$LIFECYCLE_FILE" "$LIFECYCLE_MODE" "$LEASE_URL" "$LEASE_TIMEOUT_MS" "$SHARED_MEMORY_URL" "$SHARED_MEMORY_TIMEOUT_MS" "$ROOT/scripts/start-http-mcp.sh" "$LOG_FILE"

tmux new-session -d -s "$SESSION_NAME" -c "$ROOT" "$launch_command"

for _ in $(seq 1 80); do
  if health_ok && url_file_matches && lifecycle_config_matches && build_is_current; then
    if protocol_ok; then
      printf '%s\n' "[codespace] loopback MCP started and protocol probe passed at $MCP_SERVER_URL"
      exit 0
    fi
  fi
  if ! tmux has-session -t "$SESSION_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

printf '%s\n' "[codespace] ERROR: loopback MCP failed readiness/protocol probe." >&2
if [[ -f "$LOG_FILE" ]]; then
  tail -40 "$LOG_FILE" >&2 || true
fi
exit 1
