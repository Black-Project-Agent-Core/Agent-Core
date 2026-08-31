# Agent Core Cross-Session Memory Nervous System — Architecture Design

**Status:** DESIGN SPECIFICATION — APPROVED BRAINSTORMING CAPTURE; NOT IMPLEMENTED  
**Design base:** `origin/main` at `6cb89e4a6c6b3d79767ce9bd6369f9945cff8590`  
**Target platform:** Agent Core local-first control plane in Codespace  
**Primary objective:** evolve the existing Deterministic Memory Fabric (DMF) into a persistent, bounded, evidence-aware cross-session memory graph that can recall, expand, revise, branch, link, and explain relevant prior context without changing the underlying OpenAI model or exposing private chain-of-thought.

---

# 1. Executive Summary

This design captures the agreed brainstorming direction for a local cross-session memory system that behaves less like a flat note database and more like a persistent network of evolving memories.

The goal is **not** to make the OpenAI model itself biologically human, alter hidden reasoning, replace personalization, or add another cloud AI layer. The goal is to improve the **external continuity context** supplied to the model when Agent Core/Codespace is used.

The target system should be able to:

- remember relevant work across separate ChatGPT sessions;
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
- remain local-first and avoid external model/API dependencies;
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

In this design, **sync** means local reconciliation of session/task evidence into durable DMF state.

It does not mean uploading memory to a cloud provider.

Postflight synchronization pipeline:

```text
Codespace / execution / continuity evidence
                │
                ▼
        structured bounded evidence
                │
                ▼
         Memory write candidate
                │
                ▼
        Existing-memory search
                │
                ▼
         Persistence decision
                │
                ▼
       revise/link/branch/root/no-write
                │
                ▼
              DMF
```

Raw stdout/stderr remains local execution evidence and is not copied wholesale into memory.

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

# 46. Cross-Session Persistence Boundary

Cross-session memory persists as long as the local Agent Core memory database persists.

Current Codespace runtime memory may live outside tracked source under the Codespace runtime path.

Important boundary:

> Local cross-session persistence does not automatically survive permanent deletion of the entire Codespace/runtime storage.

Therefore a later operator feature may add encrypted/user-controlled backup/export for disaster recovery.

Default implementation must not silently commit private memory databases into Git.

GitHub synchronization of raw memory is **not** part of this design.

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
plugin/codespace/...                     LATER enforcement adapter
```

Visualization should live in a clearly separate UI boundary rather than inside memory storage classes.

---

# 50. Migration Strategy

The migration must preserve current v0.6.0 stable behavior until each stage is separately proven.

## Phase 0 — Design and corpus

No production behavior change.

Deliver:

- this architecture spec;
- certified scenario corpus for revise/branch/root/no-write/remember_more;
- schema migration design;
- baseline performance measurements.

## Phase 1 — Schema v3 and audit ledgers

Add:

```text
memory_write_decisions
memory_recall_expansions
memory_edge_events
memory_node_metadata
new anchor types
new relation vocabulary
```

No hard enforcement yet.

## Phase 2 — `remember_more`

Implement bounded historical expansion and explainability.

Keep initial recall behavior compatible.

## Phase 3 — Write Decision Controller

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

Compare decisions with current writes before enforcing.

## Phase 4 — Continuity/Execution adoption

Route Continuity promotion and execution memory promotion through the new write-decision policy.

Prove no regression in current continuity/execution acceptance suites.

## Phase 5 — Agent Core hard lifecycle

Require preflight/postflight for selected Agent Core actionable flows.

Roll out with feature flags and fail-safe rollback.

## Phase 6 — Codespace enforcement adapter

Introduce Memory Context Lease and pending-postflight behavior for Codespace mutation classes.

Start advisory, then hard-enforce after acceptance.

## Phase 7 — Memory Observatory

Build graph/timeline/recall/live activity UI using read-only projections.

## Phase 8 — Scale and quality certification

Certify:

- 100k memory performance;
- recall quality;
- remember_more quality;
- node-creation correctness;
- zero cross-scope contamination;
- restart/rebuild recovery;
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
SQLite local authority
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
Phase 1 — schema v3 + write-decision/recall-expansion audit ledgers
```

The implementation plan should use TDD, isolated worktrees, additive migrations, fresh performance baselines, and per-phase GitHub audit checkpoints. No LangChain/LangGraph dependency or external AI model/API should be introduced unless a later evidence-backed design change explicitly authorizes it.
