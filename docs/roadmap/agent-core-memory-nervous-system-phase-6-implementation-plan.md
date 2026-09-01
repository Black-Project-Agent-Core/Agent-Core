# Agent Core Memory Nervous System — Phase 6 Implementation Plan

> **Execution requirement:** Use the approved Cross-Session Memory Nervous System design as architecture authority. Execute inline when no subagent facility is available. Follow TDD RED→GREEN, commit small verified increments, push/read back each major checkpoint, and never merge this feature branch to `main` without explicit operator instruction.

**Goal:** Add a hard-but-rollbackable Agent Core memory lifecycle so selected meaningful mutations require a real persisted preflight context, successful meaningful work leaves a recoverable pending postflight, and terminal postflight is never reported as `DURABLY_CLOSED` before required Memory Remote readback is verified.

**Architecture:** Keep `memory_contexts` as the ephemeral preflight/recall snapshot table and add a durable lifecycle ledger as schema v4. The lifecycle ledger has the design-authoritative `OPEN → POSTFLIGHT_PENDING → CLOSED` postflight state and a separate durability receipt, so local factual work survives remote outages without falsely claiming cross-Codespace closure. Lifecycle semantics are added to the encrypted logical-state projection using a backward-compatible projection version upgrade. Agent Core route/mutation wrappers call one shared lifecycle guard; the guard supports `disabled`, `advisory`, and `enforce` rollout modes. Existing `task_checkpoint` remains the postflight orchestration authority; no extra model-facing MCP tool is introduced.

**Phase boundary:** Phase 6 enforces Agent Core-routed flows only. Direct ChatGPT→`codespace` bridge lease validation is Phase 7. Phase 6 may provide reusable lifecycle validation primitives for that adapter, but it must not couple the core ledger to bridge transport semantics.

---

## Invariants

1. **No fabricated compliance.** A disabled/degraded MemoryService response is never accepted as a valid persisted preflight lease.
2. **Scope exactness.** Lifecycle validation is exact on principal + project + context + route.
3. **Postflight truth.** Meaningful successful work transitions `OPEN → POSTFLIGHT_PENDING`; failed/rejected work does not fabricate completed work.
4. **Same-context continuation.** A route already in `POSTFLIGHT_PENDING` may continue its own meaningful work until checkpoint/postflight.
5. **Prior-pending protection.** Opening another meaningful context for the same continuity task or exact objective is blocked in enforce mode until the prior pending lifecycle is reconciled.
6. **Rollback mode.** `disabled` and `advisory` modes preserve operator access; advisory reports would-block decisions but does not masquerade as enforcement.
7. **Remote closure.** Persisted `CLOSED` is local postflight state. `DURABLY_CLOSED` is a derived/receipt state only after required remote generation/hash readback succeeds. If remote is not configured, report `CLOSED` + `NOT_REQUIRED`, not a cross-Codespace durability claim.
8. **Remote replay.** A verified remote projection containing a `CLOSED` lifecycle may be reconstructed as remotely durable because it came from the verified generation; legacy Phase 5 projection payloads remain hydratable.
9. **No circular authority.** Memory lifecycle owns lifecycle state; Continuity owns task/checkpoint truth; Remote owns cross-Codespace durability; route wrappers only orchestrate.
10. **No external model dependency.** The classifier is deterministic and local.

---

## Task 1 — Schema v4, Lifecycle Ledger, and Projection Compatibility

**Files:**
- Modify: `src/config.ts`
- Modify: `src/memory/schema.ts`
- Modify: `src/memory/types.ts`
- Create: `src/memory/hard-lifecycle.ts`
- Modify: `src/memory/preflight.ts`
- Modify: `src/memory/service.ts`
- Modify: `src/memory/logical-state-hash.ts`
- Modify: `src/memory/store.ts`
- Modify: `src/memory/remote-hydrator.ts`
- Test: `tests/memory-hard-lifecycle.test.ts`
- Test: `tests/memory-schema.test.ts`
- Test: `tests/continuity-schema.test.ts`
- Test: `tests/memory-logical-state-hash.test.ts`
- Test: `tests/memory-remote-hydration.test.ts`

### Step 1: RED — specify lifecycle/config/schema contract

Add failing tests proving:
- `MEMORY_SCHEMA_VERSION === 4`.
- v3→v4 migration creates a verified pre-migration backup and preserves all v3 rows.
- `AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE` accepts only `disabled | advisory | enforce`; default is `advisory` for staged rollout.
- every enabled preflight persists exactly one lifecycle row with exact principal/project/route, objective hash, expiry, and `OPEN` state.
- cross-principal/project/context/route validation is rejected.
- disabled preflight does not produce a lifecycle row that can satisfy enforcement.

Run focused tests and record expected RED before production edits.

### Step 2: GREEN — additive lifecycle schema and ledger

Add migration `004_hard_memory_lifecycle` with an additive table shaped around:

```text
context_id                  primary identity
principal_id
project_id                  normalized '' when absent
route_context_id
continuity_task_id          nullable until Continuity binding
objective_hash              deterministic SHA-256 of normalized task/context
postflight_state            OPEN | POSTFLIGHT_PENDING | CLOSED
meaningful_work_count
first_meaningful_at
last_meaningful_at
last_tool_name
last_reason_code
postflight_applied_at
closed_at
created_at
updated_at
expires_at
local_durable_generation    local receipt; excluded from logical projection
local_durable_hash          local receipt; excluded from logical projection
```

No FK to ephemeral `memory_contexts`: a remote-hydrated pending/closed lifecycle must survive even though old recall snapshots are intentionally not replayed.

Create `MemoryHardLifecycle` with bounded methods:
- `openFromPreflight(...)`
- `bindContinuityTask(...)`
- `get(...)`
- `validateCurrentContext(...)`
- `markMeaningfulWork(...)`
- `findPendingForObjectiveOrTask(...)`
- `prepareClosure(...)`
- `markDurableClosure(...)`
- `reconcileRemoteHydratedClosure(...)` as needed for hydrated receipts

Preflight inserts the ephemeral context + durable lifecycle atomically.

### Step 3: RED — projection compatibility

Add tests proving:
- current projections include lifecycle semantic rows but exclude local remote receipts.
- current logical hash changes when lifecycle semantic state changes.
- legacy format-v1 Phase 5 payloads hash exactly as before and remain accepted.
- current payloads round-trip through a fresh SQLite DB with exact logical hash equality.
- a hydrated `CLOSED` lifecycle can be recognized as coming from a verified remote generation without a second semantic mutation.

### Step 4: GREEN — projection v2 with v1 read compatibility

Evolve the logical projection with explicit versions:
- v1 = Phase 5 table set.
- v2 = v1 + lifecycle semantic table.
- current projection defaults to v2.
- hash/serialize dispatches by `formatVersion`.
- hydrator accepts both v1 and v2.
- replay materializer accepts both; v1 materializes no lifecycle rows.
- post-materialization verification projects using the hydrated payload's version, preserving exact legacy hashes.

Do not project local durability receipt fields or `memory_remote_state`.

### Step 5: Verify and checkpoint

Run:
- lifecycle/schema/projection/hydration focused suite
- `npm run build`
- relevant remote recovery suite

Commit and push only after GREEN.

---

## Task 2 — Deterministic Meaningful-Work Classifier and Agent Core Mutation Guard

**Files:**
- Create: `src/memory/meaningful-work.ts`
- Create: `src/mcp/memory-lifecycle-guard.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/execution-tools.ts`
- Modify: `src/mcp/github-tools.ts`
- Modify: `src/runtime/route-context-store.ts` only if structured error vocabulary needs extension
- Test: `tests/memory-meaningful-work.test.ts`
- Test: `tests/mcp-memory-hard-lifecycle.test.ts`
- Extend: `tests/mcp-route-enforcement.test.ts`
- Extend: `tests/execution-mcp.test.ts`

### Step 1: RED — classifier contract

Specify deterministic classifications:
- filesystem writes/edits/create/move => meaningful.
- execution create/start/add/retry/cancel => meaningful.
- mutating GitHub operations reuse/extract the existing operation classifier and are meaningful.
- trivial filesystem/search/read operations => not meaningful.
- `stop_process` remains a recovery-control exemption so broken enforcement cannot brick process recovery.
- generic shell commands are meaningful unless they match a deliberately small, no-metacharacter read-only allowlist such as `pwd`, simple `ls`, `git status`, `git rev-parse`, `git branch --show-current`, `git log`, or `git show`.
- shell redirection, chaining, substitution, pipelines, or unknown commands => meaningful.

### Step 2: GREEN — shared classifier

Implement one pure local classifier returning a bounded result:

```ts
{
  meaningful: boolean;
  reasonCode: string;
  mutationClass: string;
}
```

No LLM/model/API calls. Prefer conservative meaningful classification when safety cannot be proven.

### Step 3: RED — lifecycle guard behavior

Tests must prove for selected Agent Core mutations:
- enforce + no persisted preflight => `MEMORY_PREFLIGHT_REQUIRED` before mutation.
- enforce + expired context => predictable rejection.
- enforce + wrong principal/project/route => predictable rejection.
- enforce + valid `OPEN` context => mutation allowed; success marks `POSTFLIGHT_PENDING`.
- same context may continue while pending and increments bounded work count.
- failed/rejected mutation does not falsely increment successful meaningful work.
- advisory + no valid lifecycle => operation remains allowed and reports/audits would-block state without claiming enforcement.
- disabled mode preserves pre-Phase-6 behavior.
- degraded memory in enforce mode cannot fabricate a lease.
- read-only/trivial operations retain existing routing behavior without lifecycle lease enforcement.

### Step 4: GREEN — async Agent Core guard

Create one async guard used by operational, execution, and GitHub mutation wrappers:
1. existing `RouteContextStore.validate()` remains the routing/skill/guardrail authority.
2. classifier determines whether hard lifecycle applies.
3. lifecycle validates the persisted preflight context referenced by `route.memorySnapshot.memoryContextId`.
4. mutation executes only after validation in enforce mode.
5. successful meaningful mutation marks lifecycle pending.
6. advisory mode returns an explicit advisory record for auditing but does not block.

Do not convert the synchronous route store into a raw SQLite owner.

### Step 5: Verify and checkpoint

Run focused MCP + execution + GitHub routing tests, build, then commit/push/readback.

---

## Task 3 — Pending Reconciliation, Checkpoint Postflight, and Durable Closure

**Files:**
- Modify: `src/mcp/capability-tools.ts`
- Modify: `src/mcp/continuity-tools.ts`
- Modify: `src/memory/service.ts`
- Modify: `src/memory/types.ts`
- Modify: `src/memory/durability-boundary.ts` if a dedicated lifecycle boundary reason is needed
- Test: `tests/memory-hard-lifecycle-recovery.test.ts`
- Extend: `tests/continuity-checkpoint.test.ts`
- Extend: `tests/continuity-routing.test.ts`
- Extend: `tests/memory-durability-boundary.test.ts`

### Step 1: RED — opening a new actionable context with prior pending work

Specify:
- prior `POSTFLIGHT_PENDING` with the same explicit `resumeTaskId` blocks a new route in enforce mode with `MEMORY_POSTFLIGHT_REQUIRED`.
- prior pending with the same normalized objective hash blocks a new route.
- unrelated objective/task in the same project is not globally blocked.
- advisory mode surfaces pending lifecycle but does not block.
- an already `CLOSED` prior context does not block.

The check must occur before the new context is treated as compliant.

### Step 2: GREEN — bind route lifecycle to Continuity task

After Continuity begins/resumes, bind the preflight lifecycle row to the authoritative `continuityTaskId`. Do not create a second task identity.

Capability route should return bounded lifecycle metadata:
- mode
- persisted context state
- prior pending indicator/advisory

Never expose principal IDs or secrets in the public route result.

### Step 3: RED — checkpoint closure/durability state machine

Specify terminal and non-terminal checkpoint behavior:
- when route had no meaningful work, checkpoint can close/postflight normally without fabricating pending work.
- when meaningful work exists, local cognition promotion/postflight is applied before closure preparation.
- closure semantic state becomes `CLOSED` before the remote logical projection is generated so the verified generation contains the closed state.
- remote enabled + verified readback => local durability receipt records generation/hash and public state derives `DURABLY_CLOSED`.
- remote enabled + sync failure => factual local checkpoint/promotion remains; lifecycle has no durable receipt and next meaningful same-task route remains blocked/reconcilable; no `DURABLY_CLOSED` claim.
- remote disabled => lifecycle is `CLOSED` with durability `NOT_REQUIRED`; do not claim cross-Codespace durability.
- retry/reconciliation does not duplicate semantic memory nodes or write decisions.

### Step 4: GREEN — integrate `task_checkpoint`

Phase 5 ordering becomes:

```text
validate checkpoint/evidence
→ local continuity checkpoint
→ cognition/postflight promotion
→ close/interrupted local turn as factual truth
→ prepare lifecycle CLOSED (semantic, no remote receipt yet)
→ Memory Remote durability boundary
→ on verified REMOTE_SYNCED: attach local generation/hash receipt
→ return success with lifecycle + remote durability
```

If required sync throws, no successful MCP result and no durable receipt. A subsequent reconciliation may re-run idempotent postflight/durability against the same authoritative checkpoint.

### Step 5: Verify and checkpoint

Run continuity/lifecycle/remote recovery suites and build. Commit/push/readback.

---

## Task 4 — Phase 6 Regression and Certification

### Step 1: Focused Phase 6 suite

Require zero failures for:
- schema/config/lifecycle
- classifier
- Agent Core mutation guard
- pending-route recovery
- checkpoint durable closure
- legacy/current remote hydration

### Step 2: Broad regressions

Run memory + continuity + execution + MCP + GitHub relevant suites. Verify:
- MCP surface count unchanged unless an unrelated concurrent change intentionally changed it.
- existing hard guardrails remain authoritative.
- exact principal/project isolation.
- no direct semantic commit bypass is reintroduced in Continuity/Execution promoters.

### Step 3: Quality/performance/disaster recovery

Run:
- memory quality gate
- 100k preflight benchmark; p95 target remains `<150 ms`
- remote deletion recovery
- remote concurrent-writer reconciliation
- legacy remote hydration compatibility
- release docs link check
- external model/dependency scan

### Step 4: Full exact-SHA release verification

On the candidate implementation SHA:
- push branch
- verify local SHA == remote branch SHA
- run `npm run verify:release`
- require 0 failures and quality PASS

### Step 5: Certification docs

Update:
- master design with a Phase 6 certification record
- master implementation plan Phase 6 status/link
- this plan with exact commits, test counts, benchmark, and final SHA

Commit/push docs, then rerun exact-SHA `verify:release` on the documentation SHA. The documentation SHA, not an earlier implementation SHA, is the Phase 6 final certified SHA.

---

## Phase 6 Definition of Done

Phase 6 is **CERTIFIED COMPLETE** only when all are true:

```text
schema v4 migration + pre-migration backup                PASS
persisted preflight lifecycle OPEN                        PASS
selected mutation without valid preflight                 predictably rejected in enforce mode
valid same-context meaningful mutation                    allowed
successful meaningful work → POSTFLIGHT_PENDING           PASS
prior same-task/objective pending blocks next context     PASS
unrelated task not globally blocked                       PASS
advisory rollback mode                                    PASS
degraded memory never fabricates compliance               PASS
terminal local postflight truth preserved on sync failure PASS
unsynced required remote → DURABLY_CLOSED claims          0
verified remote readback → durable closure receipt        PASS
legacy Phase 5 remote checkpoint hydration                PASS
current lifecycle remote round-trip                       exact hash equality
external AI/model dependency                              0
100k preflight p95                                        <150 ms
full release verification                                 PASS
local branch SHA == remote branch SHA                     PASS
worktree clean                                            PASS
```
