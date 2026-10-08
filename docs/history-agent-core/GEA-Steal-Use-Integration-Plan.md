# GEA - Source-grounded Steal / Use Plan

> **Status:** COMPLETE FOR APPROVED CLI SCOPE - TARGETED/COMPILED QUALIFIED
> **Grounded:** 2026-09-29
> **Inspected location:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/GEA`
> **Current reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/GEA`
> **Revision:** `d185edffd1f9fbd2297f4de8c6c9f94547448b6d`; branch `main`; clean at initial inspection.
> **Origin:** `https://github.com/UCSB-AI/GEA.git`
> **Licence evidence:** Root Apache-2.0; benchmark/vendor material remains separately scoped.

**For agentic workers:** After explicit selection, use the executing-plans workflow; these proposals do not authorize implementation or verification by themselves.

**Goal:** Expose task-level behavioral diversity from verified retrieval profiles through a new explicit offline novelty report.
**Architecture:** Extend the existing Learning analysis CLI and strict series schema; reuse native profile comparison and numeric provenance, without installing GEA or selecting/evolving agents.
**Spec:** This plan defines the proposed scope; shared boundaries are in `Fourteen-Reference-Steal-Use-Review-20260929.md`.

## Inspection and confidence boundary

Available-file inventory: **444 files / 20,403,077 bytes**; **35 Python files** statically parsed and **112 other code files** indexed lexically. Hashes identify available bytes; they are not passing tests. Selected method bodies and selected assertions were read, not every branch, example or transitive dependency. No donor import, training, model call, test suite or build was run.
Excluded paths and empty submodules are recorded in the inventory. No credential values, environment-file content or private runtime data are used as semantic adoption evidence. Paper/README claims and remote links are leads, not independently checked results.
Evidence root: `runtime/tmp/fourteen-reference-grounding-20260929T152826Z/`; see `GEA-inventory.json`, `identities.json`, `read-anchors.json`, `native-gap-search.json` and the final lifecycle readback.

## Global constraints

Execution is authorized for P1 only. Preserve native Memory, Reflexion, Skills, Grafel, Semantic IDE and machine-control ownership. No automatic install, workflow execution gate, model/controller runtime, credential, restart, Git-history change or release. New systems are allowed in a selected proposal only when its concrete input/output consumer needs them. Do not recreate a covered subsystem merely to manufacture use for a reference.
User chooses targeted verification; builds/reloads required for activation are distinct from broad tests. A selected material implementation must update its CODEBASE section, canonical Memory and one changeset, without release:apply or auto-commit.
## GEA-P1 â€” descriptive task-behavior novelty in the existing report CLI

**SELECTED; implemented outcome is recorded below.** The current consumer is `scripts/learning/analyze-retrieval.mjs`: users already compare explicit, verified retrieval-run bundles. Add a separately requested `--novelty` mode to expose whether candidates solve different individual cases, not just occupy different bins of aggregate scores. It does not select parents, launch experiments, optimize prompts or modify an agent.

### Source and native comparison

`GEA_outer.py:56-142` computes nearest-neighbor cosine distance on task-success vectors and combines novelty with performance; both parent and group selection call it (`175-177`, `305-307`). `self_improve_step.py:566` records a task_success_vector through `utils/evo_utils.py:105-122`. This is a real donor consumer, not an unused formula.

The donor fills absent task results with zero, adds epsilon in the cosine denominator and falls back to sampling when too few candidates qualify. Its group logic can repeat parents. Those choices are not native evidence of evaluated failure, maximum novelty for an all-zero vector, independent samples or a useful causal improvement. The proposed native analysis explicitly changes those cases and labels the result descriptive.

Native `src/learning/retrieval-diversity.ts` bins aggregate features; `retrieval-pareto.ts` compares multiobjective dominance; `retrieval-portfolio.ts` preserves per-case coverage. None reports this task-vector K-neighbor distance. `retrieval-profile.ts` already validates complete per-query candidateHit vectors, fixed cohort membership and baseline/evaluator identities; `retrieval-series.ts` preserves failed/incomplete runs and comparison groups. Reuse those stronger native inputs and do not import GEA's optimizer or evaluation parser.

### Proposed contract

Extend optional series `analysis.novelty` with `{neighbors: integer 1..10}` and add CLI `--novelty RUN_MANIFEST --output NEW_REPORT`. No option means no change to existing modes. Create `src/learning/retrieval-novelty.ts`, exporting `summarizeRetrievalNovelty(manifest: unknown, evidence: RunEvidence[]): RetrievalNoveltyReport`; use existing strict manifest parsing and verified profiles.

Within each existing profileComparisonKey plus split group, sort query IDs and form each candidate's binary candidateHit vector. For two nonzero vectors, `distance = 1 - intersectionHits / sqrt(leftHitCount * rightHitCount)`, clamped only for floating-point endpoint drift. The declared neighbor count K uses the closest `min(K, otherScorableCandidates)` distances. Tie order is deterministic by run ID. `novelty` is their mean and `performanceNovelty = candidateRate * sqrt(novelty)`. The latter is an informational number, not an instruction or automatic winner/parent selection.

All-zero vectors have undefined cosine direction and must report `unavailable: zero-success-vector`, not maximum novelty. A group with fewer than two scorable candidates reports unavailable/no-neighbor evidence. Missing, failed, incomplete and incomparable inputs remain separate visible rows; never synthesize missing tasks as misses, silently pool cohorts or manufacture neighbors. Identical nonzero vectors yield distance zero; repeated outcomes do not prove independent observations. No random fallback and no inferred lineage.

Bounds: reuse at most 100 runs and 10,000 cases/profile; refuse this analysis with a clear budget reason when the sum of unordered-pair-count times case-count over groups exceeds 20,000,000. Do not silently sample after exceeding the bound. At most ten neighbors/run are emitted, with total group/scorable/unavailable counts and vector digests. Raw queries and retrieved Memory content are not emitted.

Output has algorithm revision `agent-core-task-novelty/v1`, declared K, actual neighbor counts/IDs/distances, source manifest/profile digests, separate status and reason for every run, and numeric provenance through existing VerifiedValueRegistry. `causalAttribution` and `statisticalSignificance` remain `not-established`; `launchesExperiments`, `selectsParents`, `mutatesMemory` and `automaticApproval` remain false. Existing exclusive immutable report I/O and failure codes apply.

### Task 1 â€” strict schema and pure analysis

Files: modify `src/learning/retrieval-series.ts`; create `src/learning/retrieval-novelty.ts` and `tests/gea-retrieval-novelty-adoption.test.ts`.
- [x] Add the optional bounded analysis schema without altering required old fields or old analysis semantics.
- [x] Pin exact fixtures: [1,0] versus [1,0] gives distance 0; [1,0] versus [0,1] gives 1; [1,1] versus [1,0] gives 1 - 1/sqrt(2). Score equals declared candidateRate times sqrt(mean distance).
- [x] Pin zero vector, one candidate, K larger than available neighbors, duplicate IDs, deterministic ties, incompatible baselines/cohorts/splits, changed evaluator identity, incomplete run and pair-work limit. Invalid inputs cannot vanish into a shorter denominator without a visible reason.
- [x] After verification approval, run only `npx vitest run tests/gea-retrieval-novelty-adoption.test.ts` for red/green. Implement using validated profile cases, not donor metadata or caller-supplied vectors.

### Task 2 â€” actual existing CLI consumer

Files: modify `scripts/learning/analyze-retrieval.mjs` help/dispatch/numeric registration; use the same focused suite for actual compiled CLI fixtures.
- [x] Load run bundles through existing verification, attach the new mode, and preserve one-analysis-mode-only behavior. A failed bundle remains visible as unavailable rather than zero-vector evidence.
- [x] Exercise the compiled CLI with known bundles, verify input immutability/new-output refusal and numeric provenance for distance, neighbor count and score. Compare old profile/series/frontier/diversity/Pareto/curve outputs using specifically selected existing fixtures; do not silently run the full suite.
- [x] On selected implementation only, add attribution, one material changeset and the actual CODEBASE/Memory result. No provider/kernel installation or resident restart is inherently needed by this offline CLI.

### Review focus

1. No all-zero or missing-evaluation vector may be called maximally novel.
2. Equal aggregate accuracy with different successes must remain distinguishable.
3. Incompatible cohorts/evaluators and missing runs must never enter one distance denominator.
4. K, ties, work limits and emitted neighbor counts must be deterministic and bounded.
5. A descriptive score is neither a measured quality improvement nor authority to spawn, select or deploy candidates.

## Residual source-family census

| Family | Disposition |
|---|---|
| Task-success-vector performance/novelty | GEA-P1, redesigned against validated native observations. |
| Parent/group archive, patch ancestry and combining several agents' logs | Conditional GEA-C1: selected isolated multi-parent experimentation. Existing series/control evidence is not an actual experiment controller. `get_model_patch_paths` chooses one parent in a multi-parent string and does not prove full merge ancestry. |
| Diagnoser and self_improve_step | Conditional GEA-C1; raw failed logs and model reflection are untrusted inputs, not verified repairs. No hidden LLM or self-edit loop. |
| SWE-bench/polyglot tasks, grading scripts, Docker and reset helpers | Conditional GEA-C2: explicit benchmark adapter with licence/data/OS isolation contracts. Do not execute copied reset/cleanup/model commands against Agent Core. |
| Performance/cost reports and visualization | Partly covered by existing Learning profile/series/Pareto/curve/diversity. The new novelty mode does not replace them. |
| Vendor tools, assets, prompts and examples | Inventoried; body coverage is selective and no benchmark/provider was executed. |

**Current disposition:** MOVED to Consumer/GEA after approved CLI qualification; conditional families remain unselected.


## Historical planning reference readback - 2026-09-29

Retained at the original path. Current path: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/GEA`. Postflight compared **444** included file sizes/SHA-256 values with no drift, extra or missing included files; original HEAD `d185edffd1f9fbd2297f4de8c6c9f94547448b6d` remains and Git is clean. No symlink/junction or scoped runtime dependency/process consumer was found. Existing native GEPA mentions are attribution comments, not imports from its checkout. No repository was deleted.
Implementation remains unstarted for this review. Actual lifecycle evidence: `runtime/tmp/fourteen-reference-grounding-20260929T152826Z/reference-postflight.json`; plan self-review and native snapshot readback are recorded in final-closure.json.

## Approved execution and qualification — 2026-09-29

The user selected this P1 with the other two independent current-fit proposals. Preceding grounding observations are historical baseline evidence, not a claim that current source still lacks the implemented feature. Conditional C families remain unselected.

Qualification: **116/116 PASS, 0 failure, 0 skip** in the explicit seven-file scope: 79 new adoption tests (CORAL 38, GEA 17, MetaClaw 24) plus 37 selected existing retrieval/manifest regressions. The build passed with path policy 279 authored files / 0 exceptions. An additional **19/19 compiled checks** passed using an in-memory MCP transport and all eight analysis CLI modes; client/server and synthetic fixture were closed/removed. These are scoped tests, not a full-project benchmark or resident HTTP acceptance.

MCP compatibility remains 70 to 70 tools; expectedContentDigest is optional, with no removed/newly required parameter and breakingEvidence=false. Compiled manifest is fresh, 118234 bytes / approximately 29559 tokens, under 120000/30000 budgets. release:check-intent passed; read-only release:plan remains 0.14.0 to 0.15.0, not applied. One new minor intent is .changeset/20260929-coral-gea-metaclaw-adoption.md. No new dependency, donor runtime, model, credential, HTTP listener, automatic restart, Git-history change or deployment.

Grafel was explicitly indexed: current, accepted, 9659 entities / 51413 relationships, registered workspace coverage 1/1. Exact source imports/calls remain authoritative; initial MemoryFeedbackStore impact was broad-module only.

Evidence: runtime/tmp/coral-gea-metaclaw-implementation-20260929T161854Z/ (before-images, source-artifact-identities.json, qualification-final-vitest.json, compiled-acceptance.json, compatibility-result.json, graph-readback.json, reference/move readbacks, result.json). CODEBASE 0.1.77, MEMORY.md, the review index and canonical Memory record 206c85e5-8142-49bf-841b-7a9270b4bc25 retain the same stage distinctions.

### GEA-P1 implemented behavior

Implemented src/learning/retrieval-novelty.ts and the optional analysis.novelty.neighbors field in the existing series owner. CLI: `node scripts/learning/analyze-retrieval.mjs --novelty RUN_MANIFEST --output NEW_REPORT.json`. neighbors is 1..10. It consumes verified profile cases, partitions by existing comparison identity plus split, sorts query IDs, computes nearest-neighbor cosine distance, and emits mean novelty plus candidateRate times sqrt(novelty). Zero-success vectors and missing/failed/incomplete runs remain explicitly unavailable; no parent is selected.

The pair-work budget counts the actually scorable nonzero unordered pairs times cases within each compatible group and rejects totals above 20000000 before distance computation. Ties, K larger than the available neighbors, invalid IDs, work bounds and incompatible baselines/cohorts/evaluator identities are covered. All eight modes (profile, series, frontier, diversity, stability, pareto, curve, novelty) ran through compiled CLI readback with immutable input/new output. Numeric provenance remains descriptive evidence, not a quality, significance or causality claim.

**COMPLETE FOR APPROVED CLI SCOPE.** No resident activation is needed. GEA now resides in Consumer/GEA; 444 included hashes/sizes, original HEAD and clean working tree were checked after the move and the old root is absent. Only C1/C2 future consumers remain; no GEA runtime or benchmark was installed.
