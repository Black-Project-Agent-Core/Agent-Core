# Agent Core × Ponytail Autonomous Craft Improvement Study Plan

Date: 2026-09-07
Status: Historical research baseline. The implemented coding contract is documented in [engineering-workflow.md](../engineering-workflow.md); this dated study does not describe current runtime availability.

## Goal

Study Ponytail as a donor for Agent Core's engineering behavior, then identify the smallest native improvements that make Agent Core more autonomous about reusing what already exists before creating new code.

The target is not to install Ponytail, copy its hooks wholesale, or replace Agent Core routing. The target is to improve Agent Core's existing craft behavior so the model automatically prefers internal tools, existing code, native/platform primitives, and already-installed dependencies before creating new mechanisms.

## Non-goals

- Do not make Ponytail a runtime dependency.
- Do not replace `capability_route`, CapabilityRouter, Execution DAG, memory/continuity, or existing verification contracts.
- Do not weaken security, validation, evidence, or user-explicit requirements in the name of minimalism.
- Do not treat Ponytail as a memory subsystem.
- Do not implement any change until the comparison and design are reviewed.

## Evidence baseline

Ponytail's central ladder is ordered and reflexive: need → existing codebase → stdlib → native platform → installed dependency → one-line/minimum implementation.
Agent Core already has several adjacent primitives: automatic `capability_route`, capability ranking/loading, route reuse, memory/continuity reuse, read/search-before-mutation guidance, deterministic multi-command DAG execution, source/license audit for skills, and evidence-based completion.

The current gap is that Agent Core does not yet expose or enforce an explicit ordered solution-reuse decision before new code is proposed. Capability routing answers "what capability/tool may help?" but not yet "what is the highest existing rung that already solves this?"

## Study Question 1 — Existing internal reuse

Determine how far Agent Core can already discover reusable internal assets before writing code:

- routed tools and `native_ready` capabilities;
- existing helpers/types/services in the project;
- existing execution recipes and verified artifacts;
- existing project decisions/continuity work that should be resumed instead of recreated.

For each category, record whether discovery is automatic, advisory, or absent. Identify the cheapest existing primitive that can supply evidence without creating a new service.

## Study Question 2 — The Agent Core reuse ladder

Evaluate a native ladder shaped for Agent Core rather than copying Ponytail literally:

1. Does the requested change need new implementation at all?
2. Is the capability already exposed by Agent Core or the current project?
3. Is there an existing helper/service/pattern that should be reused?
4. Does Node/TypeScript/OS/DB/browser/platform native functionality solve it?
5. Does an already-installed dependency solve it safely?
6. Can an existing craft/transplant mechanism be adapted with a smaller change?
7. Only then create the minimum new native code.
The study must define what evidence is sufficient to stop at each rung. The ladder must remain fast and bounded; it must not turn every code edit into an unbounded repository research project.

## Study Question 3 — Autonomous use without user prompting

Compare Ponytail's always-on injection with Agent Core's existing automatic capability-router behavior.

Goal: the user should not have to say "search existing tools first" or "use the current helper". For actionable coding/craft work, the model should receive a reusable machine-readable or skill-level directive automatically.

Investigate three possible enforcement levels:

A. Instruction-only: strengthen the existing `agent-core-capability-router` skill with an Agent Core reuse ladder.

B. Runtime-assisted: have `capability_route` return bounded reuse evidence/directives derived from existing capabilities/project search, while the router skill consumes them automatically.

C. New optimization subsystem: a separate engine that scores implementation alternatives.

Recommendation to validate: prefer B if existing primitives can supply the evidence cheaply; fall back to A if runtime evidence adds little. Reject C unless concrete tests prove A/B insufficient.

## Study Question 4 — Root-cause and shared-path repair

Ponytail's strongest bug-fix rule is not "small diff" by itself; it is "trace callers, then fix the shared root once".

Compare this with Agent Core's current read/search-before-mutation behavior. Define a bounded contract for bug fixes that searches callers/shared seams before editing, while avoiding unnecessary whole-repo scans for trivial isolated changes.
## Study Question 5 — Craft autonomy

Map the existing donor/craft workflow against Ponytail's internal-first rule.

Desired behavior: before introducing a new subsystem from donor research, Agent Core first checks whether an existing native primitive already covers part of the mechanism. The final craft should synthesize only the missing useful pieces, not recreate donor architecture wholesale.

Required comparison:

- donor mechanism → existing Agent Core primitive overlap;
- reusable existing primitive → keep unchanged;
- missing behavior → adapt/reimplement natively;
- redundant donor layer → reject;
- literal reuse → license/provenance gate;
- final subsystem → no donor runtime dependency.

This should improve the existing transplant methodology, not replace it.

## Study Question 6 — Lean verification

Ponytail keeps one runnable check for non-trivial logic while Agent Core currently has stronger evidence and regression requirements. Do not downgrade Agent Core to Ponytail's minimum test philosophy.

Instead determine where the useful principle applies: every newly crafted logic unit should have the smallest meaningful evidence that proves the new behavior, while existing safety/recovery/security regression suites remain mandatory where relevant.

Investigate whether a post-change "lean review" can detect unnecessary wrappers, duplicate helpers, speculative config, or dependencies without acting as a correctness/security reviewer.
## Research execution order

### Phase 1 — Evidence matrix

Create a side-by-side matrix for Ponytail and Agent Core covering: automatic activation, reuse discovery, stdlib/native/dependency preference, root-cause search, minimal-diff behavior, verification, persistence, and review/audit behavior.

For every row, classify Agent Core as `existing`, `partial`, or `missing`, with exact source/test evidence.

### Phase 2 — Reuse-path archaeology

Trace the current Agent Core path from `capability_route` through `CapabilityRouter`, capability registry, project search/filesystem, execution artifact lookup, and router skill instructions. Identify the minimum existing seams where reuse evidence can be produced and consumed.

Do not design a new service until this phase proves the existing seams cannot express the requirement.

### Phase 3 — Behavior contract design

Define the exact Agent Core-specific reuse ladder, stopping conditions, bounded search rules, and fail-open/fail-closed behavior. Distinguish advisory simplification from safety/permission enforcement.

Specify how explicit user requirements override minimalism without disabling internal-first discovery.

### Phase 4 — Craft improvement mapping

Apply the ladder to 3-5 past Agent Core donor/transplant examples and test whether it would have reduced duplicate code or unnecessary new abstractions without losing required capability.
### Phase 5 — Evaluation corpus

Build a small research corpus of representative tasks, not implementation yet:

- existing helper should be reused;
- stdlib/native feature should win over new code;
- installed dependency should be reused;
- donor mechanism overlaps an Agent Core primitive;
- genuinely new behavior requires new code;
- bug symptom should resolve at a shared root cause;
- explicit user requirement must not be simplified away.

Define expected rung and unacceptable behavior for each case.

### Phase 6 — Design recommendation

Produce 2-3 implementation approaches with trade-offs. The recommended design must reuse the current Agent Core route/capability anatomy unless evidence proves a new boundary is required.

Only after that design is approved should a formal implementation spec and TDD plan be written.

## Likely files to study, not yet authorized to modify

- `plugin/agent-core/skills/agent-core-capability-router/SKILL.md`
- `tests/agent-core-router-skill.test.ts`
- `src/mcp/capability-tools.ts`
- `src/capabilities/router.ts`
- `src/capabilities/registry-service.ts`
- `src/capabilities/source-audit.ts`
- `src/execution/artifact-manager.ts`
- filesystem/search services used for bounded project discovery
- donor/craft documentation and past transplant evidence
## Acceptance criteria for the study

The research is complete only when all of the following are true:

- Every proposed Ponytail-derived behavior is mapped to an existing Agent Core primitive or a proven gap.
- No proposal duplicates a capability that Agent Core already has.
- The chosen approach makes internal reuse automatic for normal actionable coding/craft work; the user should not have to request it manually.
- The reuse search is bounded and cannot turn simple work into an expensive archaeology pass.
- Security, validation, evidence verification, memory/continuity constraints, and explicit user requirements retain higher authority than minimalism.
- Craft/transplant behavior prefers existing Agent Core anatomy before adding donor-inspired code.
- Donor code remains reference material only; no new Ponytail runtime dependency is introduced.
- The design includes regression cases proving both reuse success and the cases where new code is legitimately required.

## Current recommendation before deeper study

Do not add a new "Ponytail engine". The leading hypothesis is to graft an Agent Core-specific reuse ladder into the existing automatic routing/craft path, optionally backed by bounded machine-readable reuse evidence from `capability_route`.

This is intentionally a hypothesis, not an implementation decision. Phases 1-5 must prove whether instruction-only behavior is sufficient or runtime assistance is justified.
