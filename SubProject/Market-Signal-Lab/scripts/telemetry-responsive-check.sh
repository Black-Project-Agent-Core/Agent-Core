#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${MSL_TELEMETRY_SCREENSHOTS_DIR:-$ROOT/.telemetry-qa-screenshots}"
mkdir -p "$OUT"
python3 "$ROOT/scripts/responsive_check.py" --root "$ROOT" --screenshots-dir "$OUT"
