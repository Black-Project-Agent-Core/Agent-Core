# Agent Core Cross-Session Memory Nervous System — Architecture Design

**Status:** DESIGN SPECIFICATION — APPROVED BRAINSTORMING CAPTURE; NOT IMPLEMENTED  
**Design base:** `origin/main` at `6cb89e4a6c6b3d79767ce9bd6369f9945cff8590`  
**Target platform:** Agent Core local-first control plane in Codespace  
**Primary objective:** evolve the existing Deterministic Memory Fabric (DMF) into a persistent, bounded, evidence-aware cross-session and cross-Codespace memory graph that can recall, expand, revise, branch, link, explain, and remotely recover relevant prior context without changing the underlying OpenAI model or exposing private chain-of-thought.

---

# 1. Executive Summary

This design captures the agreed brainstorming direction for a local-first cross-session memory system that behaves less like a flat note database and more like a persistent network of evolving memories. Because GitHub Codespaces is an ephemeral execution environment, local-first does **not** mean local-only: the target Codespace profile requires a separate remote durable memory authority so deleting or replacing a Codespace cannot reset the user's memory graph to zero.

The goal is **not** to make the OpenAI model itself biologically human, alter hidden reasoning, replace personalization, or add another cloud AI layer. The goal is to improve the **external continuity context** supplied to the model when Agent Core/Codespace is used.

The target system should be able to:

- remember relevant work across separate ChatGPT sessions and replacement Codespace instances;
- search only bounded relevant memory instead of loading all history;
- automatically recall current memories before meaningful work;
- request deeper historical context through a bounded `remember_more` operation;
- preserve failures and their later solutions so the same mistake is less likely to repeat;
- revise an existing memory instead of duplicating the same knowledge;
- branch when a related but genuinely distinct line of knowledge appears;
- create a new root memory only when the context is genuinely fresh and durable;
- reject unjustified node creation;
- explicitly link memories with meaningful relations rather than generic `related_to` edges;
- preserve revision history and conflicts instead of silently overwriting old beliefs;
- maintain principal/project isolation;
- remain deterministic at the storage, graph, policy, and retrieval layers;
- remain local-first for execution and recall while durably synchronizing encrypted memory state to a user-controlled remote store;
- survive permanent Codespace deletion by restoring the same verified logical memory state into a fresh Codespace;
- avoid external AI/model/API dependencies;
- expose a read-only visual graph so the user can inspect what was recalled, expanded, revised, linked, or rejected in real time.

The central architectural shift is:

```text
DO NOT force every interaction to create a memory.

FORCE every meaningful interaction to make a MEMORY DECISION.
```

The required postflight decision vocabulary is:

```text
NO_DURABLE_MEMORY
REVISE_EXISTING
LINK_EXISTING
WRITE_BRANCH
WRITE_NEW_ROOT
OPEN_CONFLICT
```

A session/task is therefore not considered memory-complete merely because work ended. It is complete only when its memory postflight decision has been resolved or explicitly recorded as `NO_DURABLE_MEMORY`.

---

# 2. Problem Statement

The current ChatGPT personalization/history mechanisms are intentionally bounded and are not a substitute for an operator-owned technical memory system. Relevant past conversations may not always be recalled, may be summarized, may be misleading, or may lack the exact technical failure/evidence chain needed for ongoing software work.

The desired behavior is closer to this:

```text
Past work
   │
   ├─ Memory A1
   │     │
   │     ▼
   ├─ Memory A2
   │     │
   │     ▼
   ├─ Memory A3 — failure
   │     │
   │     ▼
   ├─ Memory A4 — solution
   │     │
   │     ▼
   └─ Memory A5 — current validated state

New session
   │
   ▼
Recall A4 + A5
   │
   ├─ historical cause chain exists
   │
   ▼
remember_more(A4/A5)
   │
   ▼
Recall A2 + A3
   │
   ▼
Do current work with old failure + solution context
   │
   ▼
Create revision / branch / link / no-write decision
```

The memory system must not require reading A1-A5 every time. It should recover the **minimum history necessary to understand the present**.

---

# 3. Non-Goals

This project does **not** aim to:

- modify GPT-5.6 Sol weights, hidden reasoning, system instructions, or OpenAI internal architecture;
- expose or persist private chain-of-thought;
- capture ChatGPT conversations that never invoke Agent Core/Codespace;
- add an external OpenAI/Claude/Gemini model worker;
- add cloud embeddings, cloud rerankers, or cloud AI judges;
- treat semantic similarity as factual truth;
- persist all raw terminal output as long-term memory;
- create a second competing memory authority beside DMF;
- use LangChain or LangGraph merely for branding or abstraction;
- force every trivial interaction to produce a memory node;
- allow the visualizer to mutate memory authority;
- allow automatic physical deletion of durable evidence;
- allow a failed process or missing PID to become a “successful memory”;
- make the memory system dependent on a dashboard being available;
- make Codespace or Agent Core unusable merely because a visualization process is down.

---

# 4. Terminology

## 4.1 Memory Node

A durable semantic/episodic memory represented by one `memory_items` record and one current revision.

## 4.2 Revision

A new version of the **same underlying knowledge identity**. A revision is appropriate when the question/topic remains the same but the accepted state changes.

Example:

```text
Decision: rendering should scale after layout
   ↓ revised after evidence
Decision: preserve source-native geometry
```

## 4.3 Branch

A new durable node that is related to an existing node but represents a distinct line of knowledge rather than a replacement.

Example:

```text
PPTX geometry fidelity
   ├─ branch → typography fidelity
   └─ branch → image crop fidelity
```

## 4.4 Root Memory

A new durable node with no prior semantic parent because its context is genuinely new. Root creation must carry explicit justification.

## 4.5 Memory Edge

A typed relationship between memories, backed by evidence and directionality rules.

## 4.6 Memory Preflight

Bounded recall before meaningful work.

## 4.7 `remember_more`

A bounded historical expansion operation that follows revision/causal/branch/conflict relationships from already-recalled memories.

## 4.8 Memory Postflight

The mandatory persistence decision after meaningful work.

## 4.9 Episode

One logical body of work that may span multiple ChatGPT sessions. When possible, the existing Continuity `taskId` is the episode identity.

## 4.10 Memory Context Lease

A local control-plane record proving that memory preflight was performed for a current actionable context. This is relevant for future hard enforcement in the Codespace bridge.

---

# 5. Current Agent Core Factual Baseline

This design does not start from a blank slate.

At the audited source, Agent Core already has a substantial deterministic memory subsystem.

## 5.1 Current DMF storage

Current schema version: `2`.

Existing tables include:

```text
memory_schema_migrations
memory_events
memory_items
memory_revisions
memory_anchors
memory_edges
memory_conflicts
memory_contexts
memory_access_log
memory_fts

continuity_tasks
continuity_turns
continuity_task_dependencies
continuity_checkpoints
continuity_frontier
```

`memory_events` is append-only through SQLite triggers.

`memory_items` already stores:

```text
principal_id
project_id
canonical_key
kind
state
importance
pinned
enforcement
current_revision_id
created_at
updated_at
last_accessed_at
access_count
```

`memory_revisions` already stores historical versions with:

```text
revision_no
value_text
value_json
value_hash
source_event_id
valid_from
valid_to
supersedes_revision_id
```

This already provides the base for “A1 → A2 → A3 → A4 → A5” style evolution.

## 5.2 Current memory kinds

Existing kinds are:

```text
fact
preference
guardrail
decision
goal
task
artifact
procedure
tool_state
project_state
failure
observation
relationship
```

Mutable in-place kinds are intentionally narrower:

```text
fact
preference
guardrail
decision
goal
task
artifact
procedure
tool_state
project_state
```

`failure`, `observation`, and `relationship` are not silently revised in place today. This is directionally compatible with the new design: a historical failure should not disappear merely because a later solution exists.

## 5.3 Current memory states

```text
active
superseded
completed
archived
tombstoned
conflicted
```

## 5.4 Current graph relations

Existing relations are:

```text
same_key
supersedes
explicit_relation
same_anchor
same_artifact
same_route_or_task
cooccurs_in_event
token_overlap
temporal_neighbor
```

Current fixed base relation weights are approximately:

```text
same_key           1.00
supersedes         1.00
explicit_relation  1.00
same_anchor        0.95
same_artifact      0.90
same_route/task    0.80
cooccurs            0.60
token_overlap      0.20+
temporal_neighbor  0.15+
```

## 5.5 Current retrieval

Current retrieval already combines:

```text
canonical/exact match
structured anchors
SQLite FTS5 + BM25
bounded graph expansion
Personalized PageRank
memory state
importance/pinning
recency/access
```

Current score weights are:

```text
lexical     0.40
exact       0.20
graph       0.20
state       0.08
importance  0.07
recency     0.05
```

Current default retrieval bounds include:

```text
seedCap                  64
graphNodeCap             1000
graphEdgeCap             10000
graphMaxHops             2
recallItemBudget          24
recallCharacterBudget     12000
PPR damping               0.85
PPR max iterations        20
```

The current certified 100k-memory preflight target remains `<150 ms`.

## 5.6 Current preflight

The existing `MemoryPreflightEngine` already:

- requires principal scope;
- builds a query from task + context;
- performs bounded search;
- loads open conflicts;
- extracts hard guardrails;
- extracts prior failures;
- extracts related decisions;
- stores the preflight result in `memory_contexts`;
- records ranked recall/access explanations in `memory_access_log`.

This is an important existing foundation.

## 5.7 Current autonomous routing injection

`capability_route` already projects a small deterministic subset of memory into routing context.

Current default injection is bounded to approximately:

```text
6 items
2400 characters
```

Hard guardrails are not injected as ordinary text hints because they are enforced separately.

## 5.8 Current continuity bridge

The existing Continuity Ledger already persists:

- tasks;
- turns;
- checkpoints;
- blockers;
- dependencies;
- frontier candidates;
- interrupted work;
- execution continuity summaries.

`ContinuityPromoter` already promotes structured checkpoint material into DMF, including:

```text
decisions
artifacts
verified outcomes
constraints/guardrails
failures
execution process checkpoints
```

This means the new project should evolve the existing promotion path rather than create a parallel memory writer.

## 5.9 Current MCP memory surface

Existing model-facing memory tools:

```text
memory_status
memory_search
memory_get
memory_commit
memory_revise
memory_forget
memory_explain
memory_export
```

The new design should avoid unnecessary tool-surface expansion. Internal policy should do most of the new work.

---

# 6. Verified Gaps Between Current DMF and Target Behavior

Current DMF already stores and retrieves memory, but it does not yet implement the complete desired “memory cognition protocol”.

The missing behaviors are:

1. **No mandatory persistence decision lifecycle.**
   A task can end without explicitly deciding whether durable memory should change.

2. **No first-class `remember_more`.**
   Graph traversal happens during initial retrieval, but the model/control plane cannot request a bounded historical expansion from a specific recalled memory with explicit causal/revision intent.

3. **No explicit node-creation justification ledger.**
   A new canonical key can create a node without a separately recorded “why this deserves a new node” decision.

4. **No explicit root-memory reason.**
   Genuinely new context is not distinguished from accidental orphan creation.

5. **Current relation vocabulary is mostly associative.**
   It does not yet express enough causal/evolution semantics such as `failed_because`, `resolved_by`, `branch_of`, and `validated_by`.

6. **No first-class write-decision audit.**
   The system records committed events, but not the rejected/non-write candidate decisions that explain why no node was created.

7. **No explicit historical-expansion audit.**
   Initial recall accesses are logged, but `remember_more` expansions do not exist yet.

8. **No hard Codespace memory lifecycle enforcement.**
   The Codespace connector can currently execute operations without requiring a DMF preflight context lease.

9. **No pending-postflight enforcement.**
   A session can disappear after work without resolving whether durable memory needs updating.

10. **No dedicated read-only memory graph visualizer/activity stream.**

11. **No relation correction history.**
   Current active `memory_edges` do not independently preserve create/retract/reweight history.

12. **Current semantic signal is deterministic lexical/anchor/graph-based, not structured semantic profile based.**
   This is not a defect, but richer structured semantic signatures would improve recall without requiring embeddings.

---

# 7. Architectural Principles

The implementation must preserve the following principles.

## 7.1 One memory authority

DMF remains the authoritative durable memory store.

Do not create:

```text
DMF
+
LangGraph Store
+
vector database
+
second memory database
```

with competing truth.

## 7.2 Forced decision, not forced pollution

Every meaningful task must resolve a memory postflight decision.

It is explicitly valid for that decision to be:

```text
NO_DURABLE_MEMORY
```

This prevents memory-node explosion.

## 7.3 Latest state by default, history on demand

Default recall returns current revisions.

History is loaded when:

- the user explicitly asks;
- a conflict requires it;
- a prior failure chain is relevant;
- a current solution cannot be understood without its predecessor;
- `remember_more` is triggered.

## 7.4 Similarity proposes; evidence authorizes

Lexical/graph/optional future semantic similarity may propose candidates.

It cannot alone authorize:

- node creation;
- overwrite;
- conflict resolution;
- deletion;
- factual truth.

## 7.5 Failure history is privileged

A verified prior failure must not be erased just because a solution was later found.

The graph should preserve:

```text
failure
   │
resolved_by
   ▼
solution
   │
validated_by
   ▼
verified evidence
```

## 7.6 No unjustified durable node

Every new non-root node must have at least one justified semantic edge at commit time.

A new root node is permitted only with an explicit `FRESH_DURABLE_CONTEXT` reason.

## 7.7 Conflict cannot silently overwrite history

Contradictory durable knowledge creates/updates a conflict state or an explicit revision path. It must not silently replace prior evidence.

## 7.8 Visualizer is an observer

The UI reads the same event/state data.

It must never sit in the authoritative write path.

## 7.9 Local-first

No cloud model/API is required for memory storage, retrieval, graph traversal, write policy, or visualization.

## 7.10 No private chain-of-thought

Persist:

```text
observable task facts
accepted decisions
failures
solutions
evidence
constraints
artifacts
reason codes
```

Do not persist hidden model reasoning.

---

# 8. Target Logical Architecture

```text
                         USER / CHATGPT
                              │
                              ▼
                    ┌───────────────────┐
                    │ Context Resolver  │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Memory Preflight  │
                    └─────────┬─────────┘
                              │
                    initial bounded recall
                              │
                    ┌─────────▼─────────┐
                    │ Recall Controller │
                    └─────┬────────┬────┘
                          │        │
                  sufficient      historical dependency
                          │        │
                          │        ▼
                          │   ┌───────────────┐
                          │   │ remember_more │
                          │   └──────┬────────┘
                          │          │
                          └────┬─────┘
                               ▼
                    ┌────────────────────┐
                    │ Context Projection │
                    └─────────┬──────────┘
                              │
                              ▼
                         WORK / TOOLS
                              │
                              ▼
                    ┌────────────────────┐
                    │ Verified Evidence  │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ Memory Postflight  │
                    └─────────┬──────────┘
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
      NO_DURABLE        REVISE/LINK         BRANCH/ROOT
        MEMORY            EXISTING             WRITE
            │                 │                  │
            └─────────────────┴──────────────────┘
                              │
                              ▼
                       DMF SQLite graph
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
             Continuity Ledger      Read-only Activity
                                      / Visualizer
```

---

# 9. Logical Memory Layers

The system should be understood as four logical layers sharing the existing local DMF authority.

## 9.1 Semantic Memory

Long-lived accepted knowledge:

```text
facts
preferences
guardrails
decisions
goals
procedures
project state
```

## 9.2 Episodic Memory

Historical events that matter because of what occurred:

```text
failures
observations
artifacts
verified outcomes
important execution incidents
```

## 9.3 Continuity Memory

Current actionable state:

```text
active tasks
blocked tasks
deferred tasks
checkpoints
frontier
interrupted turns
active/interrupted runs
```

This remains the responsibility of the current Continuity Ledger.

## 9.4 Provenance / Evidence Layer

Append-only evidence about why memory exists or changed:

```text
memory_events
source refs
checkpoint IDs
run IDs
artifact hashes
write-decision reason codes
recall-expansion reason codes
```

---

# 10. Scope and Identity

All memory operations retain the existing mandatory scope:

```text
principalId
projectId
```

Optional contextual identity remains:

```text
threadId
resourceId
routeContextId
```

The target design additionally treats the existing Continuity `taskId` as the preferred **cross-session episode anchor**.

Recommended new anchor types:

```text
continuity_task_id
continuity_checkpoint_id
artifact_hash
git_commit
branch_name
```

The design should not depend on receiving a ChatGPT conversation ID from the host.

If a host/session identifier is unavailable, cross-session continuity still works through:

```text
principal
project
continuity task
canonical memory identities
artifact/run anchors
```

---

# 11. The Memory Cognition Protocol

Every meaningful Agent Core task follows a fixed high-level lifecycle.

```text
1. RESOLVE_SCOPE
2. RECONCILE_PENDING_POSTFLIGHT
3. MEMORY_PREFLIGHT
4. CLASSIFY_RECALL
5. REMEMBER_MORE_IF_REQUIRED
6. PROJECT_BOUNDED_CONTEXT
7. EXECUTE_WORK
8. COLLECT_VERIFIED_EVIDENCE
9. MEMORY_POSTFLIGHT_DECISION
10. APPLY_MEMORY_DECISION
11. CHECKPOINT_CONTINUITY
12. CLOSE_MEMORY_CONTEXT
```

This is an external control protocol, not hidden model reasoning.

---

# 12. Preflight Contract

Preflight is required before meaningful mutation/action when the memory protocol is enforced.

Inputs should include:

```text
principal/project scope
routeContextId
continuityTaskId if available
normalized task objective
bounded user context
relevant artifact/path/run anchors
operation class
```

Output should include:

```text
contextId
snapshotHash
recalled current memories
blocking guardrails
prior failures
related decisions
open conflicts
recall sufficiency
rememberMoreRecommended
rememberMoreSeedIds
reasonCodes
expiresAt
```

Proposed preflight reason codes:

```text
NO_RELEVANT_MEMORY
CURRENT_REVISION_MATCH
PRIOR_FAILURE_MATCH
RELATED_DECISION_MATCH
GUARDRAIL_MATCH
OPEN_CONFLICT_MATCH
ARTIFACT_MATCH
TASK_EPISODE_MATCH
CAUSAL_HISTORY_REQUIRED
REVISION_HISTORY_REQUIRED
BRANCH_HISTORY_REQUIRED
RECALL_BUDGET_EXHAUSTED
```

---

# 13. Initial Recall Pipeline

The current deterministic retrieval pipeline should remain authoritative.

Target candidate pipeline:

```text
1. exact canonical-key seeds
2. exact structured-anchor seeds
3. FTS5/BM25 lexical seeds
4. current graph expansion
5. Personalized PageRank
6. state/importance/recency weighting
7. hard-guardrail prioritization
8. pinned/current accepted-decision prioritization
9. bounded packing
```

The target system adds structured semantic profiles as an additional deterministic signal, not a replacement.

Initial recall must continue to be bounded.

Suggested behavioral default:

```text
initial memory items     <= 6 for model projection
initial DMF candidates   bounded by existing config
character projection     <= current 2400 routing budget unless task-specific path justifies more
```

The full internal result may remain larger than the final injected context.

---

# 14. Structured Semantic Profile

Rather than immediately adding embeddings, each durable memory revision should optionally carry or derive a structured semantic profile.

Proposed profile shape:

```json
{
  "title": "PPT Font Unit Regression",
  "summary": "Post-layout scaling changed font sizes.",
  "intent": "preserve PowerPoint typography fidelity",
  "concepts": ["font size", "points", "EMU", "coordinate scaling"],
  "entities": ["PowerPoint", "PPTX"],
  "constraints": ["do not change source-native geometry"],
  "artifacts": ["pptx"],
  "outcome": "source-native geometry adopted",
  "failureMode": "post-render scaling",
  "solution": "preserve source coordinate system",
  "futureRelevance": ["pptx conversion", "font fidelity", "layout regression"]
}
```

The backend must validate and bound this profile.

The profile itself is **not evidence**. It is an indexable description of already-authorized memory content.

The profile can contribute:

- additional FTS terms;
- deterministic concept overlap;
- task-family matching;
- visualization labels.

No embedding service is required for the first implementation.

---

# 15. `remember_more`

## 15.1 Purpose

`remember_more` exists for cases where the current recalled state is insufficient without selected historical context.

It must not mean “load the whole memory history”.

Core principle:

> Load the minimum additional history necessary to understand the present.

## 15.2 Trigger examples

`remember_more` should be recommended or required when:

- a recalled solution is linked to a prior failure;
- a recalled current decision superseded an older decision and the reason matters;
- an open conflict is related to the task;
- a recalled memory is a branch whose parent context is required;
- current memory has a causal predecessor;
- the user explicitly asks “why”, “what happened before”, “remember more”, “we tried this before”, or equivalent;
- the current memory says a prior approach failed but does not contain enough failure details.

## 15.3 Proposed request

```ts
interface RememberMoreRequest {
  scope: MemoryScope;
  contextId: string;
  seedMemoryIds: string[];
  reason: 'causal_history' | 'revision_history' | 'failure_history' | 'branch_history' | 'conflict_history' | 'user_requested';
  maxHops?: number;
  maxItems?: number;
  characterBudget?: number;
}
```

## 15.4 Proposed default bounds

```text
maxHops          2
maxItems         4 additional durable memories
characterBudget  6000 additional characters
```

These are proposed starting defaults, not certified performance numbers.

## 15.5 Expansion priority

For a recalled seed, traverse in this approximate priority:

```text
1. revision predecessor / supersedes chain
2. failed_because / caused_by
3. resolved_by
4. validated_by
5. branch_of / derived_from
6. contradicts / conflict
7. depends_on / blocked_by
8. other high-confidence explicit edges
```

Weak associative edges such as token overlap must not recursively explode history.

## 15.6 Output

```text
expanded memories
source seed for each expansion
graph path
relation chain
why expansion occurred
depth
budget consumed
truncated flag
snapshot hash
```

## 15.7 Audit

Every expansion must be recorded so the user can later inspect:

```text
“Why did Agent Core recall A3 when the initial result was A5?”
```

---

# 16. Context Projection to the Model

The model should not receive the complete graph.

Projection should prefer:

```text
active hard guardrails through structured authority
current accepted decision(s)
prior relevant failure(s)
validated solution(s)
current project state
selected historical explanation from remember_more
open conflict warnings
```

Example projection:

```text
[decision:ppt.geometry.current]
Preserve source-native geometry.

[failure:ppt.geometry.post_scale]
Prior post-render scaling changed font sizes.

[validation:ppt.geometry.corpus]
Six independent PPTX cases verified the source-native approach.
```

Projection should include memory IDs or compact trace identifiers so later explanation is possible.

---

# 17. Postflight Memory Decision

Postflight is the most important new control step.

After meaningful work, the system must produce one explicit persistence decision.

Proposed type:

```ts
type MemoryPersistenceDecisionType =
  | 'NO_DURABLE_MEMORY'
  | 'REVISE_EXISTING'
  | 'LINK_EXISTING'
  | 'WRITE_BRANCH'
  | 'WRITE_NEW_ROOT'
  | 'OPEN_CONFLICT';
```

Proposed decision record:

```ts
interface MemoryPersistenceDecision {
  decisionId: string;
  scope: MemoryScope;
  routeContextId: string;
  continuityTaskId?: string;
  decision: MemoryPersistenceDecisionType;
  candidateCanonicalKey?: string;
  existingMemoryIds: string[];
  targetMemoryId?: string;
  proposedRelations: Array<{
    targetMemoryId: string;
    relation: string;
    direction: 'outgoing' | 'incoming' | 'symmetric';
    evidenceRefs: string[];
  }>;
  reasonCodes: string[];
  durableEvidenceRefs: string[];
  candidateHash: string;
  createdAt: number;
}
```

The decision record itself should be persisted even when the result is `NO_DURABLE_MEMORY`, but it must not become a normal recall node.

---

# 18. Write-Decision Reason Codes

Proposed reason vocabulary:

```text
DUPLICATE_CANONICAL
DUPLICATE_VALUE
SAME_BELIEF_NEW_EVIDENCE
BELIEF_CHANGED
PROCEDURE_CHANGED
CURRENT_STATE_CHANGED
DISTINCT_BRANCH
FRESH_DURABLE_CONTEXT
FAILURE_OBSERVED
SOLUTION_VERIFIED
CONFLICT_DETECTED
RELATED_EXISTING_ONLY
TRANSIENT_OPERATION
INSUFFICIENT_EVIDENCE
NO_FUTURE_RELEVANCE
USER_EXPLICITLY_REQUESTED_MEMORY
GUARDRAIL_CREATED
GUARDRAIL_CHANGED
ARTIFACT_VERIFIED
```

The decision must never depend on a single floating-point similarity score.

---

# 19. Node Creation Gate

A new memory node is allowed only through the following decision tree.

```text
Candidate durable knowledge
        │
        ▼
Exact canonical memory exists?
        │
   ┌────┴────┐
  yes        no
   │          │
   ▼          ▼
Same value?   Strong same-knowledge candidate?
   │               │
 yes/no        ┌────┴────┐
   │          yes        no
   ▼           │          │
DEDUP/         ▼          ▼
REVISE     REVISE or    Related distinct
           CONFLICT?     branch candidate?
                          │
                     ┌────┴────┐
                    yes        no
                     │          │
                     ▼          ▼
                WRITE_BRANCH  genuinely fresh + durable?
                                │
                           ┌────┴────┐
                          yes        no
                           │          │
                           ▼          ▼
                   WRITE_NEW_ROOT   NO_DURABLE_MEMORY
```

## 19.1 Hard invariant

```text
NEW_NON_ROOT_NODE
requires
at least one justified semantic edge backed by evidence.
```

## 19.2 Root invariant

```text
WRITE_NEW_ROOT
requires
reasonCode = FRESH_DURABLE_CONTEXT
and a persisted rootReason.
```

A root node should be rare.

## 19.3 Later root linking

If future evidence reveals a relationship for a previously fresh root, the system should create the relation and the visual graph should stop presenting it as isolated.

---

# 20. Revise vs Branch Rules

## 20.1 Revise when

- the canonical subject remains the same;
- the accepted value has changed;
- current project/tool state moved forward;
- a decision was replaced by a new decision answering the same question;
- a procedure was updated rather than diversified;
- a preference/guardrail was changed by authoritative new instruction.

Revision preserves the identity and history:

```text
Memory M
 ├─ revision 1
 ├─ revision 2
 ├─ revision 3
 └─ revision 4 CURRENT
```

## 20.2 Branch when

- the new knowledge is not a replacement;
- two valid alternatives should coexist;
- a subtopic becomes independently durable;
- the work forks into a distinct approach;
- one parent concept produces multiple specialized descendants.

Example:

```text
M: Presentation conversion fidelity
   ├─ branch_of → Typography fidelity
   ├─ branch_of → Geometry fidelity
   └─ branch_of → Image crop fidelity
```

## 20.3 Never revise away a failure

A failure remains an immutable episodic node.

A solution is a new node or a decision/procedure revision connected through `resolved_by`.

---

# 21. Conflict Model

Contradictions must remain visible.

Example:

```text
Decision A: use post-render scaling
Decision B: never post-scale geometry
```

If both have current-looking evidence and authority cannot resolve them immediately:

```text
OPEN_CONFLICT
```

The system records:

```text
left memory
right memory
conflict type
evidence
status
```

The current `memory_conflicts` table is retained and expanded rather than replaced.

A conflict should trigger `inspectionRequired` on relevant preflight.

Resolution must record:

- winning/current memory;
- losing/superseded status where appropriate;
- resolution evidence;
- resolution event;
- preserved historical conflict record.

---

# 22. Failure → Solution → Validation Chain

This is a first-class target use case.

Desired graph:

```text
[Failure F27]
“Font size doubled after scaling.”
       │
       │ failed_because
       ▼
[Cause C4]
“Geometry was scaled after source units were already authoritative.”
       │
       │ resolved_by
       ▼
[Solution S12]
“Preserve source-native geometry.”
       │
       │ validated_by
       ▼
[Evidence E33]
“6-file PPTX regression corpus PASS.”
```

When a similar task appears later, preflight should prioritize:

```text
F27
S12
E33
```

This is how the system operationalizes “do not repeat the same mistake”.

---

# 23. Expanded Relation Taxonomy

Existing relations remain for compatibility.

Add a richer typed vocabulary.

## 23.1 Directed evolution relations

```text
supersedes
continues
branch_of
derived_from
learned_from
```

## 23.2 Directed causal relations

```text
caused_by
failed_because
resolved_by
validated_by
blocked_by
depends_on
produced
```

## 23.3 Conflict relation

```text
contradicts
```

## 23.4 Associative relations

```text
same_anchor
same_artifact
same_route_or_task
same_task_family
cooccurs_in_event
token_overlap
temporal_neighbor
```

## 23.5 Directionality rules

Examples:

```text
A supersedes B          directed
A branch_of B           directed child → parent
A caused_by B           directed effect → cause
A resolved_by B         directed problem → solution
A validated_by B        directed claim → evidence
A contradicts B         symmetric logically, stored as controlled paired edges or normalized assertion
same_artifact            symmetric
same_task_family         symmetric
```

Directed causal/evolution edges should be protected from obvious invalid cycles.

Associative cycles are allowed.

---

# 24. Edge History and Correction

Current `memory_edges` is an active graph projection but does not independently preserve relation correction history.

Recommended extension:

```text
memory_edge_events
```

Append-only event types:

```text
edge.created
edge.reweighted
edge.retracted
```

Suggested fields:

```text
id
principal_id
project_id
from_memory_id
to_memory_id
relation
old_weight
new_weight
evidence_event_id
reason_code
created_at
```

`memory_edges` can remain the fast active projection.

This provides both performance and forensic history.

---

# 25. Proposed Schema Evolution

Recommended next DMF migration: **schema v3**.

The exact implementation plan should validate SQLite migration details before coding, but the target logical additions are:

## 25.1 `memory_write_decisions`

Stores postflight decisions including rejected writes.

Suggested fields:

```text
id PRIMARY KEY
principal_id
project_id
route_context_id
continuity_task_id
context_id
decision_type
candidate_canonical_key
candidate_hash
target_memory_id
existing_memory_ids_json
reason_codes_json
evidence_refs_json
relation_plan_json
created_at
applied_at
apply_result_json
```

## 25.2 `memory_recall_expansions`

Stores `remember_more` traces.

Suggested fields:

```text
id PRIMARY KEY
principal_id
project_id
context_id
source_memory_id
target_memory_id
depth
relation_path_json
reason_code
score
created_at
```

## 25.3 `memory_edge_events`

Append-only relationship history as defined above.

## 25.4 `memory_node_metadata`

Optional per-node governance metadata without overloading `memory_items`.

Suggested fields:

```text
memory_id PRIMARY KEY
title
root_reason
novelty_class
created_from_decision_id
branch_parent_memory_id
semantic_profile_json
semantic_profile_hash
updated_at
```

`root_reason` is null for normal linked nodes.

## 25.5 New anchors

Extend anchor vocabulary as previously defined.

## 25.6 No separate vector DB

SQLite remains the authority.

If vector search is ever added later, it is a rebuildable candidate index, never an authority store.

---

# 26. Memory Decision Controller

Introduce a focused internal unit, tentatively:

```text
MemoryCognitionController
```

Responsibilities:

- enforce preflight/postflight protocol;
- determine whether `remember_more` is required;
- validate write decision shape;
- apply node creation gate;
- decide revise vs branch vs root;
- validate relation directionality;
- record write decisions;
- record recall expansions;
- produce bounded model-facing directives;
- expose read-only activity events.

It does **not**:

- run an external LLM;
- invent evidence;
- execute shell commands;
- own SQLite directly;
- replace `MemoryStore`, `MemoryRetriever`, or `ContinuityStore`.

Suggested composition:

```text
MemoryService
 ├─ MemoryStore
 ├─ MemoryRetriever
 ├─ MemoryLinker
 ├─ MemoryLifecycle
 ├─ MemoryPreflightEngine
 ├─ ContinuityStore
 └─ MemoryCognitionController   NEW
```

---

# 27. Model-Facing Tool Strategy

Avoid adding many MCP tools.

Existing tools remain.

One additional read-oriented capability is strongly justified:

```text
memory_remember_more
```

Suggested annotations:

```text
readOnlyHint       true
destructiveHint    false
idempotentHint     true
openWorldHint      false
```

Possible input:

```text
contextId
seedMemoryIds[]
reason
maxItems optional
characterBudget optional
```

The write-decision controller should preferably be integrated into route/checkpoint orchestration rather than exposed as numerous manual mutation tools.

If a model-facing postflight tool is required for hard lifecycle enforcement, prefer **one** structured tool such as:

```text
memory_postflight
```

instead of separate `memory_link`, `memory_branch`, `memory_root`, etc.

The tool accepts the decision enum and structured proposal. The backend validates and applies it.

---

# 28. Hard Enforcement Scope

A critical limitation must be explicit:

> Agent Core cannot force memory behavior for a ChatGPT turn that never invokes Agent Core/Codespace.

Therefore enforcement has two layers.

## 28.1 Agent Core route enforcement

For operations going through `capability_route`, Agent Core can enforce memory preflight directly.

This is the strongest and earliest enforcement path.

## 28.2 Codespace bridge enforcement

To make the behavior apply when ChatGPT directly operates the Codespace connector, the Codespace bridge can later gain a **Memory Context Lease** contract.

Proposed behavior:

```text
read-only trivial operation
    ↓
may proceed without lease, activity still observable

meaningful/mutating operation
    ↓
active memory context lease exists?
    ├─ yes → proceed
    └─ no  → reject with MEMORY_PREFLIGHT_REQUIRED
```

A lease should include:

```text
contextId
principal/project
objective hash
createdAt
expiresAt
postflightState
```

The bridge does not need to understand memory semantics itself. It calls/validates Agent Core.

---

# 29. Pending Postflight Across Session Loss

The user may close a ChatGPT session before a postflight memory decision is made.

The system therefore cannot rely only on “conversation end”.

Proposed state machine:

```text
OPEN
  │
meaningful durable work occurred
  ▼
POSTFLIGHT_PENDING
  │
postflight decision applied
  ▼
CLOSED
```

If a session disappears while `POSTFLIGHT_PENDING`, the next meaningful mutation for the same project/task receives:

```text
MEMORY_POSTFLIGHT_REQUIRED
```

The previous postflight is reconciled before a new memory context is opened.

This is a stronger practical approximation of “forced write after work” than relying on the model to remember to call a tool at conversation end.

---

# 30. What Counts as Meaningful Work

Not every operation should create postflight pressure.

Examples that usually **do not** require durable postflight by themselves:

```text
listing a directory
reading one file
checking git status
running a harmless informational command
simple arithmetic
```

Examples that normally **do** create a postflight requirement:

```text
editing source
creating/deleting files
changing config
running a debugging/fix cycle
publishing a commit/release
resolving a recurring error
changing architecture
establishing a user/project guardrail
making an accepted design decision
verifying a new durable artifact
```

The exact classifier must be deterministic and tool/event-based where possible.

---

# 31. Session “Sync” Semantics

For the Codespace target, **sync has two distinct meanings and both are required**.

## 31.1 Local materialization

During an active task, Agent Core writes the authoritative working transaction into the local SQLite DMF so recall, graph traversal, continuity, and execution can remain low-latency and deterministic.

```text
verified task evidence
        │
        ▼
Memory write decision
        │
        ▼
local SQLite transaction
        │
        ▼
LOCAL_COMMITTED
```

The local SQLite database is the active materialized/indexed working state. In a Codespace it must be treated as **disposable infrastructure**, not the only durable copy.

## 31.2 Remote durability sync

Any postflight that changes durable semantic memory, records a terminal continuity checkpoint, resolves a conflict, or changes a durable graph relation must also produce a remote synchronization envelope.

```text
LOCAL_COMMITTED
      │
      ▼
create bounded encrypted remote envelope
      │
      ▼
push to private Memory Remote
      │
      ▼
fetch/read back remote head + payload hash
      │
      ▼
REMOTE_SYNCED
```

A meaningful terminal task is **not durably closed** until required remote synchronization is confirmed.

This means the lifecycle state vocabulary includes at least:

```text
LOCAL_COMMITTED
REMOTE_PENDING
REMOTE_SYNCED
REMOTE_CONFLICT
REMOTE_UNAVAILABLE
```

`NO_DURABLE_MEMORY` does not necessarily mean "no remote write." If a meaningful task was completed, its terminal continuity checkpoint and postflight decision still need remote durability so the next Codespace knows that the task completed and intentionally produced no semantic memory node.

## 31.3 Sync granularity

The default requirement is **write-through at meaningful durable boundaries**, not delayed best-effort batching. A single task may generate multiple local memory mutations, but they should be grouped into one bounded atomic remote checkpoint when possible.

Required remote durability boundaries include:

```text
new durable memory node
new durable revision
new/corrected durable edge
conflict open/resolve
accepted guardrail/decision change
verified failure/solution learning
terminal task checkpoint
explicit durable project-state change
```

Important in-progress checkpoints may also be synchronized to reduce loss after an abrupt Codespace deletion, but they must remain distinguishable from terminal task completion.

## 31.4 What remote sync must not do

Remote sync must **not**:

- push the runtime SQLite database into the Agent Core source repository;
- copy raw stdout/stderr wholesale;
- store plaintext secret-bearing event content;
- make network availability part of normal recall latency after hydration;
- turn GitHub into a second reasoning authority;
- mark a task durably complete when remote readback failed.

Raw execution evidence stays under the existing evidence hierarchy. The remote memory representation contains only bounded redacted/encrypted memory, continuity, relation, conflict, and provenance records required to rebuild the logical memory state.

---
# 32. Authority Hierarchy

The memory system must never allow a low-authority recollection to overwrite stronger evidence.

Recommended authority ordering for relevant technical state:

```text
EXPLICIT CURRENT USER GUARDRAIL / ACCEPTED CONSTRAINT
>
VERIFIED PROCESS / ARTIFACT TRUTH
>
STRUCTURED VERIFIED CHECKPOINT OUTCOME
>
CURRENT ACCEPTED DECISION / PROCEDURE
>
HISTORICAL FAILURE / OBSERVATION
>
ASSOCIATIVE / SIMILARITY INFERENCE
```

For execution-derived facts, preserve the existing Agent Core hierarchy:

```text
PROCESS TRUTH
>
VERIFIED ARTIFACT TRUTH
>
PARSED STRUCTURED INTERPRETATION
>
ARTIFACT/CACHE SUGGESTION
>
WORKFLOW ADVICE
```

Durability authority is separate from semantic/evidence authority:

```text
ACTIVE CODESPACE WORKING STATE
  local SQLite may contain the newest transaction
  status may be REMOTE_PENDING

CROSS-CODESPACE DURABLE STATE
  latest remote generation whose objects/hash were pushed and read back successfully
```

If local state is newer than the last confirmed remote generation, the local state is truthful for the active Codespace but **not yet certified durable across Codespace deletion**. A fresh Codespace restores only the latest confirmed remote generation and must never invent the pending local tail.

---

# 33. Memory Compaction and Pollution Control

The existing compaction behavior archives low-importance, unused observations after the configured age.

The new design adds quality-oriented controls.

Metrics to monitor:

```text
new node rate
new root rate
revision:new-node ratio
orphan/root ratio
duplicate rejection count
NO_DURABLE_MEMORY rate
memory recall hit rate
remember_more usefulness
old observation archive rate
failure recurrence rate
```

A high node-creation rate is not automatically success.

The desired memory graph should become **more connected and more precise**, not merely larger.

---

# 34. Root and Orphan Policy

The authoritative graph may contain a truly fresh root node, but it must be explicitly classified.

Rules:

```text
normal new node + no edge     REJECT
fresh durable root + reason   ALLOW
```

The visualizer may additionally show **virtual structural nodes** that are derived rather than persisted as semantic memories:

```text
Project
Task/Episode
Session/Route
```

Example visual structure:

```text
[Project: Agent Core]
       │ virtual belongs_to_project
       ▼
[Memory Root R1]
       │ branch_of
       ▼
[Memory A2]
```

This avoids polluting semantic memory with artificial project-root memory records while still preventing the graph UI from appearing disconnected.

---

# 35. Visualization — Memory Observatory

The backend visualizer should be read-only.

Suggested name in this design:

```text
Memory Observatory
```

This is not a product-name commitment.

## 35.1 Core views

### Graph View

```text
● A1
  │
  ├─ continues → ● A2
  │                 │
  │                 ├─ failed_because → ● A3
  │                 │                       │
  │                 │                       └─ resolved_by → ● A4
  │                 │                                           │
  │                 │                                           └─ validated_by → ● A5
```

### Timeline View

Show revision/event chronology.

### Recall View

Show only memories used for the current context.

Example:

```text
A5 ● RECALLED CURRENT
A4 ● EXPANDED SOLUTION
A3 ● PRIOR FAILURE
A2 ○ NOT LOADED
A1 ○ NOT LOADED
```

### Node Inspector

Show:

```text
title
kind
state
current revision
revision history
why it was recalled
anchors
relations
source evidence
access count
created/updated timestamps
root/branch reason
write-decision ID
```

### Failure/Solution View

Dedicated causal chain explorer.

### Conflict View

Open/resolved conflicts with evidence.

### Session/Task View

Group memories around Continuity task IDs.

## 35.2 Live write visualization

Example:

```text
Memory Postflight
   │
existing match: A5
   │
decision: REVISE_EXISTING
   │
A5 revision 4 → revision 5
   │
new edge: validated_by → E27
```

## 35.3 Observer-only architecture

Correct:

```text
Agent Core Memory Authority
      │
      ├─ durable state
      └─ activity/event projection → dashboard
```

Incorrect:

```text
Agent Core → dashboard/filter → memory database
```

Dashboard failure must never stop memory or task execution.

---

# 36. Activity Event Stream

The same infrastructure can support the earlier live “Archify-like” activity concept.

Suggested event envelope:

```json
{
  "eventId": "...",
  "timestamp": 0,
  "actor": "agent_core",
  "type": "memory.recalled",
  "contextId": "...",
  "memoryId": "...",
  "relation": null,
  "state": "completed",
  "reasonCodes": ["PRIOR_FAILURE_MATCH"]
}
```

Useful activity types:

```text
memory.preflight_started
memory.preflight_completed
memory.recalled
memory.remember_more_started
memory.remember_more_expanded
memory.write_decision
memory.node_created
memory.revision_created
memory.edge_created
memory.edge_retracted
memory.conflict_opened
memory.conflict_resolved
memory.postflight_completed
```

The stream should contain safe IDs/reason codes, not raw secrets or private reasoning.

Transport can be implemented later with bounded SSE/WebSocket/local polling after the event contract is stable.

---

# 37. Explainability

For every recalled memory, Agent Core must be able to answer:

```text
Why was this recalled?
```

For every new memory:

```text
Why was a new node created instead of revising an existing one?
```

For every revision:

```text
What changed and what evidence authorized the change?
```

For every edge:

```text
Why are these memories connected?
```

For every no-write decision:

```text
Why was this task considered non-durable?
```

The existing `memory_explain` is the natural foundation and should be expanded rather than replaced.

---

# 38. Security and Privacy

Preserve existing memory security invariants.

## 38.1 Principal/project isolation

Cross-principal contamination target:

```text
0
```

Cross-project contamination target:

```text
0
```

## 38.2 Secret redaction

Continue redacting secret-like values before recall/indexing.

Structured semantic profiles and write-decision metadata must pass the same redaction policy.

## 38.3 Raw evidence

Do not put raw command output into semantic memory wholesale.

## 38.4 Dashboard

Memory Observatory should default to loopback/private access.

If forwarded through Codespace, it must use authenticated access and must not expose raw secret-bearing event data.

## 38.5 Forget/delete

`memory_forget` remains soft tombstoning.

Physical deletion remains operator-only and backup-gated.

---

# 39. Degraded Memory Behavior

The system must not fabricate memory when DMF is unhealthy.

Preserve current high-level behavior:

```text
DMF healthy      → recall normally
DMF disabled     → explicit disabled result
DMF degraded     → report degraded; do not invent recall
```

Hard Codespace enforcement must be rolled out carefully so a broken memory DB does not permanently brick the development environment.

Recommended staged policy:

```text
Phase 1: observe/advisory
Phase 2: enforce preflight on selected mutation classes
Phase 3: enforce pending postflight reconciliation
```

An explicit operator emergency bypass may be considered later, but any bypass must be locally audited and must never masquerade as successful memory compliance.

---

# 40. Performance Requirements

Existing non-regression target remains authoritative:

```text
100k active memories: end-to-end memory preflight p95 < 150 ms
```

New features must preserve that gate.

Proposed additional **initial design targets** to benchmark before certification:

```text
remember_more bounded expansion p95    < 75 ms at 100k active memories
write-decision DB/policy application    < 50 ms excluding model/tool response generation
visual activity append                  must not block primary memory write path
```

These proposed numbers are implementation targets, not current certified claims.

The final implementation plan may tighten or adjust them only after a baseline benchmark is recorded.

---

# 41. Quality Evaluation

Extend the existing Wave E deterministic memory corpus rather than create an AI judge.

New test categories should include:

```text
current revision recall
historical predecessor expansion
failure → solution chain recall
solution → failure remember_more
branch-parent recall
conflict visibility
new-node rejection
fresh-root justification
revise-vs-branch correctness
no-write correctness
relation directionality
relation cycle rejection
cross-project isolation
cross-principal isolation
character-budget correctness
deterministic replay equality
postflight pending recovery
Codespace preflight enforcement
```

Suggested new metrics:

```text
remember_more target recall       >= 0.95
unjustified node acceptance       0
required-linked-node orphan rate  0
cross-scope contamination          0
wrong revise-vs-branch rate        target 0 on certified corpus
postflight omission under enforced path 0
memory graph replay equality       1.0
```

Do not use a cloud LLM judge to certify these metrics.

---

# 42. Canonical Example Scenario

## Session 1

Task:

```text
Build PPT conversion system.
```

No relevant prior memory.

Preflight:

```text
NO_RELEVANT_MEMORY
```

Work produces durable architecture decision.

Postflight:

```text
WRITE_NEW_ROOT
reason: FRESH_DURABLE_CONTEXT
```

Create:

```text
A1 — Presentation conversion architecture
```

## Session 2

Task:

```text
Fix font sizing regression.
```

Recall:

```text
A1
```

Distinct subtopic:

```text
WRITE_BRANCH
A2 branch_of A1
```

A2:

```text
Typography fidelity
```

## Session 3

Post-render scaling fails.

Create failure:

```text
A3 — post-render scaling doubles font size
A3 failed_because A2 implementation assumption
```

Do not revise A2 away merely because A3 happened.

## Session 4

Find solution:

```text
A4 — preserve source-native geometry
A3 resolved_by A4
```

## Session 5

Regression corpus validates it.

```text
A5 — verified corpus result
A4 validated_by A5
```

## Session 6, later conversation

User says:

```text
Continue improving PPT conversion fidelity.
```

Initial recall:

```text
A4
A5
```

Controller sees a solution chain and recommends:

```text
remember_more(A4)
```

Additional recall:

```text
A3
A2
```

The model now sees both current truth and the historical failure that explains it.

---

# 43. Second Scenario — Avoiding Duplicate Memory

Existing:

```text
M10: Agent Core releases must never use GitHub Actions as release authority.
```

Later task reaches the same conclusion with new evidence.

Wrong:

```text
create M44 with same rule
```

Correct:

```text
same canonical knowledge
same accepted value
new evidence only

→ deduplicate/revise evidence linkage
→ no new semantic node
```

Postflight decision:

```text
REVISE_EXISTING or LINK_EXISTING
reason: SAME_BELIEF_NEW_EVIDENCE
```

---

# 44. Third Scenario — Conflict Rather Than Silent Rewrite

Existing:

```text
M20: memory hard guardrails are disabled by default.
```

New authoritative user instruction says:

```text
enable hard guardrails by default for Project X only.
```

This may not be a global revision.

Scope must be resolved first.

If same project/same canonical policy changed:

```text
REVISE_EXISTING
```

If incompatible evidence exists and authority is ambiguous:

```text
OPEN_CONFLICT
```

Never create an unrelated duplicate and hope recency ranking hides the contradiction.

---

# 45. Codespace Integration Architecture

The desired user experience is specifically tied to ChatGPT working through Codespace.

Target long-term flow:

```text
ChatGPT
   │
   ▼
Codespace connector
   │
   ├─ read-only activity observer
   │
   ├─ Memory Context Lease check
   │        │
   │        └─ Agent Core DMF
   │
   ▼
actual workspace operations
```

Mutation path under hard enforcement:

```text
ChatGPT requests edit/command
        │
        ▼
Codespace bridge checks active lease
        │
        ├─ missing → MEMORY_PREFLIGHT_REQUIRED
        │
        └─ valid
             │
             ▼
         execute operation
             │
             ▼
       append safe activity event
```

Before a new task after durable work:

```text
previous POSTFLIGHT_PENDING?
        │
        ├─ yes → MEMORY_POSTFLIGHT_REQUIRED
        └─ no  → new preflight allowed
```

This is the mechanism that makes “forced memory behavior” enforceable locally without changing OpenAI's assistant internals.

---

# 46. Cross-Session and Cross-Codespace Durability Boundary

GitHub Codespaces must be treated as an **ephemeral compute host**. GitHub documents that work stored only in a Codespace is deleted when that Codespace is deleted, and inactive Codespaces may be deleted automatically according to retention policy. Therefore local SQLite persistence alone is insufficient for this project's cross-session goal. The platform basis for this requirement is GitHub's own Codespaces lifecycle documentation: `https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle` and automatic-deletion documentation: `https://docs.github.com/en/codespaces/setting-your-user-preferences/configuring-automatic-deletion-of-your-codespaces`.

The target architecture changes the durability model from:

```text
Codespace SQLite = only durable memory
```

to:

```text
                    ┌──────────────────────────────┐
                    │ Agent-Core source repository │
                    │ main = code/docs/tests       │
                    └──────────────┬───────────────┘
                                   │ bootstrap code
                                   ▼
┌─────────────────────────────────────────────────────────┐
│                    Codespace instance                   │
│                                                         │
│  local SQLite DMF                                       │
│  - fast working state                                   │
│  - indexes / FTS / graph materialization                │
│  - disposable and rebuildable                           │
└──────────────────────┬──────────────────────────────────┘
                       │ write-through durable sync
                       ▼
             ┌───────────────────────────┐
             │ Private Memory Remote     │
             │ durable cross-instance    │
             │ journal/checkpoints       │
             └───────────────────────────┘
```

## 46.1 Fundamental durability invariant

For the Codespace profile:

> **A local memory mutation is not considered remotely durable until its corresponding Memory Remote transaction has been pushed and read back successfully.**

And:

> **A fresh Codespace must never treat a new empty SQLite database as authoritative merely because local runtime storage is empty.**

If a configured Memory Remote already contains state for the authenticated principal/project, the new Codespace must hydrate that state before meaningful memory-dependent mutation is allowed.

## 46.2 Recommended Memory Remote

The preferred initial backend is a **dedicated private GitHub repository** separate from the Agent Core source repository. The exact repository name is configuration, not an architectural constant. Its default branch may be `main`, but that branch contains memory durability records only—not Agent Core source code.

This is deliberately different from committing memory to `Black-Project-Agent-Core/Agent-Core` `main`.

```text
Agent-Core/main
  source code
  docs
  tests
  migrations

Private Memory Remote/main
  encrypted memory events
  encrypted continuity checkpoints
  encrypted graph/conflict mutations
  remote manifests / logical state hashes
  optional compacted recovery checkpoints
```

The Memory Remote must remain private and should use application-level encryption even though the GitHub repository itself is private. The encryption key must be independent from GitHub/OAuth/API credentials and must never be committed to either repository.

## 46.3 Remote representation

Do not use the raw live SQLite file as the primary Git object. SQLite is optimized for local transactional access, not concurrent Git synchronization.

The remote representation should be **logical, append-oriented, bounded, and rebuildable**. One possible layout is:

```text
format.json
scopes/
  <opaque-scope-id>/
    events/
      <event-id>.json.enc
    checkpoints/
      <checkpoint-id>.json.enc
    manifests/
      <generation-id>.json
```

Exact filenames are implementation details. Required properties are:

- immutable event identity;
- stable payload hash;
- encrypted payload content;
- opaque scope naming that does not expose project/user text unnecessarily;
- enough provenance to replay deterministically;
- explicit remote generation/head identity;
- deterministic logical-state hash after replay.

Optional compacted recovery checkpoints may accelerate hydration, but the system must retain enough event/provenance information to explain how the current state was reached.

## 46.4 Write-through postflight protocol

For every required durable boundary:

```text
1. validate scope + memory context lease
2. apply local SQLite transaction
3. produce remote event/checkpoint envelope
4. encrypt envelope
5. fetch current Memory Remote head
6. add immutable remote object(s)
7. commit without force
8. push
9. fetch/read back remote head
10. verify expected object/hash exists remotely
11. mark local durability state REMOTE_SYNCED
12. only then mark terminal postflight DURABLY_CLOSED
```

If steps 5-10 fail, local memory remains truthful but the durable state is:

```text
REMOTE_PENDING
or
REMOTE_UNAVAILABLE
```

The system must not claim cross-Codespace durability until synchronization succeeds.

## 46.5 Fresh Codespace hydration protocol

A replacement Codespace starts with no trusted runtime memory. Bootstrap must therefore perform:

```text
new Codespace
    │
    ▼
clone/fetch Agent Core source
    │
    ▼
resolve authenticated principal + project scope
    │
    ▼
connect to configured Private Memory Remote
    │
    ▼
verify remote format + remote head
    │
    ▼
decrypt latest compatible recovery checkpoint (if any)
    │
    ▼
replay immutable remote tail deterministically
    │
    ▼
materialize fresh local SQLite DMF
    │
    ▼
SQLite integrity check
    │
    ▼
logical-state hash == remote expected hash ?
   / \
 no   yes
 │     │
 ▼     ▼
FAIL   HYDRATED
CLOSED │
       ▼
Memory preflight/actionable work allowed
```

A new empty remote and a failed remote restore are different states and must never be conflated. Suggested states:

```text
REMOTE_EMPTY_CONFIRMED
REMOTE_HYDRATED
REMOTE_UNAVAILABLE
REMOTE_AUTH_FAILED
REMOTE_DECRYPT_FAILED
REMOTE_INTEGRITY_FAILED
REMOTE_REPLAY_FAILED
```

Only `REMOTE_EMPTY_CONFIRMED` permits creation of the first durable root for a genuinely new scope.

## 46.6 Codespace deletion recovery guarantee

The certification suite must simulate the actual failure the user cares about:

```text
Codespace A / local runtime
  contains memories A1-A5
  remote durability confirmed
        │
        ▼
DESTROY ALL LOCAL MEMORY/RUNTIME STATE
        │
        ▼
fresh empty Codespace-like workspace
        │
        ▼
hydrate from Memory Remote
        │
        ▼
logical memories A1-A5 restored
revision chains identical
graph relations identical
continuity terminal checkpoints identical
conflicts/provenance identical
state hash identical
```

This deletion/recreation test is a release gate for declaring the feature cross-Codespace durable.

## 46.7 Concurrent writers

The design must not assume only one Codespace will ever write. Remote updates therefore use non-force optimistic synchronization:

```text
fetch remote head
↓
prepare immutable event additions
↓
attempt push
↓
remote advanced?
  ├─ no  → readback + synced
  └─ yes → fetch, deterministically reconcile immutable event set, retry
```

No writer may silently overwrite another writer's remote memory commit. Conflicting semantic mutations are still resolved by the memory conflict/write-decision layer; Git transport reconciliation must not pretend semantic conflicts are automatically solved.

## 46.8 Network outage behavior

If an already-hydrated Codespace temporarily loses GitHub connectivity, Agent Core may continue local work if policy allows, but every new durable mutation remains explicitly `REMOTE_PENDING`. A terminal task must not be reported as **durably synchronized across Codespaces** until remote readback succeeds.

A completely fresh Codespace that has never hydrated its configured remote must fail closed for memory-authoritative mutation rather than silently start from zero.

## 46.9 Relationship to GitHub `main`

The user intuition is correct that memory must reach a durable system outside the Codespace. The architectural correction is only **where**:

```text
WRONG
Agent-Core source main
  + source commits
  + constantly changing runtime SQLite

RIGHT
Agent-Core source main
  = software evolution

Private Memory Remote main
  = encrypted durable memory/continuity evolution
```

A source-code Git commit may still be referenced by a memory as evidence (`sourceCommit`, artifact hash, release tag), but Git source history and memory history remain separate lifecycles.

---
# 47. Polyglot Architecture Decision

Polyglot is acceptable only when each language has a measurable responsibility.

Recommended first implementation:

```text
TypeScript / Node.js
  Agent Core orchestration
  cognition policy
  MCP interfaces
  Codespace adapter
  activity stream

SQLite / FTS5
  durable memory
  revision graph
  edge/event ledger
  deterministic retrieval

React + TypeScript
  Memory Observatory UI
```

Rust is **not required initially**.

Rust becomes justified only if profiling proves a real bottleneck in areas such as:

```text
large graph traversal
very large local indexes
high-frequency activity processing
layout of very large visualization graphs
```

Do not add Python/Rust merely to make the project appear polyglot.

---

# 48. LangChain / LangGraph Decision

Neither framework is required as an Agent Core core dependency for the first implementation.

Agent Core already owns:

```text
memory
revision state
graph edges
retrieval
continuity
DAG execution
checkpointing
recovery
audit
resource governance
```

Adding LangGraph directly as another authority would risk duplicated state and duplicated orchestration.

Recommended role:

```text
optional reference / benchmark lab
```

Potential experimental comparison:

```text
Agent Core continuity      vs LangGraph checkpointing
Agent Core DMF             vs LangGraph long-term store
Agent Core execution DAG   vs LangGraph graph execution
Agent Core resume          vs LangGraph replay/fork
```

Adopt a mechanism only if it demonstrates measurable benefit without creating a second memory authority or external model dependency.

LangChain should not be added unless a concrete integration need appears that current Agent Core interfaces cannot satisfy cleanly.

---

# 49. Proposed Internal Source Boundaries

These are likely implementation units, not final file commitments.

```text
src/memory/cognition-controller.ts       NEW
src/memory/remember-more.ts              NEW
src/memory/write-policy.ts               NEW
src/memory/relation-policy.ts            NEW
src/memory/activity.ts                   NEW
src/memory/remote-sync.ts                NEW
src/memory/remote-journal.ts             NEW
src/memory/remote-crypto.ts              NEW
src/memory/remote-hydrator.ts            NEW
src/memory/logical-state-hash.ts         NEW
src/memory/schema.ts                     MODIFY v3
src/memory/types.ts                      MODIFY
src/memory/preflight.ts                  MODIFY
src/memory/retriever.ts                  MODIFY only as needed
src/memory/linker.ts                     MODIFY relation policy
src/memory/service.ts                    COMPOSE new units
src/memory/store.ts                      MODIFY persistence APIs
src/mcp/memory-tools.ts                  ADD remember_more / possible postflight
src/mcp/memory-injection.ts              MODIFY bounded projection if required
src/continuity/promoter.ts               ROUTE through write decision policy
src/github/...                           REUSE Native GitHub Fabric transport for Memory Remote
plugin/codespace/...                     LATER hydration + enforcement adapter
```

Visualization should live in a clearly separate UI boundary rather than inside memory storage classes.

---

# 50. Migration Strategy

The migration must preserve current v0.6.0 stable behavior until each stage is separately proven. Cross-Codespace durability is a first-class phase, not deferred polish.

## Phase 0 — Design and corpus

No production behavior change.

Deliver:

- this architecture spec;
- certified scenario corpus for revise/branch/root/no-write/remember_more;
- deletion/recreation durability scenarios;
- schema migration design;
- baseline performance measurements.

## Phase 1 — Schema v3 and audit ledgers

Add:

```text
memory_write_decisions
memory_recall_expansions
memory_edge_events
memory_node_metadata
remote_sync_state / remote generation metadata
new anchor types
new relation vocabulary
```

No hard behavioral enforcement yet.

## Phase 2 — Remote Memory Durability Foundation

Implement before claiming cross-Codespace continuity:

- dedicated private Memory Remote configuration;
- application-level encrypted remote envelopes;
- immutable event/checkpoint representation;
- non-force push/readback protocol;
- local `REMOTE_PENDING` / `REMOTE_SYNCED` state;
- fresh-Codespace hydration;
- deterministic replay and logical-state hash;
- deletion/recreation recovery test.

At the end of Phase 2, existing DMF state must be able to survive destruction of all local Codespace memory storage.

## Phase 3 — `remember_more`

Implement bounded historical expansion and explainability.

Keep initial recall behavior compatible.

## Phase 4 — Write Decision Controller

Implement:

```text
NO_DURABLE_MEMORY
REVISE_EXISTING
LINK_EXISTING
WRITE_BRANCH
WRITE_NEW_ROOT
OPEN_CONFLICT
```

Initially run in audit/advisory mode against existing promotion paths.

Compare decisions with current writes before enforcing. Required durable decisions must feed the Phase 2 remote sync protocol.

## Phase 5 — Continuity/Execution adoption

Route Continuity promotion and execution memory promotion through the new write-decision policy. Terminal continuity checkpoints become remote-durability boundaries.

Prove no regression in current continuity/execution acceptance suites.

## Phase 6 — Agent Core hard lifecycle

Require preflight/postflight for selected Agent Core actionable flows.

A required postflight cannot reach `DURABLY_CLOSED` while its remote sync state is pending/unverified.

Roll out with feature flags and fail-safe rollback.

## Phase 7 — Codespace hydration + enforcement adapter

Introduce:

- automatic Memory Remote hydration before memory-authoritative work;
- Memory Context Lease;
- pending-postflight behavior for Codespace mutation classes;
- fresh-Codespace fail-closed behavior when remote state cannot be hydrated.

Start enforcement changes in advisory mode where compatible, but remote hydration correctness itself must not silently fall back to an empty database.

## Phase 8 — Memory Observatory

Build graph/timeline/recall/live activity UI using read-only projections. Add remote durability state (`REMOTE_PENDING`, `REMOTE_SYNCED`, hydration generation) as observable metadata without giving the UI mutation authority.

## Phase 9 — Scale, disaster-recovery, and quality certification

Certify:

- 100k memory performance;
- recall quality;
- remember_more quality;
- node-creation correctness;
- zero cross-scope contamination;
- restart/rebuild recovery;
- complete Codespace deletion/recreation recovery;
- remote event replay equality;
- concurrent remote-writer reconciliation;
- remote-outage truthful behavior;
- Codespace hard-enforcement recovery;
- visualization independence.

---
# 51. Rollback Strategy

Every phase needs a rollback path.

Principles:

- schema migration gets automatic pre-migration backup;
- new tables are additive where possible;
- old retrieval remains available behind a feature flag during rollout;
- `remember_more` can be disabled independently;
- write-decision enforcement can fall back to audit-only mode;
- Codespace lease enforcement can fall back to advisory mode;
- remote sync enforcement may fall back to `REMOTE_PENDING` operation only for an already-hydrated local state, never to fabricated `REMOTE_EMPTY_CONFIRMED`;
- hydration failure must preserve the local pre-hydration state and remote data;
- remote reconciliation uses non-force Git operations;
- Memory Observatory can be stopped without affecting DMF;
- stable release tags remain immutable.

No rollback should physically destroy new evidence without an explicit operator action.

---

# 52. Failure Modes to Test Explicitly

## 52.1 No memory exists

Expected:

```text
NO_RELEVANT_MEMORY
```

Work proceeds.

Postflight may choose `WRITE_NEW_ROOT` only if durable.

## 52.2 Many weakly similar memories

Expected:

- bounded candidates;
- no blind node revision;
- low-authority similarity does not overwrite current state.

## 52.3 Current decision + old failure

Expected:

- current decision first;
- failure remains discoverable;
- `remember_more` can recover failure chain.

## 52.4 Contradictory current memories

Expected:

```text
inspectionRequired = true
```

No silent winner by recency alone.

## 52.5 Node candidate with no relation

Expected:

```text
REJECT unless FRESH_DURABLE_CONTEXT
```

## 52.6 Fresh root later becomes related

Expected:

- create new edge;
- preserve original root-creation reason;
- visual graph becomes connected.

## 52.7 Session disappears before postflight

Expected:

```text
POSTFLIGHT_PENDING
```

Next meaningful mutation requires reconciliation.

## 52.8 Memory DB degraded

Expected:

- no fabricated context;
- degradation surfaced;
- operator recovery path remains possible.

## 52.9 Dashboard crashes

Expected:

- zero effect on memory authority/execution.

## 52.10 Relation correction

Expected:

- old relation event remains auditable;
- active edge projection changes;
- no history erasure.

## 52.11 Codespace permanently deleted after confirmed remote sync

Expected:

- destroy all local runtime memory;
- fresh workspace hydrates remote state;
- logical state hash equality is exact;
- current revisions, edges, conflicts, continuity checkpoints, and provenance are preserved.

## 52.12 Codespace disappears while remote sync is pending

Expected:

- system never claimed `DURABLY_CLOSED`;
- remote store remains at last confirmed generation;
- fresh Codespace restores the last confirmed generation truthfully;
- any lost local-only tail is reported as not remotely durable rather than invented as restored.

## 52.13 Fresh Codespace cannot reach Memory Remote

Expected:

```text
REMOTE_UNAVAILABLE
HYDRATION_REQUIRED
```

It must not silently create a new empty authoritative memory database for an existing configured scope.

## 52.14 Remote authentication/decryption/integrity failure

Expected:

- fail closed for hydration;
- no plaintext secret logging;
- no overwrite of remote state;
- operator-visible reason code;
- source-code/runtime tools that do not depend on authoritative memory may remain diagnosable according to policy.

## 52.15 Two Codespaces push durable memory concurrently

Expected:

- no force push;
- immutable event sets are fetched and reconciled;
- both transport commits remain represented;
- semantic contradiction becomes a memory conflict, not a silent Git winner.

---

# 53. Acceptance Gates

The subsystem is not complete merely because the UI renders a graph.

Minimum architecture acceptance:

```text
existing DMF current-revision correctness           PASS
hard guardrail recall                               PASS
prior failure recall                                PASS
remember_more causal history                        PASS
remember_more revision history                      PASS
revise-vs-new correctness corpus                    PASS
branch-vs-revise correctness corpus                 PASS
unjustified new-node acceptance                     0
required linked-node orphan rate                    0
fresh-root reason persistence                       PASS
open conflict visibility                            PASS
failure/solution chain preservation                 PASS
NO_DURABLE_MEMORY persistence decision              PASS
pending postflight recovery                         PASS
remote write-through readback                        PASS
terminal durable task with unsynced remote state     0
local-delete → fresh-hydrate state equality           1.0
remote replay deterministic equality                  1.0
remote confirmed-empty vs restore-failure ambiguity   0
remote plaintext memory/secret leakage                0
remote non-force concurrent-writer reconciliation     PASS
cross-project contamination                         0
cross-principal contamination                       0
deterministic replay equality                       1.0
100k preflight p95                                  <150 ms
secret leakage into memory/profile/activity UI      0
visualizer mutation authority                       0
external AI/model/API dependency                    0
```

Codespace-enforcement acceptance additionally requires:

```text
mutation without required lease         rejected predictably
valid lease mutation                    allowed
expired lease                            rejected predictably
pending previous postflight              blocks/reconciles next mutation
memory degraded                          truthful degraded behavior
fresh Codespace + remote unavailable      no silent empty authority
confirmed remote state                    auto-hydrated before authoritative mutation
unrelated .vscode/user state             preserved
```

---

# 54. Memory Quality Philosophy

The graph should not optimize for maximum recall or maximum node count.

The desired behavior is:

```text
few enough memories to remain precise
rich enough relations to reconstruct causality
current state easy to find
history easy to expand on demand
failures difficult to forget
noise easy to archive
```

A healthy system may frequently decide:

```text
NO_DURABLE_MEMORY
```

That is not failure. It is memory discipline.

---

# 55. Human-Readable Mental Model

The easiest conceptual analogy is:

```text
Memory node       = durable remembered concept/event
Revision          = same memory evolving over time
Branch            = related new line of knowledge
Edge              = why two memories belong together
Preflight         = trying to remember before acting
remember_more     = deliberately recalling deeper history
Postflight        = deciding what deserves to be remembered
Conflict          = two incompatible remembered beliefs
Failure chain     = memory of what went wrong and why
Solution chain    = memory of how it was fixed and verified
Observatory       = visual debugger of external memory
```

This is only an analogy. The implementation remains deterministic software, not a biological brain simulation.

---

# 56. Final Architectural Position

The target system should be understood as:

```text
GPT-5.6 Sol
   │
   │ model remains unchanged
   ▼
Agent Core Local Memory Cognition Protocol
   │
   ├─ bounded recall
   ├─ remember_more
   ├─ evidence-aware revision
   ├─ branch creation
   ├─ node justification
   ├─ conflict preservation
   ├─ failure/solution history
   └─ postflight memory decision
   │
   ▼
Deterministic Memory Fabric / Continuity / Evidence
   │
   ▼
SQLite local materialized working state
   │
   ├─ write-through durability → Private Memory Remote
   │                              │
   │                              └─ survives Codespace deletion
   │
   └─ read-only Memory Observatory
```

The essential design rule is:

> **Agent Core should not try to manufacture intelligence by adding another model. It should improve continuity by making the right local evidence easier to remember, harder to corrupt, easier to connect, and easier to inspect.**

And the essential lifecycle rule is:

> **Recall before meaningful action. Resolve a memory decision after meaningful work. Never create a durable node without a reason. Never destroy the historical path that explains why the current memory exists.**

---

# 57. Next Step After User Review

This document intentionally stops before implementation.

After the user reviews and approves this architecture specification, the next artifact should be a detailed implementation plan that decomposes the work into separately certifiable phases, beginning with:

```text
Phase 1 — schema v3 + write-decision/recall-expansion/remote-sync audit ledgers
Phase 2 — mandatory Private Memory Remote durability + fresh-Codespace hydration
```

The implementation plan should use TDD, isolated worktrees, additive migrations, fresh performance baselines, and per-phase GitHub audit checkpoints. No LangChain/LangGraph dependency or external AI model/API should be introduced unless a later evidence-backed design change explicitly authorizes it.


---

# 58. Phase 1 Implementation Evidence — 2026-09-01

The design sections above remain the approved architectural specification. This section records factual implementation evidence after Phase 1 was executed on the isolated implementation branch.

## Certified implementation identity

```text
branch:
feature/cross-session-memory-nervous-system

certified implementation SHA:
aa8ca5aacc06828999096da224d89ed8824a7bdf
```

That SHA was pushed to GitHub and matched `origin/feature/cross-session-memory-nervous-system` before certification evidence was recorded.

## Implemented Phase 1 boundaries

Phase 1 is additive. It does not enable Private Memory Remote transport, hard memory lifecycle enforcement, `remember_more`, or the Memory Observatory.

Implemented and verified:

```text
DMF schema version                         3
migration                                 003_memory_cognition_ledgers
memory_write_decisions                    present
memory_recall_expansions                  present
memory_edge_events                        present / append-only
memory_node_metadata                      present
memory_remote_state                       present / local truth only
relation policy                           centralized / typed directionality
explicit context anchors                  present / bounded / redacted
cognition ledger                          principal + project scoped
active-edge audit                         atomic with projection creation
cross-scope explicit relation target      rejected before persistence
```

The expanded relation vocabulary preserves legacy relations and adds typed evolution, causal, dependency, conflict, and task-family relations. Directed semantic relations are no longer mirrored by a generic rule; symmetric relations such as `contradicts` and associative relations use controlled mirroring through the relation policy.

`NO_DURABLE_MEMORY` is now persistable as a cognition decision without creating a semantic `memory_items` node. This preserves the central design rule that meaningful work must make a memory decision, not that every interaction must create a memory.

The `memory_remote_state` table is only the local durability/hydration truth foundation for Phase 2. No claim of cross-Codespace durability is made by Phase 1.

## Fresh verification evidence

Focused Phase 1 subsystem suite:

```text
33 test files PASS
129 tests PASS
1 intentional skip
0 failures
```

The model-facing memory MCP surface remains unchanged:

```text
memory tools: 8
```

Deterministic quality gate:

```text
Memory Recall@K                     1.0
Memory MRR                          1.0
Hard guardrail recall               1.0
Current revision correctness        1.0
Prior failure recall                1.0
Graph target recall                 1.0
Conflict visibility                 1.0
Artifact/procedure recall           1.0
Noise displacement                  0
Cross-project contamination         0
Cross-principal contamination       0
Character-budget correctness        1.0
Deterministic replay equality       1.0

Routing tier accuracy               0.975
Unsafe overpermission rate          0
False high-impact rate              0
Relevant skill precision@2          1.0
Routing deterministic replay        1.0
```

100k-memory performance gate:

```text
active memories                     100001
SQLite integrity                    ok
samples                             25
warmups                             5
preflight p95                       109.87 ms
target                              <150 ms
result                              PASS
```

Full release verification was run as one controlled Codespace-owned process and reached terminal exit code `0`:

```text
npm run verify:release              PASS
brand scan                          PASS
TypeScript build                    PASS
Codespace build                     PASS
full test files                     139 PASS / 2 skipped
full tests                          681 PASS / 38 intentional skips
failures                            0
quality:gate                        PASS
release consistency                 PASS
Agent Core version                  0.6.0
server version                      0.6.0
document links                      44 markdown / 17 relative links PASS
```

The first bounded foreground attempt timed out at the connector layer and left duplicate verification processes. Those partial runs were not treated as certification evidence. Only the later single Codespace-owned process with observed terminal exit code `0` is authoritative for the full release gate.

Dependency/model guardrails were also rechecked from the Phase 1 base commit `482489d799ed696b752875a1753cbdc6527e5115`:

```text
package.json / package-lock.json change       none
new OpenAI source/dependency integration      none
new Anthropic source/dependency integration   none
new Gemini source/dependency integration      none
new LangChain dependency/integration          none
new LangGraph dependency/integration          none
```

## Phase boundary

Phase 1 is therefore **CERTIFIED COMPLETE** on the implementation branch.

The next phase remains:

```text
Phase 2 — Private Memory Remote Durability + Fresh-Codespace Hydration
```

Phase 2 must establish application-level encryption, logical-state hashing, non-force concurrent-writer synchronization, truthful remote state/readback, fail-closed fresh hydration, and local-delete → fresh-hydrate equality before Agent Core may claim certified cross-Codespace memory durability.

---

# 59. Phase 2 Implementation Evidence — 2026-09-01

The architecture sections above remain the approved specification. This section records factual evidence after the Private Memory Remote durability foundation and fresh-Codespace hydration boundary were implemented and certified.

## Certified implementation identity

```text
branch:
feature/cross-session-memory-nervous-system

Phase 2 base:
cccbd03cc97452664501e54f4fdbc510ec8240f0

certified implementation candidate:
57c975eb8d89605c45b7390014401b30a17813e1
```

The implementation candidate was pushed to GitHub and exactly matched `origin/feature/cross-session-memory-nervous-system` before the final certification gates were run.

## Implemented Phase 2 durability substrate

```text
Memory Remote default                         disabled
Memory Remote config                          explicit owner/repo/branch/key/work root
application encryption                        AES-256-GCM
Memory Remote encryption key                  independent 32-byte/64-hex contract
GitHub-token-shaped encryption key            rejected
logical-state projection                      deterministic / scoped
logical-state hash                            SHA-256 / volatile access state excluded
remote scope path                              opaque SHA-256 principal+project identity
remote object/manifest IDs                    content/metadata verified
remote semantic payload                       encrypted before Git persistence
live SQLite file as remote authority           no
network Git credential path                   existing Native GitHub Fabric only
force push                                     prohibited / force:false
REMOTE_PENDING                                 persisted before remote proof
REMOTE_SYNCED                                  only after push + fetch + readback verification
remote failure interpreted as empty            never
fresh materialization                          temporary SQLite + integrity_check + hash equality
fresh install                                  atomic destination replacement
failed hydration destination mutation          none
concurrent same-logical-state writers           immutable-object union + new generation
concurrent different-logical-state writers      explicit conflict / no transport auto-resolution
Codespace startup with remote enabled           hydration gate before runtime supervisor
```

The Memory Remote is not a second semantic database. DMF SQLite remains the active semantic authority after successful local materialization; Git-backed remote state is an encrypted logical durability journal/checkpoint transport.

## Deletion/recreation proof

The acceptance scenario created a Codespace-A-like workspace containing:

```text
root memory + revision history
branch memory
failure memory
solution memory
validation memory
branch/evolution relations
failure -> solution relation
solution -> validation relation
open conflict history
write-decision metadata
node metadata
terminal continuity checkpoint
```

It then:

```text
projected the authenticated logical state
computed its logical-state hash
encrypted the recovery checkpoint
non-force synchronized + readback-verified the remote generation
scanned all remote fixture bytes for known semantic plaintext and scope identifiers
closed the local services
deleted all Codespace-A local state
created an unrelated Codespace-B-like workspace
hydrated into a fresh SQLite database
recomputed the logical-state projection/hash
compared restored projection == original projection
compared restored hash == original hash
```

Result:

```text
logical projection equality                    PASS
logical hash equality                          PASS
remote semantic sentinel leakage               0
remote principal ID plaintext leakage           0
remote project ID plaintext leakage             0
SQLite integrity after hydration                PASS
```

The deletion/recreation scenario was repeated from fresh temporary directories before final certification and remained deterministic.

## Concurrent writer proof

Two independent writer clones were started from the same remote generation. Writer A advanced the remote while Writer B was preparing a push. Writer B received the synthetic non-fast-forward path, fetched remote truth, and reconciled only at the transport level.

For equal logical-state hashes:

```text
force pushes                                    0
writer A immutable object retained              true
writer B immutable object retained              true
new generation predecessor                      writer A generation
generation chain                                valid
```

For different logical-state hashes:

```text
Git transport semantic auto-resolution          0
result                                           MEMORY_REMOTE_CONFLICT
```

This preserves the architecture rule that Git transport may reconcile immutable durability objects, but semantic contradictions belong to the memory conflict layer.

## Codespace hydration gate proof

When Memory Remote is enabled, bootstrap/repair now enforce:

```text
source checkout/build
-> restore/locate dedicated Memory Remote key
-> invoke bounded memory-hydrate CLI
-> REMOTE_HYDRATED or REMOTE_EMPTY_CONFIRMED
-> write verified scope-bound hydration marker
-> runtime supervisor startup
```

Explicit failure states do not become empty authority. An existing local SQLite memory DB with no matching verified hydration marker is rejected rather than silently trusted. The Codespaces encryption secret is independent from GitHub and ChatGPT/API credentials; when supplied as `AGENT_CORE_MEMORY_REMOTE_KEY_HEX`, it is written to a local mode-600 key file and removed from the environment before the Node hydration process.

## Fresh certification gates

Focused memory/continuity/execution-memory/Codespace suite:

```text
65 test files PASS
281 tests PASS
1 intentional skip
0 failures
```

The model-facing memory MCP surface remains unchanged:

```text
memory tools: 8
```

Deterministic quality gate:

```text
Memory Recall@K                     1.0
Memory MRR                          1.0
Hard guardrail recall               1.0
Current revision correctness        1.0
Prior failure recall                1.0
Graph target recall                 1.0
Conflict visibility                 1.0
Artifact/procedure recall           1.0
Noise displacement                  0
Cross-project contamination         0
Cross-principal contamination       0
Character-budget correctness        1.0
Deterministic replay equality       1.0
Routing tier accuracy               0.975
Unsafe overpermission rate          0
False high-impact rate              0
Routing deterministic replay        1.0
```

100k-memory performance gate:

```text
active memories                     100001
SQLite integrity                    ok
samples                             25
warmups                             5
preflight p95                       59.275 ms
target                              <150 ms
result                              PASS
```

Full release verification used one controlled Codespace-owned process and reached terminal exit code `0`:

```text
npm run verify:release              PASS
brand scan                          PASS
TypeScript build                    PASS
Codespace build                     PASS
full test files                     148 PASS / 2 skipped
full tests                          724 PASS / 38 intentional skips
failures                            0
quality:gate                        PASS
release consistency                 PASS
Agent Core version                  0.6.0
server version                      0.6.0
document links                      44 markdown / 17 relative links PASS
```

A final focused security rerun covered encryption, concurrent writers, and permanent deletion recovery:

```text
3 test files PASS
9 tests PASS
remote known-plaintext leakage      0
force-push implementation           none
```

Dependency/model guardrails from the Phase 2 base were unchanged:

```text
package.json / package-lock.json change       none
new OpenAI source/dependency integration      none
new Anthropic source/dependency integration   none
new Gemini source/dependency integration      none
new LangChain dependency/integration          none
new LangGraph dependency/integration          none
```

## Phase boundary

Phase 2 is therefore **CERTIFIED COMPLETE** for the Private Memory Remote durability substrate and fresh-Codespace hydration boundary.

This is deliberately narrower than claiming universal write-through adoption. Normal semantic, continuity, and execution mutation paths are still adopted into mandatory cognition/remote-durability boundaries in the later program phases. The next implementation phase is:

```text
Phase 3 — bounded remember_more
```


---

# 61. Phase 3 Certification — Bounded `remember_more`

## Certified implementation candidate

```text
branch                              feature/cross-session-memory-nervous-system
implementation SHA                  627a3b57481489fc2725986f59cf58d246d917a3
remote-visible candidate            yes / exact SHA equality
Phase 3 base                        f9120a654277efc7571d18757edef05e4c7f4e75
```

## Implemented historical-expansion contract

```text
default maxHops                     2
default maxItems                    4
default characterBudget             6000
hard seedMemoryIds ceiling          16
hard maxHops ceiling                4
hard maxItems ceiling               16
hard characterBudget ceiling        20000
seed authority                      live context + prior recall required
arbitrary memory browsing           rejected
principal/project isolation         mandatory at seed and target loads
tombstoned expansion targets        excluded
weak associative recursive history  excluded by relation policy
conflict source                     edges + memory_conflicts
branch source                       graph + node-metadata fallback
result ordering                     deterministic fixed priority
result snapshot                     SHA-256 stable JSON
returned expansion audit            memory_recall_expansions
default search/preflight behavior   current-revision-first unchanged
```

Priority remains revision predecessor, failure/cause, solution, validation, branch/derived, conflict, dependency/blocker, then other explicitly recursive history relations. The implementation also bounds internal frontier/edge/conflict expansion so request ceilings cannot become an unbounded graph walk.

## MCP contract

Exactly one model-facing tool was added:

```text
memory_remember_more
readOnlyHint                         true
destructiveHint                      false
idempotentHint                       true
openWorldHint                        false
memory tool count                    9
full Agent Core tool count           56
```

An authenticated MCP acceptance path proved that a solution already recalled in a valid memory context can expand to its historical failure while an arbitrary/unrecalled seed cannot be used as a history browser.

## Fresh certification gates

Focused Phase 3 suite:

```text
5 test files PASS
30 tests PASS
0 failures
```

Broad memory/continuity/execution-memory/MCP regression:

```text
49 test files PASS
202 tests PASS
1 intentional skip
0 failures
```

Deterministic quality gate:

```text
Memory Recall@K                     1.0
Memory MRR                          1.0
Hard guardrail recall               1.0
Current revision correctness        1.0
Prior failure recall                1.0
Graph target recall                 1.0
Conflict visibility                 1.0
Artifact/procedure recall           1.0
Noise displacement                  0
Cross-project contamination         0
Cross-principal contamination       0
Character-budget correctness        1.0
Deterministic replay equality       1.0
Routing tier accuracy               0.975
Unsafe overpermission rate          0
False high-impact rate              0
Routing deterministic replay        1.0
```

100k-memory performance gate:

```text
active memories                     100001
SQLite integrity                    ok
samples                             25
warmups                             5
preflight p95                       53.211 ms
target                              <150 ms
result                              PASS
```

Full release verification on the implementation candidate reached terminal exit code `0`:

```text
npm run verify:release              PASS
brand scan                          PASS
TypeScript build                    PASS
Codespace build                     PASS
full test files                     149 PASS / 2 skipped
full tests                          734 PASS / 38 intentional skips
failures                            0
quality:gate                        PASS
release consistency                 PASS
Agent Core version                  0.6.0
server version                      0.6.0
document links                      45 markdown / 17 relative links PASS
```

Dependency/model guardrails from the Phase 2 certification base remain unchanged:

```text
package.json / package-lock.json change       none
new OpenAI source/dependency integration      none
new Anthropic source/dependency integration   none
new Gemini source/dependency integration      none
new LangChain dependency/integration          none
new LangGraph dependency/integration          none
```

## Phase boundary

Phase 3 is therefore **CERTIFIED COMPLETE** for bounded historical expansion, authenticated seed authority, deterministic packing, expansion auditing, and the read-only MCP interface. It deliberately does not implement the Phase 4 write-decision controller, automatic expansion policy, or universal remote write-through adoption.


---

# 62. Phase 4 Certification — Memory Cognition / Write Decision Controller

## Certified implementation candidate

```text
branch                              feature/cross-session-memory-nervous-system
implementation SHA                  a17007ecf7bc6c55d3dda6132bedc5aeb38885fe
remote-visible candidate            yes / exact SHA equality
Phase 4 base                        d8e2e020da6866a74ae94e312ebb9a3ca133e93e
```

## Implemented cognition contract

Phase 4 adds a deterministic controller over the existing schema-v3 cognition ledger rather than another storage authority.

```text
MemoryCognitionController.evaluate     advisory / decision audit only
MemoryCognitionController.apply        explicit policy-controlled mutation
MemoryService.evaluatePostflight       internal service wrapper
MemoryService.applyPostflight          internal service wrapper
new schema migration                   none
new MCP tool                           none
existing promotion auto-adoption       none
```

The persistence vocabulary remains exactly:

```text
NO_DURABLE_MEMORY
REVISE_EXISTING
LINK_EXISTING
WRITE_BRANCH
WRITE_NEW_ROOT
OPEN_CONFLICT
```

Every successful controller evaluation records one `memory_write_decisions` row. Advisory evaluation does not create or revise a semantic node, add an edge, or open a conflict. Normal Store commits/revisions, preflight, Continuity promotion, and Execution memory promotion do not invoke the controller automatically in Phase 4.

## Bounded semantic-profile contract

New writes to node metadata use an approved structured profile vocabulary:

```text
title
summary
intent
concepts[]
entities[]
constraints[]
artifacts[]
outcome
failureMode
solution
futureRelevance[]
```

Bounds and identity rules:

```text
scalar string ceiling                 2000 characters
array item ceiling                    500 characters
array item count                      32
canonical profile JSON                <=16000 UTF-8 bytes
unknown keys                          rejected
empty values                          removed
array values                          redacted + deduplicated + binary sorted
profile identity                      SHA-256(canonical redacted JSON)
exact profile identity cross-scope    never matched
```

The profile is a structured description/identity signal, not an external semantic judge and not an embedding. Existing already-persisted logical metadata can still replay through the remote logical-state materializer without being reinterpreted by the new-write validator.

## Node-creation and relation policy

New non-root nodes may be justified only by strong semantic relations already recognized by the central relation policy:

```text
continues
branch_of
derived_from
learned_from
caused_by
failed_because
resolved_by
validated_by
blocked_by
depends_on
produced
contradicts
```

Weak associative relations cannot justify a new branch/conflict node by themselves:

```text
same_key
explicit_relation
same_anchor
same_artifact
same_route_or_task
cooccurs_in_event
token_overlap
temporal_neighbor
same_task_family
```

`WRITE_BRANCH` requires an evidence-backed `branch_of` or `derived_from` relation to a same-scope parent. `WRITE_NEW_ROOT` requires `FRESH_DURABLE_CONTEXT`, evidence, and a non-empty `rootReason`, with no exact canonical/profile identity already present. `OPEN_CONFLICT` requires evidence-backed `contradicts`; both nodes remain and a `memory_conflicts` record is opened. Failures remain immutable episodic nodes and are never revised in place.

The new Store explicit-relation writer reuses the existing central relation direction/mirroring policy and append-style edge audit. It rejects foreign/tombstoned endpoints before mutation.

## Explicit application semantics

```text
NO_DURABLE_MEMORY    mark decision applied; semantic mutation false
REVISE_EXISTING      same memory ID; next revision; decision-linked metadata
LINK_EXISTING        existing nodes only; optional validated explicit edge(s)
WRITE_BRANCH         new child + strong child->parent relation + branch metadata
WRITE_NEW_ROOT       new root + rootReason + root metadata
OPEN_CONFLICT        preserve both nodes + contradicts edges + open conflict row
```

A decision is marked applied only after required mutation completes successfully. Applied-result structured JSON now handles `undefined` deterministically using JSON semantics: undefined object properties are omitted and undefined array entries become `null`.

## Fresh certification gates

Focused Phase 4 suite:

```text
7 test files PASS
29 tests PASS
0 failures
```

Broad memory/continuity/execution-memory/MCP regression:

```text
52 test files PASS
218 tests PASS
1 intentional skip
0 failures
memory MCP tools                     9
full Agent Core MCP tools            56
memory_postflight MCP tool           absent
```

Deterministic quality gate:

```text
Memory Recall@K                     1.0
Memory MRR                          1.0
Hard guardrail recall               1.0
Current revision correctness        1.0
Prior failure recall                1.0
Graph target recall                 1.0
Conflict visibility                 1.0
Artifact/procedure recall           1.0
Noise displacement                  0
Cross-project contamination         0
Cross-principal contamination       0
Character-budget correctness        1.0
Deterministic replay equality       1.0
Routing tier accuracy               0.975
Unsafe overpermission rate          0
False high-impact rate              0
Routing deterministic replay        1.0
```

100k-memory performance gate:

```text
active memories                     100001
SQLite integrity                    ok
samples                             25
warmups                             5
preflight p95                       60.67 ms
target                              <150 ms
result                              PASS
```

Full release verification on the implementation candidate reached terminal exit code `0`:

```text
npm run verify:release              PASS
brand scan                          PASS
TypeScript build                    PASS
Codespace build                     PASS
full test files                     152 PASS / 2 skipped
full tests                          750 PASS / 38 intentional skips
failures                            0
quality:gate                        PASS
release consistency                 PASS
Agent Core version                  0.6.0
server version                      0.6.0
document links                      46 markdown / 17 relative links PASS
```

Dependency/model guardrails from the Phase 3 final certification remain unchanged:

```text
package.json / package-lock.json change       none
new OpenAI source/dependency integration      none
new Anthropic source/dependency integration   none
new Gemini source/dependency integration      none
new LangChain dependency/integration          none
new LangGraph dependency/integration          none
```

## Compatibility finding during certification

The broad regression found two Phase-2 test fixtures still creating free-form semantic profiles using keys that predated the Phase-4 approved profile vocabulary. Those fixture calls were migrated to approved fields and the original remote hydration/deletion-recovery scenarios passed again. No production remote hydration, crypto, logical-state hashing, or replay behavior was loosened to accommodate legacy write inputs.

## Phase boundary

Phase 4 is **CERTIFIED COMPLETE** for deterministic advisory write decisions, explicit decision application, bounded semantic-profile identity, branch/root/conflict creation gates, and zero automatic adoption into existing promotion paths. Phase 5 remains responsible for routing Continuity/Execution promotion through the controller and enforcing the remote durability boundary for those flows.

---

# 63. Phase 5 Certification — Continuity and Execution Adoption

## Certified implementation candidate

```text
branch                              feature/cross-session-memory-nervous-system
implementation SHA                  d0e55585c6b7e08865ee7e40dea1fa7e517df6d9
remote-visible candidate            yes / exact SHA equality
Phase 5 base                        a25b44c98f02256a603bde85e9507a74cf02ab74
```

## Production durability boundary

Phase 5 introduces one production `MemoryDurabilityBoundary` over the already-certified Phase-2 remote protocol. It does not create a second semantic store.

```text
remote disabled                     NOT_REQUIRED / no fabricated remote state
remote enabled                      scoped logical projection -> encrypted recovery checkpoint
plaintext authority                 serializeMemoryLogicalState(scope projection)
logical identity                    hashMemoryLogicalState(scope projection)
predecessor                         memory_remote_state.remote_generation only
remote object kind                  recovery-checkpoint
manifest object count               1 per grouped boundary
push                                non-force through existing MemoryRemoteSynchronizer
success                             REMOTE_SYNCED only after fetch/readback verification
failure                             local truth preserved; no false REMOTE_SYNCED
```

The latest generated checkpoint was proven decryptable to the exact serialized local logical projection and a second generation was proven to reference the first generation as predecessor. Hydrating the latest generation reproduced the exact logical projection.

## Continuity adoption

`ContinuityPromoter` no longer has a direct semantic `commit()` path. Its durable facts are expressed as Phase-4 postflight candidates with bounded evidence and root reasons.

```text
continuity decision                 cognition postflight
verified artifact                   cognition postflight
verified outcome/project state      cognition postflight
constraint/guardrail                cognition postflight
failed checkpoint                   cognition postflight; failure remains immutable
no structured durable fact          applied NO_DURABLE_MEMORY decision
```

Every accepted promoted node carries `memory_node_metadata.created_from_decision_id`. Repeating changed evidence for the same failure canonical identity creates an applied no-write decision and leaves the failure revision count at one.

The MCP `task_checkpoint` sequence is now:

```text
validate route/execution evidence
-> local continuity checkpoint
-> cognition-backed promotion
-> local turn close/interruption when requested
-> one grouped MemoryDurabilityBoundary sync
-> successful response only after required remote readback
```

The grouped remote logical state therefore covers the continuity checkpoint, task/frontier updates, write-decision audit, accepted semantic memory mutations, and local turn-finalization evidence that existed before the boundary call.

## Execution adoption

`ExecutionMemoryBridge` also has no remaining direct semantic `commit()` path.

```text
node.failed                         FAILURE_OBSERVED postflight -> execution_failure boundary
verified artifact evidence          ARTIFACT_VERIFIED postflight -> execution_artifact boundary
terminal execution checkpoint       postflight -> execution_process_checkpoint boundary
raw stdout/stderr                    never semantic payload
unverified required artifact         never promoted as verified success
```

If local postflight succeeds but required durability fails, the event is not counted as promoted. The existing execution memory-sync queue receives the bounded immutable promotion payload. Replay applies the same candidate again through the controller and retries the durability boundary. Tests prove queue recovery retains one semantic identity rather than creating a second failure node.

## Remote and lifecycle truth

Phase 5 intentionally distinguishes local factual completion from certified cross-Codespace durability.

```text
local checkpoint/promotion may already exist       true
required remote readback failed                     MCP success false
execution promotion durability failed               queued for replay
false REMOTE_SYNCED                                  0
rollback/delete factual local terminal evidence     no
POSTFLIGHT_PENDING/DURABLY_CLOSED state machine     not Phase 5
```

That last boundary is deliberate. Phase 6 adds explicit pending-postflight reconciliation and hard memory lifecycle enforcement. Phase 5 does not silently invent those states.

## Fresh certification gates

```text
focused Phase 5                     6 files / 46 PASS
broad memory/continuity/execution   74 files / 341 PASS / 5 intentional skips
disaster recovery                   3 files / 9 PASS
direct semantic commit bypass       0
memory MCP tools                    9
full Agent Core MCP tools           56
memory_postflight MCP tool          absent
```

Deterministic quality/performance remained inside the certified contract:

```text
Memory Recall@K                     1.0
Memory MRR                          1.0
Cross-project contamination         0
Cross-principal contamination       0
Deterministic replay equality       1.0
100k preflight p95                  59.887 ms
100k target                         <150 ms
```

Full implementation-candidate release gate:

```text
npm run verify:release              PASS / exit 0
brand / TypeScript / Codespace      PASS
full test files                     153 PASS / 2 skipped
full tests                          757 PASS / 38 intentional skips
release failures                    0
quality:gate                        PASS
release consistency                 PASS
document links                      47 markdown / 17 relative links PASS
```

Dependency/model guardrails from the Phase-4 final certification remain unchanged:

```text
package.json / package-lock.json change       none
new OpenAI source/dependency integration      none
new Anthropic source/dependency integration   none
new Gemini source/dependency integration      none
new LangChain dependency/integration          none
new LangGraph dependency/integration          none
```

## Phase boundary

Phase 5 is **CERTIFIED COMPLETE** for routing Continuity and Execution durable promotion through the cognition/write-decision authority and for making their required Memory Remote checkpoints truthful. Phase 6 remains responsible for hard preflight/postflight lifecycle state, pending-postflight reconciliation, and mutation-lease enforcement.

---

# 64. Phase 6 Certification — Agent Core Hard Memory Lifecycle

## Certified implementation candidate

```text
branch                              feature/cross-session-memory-nervous-system
implementation SHA                  e2fa01ef0034ae0da31be05c8d79ecf3b2190d9e
remote-visible candidate            yes / exact SHA equality
Phase 6 base                        bc5cba9a8e9af0aa392166c2a9a5dd497091536d
```

Implementation checkpoints:

```text
Phase 6 executable plan             f1d03698f45e61c65ce8f8a11ef6490169f85120
schema v4 + lifecycle ledger        0a6bce776ee605ef3dbc2217e2589bb3b7c41aa2
Agent Core mutation enforcement     cb669e393ad5dbd4fb7ff0e05bb733ef48e83ee5
pending-postflight reconciliation   1f9f438e34c90a1ddca378c4475b1fac02e4dfb8
schema-v4 recovery certification    e2fa01ef0034ae0da31be05c8d79ecf3b2190d9e
```

## Persisted hard lifecycle authority

Phase 6 adds schema v4 migration `004_hard_memory_lifecycle` and one durable lifecycle ledger. It does not replace the existing ephemeral `memory_contexts` recall snapshot or create a second semantic-memory authority.

```text
preflight persisted                 OPEN
successful meaningful work          POSTFLIGHT_PENDING
local postflight applied             CLOSED
required remote readback verified    DURABLY_CLOSED (derived public state)
remote disabled                      CLOSED + NOT_REQUIRED
remote required but unavailable      CLOSED locally / no durable receipt
```

The lifecycle row is exact on principal, project, route context, objective hash, expiry, and optional authoritative Continuity task ID. The lifecycle table intentionally has no foreign key to ephemeral `memory_contexts`: verified remote hydration may recover pending/closed lifecycle truth while old recall snapshots remain intentionally non-replayable.

Rollout is controlled by `AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE`:

```text
disabled                            preserve pre-Phase-6 behavior
advisory (default)                  record would-block evidence, do not block
 enforce                             reject invalid/missing lifecycle before mutation
```

A disabled or degraded MemoryService never fabricates a compliant lease.

## Logical-state projection compatibility

Current encrypted Memory Remote recovery checkpoints use logical-state projection format v2. Format v2 extends the Phase-5 projection with lifecycle semantic fields while excluding local-only durability receipts.

```text
format v1                           exact Phase-5 table set
format v2                           v1 + memory context lifecycle semantic state
local_durable_generation            excluded from projection/hash
local_durable_hash                  excluded from projection/hash
legacy v1 read/hydrate              supported
current v2 read/hydrate             supported
```

The pinned empty-format-v1 hash remains:

```text
9dd14a610711605061db5407aed4d135a3ed9ba69b72252c288e9d2cdf068e48
```

A lifecycle receipt initially changed semantic `updated_at` and therefore changed the logical hash after verified remote sync. A RED regression isolated that drift. The production fix makes receipt attachment local-only: adding `local_durable_generation` / `local_durable_hash` no longer mutates any projected semantic field. The logical hash is therefore stable before and after receipt attachment.

Real remote round-trip evidence proves:

```text
local lifecycle CLOSED
-> encrypted v2 recovery checkpoint contains CLOSED
-> non-force remote sync + exact readback
-> local-only receipt attachment leaves logical hash unchanged
-> fresh SQLite hydrate reproduces exact v2 logical hash
-> hydrated CLOSED initially has no local receipt
-> exact REMOTE_SYNCED generation/hash reconstructs receipt locally
```

## Deterministic meaningful-work enforcement

One local pure classifier is shared by Agent Core filesystem/process, Execution, and GitHub mutation wrappers.

Meaningful examples include filesystem writes/edits/moves, execution create/start/add/retry/cancel, mutating GitHub operations, and generic/unknown shell commands. Read/search/status operations remain outside the hard mutation lease. `stop_process` is intentionally a recovery-control exemption so failed enforcement cannot brick operator recovery.

`execute_command` is read-only only for a deliberately narrow no-metacharacter allowlist such as `pwd`, simple `ls`, `git status`, `git rev-parse`, `git branch --show-current`, `git log`, `git show`, and `git diff`. Redirection, chaining, substitution, pipelines, and unknown commands are classified as meaningful.

Enforce-mode ordering is:

```text
existing RouteContext validation
-> deterministic meaningful-work classification
-> exact persisted lifecycle validation
-> underlying mutation
-> successful mutation marks POSTFLIGHT_PENDING
```

An underlying mutation failure never fabricates successful work. If the local mutation already committed but the lifecycle cannot be marked pending, the operation reports `MEMORY_POSTFLIGHT_REQUIRED` with factual `mutationCommitted: true` evidence rather than pretending the postflight obligation disappeared.

## Pending postflight and Continuity reconciliation

`capability_route` now checks prior lifecycle obligations before it treats a new actionable context as compliant.

```text
same explicit resumeTaskId pending          blocked in enforce mode
same normalized objective pending           blocked in enforce mode
unrelated objective/task                    not globally blocked
advisory prior pending                      surfaced, not enforced
closed prior context                        does not block
```

After Continuity begins/resumes, the preflight lifecycle is bound to the authoritative `continuityTaskId`; no second task identity is invented.

`task_checkpoint` now orders local and remote truth as:

```text
validate checkpoint/execution evidence
-> persist local Continuity checkpoint
-> Phase-4 cognition/postflight promotion
-> close/interrupted local turn as factual truth
-> prepare lifecycle CLOSED in semantic projection
-> Memory Remote durability boundary
-> verified REMOTE_SYNCED: attach local-only generation/hash receipt
-> return success with lifecycle/durability state
```

If remote sync fails, the MCP call fails while the factual local checkpoint, promoted memory/write-decision evidence, turn state, and lifecycle `CLOSED` remain intact. A later retry recognizes `CLOSED` without a receipt as durability-only reconciliation. It reuses the authoritative prior checkpoint, does not repeat semantic postflight, and tests prove checkpoint/write-decision counts do not increase.

## Fresh certification gates

Implementation-candidate release verification on exact SHA `e2fa01ef0034ae0da31be05c8d79ecf3b2190d9e`:

```text
npm run verify:release              PASS / exit 0
brand scan                          PASS
TypeScript build                    PASS
Codespace build                     PASS
full test files                     157 PASS / 2 skipped
full tests                          784 PASS / 38 intentional skips
failures                            0
quality:gate                        PASS
release consistency                 PASS
Agent Core version                  0.6.0
server version                      0.6.0
document links                      48 markdown / 18 relative links PASS
memory MCP tools                    9 (unchanged)
full Agent Core MCP tools           56 (unchanged)
memory_postflight MCP tool          absent
direct Continuity semantic commit   0
direct Execution semantic commit    0
```

Deterministic quality/performance:

```text
Memory Recall@K                     1.0
Memory MRR                          1.0
Hard guardrail recall               1.0
Current revision correctness        1.0
Prior failure recall                1.0
Graph target recall                 1.0
Conflict visibility                 1.0
Artifact/procedure recall           1.0
Noise displacement                  0
Cross-project contamination         0
Cross-principal contamination       0
Character-budget correctness        1.0
Deterministic replay equality       1.0
Routing tier accuracy               0.975
Unsafe overpermission rate          0
False high-impact rate              0
100k active memories                100001
100k SQLite integrity               ok
100k samples / warmups              25 / 5
100k preflight p95                  64.006 ms
100k target                         <150 ms
100k result                         PASS
```

Disaster-recovery recertification:

```text
remote hydration                    PASS
remote deletion recovery            PASS
concurrent-writer reconciliation    PASS
schema/recovery backup              PASS
files                               4 PASS
tests                               17 PASS
```

Dependency/model guardrails from Phase 5 remain unchanged:

```text
package/package-lock dependency diff           none
new external AI/model/API integration          none
new OpenAI source/dependency integration       none
new Anthropic source/dependency integration    none
new Gemini source/dependency integration       none
new LangChain/LangGraph integration            none
```

## Phase boundary

Phase 6 is **CERTIFIED COMPLETE** for the Agent Core side of hard preflight/postflight lifecycle enforcement. It does not make the direct ChatGPT→Codespace bridge a semantic memory authority. Phase 7 extends this already-certified lifecycle through an opaque Memory Context Lease adapter and reuses the existing Phase-2 Codespace hydration gate rather than creating a second hydration system.


---

# 65. Phase 7 Certification — Codespace Hydration + Memory Context Lease Enforcement

## Certified implementation candidate

```text
branch                              feature/cross-session-memory-nervous-system
implementation candidate SHA        592b79efb5738532ca5dcdd7fe3a87c70a72a673
remote-visible candidate            yes / exact SHA equality
Phase 7 base                        bdf3501 (Phase 6 certification docs)
```

## Authority topology

Phase 7 extends Phase-6 hard lifecycle enforcement through an opaque capability rather than duplicating memory semantics in the bridge.

```text
capability_route / Phase-6 preflight
        │
        ▼
Agent Core process-lifetime AES-256-GCM lease authority
        │ opaque token only
        ▼
Codespace bridge
        │ loopback before/after request
        ▼
/internal/memory-context-lease
        │
        ├─ shared Phase-6 meaningful-work classifier
        ├─ persisted lifecycle revalidation
        └─ successful meaningful after -> POSTFLIGHT_PENDING
```

The lease cryptographic key exists only in the Agent Core process. Restart invalidates prior tokens by construction. Tokens are bound to principal, project/workspace root, context, route, objective hash, issued time, and expiry, but those fields are encrypted and are never decoded by the bridge. Issuance/validation does not alter logical memory identity.

## Bridge mutation truth

The existing Codespace MCP surface remains exactly twelve tools. Only four potentially meaningful schemas gain the optional opaque lease input: `write_file`, `edit_file`, `execute_command`, and `start_process`. `stop_process` remains lease-exempt for recovery.

```text
disabled mode                       adapter bypass / prior behavior
advisory mode                       mutation allowed + bounded advisory truth
enforce missing/invalid lease       MEMORY_PREFLIGHT_REQUIRED before mutation
read-only execute_command           allowed only when Agent Core classifier says required:false
meaningful mutation success         after call -> POSTFLIGHT_PENDING
underlying mutation failure         no fabricated after/pending
mutation committed + after failure  MEMORY_POSTFLIGHT_REQUIRED + mutationCommitted:true
```

The bridge strips the opaque token before filesystem/process calls. It does not place the token in child environments, process-session metadata, logs, status files, error details, or successful responses.

## Hydration/startup coupling

Phase 7 deliberately did not implement a second recovery system. `plugin/codespace/scripts/memory-lifecycle-preflight.sh` invokes the certified Phase-2 `scripts/codespace/memory-hydration-gate.sh`.

```text
second plugin hydration implementation     0
plugin memory-hydrate implementation       0
plugin remote-hydration.json authority     0
root Phase-2 hydration gate reused          yes
active-mode hydration failure               bridge mutation-ready = false
enforce hydration failure exit              55
enforce lease-authority failure exit        56
```

The lease endpoint is derived from the existing `agent_core_service_port` authority and stays exact loopback. The lifecycle mode is propagated from the managed Agent Core configuration to the bridge. After hydration, root credential classes are scrubbed from the bridge lifecycle parent and its MCP/tunnel/watchdog/shell descendants.

## Cross-Codespace proof

The Phase-7 acceptance test uses real logical projection encryption/decryption, real hydration/materialization, real lifecycle authority, real internal HTTP lease handling, and the real bridge lease client while replacing only external Git transport with deterministic in-memory transport.

It demonstrates initial remote-empty confirmation in Codespace A, a real Continuity terminal checkpoint and encrypted `REMOTE_SYNCED` closure, local DB destruction, exact Codespace-B hydrate, preservation of the completed task/checkpoint and lifecycle `CLOSED`, intentional rejection of the old process-lifetime lease, fresh-preflight/fresh-lease success, and unchanged local destination on remote-auth hydration failure.

## Candidate certification gates

```text
focused Phase-7 root                         8 files / 52 PASS
standalone Codespace                         17 files / 63 PASS
full release                                 163 files PASS / 2 skipped
full tests                                   812 PASS / 38 intentional skips
failures                                     0
quality gate                                 PASS
Agent Core / memory / Codespace tools        56 / 9 / 12
100k preflight p95                           67.75 ms (<150 ms)
lease loopback before+after p95              3.735 ms (<50 ms)
disaster/cross-Codespace                     6 files / 27 PASS
dependency manifest changes                  none
external AI/model/API integration            none
direct Continuity/Execution commit bypass    0
second hydration implementation              0
root credential leakage to bridge/shell      0
`.vscode/` changes                            0
tunnel identity defaults                     unchanged
```

## Finalization boundary

The implementation candidate satisfies the Phase-7 architecture and runtime gates. Documentation candidate `aa94e487ff44d4632a80115dcc8ba2216b7c60eb` was committed/pushed and then passed full release, standalone plugin, 100k-memory, lease micro-benchmark, exact local/remote equality, and clean-worktree verification. The final bookkeeping commit is revalidated before the external Phase-7 completion claim.
