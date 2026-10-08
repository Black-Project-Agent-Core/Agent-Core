# SIE / ASI offline report implementation — 2026-09-23

**Scope:** user-approved SIE-P6/P7 and ASI-P1/P2/P3. Implementation is present; final candidate/integrity/memory readback is recorded below. SIE-P1–P5 remains the previously installed capability, not reopened work.

## Implemented owners

| Proposal | Native implementation | Boundary |
| --- | --- | --- |
| SIE-P6 | `scripts/learning/report-bundle.mjs`, `verify-report-bundle.mjs`; modified `evaluate-retrieval.mjs` and `report-io.mjs` | Completion marker is written last and reread; exact members/digests/identities and scorer/verifier recomputation are checked. Complete failed evaluation is distinct from incomplete/invalid evidence. |
| SIE-P7 | Shared `reportIdentity` / `generatedClaim` in `report-bundle.mjs` | Full domain-separated ID binds inputs, evaluator/verifier revisions and six implementation hashes. Title/content/candidateId distinguish reports; exact reruns preserve the first Memory audit pointer. Generic Memory deduplication is unchanged. |
| ASI-P1 | `src/learning/retrieval-profile.ts` | Derives retained/regressed/improved/still-missed from verified raw artifacts. Count conservation, aggregate difference and baseline-regression denominator are checked. |
| ASI-P2 | `src/learning/retrieval-series.ts` | Explicit protocol/splits, every supplied attempt, sourced resources, optional budget overruns, comparable groups and qualified seed dispersion. No experiment launch. |
| ASI-P3 | `src/learning/retrieval-portfolio.ts` | Deterministic union-coverage redundancy reduction; unique specialists retained, all-candidate misses uncovered. Not pairwise Pareto dominance or deployment selection. |
| Shared consumer | `scripts/learning/analyze-retrieval.mjs` | Explicit `--profile`, `--series` or `--frontier`; exclusive sidecar output, no original report rewrite or automatic Memory capture. |

No MemoryService, generic sink predicate, scoring-v1 envelope, verifier-v1 contract, MCP action/schema, provider configuration or product version was changed. The root offline evaluator scripts are updated; this is not a claim that every on-demand script is unchanged. New ASI compiled programs are staged in the isolated candidate, not copied into active root `dist`.

## Report integrity and identity

A passing bundle contains six artifacts plus `report-manifest.json`; a failed but complete evaluation contains five artifacts plus the marker and no review candidate. Every member is exclusive-written and synced. Marker publication follows member readback, and producer success follows explicit bundle replay. Interrupted artifacts are retained; there is no overwrite, retry loop, unrelated cleanup or production synthetic claim.

The marker is bounded to 32 KiB; ordinary artifacts are bounded to 8 MiB. Member names are an exact allowlist. Symlink/nonregular objects, additional/missing members, changed bytes, forged scores even with recomputed member hashes, and inconsistent binding are rejected. Marker absence returns `legacy-unsealed`, which does not distinguish an old report from an interrupted unsealed report and does not upgrade either. Hash/replay consistency is not authenticity, causal attribution or statistical significance. No stronger power-loss guarantee is asserted.

Report identity includes raw input digest, evaluator revision, verifier revision, and hashes for controlled-outcome, retrieval-evaluation, retrieval-verifier, evaluate-retrieval, report-io and report-bundle. Output directory, timestamp and random fixture names are excluded. Historical implementation hashes may differ from current code; the reader reports that fact instead of inventing authentication. Default candidates remain `verified:false`.

## Profile and comparison contract

Profiles retain complete validated case bits internally, while public sidecars contain safe IDs/counts, default 100 IDs per transition (maximum selectable helper limit 1,000), omitted counts and full sorted-list digests. There are at most 10,000 queries. A zero baseline-success denominator yields `null`, not zero regression. Full raw prompts, expected/result bodies and memory text are not emitted by the analysis summary.

Comparability binds exact cohort digest, corpus, topK, baseline revision AND baseline ranked-result digest, evaluator/verifier revisions and sorted implementation hashes. Candidate revision/experiment may vary. Incomparable series are separated; a frontier refuses mixed groups rather than silently selecting a subset.

## Explicit run manifest

The manifest has schemaVersion 1, one `protocol` and 1–100 `runs`. Protocol fields are `id`, nonoverlapping unique `splits.train`, `splits.validation`, `splits.holdout` query-ID arrays, and `trainingExposure` (`not-established` or `operator-attested-disjoint`, with evidence references required for the latter). An evaluable row's entire query set must match its named validation/holdout split. Training exposure is never inferred from a split label.

Run fields: `id`, nonnegative integer `iteration`, `checkpoint`, and declared `status` (`attempted`, `invalid`, `failed`, `incomplete`, `evaluable`); optional `report`, `split`, `seed`, `independentSeed`, `seedEvidenceRefs`, `resources`, `cumulativeResources`, and `humanModalities`. Report paths resolve relative to the manifest. Actual bundle status is recorded separately from declared status. Missing/unreadable/incomplete/failed inputs remain visible. Duplicate report identities are refused. The supplied attempt list is not proven exhaustive.

Each resource entry is `{dimension,value,evidenceRefs}` with nonnegative finite measured value and at least one bounded evidence pointer. Count/token/byte values are safe integers. Dimensions: `task.wallMs`, `task.toolCalls`, `task.inputTokens`, `task.outputTokens`, corresponding `evaluator.*` dimensions, `human.interventions`, `disk.bytes`, `writes.bytes`. Missing entries stay `null`. Human modalities are labeling, approval, correction, intervention or other; absence remains unknown. No dollar conversion, private trace import, billing lookup or production tracker access occurs.

Optional `budgets` has `basis` (`per-run` or `cumulative`) and `limits` by resource dimension. The report annotates observed overruns only; absent measurements do not establish compliance. Cumulative counters and iterations cannot decrease within a seed stream. Dispersion is computed only for distinct explicitly attested independent seeds at the same checkpoint/iteration/candidate within one comparable group. The output identifies that attestation basis and does not establish statistical significance or authenticate independence.

Two distinct evaluable reports produce a trajectory; one produces `single-checkpoint`; none produces `no-evaluable-checkpoint`. Every supplied row remains in the report. Frontier mode requires every supplied report to be evaluable and mutually comparable. At most 100 candidates × 10,000 queries are accepted before coverage-matrix construction. Shortlist output retains all input identities and excluded candidates, bounded per-query reasons, complete-list digests and uncovered cases.

## Explicit commands and staging

Candidate root: `runtime/build/sie-asi-20260923/`. It contains the selected strict TypeScript build, a small copy of the offline CLI scripts and a private ESM package marker; no dependency tree or full installed runtime copy. Project-local Node and existing TypeScript/Vitest are reused. Python stdlib is used only for pinned GEPA comparison. No helper installation was required.

From the project root, use project-local `runtime/node/node.exe` with these candidate scripts:

- `runtime/build/sie-asi-20260923/scripts/learning/evaluate-retrieval.mjs --cohort FILE --observations FILE --output NEW_DIRECTORY`
- `runtime/build/sie-asi-20260923/scripts/learning/verify-report-bundle.mjs --report DIRECTORY`
- `runtime/build/sie-asi-20260923/scripts/learning/analyze-retrieval.mjs --profile DIRECTORY --output NEW_FILE`
- `runtime/build/sie-asi-20260923/scripts/learning/analyze-retrieval.mjs --series MANIFEST --output NEW_FILE`
- `runtime/build/sie-asi-20260923/scripts/learning/analyze-retrieval.mjs --frontier MANIFEST --output NEW_FILE`

Exactly one analysis mode is permitted. All help paths are read-only. Bundle verification exits 0 for complete eligible evidence, 1 for complete failed or legacy-unsealed evidence, and 2 for invalid/I/O failure. Analysis writes only a new sidecar and exits 2 on invalid requests; a series containing explicitly reported failures can still be a successfully generated report. There is no automatic claim approval/capture.

## Verification and evidence

**IMPLEMENTED — SOURCE AND ISOLATED CANDIDATE VERIFIED.**

| Stage | Result | Evidence in `runtime/tmp/sie-asi-implementation-20260923/` |
| --- | --- | --- |
| Selected pre-change baseline | 57 passed, 0 failed | `baseline-tests.log` |
| SIE red controls | 16 failed / 2 passed before implementation; real title collision reproduced | `sie-red.log` |
| ASI and analysis CLI red controls | Missing selected modules/CLI reproduced before their implementation | `asi-red.log`, `analysis-cli-red.log` |
| Final source stage | 123 passed, 0 failed, 0 skipped, ten files | `source-selected.json`, `source-selected.log` |
| Final candidate stage | Same 123 passed, 0 failed, 0 skipped, ten files | `candidate-selected.json`, `candidate-selected.log` |
| Selected strict compilation | Exit 0; empty diagnostics log; 12 JS + 12 maps | `candidate-compile.log`, candidate `tsconfig.json` |
| Pinned GEPA comparison | 39/39 matching fixtures, zero coverage loss | `gepa-comparison.json`, fixture and comparison helpers |
| Pre-memory-sync integrity | 1,521 active-dist files unchanged; 97 reference files unchanged; 12 canonical notes unchanged | `implementation-integrity.json` |

Source-stage tests load source modules and candidate CLI. Candidate-stage tests load the three new ASI modules from compiled output and the same candidate CLI; unchanged legacy owners stay in the isolated existing regression fixtures. These are 123 unique selected cases rerun, not 246 distinct tests, a full-root build, whole-project suite or installed-runtime acceptance. Existing missing-source-map warnings for `dist/memory/note-format.js` and `dist/net/outbound-request.js` remain; they are not new failures or silently repaired.

Real isolated MemoryService tests verify distinct reports are captured, exact reruns deduplicate without rewriting original bytes/audit pointers, and legacy same-title behavior is preserved. Faults include partial ENOSPC writes, truncated/oversized marker, member substitution/removal, traversal, nonregular member, and forged score with updated hashes. A child-only filesystem shim checks a reported symlink identity; host symlink creation is not claimed. No disk was deliberately filled.

Grafel reported current but returned no `deriveRetrievalProfile` entity, so source imports and exact owner boundaries were reviewed directly. Hermes is `HERMES_HOME_NOT_FOUND`; execution was inline, not an independent partner review. The initial Python-inherited-stdin test runner produced no output and was stopped; direct runner evidence supersedes it. No unsupported PASS was inferred from that empty log.

## Canonical continuity and rollback boundary

Canonical implementation memory: `cad67ec4-a591-4a93-9b28-8e4bb8899a65`; historical audit memory: `c5bf2c4d-2f80-4a4d-b070-f3ec6b9a9bcd`. The audit record keeps its source census/history while noting the subsequent approval and verified implementation. The two plan closures and `docs/CODEBASE.md` carry the same source/candidate versus installed distinction. Final native memory readback and document/source checks are stored in `docs-memory-readback.json`; the immutable pre-sync integrity result remains separate from these explicitly authorized memory mutations.

Backup root: `runtime/backups/sie-asi-implementation-20260923/`. One pending patch intent: `.changeset/20260923-sie-asi-offline-reports.md`; product remains 0.12.0. Rollback is scoped to the changed offline scripts/new selected modules and their documentation/tests, using the preserved baseline; do not reset unrelated Git work or delete immutable evidence. The active runtime was not replaced. Both reference folders were retained at this implementation checkpoint. The later user-authorized census retired only SIE and retained Awesome for a new unselected proposal; see `docs/SIE-ASI-Reference-Retirement-Audit-20260923.md`. This later retention decision does not change the implementation evidence above.

Git/history gaps, missing Hermes home, C#/PowerShell readiness issues and old source-map warnings remain unrelated residuals. No production benchmark, actual quality gain, training, autonomous optimizer, model call, release or restart is asserted.
