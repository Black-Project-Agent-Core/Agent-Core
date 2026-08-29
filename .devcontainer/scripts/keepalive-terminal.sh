#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

load_codespaces_env
ensure_state_dir

interval="${CODESPACE_KEEPALIVE_INTERVAL_SECONDS:-300}"
case "$interval" in
  ''|*[!0-9]*)
    echo '[codespace-keepalive] invalid CODESPACE_KEEPALIVE_INTERVAL_SECONDS' >&2
    exit 2
    ;;
esac
if [ "$interval" -lt 60 ]; then
  echo '[codespace-keepalive] interval must be at least 60 seconds' >&2
  exit 2
fi

pid_file="$SUPERVISOR_STATE/keepalive.pid"
lock_file="$SUPERVISOR_STATE/keepalive.lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  existing="$(cat "$pid_file" 2>/dev/null || true)"
  printf '[codespace-keepalive] already running%s\n' "${existing:+ (PID $existing)}"
  exit 0
fi

cleanup() {
  current="$(cat "$pid_file" 2>/dev/null || true)"
  if [ "$current" = "$$" ]; then
    rm -f "$pid_file"
  fi
}
trap cleanup EXIT INT TERM
printf '%s\n' "$$" > "$pid_file"

printf '[codespace-active] started pid=%s interval=%ss at %s\n' "$$" "$interval" "$(date -Is)"
while true; do
  watchdog="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
  if [ -z "$watchdog" ] || ! kill -0 "$watchdog" 2>/dev/null; then
    # fd 9 owns keepalive.lock. Never let a long-lived watchdog inherit it;
    # otherwise the lock can remain held after keepalive exits and all future
    # keepalive launches will incorrectly report "already running".
    "$SCRIPT_DIR/watchdog-start.sh" 9>&- >/dev/null 2>&1 || true
  fi

  listener="$(bridge_listener_pid)"
  watchdog="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
  bridge_state='DOWN'
  watchdog_state='DOWN'
  if [ -n "$listener" ] && bridge_local_health; then
    bridge_state='OK'
  fi
  if [ -n "$watchdog" ] && kill -0 "$watchdog" 2>/dev/null; then
    watchdog_state='OK'
  fi

  printf '[codespace-active] %s bridge=%s watchdog=%s\n' \
    "$(date -Is)" "$bridge_state" "$watchdog_state"
  sleep "$interval"
done
