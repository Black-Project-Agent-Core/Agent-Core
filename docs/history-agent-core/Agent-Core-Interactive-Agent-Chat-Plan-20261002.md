# Agent Core Interactive Agent Chat — Execution Plan
Date: 2026-10-02

Status: **RESIDENT ACTIVATED — MULTI-TURN + RESTART-CONTINUITY END-TO-END VERIFIED**

Current prerequisite authorities:
- docs\Native-Agent-Runtime-Phase-1-Plan.md
- docs\Agent-Core-Persistent-Credential-Rotation-Plan-20261002.md
- canonical Memory: persistent credential rotation resident-activated and bounded real-provider verified
- docs\CODEBASE.md

## 1. Goal

Evolve the existing Phase 1F one-shot Agent Core AI page into a durable interactive conversation surface where the AI Agent lives in Agent Core rather than inside one UI request.

Target user experience:

User
  -> opens Agent Core Chat
  -> creates or resumes a local conversation
  -> sends message
  -> same Native Agent session recalls Memory
  -> same Agent Core Skills/Procedures and MCP tools remain available
  -> provider scheduler selects provider/key internally
  -> tool/verification/Learning lifecycle runs
  -> final assistant message appears
  -> user sends follow-up in the same conversation
  -> Agent Core shutdown/restart
  -> conversation reopens at the same thread/history
  -> next turn continues the same Agent Core conversation identity

The model/provider may change or fail over, but the Agent identity remains Agent Core because session, conversation state, Memory, Skills, Learning, tools, and evidence remain local Agent Core authorities.

## 2. Current baseline and exact gap

Already implemented and resident:
- React ChatPage exists.
- ChatPage has prompt + workspace input and displays one result.
- WebView sends one `agent-run` message.
- MainForm forwards it to `AgentCoreRuntime.RunAgentAsync()`.
- launcher sends one loopback-only, token-protected `POST /agent/run`.
- NativeAgentController.runTask() performs Memory-first retrieval, tool loop, verification and Learning finalization.
- AgentRuntimeService persists session/task/finalization metadata.
- persistent credential scheduler is resident and real-provider verified.
- public MCP manifest is intentionally unchanged; Native Agent internally reuses existing MCP authority.

Current limitations:
- UI owns only one `AgentRunState`; there is no conversation list or transcript.
- each `runTask()` creates a new runtime session and closes it at turn completion.
- model context contains current prompt but no prior chat turns.
- transcript is not durable.
- UI cannot resume a prior thread after desktop/Core restart.
- launcher waits for the whole request; there is no safe progress stream.
- provider route affinity is process-local even though credential rotation itself is now durable.
- duplicate UI/network submission has no chat-turn idempotency contract.
- there is no conversation-scoped cancellation/interruption recovery.

Therefore this plan is an evolution of existing Phase 1F, not a second agent runtime and not a replacement UI transport.

## 3. Non-negotiable architecture invariants

1. **One Agent body**
   - Interactive Chat MUST call the existing NativeAgentController.
   - It MUST NOT create another agent loop, another MCP router, or another Memory implementation.

2. **One chat thread = one durable Agent Runtime session**
   - A conversation maps to one persistent AgentRuntimeSession.
   - A user message maps to one new AgentRuntimeTask inside that session.
   - Every turn retains independent verification and Learning finalization.

3. **Conversation state is not AI Memory**
   - Transcript/history is local user conversation state.
   - It is never automatically promoted to canonical Memory.
   - Durable knowledge may enter Memory only through the existing verified Learning lifecycle.

4. **Provider/key choice stays below the Agent**
   - UI never chooses or sees raw API keys.
   - model/controller never schedules keys.
   - PersistentCredentialScheduler remains the only credential-selection authority.

5. **No hidden reasoning surface**
   - UI may receive safe lifecycle/tool progress.
   - raw chain-of-thought, hidden strategy reasoning, tool arguments/results, secrets and raw Memory content are not streamed as UI diagnostics.

6. **Existing /agent/run remains compatible**
   - legacy one-shot transport stays available as a wrapper and regression oracle.

## 4. Target architecture

Desktop React ChatPage
  |
  | WebView host messages
  v
Agent Core Launcher
  |
  | launcher-owned ephemeral UI token
  | loopback HTTP only
  v
Agent Chat HTTP Facade
  |
  +-- ChatConversationService
  |     |
  |     +-- runtime\agent-runtime\chat.sqlite
  |
  +-- NativeAgentController.runConversationTurn()
        |
        +-- AgentRuntimeService durable session/task lifecycle
        +-- bounded recent conversation context
        +-- canonical Memory-first retrieval
        +-- Skills / Procedure / Grafel synthesis
        +-- existing scoped Agent Core MCP tools
        +-- verification
        +-- mandatory Learning finalization
        +-- PersistentCredentialScheduler
              |
              +-- runtime\agent-runtime\provider-state.sqlite
              +-- protected provider secrets

State boundaries:

canonical knowledge:
  runtime\memory

Learning:
  runtime\learning

task/session/procedure lifecycle:
  runtime\agent-runtime\state.json

conversation/thread transcript:
  runtime\agent-runtime\chat.sqlite

provider/key operational state:
  runtime\agent-runtime\provider-state.sqlite

## 5. Conversation persistence design

Planned new owner:
- `src\agent-chat-store.ts`

Planned store:
- `runtime\agent-runtime\chat.sqlite`

### chat_conversations

Fields:
- conversation_id TEXT PRIMARY KEY
- runtime_session_id TEXT NOT NULL UNIQUE
- workspace TEXT NOT NULL
- title TEXT NOT NULL
- status TEXT: active | archived
- preferred_provider_id TEXT NULL
- preferred_model TEXT NULL
- created_at_ms INTEGER
- updated_at_ms INTEGER
- last_turn_id TEXT NULL

Rules:
- workspace is fixed after the first accepted turn to prevent accidental cross-workspace context bleed.
- title is deterministic from the first user message initially; no extra model call is required.
- provider/model are safe affinity metadata only, never credential identity.

### chat_turns

Fields:
- turn_id TEXT PRIMARY KEY
- conversation_id TEXT
- client_request_id TEXT UNIQUE
- runtime_task_id TEXT NULL
- status TEXT: queued | running | finalized | failed | interrupted | cancelled
- provider_id TEXT NULL
- model TEXT NULL
- iterations INTEGER
- retrieval_count INTEGER
- error_code TEXT NULL
- created_at_ms
- started_at_ms
- completed_at_ms

### chat_messages

Fields:
- message_id TEXT PRIMARY KEY
- conversation_id TEXT
- turn_id TEXT
- role TEXT: user | assistant
- content TEXT
- status TEXT: committed | failed | interrupted
- created_at_ms

No raw tool arguments/results, API keys, authorization tokens, hidden model reasoning or full Memory retrieval payload are stored in the chat DB.

## 6. Transcript and model-context policy

The local UI may display the retained thread, but the model receives only a bounded deterministic conversation window.

Initial planned context policy:
- use recent completed turns only;
- at most 24 prior user/assistant messages;
- maximum 48,000 characters of prior chat context;
- per-message bounded length;
- only committed user messages and successfully finalized assistant messages enter future context;
- failed/interrupted assistant output is excluded from future context.

Model input order:
1. Agent Core system/runtime contract.
2. current Memory-first context.
3. current procedure/Skill/pattern synthesis packet.
4. bounded prior conversation messages in original role order.
5. current user message.

Memory retrieval query should additionally use bounded snippets from the latest user turns plus the current message and workspace.

Chat history remains conversation state, not canonical Memory. No automatic transcript summarization is required in the first implementation wave.

## 7. Native controller/session changes

Current NativeAgentController.runTask() is one-shot:
- start session;
- begin task;
- run agent loop;
- finalize;
- close session.

Planned API:

runConversationTurn({ conversationId, sessionId, prompt, workspace, history, clientRequestId, eventSink })

Behavior:
- require an existing active runtime session;
- reject a second simultaneous task in the same session;
- begin a distinct AgentRuntimeTask for the turn;
- execute the same Memory-first/tool/failure-learning/verification/Learning lifecycle;
- return the final user-facing answer only after finalization completes;
- do not close the session after a normal completed turn.

Backward compatibility:
- runTask() remains.
- It may become a wrapper that creates a temporary session, runs one turn, then closes it.

AgentRuntimeService additions likely include getSession(), ensureActiveSession(), one-running-task-per-session enforcement, interrupted-task reconciliation and conversation-safe close/archive helpers.

## 8. Provider/model continuity across turns and restart

Credential continuity is already durable through ProviderStateStore.

Conversation continuity additionally needs provider-route affinity because the current provider affinity Map is process-local.

Plan:
- extend safe internal provider response metadata with providerId and model;
- never return raw key material to the Chat UI;
- after a successful model call, persist the conversation/session preferred provider/model;
- subsequent turns prefer the last successful provider first;
- if that route becomes unhealthy, normal provider failover remains allowed;
- after failover success, update the preferred provider/model;
- after Core restart, restore the provider preference while PersistentCredentialScheduler independently resumes the next eligible credential.

Initial user-facing routing mode:
- Auto / sticky healthy provider.

Explicit provider/model selection is deferred until the conversation runtime is stable.

## 9. Safe turn-event contract

Interactive UX needs progress without exposing internal private reasoning.

Planned event type:
AgentTurnEvent

Allowed event families:
- turn.accepted
- memory.recall.started
- memory.recall.completed with count only
- agent.planning with generic phase status
- tool.started with tool name only
- tool.completed with tool name + success/failure
- verification.started
- verification.completed
- learning.finalization.started
- learning.finalization.completed
- provider.route.changed with safe provider/model identity
- assistant.final
- turn.failed
- turn.cancelled

The UI event surface must not contain private reasoning text, raw tool arguments/results, full Memory payloads, secrets, credential identifiers, or launcher authentication material.

These events are presentation/observability events, not a second evidence authority.

## 10. HTTP contract

Existing:
- POST /agent/run remains one-shot and loopback/token protected.

Planned additive routes:

- GET /agent/chat/conversations
  - list local conversation metadata.

- POST /agent/chat/conversations
  - create conversation + runtime session.

- GET /agent/chat/conversations/:conversationId
  - load conversation metadata, committed messages and current turn state.

- POST /agent/chat/conversations/:conversationId/turns
  - submit one user turn;
  - requires clientRequestId;
  - streams safe events using NDJSON;
  - final event carries the finalized assistant response.

- POST /agent/chat/turns/:turnId/cancel
  - request bounded cancellation.

- POST /agent/chat/conversations/:conversationId/archive
  - archive the thread and close the runtime session when safe.

All routes remain loopback-only, launcher-token protected, and bounded in request/message size.

No new public MCP tool is planned. Chat remains a local desktop transport over the existing native controller.

## 11. Launcher/WebView bridge

Current launcher waits for RunAgentAsync() to return one complete JSON result.

Planned launcher additions:
- CreateAgentConversationAsync
- ListAgentConversationsAsync
- ReadAgentConversationAsync
- RunAgentTurnStreamAsync
- CancelAgentTurnAsync
- ArchiveAgentConversationAsync

For streamed turns:
- use HttpClient ResponseHeadersRead;
- read NDJSON incrementally;
- forward safe events to WebView with conversationId / turnId / requestId;
- keep the ephemeral UI token inside launcher-owned code.

Planned WebView input messages:
- agent-chat-create
- agent-chat-list
- agent-chat-open
- agent-chat-send
- agent-chat-cancel
- agent-chat-archive

Planned WebView outputs:
- agent-chat-state
- agent-chat-list-result
- agent-chat-event
- agent-chat-error

Existing agent-run stays available until the interactive path is resident-verified.

## 12. React Chat UX

Current ChatPage is single-prompt/single-result.

Target layout:

Left rail:
- New Chat
- recent conversations
- active/archived state
- deterministic title
- last-updated timestamp

Main thread:
- user and assistant message bubbles
- finalized assistant text
- per-turn safe activity/status row
- current provider/model label
- error/interrupted/cancelled turn state
- scroll restoration

Composer:
- workspace selected when creating a new chat;
- workspace locked for an established thread;
- Enter sends and Shift+Enter adds newline;
- Stop while the current conversation has a running turn;
- Retry creates a new turn and never rewrites prior task history.

React state must be conversation-keyed, not one global AgentRunState.

Initial rendering may remain safe plain/pre-wrapped text. Rich Markdown can be a later, separately hardened addition.


## 13. Idempotency and duplicate-request protection

Every send operation receives a UI-generated `clientRequestId`.

The chat store enforces this ID as unique. Repeating the same request ID returns the existing turn state instead of creating another runtime task.

Rules:
- one active turn per conversation/session;
- separate conversations may progress independently;
- transport retry must not create duplicate tool execution;
- provider scheduler remains the cross-request credential concurrency authority.

## 14. Turn stop and restart recovery

A running turn may receive a stop request.

The controller checks the request between normal execution steps. After a stop is observed, it does not begin another provider or tool step.

Chat state records the turn as stopped. It is not reused as negative learning evidence.

After Agent Core restarts, any chat turn that had been marked running is changed to interrupted, its runtime task is closed as non-success, and the conversation remains available for a fresh next turn.

Only fully finalized assistant output is committed to the persistent thread.
## 15. Security and privacy

Chat persistence may contain sensitive user text, so it has stricter boundaries than Activity logs.

Requirements:
- local-only `chat.sqlite`;
- excluded from release packaging;
- never copied into canonical Memory automatically;
- transcript bodies are not written to Activity Tracker by default;
- raw Memory retrieval payloads are not duplicated into chat storage;
- raw tool arguments/results are not persisted in chat storage;
- provider secrets remain provider-config authority only;
- launcher UI token remains launcher-owned only;
- health exposes aggregate safe metadata only.

When a turn is sent to a remote model, only the bounded conversation context selected for that turn is included in that model request.

## 16. Implementation phases

### IAC-0 — Contract freeze / baseline
Inspect and freeze:
- NativeAgentController one-shot semantics;
- AgentRuntimeSession/Task state;
- Phase 1F /agent/run auth;
- launcher WebView bridge;
- current ChatPage.

No behavior change.

### IAC-1 — Durable conversation store
Create:
- `src\agent-chat-store.ts`
- chat.sqlite schema/migrations
- conversation/turn/message CRUD
- clientRequestId idempotency
- interrupted-turn detection.

Exit:
conversation + committed messages survive store reconstruction.


### IAC-2 — Persistent session turn API

Modify AgentRuntimeService and NativeAgentController.

Add:
- reuse an existing active session;
- enforce one running task per session;
- add a conversation-turn entrypoint;
- keep the session open after a successful turn;
- preserve the existing one-shot runTask wrapper.

Exit:
successive turns in one chat share the same runtime session while each turn keeps its own task identity and finalization.

### IAC-3 — Bounded conversation context and provider affinity

Add:
- bounded prior user/assistant messages to the model context;
- Memory retrieval query enrichment from the latest thread topic;
- safe providerId/model metadata on successful provider responses;
- persisted preferred provider/model for thread continuity.

Exit:
a follow-up turn can resolve prior thread context, and provider preference survives restart while credential rotation remains owned by the provider scheduler.

### IAC-4 — Chat service and safe event sink

Create likely:
- `src\agent-chat-service.ts`
- `src\agent-turn-events.ts`

Wire controller phase transitions, tool names, verification state and Learning finalization into the safe event contract.

Exit:
the UI can observe progress without receiving private reasoning or raw execution payloads.

### IAC-5 — Additive chat HTTP transport

Modify:
- `src\http\app.ts`
- `src\index.ts`

Add conversation list/create/read, turn submission, safe incremental turn events, stop request, and archive operations.

Keep `/agent/run` unchanged as the one-shot compatibility path.

Exit:
all interactive-chat routes preserve the current loopback and launcher-token security boundary.

### IAC-6 — Launcher streaming bridge

Modify:
- `src\launcher\AgentCoreRuntime.cs`
- `src\launcher\MainForm.cs`

Add conversation CRUD, incremental event forwarding, and stop-request forwarding while keeping the UI authentication token launcher-owned.

Exit:
WebView receives conversation state/events without direct access to the local authentication token.

### IAC-7 — Interactive React ChatPage

Modify:
- `src\ui\src\host.ts`
- `src\ui\src\App.tsx`
- `src\ui\src\pages.tsx`
- `src\ui\src\index.css`

Add conversation list, message timeline, per-turn status, send/stop/retry, provider/model metadata, and reload persistence.

Exit:
React state is conversation-keyed and accurately reflects finalized, failed, interrupted and running turns.

### IAC-8 — Recovery, security, and targeted qualification

Qualify:
- restart continuity;
- idempotent turn submission;
- transcript isolation;
- finalization-failure behavior;
- provider-affinity restart behavior;
- safe event payloads;
- compatibility with the existing one-shot route.

Exit:
the interactive path is source-qualified without bypassing existing Agent Core safety/lifecycle contracts.

### IAC-9 — Resident activation

After explicit lifecycle authorization:
- perform only the builds required for activation;
- reload/restart Agent Core;
- verify health;
- create a new conversation;
- perform multiple resident turns;
- restart Core again;
- reopen the same thread;
- continue with another turn;
- confirm provider scheduler state and Learning remain healthy.

Exit:
multi-turn chat continuity is resident-verified across an actual Core restart.
## 17. Planned ownership and structural blast radius

Likely new files:
- `src\agent-chat-store.ts`
- `src\agent-chat-service.ts`
- `src\agent-turn-events.ts`
- `tests\agent-chat-store.test.ts`
- `tests\agent-chat-controller.test.ts`
- `tests\agent-chat-transport.test.ts`

Likely modified backend:
- `src\agent-runtime.ts`
- `src\agent-controller.ts`
- `src\agent-provider.ts`
- `src\http\app.ts`
- `src\index.ts`

Likely modified launcher:
- `src\launcher\AgentCoreRuntime.cs`
- `src\launcher\MainForm.cs`
- launcher test project / new chat transport tests

Likely modified React:
- `src\ui\src\host.ts`
- `src\ui\src\App.tsx`
- `src\ui\src\pages.tsx`
- `src\ui\src\index.css`
- `src\ui\src\App.test.tsx`

Current Grafel impact review shows controller changes affect index plus controller/cumulative-learning/runtime integration tests; HTTP app changes affect index, MCP handler, agent UI transport and HTTP/auth tests. ChatPage is resolved in the current graph.


## 18. Targeted acceptance matrix — core conversation lifecycle

### C1 — Create and resume
Create a conversation, complete one turn, reconstruct the chat service, and reload it.

PASS:
same conversation ID, runtime session ID, and committed transcript return.

### C2 — Multi-turn session identity
Complete two turns in one conversation.

PASS:
same runtime session, distinct runtime task IDs, and both turn finalizations complete.

### C3 — Prior-turn context
Turn 2 references information from Turn 1.

PASS:
the agent resolves the reference from the bounded thread context.

### C4 — Chat history is not Memory
Send a distinctive chat-only fact.

PASS:
it remains available from chat history but does not appear as canonical Memory unless the existing Learning path separately captures verified durable knowledge.

### C5 — Existing Agent lifecycle
Use Memory, Skill, or tool evidence in a later chat turn.

PASS:
retrieval, use receipts, verification, and Learning finalization remain unchanged.

## 19. Targeted acceptance matrix — routing and isolation

### C6 — Routing continuity
Complete one chat turn, reload the conversation runtime, then continue.

PASS:
the conversation keeps its safe model-route preference while the lower-level runtime continues its independent scheduling state.

### C7 — Route recovery
Exercise a controlled upstream route outage in a fixture.

PASS:
the turn can continue on another available route, and the UI receives only safe route/status metadata.

### C8 — Conversation isolation
Create two chats with different thread facts.

PASS:
no transcript context crosses conversation boundaries.

### C9 — Duplicate request ID
Submit the same clientRequestId twice.

PASS:
one chat turn and one runtime task exist.

### C10 — Safe progress events
Exercise Memory recall, tool use, verification, and Learning.

PASS:
events contain only approved phase/tool/status metadata.

### C11 — Stop and restart recovery
Stop one controlled fixture turn and separately restart Core during another controlled fixture.

PASS:
no incomplete assistant result is marked finalized, and the conversation can continue afterward.

## 20. Targeted acceptance matrix — compatibility and resident proof

### C12 — Finalization failure
Force a controlled Learning finalization error.

PASS:
the UI does not receive a successful assistant completion and the turn stays visibly unresolved.

### C13 — Existing one-shot route
Run the current one-shot transport fixture.

PASS:
the legacy contract remains unchanged.

### C14 — Launcher/UI boundary
Inspect WebView envelopes and unauthorized local requests.

PASS:
launcher-owned authentication stays private and chat routes reject unauthenticated access.

### C15 — Resident end-to-end
New chat -> Turn 1 -> Turn 2 -> restart Core -> reopen chat -> Turn 3.

PASS:
conversation/session continuity, routing preference, persistent scheduler state, Memory-first context, and Learning finalization are healthy after restart.

## 21. Hard acceptance gates

Interactive Chat is not accepted merely because a message bubble appears.

Required:
1. durable conversation storage;
2. one chat maps to one durable runtime session;
3. one user turn maps to one independently finalized task;
4. bounded prior-turn context;
5. transcript is not automatically canonical Memory;
6. existing Memory, Skills, tools, verification, and Learning remain authoritative;
7. lower-level provider scheduling remains internal infrastructure;
8. safe model-route preference can survive restart without persisting secrets in chat state;
9. one active turn per conversation;
10. duplicate-request protection;
11. safe UI progress events;
12. finalized response withheld when finalization fails;
13. interrupted turns recover without false success;
14. thread resumes after Core restart;
15. loopback/launcher authentication boundary remains intact;
16. existing one-shot route stays compatible;
17. no new public MCP tool or second machine-control path is introduced.

## 22. Deferred features

Not required for the first interactive-chat acceptance:
- token-by-token provider output streaming;
- explicit provider/model selector;
- file/image attachments;
- voice;
- multi-agent orchestration;
- autonomous background work;
- semantic transcript summarization;
- cloud synchronization;
- automatic transcript-to-Memory ingestion.

The first milestone is a reliable persistent local conversation with safe progress events and full Agent Core lifecycle continuity.

## 23. Release and activation boundary

This document is planning authority only.

Implementation will be material shipped behavior and should create one dedicated changeset when source work begins.

This planning task does not perform product implementation, dependency installation, build/test execution, version changes, resident restart, publication, or Git-history changes.

Expected architecture after later implementation:

Agent Core desktop Chat
  -> persistent local conversation
  -> durable Native Agent session
  -> bounded prior-turn context
  -> Memory-first + Skills/Procedures
  -> existing MCP tools
  -> verification + Learning per turn
  -> persistent provider scheduler
  -> finalized assistant response
  -> survives Agent Core restart

At that point the user can talk continuously with the AI Agent living inside Agent Core while provider/credential mechanics remain internal infrastructure rather than conversational responsibilities.

## 24. Implementation result — 2026-10-02

Status after authorized execution:
- IAC-0 through IAC-8 are source-implemented and targeted-qualified.
- IAC-9 resident activation remains pending a supported launcher-owned Core restart.
- No new dependency installation was required.
- Existing concurrent chat source already present in the worktree was inspected and reused rather than overwritten; only evidence-backed gaps were repaired.

Implemented owners:
- `src\agent-chat-store.ts`
- `src\agent-chat-service.ts`
- `src\agent-turn-events.ts`
- `src\agent-runtime.ts`
- `src\agent-controller.ts`
- `src\agent-provider.ts`
- `src\http\app.ts`
- `src\index.ts`


Desktop bridge/UI owners:
- `src\launcher\AgentCoreRuntime.cs`
- `src\launcher\MainForm.cs`
- `src\ui\src\host.ts`
- `src\ui\src\App.tsx`
- `src\ui\src\pages.tsx`
- `src\ui\src\index.css`

Targeted qualification owners:
- `tests\agent-chat-store.test.ts`
- `tests\agent-chat-service.test.ts`
- `tests\agent-controller.test.ts`
- `tests\agent-runtime-integration.test.ts`
- `tests\agent-ui-transport.test.ts`
- `tests\agent-provider-pool.test.ts`
- `tests\agent-provider-scheduler.test.ts`
- `src\ui\src\App.test.tsx`
- `src\launcher.tests`


### 24.1 Implemented conversation contract

- One chat conversation owns one durable Agent Runtime session.
- Every user turn creates a distinct Agent Runtime task and keeps the existing verification/Learning finalization boundary.
- Conversation transcript persists in `runtime\agent-runtime\chat.sqlite` and is separate from canonical Memory.
- Bounded prior committed turns are supplied as conversation context; failed/interrupted assistant results are excluded.
- The Memory query is strengthened with recent user-thread context without converting transcript into Memory.
- `clientRequestId` is unique and makes turn submission idempotent.
- One running turn per conversation is enforced.
- Running turns found after reconstruction are marked interrupted and reconciled without a successful assistant message.
- Stopped turns do not become reusable negative-learning evidence.


### 24.2 Provider and transport continuity

- Safe provider/model preference is stored with the conversation and restored into the Agent Runtime session after reconstruction.
- PersistentCredentialScheduler remains the only credential-selection authority; no raw credential is stored in chat state or exposed to UI.
- Existing `POST /agent/run` remains compatible.
- Additive loopback/UI-token protected chat routes provide conversation list/create/read, turn submission, stop and archive.
- Turn execution streams NDJSON envelopes containing only the safe AgentTurnEvent contract and the final result/error envelope.
- Launcher consumes the NDJSON stream using `ResponseHeadersRead` and forwards safe envelopes into the WebView.
- React now uses conversation-keyed chat state with thread list, transcript, provider/model label, send/stop/retry-style continuation, and persisted reopen behavior.


### 24.3 Recovery repair performed in this task

A real UX recovery gap was found in the pre-existing launcher bridge: when a streamed turn failed or was stopped, the launcher emitted an error but did not immediately refresh the conversation detail.

`MainForm.cs` now performs a best-effort conversation readback after a chat-turn exception, emits the refreshed `agent-chat-state`, and refreshes desktop status.

This does not change Agent Runtime semantics. It ensures the UI immediately sees the persisted failed/stopped state instead of retaining stale transcript state until the user manually reopens the conversation.

The provider-affinity service test also received a local 30-second timeout because isolated execution completed in about six seconds while the original 15-second default could expire only under parallel import/contention load. No production behavior was changed for that timeout.


### 24.4 Qualification evidence

Root build:
- `npm run build` — PASS
- path policy — 296 authored files / 0 exceptions
- TypeScript compile — PASS

Targeted backend qualification:
- 6 files / 26 tests PASS / 0 failed
- chat store 5/5
- chat service 5/5
- controller 4/4
- runtime integration 1/1
- chat HTTP transport 5/5
- provider pool 6/6

Provider scheduler qualification was also separately observed at 10/10 PASS.


Desktop UI qualification:
- TypeScript typecheck PASS
- React/Vitest 4/4 PASS
- Vite production build PASS

Launcher qualification after the recovery patch:
- C# Release build PASS
- 0 warnings / 0 errors
- launcher tests 16/16 PASS

These targeted checks cover conversation persistence, multi-turn session reuse, bounded context, idempotency, provider-affinity reconstruction, stopped/interrupted turn behavior, finalization failure, loopback/token transport, NDJSON events, existing Native Agent lifecycle, provider-pool compatibility, React chat routing, and launcher compilation.


### 24.5 Structural and security review

Grafel was explicitly reindexed from the final source and is current/integrity-accepted at:
- 11,048 entities
- 59,545 relationships
- registered repository coverage 1/1

The graph resolves `AgentChatService`, `AgentChatStore`, and `runConversationTurn`. Impact review links the new conversation path to NativeAgentController, HTTP/index composition, and direct chat/controller/runtime tests.

Changed-source security analysis reported eight high shell-exec findings in `agent-chat-store.ts`. Exact source verification shows all eight are false positives on Node `DatabaseSync.exec()` calls containing only static SQLite PRAGMA/transaction/schema/index SQL. User/content values are passed through prepared statements; no shell/process execution exists in that store.

Grafel test reachability was not used as pass/fail evidence because the provider reported no ingested coverage report. Executed targeted tests above are the qualification authority.


### 24.6 Release and activation boundary

Material behavior intent:
- `.changeset\20261002-interactive-native-agent-chat.md`
- type: minor
- unapplied

Not performed:
- version mutation;
- release application/publication;
- Git-history mutation;
- manual Core process replacement.

The supported Core restart authority is owned by the desktop launcher. No independent CLI/HTTP restart surface exists, and manually replacing the process could lose launcher-owned ephemeral UI-token/environment continuity.

Therefore the correct closure state is:

**SOURCE IMPLEMENTED + BUILD/TARGETED VERIFIED; RESIDENT IAC-9 ACTIVATION PENDING.**


## 25. IAC-9 resident acceptance — pre-restart stage

Fresh resident readback after the launcher-owned restart:
- `agentChat.status=available`
- `conversationCount=0` before acceptance
- `runtime\agent-runtime\chat.sqlite` exists
- Agent Runtime remains available with 3/3 configured provider routes
- Memory health remains available with issueCount 0

Authoritative acceptance conversation:
- conversation ID: `51bb881d-b832-4aba-86f2-7696b45f1541`
- durable runtime session ID: `9bc41f9c-7e2c-47d6-9a32-cbd7a63bec7f`
- workspace: `agent-core`
- preferred provider/model before restart-continuity test: Atria / Atria-Dawn-Preview

Pre-restart turn evidence:
- first bounded turn finalized verified in 3 iterations with one Memory retrieval;
- a follow-up turn reached the finalization guard and correctly failed with `AGENT_RUNTIME_VERIFICATION_EVIDENCE_REQUIRED` instead of producing a false successful assistant message;
- a materially changed recovery turn on the same durable session finalized verified in 2 iterations and correctly recovered the thread-local marker from conversation context;
- all three runtime tasks belong to the same durable session;
- the conversation remains active and resumable;
- the failed follow-up has no assistant message committed;
- provider affinity remains Atria / Atria-Dawn-Preview;
- persistent provider rotation is at Atria sequence 10.

The thread-local acceptance marker is intentionally not copied into this document or canonical Memory before restart-continuity verification.

## 26. IAC-9 final resident closure — PASS

Final restart-continuity acceptance completed after the second launcher-owned Core restart.

Post-restart resident readback proved:
- Agent Chat remained available with no running turn;
- the authoritative conversation `51bb881d-b832-4aba-86f2-7696b45f1541` was still active;
- its durable runtime session remained exactly `9bc41f9c-7e2c-47d6-9a32-cbd7a63bec7f`;
- pre-restart transcript, prior finalized tasks and the intentional failed verification-guard turn were all preserved;
- preferred provider/model remained Atria / Atria-Dawn-Preview;
- canonical Memory still did not contain the private thread-local acceptance marker.


Post-restart Turn 3:
- HTTP chat transport returned success;
- turn ID `bd18120c-f811-4778-bc51-f13b8266cc81`;
- runtime task ID `93114e57-6d74-4119-a49a-21beb98a14b8`;
- task session ID remained the same durable runtime session;
- status finalized;
- terminal outcome verified;
- verification reference `verification:iac9-post-restart-context`;
- Learning finalization complete;
- provider/model Atria / Atria-Dawn-Preview;
- two model iterations with one Memory retrieval attempt;
- final response correctly recovered the pre-restart thread-local marker from persisted conversation context.


Isolation and infrastructure evidence:
- an exact canonical Memory search for the thread-local marker still returned no matching Memory record;
- therefore post-restart recovery is attributable to persisted chat context rather than canonical Memory contamination;
- persistent provider rotation advanced from Atria sequence 10 before restart-continuity completion to sequence 12 afterward;
- Agent Runtime remained available with pendingFinalizationCount 0;
- Memory and Learning health remained issue-free;
- the empty duplicate acceptance conversation created during an earlier idempotency-conflict retry was archived through the supported chat API and not deleted from storage.

This closes acceptance C1–C15 and IAC-0–IAC-9 for the implemented scope.


Final implementation state:

**SOURCE IMPLEMENTED + TARGETED QUALIFIED + RESIDENT ACTIVATED + MULTI-TURN VERIFIED + RESTART CONTINUITY VERIFIED.**

The material changeset remains unapplied. No release application, version mutation, Git-history mutation, publication, or deployment was performed as part of this closure.


## 27. Next-phase handoff — Native Agent Capability Parity

IAC-0..IAC-9 remain complete and are not reopened by the next phase.

Current Native Agent anatomy after IAC closure:
- persistent Interactive Chat: resident verified;
- canonical Memory-first retrieval: shared and verified;
- Learning/finalization: shared and verified;
- Skills/Procedures/Grafel synthesis: shared controller context;
- provider/model routing and persistent credential scheduling: resident verified;
- ordinary MCP tool grant: currently only `get_config`.

Next planning authority:
`docs\Agent-Core-Native-Agent-Capability-Parity-Plan-20261002.md`

The next phase expands functional access to the existing Agent Core body through task-scoped capability grants and adds a native web-research/search capability where Agent Core currently lacks platform-independent parity. It does not create a second chat, Memory, Learning system, MCP server, or machine-control layer.

### 2026-10-02 capability-parity handoff update

The next-phase NACP roadmap is now source-implemented and targeted-qualified through NACP-0..NACP-9. Interactive Chat remains the resident conversation/session substrate; it is not replaced. The remaining gate is NACP-10 resident activation after the launcher reloads the prepared dynamic capability policy and new build.
