
from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import signal
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from windows_gateway import build_windows_router
from tools_gateway import build_tools_router
from terminal_gateway import build_terminal_router

ROOT = Path(os.getenv("WORKSPACE_ROOT", "/workspaces/Market-Signal-Lab")).resolve()
BRIDGE_HOME = Path(os.getenv("BRIDGE_HOME", str(Path.home() / ".codespace-supervisor"))).resolve()
STATE_DIR = (BRIDGE_HOME / "state").resolve()
JOBS_DIR = (STATE_DIR / "jobs").resolve()
BRIDGE_TOKEN = os.getenv("BRIDGE_TOKEN", "")

if not BRIDGE_TOKEN:
    raise RuntimeError("BRIDGE_TOKEN is required")

if ROOT == BRIDGE_HOME or ROOT in BRIDGE_HOME.parents:
    raise RuntimeError("BRIDGE_HOME must not be inside WORKSPACE_ROOT")

STATE_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", "262144"))
MAX_RESPONSE_CHARS = int(os.getenv("MAX_RESPONSE_CHARS", "50000"))
MAX_TREE_ENTRIES = int(os.getenv("MAX_TREE_ENTRIES", "1200"))
MAX_SHORT_COMMAND_SECONDS = int(os.getenv("MAX_SHORT_COMMAND_SECONDS", "30"))
MAX_JOB_MINUTES = int(os.getenv("MAX_JOB_MINUTES", "120"))
MAX_LOG_BYTES = int(os.getenv("MAX_LOG_BYTES", "2097152"))

PROTECTED_BRANCHES = {
    x.strip()
    for x in os.getenv("PROTECTED_BRANCHES", "main,master").split(",")
    if x.strip()
}

SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "target", "dist", "build",
    ".next", ".cache", ".venv", "vendor", ".codespace-supervisor",
}

DENY_FILENAMES = {
    "credentials", "credentials.json", "auth.json", ".npmrc", ".pypirc",
    "id_rsa", "id_ed25519",
}

READONLY_GIT_SUBCOMMANDS = {
    "status", "diff", "log", "show", "rev-parse", "ls-files",
}

app = FastAPI(title="Codespace Supervisor Action Bridge", version="3.3.0")

JOB_LOCK = threading.Lock()
JOBS: dict[str, dict] = {}
JOB_PROCESSES: dict[str, subprocess.Popen] = {}
MUTATING_JOB_LOCK = threading.Lock()


def require_auth(authorization: Optional[str] = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if not hmac.compare_digest(authorization[7:], BRIDGE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid bearer token")


app.include_router(build_windows_router(require_auth, STATE_DIR))
app.include_router(build_tools_router(require_auth, STATE_DIR, ROOT))


def safe_path(value: str) -> Path:
    candidate = (ROOT / value).resolve()
    if candidate != ROOT and ROOT not in candidate.parents:
        raise HTTPException(status_code=403, detail="Path escapes WORKSPACE_ROOT")

    relative = candidate.relative_to(ROOT)
    lower_parts = [part.lower() for part in relative.parts]

    if any(
        part in {
            ".git", ".ssh", ".gnupg", ".aws", ".azure",
            ".chatgpt-bridge", ".codespace-supervisor"
        }
        for part in lower_parts
    ):
        raise HTTPException(status_code=403, detail="Sensitive path blocked")

    name = candidate.name.lower()
    if (name.startswith(".env") and name != ".env.example") or name in DENY_FILENAMES:
        raise HTTPException(status_code=403, detail="Sensitive file blocked")

    return candidate


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def trim(text: str, limit: int = MAX_RESPONSE_CHARS) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit] + "\n...[truncated]", True


def clean_child_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for key in (
        "PATH", "LANG", "LC_ALL", "TERM", "TMPDIR", "TZ",
        "CARGO_HOME", "RUSTUP_HOME", "GOPATH", "GOMODCACHE", "GOCACHE",
    ):
        value = os.getenv(key)
        if value:
            env[key] = value

    # Keep HOME isolated so child processes cannot inherit user-level auth files.
    # Rust's devcontainer feature uses system-scoped CARGO_HOME/RUSTUP_HOME,
    # which are explicitly propagated above without exposing GitHub/OpenAI secrets.
    isolated_home = STATE_DIR / "command-home"
    isolated_home.mkdir(parents=True, exist_ok=True)
    env["HOME"] = str(isolated_home)
    env["CI"] = "1"
    return env


def resolve_executable(raw: str, cwd: Path) -> str:
    if not raw:
        raise HTTPException(status_code=400, detail="Executable cannot be empty")

    # System/toolchain executable: resolve dynamically from PATH.
    if "/" not in raw and "\\" not in raw:
        resolved = shutil.which(raw, path=clean_child_env().get("PATH"))
        if not resolved:
            raise HTTPException(
                status_code=404,
                detail=f"Executable not found in PATH: {raw}",
            )
        # Preserve PATH shim/symlink identity.
        # Important for rustup proxies such as cargo/rustc.
        return resolved

    # Allow project-local executables such as:
    # ./gradlew
    # ./mvnw
    # ./node_modules/.bin/eslint
    # ./target/debug/tool
    # ./.venv/bin/python
    candidate_path = Path(raw)

    if candidate_path.is_absolute():
        raise HTTPException(
            status_code=403,
            detail="Use PATH or a workspace-relative executable path",
        )

    candidate = (cwd / candidate_path).resolve()

    if candidate != ROOT and ROOT not in candidate.parents:
        raise HTTPException(
            status_code=403,
            detail="Executable path escapes WORKSPACE_ROOT",
        )

    if not candidate.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Executable not found: {raw}",
        )

    if not candidate.stat().st_mode & 0o111:
        raise HTTPException(
            status_code=403,
            detail=f"File is not executable: {raw}",
        )

    return str(candidate)


def validate_argv(argv: list[str], cwd: Path) -> list[str]:
    if not argv:
        raise HTTPException(status_code=400, detail="argv cannot be empty")

    executable = resolve_executable(argv[0], cwd)
    return [executable, *argv[1:]]


def execute(argv: list[str], cwd: Path, timeout_seconds: int) -> dict:
    checked = validate_argv(argv, cwd)
    try:
        result = subprocess.run(
            checked,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout_seconds,
            shell=False,
            env=clean_child_env(),
        )
        stdout, a = trim(result.stdout, MAX_RESPONSE_CHARS // 2)
        stderr, b = trim(result.stderr, MAX_RESPONSE_CHARS // 2)
        return {
            "exitCode": result.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "timedOut": False,
            "truncated": a or b,
        }
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode(errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode(errors="replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        stdout, a = trim(stdout, MAX_RESPONSE_CHARS // 2)
        stderr, b = trim(stderr, MAX_RESPONSE_CHARS // 2)
        return {
            "exitCode": 124,
            "stdout": stdout,
            "stderr": stderr,
            "timedOut": True,
            "truncated": a or b,
        }


def codespaces_git_signing_env(args: list[str]) -> dict[str, str]:
    env = clean_child_env()

    # GitHub Codespaces signs commits with its managed gh-gpgsign helper. The
    # Action bridge intentionally strips GitHub credentials from normal child
    # commands, so expose Codespaces auth only to the signer subprocess rather
    # than to git itself or arbitrary commit hooks.
    if args and args[0] == "commit":
        shared_env = Path("/workspaces/.codespaces/shared/.env")
        managed_signer = Path("/.codespaces/bin/gh-gpgsign")
        if shared_env.is_file() and managed_signer.is_file():
            wrapper = STATE_DIR / "gh-gpgsign-action"
            wrapper.write_text(
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                "if [ -f /workspaces/.codespaces/shared/.env ]; then\n"
                "  set -a\n"
                "  . /workspaces/.codespaces/shared/.env\n"
                "  set +a\n"
                "fi\n"
                "unset BRIDGE_TOKEN || true\n"
                "exec /.codespaces/bin/gh-gpgsign \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o700)
            env["GIT_CONFIG_COUNT"] = "1"
            env["GIT_CONFIG_KEY_0"] = "gpg.program"
            env["GIT_CONFIG_VALUE_0"] = str(wrapper)

    return env


def execute_git_mutation(args: list[str], timeout_seconds: int = 30) -> dict:
    git = resolve_executable("git", ROOT)

    result = subprocess.run(
        [git, *args],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        errors="replace",
        timeout=timeout_seconds,
        shell=False,
        env=codespaces_git_signing_env(args),
    )
    stdout, a = trim(result.stdout, MAX_RESPONSE_CHARS // 2)
    stderr, b = trim(result.stderr, MAX_RESPONSE_CHARS // 2)
    return {
        "exitCode": result.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "truncated": a or b,
    }


def current_branch() -> str:
    result = execute(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        ROOT,
        10,
    )
    if result["exitCode"] != 0:
        raise HTTPException(status_code=500, detail="Unable to determine branch")
    return result["stdout"].strip()


def ensure_mutable_branch() -> None:
    branch = current_branch()
    if branch in PROTECTED_BRANCHES:
        raise HTTPException(
            status_code=409,
            detail=f"Mutations blocked on protected branch: {branch}",
        )


def command_is_readonly(argv: list[str]) -> bool:
    return bool(
        argv
        and argv[0] == "git"
        and len(argv) >= 2
        and argv[1] in READONLY_GIT_SUBCOMMANDS
    )


app.include_router(build_terminal_router(
    require_auth=require_auth,
    state_dir=STATE_DIR,
    safe_path=safe_path,
    validate_argv=validate_argv,
    ensure_mutable_branch=ensure_mutable_branch,
    command_is_readonly=command_is_readonly,
))


def read_log(path: Path, max_chars: int) -> tuple[str, bool]:
    if not path.exists():
        return "", False
    data = path.read_bytes()
    truncated = len(data) > MAX_LOG_BYTES
    if truncated:
        data = data[-MAX_LOG_BYTES:]
    text = data.decode("utf-8", errors="replace")
    text, char_truncated = trim(text, max_chars)
    return text, truncated or char_truncated


class WriteFileRequest(BaseModel):
    path: str
    content: str
    expectedSha256: Optional[str] = None


class CommandRequest(BaseModel):
    argv: list[str]
    cwd: str = "."
    timeoutSeconds: int = Field(default=20, ge=1, le=30)


class BranchRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    startPoint: Optional[str] = None


class CommitRequest(BaseModel):
    message: str = Field(min_length=1, max_length=300)
    paths: list[str] = Field(min_length=1, max_length=200)


class CommandJobRequest(BaseModel):
    argv: list[str]
    cwd: str = "."
    maxMinutes: int = Field(default=30, ge=1, le=120)


@app.get("/health", dependencies=[Depends(require_auth)])
def health():
    registry_path = Path("/workspaces/.assistant-tools/state/registry.json")
    assistant_tools = []
    assistant_tool_policy = None
    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        assistant_tool_policy = registry.get("proactivePolicy")
        for tool in registry.get("tools", []):
            assistant_tools.append({
                "name": tool.get("name"),
                "kind": tool.get("kind"),
                "status": tool.get("status"),
                "invoke": tool.get("invoke"),
            })
    except (OSError, ValueError, TypeError):
        pass

    return {
        "ok": True,
        "workspace": str(ROOT),
        "branch": current_branch(),
        "executionMode": "universal",
        "protectedBranches": sorted(PROTECTED_BRANCHES),
        "mode": "chatgpt-action-only",
        "assistantToolRegistry": str(registry_path),
        "assistantToolPolicy": assistant_tool_policy,
        "assistantTools": assistant_tools,
        "autonomy": {
            "interactiveReasoningLoop": True,
            "longCommandJobs": True,
            "persistentReasoningAfterChatTurn": False,
        },
    }


@app.get("/workspace/tree", dependencies=[Depends(require_auth)])
def workspace_tree(
    path: str = ".",
    depth: int = Query(default=2, ge=1, le=4),
):
    base = safe_path(path)
    if not base.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not base.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    entries = []
    truncated = False

    def walk(directory: Path, remaining: int) -> None:
        nonlocal truncated
        if remaining <= 0 or truncated:
            return

        try:
            items = sorted(
                directory.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
        except OSError:
            return

        for item in items:
            if len(entries) >= MAX_TREE_ENTRIES:
                truncated = True
                return
            if item.name in SKIP_DIRS:
                continue

            try:
                resolved = item.resolve()
                if resolved != ROOT and ROOT not in resolved.parents:
                    continue
                rel = resolved.relative_to(ROOT)
                safe_path(str(rel))
            except Exception:
                continue

            entries.append({
                "name": item.name,
                "path": str(rel),
                "type": "directory" if item.is_dir() else "file",
            })

            if item.is_dir():
                walk(item, remaining - 1)

    walk(base, depth)
    return {
        "path": str(base.relative_to(ROOT)),
        "entries": entries,
        "truncated": truncated,
    }


@app.get("/workspace/file", dependencies=[Depends(require_auth)])
def read_file(path: str):
    target = safe_path(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    data = target.read_bytes()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File too large; narrow the request or inspect with an approved command"
        )

    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=415,
            detail="Only UTF-8 text files are supported"
        )

    return {
        "path": str(target.relative_to(ROOT)),
        "content": content,
        "sha256": sha256_bytes(data),
    }


@app.put("/workspace/file", dependencies=[Depends(require_auth)])
def write_file(request: WriteFileRequest):
    ensure_mutable_branch()
    target = safe_path(request.path)
    data = request.content.encode("utf-8")

    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    if target.exists():
        if request.expectedSha256 is None:
            raise HTTPException(
                status_code=428,
                detail="expectedSha256 is required for existing files"
            )
        if sha256_bytes(target.read_bytes()) != request.expectedSha256:
            raise HTTPException(
                status_code=409,
                detail="File changed since it was read"
            )
    elif request.expectedSha256 is not None:
        raise HTTPException(
            status_code=409,
            detail="File does not exist but expectedSha256 was supplied"
        )

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

    return {
        "path": str(target.relative_to(ROOT)),
        "sha256": sha256_bytes(data),
    }


@app.post("/workspace/command", dependencies=[Depends(require_auth)])
def run_command(request: CommandRequest):
    if not command_is_readonly(request.argv):
        ensure_mutable_branch()

    cwd = safe_path(request.cwd)
    if not cwd.is_dir():
        raise HTTPException(status_code=400, detail="cwd must be a directory")

    return execute(
        request.argv,
        cwd,
        min(request.timeoutSeconds, MAX_SHORT_COMMAND_SECONDS),
    )


@app.get("/git/status", dependencies=[Depends(require_auth)])
def git_status():
    result = execute(
        ["git", "status", "--short", "--branch"],
        ROOT,
        10,
    )
    lines = result["stdout"].splitlines()
    branch = ""
    changes = []

    if lines and lines[0].startswith("## "):
        branch = lines[0][3:].split("...")[0].split()[0]
        changes = lines[1:]
    else:
        changes = lines

    return {
        "branch": branch,
        "clean": not changes,
        "changes": changes,
        "raw": result["stdout"],
        "truncated": result["truncated"],
    }


@app.get("/git/diff", dependencies=[Depends(require_auth)])
def git_diff(staged: bool = False):
    argv = ["git", "diff"]
    if staged:
        argv.append("--cached")

    result = execute(argv, ROOT, 20)
    return {
        "diff": result["stdout"],
        "stderr": result["stderr"],
        "truncated": result["truncated"],
    }


@app.post("/git/branch", status_code=201, dependencies=[Depends(require_auth)])
def create_branch(request: BranchRequest):
    if request.name in PROTECTED_BRANCHES:
        raise HTTPException(
            status_code=409,
            detail="Refusing to create a protected branch name"
        )

    if any(x in request.name for x in ("..", "~", "^", ":", "?", "*", "[", "\\", " ")):
        raise HTTPException(status_code=400, detail="Unsafe branch name")

    args = ["switch", "-c", request.name]
    if request.startPoint:
        args.append(request.startPoint)

    result = execute_git_mutation(args, 30)
    if result["exitCode"] != 0:
        raise HTTPException(status_code=400, detail=result)

    return {
        "branch": request.name,
        "stdout": result["stdout"],
        "stderr": result["stderr"],
    }


@app.post("/git/commit", status_code=201, dependencies=[Depends(require_auth)])
def git_commit(request: CommitRequest):
    ensure_mutable_branch()

    staged_before = execute(
        ["git", "diff", "--cached", "--name-only"],
        ROOT,
        10,
    )
    if staged_before["stdout"].strip():
        raise HTTPException(
            status_code=409,
            detail="Index already contains staged changes; refusing mixed commit"
        )

    safe_paths = [
        str(safe_path(path).relative_to(ROOT))
        for path in request.paths
    ]

    stage = execute_git_mutation(["add", "--", *safe_paths], 30)
    if stage["exitCode"] != 0:
        raise HTTPException(status_code=400, detail=stage)

    staged_after = execute(
        ["git", "diff", "--cached", "--name-only"],
        ROOT,
        10,
    )

    actual = {
        line
        for line in staged_after["stdout"].splitlines()
        if line.strip()
    }

    if not actual or not actual.issubset(set(safe_paths)):
        execute_git_mutation(["reset", "--mixed"], 15)
        raise HTTPException(
            status_code=409,
            detail="Staged files do not match approved paths; index was unstaged"
        )

    result = execute_git_mutation(
        ["commit", "-m", request.message],
        60,
    )

    if result["exitCode"] != 0:
        execute_git_mutation(["reset", "--mixed"], 15)
        raise HTTPException(status_code=400, detail=result)

    commit_sha = execute(
        ["git", "rev-parse", "HEAD"],
        ROOT,
        10,
    )["stdout"].strip()

    return {
        "commitSha": commit_sha,
        "message": request.message,
        "stdout": result["stdout"],
    }


def run_command_job(job_id: str, request: CommandJobRequest) -> None:
    if not MUTATING_JOB_LOCK.acquire(blocking=False):
        with JOB_LOCK:
            JOBS[job_id].update(
                status="failed",
                error="Another mutating command job already owns this worktree",
            )
        return

    stdout_path = JOBS_DIR / f"{job_id}.stdout.log"
    stderr_path = JOBS_DIR / f"{job_id}.stderr.log"

    try:
        cwd = safe_path(request.cwd)
        checked = validate_argv(request.argv, cwd)

        with JOB_LOCK:
            JOBS[job_id]["status"] = "running"

        with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
            process = subprocess.Popen(
                checked,
                cwd=str(cwd),
                stdout=stdout_file,
                stderr=stderr_file,
                shell=False,
                env=clean_child_env(),
                start_new_session=True,
            )

            with JOB_LOCK:
                JOB_PROCESSES[job_id] = process

            try:
                process.wait(timeout=request.maxMinutes * 60)
                status = "completed" if process.returncode == 0 else "failed"
                with JOB_LOCK:
                    JOBS[job_id].update(
                        status=status,
                        exitCode=process.returncode,
                        completedAt=int(time.time()),
                    )
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)

                with JOB_LOCK:
                    JOBS[job_id].update(
                        status="failed",
                        exitCode=124,
                        error="Command job timed out",
                        completedAt=int(time.time()),
                    )

    except Exception as exc:
        with JOB_LOCK:
            JOBS[job_id].update(
                status="failed",
                error=str(exc),
                completedAt=int(time.time()),
            )
    finally:
        with JOB_LOCK:
            JOB_PROCESSES.pop(job_id, None)
        MUTATING_JOB_LOCK.release()


@app.post("/jobs/command", status_code=202, dependencies=[Depends(require_auth)])
def start_command_job(request: CommandJobRequest):
    if command_is_readonly(request.argv):
        raise HTTPException(
            status_code=400,
            detail="Use the short command endpoint for read-only Git operations"
        )

    ensure_mutable_branch()
    cwd = safe_path(request.cwd)
    validate_argv(request.argv, cwd)

    if MUTATING_JOB_LOCK.locked():
        raise HTTPException(
            status_code=409,
            detail="Another mutating command job is already running"
        )

    job_id = str(uuid.uuid4())

    with JOB_LOCK:
        JOBS[job_id] = {
            "id": job_id,
            "status": "queued",
            "argv": request.argv,
            "cwd": request.cwd,
            "createdAt": int(time.time()),
        }

    thread = threading.Thread(
        target=run_command_job,
        args=(job_id, request),
        daemon=True,
    )
    thread.start()

    return dict(JOBS[job_id])


@app.get("/jobs/command/{jobId}", dependencies=[Depends(require_auth)])
def get_command_job(jobId: str):
    with JOB_LOCK:
        job = JOBS.get(jobId)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        result = dict(job)

    stdout, stdout_truncated = read_log(
        JOBS_DIR / f"{jobId}.stdout.log",
        MAX_RESPONSE_CHARS // 2,
    )
    stderr, stderr_truncated = read_log(
        JOBS_DIR / f"{jobId}.stderr.log",
        MAX_RESPONSE_CHARS // 2,
    )

    result.update({
        "stdout": stdout,
        "stderr": stderr,
        "truncated": stdout_truncated or stderr_truncated,
    })

    return result


@app.post("/jobs/command/{jobId}/cancel", dependencies=[Depends(require_auth)])
def cancel_command_job(jobId: str):
    with JOB_LOCK:
        job = JOBS.get(jobId)
        process = JOB_PROCESSES.get(jobId)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not process or process.poll() is not None:
        return {
            "id": jobId,
            "status": job["status"],
            "cancelled": False,
        }

    os.killpg(process.pid, signal.SIGTERM)

    with JOB_LOCK:
        JOBS[jobId].update(
            status="failed",
            error="Cancelled by user",
            completedAt=int(time.time()),
        )

    return {
        "id": jobId,
        "status": "failed",
        "cancelled": True,
    }


@app.get("/privacy", response_class=HTMLResponse)
def privacy():
    return """
    <!doctype html>
    <html>
      <body>
        <h1>Codespace Supervisor Bridge Privacy</h1>
        <p>
          Private bridge for the explicitly configured development workspace.
          Update this policy before sharing or publishing the GPT.
        </p>
      </body>
    </html>
    """
