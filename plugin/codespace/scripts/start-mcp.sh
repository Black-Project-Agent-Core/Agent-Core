#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/runtime-environment.sh"
codespace_restore_original_path

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

exec node "$ROOT/dist/server.js"
