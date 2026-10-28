---
"agent-core": patch
---

A test run verdict that a script computes. `scripts/verify/test-run-evidence.mjs` reads a vitest text log, a vitest JSON report or a JUnit file and prints PROVEN, PARTLY or NOT from the counts alone: nothing executed, everything skipped, a failure, or a result older than the code it covers (`--code`, `--max-age-minutes`) is NOT and exits 1. `--self-check` runs built-in known-bad runs and fails unless each is seen as bad. Read-only, no dependencies, no gate.
