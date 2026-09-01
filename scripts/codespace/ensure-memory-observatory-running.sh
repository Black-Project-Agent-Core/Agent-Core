#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="/workspaces/Agent-Core"
ROOT_REPO="${AGENT_CORE_REPO_ROOT:-$DEFAULT_ROOT}"
STATE_DIR="${MEMORY_OBSERVATORY_LIFECYCLE_DIR:-/workspaces/.agent-core-codespace/memory-observatory}"
SOURCE_BRANCH="${MEMORY_OBSERVATORY_SOURCE_BRANCH:-feature/memory-observatory-shadow-mode}"
SOURCE_ROOT="${MEMORY_OBSERVATORY_SOURCE_ROOT:-$ROOT_REPO/.worktrees/memory-observatory-shadow-mode}"
SOURCE_ROOT_EXPLICIT="${MEMORY_OBSERVATORY_SOURCE_ROOT+x}"
ALLOW_REMOTE="${MEMORY_OBSERVATORY_BOOTSTRAP_ALLOW_REMOTE:-1}"
WATCHDOG_ENABLED="${MEMORY_OBSERVATORY_WATCHDOG_ENABLED:-1}"
WATCHDOG_SESSION="${MEMORY_OBSERVATORY_WATCHDOG_SESSION:-memory-observatory-watchdog}"
WATCHDOG_LOG="$STATE_DIR/memory-observatory-watchdog.log"
BACKEND_PID_FILE="$STATE_DIR/memory-observatory-agent-core.pid"
BACKEND_LOG_FILE="$STATE_DIR/memory-observatory-agent-core.log"
BACKEND_STATE_ROOT="$STATE_DIR/shadow-agent-core"
BACKEND_URL_DEFAULT="http://127.0.0.1:8865"
AGENT_CORE_URL="${MEMORY_OBSERVATORY_AGENT_CORE_URL:-$BACKEND_URL_DEFAULT}"
PORT="${MEMORY_OBSERVATORY_PORT:-3697}"
WORKSPACE_ROOT="${MEMORY_OBSERVATORY_WORKSPACE_ROOT:-$ROOT_REPO}"

safe_error() {
  printf 'Memory Observatory ERROR: %s\n' "$1" >&2
}

fail() {
  safe_error "$1"
  exit 1
}

is_true() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "MISSING_COMMAND:$1"
}

native_fetch_shadow_ref() {
  local remote_ref="refs/heads/$SOURCE_BRANCH:refs/remotes/origin/$SOURCE_BRANCH"
  [[ -f "$ROOT_REPO/dist/config.js" ]] || return 1
  (
    cd "$ROOT_REPO"
    node --input-type=module - "$ROOT_REPO" "$remote_ref" <<'NODE'
import { loadConfig } from './dist/config.js';
import { GitHubCredentialProvider } from './dist/github/credentials.js';
import { GitHubGitService } from './dist/github/git-service.js';
import { WorkspacePolicy } from './dist/runtime/workspace.js';

const [root, refspec] = process.argv.slice(2);
const config = loadConfig(process.env, root).github;
const credentials = new GitHubCredentialProvider(config);
const workspace = new WorkspacePolicy([root]);
const git = new GitHubGitService(config, credentials, workspace);
const result = await git.fetch({ cwd: root, remote: 'origin', refspec, timeoutMs: config.gitTimeoutMs });
if (result.exitCode !== 0) process.exit(1);
NODE
  ) >/dev/null 2>&1
}

resolve_shadow_source() {
  if [[ -n "$SOURCE_ROOT_EXPLICIT" ]]; then
    [[ -d "$SOURCE_ROOT" ]] || fail 'SHADOW_SOURCE_UNAVAILABLE'
    return 0
  fi

  local remote_ref="refs/remotes/origin/$SOURCE_BRANCH"
  if is_true "$ALLOW_REMOTE"; then
    native_fetch_shadow_ref || true
  fi

  if [[ -d "$SOURCE_ROOT" ]]; then
    [[ -f "$SOURCE_ROOT/scripts/codespace/start-memory-observatory.sh" ]] || fail 'SHADOW_SOURCE_INVALID'
    return 0
  fi

  if ! is_true "$ALLOW_REMOTE"; then
    fail 'SHADOW_SOURCE_UNAVAILABLE'
  fi
  git -C "$ROOT_REPO" rev-parse --verify "$remote_ref" >/dev/null 2>&1 || fail 'SHADOW_SOURCE_REMOTE_UNAVAILABLE'

  mkdir -p "$(dirname "$SOURCE_ROOT")"
  if ! git -C "$ROOT_REPO" worktree add --detach "$SOURCE_ROOT" "$remote_ref" >/dev/null 2>&1; then
    fail 'SHADOW_SOURCE_MATERIALIZE_FAILED'
  fi
  [[ -f "$SOURCE_ROOT/scripts/codespace/start-memory-observatory.sh" ]] || fail 'SHADOW_SOURCE_INVALID'
}

ensure_dependencies_and_builds() {
  local observatory_root="$SOURCE_ROOT/SubProject/Memory-Observatory"
  [[ -f "$SOURCE_ROOT/package-lock.json" ]] || fail 'SHADOW_ROOT_LOCKFILE_MISSING'
  [[ -f "$observatory_root/package-lock.json" ]] || fail 'OBSERVATORY_LOCKFILE_MISSING'

  if [[ ! -d "$SOURCE_ROOT/node_modules" ]] || ! npm --prefix "$SOURCE_ROOT" ls --depth=0 >/dev/null 2>&1; then
    npm --prefix "$SOURCE_ROOT" ci --ignore-scripts >"$STATE_DIR/shadow-root-install.log" 2>&1 \
      || fail 'SHADOW_ROOT_DEPENDENCY_RESTORE_FAILED'
  fi
  if [[ ! -f "$SOURCE_ROOT/dist/index.js" ]]; then
    npm --prefix "$SOURCE_ROOT" run build >"$STATE_DIR/shadow-root-build.log" 2>&1 \
      || fail 'SHADOW_ROOT_BUILD_FAILED'
  fi

  if [[ ! -d "$observatory_root/node_modules" ]] || ! npm --prefix "$observatory_root" ls --depth=0 >/dev/null 2>&1; then
    npm --prefix "$observatory_root" ci --ignore-scripts >"$STATE_DIR/observatory-install.log" 2>&1 \
      || fail 'OBSERVATORY_DEPENDENCY_RESTORE_FAILED'
  fi
  if [[ ! -f "$observatory_root/server-dist/server.js" || ! -f "$observatory_root/dist/index.html" ]]; then
    npm --prefix "$observatory_root" run build >"$STATE_DIR/observatory-build.log" 2>&1 \
      || fail 'OBSERVATORY_BUILD_FAILED'
  fi
}

backend_pid() {
  [[ -f "$BACKEND_PID_FILE" ]] || return 1
  local pid
  pid="$(tr -d '[:space:]' < "$BACKEND_PID_FILE" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$pid"
}

backend_owned_and_alive() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null || return 1
  local cmdline
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  [[ "$cmdline" == *"$SOURCE_ROOT/dist/index.js"* ]]
}

backend_health_ok() {
  curl --fail --silent --show-error --max-time 2 \
    "$BACKEND_URL_DEFAULT/internal/memory-observatory/health" >/dev/null 2>&1
}

port_in_use() {
  local host="$1"
  local port="$2"
  node - "$host" "$port" <<'NODE' >/dev/null 2>&1
const net = require('node:net');
const host = process.argv[2];
const port = Number(process.argv[3]);
const socket = net.createConnection({ host, port });
const finish = (code) => { socket.destroy(); process.exit(code); };
socket.setTimeout(350, () => finish(1));
socket.once('connect', () => finish(0));
socket.once('error', () => finish(1));
NODE
}

start_shadow_backend_if_needed() {
  [[ "$AGENT_CORE_URL" == "$BACKEND_URL_DEFAULT" ]] || return 0

  local existing=''
  existing="$(backend_pid || true)"
  if [[ -n "$existing" ]] && backend_owned_and_alive "$existing" && backend_health_ok; then
    return 0
  fi
  if [[ -n "$existing" ]] && ! backend_owned_and_alive "$existing"; then
    rm -f "$BACKEND_PID_FILE"
  fi
  if backend_health_ok; then
    return 0
  fi
  if port_in_use '127.0.0.1' '8865'; then
    fail 'SHADOW_BACKEND_PORT_OCCUPIED'
  fi

  mkdir -p \
    "$BACKEND_STATE_ROOT/data" \
    "$BACKEND_STATE_ROOT/logs" \
    "$BACKEND_STATE_ROOT/memory" \
    "$BACKEND_STATE_ROOT/execution"

  local entry="$SOURCE_ROOT/dist/index.js"
  [[ -f "$entry" ]] || fail 'SHADOW_BACKEND_BUILD_MISSING'

  nohup env -i \
    PATH="$PATH" \
    HOME="${HOME:-/home/codespace}" \
    LANG="${LANG:-C.UTF-8}" \
    AGENT_CORE_HOST='127.0.0.1' \
    AGENT_CORE_PORT='8865' \
    AGENT_CORE_DATA_DIR="$BACKEND_STATE_ROOT/data" \
    AGENT_CORE_LOG_DIR="$BACKEND_STATE_ROOT/logs" \
    AGENT_CORE_CAPABILITY_DIR="$SOURCE_ROOT/capabilities" \
    AGENT_CORE_ALLOWED_ROOTS="$WORKSPACE_ROOT" \
    AGENT_CORE_MEMORY_ENABLED='true' \
    AGENT_CORE_MEMORY_PRINCIPAL_ID='memory-observatory-shadow' \
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE='advisory' \
    AGENT_CORE_MEMORY_DB_PATH="$BACKEND_STATE_ROOT/memory/agent-core-memory.sqlite" \
    AGENT_CORE_MEMORY_REMOTE_ENABLED='false' \
    AGENT_CORE_MEMORY_OBSERVATORY_ENABLED='true' \
    AGENT_CORE_MEMORY_OBSERVATORY_MODE='shadow' \
    AGENT_CORE_EXECUTION_ENABLED='false' \
    AGENT_CORE_EXECUTION_DB_PATH="$BACKEND_STATE_ROOT/execution/execution.sqlite" \
    AGENT_CORE_EXECUTION_LOG_ROOT="$BACKEND_STATE_ROOT/execution/runs" \
    AGENT_CORE_GITHUB_ENABLED='false' \
    AGENT_CORE_MAINTENANCE_ENABLED='false' \
    AGENT_CORE_MCP_PROTOCOL_MODE='dual' \
    node "$entry" >>"$BACKEND_LOG_FILE" 2>&1 < /dev/null &
  local pid=$!
  printf '%s\n' "$pid" > "$BACKEND_PID_FILE"

  local deadline=$((SECONDS + 30))
  while (( SECONDS < deadline )); do
    if ! backend_owned_and_alive "$pid"; then
      rm -f "$BACKEND_PID_FILE"
      fail 'SHADOW_BACKEND_EXITED_BEFORE_READY'
    fi
    if backend_health_ok; then
      return 0
    fi
    sleep 0.2
  done

  kill "$pid" 2>/dev/null || true
  rm -f "$BACKEND_PID_FILE"
  fail 'SHADOW_BACKEND_READINESS_TIMEOUT'
}

watchdog_running() {
  command -v tmux >/dev/null 2>&1 || return 1
  tmux has-session -t "$WATCHDOG_SESSION" 2>/dev/null
}

start_watchdog_if_enabled() {
  is_true "$WATCHDOG_ENABLED" || return 0
  require_command tmux
  watchdog_running && return 0

  local watchdog="$SOURCE_ROOT/scripts/codespace/watch-memory-observatory.sh"
  [[ -f "$watchdog" ]] || watchdog="$SCRIPT_DIR/watch-memory-observatory.sh"
  [[ -f "$watchdog" ]] || fail 'OBSERVATORY_WATCHDOG_MISSING'

  local quoted_source quoted_state quoted_upstream quoted_port quoted_workspace quoted_watchdog quoted_log
  printf -v quoted_source '%q' "$SOURCE_ROOT"
  printf -v quoted_state '%q' "$STATE_DIR"
  printf -v quoted_upstream '%q' "$AGENT_CORE_URL"
  printf -v quoted_port '%q' "$PORT"
  printf -v quoted_workspace '%q' "$WORKSPACE_ROOT"
  printf -v quoted_watchdog '%q' "$watchdog"
  printf -v quoted_log '%q' "$WATCHDOG_LOG"
  local cmd="exec env MEMORY_OBSERVATORY_SOURCE_ROOT=$quoted_source MEMORY_OBSERVATORY_LIFECYCLE_DIR=$quoted_state MEMORY_OBSERVATORY_AGENT_CORE_URL=$quoted_upstream MEMORY_OBSERVATORY_PORT=$quoted_port MEMORY_OBSERVATORY_WORKSPACE_ROOT=$quoted_workspace MEMORY_OBSERVATORY_WATCHDOG_ENABLED=0 bash $quoted_watchdog >>$quoted_log 2>&1"
  if [[ -n "${AGENT_CORE_CODESPACE_LOCK_FD:-}" ]]; then
    cmd="exec ${AGENT_CORE_CODESPACE_LOCK_FD}>&-; $cmd"
  fi
  tmux new-session -d -s "$WATCHDOG_SESSION" "$cmd" >/dev/null 2>&1 || fail 'OBSERVATORY_WATCHDOG_START_FAILED'
}

main() {
  require_command node
  require_command npm
  require_command curl
  require_command git
  mkdir -p "$STATE_DIR"
  resolve_shadow_source
  ensure_dependencies_and_builds
  start_shadow_backend_if_needed

  MEMORY_OBSERVATORY_AGENT_CORE_URL="$AGENT_CORE_URL" \
  MEMORY_OBSERVATORY_PORT="$PORT" \
  MEMORY_OBSERVATORY_WORKSPACE_ROOT="$WORKSPACE_ROOT" \
  MEMORY_OBSERVATORY_LIFECYCLE_DIR="$STATE_DIR" \
    bash "$SOURCE_ROOT/scripts/codespace/start-memory-observatory.sh"

  start_watchdog_if_enabled
}

main "$@"
