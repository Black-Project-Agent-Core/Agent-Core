# Residual adoption execution — 2026-09-22

**Historical checkpoint: PARTIAL - NATIVE VERIFIED; OLD G29 MCP ACCEPTANCE FAILED - NOT ACTIVATED.**

> Superseded for the current candidate by docs/Wave7-Adoption-Execution-20260922.md. The later approved follow-up reproduced and corrected the incremental-path omission; new candidate-only cold/warm MCP checks pass 24/24. The unchanged original baseline-and-candidate matrix is 23/24 because the old baseline still fails emitted-extension resolution. Production activation remains pending. The historical numbers and evidence below are preserved unchanged.
The user approved PY6-P1, TS6-P1, G29 and S5-P1 from the four existing residual plans and authorized necessary project-local helpers. This record covers actual implementation, targeted execution and candidate qualification, not a full-root rebuild, release or production activation.

## Implemented scope

| Selection | Actual implementation |
| --- | --- |
| PY6-P1 | `workspace-policy.ts` reports complete/ioIssueCount/bounded safe issues; `freshness.ts` never derives deletion from incomplete coverage and advances only delivered event stamps. Git stderr warnings make successful listings incomplete; stream close is awaited before judging coverage. |
| TS6-P1 | `code-intelligence/service.ts` owns pending health by instance/generation, separates collect/commit, centralizes invalidation and prevents late completion after close. Public signature, TTL and G28 graph truth remain intact. |
| S5-P1 | New `diagnostic-payload.ts` validates required shape; publication/pull/direct consumers accept valid reports only. Malformed input preserves stale evidence and cannot establish resolved errors/complete comparison. Valid empty arrays remain supported. |
| G29 | Exactly two selected provider production files, `internal/external/synth.go` and `synth_named_imports.go`, plus the attributed upstream matrix test. New staging derives from qualified G26/G27 source, not upstream HEAD wholesale. |

Five existing native modules changed and one validator was added. Three new regression files contain 51 tests. Existing source-safety tests now explicitly SKIP unavailable host symlinks instead of silently passing; no production source-safety implementation was weakened.

## Executed verification

| Evidence | Observed result |
| --- | --- |
| PY6 behavioral RED | 13 failed / 1 passed before implementation; the later Git-warning case separately failed before correction. |
| TS6 behavioral RED | 7 failed / 2 passed, including duplicated provider reads and stale completion races. |
| S5 behavioral RED | 20 failed / 7 passed, including published-null becoming fresh empty. |
| Final native source, eight selected files | 94 cases: 92 PASS, 0 FAIL, 2 explicit host SKIP. |
| Final qualified compiled candidate, same eight files | 94 cases: 92 PASS, 0 FAIL, 2 explicit host SKIP, with loaded-module hash provenance. These are the same cases, not another 94 distinct tests. |
| Targeted TypeScript 6.0.3 strict compilation | Zero diagnostics; 27-module emitted closure. Exactly six qualified modules differ from installed runtime, with 21 byte-identical dependencies. |
| G29 behavioral RED | Four relevant subcases and their parent failed on the qualified G26/G27 baseline, not because of compile/link errors. |
| Entire provider external-synthesis package | 214 top-level tests passed; 5,656 passing test/subtest outcome events, 38 existing skipped subcases, zero failures. |
| Selected G26/G27 compatibility, eight packages | 47 top-level passed; 200 passing outcome events; one host-symlink skip, zero failures. |
| Isolated actual MCP comparison | Current/candidate expose 22 tools with exact input-schema parity. Twenty overlapping real health reads share one runtime.status chain per instance. |
| Actual graph entity/edge comparison | FINAL settled run: 18 PASS / 6 FAIL out of 24 checks. Earlier snapshots passed while indexing; they do not establish final acceptance. G29 remains blocked at MCP behavioral acceptance. |
| Integrity | Eight snapshotted active artifact hashes unchanged; original 8,535-file G26/G27 stage unchanged; G29 production delta exactly two files. |

Strict compilation initially emitted only an additional reconstruction comment in two unrelated security dependencies. Exact comparison established comment-only differences; their candidate bytes/maps were copied from installed runtime without changing production. Fresh compiled tests and final hashes were then rerun. Original emitted differences remain in `compiler-comment-only-deltas/`.

## Candidate artifacts and provenance

Native candidate: `runtime/build/native-residual-adoption-20260922/dist/`.
Provider candidate: `runtime/build/grafel-g29-20260922/grafel-g29-candidate.exe`.
Provider SHA-256: `ccd6dcd9e8e63235db0c761f91addba7c92e11f449d7a9afbf8a7481a2497f7f` (110,091,264 bytes).
Provider version identifier: `v0.3.3-agentcore-g26g27g29-candidate`.
Active provider remains SHA-256 `087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94`.

G29 selectively adapts upstream commit `a4cd9f80465c622bfac0da075a389b8044169ffe`; original license tree and source/test attribution remain in the stage. Existing G26/G27 implementation is preserved except the selected two-file production delta in the new stage. All four reference checkouts were retained, not modified or deleted.
Existing project-local Node, TypeScript, Go 1.26, GCC 16 and the previously qualified private Go linker timestamp helper were sufficient. No new global or project package installation was needed. Temporary/home/cache paths stayed project-local.

## Explicit limitations and deferred work

An independent Windows Node 24.21.0 probe rejects file-symlink creation with EISDIR even for a verified regular-file source and absent destination. Two native cases and the existing Go symlink case remain unverified, not PASS. No filesystem type or permission repair is inferred. External package skips are also counted separately.
Cold fixture registration exposed an existing bootstrap ordering problem: the registration-changed path requests an index before starting the daemon. Baseline and candidate attempts recorded the error. Qualification explicitly prepared only isolated fixture daemons/registrations; production startup was not changed. Successful index CLI return preceded actual graph availability, so bounded graph-readiness polling preceded assertions.
Both graphs still contain an orphan external `components` package node, but no candidate guarded-alias IMPORTS/CALLS edge resolves to it. The false named Button external entity is removed; this is not universal orphan-node cleanup. Conservative dotted/legacy names and unindexed internal-root ambiguity remain. Fixture results are not a universal resolver or whole-workspace accuracy benchmark. Health can remain indexing/degraded during watcher catch-up rather than falsely available.
Hermes reports HERMES_HOME_NOT_FOUND; no independent partner review is claimed. The lead reviewed the exact source delta and evidence directly. Pre-existing whole-root source/Git/release damage and managed LSP issues remain separate.

Production activation is not performed. G29.7 separates rollback-backed installation/live readback from isolated qualification. Active dist, provider binary/metadata, launcher, OAuth and product version were not replaced. No release apply, publication, broad repair or production reindex occurred. Source/candidate completion must not be labeled live runtime completion.

## Documentation, memory and release metadata

The four existing plans and `docs/CODEBASE.md` carry the same current outcome. Canonical task memory is updated in-place at `163fc8f2-9be1-4956-bcaa-7c7a6537fb35`; mutation history preserves the prior audit-only revision. The six earlier live selections remain closed in memory `71ca3311-98ac-4f70-8b95-4c6da22f4788`, not counted again.
Patch intent: `.changeset/20260922-residual-adoption-truth-boundaries.md`. Four pending filesystem intents aggregate to planned 0.13.0; actual version remains 0.12.0. Missing release tooling is not repaired by writing an intent.
Evidence bundle: `runtime/tmp/residual-adoption-20260922/`. Scoped backups: `runtime/backups/residual-adoption-20260922/`.
Primary records: `execution-summary.json`, `native-source-accepted.json`, `native-compiled-byte-parity.json`, `compiled-native-provenance-final.json`, `native-qualification.json`, `g29-external-summary.json`, `g29-compat-summary.json`, `g29-build-result.json`, `g29-mcp-final-qualification.json`, `g29-graph-decisions.json`, `symlink-host-probe.json`, `final-integrity.json`, and `g29-qualified-manifest.json`.
Failed preliminary attempts remain recorded; they are not relabeled successful qualification. Final documentation/memory readback is recorded in `documentation-memory-readback.json` after the canonical update.

## Final acceptance exception and encoding verification

Final settled MCP acceptance supersedes preliminary passing snapshots: 18/24 graph checks PASS and 6 FAIL. Four failed checks concern the two npm-subpath IMPORTS edges; two concern ./canonical.js resolution in both baseline and candidate. The baseline/candidate health is available/current and the 22 tool schemas match, but that does not prove graph edge correctness. Root cause is not established. G29 is not accepted or activation-ready; no production installation occurred.

The final encoding audit rebuilt the exact selected UTF-8 source delta from the original stage and patch, correcting an unintended CP1252 round-trip in two staging files. Both full external and selected compatibility suites were rerun with identical passing/skip counts; the freshly rebuilt binary SHA-256 is unchanged. New final Go evidence is g29-external-utf8-summary.json and g29-compat-utf8-summary.json; encoding evidence is g29-encoding-correction.json. Native production files contain no non-ASCII bytes and were unchanged during this correction.

Final MCP evidence: g29-mcp-settled-qualification.json; semantic verdict: g29-graph-decisions.json. The last run required a stable current index before sampling, unlike preliminary graph-presence checks. No retry result is relabeled PASS. Native PY6/TS6/S5 remain verified with two explicit host skips; G29.6 remains open, and G29.7 activation was not attempted.
