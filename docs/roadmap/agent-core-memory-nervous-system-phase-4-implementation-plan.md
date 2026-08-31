# Memory Nervous System Phase 4 — Memory Cognition / Write Decision Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic `MemoryCognitionController` that converts structured postflight evidence into exactly one persisted memory decision, enforces revise/branch/root/conflict node-creation policy, and can explicitly apply that decision without silently changing existing promotion paths.

**Architecture:** Phase 4 builds on schema-v3 cognition tables already certified in Phase 1 and the Phase 3 bounded history engine. A pure/bounded semantic-profile and write-policy layer validates caller-supplied structured evidence; `MemoryCognitionController` uses existing `MemoryStore`, `MemoryLifecycle`, `MemoryLinker`, `MemoryCognitionLedger`, and relation policy as authorities. Evaluation is advisory/audit by default and always records a decision; semantic mutation happens only through an explicit controller apply path. Continuity/Execution promotion remains unchanged until Phase 5.

**Tech Stack:** TypeScript 7, Node.js >=24.15, worker-backed SQLite DMF, existing schema v3 cognition ledger, existing relation policy, Vitest.

**Spec:** `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md` sections 14, 17–21, 25–27 and `docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md` Phase 4.

## Global Constraints

- The six persistence decisions remain exactly: `NO_DURABLE_MEMORY`, `REVISE_EXISTING`, `LINK_EXISTING`, `WRITE_BRANCH`, `WRITE_NEW_ROOT`, `OPEN_CONFLICT`.
- Every meaningful Phase-4 controller evaluation persists one `memory_write_decisions` row, including rejected/no-write outcomes.
- Evaluation/advisory mode must create zero semantic memory nodes, revisions, conflicts, or graph edges.
- Existing Continuity and Execution promotion paths must not be redirected through the controller in Phase 4.
- A decision must never depend on a single floating-point similarity score.
- Exact canonical identity and exact normalized semantic-profile hash are deterministic duplicate/same-knowledge signals; semantic profiles are descriptions, not evidence.
- New non-root nodes require at least one justified semantic relation backed by evidence.
- `WRITE_BRANCH` requires a same-scope parent and a directed `branch_of` or `derived_from` relation from new child to parent.
- `WRITE_NEW_ROOT` requires `FRESH_DURABLE_CONTEXT` and persisted `rootReason`; roots are rejected when an exact canonical or exact semantic-profile identity already exists.
- Failures are immutable episodic nodes and are never revised in place.
- `OPEN_CONFLICT` preserves both memories and opens a `memory_conflicts` record; no silent winner is selected.
- Weak associative relations (`same_key`, `explicit_relation`, `same_anchor`, `same_artifact`, `same_route_or_task`, `cooccurs_in_event`, `token_overlap`, `temporal_neighbor`, `same_task_family`) cannot justify new non-root node creation by themselves.
- Structured semantic profiles and relation/evidence metadata pass existing memory redaction before persistence or hashing.
- No schema migration, root dependency, external AI/model/API, embedding service, LangChain, or LangGraph is added.
- Phase 4 adds no model-facing MCP tool; the memory MCP count remains 9 and total Agent Core MCP count remains 56.

---

## File Structure

### New production files

- `src/memory/semantic-profile.ts` — bounded profile normalization, redaction, canonical JSON, SHA-256 identity.
- `src/memory/write-policy.ts` — pure deterministic decision validation/classification helpers and semantic relation gates.
- `src/memory/cognition-controller.ts` — advisory evaluation, decision persistence, explicit application orchestration.

### Modified production files

- `src/memory/types.ts` — structured semantic-profile, postflight candidate/relation/request/result contracts.
- `src/memory/cognition-ledger.ts` — bounded semantic-profile persistence and exact profile-hash lookup.
- `src/memory/store.ts` — narrow scoped explicit-relation writer using existing audited edge machinery.
- `src/memory/service.ts` — compose controller and expose `evaluatePostflight()` / `applyPostflight()`; no automatic caller adoption.

### Tests

- `tests/memory-semantic-profile.test.ts` — normalization/redaction/bounds/hash determinism.
- `tests/memory-write-policy.test.ts` — decision classification and node-creation invariants.
- `tests/memory-cognition-controller.test.ts` — advisory/audit behavior plus explicit apply scenarios.
- `tests/memory-cognition-ledger.test.ts` — exact semantic-profile lookup and bounded metadata persistence.
- `tests/memory-store.test.ts` — scoped/audited explicit relation writer.
- `tests/mcp-memory.test.ts`, `tests/mcp-integration.test.ts` — factual guard that Phase 4 adds no MCP surface.

---

### Task 1: Add Bounded Structured Semantic Profiles and Postflight Contracts

**Files:**
- Create: `src/memory/semantic-profile.ts`
- Modify: `src/memory/types.ts`
- Modify: `src/memory/cognition-ledger.ts`
- Create: `tests/memory-semantic-profile.test.ts`
- Modify: `tests/memory-cognition-ledger.test.ts`

**Interfaces:**

```ts
export interface MemorySemanticProfile {
  title?: string;
  summary?: string;
  intent?: string;
  concepts?: string[];
  entities?: string[];
  constraints?: string[];
  artifacts?: string[];
  outcome?: string;
  failureMode?: string;
  solution?: string;
  futureRelevance?: string[];
}

export interface NormalizedMemorySemanticProfile {
  profile: MemorySemanticProfile;
  canonicalJson: string;
  hash: string;
}

export function normalizeMemorySemanticProfile(
  input: MemorySemanticProfile,
): NormalizedMemorySemanticProfile;

export interface MemoryPostflightCandidate {
  canonicalKey: string;
  kind: MemoryKind;
  value: MemoryCommitRequest['value'];
  importance?: number;
  pinned?: boolean;
  enforcement?: MemoryEnforcement;
  sourceType?: string;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
  title?: string;
  semanticProfile?: MemorySemanticProfile;
}

export interface MemoryPostflightRelationProposal {
  targetMemoryId: MemoryId;
  relation: MemoryRelation;
  evidenceRefs: string[];
}

export interface MemoryPostflightRequest {
  scope: MemoryScope;
  routeContextId: string;
  continuityTaskId?: string;
  contextId?: string;
  candidate?: MemoryPostflightCandidate;
  reasonCodes: MemoryWriteReasonCode[];
  evidenceRefs: string[];
  relatedMemoryIds?: MemoryId[];
  targetMemoryId?: MemoryId;
  branchParentMemoryId?: MemoryId;
  conflictWithMemoryId?: MemoryId;
  conflictType?: string;
  rootReason?: string;
  proposedRelations?: MemoryPostflightRelationProposal[];
}

export interface MemoryPostflightDecisionBase {
  decisionRecord: MemoryWriteDecisionRecord;
  decision: MemoryPersistenceDecisionType;
  targetMemoryId?: MemoryId;
  existingMemoryIds: MemoryId[];
  reasonCodes: MemoryWriteReasonCode[];
  candidateHash: string;
  semanticProfileHash?: string;
}

export interface MemoryPostflightEvaluation extends MemoryPostflightDecisionBase {
  advisory: true;
}

export interface MemoryPostflightApplyResult extends MemoryPostflightDecisionBase {
  advisory: false;
  applied: boolean;
  semanticMutation: boolean;
  memoryId?: MemoryId;
  revisionId?: MemoryRevisionId;
  conflictId?: string;
  createdEdges: number;
}
```

Profile bounds are deliberately conservative and deterministic:

```text
string field max length                 2000 characters
array field max items                   32
individual array item max length        500 characters
canonical profile JSON max              16000 UTF-8 bytes
unknown profile keys                    rejected
empty strings/items                     removed
array duplicates                        removed + binary sorted
all persisted strings                   redacted before hashing
```

- [ ] **Step 1: Write RED semantic-profile tests**

Test that key order and duplicate array order produce the same canonical JSON/hash, secrets are redacted before hashing, unknown keys/oversized strings/arrays/JSON are rejected, and empty fields disappear.

```ts
const a = normalizeMemorySemanticProfile({
  title: 'PPT Font Unit Regression',
  concepts: ['EMU', 'font size', 'EMU'],
  constraints: ['Authorization: Bearer secret-token'],
});
const b = normalizeMemorySemanticProfile({
  constraints: ['Authorization: Bearer different-token'],
  concepts: ['font size', 'EMU'],
  title: 'PPT Font Unit Regression',
});
expect(a.profile.concepts).toEqual(['EMU', 'font size']);
expect(a.profile.constraints).toEqual(['[REDACTED:BEARER]']);
expect(a.hash).toBe(b.hash);
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/memory-semantic-profile.test.ts
```

Expected: FAIL because profile contracts/normalizer do not exist.

- [ ] **Step 3: Implement contracts and normalizer**

Use existing `redactMemoryText()`, UTF-8 byte length, recursive stable JSON key ordering, binary-sorted de-duplicated string arrays, and SHA-256. Do not infer profile fields from free-form text in Phase 4.

- [ ] **Step 4: Make node metadata use the bounded profile normalizer**

`MemoryCognitionLedger.upsertNodeMetadata()` must call `normalizeMemorySemanticProfile()` for `semanticProfile` instead of arbitrary recursive structured JSON, and persist exactly that canonical JSON/hash.

Add:

```ts
async findNodeMetadataBySemanticProfileHash(
  scope: MemoryScope,
  semanticProfileHash: string,
): Promise<MemoryNodeMetadataRecord[]>;
```

The query joins `memory_node_metadata` to `memory_items`, enforces principal/project scope, excludes tombstoned nodes, and orders by `memory_id COLLATE BINARY`.

- [ ] **Step 5: Run GREEN/regressions**

```bash
npx vitest run tests/memory-semantic-profile.test.ts tests/memory-cognition-ledger.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/types.ts src/memory/semantic-profile.ts src/memory/cognition-ledger.ts tests/memory-semantic-profile.test.ts tests/memory-cognition-ledger.test.ts
git commit -m "feat: bound memory semantic profiles"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 2: Add Deterministic Write Policy and Scoped Explicit Relation Writer

**Files:**
- Create: `src/memory/write-policy.ts`
- Modify: `src/memory/store.ts`
- Create: `tests/memory-write-policy.test.ts`
- Modify: `tests/memory-store.test.ts`

**Interfaces:**

```ts
export const MEMORY_NODE_CREATION_RELATIONS = [
  'continues', 'branch_of', 'derived_from', 'learned_from',
  'caused_by', 'failed_because', 'resolved_by', 'validated_by',
  'blocked_by', 'depends_on', 'produced', 'contradicts',
] as const;

export function isNodeCreationRelation(relation: MemoryRelation): boolean;

export function validatePostflightRelationPlan(input: {
  decision: MemoryPersistenceDecisionType;
  candidatePresent: boolean;
  branchParentMemoryId?: string;
  conflictWithMemoryId?: string;
  proposedRelations: MemoryPostflightRelationProposal[];
}): void;

export function deriveMutableChangeReason(kind: MemoryKind): MemoryWriteReasonCode;

MemoryStore.getMemoryByCanonicalKey(
  scope: MemoryScope,
  canonicalKey: string,
): Promise<StoredMemoryRecord | null>;

MemoryStore.addExplicitRelation(input: {
  scope: MemoryScope;
  fromMemoryId: MemoryId;
  toMemoryId: MemoryId;
  relation: MemoryRelation;
  weight?: number;
  evidenceEventId?: MemoryEventId;
  reasonCode: string;
}): Promise<{ createdEdges: number }>;
```

Policy invariants:

```text
WRITE_BRANCH       child->parent branch_of/derived_from required
WRITE_NEW_ROOT     no branch parent; FRESH_DURABLE_CONTEXT handled by controller
OPEN_CONFLICT      contradicts target required
LINK_EXISTING      all endpoints must already exist
weak relation only cannot justify WRITE_BRANCH/OPEN_CONFLICT
relation direction uses relation-policy; symmetric relations mirror exactly once
cross-scope endpoints rejected before mutation
```

- [ ] **Step 1: Write RED policy/relation tests**

Cover weak-edge rejection for node creation, valid branch/conflict plans, exact directionality, symmetric mirror behavior, idempotent rerun, audited edge events, and cross-project/principal target rejection.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/memory-write-policy.test.ts tests/memory-store.test.ts
```

Expected: FAIL because write-policy and `addExplicitRelation()` do not exist.

- [ ] **Step 3: Implement pure relation/node gate policy**

Use `memoryRelationPolicy()` as the only directionality source. Do not duplicate a second relation policy table.

- [ ] **Step 4: Expose exact canonical lookup and implement scoped Store relation writer**

Expose `getMemoryByCanonicalKey()` as a narrow public wrapper over the existing normalized/scoped canonical lookup; it returns the current stored record only and performs no mutation. Before relation writing, load both endpoints inside the authenticated principal/project scope and reject tombstoned/missing endpoints. Use `auditedEdgeInsertOperations()` and `shouldMirrorMemoryRelation()` so graph projection and edge-event audit remain atomic and consistent with existing explicit commit relations.

- [ ] **Step 5: Run GREEN/regressions**

```bash
npx vitest run tests/memory-write-policy.test.ts tests/memory-store.test.ts tests/memory-relation-policy.test.ts tests/memory-cognition-ledger.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/write-policy.ts src/memory/store.ts tests/memory-write-policy.test.ts tests/memory-store.test.ts
git commit -m "feat: enforce memory write relation policy"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 3: Implement Advisory MemoryCognitionController Evaluation

**Files:**
- Create: `src/memory/cognition-controller.ts`
- Modify: `src/memory/types.ts`
- Create: `tests/memory-cognition-controller.test.ts`

**Interfaces:**

```ts
export class MemoryCognitionController {
  constructor(
    readonly store: MemoryStore,
    readonly linker: MemoryLinker,
    readonly lifecycle: MemoryLifecycle,
    readonly cognition: MemoryCognitionLedger,
  );

  evaluate(request: MemoryPostflightRequest): Promise<MemoryPostflightEvaluation>;
}
```

Deterministic classification order:

```text
1. validate scope/route/reason/evidence/profile/relation inputs
2. normalize candidate canonical key + profile + candidate hash
3. load exact canonical current memory in scope
4. load exact semantic-profile-hash matches in scope
5. normalize explicit related/target/branch/conflict IDs and prove same-scope existence
6. exact canonical + exact value ->
     SAME_BELIEF_NEW_EVIDENCE/evidence refs => LINK_EXISTING
     otherwise                         => NO_DURABLE_MEMORY + duplicate reasons
7. exact canonical + changed value ->
     mutable kind                      => REVISE_EXISTING
     immutable failure/observation     => never revise; require branch/conflict structure or no-write
8. no exact canonical + profile identity match -> LINK_EXISTING (no new node)
9. conflictWithMemoryId + sufficient evidence -> OPEN_CONFLICT
10. branchParentMemoryId + semantic creation relation + sufficient evidence -> WRITE_BRANCH
11. FRESH_DURABLE_CONTEXT rootReason + durable positive reason/evidence -> WRITE_NEW_ROOT
12. otherwise -> NO_DURABLE_MEMORY with INSUFFICIENT_EVIDENCE or NO_FUTURE_RELEVANCE
```

Positive durable reasons that may justify persistence when evidence is present:

```text
USER_EXPLICITLY_REQUESTED_MEMORY
GUARDRAIL_CREATED
GUARDRAIL_CHANGED
FAILURE_OBSERVED
SOLUTION_VERIFIED
ARTIFACT_VERIFIED
FRESH_DURABLE_CONTEXT
DISTINCT_BRANCH
BELIEF_CHANGED
PROCEDURE_CHANGED
CURRENT_STATE_CHANGED
CONFLICT_DETECTED
```

`TRANSIENT_OPERATION`, `INSUFFICIENT_EVIDENCE`, and `NO_FUTURE_RELEVANCE` always prevent branch/root creation.

Candidate hash contract:

```text
SHA-256(stable redacted canonical JSON of canonicalKey + kind + value + semanticProfile)
```

It must not include timestamps, route IDs, decision IDs, evidence ordering, or audit-generated values.

- [ ] **Step 1: Write RED advisory classification tests**

Required cases:

```text
duplicate canonical + duplicate value               NO_DURABLE_MEMORY
same belief + new durable evidence                  LINK_EXISTING
same mutable canonical + changed value              REVISE_EXISTING
failure target + changed value                      never REVISE_EXISTING
new distinct child + branch parent/evidence         WRITE_BRANCH
fresh durable candidate + FRESH_DURABLE_CONTEXT    WRITE_NEW_ROOT
same semantic-profile identity under new key        LINK_EXISTING
ambiguous contradiction + target/evidence           OPEN_CONFLICT
unrelated/no evidence candidate                     NO_DURABLE_MEMORY
unjustified requested branch/root                    rejected/no-write
```

For every case, assert exactly one new `memory_write_decisions` row and zero semantic mutation during `evaluate()`.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/memory-cognition-controller.test.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement candidate hashing, scoped fact loading, and classifier**

Use Store/CognitionLedger APIs for authority. The controller must not execute raw SQL and must not call external services.

- [ ] **Step 4: Persist every evaluation**

Call `MemoryCognitionLedger.recordWriteDecision()` only after the deterministic decision has been derived. Persist sorted/deduplicated existing IDs, evidence refs, reason codes, relation plan, target, candidate hash, and root reason. Do not mark it applied in advisory mode.

- [ ] **Step 5: Run GREEN/regressions**

```bash
npx vitest run tests/memory-cognition-controller.test.ts tests/memory-cognition-ledger.test.ts tests/memory-store.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/cognition-controller.ts src/memory/types.ts tests/memory-cognition-controller.test.ts
git commit -m "feat: evaluate memory postflight decisions"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 4: Explicitly Apply Validated Memory Decisions

**Files:**
- Modify: `src/memory/cognition-controller.ts`
- Modify: `src/memory/types.ts`
- Modify: `tests/memory-cognition-controller.test.ts`

**Interfaces:**

```ts
MemoryCognitionController.apply(
  request: MemoryPostflightRequest,
): Promise<MemoryPostflightApplyResult>;
```

Application behavior:

```text
NO_DURABLE_MEMORY
  -> no semantic mutation
  -> mark decision applied with semanticMutation=false

REVISE_EXISTING
  -> MemoryStore.reviseMemory(target)
  -> preserve same memory ID / create next revision
  -> optional bounded node metadata/profile update

LINK_EXISTING
  -> create only validated proposed relation(s) whose endpoints already exist
  -> if same-belief/new-evidence has no relation proposal, semantic node count remains unchanged and decision/evidence refs are still the durable audit

WRITE_BRANCH
  -> create one new candidate memory
  -> explicit child->parent branch_of/derived_from relation in same transaction as memory commit where possible
  -> node metadata noveltyClass='branch', branchParentMemoryId, createdFromDecisionId, bounded profile

WRITE_NEW_ROOT
  -> create one new candidate memory with no required parent
  -> node metadata noveltyClass='root', rootReason, createdFromDecisionId, bounded profile
  -> `rootReason` must be non-empty and the accepted decision must contain reason code FRESH_DURABLE_CONTEXT

OPEN_CONFLICT
  -> create one new candidate memory when candidate is not already persisted
  -> add symmetric contradicts relation to conflict target
  -> MemoryLifecycle.openConflict(target, candidate)
  -> preserve both nodes; no winner/supersession
```

Only after all required mutations succeed:

```ts
await cognition.markWriteDecisionApplied(scope, decisionId, {
  status: 'applied',
  decision,
  semanticMutation,
  memoryId,
  revisionId,
  conflictId,
  createdEdges,
});
```

If application fails, the decision row remains unapplied (`applied_at IS NULL`) and no fabricated success is recorded.

- [ ] **Step 1: Write RED apply tests for all six decisions**

Assert exact node/revision/edge/conflict counts, root/branch metadata, decision linkage, failure immutability, symmetric conflict edge, and no semantic mutation for no-write.

- [ ] **Step 2: Write RED failure-atomicity tests**

Examples:

```text
foreign branch parent                apply rejects; decision remains unapplied
weak-only branch relation             apply rejects; no node created
REVISE_EXISTING immutable failure     apply rejects; original failure unchanged
invalid conflict target               apply rejects; no candidate node survives
```

- [ ] **Step 3: Run RED**

```bash
npx vitest run tests/memory-cognition-controller.test.ts
```

- [ ] **Step 4: Implement apply orchestration**

Evaluate and persist the decision first. Revalidate scope-sensitive endpoints immediately before mutation. Use existing authoritative Store/Lifecycle/Ledger APIs. Do not catch and convert mutation failures into applied results.

- [ ] **Step 5: Run GREEN/regressions**

```bash
npx vitest run tests/memory-cognition-controller.test.ts tests/memory-store.test.ts tests/memory-lifecycle.test.ts tests/memory-relation-policy.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/cognition-controller.ts src/memory/types.ts tests/memory-cognition-controller.test.ts
git commit -m "feat: apply validated memory postflight decisions"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 5: Compose Controller in MemoryService Without Adopting Existing Promotion Paths

**Files:**
- Modify: `src/memory/service.ts`
- Modify: `tests/memory-cognition-controller.test.ts`
- Modify: `tests/memory-unified-lifecycle.test.ts`
- Modify: `tests/mcp-memory.test.ts`
- Modify: `tests/mcp-integration.test.ts`

**Interfaces:**

`MemoryComponents` adds:

```ts
cognitionController: MemoryCognitionController;
```

`MemoryService` adds:

```ts
async evaluatePostflight(
  request: MemoryPostflightRequest,
): Promise<MemoryPostflightEvaluation>;

async applyPostflight(
  request: MemoryPostflightRequest,
): Promise<MemoryPostflightApplyResult>;
```

- [ ] **Step 1: Write RED service-composition tests**

Prove a normal `MemoryService.commit()` still behaves exactly as before, no controller decision is generated merely by existing commit/revise/preflight/continuity/execution flows, and explicit `evaluatePostflight()` / `applyPostflight()` reach the controller.

- [ ] **Step 2: Write MCP surface non-change test**

Keep assertions:

```text
memory tools exactly 9
full Agent Core MCP tools exactly 56
no memory_postflight tool in Phase 4
```

- [ ] **Step 3: Run RED**

```bash
npx vitest run tests/memory-cognition-controller.test.ts tests/memory-unified-lifecycle.test.ts tests/mcp-memory.test.ts tests/mcp-integration.test.ts
```

- [ ] **Step 4: Compose controller and add narrow service wrappers**

Instantiate the controller from the same Store/Linker/Lifecycle/CognitionLedger instances. Do not modify ContinuityPromoter, ExecutionMemoryBridge, route orchestration, or MCP registration.

- [ ] **Step 5: Run GREEN/regressions**

```bash
npx vitest run \
  tests/memory-cognition-controller.test.ts tests/memory-unified-lifecycle.test.ts \
  tests/memory-awareness.acceptance.test.ts tests/execution-memory-bridge.test.ts \
  tests/continuity-checkpoint.test.ts tests/mcp-memory.test.ts tests/mcp-integration.test.ts
npm run build
git diff --check
```

- [ ] **Step 6: Commit + push/readback**

```bash
git add src/memory/service.ts tests/memory-cognition-controller.test.ts tests/memory-unified-lifecycle.test.ts tests/mcp-memory.test.ts tests/mcp-integration.test.ts
git commit -m "feat: compose memory cognition controller"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
```

---

### Task 6: Phase 4 Certification

**Files:**
- Append factual evidence to `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`.
- Mark factual Phase 4 completion in `docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md` only after every gate passes.
- Mark this executable plan complete only after exact remote-visible certification SHA verification.

- [ ] **Step 1: Run focused Phase 4 suite**

```bash
npx vitest run \
  tests/memory-semantic-profile.test.ts tests/memory-write-policy.test.ts \
  tests/memory-cognition-controller.test.ts tests/memory-cognition-ledger.test.ts \
  tests/memory-store.test.ts tests/memory-lifecycle.test.ts tests/memory-relation-policy.test.ts
```

Required certification cases:

```text
duplicate rejection                                  PASS
same-belief/new-evidence                              PASS
mutable revise                                        PASS
failure revision attempt                              0 accepted
revise-vs-branch                                      PASS
fresh root justification                              PASS
root without FRESH_DURABLE_CONTEXT                    0 accepted
weak-only non-root creation                           0 accepted
semantic-profile duplicate under different key       no new node
ambiguous contradiction                               OPEN_CONFLICT
unrelated candidate                                   NO_DURABLE_MEMORY
unjustified new-node acceptance                       0
advisory semantic mutations                           0
principal/project contamination                       0
```

- [ ] **Step 2: Run broad memory/continuity/execution-memory/MCP regression**

```bash
npx vitest run \
  tests/memory-*.test.ts tests/memory-*.acceptance.test.ts \
  tests/continuity-*.test.ts tests/continuity-*.acceptance.test.ts \
  tests/execution-memory-*.test.ts tests/mcp-*.test.ts
```

Expected: zero failures; memory MCP tools remain exactly 9; total MCP tools remain exactly 56.

- [ ] **Step 3: Run deterministic quality and performance gates**

```bash
npm run quality:gate
npm run benchmark:memory
```

Required: current Wave E thresholds remain green, cross-project/principal contamination remains `0`, deterministic replay remains `1`, and 100k preflight p95 remains `<150 ms`.

- [ ] **Step 4: Run full release verification and dependency guardrail**

```bash
npm run verify:release
git diff --check
git diff d8e2e020da6866a74ae94e312ebb9a3ca133e93e -- package.json package-lock.json
git diff d8e2e020da6866a74ae94e312ebb9a3ca133e93e -- src package.json package-lock.json | grep -Ei 'openai|anthropic|gemini|langchain|langgraph' || true
```

Required: zero root dependency change and zero new external AI/model/API integration.

- [ ] **Step 5: Record fresh evidence and publish exact certification SHA**

```bash
git add docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md docs/roadmap/agent-core-cross-session-memory-nervous-system-implementation-plan.md docs/roadmap/agent-core-memory-nervous-system-phase-4-implementation-plan.md
git commit -m "docs: certify memory nervous system phase 4"
git push origin feature/cross-session-memory-nervous-system
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/cross-session-memory-nervous-system)"
node scripts/release/check-doc-links.mjs
npm run verify:release
```

**Phase 4 completion rule:** Phase 4 is certified only when the controller deterministically records exactly one postflight decision, advisory evaluation causes zero semantic mutation, explicit application enforces revise/branch/root/conflict invariants, unjustified new-node acceptance is exactly zero, existing promotion paths remain unchanged, MCP counts remain 9/56, and the exact final documentation SHA is remote-visible with the full release gate green. Phase 5 adoption of Continuity/Execution promotion remains out of scope.
