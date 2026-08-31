# Memory Nervous System Phase 5 — Continuity and Execution Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Continuity and Execution durable-memory promotion through the certified Phase 4 cognition/write-decision authority and make their meaningful durable boundaries truthfully wait for encrypted Memory Remote readback whenever Memory Remote is enabled.

**Architecture:** Phase 5 adds a narrow `MemoryDurabilityBoundary` that projects the already-authoritative scoped SQLite logical state, creates one encrypted recovery checkpoint for the current generation, and delegates non-force push/readback proof to the certified Phase 2 `MemoryRemoteSynchronizer`. `ContinuityPromoter` and `ExecutionMemoryBridge` stop calling `commit()` for promoted durable knowledge and instead call `applyPostflight()`. Continuity groups checkpoint/promotion/turn-close state into one remote durability checkpoint per tool call; execution promotion is considered synced only after its postflight application and durability boundary both complete. Remote-disabled behavior stays backward compatible. Phase 6 context-lease/pending-postflight state enforcement remains out of scope.

**Tech Stack:** TypeScript 7, Node.js >=24.15, worker-backed SQLite DMF, Phase 4 `MemoryCognitionController`, Phase 2 AES-256-GCM Memory Remote + Native GitHub Fabric transport, MCP Server SDK v2, Zod v4, Vitest.

**Spec:** `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md` sections 17–31 and 46.4, plus `docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md` Phase 5.

## Global Constraints

- Existing local SQLite DMF remains the semantic authority during a live process.
- Existing Memory Remote remains disabled by default; when disabled, Phase 5 must preserve current local behavior and must not fabricate `REMOTE_SYNCED`.
- When Memory Remote is enabled, a required durable boundary is successful only after encrypted object/manifest push plus fetch/readback verification reaches `REMOTE_SYNCED`.
- Remote synchronization uses the existing `MemoryRemoteSynchronizer`; no force push and no second GitHub credential authority is introduced.
- Durability payload is the deterministic scoped logical projection from `projectMemoryLogicalState()` serialized by `serializeMemoryLogicalState()` and hashed by `hashMemoryLogicalState()`.
- The next generation predecessor comes only from scoped `memory_remote_state.remote_generation`; never guess a remote generation from local Git state.
- If enabled Remote state is stale/conflicting/unavailable, fail truthfully and leave local semantic state plus `REMOTE_PENDING`/`REMOTE_CONFLICT`/`REMOTE_UNAVAILABLE` evidence intact.
- Continuity durable facts must pass through `MemoryCognitionController.apply()`; no direct semantic `commit()` remains in `ContinuityPromoter`.
- Execution failure/artifact/process-checkpoint promotion must pass through `MemoryCognitionController.apply()`; no direct semantic `commit()` remains in `ExecutionMemoryBridge`.
- Failure memories remain immutable episodic history. A repeated changed failure for the same immutable canonical identity must not revise the prior failure.
- First-time Continuity/Execution promoted nodes may use `FRESH_DURABLE_CONTEXT` only with a persisted, bounded root reason derived from verified checkpoint/run provenance.
- A meaningful continuity checkpoint with no semantic promotion must still persist one `NO_DURABLE_MEMORY` write decision so the remote checkpoint can prove the intentional no-write outcome.
- Continuity remote sync is grouped once after local checkpoint + all postflight promotions + local turn finalization for that `continuity_checkpoint` call.
- Execution promotion is not counted as synced/promoted if required Memory Remote readback fails; it falls back to the existing execution memory-sync queue and is retried from durable execution evidence.
- Existing execution evidence hierarchy remains authoritative: failed nodes create failure evidence; succeeded nodes with required artifacts promote only when result evidence is verified; raw stdout/stderr is never promoted.
- Existing MCP memory tools remain exactly 9 and full MCP surface exactly 56; Phase 5 adds no `memory_postflight` tool.
- Existing route/lease hard enforcement is unchanged; `OPEN -> POSTFLIGHT_PENDING -> CLOSED` lifecycle enforcement remains Phase 6.
- No new schema migration, root dependency, external AI/model/API, embedding service, LangChain, or LangGraph integration.

---

## File Structure

### New production file

- `src/memory/durability-boundary.ts` — build and synchronize an encrypted scoped logical recovery checkpoint for one meaningful durability boundary.

### Modified production files

- `src/memory/service.ts` — compose `MemoryDurabilityBoundary`, expose `syncDurableBoundary()`, and keep raw `syncRemoteGeneration()` for lower-level tests/internal use.
- `src/memory/types.ts` — add bounded durability-boundary reason/result contracts only; no schema enum migration.
- `src/continuity/promoter.ts` — replace direct `commit()` writer dependency with structured `applyPostflight()` requests, including an explicit `NO_DURABLE_MEMORY` checkpoint decision when no durable semantic candidate exists.
- `src/mcp/continuity-tools.ts` — after checkpoint + postflight promotion + local turn close/interruption, call one grouped `syncDurableBoundary()` and only return success after required readback completes.
- `src/execution/memory-bridge.ts` — replace direct commits with postflight application and require durability-boundary success before a promotion is counted as synced; reuse the existing queue on remote failure.

### Tests

- Create `tests/memory-durability-boundary.test.ts`.
- Modify `tests/continuity-checkpoint.test.ts`.
- Modify `tests/execution-memory-bridge.test.ts`.
- Modify `tests/mcp-memory.test.ts` only for explicit non-change assertion if needed.
- Reuse existing `tests/memory-remote-sync.test.ts`, `tests/memory-remote-hydration.test.ts`, `tests/memory-remote-deletion-recovery.acceptance.test.ts`, continuity/execution acceptance suites, and MCP count suites as certification regressions.

---

### Task 1: Add Production Memory Durability Boundary

**Files:**
- Create: `src/memory/durability-boundary.ts`
- Modify: `src/memory/types.ts`
- Modify: `src/memory/service.ts`
- Create: `tests/memory-durability-boundary.test.ts`

**Interfaces:**

```ts
export const MEMORY_DURABILITY_BOUNDARY_REASONS = [
  'continuity_checkpoint',
  'continuity_terminal',
  'execution_failure',
  'execution_artifact',
  'execution_process_checkpoint',
] as const;

export type MemoryDurabilityBoundaryReason =
  (typeof MEMORY_DURABILITY_BOUNDARY_REASONS)[number];

export type MemoryDurabilityBoundaryResult =
  | {
      required: false;
      state: 'NOT_REQUIRED';
      reason: MemoryDurabilityBoundaryReason;
    }
  | {
      required: true;
      state: 'REMOTE_SYNCED';
      reason: MemoryDurabilityBoundaryReason;
      generationId: string;
      remoteHead: string;
      logicalStateHash: string;
    };
```

`MemoryService` exposes:

```ts
async syncDurableBoundary(
  scope: MemoryScope,
  reason: MemoryDurabilityBoundaryReason,
): Promise<MemoryDurabilityBoundaryResult>;
```

`MemoryDurabilityBoundary.sync()` must:

```text
remote disabled
  -> NOT_REQUIRED

remote enabled
  -> projectMemoryLogicalState(scope)
  -> hashMemoryLogicalState(projection)
  -> serializeMemoryLogicalState(projection)
  -> read scoped memory_remote_state
  -> predecessor = remoteGeneration ?? null
  -> load dedicated Memory Remote encryption key
  -> create recovery-checkpoint envelope
  -> create one-object manifest
  -> MemoryRemoteSynchronizer.sync()
  -> return REMOTE_SYNCED only from verified synchronizer result
```

- [ ] **Step 1: Write RED disabled/first-generation tests**

Create a real MemoryService fixture with Remote disabled and assert `syncDurableBoundary()` returns exactly `required:false/state:NOT_REQUIRED` without touching `memory_remote_state`.

Create a Remote-enabled fixture with a dedicated test key and deterministic fake `MemoryRemoteTransport`. Commit one memory, call `syncDurableBoundary(scope, 'continuity_checkpoint')`, and assert:

```text
result.required                         true
result.state                            REMOTE_SYNCED
result.logicalStateHash                 hash(projectMemoryLogicalState(scope))
remote envelope kind                    recovery-checkpoint
remote envelope plaintext               decrypts to serialized logical projection
remote state durability                 REMOTE_SYNCED
remote state generation                 result.generationId
```

- [ ] **Step 2: Write RED predecessor and failure-truth tests**

After a first successful generation, mutate local semantic state and sync again. Assert the second envelope/manifest predecessor is the first generation and hydration of the latest generation reproduces the new projection exactly.

Inject remote push/readback failure and assert:

```text
syncDurableBoundary rejects
local semantic memory remains present
remote state is never REMOTE_SYNCED for the failed new hash
remote state is REMOTE_UNAVAILABLE / REMOTE_CONFLICT as classified by synchronizer
```

- [ ] **Step 3: Run RED**

```bash
npx vitest run tests/memory-durability-boundary.test.ts tests/memory-remote-sync.test.ts
```

Expected: FAIL because `MemoryDurabilityBoundary` / `syncDurableBoundary()` do not exist.

- [ ] **Step 4: Implement minimal durability boundary**

Use only existing Phase 2 primitives:

```ts
const projection = await projectMemoryLogicalState(client, scope);
const logicalStateHash = hashMemoryLogicalState(projection);
const plaintextPayload = Buffer.from(serializeMemoryLogicalState(projection), 'utf8');
const predecessor = (await cognition.getRemoteState(scope))?.remoteGeneration ?? null;
const scopeId = memoryRemoteScopeId(scope);
const object = createMemoryRemoteEnvelope({
  crypto,
  scopeId,
  kind: 'recovery-checkpoint',
  previousGeneration: predecessor,
  logicalStateHash,
  plaintextPayload,
  createdAt,
});
const manifest = createMemoryRemoteManifest({
  scopeId,
  previousGeneration: predecessor,
  objectIds: [object.objectId],
  logicalStateHash,
  createdAt: createdAt + 1,
});
return remoteSync.sync({ scope, object, manifest });
```

Cache only the parsed `MemoryRemoteCrypto` promise if useful; do not cache logical projection, predecessor, or manifest identity.

- [ ] **Step 5: Run GREEN + remote recovery regressions**

```bash
npx vitest run \
  tests/memory-durability-boundary.test.ts tests/memory-remote-sync.test.ts \
  tests/memory-remote-hydration.test.ts tests/memory-remote-concurrency.test.ts \
  tests/memory-remote-deletion-recovery.acceptance.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/durability-boundary.ts src/memory/types.ts src/memory/service.ts tests/memory-durability-boundary.test.ts
git commit -m "feat: add memory durability boundaries"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 2: Adopt Cognition Controller in Continuity Promotion

**Files:**
- Modify: `src/continuity/promoter.ts`
- Modify: `tests/continuity-checkpoint.test.ts`
- Modify: `tests/memory-cognition-controller.test.ts` only if a shared postflight contract regression is required.

**Interfaces:**

Replace:

```ts
export interface ContinuityMemoryWriter {
  commit(request: MemoryCommitRequest): Promise<MemoryCommitResult>;
}
```

with:

```ts
export interface ContinuityMemoryWriter {
  applyPostflight(request: MemoryPostflightRequest): Promise<MemoryPostflightApplyResult>;
}
```

Extend `ContinuityPromotionResult` with audit-only fields without removing existing counters:

```ts
writeDecisionIds: string[];
noDurableMemoryDecisions: number;
```

Each existing promotion maps to a postflight candidate preserving its canonical key, kind, value, importance, enforcement, source type/ref, and metadata.

Use deterministic reason/root policy:

```text
decision     FRESH_DURABLE_CONTEXT + CURRENT_STATE_CHANGED
artifact     FRESH_DURABLE_CONTEXT + ARTIFACT_VERIFIED
outcome      FRESH_DURABLE_CONTEXT + CURRENT_STATE_CHANGED
constraint   FRESH_DURABLE_CONTEXT + GUARDRAIL_CREATED/GUARDRAIL_CHANGED
failure      FRESH_DURABLE_CONTEXT + FAILURE_OBSERVED
```

The controller's exact-canonical path remains authoritative, so an existing mutable canonical identity becomes `REVISE_EXISTING` even when `FRESH_DURABLE_CONTEXT` is present. A changed immutable failure must resolve to no semantic rewrite.

Root reasons must be bounded deterministic provenance strings, e.g.:

```text
Verified continuity decision "<key>" first materialized for task <taskId> from checkpoint <checkpointId>.
```

If a checkpoint has zero decisions/artifacts/outcomes/constraints and is not a failed checkpoint requiring failure promotion, call `applyPostflight()` exactly once with no candidate:

```ts
{
  scope,
  routeContextId: input.routeContextId,
  continuityTaskId: taskId,
  reasonCodes: ['NO_FUTURE_RELEVANCE'],
  evidenceRefs: [checkpointId],
}
```

This must persist one applied `NO_DURABLE_MEMORY` write decision and create zero semantic nodes.

- [ ] **Step 1: Write RED controller-adoption tests**

Update continuity checkpoint acceptance coverage to prove:

```text
structured decision first checkpoint     WRITE_NEW_ROOT then memory created
same canonical later checkpoint          REVISE_EXISTING, same memory identity
artifact/outcome/constraint               controller decision persisted
failed checkpoint                         immutable failure created once
changed repeated failure                  prior failure revision count unchanged
empty meaningful checkpoint               one NO_DURABLE_MEMORY decision, zero node
all promoted memories                     metadata.created_from_decision_id present
```

Also assert direct `MemoryService.commit()` count does not explain these new decision rows—the promoter itself must invoke postflight.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/continuity-checkpoint.test.ts
```

Expected: FAIL because `ContinuityPromoter` still calls direct `commit()`.

- [ ] **Step 3: Implement postflight-backed ContinuityPromoter**

Do not change `ContinuityStore.checkpoint()` semantics in this task. Preserve existing canonical keys/value shapes and counters so continuity snapshots and current tests remain compatible.

- [ ] **Step 4: Run GREEN + continuity regressions**

```bash
npx vitest run \
  tests/continuity-checkpoint.test.ts tests/continuity-resume.acceptance.test.ts \
  tests/continuity-routing.test.ts tests/continuity-store.test.ts \
  tests/memory-cognition-controller.test.ts
npm run build
git diff --check
```

- [ ] **Step 5: Commit + push/readback**

```bash
git add src/continuity/promoter.ts tests/continuity-checkpoint.test.ts tests/memory-cognition-controller.test.ts
git commit -m "feat: route continuity promotion through cognition"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 3: Make Continuity Checkpoints Remote Durability Boundaries

**Files:**
- Modify: `src/mcp/continuity-tools.ts`
- Modify: `tests/continuity-checkpoint.test.ts`
- Test: `tests/memory-durability-boundary.test.ts`

**Behavioral order for `continuity_checkpoint`:**

```text
1. validate route + execution completion evidence
2. write local continuity checkpoint
3. promote all durable facts through cognition controller
4. close/interupt local turn when requested by current semantics
5. syncDurableBoundary(scope, terminal ? continuity_terminal : continuity_checkpoint)
6. only after required remote readback succeeds, return a successful MCP result
```

The grouped checkpoint in step 5 therefore contains:

```text
continuity checkpoint row
continuity task/frontier updates
all write-decision audit rows
all accepted semantic memory mutations
local turn-close/interruption evidence event
```

Add result metadata without removing current fields:

```ts
remoteDurability:
  | { required: false; state: 'NOT_REQUIRED' }
  | { required: true; state: 'REMOTE_SYNCED'; generationId: string; remoteHead: string; logicalStateHash: string };
```

If required remote sync fails, the tool rejects and must not return a success object that implies cross-Codespace durability. Local state remains factual and scoped `memory_remote_state` exposes the pending/conflict/unavailable state. Phase 6 will add explicit pending-postflight reconciliation; do not add that state machine here.

- [ ] **Step 1: Write RED remote-enabled continuity tests**

Using a real runtime MemoryService with fake verified Remote transport:

```text
terminal continuity_checkpoint success          remoteDurability=REMOTE_SYNCED
remote checkpoint projection                    includes checkpoint + promoted decision + turn-close event
remote logical hash                             equals local projected logical hash after close
```

Using a transport that fails push/readback:

```text
continuity_checkpoint rejects
semantic/local checkpoint evidence preserved
memory_remote_state is not REMOTE_SYNCED for new hash
no successful MCP return is produced
```

Remote-disabled fixture must continue returning success with `remoteDurability.required=false/state=NOT_REQUIRED`.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/continuity-checkpoint.test.ts tests/memory-durability-boundary.test.ts
```

- [ ] **Step 3: Wire grouped durability boundary**

Call `syncDurableBoundary()` exactly once per successful `continuity_checkpoint` invocation after local finalization. Do not synchronize separately per promoted decision/artifact/outcome/constraint.

- [ ] **Step 4: Run GREEN + continuity/execution completion regressions**

```bash
npx vitest run \
  tests/continuity-checkpoint.test.ts tests/continuity-resume.acceptance.test.ts \
  tests/continuity-execution-resume.acceptance.test.ts tests/execution-user-workflow-acceptance.test.ts \
  tests/memory-durability-boundary.test.ts tests/mcp-integration.test.ts
npm run build
git diff --check
```

- [ ] **Step 5: Commit + push/readback**

```bash
git add src/mcp/continuity-tools.ts tests/continuity-checkpoint.test.ts tests/memory-durability-boundary.test.ts
git commit -m "feat: make continuity checkpoints remotely durable"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 4: Adopt Cognition + Durability in Execution Memory Bridge

**Files:**
- Modify: `src/execution/memory-bridge.ts`
- Modify: `tests/execution-memory-bridge.test.ts`
- Test: `tests/execution-memory-search.test.ts`
- Test: `tests/execution-unified-lifecycle.test.ts`

**Interfaces:**

`ExecutionMemoryWriter` continues to expose status/event behavior but its semantic path is now:

```ts
export interface ExecutionMemoryWriter extends ContinuityMemoryWriter {
  status(scope?: MemoryScope): Promise<MemoryStatus>;
  recordEvent(request: RecordMemoryEventRequest): Promise<unknown>;
  syncDurableBoundary(
    scope: MemoryScope,
    reason: MemoryDurabilityBoundaryReason,
  ): Promise<MemoryDurabilityBoundaryResult>;
}
```

Map promotions:

```text
failure
  -> candidate kind=failure
  -> reasonCodes=[FRESH_DURABLE_CONTEXT, FAILURE_OBSERVED]
  -> rootReason cites run/node/attempt verified failure provenance
  -> applyPostflight
  -> syncDurableBoundary(execution_failure)

artifact
  -> candidate kind=artifact
  -> reasonCodes=[FRESH_DURABLE_CONTEXT, ARTIFACT_VERIFIED]
  -> rootReason cites verified result/artifact provenance
  -> applyPostflight
  -> syncDurableBoundary(execution_artifact)

process_checkpoint
  -> ContinuityPromoter.promoteExecutionProcessCheckpoint via applyPostflight
  -> syncDurableBoundary(execution_process_checkpoint)
```

A required Remote failure occurs after local postflight may already have created/deduplicated the memory. `handlePersistedEvent()` must treat the promotion as incomplete, enqueue the existing immutable execution promotion payload, and report it as queued. Replay re-applies idempotently through the controller and retries the remote durability checkpoint; it must not create duplicate failure/artifact nodes.

- [ ] **Step 1: Write RED controller-adoption tests**

Prove real execution promotion produces `memory_write_decisions` with:

```text
node.failed       FAILURE_OBSERVED
node.succeeded    ARTIFACT_VERIFIED only with verified required-artifact evidence
terminal run      process-checkpoint postflight decision
```

Assert promoted semantic nodes have `memory_node_metadata.created_from_decision_id` and failure revision count remains `1` across replay.

- [ ] **Step 2: Write RED remote queue truth tests**

With Remote enabled and forced readback failure:

```text
handlePersistedEvent promoted=0 queued=1
local failure/artifact may exist once
write decision exists
execution memory-sync queue state pending
memory remote state != REMOTE_SYNCED for new logical hash
```

After transport recovery and `flush(scope)`:

```text
synced=1 failed=0
queue state synced
same semantic memory identity/revision count where immutable
remote state REMOTE_SYNCED
hydrated logical projection equals source projection
```

- [ ] **Step 3: Run RED**

```bash
npx vitest run tests/execution-memory-bridge.test.ts tests/execution-memory-search.test.ts
```

Expected: FAIL because bridge still directly commits and does not require remote durability.

- [ ] **Step 4: Implement postflight + durability execution path**

Preserve all existing evidence selection/redaction logic in `buildPromotions()`. Change only the final semantic application path and durability completion semantics.

Do not add automatic “solution” inference from successful execution. Phase 5 preserves evidence hierarchy; it does not invent a solution node from process success.

- [ ] **Step 5: Run GREEN + execution regressions**

```bash
npx vitest run \
  tests/execution-memory-bridge.test.ts tests/execution-memory-search.test.ts \
  tests/execution-unified-lifecycle.test.ts tests/execution-user-workflow-acceptance.test.ts \
  tests/continuity-execution-resume.acceptance.test.ts tests/memory-remote-hydration.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Verify MCP surface unchanged**

```bash
npx vitest run tests/mcp-memory.test.ts tests/mcp-integration.test.ts tests/mcp-routing.test.ts tests/mcp-dual-era.test.ts
```

Required:

```text
memory tools        9 exactly
full MCP tools      56 exactly
memory_postflight   absent
```

- [ ] **Step 7: Commit + push/readback**

```bash
git add src/execution/memory-bridge.ts tests/execution-memory-bridge.test.ts
git commit -m "feat: make execution memory promotion durable"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 5: Phase 5 Certification

**Files:**
- Append factual evidence to `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`.
- Mark factual Phase 5 completion in `docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md` only after every gate passes.
- Mark this executable plan complete only after exact remote-visible certification SHA verification.

- [ ] **Step 1: Run focused Phase 5 suite**

```bash
npx vitest run \
  tests/memory-durability-boundary.test.ts tests/memory-cognition-controller.test.ts \
  tests/memory-cognition-ledger.test.ts tests/memory-remote-sync.test.ts \
  tests/continuity-checkpoint.test.ts tests/execution-memory-bridge.test.ts
```

Required:

```text
Continuity direct semantic commit path              0
Execution bridge direct semantic commit path        0
Continuity promoted write-decision audit            PASS
Execution promoted write-decision audit             PASS
Repeated immutable failure revision                 0
Empty checkpoint NO_DURABLE_MEMORY persistence      PASS
Remote-disabled compatibility                       PASS
Remote-enabled grouped continuity readback          PASS
Remote-enabled execution readback                   PASS
Failed remote readback reported synced              0
Execution remote failure queued                      PASS
Queue recovery without duplicate failure node       PASS
```

- [ ] **Step 2: Run broad memory/continuity/execution/MCP regression**

```bash
npx vitest run \
  tests/memory-*.test.ts tests/memory-*.acceptance.test.ts \
  tests/continuity-*.test.ts tests/continuity-*.acceptance.test.ts \
  tests/execution-*.test.ts tests/execution-*.acceptance.test.ts \
  tests/mcp-*.test.ts
```

Expected: zero failures; memory tools exactly 9; full MCP tools exactly 56.

- [ ] **Step 3: Re-run disaster-recovery truth**

```bash
npx vitest run \
  tests/memory-remote-hydration.test.ts \
  tests/memory-remote-deletion-recovery.acceptance.test.ts \
  tests/memory-remote-concurrency.test.ts
```

Required: latest Phase 5-generated logical checkpoints still hydrate exactly, no plaintext semantic/scope leakage, and non-force writer semantics remain unchanged.

- [ ] **Step 4: Run deterministic quality and performance gates**

```bash
npm run quality:gate
npm run benchmark:memory
```

Required: current Wave E thresholds remain green, cross-project/principal contamination remains `0`, deterministic replay remains `1`, and 100k preflight p95 remains `<150 ms`.

- [ ] **Step 5: Run full release + dependency/model guardrails**

```bash
npm run verify:release
git diff --check
git diff a25b44c98f02256a603bde85e9507a74cf02ab74 -- package.json package-lock.json
git diff a25b44c98f02256a603bde85e9507a74cf02ab74 -- src package.json package-lock.json | grep -Ei 'openai|anthropic|gemini|langchain|langgraph' || true
```

Required: zero root dependency change and zero new external AI/model/API integration.

- [ ] **Step 6: Record evidence and publish exact certification SHA**

```bash
git add docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md docs/roadmap/agent-core-memory-nervous-system-phase-5-implementation-plan.md
git commit -m "docs: certify memory nervous system phase 5"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
node scripts/release/check-doc-links.mjs
npm run verify:release
```

**Phase 5 completion rule:** Phase 5 is certified only when Continuity and Execution promotions no longer bypass the cognition controller, meaningful no-write checkpoint outcomes remain auditable, required Memory Remote boundaries produce encrypted logical checkpoints and return success only after verified readback, execution remote failures fall back to durable replay without duplicate semantic nodes, current MCP surface remains 9/56, and the exact final documentation SHA is remote-visible with the full release gate green. Phase 6 pending-postflight/context-lease hard enforcement remains out of scope.
