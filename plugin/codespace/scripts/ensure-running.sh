#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
BIN="$ROOT/runtime/bin/tunnel-client"
PROFILE_NAME="codespace"
PROFILE_DIR="$ROOT/runtime/profiles"
PROFILE_FILE="$PROFILE_DIR/$PROFILE_NAME.yaml"
STATE_DIR="$ROOT/runtime/state"
ALIAS="codespace"

PHASE=""
FORCE_RECONNECT=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)
      [[ $# -ge 2 ]] || {
        printf '%s\n' "Usage: $0 --phase create|start|attach|manual [--force-reconnect]" >&2
        exit 2
      }
      PHASE="$2"
      shift 2
      ;;
    --force-reconnect)
      FORCE_RECONNECT=true
      shift
      ;;
    *)
      printf '%s\n' "Usage: $0 --phase create|start|attach|manual [--force-reconnect]" >&2
      exit 2
      ;;
  esac
done

case "$PHASE" in
  create|start|attach|manual) ;;
  *)
    printf '%s\n' "Usage: $0 --phase create|start|attach|manual [--force-reconnect]" >&2
    exit 2
    ;;
esac

# postStart and postAttach can run close together. Serialize lifecycle recovery so
# one invocation cannot stop a runtime another invocation has just registered.
LOCK_FILE="${TMPDIR:-/tmp}/codespace-ensure-running.lock"
exec 9>"$LOCK_FILE"
if ! flock -w 120 9; then
  printf '%s\n' "[codespace] ERROR: timed out waiting for lifecycle recovery lock." >&2
  exit 1
fi

RUNTIME_API_KEY_FILE="$REPO_ROOT/secrets/github/CONTROL_PLANE_API_KEY"

# Codespaces lifecycle secrets may be available during create/start but absent
# from later tool children. Persist an injected credential only into ignored
# workspace state with owner-only permissions, then always reference it by file.
# The value is never printed and is removed from the remaining startup env.
if [[ -n "${CONTROL_PLANE_API_KEY:-}" ]]; then
  mkdir -p "$(dirname "$RUNTIME_API_KEY_FILE")"
  umask 077
  runtime_api_key_tmp="$RUNTIME_API_KEY_FILE.tmp.$$"
  printf '%s\n' "$CONTROL_PLANE_API_KEY" > "$runtime_api_key_tmp"
  chmod 600 "$runtime_api_key_tmp"
  mv -f "$runtime_api_key_tmp" "$RUNTIME_API_KEY_FILE"
fi

if [[ -s "$RUNTIME_API_KEY_FILE" ]]; then
  chmod 600 "$RUNTIME_API_KEY_FILE"
  RUNTIME_API_KEY_REF="file:$RUNTIME_API_KEY_FILE"
else
  printf '%s\n' "[codespace] ERROR: runtime credential is unavailable." >&2
  exit 1
fi
unset CONTROL_PLANE_API_KEY

TRACKED_TUNNEL_ID="$(node -e '
const fs = require("node:fs");
const file = process.argv[1];
try {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof value.tunnelId === "string") process.stdout.write(value.tunnelId);
} catch {}
' "$ROOT/config/tunnel.defaults.json")"

# The bridge tunnel identity is repository-owned, non-secret configuration.
# Never let account/machine-scoped environment variables override it: a stale
# CONTROL_PLANE_TUNNEL_ID caused a previous split-brain where connect used the
# tracked tunnel while doctor/runtime inherited a deleted tunnel from the shell.
TUNNEL_ID="$TRACKED_TUNNEL_ID"
TUNNEL_SOURCE="config/tunnel.defaults.json"
if [[ -z "$TUNNEL_ID" ]]; then
  printf '%s\n' "[codespace] ERROR: tracked tunnel identity is unavailable in config/tunnel.defaults.json." >&2
  exit 1
fi
if [[ ! "$TUNNEL_ID" =~ ^tunnel_[A-Za-z0-9_-]+$ ]]; then
  printf '%s\n' "[codespace] ERROR: invalid tracked tunnel ID format." >&2
  exit 1
fi

for stale_name in CODESPACE_TUNNEL_ID CONTROL_PLANE_TUNNEL_ID; do
  stale_value="${!stale_name:-}"
  if [[ -n "$stale_value" && "$stale_value" != "$TUNNEL_ID" ]]; then
    printf '%s\n' "[codespace] NOTICE: ignoring stale $stale_name; tracked tunnel identity is authoritative."
  fi
done
unset CODESPACE_TUNNEL_ID CONTROL_PLANE_TUNNEL_ID

# Reconstruct ignored runtime state deterministically on every machine.
# The managed connector command below regenerates the native profile from these explicit values.
if [[ ! -f "$ROOT/runtime/tunnel.json" ]] || ! grep -Fq "$TUNNEL_ID" "$ROOT/runtime/tunnel.json" 2>/dev/null; then
  bash "$ROOT/scripts/configure-tunnel.sh" "$TUNNEL_ID" >/dev/null
fi

printf '%s\n' "[codespace] tunnel source=$TUNNEL_SOURCE tunnel_id=$TUNNEL_ID"

bash "$ROOT/scripts/install-tunnel-client.sh"

mkdir -p "$PROFILE_DIR" "$STATE_DIR"
export TUNNEL_CLIENT_STATE_DIR="$STATE_DIR"

command -v node >/dev/null 2>&1 || {
  printf '%s\n' "[codespace] ERROR: node is unavailable." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  printf '%s\n' "[codespace] ERROR: npm is unavailable." >&2
  exit 1
}

needs_dependencies=false
if [[ ! -x "$ROOT/node_modules/.bin/tsc" ]]; then
  needs_dependencies=true
elif [[ ! -f "$ROOT/node_modules/@modelcontextprotocol/sdk/package.json" || ! -f "$ROOT/node_modules/zod/package.json" ]]; then
  needs_dependencies=true
elif ! (cd "$ROOT" && npm ls --depth=0 >/dev/null 2>&1); then
  needs_dependencies=true
fi

if [[ "$needs_dependencies" == true ]]; then
  printf '%s\n' "[codespace] restoring standalone plugin dependencies."
  (
    cd "$ROOT"
    npm ci --ignore-scripts
  )
fi

needs_build=false
if [[ ! -f "$ROOT/dist/server.js" || ! -f "$ROOT/dist/http-server.js" || ! -f "$ROOT/dist/http-probe.js" || ! -f "$ROOT/dist/watchdog.js" ]]; then
  needs_build=true
elif find "$ROOT/src" -type f -name '*.ts' -newer "$ROOT/dist/server.js" -print -quit | grep -q .; then
  needs_build=true
elif [[ "$ROOT/package.json" -nt "$ROOT/dist/server.js" || "$ROOT/package-lock.json" -nt "$ROOT/dist/server.js" ]]; then
  needs_build=true
fi

if [[ "$needs_build" == true ]]; then
  (
    cd "$ROOT"
    "$ROOT/node_modules/.bin/tsc" -p tsconfig.json
  )
fi

# Phase 7 reuses the root Phase-2 hydration gate before this bridge can expose
# mutation-ready MCP. Sourcing preserves only the non-secret lifecycle mode and
# loopback Agent Core lease endpoint for the supervised HTTP MCP child.
# shellcheck disable=SC1091
source "$ROOT/scripts/memory-lifecycle-preflight.sh"

# The root hydration gate has already consumed any credentials it requires.
# Keep the bridge lifecycle parent, tunnel runtime, MCP server, watchdog, and
# child shells free of GitHub / Memory Remote / Cloudflare secrets.
unset GITHUB_TOKEN GH_TOKEN
unset AGENT_CORE_GITHUB_TOKEN_FILE AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE AGENT_CORE_GITHUB_PACKAGES_TOKEN
unset AGENT_CORE_MEMORY_REMOTE_KEY_HEX AGENT_CORE_MEMORY_REMOTE_KEY_FILE
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_WRANGLER_OAUTH_CONFIG_B64
unset CODESPACE_MEMORY_CONTEXT_LEASE AGENT_CORE_MEMORY_CONTEXT_LEASE

(
  exec 9>&-
  bash "$ROOT/scripts/ensure-http-mcp.sh"
)
MCP_SERVER_URL_FILE="$ROOT/runtime/state/http-mcp.url"
MCP_SERVER_URL="$(tr -d '\r\n' < "$MCP_SERVER_URL_FILE")"
if [[ ! "$MCP_SERVER_URL" =~ ^http://127\.0\.0\.1:[0-9]+/mcp$ ]]; then
  printf '%s\n' "[codespace] ERROR: invalid loopback MCP URL produced by supervisor." >&2
  exit 1
fi
timeout 15 node "$ROOT/dist/http-probe.js" "$MCP_SERVER_URL" >/dev/null

# Runtime reconciliation is isolated behind a production helper so lifecycle
# phases share one bounded policy and tests can exercise it without the live tunnel.
reconcile_args=(--phase "$PHASE")
if [[ "$FORCE_RECONNECT" == true ]]; then
  reconcile_args+=(--force-reconnect)
fi
# shellcheck disable=SC1091
source "$ROOT/scripts/runtime-reconciliation.sh"
CODESPACE_TUNNEL_CLIENT_BIN="$BIN" \
CODESPACE_TUNNEL_ALIAS="$ALIAS" \
CODESPACE_PROFILE_NAME="$PROFILE_NAME" \
CODESPACE_PROFILE_DIR="$PROFILE_DIR" \
CODESPACE_EXPECTED_TUNNEL_ID="$TUNNEL_ID" \
CODESPACE_MCP_SERVER_URL="$MCP_SERVER_URL" \
CODESPACE_RUNTIME_API_KEY_FILE="$RUNTIME_API_KEY_FILE" \
CODESPACE_RUNTIME_API_KEY_REF="$RUNTIME_API_KEY_REF" \
TUNNEL_CLIENT_STATE_DIR="$STATE_DIR" \
codespace_runtime_reconcile "${reconcile_args[@]}"

if [[ "${CODESPACE_WATCHDOG_ACTIVE:-0}" != "1" ]]; then
  command -v tmux >/dev/null 2>&1 || {
    printf '%s\n' "[codespace] ERROR: tmux is required to supervise bridge recovery." >&2
    exit 1
  }
  WATCHDOG_SESSION="${CODESPACE_WATCHDOG_SESSION:-codespace-bridge-watchdog}"
  WATCHDOG_LOG="$STATE_DIR/logs/watchdog.log"
  mkdir -p "$(dirname "$WATCHDOG_LOG")"
  (
    exec 9>&-
    CODESPACE_EXPECTED_TUNNEL_ID="$TUNNEL_ID" \
    CODESPACE_MCP_SERVER_URL="$MCP_SERVER_URL" \
    TUNNEL_CLIENT_STATE_DIR="$STATE_DIR" \
    bash "$ROOT/scripts/start-watchdog.sh" --once --check-only
  )
  tmux kill-session -t "$WATCHDOG_SESSION" >/dev/null 2>&1 || true
  printf -v watchdog_command \
    'exec env CODESPACE_EXPECTED_TUNNEL_ID=%q CODESPACE_MCP_SERVER_URL=%q TUNNEL_CLIENT_STATE_DIR=%q bash %q >>%q 2>&1' \
    "$TUNNEL_ID" "$MCP_SERVER_URL" "$STATE_DIR" "$ROOT/scripts/start-watchdog.sh" "$WATCHDOG_LOG"
  (
    exec 9>&-
    tmux new-session -d -s "$WATCHDOG_SESSION" -c "$ROOT" "$watchdog_command"
  )
  watchdog_ready=false
  for _ in $(seq 1 10); do
    if tmux has-session -t "$WATCHDOG_SESSION" >/dev/null 2>&1; then
      watchdog_ready=true
      sleep 0.2
      if tmux has-session -t "$WATCHDOG_SESSION" >/dev/null 2>&1; then
        break
      fi
      watchdog_ready=false
    fi
    sleep 0.2
  done
  if [[ "$watchdog_ready" != true ]]; then
    printf '%s\n' "[codespace] ERROR: bridge watchdog failed to remain active." >&2
    if [[ -f "$WATCHDOG_LOG" ]]; then tail -40 "$WATCHDOG_LOG" >&2 || true; fi
    exit 1
  fi
fi

printf '%s\n' "[codespace] READY: phase=$PHASE tunnel_id=$TUNNEL_ID loopback MCP protocol, managed tunnel process, remote registration, watchdog, and readiness gates passed."
