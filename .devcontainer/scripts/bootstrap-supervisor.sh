#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

log() { printf '[codespace-supervisor/bootstrap] %s\n' "$*"; }

load_codespaces_env
ensure_state_dir

# Install only the small set of OS tools required for self-healing. This is
# intentionally independent from the project's Rust/Go toolchains.
missing=()
for cmd in curl ss flock python3 gh rg pytest; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done
if [ "${#missing[@]}" -gt 0 ]; then
  log "installing runtime dependencies: ${missing[*]}"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl gh iproute2 procps python3 python3-pip python3-venv \
    python3-pytest ripgrep util-linux
fi

install -d -m 700 "$SUPERVISOR_HOME" "$SUPERVISOR_STATE"
install -m 0644 \
  "$REPO_ROOT/.devcontainer/codespace-supervisor/server.py" \
  "$SUPERVISOR_HOME/server.py"
install -m 0644 \
  "$REPO_ROOT/.devcontainer/codespace-supervisor/windows_gateway.py" \
  "$SUPERVISOR_HOME/windows_gateway.py"
install -m 0644 \
  "$REPO_ROOT/.devcontainer/codespace-supervisor/tools_gateway.py" \
  "$SUPERVISOR_HOME/tools_gateway.py"
install -m 0644 \
  "$REPO_ROOT/.devcontainer/codespace-supervisor/terminal_gateway.py" \
  "$SUPERVISOR_HOME/terminal_gateway.py"

if [ ! -x "$SUPERVISOR_HOME/.venv/bin/python" ]; then
  log "creating isolated bridge virtualenv"
  rm -rf "$SUPERVISOR_HOME/.venv"
  python3 -m venv "$SUPERVISOR_HOME/.venv"
fi

log "synchronizing bridge Python dependencies"
"$SUPERVISOR_HOME/.venv/bin/python" -m pip install \
  --disable-pip-version-check --quiet \
  -r "$REPO_ROOT/.devcontainer/codespace-supervisor/requirements.txt"

# BRIDGE_TOKEN is already configured as a Codespaces development-environment
# secret for this repository. Persist it only in the protected supervisor state
# directory; never write it into the repository or command output.
if [ -n "${BRIDGE_TOKEN:-}" ]; then
  umask 077
  token_tmp="$SUPERVISOR_STATE/.bridge.token.tmp.$$"
  printf '%s' "$BRIDGE_TOKEN" > "$token_tmp"
  chmod 600 "$token_tmp"
  mv -f "$token_tmp" "$BRIDGE_TOKEN_FILE"
elif ! bridge_token_available; then
  log "ERROR: BRIDGE_TOKEN is unavailable. Configure it as a Codespaces secret for this repository."
  exit 20
fi
chmod 600 "$BRIDGE_TOKEN_FILE"

# Stable helper entry points. They point back into /workspaces so they survive
# normal container rebuilds together with the checked-out repository.
sudo ln -sfn "$REPO_ROOT/.devcontainer/scripts/bridge-start.sh" /usr/local/bin/codespace-bridge-start
sudo ln -sfn "$REPO_ROOT/.devcontainer/scripts/watchdog-start.sh" /usr/local/bin/codespace-bridge-watchdog-start
sudo ln -sfn "$REPO_ROOT/.devcontainer/scripts/bridge-status.sh" /usr/local/bin/codespace-bridge-status
sudo ln -sfn "$REPO_ROOT/.devcontainer/scripts/keepalive-start.sh" /usr/local/bin/codespace-keepalive-start
sudo ln -sfn "$REPO_ROOT/.devcontainer/scripts/keepalive-terminal.sh" /usr/local/bin/codespace-keepalive

# Assistant tooling lives outside the project source tree. Recreate only the
# convenience entry points here; the tools themselves remain under /workspaces.
ASSISTANT_BIN=/workspaces/.assistant-tools/bin
if [ -x "$ASSISTANT_BIN/context7-mcp" ]; then
  sudo ln -sfn "$ASSISTANT_BIN/context7-mcp" /usr/local/bin/context7-mcp
fi
if [ -x "$ASSISTANT_BIN/context7-query" ]; then
  sudo ln -sfn "$ASSISTANT_BIN/context7-query" /usr/local/bin/context7-query
fi

log "ready"
