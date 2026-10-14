# SIE Selected Adoption — Execution Result — 2026-09-23

**Current status: COMPLETE — SIE-P4/P1/P3 LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.**

The implementation-stage evidence below is preserved as history. Subsequent authorized installation/restart and live checks are documented in `docs/SIE-Activation-20260923.md`.

Selected plan: `docs/Self-Improving-Agent-Ecosystem-Steal-Use-Integration-Plan.md`.
The user approved implementation. The plan's current-fit selections P4, P1 and P3 were executed. P2 and P5 still lack their required named verification producer / controlled-experiment consumer and were not implemented. No substitute consumer was invented.

## Implemented behavior

| Selection | Implemented result |
| --- | --- |
| SIE-P4 | Pure aggregate review summary distinguishes no-new-knowledge, captured, duplicates-only, awaiting-verification, partial and incomplete. Counts for all six existing individual outcomes are preserved. The old nothingWorthSaving field remains capture-count-only and is explicitly deprecated. |
| SIE-P1 | A shared strict Zod evaluation schema validates optional declared evidence in direct coordinator and MCP entry paths. Correctness, rank objective and explicit attribution failure are checked before verified sink capture. Unverified candidates remain proposals. |
| SIE-P3 | Per-review candidate identity, workspace namespace and normalized claim fingerprints feed bounded decision events in the existing ActivityTracker. Explicit auditRef uses the existing Memory source.ref; the legacy fallback remains unchanged. |

Evaluation validates structure, bounds, safe metadata, timestamps and digest syntax. It does not fetch artifacts, check artifact hashes, prove freshness, authenticate an evaluator, or run an independent verifier. Its explicit trust label is `evidenceValidation: declared`.

Correction relations are returned and recorded as declarations only after a new claim is captured. Each bounded correction event identifies the target and labels `targetExistence: not-checked`. Rejection, proposal, duplicate and failed capture do not issue correction declarations. No old Memory/Pattern record is edited or deleted. Tracker errors do not repeat capture, and its persistence remains best-effort.

## Exact source scope

Modified: `src/learning/types.ts`, `review.ts`, `service.ts`, `memory-sink.ts`, and `src/mcp/learning-schemas.ts`.
Added: `src/learning/review-summary.ts`, `evaluation.ts`, and `decision-evidence.ts`.
Added tests: `tests/learning-review-summary.test.ts`, `learning-evaluation.test.ts`, `learning-decision-evidence.test.ts`.

MemoryService, sink selection, Grafel payloads, trigger reset semantics, tracker persistence/recovery, HTTP routes, MCP registration and production binaries are unchanged. There is no new MCP tool/action, policy layer, candidate registry, scheduler, database, Python/AVO runtime, or autonomous verifier.

## Verification

Final source and compiled executions each run the same 68 cases across three files: **68 PASS / 0 FAIL / 0 SKIP**. These are not 136 unique tests.

Behavioral RED evidence is retained: P4 had 9 failures; P1 had 35 failures and one legacy pass; P3 had 15 failures and one legacy pass. Two review corrections each received an additional failing test before their fix: one-character evidence identifiers and explicit correction targets. Loader/tool failures are not counted as behavioral RED.

The tests include real coordinator/sink-manager behavior, real isolated MemoryService persistence, duplicate byte preservation, zero capture on invalid evidence, bounded maximum-size telemetry, and tracker failure. The real SDK client/server round-trip exercises the existing learning registration over paired in-process transports; it is not a production endpoint activation test. Temporary memory and tracker paths are isolated from production.

Schema comparison against installed baseline confirms exactly four optional candidate additions: candidateId, auditRef, corrections and evaluation. All old candidate field contracts, required fields, top-level request fields and five action values are preserved. This is scoped learning compatibility evidence, not a new full-server 62-tool acceptance claim.

## Compilation limitation — explicit

Existing project-local TypeScript 6.0.3 emitted the eight selected modules and their maps. The selected dependency graph still reports **29 diagnostics**, exactly matching the backed-up pre-change source under the same compiler/resolution configuration; **zero additional diagnostics** were introduced. The original diagnostic output and multiset comparison are preserved in compilation-first.json and compilation.json.

Missing pre-existing source, including memory/safety.ts and learning/state.ts, resolves to surviving installed JavaScript for this scoped check. JavaScript dependencies have allowJs enabled and checkJs disabled. These dependency/type-recovery gaps were not repaired or concealed with production stubs. This is a differential check plus behavioral qualification, NOT a clean strict compilation of the whole root.

Candidate location: `runtime/build/native-sie-20260923/dist/`.
The runtime closure has 23 JavaScript modules: eight selected modules and 15 byte-identical installed dependencies. Seven selected JavaScript programs differ; the type-only module remains byte-identical. The compiled test run also uses unchanged installed MemoryService for its real isolated persistence fixture; provenance records the actual loaded files.

The existing release compatibility script depends on current-line Git and loads installed dist; it is not used to certify this unactivated candidate. release-plan.mjs and check-release-intent.mjs are currently absent. No release-tool recovery or release operation was performed. Product remains 0.12.0; one patch intent records this task.

## Continuity and boundaries

Plan, CODEBASE and the canonical SIE record `2820c59d-9e92-41c5-821a-31da35c8837a` track implementation and candidate qualification, not live activation. The earlier audit findings remain historical evidence. Third-party notices retain the SIE MIT attribution at reference revision f06504750b32c3b6a6e06b56ee6e69dc4476f333.

Scoped backup: `runtime/backups/sie-implementation-20260923/`.
Evidence: `runtime/tmp/sie-implementation-20260923/` including baseline.json, source-qualified.json, compiled-qualified.json, their exit reports, source/compiled provenance, compilation.json, candidate-closure.json, structural-review.json, final-integrity.json and docs-memory-readback.json.

**CLOSED: subsequent user-authorized installation, restart and installed-runtime readback completed.** 14/14 artifact hashes match, 321/321 preserved artifacts are unchanged, installed-dist tests pass the same 68 cases, and live HTTP MCP checks pass 10/10. Core PID 5196 began after installation. No further user restart is needed. See `docs/SIE-Activation-20260923.md` and `runtime/tmp/sie-activation-20260923/`. P2/P5 and unrelated repair limitations remain separate.
