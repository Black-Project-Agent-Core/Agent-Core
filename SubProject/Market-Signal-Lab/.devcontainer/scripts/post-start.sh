#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

ensure_state_dir
LIFECYCLE_LOG_FILE="$SUPERVISOR_STATE/lifecycle.log"
lifecycle_log() {
  printf '%s [codespace-supervisor/lifecycle] %s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LIFECYCLE_LOG_FILE"
}
trap 'rc=$?; lifecycle_log "post-start exit=$rc"' EXIT
lifecycle_log "post-start begin"

# Self-heal a partially rebuilt container before starting services.
if [ ! -x "$SUPERVISOR_HOME/.venv/bin/uvicorn" ] || \
   [ ! -f "$SUPERVISOR_HOME/server.py" ] || \
   [ ! -f "$SUPERVISOR_HOME/terminal_gateway.py" ] || \
   [ ! -s "$BRIDGE_TOKEN_FILE" ]; then
  "$SCRIPT_DIR/bootstrap-supervisor.sh"
fi

# The gateway source can survive while the external runtimes under
# /workspaces/.assistant-tools are absent (for example after a new Codespace).
# Keep the normal start path cheap, but repair the pinned tool runtimes if a
# readiness sentinel fails.
if ! "$SCRIPT_DIR/install-assistant-tools.sh" --check >/dev/null 2>&1; then
  lifecycle_log "assistant-tools missing; repairing"
  "$SCRIPT_DIR/install-assistant-tools.sh"
fi

if ! "$SCRIPT_DIR/install-cognitive-tools.sh" --check >/dev/null 2>&1; then
  lifecycle_log "cognitive-tools missing; repairing"
  "$SCRIPT_DIR/install-cognitive-tools.sh"
fi

# /usr/local is container-local and is recreated by a Full Rebuild while the
# tool payload under /workspaces survives. Restore lightweight convenience
# entry points without forcing a full reinstall of otherwise healthy tools.
TOOLS_ROOT=/workspaces/.assistant-tools
for pair in \
  "$TOOLS_ROOT/bin/jspace:/usr/local/bin/jspace" \
  "$TOOLS_ROOT/bin/context7-query:/usr/local/bin/context7-query" \
  "$TOOLS_ROOT/npm-global/bin/claude-mem:/usr/local/bin/claude-mem" \
  "$TOOLS_ROOT/npm-global/bin/agent-canvas:/usr/local/bin/agent-canvas"; do
  src="${pair%%:*}"
  dst="${pair#*:}"
  if [ -x "$src" ]; then
    sudo ln -sfn "$src" "$dst"
  fi
done

# Recreate the repository-local native GitHub credential bridge on every start.
# The helper itself contains no secret; it reads GitHub's ephemeral Codespaces
# token only when Git asks for credentials.
"$SCRIPT_DIR/configure-native-git-auth.sh"

"$SCRIPT_DIR/bridge-start.sh"
"$SCRIPT_DIR/watchdog-start.sh"
"$SCRIPT_DIR/keepalive-start.sh"

lifecycle_log "post-start ready"
