#!/usr/bin/env bash
set -euo pipefail
go test ./internal/web -count=1
node --check internal/web/assets/js/consensus.js
python scripts/consensus_responsive_check.py --static
