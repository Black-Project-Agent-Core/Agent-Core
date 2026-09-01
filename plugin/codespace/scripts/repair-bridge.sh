#!/usr/bin/env bash
set -euo pipefail

script_path="${BASH_SOURCE[0]}"
case "$script_path" in
  */*) script_dir="${script_path%/*}" ;;
  *) script_dir="." ;;
esac

inherited_lock_fd="${CODESPACE_RUNTIME_LOCK_FD:-9}"
[[ "$inherited_lock_fd" =~ ^[0-9]+$ ]] || exit 2
# Close lifecycle authority and clear ambient credentials using shell builtins
# before path resolution creates its first command-substitution subshell.
eval "exec ${inherited_lock_fd}>&-"
unset CONTROL_PLANE_API_KEY OPENAI_ADMIN_KEY
unset GITHUB_TOKEN GH_TOKEN
unset AGENT_CORE_GITHUB_TOKEN_FILE AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE AGENT_CORE_GITHUB_PACKAGES_TOKEN
unset AGENT_CORE_MEMORY_REMOTE_KEY_HEX AGENT_CORE_MEMORY_REMOTE_KEY_FILE
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_WRANGLER_OAUTH_CONFIG_B64
unset CODESPACE_MEMORY_CONTEXT_LEASE AGENT_CORE_MEMORY_CONTEXT_LEASE

ROOT="$(cd "$script_dir/.." && pwd -P)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd -P)"

MAX_TIMER_SECONDS="2147483.647"
LEAF_CONFIG_TIMEOUT_SECONDS="1"
local_mcp_ensure_timeout="${CODESPACE_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS:-1420}"
local_mcp_protocol_timeout="${CODESPACE_LOCAL_MCP_PROTOCOL_TIMEOUT_SECONDS:-15}"
runtime_lock_timeout="${CODESPACE_RUNTIME_LOCK_TIMEOUT_SECONDS:-30}"

# Parse and report the leaf's hard command-timeout contract in one itself-bounded
# subprocess. The watchdog executes this same contract in its regression suite.
leaf_budget_ms="$(timeout "$LEAF_CONFIG_TIMEOUT_SECONDS" node -e '
const [ensureRaw, protocolRaw, lockRaw, maximumRaw, configRaw] = process.argv.slice(1);
const maximum = Number(maximumRaw);
const values = [
  ["CODESPACE_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS", ensureRaw],
  ["CODESPACE_LOCAL_MCP_PROTOCOL_TIMEOUT_SECONDS", protocolRaw],
  ["CODESPACE_RUNTIME_LOCK_TIMEOUT_SECONDS", lockRaw],
];
for (const [name, raw] of values) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    console.error(`[codespace] ERROR: ${name} must be positive and at most ${maximumRaw} seconds.`);
    process.exit(2);
  }
}
process.stdout.write(String(Math.ceil(
  (Number(configRaw) + Number(ensureRaw) + Number(protocolRaw)) * 1000,
)));
' "$local_mcp_ensure_timeout" "$local_mcp_protocol_timeout" "$runtime_lock_timeout"   "$MAX_TIMER_SECONDS" "$LEAF_CONFIG_TIMEOUT_SECONDS")"

scope=""
reason=""
print_budget=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --print-budget-ms)
      print_budget=true
      shift
      ;;
    --scope)
      [[ $# -ge 2 ]] || exit 2
      scope="$2"
      shift 2
      ;;
    --reason)
      [[ $# -ge 2 ]] || exit 2
      reason="$2"
      shift 2
      ;;
    *)
      printf '%s\n' "Usage: $0 --scope local-mcp|reconcile|tunnel --reason SAFE_TOKEN" >&2
      exit 2
      ;;
  esac
done
if [[ "$print_budget" == true ]]; then
  [[ -z "$scope" && -z "$reason" ]] || exit 2
  printf '%s\n' "$leaf_budget_ms"
  exit 0
fi
case "$scope" in local-mcp|reconcile|tunnel) ;; *) exit 2 ;; esac
if [[ ! "$reason" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf '%s\n' "[codespace] ERROR: repair reason must be a safe token." >&2
  exit 2
fi

ensure_http_script="${CODESPACE_ENSURE_HTTP_MCP_SCRIPT:-$ROOT/scripts/ensure-http-mcp.sh}"
url_file="${CODESPACE_MCP_HTTP_URL_FILE:-$ROOT/runtime/state/http-mcp.url}"

(
  eval "exec ${inherited_lock_fd}>&-"
  timeout "$local_mcp_ensure_timeout" bash "$ensure_http_script"
)

[[ -f "$url_file" ]] || {
  printf '%s\n' "[codespace] ERROR: local MCP supervisor did not publish its URL." >&2
  exit 1
}
mcp_server_url="$(tr -d '\r\n' < "$url_file")"
if [[ ! "$mcp_server_url" =~ ^http://127\.0\.0\.1:[0-9]+/mcp$ ]]; then
  printf '%s\n' "[codespace] ERROR: local MCP URL is invalid." >&2
  exit 1
fi
if [[ -n "${CODESPACE_MCP_SERVER_URL:-}" && "$CODESPACE_MCP_SERVER_URL" != "$mcp_server_url" ]]; then
  printf '%s\n' "[codespace] ERROR: local MCP URL does not match the expected route." >&2
  exit 1
fi

if [[ -n "${CODESPACE_HTTP_PROTOCOL_PROBE_BIN:-}" ]]; then
  (
    eval "exec ${inherited_lock_fd}>&-"
    timeout "$local_mcp_protocol_timeout" "$CODESPACE_HTTP_PROTOCOL_PROBE_BIN" "$mcp_server_url"
  )
else
  (
    eval "exec ${inherited_lock_fd}>&-"
    timeout "$local_mcp_protocol_timeout" node "$ROOT/dist/http-probe.js" "$mcp_server_url" >/dev/null
  )
fi

if [[ "$scope" == local-mcp ]]; then
  printf '%s\n' "[codespace] repaired scope=local-mcp reason=$reason"
  exit 0
fi

runtime_api_key_file="${CODESPACE_RUNTIME_API_KEY_FILE:-$REPO_ROOT/secrets/github/CONTROL_PLANE_API_KEY}"
runtime_api_key_ref="${CODESPACE_RUNTIME_API_KEY_REF:-file:$runtime_api_key_file}"
if [[ "$runtime_api_key_ref" != "file:$runtime_api_key_file" || ! -s "$runtime_api_key_file" ]]; then
  printf '%s\n' "[codespace] ERROR: exact file-backed runtime credential is unavailable." >&2
  exit 1
fi

expected_tunnel_id="${CODESPACE_EXPECTED_TUNNEL_ID:-}"
if [[ -z "$expected_tunnel_id" ]]; then
  expected_tunnel_id="$(node -e '
const fs = require("node:fs");
try {
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (typeof value.tunnelId === "string") process.stdout.write(value.tunnelId);
} catch {}
' "$ROOT/config/tunnel.defaults.json")"
fi
[[ "$expected_tunnel_id" =~ ^tunnel_[A-Za-z0-9_-]+$ ]] || {
  printf '%s\n' "[codespace] ERROR: tracked tunnel identity is unavailable." >&2
  exit 1
}

lock_file="${CODESPACE_RUNTIME_LOCK_FILE:-${TMPDIR:-/tmp}/codespace-ensure-running.lock}"
exec {mutation_lock_fd}>"$lock_file"
if ! flock -w "$runtime_lock_timeout" "$mutation_lock_fd"; then
  printf '%s\n' "[codespace] ERROR: timed out waiting for bounded bridge mutation lock." >&2
  exit 1
fi

export CODESPACE_EXPECTED_TUNNEL_ID="$expected_tunnel_id"
export CODESPACE_MCP_SERVER_URL="$mcp_server_url"
export CODESPACE_RUNTIME_API_KEY_FILE="$runtime_api_key_file"
export CODESPACE_RUNTIME_API_KEY_REF="$runtime_api_key_ref"
export CODESPACE_RUNTIME_LOCK_FD="$mutation_lock_fd"

# shellcheck disable=SC1091
source "$ROOT/scripts/runtime-reconciliation.sh"
reconcile_args=(--phase manual)
[[ "$scope" == tunnel ]] && reconcile_args+=(--force-reconnect)
codespace_runtime_reconcile "${reconcile_args[@]}"
exec {mutation_lock_fd}>&-

printf '%s\n' "[codespace] repaired scope=$scope reason=$reason"
