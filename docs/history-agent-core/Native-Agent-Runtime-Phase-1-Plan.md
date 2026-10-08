# Native Agent Runtime Phase 1 Plan — 2026-09-30

Status: PHASE 1A–1F FOUNDATION IMPLEMENTED — TARGETED/BUILD VERIFIED — LAUNCHER/UI TRANSPORT RESIDENT VERIFIED — REAL PROVIDER ACCEPTANCE PENDING

## Goal

Introduce the native semantic-controller runtime that owns task/session lifecycle and mandatory Learning finalization while reusing the existing Agent Core body, Memory, Learning, Skills, Grafel, authentication, mutation safety, and machine-control surfaces.

Target:

User task -> native controller session -> Memory-first context -> configured API/local model -> existing Agent Core tools -> observe/verify -> terminal task state -> mandatory Learning finalization -> user-facing completion.

MRR-5 established the reason for this boundary: external-controller instructions and response advisories can improve behavior but do not make finalization deterministic. The native runtime must own the lifecycle transition; the model remains the semantic judge.

## Phase 1A — lifecycle foundation

Create internal AgentRuntimeService with durable non-semantic lifecycle state under runtime/agent-runtime/.

It owns runtime health, non-secret provider metadata, session/task identities, running/completed/failed task state, terminal verification evidence references, finalization state, and restart visibility for terminal-but-unfinalized tasks.

It does not own canonical Memory content/ranking, Learning candidate semantics, Skills execution authority, MCP authentication/grants, or machine-control authorization.

Finalization invariant:
- a terminal task cannot be fully finalized until the runtime calls Learning checkpoint;
- verified-recovery, user-correction, and explicit-learn require immediate semantic review;
- review payload comes from the active model/controller;
- nothing-worth-saving is a valid explicit semantic disposition;
- Learning failure does not erase a verified task result, but lifecycle remains visibly finalization-failed instead of silently complete.

## Phase 1B — provider abstraction

Support one initial provider contract: OpenAI-compatible HTTP, usable with either a remote API service or localhost-compatible model server. Configuration is environment-driven, credentials stay process-only, and no provider secret is persisted in runtime state, health, logs, Memory, or reports.

No vendor SDK dependency is required for this phase.

## Phase 1C — Memory-first context assembly

Before the first model decision:
- query canonical Memory in the selected workspace;
- preserve retrieval attempt/body identity evidence;
- include bounded relevant knowledge as untrusted historical context;
- retrieval alone never proves use;
- later actual use continues through existing MRR-3 receipt ownership.

## Phase 1D — native tool loop

Consume the existing Agent Core MCP tool contract rather than adding a second machine-control/router implementation. Tool calls must retain current grant, mutation-safety, evidence, failure-learning, and execution behavior.

Do not duplicate RDC handlers or bypass MCP safety.

## Phase 1E — persistent sessions

Persist only bounded runtime metadata in this phase: session/task IDs, timestamps, non-secret provider/model identity, task status, evidence references, and finalization status.

Conversation transcript persistence is a separate future design decision and never becomes canonical Memory automatically.

## Phase 1F — health/UI integration

Expose truthful health.agentRuntime: status, issues, supported/configured provider counts, session counts, running-session counts, and skill count. The desktop Agent Core AI page now consumes this truth, provides a bounded prompt/workspace surface, and routes requests through launcher-owned WebView messaging to a loopback-only `/agent/run` endpoint protected by a per-launch 256-bit UI token. The chat composer stays disabled while no provider is configured, so the UI does not pretend model readiness.

## Acceptance

Phase 1A:
- lifecycle survives service reopen;
- terminal verified task remains pending until Learning finalization;
- verified-recovery calls checkpoint and review;
- explicit no-new-knowledge closes finalization;
- failed Learning finalization stays visible/retryable without duplicating task effects;
- no Memory mutation occurs unless reviewed knowledge is captured;
- health truthfully reflects runtime/provider state.

Integrated acceptance later:
- configure one bounded test provider fixture;
- start native session;
- solve an ordinary deterministic fixture via existing tools;
- prove finalization cannot be skipped;
- start a second native session and test retrieval/reuse of the captured procedure.

## Non-goals

No background autonomous agent, recursive self-modification, model-weight training, unrestricted routing, multi-agent orchestration, hidden credential persistence, automatic release/deploy, or second Memory database.

## Release

Native runtime is material shipped behavior and requires its own changeset. No release apply, version bump, commit, tag, push, publish, deploy, or legacy-remote mutation is authorized by this plan.

## Implemented backend foundation — 2026-09-30

Current source implements the non-UI native runtime foundation:
- `src/agent-provider.ts`: one OpenAI-compatible HTTP provider, default-off, HTTPS-or-loopback endpoint policy, bounded response body, no credential persistence in health/state.
- `src/agent-runtime.ts`: durable session/task lifecycle under `runtime/agent-runtime/state.json`, provider health, Memory-first retrieval projection, terminal evidence requirements, retryable mandatory Learning finalization.
- `src/agent-tool-session.ts`: internal in-memory MCP client/server pair with a scoped tool grant so the model reuses existing Agent Core tools instead of bypassing their contracts.
- `src/agent-controller.ts`: bounded model/tool loop with synthetic `agent_core_finalize`; plain assistant text cannot terminate a task, and immediate review reasons require reviewed candidates or explicit nothing-worth-saving.
- `src/config.ts`: default-off `AGENT_CORE_AI_*` provider/runtime configuration.
- `src/index.ts`: initializes runtime when Learning is available, publishes truthful `health.agentRuntime`, and exposes the native controller programmatically on `AgentCoreService` without adding another public MCP tool.

The controller-facing runtime intentionally does not add a new MCP tool in this slice. The reviewed MCP manifest is already close to its handshake budget, the external connector descriptor can lag local tool schemas, and the native controller itself consumes the existing MCP tool surface internally. User-facing chat transport is provided by Phase 1F through the launcher-owned loopback `/agent/run` route and WebView UI rather than by adding a duplicate public MCP machine-control API.

Targeted qualification covers provider policy/configuration, internal scoped MCP dispatch, Memory-first context identity, persisted terminal outcome/finalization continuity, safe verification-evidence validation, mandatory semantic finalization, plain-text non-terminal behavior, a real existing MCP tool round trip before finalization, the rule that a Learning finalization failure cannot return a user-facing completion, and the launcher-only `/agent/run` transport contract. The integrated loopback-provider acceptance runs a real HTTP OpenAI-compatible endpoint fixture through **MemoryService → provider HTTP → existing `get_config` MCP tool → runtime-owned Learning checkpoint/review → persisted finalized task**, then reopens the runtime state successfully. Current native-runtime/transport qualification is **26/26 PASS across seven root test files**. TypeScript build/path policy PASS at **284 authored files / 0 exceptions**. Release compatibility remains **70→70 public MCP tools** with additive route `/agent/run`, `breakingEvidence=false`, `verificationIssues=[]`, and the manifest remains within budget at **119,380 bytes / ~29,845 tokens**. Historical Grafel qualification for this slice was integrity-accepted; the separate live continuity issue observed on 2026-10-01 is recorded below.

Current live continuity readback on 2026-10-01 resolves the active project root to `E:\Projects\Agent-Core`; the earlier `F:` relocation evidence remains historical rather than current-machine authority. Fresh `/health` is `ok` on v0.14.0 with Memory/Learning available and exposes `agentRuntime.status=not-configured`, `providerCount=1`, `configuredProviderCount=0`, `sessionCount=0`, `runningSessionCount=0`, and `pendingFinalizationCount=0`. Phase 1F remains resident: the React Agent Core AI page consumes this health truth and the launcher-owned loopback `/agent/run` transport remains token-protected. Grafel is currently a separate degraded subsystem because same-source graph integrity reports `unexplained-structural-shrink` after an explicit reindex (10,220 entities / 55,526 relationships versus accepted 10,227 / 55,434); the root repo itself is provider-current and clean. This does not change Native Runtime provider readiness, but the Grafel Pattern learning sink is unavailable until that integrity issue is repaired. The OpenAI-compatible **protocol path** remains provider-backed through the verified loopback HTTP fixture. Remaining Phase 1 acceptance is one operator-selected real model/provider endpoint (remote HTTPS API or loopback local model), not another body/Memory finalization patch.

## 2026-10-02 next-phase handoff

Native Agent Runtime Phase 1, persistent provider scheduling, and Interactive Native Agent Chat have all progressed beyond this original Phase 1 planning baseline and are resident verified in their later authorities.

Current next-phase planning authority:
`docs\Agent-Core-Native-Agent-Capability-Parity-Plan-20261002.md`

The capability-parity phase reuses this Native Agent Runtime and the existing Agent Core MCP body. It does not introduce a second model controller, Memory system, Learning system, or machine-control stack.

### 2026-10-02 capability-parity implementation update

Native Agent Capability Parity now extends this resident runtime with task-scoped dynamic MCP grants, shared-knowledge parity, and Agent Core-native Web Research. Source/build/targeted qualification is complete through NACP-0..NACP-9; supported resident restart and NACP-10 acceptance remain pending.
