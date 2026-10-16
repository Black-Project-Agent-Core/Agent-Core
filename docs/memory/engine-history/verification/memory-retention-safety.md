> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../../CONSOLIDATION.md).

# Retention, safety and receipt integrity verification (T7)

Date: 2026-10-07 UTC. Baseline: `309a1cd22830c79d5689ecc5d3161039e0d93eee`, branch `feat/memory-evolution`.
Platform: isolated cloud Linux; synthetic temporary stores. **G7 independent spec/quality review passed, 20:59 UTC.**

## Implemented contracts

`ControllerMemorySession.setRetention` accepts the approved typed input and returns `RetentionReceipt`. The existing store transaction publishes the canonical retention change, exact before/after archive, scoped audit manifest and operation receipt together. Its scope is root/workspace/task; changing controller/session does not duplicate the operation. Replay checks the business payload before expected revision, and concurrent semantic changes reject. Access-only counters/history accumulated after preparation survive publication. Pinned foundation is not a retention target.

Retention is independent of truth, expiry, supersession and forgetting. Archive reduces default facade and legacy search exposure without deleting records, revisions, episode events or accepted evidence. V2 recall supports explicit `archive` and `all`; normal temporal and expiry selection still applies. Historical discovery uses `asOf`, and exact old refs remain expandable without asserting current applicability. Restoring the tier does not clear expiry, supersession or explicit forgotten visibility. A retention request cannot reopen forgotten data. Archiving requires available complete declared evidence lineage; unavailable required evidence blocks publication with `MEMORY_PRESERVATION_REQUIRED`.

Retention audits expand as evidence. Their full exact lineage remains scoped and subject to current forgotten visibility. The previously deferred T5 archive creation/transition gate is now enabled under the same reviewed consolidation rules. Legacy v1 facade writes still reject.

## Preservation and bounded state

Activated roots preserve immutable retrieval attempts and use receipts before changing recent logs. The existing 4,000-to-3,000 rotation remains; entries about to leave an older recent log are retained first. Direct immutable lookup supports replay after restart, recent-log loss and derived-index rebuilding. Conflicting recent and retained identities fail closed. A stored controller-reported outcome is distinct from the independently rechecked result: replay returns the historical receipt even if external verification bytes subsequently change, rather than rerunning or rewriting that result. Different requested outcome/payload remains a conflict.

Feedback snapshots are retained before event/record trimming, reset or reconciliation. Recent events remain bounded at 64. Ordinary feedback rows remain a recent 512-row window, with forgotten rows additionally retained because visibility decisions are authoritative, not expendable telemetry. Reset/reconcile do not clear forgotten choices on an activated root. Missing or malformed visibility blocks facade reads and protected feedback writes; it is not rebuilt as an empty permission state. This deliberately permits visibility/archive storage growth. No automatic purge or TTL deletion exists.

Canonical revisions already pass through the preservation hooks before the eight-entry undo history is pruned. The T7 reconstruction test combines accepted evidence, an episode success and applicability/rationale, archive, more than eight revisions, more than 64 feedback events, reset/reconcile, reindex and restart. All exact refs remain reachable. Legacy external evidence references are not silently copied: byte preservation is guaranteed for explicitly accepted artifacts/canonical snapshots, not arbitrary files named by an old receipt. Missing external evidence cannot be reconstructed from its hash.

## Safety and epistemic boundaries

- Capture rejects poison-shaped text without copying it into an archive. Origin roles remain host-bound; a model-supplied role is not accepted.
- Promotion rejects poisoned output, host-policy fields and fabricated verification metadata. Repeated hypothesis retrieval/positive feedback does not change epistemic status or make it eligible for fact promotion.
- Disclosure scans decoded allowlisted values again, including legacy/imported bytes. The safety scanner is a defensive heuristic, not a proof against all prompt injection. Every result remains advisory and grants no permission.
- Exact episode/event expansion now checks the entire nested memory/evidence lineage before serializing derived text, including current forgotten visibility and both historical/current workspace scope. Authorized stale history remains readable. Existing capsule protection is retained.
- Evidence/episode exposure now records view and the actual final payload byte count/digest, without inventing memory-use receipts for source-only reads. Abstract exposure is not full-record exposure.
- Resolvable bytes/invocations establish availability only. Use remains controller-reported. An independently rechecked outcome requires a host-owned registered verifier and an exact action reference to the report's checked answer bytes. An unrelated same-task invocation is insufficient. Neither result nor receipt establishes semantic support for a memory claim or causation.
- Malformed UTF-8 in `readMemoryAuditRefs` returns `MEMORY_ARCHIVE_SOURCE_UNAVAILABLE`, closing the deferred T2/T4 diagnostic gap.

## Verification

Commands:

- `npm test -- tests/memory-retention.test.ts tests/memory-safety-boundaries.test.ts tests/memory-receipt-integrity.test.ts`
- `npm run verify`
- `npm pack --dry-run --json --cache <task-local-cache>`

Final terminal results: targeted **18/18** across three files; full `npm run verify` **build + 438/438** across 20 files, exit 0, with no failed, pending or skipped tests. The final aggregate was repeated after the last test-assertion strengthening (55.28 seconds). Package dry-run: **284 files**, 384,853 compressed bytes / 2,025,358 unpacked bytes, with no runtime, archive, state, test, dependency-tree or credential artifacts. Dependency/lockfile diff is empty; `git diff --check` passes. Test-first logs reproduced each added production gap, including nested disclosure, forgotten rotation, old use-receipt lookup, poisoned legacy disclosure, unrelated action/outcome association, retention access-counter loss and success-receipt replay after evidence changes. The integration-only reconstruction cases also exercise already implemented preservation behavior.

Initial aggregate run: 415 passed / 12 failed. Ten failures were an unnecessary empty feedback audit changing recovery fixture counts; one was a synchronous rather than asynchronous legacy gate; one was a deliberately outdated T6 archive-capability assertion. All were corrected. A later aggregate build found one generic inference error in the new insufficient-budget exposure path; it was fixed before the next run. The next complete aggregate passed 436 tests; final integrity/replay regressions then brought the fresh aggregate to 438 tests.

## Limits and deferred work

No new verifier registry, model service, dependency, background purge, private data fixture or permission mechanism was added. Source role metadata and current-intent/advisory warnings are not an enforcement engine for a downstream model. Feedback history and immutable receipts consume disk; no storage cost reduction is claimed. Recent diagnostics remain windowed and do not claim a complete historical count merely because archive replay is available. Old receipts without an original reported-outcome field cannot recover information that was never recorded.

T8 lifecycle benchmark/oracle suite, T9 transport integration and complete transfer/2 remain deferred. Windows, live-controller integration, release and deployment were not run or claimed. The local commit is for independent review; no push is part of T7 worker scope.


## G7 acceptance

Independent review passed for 47bc23d without blocking findings. Source and tests plus terminal logs establish targeted18/18 and repeated full build/438 across20files. Nested historical disclosure and coded UTF-8 audit deferrals are closed. Documented legacy feedback replay and external-byte limits remain explicit; this gate does not claim T8/T9 or Windows/live integration completion.
