# A-Evolve - Steal / Use Integration Plan

> **Status:** COMPLETE FOR APPROVED CLI ADOPTION - SHARED RESIDENT VERIFICATION CLOSED - CONSUMER REFERENCE
> **Grounded:** 2026-09-29
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/a-evolve`
> **Revision:** `18ba996dac9843f2759b2cdf8a94022f58fbfeb9`, branch `main`, clean working tree.
> **Origin:** `https://github.com/A-EVO-Lab/a-evolve.git`
> **Package:** `a-evolve` 0.1.0, Python >=3.11.
> **License evidence:** `pyproject.toml` declares MIT. This snapshot contains no LICENSE/NOTICE file; obtain and preserve authoritative attribution before copying source verbatim. Do not invent a copyright owner.

## 1. Decision and scope

**APPROVED AND IMPLEMENTED - AE-P1:** native descriptive learning-curve evidence for the existing offline Learning analysis CLI. Section 7 records implementation and executed acceptance; sections 2-6 retain the source-grounded design basis. The independent consumer is the current report-analysis workflow; no model runner, optimizer or background job is required.

New systems are allowed as proposals, but are not manufactured merely to consume donor code. Future benchmark/optimizer/prompt-assembly consumers are separated in section 5. The original grounding authorized planning only. The subsequent user approval authorized the current-fit implementation and its scoped acceptance; release/deployment and automatic restart remain excluded.

## 2. Source grounding and native comparison

The audit hashed **424 non-Git files / 6,672,935 bytes** and inventoried **256 Python files with AST parsing, zero parse errors**. Other code declarations were indexed lexically. Donor packages were not imported or executed. Executable bodies and selected test assertions were read; complete file inventory is not every-branch or dynamic verification.

`agent_evolve/utils/metrics.py:6-22` defines `evolution_capacity` as last-minus-first and `area_under_learning_curve` as the mean of prefix arithmetic means. **The latter is not trapezoidal AUC or resource-weighted area.** Searches inside `agent_evolve` found definitions but no internal caller of these two helpers; their presence is not proof of active donor integration.

`engine/history.py:28-89` provides ordered cycle records and score queries; `unified/readers/score_curve.py:14-47` projects latest/best/history with four-decimal rounding. `engine/loop.py:68-183,200-208` supplies a real cycle/report context, but catches task exceptions without retaining failed observation rows and assigns zero to empty or self-managed evaluation cycles. These defaults must not become native evidence rules.

Native `src/learning/retrieval-series.ts:116-217` already retains run states, comparison identity, splits, resources and declared seed evidence. `retrieval-stability.ts:24-103` is a consecutive-window advisory, not a whole-curve summary. `scripts/learning/analyze-retrieval.mjs:5-148` exposes profile/series/coverage-frontier/diversity/stability/Pareto, but no curve mode. Exact native searches found no AULC/evolution-capacity implementation.

Grafel was current before structural review. Impact inspection of `summarizeRetrievalSeries` identified dependent report tests; the source CLI's dynamic import remains the authoritative integration evidence, irrespective of graph edge coverage. Source identity, inventories and comparison evidence are retained under `runtime/tmp/a-evolve-agent0-agent-os-grounding-20260929/`.

## 3. AE-P1 - explicit, comparable curve summaries

### 3.1 Proposed contract

Create a pure native helper `src/learning/retrieval-curve.ts`, provisionally `analyzeRetrievalCurve(manifest, evidence, config)`. Add optional `analysis.curve` to the existing series manifest and `--curve RUN_MANIFEST --output NEW_FILE` to the existing CLI. Old modes keep their exact meanings; especially neither Pareto nor stability is renamed or replaced.

Configuration selects one metric (`candidateRate`, `objective`, or `regressionFraction`), its explicit direction, and 1-16 declared streams `{ id, runIds, evidenceRefs }`. A stream is an operator-declared sequence, not authenticated lineage. Bound the whole analysis to the existing 100 manifest runs; unique stream IDs and run references; each run belongs to at most one stream. Unassigned runs remain visible separately. No arbitrary expressions, callbacks, model calls or inferred experiment generation.

Within each declared stream, preserve listed order and require strictly increasing iteration numbers. Require the same `profileComparisonKey`, split and declared seed identity; unknown seed identity must remain unknown rather than imply independent trials. Reject malformed identities, duplicate reports/runs and cross-cohort/split streams. Reuse current manifest/profile/bundle validation before any aggregate.

Each selected point must have evaluable, eligible, independently recomputed report evidence and a finite metric. Keep missing/failed/incomplete/nonfinite rows and reasons in the output. Do not silently remove a failed checkpoint and join the curve across it. A stream containing an unavailable point has unavailable aggregate metrics; valid points may still be shown. Fewer than two points is `insufficient-trajectory`, with no invented zero improvement. Null regression fraction stays null; an explicitly measured zero remains valid.

For a complete stream of scores s[1..n], expose: initial, latest, best and its run ID, raw `latestMinusInitial = s[n]-s[1]`, and `prefixMeanScore = (1/n) * sum_i((1/i) * sum_{j<=i}(s[j]))`. Identify the last formula as **A-Evolve's AULC convention**. Preserve source semantics without presenting it as conventional area. For a minimized metric, a negative raw delta is not relabeled deterioration; attach metric direction and avoid automatic verdicts. Do not round before calculation or ranking.

The axis is explicitly `checkpoint-order`, not elapsed time, sample count or resource expenditure. Different spacing between iterations is reported, not silently integrated. No cross-stream winner is selected. Numeric example for design review only: scores [0.2, 0.8, 0.5] yield raw delta 0.3 and prefixMeanScore 0.4; this is a mathematical expected result, not a test that was run.

Output should include schema/algorithm revision, input/config digest, stream declarations, comparison identities, ordered point provenance, excluded/unassigned rows, precise unavailable reasons and derived metrics. Reuse `VerifiedValueRegistry`: report-derived measurements retain their verified-input provenance; stream ordering/evidence declarations remain operator-supplied. Mark `statisticalSignificance`, `causalAttribution` and exhaustive-attempt-history as not established. `launchesExperiments`, `stopsExecution`, `approvalAuthority`, `deploymentRecommendation`, and `memoryPersisted` remain false.

### 3.2 Implementation steps after explicit selection

1. Re-read current `retrieval-profile.ts`, `retrieval-series.ts`, CLI, `report-bundle.mjs`, `report-io.mjs`, and `verified-value-registry.ts`; recheck graph/source ownership. The existing derived series may be reused, but raw evidence must not bypass its eligibility/split checks.
2. Add strict curve configuration and the pure comparator/summary helper. Preserve original input buffers and manifest field compatibility. Compute digests from canonicalized declarations and ordered run IDs, not an unordered score set.
3. Wire one explicit `--curve` branch into `analyze-retrieval.mjs`; retain passing sealed-bundle recomputation, exclusive output creation, input-change detection, 8 MiB report cap and output hash readback. Exported pure helper must have the same validation boundaries as CLI integration.
4. Add focused tests only under the separately approved acceptance scope. Record implementation status, actual consumer execution and limitations in this plan, CODEBASE, attribution and canonical Memory; create one material changeset when shipped behavior is actually changed, not during this planning pass.

### 3.3 Acceptance specification - execution recorded in section 7

Create `tests/a-evolve-curve-adoption.test.ts`. Requested future scope: `npx vitest run tests/a-evolve-curve-adoption.test.ts`, including a real compiled CLI/bundle fixture after an approved build. Existing series/analysis CLI regression files are an additional explicitly selectable seam, not an authorization to run all tests.

Cover exact donor formula versus trapezoidal AUC; positive/negative delta; minimized direction; order sensitivity; stable output under irrelevant manifest key ordering; duplicate/nonmonotone iteration rejection; same-cohort/split/seed requirements; one-point and incomplete streams; null/NaN/Inf versus explicit zero; duplicate report ID; 100-run/stream limits; no mutation of input; existing output refusal; numeric provenance; unchanged --frontier/--pareto/--stability semantics. Run status and build status must be reported separately from resident MCP status: this feature's executable consumer is an explicit offline CLI.

## 4. Architecture alternatives

**Preferred:** a small native TypeScript analysis module and one CLI branch. **Not selected:** installing the Python package or matplotlib to compute a few deterministic numbers. **Separately selectable future system:** an experiment workbench with named tasks, isolated runner, evaluator, budget and reviewed promotion policy. This is permitted in principle but is not a prerequisite for AE-P1; no claim of generic self-improvement is made.

## 5. Residual census and exclusions

| Family / evidence | Decision and reason |
|---|---|
| `utils/metrics.py`; `engine/history.py`; `readers/score_curve.py` | **AE-P1 current-fit**, with explicit source semantics and the native report consumer above. Four-decimal rounding, empty-score zeros and implicit uniform resource cost are not transplanted. |
| `engine/trial.py:31-64`; `engine/loop.py:68-183`; GEPA loop-stop/property tests | **Partly covered / conditional AE-C1.** Trial abstraction and external evaluation ownership are useful for a future runner. Donor drops failed observations; `stop=True` becomes `converged=True`, and self-managed evaluation records zero. Native report completeness/failed-attempt accounting is already explicit and must remain authoritative. |
| `algorithms/adaptive_skill/gating.py:23-57`; `skillforge/gating.py` family | **Conditional AE-C1.** Holdout mutation evaluation needs a real isolated optimizer. The inspected gate accepts when holdout tasks are absent; native eligibility must not copy this fail-open behavior. Existing split declarations are not an execution gate. |
| `engine/versioning.py:20-403`; `contract/workspace.py:18-212`; `contract/schema.py:14-52` | **Covered/reject direct replacement.** Native file checkpoints, transactional source edits, Skills and Memory already own these responsibilities. Donor mutates Git/tags, restores/removes files, accepts raw names and its schema validator creates directories. Those are not read-only validation or safe current-line rollback mechanisms. |
| `algorithms/gepa/serialization.py:25-113`, GEPA engine/evaluator family | **Conditional AE-C2.** Candidate prompt/skill/memory serialization requires an actual optimizer. Restore deletes prior fragments/skills/memory before complete validation; delimiter and path input is not trusted. No bulk replacement of canonical Memory or source tree. |
| `unified/controller.py:57-247`; operators; regimes/registry/interfaces | **Conditional AE-C2, not a new authority.** Recipes choose readers/operators from feedback capabilities; inspected recipes use NoVerify. Declared write scopes/filtering do not authorize arbitrary shell edits. No controller/router/DAG is added to Agent Core. |
| `unified/readers/claim.py:19-62`; `claim_types.py:19-113` | **Conditional AE-C3.** Structured claim rollups need a producer of verified per-claim evidence. First-match keyword categories, missing-score defaults and heuristic partial scores cannot become independent fact-checking. Existing reviewed/evaluated Learning envelopes remain in place. |
| `unified/readers/terminal_trajectory.py:19-185`; trajectory/pattern readers | **Partly covered.** Native invocation IDs, Activity Tracker and Reflexion retain real failures. Donor textual heuristics, truncated command grouping and previous-command output pairing can misattribute concurrent calls; raw trajectories are not safe durable Memory. |
| `unified/verifiers/stagnation_rollback.py:19-83` | **Not adopted as an execution gate.** Missing pass-rate allows acceptance; rollback/tag state is incomplete. Native stability remains descriptive and never auto-restores source or stops machine control. |
| `protocol/adaptation/harness_filter.py:20-132`; catalog/embedder/operators | **Conditional AE-C4.** Per-task prompt/tool filtering needs a prompt-assembly consumer. Filtering tool files while retaining an unfiltered prompt on missing pieces is not a security boundary. Native Memory retrieval alone is not that consumer. |
| adaptive_evolve, adaptive_skill, skillforge, propose_curate, guided_synth, navigation, meta_harness, mas_adaptive_skill | **Indexed family-level / conditional AE-C1-C4.** Alternative optimizer recipes, draft/judge/skill curation and multi-agent orchestration are not current native execution consumers. Only specific bodies cited elsewhere were reviewed in depth; no every-engine equivalence claim. |
| agents, benchmark adapters, sandboxes, seed workspaces, CLI/examples, configs, plots and assets | **Conditional/support-only.** They support donor workloads and require separately reviewed task/model/runtime choices. No benchmark/model/daemon was started, and assets/docs are not used as proof of executable correctness. |

## 6. Reference disposition and evidence boundary

**CONSUMER ONLY - MOVED INTACT.** AE-P1 is adopted and qualified. After the shared resident verification closed, the reference moved to `Consumer/a-evolve` under the original user-authorized lifecycle rule. Remaining AE-C1-C4 need future consumers. All 424 inventoried non-Git files retain their sizes/hashes and the same clean HEAD; section 9 records final evidence.

The census found no additional current-fit mechanism sufficiently justified by the inspected source/native seams. This is a revision- and scope-bounded finding, not a guarantee that unexecuted branches contain no future ideas or defects. Future consumer choices can reopen AE-C1-C4. The lack of a full license notice is explicitly retained as a pre-copy provenance issue.

Planning artifacts: `runtime/tmp/a-evolve-agent0-agent-os-grounding-20260929/a-evolve-inventory.json`, `identity-and-prior-plans.json`, `native-before-hashes.json`, and task closure evidence. Source-first comparisons, not repository marketing descriptions, determine the proposal. Proposed tests above are not PASS evidence.

**Historical grounding-only boundary:** the original pass created the plan without implementation or tests. Subsequent approved implementation and closure are recorded in sections 7-9; the initial review requirement is satisfied for AE-P1 only.

## 7. Approved implementation and qualification - 2026-09-29

**AE-P1 IMPLEMENTED - TARGETED AND COMPILED CLI VERIFIED.** `src/learning/retrieval-curve.ts` independently implements the reviewed mathematical conventions. No donor source was copied verbatim; the missing full MIT notice is not filled with invented attribution. `retrieval-series.ts` accepts optional `analysis.curve`; `scripts/learning/analyze-retrieval.mjs --curve` consumes verified existing report bundles and writes a new exclusive output.

The pure helper uses explicit ordered streams, candidateRate/objective/regressionFraction, maximize/minimize direction, comparison/split/seed identity, strictly increasing iterations, unique stream/run/report IDs, bounded inputs, deterministic object-key-independent digests and unchanged numeric provenance. Invalid/failed/incomplete/missing checkpoints and unavailable metrics keep the stream unavailable, not a curve with the failure silently removed. Single points have no trajectory summary. Unassigned rows remain visible. `latestMinusInitial` and `prefixMeanScore` do not claim statistical significance, lineage authentication, causality, approval, stopping or deployment authority.

Fresh targeted tests: **19/19 PASS**, including actual compiled CLI execution, exclusive output, and unchanged frontier/Pareto/stability mode behavior. Entire selected matrix: **61/61 PASS, 0 failures, 0 skips**, in four specified files only; no full regression suite. Final build completed successfully (path policy **269 authored files / 0 exceptions**). AgentOS compiled-isolated SDK acceptance adds **8/8 checks**, separate from the CLI and resident process.

Fresh Grafel index/status: **current**, integrity accepted, **9,354 entities / 49,527 relationships**, registered-repo coverage 1/1. Graph freshness is structural evidence, not proof of numerical correctness. Product version remains 0.14.0; `.changeset/20260929-a-evolve-agent-os-adoption.md` is minor; read-only release plan 0.15.0 with three pending intents. Compatibility is 70->70 tools, no breaking evidence; pre-existing browser optional parameters are from the earlier SystemOne wave, not this task.

The standalone compiled curve CLI is exercised. Shared resident MCP activation is still pending: Core PID3164 started 09:46:26Z, before the new artifacts written 11:36:00-02Z. No Core/daemon restart was performed. a-evolve is retained at its original reference path until installed-runtime/lifecycle closure; Agent0 conditional workstreams remain deferred in Consumer.

Evidence: `runtime/tmp/a-evolve-agent-os-implementation-20260929/` contains before-images, source diffs, red/green logs, final scoped log, compiled acceptance, release checks and result.json. No new dependency, live credential mutation, release apply, version bump, commit/tag/push or deployment.

## 8. Post-restart readback - 2026-09-29

AE-P1 is complete for the approved explicit offline CLI scope. The earlier 19 curve tests and real compiled CLI execution remain the qualification evidence; they were not rerun during this readback. All 12 selected source hashes and 11 compiled hashes still match implementation result.json, including retrieval-curve and the CLI.

The user restarted Agent Core: resident Node PID 16632 began 2026-09-29T12:10:32.0466760Z, later than the newest qualified artifact at 11:36:02Z. Health is ok on 0.14.0; Code Intelligence current/integrity accepted, 9,354 entities / 49,527 relationships, registered-repo coverage 1/1. No assistant-triggered restart, build, dependency or release change occurred.

Shared AOS-P1 was exercised through connected resident MCP with a real synthetic oversized start_process result, independently matched persisted-byte hash/length, verified pagination, Unicode text and same-size tamper rejection. AOS-P2 restricted-credential resident HTTP remains a distinct pending verification, not a numerical/CLI defect or a reason for another restart. No new active credential was created.

Reference locations are unchanged in this readback; a-evolve stays at its original path pending the wave's reference-lifecycle review, and Agent0 remains conditional in Consumer. This section supersedes section 7 only for restart status, not historical test results. Evidence: runtime/tmp/a-evolve-agent-os-implementation-20260929/resident-readback-20260929.json.

## 9. Approved adoption and reference lifecycle closed - 2026-09-29

**COMPLETE FOR APPROVED CLI ADOPTION - CONSUMER REFERENCE.** AE-P1 remains qualified by its actual compiled CLI execution and 19 earlier curve cases within the 61-case targeted matrix. This closure did not rerun those tests; all 12 selected source and 11 compiled hashes match the qualified implementation.

The final shared AgentOS acceptance boundary is now closed: one explicitly authorized read_file-only temporary credential passed resident HTTP discovery, allowed reads, forbidden raw calls and metadata-override refusal. The credential was revoked and rejected by native authentication and HTTP401. AgentOS plan section9 records the distinct live evidence; it is not presented as numerical-curve validation.

Following the user's original consumer-only rule, a-evolve moved intact to `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/a-evolve`. All 424 inventoried non-Git files retain identical size/hash; HEAD remains 18ba996dac9843f2759b2cdf8a94022f58fbfeb9 on clean main, no extra files, and old root absent. Remaining AE-C1-C4 require future consumers, so this reference was not deleted or declared universally exhausted. No donor runtime import, optimizer, trainer or model execution was introduced.

No product source, dependency, build, restart, release intent/apply, version, Git-history or deployment change occurred in this verification closure. Agent0 remains conditional in Consumer, not adopted by implication. Sections7-8 retain historical qualification; section9 supersedes their pending shared-verification/lifecycle boundary.

Evidence: `runtime/tmp/a-evolve-agent-os-implementation-20260929/final-authorized-closure-20260929.json` and `reference-lifecycle-closure-20260929.json`. Docs and canonical Memory carry the same closed current-fit / retained conditional-consumer status.
