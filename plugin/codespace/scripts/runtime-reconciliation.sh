#!/usr/bin/env bash

codespace_runtime_reconcile_usage() {
  printf '%s\n' "Usage: runtime-reconciliation.sh --phase create|start|attach|manual [--force-reconnect]" >&2
}

codespace_runtime_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

codespace_runtime_nonnegative_number() {
  [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]]
}

codespace_runtime_positive_number() {
  codespace_runtime_nonnegative_number "$1" || return 1
  [[ ! "$1" =~ ^0+([.]0+)?$ ]]
}

codespace_runtime_validate_configuration() {
  local value
  for value in \
    "${CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS:-3}" \
    "${CODESPACE_CONNECT_MAX_ATTEMPTS:-5}" \
    "${CODESPACE_DOCTOR_MAX_ATTEMPTS:-3}"; do
    codespace_runtime_positive_integer "$value" || return 1
  done
  for value in \
    "${CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS:-1}" \
    "${CODESPACE_CONNECT_RETRY_DELAY_SECONDS:-1}" \
    "${CODESPACE_DOCTOR_RETRY_DELAY_SECONDS:-1}"; do
    codespace_runtime_nonnegative_number "$value" || return 1
  done
  for value in \
    "${CODESPACE_RUNTIME_STATUS_TIMEOUT_SECONDS:-5}" \
    "${CODESPACE_STOP_TIMEOUT_SECONDS:-5}" \
    "${CODESPACE_CONNECT_TIMEOUT_SECONDS:-15}" \
    "${CODESPACE_DOCTOR_TIMEOUT_SECONDS:-15}"; do
    codespace_runtime_positive_number "$value" || return 1
  done
}

codespace_runtime_close_lifecycle_fd() {
  local fd="${CODESPACE_RUNTIME_LOCK_FD:-9}"
  if [[ "$fd" =~ ^[0-9]+$ ]]; then
    eval "exec ${fd}>&-"
  fi
}

# Returns 0 for exact healthy, 1 for readable/proven unhealthy, and 2 when the
# payload cannot safely establish either state. The status payload is sent only
# over stdin so unexpected runtime fields never enter a child environment.
codespace_runtime_classify_status() {
  local status_json="$1"
  printf '%s' "$status_json" | \
  EXPECTED_TUNNEL_ID="$2" \
  EXPECTED_MCP_SERVER_URL="$3" \
  EXPECTED_RUNTIME_API_KEY_REF="$4" \
  node -e '
const fs = require("node:fs");
let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(2);
}
if (!payload || typeof payload !== "object" || Array.isArray(payload)) process.exit(2);
const requiredTypes = [
  ["process_running", "boolean"],
  ["healthy", "boolean"],
  ["ready", "boolean"],
  ["runtime_state", "string"],
  ["stale", "boolean"],
  ["tunnel_id", "string"],
  ["remote_lookup_attempted", "boolean"],
  ["remote_error", "string"],
];
for (const [key, type] of requiredTypes) {
  if (typeof payload[key] !== type) process.exit(2);
}
if (!payload.remote || typeof payload.remote !== "object" || typeof payload.remote.id !== "string") {
  process.exit(2);
}
if (!payload.process || typeof payload.process !== "object"
  || typeof payload.process.target_kind !== "string"
  || typeof payload.process.target_value !== "string") {
  process.exit(2);
}
if (payload.remote_lookup_auth_ref !== undefined
  && typeof payload.remote_lookup_auth_ref !== "string") {
  process.exit(2);
}
const healthy =
  payload.process_running === true
  && payload.healthy === true
  && payload.ready === true
  && payload.runtime_state === "ready"
  && payload.stale === false
  && payload.tunnel_id === process.env.EXPECTED_TUNNEL_ID
  && payload.remote_lookup_attempted === true
  && payload.remote_error === ""
  && payload.remote.id === process.env.EXPECTED_TUNNEL_ID
  && payload.remote_lookup_auth_ref === process.env.EXPECTED_RUNTIME_API_KEY_REF
  && payload.process.target_kind === "server_url"
  && payload.process.target_value === process.env.EXPECTED_MCP_SERVER_URL;
process.exit(healthy ? 0 : 1);
'
}

# Sets CODESPACE_RUNTIME_STATUS_CLASS to healthy, unhealthy, or unknown.
codespace_runtime_read_status() {
  local bin="$1" alias_name="$2" tunnel_id="$3" mcp_server_url="$4" runtime_api_key_ref="$5"
  local stop_on_unhealthy="$6"
  local max_attempts="${CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS:-3}"
  local retry_delay="${CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS:-1}"
  local command_timeout="${CODESPACE_RUNTIME_STATUS_TIMEOUT_SECONDS:-5}"
  codespace_runtime_positive_integer "$max_attempts" || return 2
  codespace_runtime_nonnegative_number "$retry_delay" || return 2
  codespace_runtime_positive_number "$command_timeout" || return 2

  CODESPACE_RUNTIME_STATUS_CLASS=unknown
  local attempt status_json status_rc classify_rc
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    status_json=""
    status_rc=0
    status_json="$(
      (
        codespace_runtime_close_lifecycle_fd
        timeout "$command_timeout" "$bin" runtimes status "$alias_name" --json
      ) 2>/dev/null
    )" || status_rc=$?
    if [[ "$status_rc" -eq 0 && -n "$status_json" ]]; then
      classify_rc=0
      codespace_runtime_classify_status \
        "$status_json" "$tunnel_id" "$mcp_server_url" "$runtime_api_key_ref" || classify_rc=$?
      case "$classify_rc" in
        0)
          CODESPACE_RUNTIME_STATUS_CLASS=healthy
          return 0
          ;;
        1)
          CODESPACE_RUNTIME_STATUS_CLASS=unhealthy
          if [[ "$stop_on_unhealthy" == true ]]; then
            return 1
          fi
          ;;
        *)
          CODESPACE_RUNTIME_STATUS_CLASS=unknown
          ;;
      esac
    fi
    if (( attempt < max_attempts )); then
      sleep "$retry_delay"
    fi
  done
  [[ "$CODESPACE_RUNTIME_STATUS_CLASS" == unhealthy ]] && return 1
  return 2
}

codespace_runtime_reconcile() {
  local phase="" force_reconnect=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --phase)
        [[ $# -ge 2 ]] || { codespace_runtime_reconcile_usage; return 2; }
        phase="$2"
        shift 2
        ;;
      --force-reconnect)
        force_reconnect=true
        shift
        ;;
      *)
        codespace_runtime_reconcile_usage
        return 2
        ;;
    esac
  done
  case "$phase" in create|start|attach|manual) ;; *) codespace_runtime_reconcile_usage; return 2 ;; esac

  local script_root package_root bin profile_name profile_dir state_dir alias_name
  script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  package_root="$(cd "$script_root/.." && pwd)"
  bin="${CODESPACE_TUNNEL_CLIENT_BIN:-$package_root/runtime/bin/tunnel-client}"
  profile_name="${CODESPACE_PROFILE_NAME:-codespace}"
  profile_dir="${CODESPACE_PROFILE_DIR:-$package_root/runtime/profiles}"
  state_dir="${TUNNEL_CLIENT_STATE_DIR:-$package_root/runtime/state}"
  alias_name="${CODESPACE_TUNNEL_ALIAS:-codespace}"

  local tunnel_id="${CODESPACE_EXPECTED_TUNNEL_ID:-}"
  local mcp_server_url="${CODESPACE_MCP_SERVER_URL:-}"
  local runtime_api_key_file="${CODESPACE_RUNTIME_API_KEY_FILE:-}"
  local runtime_api_key_ref="${CODESPACE_RUNTIME_API_KEY_REF:-}"
  if [[ -z "$tunnel_id" || -z "$mcp_server_url" || -z "$runtime_api_key_file" ]]; then
    printf '%s\n' "[codespace] ERROR: runtime reconciliation inputs are incomplete." >&2
    return 1
  fi
  if [[ "$runtime_api_key_ref" != "file:$runtime_api_key_file" ]]; then
    printf '%s\n' "[codespace] ERROR: runtime credential reference must exactly match its file path." >&2
    return 1
  fi
  if ! codespace_runtime_validate_configuration; then
    printf '%s\n' "[codespace] ERROR: runtime retry counts/delays/timeouts are invalid." >&2
    return 2
  fi

  unset CONTROL_PLANE_API_KEY
  export TUNNEL_CLIENT_STATE_DIR="$state_dir"

  local initial_rc=0
  codespace_runtime_read_status \
    "$bin" "$alias_name" "$tunnel_id" "$mcp_server_url" "$runtime_api_key_ref" true || initial_rc=$?
  if [[ "$force_reconnect" != true ]]; then
    case "$initial_rc" in
      0) return 0 ;;
      1) ;;
      *)
        printf '%s\n' "[codespace] ERROR: runtime status remained unknown; refusing destructive recovery." >&2
        return 1
        ;;
    esac
  fi

  (
    codespace_runtime_close_lifecycle_fd
    timeout "${CODESPACE_STOP_TIMEOUT_SECONDS:-5}" "$bin" runtimes stop "$alias_name"
  ) >/dev/null 2>&1 || true

  local connect_max_attempts="${CODESPACE_CONNECT_MAX_ATTEMPTS:-5}"
  local connect_retry_delay="${CODESPACE_CONNECT_RETRY_DELAY_SECONDS:-1}"
  local connect_timeout="${CODESPACE_CONNECT_TIMEOUT_SECONDS:-15}"
  codespace_runtime_positive_integer "$connect_max_attempts" || return 2
  codespace_runtime_nonnegative_number "$connect_retry_delay" || return 2
  codespace_runtime_positive_number "$connect_timeout" || return 2

  local connect_rc=1 connect_attempt
  for ((connect_attempt = 1; connect_attempt <= connect_max_attempts; connect_attempt++)); do
    connect_rc=0
    (
      codespace_runtime_close_lifecycle_fd
      # shellcheck disable=SC1091
      source "$package_root/scripts/runtime-environment.sh"
      codespace_prepare_process_runtime "$package_root"
      timeout "$connect_timeout" "$bin" runtimes connect \
        --alias "$alias_name" \
        --tunnel-id "$tunnel_id" \
        --profile "$profile_name" \
        --profile-dir "$profile_dir" \
        --runtime-api-key "$runtime_api_key_ref" \
        --mcp-server-url "$mcp_server_url"
    ) >/dev/null 2>&1 || connect_rc=$?
    if [[ "$connect_rc" -eq 0 || "$connect_rc" -eq 2 ]]; then
      break
    fi
    printf '%s\n' "[codespace] NOTICE: managed runtime connect attempt $connect_attempt/$connect_max_attempts failed (rc=$connect_rc)." >&2
    (( connect_attempt < connect_max_attempts )) && sleep "$connect_retry_delay"
  done
  if [[ "$connect_rc" -ne 0 && "$connect_rc" -ne 2 ]]; then
    printf '%s\n' "[codespace] ERROR: managed runtime connect failed after $connect_max_attempts attempts." >&2
    return "$connect_rc"
  fi

  local final_rc=0
  codespace_runtime_read_status \
    "$bin" "$alias_name" "$tunnel_id" "$mcp_server_url" "$runtime_api_key_ref" false || final_rc=$?
  if [[ "$final_rc" -ne 0 ]]; then
    printf '%s\n' "[codespace] ERROR: managed runtime final status is not exactly healthy." >&2
    return 1
  fi

  local doctor_max_attempts="${CODESPACE_DOCTOR_MAX_ATTEMPTS:-3}"
  local doctor_retry_delay="${CODESPACE_DOCTOR_RETRY_DELAY_SECONDS:-1}"
  local doctor_timeout="${CODESPACE_DOCTOR_TIMEOUT_SECONDS:-15}"
  codespace_runtime_positive_integer "$doctor_max_attempts" || return 2
  codespace_runtime_nonnegative_number "$doctor_retry_delay" || return 2
  codespace_runtime_positive_number "$doctor_timeout" || return 2
  local doctor_rc=1 doctor_attempt
  for ((doctor_attempt = 1; doctor_attempt <= doctor_max_attempts; doctor_attempt++)); do
    doctor_rc=0
    (
      codespace_runtime_close_lifecycle_fd
      timeout "$doctor_timeout" "$bin" doctor \
        --profile "$profile_name" \
        --profile-dir "$profile_dir" \
        --explain
    ) >/dev/null 2>&1 || doctor_rc=$?
    [[ "$doctor_rc" -eq 0 ]] && break
    (( doctor_attempt < doctor_max_attempts )) && sleep "$doctor_retry_delay"
  done
  if [[ "$doctor_rc" -ne 0 ]]; then
    printf '%s\n' "[codespace] ERROR: doctor failed after $doctor_max_attempts attempts." >&2
    return "$doctor_rc"
  fi
}

# Preserve the previous exported function name for source consumers.
codespace_runtime_reconcile_legacy() {
  codespace_runtime_reconcile "$@"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  codespace_runtime_reconcile "$@"
fi
