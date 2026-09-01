#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
EXPECTED_SEMVER="0.0.13"

matches_expected_version() {
  local output="$1"
  case "$output" in
    "$EXPECTED_SEMVER"|"$EXPECTED_SEMVER+"*|"$EXPECTED_SEMVER "*|"$EXPECTED_SEMVER ("*) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ "${1:-}" == --installer-only ]]; then
  BIN="$ROOT/runtime/bin/tunnel-client"
  [[ -x "$BIN" ]] || {
    printf '%s\n' "[codespace] RED: tunnel-client is not installed." >&2
    exit 1
  }
  version_output="$("$BIN" --version 2>&1 || true)"
  matches_expected_version "$version_output" || {
    printf '%s\n' "[codespace] RED: installed tunnel-client is not semantic version $EXPECTED_SEMVER." >&2
    exit 1
  }
  printf '%s\n' "$version_output"
  printf '%s\n' "[codespace] GREEN: tunnel-client v$EXPECTED_SEMVER verified."
  exit 0
fi

mode="${1:-full}"
case "$mode" in full|--static) ;; *) printf '%s\n' "Usage: $0 [--static|--installer-only]" >&2; exit 2 ;; esac

cd "$REPO_ROOT"
node <<'NODE'
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync('.devcontainer/devcontainer.json', 'utf8'));
const expected = {
  postCreateCommand: 'bash scripts/codespace/bootstrap.sh --phase create',
  postStartCommand: 'bash scripts/codespace/bootstrap.sh --phase start',
  postAttachCommand: 'bash scripts/codespace/ensure-running.sh --repair --phase attach',
};
for (const [phase, command] of Object.entries(expected)) {
  if (config[phase] !== command) {
    console.error(`[codespace] RED: ${phase} must use the deterministic lifecycle command.`);
    process.exit(1);
  }
}
NODE

for script in \
  "$ROOT/scripts/ensure-running.sh" \
  "$ROOT/scripts/ensure-http-mcp.sh" \
  "$ROOT/scripts/start-http-mcp.sh" \
  "$ROOT/scripts/start-watchdog.sh" \
  "$ROOT/scripts/runtime-reconciliation.sh" \
  "$ROOT/scripts/repair-bridge.sh"; do
  [[ -f "$script" ]] || {
    printf '%s\n' "[codespace] RED: required lifecycle script missing: $script" >&2
    exit 1
  }
  bash -n "$script"
done

npm --prefix "$ROOT" run build
if [[ "$mode" == --static ]]; then
  NODE_ENV=test npm exec vitest run \
    plugin/codespace/tests/runtime-reconciliation.exec.test.ts \
    plugin/codespace/tests/watchdog.test.ts \
    plugin/codespace/tests/watchdog.integration.test.ts \
    plugin/codespace/tests/outage-fast-path.integration.test.ts
else
  NODE_ENV=test npm exec vitest run plugin/codespace/tests
fi

git diff --check
printf '%s\n' "[codespace] GREEN: executable reconciliation, leaf repair, watchdog routing, build, syntax, and diff checks passed."
