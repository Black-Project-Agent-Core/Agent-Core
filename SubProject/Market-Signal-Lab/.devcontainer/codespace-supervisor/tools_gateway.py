from __future__ import annotations

import json
import os
import re
import selectors
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


GATEWAY_VERSION = "1.0.0"
TOOLS_ROOT = Path("/workspaces/.assistant-tools").resolve()
REGISTRY_PATH = (TOOLS_ROOT / "state" / "registry.json").resolve()
BIN_DIR = (TOOLS_ROOT / "bin").resolve()
NPM_BIN_DIR = (TOOLS_ROOT / "npm-global" / "bin").resolve()
SOURCE_DIR = (TOOLS_ROOT / "src").resolve()
CONTEXT7_DIR = (TOOLS_ROOT / "context7").resolve()

MAX_OUTPUT_CHARS = int(os.getenv("TOOLS_GATEWAY_MAX_OUTPUT_CHARS", "40000"))
MAX_TIMEOUT_SECONDS = int(os.getenv("TOOLS_GATEWAY_MAX_TIMEOUT_SECONDS", "45"))
MAX_SOURCE_FILES = int(os.getenv("TOOLS_GATEWAY_MAX_SOURCE_FILES", "250"))
MAX_SOURCE_BYTES = int(os.getenv("TOOLS_GATEWAY_MAX_SOURCE_BYTES", "262144"))

MCP_PROTOCOL_VERSION = "2025-06-18"
MCP_LOCK = threading.Lock()
CODESPACES_SHARED_ENV = Path("/workspaces/.codespaces/shared/.env")


def _codespaces_env_value(name: str) -> Optional[str]:
    value = os.getenv(name)
    if value:
        return value
    try:
        for line in CODESPACES_SHARED_ENV.read_text(encoding="utf-8").splitlines():
            if not line.startswith(name + "="):
                continue
            value = line.split("=", 1)[1].strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            return value or None
    except OSError:
        return None
    return None


class ToolInvokeRequest(BaseModel):
    toolId: str = Field(min_length=1, max_length=120)
    operation: str = Field(min_length=1, max_length=120)
    query: Optional[str] = Field(default=None, max_length=12000)
    libraryName: Optional[str] = Field(default=None, max_length=1000)
    libraryId: Optional[str] = Field(default=None, max_length=1000)
    mcpTool: Optional[str] = Field(default=None, max_length=200)
    path: Optional[str] = Field(default=None, max_length=4096)
    text: Optional[str] = Field(default=None, max_length=30000)
    inputJson: Optional[str] = Field(default=None, max_length=30000)
    maxChars: int = Field(default=12000, ge=500, le=40000)


def _trim(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit] + "\n...[truncated]", True


def _gateway_env(state_dir: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for key in (
        "LANG", "LC_ALL", "TERM", "TMPDIR", "TZ", "CARGO_HOME",
        "RUSTUP_HOME", "GOPATH", "GOMODCACHE", "GOCACHE",
    ):
        value = os.getenv(key)
        if value:
            env[key] = value

    base_path = os.getenv("PATH", "/usr/local/bin:/usr/bin:/bin")
    env["PATH"] = os.pathsep.join((str(BIN_DIR), str(NPM_BIN_DIR), base_path))
    isolated_home = (state_dir / "tools-gateway-home").resolve()
    isolated_home.mkdir(parents=True, exist_ok=True)
    env["HOME"] = str(isolated_home)
    env["CI"] = "1"
    env["NO_COLOR"] = "1"
    browser_root = TOOLS_ROOT / "playwright-browsers"
    if browser_root.is_dir():
        env["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_root)
    bun = NPM_BIN_DIR / "bun"
    if bun.is_file():
        env["BUN"] = str(bun)
    serena_home = TOOLS_ROOT / "state" / "serena-home"
    serena_home.mkdir(parents=True, exist_ok=True)
    env["SERENA_HOME"] = str(serena_home)
    return env


def _resolve_command(command: str, state_dir: Path) -> str:
    resolved = shutil.which(command, path=_gateway_env(state_dir)["PATH"])
    if not resolved:
        raise HTTPException(status_code=503, detail=f"Tool executable unavailable: {command}")
    return resolved


def _run(
    argv: list[str],
    state_dir: Path,
    *,
    cwd: Optional[Path] = None,
    timeout: int = 20,
    max_chars: int = MAX_OUTPUT_CHARS,
    env_overrides: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    if not argv:
        raise HTTPException(status_code=400, detail="Tool argv cannot be empty")
    checked = [_resolve_command(argv[0], state_dir), *argv[1:]]
    run_env = _gateway_env(state_dir)
    if env_overrides:
        run_env.update(env_overrides)
    try:
        result = subprocess.run(
            checked,
            cwd=str(cwd or TOOLS_ROOT),
            capture_output=True,
            text=True,
            errors="replace",
            timeout=min(timeout, MAX_TIMEOUT_SECONDS),
            shell=False,
            env=run_env,
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode(errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode(errors="replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        stdout, a = _trim(stdout, max_chars // 2)
        stderr, b = _trim(stderr, max_chars // 2)
        return {
            "exitCode": 124,
            "stdout": stdout,
            "stderr": stderr,
            "timedOut": True,
            "truncated": a or b,
        }

    stdout, a = _trim(result.stdout, max_chars // 2)
    stderr, b = _trim(result.stderr, max_chars // 2)
    return {
        "exitCode": result.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "timedOut": False,
        "truncated": a or b,
    }


def _load_registry() -> dict[str, Any]:
    try:
        data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def _registry_by_name() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in _load_registry().get("tools", []):
        if isinstance(item, dict) and isinstance(item.get("name"), str):
            result[item["name"]] = item
    return result


def _command_exists(command: str, state_dir: Path) -> bool:
    return shutil.which(command, path=_gateway_env(state_dir)["PATH"]) is not None


def _source_exists(path: Path) -> bool:
    return path.exists() and path.is_dir()


def _claude_mem_env(state_dir: Path) -> dict[str, str]:
    home = (state_dir / "command-home").resolve()
    home.mkdir(parents=True, exist_ok=True)
    env = {"HOME": str(home)}
    bun = NPM_BIN_DIR / "bun"
    if bun.is_file():
        env["BUN"] = str(bun)
    return env


def _probe_claude_mem(state_dir: Path) -> tuple[str, str]:
    if not _command_exists("claude-mem", state_dir):
        return "unavailable", "CLI wrapper is not available"
    result = _run(["claude-mem", "status"], state_dir, timeout=10, max_chars=4000, env_overrides=_claude_mem_env(state_dir))
    combined = (result["stdout"] + "\n" + result["stderr"]).strip()
    if "worker is running" in combined.lower() and result["exitCode"] == 0:
        note = combined or "claude-mem worker is running"
        if "dependencies: degraded" in combined.lower():
            note += "\nHost Claude CLI integration is not configured; GPT Action uses read-only status/search directly."
        return "available", note
    if "not installed" in combined.lower():
        return "degraded", "CLI exists, but claude-mem runtime/plugin is not installed"
    if result["exitCode"] != 0:
        return "degraded", combined or "claude-mem status failed"
    return "degraded", combined or "claude-mem worker is not running"


def _tool_specs(state_dir: Path, workspace_root: Path) -> dict[str, dict[str, Any]]:
    registry = _registry_by_name()
    claude_status, claude_note = _probe_claude_mem(state_dir)

    def meta(name: str) -> dict[str, Any]:
        item = registry.get(name, {})
        return {
            "source": item.get("source"),
            "commit": item.get("commit"),
            "version": item.get("version"),
            "registryStatus": item.get("status"),
            "notes": item.get("notes"),
        }

    specs: dict[str, dict[str, Any]] = {
        "j-space": {
            "name": "J-Space Cognition Suite",
            "kind": "skill+cli",
            "availability": "available" if _command_exists("jspace", state_dir) else "unavailable",
            "executionMode": "deterministic-cli",
            "operations": ["seam", "resume", "note", "ship"],
            "description": "J-Space ledger instrument. State is kept under /workspaces/.assistant-tools/state, not in the project repo.",
            **meta("j-space"),
        },
        "claude-mem": {
            "name": "claude-mem",
            "kind": "cli+library+host-plugin",
            "availability": claude_status,
            "executionMode": "read-only-cli",
            "operations": ["version", "status", "search"],
            "description": "Read-only gateway surface. Automatic ChatGPT Action session capture is not provided.",
            "availabilityNote": claude_note,
            **meta("claude-mem"),
        },
        "openhands-agent-canvas": {
            "name": "OpenHands Agent Canvas",
            "kind": "agent-stack",
            "availability": "metadata-only" if _command_exists("agent-canvas", state_dir) else "unavailable",
            "executionMode": "metadata-only",
            "operations": ["version", "info"],
            "description": "Registered for metadata/compatibility inspection only. The gateway will not launch a second reasoning agent.",
            **meta("openhands-agent-canvas"),
        },
        "code-intelligence": {
            "name": "agent-plugins/code-intelligence",
            "kind": "skill-source",
            "availability": "available" if _source_exists(SOURCE_DIR / "agent-plugins" / "plugins" / "code-intelligence") else "unavailable",
            "executionMode": "local-skill-source",
            "operations": ["read", "search"],
            "description": "Read/search the locally installed code-intelligence skill source. It is guidance, not a native GPT plugin.",
            **meta("agent-plugins/code-intelligence"),
        },
        "plugin-catalogue": {
            "name": "awesome-claude-code-plugins",
            "kind": "catalogue-source",
            "availability": "available" if _source_exists(SOURCE_DIR / "awesome-claude-code-plugins") else "unavailable",
            "executionMode": "local-catalogue-search",
            "operations": ["read", "search"],
            "description": "Local curated catalogue discovery source. Linked plugins are not auto-installed.",
            **meta("awesome-claude-code-plugins"),
        },
        "context7": {
            "name": "Context7",
            "kind": "mcp-documentation",
            "availability": "available" if _command_exists("context7-query", state_dir) else "unavailable",
            "executionMode": "mcp-adapter",
            "operations": ["list-tools", "resolve-library", "query-docs"],
            "description": "Version-specific library/framework/SDK/API documentation through the locally installed Context7 MCP helper.",
            **meta("context7"),
        },
    }

    mcp_servers = {
        "mcp-everything": ("Everything reference server", "mcp-server-everything", "reviewed-subset"),
        "mcp-filesystem": ("Filesystem reference server", "mcp-server-filesystem", "workspace-read-only"),
        "mcp-memory": ("Memory reference server", "mcp-server-memory", "experimental-process-scope"),
        "mcp-sequential-thinking": ("Sequential Thinking reference server", "mcp-server-sequential-thinking", "list-only"),
        "mcp-fetch": ("Fetch reference server", "mcp-server-fetch", "network-fetch"),
        "mcp-git": ("Git reference server", "mcp-server-git", "read-only"),
        "mcp-time": ("Time reference server", "mcp-server-time", "read-only"),
    }
    mcp_meta = meta("modelcontextprotocol/servers")
    for tool_id, (name, command, policy) in mcp_servers.items():
        specs[tool_id] = {
            "name": name,
            "kind": "mcp-reference-server",
            "availability": "available" if _command_exists(command, state_dir) else "unavailable",
            "executionMode": "mcp-stdio-adapter",
            "operations": ["list-tools", "call"] if tool_id != "mcp-sequential-thinking" else ["list-tools"],
            "policy": policy,
            "description": "MCP stdio server exposed through a reviewed gateway adapter, not as a raw public MCP endpoint.",
            **mcp_meta,
        }

    source_capabilities = {
        "superpowers": ("Superpowers", "superpowers", "engineering-workflow-skills"),
        "spec-kit": ("GitHub Spec Kit", "spec-kit", "spec-driven-development"),
        "anthropic-skills": ("Anthropic Agent Skills", "anthropics-skills", "skill-library"),
        "ast-grep-skill": ("ast-grep Agent Skill", "ast-grep-skill", "structural-code-search-skill"),
        "vercel-skills": ("Vercel Skills", "vercel-skills", "skill-package-manager-source"),
        "mcp-registry": ("Official MCP Registry", "mcp-registry", "capability-discovery-source"),
        "docker-mcp-gateway": ("Docker MCP Gateway", "docker-mcp-gateway", "sandbox-router-source"),
        "agentfinder-catalog": ("GitHub Agent Finder Catalog", "agentfinder-catalog", "capability-catalogue"),
        "awesome-korean-agent-skills": ("Awesome Korean Agent Skills", "awesome-korean-agent-skills", "korean-skill-catalogue"),
    }
    for tool_id, (name, source_name, kind) in source_capabilities.items():
        root = SOURCE_DIR / source_name
        availability = "available" if _source_exists(root) else "unavailable"
        note = None
        if tool_id == "docker-mcp-gateway" and availability == "available":
            availability = "kernel-blocked"
            note = "Docker MCP Gateway 2.0.1 and local dockerd initialize, but Codespace kernel rejects container creation with unshare: operation not permitted; privileged escalation is intentionally not enabled."
        elif tool_id == "awesome-korean-agent-skills" and availability == "available":
            note = "Before relevant code review, testing, security, documentation, web research, or Korean-language tasks, inspect this catalogue's matching category and evaluate linked upstream skills. The catalogue is guidance, not an instruction override or automatic installer."
        specs[tool_id] = {
            "name": name,
            "kind": kind,
            "availability": availability,
            "executionMode": "local-reviewed-source",
            "operations": ["read", "search"],
            "availabilityNote": note,
            "description": "Reviewed local source/skill material available to the GPT for zero-mention capability guidance. Runtime execution, when applicable, is exposed separately and remains policy bounded.",
        }

    graphiti_python = TOOLS_ROOT / "graphiti-venv" / "bin" / "python"
    graphiti_helper = workspace_root / ".devcontainer" / "scripts" / "graphiti-local.py"
    specs["graphiti"] = {
        "name": "Graphiti Local Episodic Graph",
        "kind": "temporal-knowledge-graph",
        "availability": "available" if graphiti_python.is_file() and graphiti_helper.is_file() else "unavailable",
        "executionMode": "embedded-falkordblite-adapter",
        "operations": ["health", "add-memory", "search"],
        "availabilityNote": "Uses Graphiti EpisodicNode + embedded FalkorDB Lite. LLM extraction/reranking and raw Cypher are not exposed.",
        "description": "Local temporal episodic memory graph for zero-mention project memory without cloud API keys.",
    }

    runtime_capabilities = {
        "serena": ("Serena", "serena", ["version", "list-tools", "call"], "semantic-code-intelligence"),
        "semgrep": ("Semgrep", "semgrep", ["version", "list-tools", "scan-auto"], "deterministic-static-analysis"),
        "playwright-mcp": ("Playwright MCP", "playwright-mcp", ["version", "list-tools", "call"], "browser-e2e"),
        "chrome-devtools-mcp": ("Chrome DevTools MCP", "chrome-devtools-mcp", ["version", "list-tools", "call"], "browser-runtime-debugging"),
        "repomix": ("Repomix", "repomix", ["version", "pack"], "context-compression"),
        "beads": ("Beads", "bd", ["version", "ready"], "persistent-task-graph"),
        "task-master": ("Task Master", "task-master", ["version", "list", "next", "show", "validate-dependencies"], "task-planning"),
        "agentmemory": ("AgentMemory", "agentmemory-mcp", ["version", "list-tools", "call"], "episodic-memory"),
        "github-mcp": ("GitHub MCP Server", "github-mcp-server", ["version", "list-tools", "call"], "github-automation"),
        "mcp-language-server": ("MCP Language Server", "mcp-language-server", ["info", "list-tools", "call"], "lsp-bridge"),
        "agent-skill-eval": ("Agent Skill Eval", "agent-skill-eval", ["version", "list", "validate", "status", "portfolio"], "skill-evaluation"),
        "skills-cli": ("Vercel Skills CLI", "skills", ["version", "find", "list"], "skill-package-manager"),
        "ast-grep": ("ast-grep CLI", "ast-grep", ["version", "search-pattern"], "structural-code-search"),
        "desktop-commander": ("Desktop Commander MCP", "desktop-commander", ["version", "list-tools", "call"], "local-terminal-file-operations"),
    }
    for tool_id, (name, command, operations, kind) in runtime_capabilities.items():
        availability = "available" if _command_exists(command, state_dir) else "unavailable"
        note = None
        if tool_id == "github-mcp":
            if not _codespaces_env_value("GITHUB_TOKEN"):
                availability, note = "credential-required", "Codespaces GITHUB_TOKEN is unavailable to the supervisor"
            else:
                note = "Uses the ephemeral Codespaces token internally with the GitHub MCP server in native read-only mode"
        elif tool_id in {"playwright-mcp", "chrome-devtools-mcp"}:
            note = "Browser execution is restricted to local/current Codespace URLs and uses the persistent Playwright Chromium runtime"
        elif tool_id == "task-master":
            tm_root = _task_master_root(workspace_root)
            if not (tm_root / ".taskmaster").is_dir():
                availability, note = "degraded", "Persistent external Task Master state is not initialized yet"
            else:
                note = f"Persistent task state is external to the repo at {tm_root}"
        elif tool_id == "agent-skill-eval":
            note = "Only inspection/validation/reporting operations are exposed; model-running evaluation commands remain disabled"
        elif tool_id == "skills-cli":
            note = "Discovery/listing only; automatic skill installation/update is intentionally disabled"
        elif tool_id == "mcp-language-server":
            note = "Read-only gopls-backed definition/diagnostics/hover/references; edit and rename are blocked"
        specs[tool_id] = {
            "name": name,
            "kind": kind,
            "availability": availability,
            "executionMode": "reviewed-cli-or-mcp-adapter",
            "operations": operations,
            "availabilityNote": note,
            "description": "Installed capability exposed through a least-privilege gateway surface; arbitrary command passthrough is not available.",
        }

    return specs


def _parse_input_json(raw: Optional[str]) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"inputJson must contain a JSON object: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="inputJson must contain a JSON object")
    return parsed


def _bounded_file_text(path: Path, max_chars: int) -> str:
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Source file not found")
    data = path.read_bytes()
    if len(data) > MAX_SOURCE_BYTES:
        data = data[:MAX_SOURCE_BYTES]
    text = data.decode("utf-8", errors="replace")
    return _trim(text, max_chars)[0]


def _source_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    result: list[Path] = []
    for path in sorted(root.rglob("*")):
        if len(result) >= MAX_SOURCE_FILES:
            break
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.suffix.lower() not in {".md", ".txt", ".json", ".yaml", ".yml", ".toml"}:
            continue
        result.append(path)
    return result


def _read_source(root: Path, requested: Optional[str], max_chars: int) -> dict[str, Any]:
    if not root.is_dir():
        raise HTTPException(status_code=503, detail="Local source is unavailable")
    if requested:
        candidate = (root / requested).resolve()
        if candidate != root and root not in candidate.parents:
            raise HTTPException(status_code=403, detail="Requested source path escapes registered tool source")
        return {
            "path": str(candidate.relative_to(root)),
            "content": _bounded_file_text(candidate, max_chars),
        }

    candidates = _source_files(root)
    preferred = next((p for p in candidates if p.name in {"POWER.md", "README.md", "SKILL.md"}), None)
    if preferred is None:
        if not candidates:
            raise HTTPException(status_code=404, detail="No readable source files found")
        preferred = candidates[0]
    return {
        "path": str(preferred.relative_to(root)),
        "content": _bounded_file_text(preferred, max_chars),
    }


def _search_source(root: Path, query: str, max_chars: int) -> dict[str, Any]:
    if not query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    needle = query.casefold()
    matches: list[dict[str, Any]] = []
    used = 0
    for path in _source_files(root):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line_no, line in enumerate(text.splitlines(), 1):
            if needle not in line.casefold():
                continue
            snippet = line.strip()
            item = {
                "path": str(path.relative_to(root)),
                "line": line_no,
                "text": snippet[:1000],
            }
            size = len(json.dumps(item, ensure_ascii=False))
            if used + size > max_chars or len(matches) >= 80:
                return {"query": query, "matches": matches, "truncated": True}
            matches.append(item)
            used += size
    return {"query": query, "matches": matches, "truncated": False}


def _jspace(request: ToolInvokeRequest, state_dir: Path, workspace_root: Path) -> dict[str, Any]:
    op = request.operation
    if op in {"seam", "resume"}:
        return _run(["jspace", op], state_dir, timeout=15, max_chars=request.maxChars)
    if op == "note":
        data = _parse_input_json(request.inputJson)
        allowed = {
            "goal": "--goal",
            "core": "--core",
            "coreSlot": "--core-slot",
            "next": "--next",
            "check": "--check",
            "by": "--by",
            "open": "--open",
            "settledBy": "--settled-by",
            "close": "--close",
        }
        argv = ["jspace", "note"]
        for key, flag in allowed.items():
            value = data.get(key)
            if value is None:
                continue
            if key == "coreSlot" and str(value) not in {"1", "2"}:
                raise HTTPException(status_code=400, detail="coreSlot must be 1 or 2")
            argv.extend([flag, str(value)])
        if len(argv) == 2:
            raise HTTPException(status_code=400, detail="j-space note requires at least one supported field in inputJson")
        return _run(argv, state_dir, timeout=15, max_chars=request.maxChars)
    if op == "ship":
        if not request.path:
            raise HTTPException(status_code=400, detail="path is required for j-space ship")
        target = (workspace_root / request.path).resolve()
        if target != workspace_root and workspace_root not in target.parents:
            raise HTTPException(status_code=403, detail="j-space ship path escapes workspace root")
        if not target.is_file():
            raise HTTPException(status_code=404, detail="j-space ship target file not found")
        return _run(["jspace", "ship", str(target)], state_dir, timeout=20, max_chars=request.maxChars)
    raise HTTPException(status_code=400, detail=f"Unsupported j-space operation: {op}")


def _claude_mem(request: ToolInvokeRequest, state_dir: Path) -> dict[str, Any]:
    if request.operation == "version":
        return _run(["claude-mem", "version"], state_dir, timeout=10, max_chars=request.maxChars, env_overrides=_claude_mem_env(state_dir))
    if request.operation == "status":
        return _run(["claude-mem", "status"], state_dir, timeout=10, max_chars=request.maxChars, env_overrides=_claude_mem_env(state_dir))
    if request.operation == "search":
        if not request.query:
            raise HTTPException(status_code=400, detail="query is required for claude-mem search")
        result = _run(["claude-mem", "search", request.query], state_dir, timeout=20, max_chars=request.maxChars, env_overrides=_claude_mem_env(state_dir))
        if "not installed" in (result["stdout"] + result["stderr"]).lower():
            raise HTTPException(status_code=503, detail="claude-mem runtime is currently degraded/not installed")
        return result
    raise HTTPException(status_code=400, detail=f"Unsupported claude-mem operation: {request.operation}")


def _openhands_info(request: ToolInvokeRequest, state_dir: Path) -> dict[str, Any]:
    if request.operation == "version":
        return _run(["agent-canvas", "--version"], state_dir, timeout=10, max_chars=request.maxChars)
    if request.operation == "info":
        return _run(["agent-canvas", "--info"], state_dir, timeout=10, max_chars=request.maxChars)
    raise HTTPException(status_code=403, detail="OpenHands Agent Canvas execution is disabled; only version/info are exposed")


def _context7(request: ToolInvokeRequest, state_dir: Path) -> dict[str, Any]:
    if request.operation == "list-tools":
        return _run(["context7-query", "list-tools"], state_dir, timeout=20, max_chars=request.maxChars)
    if request.operation == "resolve-library":
        if not request.libraryName or not request.query:
            raise HTTPException(status_code=400, detail="libraryName and query are required")
        return _run(
            ["context7-query", "resolve", request.libraryName, request.query],
            state_dir,
            timeout=30,
            max_chars=request.maxChars,
        )
    if request.operation == "query-docs":
        if not request.libraryId or not request.query:
            raise HTTPException(status_code=400, detail="libraryId and query are required")
        return _run(
            ["context7-query", "docs", request.libraryId, request.query],
            state_dir,
            timeout=30,
            max_chars=request.maxChars,
        )
    raise HTTPException(status_code=400, detail=f"Unsupported Context7 operation: {request.operation}")


def _installed_source_invoke(request: ToolInvokeRequest) -> dict[str, Any]:
    roots = {
        "superpowers": "superpowers",
        "spec-kit": "spec-kit",
        "anthropic-skills": "anthropics-skills",
        "ast-grep-skill": "ast-grep-skill",
        "vercel-skills": "vercel-skills",
        "mcp-registry": "mcp-registry",
        "docker-mcp-gateway": "docker-mcp-gateway",
        "agentfinder-catalog": "agentfinder-catalog",
    }
    source_name = roots.get(request.toolId)
    if not source_name:
        raise HTTPException(status_code=404, detail="Unknown installed source capability")
    root = SOURCE_DIR / source_name
    if request.operation == "read":
        return _read_source(root, request.path, request.maxChars)
    if request.operation == "search":
        return _search_source(root, request.query or "", request.maxChars)
    raise HTTPException(status_code=400, detail="Source capability operation must be read or search")


def _graphiti_local(request: ToolInvokeRequest, state_dir: Path, workspace_root: Path) -> dict[str, Any]:
    py = TOOLS_ROOT / "graphiti-venv" / "bin" / "python"
    helper_path = workspace_root / ".devcontainer" / "scripts" / "graphiti-local.py"
    if not py.is_file() or not helper_path.is_file():
        raise HTTPException(status_code=503, detail="Graphiti local runtime is unavailable")
    if request.operation == "health":
        argv = [str(py), str(helper_path), "health"]
    elif request.operation == "add-memory":
        if not request.text:
            raise HTTPException(status_code=400, detail="text is required for Graphiti add-memory")
        opts = _parse_input_json(request.inputJson)
        argv = [str(py), str(helper_path), "add", "--text", request.text]
        name = opts.get("name")
        group = opts.get("group")
        source_description = opts.get("sourceDescription")
        if isinstance(name, str) and name:
            argv += ["--name", name[:256]]
        if isinstance(group, str) and group:
            argv += ["--group", group[:256]]
        if isinstance(source_description, str) and source_description:
            argv += ["--source-description", source_description[:1000]]
    elif request.operation == "search":
        if not request.query:
            raise HTTPException(status_code=400, detail="query is required for Graphiti search")
        opts = _parse_input_json(request.inputJson)
        limit = opts.get("limit", 10)
        try:
            limit = max(1, min(int(limit), 50))
        except Exception:
            limit = 10
        argv = [str(py), str(helper_path), "search", "--query", request.query, "--limit", str(limit)]
        group = opts.get("group")
        if isinstance(group, str) and group:
            argv += ["--group", group[:256]]
    else:
        raise HTTPException(status_code=400, detail="Unsupported Graphiti operation")
    return _run(argv, state_dir, cwd=workspace_root, timeout=20, max_chars=request.maxChars)


def _task_master_root(workspace_root: Path) -> Path:
    return (TOOLS_ROOT / "state" / "task-master" / workspace_root.name).resolve()


def _runtime_capability(request: ToolInvokeRequest, state_dir: Path, workspace_root: Path) -> dict[str, Any]:
    if request.operation == "version":
        commands = {
            "serena": ["serena", "--version"],
            "semgrep": ["semgrep", "--version"],
            "playwright-mcp": ["playwright-mcp", "--version"],
            "chrome-devtools-mcp": ["chrome-devtools-mcp", "--version"],
            "repomix": ["repomix", "--version"],
            "beads": ["bd", "version"],
            "task-master": ["task-master", "--version"],
            "github-mcp": ["github-mcp-server", "--version"],
            "agent-skill-eval": ["agent-skill-eval", "--version"],
            "skills-cli": ["skills", "--version"],
            "ast-grep": ["ast-grep", "--version"],
            "agentmemory": ["agentmemory-mcp", "--version"],
        }
        command = commands.get(request.toolId)
        if not command:
            raise HTTPException(status_code=400, detail="Version operation is not supported for this capability")
        return _run(command, state_dir, timeout=8, max_chars=request.maxChars)
    if request.operation == "info":
        commands = {
            "mcp-language-server": ["mcp-language-server", "--help"],
        }
        command = commands.get(request.toolId)
        if not command:
            raise HTTPException(status_code=400, detail="Info operation is not supported for this capability")
        return _run(command, state_dir, timeout=8, max_chars=request.maxChars)
    if request.toolId == "ast-grep" and request.operation == "search-pattern":
        if not request.query:
            raise HTTPException(status_code=400, detail="query carries the structural pattern and is required for ast-grep search-pattern")
        options = _parse_input_json(request.inputJson)
        language = options.get("language")
        if not isinstance(language, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", language):
            raise HTTPException(status_code=400, detail="inputJson.language is required for ast-grep search-pattern")
        raw = Path(request.path or ".")
        target = raw.resolve() if raw.is_absolute() else (workspace_root / raw).resolve()
        try:
            target.relative_to(workspace_root.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=403, detail="ast-grep target is outside the workspace") from exc
        return _run(["ast-grep", "run", "-p", request.query, "-l", language, "--json=compact", str(target)], state_dir, cwd=workspace_root, timeout=20, max_chars=request.maxChars)

    if request.toolId == "skills-cli" and request.operation == "find":
        if not request.query:
            raise HTTPException(status_code=400, detail="query is required for skills find")
        return _run(["skills", "find", request.query], state_dir, cwd=workspace_root, timeout=20, max_chars=request.maxChars)
    if request.toolId == "skills-cli" and request.operation == "list":
        return _run(["skills", "list"], state_dir, cwd=workspace_root, timeout=10, max_chars=request.maxChars)

    if request.toolId == "task-master" and request.operation in {"list", "next", "show", "validate-dependencies"}:
        tm_root = _task_master_root(workspace_root)
        if not (tm_root / ".taskmaster").exists():
            raise HTTPException(status_code=409, detail="Persistent Task Master state is not initialized")
        if request.operation == "list":
            return _run(["task-master", "list", "--json", "--project", str(tm_root)], state_dir, cwd=tm_root, timeout=15, max_chars=request.maxChars)
        if request.operation == "next":
            return _run(["task-master", "next", "--project", str(tm_root)], state_dir, cwd=tm_root, timeout=15, max_chars=request.maxChars)
        if request.operation == "show":
            if not request.query or not re.fullmatch(r"[A-Za-z0-9._,-]{1,128}", request.query):
                raise HTTPException(status_code=400, detail="query must contain the Task Master task id for show")
            return _run(["task-master", "show", request.query, "--json", "--project", str(tm_root)], state_dir, cwd=tm_root, timeout=15, max_chars=request.maxChars)
        task_file = tm_root / ".taskmaster" / "tasks" / "tasks.json"
        if not task_file.is_file():
            return {"exitCode": 0, "stdout": json.dumps({"valid": True, "message": "No Task Master tasks file exists yet"}), "stderr": "", "timedOut": False, "truncated": False}
        return _run(["task-master", "validate-dependencies", "--file", str(task_file)], state_dir, cwd=tm_root, timeout=15, max_chars=request.maxChars)

    if request.toolId == "agent-skill-eval" and request.operation in {"list", "validate", "status", "portfolio"}:
        raw = Path(request.path or ".")
        target = raw.resolve() if raw.is_absolute() else (workspace_root / raw).resolve()
        trusted_roots = [workspace_root.resolve(), SOURCE_DIR.resolve()]
        if not any(target == root or root in target.parents for root in trusted_roots):
            raise HTTPException(status_code=403, detail="Agent Skill Eval path is outside reviewed roots")
        if request.operation == "list":
            return _run(["agent-skill-eval", "list", "--root", str(target), "--format", "json"], state_dir, cwd=workspace_root, timeout=15, max_chars=request.maxChars)
        if request.operation == "portfolio":
            return _run(["agent-skill-eval", "portfolio", "--root", str(target), "--format", "json"], state_dir, cwd=workspace_root, timeout=15, max_chars=request.maxChars)
        if request.operation == "validate":
            if target.name != "evals.json" or not target.is_file():
                raise HTTPException(status_code=400, detail="validate requires path to an evals.json file")
            return _run(["agent-skill-eval", "validate", str(target), "--strict"], state_dir, cwd=workspace_root, timeout=15, max_chars=request.maxChars)
        if not target.is_dir():
            raise HTTPException(status_code=400, detail="status requires path to an evaluation workspace directory")
        return _run(["agent-skill-eval", "status", "--workspace", str(target)], state_dir, cwd=workspace_root, timeout=15, max_chars=request.maxChars)

    if request.toolId == "semgrep" and request.operation == "scan-auto":
        if not request.path:
            raise HTTPException(status_code=400, detail="path is required for Semgrep scan-auto")
        raw = Path(request.path)
        target = raw.resolve() if raw.is_absolute() else (workspace_root / raw).resolve()
        try:
            target.relative_to(workspace_root.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=403, detail="Semgrep scan target is outside the workspace") from exc
        if not target.exists():
            raise HTTPException(status_code=404, detail="Semgrep scan target does not exist")
        return _run(
            ["semgrep", "scan", "--config", "auto", "--json", "--quiet", str(target)],
            state_dir,
            cwd=workspace_root,
            timeout=45,
            max_chars=request.maxChars,
        )

    if request.toolId == "repomix" and request.operation == "pack":
        return _run(["repomix", "--stdout", "--compress"], state_dir, cwd=workspace_root, timeout=30, max_chars=request.maxChars)
    if request.toolId == "beads" and request.operation == "ready":
        return _run(["bd", "ready"], state_dir, cwd=workspace_root, timeout=15, max_chars=request.maxChars)
    raise HTTPException(status_code=400, detail="Unsupported runtime capability operation")


def _prepare_serena_project(workspace_root: Path) -> tuple[Path, bool]:
    external = (TOOLS_ROOT / "state" / "serena-project" / workspace_root.name).resolve()
    external.mkdir(parents=True, exist_ok=True)
    link = workspace_root / ".serena"
    if link.is_symlink():
        try:
            if link.resolve() == external:
                return link, False
        except OSError:
            pass
        raise HTTPException(status_code=409, detail="Unexpected .serena symlink exists in workspace")
    if link.exists():
        raise HTTPException(status_code=409, detail="Workspace .serena path already exists and is not managed by Tools Gateway")
    link.symlink_to(external, target_is_directory=True)
    return link, True


def _cleanup_serena_project(link: Optional[Path], created: bool) -> None:
    if link is None or not created:
        return
    try:
        if link.is_symlink():
            link.unlink()
    except OSError:
        pass


def _playwright_browser_executable() -> Optional[str]:
    root = TOOLS_ROOT / "playwright-browsers"
    candidates = sorted(root.glob("chromium-*/chrome-linux64/chrome"), reverse=True)
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def _mcp_command(tool_id: str, workspace_root: Path, state_dir: Path) -> list[str]:
    playwright_output = (state_dir / "playwright-output").resolve()
    playwright_output.mkdir(parents=True, exist_ok=True)
    playwright_command = [
        "playwright-mcp", "--headless", "--isolated", "--image-responses", "omit",
        "--output-dir", str(playwright_output),
    ]
    playwright_executable = _playwright_browser_executable()
    if playwright_executable:
        playwright_command.extend(["--executable-path", playwright_executable])

    chrome_command = [
        "chrome-devtools-mcp", "--headless", "--isolated",
        "--no-usage-statistics", "--no-performance-crux",
        "--chromeArg=--no-sandbox", "--chromeArg=--disable-setuid-sandbox",
    ]
    if playwright_executable:
        chrome_command.extend(["--executablePath", playwright_executable])

    mapping = {
        "mcp-everything": ["mcp-server-everything", "stdio"],
        "mcp-filesystem": ["mcp-server-filesystem", str(workspace_root)],
        "mcp-memory": ["mcp-server-memory"],
        "mcp-sequential-thinking": ["mcp-server-sequential-thinking"],
        "mcp-fetch": ["mcp-server-fetch"],
        "mcp-git": ["mcp-server-git", "--repository", str(workspace_root)],
        "mcp-time": ["mcp-server-time", "--local-timezone", "Asia/Jakarta"],
        "serena": ["serena", "start-mcp-server", "--transport", "stdio", "--project", str(workspace_root), "--enable-web-dashboard", "False", "--open-web-dashboard", "False"],
        "semgrep": ["semgrep", "mcp", "--transport", "stdio"],
        "playwright-mcp": playwright_command,
        "chrome-devtools-mcp": chrome_command,
        "agentmemory": ["agentmemory-mcp"],
        "github-mcp": [
            "github-mcp-server", "stdio", "--read-only",
            "--toolsets", "repos,issues,pull_requests,actions,code_security,dependabot",
        ],
        "mcp-language-server": [
            "mcp-language-server", "-workspace", str(workspace_root), "-lsp", "gopls",
        ],
    }
    try:
        return mapping[tool_id]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown MCP server") from exc


def _mcp_allowed_call(tool_id: str, tool_name: str) -> bool:
    allowlists: dict[str, set[str]] = {
        "mcp-everything": {
            "echo", "get-annotated-message", "get-resource-links",
            "get-resource-reference", "get-structured-content", "get-sum",
            "get-tiny-image",
        },
        "mcp-filesystem": {
            "read_file", "read_text_file", "read_media_file", "read_multiple_files",
            "list_directory", "list_directory_with_sizes", "directory_tree",
            "search_files", "get_file_info", "list_allowed_directories",
        },
        "mcp-memory": {
            "create_entities", "create_relations", "add_observations",
            "delete_entities", "delete_observations", "delete_relations",
            "read_graph", "search_nodes", "open_nodes",
        },
        "mcp-fetch": {"fetch"},
        "mcp-git": {
            "git_status", "git_diff_unstaged", "git_diff_staged", "git_diff",
            "git_log", "git_show", "git_branch",
        },
        "mcp-time": {"get_current_time", "convert_time"},
        "mcp-sequential-thinking": set(),
        "serena": {
            "read_file", "list_dir", "find_file", "search_for_pattern",
            "get_symbols_overview", "find_symbol", "find_referencing_symbols",
            "find_implementations", "find_declaration", "get_diagnostics_for_file",
            "read_memory", "list_memories", "get_current_config",
        },
        "semgrep": set(),
        "agentmemory": {
            "memory_recall", "memory_sessions", "memory_smart_search",
            "memory_export", "memory_audit",
        },
        "playwright-mcp": {
            "browser_console_messages", "browser_find", "browser_navigate",
            "browser_navigate_back", "browser_network_requests", "browser_network_request",
            "browser_take_screenshot", "browser_snapshot", "browser_tabs", "browser_wait_for",
        },
        "mcp-language-server": {"definition", "diagnostics", "hover", "references"},
        "github-mcp": {
            "actions_get", "actions_list", "get_code_scanning_alert", "get_commit",
            "get_dependabot_alert", "get_file_contents", "get_job_logs", "get_label",
            "get_latest_release", "get_release_by_tag", "get_tag", "issue_read",
            "list_branches", "list_code_scanning_alerts", "list_commits",
            "list_dependabot_alerts", "list_issues", "list_pull_requests",
            "list_releases", "list_tags", "pull_request_read", "search_code",
            "search_commits", "search_issues", "search_pull_requests",
            "search_repositories",
        },
        "chrome-devtools-mcp": {
            "get_console_message", "get_network_request", "lighthouse_audit",
            "list_console_messages", "list_network_requests", "list_pages",
            "navigate_page", "new_page", "performance_analyze_insight",
            "performance_start_trace", "performance_stop_trace", "select_page",
            "take_heapsnapshot", "take_screenshot", "take_snapshot", "wait_for",
        },
    }
    return tool_name in allowlists.get(tool_id, set())


def _workspace_github_repo(workspace_root: Path) -> Optional[tuple[str, str]]:
    try:
        remote = subprocess.check_output(
            ["git", "-C", str(workspace_root), "remote", "get-url", "origin"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r"github\.com(?::|/)([^/]+)/([^/]+?)(?:\.git)?$", remote)
    if not match:
        return None
    return match.group(1), match.group(2)


def _browser_url_allowed(raw_url: str) -> bool:
    try:
        parsed = urlparse(raw_url)
    except Exception:
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return True
    codespace = (_codespaces_env_value("CODESPACE_NAME") or "").lower()
    domain = (_codespaces_env_value("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN") or "app.github.dev").lower()
    if codespace and host.endswith("." + domain) and host.startswith(codespace + "-"):
        return True
    return False


def _validate_mcp_call_arguments(tool_id: str, tool_name: str, args: dict[str, Any], workspace_root: Path) -> None:
    if tool_id == "serena":
        for key in ("relative_path",):
            value = args.get(key)
            if isinstance(value, str) and value:
                candidate = (workspace_root / value).resolve()
                try:
                    candidate.relative_to(workspace_root.resolve())
                except ValueError as exc:
                    raise HTTPException(status_code=403, detail="Serena path is outside the workspace") from exc

    if tool_id == "semgrep":
        code_files = args.get("code_files")
        if isinstance(code_files, list):
            for value in code_files:
                raw_path = None
                if isinstance(value, str):
                    raw_path = value
                elif isinstance(value, dict) and isinstance(value.get("path"), str):
                    raw_path = value["path"]
                if not raw_path:
                    continue
                candidate = (workspace_root / raw_path).resolve() if not os.path.isabs(raw_path) else Path(raw_path).resolve()
                try:
                    candidate.relative_to(workspace_root.resolve())
                except ValueError as exc:
                    raise HTTPException(status_code=403, detail="Semgrep path is outside the workspace") from exc

    if tool_id == "mcp-language-server":
        file_path = args.get("filePath")
        if isinstance(file_path, str) and file_path:
            candidate = Path(file_path).resolve() if os.path.isabs(file_path) else (workspace_root / file_path).resolve()
            try:
                candidate.relative_to(workspace_root.resolve())
            except ValueError as exc:
                raise HTTPException(status_code=403, detail="Language-server path is outside the workspace") from exc

    if tool_id == "github-mcp":
        current = _workspace_github_repo(workspace_root)
        if not current:
            raise HTTPException(status_code=503, detail="Current workspace GitHub repository could not be determined")
        current_owner, current_repo = current
        owner = args.get("owner")
        repo = args.get("repo")
        if owner is not None and (not isinstance(owner, str) or owner.lower() != current_owner.lower()):
            raise HTTPException(status_code=403, detail="GitHub MCP owner is outside the active repository")
        if repo is not None and (not isinstance(repo, str) or repo.lower() != current_repo.lower()):
            raise HTTPException(status_code=403, detail="GitHub MCP repository is outside the active repository")

        scoped_query_tools = {"search_code", "search_commits"}
        if tool_name in scoped_query_tools:
            query = args.get("query")
            required_scope = f"repo:{current_owner}/{current_repo}".lower()
            if not isinstance(query, str) or required_scope not in query.lower():
                raise HTTPException(status_code=403, detail="GitHub search must be scoped to the active repository")

        if tool_name in {"search_issues", "search_pull_requests"}:
            if not isinstance(owner, str) or not isinstance(repo, str):
                raise HTTPException(status_code=403, detail="GitHub issue/PR search must explicitly target the active repository")

        if tool_name == "search_repositories":
            query = args.get("query")
            if not isinstance(query, str) or "is:public" not in query.lower():
                raise HTTPException(status_code=403, detail="Repository discovery must be explicitly limited to public repositories")

        if tool_name == "actions_get" and args.get("method") == "download_workflow_run_artifact":
            raise HTTPException(status_code=403, detail="Downloading workflow artifacts is not auto-exposed")

    if tool_id == "playwright-mcp":
        if tool_name == "browser_navigate":
            url = args.get("url")
            if not isinstance(url, str) or not _browser_url_allowed(url):
                raise HTTPException(status_code=403, detail="Playwright navigation is limited to local/current Codespace URLs")
        if tool_name == "browser_tabs":
            action = args.get("action")
            if action not in {"list", "select", "close"}:
                raise HTTPException(status_code=403, detail="Playwright tab creation/navigation is not auto-exposed")
        if args.get("filename"):
            raise HTTPException(status_code=403, detail="Playwright file output is not exposed through the automatic gateway")

    if tool_id == "chrome-devtools-mcp":
        if tool_name in {"navigate_page", "new_page"}:
            url = args.get("url")
            if url is not None and (not isinstance(url, str) or not _browser_url_allowed(url)):
                raise HTTPException(status_code=403, detail="Chrome DevTools navigation is limited to local/current Codespace URLs")
        for key in ("filePath", "requestFilePath", "responseFilePath", "outputDirPath"):
            if args.get(key):
                raise HTTPException(status_code=403, detail="Chrome DevTools file output is not exposed through the automatic gateway")


def _mcp_read_response(proc: subprocess.Popen[str], wanted_id: int, timeout: float) -> dict[str, Any]:
    assert proc.stdout is not None
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        events = selector.select(max(0.0, deadline - time.monotonic()))
        if not events:
            break
        line = proc.stdout.readline()
        if not line:
            break
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("id") == wanted_id:
            return message
    raise TimeoutError(f"MCP response id={wanted_id} timed out")


def _mcp_send(proc: subprocess.Popen[str], message: dict[str, Any]) -> None:
    assert proc.stdin is not None
    proc.stdin.write(json.dumps(message, separators=(",", ":")) + "\n")
    proc.stdin.flush()


def _mcp_invoke(request: ToolInvokeRequest, state_dir: Path, workspace_root: Path) -> dict[str, Any]:
    if request.toolId == "mcp-sequential-thinking" and request.operation == "call":
        raise HTTPException(
            status_code=403,
            detail="Sequential-thinking execution is intentionally disabled; the GPT must keep its reasoning private",
        )
    if request.operation not in {"list-tools", "call"}:
        raise HTTPException(status_code=400, detail="MCP operation must be list-tools or call")
    if request.operation == "call" and not request.mcpTool:
        raise HTTPException(status_code=400, detail="mcpTool is required for MCP call")
    if request.operation == "call" and not _mcp_allowed_call(request.toolId, request.mcpTool or ""):
        raise HTTPException(status_code=403, detail="MCP tool is outside the reviewed gateway allowlist")
    call_args = _parse_input_json(request.inputJson) if request.operation == "call" else {}
    if request.operation == "call":
        _validate_mcp_call_arguments(request.toolId, request.mcpTool or "", call_args, workspace_root)

    serena_link: Optional[Path] = None
    serena_created = False
    if request.toolId == "serena":
        serena_link, serena_created = _prepare_serena_project(workspace_root)
    try:
        command = _mcp_command(request.toolId, workspace_root, state_dir)
        executable = _resolve_command(command[0], state_dir)
        checked = [executable, *command[1:]]
        env = _gateway_env(state_dir)
    except Exception:
        _cleanup_serena_project(serena_link, serena_created)
        raise
    if request.toolId == "github-mcp":
        github_token = _codespaces_env_value("GITHUB_TOKEN")
        if not github_token:
            raise HTTPException(status_code=503, detail="GitHub MCP credential is unavailable")
        env["GITHUB_PERSONAL_ACCESS_TOKEN"] = github_token

    with MCP_LOCK:
        try:
            proc = subprocess.Popen(
                checked,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1,
                cwd=str(workspace_root),
                env=env,
                shell=False,
            )
        except Exception:
            _cleanup_serena_project(serena_link, serena_created)
            raise
        try:
            _mcp_send(proc, {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "codespace-tools-gateway", "version": GATEWAY_VERSION},
                },
            })
            cold_start_tools = {"serena", "semgrep", "playwright-mcp", "chrome-devtools-mcp", "agentmemory"}
            init_timeout = 30.0 if request.toolId in cold_start_tools else 10.0
            init = _mcp_read_response(proc, 1, init_timeout)
            if "error" in init:
                raise HTTPException(status_code=502, detail={"mcpInitializeError": init["error"]})
            _mcp_send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

            if request.operation == "list-tools":
                _mcp_send(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
            else:
                _mcp_send(proc, {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {"name": request.mcpTool, "arguments": call_args},
                })

            response = _mcp_read_response(proc, 2, float(min(MAX_TIMEOUT_SECONDS, 30)))
            if "error" in response:
                raise HTTPException(status_code=502, detail={"mcpError": response["error"]})

            result = response.get("result", {})
            if request.operation == "list-tools":
                tools = []
                for tool in result.get("tools", []):
                    name = tool.get("name")
                    tools.append({
                        "name": name,
                        "description": tool.get("description"),
                        "inputSchema": tool.get("inputSchema"),
                        "callAllowed": bool(name and _mcp_allowed_call(request.toolId, name)),
                    })
                return {"server": request.toolId, "tools": tools}

            serialized = json.dumps(result, ensure_ascii=False)
            trimmed, truncated = _trim(serialized, request.maxChars)
            try:
                payload: Any = json.loads(trimmed) if not truncated else trimmed
            except json.JSONDecodeError:
                payload = trimmed
            return {
                "server": request.toolId,
                "tool": request.mcpTool,
                "result": payload,
                "truncated": truncated,
            }
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail=str(exc)) from exc
        finally:
            try:
                if proc.stdin:
                    proc.stdin.close()
            except Exception:
                pass
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=2)
            _cleanup_serena_project(serena_link, serena_created)


def build_tools_router(
    require_auth: Callable[..., None],
    state_dir: Path,
    workspace_root: Path,
) -> APIRouter:
    router = APIRouter(prefix="/tools-gateway", tags=["tools-gateway"])

    @router.get("/status", dependencies=[Depends(require_auth)])
    def status() -> dict[str, Any]:
        specs = _tool_specs(state_dir, workspace_root)
        counts: dict[str, int] = {}
        for spec in specs.values():
            key = str(spec.get("availability", "unknown"))
            counts[key] = counts.get(key, 0) + 1
        return {
            "ok": True,
            "gatewayVersion": GATEWAY_VERSION,
            "transport": "same-supervisor-port",
            "basePath": "/tools-gateway",
            "toolRoot": str(TOOLS_ROOT),
            "registry": str(REGISTRY_PATH),
            "registeredToolCount": len(specs),
            "availabilityCounts": counts,
            "rawShellPassthrough": False,
            "secondReasoningAgent": False,
        }

    @router.get("/tools", dependencies=[Depends(require_auth)])
    def list_tools() -> dict[str, Any]:
        specs = _tool_specs(state_dir, workspace_root)
        return {
            "tools": [
                {"toolId": tool_id, **spec}
                for tool_id, spec in sorted(specs.items())
            ]
        }

    @router.get("/tools/{tool_id}", dependencies=[Depends(require_auth)])
    def get_tool(tool_id: str) -> dict[str, Any]:
        specs = _tool_specs(state_dir, workspace_root)
        spec = specs.get(tool_id)
        if not spec:
            raise HTTPException(status_code=404, detail="Gateway tool not found")
        return {"toolId": tool_id, **spec}

    @router.post("/invoke", dependencies=[Depends(require_auth)])
    def invoke(request: ToolInvokeRequest) -> dict[str, Any]:
        specs = _tool_specs(state_dir, workspace_root)
        spec = specs.get(request.toolId)
        if not spec:
            raise HTTPException(status_code=404, detail="Gateway tool not found")
        if request.operation not in spec.get("operations", []):
            raise HTTPException(status_code=400, detail="Operation is not exposed for this gateway tool")
        if spec.get("availability") == "unavailable":
            raise HTTPException(status_code=503, detail="Gateway tool is currently unavailable")

        started = time.monotonic()
        if request.toolId == "j-space":
            result = _jspace(request, state_dir, workspace_root)
        elif request.toolId == "claude-mem":
            result = _claude_mem(request, state_dir)
        elif request.toolId == "openhands-agent-canvas":
            result = _openhands_info(request, state_dir)
        elif request.toolId == "code-intelligence":
            root = SOURCE_DIR / "agent-plugins" / "plugins" / "code-intelligence"
            if request.operation == "read":
                result = _read_source(root, request.path, request.maxChars)
            else:
                result = _search_source(root, request.query or "", request.maxChars)
        elif request.toolId == "plugin-catalogue":
            root = SOURCE_DIR / "awesome-claude-code-plugins"
            if request.operation == "read":
                result = _read_source(root, request.path, request.maxChars)
            else:
                result = _search_source(root, request.query or "", request.maxChars)
        elif request.toolId == "context7":
            result = _context7(request, state_dir)
        elif request.toolId in {
            "superpowers", "spec-kit", "anthropic-skills", "ast-grep-skill",
            "vercel-skills", "mcp-registry", "docker-mcp-gateway",
            "agentfinder-catalog",
        }:
            result = _installed_source_invoke(request)
        elif request.toolId == "graphiti":
            result = _graphiti_local(request, state_dir, workspace_root)
        elif request.toolId in {"serena", "playwright-mcp", "chrome-devtools-mcp", "agentmemory", "github-mcp", "mcp-language-server"} and request.operation in {"list-tools", "call"}:
            result = _mcp_invoke(request, state_dir, workspace_root)
        elif request.toolId == "semgrep" and request.operation == "list-tools":
            result = _mcp_invoke(request, state_dir, workspace_root)
        elif request.toolId in {
            "serena", "semgrep", "playwright-mcp", "chrome-devtools-mcp",
            "repomix", "beads", "task-master", "agentmemory", "github-mcp",
            "mcp-language-server", "agent-skill-eval", "skills-cli", "ast-grep",
        }:
            result = _runtime_capability(request, state_dir, workspace_root)
        elif request.toolId.startswith("mcp-"):
            result = _mcp_invoke(request, state_dir, workspace_root)
        else:
            raise HTTPException(status_code=501, detail="No adapter implemented for gateway tool")

        return {
            "toolId": request.toolId,
            "operation": request.operation,
            "durationMs": int((time.monotonic() - started) * 1000),
            "result": result,
        }

    return router
