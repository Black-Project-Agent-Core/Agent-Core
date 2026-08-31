# Memory Nervous System Phase 3 — Bounded remember_more Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a first-class, bounded `remember_more` historical expansion path that starts only from memories already recalled into an authenticated memory context, returns the minimum useful historical explanation, audits every returned expansion, and leaves default current-revision-first recall unchanged.

**Architecture:** `MemoryRememberMore` is a deterministic read/expansion engine over the existing worker-backed DMF. It validates context/seed authority through `memory_contexts` + `memory_access_log`, traverses revision history and only relation-policy-approved historical edges/conflicts under strict budgets, and writes audit rows through the existing `MemoryCognitionLedger`. `MemoryService` composes the engine and MCP exposes one read-only `memory_remember_more` tool; no automatic preflight/routing trigger and no Phase 4 write-decision controller is introduced here.

**Tech Stack:** TypeScript 7, Node.js >=24.15, worker-backed SQLite DMF, existing `MemoryCognitionLedger`, MCP Server SDK v2, Zod v4, Vitest.

**Spec:** `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md` section 15 and `docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md` Phase 3.

## Global Constraints

- Load the minimum additional history necessary to understand the present; never load the whole memory graph.
- Default bounds are exactly `maxHops=2`, `maxItems=4`, `characterBudget=6000`.
- Hard request ceilings are `seedMemoryIds<=16`, `maxHops<=4`, `maxItems<=16`, `characterBudget<=20000`.
- Seeds must have been recalled in the supplied `contextId` through `memory_access_log`; arbitrary memory IDs are rejected.
- Principal/project isolation is mandatory for seed validation and every expanded node/conflict/revision.
- Tombstoned memories are not returned by historical expansion.
- Recursive traversal is allowed only for relation-policy entries with `recursiveHistory=true`; weak associative relations never recurse.
- Priority order is revision predecessor/supersedes, failure/cause, solution, validation, branch/derived, conflict, dependency/blocker, then other recursive-history relations.
- `memory_conflicts` is an explicit conflict-history source even if an active `contradicts` edge is absent.
- Initial `memory_search` and preflight ranking/scoring semantics remain unchanged.
- `memory_remember_more` is model-facing read-only; its only persistence side effect is append-style recall-expansion audit in `memory_recall_expansions`.
- No external AI/model/API dependency and no embedding/reranker is added.
- Phase 3 does not implement automatic trigger policy or the Phase 4 persistence-decision controller.

---

## File Structure

### New production file

- `src/memory/remember-more.ts` — bounded historical expansion, context/seed authorization, deterministic traversal/packing/snapshot hashing, and expansion audit orchestration.

### Modified production files

- `src/memory/types.ts` — remember-more reason/request/result/entry contracts and bounded constants.
- `src/memory/service.ts` — compose `MemoryRememberMore` and expose `rememberMore()`.
- `src/mcp/memory-tools.ts` — register the ninth memory tool `memory_remember_more` with bounded Zod schema and read-only annotations.

### Tests

- `tests/memory-remember-more.test.ts` — engine authority, traversal priority, revision/history/conflict/branch cases, weak-edge exclusion, budgets, isolation, replay.
- `tests/mcp-memory.test.ts` — ninth memory tool schema/annotations and end-to-end call.
- Exact full-tool-count assertions in `tests/mcp-integration.test.ts`, `tests/execution-mcp.test.ts`, `tests/continuity-checkpoint.test.ts`, `tests/mcp-routing.test.ts`, and `tests/mcp-dual-era.test.ts` change from 55 to 56 only because this phase adds one approved MCP tool.

---

### Task 1: Define remember_more Contracts and Seed Authority

**Files:**
- Modify: `src/memory/types.ts`
- Create: `src/memory/remember-more.ts`
- Create: `tests/memory-remember-more.test.ts`

**Interfaces:**

```ts
export const MEMORY_REMEMBER_MORE_REASONS = [
  'causal_history',
  'revision_history',
  'failure_history',
  'branch_history',
  'conflict_history',
  'user_requested',
] as const;

export const MEMORY_REMEMBER_MORE_DEFAULTS = {
  maxHops: 2,
  maxItems: 4,
  characterBudget: 6000,
} as const;

export const MEMORY_REMEMBER_MORE_LIMITS = {
  seedMemoryIds: 16,
  maxHops: 4,
  maxItems: 16,
  characterBudget: 20000,
} as const;

export type MemoryRememberMoreReason = (typeof MEMORY_REMEMBER_MORE_REASONS)[number];

export interface MemoryRememberMoreRequest {
  scope: MemoryScope;
  contextId: MemoryContextId;
  seedMemoryIds: MemoryId[];
  reason: MemoryRememberMoreReason;
  maxHops?: number;
  maxItems?: number;
  characterBudget?: number;
}

export interface MemoryRememberMoreEntry {
  memoryId: MemoryId;
  revisionId: MemoryRevisionId;
  revisionNo: number;
  canonicalKey: string;
  kind: MemoryKind;
  state: MemoryState;
  valueText: string;
  sourceSeedMemoryId: MemoryId;
  depth: number;
  relationPath: MemoryRelation[];
  memoryPath: MemoryId[];
  reasonCode: string;
  score: number;
  historicalRevision: boolean;
  characterCount: number;
}

export interface MemoryRememberMoreResult {
  contextId: MemoryContextId;
  reason: MemoryRememberMoreReason;
  seedMemoryIds: MemoryId[];
  expansions: MemoryRememberMoreEntry[];
  characterBudgetConsumed: number;
  truncated: boolean;
  snapshotHash: string;
}

export class MemoryRememberMore {
  constructor(readonly client: MemoryWorkerClient, readonly cognition: MemoryCognitionLedger);
  expand(request: MemoryRememberMoreRequest): Promise<MemoryRememberMoreResult>;
}
```

- [x] **Step 1: Write RED contract/authority tests**

Create tests that assert defaults, hard ceilings, empty/duplicate seed normalization, expired/foreign context rejection, a seed not present in `memory_access_log` rejection, and successful authorization only when `memory_contexts.principal_id`, `memory_access_log.context_id`, and `memory_items` principal/project all prove the same scope.

```ts
await expect(engine.expand({
  scope,
  contextId,
  seedMemoryIds: [neverRecalled.memoryId],
  reason: 'user_requested',
})).rejects.toThrow('MEMORY_REMEMBER_MORE_SEED_NOT_RECALLED');
```

- [x] **Step 2: Run RED**

```bash
npx vitest run tests/memory-remember-more.test.ts
```

Expected: FAIL because `MemoryRememberMore` and remember-more contracts do not exist.

- [x] **Step 3: Implement validation and current seed loading**

Normalize seeds to unique binary-sorted IDs. Validate request bounds before SQL. Authorize every seed with one scoped query equivalent to:

```sql
SELECT item.id
FROM memory_access_log AS access
JOIN memory_contexts AS context ON context.id = access.context_id
JOIN memory_items AS item ON item.id = access.memory_id
WHERE context.id = ?
  AND context.principal_id = ?
  AND context.expires_at > ?
  AND item.principal_id = ?
  AND IFNULL(item.project_id, '') = ?
  AND item.state <> 'tombstoned'
  AND item.id IN (...)
```

Reject the whole request if the authorized set differs from the normalized seed set.

- [x] **Step 4: Implement revision-predecessor expansion**

For each seed, load its current revision and older revisions in descending revision number. A direct predecessor is depth 1; each next older revision increases depth by one and stops at `maxHops`. Emit historical entries with the same memory ID, the historical revision ID/value, `relationPath` containing `supersedes`, `memoryPath=[seedMemoryId]`, priority score `1.0 - 0.05*(depth-1)`, and `historicalRevision=true`.

- [x] **Step 5: Run GREEN for Task 1**

```bash
npx vitest run tests/memory-remember-more.test.ts tests/memory-store.test.ts
npm run build
git diff --check
```

- [x] **Step 6: Commit + push/readback**

```bash
git add src/memory/types.ts src/memory/remember-more.ts tests/memory-remember-more.test.ts
git commit -m "feat: add bounded memory history expansion"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 2: Add Deterministic Historical Graph, Branch, and Conflict Traversal

**Files:**
- Modify: `src/memory/remember-more.ts`
- Modify: `tests/memory-remember-more.test.ts`

**Interfaces:**

Candidate priority and base score are fixed:

```ts
const HISTORY_PRIORITY = {
  revision_predecessor: { priority: 1, score: 1.00 },
  failure_cause:        { priority: 2, score: 0.95 },
  resolved_by:          { priority: 3, score: 0.90 },
  validated_by:         { priority: 4, score: 0.85 },
  branch_parent:        { priority: 5, score: 0.80 },
  conflict:             { priority: 6, score: 0.75 },
  dependency:           { priority: 7, score: 0.70 },
  other_recursive:      { priority: 8, score: 0.65 },
} as const;
```

Depth > 1 subtracts `0.05 * (depth - 1)` from the base score, clamped to `[0,1]`.

- [x] **Step 1: Write RED graph-history tests**

Cover all required certification paths:

```text
solution <-resolved_by- failure
failure -failed_because-> cause
validation <-validated_by- solution
branch -branch_of-> parent
branch metadata branchParentMemoryId -> parent fallback
conflict table counterpart without active edge
current -depends_on/blocked_by-> dependency
```

Also create `token_overlap`, `same_anchor`, `temporal_neighbor`, and `same_task_family` edges and prove they never appear in recursive expansion.

- [x] **Step 2: Run RED**

```bash
npx vitest run tests/memory-remember-more.test.ts
```

Expected: revision tests remain green while graph/branch/conflict cases fail.

- [x] **Step 3: Implement bounded graph traversal**

At each hop, query edges touching the frontier but keep only relations whose `memoryRelationPolicy(relation).recursiveHistory === true`. Use deterministic historical orientation:

```text
supersedes, failed_because, caused_by, branch_of, derived_from,
learned_from, depends_on, blocked_by: follow outgoing target
resolved_by, validated_by, produced, continues: allow both directions
contradicts: allow both directions
```

For `memory_conflicts`, include the opposite scoped memory with synthetic `relationPath=['contradicts']` and conflict priority even if no active edge exists. For `memory_node_metadata.branch_parent_memory_id`, include the scoped parent with `relationPath=['branch_of']` when an equivalent graph candidate is absent.

- [x] **Step 4: Implement deterministic candidate packing**

Sort candidates by:

```text
priority ASC
then depth ASC
then score DESC
then sourceSeedMemoryId BINARY ASC
then memoryId BINARY ASC
then revisionNo DESC
then revisionId BINARY ASC
```

Deduplicate by `memoryId + revisionId`, exclude the seed's current revision, and pack until `maxItems`/`characterBudget`. Oversized candidates are skipped, `truncated=true`, and later smaller candidates may still fit. Any available candidate beyond `maxHops`, `maxItems`, or character budget sets `truncated=true`.

- [x] **Step 5: Add deterministic snapshot hash tests**

Run the same request twice and with reversed seed input. Require identical result ordering, consumed character budget, truncation flag, and `snapshotHash`. Audit row IDs/timestamps must not enter the result hash.

- [x] **Step 6: Run GREEN**

```bash
npx vitest run tests/memory-remember-more.test.ts tests/memory-relation-policy.test.ts tests/memory-retriever.test.ts
npm run build
git diff --check
```

- [x] **Step 7: Commit + push/readback**

```bash
git add src/memory/remember-more.ts tests/memory-remember-more.test.ts
git commit -m "feat: traverse bounded memory history"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 3: Audit Every Returned Expansion and Compose MemoryService

**Files:**
- Modify: `src/memory/remember-more.ts`
- Modify: `src/memory/service.ts`
- Modify: `tests/memory-remember-more.test.ts`
- Modify: `tests/memory-cognition-ledger.test.ts` only if a ledger contract needs clarification.

**Interfaces:**

`MemoryService` adds:

```ts
async rememberMore(request: MemoryRememberMoreRequest): Promise<MemoryRememberMoreResult>;
```

- [x] **Step 1: Write RED audit/service tests**

Require each returned expansion to create one scoped `memory_recall_expansions` row with:

```text
context_id       = request.contextId
source_memory_id = expansion.sourceSeedMemoryId
target_memory_id = expansion.memoryId
depth            = expansion.depth
relation_path    = expansion.relationPath
reason_code      = `${request.reason}:${expansion.reasonCode}`
score            = expansion.score
```

For historical revisions, source and target memory IDs may be equal; the revision identity remains in the returned result while the audit table records the memory-level expansion.

- [x] **Step 2: Implement audit after deterministic packing**

Only returned/packed expansions are audited. Do not audit candidates skipped by bounds. The result snapshot is computed before/independently from generated audit IDs and timestamps so replay remains deterministic.

- [x] **Step 3: Compose engine in MemoryService**

Add `rememberMore: MemoryRememberMore` to `MemoryComponents`, instantiate it with the existing worker client and existing cognition ledger, and expose `MemoryService.rememberMore()` without changing search/preflight behavior.

- [x] **Step 4: Run GREEN/regressions**

```bash
npx vitest run tests/memory-remember-more.test.ts tests/memory-cognition-ledger.test.ts tests/memory-unified-lifecycle.test.ts
npm run build
git diff --check
```

- [x] **Step 5: Commit + push/readback**

```bash
git add src/memory/remember-more.ts src/memory/service.ts tests/memory-remember-more.test.ts tests/memory-cognition-ledger.test.ts
git commit -m "feat: audit memory history expansion"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 4: Add the Read-Only memory_remember_more MCP Tool

**Files:**
- Modify: `src/mcp/memory-tools.ts`
- Modify: `tests/mcp-memory.test.ts`
- Modify exact full-tool-count assertions in `tests/mcp-integration.test.ts`, `tests/execution-mcp.test.ts`, `tests/continuity-checkpoint.test.ts`, `tests/mcp-routing.test.ts`, and `tests/mcp-dual-era.test.ts`.

**Interface:**

```text
memory_remember_more
```

Input schema:

```ts
{
  contextId: z.string().uuid(),
  seedMemoryIds: z.array(z.string().uuid()).min(1).max(16),
  reason: z.enum(MEMORY_REMEMBER_MORE_REASONS),
  maxHops: z.number().int().min(1).max(4).default(2),
  maxItems: z.number().int().min(1).max(16).default(4),
  characterBudget: z.number().int().min(1).max(20_000).default(6000),
  ...optionalScope,
}
```

Annotations remain:

```ts
readOnlyHint: true
destructiveHint: false
idempotentHint: true
openWorldHint: false
```

- [x] **Step 1: Write RED MCP contract test**

Require `MEMORY_TOOL_NAMES` to contain nine tools including `memory_remember_more`, full Agent Core tool surface to contain 56 tools, schema ceilings/defaults to match Phase 3 constants, and a real authenticated call to expand a recalled solution into its prior failure.

- [x] **Step 2: Run RED**

```bash
npx vitest run tests/mcp-memory.test.ts tests/mcp-integration.test.ts tests/mcp-dual-era.test.ts
```

Expected: FAIL because the ninth memory tool is not registered and exact full-tool-count assertions still expect 55.

- [x] **Step 3: Register tool and update factual count contracts**

Append `memory_remember_more` to `MEMORY_TOOL_NAMES`, register it with read-only annotations, resolve principal/project through the same `scope()` helper, and call `runtime.memory.rememberMore()`.

Change only exact assertions/descriptions whose factual tool count becomes 56. Do not change routing requirements or mutation-tool gates.

- [x] **Step 4: Run GREEN MCP + routing regressions**

```bash
npx vitest run \
  tests/mcp-memory.test.ts tests/mcp-integration.test.ts tests/mcp-routing.test.ts \
  tests/mcp-dual-era.test.ts tests/execution-mcp.test.ts tests/continuity-checkpoint.test.ts
npm run build
git diff --check
```

- [x] **Step 5: Commit + push/readback**

```bash
git add src/mcp/memory-tools.ts tests/mcp-memory.test.ts tests/mcp-integration.test.ts tests/mcp-routing.test.ts tests/mcp-dual-era.test.ts tests/execution-mcp.test.ts tests/continuity-checkpoint.test.ts
git commit -m "feat: expose bounded memory remember-more tool"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 5: Phase 3 Certification

**Files:**
- Append factual Phase 3 evidence to `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`.
- Mark Phase 3 factual completion in `docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md` only after every gate below passes.
- Mark this executable plan complete only after the exact certification SHA is remote-visible.

- [x] **Step 1: Run focused Phase 3 suite**

```bash
npx vitest run tests/memory-remember-more.test.ts tests/mcp-memory.test.ts tests/memory-cognition-ledger.test.ts tests/memory-retriever.test.ts tests/memory-awareness.acceptance.test.ts
```

- [x] **Step 2: Run full memory/continuity/execution-memory/MCP regression**

```bash
npx vitest run \
  tests/memory-*.test.ts tests/memory-*.acceptance.test.ts \
  tests/continuity-*.test.ts tests/continuity-*.acceptance.test.ts \
  tests/execution-memory-*.test.ts \
  tests/mcp-*.test.ts
```

Expected: zero failures; memory tool count is exactly 9 and full MCP surface exactly 56.

- [x] **Step 3: Run deterministic quality and performance gates**

```bash
npm run quality:gate
npm run benchmark:memory
```

Required: existing Wave E thresholds still pass, cross-project/principal contamination remains `0`, deterministic replay remains `1`, and 100k preflight p95 remains `<150 ms`.

- [x] **Step 4: Run full release verification and dependency guardrail**

```bash
npm run verify:release
git diff --check
git diff 7db99f892820ada56b159f52238f0fb235af829a -- package.json package-lock.json
git diff 7db99f892820ada56b159f52238f0fb235af829a -- src package.json package-lock.json | grep -Ei 'openai|anthropic|gemini|langchain|langgraph' || true
```

Required: zero new root dependency and zero new external AI/model/API integration.

- [x] **Step 5: Record fresh evidence and publish exact certification SHA**

```bash
git add docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md docs/roadmap/agent-core-memory-nervous-system-phase-3-implementation-plan.md
git commit -m "docs: certify memory nervous system phase 3"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
node scripts/release/check-doc-links.mjs
```

**Phase 3 completion rule:** Phase 3 is certified only when historical expansion is bounded, seed-authorized, principal/project isolated, deterministic, audited, exposed through exactly one new read-only MCP tool, and the exact docs certification SHA is remote-visible with the full release gate green. Phase 4 write-decision authority remains out of scope.


---

## Certification Record — 2026-09-01

**Status:** **CERTIFIED COMPLETE**

**Certified implementation SHA:** `627a3b57481489fc2725986f59cf58d246d917a3`

**Remote branch:** `origin/feature/cross-session-memory-nervous-system`

Task checkpoints:

```text
f9120a6  docs: plan bounded memory remember-more phase
57fe94d  feat: add bounded memory history expansion
dd3d447  feat: traverse bounded memory history
e7451b7  feat: audit memory history expansion
627a3b5  feat: expose bounded memory remember-more tool
```

Certification evidence collected on `627a3b57481489fc2725986f59cf58d246d917a3`:

```text
focused Phase 3                         5 files / 30 PASS / 0 fail
broad subsystem regression             49 files / 202 PASS / 1 skip / 0 fail
memory tools                            9 exactly
full MCP tools                          56 exactly
quality gate                            PASS
Recall@K / MRR                          1.0 / 1.0
cross-project contamination            0
cross-principal contamination          0
deterministic replay                   1.0
100k preflight p95                     53.211 ms (<150 ms)
verify:release                          PASS / exit 0
full release tests                     149 files / 734 PASS / 38 skips
doc links                              45 markdown / 17 links PASS
root dependency diff vs Phase 2        none
external AI/model/API diff             none
```

The certification documentation commit is required to be pushed and read back by exact SHA, then `verify:release` is rerun on that exact final documentation SHA before the phase is reported externally as complete.
