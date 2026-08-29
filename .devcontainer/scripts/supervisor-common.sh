#!/usr/bin/env bash

# Shared helpers for the Codespace bridge lifecycle scripts.
# This file intentionally never prints secret values.

COMMON_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$COMMON_FILE")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# The Action bridge deliberately gives child commands an isolated HOME, so use
# the real Codespace user home explicitly unless an override is provided.
SUPERVISOR_HOME="${CODESPACE_SUPERVISOR_HOME:-/home/vscode/.codespace-supervisor}"
SUPERVISOR_STATE="$SUPERVISOR_HOME/state"
BRIDGE_PORT="${BRIDGE_PORT:-8787}"
BRIDGE_TOKEN_FILE="$SUPERVISOR_STATE/bridge.token"
BRIDGE_PID_FILE="$SUPERVISOR_STATE/bridge.pid"
BRIDGE_LOG_FILE="$SUPERVISOR_STATE/bridge.log"
WATCHDOG_PID_FILE="$SUPERVISOR_STATE/watchdog.pid"
WATCHDOG_LOG_FILE="$SUPERVISOR_STATE/watchdog.log"

load_codespaces_env() {
  # Lifecycle commands normally inherit these variables already. The shared
  # file is a safe fallback for commands launched later by a non-login shell.
  local env_file="/workspaces/.codespaces/shared/.env"
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$env_file"
    set +a
  fi
}

ensure_state_dir() {
  mkdir -p "$SUPERVISOR_STATE"
  chmod 700 "$SUPERVISOR_STATE"
}

bridge_token_available() {
  [ -s "$BRIDGE_TOKEN_FILE" ]
}

bridge_listener_pid() {
  local line
  line="$(ss -ltnp 2>/dev/null | grep "0.0.0.0:${BRIDGE_PORT}" | head -n1 || true)"
  printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p'
}

bridge_local_health() {
  bridge_token_available || return 1
  local body
  body="$(
    curl --connect-timeout 1 --max-time 3 -fsS \
      -H "Authorization: Bearer $(cat "$BRIDGE_TOKEN_FILE")" \
      "http://127.0.0.1:${BRIDGE_PORT}/health" \
      2>/dev/null
  )" || return 1
  printf '%s' "$body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
}

bridge_public_url() {
  [ -n "${CODESPACE_NAME:-}" ] || return 1
  [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ] || return 1
  printf 'https://%s-%s.%s/health\n' \
    "$CODESPACE_NAME" "$BRIDGE_PORT" "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"
}

bridge_public_health() {
  bridge_token_available || return 1
  local url body
  url="$(bridge_public_url)" || return 1
  body="$(
    curl --connect-timeout 2 --max-time 8 -fsS \
      -H "Authorization: Bearer $(cat "$BRIDGE_TOKEN_FILE")" \
      "$url" \
      2>/dev/null
  )" || return 1

  # A private Codespaces port can return an HTML authentication page with a
  # successful HTTP status. Require the bridge's JSON health marker so that a
  # private/login page can never be mistaken for a healthy public endpoint.
  printf '%s' "$body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
}

rotate_log_if_needed() {
  local file="$1"
  local max_bytes="${2:-8388608}"
  local keep_bytes="${3:-1048576}"
  [ -f "$file" ] || return 0
  local size
  size="$(stat -c '%s' "$file" 2>/dev/null || echo 0)"
  if [ "$size" -gt "$max_bytes" ]; then
    tail -c "$keep_bytes" "$file" > "${file}.tmp" || true
    mv -f "${file}.tmp" "$file"
  fi
}
