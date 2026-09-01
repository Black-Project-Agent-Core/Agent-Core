# Memory Nervous System Phase 1 — Schema v3 and Cognition Ledgers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to execute this plan task-by-task and `superpowers:test-driven-development` for every production change. Every task uses RED → GREEN → regression → commit → GitHub push/readback.

**Goal:** Add DMF schema v3, typed relation policy, explicit anchor vocabulary, and scoped cognition/audit ledger APIs while preserving existing v0.6.0 recall, continuity, routing, and MCP behavior.

**Architecture:** Phase 1 is additive. `MemoryStore` remains the semantic item/revision authority, `MemoryRetriever` remains the recall authority, and a new `MemoryCognitionLedger` owns write-decision, recall-expansion, node-metadata, edge-event, and remote-state bookkeeping through the existing worker-backed SQLite client. `MemoryRelationPolicy` becomes the single authority for relation directionality/default weights so later causal/evolution relations are never accidentally mirrored like associative relations.

**Tech Stack:** TypeScript 7, Node.js >=24.15, `node:sqlite`, existing `MemoryWorkerClient`, Vitest.

**Spec:** `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`

## Global Constraints

- Schema migration is additive from v2 to v3 and uses existing automatic pre-migration backup behavior.
- Existing model-facing memory tool count remains exactly eight in Phase 1.
- Existing default retrieval score weights and recall bounds do not change.
- No external AI/model/API dependency or new root package dependency.
- Principal/project isolation is mandatory for every new query/write API.
- `memory_edge_events` is append-only.
- Existing `memory_events` append-only behavior is preserved.
- New causal/evolution relations are directed; associative relations are symmetric according to one central relation policy.
- Phase 1 records remote durability state but does not perform network synchronization yet.
- Existing 100k-memory preflight p95 target remains `<150 ms`.

---

## File Structure

### New production files

- `src/memory/relation-policy.ts` — relation directionality, default weight, and historical-expansion classification.
- `src/memory/cognition-ledger.ts` — scoped persistence/query APIs for write decisions, recall expansions, node metadata, edge events, and local remote sync state.

### Modified production files

- `src/memory/schema.ts` — schema version 3 and migration SQL.
- `src/memory/types.ts` — new relation/decision/ledger/durability types and explicit anchors.
- `src/memory/anchors.ts` — expanded explicit anchor vocabulary while retaining current automatic extraction.
- `src/memory/store.ts` — relation policy use, explicit-anchor persistence, audited explicit edge creation.
- `src/memory/linker.ts` — central relation policy use and audited inferred edge creation.
- `src/memory/service.ts` — compose `MemoryCognitionLedger`, expose bounded internal ledger methods/status counts.
- `src/config.ts` — Phase 1 does not add remote network configuration; no behavior change required.

### New/modified tests

- `tests/memory-schema.test.ts` — v3 tables/triggers/types.
- `tests/continuity-schema.test.ts` — v2→v3 migration and rollback preservation.
- `tests/memory-cognition-ledger.test.ts` — ledger scope/isolation/idempotence/state behavior.
- `tests/memory-relation-policy.test.ts` — exact directionality/default policy.
- `tests/memory-linker.test.ts` — edge audit events and no accidental mirroring of directed relations.
- `tests/memory-store.test.ts` — explicit anchors + explicit directed relation audit.
- `tests/memory-recovery.test.ts` — schema v3 migration backup expectations.
- `tests/execution-memory-bridge.test.ts` — mock status schema version adjustment only where necessary.

---

### Task 1: Define the Phase 1 Type Contract and Schema v3 Migration

**Files:**
- Modify: `src/memory/types.ts`
- Modify: `src/memory/schema.ts`
- Modify: `tests/memory-schema.test.ts`
- Modify: `tests/continuity-schema.test.ts`

**Interfaces:**
- Produces `MemoryPersistenceDecisionType`, `MemoryWriteReasonCode`, `MemoryEdgeEventType`, `MemoryRemoteDurabilityState`, `MemoryHydrationState`, `MemoryExplicitAnchor`, `MemoryWriteDecisionRecord`, `MemoryRecallExpansionRecord`, `MemoryNodeMetadataRecord`, `MemoryRemoteStateRecord`.
- Produces schema tables consumed by `MemoryCognitionLedger` in Task 4.

- [ ] **Step 1: Write RED schema/type tests**

Extend `tests/memory-schema.test.ts` so the exact relation vocabulary includes legacy compatibility plus the approved semantic relations:

```ts
expect(MEMORY_RELATIONS).toEqual([
  'same_key', 'supersedes', 'explicit_relation', 'same_anchor', 'same_artifact',
  'same_route_or_task', 'cooccurs_in_event', 'token_overlap', 'temporal_neighbor',
  'continues', 'branch_of', 'derived_from', 'learned_from',
  'caused_by', 'failed_because', 'resolved_by', 'validated_by',
  'blocked_by', 'depends_on', 'produced', 'contradicts', 'same_task_family',
]);
```

Assert:

```ts
expect(MEMORY_PERSISTENCE_DECISIONS).toEqual([
  'NO_DURABLE_MEMORY', 'REVISE_EXISTING', 'LINK_EXISTING',
  'WRITE_BRANCH', 'WRITE_NEW_ROOT', 'OPEN_CONFLICT',
]);
expect(MEMORY_REMOTE_DURABILITY_STATES).toEqual([
  'LOCAL_COMMITTED', 'REMOTE_PENDING', 'REMOTE_SYNCED',
  'REMOTE_CONFLICT', 'REMOTE_UNAVAILABLE',
]);
expect(MEMORY_HYDRATION_STATES).toEqual([
  'REMOTE_EMPTY_CONFIRMED', 'REMOTE_HYDRATED', 'REMOTE_UNAVAILABLE',
  'REMOTE_AUTH_FAILED', 'REMOTE_DECRYPT_FAILED', 'REMOTE_INTEGRITY_FAILED',
  'REMOTE_REPLAY_FAILED',
]);
```

Update schema assertions to require `MEMORY_SCHEMA_VERSION === 3`, migration `003_memory_cognition_ledgers`, and these tables:

```text
memory_write_decisions
memory_recall_expansions
memory_edge_events
memory_node_metadata
memory_remote_state
```

Assert append-only update/delete triggers exist for `memory_edge_events`.

Extend `tests/continuity-schema.test.ts` with a v2 fixture containing a real memory + continuity task/checkpoint, then require v2→v3 migration to preserve them exactly. Add a sabotaged v2→v3 migration test that expects rollback to `PRAGMA user_version = 2` and a `pre-migration-v2-to-v3` verified backup.

- [ ] **Step 2: Run RED tests and confirm the missing v3 contract is the failure**

Run:

```bash
npx vitest run tests/memory-schema.test.ts tests/continuity-schema.test.ts
```

Expected: FAIL because schema version is 2 and v3 constants/tables/types do not exist.

- [ ] **Step 3: Add the minimal type contract**

In `src/memory/types.ts`, add the constants and exported union types above plus:

```ts
export const MEMORY_EDGE_EVENT_TYPES = ['edge.created', 'edge.reweighted', 'edge.retracted'] as const;

export const MEMORY_WRITE_REASON_CODES = [
  'DUPLICATE_CANONICAL', 'DUPLICATE_VALUE', 'SAME_BELIEF_NEW_EVIDENCE',
  'BELIEF_CHANGED', 'PROCEDURE_CHANGED', 'CURRENT_STATE_CHANGED',
  'DISTINCT_BRANCH', 'FRESH_DURABLE_CONTEXT', 'FAILURE_OBSERVED',
  'SOLUTION_VERIFIED', 'CONFLICT_DETECTED', 'RELATED_EXISTING_ONLY',
  'TRANSIENT_OPERATION', 'INSUFFICIENT_EVIDENCE', 'NO_FUTURE_RELEVANCE',
  'USER_EXPLICITLY_REQUESTED_MEMORY', 'GUARDRAIL_CREATED',
  'GUARDRAIL_CHANGED', 'ARTIFACT_VERIFIED',
] as const;
```

Add:

```ts
export interface MemoryExplicitAnchor {
  type: MemoryAnchorType;
  value: string;
}
```

by importing the type from `anchors.ts` as a type-only import, and add `explicitAnchors?: MemoryExplicitAnchor[]` to `MemoryCommitRequest`.

Define bounded record interfaces matching the schema fields. JSON collection fields are represented as typed arrays/objects in TypeScript and serialized only inside the ledger.

- [ ] **Step 4: Add migration 003**

In `src/memory/schema.ts`:

```ts
export const MEMORY_SCHEMA_VERSION = 3;
export const MEMORY_COGNITION_MIGRATION = '003_memory_cognition_ledgers';
```

Add one additive SQL migration creating:

```sql
CREATE TABLE IF NOT EXISTS memory_write_decisions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  route_context_id TEXT NOT NULL,
  continuity_task_id TEXT,
  context_id TEXT,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'NO_DURABLE_MEMORY','REVISE_EXISTING','LINK_EXISTING',
    'WRITE_BRANCH','WRITE_NEW_ROOT','OPEN_CONFLICT'
  )),
  candidate_canonical_key TEXT,
  candidate_hash TEXT NOT NULL,
  target_memory_id TEXT,
  existing_memory_ids_json TEXT NOT NULL DEFAULT '[]',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  relation_plan_json TEXT NOT NULL DEFAULT '[]',
  root_reason TEXT,
  created_at INTEGER NOT NULL,
  applied_at INTEGER,
  apply_result_json TEXT
);

CREATE TABLE IF NOT EXISTS memory_recall_expansions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  context_id TEXT NOT NULL,
  source_memory_id TEXT NOT NULL,
  target_memory_id TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 1),
  relation_path_json TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  score REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_edge_events (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('edge.created','edge.reweighted','edge.retracted')),
  from_memory_id TEXT NOT NULL,
  to_memory_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  old_weight REAL,
  new_weight REAL,
  evidence_event_id TEXT,
  reason_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (from_memory_id <> to_memory_id)
);

CREATE TABLE IF NOT EXISTS memory_node_metadata (
  memory_id TEXT PRIMARY KEY REFERENCES memory_items(id) ON DELETE CASCADE,
  title TEXT,
  root_reason TEXT,
  novelty_class TEXT,
  created_from_decision_id TEXT,
  branch_parent_memory_id TEXT REFERENCES memory_items(id),
  semantic_profile_json TEXT,
  semantic_profile_hash TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_remote_state (
  principal_id TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  durability_state TEXT NOT NULL,
  hydration_state TEXT,
  remote_generation TEXT,
  remote_head TEXT,
  logical_state_hash TEXT,
  last_error_code TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(principal_id, project_id)
);
```

Add scope/time indexes for decision/expansion/edge-event queries and append-only triggers for `memory_edge_events` update/delete.

Append migration 3 to `MEMORY_MIGRATIONS` and `MEMORY_SCHEMA_SQL`.

- [ ] **Step 5: Run GREEN schema tests**

Run:

```bash
npx vitest run tests/memory-schema.test.ts tests/continuity-schema.test.ts tests/memory-recovery.test.ts
```

Expected: PASS, including real v2→v3 migration, backup, and rollback.

- [ ] **Step 6: Run build + diff check**

```bash
npm run build
git diff --check
```

- [ ] **Step 7: Commit and publish checkpoint**

```bash
git add src/memory/types.ts src/memory/schema.ts tests/memory-schema.test.ts tests/continuity-schema.test.ts tests/memory-recovery.test.ts tests/execution-memory-bridge.test.ts
git commit -m "feat: add memory cognition schema v3"
git push -u origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 2: Centralize Relation Directionality and Default Weights

**Files:**
- Create: `src/memory/relation-policy.ts`
- Create: `tests/memory-relation-policy.test.ts`
- Modify: `src/memory/linker.ts`
- Modify: `src/memory/store.ts`

**Interfaces:**
- Produces:

```ts
export type MemoryRelationDirection = 'directed' | 'symmetric';
export interface MemoryRelationPolicy {
  relation: MemoryRelation;
  direction: MemoryRelationDirection;
  defaultWeight: number;
  recursiveHistory: boolean;
}
export function memoryRelationPolicy(relation: MemoryRelation): MemoryRelationPolicy;
export function shouldMirrorMemoryRelation(relation: MemoryRelation): boolean;
```

- Existing callers consume this policy instead of private `FIXED_RELATION_WEIGHT` / `RELATION_WEIGHTS` authority.

- [ ] **Step 1: Write RED policy tests**

`tests/memory-relation-policy.test.ts` must prove:

```ts
expect(shouldMirrorMemoryRelation('same_anchor')).toBe(true);
expect(shouldMirrorMemoryRelation('same_task_family')).toBe(true);
expect(shouldMirrorMemoryRelation('contradicts')).toBe(true);
expect(shouldMirrorMemoryRelation('supersedes')).toBe(false);
expect(shouldMirrorMemoryRelation('branch_of')).toBe(false);
expect(shouldMirrorMemoryRelation('failed_because')).toBe(false);
expect(shouldMirrorMemoryRelation('resolved_by')).toBe(false);
expect(shouldMirrorMemoryRelation('validated_by')).toBe(false);
```

Require legacy weights to remain exactly unchanged. Evidence-authorized semantic causal/evolution relations use deterministic default weight `1.0`; `same_task_family` uses `0.80`. Historical recursion is allowed only for explicit evolution/causal/conflict relations, never `token_overlap` or `temporal_neighbor`.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/memory-relation-policy.test.ts
```

Expected: FAIL because `relation-policy.ts` does not exist.

- [ ] **Step 3: Implement the policy table**

Create `src/memory/relation-policy.ts` with one exhaustive `Record<MemoryRelation, MemoryRelationPolicy>`. Export a compatibility `RELATION_WEIGHTS` projection from this source if existing tests/callers need it.

- [ ] **Step 4: Replace local directionality logic**

In `MemoryStore`, replace:

```ts
if (relation.relation !== 'supersedes')
```

with:

```ts
if (shouldMirrorMemoryRelation(relation.relation))
```

In `MemoryLinker`, import default relation weights from `relation-policy.ts`. Keep automatic linker inference limited to the existing deterministic associative signals in Phase 1; do not infer causal relations from prose.

- [ ] **Step 5: Run GREEN + existing linker/store regressions**

```bash
npx vitest run tests/memory-relation-policy.test.ts tests/memory-linker.test.ts tests/memory-store.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/relation-policy.ts src/memory/linker.ts src/memory/store.ts tests/memory-relation-policy.test.ts tests/memory-linker.test.ts tests/memory-store.test.ts
git commit -m "feat: define typed memory relation policy"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 3: Persist Explicit Anchors Without Guessing Identity From UUID Text

**Files:**
- Modify: `src/memory/anchors.ts`
- Modify: `src/memory/types.ts`
- Modify: `src/memory/store.ts`
- Modify: `tests/memory-anchors.test.ts`
- Modify: `tests/memory-store.test.ts`

**Interfaces:**
- `MemoryAnchorType` additionally supports:

```text
continuity_task_id
continuity_checkpoint_id
artifact_hash
git_commit
branch_name
```

- `MemoryCommitRequest.explicitAnchors` is the authoritative path for contextual identities that cannot be safely inferred from generic UUID/text alone.

- [ ] **Step 1: Write RED tests**

Require a commit with:

```ts
explicitAnchors: [
  { type: 'continuity_task_id', value: 'task-123' },
  { type: 'git_commit', value: '482489d799ed696b752875a1753cbdc6527e5115' },
]
```

to persist exactly those typed anchors, deduplicate repeated identical anchors, reject blank/redacted anchor values, and remain searchable by the anchor value through the existing exact-seed path.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/memory-anchors.test.ts tests/memory-store.test.ts
```

Expected: FAIL because explicit contextual anchors are not supported.

- [ ] **Step 3: Implement explicit anchor validation/persistence**

Keep current automatic anchor extraction unchanged. Add explicit validated anchors after the canonical-key anchor and inferred anchors, deduplicated by `type\0value`, capped together at 128 anchors per memory. Reject blank values and values containing redaction markers.

- [ ] **Step 4: Run GREEN/regression**

```bash
npx vitest run tests/memory-anchors.test.ts tests/memory-store.test.ts tests/memory-retriever.test.ts
npm run build
git diff --check
```

- [ ] **Step 5: Commit + push/readback**

```bash
git add src/memory/anchors.ts src/memory/types.ts src/memory/store.ts tests/memory-anchors.test.ts tests/memory-store.test.ts tests/memory-retriever.test.ts
git commit -m "feat: add explicit memory context anchors"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 4: Implement the Scoped Memory Cognition Ledger

**Files:**
- Create: `src/memory/cognition-ledger.ts`
- Create: `tests/memory-cognition-ledger.test.ts`
- Modify: `src/memory/service.ts`

**Interfaces:**

```ts
export class MemoryCognitionLedger {
  constructor(readonly client: MemoryWorkerClient);

  recordWriteDecision(input: MemoryWriteDecisionInput): Promise<MemoryWriteDecisionRecord>;
  markWriteDecisionApplied(scope: MemoryScope, decisionId: string, result: Record<string, unknown>): Promise<MemoryWriteDecisionRecord>;
  recordRecallExpansion(input: MemoryRecallExpansionInput): Promise<MemoryRecallExpansionRecord>;
  listRecallExpansions(scope: MemoryScope, contextId: string): Promise<MemoryRecallExpansionRecord[]>;
  upsertNodeMetadata(input: MemoryNodeMetadataInput): Promise<MemoryNodeMetadataRecord>;
  getNodeMetadata(scope: MemoryScope, memoryId: string): Promise<MemoryNodeMetadataRecord | null>;
  setRemoteState(input: MemoryRemoteStateInput): Promise<MemoryRemoteStateRecord>;
  getRemoteState(scope: MemoryScope): Promise<MemoryRemoteStateRecord | null>;
}
```

`MemoryService` exposes narrow internal wrappers with the same semantics. No new MCP tool is registered in this phase.

- [ ] **Step 1: Write RED ledger tests**

`tests/memory-cognition-ledger.test.ts` must cover:

1. `NO_DURABLE_MEMORY` decision persists with zero semantic node creation.
2. reason codes and evidence refs serialize deterministically.
3. applying a decision records `appliedAt` and result only inside the authenticated scope.
4. recall-expansion rows are context/scoped and ordered deterministically.
5. node metadata cannot be read across project/principal scope.
6. root reason and branch-parent metadata round-trip.
7. remote state distinguishes `REMOTE_PENDING` from `REMOTE_SYNCED` and preserves generation/head/hash.
8. invalid decision/reason/durability values are rejected by types/schema boundaries.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/memory-cognition-ledger.test.ts
```

Expected: FAIL because `MemoryCognitionLedger` does not exist.

- [ ] **Step 3: Implement deterministic serialization and scoped SQL**

Create `cognition-ledger.ts`. Use a private stable JSON serializer with lexicographically sorted object keys and recursive redaction of secret-like keys/strings before any JSON is persisted. Every read/update query includes:

```text
principal_id = scope.principalId
IFNULL(project_id, '') = scope.projectId ?? ''
```

For node metadata, prove scope through a join to `memory_items` before write/read.

- [ ] **Step 4: Compose ledger in MemoryService**

Add `cognition: MemoryCognitionLedger` to `MemoryComponents`, instantiate it with the existing worker client, and expose wrappers. Extend `MemoryService.status(scope)` counts with:

```text
write_decisions
recall_expansions
edge_events
```

without changing existing count keys.

- [ ] **Step 5: Run GREEN + service regressions**

```bash
npx vitest run tests/memory-cognition-ledger.test.ts tests/memory-unified-lifecycle.test.ts tests/memory-awareness.acceptance.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/cognition-ledger.ts src/memory/service.ts tests/memory-cognition-ledger.test.ts
git commit -m "feat: add scoped memory cognition ledger"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 5: Audit Active Graph Edge Creation Without Changing Recall Semantics

**Files:**
- Modify: `src/memory/cognition-ledger.ts`
- Modify: `src/memory/store.ts`
- Modify: `src/memory/linker.ts`
- Modify: `tests/memory-linker.test.ts`
- Modify: `tests/memory-store.test.ts`
- Modify: `tests/memory-cognition-ledger.test.ts`

**Interfaces:**

Add a reusable operation builder:

```ts
export function auditedEdgeInsertOperations(input: {
  eventId: string;
  scope: Pick<MemoryScope, 'principalId' | 'projectId'>;
  fromMemoryId: string;
  toMemoryId: string;
  relation: MemoryRelation;
  weight: number;
  evidenceEventId?: string;
  reasonCode: string;
  createdAt: number;
}): MemoryWorkerSqlOperation[];
```

It returns two adjacent SQL operations:

1. `INSERT OR IGNORE` into active `memory_edges`.
2. `INSERT ... SELECT ... WHERE changes() = 1` into append-only `memory_edge_events`.

This records an `edge.created` event only when the active projection actually changed.

- [ ] **Step 1: Write RED edge-audit tests**

Require:

- first inferred associative link creates corresponding edge-event rows;
- re-running linker creates zero new active edges and zero new edge-created events;
- an explicit `branch_of` relation creates only child→parent active edge/event;
- `contradicts` creates controlled paired directions/events;
- `memory_edge_events` UPDATE/DELETE throws append-only errors;
- no cross-scope target can be linked by an explicit relation.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/memory-linker.test.ts tests/memory-store.test.ts tests/memory-cognition-ledger.test.ts
```

Expected: FAIL because active edge creation is not yet audited and target scope is not yet verified before explicit relation persistence.

- [ ] **Step 3: Implement audited edge operations**

Use the operation builder from both Store and Linker. Keep each insert/audit pair in the same worker transaction and batch linker operations at a pair-safe boundary (for example, 800 operations, always an even count).

Before accepting an explicit relation, load the target memory within the same principal/project scope. If absent, throw `MEMORY_RELATION_TARGET_NOT_FOUND` before any transaction.

- [ ] **Step 4: Run GREEN/regression**

```bash
npx vitest run tests/memory-linker.test.ts tests/memory-store.test.ts tests/memory-cognition-ledger.test.ts tests/memory-retriever.test.ts tests/memory-ranking-quality.test.ts
npm run build
git diff --check
```

- [ ] **Step 5: Commit + push/readback**

```bash
git add src/memory/cognition-ledger.ts src/memory/store.ts src/memory/linker.ts tests/memory-linker.test.ts tests/memory-store.test.ts tests/memory-cognition-ledger.test.ts
git commit -m "feat: audit memory graph edge creation"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 6: Phase 1 Full Regression, Quality, Performance, and Certification Evidence

**Files:**
- Modify: `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md` only to append factual Phase 1 implementation evidence; do not rewrite approved requirements.
- Modify: `docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md` to mark Phase 1 factual completion only after all gates pass.

**Interfaces:** No production interface change.

- [ ] **Step 1: Run the complete focused subsystem suite**

```bash
npx vitest run \
  tests/memory-*.test.ts tests/memory-*.acceptance.test.ts \
  tests/continuity-*.test.ts tests/continuity-*.acceptance.test.ts \
  tests/execution-memory-*.test.ts tests/mcp-memory.test.ts
```

Expected: zero failures; `mcp-memory` still proves exactly eight model-facing memory tools.

- [ ] **Step 2: Run deterministic quality gate**

```bash
npm run quality:gate
```

Expected: all existing Wave E routing/memory gates remain within certified thresholds, with cross-project/principal contamination `0`.

- [ ] **Step 3: Run memory benchmark**

```bash
npm run benchmark:memory
```

Expected: certified 100k memory preflight p95 remains `<150 ms`.

- [ ] **Step 4: Run full release verification**

```bash
npm run verify:release
git diff --check
```

Expected: zero failures and no release-contract regression.

- [ ] **Step 5: Verify dependency/model guardrails**

```bash
git diff 482489d799ed696b752875a1753cbdc6527e5115 -- package.json package-lock.json
grep -RInE "openai|anthropic|gemini|langchain|langgraph" src package.json --exclude-dir=node_modules || true
```

Interpret matches as code review evidence; required result is no newly introduced external AI/model/API dependency.

- [ ] **Step 6: Record only fresh evidence, commit, and push/readback**

```bash
git add docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md
git commit -m "docs: certify memory nervous system phase 1"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

**Phase 1 completion rule:** Do not merge to `main` merely because focused tests pass. Phase 1 is certified only after the fresh full release/quality/performance gates above pass and the exact certified SHA is remote-visible.
