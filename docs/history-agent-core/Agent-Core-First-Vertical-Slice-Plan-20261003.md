# Agent Core Beyond Hermes — First Vertical Slice Plan

**Status:** IMPLEMENTATION PLAN ONLY — NOT EXECUTED  
**Date:** 2026-10-03  
**Working title:** Durable Turn Continuation + Provider Transition Guard  
**Short ID:** `DTC-1`

---

# 1. Why this slice first

Agent Core already has:
- verified cumulative Memory/Learning;
- persistent provider credential scheduling;
- provider failover;
- durable completed chat turns;
- restart-stable conversations;
- Mutation Safety replay protection;
- verification/finalization.

The largest source-grounded reliability gap is narrower:

> The in-progress Native turn is not yet represented as a durable provider-independent transcript containing tool calls/results and controller continuation state.

Hermes demonstrably persists tool-call progress before executing tools. Agent Core currently treats a process-interrupted running turn as terminal:
- `AgentChatService.initialize`
- `reconcileInterruptedTurns()`
- running chat turn becomes interrupted;
- still-running runtime task is marked failed and finalized.

That behavior is honest and safe, but not resumable.

Therefore the first slice should improve **continuation**, not add another Memory/router/Skill subsystem.

---

# 2. Vertical-slice outcome

One controlled multi-turn task should demonstrate:

1. canonical conversation exists;
2. task starts with no solution hint;
3. provider/key A fails;
4. same-provider credential or compatible provider B continues from the same canonical turn state;
5. a tool call/result is durably checkpointed;
6. simulated process/service reconstruction occurs after a safe checkpoint;
7. turn is explicitly resumed;
8. no mutation is duplicated;
9. final result is independently verified;
10. verified recovery becomes reusable experience;
11. a later held-out task gets that recovery experience through ordinary recall, without naming its Skill/procedure or solution;
12. later task succeeds with no equivalent repeated failure.

The first implementation does **not** require public/live providers.

Use deterministic loopback provider fixtures.

---

# 3. Gap matrix

| Need | Hermes / donor mechanism | Agent Core now | Evidence | Gap | Minimum change | Regression test |
|---|---|---|---|---|---|---|
| Crash-safe in-turn state | Hermes incremental tool-call/session flush | chat.sqlite stores user/final assistant; runtime episodes store summaries | `agent-chat-store.ts:187+`; Hermes test line 108+ | canonical tool-call/result replay state absent | durable turn checkpoint | reconstruct service after tool result and resume |
| Key failover | Hermes CredentialPool; routers key skip/cooldown | PersistentCredentialScheduler already complete | PCR resident + tests | no material gap | none | preserve current scheduler tests |
| Provider failover | Hermes/router failover | ProviderPool already fails over | provider pool source/tests | compatibility not explicit | conservative transition guard | incompatible model route rejected |
| Provider affinity | Hermes route/session mechanisms; Omni pin | chat DB preferred provider/model | IAC restart proof | completed-turn affinity only | include route state in checkpoint | preferred route preserved after resume |
| Side-effect replay | Hermes tool progress persistence | McpMutationSafety refuses uncertain replay | mutation-safety source/tests | checkpoint not linked to active turn | persist invocation IDs + result phase | no second mutation after reconstruction |
| Unknown mutation outcome | donor status/reconciliation patterns | Mutation Safety returns UNCERTAIN | source | controller resume policy undefined | fail-safe reconciliation state | uncertain fixture never replayed |
| Long context switch | Hermes context compressor | bounded history only | source | no provider-change compaction contract | define invariant now; defer engine | compatibility/fail-closed test |
| Tool/model compatibility | routers know model route availability | route config only id/base/model/credentials | `agent-provider.ts` route interface | can silently move to differently capable model | v1 same-model conservative guard | different model skipped/blocked |
| Reuse learned recovery | Hermes background review + skills | Agent Core procedures/Skills/Memory + receipts | EC baseline | no no-hint benchmark | benchmark held-out reuse; no new store | recovery learning held-out task |
| Stale learning | Hermes background review patches outdated skill | Agent Core authority/supersession + negative procedure evidence | Memory/Learning source | behavior not benchmarked no-hint | no code change first | T3 benchmark |
| Independent verification | Hermes verification ledger | Agent Core task verification/finalization | both source-grounded | generic oracle selection is task-specific | benchmark verifier adapters, not core "truth" service | deterministic/schema/human-oracle tasks |
| Cost control | Hermes context/prompt-cache budgets | Agent Core attempts/metrics but less compression/cost engineering | source | secondary efficiency gap | measure first; defer implementation | token/cost metric only |

---

# 4. Minimal source changes

## 4.1 `src\agent-chat-store.ts`

### Current owner

`AgentChatStore`

Current schema has:
- conversations;
- turns;
- user/assistant messages.

### Proposed change

Add a durable checkpoint table, versioned through the existing chat SQLite owner.

Suggested table:

```text
chat_turn_checkpoints
  turn_id              PRIMARY KEY
  revision             INTEGER
  phase                TEXT
  controller_state_json TEXT
  provider_id          TEXT NULL
  model                TEXT NULL
  route_epoch          INTEGER
  tool_schema_digest   TEXT NULL
  updated_at_ms        INTEGER
```

`controller_state_json` must be bounded and validated on read.

Minimum content:
- current `AgentModelMessage[]` for this turn, including assistant tool_calls and tool results;
- iteration;
- approved capability families;
- granted tool names;
- strategy state/fingerprint sufficient to preserve retry rules;
- retrieval attempt IDs;
- current evidence refs;
- mutation invocation IDs and phase;
- last provider/model.

Do not store secrets.

Methods:
- `writeTurnCheckpoint(...)`
- `getTurnCheckpoint(turnId)`
- `clearTurnCheckpoint(turnId)`
- optional `markTurnResumable(...)`

Migration:
- preserve existing schema/data;
- add table with `CREATE TABLE IF NOT EXISTS`;
- if schema version is bumped, migration must be monotonic and covered by a legacy-v1 fixture.

Do not reset `chat.sqlite`.

## 4.2 `src\agent-controller.ts`

### Current owner

`NativeAgentController.runTaskInternal`

### Proposed change

Introduce an internal resume path; do not create a second controller.

Possible shape:

```text
runConversationTurn(...)
resumeConversationTurn(checkpoint,...)
       ↓
shared internal execution loop
```

The shared loop must accept:
- existing task;
- existing message/tool transcript;
- existing capability grant;
- strategy/retry state;
- prior retrieval/evidence IDs;
- route affinity.

Checkpoint writes at:
1. after context/grant;
2. after accepted provider response containing tool calls;
3. before mutating tool dispatch;
4. after tool result;
5. after strategy change;
6. before next provider request;
7. before finalization.

Do not checkpoint hidden chain-of-thought.

Checkpoint only model-visible/control-plane state.

## 4.3 `src\agent-runtime.ts`

### Current issue

`runConversationTurn` currently starts a new runtime task through `beginTask`.

### Proposed change

Add a bounded existing-task resume contract, for example:
- `resumeTask(taskId, sessionId)`
or an internal equivalent.

It must reject:
- already finalized task;
- task belonging to another session;
- task with finalization pending;
- terminal failed/verified task unless explicit supported recovery state says otherwise.

The original task ID should remain stable during resume.

Do not create a second task just to continue the same turn.

## 4.4 `src\agent-chat-service.ts`

### Current behavior

`reconcileInterruptedTurns()` terminalizes interrupted running tasks.

### Proposed behavior

At initialization:

For every previously-running turn:
1. mark chat turn interrupted;
2. inspect latest checkpoint;
3. if checkpoint absent/invalid/unsafe:
   - keep current behavior;
   - mark runtime task failed and finalize;
4. if checkpoint is safe:
   - do **not** call provider automatically;
   - leave task in a resumable interrupted state;
   - expose resumability through read-only conversation detail.

Add explicit resume action.

Preferred API design:
- service method `resumeTurn(conversationId, turnId, eventSink?)`.

If an HTTP route is required, use a clearly named explicit resume endpoint rather than silently resuming on server startup.

Autonomous restart must not trigger external calls.

## 4.5 `src\agent-provider.ts`

Do not rewrite the pool.

Add minimal provider-transition metadata and conservative compatibility.

### Key rotation

No behavior change required.

Same provider/model sibling credential rotation remains scheduler-owned.

### Cross-provider v1 compatibility

For DTC-1, allow automatic provider change only when:
- both routes use the existing OpenAI-compatible contract;
- configured model identifier is exactly the same;
- active tool schema digest is unchanged.

If route model differs:
- do not silently transition in DTC-1;
- continue to an exact-compatible route or fail with bounded `AGENT_RUNTIME_PROVIDER_COMPATIBILITY_UNKNOWN`.

This deliberately chooses safety over broad model fallback for the first slice.

A richer provider capability descriptor can be a later change if the benchmark proves it necessary.

## 4.6 `src\mcp\mutation-safety.ts`

### First slice

Avoid changing journal format unless tests prove it necessary.

Checkpoint stores:
- invocation ID;
- tool;
- current mutation phase.

Recovery policy:
- same invocation replay attempt is safe because Mutation Safety blocks duplicate execution;
- however existing terminal receipt does not store the original tool result.

Therefore:

- terminal receipt + durable tool-result checkpoint → resume normally;
- received/no terminal → stop/reconcile as uncertain;
- terminal success but no durable tool-result checkpoint → do **not** pretend the tool result is known; enter `SIDE_EFFECT_RESULT_UNAVAILABLE` and reconcile by tool-specific readback when available.

A later improvement may add bounded replay-result persistence to Mutation Safety, but that is **not required to implement DTC-1 safely**.

---

# 5. Provider transition events

Extend `src\agent-turn-events.ts` only if needed for inspectable evidence.

Candidate events:
- `turn.checkpoint.persisted`
- `provider.transition.started`
- `provider.transition.completed`
- `turn.resume.available`
- `turn.resume.started`
- `turn.resume.blocked`

Do not make events the source of truth.

SQLite/runtime state remains authority.

---

# 6. Test plan

Only targeted tests are proposed here. Do not run them until implementation/testing is authorized.

## DTC-A1 — legacy chat migration

Create legacy schema-v1 chat DB.

Open new store.

PASS:
- existing conversations/turns/messages preserved;
- checkpoint table becomes available;
- no data reset.

## DTC-A2 — checkpoint round trip

Persist a checkpoint containing:
- user message;
- assistant tool call;
- tool result;
- strategy fingerprint;
- grant/tool digests;
- evidence refs.

Reopen store.

PASS:
exact bounded canonical state reconstructed.

## DTC-A3 — same-provider 429 key rotation

Loopback provider:
- key 01 -> 429;
- key 02 -> success/tool call.

PASS:
- one turn/task;
- scheduler state unchanged from existing contract;
- checkpoint state contains no raw key;
- context identical across attempts.

## DTC-A4 — compatible provider transition

Provider A -> 503 before output.

Provider B:
- different provider id;
- same model id;
- supports same OpenAI-compatible tool schema.

PASS:
- provider transition occurs;
- same turn/task;
- tool request context preserved.

## DTC-A5 — incompatible model blocked

Provider A fails.

Provider B has a different model identifier.

PASS:
- B is not silently called by DTC-1;
- task reports compatibility blocked if no exact-compatible route exists;
- no capability/tool weakening.

## DTC-A6 — checkpointed read-only tool + reconstruction

Run until a read-only tool result is checkpointed.

Reconstruct AgentChatService / controller / runtime fixture.

Explicitly resume.

PASS:
- same task ID;
- result remains in provider message history;
- tool need not be repeated unless controller independently chooses and it is safe.

## DTC-A7 — mutating tool completed before reconstruction

Mutation fixture:
- invocation ID `X`;
- server ledger confirms one operation;
- durable checkpoint contains terminal tool result.

Reconstruct and resume.

PASS:
- external ledger count remains one;
- same invocation not executed twice;
- final answer uses the prior result.

## DTC-A8 — mutation uncertain

Interrupt after Mutation Safety received record but before terminal.

Reconstruct/resume.

PASS:
- no replay;
- turn status becomes blocked/uncertain or runs a supported readback;
- external ledger count never exceeds one.

## DTC-A9 — terminal receipt but result checkpoint missing

Simulate:
- mutation terminal success exists;
- process dies before result checkpoint.

PASS:
- no replay;
- no fabricated tool result;
- returns `SIDE_EFFECT_RESULT_UNAVAILABLE` or successful readback reconciliation.

## DTC-A10 — cancellation

Abort while provider request waits.

PASS:
- turn stopped truthfully;
- healthy credential not penalized solely for cancellation;
- no automatic resume at service startup.

## DTC-A11 — finalization continuity

Resume a safe checkpoint to a successful deterministic task.

PASS:
- same task reaches terminal verified;
- Learning finalization completes once;
- knowledge/artifact outcomes recorded once.

## DTC-A12 — no-hint recovery reuse

Learning run:
- provider/key recovery + task verified;
- candidate recovery experience submitted through normal Agent Core learning mechanism if it qualifies.

Held-out run:
- related but different fixture;
- prompt does not mention recovery, procedure or Skill.

PASS:
- relevant experience retrieved naturally;
- current applicability checked;
- no equivalent repeated failure;
- final oracle passes;
- knowledge/artifact-use outcome recorded.

---

# 7. Required regression preservation

The implementation must keep these accepted properties:

- PCR exact restart credential rotation;
- cooldown persistence;
- invalid credential isolation;
- model-scope failure isolation;
- provider breaker behavior;
- IAC conversation restart continuity;
- clientRequestId idempotency;
- NACP task-scoped grants;
- direct ungranted tool denial;
- Memory retrieval/use attribution;
- Learning finalization;
- Mutation Safety duplicate suppression;
- secret non-disclosure.

---

# 8. First benchmark target after implementation

Use one deterministic scenario combining:

1. multi-turn conversation;
2. previous turns establish constraints;
3. new turn starts;
4. provider A key 01 gets 429;
5. provider A key 02 or provider B same-model route continues;
6. model requests one mutating fixture tool;
7. checkpoint after tool result;
8. reconstruct service;
9. explicit resume;
10. verify artifact independently;
11. finalize Learning;
12. run held-out related task without recovery hints.

This single vertical slice exercises:
- provider state;
- chat state;
- tool state;
- mutation safety;
- verification;
- Learning/reuse.

That is a better engineering milestone than implementing multiple unrelated Hermes features.

---

# 9. Risks

## Risk: checkpoint becomes a second runtime state system

Mitigation:
- checkpoint is a projection owned by AgentChatStore;
- task authority remains AgentRuntimeService;
- provider operational authority remains ProviderStateStore;
- semantic knowledge remains Memory/Learning.

## Risk: checkpoint contains secret/tool-sensitive data

Mitigation:
- never persist provider secret;
- checkpoint only model-visible tool/result data already allowed by Agent Core;
- preserve existing redaction;
- add fixture asserting secrets absent from SQLite bytes.

## Risk: checkpoint JSON grows without bound

Mitigation:
- bounded messages/result size;
- digest large immutable artifacts and preserve evidence refs;
- fail closed on overflow before introducing compaction.

## Risk: auto-resume produces surprise external work

Mitigation:
- no automatic provider/tool call at startup;
- startup only marks resumable state;
- explicit resume is a separate action.

## Risk: compatibility guard breaks existing broad provider failover

Mitigation:
- DTC-1 scope is explicit;
- same-provider key failover unchanged;
- exact same-model cross-provider transition supported;
- unknown different-model transition fails honestly;
- broaden only after capability metadata design.

## Risk: terminal receipt lacks replay result

Mitigation:
- safe stop/reconciliation policy;
- no duplicate execution;
- defer mutation-journal result replay until proven necessary.

---

# 10. Rollback

Because this is persistent schema behavior, rollback must not delete checkpoint data.

Implementation rollback procedure should be:

1. disable resume feature through configuration or code rollback;
2. old behavior remains:
   - interrupted running turns are terminalized failed;
3. leave checkpoint table ignored but intact;
4. do not downgrade/delete chat schema automatically;
5. provider scheduler and Memory/Learning remain untouched.

A code rollback must not require deleting `chat.sqlite`.

---

# 11. Decisions still required from user before implementation

The implementation can be made deterministic after the user chooses/accepts:

1. **Resume UX**
   - recommended: explicit resume action after restart, never automatic external work.

2. **Cross-provider DTC-1 policy**
   - recommended: automatic only for exact same model identifier; different model = blocked/explicit.

3. **Checkpoint retention**
   - recommended: keep latest checkpoint for active/interrupted turn; delete or compact it after finalization while retaining normal task evidence.

4. **Tool-result size limit**
   - recommended: bounded inline model-visible result; oversized result stored by existing artifact/evidence path and referenced.

No decision is needed about creating a new router or new Memory system; this plan rejects both.

---

# 12. Implementation instruction for the next session

When authorized, the implementer should:

1. start Memory-first;
2. verify current source hashes/HEAD because worktree is dirty;
3. inspect Grafel freshness and structural impact for:
   - AgentChatStore
   - AgentChatService
   - NativeAgentController
   - AgentRuntimeService
   - provider pool
   - Mutation Safety;
4. implement the checkpoint storage/migration first;
5. add targeted store tests;
6. add controller resume path;
7. preserve current unsafe/no-checkpoint interrupted-turn finalization fallback;
8. add conservative provider compatibility transition;
9. add DTC-A1..A11 targeted tests;
10. only after those pass, add DTC-A12 held-out reuse acceptance;
11. update affected CODEBASE section and material changeset in the same implementation task;
12. do not restart/live-test until separately authorized.

Stop if source has materially changed from this snapshot instead of patching from stale line assumptions.
