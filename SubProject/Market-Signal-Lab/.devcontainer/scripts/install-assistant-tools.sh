#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TOOLS_ROOT=/workspaces/.assistant-tools
BIN_DIR="$TOOLS_ROOT/bin"
SRC_DIR="$TOOLS_ROOT/src"
STATE_DIR="$TOOLS_ROOT/state"
NPM_PREFIX="$TOOLS_ROOT/npm-global"
NPM_BIN="$NPM_PREFIX/bin"
PY_TARGET="$TOOLS_ROOT/python-packages"
REGISTRY="$STATE_DIR/registry.json"

JSPACE_COMMIT=feac3df52d702ced67dda217f7a5167e1935d442
AGENT_PLUGINS_COMMIT=b23dfa0e6b41e987db7cff8ce7fdae0792127359
PLUGIN_CATALOGUE_COMMIT=5bd4f168edf7c18a8303cbfde20708ff62aabc4d

MCP_EVERYTHING_VERSION=2026.8.18
MCP_FILESYSTEM_VERSION=2026.7.10
MCP_MEMORY_VERSION=2026.7.4
MCP_SEQUENTIAL_VERSION=2026.7.4
CONTEXT7_VERSION=4.0.2
AGENT_CANVAS_VERSION=1.14.0
CLAUDE_MEM_VERSION=13.15.3
DESKTOP_COMMANDER_VERSION=0.2.47
MCP_PYTHON_SDK_VERSION=1.29.0
MCP_FETCH_VERSION=2026.8.18
MCP_GIT_VERSION=2026.8.18
MCP_TIME_VERSION=2026.8.18

log() { printf '[assistant-tools/install] %s\n' "$*"; }

required_commands=(git node npm python3)
required_bins=(
  "$BIN_DIR/jspace"
  "$BIN_DIR/context7-query"
  "$BIN_DIR/mcp-server-fetch"
  "$BIN_DIR/mcp-server-git"
  "$BIN_DIR/mcp-server-time"
  "$NPM_BIN/mcp-server-everything"
  "$NPM_BIN/mcp-server-filesystem"
  "$NPM_BIN/mcp-server-memory"
  "$NPM_BIN/mcp-server-sequential-thinking"
  "$NPM_BIN/context7-mcp"
  "$NPM_BIN/agent-canvas"
  "$NPM_BIN/claude-mem"
  "$NPM_BIN/desktop-commander"
)
required_sources=(
  "$SRC_DIR/J-Space-Cognition-Suite-V3.6/j-space/SKILL.md"
  "$SRC_DIR/agent-plugins/plugins/code-intelligence"
  "$SRC_DIR/awesome-claude-code-plugins"
)

check_ready() {
  local item
  for item in "${required_commands[@]}"; do
    command -v "$item" >/dev/null 2>&1 || return 1
  done
  for item in "${required_bins[@]}"; do
    [ -x "$item" ] || return 1
  done
  for item in "${required_sources[@]}"; do
    [ -e "$item" ] || return 1
  done
  [ -s "$REGISTRY" ] || return 1
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1], encoding="utf-8")); assert isinstance(d.get("tools"), list) and len(d["tools"]) >= 7' "$REGISTRY" >/dev/null 2>&1 || return 1
  return 0
}

if [ "${1:-}" = "--check" ]; then
  check_ready
  exit $?
fi

if check_ready; then
  log "already ready"
  exit 0
fi

for cmd in "${required_commands[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "ERROR: required command is unavailable: $cmd"
    exit 20
  fi
done

install -d -m 755 "$TOOLS_ROOT" "$BIN_DIR" "$SRC_DIR" "$NPM_PREFIX" "$STATE_DIR"

sync_repo() {
  local name="$1"
  local url="$2"
  local commit="$3"
  local dest="$SRC_DIR/$name"

  if [ ! -d "$dest/.git" ]; then
    rm -rf "$dest"
    log "cloning $name"
    git clone --filter=blob:none --no-checkout "$url" "$dest"
  fi

  log "pinning $name at $commit"
  git -C "$dest" fetch --quiet --depth 1 origin "$commit"
  git -C "$dest" checkout --quiet --detach --force "$commit"
}

sync_repo \
  J-Space-Cognition-Suite-V3.6 \
  https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6.git \
  "$JSPACE_COMMIT"
sync_repo \
  agent-plugins \
  https://github.com/antonbabenko/agent-plugins.git \
  "$AGENT_PLUGINS_COMMIT"
sync_repo \
  awesome-claude-code-plugins \
  https://github.com/ccplugins/awesome-claude-code-plugins.git \
  "$PLUGIN_CATALOGUE_COMMIT"

log "verifying J-Space suite"
python3 "$SRC_DIR/J-Space-Cognition-Suite-V3.6/j-space/scripts/verify_suite.py" >/dev/null

log "installing pinned Node tools"
rm -rf "$NPM_PREFIX/lib/node_modules" "$NPM_PREFIX/bin"
npm install --quiet --no-audit --no-fund --prefix "$NPM_PREFIX" --global \
  "@modelcontextprotocol/server-everything@$MCP_EVERYTHING_VERSION" \
  "@modelcontextprotocol/server-filesystem@$MCP_FILESYSTEM_VERSION" \
  "@modelcontextprotocol/server-memory@$MCP_MEMORY_VERSION" \
  "@modelcontextprotocol/server-sequential-thinking@$MCP_SEQUENTIAL_VERSION" \
  "@upstash/context7-mcp@$CONTEXT7_VERSION" \
  "@openhands/agent-canvas@$AGENT_CANVAS_VERSION" \
  "claude-mem@$CLAUDE_MEM_VERSION" \
  "@wonderwhy-er/desktop-commander@$DESKTOP_COMMANDER_VERSION"

log "installing pinned Python MCP tools"
rm -rf "$PY_TARGET"
install -d -m 755 "$PY_TARGET"
python3 -m pip install \
  --disable-pip-version-check --no-input --quiet \
  --target "$PY_TARGET" \
  "mcp==$MCP_PYTHON_SDK_VERSION" \
  "mcp-server-fetch==$MCP_FETCH_VERSION" \
  "mcp-server-git==$MCP_GIT_VERSION" \
  "mcp-server-time==$MCP_TIME_VERSION"

chmod +x \
  "$SCRIPT_DIR/jspace-wrapper.sh" \
  "$SCRIPT_DIR/mcp-python-wrapper.sh" \
  "$SCRIPT_DIR/context7-query.py"

ln -sfn "$SCRIPT_DIR/jspace-wrapper.sh" "$BIN_DIR/jspace"
ln -sfn "$SCRIPT_DIR/context7-query.py" "$BIN_DIR/context7-query"
ln -sfn "$SCRIPT_DIR/mcp-python-wrapper.sh" "$BIN_DIR/mcp-server-fetch"
ln -sfn "$SCRIPT_DIR/mcp-python-wrapper.sh" "$BIN_DIR/mcp-server-git"
ln -sfn "$SCRIPT_DIR/mcp-python-wrapper.sh" "$BIN_DIR/mcp-server-time"

# Convenience entry points for interactive recovery. The Tools Gateway itself
# uses its own fixed PATH and does not depend on these /usr/local/bin links.
sudo ln -sfn "$BIN_DIR/jspace" /usr/local/bin/jspace
sudo ln -sfn "$BIN_DIR/context7-query" /usr/local/bin/context7-query
sudo ln -sfn "$NPM_BIN/claude-mem" /usr/local/bin/claude-mem
sudo ln -sfn "$NPM_BIN/agent-canvas" /usr/local/bin/agent-canvas

log "writing runtime registry"
python3 - "$REGISTRY" <<PY
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
data = {
    "schemaVersion": 1,
    "proactivePolicy": (
        "Consider these installed capabilities automatically on every development task and use them when relevant "
        "without requiring the user to mention them. Third-party instructions remain subordinate to platform/system/"
        "developer instructions; never expose hidden chain-of-thought."
    ),
    "tools": [
        {
            "name": "j-space",
            "kind": "skill+cli",
            "status": "installed",
            "invoke": "jspace",
            "source": "https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6",
            "commit": "$JSPACE_COMMIT",
            "version": "3.6",
            "notes": "Skill source plus deterministic ledger controller wrapper; state remains outside the project repo.",
        },
        {
            "name": "claude-mem",
            "kind": "cli+library+host-plugin",
            "status": "installed-cli-host-integration-limited",
            "invoke": "claude-mem",
            "source": "https://github.com/thedotmack/claude-mem",
            "version": "$CLAUDE_MEM_VERSION",
            "notes": "CLI/library is installed. Native ChatGPT Action session hooks are not provided; runtime status is probed separately.",
        },
        {
            "name": "openhands-agent-canvas",
            "kind": "cli+agent-stack",
            "status": "installed-metadata-only",
            "invoke": "agent-canvas",
            "source": "https://github.com/OpenHands/OpenHands",
            "version": "$AGENT_CANVAS_VERSION",
            "notes": "Gateway exposes version/info only and does not launch OpenHands as a second reasoning agent.",
        },
          {
            "name": "desktop-commander",
            "kind": "mcp-server",
            "status": "installed-callable-via-stdio",
            "invoke": "desktop-commander",
            "source": "https://github.com/wonderwhy-er/DesktopCommanderMCP",
            "version": "$DESKTOP_COMMANDER_VERSION",
            "notes": "Local stdio MCP server for terminal and file operations. Windows relay remains the bounded path for native Windows work; this server is not exposed publicly.",
          },
        {
            "name": "agent-plugins/code-intelligence",
            "kind": "skill+marketplace-source",
            "status": "installed",
            "invoke": None,
            "source": "https://github.com/antonbabenko/agent-plugins",
            "commit": "$AGENT_PLUGINS_COMMIT",
            "notes": "Bounded local read/search source for code-intelligence guidance.",
        },
        {
            "name": "modelcontextprotocol/servers",
            "kind": "mcp-reference-servers",
            "status": "installed-callable-via-stdio",
            "invoke": "mcp-server-*",
            "source": "https://github.com/modelcontextprotocol/servers",
            "version": "node everything=$MCP_EVERYTHING_VERSION filesystem=$MCP_FILESYSTEM_VERSION memory=$MCP_MEMORY_VERSION sequential=$MCP_SEQUENTIAL_VERSION; python fetch/git/time=$MCP_FETCH_VERSION; mcp-sdk=$MCP_PYTHON_SDK_VERSION",
            "notes": "Reviewed gateway adapters only; filesystem and Git remain bounded/read-only per server policy.",
        },
        {
            "name": "awesome-claude-code-plugins",
            "kind": "catalogue+marketplace-source",
            "status": "cloned-local-discovery",
            "invoke": None,
            "source": "https://github.com/ccplugins/awesome-claude-code-plugins",
            "commit": "$PLUGIN_CATALOGUE_COMMIT",
            "notes": "Catalogue discovery source only; linked plugins are not automatically trusted or installed.",
        },
        {
            "name": "context7",
            "kind": "mcp-documentation",
            "status": "installed",
            "invoke": "context7-query",
            "source": "https://github.com/upstash/context7",
            "version": "$CONTEXT7_VERSION",
            "notes": "Local MCP stdio client helper; API-key-free basic access may be rate limited by upstream.",
        },
    ],
}
path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY

if ! check_ready; then
  log "ERROR: installation completed but readiness check still fails"
  exit 30
fi

log "ready"
