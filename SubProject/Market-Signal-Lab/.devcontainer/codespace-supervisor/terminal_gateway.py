from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


TERMINAL_NAME = "GPT Supervisor"
HEARTBEAT_STALE_SECONDS = 8


class VisibleTerminalRequest(BaseModel):
    argv: list[str] = Field(min_length=1, max_length=128)
    cwd: str = "."
    timeoutSeconds: int = Field(default=120, ge=1, le=600)


class VisibleTerminalGateway:
    def __init__(
        self,
        state_dir: Path,
        safe_path: Callable[[str], Path],
        validate_argv: Callable[[list[str], Path], list[str]],
        ensure_mutable_branch: Callable[[], None],
        command_is_readonly: Callable[[list[str]], bool],
    ) -> None:
        self.base = (state_dir / "visible-terminal").resolve()
        self.requests = self.base / "requests"
        self.running = self.base / "running"
        self.results = self.base / "results"
        self.heartbeat = self.base / "heartbeat.json"
        self.safe_path = safe_path
        self.validate_argv = validate_argv
        self.ensure_mutable_branch = ensure_mutable_branch
        self.command_is_readonly = command_is_readonly

        for directory in (self.base, self.requests, self.running, self.results):
            directory.mkdir(parents=True, exist_ok=True)
            directory.chmod(0o700)

    @staticmethod
    def _atomic_json(path: Path, payload: dict) -> None:
        temp = path.with_suffix(path.suffix + f".{uuid.uuid4().hex}.tmp")
        temp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        os.chmod(temp, 0o600)
        os.replace(temp, path)

    @staticmethod
    def _load_json(path: Path) -> dict:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=500, detail=f"Terminal bridge state is unreadable: {exc}") from exc
        if not isinstance(value, dict):
            raise HTTPException(status_code=500, detail="Terminal bridge state is invalid")
        return value

    @staticmethod
    def _safe_id(raw: str) -> str:
        try:
            return str(uuid.UUID(raw))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid terminal invocation id") from exc

    def status(self) -> dict:
        now = time.time()
        heartbeat = None
        age = None
        if self.heartbeat.is_file():
            try:
                heartbeat = json.loads(self.heartbeat.read_text(encoding="utf-8"))
                age = max(0.0, now - float(heartbeat.get("timestamp", 0)))
            except (OSError, ValueError, TypeError):
                heartbeat = None
                age = None

        connected = bool(heartbeat and age is not None and age <= HEARTBEAT_STALE_SECONDS)
        return {
            "available": connected,
            "terminalName": TERMINAL_NAME,
            "transport": "private-filesystem-queue",
            "heartbeatAgeSeconds": round(age, 3) if age is not None else None,
            "activeInvocationId": heartbeat.get("activeInvocationId") if connected else None,
            "note": (
                "Visible VS Code terminal bridge is connected."
                if connected
                else "Terminal task is not connected; reopen/reload the Codespace window or run the GPT Supervisor task."
            ),
        }

    def invoke(self, request: VisibleTerminalRequest) -> dict:
        if not self.status()["available"]:
            raise HTTPException(
                status_code=409,
                detail="GPT Supervisor visible terminal is not connected",
            )
        if not self.command_is_readonly(request.argv):
            self.ensure_mutable_branch()

        cwd = self.safe_path(request.cwd)
        if not cwd.is_dir():
            raise HTTPException(status_code=400, detail="cwd must be a directory")

        checked = self.validate_argv(request.argv, cwd)
        invocation_id = str(uuid.uuid4())
        payload = {
            "id": invocation_id,
            "status": "queued",
            "argv": checked,
            "displayArgv": request.argv,
            "cwd": str(cwd),
            "timeoutSeconds": request.timeoutSeconds,
            "createdAt": int(time.time()),
        }
        self._atomic_json(self.requests / f"{invocation_id}.json", payload)
        return {
            "id": invocation_id,
            "status": "queued",
            "terminalName": TERMINAL_NAME,
            "argv": request.argv,
            "cwd": request.cwd,
            "timeoutSeconds": request.timeoutSeconds,
        }

    def get(self, raw_id: str) -> dict:
        invocation_id = self._safe_id(raw_id)
        for status, directory in (
            ("completed", self.results),
            ("running", self.running),
            ("queued", self.requests),
        ):
            path = directory / f"{invocation_id}.json"
            if path.is_file():
                payload = self._load_json(path)
                payload.setdefault("status", status)
                payload["terminalName"] = TERMINAL_NAME
                return payload
        raise HTTPException(status_code=404, detail="Terminal invocation not found")


def build_terminal_router(
    require_auth,
    state_dir: Path,
    safe_path,
    validate_argv,
    ensure_mutable_branch,
    command_is_readonly,
) -> APIRouter:
    gateway = VisibleTerminalGateway(
        state_dir=state_dir,
        safe_path=safe_path,
        validate_argv=validate_argv,
        ensure_mutable_branch=ensure_mutable_branch,
        command_is_readonly=command_is_readonly,
    )
    router = APIRouter(prefix="/terminal", tags=["visible-terminal"])

    @router.get("/status", dependencies=[Depends(require_auth)])
    def terminal_status():
        return gateway.status()

    @router.post("/invocations", status_code=202, dependencies=[Depends(require_auth)])
    def invoke_terminal(request: VisibleTerminalRequest):
        return gateway.invoke(request)

    @router.get("/invocations/{invocation_id}", dependencies=[Depends(require_auth)])
    def get_terminal_invocation(invocation_id: str):
        return gateway.get(invocation_id)

    return router
