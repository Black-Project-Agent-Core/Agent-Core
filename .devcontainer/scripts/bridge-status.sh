#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

load_codespaces_env
ensure_state_dir

listener="$(bridge_listener_pid)"
watchdog="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
keepalive_pid_file="$SUPERVISOR_STATE/keepalive.pid"
keepalive="$(cat "$keepalive_pid_file" 2>/dev/null || true)"
lifecycle_log_file="$SUPERVISOR_STATE/lifecycle.log"

printf 'bridge_listener_pid=%s\n' "${listener:-none}"
if bridge_local_health; then
  echo 'local_health=OK'
else
  echo 'local_health=FAIL'
fi

if [ -n "$watchdog" ] && kill -0 "$watchdog" 2>/dev/null && \
   ps -o args= -p "$watchdog" 2>/dev/null | grep -q 'watchdog.sh'; then
  printf 'watchdog_pid=%s\n' "$watchdog"
  echo 'watchdog=RUNNING'
else
  echo 'watchdog=STOPPED'
fi

if [ -n "$keepalive" ] && kill -0 "$keepalive" 2>/dev/null && \
   ps -o args= -p "$keepalive" 2>/dev/null | grep -q 'keepalive-terminal.sh'; then
  printf 'terminal_keepalive_pid=%s\n' "$keepalive"
  echo 'terminal_keepalive=RUNNING'
else
  echo 'terminal_keepalive=STOPPED'
fi

if [ -s "$lifecycle_log_file" ]; then
  printf 'lifecycle_last=%s\n' "$(tail -n 1 "$lifecycle_log_file")"
else
  echo 'lifecycle_last=none'
fi

if [ -n "${CODESPACE_NAME:-}" ] && command -v gh >/dev/null 2>&1; then
  if [ -n "${GH_TOKEN:-}" ]; then
    export GH_TOKEN
  elif [ -n "${GITHUB_TOKEN:-}" ]; then
    export GH_TOKEN="$GITHUB_TOKEN"
  fi
  visibility="$(
    timeout 8s gh codespace ports \
      -c "$CODESPACE_NAME" \
      --json sourcePort,visibility \
      --jq ".[] | select(.sourcePort == ${BRIDGE_PORT}) | .visibility" \
      2>/dev/null | head -n1 || true
  )"
  printf 'port_visibility=%s\n' "${visibility:-unknown}"
fi

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  if bridge_public_health; then
    echo 'public_health=OK'
  else
    echo 'public_health=FAIL'
  fi
fi

CLAUDE_MEM_BIN=/workspaces/.assistant-tools/npm-global/bin/claude-mem
if [ -x "$CLAUDE_MEM_BIN" ]; then
  if HOME="$SUPERVISOR_STATE/command-home" \
     BUN=/workspaces/.assistant-tools/npm-global/bin/bun \
     PATH="/workspaces/.assistant-tools/bin:/workspaces/.assistant-tools/npm-global/bin:$PATH" \
     timeout --foreground 8s "$CLAUDE_MEM_BIN" status </dev/null 2>/dev/null | grep -q 'Worker is running'; then
    echo 'claude_mem=RUNNING'
  else
    echo 'claude_mem=STOPPED_OR_UNAVAILABLE'
  fi
fi

# The Windows gateway's pairing/root policy must survive a Full Rebuild. The
# bridge always points this state at /workspaces, not the ephemeral supervisor
# home. Surface only non-secret root-policy metadata so recovery can distinguish
# "relay disconnected" from "persistent policy was lost" without opening or
# printing credentials.
WINDOWS_GATEWAY_STATE_DIR="${WINDOWS_GATEWAY_STATE_DIR:-/workspaces/.assistant-tools/state/windows-gateway}"
WINDOWS_MACHINE_FILE="$WINDOWS_GATEWAY_STATE_DIR/machine.json"
printf 'windows_gateway_state_dir=%s\n' "$WINDOWS_GATEWAY_STATE_DIR"
if [ -s "$WINDOWS_MACHINE_FILE" ]; then
  echo 'windows_gateway_state=PRESENT'
  python3 - "$WINDOWS_MACHINE_FILE" <<'PY'
import json
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
try:
    data = json.loads(p.read_text(encoding="utf-8"))
except Exception:
    print("windows_gateway_state_parse=FAIL")
    raise SystemExit(0)

configured = [str(x) for x in data.get("configuredAllowedRoots", [])]
advertised = [str(x) for x in data.get("allowedRoots", [])]
print("windows_configured_roots=" + ("|".join(configured) if configured else "none"))
print("windows_advertised_roots=" + ("|".join(advertised) if advertised else "none"))
match = bool(configured) and [x.casefold() for x in configured] == [x.casefold() for x in advertised]
print("windows_root_policy_match=" + ("YES" if match else "NO"))
PY
else
  echo 'windows_gateway_state=MISSING'
  echo 'windows_configured_roots=none'
  echo 'windows_advertised_roots=none'
  echo 'windows_root_policy_match=NO'
fi
