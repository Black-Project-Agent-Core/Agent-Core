from __future__ import annotations

import base64
import hashlib
import hmac
import json
import ntpath
import os
import re
import secrets
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

PAIRING_TTL_SECONDS = int(os.getenv("WINDOWS_PAIRING_TTL_SECONDS", "600"))
RELAY_STALE_SECONDS = int(os.getenv("WINDOWS_RELAY_STALE_SECONDS", "45"))


def _windows_gateway_public_url() -> str:
    explicit = os.getenv("WINDOWS_GATEWAY_PUBLIC_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    codespace_name = os.getenv("CODESPACE_NAME", "").strip()
    forwarding_domain = os.getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev").strip()
    bridge_port = os.getenv("BRIDGE_PORT", "8787").strip() or "8787"
    if codespace_name and forwarding_domain:
        return f"https://{codespace_name}-{bridge_port}.{forwarding_domain}".rstrip("/")
    return ""
MAX_COMMAND_SECONDS = int(os.getenv("WINDOWS_MAX_COMMAND_SECONDS", "900"))
MAX_OUTPUT_BYTES = int(os.getenv("WINDOWS_MAX_OUTPUT_BYTES", "1048576"))
ALLOW_DELETE = os.getenv("WINDOWS_ALLOW_DELETE", "0").strip().lower() in {"1", "true", "yes"}

DEFAULT_ALLOWED_EXECUTABLES = (
    "powershell.exe,pwsh.exe,cmd.exe,git.exe,python.exe,py.exe,node.exe,"
    "npm.cmd,npx.cmd,pnpm.cmd,cargo.exe,rustc.exe,go.exe,dotnet.exe,"
    "where.exe,whoami.exe"
)

DEFAULT_ALLOWED_TOOLS = (
    "listDirectory,readFile,writeFile,createDirectory,copyPath,movePath,"
    "searchFiles,runCommand,listProcesses"
)


def _split_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default).strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            value = json.loads(raw)
            if isinstance(value, list):
                return [str(x).strip() for x in value if str(x).strip()]
        except ValueError:
            pass
    separator = ";" if ";" in raw else ","
    return [x.strip() for x in raw.split(separator) if x.strip()]


WINDOWS_EXECUTABLE_SUFFIXES = (".exe", ".cmd", ".bat", ".com")


def _resolve_allowed_executable(requested: str, allowed: set[str]) -> Optional[str]:
    """Resolve extensionless Windows command aliases without widening the allowlist.

    `powershell` may safely resolve to `powershell.exe` only when that exact
    executable is already present in the configured allowlist. The same rule
    applies to `.cmd`, `.bat`, and `.com` entries such as `npm.cmd`.
    """
    base = ntpath.basename(requested).casefold()
    if base in allowed:
        return requested
    _, suffix = ntpath.splitext(base)
    if suffix:
        return None
    for candidate_suffix in WINDOWS_EXECUTABLE_SUFFIXES:
        if f"{base}{candidate_suffix}" in allowed:
            return requested + candidate_suffix
    return None


def _norm_win(path: str) -> str:
    value = ntpath.normpath(path.strip().replace("/", "\\"))
    if not ntpath.isabs(value):
        raise HTTPException(status_code=400, detail=f"Windows path must be absolute: {path}")
    return value


def _path_within(path: str, root: str) -> bool:
    p = ntpath.normcase(_norm_win(path))
    r = ntpath.normcase(_norm_win(root))
    try:
        return ntpath.commonpath([p, r]) == r
    except ValueError:
        return False


def _intersect_roots(requested: list[str], allowed: list[str]) -> list[str]:
    if not allowed:
        return []
    if not requested:
        return sorted({_norm_win(x) for x in allowed}, key=str.casefold)
    result: set[str] = set()
    for req in requested:
        req_n = _norm_win(req)
        for allow in allowed:
            allow_n = _norm_win(allow)
            if _path_within(req_n, allow_n):
                result.add(req_n)
            elif _path_within(allow_n, req_n):
                result.add(allow_n)
    return sorted(result, key=str.casefold)


def _now() -> int:
    return int(time.time())


def _utc_iso(ts: Optional[int] = None) -> str:
    import datetime

    value = ts if ts is not None else _now()
    return datetime.datetime.fromtimestamp(value, datetime.timezone.utc).isoformat().replace("+00:00", "Z")


class PairRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)
    machineId: str = Field(min_length=3, max_length=200)
    machineName: str = Field(min_length=1, max_length=200)
    platform: str = Field(default="Windows", max_length=200)
    relayVersion: str = Field(default="unknown", max_length=100)
    allowedRoots: list[str] = Field(default_factory=list, max_length=50)


class BootstrapRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)
    allowedRoot: str = Field(min_length=3, max_length=1024)


class RelayRegisterRequest(BaseModel):
    machineId: str = Field(min_length=3, max_length=200)
    machineName: str = Field(min_length=1, max_length=200)
    platform: str = Field(default="Windows", max_length=200)
    relayVersion: str = Field(default="unknown", max_length=100)
    desktopCommanderAvailable: bool = False
    desktopCommanderVersion: Optional[str] = Field(default=None, max_length=100)
    desktopCommanderError: Optional[str] = Field(default=None, max_length=4000)
    desktopCommanderTools: list[str] = Field(default_factory=list, max_length=200)
    logicalTools: list[str] = Field(default_factory=list, max_length=100)
    allowedRoots: list[str] = Field(default_factory=list, max_length=50)


class RelayHeartbeatRequest(BaseModel):
    machineId: str = Field(min_length=3, max_length=200)
    desktopCommanderAvailable: Optional[bool] = None


class RelayPollRequest(BaseModel):
    machineId: str = Field(min_length=3, max_length=200)
    waitSeconds: int = Field(default=15, ge=0, le=25)
    availableSlots: int = Field(default=1, ge=0, le=4)


class RelayResultRequest(BaseModel):
    machineId: str = Field(min_length=3, max_length=200)
    invocationId: str = Field(min_length=8, max_length=128)
    status: str = Field(pattern="^(completed|failed|cancelled|denied)$")
    exitCode: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    result: Optional[dict] = None
    truncated: bool = False
    error: Optional[dict] = None


class CreateSessionRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    brief: str = Field(min_length=1, max_length=30000)
    successCriteria: list[str] = Field(default_factory=list, max_length=50)
    requestedRoots: list[str] = Field(default_factory=list, max_length=20)
    constraints: list[str] = Field(default_factory=list, max_length=50)
    policyProfile: str = Field(default="default", max_length=100)


class ToolInvocationRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=100)
    arguments: dict
    reason: str = Field(min_length=1, max_length=3000)
    expectedOutcome: Optional[str] = Field(default=None, max_length=3000)


class CancelSessionRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000)


class CompleteSessionRequest(BaseModel):
    summary: str = Field(min_length=1, max_length=5000)


class WindowsGateway:
    def __init__(self, state_dir: Path):
        persistent_override = os.getenv("WINDOWS_GATEWAY_STATE_DIR", "").strip()
        if persistent_override:
            self.root = Path(persistent_override).expanduser().resolve()
        else:
            self.root = (state_dir / "windows").resolve()
        self.sessions_dir = self.root / "sessions"
        self.invocations_dir = self.root / "invocations"
        self.events_dir = self.root / "events"
        self.pairings_dir = self.root / "pairings"
        for path in (self.root, self.sessions_dir, self.invocations_dir, self.events_dir, self.pairings_dir):
            path.mkdir(parents=True, exist_ok=True, mode=0o700)
            try:
                os.chmod(path, 0o700)
            except OSError:
                pass
        self.machine_file = self.root / "machine.json"
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
        self.allowed_roots = [_norm_win(x) for x in _split_env("WINDOWS_ALLOWED_ROOTS")]
        self.allowed_executables = {ntpath.basename(x).casefold() for x in _split_env("WINDOWS_ALLOWED_EXECUTABLES", DEFAULT_ALLOWED_EXECUTABLES)}
        self.allowed_tools = set(_split_env("WINDOWS_ALLOWED_TOOLS", DEFAULT_ALLOWED_TOOLS))
        if ALLOW_DELETE:
            self.allowed_tools.add("deletePath")
        else:
            self.allowed_tools.discard("deletePath")

    def _load_json(self, path: Path) -> Optional[dict]:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return None

    def _save_json(self, path: Path, value: dict) -> None:
        tmp = path.with_suffix(path.suffix + f".tmp.{os.getpid()}.{threading.get_ident()}")
        data = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        tmp.write_text(data, encoding="utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)

    def _safe_id(self, value: str, label: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,128}", value):
            raise HTTPException(status_code=400, detail=f"Invalid {label}")
        return value

    def _session_path(self, session_id: str) -> Path:
        return self.sessions_dir / f"{self._safe_id(session_id, 'session ID')}.json"

    def _invocation_path(self, invocation_id: str) -> Path:
        return self.invocations_dir / f"{self._safe_id(invocation_id, 'invocation ID')}.json"

    def _machine(self) -> Optional[dict]:
        return self._load_json(self.machine_file)

    def _relay_connected(self, machine: Optional[dict] = None) -> bool:
        m = machine or self._machine()
        return bool(m and (_now() - int(m.get("lastHeartbeatEpoch", 0))) <= RELAY_STALE_SECONDS)

    def _effective_roots(self, machine: Optional[dict] = None) -> list[str]:
        m = machine or self._machine()
        if not m:
            return []
        agent_roots = [_norm_win(x) for x in m.get("allowedRoots", [])]
        policy_roots = self.allowed_roots or [_norm_win(x) for x in m.get("configuredAllowedRoots", [])]
        return _intersect_roots(agent_roots, policy_roots)

    def _effective_tools(self, machine: Optional[dict] = None) -> list[str]:
        m = machine or self._machine()
        if not m:
            return []
        logical = set(m.get("logicalTools", []))
        result = logical & self.allowed_tools
        if not self._effective_roots(m):
            result -= {"listDirectory", "readFile", "writeFile", "createDirectory", "copyPath", "movePath", "deletePath", "searchFiles", "runCommand"}
        return sorted(result)

    def status(self) -> dict:
        with self.lock:
            m = self._machine()
            active_sessions = 0
            for path in self.sessions_dir.glob("*.json"):
                value = self._load_json(path)
                if value and value.get("status") in {"active", "waiting"}:
                    active_sessions += 1
            if not m:
                return {
                    "relayConnected": False,
                    "desktopCommanderAvailable": False,
                    "paired": False,
                    "activeSessionCount": active_sessions,
                }
            return {
                "relayConnected": self._relay_connected(m),
                "desktopCommanderAvailable": bool(m.get("desktopCommanderAvailable")),
                "paired": True,
                "machineId": m.get("machineId"),
                "machineName": m.get("machineName"),
                "platform": m.get("platform"),
                "connectedAt": m.get("connectedAt"),
                "lastHeartbeat": m.get("lastHeartbeat"),
                "relayVersion": m.get("relayVersion"),
                "desktopCommanderVersion": m.get("desktopCommanderVersion"),
                "desktopCommanderError": m.get("desktopCommanderError"),
                "activeSessionCount": active_sessions,
            }

    def capabilities(self) -> dict:
        with self.lock:
            m = self._machine()
            if not self._relay_connected(m):
                raise HTTPException(status_code=503, detail="Windows Relay is unavailable")
            roots = self._effective_roots(m)
            return {
                "tools": self._effective_tools(m),
                "allowedRoots": roots,
                "allowedExecutables": sorted(self.allowed_executables),
                "desktopControl": False,
                "shell": False,
                "filesystemRead": bool(roots),
                "filesystemWrite": bool(roots),
                "destructiveDelete": ALLOW_DELETE,
                "maximumCommandSeconds": MAX_COMMAND_SECONDS,
                "maximumOutputBytes": MAX_OUTPUT_BYTES,
                "policyName": "default",
                "desktopCommanderAvailable": bool(m and m.get("desktopCommanderAvailable")),
                "desktopCommanderTools": sorted((m or {}).get("desktopCommanderTools", [])),
            }

    def create_pairing(self) -> dict:
        pairing_id = uuid.uuid4().hex
        code = f"{secrets.randbelow(100_000_000):08d}"
        value = {
            "pairingId": pairing_id,
            "codeHash": hashlib.sha256(code.encode()).hexdigest(),
            "createdAtEpoch": _now(),
            "expiresAtEpoch": _now() + PAIRING_TTL_SECONDS,
            "attempts": 0,
            "used": False,
        }
        with self.lock:
            self._save_json(self.pairings_dir / f"{pairing_id}.json", value)
        return {
            "pairingId": pairing_id,
            "code": code,
            "expiresAt": _utc_iso(value["expiresAtEpoch"]),
            "instructions": "Enter this one-time code only into the Windows Relay setup. It is not the long-term device credential.",
        }

    def bootstrap_script(self, request: BootstrapRequest) -> str:
        supplied_hash = hashlib.sha256(request.code.encode()).hexdigest()
        with self.lock:
            matched = False
            for pairing_path in self.pairings_dir.glob("*.json"):
                value = self._load_json(pairing_path)
                if not value or value.get("used") or int(value.get("expiresAtEpoch", 0)) < _now():
                    continue
                value["attempts"] = int(value.get("attempts", 0)) + 1
                self._save_json(pairing_path, value)
                if value["attempts"] > 10:
                    continue
                if hmac.compare_digest(str(value.get("codeHash", "")), supplied_hash):
                    matched = True
                    break
            if not matched:
                raise HTTPException(status_code=401, detail="Invalid or expired pairing code")

        allowed_root = _norm_win(request.allowedRoot)
        repo_root = Path(os.getenv("WORKSPACE_ROOT", "/workspaces/Market-Signal-Lab")).resolve()
        installer_path = repo_root / ".devcontainer" / "windows-relay" / "install-windows-relay.ps1"
        relay_path = repo_root / ".devcontainer" / "windows-relay" / "windows-relay.mjs"
        try:
            installer_b64 = base64.b64encode(installer_path.read_bytes()).decode("ascii")
            relay_b64 = base64.b64encode(relay_path.read_bytes()).decode("ascii")
        except OSError as exc:
            raise HTTPException(status_code=503, detail=f"Windows bootstrap payload unavailable: {exc}") from exc

        def ps_quote(value: str) -> str:
            return "'" + value.replace("'", "''") + "'"

        gateway_url = _windows_gateway_public_url()
        if not gateway_url:
            raise HTTPException(status_code=503, detail="Windows gateway public URL is unavailable")

        lines = [
            "$ErrorActionPreference = 'Stop'",
            f"$GatewayUrl = {ps_quote(gateway_url)}",
            f"$AllowedRoot = {ps_quote(allowed_root)}",
            f"$PairingCode = {ps_quote(request.code)}",
            "$StateRoot = Join-Path $AllowedRoot '.codespace-windows-relay'",
            "$TempRoot = Join-Path $AllowedRoot ('.codespace-windows-bootstrap-' + [Guid]::NewGuid().ToString('N'))",
            "$InstallerPath = Join-Path $TempRoot 'install-windows-relay.ps1'",
            "$RelayPath = Join-Path $TempRoot 'windows-relay.mjs'",
            "New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null",
            "try {",
            f"    [IO.File]::WriteAllBytes($InstallerPath, [Convert]::FromBase64String('{installer_b64}'))",
            f"    [IO.File]::WriteAllBytes($RelayPath, [Convert]::FromBase64String('{relay_b64}'))",
            "    $env:WINDOWS_PAIRING_CODE = $PairingCode",
            "    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $InstallerPath -GatewayUrl $GatewayUrl -AllowedRoot $AllowedRoot -RelaySourcePath $RelayPath -StateRoot $StateRoot -RequireExistingNode -DisableStartupFolderFallback",
            "    if ($LASTEXITCODE -ne 0) { throw \"Windows Relay installer exited with code $LASTEXITCODE\" }",
            "}",
            "finally {",
            "    Remove-Item Env:WINDOWS_PAIRING_CODE -ErrorAction SilentlyContinue",
            "    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue",
            "}",
            "",
        ]
        return "\n".join(lines)

    def pair(self, request: PairRequest) -> dict:
        supplied_hash = hashlib.sha256(request.code.encode()).hexdigest()
        with self.lock:
            candidate_path: Optional[Path] = None
            candidate: Optional[dict] = None
            for path in self.pairings_dir.glob("*.json"):
                value = self._load_json(path)
                if not value or value.get("used") or int(value.get("expiresAtEpoch", 0)) < _now():
                    continue
                value["attempts"] = int(value.get("attempts", 0)) + 1
                self._save_json(path, value)
                if value["attempts"] > 10:
                    continue
                if hmac.compare_digest(str(value.get("codeHash", "")), supplied_hash):
                    candidate_path, candidate = path, value
                    break
            if not candidate or not candidate_path:
                raise HTTPException(status_code=401, detail="Invalid or expired pairing code")

            existing = self._machine()
            if existing and existing.get("machineId") != request.machineId:
                raise HTTPException(status_code=409, detail="A different Windows machine is already paired; unpair it explicitly before replacing it")

            token = secrets.token_urlsafe(48)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            machine = {
                "machineId": request.machineId,
                "machineName": request.machineName,
                "platform": request.platform,
                "relayVersion": request.relayVersion,
                "allowedRoots": [_norm_win(x) for x in request.allowedRoots],
                "configuredAllowedRoots": [_norm_win(x) for x in request.allowedRoots],
                "deviceTokenHash": token_hash,
                "connectedAt": _utc_iso(),
                "lastHeartbeat": _utc_iso(),
                "lastHeartbeatEpoch": _now(),
                "desktopCommanderAvailable": False,
                "desktopCommanderTools": [],
                "logicalTools": [],
            }
            self._save_json(self.machine_file, machine)
            candidate["used"] = True
            candidate["usedAtEpoch"] = _now()
            self._save_json(candidate_path, candidate)
            return {
                "deviceToken": token,
                "machineId": request.machineId,
                "pairedAt": _utc_iso(),
            }

    def require_device(self, authorization: Optional[str]) -> dict:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Windows Relay bearer token")
        token = authorization[7:]
        with self.lock:
            machine = self._machine()
            if not machine:
                raise HTTPException(status_code=401, detail="No Windows Relay is paired")
            supplied = hashlib.sha256(token.encode()).hexdigest()
            if not hmac.compare_digest(str(machine.get("deviceTokenHash", "")), supplied):
                raise HTTPException(status_code=401, detail="Invalid Windows Relay bearer token")
            return machine

    def register(self, request: RelayRegisterRequest, machine: dict) -> dict:
        if request.machineId != machine.get("machineId"):
            raise HTTPException(status_code=403, detail="Machine ID does not match paired device")
        with self.lock:
            machine.update({
                "machineName": request.machineName,
                "platform": request.platform,
                "relayVersion": request.relayVersion,
                "desktopCommanderAvailable": request.desktopCommanderAvailable,
                "desktopCommanderVersion": request.desktopCommanderVersion,
                "desktopCommanderError": request.desktopCommanderError,
                "desktopCommanderTools": sorted(set(request.desktopCommanderTools)),
                "logicalTools": sorted(set(request.logicalTools)),
                "allowedRoots": [_norm_win(x) for x in request.allowedRoots],
                "lastHeartbeat": _utc_iso(),
                "lastHeartbeatEpoch": _now(),
            })
            self._save_json(self.machine_file, machine)
            self.condition.notify_all()
        return {"ok": True, "effectiveCapabilities": self.capabilities()}

    def heartbeat(self, request: RelayHeartbeatRequest, machine: dict) -> dict:
        if request.machineId != machine.get("machineId"):
            raise HTTPException(status_code=403, detail="Machine ID does not match paired device")
        with self.lock:
            machine["lastHeartbeat"] = _utc_iso()
            machine["lastHeartbeatEpoch"] = _now()
            if request.desktopCommanderAvailable is not None:
                machine["desktopCommanderAvailable"] = request.desktopCommanderAvailable
            self._save_json(self.machine_file, machine)
            self.condition.notify_all()
        return {"ok": True, "serverTime": _utc_iso()}

    def _load_session(self, session_id: str) -> dict:
        value = self._load_json(self._session_path(session_id))
        if not value:
            raise HTTPException(status_code=404, detail="Windows session not found")
        return value

    def _load_invocation(self, invocation_id: str) -> dict:
        value = self._load_json(self._invocation_path(invocation_id))
        if not value:
            raise HTTPException(status_code=404, detail="Windows invocation not found")
        return value

    def _append_event(self, session: dict, event_type: str, message: str, **extra) -> None:
        sequence = int(session.get("lastSequence", 0)) + 1
        session["lastSequence"] = sequence
        event = {
            "sequence": sequence,
            "timestamp": _utc_iso(),
            "type": event_type,
            "message": message,
        }
        event.update({k: v for k, v in extra.items() if v is not None})
        path = self.events_dir / f"{session['sessionId']}.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
        os.chmod(path, 0o600)

    def create_session(self, request: CreateSessionRequest) -> dict:
        with self.lock:
            machine = self._machine()
            if not self._relay_connected(machine):
                raise HTTPException(status_code=503, detail="Windows Relay is unavailable")
            effective_allowed = self._effective_roots(machine)
            roots = _intersect_roots(request.requestedRoots, effective_allowed)
            if request.requestedRoots and not roots:
                raise HTTPException(status_code=403, detail="Requested roots do not intersect the configured Windows allowlist")
            session_id = uuid.uuid4().hex
            now = _utc_iso()
            value = {
                "sessionId": session_id,
                "title": request.title or "Windows task",
                "status": "active",
                "brief": request.brief,
                "successCriteria": request.successCriteria,
                "constraints": request.constraints,
                "effectiveRoots": roots,
                "policyProfile": request.policyProfile,
                "currentActivity": "Session created",
                "activeInvocationId": None,
                "createdAt": now,
                "updatedAt": now,
                "resultSummary": None,
                "lastSequence": 0,
            }
            self._append_event(value, "session_created", "Windows work session created")
            self._save_json(self._session_path(session_id), value)
            return dict(value)

    def get_session(self, session_id: str) -> dict:
        with self.lock:
            return dict(self._load_session(session_id))

    def _assert_session_path(self, path: str, roots: list[str]) -> str:
        value = _norm_win(path)
        if not roots or not any(_path_within(value, root) for root in roots):
            raise HTTPException(status_code=403, detail=f"Windows path is outside the session allowlist: {path}")
        return value

    def _validate_tool(self, session: dict, tool: str, arguments: dict) -> dict:
        capabilities = self.capabilities()
        if tool not in capabilities["tools"]:
            raise HTTPException(status_code=403, detail=f"Windows tool is not allowed or unavailable: {tool}")
        args = json.loads(json.dumps(arguments))
        roots = session.get("effectiveRoots", [])

        if tool in {"listDirectory", "readFile", "writeFile", "createDirectory", "deletePath", "searchFiles"}:
            if not isinstance(args.get("path"), str):
                raise HTTPException(status_code=400, detail=f"{tool} requires arguments.path")
            args["path"] = self._assert_session_path(args["path"], roots)
            if tool == "writeFile":
                content = args.get("content")
                if not isinstance(content, str):
                    raise HTTPException(status_code=400, detail="writeFile requires arguments.content")
                if len(content.encode("utf-8")) > MAX_OUTPUT_BYTES:
                    raise HTTPException(status_code=413, detail="writeFile content exceeds Windows gateway size limit")
        elif tool in {"copyPath", "movePath"}:
            for key in ("source", "destination"):
                if not isinstance(args.get(key), str):
                    raise HTTPException(status_code=400, detail=f"{tool} requires arguments.{key}")
                args[key] = self._assert_session_path(args[key], roots)
        elif tool == "runCommand":
            argv = args.get("argv")
            if not isinstance(argv, list) or not argv or not all(isinstance(x, str) for x in argv):
                raise HTTPException(status_code=400, detail="runCommand requires arguments.argv as a non-empty string array")
            if sum(len(x) for x in argv) > 32768:
                raise HTTPException(status_code=413, detail="runCommand argv exceeds Windows command length limit")
            resolved_executable = _resolve_allowed_executable(argv[0], self.allowed_executables)
            if resolved_executable is None:
                raise HTTPException(status_code=403, detail=f"Executable is not allowed by Windows command policy: {argv[0]}")
            args["argv"][0] = resolved_executable
            cwd = args.get("cwd")
            if not isinstance(cwd, str):
                raise HTTPException(status_code=400, detail="runCommand requires arguments.cwd")
            args["cwd"] = self._assert_session_path(cwd, roots)
            timeout_seconds = int(args.get("timeoutSeconds", 60))
            if timeout_seconds < 1 or timeout_seconds > MAX_COMMAND_SECONDS:
                raise HTTPException(status_code=400, detail=f"timeoutSeconds must be between 1 and {MAX_COMMAND_SECONDS}")
            args["timeoutSeconds"] = timeout_seconds
        elif tool == "listProcesses":
            args = {}
        return args

    def invoke(self, session_id: str, request: ToolInvocationRequest) -> JSONResponse:
        with self.lock:
            session = self._load_session(session_id)
            if session.get("status") not in {"active", "waiting"}:
                raise HTTPException(status_code=409, detail=f"Windows session is not active: {session.get('status')}")
            active_id = session.get("activeInvocationId")
            if active_id:
                active = self._load_invocation(active_id)
                if active.get("status") in {"queued", "running"}:
                    raise HTTPException(status_code=409, detail="This Windows session already has an active invocation")
            arguments = self._validate_tool(session, request.tool, request.arguments)
            invocation_id = uuid.uuid4().hex
            now = _utc_iso()
            invocation = {
                "invocationId": invocation_id,
                "sessionId": session_id,
                "tool": request.tool,
                "arguments": arguments,
                "reason": request.reason,
                "expectedOutcome": request.expectedOutcome,
                "effectiveRoots": session.get("effectiveRoots", []),
                "status": "queued",
                "createdAt": now,
                "startedAt": None,
                "completedAt": None,
                "exitCode": None,
                "stdout": "",
                "stderr": "",
                "result": None,
                "truncated": False,
                "error": None,
                "cancelRequested": False,
                "assignedMachineId": None,
            }
            session["status"] = "waiting"
            session["currentActivity"] = f"Queued {request.tool}"
            session["activeInvocationId"] = invocation_id
            session["updatedAt"] = now
            self._append_event(session, "tool_requested", f"Queued Windows tool: {request.tool}", tool=request.tool, invocationId=invocation_id)
            self._save_json(self._invocation_path(invocation_id), invocation)
            self._save_json(self._session_path(session_id), session)
            self.condition.notify_all()

            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                current = self._load_invocation(invocation_id)
                if current.get("status") in {"completed", "failed", "cancelled", "denied"}:
                    return JSONResponse(status_code=200, content=self.public_invocation(current))
                self.condition.wait(timeout=min(0.5, max(0.0, deadline - time.monotonic())))
            return JSONResponse(status_code=202, content=self.public_invocation(self._load_invocation(invocation_id)))

    def public_invocation(self, invocation: dict) -> dict:
        return {
            key: invocation.get(key)
            for key in (
                "invocationId", "tool", "status", "startedAt", "completedAt", "exitCode",
                "stdout", "stderr", "result", "truncated", "error"
            )
        }

    def get_invocation(self, session_id: str, invocation_id: str) -> dict:
        with self.lock:
            invocation = self._load_invocation(invocation_id)
            if invocation.get("sessionId") != session_id:
                raise HTTPException(status_code=404, detail="Invocation does not belong to this session")
            return self.public_invocation(invocation)

    def events(self, session_id: str, after: int, limit: int) -> dict:
        with self.lock:
            session = self._load_session(session_id)
            path = self.events_dir / f"{session_id}.jsonl"
            result = []
            if path.exists():
                for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    if int(event.get("sequence", 0)) > after:
                        result.append(event)
                    if len(result) >= limit:
                        break
            last = int(session.get("lastSequence", 0))
            returned_last = int(result[-1]["sequence"]) if result else after
            return {
                "sessionId": session_id,
                "events": result,
                "lastSequence": returned_last,
                "hasMore": returned_last < last,
            }

    def complete_session(self, session_id: str, summary: str) -> dict:
        with self.lock:
            session = self._load_session(session_id)
            active_id = session.get("activeInvocationId")
            if active_id:
                invocation = self._load_invocation(active_id)
                if invocation.get("status") in {"queued", "running"}:
                    raise HTTPException(status_code=409, detail="Cannot complete a session with an active invocation")
            if session.get("status") == "cancelled":
                raise HTTPException(status_code=409, detail="Cancelled session cannot be completed")
            session["status"] = "completed"
            session["currentActivity"] = "Completed"
            session["updatedAt"] = _utc_iso()
            session["resultSummary"] = summary
            self._append_event(session, "session_completed", "Windows work session completed")
            self._save_json(self._session_path(session_id), session)
            self.condition.notify_all()
            return dict(session)

    def cancel_session(self, session_id: str, reason: Optional[str]) -> dict:
        with self.lock:
            session = self._load_session(session_id)
            active_id = session.get("activeInvocationId")
            if active_id:
                invocation = self._load_invocation(active_id)
                if invocation.get("status") in {"queued", "running"}:
                    invocation["cancelRequested"] = True
                    if invocation.get("status") == "queued":
                        invocation["status"] = "cancelled"
                        invocation["completedAt"] = _utc_iso()
                    self._save_json(self._invocation_path(active_id), invocation)
            session["status"] = "cancelled"
            session["currentActivity"] = "Cancelled"
            session["updatedAt"] = _utc_iso()
            session["resultSummary"] = reason or "Cancelled by user"
            self._append_event(session, "session_cancelled", reason or "Windows work session cancelled", invocationId=active_id)
            self._save_json(self._session_path(session_id), session)
            self.condition.notify_all()
            return dict(session)

    def _queued_invocation(self) -> Optional[dict]:
        candidates: list[dict] = []
        for path in self.invocations_dir.glob("*.json"):
            value = self._load_json(path)
            if value and value.get("status") == "queued" and not value.get("cancelRequested"):
                candidates.append(value)
        if not candidates:
            return None
        return min(candidates, key=lambda x: str(x.get("createdAt", "")))

    def _cancel_ids(self, machine_id: str) -> list[str]:
        result: list[str] = []
        for path in self.invocations_dir.glob("*.json"):
            value = self._load_json(path)
            if value and value.get("status") == "running" and value.get("cancelRequested") and value.get("assignedMachineId") == machine_id:
                result.append(str(value["invocationId"]))
        return result

    def poll(self, request: RelayPollRequest, machine: dict) -> dict:
        if request.machineId != machine.get("machineId"):
            raise HTTPException(status_code=403, detail="Machine ID does not match paired device")
        deadline = time.monotonic() + request.waitSeconds
        with self.condition:
            while True:
                machine["lastHeartbeat"] = _utc_iso()
                machine["lastHeartbeatEpoch"] = _now()
                self._save_json(self.machine_file, machine)
                cancels = self._cancel_ids(request.machineId)
                job = None
                if request.availableSlots > 0:
                    queued = self._queued_invocation()
                    if queued:
                        queued["status"] = "running"
                        queued["startedAt"] = _utc_iso()
                        queued["assignedMachineId"] = request.machineId
                        self._save_json(self._invocation_path(queued["invocationId"]), queued)
                        session = self._load_session(queued["sessionId"])
                        session["status"] = "active"
                        session["currentActivity"] = f"Running {queued['tool']}"
                        session["updatedAt"] = _utc_iso()
                        self._append_event(session, "tool_started", f"Windows tool started: {queued['tool']}", tool=queued["tool"], invocationId=queued["invocationId"])
                        self._save_json(self._session_path(session["sessionId"]), session)
                        job = {
                            "invocationId": queued["invocationId"],
                            "sessionId": queued["sessionId"],
                            "tool": queued["tool"],
                            "arguments": queued["arguments"],
                            "effectiveRoots": queued.get("effectiveRoots", []),
                            "policy": {
                                "maximumCommandSeconds": MAX_COMMAND_SECONDS,
                                "maximumOutputBytes": MAX_OUTPUT_BYTES,
                                "destructiveDelete": ALLOW_DELETE,
                            },
                        }
                if job or cancels or time.monotonic() >= deadline:
                    return {"job": job, "cancelInvocationIds": cancels, "serverTime": _utc_iso()}
                self.condition.wait(timeout=min(1.0, max(0.0, deadline - time.monotonic())))

    def complete(self, request: RelayResultRequest, machine: dict) -> dict:
        if request.machineId != machine.get("machineId"):
            raise HTTPException(status_code=403, detail="Machine ID does not match paired device")
        with self.lock:
            invocation = self._load_invocation(request.invocationId)
            if invocation.get("assignedMachineId") != request.machineId:
                raise HTTPException(status_code=403, detail="Invocation is not assigned to this machine")
            stdout = request.stdout[:MAX_OUTPUT_BYTES]
            stderr = request.stderr[:MAX_OUTPUT_BYTES]
            invocation.update({
                "status": request.status,
                "completedAt": _utc_iso(),
                "exitCode": request.exitCode,
                "stdout": stdout,
                "stderr": stderr,
                "result": request.result,
                "truncated": bool(request.truncated or len(request.stdout) > MAX_OUTPUT_BYTES or len(request.stderr) > MAX_OUTPUT_BYTES),
                "error": request.error,
            })
            self._save_json(self._invocation_path(request.invocationId), invocation)
            session = self._load_session(invocation["sessionId"])
            session["activeInvocationId"] = None
            session["updatedAt"] = _utc_iso()
            if session.get("status") != "cancelled":
                session["status"] = "active"
                session["currentActivity"] = f"{invocation['tool']} {request.status}"
            event_type = {
                "completed": "tool_completed",
                "failed": "tool_failed",
                "cancelled": "tool_failed",
                "denied": "tool_denied",
            }[request.status]
            self._append_event(session, event_type, f"Windows tool {request.status}: {invocation['tool']}", tool=invocation["tool"], invocationId=request.invocationId)
            self._save_json(self._session_path(session["sessionId"]), session)
            machine["lastHeartbeat"] = _utc_iso()
            machine["lastHeartbeatEpoch"] = _now()
            self._save_json(self.machine_file, machine)
            self.condition.notify_all()
        return {"ok": True}


def build_windows_router(require_bridge_auth: Callable, state_dir: Path) -> APIRouter:
    gateway = WindowsGateway(state_dir)
    router = APIRouter()

    def require_relay_auth(authorization: Optional[str] = Header(default=None)) -> dict:
        return gateway.require_device(authorization)

    @router.get("/windows/status", dependencies=[Depends(require_bridge_auth)])
    def windows_status():
        return gateway.status()

    @router.get("/windows/capabilities", dependencies=[Depends(require_bridge_auth)])
    def windows_capabilities():
        return gateway.capabilities()

    @router.post("/windows/pairing", status_code=201, dependencies=[Depends(require_bridge_auth)])
    def create_windows_pairing():
        return gateway.create_pairing()

    @router.post("/windows/bootstrap", response_class=PlainTextResponse, include_in_schema=False)
    def bootstrap_windows_relay(request: BootstrapRequest):
        return PlainTextResponse(gateway.bootstrap_script(request), media_type="text/plain; charset=utf-8")

    @router.post("/windows/sessions", status_code=201, dependencies=[Depends(require_bridge_auth)])
    def create_windows_session(request: CreateSessionRequest):
        return gateway.create_session(request)

    @router.get("/windows/sessions/{sessionId}", dependencies=[Depends(require_bridge_auth)])
    def get_windows_session(sessionId: str):
        return gateway.get_session(sessionId)

    @router.post("/windows/sessions/{sessionId}/tool", dependencies=[Depends(require_bridge_auth)])
    def invoke_windows_tool(sessionId: str, request: ToolInvocationRequest):
        return gateway.invoke(sessionId, request)

    @router.get("/windows/sessions/{sessionId}/invocations/{invocationId}", dependencies=[Depends(require_bridge_auth)])
    def get_windows_invocation(sessionId: str, invocationId: str):
        return gateway.get_invocation(sessionId, invocationId)

    @router.get("/windows/sessions/{sessionId}/events", dependencies=[Depends(require_bridge_auth)])
    def get_windows_events(
        sessionId: str,
        afterSequence: int = Query(default=0, ge=0),
        limit: int = Query(default=50, ge=1, le=200),
    ):
        return gateway.events(sessionId, afterSequence, limit)

    @router.post("/windows/sessions/{sessionId}/complete", dependencies=[Depends(require_bridge_auth)])
    def complete_windows_session(sessionId: str, request: CompleteSessionRequest):
        return gateway.complete_session(sessionId, request.summary)

    @router.post("/windows/sessions/{sessionId}/cancel", dependencies=[Depends(require_bridge_auth)])
    def cancel_windows_session(sessionId: str, request: Optional[CancelSessionRequest] = None):
        return gateway.cancel_session(sessionId, request.reason if request else None)

    # Internal relay endpoints intentionally do not appear in the GPT Action schema.
    @router.post("/windows/relay/pair", include_in_schema=False)
    def pair_windows_relay(request: PairRequest):
        return gateway.pair(request)

    @router.post("/windows/relay/register", include_in_schema=False)
    def register_windows_relay(request: RelayRegisterRequest, machine: dict = Depends(require_relay_auth)):
        return gateway.register(request, machine)

    @router.post("/windows/relay/heartbeat", include_in_schema=False)
    def heartbeat_windows_relay(request: RelayHeartbeatRequest, machine: dict = Depends(require_relay_auth)):
        return gateway.heartbeat(request, machine)

    @router.post("/windows/relay/poll", include_in_schema=False)
    def poll_windows_relay(request: RelayPollRequest, machine: dict = Depends(require_relay_auth)):
        return gateway.poll(request, machine)

    @router.post("/windows/relay/result", include_in_schema=False)
    def result_windows_relay(request: RelayResultRequest, machine: dict = Depends(require_relay_auth)):
        return gateway.complete(request, machine)

    return router
