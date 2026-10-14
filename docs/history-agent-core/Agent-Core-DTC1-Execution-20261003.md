# Agent Core DTC-1 Execution Report
Status: IMPLEMENTED — TARGETED VERIFIED — RESIDENT-ACTIVATED — LIVE-VERIFIED
Date: 2026-10-03
Workspace: E:\Projects\Agent-Core
Baseline HEAD: 639cdf77fd7288a722131862e22eecaff4a90f07
Prequalification checkpoint: 6e1f7f2a-0423-40db-b75b-d5e34760c68c

## Goal
DTC-1 makes an interrupted interactive Native Agent turn explicitly resumable from durable state without silently creating a replacement task, resetting budgets, widening authority, replaying uncertain mutations, or fabricating success.

This continues the previously interrupted DTC-1 task. Exact current source was treated as authority: substantial continuation plumbing was already present, so the work qualified that implementation, repaired real defects, and filled acceptance gaps instead of creating a second continuation subsystem.

## Implemented ownership
- AgentChatStore owns SQLite schema v2, execution epoch/claim, checkpoint CAS revision, persisted cancellation, recovery classification, and terminal chat commit.
- AgentChatService owns explicit resume, startup detection-only reconciliation, artifact/identity verification, and same-turn chat orchestration.
- NativeAgentController reconstructs model-visible/control state, revalidates current authority/tool contracts, preserves budgets, checkpoints provider/tool/finalization boundaries, and resumes the same runtime task.
- AgentRuntimeService remains task/session authority.
- AgentRuntimeToolSession supplies current tool contracts and propagates mutation invocation IDs.
- McpMutationSafety remains the exactly-once/uncertain mutation receipt authority.
- OpenAICompatibleProviderPool enforces continuation compatibility and provider-attempt budget.
## Source corrections made during qualification
1. Checkpoint redaction identity repair.
   - Before: recursive generic redaction changed runtimeSessionId to [REDACTED].
   - After: checkpoint-local scoped redaction sanitizes prompt/messages/tool arguments/strategy/final response but preserves stable IDs, digests, artifact identities, and authority state.
2. Side-effect/result gap naming and fail-closed behavior.
   - Mutating work observed at dispatch boundary without a durable result is not replayed.
   - Resume reports SIDE_EFFECT_RESULT_UNAVAILABLE rather than inventing or retrying a result.
3. DTC acceptance fixture reconstruction.
   - The previously truncated test file was repaired and expanded; assertions were strengthened rather than relaxed.

## Acceptance evidence
DTC-focused suite: 23 PASS / 0 FAIL.

- A1: schema-v1 chat SQLite migrates to v2 without reset or loss of legacy records.
- A2: canonical checkpoint round-trips user -> assistant tool_call -> paired tool result, runtime identities, failure state, and Memory evidence.
- A3: same-provider HTTP 429 rotates credential while request body/context remains identical and credentials remain outside the body.
- A4: compatible same-model cross-provider continuation succeeds under explicit route metadata.
- A5: incompatible model/route is blocked before any provider network request.
- A6: checkpoint with a durable read-only tool result resumes the same runtimeTaskId and does not re-execute the read.
- A7: a completed mutating invocation is not re-executed after Mutation Safety reconstruction.
- A8: a mutation receipt without terminal evidence returns UNCERTAIN and is not replayed.
- A9: a dispatching mutating checkpoint with no durable result fails closed with SIDE_EFFECT_RESULT_UNAVAILABLE; no result is fabricated.
- A10: cancellation while provider fetch is waiting aborts the request without marking a healthy credential invalid/cooldown solely because of caller cancellation.
- A11: already-finalized Runtime/Learning state is reconciled into chat commit exactly once without rerunning controller finalization.
- DTC-A12: semantic no-hint reuse with a real model is intentionally deferred by scope.

Additional fault/race coverage:
- Abrupt real child-process termination immediately after checkpoint write; parent process reconstructs the same turn/task as resumable.
- All nine nonterminal durable checkpoint phases reconstruct without automatic provider/tool dispatch.
- Single resume owner via execution epoch + claim; stale executor is rejected.
- Cancellation invalidates epoch and rejects late final/assistant commit.
- Revoked or changed tool contract blocks resume under current authority.
- Provider-attempt budget already consumed remains consumed across reconstruction.
- Unsupported checkpoint schema, tampered payload, expired/corrupt artifact boundaries fail closed.
## Regression/build evidence
Command family:
- npm run build
- focused Vitest matrix covering DTC, chat store/service, controller, provider, integrated runtime, and mutation-safety ecosystem regression.

Results:
- Path policy: PASS — 302 authored files scanned / 0 documented exceptions.
- TypeScript root build: PASS.
- Test files: 7 PASS / 0 FAIL.
- Tests: 49 PASS / 0 FAIL.

Structural review:
- Semantic IDE reference resolution confirms AgentChatService.resumeTurn is called by the additive HTTP resume route in src/http/app.ts.
- Grafel workspace is current/integrity-accepted with registered repository coverage 1/1. Exact current source remains final authority.

## Persistence and safety behavior
- Startup recovery is detection/classification only. It never auto-resumes provider/tool execution.
- Resume is explicit.
- Historical capability grants never widen present authorization.
- Stable continuation IDs are preserved; secrets are not.
- Tool contract drift blocks continuation before dispatch.
- Provider/model transition is same-model only and additionally requires explicit compatibility metadata cross-provider.
- Native DTC provider calls remain non-streaming for this scope.
- Oversized result artifacts are verified by path/digest/byte identity before resume.
- Mutation receipt identity is stable across reconstruction; uncertain work is never blindly repeated.
## Scope intentionally not executed during local qualification
- No resident Agent Core restart or live activation.
- No paid/production provider request.
- No production chat.sqlite mutation.
- No broad regression suite beyond the authorized scoped matrix.
- No DTC-A12 semantic real-model no-hint test.
- No release:apply, product version bump, Git commit/tag/push, publish, or deploy.

## Resident activation closure — 2026-10-03
- User explicitly authorized resident activation after the local qualification boundary.
- Pre-activation consistent SQLite backup: `runtime\\backups\\dtc1-resident-activation-20261003\\chat-preactivation.sqlite`; scoped file checkpoint: `6bcd8f6a-3840-4562-bc3b-cfcfcbee45ca`.
- The resident Core was restarted without restarting the tunnel. New resident PID: `5332`, executable `runtime\\node\\node.exe`, entry `dist\\index.js`, `/health=ok`, version `0.14.0`.
- Production `chat.sqlite` is schema v2 and preserves `14` conversations, `30` turns, and `55` messages. `chat_turn_execution` and `chat_turn_checkpoints` are present; both contain `0` rows at closure because no turn was active/resumable.
- Live Agent Chat health reports `conversationCount=14`, `activeConversationCount=13`, `runningTurnCount=0`, `resumableTurnCount=0`.
- A resident no-provider acceptance POST to `/agent/chat/turns/dtc1-nonexistent/resume` returned HTTP 200 NDJSON with `AGENT_CHAT_TURN_NOT_FOUND`, proving the additive resume surface is loaded and fails closed before provider/tool dispatch.
- Memory, Learning, Code Intelligence, Semantic IDE and Execution remained available after restart; Memory issueCount remained `0`.
- No paid/production provider request, P8, Hermes benchmark, release apply/version bump, commit/tag/push, publish/deploy, or DTC-A12 real-model evaluation was executed.
- Closure evidence: `runtime\\tmp\\dtc1-activation-preflight\\activation-result.json` and `runtime\\tmp\\dtc1-activation-preflight\\live-closure.json`.

## Rollback
The scoped prequalification file checkpoint is:
6e1f7f2a-0423-40db-b75b-d5e34760c68c

Restore must use file_checkpoint preview_restore immediately before any restore and exact preview digest; no automatic restore was performed.

## Post-activation stability closure — 2026-10-03
- A later canonical DTC-1 Memory update exposed a real resident crash in `proper-lockfile` heartbeat compromise handling. The crash was repaired in `src/memory/lock.ts`, and launcher false OFF/ON status flapping was repaired in `src/launcher/MainForm.cs` + `src/launcher/AgentCoreRuntime.cs`.
- Repaired launcher SHA-256: `778138C355B38CD12F8C68B6D471CEC7C850B1D0E88E9E3B75A0B35507AEB251`; current launcher PID 18984 and Core PID 11932 are healthy on v0.14.0.
- Post-cutover tracker observation reached 88 events with 0 error events, 2 bounded fail-soft process-metrics warnings, and 0 targeted crash/flapping hits; the warnings did not alter runtime health or subsystem state.
- The canonical DTC-1 `memory_update` then succeeded in-place; Memory health remained available with issueCount 0 and the same Core PID.
- Canonical Memory record `57b16ddb-31a1-4fec-9da4-7326b342a68b` is synchronized. Stability authority: `docs\history-agent-core\Agent-Core-Stability-Repair-20261003.md`.
## Stability repair r2 final closure — 2026-10-03
- r2 passive Execution/Game Mode debounce was user-cut over with launcher SHA-256 `67C9A88E6C75AFE6F6E32219B8489C9E6C0B4C3C7D6803243D9A75480E7B604B`.
- Resident launcher PID `1916` and Core PID `22436` remained stable during acceptance.
- Tracker since r2 start reached at least 73 events with 0 errors, only bounded rate-limited fail-soft process-metrics warnings, and 0 targeted crash/flapping hits.
- Dedicated health observation: 15/15 `/health` status `ok`; 15/15 Execution `available`; 15/15 Memory `available`.
- Canonical DTC-1 Memory mutation completed successfully on r2 without changing Core PID. r2 is live-verified for the scoped stability repair.