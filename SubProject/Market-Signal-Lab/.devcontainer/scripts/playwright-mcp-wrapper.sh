#!/usr/bin/env bash
set -euo pipefail
CLI=/workspaces/.assistant-tools/npm-global/lib/node_modules/@playwright/mcp/cli.js
if [ ! -f "$CLI" ]; then
  echo "Playwright MCP CLI is not installed: $CLI" >&2
  exit 127
fi
exec node "$CLI" "$@"
