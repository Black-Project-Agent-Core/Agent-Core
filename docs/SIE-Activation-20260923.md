# SIE Activation — 23 September 2026

**Status: COMPLETE — SIE-P4/P1/P3 LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.**

The user explicitly authorized this activation. Qualified SIE artifacts were installed and Core was restarted without requiring manual user action. This is not a new release; product version remains 0.12.0. P2/P5 remain conditional and were not installed.

## Installed scope and rollback

Four existing JavaScript programs and their maps were replaced; three new programs and their maps were added. All 14 files match the qualified candidate. Eight pre-existing files were backed up and hash-verified; 321 other monitored artifacts remain byte-identical. MemoryService, provider binary, launcher binary, package versions, and unrelated runtime modules were not replaced.

The seven changed programs are learning/review-summary.js, evaluation.js, decision-evidence.js, review.js, service.js, memory-sink.js and mcp/learning-schemas.js. Source was not changed during activation.

## Fresh evidence

| Check | Result |
| --- | --- |
| Installed hashes | 14/14 match |
| Preserved artifacts | 321/321 unchanged |
| Installed-dist tests | 68 PASS / 0 FAIL / 0 SKIP; exit 0 |
| Live HTTP MCP checks | 10/10 pass; exit 0 |
| Fresh live manifest | 62 tools; 5 existing Learning actions; 4 optional SIE candidate fields |
| New Node Core | PID 5196, start 2026-09-22T19:00:37.1525020Z, after installation |
| Core health | HTTP 200, status ok, version 0.12.0 |
| Execution / Memory / Learning | available; Memory issueCount 0 |
| Grafel | available/current; existing provider retained |
| Tunnel readiness | HTTP 200 |
| Original owned processes | All 4 recorded original process identities absent |

The 68 cases are the same cases previously qualified on source and candidate, rerun against installed bytes. Only the old-schema comparator import is redirected to the verified pre-activation backup; all product-under-test imports resolve to installed dist, with source/candidate imports explicitly forbidden. Loaded-file provenance records this distinction.

Live MCP checks used the actual authenticated localhost HTTP endpoint and a short-lived acceptance key, revoked in finally. They confirmed proposal-only handling, declared evidence and correlation, correctness-failed rejection, incomplete review summaries, malformed-envelope refusal, and unchanged durable-record metadata before/after the probes. No synthetic claim was persisted to production Memory or Grafel.

## Qualification limits preserved

Evaluation remains controller-declared evidence, not authenticated artifact proof or independent recomputation. Corrections remain declarations and never automatically edit/delete old memory. P2/P5 are conditional, not completed implementations.

The implementation's 29 pre-existing dependency compiler diagnostics remain a documented limitation; no root rebuild, source recovery, or release-tool recovery was performed. Three existing managed Semantic IDE entrypoint issues remain outside this task. No broader tests, OAuth reset, reference deletion, dependency installation, commit/push, or release apply occurred.

## Execution incident and evidence integrity

The first stop-helper invocation failed on a nested PowerShell array before stopping any process. After correcting array parsing, the scoped shutdown caused the MCP connection to drop and the detached installer completed. The original failure report is retained; independent post-restart identity checks, not that interrupted stop log, prove the old processes are absent. No automatic installation retry or production rollback was needed.

## Evidence and continuity

Evidence: `runtime/tmp/sie-activation-20260923/`.
Backup: `runtime/backups/sie-activation-20260923/`.
Primary records: manifest.json, activation-result.json, installed-hash-readback.json, installed-tests.json, installed-tests.exit.json, installed-provenance.json, live-manifest.json, live-mcp-verification.json, post-restart-processes.json, post-restart-health.json, activation-verification.json and docs-memory-readback.json.

Plan: `docs/Self-Improving-Agent-Ecosystem-Steal-Use-Integration-Plan.md`.
Implementation history: `docs/SIE-Adoption-Execution-20260923.md`.
Canonical continuity record: `2820c59d-9e92-41c5-821a-31da35c8837a`.

**Outstanding activation work for SIE-P4/P1/P3: NONE.** No user installer run or additional restart is required.
