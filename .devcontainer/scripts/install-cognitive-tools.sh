#!/usr/bin/env bash
set -euo pipefail

TOOLS_ROOT=/workspaces/.assistant-tools
SRC_DIR="$TOOLS_ROOT/src"
BIN_DIR="$TOOLS_ROOT/bin"
NPM_PREFIX="$TOOLS_ROOT/npm-global"
NPM_BIN="$NPM_PREFIX/bin"
PY_BOOT="$TOOLS_ROOT/cognitive-bootstrap-venv"
UV_TOOL_DIR="$TOOLS_ROOT/uv-tools"
STATE_DIR="$TOOLS_ROOT/state"
LOCK_FILE="$STATE_DIR/cognitive-tools-lock.json"

# Reproducible runtime baseline verified in this Codespace on 2026-08-20.
SERENA_VERSION=1.7.0
SPECIFY_VERSION=0.16.5
SEMGREP_VERSION=1.173.0
AGENT_SKILL_EVAL_VERSION=0.7.0
BEADS_VERSION=v1.2.2
GITHUB_MCP_VERSION=v1.10.1
MCP_LANGUAGE_SERVER_VERSION=v0.1.1

SUPERPOWERS_COMMIT=b36e0829c6d0140e93cfef2ca599b1b07d4a7797
SERENA_COMMIT=7fcbca7e62555ec2287ddb2f083caee805848ea6
SPEC_KIT_COMMIT=5c171f711b9a3b6e4b4c7855614ea4e1d0880707
BEADS_COMMIT=072f0f8799f5f4a0594e3d6fe6c74fd984eed4d4
SEMGREP_COMMIT=3f58c662ec05a8dbb67d4779cfbca1be8396d738
GITHUB_MCP_COMMIT=fcdd664099f957c4a7dc183d9381cef191e8c8a9
PLAYWRIGHT_MCP_COMMIT=16cf228d7b02c07f800ec3423f471ec2a42d22a9
CHROME_DEVTOOLS_MCP_COMMIT=c6cff23fbfb1d8c7ee7e79ee3b74f7eb52e725eb
MCP_LANGUAGE_SERVER_COMMIT=e4395849a52e18555361abab60a060802c06bf50
REPOMIX_COMMIT=c898ff0b3612bc6222c703c965d2468ac9ead952
ANTHROPIC_SKILLS_COMMIT=0a64e398ec6bb34a494f0c347e8ccae53a862f8e
TASK_MASTER_COMMIT=c0c98d367c55296bfe69e65680625b6db437af02
AGENTMEMORY_COMMIT=2d38dafede67d0d4ed920cde94d2106e98825b8a
GRAPHITI_COMMIT=c406932767ee490ad2311fd694a6b2ac3b164599
AST_GREP_SKILL_COMMIT=3148c69c370a51afb661b9f37879c0bd7cf0cc3b
AGENT_SKILL_EVAL_COMMIT=59de161f657b82bfaf8f6abe83dfff38552deb21
VERCEL_SKILLS_COMMIT=435076e78988e1e6ec40d00b0b1d76bdbbc5419a
MCP_REGISTRY_COMMIT=a25f166b4b5bee06eeecb75e4f37b2a44a8aa5be
DOCKER_MCP_GATEWAY_COMMIT=24b028f4f9aac85ce1a1057c5e8d739836e7c18d
AGENTFINDER_CATALOG_COMMIT=c6d48b22aed80224e8c39dde7428ae2aa0a8005d
AWESOME_KOREAN_AGENT_SKILLS_COMMIT=b0fe9ad1d16b31f52cf16da0f65d9e92b2bdb390

mkdir -p "$SRC_DIR" "$BIN_DIR" "$NPM_PREFIX" "$STATE_DIR" "$UV_TOOL_DIR"

log(){ printf '[cognitive-tools] %s\n' "$*"; }

check_runtime(){
  local failed=0
  for cmd in serena specify semgrep semgrep-mcp agent-skill-eval bd github-mcp-server mcp-language-server playwright-mcp chrome-devtools-mcp repomix task-master agentmemory-mcp ast-grep skills bun; do
    if ! PATH="$BIN_DIR:$NPM_BIN:$PATH" command -v "$cmd" >/dev/null 2>&1; then
      log "missing executable: $cmd"
      failed=1
    fi
  done
  for src in superpowers serena spec-kit beads semgrep github-mcp-server playwright-mcp chrome-devtools-mcp mcp-language-server repomix anthropics-skills claude-task-master agentmemory graphiti ast-grep-skill agent-skill-eval vercel-skills mcp-registry docker-mcp-gateway agentfinder-catalog awesome-korean-agent-skills; do
    if [ ! -d "$SRC_DIR/$src/.git" ]; then
      log "missing source: $src"
      failed=1
    fi
  done
  if [ ! -d "$TOOLS_ROOT/playwright-browsers" ]; then
    log "missing Playwright browser runtime"
    failed=1
  else
    browser_exec="$(find "$TOOLS_ROOT/playwright-browsers" -type f -path '*/chrome-linux64/chrome' -print -quit 2>/dev/null || true)"
    if [ -z "$browser_exec" ]; then
      log "missing Playwright Chromium executable"
      failed=1
    elif ldd "$browser_exec" 2>/dev/null | grep -q 'not found'; then
      log "missing Playwright system libraries"
      failed=1
    fi
  fi
  [ -x "$TOOLS_ROOT/graphiti-venv/bin/python" ] || { log "missing Graphiti runtime"; failed=1; }
  [ -x /workspaces/Market-Signal-Lab/.devcontainer/scripts/graphiti-local.py ] || { log "missing Graphiti local adapter"; failed=1; }
  [ -d "$STATE_DIR/task-master/Market-Signal-Lab/.taskmaster" ] || { log "missing external Task Master state"; failed=1; }
  [ -s "$LOCK_FILE" ] || { log "missing cognitive tools lock"; failed=1; }
  return "$failed"
}

if [ "${1:-}" = "--check" ]; then
  check_runtime
  log "check passed"
  exit 0
fi

sync_source(){
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

sync_source superpowers https://github.com/obra/superpowers.git "$SUPERPOWERS_COMMIT"
sync_source serena https://github.com/oraios/serena.git "$SERENA_COMMIT"
sync_source spec-kit https://github.com/github/spec-kit.git "$SPEC_KIT_COMMIT"
sync_source beads https://github.com/gastownhall/beads.git "$BEADS_COMMIT"
sync_source semgrep https://github.com/semgrep/semgrep.git "$SEMGREP_COMMIT"
sync_source github-mcp-server https://github.com/github/github-mcp-server.git "$GITHUB_MCP_COMMIT"
sync_source playwright-mcp https://github.com/microsoft/playwright-mcp.git "$PLAYWRIGHT_MCP_COMMIT"
sync_source chrome-devtools-mcp https://github.com/ChromeDevTools/chrome-devtools-mcp.git "$CHROME_DEVTOOLS_MCP_COMMIT"
sync_source mcp-language-server https://github.com/isaacphi/mcp-language-server.git "$MCP_LANGUAGE_SERVER_COMMIT"
sync_source repomix https://github.com/yamadashy/repomix.git "$REPOMIX_COMMIT"
sync_source anthropics-skills https://github.com/anthropics/skills.git "$ANTHROPIC_SKILLS_COMMIT"
sync_source claude-task-master https://github.com/eyaltoledano/claude-task-master.git "$TASK_MASTER_COMMIT"
sync_source agentmemory https://github.com/rohitg00/agentmemory.git "$AGENTMEMORY_COMMIT"
sync_source graphiti https://github.com/getzep/graphiti.git "$GRAPHITI_COMMIT"
sync_source ast-grep-skill https://github.com/code-yeongyu/ast-grep-skill.git "$AST_GREP_SKILL_COMMIT"
sync_source agent-skill-eval https://github.com/tardigrde/agent-skill-eval.git "$AGENT_SKILL_EVAL_COMMIT"
sync_source vercel-skills https://github.com/vercel-labs/skills.git "$VERCEL_SKILLS_COMMIT"
sync_source mcp-registry https://github.com/modelcontextprotocol/registry.git "$MCP_REGISTRY_COMMIT"
sync_source docker-mcp-gateway https://github.com/docker/mcp-gateway.git "$DOCKER_MCP_GATEWAY_COMMIT"
sync_source agentfinder-catalog https://github.com/github/agentfinder-catalog.git "$AGENTFINDER_CATALOG_COMMIT"
sync_source awesome-korean-agent-skills https://github.com/J-nowcow/awesome-korean-agent-skills.git "$AWESOME_KOREAN_AGENT_SKILLS_COMMIT"

log "installing pinned npm capabilities"
npm install --quiet --no-audit --no-fund --prefix "$NPM_PREFIX" --global \
  '@playwright/mcp@0.0.79' \
  'chrome-devtools-mcp@1.7.0' \
  'repomix@1.18.0' \
  'task-master-ai@0.43.1' \
  '@agentmemory/agentmemory@0.9.29' \
  '@ast-grep/cli@0.45.1' \
  'skills@1.5.23' \
  'bun@1.4.0'

log "ensuring native build prerequisites"
if ! pkg-config --exists icu-i18n 2>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq libicu-dev pkg-config
fi

log "installing Go capabilities"
rm -f "$BIN_DIR/bd" 2>/dev/null || true
GOBIN="$BIN_DIR" go install "github.com/isaacphi/mcp-language-server@${MCP_LANGUAGE_SERVER_VERSION}"
GOBIN="$BIN_DIR" go install "github.com/steveyegge/beads/cmd/bd@${BEADS_VERSION}"
GOBIN="$BIN_DIR" go install "github.com/github/github-mcp-server/cmd/github-mcp-server@${GITHUB_MCP_VERSION}"

if [ ! -x "$PY_BOOT/bin/python" ]; then
  log "creating Python bootstrap venv"
  python3 -m venv "$PY_BOOT"
fi
"$PY_BOOT/bin/python" -m pip install --disable-pip-version-check --quiet --upgrade pip uv

export UV_TOOL_DIR UV_TOOL_BIN_DIR="$BIN_DIR"
UV="$PY_BOOT/bin/uv"

log "installing Python/uv capabilities"
"$UV" tool install --force --python 3.13 "serena-agent==${SERENA_VERSION}"
"$UV" tool install --force --python 3.13 "specify-cli==${SPECIFY_VERSION}"
"$UV" tool install --force --python 3.13 "semgrep==${SEMGREP_VERSION}"
"$UV" tool install --force --python 3.13 "agent-skill-eval==${AGENT_SKILL_EVAL_VERSION}"

for bin in chrome-devtools-mcp repomix task-master task-master-mcp agentmemory-mcp ast-grep skills bun; do
  if [ -e "$NPM_BIN/$bin" ]; then
    ln -sfn "$NPM_BIN/$bin" "$BIN_DIR/$bin"
  fi
done
ln -sfn /workspaces/Market-Signal-Lab/.devcontainer/scripts/playwright-mcp-wrapper.sh "$BIN_DIR/playwright-mcp"

if [ ! -d "$TOOLS_ROOT/playwright-browsers" ]; then
  log "installing persistent Playwright Chromium runtime"
  PLAYWRIGHT_BROWSERS_PATH="$TOOLS_ROOT/playwright-browsers" "$NPM_BIN/playwright" install chromium
fi
browser_exec="$(find "$TOOLS_ROOT/playwright-browsers" -type f -path '*/chrome-linux64/chrome' -print -quit 2>/dev/null || true)"
if [ -n "$browser_exec" ] && ldd "$browser_exec" 2>/dev/null | grep -q 'not found'; then
  log "installing Playwright Chromium system dependencies"
  sudo env PATH="$PATH" PLAYWRIGHT_BROWSERS_PATH="$TOOLS_ROOT/playwright-browsers" "$NPM_BIN/playwright" install-deps chromium
fi

if [ ! -x "$TOOLS_ROOT/graphiti-venv/bin/python" ]; then
  log "installing Graphiti core with embedded FalkorDB support"
  python3 -m venv "$TOOLS_ROOT/graphiti-venv"
  "$TOOLS_ROOT/graphiti-venv/bin/pip" install --disable-pip-version-check -q 'graphiti-core[falkordblite]==0.29.3' httpx
fi
chmod +x /workspaces/Market-Signal-Lab/.devcontainer/scripts/graphiti-local.py

# claude-mem needs Bun plus its local worker/plugin dependencies, but GPT Action
# does not install Claude/Codex host hooks. Keep runtime in supervisor command-home.
# GNU timeout normally creates a separate process group; under devcontainer lifecycle
# hooks that group can be stopped by terminal job-control (SIGTTIN/SIGTTOU), which
# also stops the timeout clock. --foreground + /dev/null prevents that deadlock.
CLAUDE_HOME=/home/vscode/.codespace-supervisor/state/command-home
CLAUDE_REPAIR_LOG="$STATE_DIR/claude-mem-repair.log"
mkdir -p "$CLAUDE_HOME"
if command -v claude-mem >/dev/null 2>&1 || [ -x "$NPM_BIN/claude-mem" ]; then
  export BUN="$NPM_BIN/bun"
  if ! HOME="$CLAUDE_HOME" PATH="$BIN_DIR:$NPM_BIN:$PATH" timeout --foreground 12s "$NPM_BIN/claude-mem" status </dev/null 2>/dev/null | grep -qi 'Worker is running'; then
    log "repairing claude-mem local runtime"
    : >"$CLAUDE_REPAIR_LOG"
    HOME="$CLAUDE_HOME" PATH="$BIN_DIR:$NPM_BIN:$PATH" timeout --foreground 300s "$NPM_BIN/claude-mem" repair </dev/null >>"$CLAUDE_REPAIR_LOG" 2>&1 || true
    HOME="$CLAUDE_HOME" PATH="$BIN_DIR:$NPM_BIN:$PATH" timeout --foreground 60s "$NPM_BIN/claude-mem" start </dev/null >>"$CLAUDE_REPAIR_LOG" 2>&1 || true
  fi
fi

TM_ROOT="$STATE_DIR/task-master/Market-Signal-Lab"
if [ ! -d "$TM_ROOT/.taskmaster" ]; then
  log "initializing external Task Master state"
  mkdir -p "$TM_ROOT"
  (cd "$TM_ROOT" && "$BIN_DIR/task-master" init --yes --name Market-Signal-Lab --description 'External persistent Task Master state for GPT Tools Gateway' --skip-install --no-aliases --no-git --no-git-tasks >/dev/null 2>&1)
fi

python3 - "$SRC_DIR" "$LOCK_FILE" "$BIN_DIR" <<'PY'
import json, pathlib, subprocess, sys
src=pathlib.Path(sys.argv[1]); lock=pathlib.Path(sys.argv[2]); bin_dir=pathlib.Path(sys.argv[3])
repos={}
for p in sorted(src.iterdir()):
    if (p/'.git').exists():
        try:
            sha=subprocess.check_output(['git','-C',str(p),'rev-parse','HEAD'],text=True).strip()
        except Exception:
            sha=None
        repos[p.name]=sha

def ver(cmd):
    try:
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=10)
        s=(r.stdout or r.stderr).strip().splitlines()
        return s[0] if s else f'exit={r.returncode}'
    except Exception as e:
        return f'error:{type(e).__name__}'

data={
 'schemaVersion':1,
 'repos':repos,
 'versions':{
  'serena':ver([str(bin_dir/'serena'),'--version']),
  'specify':'0.16.5',
  'semgrep':ver([str(bin_dir/'semgrep'),'--version']),
  'agent-skill-eval':ver([str(bin_dir/'agent-skill-eval'),'--version']),
  'bd':ver([str(bin_dir/'bd'),'version']),
  'mcp-language-server':'v0.1.1',
  'github-mcp-server':'v1.10.1',
  'playwright-mcp':ver([str(bin_dir/'playwright-mcp'),'--version']),
  'chrome-devtools-mcp':ver([str(bin_dir/'chrome-devtools-mcp'),'--version']),
  'repomix':ver([str(bin_dir/'repomix'),'--version']),
  'task-master':ver([str(bin_dir/'task-master'),'--version']),
  'agentmemory':'0.9.29',
  'ast-grep':ver([str(bin_dir/'ast-grep'),'--version']),
  'skills':ver([str(bin_dir/'skills'),'--version']),
 }
}
lock.write_text(json.dumps(data,indent=2)+'\n')
PY

log "installation complete"
