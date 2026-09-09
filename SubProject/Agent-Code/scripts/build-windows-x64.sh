#!/usr/bin/env bash
set -euo pipefail

NSIS_VERSION=3.08
NSISDIR="${AGENT_CODE_NSISDIR:-$HOME/.cache/agent-code/nsis/nsis-${NSIS_VERSION}}"
XWIN_CACHE_DIR="${XWIN_CACHE_DIR:-$HOME/.cache/agent-code/xwin}"

[[ -f "$NSISDIR/Include/Win/COM.nsh" ]] || {
  echo "NSIS support tree is missing at $NSISDIR. Run scripts/linux-bootstrap.sh first." >&2
  exit 20
}
grep -q 'ICustomDestinationList' "$NSISDIR/Include/Win/COM.nsh" || {
  echo "NSIS support tree at $NSISDIR is too old for the Tauri installer template." >&2
  exit 20
}
command -v cargo-xwin >/dev/null 2>&1 || {
  echo 'cargo-xwin is unavailable. Run scripts/linux-bootstrap.sh first.' >&2
  exit 20
}

TOOLCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/toolchain" && pwd -P)"
export NSISDIR XWIN_CACHE_DIR
export PATH="$TOOLCHAIN_DIR:$PATH"
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc "$@"
bash scripts/check-windows-artifact.sh
