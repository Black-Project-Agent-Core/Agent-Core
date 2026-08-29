#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

log() { printf '[codespace-supervisor/keepalive-start] %s\n' "$*"; }

ensure_state_dir
pid_file="$SUPERVISOR_STATE/keepalive.pid"
log_file="$SUPERVISOR_STATE/keepalive.log"

if [ -s "$pid_file" ]; then
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    case "$(ps -o args= -p "$pid" 2>/dev/null || true)" in
      *keepalive-terminal.sh*)
        log "already running (PID $pid)"
        exit 0
        ;;
    esac
  fi
  rm -f "$pid_file"
fi

rotate_log_if_needed "$log_file"
nohup bash "$SCRIPT_DIR/keepalive-terminal.sh" >>"$log_file" 2>&1 </dev/null &
launched_pid=$!

for _ in $(seq 1 30); do
  if [ -s "$pid_file" ]; then
    actual="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$actual" ] && kill -0 "$actual" 2>/dev/null; then
      case "$(ps -o args= -p "$actual" 2>/dev/null || true)" in
        *keepalive-terminal.sh*)
          log "active keepalive detected (PID $actual)"
          exit 0
          ;;
      esac
    fi
  fi

  kill -0 "$launched_pid" 2>/dev/null || break
  sleep 0.1
done

log "ERROR: keepalive did not become active; see $log_file"
exit 31
