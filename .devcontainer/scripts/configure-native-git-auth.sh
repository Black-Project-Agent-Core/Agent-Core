#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_FILE")" && pwd)"
# shellcheck source=supervisor-common.sh
. "$SCRIPT_DIR/supervisor-common.sh"

log() { printf '[codespace-supervisor/git-auth] %s\n' "$*"; }

AUTH_ROOT="/workspaces/.assistant-auth"
AUTH_BIN="$AUTH_ROOT/bin"
HELPER="$AUTH_BIN/gitcredential-codespaces-native"
GH_WRAPPER="$AUTH_BIN/codespace-gh"
SHARED_ENV="/workspaces/.codespaces/shared/.env"
NATIVE_HELPER="/.codespaces/bin/gitcredential_github.sh"

install -d -m 700 "$AUTH_ROOT" "$AUTH_BIN"

cat > "$HELPER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

env_file=/workspaces/.codespaces/shared/.env
native_helper=/.codespaces/bin/gitcredential_github.sh

if [ ! -f "$env_file" ]; then
  echo 'Codespaces shared auth environment is unavailable' >&2
  exit 1
fi
if [ ! -x "$native_helper" ]; then
  echo 'Codespaces native Git credential helper is unavailable' >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$env_file"
set +a

# Never leak bridge credentials into GitHub's helper process.
unset BRIDGE_TOKEN || true

exec "$native_helper" "$@"
EOF
chmod 700 "$HELPER"

cat > "$GH_WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

env_file=/workspaces/.codespaces/shared/.env
if [ ! -f "$env_file" ]; then
  echo 'Codespaces shared auth environment is unavailable' >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. "$env_file"
set +a
unset BRIDGE_TOKEN || true
exec /usr/bin/gh "$@"
EOF
chmod 700 "$GH_WRAPPER"

# Recreate the convenience entry point after every rebuild/start. The target is
# persistent under /workspaces and contains no credential value.
sudo ln -sfn "$GH_WRAPPER" /usr/local/bin/codespace-gh

if [ ! -f "$SHARED_ENV" ]; then
  log "shared Codespaces auth environment not present yet; helpers installed for later use"
  exit 0
fi
if [ ! -x "$NATIVE_HELPER" ]; then
  log "native Codespaces Git credential helper is unavailable"
  exit 0
fi

# credential.helper is multi-valued. An empty value resets helpers inherited
# from /etc/gitconfig; the second entry points at our wrapper, which injects the
# ephemeral native Codespaces token only into the credential-helper subprocess.
git -C "$REPO_ROOT" config --local --replace-all credential.helper ''
git -C "$REPO_ROOT" config --local --add credential.helper "$HELPER"

log "native GitHub Git/CLI authentication configured"
