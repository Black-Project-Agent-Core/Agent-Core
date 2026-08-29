#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import selectors
import shlex
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path


TERMINAL_NAME = "GPT Supervisor"
DEFAULT_STATE_DIR = Path("/home/vscode/.codespace-supervisor/state/visible-terminal")
POLL_SECONDS = 0.20
MAX_RESULT_BYTES = 100_000
SENSITIVE_MARKERS = (
    "token", "secret", "password", "passwd", "authorization", "api_key", "apikey", "credential"
)


def atomic_json(path: Path, payload: dict) -> None:
    temp = path.with_suffix(path.suffix + f".{uuid.uuid4().hex}.tmp")
    temp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def clean_env(state_root: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for key in (
        "PATH", "LANG", "LC_ALL", "TERM", "TMPDIR", "TZ",
        "CARGO_HOME", "RUSTUP_HOME", "GOPATH", "GOMODCACHE", "GOCACHE",
    ):
        value = os.getenv(key)
        if value:
            env[key] = value
    command_home = state_root.parent / "command-home"
    command_home.mkdir(parents=True, exist_ok=True)
    env["HOME"] = str(command_home)
    env["CI"] = "1"
    return env


def display_command(argv: list[str]) -> str:
    rendered: list[str] = []
    redact_next = False
    for arg in argv:
        lower = arg.casefold()
        sensitive = redact_next or any(marker in lower for marker in SENSITIVE_MARKERS)
        rendered.append("<redacted>" if sensitive else arg)
        redact_next = lower in {
            "--token", "--secret", "--password", "--passwd", "--authorization",
            "--api-key", "--apikey", "-p",
        }
    return shlex.join(rendered)


def write_heartbeat(base: Path, active_id: str | None) -> None:
    atomic_json(base / "heartbeat.json", {
        "terminalName": TERMINAL_NAME,
        "timestamp": time.time(),
        "pid": os.getpid(),
        "activeInvocationId": active_id,
    })


def claim_next(requests: Path, running: Path) -> Path | None:
    candidates = sorted(requests.glob("*.json"), key=lambda path: path.stat().st_mtime)
    for request_path in candidates:
        running_path = running / request_path.name
        try:
            os.replace(request_path, running_path)
            return running_path
        except FileNotFoundError:
            continue
    return None


def terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def execute_invocation(base: Path, running_path: Path, results: Path) -> None:
    started = time.time()
    try:
        payload = json.loads(running_path.read_text(encoding="utf-8"))
        invocation_id = str(payload["id"])
        argv = [str(value) for value in payload["argv"]]
        display_argv = [str(value) for value in payload.get("displayArgv", argv)]
        cwd = Path(str(payload["cwd"]))
        timeout_seconds = int(payload.get("timeoutSeconds", 120))
    except (OSError, ValueError, TypeError, KeyError) as exc:
        bad_id = running_path.stem
        atomic_json(results / f"{bad_id}.json", {
            "id": bad_id,
            "status": "failed",
            "exitCode": None,
            "output": "",
            "error": f"Invalid terminal invocation: {exc}",
            "completedAt": int(time.time()),
        })
        running_path.unlink(missing_ok=True)
        return

    prompt = f"\n[gpt-supervisor] id={invocation_id}\n[gpt-supervisor] cwd={cwd}\n$ {display_command(display_argv)}\n"
    sys.stdout.write(prompt)
    sys.stdout.flush()

    output = bytearray()
    truncated = False
    timed_out = False
    process: subprocess.Popen[bytes] | None = None

    try:
        process = subprocess.Popen(
            argv,
            cwd=str(cwd),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=clean_env(base),
            shell=False,
            start_new_session=True,
        )
        assert process.stdout is not None
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + timeout_seconds

        while True:
            write_heartbeat(base, invocation_id)
            if time.monotonic() >= deadline and process.poll() is None:
                timed_out = True
                terminate_process(process)

            events = selector.select(timeout=POLL_SECONDS)
            for key, _ in events:
                chunk = os.read(key.fileobj.fileno(), 4096)
                if not chunk:
                    try:
                        selector.unregister(key.fileobj)
                    except KeyError:
                        pass
                    continue
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
                if len(output) < MAX_RESULT_BYTES:
                    remaining = MAX_RESULT_BYTES - len(output)
                    output.extend(chunk[:remaining])
                    if len(chunk) > remaining:
                        truncated = True
                else:
                    truncated = True

            if process.poll() is not None and not selector.get_map():
                break

        exit_code = 124 if timed_out else process.returncode
        text = output.decode("utf-8", errors="replace")
        result = {
            "id": invocation_id,
            "status": "failed" if exit_code else "completed",
            "exitCode": exit_code,
            "output": text,
            "timedOut": timed_out,
            "truncated": truncated,
            "startedAt": int(started),
            "completedAt": int(time.time()),
        }
    except Exception as exc:
        if process is not None:
            terminate_process(process)
        result = {
            "id": invocation_id,
            "status": "failed",
            "exitCode": None,
            "output": output.decode("utf-8", errors="replace"),
            "timedOut": timed_out,
            "truncated": truncated,
            "error": str(exc),
            "startedAt": int(started),
            "completedAt": int(time.time()),
        }

    atomic_json(results / f"{invocation_id}.json", result)
    running_path.unlink(missing_ok=True)
    print(f"\n[gpt-supervisor] completed id={invocation_id} exit={result.get('exitCode')} status={result['status']}")
    sys.stdout.flush()


def main() -> int:
    base = Path(os.getenv("GPT_SUPERVISOR_TERMINAL_STATE", str(DEFAULT_STATE_DIR))).expanduser().resolve()
    requests = base / "requests"
    running = base / "running"
    results = base / "results"
    for directory in (base, requests, running, results):
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)

    print(f"[{TERMINAL_NAME}] visible terminal bridge ready")
    print(f"[{TERMINAL_NAME}] queue={base}")
    print(f"[{TERMINAL_NAME}] waiting for GPT Action commands...")
    sys.stdout.flush()

    once = "--once" in sys.argv[1:]
    try:
        while True:
            write_heartbeat(base, None)
            claimed = claim_next(requests, running)
            if claimed is not None:
                execute_invocation(base, claimed, results)
                if once:
                    return 0
                continue
            if once:
                return 0
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print(f"\n[{TERMINAL_NAME}] stopped")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
