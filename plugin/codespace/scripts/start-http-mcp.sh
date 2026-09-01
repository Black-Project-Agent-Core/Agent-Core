#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/runtime-environment.sh"
codespace_restore_original_path

# Never let a long-lived tmux child retain the parent lifecycle flock.
exec 9>&-

unset CONTROL_PLANE_API_KEY
unset OPENAI_ADMIN_KEY
unset GITHUB_TOKEN
unset GH_TOKEN
unset AGENT_CORE_GITHUB_TOKEN_FILE
unset AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE
unset AGENT_CORE_GITHUB_PACKAGES_TOKEN
unset AGENT_CORE_MEMORY_REMOTE_KEY_HEX
unset AGENT_CORE_MEMORY_REMOTE_KEY_FILE
unset CLOUDFLARE_API_TOKEN
unset CLOUDFLARE_WRANGLER_OAUTH_CONFIG_B64
unset CODESPACE_MEMORY_CONTEXT_LEASE
unset AGENT_CORE_MEMORY_CONTEXT_LEASE

export CODESPACE_MCP_HTTP_HOST="${CODESPACE_MCP_HTTP_HOST:-127.0.0.1}"
export CODESPACE_MCP_HTTP_PORT="${CODESPACE_MCP_HTTP_PORT:-38765}"
export CODESPACE_MCP_HTTP_URL_FILE="${CODESPACE_MCP_HTTP_URL_FILE:-$ROOT/runtime/state/http-mcp.url}"
export CODESPACE_MCP_HTTP_LIFECYCLE_FILE="${CODESPACE_MCP_HTTP_LIFECYCLE_FILE:-$ROOT/runtime/state/http-mcp.lifecycle.json}"
export CODESPACE_MEMORY_LIFECYCLE_MODE="${CODESPACE_MEMORY_LIFECYCLE_MODE:-disabled}"
export CODESPACE_AGENT_CORE_MEMORY_LEASE_URL="${CODESPACE_AGENT_CORE_MEMORY_LEASE_URL:-}"
export CODESPACE_MEMORY_LEASE_TIMEOUT_MS="${CODESPACE_MEMORY_LEASE_TIMEOUT_MS:-2000}"

umask 077
mkdir -p "$(dirname "$CODESPACE_MCP_HTTP_LIFECYCLE_FILE")"
node - "$CODESPACE_MCP_HTTP_LIFECYCLE_FILE" "$CODESPACE_MEMORY_LIFECYCLE_MODE" "$CODESPACE_AGENT_CORE_MEMORY_LEASE_URL" "$CODESPACE_MEMORY_LEASE_TIMEOUT_MS" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [target, mode, rawEndpoint, timeoutRaw] = process.argv.slice(2);
const endpoint = rawEndpoint || null;
const temporary = `${target}.${process.pid}.tmp`;
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, mode, endpoint, timeoutMs: Number(timeoutRaw) })}\n`, { mode: 0o600 });
fs.renameSync(temporary, target);
fs.chmodSync(target, 0o600);
NODE

exec node "$ROOT/dist/http-server.js"
