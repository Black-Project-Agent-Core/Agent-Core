#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INTERVAL_SECONDS="${MEMORY_OBSERVATORY_WATCHDOG_INTERVAL_SECONDS:-5}"
RUN_ONCE=0

case "$INTERVAL_SECONDS" in
  ''|*[!0-9]*) INTERVAL_SECONDS=5 ;;
  0) INTERVAL_SECONDS=1 ;;
esac

if [[ "${1:-}" == '--once' ]]; then
  RUN_ONCE=1
elif [[ $# -gt 0 ]]; then
  printf 'Memory Observatory watchdog ERROR: UNSUPPORTED_ARGUMENT\n' >&2
  exit 2
fi

run_repair() {
  MEMORY_OBSERVATORY_WATCHDOG_ENABLED=0 \
    bash "$SCRIPT_DIR/ensure-memory-observatory-running.sh"
}

if (( RUN_ONCE == 1 )); then
  run_repair
  exit $?
fi

while true; do
  if ! run_repair >/dev/null; then
    printf 'Memory Observatory watchdog WARN: REPAIR_FAILED\n' >&2
  fi
  sleep "$INTERVAL_SECONDS"
done
