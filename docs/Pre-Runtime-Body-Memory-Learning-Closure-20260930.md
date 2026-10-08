# Pre-Runtime Body / Memory / Learning Closure — 2026-09-30

Status: CLOSED FOR PRE-RUNTIME BODY/MEMORY SCOPE — NATIVE CONTROLLER LIFECYCLE IS THE REMAINING SEMANTIC FINALIZATION OWNER

## Decision

The pre-runtime reliability programme is closed for its tested body/Memory scope. Do not create MRR-5.3/MRR-5.4 or further Memory-subsystem workarounds for external-controller compliance.

MRR-1/2/3 are resident verified. MRR-4 proves genuine cross-session procedural reuse. MRR-4.1 observes bounded procedural advantage on a matched harder fixture: equal correctness with problem-solving calls 11 -> 9; elapsed time did not improve.

MRR-5 establishes two separate facts:
1. Natural durable Memory capture can occur from an ordinary fresh-controller verified recovery without the user saying learn/remember/capture.
2. Mandatory Learning checkpoint/review cannot be made reliable solely through external-controller instructions or response advisories.

## Final fresh-controller evidence

The final ordinary controller task targeted only `runtime/tmp/dependency-order-repair`. It reproduced the failing alphabetical order and repaired only `src/order-steps.mjs`; normal runtime produced `init,test,lint,docs,pack,publish` and the authoritative verifier returned PASS for unique, dependency-safe and stable ordering.

The task did not receive any learn/remember/Memory/MRR/checkpoint/review/capture instruction.

Live Agent Core after that task still reported:
- `checkpointCount=167`
- `lastCheckpointAt=2026-09-30T12:55:53.522Z`
- `lastReviewAt=2026-09-30T12:56:10.183Z`
- `pendingReviewCount=0`

Those timestamps predate the fresh task. A scoped Memory search found no dependency-order/topological operational lesson created by the task. Activity Tracker contains no Learning checkpoint after the prior 12:55:53Z checkpoint and no `memory_remember completed` after the earlier resident advisory probe.

Verdict for the final external-controller acceptance: **MANDATORY_LEARNING_FINALIZATION_NOT_RELIABLE_IN_EXTERNAL_CONTROLLER**.

## Architectural conclusion

This is not evidence for another Memory rewrite. The body already provides:
- durable canonical Memory;
- scoped retrieval and provenance;
- source freshness;
- explicit Memory-use receipts;
- cross-session procedural reuse;
- verified outcome evidence;
- bounded pending-review continuity;
- direct verified-recovery Memory-response advisory.

The missing invariant is knowing, at the controller/task-loop level, when a meaningful task has reached a terminal verified state and ensuring semantic finalization executes before the turn is committed. That owner belongs in the native controller runtime.

Responsibility boundary:

```text
Agent Runtime decides WHEN finalization must run.
Model/controller decides WHAT semantic lesson is worth saving.
LearningService validates/routes the reviewed candidate.
MemoryService persists accepted durable knowledge.
```

## Transition gate

The user has explicitly authorized subsequent recommended work. The next implementation phase is Native Agent Runtime Phase 1: persistent task/session lifecycle + provider abstraction + deterministic Learning finalization ownership. Existing Memory/retrieval/ranking logic must not be rewritten without new failure evidence.

Native runtime acceptance must eventually replay the MRR-5 ordinary-task scenario through the native controller and prove:
- terminal task state is persisted;
- checkpoint is unavoidable at finalization;
- verified-recovery triggers semantic review;
- review may capture, deduplicate, reject, or say nothing worth saving;
- a completed user turn cannot silently bypass the finalization state transition.
