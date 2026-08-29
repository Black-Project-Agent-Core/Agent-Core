#!/usr/bin/env bash
set -euo pipefail

TOOLS_ROOT=/workspaces/.assistant-tools
PY_TARGET="$TOOLS_ROOT/python-packages"

if [ ! -d "$PY_TARGET" ]; then
  echo "MCP Python runtime is unavailable: $PY_TARGET" >&2
  exit 3
fi

export PYTHONPATH="$PY_TARGET${PYTHONPATH:+:$PYTHONPATH}"

case "$(basename "$0")" in
  mcp-server-fetch)
    module=mcp_server_fetch
    ;;
  mcp-server-git)
    module=mcp_server_git
    ;;
  mcp-server-time)
    module=mcp_server_time
    ;;
  *)
    echo "Unsupported MCP Python wrapper name: $(basename "$0")" >&2
    exit 2
    ;;
esac

exec python3 -m "$module" "$@"
