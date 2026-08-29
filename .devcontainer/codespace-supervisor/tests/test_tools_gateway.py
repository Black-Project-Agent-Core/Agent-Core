from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from tools_gateway import (
    ToolInvokeRequest,
    _browser_url_allowed,
    _mcp_allowed_call,
    _parse_input_json,
    _read_source,
    _search_source,
    _validate_mcp_call_arguments,
    _workspace_github_repo,
)


class ToolsGatewayTests(unittest.TestCase):
    def test_parse_input_json_requires_object(self) -> None:
        self.assertEqual(_parse_input_json(None), {})
        self.assertEqual(_parse_input_json('{"x":1}'), {"x": 1})
        with self.assertRaises(HTTPException) as raised:
            _parse_input_json('[1,2,3]')
        self.assertEqual(raised.exception.status_code, 400)

    def test_source_read_and_search_are_root_confined(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.md").write_text("alpha\nbeta gateway\ngamma\n", encoding="utf-8")
            read = _read_source(root, "README.md", 2000)
            self.assertIn("beta gateway", read["content"])
            found = _search_source(root, "gateway", 2000)
            self.assertEqual(found["matches"][0]["line"], 2)
            with self.assertRaises(HTTPException) as raised:
                _read_source(root, "../outside.txt", 2000)
            self.assertEqual(raised.exception.status_code, 403)

    def test_mcp_policy_blocks_unreviewed_and_mutating_tools(self) -> None:
        self.assertTrue(_mcp_allowed_call("mcp-fetch", "fetch"))
        self.assertTrue(_mcp_allowed_call("mcp-git", "git_status"))
        self.assertFalse(_mcp_allowed_call("mcp-git", "git_commit"))
        self.assertFalse(_mcp_allowed_call("mcp-everything", "get-env"))
        self.assertFalse(_mcp_allowed_call("mcp-sequential-thinking", "sequentialthinking"))
        self.assertTrue(_mcp_allowed_call("serena", "find_symbol"))
        self.assertTrue(_mcp_allowed_call("serena", "get_diagnostics_for_file"))
        self.assertFalse(_mcp_allowed_call("serena", "replace_symbol_body"))
        self.assertFalse(_mcp_allowed_call("serena", "execute_shell_command"))
        self.assertFalse(_mcp_allowed_call("semgrep", "semgrep_scan"))
        self.assertFalse(_mcp_allowed_call("agentmemory", "memory_save"))
        self.assertFalse(_mcp_allowed_call("playwright-mcp", "browser_run_code_unsafe"))
        self.assertFalse(_mcp_allowed_call("chrome-devtools-mcp", "evaluate_script"))
        self.assertTrue(_mcp_allowed_call("github-mcp", "get_file_contents"))
        self.assertFalse(_mcp_allowed_call("github-mcp", "get_secret_scanning_alert"))

    def test_browser_url_policy_is_scoped_to_local_or_current_codespace(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CODESPACE_NAME": "demo-space",
                "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN": "app.github.dev",
            },
            clear=False,
        ):
            self.assertTrue(_browser_url_allowed("http://127.0.0.1:3000/login"))
            self.assertTrue(_browser_url_allowed("http://localhost:5173/"))
            self.assertTrue(_browser_url_allowed("https://demo-space-3000.app.github.dev/login"))
            self.assertFalse(_browser_url_allowed("https://other-space-3000.app.github.dev/"))
            self.assertFalse(_browser_url_allowed("https://example.com/"))
            self.assertFalse(_browser_url_allowed("file:///etc/passwd"))

    def test_semgrep_codepath_is_workspace_confined(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            inside = root / "inside.py"
            inside.write_text("print('ok')\n", encoding="utf-8")
            _validate_mcp_call_arguments(
                "semgrep",
                "semgrep_scan",
                {"code_files": [{"path": str(inside)}]},
                root,
            )
            with self.assertRaises(HTTPException) as raised:
                _validate_mcp_call_arguments(
                    "semgrep",
                    "semgrep_scan",
                    {"code_files": [{"path": "/etc/hosts"}]},
                    root,
                )
            self.assertEqual(raised.exception.status_code, 403)

    def test_github_mcp_is_scoped_to_active_repository(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(
                ["git", "-C", str(root), "remote", "add", "origin", "https://github.com/example/project.git"],
                check=True,
            )
            self.assertEqual(_workspace_github_repo(root), ("example", "project"))
            _validate_mcp_call_arguments(
                "github-mcp",
                "get_file_contents",
                {"owner": "example", "repo": "project", "path": "README.md"},
                root,
            )
            with self.assertRaises(HTTPException) as raised:
                _validate_mcp_call_arguments(
                    "github-mcp",
                    "get_file_contents",
                    {"owner": "other", "repo": "project", "path": "README.md"},
                    root,
                )
            self.assertEqual(raised.exception.status_code, 403)
            _validate_mcp_call_arguments(
                "github-mcp",
                "search_repositories",
                {"query": "language:go is:public"},
                root,
            )
            with self.assertRaises(HTTPException):
                _validate_mcp_call_arguments(
                    "github-mcp",
                    "search_repositories",
                    {"query": "language:go"},
                    root,
                )

    def test_invoke_request_accepts_generic_json_string(self) -> None:
        req = ToolInvokeRequest(
            toolId="j-space",
            operation="note",
            inputJson=json.dumps({"goal": "test", "coreSlot": 1}),
        )
        self.assertEqual(req.toolId, "j-space")
        self.assertEqual(req.operation, "note")


if __name__ == "__main__":
    unittest.main()
