# Agent Core DTC-1 Continuation Contract
Status: IMPLEMENTED — TARGETED VERIFIED — LOCAL QUALIFICATION ONLY — RESIDENT ACTIVATION NOT PERFORMED
Date: 2026-10-03
Workspace: E:\Projects\Agent-Core
Baseline HEAD: 639cdf77fd7288a722131862e22eecaff4a90f07

## Identity and authority
- conversationId, turnId, runtimeTaskId, and runtimeSessionId remain stable across continuation.
- AgentRuntimeService remains task authority; AgentChatStore owns durable chat/checkpoint state.
- ProviderStateStore remains provider/key operational authority.
- Memory/Learning/Skills/Procedures remain existing canonical owners; no second stack is introduced.
- One active executor may own a turn at a time.
- Resume is explicit and idempotent; startup never dispatches model/tool work automatically.
- A terminal task is never silently reopened.

## Checkpoint contract
- schemaVersion is explicit and unsupported versions fail closed.
- every write increments revision and validates expected claim/revision.
- checkpoint phase is explicit and bounded.
- checkpoint contains only model-visible/control-plane state, never hidden reasoning.
- persisted payload uses scoped checkpoint redaction: model-visible/sensitive strings are sanitized while stable continuation identities, authority digests, artifact identities, and ownership fields remain intact.
- payload size is bounded; oversized MCP results rely on existing result-budget artifact references.
- artifact references must retain path identity, digest, byte size, and validity evidence.

## State that must survive continuation
- canonical model-visible messages including assistant tool_calls and paired tool results;
- current iteration and provider-attempt budget already consumed;
- deadline/budget anchors needed to prevent reset-on-restart;
- approved capability families and the historical granted tool/schema fingerprint;
- retrievalAttemptIds, evidenceRefs, and declared knowledge/artifact use identifiers;
- current strategy fingerprint and blocked-equivalent-retry state sufficient to preserve failure discipline;
- mutation invocation IDs and their checkpoint phase;
- previous/current provider and model plus route-transition reason.

## Current authority wins on resume
- historical grants in checkpoint never widen current authorization.
- effective resumed grant is recomputed from current capability policy and intersected with checkpoint requirements.
- cancellation or revoked authorization observed after checkpoint wins over checkpoint state.
- current tool availability/schema is rediscovered before dispatch.
- missing/changed required tool contract blocks resume.
- same model ID is only a preliminary filter, never proof of route compatibility.
- DTC-1 cross-provider automatic transition requires explicit minimum contract compatibility.
## Crash-window state model
- provider-ready: no provider request is in flight; safe to issue the next bounded request.
- provider-dispatch: a provider attempt was charged before dispatch; replay is allowed only within the persisted remaining budget.
- model-received: assistant content/tool_calls are durable.
- tool-planned: tool call is durable and has not crossed the dispatch boundary.
- tool-dispatching: dispatch may have crossed the mutation receipt boundary. Mutating work must not replay automatically; if a durable result is unavailable, resume fails closed with an explicit side-effect-result-unavailable condition.
- tool-result-durable: paired tool result is durable. Oversized result references are integrity-checked before resume.
- finalization-started: finalization may be partially applied across Runtime/Learning stores; replay must use their idempotent task identity.
- finalization-complete: Runtime/Learning is terminal and final response metadata is durable; only chat commit remains.
- terminal: chat commit and minimum diagnostic evidence are consistent; large continuation state may be compacted.

## Source ownership map
- src/agent-chat-store.ts: SQLite schema/migration, checkpoint revision/CAS, executor claim, persisted cancellation, terminal chat commit.
- src/agent-chat-service.ts: startup detection only, explicit resume API, current-authority/artifact validation, same-turn chat orchestration.
- src/agent-controller.ts: reconstruct model-visible execution state, checkpoint execution boundaries, resume same runtime task.
- src/agent-runtime.ts: existing runtime task authority; resume validates the existing running task instead of creating a second task.
- src/agent-provider.ts: continuation-scoped provider transition filtering and persisted provider-attempt accounting.
- src/agent-tool-session.ts: tool schema fingerprint/read-only classification and mutation invocation identity propagation.
- src/mcp/mutation-safety.ts: remains mutation replay authority; DTC-1 consumes its existing invocation contract rather than creating a second journal.
## Retention and compatibility policy
- resumable checkpoint lifetime is bounded to the existing oversized-result artifact lifetime. Expired checkpoints fail closed instead of replaying work with missing evidence.
- checkpoint cleanup occurs only after Runtime/Learning finalization and chat commit are mutually consistent.
- current effective tool grant is recomputed on resume; the historical grant is evidence only.
- current tool/schema fingerprint must match the checkpoint requirement before model/tool dispatch.
- same-provider continuation requires the same model identifier.
- cross-provider continuation additionally requires the same model identifier plus explicit compatible route metadata for tool support, text modality, context capacity, output capacity, and tool-call representation. Unknown metadata blocks the transition.
- cross-model automatic continuation is deferred beyond DTC-1.
- Native provider calls remain non-streaming in DTC-1. Streaming interruption semantics are NOT APPLICABLE and are not claimed tested.

## Test boundary
DTC-A1..A11 and the added concurrency/crash/CAS cases use temp SQLite/workspaces and deterministic loopback/fault injection. At least one reconstruction test must cross a real child-process boundary. DTC-A12 is split: deterministic retrieval/receipt/Learning reconstruction plumbing may be tested locally; semantic no-hint reuse with a real model remains deferred.

## Qualification closure — 2026-10-03
- DTC-A1..A11 deterministic/local qualification is complete; DTC-A12 semantic no-hint real-model reuse remains intentionally deferred.
- DTC-focused acceptance: 23/23 PASS.
- Scoped owner regression matrix: 7 files / 49 tests PASS.
- Root TypeScript build: PASS. Portability/path policy: 302 authored files / 0 exceptions.
- Real reconstruction evidence includes an abruptly terminated child process that exits immediately after a durable SQLite checkpoint write; the parent reconstructs the same turn/task as resumable without dispatching provider/tool work.
- Every nonterminal checkpoint phase through chat-commit-pending reconstructs without automatic execution.
- Mutation replay evidence covers completed receipt, receipt-without-terminal, and dispatching-side-effect-without-result boundaries.
- Cancellation invalidates the execution epoch; late completion cannot commit assistant output.
- Current authorization/tool contract is rediscovered on resume; revoked/changed contracts block continuation before provider dispatch.
- Provider/model continuation preserves consumed attempt budgets and permits only contract-compatible same-model routes.

## Defects found by DTC qualification
- Generic recursive redaction was redacting runtimeSessionId because session IDs are globally sensitive in other contexts. Checkpoint serialization is now scoped: sensitive/model-visible strings are redacted, while continuation identities and authority digests remain stable.
- A mutating dispatch checkpoint without a durable result now fails closed with SIDE_EFFECT_RESULT_UNAVAILABLE instead of relying on an ambiguous outcome label.
- The initial DTC test fixture itself was truncated at EOF; it was repaired and expanded rather than weakening assertions.

## Activation boundary
- This closure is source/build/targeted local qualification only.
- No resident Core restart, provider production request, paid-provider acceptance, production chat DB mutation, release apply, commit, tag, push, publish, or deploy is claimed.
