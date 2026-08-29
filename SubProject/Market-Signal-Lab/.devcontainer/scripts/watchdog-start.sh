#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

log() { printf '[codespace-supervisor/watchdog-start] %s\n' "$*"; }

ensure_state_dir

watchdog_pids() {
  local pid args
  while read -r pid; do
    [ -n "$pid" ] || continue
    args="$(ps -o args= -p "$pid" 2>/dev/null || true)"
    case "$args" in
      "bash $SCRIPT_DIR/watchdog.sh") printf '%s\n' "$pid" ;;
    esac
  done < <(pgrep -f 'watchdog\.sh' 2>/dev/null || true)
}

# PID files can become stale during a rebuild/reload race. More importantly,
# an orphan from an older buggy lifecycle can survive alongside the new
# watchdog and keep inherited file descriptors open. If duplicates are found,
# converge by terminating all watchdog instances and launching one fresh copy.
mapfile -t existing_pids < <(watchdog_pids)
if [ "${#existing_pids[@]}" -gt 1 ]; then
  log "duplicate watchdogs detected (${existing_pids[*]}); restarting singleton"
  for pid in "${existing_pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for _ in $(seq 1 20); do
    remaining=0
    for pid in "${existing_pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then remaining=1; fi
    done
    [ "$remaining" -eq 0 ] && break
    sleep 0.2
  done
  for pid in "${existing_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
  done
  rm -f "$WATCHDOG_PID_FILE"
  sleep 0.2
elif [ "${#existing_pids[@]}" -eq 1 ]; then
  pid="${existing_pids[0]}"
  printf '%s\n' "$pid" > "$WATCHDOG_PID_FILE"
  log "already running (PID $pid)"
  exit 0
fi

rotate_log_if_needed "$WATCHDOG_LOG_FILE"
nohup bash "$SCRIPT_DIR/watchdog.sh" >>"$WATCHDOG_LOG_FILE" 2>&1 </dev/null &
launched_pid=$!

# watchdog.sh owns creation of watchdog.pid only after it has acquired its
# singleton lock. Avoid writing the PID here; concurrent starters must never
# overwrite the winner's PID file with a losing child PID.
for _ in $(seq 1 30); do
  if [ -s "$WATCHDOG_PID_FILE" ]; then
    actual="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
    if [ -n "$actual" ] && kill -0 "$actual" 2>/dev/null; then
      case "$(ps -o args= -p "$actual" 2>/dev/null || true)" in
        "bash $SCRIPT_DIR/watchdog.sh")
          log "active watchdog detected (PID $actual)"
          exit 0
          ;;
      esac
    fi
  fi

  kill -0 "$launched_pid" 2>/dev/null || break
  sleep 0.1
done

log "ERROR: watchdog did not become active; see $WATCHDOG_LOG_FILE"
exit 30
