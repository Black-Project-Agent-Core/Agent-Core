#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"

"$SCRIPT_DIR/bootstrap-supervisor.sh"
"$SCRIPT_DIR/install-assistant-tools.sh"
"$SCRIPT_DIR/install-cognitive-tools.sh"
"$SCRIPT_DIR/configure-native-git-auth.sh"

# Make a fresh/rebuilt Codespace immediately usable even if a client delays
# or skips the subsequent postStart/postAttach lifecycle hook. The start script
# is idempotent, so later lifecycle hooks can safely invoke it again.
"$SCRIPT_DIR/post-start.sh"

# Preserve the repository's existing post-create verification and fail fast if
# runtimes required by the reviewed Tools Gateway are unavailable after rebuild.
go version
rustc --version
cargo --version
cargo clippy --version
rg --version
git lfs version
node --version
npm --version
pwsh --version
pytest --version
"$SCRIPT_DIR/install-assistant-tools.sh" --check
"$SCRIPT_DIR/install-cognitive-tools.sh" --check
