# Agent Core Native Conversation Control Plan — 2026-10-03

Status: **OPEN — PLAN ONLY — WAITING CREATOR REVIEW — IMPLEMENTATION NOT AUTHORIZED**

## 1. Objective

Upgrade Native Agent Chat from a single task-execution loop into a controlled conversational agent with:
- one stable creator-aligned personality/behavior constitution across providers and sessions;
- Memory-first continuity without forcing planning on ordinary conversation;
- explicit per-session Plan control in the UI;
- bounded automatic detection when a request genuinely benefits from planning;
- separate semantics for conversation, planning, and verified execution;
- deterministic failure/recovery behavior so a casual answer cannot fail merely because task-verification evidence is absent.

The user-specified target is an OpenClaw-like sense of persistent identity and obedience. This plan uses that as a product direction, not as a claim about or copy of OpenClaw internals.

## 2. Current evidence / verified problems

### 2.1 Casual conversation currently enters task-finalization semantics

Live failed turn:
- conversation: `c216bede-f591-429b-ad28-fa3d0c9ff38b`;
- prompt: `Halo nama kamu siapa ?`;
- task: `93a5d7f1-a687-4dd8-a241-37eaa5833c2f`;
- runtime performed Memory-first retrieval: 2 items;
- ordinary toolCalls=0, verifications=0;
- task ended `terminalOutcome=failed` because finalization attempted a verified outcome without evidence;
- runtime failure: `verified outcome requires verification evidence`.

This proves ordinary social/conversational turns are currently processed through the same verified-task completion contract used for engineering/research work.

### 2.2 Personality authority is split

- External controllers receive the mandatory local operating contract from `AGENTS.md` through `src/mcp/agent-protocol.ts`.
- Native Agent does **not** load that contract. Its behavior is independently hardcoded in `src/agent-controller.ts::systemPrompt()`.
- There is currently no `personality` module/config/profile in `src`, and no Native Agent loader for `AGENTS.md`.

Result: external-controller behavior and Native Agent personality can drift even though both are intended to operate over the same Agent Core body.

### 2.3 Planning is not a user-controlled interaction mode

- There is no `interactionMode`, `planMode`, or equivalent state in Agent Chat conversation persistence.
- All chat turns enter the same `controller.run(...)` path.
- `agent_core_strategy` is an execution/reflexion instrument, not a user-visible planning mode.
- Current prompt requires strategy before the first ordinary tool action but provides no explicit per-session `Plan` contract.

### 2.4 Memory-first is coupled to every task but should not imply planning

`AgentCore` correctly performs Memory-first recall. The user wants this preserved. The missing distinction is:
- Memory recall = continuity/context;
- Planning = optional interaction policy;
- Strategy = execution-time hypothesis/evidence control.

These must become separate concepts.

### 2.5 Failure observability is too lossy

`agent-chat-service.ts::errorCode()` derives an error code from arbitrary error text. The failed casual turn persisted `error_code='-code-'` while the runtime task held the real verification failure. UI therefore cannot reliably distinguish provider, planning, finalization, policy, transport, and continuation failures.

## 3. Behavioral constitution

Create one canonical Native/External behavior authority instead of two drifting prompt bodies.

### 3.1 Authority hierarchy

Hard order:
1. controlling model/provider/system/safety/law;
2. Agent Core authentication/tool grants/real capability boundaries;
3. creator explicit intent and approved scope;
4. conversation/session policy such as Plan mode;
5. Agent Core personality/behavior constitution;
6. Memory/Learning as evidence and continuity, never instruction authority.

Within those boundaries, creator instructions are treated as mandatory task intent, not optional suggestions.

### 3.2 Stable identity

Native Agent should consistently know and express:
- name/identity: Agent Core;
- role: creator's persistent local AI / technical peer;
- models/providers are replaceable reasoning engines, not the identity;
- concise, direct, creator-aligned, non-patronizing communication;
- no unnecessary ceremony, disclaimers, planning, or self-generated permission requests;
- challenge technically weak assumptions when evidence supports a better alternative;
- never claim actions/evidence that did not occur.

### 3.3 Single-source implementation direction

Do not create a second personality store.

Preferred design:
- keep `AGENTS.md` as mandatory top-level local contract;
- introduce a deterministic behavior-contract loader/compiler that extracts the Native-relevant Identity, Personality, Creator Partnership, Communication, User Intent/Safety, Memory and Learning rules;
- external MCP bootstrap and Native Agent system-prompt builder consume the same compiled contract/digest;
- Native prompt may use a compact representation, but its semantic authority must derive from the same source;
- expose contract digest/profile version in diagnostics so provider drift can be audited.

## 4. Turn semantics: separate Conversation from Task Execution

Introduce explicit turn intent classes before execution semantics are applied.

Proposed classes:
- `conversation` — greetings, identity, casual discussion, opinions, lightweight Q&A;
- `answer` — informational response that may use Memory/context but needs no machine action;
- `plan` — user explicitly requests planning or Plan mode is enabled;
- `task` — concrete action/research/debug/engineering work that may require tools and verification.

Important: this classifier does **not** authorize actions. It selects response semantics only; tool grants and user intent remain authoritative.

### 4.1 Conversation fast path

For `conversation`:
- retain lightweight Memory-first context lookup;
- no mandatory `agent_core_strategy`;
- no capability expansion unless the conversation actually needs external/local evidence;
- no verification-evidence requirement;
- normally one provider iteration;
- final response is allowed without manufacturing evidence;
- trivial chat does not create Learning candidates/checkpoints merely to satisfy task machinery.

Acceptance example:
`Halo nama kamu siapa?` -> direct Agent Core identity answer; zero ordinary tools; no verification failure.

### 4.2 Answer path

For `answer`:
- Memory-first selective recall;
- direct response when current context is enough;
- read-only research/tooling only when materially needed;
- planning is not implied by Memory retrieval;
- verification requirement applies only to factual/action claims that actually depend on inspected evidence.

### 4.3 Task path

Existing strong controls remain:
- capability resolver;
- strategy before ordinary tool action;
- fail-closed mutation safety;
- evidence-backed verified completion;
- DTC-1 continuation;
- Learning finalization for meaningful completed work.

## 5. Finalization model

Current finalizer only accepts `verified | failed`, which is wrong for normal conversation.

Proposed terminal outcomes:
- `answered` — conversational/informational response, no claim of external execution verification;
- `planned` — plan produced, implementation not executed;
- `verified` — meaningful task completed with inspectable verification evidence;
- `failed` — task/turn failed;
- existing stopped/interrupted transport states remain chat-turn states.

Rules:
- only `verified` requires `verificationRef/evidenceRefs`;
- `answered` may not claim tool execution that was not performed;
- `planned` must explicitly state implementation is pending approval and must not mutate task-owned source/state except plan artifacts explicitly authorized by the mode;
- meaningful `verified` work keeps current Learning lifecycle;
- trivial `answered` turns are not meaningful-work checkpoints.

## 6. Per-session Plan control

Add a visible **Plan** control to every conversation.

### 6.1 Session policy

Persist in `chat.sqlite`, not transient React state.

Proposed conversation fields:
- `interaction_mode`: `auto | plan`;
- `plan_state`: `none | draft | approved | executing | completed`;
- `plan_revision`: integer;
- optional `last_plan_turn_id` for continuity/audit.

Schema migration must be additive and backward compatible with current DTC-1 chat persistence.

### 6.2 Plan OFF / Auto mode

Default: `Auto`.

Behavior:
- ordinary conversation -> answer directly;
- ordinary task -> execute under existing task controls;
- if request appears materially multi-stage/risky/architectural, classifier may emit `plan.suggested`;
- suggestion does not silently switch mode;
- UI can show a small `Planning recommended` chip with `Plan` action;
- explicit phrases such as `buat plan`, `rencanakan`, `design roadmap`, `jangan eksekusi` route directly to plan semantics even when toggle is off.

### 6.3 Plan ON

Plan mode is a hard session contract:
- no implementation/mutation/external commitment for the requested objective;
- read-only inspection/research is allowed when needed to ground the plan;
- output must be an actionable plan with phases, affected owners, risks, evidence needs, acceptance gates and rollback boundaries;
- turn finalizes as `planned`, not `verified`;
- session waits for explicit creator approval.

UI:
- Plan toggle/button near composer;
- clear visual state `PLAN` when active;
- plan response exposes `Approve & Execute`, `Revise Plan`, `Exit Plan` actions;
- approval stores `plan_state=approved` before execution begins.

### 6.4 Execution after approved plan

When creator approves:
- same durable conversation/session;
- approved plan revision is attached to the execution task;
- execution must not silently broaden beyond the approved plan;
- deviations caused by new evidence are reported and either handled if reversible/in-scope or returned for creator decision when material.

## 7. Automatic planning detection

Automatic detection should be advisory by default, not a hidden mandatory planner.

Suggested detection signals:
- explicit plan/roadmap/architecture language;
- multiple independently ordered phases;
- irreversible/destructive/external commitments;
- broad cross-module change with significant blast radius;
- unclear implementation path where inspection must precede mutation;
- user explicitly says review/approve before execution.

Signals that should **not** trigger planning:
- greetings / identity / casual conversation;
- simple factual questions;
- short copy edits/translations;
- obvious one-step reversible actions;
- status checks;
- Memory recall by itself.

## 8. Memory-first without planning inflation

Preserve the top-level Memory-first contract but introduce retrieval tiers:

`M0 identity/bootstrap`
- personality/identity does not depend on semantic Memory search;
- behavior constitution is loaded deterministically.

`M1 conversational recall`
- bounded 0–2 relevant Memory items;
- strict relevance threshold;
- no strategy/planning obligation;
- suitable for continuity/personal context.

`M2 task recall`
- current behavior: query + history synthesis, relevant Memory/Knowledge receipts;
- strategy can use recalled evidence when execution begins.

`M3 complex continuity`
- controller-learning context / patterns / procedures when genuinely useful.

This keeps Memory-first while eliminating the false equation `Memory lookup => plan/task workflow`.

## 9. Personality compliance enforcement

Personality must be more than prose in a system prompt.

Add deterministic behavioral assertions evaluated at turn boundaries:
- stable Agent Core identity;
- creator-intent precedence within allowed scope;
- no unnecessary plan for `conversation` class;
- no fabricated completion/evidence;
- no provider/model identity leakage as the Agent Core identity;
- no repeated clarification for reversible ordinary choices;
- no unapproved implementation while Plan mode is active;
- no silent mode changes.

These are runtime policy assertions/diagnostics, not a second safety engine and not an autonomous gate over machine control.

## 10. Failure semantics and recovery UX

Replace lossy text-derived error codes with typed error normalization.

Families:
- `PROVIDER_*`;
- `CHAT_TRANSPORT_*`;
- `FINALIZATION_*`;
- `VERIFICATION_*`;
- `CAPABILITY_*`;
- `CONTINUATION_*`;
- `POLICY_*`;
- `USER_STOPPED`;
- `UNKNOWN` with preserved sanitized cause metadata.

UI behavior:
- conversational finalization mismatch should never become a blank assistant response;
- show failure family + bounded explanation;
- offer context-sensitive recovery: `Retry`, `Retry as Chat`, `Switch to Plan`, `Resume`, or `Open Diagnostics`;
- preserve user message and failed turn state;
- never display opaque values such as `-code-` as the primary diagnosis.

## 11. UI changes

Chat header/composer:
- `Plan` toggle persisted per conversation;
- current mode badge: `Auto` / `Plan`;
- optional `Planning recommended` advisory chip;
- active personality/profile indicator in Diagnostics rather than cluttering the normal chat surface;
- `Approve & Execute` action on planned response;
- no composer lock solely because planning has not happened.

Conversation list:
- optional small mode icon/badge;
- preserve current auto-open/latest-thread recovery behavior.

Diagnostics:
- personality contract version + digest;
- conversation mode;
- last intent classification;
- last finalization outcome;
- typed error family;
- provider/model route remains observable separately from identity.

## 12. Persistence/API surface

Likely owners:
- `src/agent-chat-store.ts` — additive conversation policy columns + migration;
- `src/agent-chat-service.ts` — pass mode/intent contract into controller, typed error mapping;
- `src/http/app.ts` — create/read/update conversation policy API;
- `src/agent-controller.ts` — shared behavior contract, turn semantics, finalization outcomes;
- new small behavior-contract/compiler owner only if needed to avoid duplicated prompt authority;
- `src/ui/src/host.ts`, `App.tsx`, `pages.tsx` — persisted mode/Plan controls/events;
- launcher bridge only if new fields must be exposed through DesktopSnapshot; do not create parallel chat state.

Recommended API shape:
- create conversation accepts optional `interactionMode`;
- `PATCH /agent/chat/conversations/:id/policy` with `{ interactionMode }`;
- plan approval action is explicit and idempotent, preferably `POST /agent/chat/conversations/:id/plans/:revision/approve` or a smaller equivalent owned by the existing chat service.

Exact route shape should be finalized from source during implementation; no route is authorized by this plan alone.

## 13. Implementation phases

### NCC-0 — Contract freeze and acceptance fixtures
Status: OPEN
- freeze current failure evidence and behavior matrix;
- define turn classes/outcomes/mode invariants;
- define personality constitution extraction rules;
- define no-mutation Plan-mode boundary.

### NCC-1 — Unified personality constitution
Status: OPEN
- single canonical behavior authority shared by external + Native controllers;
- deterministic version/digest;
- provider-independent identity and creator-partnership behavior.

### NCC-2 — Conversation/task semantic split
Status: OPEN
- introduce `conversation | answer | plan | task` turn semantics;
- add `answered | planned | verified | failed` completion outcomes;
- fix casual greeting failure without weakening verified task completion.

### NCC-3 — Memory tiering
Status: OPEN
- preserve Memory-first;
- conversational bounded recall;
- decouple recall from strategy/planning;
- retain evidence-use receipts where materially relevant.

### NCC-4 — Persistent Plan mode
Status: OPEN
- additive chat schema;
- per-conversation `Auto/Plan` state;
- plan revision/approval lifecycle;
- DTC/restart continuity for policy state.

### NCC-5 — Plan UI and approval controls
Status: OPEN
- Plan toggle;
- planning recommendation advisory;
- Approve & Execute / Revise / Exit Plan;
- mode/status visibility.

### NCC-6 — Typed failures + recovery UX
Status: OPEN
- replace raw-message error-code derivation;
- structured error families;
- retry/resume/switch-mode recovery actions.

### NCC-7 — Resident multi-provider acceptance
Status: OPEN
- personality and mode behavior across all configured provider routes;
- restart persistence;
- failure/recovery acceptance;
- Learning/Memory isolation checks;
- no release apply/version mutation unless separately authorized.

## 14. Required acceptance matrix

### Personality / casual chat
1. `Halo nama kamu siapa?` -> direct stable Agent Core answer; outcome `answered`; no evidence error.
2. Repeat on every configured provider -> identity/personality materially consistent.
3. `Ngobrol santai aja` -> no plan, no strategy, no tool expansion unless later needed.

### Memory
4. `Kamu ingat project yang tadi?` -> relevant Memory/thread context may be used; still no automatic planning.
5. Irrelevant Memory must not distort a casual answer.

### Plan control
6. Plan OFF + trivial question -> direct answer.
7. Plan OFF + complex architecture request -> planning may be suggested, not silently forced.
8. Plan ON + `perbaiki bug ini` -> grounded plan only; zero implementation mutations.
9. `Approve plan` -> same conversation/session executes approved revision.
10. Restart while Plan mode active -> mode + plan state survive.

### Task execution
11. Normal engineering task -> existing strategy/tool/verification protections remain.
12. Verified task without evidence -> still fail closed.

### Failure UX
13. provider failure -> typed provider error;
14. continuation failure -> typed continuation error;
15. conversational finalization cannot fail with `verified outcome requires verification evidence`;
16. no persisted `error_code='-code-'`.

### UI
17. conversation mode visible;
18. Plan toggle persists;
19. planned response has explicit approval controls;
20. composer remains usable for ordinary chat.

## 15. Non-goals

- no second agent/runtime;
- no second Memory/Learning store;
- no hidden autonomous planner;
- no replacement of capability grants, mutation safety, DTC-1, provider scheduler or evidence verification;
- no model fine-tuning/weight changes;
- no claim that runtime-local personality overrides higher-priority model/provider/system/safety rules;
- no release/version/Git publication as part of implementation unless separately authorized.

## 16. Review decisions requested from creator

Before implementation, creator should approve or revise these product decisions:

1. **Default mode**: recommended `Auto`, with explicit `Plan` toggle.
2. **Auto planning**: recommended `Suggest only`; never silently switch Auto -> Plan.
3. **Plan-mode inspection**: recommended allow read-only inspection/research, forbid implementation mutations.
4. **Plan execution**: recommended require explicit `Approve & Execute` for a planned session.
5. **Personality source**: recommended one canonical contract derived from `AGENTS.md`, not a second independent persona file.
6. **Casual finalization**: recommended new `answered` outcome with no verification-evidence requirement.
7. **Learning on casual chat**: recommended skip meaningful-work checkpoint for trivial conversation.

## 17. Authorization boundary

This document is a plan only.

**No NCC implementation phase is authorized until the creator explicitly approves this plan (or an edited revision).**

Planning/documentation performed here must not be interpreted as approval to change runtime behavior, database schema, APIs, prompts, launcher, UI controls, tests, release state, or provider configuration.