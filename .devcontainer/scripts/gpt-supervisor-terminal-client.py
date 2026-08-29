#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import http.client
from pathlib import Path


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
DEFAULT_TOKEN_FILE = Path("/home/vscode/.codespace-supervisor/state/bridge.token")


def request_json(method: str, path: str, payload: dict | None = None) -> dict:
    token = DEFAULT_TOKEN_FILE.read_text(encoding="utf-8").strip()
    if not token:
        raise RuntimeError("Codespace supervisor token file is empty")
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    connection = http.client.HTTPConnection(DEFAULT_HOST, DEFAULT_PORT, timeout=8)
    try:
        connection.request(
            method,
            path,
            body=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="replace")
        if response.status >= 400:
            raise RuntimeError(f"bridge returned HTTP {response.status}: {body}")
        value = json.loads(body)
    except OSError as exc:
        raise RuntimeError(f"bridge is unavailable: {exc}") from exc
    finally:
        connection.close()
    if not isinstance(value, dict):
        raise RuntimeError("bridge returned a non-object response")
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Client for the visible GPT Supervisor Codespace terminal")
    sub = parser.add_subparsers(dest="operation", required=True)
    sub.add_parser("status")

    run = sub.add_parser("run")
    run.add_argument("--cwd", default=".")
    run.add_argument("--timeout", type=int, default=120)
    run.add_argument("argv", nargs=argparse.REMAINDER)

    get = sub.add_parser("get")
    get.add_argument("invocation_id")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.operation == "status":
            result = request_json("GET", "/terminal/status")
        elif args.operation == "run":
            argv = list(args.argv)
            if argv and argv[0] == "--":
                argv = argv[1:]
            if not argv:
                raise RuntimeError("run requires argv after --")
            result = request_json("POST", "/terminal/invocations", {
                "argv": argv,
                "cwd": args.cwd,
                "timeoutSeconds": args.timeout,
            })
        else:
            result = request_json("GET", f"/terminal/invocations/{args.invocation_id}")
    except (OSError, RuntimeError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
