#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/common.sh"

memory_remote_enabled="${AGENT_CORE_MEMORY_REMOTE_ENABLED:-false}"
case "${memory_remote_enabled,,}" in
  1|true|yes|on) ;;
  0|false|no|off|'')
    log_info 'Memory Remote is disabled; hydration gate is not required.'
    exit 0
    ;;
  *)
    log_error 'AGENT_CORE_MEMORY_REMOTE_ENABLED must be a boolean value.'
    exit 55
    ;;
esac

owner="${AGENT_CORE_MEMORY_REMOTE_OWNER:-}"
repo="${AGENT_CORE_MEMORY_REMOTE_REPO:-}"
branch="${AGENT_CORE_MEMORY_REMOTE_BRANCH:-main}"
principal_id="${AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID:-}"
project_id="$AGENT_CORE_MEMORY_REMOTE_PROJECT_ID"
key_file="$AGENT_CORE_MEMORY_REMOTE_KEY_FILE"
work_root="$AGENT_CORE_MEMORY_REMOTE_WORK_ROOT"
db_path="$AGENT_CORE_MEMORY_DB_PATH"
marker="$AGENT_CORE_MEMORY_REMOTE_HYDRATION_MARKER"

for required in owner repo principal_id project_id; do
  value="${!required}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    log_error "Memory Remote hydration requires $required to be configured."
    exit 55
  fi
done

mkdir -p "$(dirname "$key_file")" "$(dirname "$db_path")" "$(dirname "$marker")" "$work_root"

# A verified marker is the only local evidence that this scope has already passed
# remote hydration in the current Codespace. A stale/mismatched marker never grants
# authority to an existing local SQLite file.
if [[ -s "$marker" ]]; then
  if node - "$marker" "$owner" "$repo" "$branch" "$principal_id" "$project_id" "$db_path" <<'NODE'
const fs = require('node:fs');
const [markerPath, owner, repo, branch, principalId, projectId, dbPath] = process.argv.slice(2);
try {
  const value = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const stateOk = value?.state === 'REMOTE_HYDRATED' || value?.state === 'REMOTE_EMPTY_CONFIRMED';
  const identityOk = value?.verified === true
    && value.owner === owner
    && value.repo === repo
    && value.branch === branch
    && value.principalId === principalId
    && value.projectId === projectId;
  const hydratedDbOk = value?.state !== 'REMOTE_HYDRATED'
    || (fs.existsSync(dbPath) && fs.statSync(dbPath).isFile() && fs.statSync(dbPath).size > 0);
  process.exit(stateOk && identityOk && hydratedDbOk ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
  then
    log_info 'Memory Remote hydration marker is verified for the configured scope.'
    exit 0
  fi
fi

if [[ -s "$db_path" ]]; then
  log_error "Memory Remote is enabled but an uncertified local memory database already exists at $db_path; refusing to treat it as remote-authoritative."
  exit 55
fi

if [[ ! -s "$key_file" ]]; then
  memory_remote_key_hex="${AGENT_CORE_MEMORY_REMOTE_KEY_HEX:-}"
  if [[ ! "$memory_remote_key_hex" =~ ^[0-9A-Fa-f]{64}$ ]]; then
    log_error 'Memory Remote encryption key is unavailable; configure AGENT_CORE_MEMORY_REMOTE_KEY_HEX or a valid key file.'
    exit 55
  fi
  umask 077
  printf '%s\n' "$memory_remote_key_hex" > "$key_file"
  chmod 600 "$key_file"
  unset memory_remote_key_hex
  log_info 'Memory Remote encryption key restored from the dedicated Codespaces secret.'
fi
unset AGENT_CORE_MEMORY_REMOTE_KEY_HEX || true

result_file="$(dirname "$marker")/memory-hydration-result.$$.json"
marker_tmp="${marker}.tmp.$$"
rm -f "$result_file" "$marker_tmp"

log_info 'Verifying and hydrating the configured Memory Remote before runtime startup.'
if ! AGENT_CORE_MEMORY_DB_PATH="$db_path" \
  AGENT_CORE_MEMORY_REMOTE_KEY_FILE="$key_file" \
  AGENT_CORE_MEMORY_REMOTE_WORK_ROOT="$work_root" \
  node "$AGENT_CORE_REPO_ROOT/dist/cli.js" memory-hydrate "$principal_id" "$project_id" > "$result_file"; then
  rm -f "$result_file" "$marker_tmp"
  log_error 'Memory Remote hydration failed; runtime startup is blocked.'
  exit 55
fi

state="$(node - "$result_file" <<'NODE'
const fs = require('node:fs');
try {
  const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (value?.state !== 'REMOTE_HYDRATED' && value?.state !== 'REMOTE_EMPTY_CONFIRMED') process.exit(1);
  process.stdout.write(value.state);
} catch {
  process.exit(1);
}
NODE
)" || {
  rm -f "$result_file" "$marker_tmp"
  log_error 'Memory Remote hydration returned an invalid success payload; runtime startup is blocked.'
  exit 55
}

if [[ "$state" == "REMOTE_HYDRATED" && ! -s "$db_path" ]]; then
  rm -f "$result_file" "$marker_tmp"
  log_error 'Memory Remote reported REMOTE_HYDRATED but no hydrated SQLite database was installed.'
  exit 55
fi

node - "$result_file" "$marker_tmp" "$owner" "$repo" "$branch" "$principal_id" "$project_id" <<'NODE'
const fs = require('node:fs');
const [resultPath, markerPath, owner, repo, branch, principalId, projectId] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
if (result?.state !== 'REMOTE_HYDRATED' && result?.state !== 'REMOTE_EMPTY_CONFIRMED') process.exit(1);
const marker = {
  state: result.state,
  principalId,
  projectId,
  owner,
  repo,
  branch,
  remoteHead: typeof result.remoteHead === 'string' ? result.remoteHead : null,
  ...(typeof result.generationId === 'string' ? { generationId: result.generationId } : {}),
  ...(typeof result.logicalStateHash === 'string' ? { logicalStateHash: result.logicalStateHash } : {}),
  verified: true,
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
NODE
chmod 600 "$marker_tmp"
mv -f "$marker_tmp" "$marker"
rm -f "$result_file"
log_info "Memory Remote hydration gate passed with state $state."
