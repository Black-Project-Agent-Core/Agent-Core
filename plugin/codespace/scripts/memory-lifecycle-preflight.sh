#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
export AGENT_CORE_REPO_ROOT="$REPO_ROOT"
# shellcheck disable=SC1091
source "$REPO_ROOT/scripts/codespace/common.sh"

prepare_codespace_memory_lifecycle() {
  local lifecycle_mode="${CODESPACE_MEMORY_LIFECYCLE_MODE:-${AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE:-advisory}}"
  case "$lifecycle_mode" in
    disabled|advisory|enforce) ;;
    *)
      printf '%s\n' "[codespace] ERROR: AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE must be disabled, advisory, or enforce." >&2
      return 54
      ;;
  esac

  export CODESPACE_MEMORY_LIFECYCLE_MODE="$lifecycle_mode"
  if [[ "$lifecycle_mode" == "disabled" ]]; then
    unset CODESPACE_AGENT_CORE_MEMORY_LEASE_URL
    printf '%s\n' "[codespace] memory lifecycle adapter disabled; Phase-2 hydration coupling is not required for bridge mutation readiness."
    return 0
  fi

  # Export only the existing Phase-2 gate's path/config defaults into its child.
  # This script never implements hydration, journal replay, marker verification, or SQLite installation itself.
  export AGENT_CORE_REPO_ROOT
  export AGENT_CORE_CODESPACE_HOME
  export AGENT_CORE_MEMORY_DB_PATH
  export AGENT_CORE_MEMORY_REMOTE_KEY_FILE
  export AGENT_CORE_MEMORY_REMOTE_WORK_ROOT
  export AGENT_CORE_MEMORY_REMOTE_PROJECT_ID
  export AGENT_CORE_MEMORY_REMOTE_HYDRATION_MARKER

  if ! bash "$REPO_ROOT/scripts/codespace/memory-hydration-gate.sh"; then
    printf '%s\n' "[codespace] ERROR: existing Phase-2 Memory Remote hydration gate rejected bridge mutation readiness." >&2
    return 55
  fi

  local service_port
  service_port="$(agent_core_service_port)"
  export CODESPACE_AGENT_CORE_MEMORY_LEASE_URL="http://127.0.0.1:${service_port}/internal/memory-context-lease"

  if [[ "$lifecycle_mode" == "enforce" ]]; then
    command -v curl >/dev/null 2>&1 || {
      printf '%s\n' "[codespace] ERROR: curl is required for enforce-mode lifecycle authority readiness." >&2
      return 56
    }
    local request_body response_body
    request_body="$(node -e 'process.stdout.write(JSON.stringify({action:"before",toolName:"execute_command",workspaceRoot:process.argv[1],input:{command:"pwd"}}))' "$REPO_ROOT")"
    if ! response_body="$(curl --noproxy '*' --fail --silent --show-error --max-time 2 \
      -H 'content-type: application/json' \
      -H 'accept: application/json' \
      --data "$request_body" \
      "$CODESPACE_AGENT_CORE_MEMORY_LEASE_URL" 2>/dev/null)"; then
      printf '%s\n' "[codespace] ERROR: MEMORY_CONTEXT_LEASE_ENDPOINT_UNAVAILABLE in enforce mode." >&2
      return 56
    fi
    if ! RESPONSE_BODY="$response_body" node -e '
      try {
        const body = JSON.parse(process.env.RESPONSE_BODY || "{}");
        process.exit(body.ok === true && body.mode === "enforce" && body.required === false && body.valid === true ? 0 : 1);
      } catch { process.exit(1); }
    '; then
      printf '%s\n' "[codespace] ERROR: MEMORY_CONTEXT_LEASE_ENDPOINT_UNAVAILABLE: enforce-mode loopback authority returned an invalid readiness decision." >&2
      return 56
    fi
    printf '%s\n' "[codespace] memory lifecycle adapter prepared in enforce mode via verified local Agent Core authority."
    return 0
  fi

  printf '%s\n' "[codespace] memory lifecycle adapter configured in advisory mode; authority health is evaluated per operation."
}

if prepare_codespace_memory_lifecycle; then
  :
else
  status=$?
  if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    exit "$status"
  fi
  return "$status"
fi
