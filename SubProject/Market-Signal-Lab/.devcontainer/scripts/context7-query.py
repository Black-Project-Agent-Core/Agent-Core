#!/usr/bin/env python3
from __future__ import annotations

import json
import selectors
import shutil
import subprocess
import sys
import time
from typing import Any

PROTOCOL_VERSION = "2025-06-18"
CLIENT_INFO = {"name": "codespace-context7-query", "version": "1.0.0"}


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def send(proc: subprocess.Popen[str], payload: dict[str, Any]) -> None:
    assert proc.stdin is not None
    proc.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
    proc.stdin.flush()


def recv(proc: subprocess.Popen[str], wanted_id: int, timeout: float = 25.0) -> dict[str, Any]:
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
    raise TimeoutError(f"Context7 MCP response id={wanted_id} timed out")


def main() -> int:
    if len(sys.argv) < 2:
        fail("usage: context7-query list-tools | resolve <libraryName> <query> | docs <libraryId> <query>", 2)

    executable = shutil.which("context7-mcp")
    if not executable:
        fail("context7-mcp executable is unavailable", 3)

    proc = subprocess.Popen(
        [executable, "--transport", "stdio"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )

    try:
        send(proc, {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": CLIENT_INFO,
            },
        })
        init = recv(proc, 1, 20.0)
        if "error" in init:
            fail(json.dumps(init["error"], ensure_ascii=False), 4)
        send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

        operation = sys.argv[1]
        if operation == "list-tools":
            send(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        elif operation == "resolve":
            if len(sys.argv) != 4:
                fail("resolve requires <libraryName> <query>", 2)
            send(proc, {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "resolve-library-id",
                    "arguments": {"libraryName": sys.argv[2], "query": sys.argv[3]},
                },
            })
        elif operation == "docs":
            if len(sys.argv) != 4:
                fail("docs requires <libraryId> <query>", 2)
            send(proc, {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "query-docs",
                    "arguments": {"libraryId": sys.argv[2], "query": sys.argv[3]},
                },
            })
        else:
            fail(f"unsupported operation: {operation}", 2)

        response = recv(proc, 2, 30.0)
        if "error" in response:
            fail(json.dumps(response["error"], ensure_ascii=False), 5)
        print(json.dumps(response.get("result", {}), ensure_ascii=False))
        return 0
    except TimeoutError as exc:
        fail(str(exc), 6)
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


if __name__ == "__main__":
    raise SystemExit(main())
