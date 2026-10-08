# MRR-5 Natural Learning Finalization

Status: FINAL EXTERNAL-CONTROLLER ACCEPTANCE FAILED — NATURAL DURABLE MEMORY CAPTURE OBSERVED — MANDATORY LEARNING FINALIZATION OWNER TRANSFERRED TO NATIVE CONTROLLER RUNTIME — 2026-09-30

## Evidence and root cause

Two ordinary fresh-controller repair tasks completed with authoritative PASS results, but Agent Core Learning state did not advance: checkpointCount remained 164 and lastCheckpointAt remained 2026-09-29T22:03:14.144Z. No durable transaction/batch replay lesson appeared in canonical Memory.

The Memory/retrieval/use side is not the failing owner. MRR-1/2/3 are resident verified; MRR-4 proved cross-session procedural reuse and MRR-4.1 observed bounded reduction in problem-solving calls when a verified procedure had already been captured.

Current Learning is controller-semantic by design. The operating contract asks the controller to checkpoint meaningful tasks, but that requirement is currently buried below the top-level directives. `LearningCheckpointInput.evidenceRefs` is accepted by the public facade but is not persisted in `LearningState`, so even a checkpoint can lose bounded task evidence before a later periodic review.
## Minimal correction

1. Promote learning finalization to a top-level Agent Core controller directive: after a meaningful completed task, prepare the answer, checkpoint before sending it, and immediately review verified recovery/user-correction/explicit-learn cases. A valid review result may be no new knowledge.
2. Persist a bounded `pendingReviews` queue inside the existing Learning state file. This is evidence continuity, not a second Memory store and not semantic knowledge.
3. Reuse the already-public `learning.workspace` field for checkpoints and persist safe, bounded evidence references plus reason/idempotency identity.
4. Expose pending review state through `learning(action="status")` and additive checkpoint result fields.
5. Clear the pending queue when `learning(action="review")` completes, matching the existing global `sinceReview -> 0` semantics.
6. Keep semantic judgment in the connected controller. No hidden model, background learner, scheduler, routing gate, second agent, or automatic Memory mutation is introduced.

## Compatibility and safety

- MCP tool count and Learning action enum stay unchanged.
- Existing state version remains `1`; `pendingReviews` is an additive optional-on-read/default-empty field.
- Existing callers that do not pass workspace/evidence continue to work.
- Evidence is bounded, deduplicated, metadata-only, and safety-scanned before durable persistence; unsupported evidence refs are not promoted to semantic truth.
- Learning remains fail-soft and never gates machine control or the user-facing result.
## Files and ownership

Primary source: `AGENTS.md`, `src/learning/types.ts`, `src/learning/state.ts`, `src/learning/triggers.ts`, `src/learning/service.ts`, `src/mcp/learning-tools.ts`.

No Memory ranking/retrieval code, auth/tool-grant code, Skills execution authority, Grafel provider, machine-control routing, or native model/provider runtime is changed in this slice.

Documentation sync: `docs/CODEBASE.md`, `docs/Memory-Reuse-Reliability-20260930.md`, `README.md`, `MEMORY.md`, and canonical Memory.

## Acceptance

Targeted tests must prove: state migration/default compatibility; checkpoint evidence survives state reload; duplicate checkpoints do not duplicate pending evidence; workspace is preserved; review clears pending evidence; status exposes pending review count; existing checkpoint/review semantics remain intact.

Run only touched Learning/MCP tests plus build/path policy, release compatibility, and Grafel structural review. No full regression unless a concrete failure justifies expansion.

Implementation is now source/build/compiled qualified. `AGENTS.md` promotes meaningful-task Learning finalization to a top-level controller obligation; existing Learning state gains a bounded additive `pendingReviews` queue so checkpoint evidence, reason, workspace, and idempotency identity survive process/controller boundaries until semantic review. Checkpoint evidence is deduplicated, bounded to existing safe evidence-reference syntax, and semantic judgment remains controller-owned. No Memory ranking/retrieval code, second Memory, hidden model, scheduler, routing gate, or native provider runtime was added.

Fresh qualification: dedicated finalization continuity **5/5 PASS**. Touched Learning/MCP set **51/51 PASS** across five files after correcting one stale test fixture that still mocked the pre-existing `stateStore.save` path instead of production `stateStore.mutate`. Build exit 0; path policy **280/0**; release compatibility **70→70 tools**, routes unchanged, `breakingEvidence=false`, manifest within budget; `release:check-intent` is `ok=true` with the new minor intent present. Compiled isolated readback proved `pendingAfterReload=1`, duplicate checkpoint retained `reviewDue=true/reviewReason=verified-recovery`, and completed review cleared pending evidence to 0. Post-change Grafel is current/integrity-accepted at **9,760 entities / 52,022 relationships** and structural review confirms the existing `registerLearningTools -> LearningService.checkpoint -> applyCheckpoint/state store` path with no new authority. Evidence: `runtime/tmp/mrr5-natural-learning-closure.json` and `runtime/tmp/mrr5-finalization-compiled-check.mjs`.

The first correction was resident-activated/readback verified on PID 12488. A truly fresh ordinary controller then repaired `runtime/tmp/stream-frame-repair` without any learn/remember/MRR wording. The task reproduced the intended FAIL and reached authoritative PASS, and the controller naturally created canonical operational-reflection Memory `f5bf19c6-6d93-42e9-9724-ea66cebff8d4`. This proves **natural durable capture is now observed**. However, live Learning state did not advance after that task: the last checkpoint remained the earlier controller checkpoint at `2026-09-30T12:23:58.759Z`, and Activity Tracker shows `memory_remember completed` at `12:31:24Z` with no corresponding Learning checkpoint/review. Therefore the stricter mandatory finalization acceptance still failed.

The fresh evidence exposed a concrete contract conflict rather than a Memory failure: the Reflexion section still instructed verified recoveries to promote directly via `memory_remember`/`memory_update`, while the new top-level finalization rule required checkpoint/review. The fresh controller followed the direct Reflexion path and stopped after durable Memory capture. Second correction: `AGENTS.md` now states that verified recoveries route through mandatory Learning finalization and direct Memory capture never substitutes; `src/mcp/learning-tools.ts` says the controller **must** checkpoint/review; and `src/mcp/memory-tools.ts` adds a non-persistent machine-readable `controllerAdvisory` on verified-recovery operational-reflection `memory_remember` results stating `learning-finalization-required`, `checkpointReason=verified-recovery`, and `directMemoryCaptureCompletesFinalization=false`. Memory remains independently writable; this advisory is not a gate and does not mutate Learning automatically.

Second-correction qualification: focused Learning/Memory/MCP parity set **20/20 PASS** across four files after correcting one stale parity fixture that omitted six already-existing Memory tools; build exit 0; path policy **280/0**; release compatibility **70→70 tools**, routes unchanged, `breakingEvidence=false`, `verificationIssues=[]`; manifest remains within budget; release-intent check `ok=true`. Grafel reindex is current/integrity-accepted at **9,763 entities / 52,034 relationships** and confirms `registerMemoryTools -> memoryRememberLearningFinalizationAdvisory`. The second correction is resident-activated/readback verified. Core PID 14772 started after the rebuilt Memory/Learning tool artifacts, and a bounded live verified-recovery Memory probe returned the expected non-gating finalization advisory; the temporary Memory was deleted. The final truly fresh ordinary-controller acceptance then targeted only `runtime/tmp/dependency-order-repair` with no learning-related instruction. It reproduced the alphabetical-order failure, repaired the implementation, and reached authoritative PASS, but live Learning still remained at checkpointCount 167 / lastCheckpointAt 2026-09-30T12:55:53.522Z / lastReviewAt 2026-09-30T12:56:10.183Z / pendingReviewCount 0, all predating that fresh task. Scoped Memory search found no new topological-order lesson. Verdict: **MANDATORY_LEARNING_FINALIZATION_NOT_RELIABLE_IN_EXTERNAL_CONTROLLER**. This closes MRR-5 as boundary evidence rather than success: do not add MRR-5.3/MRR-5.4 or further Memory workarounds. The remaining semantic finalization invariant is owned by Native Agent Runtime Phase 1. Closure: `Pre-Runtime-Body-Memory-Learning-Closure-20260930.md`; next plan: `Native-Agent-Runtime-Phase-1-Plan.md`.
