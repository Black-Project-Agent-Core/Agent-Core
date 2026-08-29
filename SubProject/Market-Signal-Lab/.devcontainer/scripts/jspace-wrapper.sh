#!/usr/bin/env bash
set -euo pipefail

TOOLS_ROOT=/workspaces/.assistant-tools
JSPACE_ROOT="$TOOLS_ROOT/src/J-Space-Cognition-Suite-V3.6/j-space"
STATE_ROOT="$TOOLS_ROOT/state/j-space"

if [ ! -f "$JSPACE_ROOT/scripts/jspace.py" ]; then
  echo "J-Space runtime is unavailable: $JSPACE_ROOT/scripts/jspace.py" >&2
  exit 3
fi

mkdir -p "$STATE_ROOT"
cd "$STATE_ROOT"
exec python3 "$JSPACE_ROOT/scripts/jspace.py" "$@"
