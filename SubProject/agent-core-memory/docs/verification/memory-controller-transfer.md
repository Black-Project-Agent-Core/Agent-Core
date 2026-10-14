# T9 controller continuation, transfer and portability evidence

Status: implementation and Linux/package verification complete; **G9 independent review passed, 2026-10-07 22:53 UTC**. [Machine-readable evidence](memory-controller-transfer.json).

## Scope and identity

- Base engine commit: `abbaa042cb2d010c969499c6a9e5f2eb1a25fcf4` on `feat/memory-evolution`.
- Synthetic dataset: `t9-controller-transfer-v1`; no personal data, external model calls, credentials, external-agent communication, local Windows work, deployment or release.
- Linux x86_64 (process local timezone Asia/Jakarta; evidence timestamps are UTC), Node `v24.19.0`, npm `11.9.0`; dependency lock SHA-256 `f6e124f787c9b5958bdb2bcd13a1076a8018be525b40c75458f4b0b65db03505` unchanged.
- `EXTRACTION-MANIFEST.json` SHA-256 `2984d9f03ab9ad7d736a97b910a56d90bfb5e2582aad8c3a6c47eb3cb67f3496` unchanged. New files are new standalone work, not retroactively attributed to the monolith.

## Initial submitted T9 assertions

Final targeted build plus 16 tests across three new files passed, terminal exit 0, in 19.27s. An earlier full Linux build + 470/470 run passed in 296.60s before the final adapter preflight regression. Final full-suite evidence follows below.

| Boundary | Evidence | Result |
|---|---|---|
| E29 protocol replay | Fresh B gets exact hard constraint, obligation, next action, old successful strategy and original why/how/reuse evidence using only the public dispatcher. Deliberately missing hard constraint fails the oracle. | PASS |
| E30 stale fallback | B opens current paged episode instead of using stale next action; current user correction survives. | PASS |
| E25 advisory/allowlist | Notice included; arbitrary method, unknown fields, root/scope injection rejected. | PASS, protocol only |
| E13 envelope budget | Actual final JSON bytes and codepoint/4 estimator checked at 512, 700, 1024, 8192 and 65536 bytes. | PASS |
| E23 transfer | Typed partial-date validity, prediction/uncertainty, timestamps, provenance and links restored exactly; transfer/1 compatibility remains covered by existing tests. | PASS |
| E28 completeness | 502 canonical records, more than eight old revisions, all authorized workspaces, retained archive evidence, retention operation replay, capsule/evidence and original bytes preserved. Every bundle entry compared byte-for-byte after restore. | PASS |
| Integrity | Damaged chunk, missing retained object, invalid path, collision and malformed live metadata rejected before activation. | PASS |
| Interrupted import | Partial copy stays unhealthy, exact bundle resumes, changed bundle and modified/extra retained destination bytes rejected; completed duplicate is idempotent. Unpublished matching temporary sibling cleanup tested. | PASS |
| Isolation | Active-root merge refused, unauthorized workspace export rejected, source cursors rejected at the new destination, cross-workspace expansion rejected. | PASS |
| E32 Linux | Case-sensitive Unicode paths, BOM/CRLF, rename, atomic replacement, retained evidence and source-lock contention. | PASS |
| E31 live distinction | No model or external controller invoked. | protocol replay PASS / live controller NOT RUN |
| E32 Windows | No authorized Windows environment was used. | NOT RUN |

Hardening had two intentional RED failures before repair: an extra retained destination note was accepted on replay, and malformed live metadata was accepted on export. A subsequent intentional RED reproduced a facade invocation at a too-small adapter budget; validated preflight now prevents undelivered exposure and unseen checkpoint publication. Existing domain persistence schemas are now reused internally, live-file links checked, all retained archive refs enumerated, and destination drift rejected. A separate envelope regression run already passed before a defensive typed-insufficiency cleanup; it is not claimed as RED evidence.

## Final Linux and package verification

The actual packed package installed offline with scripts disabled into a fresh temporary consumer. Named-package ESM import, protocol resume, isolated restore, duplicate replay, and strict TypeScript declaration consumption passed. Initial real archive: 298 files, 420748 compressed bytes, 2248907 unpacked bytes; runtime/test/archive/private environment-path scans were empty. A TypeScript7 CLI configuration-selection error (TS5112) was corrected with `--ignoreConfig`; declarations themselves passed. Final fresh Linux build + **471/471 tests on 25 files passed**, terminal exit 0, in **244.73s**; zero failed/pending/todo. T8 lifecycle13/13 is included. Its fixed warm lexical guard passed at 10/100/1000 records; at 1000 the median/p95 ratios were **0.4589 / 0.5020**, below unchanged 1.20 / 1.30 thresholds. These are this repeat’s measurements, not replacements for historical T8 results. Final documentation-only repack and dry-run contain 299 files; runtime/private-path boundary checks remain empty. Commands:

```sh
npm run build
npx vitest run tests/memory-controller-continuation.test.ts tests/memory-transfer-v2.test.ts tests/memory-portability.test.ts --reporter=default --reporter=json --outputFile=/tmp/T9-targeted.json
T8_REPORT=/tmp/T9-full-lifecycle.json npm run verify -- -- --reporter=default --reporter=json --outputFile=/tmp/T9-full-suite.json
npm pack --dry-run --json
# Also pack a real archive, install it in a fresh temporary consumer,
# import only agent-core-memory and run protocol/restore + declaration checks.
```

The T8 lifecycle suite is included in full verification. Historical T8 reports are not overwritten, and T9 does not claim that adding passing protocol tests upgrades a prior live-controller NOT RUN.

## Limits

Complete transfer is a trusted, host-authorized isolated restore, not a merge, automatic sync, encryption/authentication protocol, or new tenant identity. It retains logical sourceRootId and historical provenance. It verifies byte integrity, schema and referential linkage, not truth or semantic entailment. The chunked representation is assembled in memory; it has no 500-record truncation but is not a streaming transport. Derived indexes/embedding repair work, transaction journals and prior transfer receipts are excluded. Host workspace registration and live workspace files are not copied.

Knowledge-only export remains explicitly incomplete and cannot enter the complete restore path. Existing unreadable or unsupported source data causes failure; transfer does not reconstruct lost historical objects. The deterministic interruption fixture tests mid-copy abort and replay, plus an abandoned unpublished temporary sibling; it does not claim a separate T9 OS-kill at every instruction boundary. Existing Linux transaction/process-kill tests remain part of the full suite.

Live autonomous controller A→B and separate Windows execution are **NOT RUN**. Full cross-controller/Windows-supported claims require those additional independent executions. See [integration contract](../controller-integration.md).

## G9 review round 1

Independent review of `913501b` found two P1 inspection gaps that the initial passing suite did not cover: rotated retained telemetry could bypass workspace authorization, and a checksum-valid episode snapshot could disagree with its retained event reduction yet activate as complete. The initial results above remain historical evidence for their tested boundaries; they did not establish these missing invariants.

The correction reuses domain-owned telemetry envelope/payload parsers for recent and retained rows, enumerates exact workspaces and requires explicit unscoped authorization, and resolves feedback subjects through retained canonical provenance. The episode reader and transfer now share one pure consistency validator rather than maintaining weaker duplicate rules. Every retained episode snapshot, including an unselected historical snapshot, is checked before destination staging.

Initial regression RED: 11 failures and two passing controls, exit 1. Added coverage includes recent/rotated attempts and use receipts, scoped/unscoped authorization and exact workspace reporting, a retained receipt checked independently of an authorized attempt, envelope checksums, opaque JSON-shaped evidence text, checksum-valid state/order/count/header corruption, ten valid historical updates, and rejection without changing an interrupted destination. Final correction build + **489/489 tests on 26 files passed**, terminal exit 0, in **246.14s**; zero failed/pending/todo. Targeted **34/34** on four files passed in **20.45s**. Both original reviewer probes now reject as expected. The fixed T8 1000-record median/p95 ratios remained PASS at **0.4523 / 0.4512**, with thresholds unchanged. A final 299-file package passed fresh offline public-import/resume/restore/replay, rotated-workspace denial and declaration consumers; forbidden runtime/private-path scans were empty. G9 independent re-review remains pending.

A follow-on selected RED (one failure, 17 tests intentionally not selected) also reproduced a corrupt purpose label skipping a known telemetry file. Domain-owned filename recognition closes that classification escape. The intermediate correction full488 run is preserved separately; the final full489 run includes this last regression.


## G9 acceptance

Scoped re-review of af05398 passed, closing both telemetry workspace and episode integrity findings. Verified terminal 489/34 tests, source hashes, package/consumer299files and original negative probes. Whole-branch final review remains separate; live controller and Windows execution remain NOT RUN.
