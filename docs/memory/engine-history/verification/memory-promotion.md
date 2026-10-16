> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../../CONSOLIDATION.md).

# Consolidation and promotion verification

Date: 2026-10-07 UTC. T5 implementation evidence; **G5 independent review passed at 19:08 UTC**.
Baseline: `67c209b9a25b571c40ef4147ec7ab1d47bc2ed14` on `feat/memory-evolution`.
Synthetic, temporary Linux stores only. No user memory, credentials, model service, Windows execution, release, or deployment.

## Public contract and ownership

`ControllerMemorySession.prepareConsolidation({ episodeId, expectedRevision, operationId, proposal })`
accepts a strict object or a JSON string containing `{ actions: [...] }`. It returns a persisted `ConsolidationPlan`, without changing canonical notes or episode state. Unknown fields, invalid types, unsafe raw strings, fabricated/unavailable refs, unsupported verification, and scope mismatches fail closed. There is no append-all fallback.

`applyConsolidation({ planId, expectedPlanDigest, operationId })` reads the saved preview, checks the exact digest and engine-built dependencies, obtains required host review, and publishes through the existing T2 transaction owner. Its `PromotionReceipt` includes `planId`, `receiptId`, `canonicalRefs`, `episodeRevision`, `duplicate`, `indexStatus`, and additive `auditRef` for paged audit expansion.

The transport-neutral facade never accepts raw filesystem changes, host review claims, a caller-built read set, or an approval boolean. Type exports live with the promotion domain owner and are re-exported at the package root. The canonical v2 metadata validator is reused rather than forked. Existing store/archive transaction owners, archive layout, immutable receipts, and legacy `consolidate()` behavior are unchanged.

### Action values

Every action has `actionId`, `kind`, nonempty `inputRefs` (at most 64 unique direct refs), and `reason`. A preview has 1–100 actions, with unique action IDs. Proposed canonical body is limited to 200,000 Unicode code points.

- `create`: `value` contains `content`, `experience`, and optional ordinary RememberInput fields (`title`, `keywords`, `context`, `tags`, `category`, `links`, `source`, `provenance`, `expiresAt`). The engine owns new UUIDs, timestamps, workspace provenance, access counters, pin state, and history.
- `amend`: an exact memory `target` SourceRef and the full proposed semantic `value`. Omitted optional semantic fields take documented canonical defaults; this is not a patch. Current access statistics/history are retained, and T2 archives the old semantic record before replacement.
- `merge`: a full `value`, optional exact `target`, and `assertions: [{ text, inputRefs }]`. Mapping text joined with newline must reproduce the whole resulting body; mapping refs must belong to action inputs. This is a coverage check, not proof that source bytes entail each assertion or condition.
- `retain`: records the candidate and reason in the immutable audit; no canonical claim is created.
- `conflict`: records the unresolved relationship among input refs and its reason in the audit; it does not select a canonical winner or resolve an obligation.
- `supersede`: explicitly returns `MEMORY_TEMPORAL_UNSUPPORTED`, including requests carrying future temporal payload fields. T6 owns that transition.

T5 accepts ordinary non-temporal links only. New `supersedes` links and link-validity transition fields are not accepted through proposal values. New canonical archive-tier values and transitions into archive are rejected with `MEMORY_CONSOLIDATION_INVALID` until T7 supplies archive filtering. An amendment preserves an unchanged pre-existing archive tier instead of silently normalizing it. RecordExperience validity and temporal classifications are stored metadata; they do not enable historical queries. A caller-proposed `verified` label is always rejected. T5 also rejects `verification.method`, `verifierRevision`, and `verifiedAt` on both `supported` and `unverified` proposed values: no verifier runs in this path. Put ordinary support explanations in the action reason/evidence, not verifier metadata. Existing persisted metadata remains readable and may be retained without canonical change; the persistence schema is not weakened. `supported` requires available referenced evidence and remains an assertion about support; no host verifier is executed here. A historical hypothesis cannot be turned into a fact by substituting the source's newer current revision.

### Host review boundary

The additive host-only initialization option is:

```ts
consolidation?: {
  allowExactDuplicates?: boolean; // default false
  review?: (plan: ConsolidationPlan) => Promise<{
    digest: string;
    reviewer: string;
    reason: string;
  } | null>;
}
```

Both `MemoryService.initialize`'s fourth argument and standalone initialization accept it. It is not part of controller scope or proposal input. The reviewer must approve the exact plan digest; `null`, no callback, or a different digest fails `MEMORY_CONSOLIDATION_REVIEW_REQUIRED`. Approval records who reviewed and why in the audit. The callback receives a deep copy outside the writer lock; changing that copy cannot change the stored/published plan. All dependencies are CASed again afterward.

The host is responsible for actual semantic review and for any user confirmation its application needs. A callback that blindly returns every digest is not independent review. Tests use synthetic approvals to exercise the engine boundary, not to claim semantic verification.

Only exact duplicate/provenance-only convergence may avoid review, and only with `allowExactDuplicates: true`. Equality includes body, title, context, keywords, tags, category, links, provenance, expiry, epistemic type, temporal class, validity, verification metadata/evidence, and retention. Only `experience.sourceRefs` may be added without changing that comparison. Different rare conditions, applicability metadata, hypotheses, or validity intervals cannot pass the automatic path. Exact duplicate creates within one preview converge into one result, with `convergedIntoActionId` identifying the other action and all source refs retained. Similarity is only a candidate suggestion.

## Snapshot, preservation, and replay

1. T3 supplies a scoped, visibility-checked episode snapshot and exact immutable lineage. T5 builds read sets from action sources, nested source groups, canonical experience provenance, targets, link endpoints, and scoped candidate records. Arbitrary caller read sets are rejected.
2. Candidate comparison uses `findConsolidationCandidates` with pre-scoped records, outside the snapshot lock. Missing/incompatible semantic index data falls back to lexical comparison.
3. Preview digest binds actionable output, host scope/root identity, sources, expected episode revision, comparison results, and an internal dependency fingerprint. Operational status is excluded from that digest.
4. Apply rechecks exact bytes/revisions and the scoped canonical candidate set, then rechecks them in the synchronous transaction planner after optional host review. Even a new canonical record appearing during review conflicts instead of invalidating the duplicate-absence decision silently.
5. Canonical before/after snapshots, promotion audit, durable operation receipt, updated preview status, and the episode's immutable promotion event/current manifest are one transaction. A promotion event records that consolidation committed; it preserves `open`, `paused`, `completed`, or `abandoned` lifecycle meaning. It does not claim task success or resolve current obligations. No event, episode, or input evidence is deleted.
6. Derived index rebuilding is outside canonical commit. Failure returns a committed receipt with `indexStatus: 'degraded'`. Replay attempts index repair and returns the same canonical receipt without re-promoting.

Namespace is root identity + workspace + task + method + operation ID; controller/session identity is not an idempotency key. Same ID/payload replay precedes stale expected-revision rejection. Same ID/different payload conflicts. A different apply operation ID replaying an applied plan is itself durably bound to that payload. Concurrent callers, restart, and lost responses converge on one canonical receipt.

Preview replay still checks current access to its complete sources and any committed outputs before returning full proposed bodies. Paged promotion-audit expansion also checks full source/output visibility and historical/current scope. Original archived revisions remain readable when authorized, even if the current semantic content has changed. Receipt-only replay returns handles, not hidden record bodies.

Pending previews rejected by source drift remain preserved as pending, with a revision-conflict result; they are not silently rebased or automatically reapplied. Status values `stale`/`rejected` are reserved for a future explicit management workflow. These hashes are integrity/version identifiers, not authentication or proof of truth.

## Complete synthetic before/after example

The runnable test “E07 preview does not publish; reviewed create atomically preserves lineage, receipt and episode without declaring success” exercises this complete path:

1. Start an `open` episode, revision 1, goal `Retain what happened`.
2. Capture exact text: `Observed on Linux only; use ordered CAS; unresolved elsewhere`. Capture returns an available artifact SourceRef, here named `evidence`.
3. Prepare this proposal using the actual returned reference:

```ts
{
  actions: [{
    actionId: 'create-one', kind: 'create',
    inputRefs: [evidence], reason: 'Keep inspected experience',
    value: {
      content: 'Observed on Linux only; use ordered CAS',
      experience: {
        schemaVersion: 1, kind: 'lesson', retention: 'durable',
        epistemic: 'observation', temporal: 'unknown',
        validity: { state: 'unknown' },
        verification: { status: 'unverified', evidence: [] },
        sourceRefs: [evidence]
      }
    }
  }]
}
```

Before prepare and after prepare, there are zero ordinary canonical notes; the episode is still revision 1. The preview contains one complete engine-built v2 record, exact read set, `reviewRequired: true`, and its digest. Host review approves that digest as `host-test-reviewer`, with reason `Synthetic assertions reviewed`.

After apply, there is one canonical lesson with the exact proposed body, observation/unverified classification, and original evidence ref. The episode is revision 2 but remains open. Receipt points to that exact canonical revision and an immutable promotion audit. Audit includes original episode/evidence refs, output ref, full action, digest, and reviewer identity/reason. Expanding the captured artifact still returns `unresolved elsewhere`; the shorter canonical statement did not destroy the limitation in staging. Other tests preserve the limitation in canonical merge output when it is explicitly mapped there. Source resolution alone cannot decide whether this textual shortening is appropriate; that is why the host review is required.

An identical second observation converges only under the explicit duplicate policy and adds provenance. Replacing the body with `Observed on Linux only EXCEPT network filesystems` yields a review-required preview and cannot automatically overwrite or merge the first. A caller declaring an unresolved hypothesis keeps it as a hypothesis, with unresolved episode obligations retained.

## Verification evidence

Commands, run on the final implementation:

```sh
npm test -- tests/memory-promotion.test.ts tests/memory-promotion-recovery.test.ts
npm run verify
npm pack --dry-run --json --cache <writable-cache>
git diff --check
```

- Full build + suite: **298/298 tests, 15 files, exit 0**, no failed/pending/skipped tests.
- Promotion behavior/recovery: **46 tests** (38 behavior, 8 process recovery).
- Package boundary: **279 files**, **357,032 compressed bytes**, **1,834,029 unpacked bytes**; no runtime, test/helper, private-task, node_modules, or user-data artifacts. Dependencies and lockfile unchanged.
- Initial RED: 16 expected missing-promotion failures. Later RED cases found and fixed candidate-set drift during review, replay-alias payload binding, same-preview duplicate convergence, audit/preview visibility, nested canonical lineage, and the explicit future-temporal error code.
- E07–E10, E15, E24 cover reviewed create/amend/merge, exact before-image, rare constraint/validity/epistemic separation, unresolved hypotheses, malformed JSON/unknown fields/oversize, fabricated refs, unsafe raw strings, unsupported verification, scope, stale episode/target, review mutation/digest, access counters, index degradation, and replay.
- Real child processes are SIGKILLed at preparing, prepared, canonical publication, episode publication, committed marker, and lost response. Recovery proves all-old or all-committed notes/audit/receipt/episode state. A separate amendment kill after replacement proves byte-identical old-note restoration. Two processes race the same apply and get one receipt.

The first aggregate run exposed an obsolete T3 assertion that promotion remained gated; it now expects enabled input validation on v2 while legacy gating remains unchanged. Two later aggregate runs hit existing 5-second deadlines under parallel I/O: the T4 65-ref case, then that case plus the T1 61-record paging case. The isolated T4 case passed in 2.35 seconds; an unchanged 296-test aggregate also passed before the final retention gate. This verifier exposes nine workers by default. A maxWorkers=2 proof run passed all final 298 tests in 34.04 seconds. With parent approval, a minimal Vitest config now bounds scheduling at two workers, retaining every timeout and assertion. Two consecutive final bare `npm run verify` runs each passed build and all 298 tests (36.38s and 31.63s Vitest durations, both exit 0); no test is skipped to obtain a pass. Earlier timing failures remain part of the evidence, not hidden.

## Limits and deferred work

- Semantic assertion coverage is not semantic entailment. Exact duplicate comparison is deliberately conservative. No model, classifier, receipt, or schema marks a statement independently verified.
- Candidate comparison and preservation inspect the scoped set and source graph. This can cause a conservative conflict after an unrelated scoped canonical change and adds I/O/storage; it is not a throughput/scaling claim.
- Existing filesystem lock/journal guarantees apply to cooperating writers on supported local Linux filesystems. No claim covers all power-loss behavior, network storage, old binary co-writers, Windows, or live external controllers.
- Retention transitions, temporal supersession/query behavior, transfer/2, and lifecycle benchmark/oracle work remain T6–T9 responsibilities.
- Artifact refs identify exact retained observations (`requireCurrent: false`), not a claim that an external live file still matches. Reviewer decisions about present applicability must account for that distinction. Current canonical targets/candidate state and all referenced archive bytes remain CAS-bound.
- The previously tracked T7 issues remain separate: `readMemoryAuditRefs` can emit native TypeError for malformed UTF-8, and legacy exact episode/event-history access needs its own visibility-boundary review. This increment does not claim to fix those paths.
- No source purge, staging clear, destructive cleanup, automatic semantic merge, external-service write, push, release, or deployment was performed by the implementer. **G5 remains pending independent parent review.**


## G5 review round 1 — 2026-10-07

Independent review reproduced two P2 correctness gaps in the initial implementation: an event could wrap an exact unresolved hypothesis and bypass the direct-memory epistemic guard; supported/unverified proposed values could carry fabricated verifier execution metadata. Neither finding bypassed host review or yielded `verified` status, but both violated deterministic T5 boundaries.

The hypothesis guard now uses each action's already-resolved transitive source lineage, including memory refs reached through events, episodes, and manifests. Every memory lookup resolves the exact referenced revision. It does not inspect unrelated comparison candidates in the overall read set, and it cannot substitute a later current fact for the earlier hypothesis. Nested hypothesis-to-hypothesis promotion and facts from independent artifact evidence remain supported.

The proposal gate rejects all verifier method/revision/time metadata in this no-verifier path, for both supported and unverified values. It does not guess whether a method name denotes an executed verifier. The on-disk verification parser is unchanged; a synthetic older host-written metadata fixture remains readable and unchanged after a retain action. This is parser compatibility evidence, not an authenticity claim about that fixture.

Both checks also run during apply on saved pending plans, so older previews cannot bypass the repaired gates. Rejection leaves canonical bytes and episode/staging state unchanged. There is no new classifier, verification framework, temporal transition, or retention behavior.

- RED: 10 expected wrapper/metadata failures with six passing controls, then two expected older-pending-plan apply failures.
- Final targeted promotion/recovery: **64/64**, exit 0, 8.32s; 56 behavior tests and eight real-process recovery tests.
- Fresh `npm run verify`: build exit 0, **316/316 in 15 files**, exit 0, 32.95s; zero failed/pending/skipped tests.
- Package dry-run: 279 files, 357736 compressed bytes, 1837258 unpacked bytes; no private/runtime/test artifacts. Dependencies unchanged; `git diff --check` passed.
- Eighteen added cases cover direct/event/episode/manifest negatives, permitted nested hypotheses, independent evidence despite unrelated candidates, exact historical hypothesis, six verifier-field/status combinations, unchanged historical metadata, and both older-pending-plan apply gates.

Changes are scoped to the promotion owner, its tests, and these progress/verification documents. **G5 remains pending parent re-review; no push by the implementer.**


## G5 review round 2 — epistemic evidence versus full dependencies

Scoped re-review closed fabricated verifier metadata and the original hypothesis laundering, but reproduced one P2 over-rejection: an independent fact could be reused through its canonical ref while its promotion audit ref was rejected solely because that audit also retained an unrelated hypothesis comparison candidate.

The complete audit `sourceRefs` graph is unchanged. It remains the disclosure, current-visibility, scope and CAS dependency graph, including comparison candidates and implicit episode baselines. A separate internal epistemic traversal now treats a promotion manifest's immutable action/output information as its relevant evidence ancestry. It includes action inputs, explicit targets, assertion mappings, output records and their recorded source/evidence refs; it does not treat implicit comparison/baseline dependencies as claim support. An explicitly supplied episode remains an actual source and retains its complete selected episode ancestry.

The selector validates the existing audit-details shape, recomputes exact canonical output refs from the stored action records, and checks that every selected ref is contained in the complete dependency graph. It does not accept caller-authored lineage overrides or remove any disclosure dependencies. The same selector runs at prepare and pending-plan apply. Actual hypothesis evidence inside audit/event/episode wrappers still rejects non-hypothesis promotion; comparison-only hypotheses and an implicit earlier episode hypothesis do not taint an independent action.

Existing T5 audits already contain the action/output data, so no writer-format change, migration, or archive rewrite is needed. An older or ambiguous shape missing that evidence distinction fails `MEMORY_SOURCE_UNAVAILABLE` for epistemic reuse, while its fully authorized archive bytes remain expandable. This is a conservative compatibility boundary, not invented support for missing metadata.

Ten new cases cover direct/audit/event/episode independent-fact reuse, pending apply for independent versus actual-hypothesis audits, hidden comparison dependencies at disclosure/prepare/apply, ambiguous older metadata, and implicit episode-baseline hypotheses. RED reproduced five failures with three passing controls; the final targeted promotion/recovery suite passes **74/74** (66 behavior, eight recovery), exit 0, 11.12s. Fresh bare `npm run verify` passes build and **326/326 across 15 files**, exit 0, 34.95s; zero failed/pending/skipped tests. Package dry-run has 279 files, 359064 compressed bytes and 1845094 unpacked bytes, with no private/runtime/test artifacts. Dependencies are unchanged and diff check passes. G5 remains pending scoped parent re-review; no T6/T7 changes or implementer push.


## G5 review round 3 — complete audit action/output shapes

Scoped re-review reproduced one remaining P2 in a synthetic host-written older archive: a non-converged create missing its record, together with empty canonicalRefs, was accepted as having no epistemic output even though the full sourceRefs retained a genuine hypothesis. The normal controller cannot write that malformed audit. Its intact counterpart correctly rejected fact promotion.

The internal selector now validates unique action identities and output-bearing action shapes before excluding comparison dependencies. Create/amend/merge require an output record unless a create has the supported automatic same-plan convergence shape. Such convergence must resolve directly to an earlier new output-owning action; dangling, self, forward, chained and cyclic references fail closed. Amend targets and optional targets must correspond to the output memory, merge assertion metadata is required, and retain/conflict remain output-free. Exact recomputed canonicalRefs and full-graph membership checks remain in place. No changes were made to full visibility/disclosure/CAS traversal, persistence formats, exact historical hypothesis checks, or the no-verifier gate.

Twenty-three new tests cover malformed shapes, saved pending-plan apply, and six valid reuse controls: create and merge output convergence, amendment, merge, retain and conflict. Authorized malformed archive disclosure still works; epistemic reuse returns MEMORY_SOURCE_UNAVAILABLE without canonical or episode/staging mutation. The synthetic pending-plan test confirms apply invokes the same selector.

- RED against the pre-fix source: 17 expected failures, six passing controls; 66 unrelated tests intentionally filtered.
- Fresh bare npm run verify: build exit 0, **349/349 across 15 files**, exit 0, 39.92s; no failed/pending/skipped tests.
- Final post-build promotion/recovery: **97/97** (89 behavior and eight real-process recovery), exit 0, 15.09s.
- The standalone reproduction now rejects the incomplete audit with MEMORY_SOURCE_UNAVAILABLE and the intact hypothesis audit with MEMORY_CONSOLIDATION_INVALID, exit 0.
- Package dry-run: 279 files, 359753 compressed bytes and 1848879 unpacked bytes, no private/runtime/test artifacts. Initial dry-run failed because the default npm cache path was unavailable; retry with the existing task-local cache passed without global changes. Dependencies and lockfile unchanged; git diff --check passed.

**G5 remains pending independent scoped re-review. No push, release, deployment, user-data or Windows changes; T6/T7 and known deferrals remain unchanged.**


## G5 acceptance

Independent round-3 scoped review passed on 2026-10-07 19:08 UTC, closing the final incomplete-audit P2. Original malformed audit now rejects MEMORY_SOURCE_UNAVAILABLE; intact hypothesis still rejects MEMORY_CONSOLIDATION_INVALID. Reviewer independently ran all 23 round-3 cases, including six valid controls and pending apply, and inspected final 97/97 targeted plus build/349 evidence. All prior G5 findings are closed. This gate does not activate deferred T6/T7 features.
