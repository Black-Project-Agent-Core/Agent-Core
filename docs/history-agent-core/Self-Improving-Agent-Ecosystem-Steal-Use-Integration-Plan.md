# Self-Improving Agent Ecosystem — Source-First Adoption Plan

> **Status:** PRIOR SIE-P1–P7 ADOPTED/CLOSED — 2026-09-27 EXACT-SNAPSHOT ZERO-VALUE RECONFIRMED — REFERENCE RETIRED/DELETED AGAIN
> **Created:** 2026-09-20; **exhaustive re-grounding:** 2026-09-23; **exact-snapshot reconfirmation:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/self-improving-agent-ecosystem`
> **Revision:** `f06504750b32c3b6a6e06b56ee6e69dc4476f333`, branch `main`
> **Repository:** `https://github.com/Git-on-my-level/self-improving-agent-ecosystem`
> **License inspected:** MIT, copyright (c) 2026 David Zhang
> **Disposition:** REFERENCE RETIRED / DELETED after the explicit final census in section 24; no additional current-fit SIE proposal identified. Implemented native features and evidence are retained.
> **For execution after selection:** use the inline executing-plans workflow, reread current source, and run only the verification authorized for the selected tasks. No automatic commits, release, restart, or deployment.

**Goal:** strengthen the evidence and outcome semantics of existing Agent Core Learning without transplanting an autonomous ecosystem or inventing missing upstream implementations.

**Architecture:** controller-led `learning(review)` continues through the existing coordinator and Memory/Grafel sinks. Optional evidence contracts and truthful summaries are native TypeScript additions, not another scheduler, authorization layer, evaluator service, or knowledge store.

**Tech stack:** existing Node/TypeScript, Zod, MemoryService, LearningService, ActivityTracker, and project-local Grafel. No new runtime/dependency is currently necessary. The existing Python installation was used only for isolated reference inspection.

**Design basis:** this document contains the proposed design, source comparison, selectable tasks, and acceptance criteria. It replaces the older proposal text at the same path; the previous 465-line plan is preserved in `runtime/backups/sie-regrounding-20260923/`.

## 1. Authorization and scope

Historical approvals progressed through P4/P1/P3 implementation and activation, followed by P2/P5 and resumed installed verification. All five selected mechanisms are complete for the scope recorded in sections 17–18. The subsequent user request explicitly selected P6/P7 and all three companion ASI proposals. Their source and isolated-candidate implementation is verified in section 23. The earlier proposal-only checkpoint in sections 19–22 is historical; activation remains separately authorized. The older conditional checklists are design history, not outstanding installation tasks.

Earlier implementation evidence: docs/SIE-Adoption-Execution-20260923.md and runtime/tmp/sie-implementation-20260923/. Sections 2–5 preserve the preceding source-first audit, not the post-implementation runtime state.

The user permitted inspection helpers/markers and conditional deletion of this exact reference. No marker, external workspace registration, new dependency, or reference deletion was needed. Other protected repositories are outside scope.

Current-line source outranks the historical plan and graph. `package.json` remains canonical for product version; the earlier documentation-only audit created no release intent. The approved P6/P7 plus ASI implementation now has one pending patch intent, `.changeset/20260923-sie-asi-offline-reports.md`, without applying it. The root legacy remote, source-recovery work, language-server repair, and runtime activation are not part of this proposal.

## 2. Evidence and coverage

Evidence directory: `runtime/tmp/sie-regrounding-20260923/`. Readback and integrity records distinguish reference findings from native implementation proof.
- Current checkout: 48 tracked/worktree files accounted for; 6 Python files, 7 shell files, 10 JSON/JSONL files, 20 Markdown files, 2 YAML files, Makefile, LICENSE, and .gitignore.
- All 13 executable/test Python/shell files, the three schemas, relevant templates, CI/Makefile, and license were read. Every eligible worktree file was hashed; inventory is not a claim that every sentence of documentation proves executable behavior.
- Locally available history has four commits: `3984b1b`, `f7fe8d5`, `92c0a85`, `f065047`; local main and origin refs converge on the same revision. No fetch or unrequested branch checkout occurred.
- Native comparison read `src/learning/{types,review,service,sink-manager,memory-sink,code-pattern-sink,triggers}.ts`, `src/mcp/{learning-schemas,learning-tools}.ts`, and `src/tracker/activity-tracker.ts`; current tests and Memory/provenance boundaries were checked where relevant.
- Scoped integrity snapshot: 43 source/config/contract files plus 40 installed JavaScript modules. A textual reference-path scan across existing source/tests/scripts found no dependency on this checkout; that negative result is not proof of zero adoption value.
- Grafel reported the Agent Core graph current and found `LearningReviewCoordinator` at `src/learning/review.ts:49`. Its class inspection had no caller/callee entries and older indexed metadata; impact returned two generic modules only. Exact source imports, not that sparse graph result, establish the proposed change surface. No new reference graph was built; old 196-entity/1,015-edge counts are historical and are not reused as current proof.
- Seven source-contract probes ran against the actual reference Python code using synthetic files; six native probes used installed methods/schema with stubbed state/sinks and an isolated tracker cwd. No live Memory/Pattern capture or full test suite was run.

Artifacts: `reference-inventory.json`, `native-snapshot.json`, `dependency-review.json`, `contract-probes.json`, `native-contract-probes.json`, and the two inspection helpers. Final revision/clean-tree, source hash comparison, and document-memory readback are recorded separately.

## 3. Current-source mechanism census

| Family / exact owner | Actual behavior | Disposition |
| --- | --- | --- |
| `examples/controlled-outcome/score.py::score` | Hard flags, sample/count checks, then candidate-rate minus baseline-rate | ADAPT contract through P1; arithmetic only under conditional P5 |
| `examples/controlled-outcome/verify.py::main` | Recomputes objective from observation and submitted score; incomplete independent checks | P2 design reference; do not copy as a trusted verifier |
| `scripts/validate.py::validate_schema_instance` | Handwritten subset of JSON Schema plus repository-specific invariants | Use existing Zod; do not install a second schema validator |
| `scripts/validate.py::validate_events` | Event IDs, loop/role references, correctness and finite rank objective | Adapt bounded evidence validation; not an event-processing engine |
| `schemas/event.schema.json` | Vocabulary for outcomes, evaluator lineage, supersedes, and evidence | P1/P3/P4; schema declarations are not runtime implementation |
| `scripts/avo-to-event.py::main` | Terminal ledger mapping, deterministic IDs, artifact hashing, output replacement | P3 inspiration only; not append-only or exactly-once storage |
| `scripts/init-ecosystem.sh` | Generates templates and unconfigured stubs | REJECT transplant: duplicate scaffold and POSIX/Python assumptions |
| `scripts/install-avo-lite.sh` | Default pinned AVO source clone, refuses existing destination, does not launch it | Covered by explicit local installation/provenance practice; no AVO dependency |
| Five `templates/stubs/*/*.sh` | Print unconfigured response and exit 2 | Useful absence principle, but no collector/agent/deployer/rollback implementation to adopt |
| Ecosystem/policy schemas + templates | Declarative roles, default deny, budgets, profiles and promotion stages | No runtime policy enforcement, scheduler, spending controller, or deployment implementation; do not add these owners |
| Two test modules + four fixtures | 15 defined test cases and adversarial example inputs | Reuse test ideas; full upstream suite not executed in this audit |
| CI / Makefile | Ubuntu checks, Python unittest, shell syntax; shellcheck optional | No native Agent Core adoption required |
| Markdown and skill guidance | Workflow/design/checklists, not another hidden executable engine | Reference context only; not runtime proof or controller authority |

## 4. Corrections to the previous proposal

The earlier plan overstated several guarantees. These corrections follow inspected code and the saved probes, not general recommendations.

| Probe / source | Observed result | Consequence for adoption |
| --- | --- | --- |
| Valid controlled fixture | Scorer correct=true, objective=0.175; verifier pass=true | Positive control works in the inspection environment |
| Forged score after `tests_passed=false` | Scorer rejects, but verifier returns pass=true when supplied the valid-looking score | Verifier does not independently recheck hard tests |
| Forged score with successes greater than opportunities | Scorer rejects, but verifier accepts a matching forged objective | Verifier does not independently bound success counts |
| Fractional observation counters | `int(...)` silently truncates 15.9/40.9 and accepts the result | Native adaptation must reject noninteger counters, not coerce them |
| Accepted event with empty lineage and evidence | Event schema plus cross-file validation reports no errors | Evaluator identity and nonempty evidence are not mandatory upstream guarantees |
| Distinct event IDs sharing one idempotency key | Validator reports no errors | Presence of a key is not durable idempotency enforcement |
| Bridge with an existing output and no verifier artifact | Existing synthetic event is overwritten; an accepted event is emitted with only score.json evidence | Bridge is not append-only; absent verifier evidence is silently omitted |

`eligible_identity_verified` is a supplied Boolean. Neither scorer nor verifier authenticates signatures or proves attribution truth. Evidence digest schema accepts any nonempty string; the bridge hashes available artifacts but does not validate their verdict or freshness. `observed_at` can be null.

`evaluation_invalidated` and `candidate_superseded` are event names/fields, not implemented invalidation, replay, supersession resolution, or rollback handlers. Policy JSON is declarative; its presence is not OS/MCP authorization enforcement. Fail-closed stubs must not be described as implemented infrastructure.

The audit helpers exited successfully while exposing these limitations. This is not a claim that the repository passed seven product acceptance tests, nor that its flaws were repaired.

## 5. Exact Agent Core comparison — pre-implementation audit

| Native owner | Current implemented state | Remaining gap |
| --- | --- | --- |
| `learning/types.ts::LearningCandidate`, `mcp/learning-schemas.ts` | `verified` plus bounded string evidenceRefs; no evaluation envelope | P1 optional contract absent; unknown evaluation input is stripped by current MCP schema |
| `learning/review.ts::validateCandidate/review` | Safety checks, evidence required for verified candidates, unverified becomes proposal | Does not validate evaluator identity, hard correctness, objective, or verifier reports |
| `learning/sink-manager.ts::capture` | Already returns captured, duplicate, rejected, sink-unavailable, sink-failed | Do not reimplement these statuses or sink routing |
| `learning/service.ts::review` | Aggregate `nothingWorthSaving = captured === 0`; generic no-new-knowledge message | P4: failure and legitimate no-action are conflated in summary, although individual outcomes remain available |
| `learning/memory-sink.ts::capture` | Sends content/category/tags to MemoryService; joins evidenceRefs and truncates source.ref to 480 characters | New evaluation fields would otherwise be lost; define an explicit bounded evidence pointer rather than pretending the full proof was saved |
| `learning/code-pattern-sink.ts` | Resolves real Grafel exemplars and records trigger/steps; rejects generic refs as exemplars | Preserve this check; evaluation descriptors are not entity exemplars |
| `learning/triggers.ts` | Last 64 checkpoint keys retained; `markReviewed` resets review counter | Checkpoint deduplication is not per-candidate exactly-once capture; no automatic retry policy should be introduced |
| `tracker/activity-tracker.ts` | Existing redacted journal, random event IDs, bounded ring, best-effort persistence | P3 may add small events, but cannot claim lossless immutable storage or exactly-once durability |
| `mcp/learning-tools.ts` | Existing five actions; calls that return rejected outcomes still complete normally | Preserve compatibility; precise outcome details belong in P4, not a new machine-control gate |

Native probes called the installed `LearningService.prototype.review` with stubbed reviewer/state and called the real coordinator/schema with a stub sink. Sink-failed and sink-unavailable both produce `nothingWorthSaving=true`; mixed captured/failure produces false. Unsupported `evaluation.correct=false` is removed by current schema and is not enforced. This proves absence of a proposed feature, not a breach of an existing evaluation API promise.

The tracker singleton used an isolated cwd under the evidence directory. No test claim was written to production Memory or Grafel. Existing Learning/Grafel tests cover entity/trigger handling, not the new evaluator contract. The direct search found no existing tests naming the review coordinator/service/aggregate flag; this is not a claim of zero overall Learning coverage.

## 6. Historical first-wave selection — completed in sections 17–18

| ID | Revised scope | Selection dependency | Recommendation |
| --- | --- | --- | --- |
| SIE-P4 | Truthful aggregate review summary using existing outcomes | None | First: smallest demonstrated current-fit correction |
| SIE-P1 | Optional evaluated-claim envelope with strict structural validation | None; P4 improves reporting | Select only for explicit evaluated claims; ordinary facts retain current flow |
| SIE-P3 | Bounded candidate/evidence correlation in existing tracker and sink pointer | P1 for evaluated metadata; ordinary correlation can stand alone | Useful current-fit traceability, not a new event database |
| SIE-P2 | Explicit independent-verifier attestation and negative fixtures | P1 plus a named verification producer/protocol | CONDITIONAL; not an autonomous verifier and not automatically bundled |
| SIE-P5 | Controlled-outcome arithmetic for a selected experiment | Named consumer and measurement contract | CONDITIONAL; no current experiment consumer was demonstrated |

- [x] SIE-P4 — selected scope implemented, installed and verified; see sections 17–18.
- [x] SIE-P1 — selected scope implemented, installed and verified; see sections 17–18.
- [x] SIE-P3 — selected scope implemented, installed and verified; see sections 17–18.
- [x] SIE-P2 — selected scope implemented, installed and verified; see sections 17–18.
- [x] SIE-P5 — selected scope implemented, installed and verified; see sections 17–18.

Unchecked entries are proposals, not unfinished approved implementation. Rejecting a proposal does not authorize installing another one. Recommended order is P4, P1, P3, then separately selected P2/P5. Installing AVO-lite is not a prerequisite.

## 7. SIE-P4 — truthful aggregate outcomes
**Source inspiration:** upstream `result.status` vocabulary and fail-closed observer stubs. **Concrete consumer:** `LearningService.review`, whose installed behavior was reproduced above.

**Files:** modify `src/learning/types.ts`, `src/learning/service.ts`; create `src/learning/review-summary.ts` and `tests/learning-review-summary.test.ts`. Do not change sink selection or tracker internals.

**Proposed interface:** `summarizeLearningReview(outcomes: LearningReviewOutcome[]): LearningReviewSummary`. Return `status`, `complete`, and counts for each existing outcome. Preserve `outcomes` and the existing `nothingWorthSaving` Boolean for compatibility, but explicitly deprecate it as a capture-count-only legacy field; new summaries/logs must not treat it as proof of no knowledge.

```ts
// Proposed classification order; statuses below are new aggregate values only.
const failures = counts.rejected + counts['sink-unavailable'] + counts['sink-failed'];
const status = outcomes.length === 0 ? 'no-new-knowledge'
  : failures > 0 ? (counts.captured > 0 ? 'partial' : 'incomplete')
  : counts.captured > 0 ? 'captured'
  : counts.proposal > 0 ? 'awaiting-verification' : 'duplicates-only';
const complete = failures === 0;
```

Preserve individual outcome enum values. Include rejected/unavailable/failed counts separately, so a legitimate validation rejection is not confused with a sink exception. A mixed captured/failure batch must not receive an unqualified success message. A proposal-only batch is awaiting verification, not a failed tool and not an assertion of no useful knowledge.

- [x] P4.1 Add table-driven tests for empty, captured-only, duplicate-only, proposal-only, rejected-only, unavailable-only, failed-only, mixed captured/failure, and mixed captured/proposal batches. Assert each count, aggregate status, completeness and legacy Boolean.
- [x] P4.2 Demonstrate the current failed/unavailable aggregate mismatch using the actual service method with isolated tracker/state, not a copied classifier. Preserve pre-change output.
- [x] P4.3 Implement the pure summary and wire it into returned review results and tracker context/message. Keep current trigger reset semantics and per-outcome flow; no hidden retry or checkpoint change.
- [x] P4.4 Verify the same cases through source and the selected compiled closure. Assert unchanged legacy fields and explicit incomplete logging. Do not run unrelated suites.
- [x] P4.5 Update this plan, CODEBASE and task-specific canonical memory with evidence; record release intent for actual behavior change, leaving activation separate.

## 8. SIE-P1 — evaluated-claim envelope

**Source inspiration:** `score.py`, `validate_events`, event schema. **Native owner:** `LearningReviewCoordinator` before sink capture, not the MCP execution router.

**Files:** modify `src/learning/types.ts`, `src/learning/review.ts`, `src/mcp/learning-schemas.ts`; create `src/learning/evaluation.ts` and `tests/learning-evaluation.test.ts`. Return normalized evaluation details via review outcomes. Sink persistence/correlation is separately handled by P3.
**Selected data contract (implemented in source/candidate; not live):**

```ts
interface EvaluatedEvidence {
  ref: string;                 // existing allowed evidence-ref prefixes; maximum 1000 chars
  digest: string;              // sha256: followed by exactly 64 hexadecimal digits
  observedAt: string;          // valid timezone-aware timestamp, not an inferred timestamp
}
interface LearningEvaluation {
  schemaVersion: 1;
  mode: 'rank' | 'discover';
  evaluatorRevision: string;   // nonempty, bounded to 200 characters
  correct: boolean;
  objective?: number | null;
  evidence: EvaluatedEvidence[]; // 1..8 entries; never silently truncate
  metrics?: Record<string, number>; // <=16 safe names, finite values
  baselineRef?: string;
  attributionComplete?: boolean;
  samples?: { candidate: number; baseline: number; minimum: number };
}
```

`LearningCandidate.evaluation` is optional; `validateEvaluationEnvelope(value: unknown)` performs identical strict parsing for direct coordinator calls and MCP calls. Reject wrong types, unknown envelope fields, nonfinite values, duplicate/conflicting evidence descriptors, malformed timestamps/digests, excessive counts or lengths. Never coerce Boolean/string/fractional numeric counters. Sample values, when supplied, must all be positive safe integers and both counts must meet the supplied minimum.

For verified evaluated claims, `correct` must be true, rank requires finite objective, discover allows missing/null objective, and explicit `attributionComplete=false` rejects capture. Numeric improvement never rescues failed correctness. Unverified candidates remain proposals; explicit learn does not bypass verification. Legacy candidates without evaluation retain existing semantics.

**Trust limit:** the envelope records controller-supplied attestations. Checking digest syntax does not hash or authenticate an artifact; timestamp syntax does not establish freshness; evaluatorRevision is not proof of independent execution. Return `evidenceValidation: 'declared'` for this path. Do not call it cryptographically verified or autonomously evaluated.

No implicit evidence URI fetch, arbitrary command execution, external evaluator lookup, new configuration authority, or filesystem access is introduced by P1. Domain-specific artifact verification remains explicit controller/tool work under P2.
- [x] P1.1 Pin source hashes and write failing tests through `LearningReviewCoordinator` plus the actual MCP schema: legacy valid, unverified, false correctness with positive score, finite rank, null discover, malformed and oversized envelopes.
- [x] P1.2 Prove the current schema removes unsupported evaluation input; label it a missing feature rather than an existing API regression. Use stub sinks only for RED, never production Memory.
- [x] P1.3 Add the types and one pure validator; use that validator in direct and MCP entry paths. Evaluate before `sinks.capture` and preserve existing safety/evidence-prefix checks.
- [x] P1.4 Attach normalized evaluation/check results to the returned outcome, including reason codes such as `correctness-failed`, `objective-invalid`, `attribution-incomplete`, and `evidence-invalid`. Keep the existing `rejected` outcome status; do not silently replace public enums.
- [x] P1.5 Verify malformed envelopes cause zero sink calls, legacy behavior is unchanged, evidence is never fetched, and descriptor overflow is rejected rather than hidden by truncation. Repeat against selected compiled modules.
- [x] P1.6 Document declared-versus-verified evidence explicitly. Synchronize plan/CODEBASE/memory only to actual results and record a patch intent when implemented.

## 9. SIE-P3 — bounded decision correlation, not a second event store

**Source inspiration:** `avo-to-event.py` identities/digests and `event.schema.json` lineage. Neither provides a production journal or invalidation processor.

**Files:** modify `src/learning/types.ts`, `src/learning/service.ts`, `src/learning/memory-sink.ts`, `src/mcp/learning-schemas.ts`; create `src/learning/decision-evidence.ts` and `tests/learning-decision-evidence.test.ts`. Inspect `code-pattern-sink.ts` but change its provider payload only with a separately verified compatible field; do not invent unsupported Grafel fields.

Add optional `candidateId` (1..200 characters) and `auditRef` (existing safe ref syntax, maximum 480 characters). A missing candidate ID receives a call-scoped generated correlation ID, explicitly not an exactly-once key. Supplied IDs are namespaced by review/workspace and paired with a fingerprint of normalized claim/evaluation content so reuse of an ID with different content remains observable.

Emit a compact event per candidate through existing ActivityTracker with review ID, candidate ID/fingerprint, index, kind, outcome, safe reason code, evaluator revision when present, evidence count/digest, and sink/result ID. Never log raw candidate content, model reasoning, full test output, credentials, or unrestricted nested metadata. Keep each context below existing tracker truncation limits; include explicit omitted counts when showing a subset.

For Memory capture, use an explicitly supplied `auditRef` as the existing `source.ref` pointer instead of a silently cut list; preserve the legacy fallback when no auditRef is supplied. No MemoryRecord schema or second canonical store is needed. A pointer is not the full evidence payload, and its target remains an explicitly owned report.

A duplicate capture still gets its own review/correlation event and references the existing sink ID; it must not silently overwrite the accepted memory with new evaluation claims. Grafel exemplar validation remains unchanged.

Optional correction relation on a new reviewed claim: `{kind: 'invalidates' | 'supersedes', targetCandidateId: string, reasonRef: string}` with at most 8 relations. Record a declared correction only after the new claim passes ordinary review; unverified claims remain proposals. The event never edits/deletes another Memory/Pattern record and never proves the target existed merely from an ID string.

Standalone invalidation commands, historical replay, supersession resolution, candidate registries, exactly-once persistence and a new learning action are explicitly deferred. The upstream only declares those event names. They are not secretly included in P3.

**Durability limit:** ActivityTracker is best-effort; its recovery/redaction may rewrite historical journal bytes. Do not advertise an immutable audit ledger or return durable-proof guarantees just because `record()` returned an event object. P3 does not change tracker locking/recovery or make telemetry an execution gate.
- [x] P3.1 Add isolated-tracker tests for capture, duplicate, rejection, sink failure, repeated ID with altered content, and explicit correction relations. Assert every event's correlation fields and absence of raw content.
- [x] P3.2 Demonstrate current aggregate-only events and the 480-character Memory evidence-ref truncation. Preserve the original output as RED evidence; do not corrupt live journals.
- [x] P3.3 Implement bounded normalization/fingerprinting in the helper, wire service events and the optional Memory auditRef, and preserve default source metadata for legacy candidates.
- [x] P3.4 Verify capture failure does not become captured, duplicate keeps original sink ID, unsafe references are rejected, tracker failure does not trigger duplicate capture, and correction events never mutate prior durable knowledge.
- [x] P3.5 Verify no additional store, background process, provider tool, or registry was introduced; record exact source/compiled evidence and synchronize docs/memory. Leave activation explicit.

## 10. Historical SIE-P2 design — implemented scope in sections 17–18

**Selection prerequisite:** identify an actual verification producer and specify which artifact/claim it recomputes. A second Boolean or a second call to the same scorer is not independent verification. The controller may perform explicit authorized recomputation; no hidden agent is spawned.

This was previously labeled strong current-fit without an exact producer. That label is withdrawn. The reference verifier accepts forged hard-test/count results in the saved probes, so it is not a safe implementation to transplant.

**Proposed extension after P1 selection:** `evaluation.verification = {method: 'recomputed', verdict: 'pass' | 'fail' | 'unavailable', verifierRevision: string, inputsDigest: string, resultEvidence: EvaluatedEvidence}`. Bounds and safety match P1. A supplied failing/unavailable verifier must reject an evaluated capture; absence is allowed for ordinary controller-reviewed evaluation and must never be described as independent verification.

An independent-verification claim requires all fields and a passing verdict tied to the same normalized candidate/baseline input digest. The result is labeled `controller-attested-recomputation`, not `verified-by-Agent-Core`. Actual artifact hashing and recomputation are explicit controller/tool operations; no raw URI execution/fetch is authorized by the envelope.

**Files if selected:** extend `src/learning/evaluation.ts`, `src/learning/types.ts`, `src/mcp/learning-schemas.ts`; add `tests/learning-verifier-contract.test.ts`. Native runtime input parsing alone cannot establish authenticity of externally supplied evidence.

- Historical design item (superseded by sections 17–18): P2.1 Record the selected producer, input schema, baseline/candidate/evaluator identities and command allowlist in this section before implementation. Recompute all required hard conditions, not only the final objective.
- Historical design item (superseded by sections 17–18): P2.2 Reproduce forged `correct=true` after hard-test failure and impossible counts as negative fixtures. Require rejection even when the supplied objective numerically matches.
- Historical design item (superseded by sections 17–18): P2.3 Add strict attestation validation: verdict fail/unavailable, digest mismatch, evaluator drift and missing report cannot become independent success. Preserve P1-only and legacy paths.
- Historical design item (superseded by sections 17–18): P2.4 Run only the selected producer's authorized deterministic recomputation and contract tests; record original and verifier artifact hashes separately. A successful process exit is not the same as a passing verdict.
- Historical design item (superseded by sections 17–18): P2.5 Keep test skips, missing evidence, and incomplete checks explicit. Synchronize the actual verification boundary into plan/CODEBASE/memory; no autonomous rerun/retry loop.

## 11. Historical SIE-P5 design — implemented scope in sections 17–18

No concrete Agent Core controlled-experiment consumer was found. Do not install a helper merely to copy the formula. Code audit size, test-pass count, memory count, token count, and tool-call count are not automatically quality objectives or valid treatment/control observations.
If selected, define one measurement domain, fixed opportunity denominators, contemporaneous baseline/control, attribution producer, minimum sample policy, and authorized verifier. The upstream constant 20 is an example threshold, not a statistically justified universal default.

**Proposed files:** new `src/learning/controlled-outcome.ts` and `tests/learning-controlled-outcome.test.ts`, plus exactly the named consumer file once selected. No AVO-lite, scheduler, budget engine, or autonomous optimization service.

```ts
// Proposed pure result; input validation precedes this arithmetic.
// Every count is a nonnegative safe integer; opportunities meet the explicit minimum.
const objective = candidateSuccesses / candidateOpportunities
  - baselineSuccesses / baselineOpportunities;
return { correct: true, objective };
```

Correctness requires Boolean hard flags to be true, a positive substantive-action count, and successes within their fixed opportunity counts. Reject fractional/string/Boolean counters, nonfinite values and overflow; never copy Python's coercive `int(...)` behavior. Correctness does not imply positive improvement, causal attribution, or statistical significance. Those remain separately specified experimental judgments.

- Historical design item (superseded by sections 17–18): P5.1 Name the consumer, counted unit, denominator ownership, minimum samples and independent baseline evidence before adding source files.
- Historical design item (superseded by sections 17–18): P5.2 Add positive control 15/40 minus 8/40 = 0.175, plus negative/zero improvement, zero/small denominators, impossible counts, false attribution, no action, fractional counters, Boolean counters and nonfinite values.
- Historical design item (superseded by sections 17–18): P5.3 Implement only the selected pure validation/arithmetic and wire the named consumer into P1/P2's explicit evidence path. Do not make it a universal agent score.
- Historical design item (superseded by sections 17–18): P5.4 Independently recompute from the same immutable fixture bytes; preserve evaluator/input/verifier hashes and all unverified cases. Synchronize docs and memory if the conditional feature is actually implemented.

## 12. Cross-cutting acceptance and change boundaries

Only execute tests belonging to selected proposals. Inspection probes already run in this audit do not authorize unrelated regression, real Phone commands, language-provider installation, root recovery or runtime restart.

Read current source and registration again before editing public signatures or schemas. The native call chain is `mcp/learning-tools.ts -> LearningService.review -> LearningReviewCoordinator.review -> LearningSinkManager.capture -> Memory/Grafel sink`; existing source inspection proves this even though the graph's class impact is sparse.

Each selected task starts with a scoped backup and failing behavioral test, then minimal implementation, selected compilation, same-case compiled verification, and docs/memory readback. Use installed local toolchains; isolate evidence/build output in a task-specific runtime directory. Do not mask missing-source diagnostics by calling an incomplete root build successful.

Example selected test invocation from project root: `runtime\node\node.exe node_modules\vitest\vitest.mjs run tests/learning-review-summary.test.ts`. Substitute only the other selected test paths specified above. Inspect the installed runner/config before executing; missing dependencies/source are reported honestly, not silently repaired or installed globally.
### Review focus and required negative cases

1. Failure versus no-action: P4 must preserve failed/unavailable/rejected counts and report mixed batches honestly.
2. Forged or malformed success: P1/P2 must reject false correctness, empty proof structures, coercive numbers and mismatched candidate/input identity.
3. Evidence loss: P1 rejects over-budget descriptors; P3 labels omitted metadata and uses a bounded pointer rather than implying a truncated string is complete proof.
4. Duplicate and correction semantics: P3 does not overwrite prior accepted knowledge, manufacture exactly-once guarantees or let an unverified correction invalidate a prior memory.
5. Unavailable helpers or runtime: no task treats skipped tests, missing release scripts, a healthy graph flag, or a process exit code as behavioral success.

Keep `learning` as the same MCP tool and retain all five existing actions. Any proposed action or provider contract expansion outside this document needs separate review. Evaluation and lineage additions remain optional and explicitly bound; legacy clients must retain their current request shape.

Before claiming compatibility, inspect actual release/compatibility adapters. Historical plan requirements that `release:check-intent` or `release:compat` must be healthy are not proof that those scripts exist now. If unavailable, report that limitation and verify the affected schema/source closure without pretending full release verification succeeded. Never recover from the legacy Git remote or run release apply automatically.

For material implementation, create one task-scoped patch intent and update the affected CODEBASE section plus a dedicated canonical memory. Root `MEMORY.md` is not a substitute for `runtime/memory` tool-managed records. Do not overwrite other adoptions' records. This planning audit itself needs no changeset/version bump.

### Activation and rollback

A selected source implementation remains unactivated until an explicitly authorized cutover. Preserve old binary/module/metadata hashes and install only the qualified changed closure. Restart one owner at a time, then verify installed bytes, fresh process identity, relevant MCP behavior and Memory health. Do not kill unrelated processes, reset OAuth, replace all dist, or deploy/publish as a side effect.

Failure before cutover leaves production unchanged. Failure during a separately authorized cutover uses the verified task-specific rollback artifacts. Candidate verification, installed-runtime verification, and any stable release are separate recorded states.

## 13. Rejected and deferred mechanisms

Do not install the full ecosystem, AVO-lite, Python evaluator runtime, an autonomous candidate generator, hidden second model, continuous optimizer, OS role fleet, generic policy/permission engine, new canonical event database, external deadman, spending budget controller, or automatic deployment/promotion/rollback.

Agent Core already owns Memory, Learning, Reflexion, Tracker, Grafel patterns/repair and release boundaries. Reuse them. The reference's declarative policies, observer/deployer stubs and event names do not justify new runtime authorities. Sensor freshness, live backups, generic graph supersession and independent-evaluator execution require specific separately selected consumers; their declarations do not establish implementation.

## 14. Retention and closure

**RETAIN.** At grounding P4/P1/P3 had demonstrated current-fit value; they are now implemented and live. P2/P5 remain conditional. This activation did not repeat the final source-first retirement census and does not authorize treating unresolved conditional mechanisms as completed. No reference deletion was performed.
Future retirement requires a new source-first census after selections are resolved, a clean exact checkout, no active dependency, and explicit scope confirmation. A folder is not useless merely because its code is not imported; conversely, hypothetical future features alone should not justify indefinite retention. The present retention decision rests on current named consumers, not hypothetical autonomy.

The audit covers this local revision's source families, schemas, test definitions, fixtures and available ref inventory. It does not claim semantic exhaustion of remote branches not fetched, future upstream commits, all possible design adaptations, or unrelated Agent Core subsystems. Positive evidence is sufficient to reject deletion now.

### Planning-task closure checklist

- [x] Existing plan found and read completely; no duplicate active plan created.
- [x] Reference revision, source/test families and all 48 worktree files accounted for.
- [x] Current native source and installed-method probes distinguish actual gaps from already implemented behavior.
- [x] Prior overclaims corrected with seven reference probes and six isolated native probes.
- [x] Proposal IDs retained, priorities/dependencies revised, and installation remains subject to user selection.
- [x] Original plan and CODEBASE backed up before documentation replacement.
- [x] Final source/reference integrity and exact plan/CODEBASE readback recorded.
- [x] Canonical local audit memory saved and read back with matching proposal-only state.

Final evidence: `reference-inventory.json`, `native-snapshot.json`, `dependency-review.json`, `source-family-census.json`, `contract-probes.json`, `native-contract-probes.json`, `structural-review.json`, `git-provenance.txt`, `final-integrity.json`, and `docs-memory-readback.json` under `runtime/tmp/sie-regrounding-20260923/`.

The original plan snapshot and CODEBASE backup remain under `runtime/backups/sie-regrounding-20260923/`. Earlier foundational-memory, release-tooling, graph-count and live-activation statements in the old plan are historical; they are not silently reused as today's runtime guarantees.

Canonical continuity memory: `2820c59d-9e92-41c5-821a-31da35c8837a` (saved and read back through Memory tools).

## 15. Approved implementation result — 2026-09-23

**Historical implementation checkpoint: SIE-P4/P1/P3 IMPLEMENTED — SOURCE AND COMPILED CANDIDATE TESTED; not yet activated at that checkpoint. The subsequent activation checkpoint is in section 16; current closure is in section 18.**

The user approved the plan. P4, P1 and P3 were implemented using existing native owners. P2/P5 were not installed because their prerequisite producer/controlled-experiment consumer is still absent. This does not mark those conditional proposals complete.

Final verification: three test files, **68 PASS / 0 FAIL / 0 SKIP** on selected source and **the same 68 cases** on the compiled candidate. Coverage includes the real isolated MemoryService, preserved duplicate bytes, malformed evidence rejection, bounded decision/correction telemetry, tracker failure without recapture, and real MCP SDK client/server calls using isolated transports. Legacy schema comparison finds exactly four optional candidate fields added and no change to old field contracts or the five actions.

Compilation is deliberately qualified: TypeScript 6.0.3 reports **29 pre-existing dependency diagnostics on both backed-up and current source, zero additional diagnostics**, and emits eight selected modules. Missing pre-existing source uses installed unchanged JavaScript with explicit provenance (allowJs=true/checkJs=false). No clean full-root strict build is claimed. The assembled candidate has 23 JavaScript modules: seven changed programs, one byte-identical type-only program and 15 unchanged installed dependencies.

Actual source: `src/learning/{types,review-summary,evaluation,decision-evidence,review,service,memory-sink}.ts` and `src/mcp/learning-schemas.ts`. Evaluation output is `declared`, not independently verified. Correction events identify a declared target with `targetExistence: not-checked`; no prior Memory/Pattern record is mutated. No registry, scheduler or second store was added.

Report: `docs/SIE-Adoption-Execution-20260923.md`.
Candidate: `runtime/build/native-sie-20260923/dist/`.
Evidence: `runtime/tmp/sie-implementation-20260923/`.
Backup: `runtime/backups/sie-implementation-20260923/`.
Patch intent: `.changeset/20260923-sie-learning-evidence.md`; product remains 0.12.0.
Canonical continuity record: `2820c59d-9e92-41c5-821a-31da35c8837a`.

**CLOSED: installation, authorized restart and installed-runtime readback completed in the subsequent activation task.** The implementation-stage statement that active dist was unchanged is historical. Other repair tasks remain separate; the SIE reference is retained pending any separately scoped final census.


## 16. Authorized activation completed — 2026-09-23

**COMPLETE — SIE-P4/P1/P3 LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.**

14/14 installed artifact hashes match, 321/321 preserved artifacts remain unchanged, and the same 68 cases pass against installed dist with no failure or skip. Live authenticated HTTP MCP acceptance passes 10/10 checks, exposes 62 tools/five existing Learning actions/four optional SIE fields, rejects failed/malformed evaluations, and leaves production durable records unchanged. The temporary acceptance key was revoked. New Core PID 5196 started after installation; Core/Memory/Learning are healthy and tunnel readiness is HTTP 200.

Report: `docs/SIE-Activation-20260923.md`. Evidence: `runtime/tmp/sie-activation-20260923/`. Backup: `runtime/backups/sie-activation-20260923/`. Canonical record: `2820c59d-9e92-41c5-821a-31da35c8837a`. P2/P5, 29 baseline compiler diagnostics, and three unrelated Semantic IDE issues retain their separate status. No release or further user restart is required.

## 17. Approved P2/P5 completion and system repair — 2026-09-23

The user explicitly requested completion of P2/P5 and repair of the remaining system errors. P4/P1/P3 remain live while the new work is qualified.

Named consumer: `scripts/learning/evaluate-retrieval.mjs`, an explicitly invoked offline report command. It consumes a fixed reviewed query cohort and a separate baseline/candidate ranked-result artifact. Cohort query IDs and expected memory IDs determine fixed opportunity denominators; observation IDs must match exactly once. Minimum sample size is explicit, not automatically 20. The command does not alter retrieval algorithms or persist memory.

Named independent producer: `src/learning/retrieval-verifier.ts`, exposed by `scripts/learning/verify-retrieval.mjs`. It independently rechecks the same immutable cohort/observation bytes, every hard condition and the reported objective. It does not call the scorer or trust the submitted correctness flag. Invalid inputs, forged success counts, failed hard flags, digest/revision mismatch, and non-reproducing scores cannot become passing recomputation.

P5 pure primitive: `src/learning/controlled-outcome.ts`. The consumer derives integer hit/opportunity counts from the fixed hit-at-K cohort; positive, zero and negative observed differences remain distinct from validity and statistical significance.

P2 optional envelope additions: `inputsDigest` and `verification` with method, verdict, verifier revision, evaluator revision, inputs digest and result evidence. A bound passing report is labeled `controller-attested-recomputation`, never artifact authentication by Agent Core. Failure/unavailability/mismatched identity rejects evaluated capture. P1-only and legacy paths remain supported.

Output reports include input artifact hashes and implementation identities. The controller/user supplies and reviews the corpus/labels; verification proves recomputation of those supplied artifacts, not truth of the original observations or a production quality gain. No hidden model, automatic evaluator execution, new MCP action, scheduler, registry, or memory store is introduced.

Implementation, tests, root recovery, installed qualification and residual assistance needs are recorded in `docs/System-Repair-SIE-Completion-20260923.md` and `runtime/tmp/system-repair-sie-final-20260923/`. The earlier conditional status is historical for this newly approved scope, not an instruction to invent production benchmark results.


## 18. Resumed installed verification and closure — 2026-09-23

**SIE-P1/P2/P3/P4/P5 complete for the approved controller-declared/explicit-offline scope.** Fresh installed tests: 284 PASS, 0 FAIL, 0 SKIP; HTTP MCP: 19/19; 339/339 artifact hashes; six changed programs loaded; full-root no-emit typecheck exit 0 without diagnostics. No reinstallation or Core restart in this continuation. The 284 cases are the same selected cases as qualification, not additional unique tests.

P2/P5 are no longer conditional proposals: their named scorer/verifier/CLI consumers are implemented and installed. Their bounds in section 17 remain authoritative: no automatic promotion, no arbitrary artifact authentication and no claimed production quality improvement. P4/P1/P3 remain implemented and installed.

System-wide recovery is NOT declared complete. Git objects/current-line-baseline, missing external Hermes home, two C#/PowerShell session-readiness timeouts, historical data and installed debugger-map warnings remain separately OPEN. All three managed provider installations are present and all three live symbol queries succeed; that does not negate the two readiness health issues. Report: docs/System-Repair-SIE-Completion-20260923.md. Evidence: runtime/tmp/system-repair-sie-final-20260923/resume-20260923/.


## 19. Post-completion source-first census — 2026-09-23

**HISTORICAL AUDIT CHECKPOINT BEFORE SUBSEQUENT USER APPROVAL — NOT SELECTED, NOT IMPLEMENTED. SIE-P1 through SIE-P5 remain complete for their previously verified scope.**

This follow-up examines the same pinned SIE checkout and the newly named Awesome survey checkout. It does not reopen completed P1–P5 or authorize installation. Evidence root: `runtime/tmp/sie-awesome-regrounding-20260923/`.

### 19.1 Evidence and limits

The current SIE checkout is Git-clean at `f06504750b32c3b6a6e06b56ee6e69dc4476f333`: 48 tracked files, 115,778 bytes excluding Git. All 13 Python/shell source/test/stub files were read, and all 48 files were hashed and classified. The five operational stubs still print unconfigured messages and exit 2; they are not functioning publishers, sensors or rollback implementations. Schemas are declarations, not an enforcement engine.

Current native grounding inspected the Learning review/coordinator, existing Memory/Grafel sinks, evaluator/verifier, controlled arithmetic, report CLI/I/O, MCP schema and relevant tests. `native-probes.json` records bounded calls to installed code, three tiny CLI-generated reports and a simulated I/O failure; no synthetic claim was persisted to production. A stub Memory list was used only to exercise the real sink's duplicate predicate.

A child-only `ENOSPC` injection was used instead of filling E:. It establishes an interrupted-bundle behavior, not a new production outage. A first probe-launch attempt failed before report-directory creation; the helper was corrected to use a file URL for the Windows ESM preload. It is not counted as a product failure. No broad tests, installation, source patch, release or restart ran.

Grafel reported current before structural inspection. Its impact result for `MemoryLearningSink.findDuplicates` had seven affected entities, mostly module/test nodes; exact source tracing remains primary. Do not infer complete reachability or test coverage from that graph.

### 19.2 Current gaps actually demonstrated

| Finding | Exact native owner / observation | New proposal |
| --- | --- | --- |
| Report completeness is not a durable bundle fact | `scripts/learning/evaluate-retrieval.mjs` writes final-directory members sequentially; `report-io.mjs::writeExclusive` protects each file, not the bundle. Injected failure at provenance write leaves cohort, observations, score and verification files, but no provenance/candidate. The CLI correctly exits 2; no false-success bug is claimed. | SIE-P6 |
| Distinct report claims collide in legacy deduplication | CLI emits the same title for every report; `src/learning/memory-sink.ts::findDuplicates` deduplicates equal normalized content OR equal title/category. Two distinct input digests were rejected as duplicates of the first synthetic record, including a third report with a different objective/content. | SIE-P7 |
| Net improvement hides which cases regressed | Valid case-swap and unchanged observations both yield objective 0 and identical aggregate metrics despite two versus zero regressions. | Owned by ASI-P1 in the companion Awesome plan; do not duplicate implementation here. |

### 19.3 Selection and approach

- [x] **SIE-P6:** complete, replay-checkable offline report bundles; recommended first.
- [x] **SIE-P7:** identity-safe generated report claims; independent selection, share the P6 report identity when both are selected.

Directly installing SIE/AVO would add unrelated topology and still not fix these native gaps. Replacing Memory's generic deduplication would have unnecessarily broad compatibility impact. Prefer the narrow report producer/reader changes below. These are **native adaptations of upstream evidence/identity mechanisms**, not claims that upstream already implements a transactional report service.

## 20. SIE-P6 — complete, replay-checkable report bundle

**Status: IMPLEMENTED; source/candidate verified, see section 23.** Source seed: `scripts/avo-to-event.py` materializes evidence digests and candidate identity; `schemas/event.schema.json` supplies lineage vocabulary. `docs/event-model.md` and `docs/promotion.md` explain the distinction between artifact presence, acceptance and publication. The bridge itself overwrites an export and can omit missing artifacts: reuse the identity/evidence idea, **not those weaknesses**. Atomic bundle semantics below are a new native design, justified by the observed interruption.

**Target files:** modify `scripts/learning/evaluate-retrieval.mjs` and `report-io.mjs`; add `scripts/learning/verify-report-bundle.mjs`; extend `tests/learning-retrieval-cli.test.ts` and add `tests/learning-report-bundle.test.ts`. Prefer keeping code in the existing offline CLI layer; add a pure helper only if necessary. Do not change MCP actions, MemoryStore, runtime activation or the version-1 score/verifier schemas.

**Contract:** publish a bounded `report-manifest.json` last, after all required files have been written, synced and read back. It records schema version, stable report identity, exact member names/byte counts/SHA-256, input binding, evaluator/verifier revisions and outcome. Completeness and verdict are distinct: a complete failed evaluation is valid evidence, not an eligible claim. `review-candidate.json` is required only for an eligible evaluation and remains `verified:false`.

The explicit bundle reader rejects a missing/truncated marker, unsafe member path, symlink/nonregular member, digest mismatch, missing required member, unexpected member or inconsistent input/revision binding. It independently recomputes using the existing verifier. A marker/hash proves consistency of supplied files, not authenticity or statistical significance. Legacy reports without a marker are reported `legacy-unsealed`, never silently upgraded or deleted. Report helpers remain tools for explicit inspection, not machine-control gates.

**Failure behavior:** retain incomplete artifacts for diagnosis, exit nonzero, do not overwrite a previous report, and do not auto-retry, clean up other directories or capture memory. Use existing exclusive writes and drift checks; a truncated completion marker is rejected on replay. Do not promise power-loss durability beyond the filesystem guarantees actually verified.

**Implementation sequence after selection:**
1. Add negative fixtures for interrupted member writes, truncated marker, altered score, missing verification, wrong input binding, path traversal and already-existing output. Include complete success and complete failure. Demonstrate the current incomplete-directory ambiguity through the real CLI.
2. Define one bounded manifest/identity helper and completion-reader contract. The manifest does not include its own digest. Reuse `readArtifact` protections; reject unbounded files/counts before reading.
3. Publish the marker last and require successful readback before the CLI announces a complete bundle. Preserve old score fields, stdout compatibility where possible, exit 2 for infrastructure failure, and source/approval boundaries.
4. Add read-only CLI help and explicit bundle verification; no candidate capture or production state access. Exercise the same cases against candidate/installed code only when those stages are authorized.
5. Update this plan, CODEBASE, memory and one patch intent for the selected material behavior change. Activation remains separately authorized.

**Acceptance:** injected ENOSPC never leaves a replay-acceptable complete bundle; existing outputs stay byte-identical; valid complete failure remains distinguishable from I/O failure; changed bytes/identities fail verification; candidate remains unapproved; production memory/tool count remain unchanged. Use tiny fixtures, no full-dist per-process copies, and preserve negative evidence.

**Dependency:** none on new providers or SIE control plane. Review SIE-P7 together to avoid two divergent report-identity formulas. Rollback affects only selected report code; old immutable report directories remain intact.

## 21. SIE-P7 — prevent distinct generated evaluations from collapsing into one claim

**Status: IMPLEMENTED; source/candidate verified, see section 23. The generic memory engine remains unchanged.** Source seed: `scripts/avo-to-event.py` derives candidate identity from ecosystem/loop/tick and carries artifact identity; existing P3 provides a bounded `candidateId` and `auditRef`. These mechanisms are already partly adopted. The remaining adaptation is at the native retrieval-report producer.

**Target files:** `scripts/learning/evaluate-retrieval.mjs`, a shared report-identity helper if P6 selects one, `tests/learning-retrieval-cli.test.ts`, and `tests/learning-decision-evidence.test.ts`. Read `MemoryLearningSink.findDuplicates` and `LearningSinkManager.capture` to verify behavior, but **do not alter their legacy predicate by default**.

Define a domain-separated report key from input digest, evaluator/verifier revisions and the selected implementation hashes. Exclude output path, timestamp and random run directory. Use the full collision-resistant key in the bounded generated title and candidateId; include experiment/candidate/baseline/cohort identity in the factual claim body. Keep source auditRef to the existing provenance artifact, no raw private query text or result bodies in telemetry.

**Implementation sequence after selection:**
1. Turn the demonstrated same-title collision into a failing regression through the real producer and existing sink. Use isolated memory only. Two different experiments with equal objective, and a different objective with equal title, must stay distinguishable.
2. Generate stable identity-bearing title/content/candidateId. Ensure the identity formula is shared with P6 when selected; do not add a second registry or persistent ID database.
3. Re-run the same supplied inputs under the same implementation at a different output directory: it must deduplicate without rewriting the earlier record or audit pointer. Input/revision/implementation changes must yield a different report key.
4. Keep the current generic `title/category` and normalized-content behavior for ordinary legacy claims. Existing P3 test that preserves the first audit pointer on a true duplicate must keep passing.
5. Verify default report candidates remain `verified:false`; generating a unique ID is not approval, exactly-once persistence, a security principal, or a new mutation authority. Update docs/memory and selected patch intent.

**Acceptance:** distinct report identities are not suppressed, exact repeated report claims remain duplicates, all fields satisfy current MCP bounds, ordinary claim compatibility remains, and no prior production record is modified. Existing accidentally collapsed reports are not auto-recovered; an operator must explicitly re-review the original evidence.

## 22. Exhaustion ledger and retention decision for this revision

| Source family | Disposition after current comparison |
| --- | --- |
| Controlled score/verify, no-action semantics | Core concepts already implemented in P1/P2/P4/P5; keep reference tests/negative examples, no duplicate scorer or Python runtime. |
| Event identity, evidence digests and lineage | P3 already covers decision correlation; P6/P7 cover two newly demonstrated producer/report gaps. No second event store or global transition lock. |
| Validator, ecosystem/policy schemas, installer | Retain as inspectable source; no adoption of its handwritten schema validator, root topology, authority engine or AVO installation. Native Zod and explicit operator policy already exist. |
| Promotion/sensor/health/rollback stubs | They are three-line exit-2 placeholders, not missed runnable features. Do not manufacture implementation claims from the docs. |
| Remaining docs, skill/template text, fixtures, CI | Guidance/examples/license/provenance; no new runtime import justified. CI/package dependencies are not an Agent Core feature. |

**RETAIN both named reference folders.** SIE has two reviewable adaptations above; Awesome has separate positive, source-qualified proposals in `Awesome-Self-Improving-Agents-Steal-Use-Integration-Plan.md`. This is a bounded census of these exact local snapshots plus the specifically recorded GEPA files, not a proof that every future idea or linked repository is exhausted. No deletion condition is met. Current Git/Hermes/readiness repair residuals remain outside this planning task.

## 23. Approved P6/P7 plus companion ASI implementation — 2026-09-23

**IMPLEMENTED — SOURCE AND ISOLATED CANDIDATE VERIFIED.** The user approved both named plans, selecting P6/P7 and ASI-P1/P2/P3, and permitted necessary helper installation. All five are implemented. Existing local Node/TypeScript/Vitest and Python stdlib sufficed; no dependency installation was needed. No activation, restart, commit, release apply or product-version change occurred.

P6 owns the new shared `scripts/learning/report-bundle.mjs` and `verify-report-bundle.mjs`, plus narrow changes in `evaluate-retrieval.mjs` / `report-io.mjs`. It publishes the exact bounded marker last, distinguishes complete failure from incomplete evidence, and replays scorer/verifier and every binding. P7 uses the same identity for title/content/candidateId, preserving generic Memory dedup and the original pointer on exact repeated captures. Ordinary legacy claims and default `verified:false` remain compatible.

Acceptance: 123/123 selected cases pass in each of two stages, 0 failures/skips. Source stage uses source modules plus candidate CLI; candidate stage switches the three new ASI modules to compiled artifacts and uses the same candidate CLI. Unchanged legacy owners remain in isolated regression fixtures. These are the same 123 cases, not 246 unique cases or a full-project/runtime acceptance suite. Real isolated Memory, ENOSPC injection, forged-score rehashing, incomplete/oversized markers, membership/path failures and a simulated symlink identity are covered. Actual host symlink creation and power-loss recovery are not claimed.

Selected strict compilation exits 0 with no diagnostics; candidate has 12 JavaScript modules plus maps and six small CLI files, not a full-dist worker copy. All 1,521 active-dist files and 97 protected-reference files retain their baseline hashes. All 12 pre-sync canonical notes are unchanged; no synthetic production learning claim was persisted. Existing missing-source-map warnings are unchanged. SIE-P1–P5 installed status is preserved.

Report: `docs/SIE-ASI-Offline-Reports-Execution-20260923.md`. Candidate: `runtime/build/sie-asi-20260923/`. Evidence: `runtime/tmp/sie-asi-implementation-20260923/`, including source/candidate JSON reports, RED evidence, GEPA comparison, implementation integrity and final docs-memory readback. Backup: `runtime/backups/sie-asi-implementation-20260923/`. Patch intent: `.changeset/20260923-sie-asi-offline-reports.md`.

Canonical implementation record: `cad67ec4-a591-4a93-9b28-8e4bb8899a65`. The prior audit record `c5bf2c4d-2f80-4a4d-b070-f3ec6b9a9bcd` is updated to distinguish its historical proposal-only checkpoint from this approved implementation. Both references were retained at implementation completion; the subsequent explicit final census in section 24 retired only SIE and preserved Awesome. This supersedes the earlier retention decision, not the implementation evidence. Git/history, Hermes home and C#/PowerShell readiness residuals are not repaired or reclassified by this task.

## 24. Final current-fit census and reference retirement — 2026-09-23

**REFERENCE RETIRED / DELETED. Additional current-fit SIE adoption proposals: NONE identified.** The user explicitly requested deletion of this exact checkout if no useful additional adoption remained. Source/candidate implementation and runtime activation remain separate facts; deletion did not activate anything.

All 48 worktree files match the earlier audit, and all 13 Python/shell implementation/test/stub files were reread. The four local commits and all local ref tips were accounted for without a fetch. Existing P1–P7 covers the selected correctness, independent recomputation, correlation, outcome, completeness and report-identity mechanisms. Native ASI reports cover case regressions and controlled comparison. No duplicate SIE/Python/AVO runtime is needed.

The remaining validator/scaffold/installer does not improve a demonstrated native consumer; the policy/event schemas declare contracts rather than implementing a policy or deployment service. All five operational stubs are three-line unconfigured/exit-2 programs. Remote publication, external deadman, automatic promotion/rollback, generalized live evidence freshness and autonomous optimizer proposals still lack an approved corresponding consumer and are not adopted merely to fill the source inventory. These decisions do not imply those concepts are useless in other systems.

Native content searches over `src`, `scripts`, and `tests` returned no reference to either named checkout; root package inspection and current relative imports likewise establish no direct checkout dependency for the adopted report code. No running process command line referenced the SIE path. Owned source, the 32-file candidate, existing rollback backups and the full SIE MIT notice remain outside the removed folder.

Immediately before deletion, the exact parent/name, absence of reparse points, full worktree file set/hashes, clean Git status and pinned HEAD `f06504750b32c3b6a6e06b56ee6e69dc4476f333` were rechecked. Removal succeeded, exit 0, and the target was absent afterward. Removed: 48 worktree files plus 28 Git metadata files, 76 files / 205,855 logical bytes. This is not a measured free-space delta. No full copy of the retired checkout was created elsewhere.

The Awesome survey is **not** retired: its companion plan section 10 identifies an additional bounded methodological proposal, ASI-P4, not yet selected or implemented. Earlier statements that both checkouts were retained are historical checkpoints superseded by this section.

Evidence: `runtime/tmp/sie-asi-retirement-audit-20260923/{inventory-before,grounding,deletion-precheck,deletion-result}.json`; report: `docs/SIE-ASI-Reference-Retirement-Audit-20260923.md`. Existing licenses, source pins, audit artifacts and implementation backups remain inspectable. Historical audit scripts that explicitly reread the retired checkout require restoring that pinned reference before reuse; they are not production dependencies.

Scope limit: this is a current-Agent-Core practical adoption decision for the exact local revision, not proof that no possible future adaptation or externally linked repository has value. No source patch, dependency install, new test suite, build, reindex, activation, restart or release occurred in this audit.

## 25. Exact-snapshot reappearance census — 2026-09-27

A checkout reappeared at the protected reference path and was re-grounded before any new proposal was considered.

Evidence:
- current HEAD was exactly the same historical revision `f06504750b32c3b6a6e06b56ee6e69dc4476f333`;
- old retirement inventory expected 48 non-Git files with per-file SHA-256;
- after removing the temporary Grafel audit marker, current checkout was **48/48 exact byte match**: no missing, extra or changed source file;
- active Agent Core `src`, `scripts`, and `tests` had zero dependency-path matches;
- external process census found zero process consumer.

Because the source snapshot is identical to the one exhaustively adopted/rejected in section 24, there is no new source-backed mechanism to reconsider. Repeating the old implementation review would create no new evidence.

**New proposals requiring user review: NONE.**

Under the user's explicit corpse rule, the reappeared checkout was deleted again on 2026-09-27. Historical plans, native implementations and prior adoption evidence remain the authority.
