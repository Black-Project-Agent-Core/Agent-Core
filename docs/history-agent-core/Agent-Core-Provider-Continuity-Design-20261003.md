# Agent Core Provider / Key Continuity Design

**Status:** DESIGN ONLY — NOT IMPLEMENTED  
**Date:** 2026-10-03  
**Agent Core root:** `E:\Projects\Agent-Core`  
**P8:** not executed.

---

# 1. Goal

Preserve one Agent Core-owned task correctly when:
- a credential fails and another credential of the same provider is selected;
- a provider/model becomes unavailable and another compatible provider/model is selected;
- a request times out;
- a stream is interrupted;
- cancellation occurs;
- a tool with side effects already ran;
- the process exits between tool execution and the next model request.

The invariant is:

> **Provider requests are projections of canonical Agent Core task state. Provider responses are observations, not the sole storage of the task.**

Do not build a second agent runtime or router.

---

# 2. Existing foundation

## 2.1 Conversation and completed-turn continuity

Already implemented:

`E:\Projects\Agent-Core\src\agent-chat-store.ts`
- conversation identity;
- runtime session identity;
- user/final-assistant messages;
- turn identity;
- task identity;
- provider/model used by finalized turn;
- preferred provider/model.

`E:\Projects\Agent-Core\src\agent-chat-service.ts:177+`
- idempotent clientRequestId;
- same durable runtime session;
- persisted preferred provider restored as affinity;
- bounded history reconstruction;
- cancellation with AbortController.

IAC-9 already proves completed multi-turn continuity across Core restart.

## 2.2 Provider/key state

Already implemented:

`PersistentCredentialScheduler`:
- per-provider serialized credential selection;
- stable credential IDs;
- persistent rotation state.

`ProviderStateStore`:
- credential active/cooldown/invalid state;
- model/provider scope blocks;
- quota state;
- circuit breaker;
- next-available timing.

`OpenAICompatibleProviderPool.complete`:
- bounded attempts;
- sibling credential failover;
- provider failover;
- provider affinity;
- safe error classification.

Do not replace this.

## 2.3 Side-effect safety

`McpMutationSafety` already provides:
- invocation ID;
- argument digest;
- durable received receipt;
- durable terminal receipt;
- no replay if prior invocation outcome is uncertain;
- no duplicate execution after terminal result.

This should become a dependency of continuation/recovery, not be duplicated.

---

# 3. Actual continuity gap

Current `chat_messages` schema stores roles:
- user
- assistant

It does **not** durably encode the in-turn provider-independent transcript required to reconstruct:
- assistant tool-call envelopes;
- tool-call IDs;
- tool results;
- current controller iteration;
- current capability/tool surface;
- route-transition epoch;
- side-effect receipt linkage;
- partial provider output state.

`AgentRuntimeTask.episodes` contains useful evidence summaries, tool names, failure classes, strategy fingerprints and evidence refs, but it is not a lossless provider-request reconstruction.

Therefore current guarantees are different:

### Proven
- provider/key failover while the controller process remains alive;
- completed-turn continuity across restart;
- persistent provider operational state;
- mutation invocation replay protection.

### Not yet proven
- restart/resume inside an unfinished turn without losing tool-call/result state;
- safe continuation after a provider fails after a side-effecting tool call but before the next model response;
- canonical handling of user-visible partial streamed output;
- cross-model compatibility preflight before route change.

That is the target.

---

# 4. Canonical state model

The smallest design is a **durable turn continuation snapshot**, owned by the existing Agent Chat / Runtime path.

Do not introduce a new runtime service.

Recommended persisted record:

`chat_turn_checkpoint` or equivalent table owned by `AgentChatStore`.

Required identity:
- conversationId
- turnId
- runtimeTaskId
- runtimeSessionId
- revision
- createdAt / updatedAt

Required controller state:
- iteration
- canonical message sequence for current turn:
  - system/context reference or digest;
  - user message;
  - assistant text already accepted as internal state;
  - assistant tool_calls;
  - tool results;
- provider-independent tool-call IDs
- current strategy fingerprint
- retrieval attempt IDs
- knowledge IDs / artifact IDs actually declared
- evidence refs already produced

Required execution surface:
- granted capability families
- granted tool names
- tool-schema fingerprint
- restriction fingerprint

Required provider transition state:
- previous providerId/model
- current providerId/model
- route attempt number
- transition reason
- compatibility verdict

Required side-effect state:
- invocation IDs used for mutating tools
- Mutation Safety receipt state/reference where available
- whether result is:
  - terminal-success
  - terminal-failure
  - pending/uncertain
  - read-only/no receipt required

Required interruption state:
- cancelled
- provider-error-before-output
- provider-error-after-partial-output
- process-interrupted
- awaiting-tool-result
- awaiting-provider
- terminal

Do not persist raw provider secrets or Authorization material.

---

# 5. Persistence boundaries

A continuation record must be written at **semantic commit points**, not on every token.

Minimum commit points:

1. after user turn/task creation;
2. after initial Memory/context/grant is resolved;
3. after provider response containing tool calls is accepted;
4. **before dispatching a mutating tool**;
5. after durable tool result / Mutation Safety terminal receipt;
6. after strategy change;
7. before the next provider request;
8. before terminal finalization;
9. after finalization.

For read-only tools, a checkpoint after tool result is sufficient.

For mutating tools, the ordering should be:

```
checkpoint(tool_call_planned + invocation_id)
    ↓
McpMutationSafety received receipt
    ↓
execute tool
    ↓
McpMutationSafety terminal receipt
    ↓
checkpoint(tool_result + receipt outcome)
```

A process death in the middle can then be reconciled instead of blindly repeated.

---

# 6. Key rotation versus provider/model transition

These are different events.

## 6.1 Same provider, same model, different key

Normally safe to retry the same provider request from the same canonical continuation snapshot if:
- no provider output has been committed as visible output;
- no new side effect occurred outside the canonical tool state;
- the provider failure classifier authorizes failover.

This is credential rotation, not context migration.

The canonical message/tool state does not change.

## 6.2 Different provider, same compatible model contract

Allowed only after compatibility preflight.

The new request is re-rendered from canonical Agent Core state. It must not depend on provider-private prior state.

## 6.3 Different model

Treat this as an explicit capability transition, not merely another route.

Minimum route compatibility descriptor should cover:
- tool/function calling support;
- required JSON/tool schema level;
- required modality:
  - text
  - image input if current task requires it
  - other enabled modality as applicable;
- minimum context window for the projected request;
- output token requirement;
- any provider/API feature required by current canonical messages;
- model/provider restrictions relevant to the active capability grant.

If compatibility cannot be proven:
- do not silently downgrade;
- continue to another compatible route;
- otherwise terminate with an explicit blocked/unverified state.

---

# 7. Context window and compression

A model change can reduce available context.

Compression must be a **canonical transformation with evidence**, not an invisible lossy provider-side convenience.

Protected information that must survive:
1. user constraints;
2. current goal;
3. decisions already made;
4. accepted tool observations;
5. tool call/result pairing;
6. side-effect receipt state;
7. active failure/strategy state;
8. verification requirements;
9. evidence refs;
10. unresolved blockers.

Compressible first:
- redundant prose;
- superseded intermediate reasoning text;
- duplicated read-only tool output after its relevant fact/evidence has been captured;
- old conversational phrasing whose semantic constraints are represented elsewhere.

Required compression record:
- pre-compression state digest;
- post-compression state digest;
- reason;
- model/context limit;
- protected invariants preserved;
- items summarized;
- items omitted because impossible to preserve.

If required constraints/tool state cannot fit:
- fail closed with `CONTEXT_CONTINUITY_UNSATISFIABLE`;
- do not silently truncate.

Hermes is currently stronger here; this design should initially define the invariant and test it before building a large compaction engine.

---

# 8. Streaming boundary

FreeLLMAPI provides a useful donor principle in:
`server\src\services\fusion.ts:272+`:

> failover is safe before first forwarded byte; after visible bytes, silently switching providers risks duplicated/mixed output.

Agent Core should adopt the principle, not the implementation.

## Before user-visible output

Automatic compatible-provider failover is allowed.

## After user-visible partial output

Do **not** concatenate a new provider's fresh answer as if it were the same stream.

Allowed policies, in order of safety:

1. if UI supports replacement:
   - mark prior partial output superseded;
   - regenerate from canonical checkpoint;
   - replace the assistant draft atomically.

2. if replacement is unavailable:
   - preserve the partial text as an explicit interrupted draft;
   - start a new continuation segment with disclosed boundary;
   - instruct the next provider from canonical state not to repeat already committed user-visible material where deterministically possible.

3. if neither can be made safe:
   - return partial/unverified and require a user-visible retry.

Never claim seamless continuity when the UI cannot distinguish mixed provenance.

---

# 9. Tool side-effect recovery

## 9.1 Read-only tool

Safe to replay if needed, subject to normal rate/cost policy.

## 9.2 Idempotent mutation with Agent Core invocation receipt

Use the same invocation ID.

- prior terminal success → reuse outcome; do not execute.
- prior terminal handled-failure/exception → reuse bounded outcome; do not execute blindly.
- prior received but no terminal → **uncertain**; do not replay.

## 9.3 Mutation with uncertain outcome

Attempt reconciliation only if a read/status operation exists.

Examples:
- message send → query message/delivery ID if service supports it;
- file write → read target/hash;
- database update → read key/version;
- remote job → query job ID.

If reconciliation proves applied:
- record terminal/reconciled success;
- continue.

If reconciliation proves not applied:
- issue a new safe invocation according to tool contract.

If reconciliation cannot decide:
- stop with `SIDE_EFFECT_OUTCOME_UNCERTAIN`;
- require human or tool-specific recovery.

Do not promise exactly-once semantics for tools whose external system cannot provide idempotency or readback.

---

# 10. Cancellation and terminal failure

Cancellation is a state transition, not provider failure.

On cancel:
- AbortSignal stops pending provider request;
- do not penalize healthy credentials;
- persist checkpoint state as cancelled/stopped;
- do not auto-resume unless a later explicit resume operation exists;
- reconcile any mutation already dispatched.

On process restart:
- a running turn without a safe resume checkpoint should remain interrupted/failed;
- a turn with a safe checkpoint may become resumable only after:
  - canonical state validation;
  - Mutation Safety reconciliation;
  - compatible route resolution;
  - explicit recovery policy.

Do not convert an interrupted task to success merely because a final-looking assistant draft exists.

---

# 11. Canonical invariants

These must hold across every key/provider transition.

### Identity
- same conversationId
- same turnId unless a user-visible new turn is intentionally created
- same runtimeTaskId for continuation
- same runtimeSessionId

### Intent
- goal unchanged unless user modifies it
- constraints unchanged
- verification contract unchanged

### Evidence
- existing evidence refs preserved
- retrieval/use receipts preserved
- failed evidence remains visible
- no fabricated verification

### Tools
- tool_call_id ↔ tool result pairing preserved
- granted tool authority never widens because provider changed
- schema fingerprint preserved or compatibility explicitly revalidated

### Side effects
- invocation identity preserved
- completed side effect never replayed
- uncertain side effect never blindly replayed

### Provider
- secret never persisted in checkpoint
- route change is observable
- incompatible route is rejected

### Learning
- provider failure itself is not automatically semantic learning
- verified recovery may become a reusable procedure/Memory only after final outcome evidence

---

# 12. Cost and policy boundaries

Key rotation must respect real provider/account limits.

Never use multiple keys to bypass a provider's account-wide or organizational restriction.

Provider state must distinguish:
- credential-specific limit;
- model-specific limit;
- provider/account-wide limit;
- billing/credit exhaustion;
- invalid credential;
- transient transport failure.

When evidence indicates account/provider-wide exhaustion:
- suppress affected routes rather than cycling every key.

Cost policy should expose:
- estimated request tokens;
- completed provider attempts;
- failed provider attempts;
- optional provider monetary estimate when reliable pricing metadata exists;
- compression cost.

Cost must be a benchmark metric, not the primary success objective.

---

# 13. Automatic server behavior versus controller behavior

## Server/runtime should own automatically

- durable conversation/turn/task identity;
- credential/provider operational state;
- route selection and bounded failover policy;
- turn checkpoint persistence;
- mutation receipt persistence;
- compatibility enforcement;
- interruption state;
- evidence/verification storage;
- Learning finalization state;
- no-duplicate replay rules.

These are deterministic control-plane responsibilities.

## Controller/model still owns

- semantic relevance of recalled knowledge;
- whether a prior lesson applies to the current task;
- strategy adaptation;
- selecting among semantically valid tools;
- synthesizing the answer;
- proposing reusable learning;
- deciding what a subjective result means.

Prompt instructions may steer these decisions but are **not guarantees**.

---

# 14. Knowledge validity lifecycle

Agent Core should not copy Hermes's "most sessions should update a Skill" bias.

A learned item should be eligible for reuse only when:
- provenance is known;
- relevance is current;
- authority is not superseded/contradicted;
- its reuse condition matches;
- confidence/support is sufficient for the action risk.

When current source contradicts old knowledge:
- source wins;
- mark old Memory/procedure outcome contradicted or superseded;
- preserve it as historical evidence;
- do not delete valid historical experience merely because it is no longer current.

When a procedure fails on held-out work:
- record negative support;
- refine reuse condition or steps;
- demote/block Skill promotion when evidence warrants.

When a prior lesson is too specific:
- leave it unused rather than forcing adaptation.

---

# 15. Design acceptance conditions

This design is not considered implemented until a targeted suite proves:

1. same-provider key failover preserves canonical turn state;
2. provider/model failover uses a compatibility gate;
3. current tool call/result survives provider transition;
4. interrupted process can recover from a durable checkpoint in a fixture;
5. already-completed mutation is not duplicated;
6. uncertain mutation stops/reconciles rather than replays;
7. cancel does not poison provider state;
8. incompatible model is rejected;
9. long-context transition preserves declared protected invariants;
10. finalization remains evidence-backed;
11. no raw secret enters continuation storage;
12. existing IAC/NACP/PCR behavior is not regressed.

No live provider run is required for the first implementation qualification; controlled loopback/fault-injection providers are preferable.

---

# 16. Non-goals for the first implementation

Do not:
- add another provider router;
- replace PersistentCredentialScheduler;
- replace AgentChatStore;
- add a second Memory/Learning system;
- build a Hermes-style full context compressor immediately;
- add generalized distributed exactly-once claims;
- add silent provider downgrade;
- add provider-specific auth-store complexity unless a concrete provider requires it.

The first implementation should make **one active turn durable across a controlled provider transition**, then prove it.
