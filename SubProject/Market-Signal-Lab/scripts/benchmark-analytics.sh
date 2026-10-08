#!/usr/bin/env bash
set -euo pipefail
worker="${MSL_RUST_WORKER:-}"
args=()
if [[ -n "$worker" ]]; then
  args+=("-worker" "$worker")
fi
go run -tags analyticsbench ./cmd/analytics-bench "${args[@]}" "$@"
