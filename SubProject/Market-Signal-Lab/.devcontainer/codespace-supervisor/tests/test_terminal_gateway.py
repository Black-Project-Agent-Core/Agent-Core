from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path

from fastapi import HTTPException

from terminal_gateway import VisibleTerminalGateway, VisibleTerminalRequest


class VisibleTerminalGatewayTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        self.root = base / "workspace"
        self.root.mkdir()
        self.state = base / "state"
        self.mutable_calls = 0

        def safe_path(value: str) -> Path:
            target = (self.root / value).resolve()
            if target != self.root and self.root not in target.parents:
                raise HTTPException(status_code=403, detail="escape")
            return target

        def validate_argv(argv: list[str], cwd: Path) -> list[str]:
            if not argv:
                raise HTTPException(status_code=400, detail="empty")
            return [f"/resolved/{argv[0]}", *argv[1:]]

        def ensure_mutable_branch() -> None:
            self.mutable_calls += 1

        def readonly(argv: list[str]) -> bool:
            return argv[:2] == ["git", "status"]

        self.gateway = VisibleTerminalGateway(
            state_dir=self.state,
            safe_path=safe_path,
            validate_argv=validate_argv,
            ensure_mutable_branch=ensure_mutable_branch,
            command_is_readonly=readonly,
        )
        self.gateway.heartbeat.write_text(json.dumps({
            "timestamp": time.time(),
            "activeInvocationId": None,
        }))

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_status_tracks_heartbeat(self) -> None:
        self.gateway.heartbeat.unlink()
        self.assertFalse(self.gateway.status()["available"])
        self.gateway.heartbeat.write_text(json.dumps({
            "timestamp": time.time(),
            "activeInvocationId": "abc",
        }))
        status = self.gateway.status()
        self.assertTrue(status["available"])
        self.assertEqual(status["terminalName"], "GPT Supervisor")
        self.assertEqual(status["activeInvocationId"], "abc")

    def test_invoke_requires_connected_visible_terminal(self) -> None:
        self.gateway.heartbeat.unlink()
        with self.assertRaises(HTTPException) as raised:
            self.gateway.invoke(VisibleTerminalRequest(argv=["go", "version"]))
        self.assertEqual(raised.exception.status_code, 409)

    def test_mutating_invocation_is_queued_with_validated_argv(self) -> None:
        queued = self.gateway.invoke(VisibleTerminalRequest(
            argv=["go", "test", "./..."],
            cwd=".",
            timeoutSeconds=180,
        ))
        self.assertEqual(self.mutable_calls, 1)
        self.assertEqual(queued["status"], "queued")

        state = self.gateway.get(queued["id"])
        self.assertEqual(state["status"], "queued")
        self.assertEqual(state["argv"][0], "/resolved/go")
        self.assertEqual(state["displayArgv"], ["go", "test", "./..."])

    def test_readonly_git_invocation_does_not_require_mutable_branch(self) -> None:
        queued = self.gateway.invoke(VisibleTerminalRequest(argv=["git", "status"]))
        self.assertEqual(self.mutable_calls, 0)
        self.assertEqual(self.gateway.get(queued["id"])["status"], "queued")

    def test_completed_result_wins_over_queue_state(self) -> None:
        queued = self.gateway.invoke(VisibleTerminalRequest(argv=["go", "version"]))
        result_path = self.gateway.results / f"{queued['id']}.json"
        result_path.write_text(json.dumps({
            "id": queued["id"],
            "status": "completed",
            "exitCode": 0,
            "output": "ok\n",
        }))
        state = self.gateway.get(queued["id"])
        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["output"], "ok\n")

    def test_invalid_invocation_id_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            self.gateway.get("not-a-uuid")
        self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
