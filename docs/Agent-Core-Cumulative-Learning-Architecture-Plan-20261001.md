# Agent Core Cumulative-Learning Architecture Plan — 2026-10-01

**Status: HISTORICAL DESIGN / SECONDARY MECHANISM REFERENCE.** The [external-controller roadmap](history-agent-core/Agent-Core-External-Controller-Cumulative-Learning-Plan-20261001.md) graduated through EC-9; it is no longer an open implementation sequence. [Native chat](history-agent-core/Agent-Core-Interactive-Agent-Chat-Plan-20261002.md) and [capability parity](Agent-Core-Native-Agent-Capability-Parity-Plan-20261002.md) subsequently reached their recorded acceptance. Current shared-owner behavior is described by [Product Direction](Agent-Core-Product-Direction.md), [Cumulative Workflow](Cumulative-Workflow-Implementation-20261006.md), [Self-Improvement](Agent-Core-Self-Improvement-Execution-20261007.md) and [CODEBASE](CODEBASE.md). The phase-specific gaps and deferred-native wording below are dated design evidence, not current source absence claims.
**Authority:** exact current Agent Core source/live state outranks this plan.
**Historical phase authority — 2026-10-01, superseded for current sequencing:** the acceptance subject for the current phase is the connected external AI/controller (currently ChatGPT) operating through Agent Core MCP. Agent Core is the persistent local body/tooling/Memory/Learning substrate that should make that controller progressively better across work. Native model/provider execution through `/agent/run` is a later phase and is not a prerequisite, blocker, or current success criterion.
**Target:** make Agent Core behave as a persistent cumulative-learning problem solver, not merely an autonomous tool executor with memory.

## 1. Target operating loop

USER TASK -> recall relevant local knowledge -> synthesize current facts + prior experience + procedures -> form explicit hypothesis / next experiment -> act through existing Agent Core tools -> observe tool/result evidence.

On success: verify -> learn -> crystallize -> reuse later.
On failure: diagnose -> retrieve again -> change strategy -> retry differently.

Target lifecycle:
observe -> remember -> search old knowledge -> hypothesize -> act -> fail -> diagnose -> retry differently -> verify -> crystallize lesson -> reuse next time.

## 2. Non-negotiable architecture boundaries

- Reuse existing MemoryService as the durable knowledge authority; do not create a second Memory.
- Reuse LearningService for checkpoint/review/curation and accepted semantic capture.
- Reuse Grafel Patterns for codebase-scoped implementation recipes.
- Reuse SkillService for procedural artifacts, revision staging, promotion, rollback and export.
- Reuse existing MCP/tool authority; Native Agent Runtime must not duplicate RDC, auth, grants or machine-control routing.
- NativeAgentController owns when task lifecycle transitions happen.
- The active model owns semantic hypothesis/diagnosis proposals, but never becomes the identity or authority of Agent Core.
- Verification evidence outranks model confidence.
- Persist structured task facts, evidence, summaries and decisions; never persist hidden chain-of-thought.
- Provider failover and problem-solving strategy retry are separate mechanisms.
- All learned procedures remain reversible and evidence-linked.
- No autonomous release/commit/push/deploy/restart authority is introduced.

## 3. Source baseline recorded on 2026-10-01

Already present and should be extended, not replaced:
- Native Agent Controller with mandatory agent_core_finalize.
- Memory-first fusion retrieval before model work.
- Persistent runtime session/task/finalization state.
- Learning checkpoint/review with Memory and Grafel Pattern sinks.
- Memory retrieval attempt ledger and verified use receipts.
- Learning curator for stale/contradiction/overlap/feature-outcome review proposals.
- Learning journey graph across Memory and Grafel Patterns.
- Skill catalog with evidence-bearing staged revisions, promotion, rollback and export.
- OpenAI-compatible provider pool with named Atria/Gonka/OpenRouter routes and numbered key pools.
- Grafel structural graph and Semantic IDE as evidence sources.
- Native controller now persists bounded task episodes and requires an explicit strategy/hypothesis before ordinary tool use.
- Tool failures now produce failure/diagnosis episodes, targeted adaptive Memory re-retrieval, and a materially changed strategy requirement; exact failed tool+argument retries are blocked.
- Knowledge synthesis now combines current task evidence, Memory neighborhood, accepted Patterns, Skills, learned procedures, contradictions, evidence gaps, and prior verification-backed artifact outcomes.
- Memory reuse keeps its existing retrieval/use receipt authority; procedure/Skill/Pattern use is separately declared and only verification-backed outcomes can reinforce/degrade procedural confidence.
- Procedure candidates accumulate independent verified support/failure task identities; failure-aware readiness gates Skill import/revision staging, while SkillService remains artifact-only with executionAuthority=false.
- Native cumulative evaluation now reports correctness/efficiency plus verification coverage and Memory/artifact attribution metrics. Controlled cross-session comparative evidence is still pending.

## 3.1 Historical primary acceptance path — external AI/controller through MCP

Already resident for ChatGPT/other connected controllers:
- `AGENTS.md` is mandatory MCP server instruction and requires Memory-first access before any other Agent Core work.
- Meaningful work requires Learning checkpoint/review finalization at controller level.
- MemoryService is persistent/local, workspace-aware, provenance-aware, linked, searchable and exposes exact retrieval/use evidence.
- FailureLoopAdvisor detects repeated equivalent failures and same-family no-progress, returning sanitized Reflexion advisories to the controller.
- The operating contract requires changed strategy after failure and bounded `memory_search` of durable lessons when progress is stuck.
- LearningService provides checkpoint, semantic review, use receipts, curator proposals and Learning Journey over Memory + Grafel Patterns.
- Skills are persistent artifact-only procedural memory with evidence-bearing revisions, promotion/history/rollback and no independent execution authority.
- Agent Core exposes real machine action through files, terminal/processes, browser, Semantic IDE, Grafel, phone and other MCP surfaces.

Current external-controller gaps relative to the requested end state:
1. failure-triggered re-retrieval is contract/advisory-driven; the MCP layer does not yet automatically attach a bounded relevant-Memory capsule to failure evidence;
2. deterministic knowledge synthesis across current failure + Memory + Patterns + Skills + prior outcomes exists in native-runtime code but is not yet exposed as a shared MCP/Learning context surface for ChatGPT;
3. procedure/Skill extraction and reinforcement are not yet end-to-end on the external-controller path; SkillService exists, but external ChatGPT work does not automatically turn repeated verified workflows into staged Skills;
4. external-controller task episodes/outcome attribution are split across Activity Tracker, Memory receipts and Learning checkpoints rather than one bounded task-episode view;
5. cumulative-intelligence evaluation is currently native-task-oriented; the external-controller path still needs evidence-based cross-session evaluation from Activity + Memory receipts + Learning outcomes;
6. Learning finalization is mandatory server instruction and advisory state, but Agent Core cannot technically prevent a third-party controller from emitting a user-facing answer if that controller ignores MCP instructions. For ChatGPT in this project, the operating contract is enforced by the connected controller instructions.

Therefore the current priority is **EC-1..EC-5 external-controller completion**, not real-provider acceptance:
- EC-1 shared external knowledge-context/synthesis surface;
- EC-2 deterministic failure -> bounded Memory re-retrieval capsule;
- EC-3 external verified procedure -> Skill lifecycle;
- EC-4 unified external task/use/outcome evidence view;
- EC-5 external cross-session cumulative-learning evaluation.

## 4. CL-0 — DEFERRED NATIVE MODEL RUNTIME

Goal: preserve the existing native provider/runtime foundation for a later phase. It is not the current cumulative-learning acceptance path. The current controller is the external AI connected through Agent Core MCP.

Implementation scope:
- Enable Native Agent Runtime only after provider/tool grants are intentionally configured.
- Read Atria/Gonka/OpenRouter numbered key pools through existing config; never surface key contents.
- Keep provider order configurable; retain provider affinity and bounded provider failover.
- Configure an explicit minimum tool grant needed for the acceptance task; do not grant all tools blindly.
- Run one real native task through Memory recall -> model -> existing MCP tool -> evidence -> agent_core_finalize -> Learning finalization.

Acceptance:
- health.agentRuntime=available.
- At least one real provider route is configured and usable.
- Tool use succeeds through existing MCP authority.
- Final user response is impossible before runtime-owned Learning finalization.
- Provider or key failure does not corrupt task/Learning state.

Deferred native-runtime evidence (2026-10-01): user-authorized launcher `restart-core` moved Core PID **15036 -> 12036** while tunnel PID **2844** remained unchanged. `/health=ok` on v0.14.0 reports `agentRuntime=available`, `providerCount=3`, `configuredProviderCount=3`, zero sessions and zero pending finalizations. The loaded `.env` uses provider order `atria,gonka,openrouter` with deliberately minimal model tool grant `get_config`; safe metadata previously counted 18 populated numbered keys for each provider without exposing values. This runtime may remain resident as later-phase groundwork, but no real-provider task acceptance is required or prioritized during the current external-controller cumulative-learning phase.

**Interpretation of CL-1..CL-9 below:** these sections describe cumulative-learning mechanics, several of which are already implemented inside `NativeAgentController`. During the current phase they are **donor implementations inside Agent Core itself**: reuse/refactor their deterministic storage, synthesis, attribution and evaluation mechanisms into shared MCP/Learning services so ChatGPT receives the benefit while remaining the active reasoning controller. Native-model execution is not the acceptance subject.

## 5. CL-1 — SOURCE IMPLEMENTED; BUILD VERIFIED; RESIDENT ACCEPTANCE PENDING

Goal: give the native controller a bounded, persistent representation of problem-solving progress.

Extend existing runtime task state with structured episode data: goal/task summary; observations/evidence refs; attempted strategies; normalized tool outcomes; failure class/signature; hypotheses; retrieval attempt IDs; memories/procedures used; verification results; learned candidate IDs.

Do not persist raw private reasoning. Store only controller-visible structured summaries required for reuse, audit and retry control.
Required episode events:
task-start, recall, hypothesis, action, observation, failure, diagnosis, strategy-change, verification, finalization.

Each event carries timestamp, bounded summary, evidence refs when applicable, source/tool identity and strategy fingerprint when applicable.

Acceptance:
- task can reopen after process restart without losing terminal/finalization state or bounded episode evidence;
- duplicate writes are idempotent;
- no secret/tool credential is persisted.

## 6. CL-2 — SOURCE IMPLEMENTED; BUILD VERIFIED; RESIDENT ACCEPTANCE PENDING

Goal: Memory must be searched not only at task start, but again when new evidence changes the problem.

Trigger targeted re-retrieval on verified/tool failure, verification mismatch, contradiction, repeated no-progress, newly discovered symbol/entity/dependency, user correction or strategy exhaustion.

Build each re-retrieval query from: goal + latest failure + relevant evidence + entities/files + prior failed strategy.

Rules:
- do not blindly repeat the initial query;
- deduplicate already-seen Memory unless new evidence justifies reuse;
- prefer workspace-scoped memories when a workspace exists;
- retain retrieval attempt IDs for later use receipts;
- historical Memory remains evidence/context, never executable instruction authority.

Acceptance: a failure deterministically causes a second Memory search when relevant; the second query reflects new evidence; returned knowledge is classified applied/adapted/rejected.
## 7. CL-3 — SOURCE IMPLEMENTED; BUILD VERIFIED; RESIDENT ACCEPTANCE PENDING

Goal: implement the 'connect the whole problem' behavior from the product target.

Before selecting the next strategy, synthesize a bounded packet from current goal, current observations/failures, relevant canonical Memory, Memory-use history, Grafel structural relationships, accepted Grafel Patterns, active Skills and verification constraints.

The synthesis result is structured, not hidden reasoning:
- known facts;
- unresolved contradictions;
- evidence gaps;
- candidate hypotheses;
- expected observable result for each hypothesis;
- cheapest/highest-information next experiment;
- memories/patterns/skills supporting or contradicting each hypothesis.

Acceptance: hypotheses cite evidence or are labeled unsupported; contradictions remain visible; next experiment has an expected checkable result.

## 8. CL-4 — SOURCE IMPLEMENTED; BUILD VERIFIED; RESIDENT ACCEPTANCE PENDING

Goal: make retry differently a runtime invariant instead of a prompt suggestion.

Failure classes: tool/runtime failure, invalid/insufficient evidence, verifier failure, hypothesis disproved, no-progress/stall, contradictory knowledge, provider/model transport failure.

On semantic/problem-solving failure: capture evidence -> classify -> re-retrieve if useful -> synthesize alternatives -> compute strategy fingerprint -> refuse equivalent retry without materially new premise -> execute different experiment -> verify.

Provider transport failures use provider/key failover and do not count as semantic strategy failures unless task evidence changed.
Stop conditions: verified success; explicit user stop; no safe/authorized next action; bounded strategy budget exhausted; required verification unavailable.

Acceptance: equivalent failed actions are not blindly repeated; each retry records what changed and why; budget exhaustion ends as explicit failure, never fake success.

## 9. CL-5 — SOURCE IMPLEMENTED; BUILD VERIFIED; RESIDENT ACCEPTANCE PENDING

Goal: prove that recalled knowledge affected the task and whether it helped.

Use the existing Memory use-receipt mechanism for every meaningful reused Memory item:
- applicability = applied / adapted / rejected;
- result = success / failure / unavailable;
- verification ref for success/failure;
- reason code and bounded summary.

Add equivalent bounded usage evidence for Grafel Patterns and procedural Skills through Learning/Activity Tracker rather than a second semantic store.

Use outcomes to drive retrieval salience, curator proposals, contradiction/refinement candidates and procedure promotion/decay decisions.

Rules: retrieval alone is not evidence of usefulness; model self-report is insufficient; successful attribution requires observable verification.

Acceptance: a reused lesson is traceable retrieval -> use -> action -> verification; failed reuse can reduce future trust or trigger refinement without deleting history.

## 10. CL-6 — SOURCE IMPLEMENTED; BUILD VERIFIED; LIVE PROCEDURE-REUSE ACCEPTANCE PENDING

Goal: successful multi-step behavior becomes reusable procedural knowledge.
Two destinations:
- code-specific implementation recipes -> existing Grafel Patterns;
- general reusable workflows -> existing SkillService artifacts.

Extraction triggers: verified recovery with reusable correction; repeated successful sequence across related tasks; user-confirmed reusable procedure; curator finding a stable repeated workflow.

Promotion lifecycle:
episode -> candidate procedure -> evidence review -> staged revision -> repeated verified use -> promote -> monitor -> refine/rollback.

Default safety:
- one successful task may create Memory/reflection or a staged procedure candidate;
- automatic active Skill promotion requires repeated independent verified success and no unresolved contradictory failure;
- Skill revision retains evidence refs and previous digest;
- rollback remains available;
- Skill artifacts do not gain independent machine execution authority.

Native controller skill use:
- retrieve relevant active skills before/during synthesis;
- expose bounded procedural guidance to the model;
- actual actions still execute only through granted Agent Core MCP tools.

Reinforcement/decay:
- verified successful use strengthens the procedure;
- adaptation creates a refinement candidate;
- repeated verified failure triggers review/staging, not silent mutation;
- unused/low-confidence procedures become curator review candidates, not automatic deletion.

Acceptance: at least one procedure can be learned from a verified task, staged, promoted after evidence, reused in a new task and rolled back safely.
## 11. CL-7 — SOURCE IMPLEMENTED; BUILD VERIFIED; RESIDENT ACCEPTANCE PENDING

Goal: make knowledge quality improve over time without a hidden second agent.

Use existing Learning checkpoint/review/curator as the owner.

After meaningful finalization: capture only verified durable facts/reflections/procedures; deduplicate; preserve corrections/supersession; update contradiction links; generate curator proposals for stale, overlap, contradiction and weak patterns.

Periodic/idle curation may propose merge, refine, supersede, archive/review or procedure refinement. It must not autonomously execute machine actions, releases or destructive cleanup.

## 12. CL-8 — SOURCE IMPLEMENTED; BUILD VERIFIED; RESIDENT ACCEPTANCE PENDING

Goal: connect separate past incidents into a stronger reusable model of the problem domain.

Extend Learning Journey usage so the controller can request a bounded knowledge neighborhood: related Memory nodes, typed links, accepted patterns, procedure evidence and recent positive/negative use outcomes.

For hard tasks ask explicitly: what similar problem happened before; what failed and why; what correction succeeded; what evidence changed the diagnosis; what dependencies connect the incidents; what remains uncertain.

Acceptance: cross-session knowledge influences a new task without replaying full chat history; conflicting old knowledge remains visible with provenance.

## 13. CL-9 — EVALUATOR SOURCE IMPLEMENTED; CONTROLLED CROSS-SESSION EVALUATION PENDING

Goal: prove Agent Core becomes more effective because of learned knowledge.

Metrics: correctness, verified success rate, problem-solving tool calls, repeated failed action count, retries before solution, time to first useful hypothesis, Memory/procedure reuse success, unsupported-claim count and final verification quality.
Run paired/held-out variants: baseline/no-reuse versus normal cumulative reuse, only when explicitly authorized.

Graduation criterion:
- reuse preserves correctness;
- repeatable improvement appears in at least one efficiency/problem-solving metric;
- unsupported success claims do not increase;
- cross-session reuse succeeds on unseen-but-related tasks.

## 14. Donor mechanism audits — only for concrete gaps

Do not import whole agent runtimes. Inspect donors source-first only when an OPEN phase has a concrete mechanism gap.

Priority comparison from the user-defined target:
- Hermes: post-task review, Memory/Skill crystallization and procedural reuse.
- SAKU: autonomous reflection/journal/knowledge growth.
- CortexPrism: successful tool-sequence -> procedural skill extraction.
- TELL: runtime experiential learning through hypothesis/testing.
- Hindsight: outcome-aware memory that learns what worked/failed.
- AutoMemory: experiment/evaluate/change-strategy loop.
- MemOS / skillmem / OpenViking: cross-task skill reuse, reinforcement/decay and inspectable memory+knowledge+skills when needed.

Adoption rule:
inspect exact donor mechanism -> compare current Agent Core owner -> extract minimal principle -> implement natively -> verify -> retire/retain reference by evidence.

## 15. Proposed implementation order

1. CL-0 real provider + tool-grant acceptance.
2. CL-1 task episode/evidence state.
3. CL-2 adaptive re-retrieval.
4. CL-4 retry-differently controller.
5. CL-3 knowledge synthesis packet.
6. CL-5 use attribution/reinforcement.
7. CL-6 procedure/Skill evolution.
8. CL-7 curation/reflection integration.
9. CL-8 long-horizon synthesis.
10. CL-9 cumulative-intelligence evaluation.

Reason: Agent Core must first produce trustworthy episodes and materially different retries before promoting those experiences into durable procedures.

## 16. End-state definition

Agent Core reaches the requested target only when live native-runtime tasks demonstrate all of these:
- a new task retrieves relevant prior local knowledge;
- an initial failed attempt is captured as evidence;
- failure triggers materially different re-retrieval/diagnosis;
- the next strategy differs for an evidence-grounded reason;
- a hypothesis is experimentally checked;
- final success is independently verified;
- a reusable lesson/procedure is captured through Learning;
- later related work reuses that knowledge with an attributable receipt;
- repeated verified use can evolve a procedure/Skill;
- cross-session evaluation demonstrates measurable advantage without reducing correctness.

Until those conditions are evidenced, describe Agent Core as cumulative-learning capable, not as a fully demonstrated cumulative-learning agent.

## 17. Explicit non-goals
- No fine-tuning requirement.
- No second vector database or second canonical Memory.
- No unrestricted self-modifying source code.
- No hidden autonomous supervisor agent.
- No autonomous release/publish/deploy authority.
- No raw chain-of-thought persistence.
- No automatic trust in old Memory merely because it was retrieved.
- No claim that more stored memories alone means higher intelligence.
