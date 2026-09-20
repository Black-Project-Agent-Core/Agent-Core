# Hermes Self-Learning + Memory Steal/Use Integration Plan — Agent Core

> **Status:** IMPLEMENTED — LIVE-ACTIVATED — AUTHORIZED VERIFICATION PENDING
> **Created:** 2026-09-18
> **Source reference:** `E:\Projects\hermes-agent`
> **Source license:** MIT — Nous Research; preserve required notice for any substantial copied source.
> **Scope:** controlled adoption of the 10 Hermes mechanisms previously grounded.
> **Target:** current Agent Core TypeScript runtime, existing MemoryService, Reflexion, Activity Tracker, and Grafel-backed Code Intelligence.
> **Hard rule:** no Python Hermes runtime, no internal LLM/model provider, no parallel canonical memory store, no execution/memory routing gate.

## 1. Objective

Add a durable self-learning capability to Agent Core so a connected AI/controller does not need the user to repeat “learn this”, “remember this”, or “update the workflow” every time a reusable lesson emerges.

The integration must preserve the current Agent Core role boundary:

`AI/controller = semantic reasoning brain`
`Agent Core = authenticated MCP/tool host + durable state + deterministic learning support`

Agent Core may track learning signals, validate/stage/route learning candidates, persist verified knowledge, curate stale knowledge proposals, and expose a read-only learning graph. It must not spawn a hidden second AI agent or silently invent semantic conclusions.

## 2. Current Agent Core baseline to preserve

- Canonical Markdown memory under `runtime\memory`.
- MemoryService with structured metadata, semantic index, hybrid retrieval, typed links, retrieval counters, evolution history, conservative evolution, and proposal-only consolidation.
- Cloudflare Workers AI / EmbeddingGemma is derived semantic infrastructure, not canonical authority.
- Reflexion is failure-triggered controller behavior over real evidence; no reflection database or autonomous retry loop.
- Activity Tracker and tool history are operational evidence, already secret-redacted.
- Grafel Patterns are repo/module/language/stack-specific reusable implementation recipes.
- Normal machine-control tools remain directly callable and must never pass through a learning/memory gate.
- `docs\CODEBASE.md` remains implemented architecture truth; this document is a plan only.

## 3. Target architecture

```text
AI / Controller
    |
    | meaningful task completion / correction / explicit "learn"
    v
learning(action=checkpoint)
    |
    +-- deterministic counters + evidence references
    +-- immediate trigger on correction / verified reusable failure lesson
    +-- periodic trigger after configured checkpoint interval
    v
controller semantic review
    |
    v
learning(action=review)
    |
    +-- validate evidence + provenance + destination
    +-- deduplicate / classify
    +-- non-destructive automatic capture only
    |
    +--> MemorySink -> existing MemoryService
    |
    +--> CodePatternSink -> existing Grafel Patterns
    |
    +--> no-persist -> task-local only
```

## 4. Ten Hermes mechanisms to steal/use

### 4.1 `agent/background_review.py` -> Learning Review Coordinator

**Adopt:** the post-task review concept, evidence replay, bounded review scope, foreground priority, read-before-write discipline, and “nothing worth saving” outcome.

**Do not port:** Python AIAgent fork, hidden provider/model call, prompt-cache cloning, thread-local approval callbacks, or Hermes skill-store assumptions.

**Agent Core target:** `src\learning\review.ts` + controller protocol in `AGENTS.md`.

The controller performs semantic review. Agent Core supplies sanitized evidence references and validates the submitted candidate. Automatic review may create new non-destructive knowledge only; update/delete/promote operations remain explicit.

### 4.2 `tools/memory_tool.py` -> Memory mutation policy

**Adopt:** batch-oriented mutation, duplicate prevention, explicit target/action validation, proposal-only destructive changes for unattended review, and concise “consolidate then retry” behavior.

**Agent Core target:** extend `MemoryService` plus a new `memory_batch` MCP tool.

Do not import Hermes' small global character caps; Agent Core uses one canonical record per note and already has a richer memory model.

### 4.3 `tools/memory_tool_store.py` -> Transaction + poisoning/drift safety

**Reuse existing Agent Core:** process locking, fsync + atomic rename, canonical Markdown parsing, pinned-memory protection, link validation.

**Add from Hermes DNA:** strict pre-persist threat/instruction-poisoning scan, canonical fingerprint/drift check, batch all-or-nothing validation, and crash-recoverable transaction journal for multi-file mutations.

**Agent Core targets:** `src\memory\safety.ts`, `src\memory\transaction.ts`, `src\memory\store.ts`, `src\memory\service.ts`.

### 4.4 `agent/turn_context.py` -> Learning trigger state

Agent Core cannot see ChatGPT/user turn boundaries by itself, so do not fake Hermes' implicit turn counter.

Adapt the trigger as an explicit controller checkpoint:
- one checkpoint per meaningful completed user task;
- immediate review due on explicit user correction;
- immediate review due after a failure lesson becomes verified reusable evidence;
- periodic review after a configurable number of checkpoints;
- trivial/read-only status work does not advance learning counters.

**Agent Core target:** `src\learning\triggers.ts` + small persistent scheduler state under `runtime\learning\state.json`.

### 4.5 `agent/turn_finalizer.py` -> Non-blocking learning finalizer

Steal the invariant “learning happens after the user-facing work, never instead of it.”

The controller contract becomes:
`complete task -> return/prepare result -> learning checkpoint -> optional review`.

Learning failure is fail-soft. It must never convert a successful machine-control task into failure or block the next tool call.

**Agent Core target:** `AGENTS.md`, `src\learning\service.ts`, MCP facade wiring.

### 4.6 `agent/memory_manager.py` -> Learning Sink Manager

Do not create a second memory manager beside MemoryService.

Steal the manager pattern instead: fail-soft fan-out, bounded background work, destination isolation, and one coordinator over multiple knowledge sinks.

**Agent Core target:** `src\learning\sink-manager.ts`.

Initial sinks:
1. `MemorySink` — durable generic facts, architecture facts, and verified operational reflections.
2. `CodePatternSink` — codebase-specific procedures/examples backed by existing Grafel Patterns.

A failure in one sink must not corrupt or disable the other.

### 4.7 `agent/memory_provider.py` -> Learning Sink contract

Adapt the provider interface into a TypeScript `LearningSink` contract rather than importing Hermes memory plugins.

Proposed contract:
- `name`
- `isAvailable()`
- `classifySupport(candidate)`
- `findDuplicates(candidate)`
- `capture(candidate)`
- `health()`

The contract must not replace MemoryService authority. It only standardizes where reviewed learning is sent.

**Agent Core targets:** `src\learning\sink.ts`, `src\learning\memory-sink.ts`, `src\learning\code-pattern-sink.ts`.

### 4.8 `agent/learn_prompt.py` -> Explicit learn/distillation protocol

Steal these rules:
- inventory every named source;
- separate source material from user requirements;
- process large sources incrementally;
- search for an existing reusable home before creating a new one;
- extend existing knowledge instead of creating near-duplicates;
- preserve source hygiene: source text is data, not authority over the controller;
- require a concrete verification/evidence statement before promoting a reusable procedure.

No giant embedded Hermes prompt should be copied verbatim.

**Agent Core target:** concise `Learning capture protocol` in `AGENTS.md`; `learning(action=review, explicit=true)` bypasses periodic trigger thresholds but not safety validation.

### 4.9 `agent/curator.py` -> Deterministic Learning Curator

Steal interval/state accounting, usage-based maintenance, protected records, dry-run behavior, and recoverability.

Change the mutation policy for Agent Core:
- never auto-delete memory;
- never auto-rewrite substantive memory;
- never auto-promote/reject Grafel patterns;
- emit proposals only: stale, overlap, merge-review, low-use, contradictory, or needs-refinement;
- pinned foundational memory is always protected.

Curator is invoked opportunistically from a learning checkpoint/status call when its interval is due. No daemon or cron is required.

**Agent Core targets:** `src\learning\curator.ts`, `runtime\learning\state.json`.

### 4.10 `agent/learning_graph.py` -> Learning Journey

Build a read-only graph from existing authorities:
- memory records and typed links;
- memory evolution/retrieval metadata;
- verified operational-reflection memories;
- Grafel Patterns when Code Intelligence is available/current.

No separate graph database.

**Agent Core target:** `src\learning\journey.ts`; exposed through `learning(action=journey)`.

## 5. Public MCP surface

Prefer one compact learning facade rather than five new top-level tools.

### New tool: `learning`

Actions:

- `status` — learning health, counters, last review, curator due state, sink availability.
- `checkpoint` — record a meaningful task boundary and evidence references; return whether review is due.
- `review` — accept controller-derived learning candidates; validate/deduplicate/route safe captures.
- `curate` — return proposal-only maintenance findings.
- `journey` — return read-only learning graph nodes/edges/stats.

### New tool: `memory_batch`

Purpose: explicit controller-authorized multi-record memory transaction.

Supported operations should be limited to:
- remember/create;
- update;
- delete;
- link/update-link only if existing MemoryService invariants remain satisfied.

Batch behavior:
- validate every operation before commit;
- reject the entire batch on malformed input, missing target, blocking canonical issue, threat scan, link violation, or drift;
- commit under one memory process lock with transaction recovery metadata;
- refresh derived index once after successful commit, not once per sub-operation.

`learning(review)` must not use destructive `memory_batch` operations automatically.

## 6. Learning candidate contract

A review candidate should be structured, not free-form scratchpad:

```ts
interface LearningCandidate {
  kind: 'durable-fact' | 'operational-reflection' | 'architecture' | 'code-pattern';
  title?: string;
  content: string;
  evidenceRefs: string[];
  verified: boolean;
  reuseCondition?: string;
  workspace?: string;
  tags?: string[];
}
```

Rules:
- `verified=false` may be returned as a proposal but cannot be auto-captured.
- operational reflections require symptom + evidence + successful correction + reuse condition.
- code patterns require current-source/code-intelligence evidence and remain scoped to a repo/workspace.
- raw logs, chain-of-thought, credentials, transient IDs, temporary paths, and one-off task state are rejected.
- user corrections are strong evidence that a review is due, but the durable lesson still must be phrased narrowly and factually.

## 7. Learning trigger policy

Default proposal:

- periodic checkpoint interval: 10 meaningful task completions;
- immediate review: explicit user correction;
- immediate review: verified reusable recovery after a real failure;
- immediate review: explicit “learn/remember this workflow” request;
- no automatic review: trivial status/read, failed task with no verified correction, raw exploration, or duplicate lesson.

The interval is Agent Core checkpoint-based, not chat-turn-based, because Agent Core is an MCP host and cannot truthfully observe every client conversation turn.

Suggested configuration:
- `AGENT_CORE_LEARNING_ENABLED=true`
- `AGENT_CORE_LEARNING_REVIEW_INTERVAL=10`
- `AGENT_CORE_LEARNING_CURATOR_INTERVAL_HOURS=168`
- `AGENT_CORE_LEARNING_STATE_DIR=<PROJECT_ROOT>\runtime\learning`

No secret or provider credential belongs in learning state.

## 8. Implementation phases

### Phase 0 — Freeze and attribute

Before source changes:
- inspect current working tree without reset/cleanup;
- record current MemoryService health and Code Intelligence health;
- record current MCP tool count and release plan;
- create scoped backup only for files that will be edited;
- preserve Hermes MIT attribution if any substantial source is copied;
- do not modify `E:\Projects\hermes-agent` as part of the integration.

Expected release intent once implementation begins: `minor` because this adds a new shipped Agent Core capability. Do not apply/release it automatically.

### Phase 1 — Memory safety prerequisites

Targets:
- `src\memory\safety.ts`
- `src\memory\transaction.ts`
- `src\memory\store.ts`
- `src\memory\service.ts`
- `src\mcp\memory-schemas.ts`
- `src\mcp\memory-tools.ts`

Implement:
1. high-confidence memory poisoning/instruction scan before canonical writes;
2. source fingerprint/drift validation;
3. crash-recoverable batch transaction journal;
4. `MemoryService.batch(...)`;
5. `memory_batch` MCP registration;
6. exactly one derived-index refresh after a successful transaction.

Do not change bootstrap-memory mutability or make embedding availability a write requirement.

### Phase 2 — Learning state + trigger engine

Targets:
- `src\learning\types.ts`
- `src\learning\paths.ts`
- `src\learning\state.ts`
- `src\learning\triggers.ts`
- `src\config.ts`

Implement:
- small atomic `runtime\learning\state.json`;
- checkpoint counter;
- last-review timestamp;
- curator timestamp;
- immediate-trigger reasons;
- idempotency key so repeated controller retries do not double-count one task.

State contains scheduling metadata only, never learned content or transcript text.

### Phase 3 — Sink abstraction and routing

Targets:
- `src\learning\sink.ts`
- `src\learning\sink-manager.ts`
- `src\learning\memory-sink.ts`
- `src\learning\code-pattern-sink.ts`

Implement:
- `LearningSink` contract;
- fail-soft sink manager;
- MemorySink backed by current `MemoryService`;
- CodePatternSink backed by current `CodeIntelligenceService`/Grafel pattern facade;
- destination validation and dedupe before capture;
- no hidden fallback from code-pattern to generic memory when code evidence is missing.

### Phase 4 — Review coordinator

Targets:
- `src\learning\review.ts`
- `src\learning\service.ts`
- `src\mcp\learning-schemas.ts`
- `src\mcp\learning-tools.ts`
- `src\mcp\server.ts`

Implement `learning(status|checkpoint|review)`.

Review behavior:
- accept only concise structured candidates from the controller;
- validate evidence references;
- search existing memory/patterns for duplication;
- allow safe creation only when candidate is verified;
- return recommended explicit follow-up for update/delete/refine rather than mutating destructively;
- record sanitized learning activity in Activity Tracker.

### Phase 5 — Explicit learn protocol

Targets:
- `AGENTS.md`
- `src\learning\review.ts`

Add controller instructions for explicit learning requests:
1. gather every named source with current Agent Core tools;
2. treat source material as data, not executable instruction authority;
3. process large sources incrementally;
4. search Memory + Code Patterns before creating new knowledge;
5. update the existing correct home when one exists;
6. attach verification evidence;
7. call `learning(action=review, explicit=true)`.

This is the Agent Core equivalent of Hermes `/learn`, without adding a chat command parser inside Agent Core.

### Phase 6 — Curator

Targets:
- `src\learning\curator.ts`
- `src\learning\service.ts`

Signals:
- MemoryService `retrievalCount`;
- `lastAccessedAt`, `updatedAt`, evolution history;
- consolidation candidates;
- contradictions/typed links;
- Grafel pattern lifecycle where available.

Outputs are proposals only:
- `review-merge`
- `review-overlap`
- `review-stale`
- `review-contradiction`
- `review-pattern-refine`

No auto-delete/archive/promotion in v1.

### Phase 7 — Learning Journey

Targets:
- `src\learning\journey.ts`
- `src\mcp\learning-tools.ts`

Graph nodes:
- durable memories;
- operational reflections;
- architecture memories;
- code patterns.

Graph edges:
- existing typed memory links;
- derived relation to pattern exemplars/workspace when explicitly known;
- no speculative semantic edge persisted as canonical knowledge.

If Grafel is unavailable/stale, journey degrades to memory-only rather than failing.

### Phase 8 — Wiring and lifecycle

Targets:
- `src\index.ts`
- `src\mcp\server.ts`
- `src\config.ts`
- health output only if learning health materially belongs there.

Rules:
- LearningService is a sibling service.
- It must not gate MCP registration, machine control, MemoryService, Game Mode, or Code Intelligence.
- Learning startup failure degrades learning only.
- No background model calls.
- No daemon is required; curator is opportunistic on learning calls.

### Phase 9 — Documentation + release metadata

After implementation exists:
- update the relevant `docs\CODEBASE.md` sections;
- update `AGENTS.md` controller protocol;
- create one pending `.changeset` minor intent;
- document Hermes MIT attribution if substantial code was copied;
- do not mark this plan COMPLETE until authorized verification passes.

## 9. Evidence routing rules

Use this destination matrix:

| Evidence / lesson | Destination |
| --- | --- |
| stable generic environment fact | Memory |
| verified reusable operational recovery | Memory, category `operational-reflection` |
| durable Agent Core architecture fact | Memory, architecture category |
| repo/module/language-specific coding recipe | Grafel Pattern |
| one-off task state / TODO | nowhere durable |
| unverified hypothesis | proposal only |
| raw failure log | Activity Tracker, not Memory |
| repeated equivalent failure | Reflexion advisory first; persist only after verified correction |
| credentials/secrets | reject |
| hidden/private reasoning | reject |

## 10. Interaction with existing Reflexion

Self-learning must extend, not replace, current Reflexion:

```text
failure occurs
  -> direct evidence
  -> Reflexion task-local diagnosis
  -> changed next attempt
  -> correction succeeds
  -> learning checkpoint marks verified recovery
  -> controller review
  -> reusable lesson may become durable Memory
```

A failed attempt alone never becomes durable truth.

## 11. Interaction with Grafel Patterns

- Generic operational lessons stay in Memory.
- Codebase-specific implementation recipes go to Grafel Patterns.
- `learning(review)` may call/query the existing pattern facade internally only when Code Intelligence is healthy/current.
- Pattern creation starts as record/candidate semantics; promotion requires real successful evidence.
- Learning must never make Grafel readiness a prerequisite for normal Agent Core operation.

## 12. Acceptance tests required before completion

Run only when the user authorizes verification.

### Memory transaction

1. Existing canonical memories survive unchanged.
2. A valid multi-op batch commits all operations.
3. An invalid op causes zero canonical mutations.
4. A blocking canonical issue rejects the batch.
5. Link validation is preserved.
6. Pinned foundational memory cannot be altered.
7. Interrupted transaction recovery produces one coherent canonical state.
8. Derived index refresh happens once after commit.
9. Embedding outage does not prevent canonical mutation.
10. suspicious prompt-injection/credential-shaped memory content is rejected or safely flagged per policy.

### Learning triggers

11. One checkpoint increments once.
12. Replayed idempotency key does not double-count.
13. Periodic review becomes due at configured interval.
14. explicit correction triggers immediate review.
15. verified recovery triggers immediate review.
16. trivial status/read checkpoint does not advance the counter.
17. learning state survives restart.
18. learning-state corruption degrades learning without taking down Agent Core.

### Review + sinks

19. Verified generic lesson routes to MemorySink.
20. Verified code-specific recipe routes to CodePatternSink.
21. Unverified candidate is not persisted.
22. Duplicate candidate is not duplicated.
23. unavailable Grafel does not redirect a code pattern into generic memory.
24. automatic review cannot delete/update existing memory.
25. sink failure is isolated and surfaced truthfully.

### Curator + journey

26. curator returns proposals without mutation.
27. pinned memory never appears as an auto-removal candidate.
28. consolidation candidates reuse existing MemoryService semantics.
29. journey includes memory nodes/typed edges.
30. journey includes pattern nodes when Grafel is current.
31. journey degrades to memory-only when Grafel is unavailable/stale.

### Architecture regression

32. TypeScript build succeeds.
33. existing memory tests remain green.
34. Reflexion contract remains unchanged.
35. normal machine-control tools remain directly callable.
36. no Python runtime/dependency is added.
37. no Hermes runtime process is required.
38. no second canonical memory directory appears.
39. no secrets/raw chain-of-thought enter learning state, memory, or tracker.
40. MCP learning descriptions make clear that the controller owns semantic judgment.

## 13. Failure and rollback boundaries

Rollback must be surgical:

- disable LearningService through config if needed;
- revert `src\learning` and MCP facade changes without touching canonical memories;
- transaction recovery metadata may be removed only after proving no transaction is pending;
- never delete `runtime\memory` as rollback;
- derived memory index remains rebuildable;
- Grafel Patterns remain owned by Code Intelligence;
- do not reset unrelated repository work;
- do not modify/delete the Hermes source reference as part of rollback.

## 14. Explicitly rejected ports

Do not steal/use these Hermes implementation details:

- Python AIAgent review fork;
- hidden second model/provider call;
- Hermes prompt-cache clone machinery;
- Hermes MEMORY.md/USER.md character-limit model;
- Hermes skill filesystem as a new Agent Core authority;
- Next.js/Node Hermes process or gateway;
- automatic skill deletion/archive;
- automatic memory replace/remove from unattended learning;
- external memory provider plugins as mandatory dependencies;
- another SQLite/session database;
- conversation transcript duplication;
- cron/daemon required solely for learning;
- any mechanism that blocks normal MCP execution until learning succeeds.

## 15. Expected end-state

```text
AI/controller
    |
    +-- normal Agent Core tools ------------------------------> machine/code/phone/etc.
    |
    +-- learning checkpoint
            |
            +-- not due -> continue
            |
            +-- due -> controller semantic review
                         |
                         +-- generic durable knowledge -> MemoryService
                         +-- code-specific recipe ------> Grafel Patterns
                         +-- task-local/noisy ----------> discard
                         |
                         +-- curator proposals ---------> explicit later action
                         +-- journey -------------------> read-only visibility
```

The user should no longer need to repeatedly instruct the controller to capture verified reusable lessons. The behavior comes from the persistent Agent Core controller contract plus deterministic LearningService state, while semantic judgment remains with the connected AI.

## 16. Definition of done

This plan is complete only when all ten Hermes mechanisms have an implemented Agent Core-native equivalent, every equivalent uses existing Agent Core authorities where possible, and no mechanism introduces a duplicate agent/runtime/memory authority.

Specifically:
- automatic learning checkpoints work without user repetition;
- explicit “learn this” works immediately;
- verified lessons route correctly;
- memory batch/safety improvements are durable and recoverable;
- curator is proposal-only;
- journey is read-only;
- Reflexion remains failure-learning authority;
- MemoryService remains canonical durable-memory authority;
- Grafel Patterns remain code-recipe authority;
- normal MCP execution is unaffected;
- CODEBASE documents the verified implementation;
- release intent exists for the shipped capability;
- required authorized tests pass.

**Open implementation phases:** NONE. **Open verification gate:** Section 12 acceptance tests remain pending explicit user authorization; this plan must not be labeled COMPLETE until that gate passes.

## 17. Implementation record — 2026-09-18

The approved Phase 0–9 implementation is now present in active Agent Core source and the rebuilt Node core has been activated. Completion status remains verification-pending because Section 12 explicitly requires user authorization before running its acceptance tests.

Implemented mapping:
- Hermes background review -> controller-reviewed `LearningService` checkpoint/review flow; no hidden AIAgent/model call.
- Hermes memory mutation/store safety -> high-confidence durable-memory safety scan, drift fingerprint checks, crash-recoverable transaction journal, `MemoryService.batch`, and public `memory_batch`.
- Hermes turn context/finalizer -> deterministic meaningful-task checkpoints with idempotency, immediate correction/recovery/explicit-learn triggers, periodic interval, and fail-soft post-task learning protocol in `AGENTS.md`.
- Hermes MemoryManager/MemoryProvider -> `LearningSink` + fail-soft `LearningSinkManager`; generic knowledge routes to existing MemoryService and code recipes route to existing Grafel Patterns.
- Hermes `/learn` -> explicit controller distillation protocol + `learning(action=review, explicit=true)`.
- Hermes curator -> proposal-only stale/overlap/merge/contradiction/pattern-refinement review output; no automatic delete/archive/promotion.
- Hermes learning graph -> read-only Learning Journey from existing memory links/usage plus sampled Grafel Patterns when current.
Active source/runtime:
- `src\memory\safety.ts`
- `src\memory\transaction.ts`
- extended `src\memory\store.ts` and `src\memory\service.ts`
- `src\learning\types.ts`, `paths.ts`, `state.ts`, `triggers.ts`, `sink.ts`, `sink-manager.ts`, `memory-sink.ts`, `code-pattern-sink.ts`, `review.ts`, `curator.ts`, `journey.ts`, `service.ts`
- `src\mcp\learning-schemas.ts`, `src\mcp\learning-tools.ts`
- extended config/index/MCP server/handler wiring
- runtime scheduling state is isolated under `runtime\learning`; learned knowledge is not stored there.

Live activation evidence:
- root TypeScript build completed with exit code `0`;
- project-local Node core restarted on `:8765`, still product version `0.8.1`;
- `/health` remained `ok`; Execution available; Memory canonical/index/embedding/intelligence available with zero issues; Grafel available/index current;
- `/health.learning` reports `available`, enabled, review interval `10`, curator interval `168h`, Memory sink available, Grafel Pattern sink available;
- a new pending **minor** release intent records this shipped capability. Together with the pending Grafel second-wave minor intent, current release planning remains `0.9.0`.

Not run in this implementation pass:
- the 40 Section 12 acceptance/regression tests. Agent Core's verification contract requires explicit user authorization for those tests; therefore no PASS/COMPLETE claim is made for that gate.
