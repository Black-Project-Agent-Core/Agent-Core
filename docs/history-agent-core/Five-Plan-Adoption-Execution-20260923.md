# Five-Plan Adoption Execution — 2026-09-23

> **Status:** QUALIFICATION COMPLETE — LIVE ACTIVATION CLOSED 2026-09-24. Historical source/candidate evidence below is preserved; current installed-runtime closure is `docs/Six-Plan-Activation-20260924.md`.
> **Product version:** 0.12.0 unchanged.
> **Release intent:** `.changeset/20260923-five-plan-adoption.md` pending; no `release:apply`.

## Approved scope

The user selected the remaining proposal scope from five plans:
- Awesome ASI-P4 — explicit acceptance/stopping protocol evidence.
- Shiploop SL-P1 — read-only instruction context-footprint report.
- SecondSight SS-P1/SS-P2 — correlated machine-control invocation boundaries and explicit snapshot completeness report.
- Serena S7-P1 — preserve valid startup readiness evidence across initialize.
- Reef RF-P1 — terminal LSP transport failure latching plus transport-generation fencing.

Earlier ASI-P1/P2/P3 and Serena S4/S5/S6 are not reopened. Full Shiploop/SecondSight/Reef runtimes are not installed. SecondSight source/tests/prompts were not copied because the local checkout does not establish a reuse license grant.

## Implemented ownership

| Owner | Implemented behavior |
| --- | --- |
| `src/learning/retrieval-series.ts` | Optional versioned acceptance criteria/stopping rules plus observed stop evidence; compliance remains `not-established`. |
| `scripts/inspect/context-footprint.mjs` | Bounded identity-safe read-only Markdown/block footprint report; exact bytes/digests; no mutation/trimming. |
| `src/tracker/tool-invocation.ts`, `src/mcp/server.ts` | Opaque invocation ID + process-session ID; start and exactly-once terminal evidence; fail-soft tracker semantics. |
| `scripts/inspect/operation-completeness.mjs` | Explicit snapshot assembler keyed by exact invocation/process IDs; orphan/legacy/ambiguous evidence remains explicit. |
| `src/semantic-ide/language-server.ts` | Early valid readiness is not overwritten by initialize continuation; real later indexing/fatal/capability states still win. |
| `src/semantic-ide/protocol.ts`, `src/semantic-ide/service.ts` | Per-transport generation, first terminal failure latch, pending settlement, stale-callback fencing, and existing one-replacement recovery now includes pipe failure. |
## Verification evidence

- Final targeted source matrix: **70/70 PASS, 0 fail, 0 pending**, persisted at `runtime/tmp/five-plan-adoption-20260923/targeted-tests.json`.
- Selected TypeScript closure: exit 0, zero diagnostics using `runtime/tmp/five-plan-adoption-20260923/tsconfig.selected.json`.
- Isolated candidate: `runtime/build/five-plan-adoption-20260923/dist/`, 345 emitted dependency-closure files / 2,494,684 bytes; compile exit 0.
- Candidate smoke: ASI-P4 `declared`; RF-P1 terminal failure latched; S7-P1 early readiness `ready`; SS-P1 emitted two correlated boundary events.
- SL-P1 CLI smoke inspected `AGENTS.md`: 34,573 bytes / 75 blocks; input SHA-256 unchanged; `sourceMutated:false`.
- SS-P2 CLI smoke returned `success, terminal-unobserved` for the explicit synthetic snapshot, correctly leaving `fullyPaired:false`.
- MCP public manifest/schema regressions remain green; no public MCP tool or input schema was added.
- Five reference checkouts remain Git-clean at their pinned revisions: Shiploop `a238ad8...`, SecondSight `3f05d3f6...`, Serena `9f19a79a...`, Reef `5ffac29a...`, Awesome `99ce3979...`.

Compact evidence: `runtime/tmp/five-plan-adoption-20260923/verification-summary.json`.

## Real-provider boundary

A candidate-service check used already-installed providers without replacing active `dist`:
- C#: source/candidate call still fails with `SEMANTIC_IDE_LSP_TIMEOUT: initialize`.
- PowerShell: symbol overview succeeds (5 results), but readiness remains `degraded` with `SEMANTIC_PROVIDER_READINESS_TIMEOUT`.
- Candidate health therefore remains degraded with two provider issues.

This proves S7-P1 fixes the source-derived early-signal overwrite case but does **not** close the older managed-provider readiness/initialize residuals. No timeout-as-success fallback, provider reinstall, implicit restore, or unrelated repair was added.

## Known separate installed-dist boundary

`tests/learning-retrieval-analysis-cli.test.ts` was separately probed and returned 2 pass / 3 fail with `ERR_MODULE_NOT_FOUND`. This is the previously documented ASI activation boundary: active `dist/learning/retrieval-profile.js`, `retrieval-series.js`, and `retrieval-portfolio.js` are absent. The current source ASI-P4 series tests pass; this wave does not silently activate earlier ASI-P1/P2/P3 candidate modules.
## Activation and integrity boundary

Active runtime files were compared with candidate outputs after verification:
- active `dist/learning/retrieval-series.js` is absent;
- active `dist/tracker/tool-invocation.js` is absent;
- active `dist/mcp/server.js`, `dist/semantic-ide/protocol.js`, `language-server.js`, and `service.js` have hashes different from the new candidate.

At the end of this 2026-09-23 qualification task, the running Node Core had **not** loaded this wave. No selected candidate file had yet been copied into active `dist`; that historical boundary is superseded by `docs/Six-Plan-Activation-20260924.md`. No release apply, version bump, commit, push, publish, or deployment was performed by the qualification task.

No dependency/tool installation was necessary; existing project-local Node, TypeScript and Vitest were sufficient.

Grafel reported its provider index `current` but did not locate the two new entities (`beginToolInvocationEvidence`, `isRecoverableSemanticTransportError`). Exact source/import/callsite scans therefore supplied the structural review. Production consumers remain narrow: `src/mcp/server.ts` is the sole native caller of the invocation helper; `SemanticIdeService.withRecovery` is the sole native recovery-classification caller; `LanguageServerSession` remains the production owner of `LspConnection`.

## Rollback / continuity

Pre-edit backups for the initially selected existing files are under `runtime/backups/five-plan-adoption-20260923/`. Implementation evidence and execution ledger are under `runtime/tmp/five-plan-adoption-20260923/`.

Rollback is surgical: remove the two inspection CLIs and invocation helper, restore the changed learning/MCP/Semantic IDE source plus focused tests/fixtures, and remove only this wave's pending changeset. Do not revert prior S4/S5/S6, SIE/ASI work, provider packages, canonical memory, or unrelated user changes.

Historical task-end result was source/candidate completion only. The later explicit cutover/restart is now complete and independently verified in `docs/Six-Plan-Activation-20260924.md`; this file retains the original qualification evidence.