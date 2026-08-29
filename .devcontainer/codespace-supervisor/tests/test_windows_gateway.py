from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from windows_gateway import (
    BootstrapRequest,
    CreateSessionRequest,
    PairRequest,
    RelayPollRequest,
    RelayRegisterRequest,
    RelayResultRequest,
    ToolInvocationRequest,
    WindowsGateway,
)


class WindowsGatewayTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        # Never let a developer/runtime WINDOWS_GATEWAY_STATE_DIR leak into unit
        # tests: ordinary tests must remain isolated from the real persistent
        # pairing state under /workspaces.
        with patch.dict(os.environ, {"WINDOWS_GATEWAY_STATE_DIR": ""}, clear=False):
            self.gateway = WindowsGateway(Path(self.temp.name))
        pairing = self.gateway.create_pairing()
        paired = self.gateway.pair(PairRequest(
            code=pairing["code"],
            machineId="win-test-001",
            machineName="TEST-WINDOWS",
            platform="Windows 11",
            relayVersion="test",
            allowedRoots=[r"C:\Work"],
        ))
        self.token = paired["deviceToken"]
        self.machine = self.gateway.require_device(f"Bearer {self.token}")
        self.gateway.register(RelayRegisterRequest(
            machineId="win-test-001",
            machineName="TEST-WINDOWS",
            platform="Windows 11",
            relayVersion="test",
            desktopCommanderAvailable=True,
            desktopCommanderVersion="0.test",
            desktopCommanderTools=["list_directory", "read_file", "write_file", "list_processes"],
            logicalTools=["listDirectory", "readFile", "writeFile", "runCommand", "listProcesses"],
            allowedRoots=[r"C:\Work"],
        ), self.machine)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_bootstrap_payload_uses_pairing_code_without_long_term_token(self) -> None:
        pairing = self.gateway.create_pairing()
        target_root = r"F:\Chrome-Isolated\Downloads\Trends&Insights"
        with patch.dict(os.environ, {
            "CODESPACE_NAME": "active-codespace",
            "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN": "app.github.dev",
        }, clear=False):
            script = self.gateway.bootstrap_script(BootstrapRequest(
                code=pairing["code"],
                allowedRoot=target_root,
            ))
        self.assertIn("https://active-codespace-8787.app.github.dev", script)
        self.assertIn("install-windows-relay.ps1", script)
        self.assertIn("windows-relay.mjs", script)
        self.assertIn(target_root, script)
        self.assertIn("$StateRoot = Join-Path $AllowedRoot '.codespace-windows-relay'", script)
        self.assertIn("$TempRoot = Join-Path $AllowedRoot", script)
        self.assertIn("-StateRoot $StateRoot -RequireExistingNode -DisableStartupFolderFallback", script)
        self.assertNotIn("Join-Path $env:TEMP", script)
        self.assertIn(pairing["code"], script)
        self.assertNotIn("deviceToken", script)
        with self.assertRaises(HTTPException) as raised:
            self.gateway.bootstrap_script(BootstrapRequest(
                code="00000000",
                allowedRoot=target_root,
            ))
        self.assertEqual(raised.exception.status_code, 401)

    def test_persistent_state_override_survives_transient_runtime_recreation(self) -> None:
        with tempfile.TemporaryDirectory() as persistent, tempfile.TemporaryDirectory() as transient_a, tempfile.TemporaryDirectory() as transient_b:
            target_root = r"F:\Chrome-Isolated\Downloads\Trends&Insights"
            with patch.dict(os.environ, {"WINDOWS_GATEWAY_STATE_DIR": persistent}, clear=False):
                first = WindowsGateway(Path(transient_a))
                pairing = first.create_pairing()
                first.pair(PairRequest(
                    code=pairing["code"],
                    machineId="win-persistent-001",
                    machineName="TEST-WINDOWS",
                    platform="Windows 11",
                    relayVersion="test",
                    allowedRoots=[target_root],
                ))

                # Simulate the ephemeral supervisor runtime being recreated by a
                # Full Rebuild: instantiate a new gateway with a different
                # transient state dir while retaining the /workspaces override.
                second = WindowsGateway(Path(transient_b))

            self.assertEqual(second.root, Path(persistent).resolve())
            self.assertEqual(second.capabilities()["allowedRoots"], [target_root])
            machine = json.loads((Path(persistent) / "machine.json").read_text(encoding="utf-8"))
            self.assertEqual(machine["configuredAllowedRoots"], [target_root])

    def test_pairing_pins_root_and_path_escape_is_denied(self) -> None:
        capabilities = self.gateway.capabilities()
        self.assertEqual(capabilities["allowedRoots"], [r"C:\Work"])
        session = self.gateway.create_session(CreateSessionRequest(
            brief="test",
            requestedRoots=[r"C:\Work\Project"],
        ))
        self.assertEqual(session["effectiveRoots"], [r"C:\Work\Project"])
        with self.assertRaises(HTTPException) as raised:
            self.gateway._validate_tool(session, "readFile", {"path": r"C:\Windows\System32\drivers\etc\hosts"})
        self.assertEqual(raised.exception.status_code, 403)

    def test_run_command_normalizes_extensionless_allowed_executable(self) -> None:
        session = self.gateway.create_session(CreateSessionRequest(
            brief="normalize executable alias",
            requestedRoots=[r"C:\Work"],
        ))
        normalized = self.gateway._validate_tool(session, "runCommand", {
            "argv": ["powershell", "-NoProfile", "-Command", "Write-Output ok"],
            "cwd": r"C:\Work",
        })
        self.assertEqual(normalized["argv"][0], "powershell.exe")

        normalized_cmd = self.gateway._validate_tool(session, "runCommand", {
            "argv": ["npm", "--version"],
            "cwd": r"C:\Work",
        })
        self.assertEqual(normalized_cmd["argv"][0], "npm.cmd")

        with self.assertRaises(HTTPException) as raised:
            self.gateway._validate_tool(session, "runCommand", {
                "argv": ["not-allowlisted", "--version"],
                "cwd": r"C:\Work",
            })
        self.assertEqual(raised.exception.status_code, 403)

    def test_invocation_round_trip_and_events(self) -> None:
        session = self.gateway.create_session(CreateSessionRequest(brief="inspect processes"))
        holder = {}

        def invoke() -> None:
            response = self.gateway.invoke(session["sessionId"], ToolInvocationRequest(
                tool="listProcesses",
                arguments={},
                reason="smoke test",
            ))
            holder["response"] = response

        thread = threading.Thread(target=invoke)
        thread.start()
        poll = self.gateway.poll(RelayPollRequest(
            machineId="win-test-001",
            waitSeconds=1,
            availableSlots=1,
        ), self.machine)
        self.assertIsNotNone(poll["job"])
        job = poll["job"]
        self.gateway.complete(RelayResultRequest(
            machineId="win-test-001",
            invocationId=job["invocationId"],
            status="completed",
            result={"processes": 3},
        ), self.machine)
        thread.join(timeout=3)
        self.assertFalse(thread.is_alive())
        payload = json.loads(holder["response"].body)
        self.assertEqual(payload["status"], "completed")
        completed = self.gateway.complete_session(session["sessionId"], "process inspection complete")
        self.assertEqual(completed["status"], "completed")
        events = self.gateway.events(session["sessionId"], 0, 50)
        self.assertEqual([e["type"] for e in events["events"]], [
            "session_created", "tool_requested", "tool_started", "tool_completed", "session_completed"
        ])

    def test_cancel_queued_invocation(self) -> None:
        session = self.gateway.create_session(CreateSessionRequest(brief="cancel test"))
        holder = {}

        def invoke() -> None:
            holder["response"] = self.gateway.invoke(session["sessionId"], ToolInvocationRequest(
                tool="listProcesses",
                arguments={},
                reason="cancel smoke test",
            ))

        thread = threading.Thread(target=invoke)
        thread.start()
        deadline = time.time() + 2
        while time.time() < deadline:
            current = self.gateway.get_session(session["sessionId"])
            if current.get("activeInvocationId"):
                break
            time.sleep(0.02)
        cancelled = self.gateway.cancel_session(session["sessionId"], "test cancellation")
        self.assertEqual(cancelled["status"], "cancelled")
        thread.join(timeout=3)
        self.assertFalse(thread.is_alive())
        payload = json.loads(holder["response"].body)
        self.assertEqual(payload["status"], "cancelled")


if __name__ == "__main__":
    unittest.main()
