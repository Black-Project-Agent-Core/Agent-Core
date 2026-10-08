# Agent Core Capability Awareness and Usage Disclosure Plan — 2026-10-07

Status: SOURCE IMPLEMENTED — TARGETED QUALIFIED — BUILD INSTALLED. C0-C4 complete at source/fixture level; C6 resident reload and live-controller acceptance remain OPEN. C5 deferred because no concrete host-registration consumer exists.

## 1. Objective

Make every AI controller operating Agent Core reliably understand which registered capabilities are actually available, automatically choose relevant capabilities when useful, and disclose meaningful capability use to the user exactly once without adding noise when nothing special was used.

Target behavior:
- Agent Core exposes current tools, Skills, Patterns, procedures and other registered helpers as bounded controller-visible capability evidence.
- The AI chooses relevant capabilities automatically from task context; the user does not need to name the tool or Skill.
- Exposure alone is never treated as use.
- Grant or permission alone is never treated as use.
- Actual material use creates a bounded usage record.
- User-facing disclosure is emitted only for disclosure-worthy capabilities that were actually used.
- If no disclosure-worthy capability was used, the AI says nothing about tools, Skills, plugins, or helpers and simply answers or works normally.

Example desired disclosure:
"Aku menggunakan Skill ACRAA untuk membantu audit activation Agent Core ini."

This plan changes capability awareness and disclosure behavior only. It does not grant new execution authority, create a second agent, or activate new capabilities by itself.

## 2. User requirements captured for review

U1 — Full capability awareness: the controlling AI must be able to discover capabilities currently registered in Agent Core rather than depending on the user to mention them.
U2 — Automatic relevance selection: when a task matches a registered capability, the AI should select it automatically when materially useful.
U3 — Actual-use requirement: being present, surfaced, granted, or considered is not enough to justify a usage notice.
U4 — Explicit disclosure on use: when a disclosure-worthy capability is used, emit one concise natural-language notice.
U5 — Silence when unused: if no disclosure-worthy capability is used, no capability notice should appear.
U6 — No disclosure spam: low-level primitive calls must not produce one notice per tool call.
U7 — Multiple capability grouping: combine multiple meaningful capabilities into one concise notice when practical.
U8 — No fake plugin visibility: only capabilities Agent Core can actually observe or register may be claimed as available.
U9 — No authority widening: exposure/disclosure never widens ToolGrant, authentication, mutation safety, user intent, provider restrictions, or execution authority.
U10 — Same conceptual behavior for both controllers: Native Agent and external controllers should follow the same exposure/use/disclosure semantics even when delivery mechanics differ.

## 3. Source-grounded current baseline

1. src/mcp/server.ts registers the live MCP tool surface and provides AGENTS.md as mandatory external-controller instructions.
2. src/agent-tool-session.ts lets Native Agent discover the live MCP tool surface from the same Agent Core server.
3. src/agent-capability-catalog.ts already defines 16 semantic capability families with tool membership and risk.
4. src/agent-capability-resolver.ts already supports dynamic task-scoped capability expansion while preserving user intent and risk ceilings.
5. src/agent-knowledge-synthesis.ts already surfaces bounded task-relevant ACTIVE SKILL ARTIFACTS, accepted code Patterns, and learned procedures.
6. src/agent-controller.ts already requires declaration when Memory or an artifact materially affects strategy. artifactUse supports procedure, skill, and pattern.
7. src/agent-runtime.ts already persists artifact-use declarations and task evidence.
8. src/learning/external-controller.ts already synthesizes Skills/Patterns/procedures for external controllers and supports artifact receipts.

Existing 7 October evidence also proves an active Skill can be visible in synthesis and automatically selected by Native Agent: task 59a5e5d1-c7d2-4215-b47a-3480943bc24e persisted artifactUse for agent-core-runtime-activation-audit with applicability=applied.

Conclusion: the missing layer is not basic Skill visibility. The gap is a unified capability-awareness projection plus deterministic user-facing disclosure derived from actual use.

## 4. Current gaps

G1 — Capability inventory is split between live tool discovery/capability families and knowledge artifacts.
G2 — There is no first-class Agent Core pluginRegistry or connectorRegistry in current source.
G3 — Raw tool use and artifact use have different evidence paths.
G4 — There is no deterministic once-per-capability user-facing usage notice.
G5 — External delivery cannot be assumed merely because Agent Core emitted MCP instructions or a capsule.
G6 — Announcing every primitive read/search/config call would create noise.

## 5. Design principles

P1 — Projection, not a second registry database. Build a deterministic view from existing owners.
P2 — Discoverable does not mean granted.
P3 — Granted does not mean used.
P4 — Used does not mean beneficial. Usage disclosure is not a success metric or trust increase.
P5 — Use user-meaningful names such as Code Intelligence, Semantic IDE, Web Research, or a named Skill rather than every MCP function.
P6 — One disclosure per capability per turn by default.
P7 — A capability that is considered, surfaced, denied, or abandoned stays silent unless the denial materially affects the task.
P8 — Disclosure failure is fail-soft and must not erase a valid task result.

## 6. Proposed architecture

### 6.1 Capability Exposure Snapshot

Add one deterministic read-only projection owned next to the existing capability catalog, not a new daemon/service/database.

Proposed logical fields:
- capabilityId
- kind: tool-family | skill | pattern | procedure | helper | external
- displayName
- description
- revision
- availability: available | degraded | unavailable | unknown
- relevanceText
- disclosurePolicy
- sourceOwner
- optional memberTools and limitations
- never credentials or secrets.
Projection sources:
- raw live MCP tool discovery
- AGENT_CAPABILITY_CATALOG
- active SkillService.list()
- accepted Patterns from Learning Journey
- verified procedures from Learning
- existing helper owners already represented through Agent Core tool families

Host-side plugins/connectors are included only if the host later supplies an explicit registration payload. No registration means unknown, not unavailable.

### 6.2 Two-level visibility

Do not dump the entire full-detail registry into every turn.

Level A — inventory digest:
- counts by capability kind
- available family names
- active Skill names/revisions
- explicit omissions or degraded owners

Level B — task-relevant descriptors:
- bounded BM25/fusion selection from current goal
- trigger/relevance text sufficient for automatic selection
- current revision/digest for use attribution

Raw tool schemas remain supplied through normal MCP/model tool surfaces; do not duplicate their full descriptions into synthesis.

### 6.3 Relevance and auto-selection

Native:
- keep dynamic agent_core_request_capabilities for tool families
- keep task-relevant Skills/Patterns/procedures in synthesis
- add explicit controller rule to use the strongest relevant capability automatically when it materially improves the task
- forbid ceremonial capability usage merely to generate a notice
External:
- controller_learning(context) returns the same bounded projection where available
- MCP server instructions tell the controller to choose registered capabilities automatically when materially relevant

No hidden pre-router model is introduced; the active controller remains the semantic decision-maker.

## 7. Normalized actual-use evidence

Do not replace existing ledgers. Build a transient normalized per-task view over existing evidence.

### 7.1 Tool-family use
A tool family counts as actually used only after a real member tool invocation reaches the existing execution wrapper. A grant or capability request alone is not use.

### 7.2 Skill / Pattern / procedure use
An artifact counts as materially used only when it was surfaced to the task and artifactUse or an external artifact receipt declares applied or adapted. rejected is not announced as used.

### 7.3 Helper/plugin use
A registered helper/plugin may be announced only after its registered invocation adapter records a call or receipt. Registration alone is not use.

### 7.4 Usage states
- available
- surfaced
- granted
- attempted
- applied
- failed
- rejected

Only applied normally produces the positive wording "Aku menggunakan ...". A materially failed attempt uses failure wording only when it affects the result.

## 8. Disclosure policy
Add semantic communication policy values:
- silent-internal
- grouped-family
- announce-on-material-use

Default silent-internal examples:
- Memory-first plumbing
- get_config
- ordinary read_file/list_directory/search primitives
- tracker/history
- Learning checkpoint/review
- result budgeting
- capability request itself

Default grouped-family examples:
- Code Intelligence
- Semantic IDE
- Web Research
- Browser Control
- Phone Control
- material process/build execution

Default announce-on-material-use examples:
- named Skill
- named Pattern/procedure when it materially dictates strategy
- explicitly registered future plugin/helper with a user-facing identity

Communication policy does not alter execution risk.

## 9. User-facing wording contract

Single Skill:
"Aku menggunakan Skill <displayName> untuk membantu <bounded purpose>."

High-level capability:
"Aku menggunakan Code Intelligence untuk memetakan dependency dan blast radius perubahan ini."

Multiple capabilities:
"Aku menggunakan Skill ACRAA dan Code Intelligence untuk audit activation serta dependency impact."
Rules:
- one short notice, normally one sentence
- no list of every raw tool
- no internal IDs/digests unless user asks
- no success claim merely from use
- no repeated notice for the same capability in one turn
- no capability sentence when the task used only silent-internal plumbing

## 10. Native delivery design

Preferred deterministic path:
1. Controller selects/uses a capability.
2. Existing task state records actual-use evidence.
3. A small pure capability-usage disclosure projector computes currently undisclosed material uses.
4. Native turn emits one user-visible capability notice before the next substantive response update when practical.
5. If no earlier user-visible update exists, finalization prepends the pending notice to finalResponse.
6. Mark the notice delivered only after chat persistence, matching existing evidence discipline.

Likely touched owners:
- src/agent-controller.ts
- src/agent-runtime.ts
- src/agent-chat-service.ts
- src/agent-turn-events.ts
- one small projection module

Do not add a daemon or second chat owner.

## 11. External-controller delivery design

Agent Core cannot directly rewrite host-assistant prose.

Use two mechanisms:
1. Shared AGENTS.md / MCP instructions require once-per-task disclosure after material use and silence when unused.
2. A deterministic first-use capsule may be returned by the MCP wrapper or controller_learning artifact receipt.
The capsule carries canonical display label + bounded purpose and asks the external controller to relay it once in the current user-facing response.

Do not append capsules to every primitive tool result.
Do not treat capsule inclusion as confirmed host delivery without evidence.

## 12. Plugin / connector boundary

Current source has no first-class Agent Core plugin registry.

Core implementation scope therefore covers Agent Core-owned registered capabilities:
- MCP tools/capability families
- active Skills
- Patterns
- procedures
- helper subsystems represented through Agent Core tools

Optional future phase: host supplies explicit capability-registration metadata for host plugins/connectors. Registration is metadata only and never grants access. Without this bridge, a ChatGPT/Gmail/third-party plugin known only to the host stays outside Agent Core's claimed inventory.

## 13. Proposed implementation phases

C0 — Contract and inventory baseline
- freeze current tool-family map
- enumerate active Skills and knowledge artifact owners
- classify capabilities as silent/grouped/announce
- record completeness gaps

C1 — Capability exposure projection
- implement the read-only snapshot
- add bounded inventory digest + task-relevant descriptors to Native synthesis
- add equivalent projection to external controller context
- avoid a new public MCP tool unless existing surfaces cannot carry the projection cleanly
C2 — Actual-use normalization
- map real tool invocations to semantic capability families
- reuse Native artifactUse
- reuse external artifact receipts
- track attempted/applied/rejected transiently without a second persistent database

C3 — Native deterministic disclosure
- add once-per-turn disclosure projection
- emit/persist disclosure only after material use
- final response fallback prevents notice loss

C4 — External disclosure capsule
- update shared contract
- first material-use capsule with dedupe
- no delivery claim without evidence

C5 — Optional host plugin registration bridge
- only if a real host integration can provide trustworthy plugin descriptors
- metadata-only registration; execution remains host-controlled

C6 — Resident acceptance and cleanup
- source qualification
- activation only after creator approval
- fresh Native + external acceptance
- docs/CODEBASE/Memory synchronization
- keep benefit measurement separate

## 14. Planned source ownership

Prefer extending existing owners:
- src/agent-capability-catalog.ts — semantic display/disclosure metadata
- src/agent-capability-resolver.ts — authorization semantics remain unchanged
- src/agent-knowledge-synthesis.ts — inventory digest and relevant artifacts
- src/agent-controller.ts — Native contract and actual-use handling
- src/agent-runtime.ts — per-task use/readback state if needed
- src/agent-chat-service.ts / src/agent-turn-events.ts — Native delivery
- src/learning/external-controller.ts — external context and deduped use capsule
- src/mcp/server.ts — only if generic tool-family first-use observation belongs in the existing wrapper
- AGENTS.md — shared disclosure behavior
- existing tests under tests/agent-*, capability resolver, chat/runtime and cumulative-learning suites

Avoid:
- second capability database
- second agent/router
- scheduler
- hidden LLM classifier
- automatic permission grants
- plugin execution gateway
- user-facing logging for every primitive call

## 15. Planned acceptance gates

A1 — Tool inventory completeness: every live MCP tool is mapped to a capability family or explicitly reported unclassified.
A2 — Active Skill visibility: all active Skill names/digests are discoverable and task synthesis surfaces the relevant Skill without the user naming it.
A3 — Auto-selection: a held-out matching task causes Native Agent to select the relevant Skill automatically.
A4 — Irrelevant Skill silence: unrelated task does not select the Skill and emits no Skill notice.
A5 — Actual-use-only disclosure: surfaced-but-unused and granted-but-unused capabilities generate zero notice.
A6 — Single Skill notice: actual Skill use produces exactly one bounded notice using its canonical display name.
A7 — Tool-family grouping: multiple code_* calls generate one Code Intelligence notice.
A8 — Primitive silence: Memory-first/read_file/get_config/list/search/Learning plumbing alone generates no notice.
A9 — Multiple-capability grouping: Skill + Code Intelligence use yields one concise grouped sentence.
A10 — Failed attempt semantics: failed/unavailable attempts cannot use successful-use wording.
A11 — No authority change: ToolGrant and mutation-safety decisions remain behavior compatible.
A12 — Native persistence: replay/finalization does not duplicate a delivered notice.
A13 — DTC-1 continuation: resumable turns do not re-announce persisted notices after reconnect.
A14 — External capsule dedupe: at most one disclosure capsule per capability/revision per episode/task.
A15 — External quiet path: silent-only external work receives no disclosure capsule.
A16 — Plugin truth boundary: unregistered host plugin is not listed as available.
A17 — Inventory freshness: Skill add/remove/digest changes appear in next synthesis without unrelated restart.
A18 — Context budget: projection stays inside reviewed context/manifest budgets.
A19 — No measured-benefit claim: acceptance proves mechanics only.

## 16. Planned targeted verification

Do not run until implementation is approved.

Planned tests:
- capability catalog/inventory projection
- dynamic resolver regressions
- synthesis relevant/irrelevant Skill selection
- Native artifactUse + disclosure
- Agent Chat persistence/replay/dedupe
- external context/capsule
- DTC-1 notice dedupe
- cumulative-learning + Skill proposal regressions
- root TypeScript build/path policy
- release compatibility manifest check

No broad benchmark, visual test, release apply, commit, push, publish, or deployment is implied by this plan.

## 17. Rollback boundary

If implemented, rollback only capability projection/disclosure additions and their related persisted notice fields/events. Preserve active Skills, Memory/Learning history, tool grants, DTC-1 state, proposal decisions, Patterns/procedures and existing evidence.
## 18. Definition of Done

This plan is complete only when, for Native and external controllers where technically observable:
1. Registered Agent Core capabilities are discoverable from truthful current state.
2. Relevant capabilities can be selected without the user naming them.
3. Actual use is distinguishable from exposure/grant.
4. Disclosure-worthy actual use creates exactly one concise notice.
5. Unused or silent-internal capabilities create no notice.
6. Related low-level calls are grouped at capability level.
7. Permission, safety, authentication and risk semantics stay unchanged.
8. Host-only plugins are never falsely claimed as Agent Core capabilities.
9. Restart/replay does not duplicate notices.
10. Docs, CODEBASE and canonical Memory match installed behavior.

## 19. Explicit non-goals

- no automatic installation of Skills/plugins
- no automatic activation from relevance alone
- no new execution permissions
- no second AI/router/classifier
- no disclosure of every low-level tool call
- no mandatory capability use when ordinary reasoning is enough
- no claim that using more tools means a better answer
- no measured improvement claim from disclosure itself

## 20. Review decision requested

Integration was authorized by the creator's explicit approval in the current task on 7 October 2026; the document alone does not authorize future scope expansion.

Approved implementation scope:
- Core: C0–C4 + C6
- Optional: C5 host-plugin registration bridge only if a concrete host registration consumer exists

Implementation remains within the approved capability-awareness/disclosure scope and existing Agent Core owners.

Pre-plan checkpoint: 760275c9-41ef-4a7e-88ef-fc6656b4de75.


## 21. Execution and evidence — 7 October 2026

Current result: source implementation is built and installed in dist. The running Core has NOT been restarted. Do not describe this as resident verification, measured benefit, or completed live-model automatic-selection acceptance.

### Implemented owners

- src/capability-awareness.ts provides the pure scoped inventory projection, actual-use normalization, semantic labels and one grouped notice. It is not another registry database or execution gate.
- src/agent-knowledge-synthesis.ts performs the catalog census before task ranking. Relevant descriptors remain within the existing 16,000-character packet; inventory text is bounded to 5,000 characters with explicit omissions. Registered-tool availability is not connection health. Host-only plugins remain unknown.
- src/agent-controller.ts consumes the shared automatic-relevance contract, records material declared artifact use and successful semantic tool use, and composes the canonical notice once in the final response. Successful skills(list/inspect) can deliver initially unranked Skills; active digests are rechecked before attribution. Resume rehydrates those deliveries from persisted tool messages.
- src/agent-runtime.ts keeps optional capabilityUses and post-persistence inclusion data in the existing task state. Exposure is not use, and inclusion is not confirmed delivery.
- src/agent-chat-service.ts records inclusion after assistant-message persistence and applies idempotent composition to recovered final responses. The final-response fallback is used; no new streaming/chat owner was introduced.
- src/learning/external-controller.ts keeps scoped inventory callbacks, usage observations and capsule dedupe keys in existing session/episode ownership. Observed tool use points to a persisted episode event, not a fabricated verification result. Explicit artifact use remains a declaration, not proof of benefit.
- src/mcp/capability-observation.ts observes successful registered calls only after existing execution admission. It emits one bounded external capsule per capability/revision/task and never claims the host relayed it. Ordinary primitive calls, failed calls and UI-origin calls stay quiet.
- src/mcp/server.ts and AGENTS.md expose the shared behavior contract. No new public MCP tool or permission family was added. The capability catalog, resolver and existing external reminder helper remain byte-identical to the pre-task snapshot.

### Targeted qualification

| Evidence | Observed result |
| --- | --- |
| Initial 16-file named batch | 119 passed, 4 timeout failures, 1 skipped |
| Recheck of the 3 affected files with one worker | 12/12 passed; no timeout increase or production logic change |
| Latest focused feature recheck | 18/18 passed across 4 files |
| Final distinct selected cases | 123 passed, 1 host junction fixture skipped; repeated tests are not additional distinct cases |
| TypeScript candidate build | Exit 0 after correcting a nullable callback capture found by the compiler |
| Path policy | 319 authored files, 0 exceptions |
| Standard release compatibility check | No breaking evidence, no stale manifest, no verification issues; 72 tools / 109,744 bytes |
| Full-config compiled schema construction | 73 tools / 113,021 bytes, within the reviewed 122,000-byte bound; this is schema evidence, not resident owner-health proof |
| Installed artifact readback | 8 JavaScript modules plus 8 rebased sourcemaps; all 16 hashes matched |
| Preserved artifacts | 6 UI files and the active ACRAA Skill bytes unchanged |

The scripted Native provider fixtures prove inventory delivery, relevant/late Skill attribution, canonical notice composition and replay persistence. They do NOT prove a general live-model selection rate. The failed concurrent-run evidence is retained rather than hidden. The junction skip is not a pass.

### Acceptance mapping

A1, A2, A4-A12, A14-A18 are source/fixture-qualified for the implemented Agent Core-owned surfaces. A3 remains OPEN for a held-out live-model turn that selects the Skill without its name in the prompt. A13 has existing DTC-1 regression plus persisted notice/replay coverage; live interrupted-stream/reconnect acceptance remains OPEN. A19 is maintained: no measured-benefit claim.

C5 is deferred, not represented by a fake host plugin registry. C6 source/build/install portions are complete, while process reload and fresh Native/external resident acceptance are pending. No restart, release apply, version bump, commit, tag, push, publish, or additional dependency installation occurred.

### Evidence and continuity

Execution evidence root: runtime/tmp/capability-awareness-20261007/.
Primary files: closure.json, before.json, installed-readback.json, full-schema-manifest.json, final-targeted.log, serial-recheck.log, final-feature-recheck.log, final-build-corrected.log, release-compat.log and progress.md.
The source backup and exact dist rollback backup paths are recorded in before.json and installed-readback.json. Restore only the task's named paths if rollback is explicitly requested; preserve unrelated source, Skill history and Memory.
Canonical Memory authority remains record f0e457ac-209d-4a4d-a08a-1d0a7dfb5b3d and is updated in-place. The ACRAA proposal remains implemented/catalog-active; this task does not reopen its retired reminder.


## Capability awareness: creator acceptance and stop-test boundary — 2026-10-07

Current disposition: ACCEPTED BY CREATOR; additional testing stopped at the creator's explicit request. Do not resume or request acceptance again without a new instruction.
Observed post-restart evidence: resident health ok/v0.14.0; serving Core PID 10332 started after build installation; 16/16 installed hashes matched; external context exposed 71 scoped tools, 16 families and 2 active Skills; actual-use capsules appeared and subsequent calls did not repeat them.
The pending live Native audit was explicitly cancelled through its own turn endpoint (HTTP 200, stopped=true), conversation a9fd52d2-c385-4738-823d-3577d8f92b3c, turn eb22e3c9-0fc5-4870-813f-dab9dae624bf. No further tests were launched. User acceptance does not turn cancelled or unexecuted tests into passes; live-model selection, quiet-task and reconnect acceptance are not claimed completed by this run. C5 remains deferred and ACRAA's retired reminder stays closed.
