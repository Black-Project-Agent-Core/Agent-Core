#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
export AGENT_CORE_REPO_ROOT="$REPO_ROOT"
# shellcheck disable=SC1091
source "$REPO_ROOT/scripts/codespace/common.sh"

probe_memory_lease_authority() {
  local lifecycle_mode="$1"
  local request_body response_body
  request_body="$(node -e 'process.stdout.write(JSON.stringify({action:"before",toolName:"execute_command",workspaceRoot:process.argv[1],input:{command:"pwd"}}))' "$REPO_ROOT")"
  response_body="$(curl --noproxy '*' --fail --silent --show-error --max-time 2 \
    -H 'content-type: application/json' \
    -H 'accept: application/json' \
    --data "$request_body" \
    "$CODESPACE_AGENT_CORE_MEMORY_LEASE_URL" 2>/dev/null)" || return 1
  RESPONSE_BODY="$response_body" EXPECTED_MODE="$lifecycle_mode" node -e '
    try {
      const body = JSON.parse(process.env.RESPONSE_BODY || "{}");
      process.exit(body.ok === true
        && body.mode === process.env.EXPECTED_MODE
        && body.required === false
        && body.valid === true ? 0 : 1);
    } catch { process.exit(1); }
  '
}

probe_shared_memory_authority() {
  local lifecycle_mode="$1"
  local request_body response_body
  request_body="$(node -e 'process.stdout.write(JSON.stringify({action:"status",workspaceRoot:process.argv[1]}))' "$REPO_ROOT")"
  response_body="$(curl --noproxy '*' --fail --silent --show-error --max-time 2 \
    -H 'content-type: application/json' \
    -H 'accept: application/json' \
    --data "$request_body" \
    "$CODESPACE_AGENT_CORE_SHARED_MEMORY_URL" 2>/dev/null)" || return 1
  RESPONSE_BODY="$response_body" EXPECTED_MODE="$lifecycle_mode" node -e '
    try {
      const body = JSON.parse(process.env.RESPONSE_BODY || "{}");
      const result = body.result;
      process.exit(body.ok === true
        && result && typeof result === "object"
        && result.enabled === true
        && result.healthy === true
        && result.lifecycleMode === process.env.EXPECTED_MODE ? 0 : 1);
    } catch { process.exit(1); }
  '
}

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
    unset CODESPACE_AGENT_CORE_SHARED_MEMORY_URL
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
  export CODESPACE_AGENT_CORE_SHARED_MEMORY_URL="http://127.0.0.1:${service_port}/internal/codespace-memory"
  export CODESPACE_SHARED_MEMORY_TIMEOUT_MS="${CODESPACE_SHARED_MEMORY_TIMEOUT_MS:-2000}"

  if ! command -v curl >/dev/null 2>&1; then
    if [[ "$lifecycle_mode" == "enforce" ]]; then
      printf '%s\n' "[codespace] ERROR: curl is required for enforce-mode memory authority readiness." >&2
      return 56
    fi
    printf '%s\n' "[codespace] NOTICE: MEMORY_CONTEXT_LEASE_ENDPOINT_DEGRADED: curl is unavailable; advisory mode remains non-blocking."
    printf '%s\n' "[codespace] NOTICE: SHARED_MEMORY_AUTHORITY_DEGRADED: curl is unavailable; advisory memory tools will report authority errors."
    printf '%s\n' "[codespace] memory lifecycle adapter configured in advisory mode; authority health is degraded."
    return 0
  fi

  local lease_ready=0
  local shared_ready=0
  probe_memory_lease_authority "$lifecycle_mode" && lease_ready=1 || true
  probe_shared_memory_authority "$lifecycle_mode" && shared_ready=1 || true

  if [[ "$lifecycle_mode" == "enforce" ]]; then
    if (( lease_ready != 1 )); then
      printf '%s\n' "[codespace] ERROR: MEMORY_CONTEXT_LEASE_ENDPOINT_UNAVAILABLE in enforce mode." >&2
      return 56
    fi
    if (( shared_ready != 1 )); then
      printf '%s\n' "[codespace] ERROR: SHARED_MEMORY_AUTHORITY_UNAVAILABLE in enforce mode." >&2
      return 56
    fi
    printf '%s\n' "[codespace] shared-memory authority verified through the local Agent Core endpoint."
    printf '%s\n' "[codespace] memory lifecycle adapter prepared in enforce mode via verified local Agent Core authority."
    return 0
  fi

  if (( lease_ready != 1 )); then
    printf '%s\n' "[codespace] NOTICE: MEMORY_CONTEXT_LEASE_ENDPOINT_DEGRADED: advisory mode remains non-blocking."
  fi
  if (( shared_ready != 1 )); then
    printf '%s\n' "[codespace] NOTICE: SHARED_MEMORY_AUTHORITY_DEGRADED: advisory memory tools will report authority errors until Agent Core recovers."
  else
    printf '%s\n' "[codespace] shared-memory authority verified through the local Agent Core endpoint."
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
