#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

log() { printf '[codespace-supervisor/bridge] %s\n' "$*"; }

ensure_state_dir
load_codespaces_env

exec 9>"$SUPERVISOR_STATE/bridge.lock"
if ! flock -w 10 9; then
  # A concurrent start is acceptable only if it actually restored health.
  if bridge_local_health; then
    pid="$(bridge_listener_pid)"
    [ -n "$pid" ] && printf '%s\n' "$pid" > "$BRIDGE_PID_FILE"
    log "healthy after concurrent lifecycle operation${pid:+ (PID $pid)}"
    exit 0
  fi
  log "ERROR: bridge lifecycle lock is busy and local health is still failing"
  exit 24
fi

if ! bridge_token_available; then
  # A postStart may run after a partial rebuild. Rehydrate the state from the
  # Codespaces secret without logging the secret value.
  if [ -n "${BRIDGE_TOKEN:-}" ]; then
    umask 077
    printf '%s' "$BRIDGE_TOKEN" > "$BRIDGE_TOKEN_FILE"
    chmod 600 "$BRIDGE_TOKEN_FILE"
  else
    log "ERROR: bridge token is unavailable"
    exit 20
  fi
fi

if bridge_local_health; then
  pid="$(bridge_listener_pid)"
  [ -n "$pid" ] && printf '%s\n' "$pid" > "$BRIDGE_PID_FILE"
  log "healthy on :${BRIDGE_PORT}${pid:+ (PID $pid)}"
  exit 0
fi

# A process can keep the socket open while its event loop is wedged. Health,
# not mere PID/socket existence, is therefore the source of truth.
stale_pid="$(bridge_listener_pid)"
if [ -n "$stale_pid" ] && kill -0 "$stale_pid" 2>/dev/null; then
  log "unhealthy listener detected (PID $stale_pid); restarting"
  kill "$stale_pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$stale_pid" 2>/dev/null || break
    sleep 0.25
  done
  if kill -0 "$stale_pid" 2>/dev/null; then
    kill -KILL "$stale_pid" 2>/dev/null || true
  fi
fi

# Clean a stale PID file only when it clearly belongs to this bridge port.
if [ -s "$BRIDGE_PID_FILE" ]; then
  old_pid="$(cat "$BRIDGE_PID_FILE" 2>/dev/null || true)"
  if [ -n "$old_pid" ] && [ "$old_pid" != "${stale_pid:-}" ] && kill -0 "$old_pid" 2>/dev/null; then
    old_args="$(ps -o args= -p "$old_pid" 2>/dev/null || true)"
    case "$old_args" in
      *uvicorn*server:app*"--port ${BRIDGE_PORT}"*) kill "$old_pid" 2>/dev/null || true ;;
    esac
  fi
fi

[ -x "$SUPERVISOR_HOME/.venv/bin/uvicorn" ] || {
  log "ERROR: bridge virtualenv is missing; run bootstrap-supervisor.sh"
  exit 21
}
[ -f "$SUPERVISOR_HOME/server.py" ] || {
  log "ERROR: bridge server.py is missing; run bootstrap-supervisor.sh"
  exit 22
}

rotate_log_if_needed "$BRIDGE_LOG_FILE"

# Windows relay pairing/session state must survive a full container rebuild.
# Keep it under /workspaces rather than the ephemeral supervisor home.
WINDOWS_GATEWAY_STATE_DIR="${WINDOWS_GATEWAY_STATE_DIR:-/workspaces/.assistant-tools/state/windows-gateway}"
mkdir -p "$WINDOWS_GATEWAY_STATE_DIR"
chmod 700 "$WINDOWS_GATEWAY_STATE_DIR"

cd "$SUPERVISOR_HOME"
BRIDGE_TOKEN_VALUE="$(cat "$BRIDGE_TOKEN_FILE")"
# fd 9 owns bridge.lock in this shell. Explicitly close it in uvicorn so the
# long-lived child cannot keep the lifecycle lock after this script exits.
env \
  BRIDGE_TOKEN="$BRIDGE_TOKEN_VALUE" \
  WORKSPACE_ROOT="$REPO_ROOT" \
  BRIDGE_HOME="$SUPERVISOR_HOME" \
  WINDOWS_GATEWAY_STATE_DIR="$WINDOWS_GATEWAY_STATE_DIR" \
  nohup "$SUPERVISOR_HOME/.venv/bin/uvicorn" server:app \
    --host 0.0.0.0 \
    --port "$BRIDGE_PORT" \
    >>"$BRIDGE_LOG_FILE" 2>&1 </dev/null 9>&- &
started_pid=$!
unset BRIDGE_TOKEN_VALUE
printf '%s\n' "$started_pid" > "$BRIDGE_PID_FILE"

for _ in $(seq 1 40); do
  if bridge_local_health; then
    real_pid="$(bridge_listener_pid)"
    [ -n "$real_pid" ] && printf '%s\n' "$real_pid" > "$BRIDGE_PID_FILE"
    log "started and healthy on :${BRIDGE_PORT}${real_pid:+ (PID $real_pid)}"
    exit 0
  fi
  sleep 0.25
done

if kill -0 "$started_pid" 2>/dev/null; then
  kill "$started_pid" 2>/dev/null || true
fi
rm -f "$BRIDGE_PID_FILE"
log "ERROR: bridge failed health verification; see $BRIDGE_LOG_FILE"
exit 23
