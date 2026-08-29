#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-10}"
PUBLIC_CHECK_INTERVAL="${PUBLIC_CHECK_INTERVAL:-45}"
CLAUDE_MEM_CHECK_INTERVAL="${CLAUDE_MEM_CHECK_INTERVAL:-60}"
CLAUDE_MEM_HOME="$SUPERVISOR_STATE/command-home"
WATCHDOG_LOCK_DIR="$SUPERVISOR_STATE/watchdog.lock.d"
WATCHDOG_LOCK_OWNER="$WATCHDOG_LOCK_DIR/pid"

log() { printf '%s [codespace-supervisor/watchdog] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

ensure_state_dir
load_codespaces_env

watchdog_process_is_live() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  case "$(ps -o args= -p "$pid" 2>/dev/null || true)" in
    *watchdog.sh*) return 0 ;;
    *) return 1 ;;
  esac
}

acquire_watchdog_lock() {
  local owner stale_dir
  for _ in 1 2 3 4; do
    if mkdir "$WATCHDOG_LOCK_DIR" 2>/dev/null; then
      printf '%s\n' "$$" > "$WATCHDOG_LOCK_OWNER"
      return 0
    fi

    owner="$(cat "$WATCHDOG_LOCK_OWNER" 2>/dev/null || true)"
    if watchdog_process_is_live "$owner"; then
      return 1
    fi

    stale_dir="${WATCHDOG_LOCK_DIR}.stale.$$.$RANDOM"
    if mv "$WATCHDOG_LOCK_DIR" "$stale_dir" 2>/dev/null; then
      rm -rf "$stale_dir"
    fi
    sleep 0.05
  done
  return 1
}

cleanup_watchdog() {
  local owner
  owner="$(cat "$WATCHDOG_LOCK_OWNER" 2>/dev/null || true)"
  if [ "$owner" = "$$" ]; then
    rm -rf "$WATCHDOG_LOCK_DIR"
  fi
  if [ "$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)" = "$$" ]; then
    rm -f "$WATCHDOG_PID_FILE"
  fi
}

if ! acquire_watchdog_lock; then
  exit 0
fi

printf '%s\n' "$$" > "$WATCHDOG_PID_FILE"
trap cleanup_watchdog EXIT INT TERM

refresh_codespaces_auth() {
  load_codespaces_env
  if [ -n "${GH_TOKEN:-}" ]; then
    export GH_TOKEN
  elif [ -n "${GITHUB_TOKEN:-}" ]; then
    export GH_TOKEN="$GITHUB_TOKEN"
  else
    unset GH_TOKEN || true
  fi
}

current_bridge_visibility() {
  refresh_codespaces_auth
  command -v gh >/dev/null 2>&1 || return 1
  [ -n "${GH_TOKEN:-}" ] || return 1
  [ -n "${CODESPACE_NAME:-}" ] || return 1

  timeout 10s gh codespace ports \
    -c "$CODESPACE_NAME" \
    --json sourcePort,visibility \
    --jq ".[] | select(.sourcePort == ${BRIDGE_PORT}) | .visibility" \
    2>/dev/null | head -n1
}

set_bridge_public_with_retries() {
  local attempt
  refresh_codespaces_auth
  if ! command -v gh >/dev/null 2>&1; then
    log "public repair skipped: gh is unavailable"
    return 1
  fi
  if [ -z "${GH_TOKEN:-}" ] || [ -z "${CODESPACE_NAME:-}" ]; then
    log "public repair skipped: Codespaces auth metadata is unavailable"
    return 1
  fi

  for attempt in 1 2 3; do
    if timeout 15s gh codespace ports visibility \
      "${BRIDGE_PORT}:public" \
      -c "$CODESPACE_NAME" \
      >/dev/null 2>&1; then
      sleep 1
      if [ "$(current_bridge_visibility || true)" = "public" ]; then
        return 0
      fi
    fi
    log "public visibility write attempt ${attempt}/3 failed"
    sleep "$attempt"
  done
  return 1
}

repair_public_visibility() {
  log "repairing port ${BRIDGE_PORT} visibility -> public"

  # Never transition the GPT Action port to private as a relay-refresh tactic.
  # If the subsequent public write failed, that could strand the bridge behind
  # GitHub's sign-in layer and make both GPT Action and Windows bootstrap
  # unreachable. Repeated idempotent public writes keep the failure mode safe.
  if ! set_bridge_public_with_retries; then
    return 1
  fi

  if bridge_public_health; then
    return 0
  fi

  log "port is public but relay health is still unavailable; retrying public registration"
  if ! set_bridge_public_with_retries; then
    return 1
  fi

  bridge_public_health
}

keep_claude_mem_alive() {
  command -v claude-mem >/dev/null 2>&1 || return 0
  mkdir -p "$CLAUDE_MEM_HOME"

  if ! HOME="$CLAUDE_MEM_HOME" timeout 5s claude-mem status 2>/dev/null | grep -q 'Worker is running'; then
    log "claude-mem worker is down; starting it"
    HOME="$CLAUDE_MEM_HOME" timeout 20s claude-mem start >/dev/null 2>&1 || \
      log "claude-mem start did not complete successfully"
  fi

  refresh_codespaces_auth
  if command -v gh >/dev/null 2>&1 && [ -n "${GH_TOKEN:-}" ] && [ -n "${CODESPACE_NAME:-}" ]; then
    timeout 8s gh codespace ports visibility 37700:private -c "$CODESPACE_NAME" \
      >/dev/null 2>&1 || true
  fi
}

log "started (PID $$, interval=${WATCHDOG_INTERVAL}s)"
last_public_check=0
last_claude_mem_check=0

while true; do
  now="$(date +%s)"
  printf '%s\n' "$now" > "$SUPERVISOR_STATE/watchdog.heartbeat"

  if ! bridge_local_health; then
    sleep 1
    if ! bridge_local_health; then
      log "local /health failed twice; invoking bridge self-repair"
      if "$SCRIPT_DIR/bridge-start.sh" >/dev/null 2>&1 && bridge_local_health; then
        log "bridge local health recovered"
      else
        log "bridge restart attempt failed or health is still unavailable"
      fi
    fi
  fi

  if [ $((now - last_public_check)) -ge "$PUBLIC_CHECK_INTERVAL" ]; then
    last_public_check="$now"
    if bridge_local_health; then
      visibility="$(current_bridge_visibility || true)"
      if [ "$visibility" != "public" ]; then
        log "port ${BRIDGE_PORT} visibility is ${visibility:-unknown}; repairing"
        if repair_public_visibility; then
          log "port ${BRIDGE_PORT} is public and bridge health is reachable"
        else
          log "public visibility repair failed; will retry on next cycle"
        fi
      elif ! bridge_public_health; then
        log "port ${BRIDGE_PORT} is public but /health is unavailable"
        if repair_public_visibility; then
          log "public bridge recovered"
        else
          log "public relay repair failed; port remains public and will retry on next cycle"
        fi
      fi
    fi
  fi

  if [ $((now - last_claude_mem_check)) -ge "$CLAUDE_MEM_CHECK_INTERVAL" ]; then
    last_claude_mem_check="$now"
    keep_claude_mem_alive || true
  fi

  rotate_log_if_needed "$BRIDGE_LOG_FILE"
  rotate_log_if_needed "$WATCHDOG_LOG_FILE"
  sleep "$WATCHDOG_INTERVAL"
done
