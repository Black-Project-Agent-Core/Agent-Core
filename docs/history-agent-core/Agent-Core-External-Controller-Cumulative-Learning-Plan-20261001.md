# Agent Core External-Controller Cumulative-Learning Plan — 2026-10-01

**Status: SOURCE IMPLEMENTED — RESIDENT EXTERNAL-CONTROLLER LEARNING — HELD-OUT SESSIONS C/D VERIFIED — EC-8 EVALUATION PASS — EC-9 GRADUATION PASS.**
**Primary controller:** external AI/controller connected through Agent Core MCP (currently ChatGPT).
**Native model/API runtime at this acceptance checkpoint:** excluded from EC acceptance. This is a historical phase boundary, not a current deferred-runtime claim; [Native chat](Agent-Core-Interactive-Agent-Chat-Plan-20261002.md) and [capability parity](../Agent-Core-Native-Agent-Capability-Parity-Plan-20261002.md) subsequently reached their recorded acceptance. See [current architecture](../CODEBASE.md).
**Authority:** exact current source/live evidence outranks this plan.

## 0. Implementation status — 2026-10-01

The EC roadmap is now implemented in source on the external MCP path without adding a model/provider dependency or second semantic store. `src/learning/external-controller.ts` owns bounded derived episode/procedure state under existing `runtime/learning`, while MemoryService remains the canonical semantic knowledge authority.

- **EC-0 source implemented:** every MCP request receives a deterministic hashed external-controller session identity; MCP initialization can append a bounded `CURRENT AGENT CORE CONTEXT` capsule containing the external-controller-first phase, current authority/corrections, reusable operational lessons and unresolved Learning obligations.
- **EC-1 source implemented and Session-B-corrected:** bounded external-controller episodes persist tool outcomes, recalls, failure evidence, verification, artifact use and Learning closure without storing private chain-of-thought. Because one connector transport identity can span multiple ChatGPT chats, `controller_learning episode start` now rotates a new logical episode, persists the transport-to-logical head mapping, links the predecessor, refuses rotation while prior meaningful Learning is still pending, and attributes procedure support/failure to the logical episode rather than the transport fallback ID.
- **EC-2 source implemented:** handled/exception failures across the RDC machine-control wrapper, Grafel provider path, Semantic IDE, Phone and Skills can receive automatic bounded `PRIOR EXPERIENCE` recall from at most three local Memory results. Memory/Learning failures are intentionally not recursively memory-enriched.
- **EC-3 source implemented:** new provider-independent `controller_learning(action=context)` synthesizes current authority, episode evidence, Memory retrieval, supersession/contradiction evidence, Learning Journey Patterns, Skills, learned procedures, prior verified artifact outcomes and evidence gaps. It invokes no native model/provider.
- **EC-4 source implemented:** Memory list/read/search expose additive authority state; `controller_learning(action=artifact_receipt)` generalizes verified use/outcome attribution across Memory, Pattern, Skill and procedure. Retrieval/self-report without external verification does not strengthen trust.
- **EC-5 source implemented:** verified procedure candidates accumulate independent support/failure episode IDs and may materialize through existing SkillService only after at least two verified supports and support > 2x failures; revisions remain staged/evidence-bearing and Skills retain no execution authority.
- **EC-6 source implemented:** MemoryService exposes active/superseded/contradicted authority evidence from canonical links, and bootstrap/context prefer unsuperseded current roadmap/correction records while preserving history.
- **EC-7 source implemented:** meaningful external episodes persist `pendingLearning=true` until a Learning checkpoint; later bootstrap surfaces unresolved prior episode obligations even across a new controller session.
- **EC-8 evaluated PASS:** `controller_learning(action=evaluate)` produced a real four-episode comparison for `ec9-cumulative-learning-acceptance`: 4/4 verified, 0 failed, correctness preserved, 0 repeated failures, and 0 pending Learning. The earlier two-episode baseline used 63 tool calls / 3 tool failures versus 12 tool calls / 1 tool failure for the later held-out pair, yielding `toolCallsPerEpisodeDelta=-25.5`. This is observational cumulative-evaluation evidence only; it does not establish causal intelligence improvement.
- **EC-9 graduation PASS:** Sessions A→B established verified procedure reuse and automatic procedure→Skill materialization; held-out Sessions C and D independently surfaced the materialized Skill, assessed applicability, recorded verification-backed `adapted/success` Skill use, changed diagnostic strategy without repeating the same failed/misapplied operation, preserved verified outcomes, and closed Learning. The complete evidence chain now covers persistent knowledge → fresh-session retrieval → applicability assessment → actual adaptation → changed behavior → verification → attribution → Learning closure. Native model/provider phase transition is not implied by this acceptance result and remains separately governed.

Qualification/resident evidence: the original EC wave built with `npm run build` exit **0** and path policy **290/0**; after restart, `/health=ok` on v0.14.0 reported `externalControllerLearning=available`, `semanticAuthority=memory-service`, `modelProviderRequired=false`, and Session A (`ext-83b7e6d770b328207b6b9a1c0a67876a`) passed the accepted fresh-session checks with one verified procedure candidate. The first Session-B attempt exposed transport/session aliasing; explicit logical rotation fixed that boundary, and successful Session B (`ext-0b02e6103ad7427bb418f7ce9fa6b592`) reused the verified procedure, added the second independent support, and automatically materialized Skill `agent-core-fresh-session-cumulative-learning-accepta` with digest `sha256:b593f651017c2bafafe4ef26b439d09a5c8d5dc447137e9a7349c4630ac68c02`. Lineage investigation confirmed predecessor semantics are active transport/session-head based. Held-out Session C (`ext-f56eaf00d8e445088edd1af1cd741116`) independently surfaced the Skill, adapted it after automatic failure recall, avoided repeating the failed read, verified the changed strategy, recorded verification-backed Skill attribution, and closed Learning. Fresh held-out Session D (`ext-a9a9fb20ba6a4d2f816de12e86a726e1`) used a different variation: `read_file` on a directory returned a non-exception diagnostic telling the controller to use `list_directory`; no automatic PRIOR EXPERIENCE was emitted because the tool recorded success, but the controller still assessed the surfaced Skill as applicable, changed operation from the observed evidence, verified the result, recorded `adapted/success` Skill attribution, and closed Learning without repeating the misapplied operation. EC-8 then compared exactly four meaningful task-family episodes: 4 verified / 0 failed, correctness preserved, repeated failures 0→0, baseline 63 tool calls / 3 failures versus later pair 12 tool calls / 1 failure, artifact uses 2 versus 2, and pending Learning 0 versus 0. This is observational evidence with explicit non-causal limits, but it satisfies the cumulative-evaluation gate and completes the EC-9 graduation evidence chain. Procedure support remains only Session A+B; C/D were not artificially added. No broad regression suite was run.

## 1. Why this plan exists

The observed failure that triggered this plan is itself evidence: Agent Core already had persistent Memory, correct phase guidance in AGENTS.md, Learning, and prior corrections, yet the connected controller still drifted toward native-provider acceptance. That proves storage durability alone is insufficient. The weakness is in authority surfacing, retrieval/reuse orchestration, failure-driven recall, procedural crystallization, and cross-session continuity.

The target is not a memory database. It is a local cognitive substrate that makes the connected external controller measurably harder to derail, less likely to repeat mistakes, more likely to retrieve prior solutions, and progressively better at solving related problems.

Target loop:
observe -> remember -> recall relevant knowledge -> synthesize -> hypothesize -> act -> observe evidence -> fail if necessary -> diagnose -> recall again -> change strategy -> retry -> verify -> crystallize lesson/procedure -> reuse later.

## 2. Product boundary

Agent Core remains the persistent body and local learning substrate. ChatGPT remains the semantic reasoner/controller for the current phase.

Agent Core owns:
- durable local Memory and provenance;
- deterministic retrieval/ranking/evidence surfaces;
- machine/tool execution;
- failure/no-progress evidence;
- Learning lifecycle state;
- procedure/Skill artifact lifecycle;
- Code Intelligence / structural evidence;
- bounded controller continuity and cumulative-evaluation evidence.

ChatGPT/external controller owns:
- semantic interpretation;
- hypothesis formation;
- choosing the next strategy/action within authorization;
- deciding what durable lesson is semantically valid;
- user-facing reasoning/result.

Neither Memory nor learned Skills become independent instruction authority. Existing higher-priority system/safety/user authorization boundaries remain unchanged.

## 3. Current source baseline

Already resident on the external MCP path:
- AGENTS.md is mandatory MCP server instruction and requires Memory-first access before any other Agent Core work.
- Meaningful completed work requires Learning checkpoint/review.
- MemoryService is persistent, local, workspace/provenance-aware, linked, searchable, and exposes retrieval/use evidence.
- FailureLoopAdvisor detects exact repeated failures and same-family no-progress.
- AGENTS.md requires changed strategy after failure and bounded Memory search when stuck.
- LearningService provides checkpoint, review, receipt, curator, and Learning Journey.
- SkillService provides persistent artifact validation/import, evidence-bearing staged revisions, promotion/history/rollback, with executionAuthority=false.
- Activity Tracker and tool invocation evidence provide durable execution/outcome evidence.
- Grafel/Semantic IDE and machine tools provide real inspection/action capability.

Pre-implementation weaknesses confirmed by the latest user correction (the source wave above is intended to close these; resident/fresh-session acceptance is still pending):
- current phase/goal can still be semantically overshadowed by stale or adjacent work even after Memory-first access;
- memory_list is a catalogue, not a deterministic current-authority/context packet;
- failure advisories tell the controller to change strategy but do not attach the most relevant prior lessons automatically;
- knowledge synthesis exists mainly inside NativeAgentController instead of the shared external MCP path;
- repeated verified ChatGPT workflows do not naturally evolve into procedural Skills;
- task/use/outcome evidence is split across Tracker, Memory receipts, Learning, Patterns and Skills;
- missed Learning finalization can remain a controller compliance problem rather than a durable carry-over obligation;
- cumulative evaluation does not yet measure ChatGPT-through-MCP improvement across sessions.

## 4. Architectural rule: no second brain/store

Implementation must extend existing owners:
- MemoryService = canonical durable semantic knowledge;
- LearningService = checkpoint/review/curation/outcome lifecycle;
- Activity Tracker = execution evidence;
- Retrieval ledger = exact recall/use attribution;
- SkillService = procedural artifacts;
- Grafel Patterns = code-specific procedures;
- MCP layer = controller-facing orchestration;
- AGENTS.md = local operating instruction authority.

Do not create a second vector DB, reflection DB, autonomous hidden learner, hidden model, or parallel task agent.

## 5. EC-0 — Current Authority & Session Bootstrap

### Goal
Make the current product phase, active user corrections, unresolved learning obligations, and high-value continuity impossible to miss at the beginning of every Agent Core session.

### Design
Add a deterministic External Controller Context service owned by MCP/Learning, not a model.

It should produce a compact bootstrap packet containing:
1. current phase authority extracted from AGENTS.md;
2. the current active architecture/product Memory record and its supersession chain;
3. latest material user corrections;
4. unresolved meaningful-work Learning obligations;
5. current workspace identity/health;
6. at most 1-3 high-value reusable lessons relevant to Agent Core operation itself.

Do not duplicate full Memory content. Maintain a small derived authority index/pointer inside existing Memory/Learning state that references canonical Memory IDs and source documents.

### Delivery
- inject a bounded CURRENT CONTEXT capsule into MCP server instructions during initialization;
- expose the same data through a read-only controller_context/context action for inspectability;
- memory_list remains backward-compatible; current authority is not hidden inside a giant flat list.

### Correction semantics
- a direct material user correction creates/updates the canonical correction Memory;
- the old state is linked as superseded/contradicted where appropriate;
- bootstrap must prefer the current superseding record;
- historical records remain available but cannot silently outrank the current phase.

### Acceptance
- start a fresh ChatGPT conversation, access Agent Core, ask an ambiguous roadmap question;
- before any project mutation, the controller receives external-controller-first phase context automatically;
- the native-model/runtime phase cannot be selected as the next priority unless the user explicitly changes the phase.

## 6. EC-1 — External Controller Episode Ledger

### Goal
Give Agent Core one bounded view of what the external controller actually did, learned, failed at, corrected, and verified without persisting private chain-of-thought.

### Design
Create an ExternalControllerEpisode service as derived operational state using existing Activity/Learning infrastructure.

Episode fields:
- controller/session correlation ID;
- workspace;
- task/goal summary when explicitly supplied or safely inferable from tool context;
- tool invocation IDs and normalized outcomes;
- Memory retrieval attempt IDs;
- Memory/Pattern/Skill use receipts;
- failures and failure families;
- strategy-change markers/advisories;
- verification refs;
- Learning checkpoint/review disposition;
- procedure/Skill candidates;
- terminal status when known;
- pending-learning flag.

Do not store hidden reasoning. Store only controller-visible summaries, IDs, evidence and state transitions.

### Correlation
- transport identity and logical task-episode identity are separate: modern MCP session/header identity is used when available, while legacy/stateless transport still degrades to bounded caller/time-window correlation;
- because the same connector transport can span multiple ChatGPT chats/tasks, `controller_learning episode start` explicitly rotates a fresh logical episode and persists a transport->logical head mapping;
- `predecessorEpisodeId` is defined by the active logical head for the current transport/session identity at rotation time: `activeEpisodeId(state, sessionId)` resolves `sessionHeads[sessionId] ?? sessionId`; it is not a `taskFamily` predecessor lookup;
- before a transport has a `sessionHeads` mapping, bootstrap/tool activity can create a valid transport-root episode whose ID equals the transport-derived session ID; after rotation, the mapping points that transport ID at the new logical head;
- rotation refuses to abandon a prior meaningful episode while its Learning is still pending, and all subsequent tool/failure/receipt/procedure attribution resolves through the active logical episode;
- therefore a valid intermediate transport-root/repair episode may correctly be the predecessor of a later task-family episode even when an older verified episode exists for the same `taskFamily` on another transport/head chain;
- every existing tool wrapper can therefore retain one stable transport identity without falsely counting multiple chats as one independent procedure-support episode.

### Acceptance
- after a meaningful multi-tool task, one read-only episode view traces recall -> action -> failure/success -> verification -> Learning;
- restarting ChatGPT or Agent Core does not erase completed episode evidence;
- secrets and full raw tool payloads are not copied into the episode ledger.

## 7. EC-2 — Automatic Failure -> Prior-Knowledge Enrichment

### Goal
Make prior experience arrive when it matters instead of relying on ChatGPT to remember to call memory_search.

### Design
Extend FailureLoopAdvisor through a sibling FailureLearningCoordinator with bounded read-only access to MemoryService and episode context.

On a material first failure:
- normalize failure family;
- build a sanitized query from tool name + failure family + workspace + relevant current evidence;
- retrieve at most 1-3 durable operational lessons;
- append a compact PRIOR EXPERIENCE capsule to the failure result with Memory IDs, summaries, provenance/trust and retrieval attempt IDs.

On repeated/no-progress failure:
- broaden the query with changed arguments/strategy evidence;
- surface prior successful correction, known dead end, or explicit absence of relevant Memory;
- continue to require a changed strategy.

Rules:
- retrieval is evidence, not instruction authority;
- do not execute a recalled fix automatically;
- do not repeat equivalent failed action;
- do not recursively query Memory for Memory/Learning failures;
- cap size/frequency to prevent context flooding.

### Acceptance
- reproduce a known failure family from a prior verified recovery;
- the relevant failure response contains the prior lesson before another blind retry;
- a held-out failure with no relevant lesson explicitly reports that no prior matching experience was found.

## 8. EC-3 — Shared Knowledge Synthesis Context

### Goal
Give ChatGPT the same cross-source synthesis substrate already prototyped for NativeAgentController, without invoking a native model.

### Refactor
Move/refactor deterministic portions of agent-knowledge-synthesis into a provider-independent Learning/Context service.

Inputs:
- current episode evidence/failure;
- canonical Memory retrieval results;
- Memory links such as supports / contradicts / derived-from / supersedes;
- Grafel Patterns and structural relationships when code is relevant;
- active Skills/procedure candidates;
- prior verification-backed artifact outcomes;
- unresolved contradictions;
- evidence gaps.

Output is a bounded structured packet containing:
- known facts;
- current phase/constraints;
- relevant prior lessons;
- contradictions;
- failed approaches/dead ends;
- successful prior corrections;
- relevant procedures/Skills;
- evidence gaps;
- candidate evidence worth inspecting next.

Agent Core does not generate the hypothesis. ChatGPT uses the deterministic packet to form hypotheses and choose actions.

Expose this through Learning/MCP, for example a context/synthesize action, not through /agent/run.

### Acceptance
- a difficult issue with relevant Memory + Grafel + prior failure evidence yields one inspectable packet containing all three;
- current superseding facts are clearly distinguished from stale history;
- no model/provider/API call occurs inside synthesis.

## 9. EC-4 — Knowledge Use & Outcome Attribution

### Goal
Distinguish stored knowledge from knowledge that actually improved or harmed a real ChatGPT task.

### Extend existing receipts
Generalize the existing Memory-use receipt concept to Memory, Grafel Pattern, Skill, and learned procedure.

Each declaration records:
- artifact ID/digest;
- retrieval/context episode;
- applied / adapted / rejected;
- bounded reason code;
- task/episode ID.

Only external verification evidence may produce success/failure reinforcement.

Rules:
- retrieval alone = zero reinforcement;
- model self-report alone = zero reinforcement;
- verified success may strengthen salience/procedure support;
- verified failure may add negative support/refinement pressure;
- historical failures remain inspectable.

### User corrections
A material user correction is first-class outcome evidence. It must link the incorrect prior decision/knowledge to the correction and influence later retrieval/synthesis.

### Acceptance
- trace one future task from Memory retrieval -> declared use -> action -> verification -> outcome receipt;
- a retrieved-but-unused Memory gets no positive reinforcement;
- a user correction changes future surfaced context.

## 10. EC-5 — Verified Procedure -> Skill Evolution

### Goal
Make repeated successful ChatGPT workflows become reusable procedural memory automatically but conservatively.

### Learning candidate
Add a first-class procedure candidate to Learning review with:
- name/description;
- ordered steps;
- relevant/allowed tools;
- reuse condition;
- evidence refs;
- supporting episode IDs;
- failure episode IDs;
- provenance.

Lifecycle:
verified episode -> procedure candidate -> repeated independent verified support -> staged Skill/import -> active use -> reinforcement/refinement -> rollback/degrade when evidence worsens.

Safety:
- one success does not automatically create a trusted active Skill;
- require at least two independent verified supports by default;
- negative evidence blocks promotion when support is weak;
- existing SkillService revision/rollback remains owner;
- Skill has no independent machine execution authority.

Code-specific procedures continue to route to Grafel Patterns when appropriate; general workflows route to SkillService.

### Acceptance
- complete the same reusable workflow successfully in two independent ChatGPT tasks;
- procedure reaches evidence threshold and becomes a Skill/revision candidate;
- a later related task surfaces that Skill in shared context;
- verified failure against the Skill generates refinement/degradation evidence rather than silent continued trust.

## 11. EC-6 — Memory Authority, Contradiction & Consolidation

### Goal
Prevent a large durable Memory corpus from becoming a source of stale/conflicting context.

### Changes
- define deterministic current/superseded relationship handling in retrieval projection;
- boost current direct user corrections and current phase records without turning Memory into instruction authority;
- curator proposes stale/superseded/contradictory consolidation;
- preserve old records for audit;
- bootstrap/synthesis shows the current record plus bounded conflict history, not every historical version.

### Derived current-authority index
Maintain only pointers/IDs and timestamps in derived state; semantic content stays canonical in Memory.

### Acceptance
- create old state A, then a user correction B superseding A;
- a fresh external session surfaces B as current and marks A historical/superseded;
- the controller does not choose A as the current roadmap;
- rollback/audit can still inspect A.

## 12. EC-7 — Durable Learning Finalization Recovery

### Goal
Address the known limitation that a third-party controller can technically finish a user answer without calling Learning finalization.

Agent Core cannot hard-block ChatGPT's UI response. Do not pretend otherwise.

Instead:
- episode ledger marks meaningful work when mutation, verified recovery, material investigation, or other configured meaningful evidence occurs;
- Learning checkpoint closes the learning obligation;
- if a session/episode ends or goes idle with meaningful work but no checkpoint, persist a pending-learning obligation with bounded evidence refs;
- next MCP bootstrap prominently surfaces unresolved obligations;
- ChatGPT can review/finalize them before new meaningful work.

Optional deterministic fallback:
- Agent Core may create a metadata-only pending checkpoint record from observed episode evidence;
- it must not create semantic lesson content without controller review.

### Acceptance
- simulate meaningful work without a Learning checkpoint;
- a fresh ChatGPT session receives the pending-finalization capsule automatically;
- after checkpoint/review, the obligation disappears idempotently.

## 13. EC-8 — External Cross-Session Cumulative Evaluation

### Goal
Prove Agent Core makes ChatGPT-through-MCP better over time rather than merely accumulating notes.

Metrics derived from external episodes:
- verified task success/correctness;
- total problem-solving tool calls;
- tool failures;
- equivalent/repeated failure count;
- strategy/no-progress advisories;
- time/tool-count to first useful evidence;
- Memory/Pattern/Skill recalls;
- applied/adapted/rejected uses;
- verified reuse success rate;
- user correction rate;
- pending-learning escape rate;
- procedure/Skill reuse success;
- unsupported completion claims when detectably contradicted by verification evidence.

Evaluation method:
- controlled related-task cohorts;
- optional baseline/no-reuse mode only when explicitly authorized;
- normal cumulative-reuse mode;
- held-out related tasks;
- compare correctness first, efficiency second.

Graduation requires repeatable advantage with correctness preserved. Larger Memory size alone is not an intelligence metric.

## 14. EC-9 — Hard-Problem Persistence / Knowledge-Synthesis Acceptance

### Goal
Demonstrate the requested behavior: difficult problems become more solvable because Agent Core connects old failures, facts, dependencies, procedures and new evidence.

Required acceptance scenario:
1. task begins with incomplete evidence;
2. relevant prior lessons are surfaced automatically;
3. first attempt fails;
4. failure produces new evidence plus automatic prior-knowledge enrichment;
5. ChatGPT changes strategy materially;
6. shared synthesis connects current evidence with prior Memory/Pattern/Skill;
7. solution is independently verified;
8. reusable lesson/procedure is captured;
9. a fresh later session receives and reuses it;
10. a held-out related task shows fewer repeated dead ends while maintaining correctness.

This is the graduation test for the current phase. Native provider execution is irrelevant to this acceptance.

## 15. Implementation order

Wave A — continuity first:
1. EC-0 Current Authority & Session Bootstrap.
2. EC-1 External Controller Episode Ledger.

Wave B — failure must learn:
3. EC-2 Automatic Failure -> Prior-Knowledge Enrichment.
4. EC-3 Shared Knowledge Synthesis Context.

Wave C — outcome must change future behavior:
5. EC-4 Knowledge Use & Outcome Attribution.
6. EC-6 Memory Authority / Contradiction / Consolidation.

Wave D — procedures must compound:
7. EC-5 Verified Procedure -> Skill Evolution.
8. EC-7 Durable Learning Finalization Recovery.

Wave E — prove cumulative advantage:
9. EC-8 External Cross-Session Evaluation.
10. EC-9 Hard-Problem Persistence acceptance.

Do not move to native-model-runtime acceptance merely because these components compile. The current phase closes only after EC-9 evidence demonstrates cumulative advantage for the external controller.

## 16. Donor grounding map

Use pinned donor source only for concrete gaps:
- Hermes Agent: post-task review, Memory/Skill crystallization, session continuity;
- SAKU: reflection/journal/principle consolidation;
- CortexPrism: successful sequence -> procedural skill lifecycle;
- TELL: experiential hypothesis/testing memory;
- Hindsight: outcome-aware retain/recall and what-worked/failed semantics;
- AutoMemory: evaluate failure -> change strategy -> experiment again;
- skillmem: zero reinforcement on retrieval/self-report; evidence-based reinforce/decay;
- OpenViking: inspectable memory/knowledge/skill context organization;
- MemOS: memory feedback/correction/cross-task skill reuse.

Adoption rule:
inspect exact donor source -> compare existing Agent Core owner -> extract smallest mechanism -> implement natively -> verify on external MCP path -> retain/retire reference by evidence.

Additional helper/tool installation is allowed when a concrete mechanism cannot be implemented cleanly with the current project-local stack. Any helper must be scoped/project-local, source-inspected, documented, and must not silently become a second canonical Memory/runtime.

## 17. Non-goals

- Do not prioritize Atria/Gonka/OpenRouter acceptance in this phase.
- Do not require a native model to make Agent Core learn.
- Do not add a hidden reflection agent/model.
- Do not persist chain-of-thought.
- Do not execute recalled Memory automatically.
- Do not treat Memory retrieval as proof of use.
- Do not treat more stored notes as proof of intelligence.
- Do not grant Skills independent execution authority.
- Do not weaken existing user authorization, verification, release, restart, or destructive-action boundaries.

## 18. Definition of done for this phase

Agent Core body is ready to hand off to a future native model runtime only when a fresh external ChatGPT session can reliably demonstrate:
- current phase/context appears automatically and correctly;
- relevant prior knowledge appears at task start or failure without relying on luck/manual recollection;
- stale/superseded knowledge is clearly demoted;
- repeated equivalent mistakes are avoided;
- hard failures trigger bounded prior-experience recall and materially changed strategy;
- evidence from current work is linked to prior knowledge;
- verified outcomes update future retrieval/reuse confidence;
- repeated workflows become reversible evidence-backed Skills;
- missed Learning obligations survive session boundaries;
- later sessions reuse lessons/procedures from earlier sessions;
- controlled held-out tasks show cumulative advantage with correctness preserved.

Only after this evidence exists should native API-key/local-model runtime become the next primary phase.

## 19. Source ownership map

EC-0 Current Authority / Bootstrap:
- `AGENTS.md` — current local operating authority;
- `src/mcp/agent-protocol.ts` — mandatory instruction loading;
- `src/mcp/handler.ts` / `src/mcp/server.ts` — per-connection context delivery;
- `src/memory/service.ts` / search projection — current/superseding Memory selection;
- `src/learning/state.ts` — unresolved learning obligations.

EC-1 Episode Ledger:
- `src/mcp/handler.ts` / `src/mcp/server.ts` — connection/session correlation;
- `src/tracker/activity-tracker.ts` and `src/tracker/tool-invocation.ts` — execution evidence;
- existing Learning state for bounded durable episode/finalization linkage.

EC-2 Failure -> Recall:
- `src/mcp/failure-loop-advisor.ts` — failure normalization/no-progress evidence;
- `src/memory/service.ts` — bounded retrieval;
- MCP tool wrapper in `src/mcp/server.ts` and Memory tool wrapper for enrichment delivery.

EC-3 Shared Synthesis:
- refactor deterministic logic from `src/agent-knowledge-synthesis.ts` into a provider-independent Learning/context owner;
- `src/learning/journey.ts` — Memory/Pattern neighborhood;
- `src/skills/service.ts` — active procedures/Skills;
- Code Intelligence service for structural evidence when workspace/code context requires it.

EC-4 Use/Outcome Attribution:
- `src/memory/retrieval-ledger.ts` — existing Memory recall/use evidence;
- `src/learning/service.ts`, schemas and MCP tools — generalized artifact receipts;
- Activity Tracker feature/outcome envelope for externally verified results.

EC-5 Procedure -> Skill:
- Learning candidate/review types;
- `src/skills/service.ts` and skills MCP tools;
- Grafel Pattern sink for code-specific procedures;
- existing revision/history/rollback instead of a new skill database.

EC-6 Authority / Consolidation:
- Memory links/evolution/retrieval projection;
- Learning curator;
- derived current-authority pointer state only, never duplicate semantic content.

EC-7 Missed Finalization Recovery:
- MCP connection/episode lifecycle;
- Learning state/triggers;
- agent protocol/bootstrap capsule.

EC-8/EC-9 Evaluation:
- Activity + episode evidence;
- Memory use receipts;
- Learning outcomes;
- existing MCP effectiveness evaluation concepts, extended to cross-session cumulative reuse.

## 20. Verification discipline for implementation

Per wave, use the narrowest verification required by the changed owner. Do not run broad regression suites unless the user authorizes them.

Required evidence before calling a wave complete:
- source-level readback of changed behavior;
- build/typecheck when source activation requires it;
- structural review for public MCP schemas/tool wiring/callable changes;
- targeted tests for the exact new behavior when authorized;
- resident restart/readback only when activation actually requires it and the user authorizes restart;
- CODEBASE.md + MEMORY.md + canonical Memory updated to the same status.

Do not label an EC wave COMPLETE from documentation alone.
