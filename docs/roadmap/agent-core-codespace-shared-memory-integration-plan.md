# Agent Core ↔ Codespace Shared Memory Integration Plan

> Status: executable implementation plan
> Branch: `feature/codespace-memory-self-healing`
> Base: Phase 7 certified SHA `840ffdea45ab2f5f3dec02d7bc827f23c6a222eb`
> Connection hardening checkpoint: `e1a469f4ca40b7266e603bcc249858230954e289`

## Objective

Make the cloned Codespace bridge use the exact same Agent Core memory authority as direct Agent Core sessions, including fresh-Codespace hydration, bounded recall, causal expansion, hard-lifecycle leases, continuity checkpointing, and verified remote durability, without introducing a second memory database, credential authority, or semantic decision engine in the plugin.

The currently running `main` Codespace plugin must remain untouched until this candidate is fully verified and a separate controlled cutover is ready.

## Non-negotiable architecture

1. Agent Core remains the sole semantic memory, continuity, lifecycle, cognition, and remote-durability authority.
2. Codespace is a thin loopback client only. It must never open SQLite, derive remote object paths, hold Memory Remote credentials, or reproduce cognition rules.
3. Shared memory identity is stable across managed Codespace key recreation/rotation. Authentication key identity and logical memory principal identity are separate concepts.
4. When `AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID` is configured, the live Agent Core memory scope must match the same principal used by the hydration gate. Without an explicit stable principal, existing `key.id` behavior remains backward compatible.
5. Project scope remains exact to the allowed workspace root. The plugin cannot request memory for another project/root.
6. Internal bridge endpoints are exact-loopback only, reject forwarded/proxy access before body/token processing, bound request/response sizes, and never expose credentials or decoded lease identity.
7. Codespace mutations continue to use opaque Memory Context Leases. Lease values are never logged, persisted, echoed, projected remotely, or passed to shell/process environments.
8. A Codespace memory context has a real continuity turn/task and can be durably checkpointed/closed; no permanent `POSTFLIGHT_PENDING` lifecycle is acceptable.
9. New Codespace memory tools are explicit and bounded. Raw `memory_commit`, `memory_revise`, and `memory_forget` are not proxied; durable semantic writes happen through the existing cognition/continuity promotion path.
10. `.vscode/`, `main`, tunnel identity defaults, and unrelated projects remain untouched.

## Target Codespace memory surface

Add these 7 tools to the existing 12-tool Codespace surface, for an exact candidate surface of 19 tools:

- `memory_status`
- `memory_open_context`
- `memory_search`
- `memory_get`
- `memory_explain`
- `memory_remember_more`
- `memory_checkpoint`

`memory_open_context` returns bounded recalled memory, continuity state, route/context/task/turn identifiers, and an opaque `memoryContextLease` used by existing mutating Codespace tools.

`memory_checkpoint` persists factual evidence/decisions/artifacts/outcomes/constraints through existing Continuity promotion, closes lifecycle state when appropriate, and crosses the existing Memory Remote durability boundary.

## Task 1 — Align stable memory principal with hydration

### RED

- Add tests proving that a configured stable memory principal is used by memory/continuity scopes even when two authenticated key IDs differ.
- Add regression proving default behavior remains `key.id` when no stable principal is configured.
- Add production bootstrap/config contract proving `AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID` is consumed by the runtime memory scope, not only by hydration.

### GREEN

- Add a bounded optional stable principal field to `MemoryConfig`.
- Resolve it from explicit memory principal configuration, falling back to `AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID` when Memory Remote is enabled.
- Add a single helper for memory principal resolution.
- Update memory/continuity/lifecycle/audit scope creation to use logical memory principal while keeping route/process authentication ownership on `key.id`.

### Verify

- Principal-scope unit tests.
- Existing memory, continuity, route, execution, and auth tests.

## Task 2 — Extract reusable Codespace memory context/checkpoint service inside Agent Core

### RED

- Test an Agent Core service-level Codespace memory session lifecycle:
  1. open context,
  2. recall existing memory,
  3. issue opaque lease,
  4. meaningful work marks `POSTFLIGHT_PENDING`,
  5. terminal checkpoint persists/promotes/close,
  6. remote-disabled ends `CLOSED + NOT_REQUIRED`,
  7. remote-enabled ends with verified durable receipt.
- Test pending prior objective reconciliation remains enforce/advisory compliant.

### GREEN

- Implement a reusable Agent Core `CodespaceSharedMemoryService` that delegates only to existing `MemoryService`/Continuity primitives.
- Use generated route context IDs only as lifecycle correlation IDs; do not create a second route authority.
- Normalize checkpoint input with the existing continuity normalization rules.
- Reuse existing continuity promoter and durability boundary.

### Verify

- No direct SQLite calls in the shared-memory service.
- No duplicate cognition rules.

## Task 3 — Add exact-loopback shared-memory HTTP endpoint

### RED

- Non-loopback rejected.
- Forwarded/proxy-origin request rejected before body processing.
- Invalid action/schema/body size rejected.
- Workspace mismatch rejected.
- Stable principal unavailable in managed shared-memory mode fails closed.
- Response never contains principal ID, remote key, API key, or decoded lease payload.

### GREEN

Add one bounded endpoint:

`POST /internal/codespace-memory`

Actions:
- `status`
- `open_context`
- `search`
- `get`
- `explain`
- `remember_more`
- `checkpoint`

The endpoint delegates to `CodespaceSharedMemoryService` and existing `MemoryService` methods only.

### Verify

- HTTP security tests.
- Audit route contains only route name/status/correlation, never request body or lease.

## Task 4 — Add thin Codespace shared-memory client and 7 tools

### RED

- Client rejects non-loopback endpoint configuration.
- Response/body bounds enforced.
- Agent Core unavailable yields bounded error without credential leakage.
- MCP exact tool surface becomes 19.
- `memory_open_context` lease can be used by `write_file`, `edit_file`, `execute_command`, `start_process`.
- Memory tools never access SQLite or remote credentials directly.

### GREEN

- Add `plugin/codespace/src/shared-memory.ts` client.
- Register the 7 memory tools in `mcp-server.ts`.
- Update mutating tool descriptions to tell callers to obtain `memoryContextLease` from `memory_open_context` when lifecycle is active.
- Keep `stop_process` recovery-exempt.

### Verify

- Standalone plugin build/tests.
- MCP protocol integration.
- Credential isolation.

## Task 5 — Couple startup readiness to shared-memory authority

### RED

In enforce mode:
- hydration success + lease endpoint healthy + shared-memory endpoint unhealthy must block startup.
- advisory mode must surface degradation but remain non-blocking.
- disabled mode must not call memory endpoints.

### GREEN

- Extend existing lifecycle preflight/readiness with a non-secret `status` probe to `/internal/codespace-memory`.
- Continue reusing root `memory-hydration-gate.sh`; do not add a second hydrator.
- Preserve root credential scrub and bridge environment sanitization.

### Verify

- startup contract tests
- fresh-machine tests
- shell syntax

## Task 6 — Cross-session / cross-Codespace acceptance

Create acceptance proving:

### Codespace A
1. hydrate remote scope,
2. `memory_open_context` recalls exact memory,
3. meaningful mutation with returned lease succeeds,
4. `memory_checkpoint` reaches terminal durable truth,
5. remote bytes contain no lease/token.

### Codespace B
1. local DB absent,
2. hydrate same stable principal/project from remote,
3. authenticated key ID is deliberately different,
4. `memory_search` returns the same canonical memory,
5. prior continuity checkpoint/frontier is visible,
6. old process-lifetime lease from A is rejected,
7. fresh `memory_open_context` returns a new lease,
8. fresh mutation + checkpoint succeeds.

Also prove direct Agent Core memory search and Codespace-proxied search return equivalent IDs/revisions for the same stable scope.

## Task 7 — Candidate certification before live cutover

Required gates:

- root build PASS
- root full test suite PASS
- standalone Codespace build/tests PASS
- exact Agent Core MCP tool surface verified
- exact Codespace MCP tool surface = 19
- cross-Codespace acceptance PASS
- disaster recovery tests PASS
- 100k memory benchmark remains within existing target
- shared-memory loopback latency benchmark bounded
- no second hydration implementation
- no plugin SQLite access
- no dependency/model/API additions unless technically required and separately justified
- `.vscode/` diff = none
- tunnel identity defaults unchanged
- local SHA == remote SHA
- clean worktree

Only after all gates pass may a controlled replacement/cutover of the currently running Codespace plugin be prepared. No merge to `main` is performed without explicit user authorization.

## Certification evidence — candidate ready for controlled cutover

### Implementation checkpoints

- Connection self-healing: `e1a469f4ca40b7266e603bcc249858230954e289`
  - Problem: GitHub Codespaces could report a successful port-visibility mutation while port `8765` remained private long enough for `ensure-running.sh` to fail.
  - Fix: bounded re-check/re-issue/re-check until GitHub confirms `public`; root lifecycle serialization prevents `postStart`/`postAttach` races; detached children do not inherit the root flock; OAuth/MCP public gates, tunnel connect, and doctor now use bounded transient recovery.
- Shared-memory principal alignment: `f3447d3`, `fbd4e98`
  - Problem: hydration used `AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID` while normal MCP memory scope used volatile authenticated `key.id`, so a fresh Codespace key could hydrate one namespace and query another.
  - Fix: stable logical memory principal is separate from authentication/route/process ownership. Memory/continuity use `MemoryConfig.principalId`; operational authentication remains bound to the real key ID.
- Shared Agent Core service: `7d379162007956786f5299ff9a9de4a36b7f733b`
  - Problem: Codespace had lease enforcement but no bounded way to read/continue the same Agent Core memory/continuity state.
  - Fix: `CodespaceSharedMemoryService` delegates only to existing Agent Core Memory/Continuity/Cognition/Durability primitives; no SQLite or semantic authority is duplicated.
- Exact-loopback Agent Core endpoint: `ce16c4446d7a85451e19af8be0da03461a67738b`
  - Adds `/internal/codespace-memory` with bounded strict actions `status`, `open_context`, `search`, `get`, `explain`, `remember_more`, and `checkpoint`.
  - Forwarded/public access is rejected before body processing; caller cannot select principal or another workspace; outward projections remove logical principal identity.
- Codespace thin-client + MCP surface: `1981c8c994d34b5a297599bef3aa285c2dd4e4cf`
  - Adds exactly seven shared-memory tools to the existing 12-tool bridge for an exact 19-tool Codespace surface.
  - `memory_open_context` returns the opaque lease consumed by existing `write_file`, `edit_file`, `execute_command`, and `start_process`; mutation responses do not echo the lease.
- Startup authority coupling: `c1df34605ee963cf5d838b5ff353cd2b0e0153c5`
  - `enforce`: hydration + lease authority + shared-memory authority must all pass before bridge readiness.
  - `advisory`: authority degradation is explicit but non-blocking.
  - `disabled`: memory endpoints are not called.
  - Existing root Phase-2 hydration remains the only hydrator.
- Cross-session/cross-Codespace certification: `c267e2fd131f955a33b24d7442f982cd6955cd84`
  - Codespace A durably closes work; fresh Codespace B hydrates the same stable principal/project under a deliberately different auth-key ID; B sees the same memory IDs/revisions and prior continuity; A's old service-lifetime lease is rejected; B obtains a fresh lease and durably closes new work.
- Reproducible shared-memory benchmark: `50b5ff426e19c31e93cae677d43b7e5106679712`.

### Candidate verification at `50b5ff426e19c31e93cae677d43b7e5106679712`

- `npm run verify:release`: PASS.
  - 171 test files PASS, 2 skipped.
  - 842 tests PASS, 38 intentional skips.
  - brand scan PASS.
  - root TypeScript build PASS.
  - Codespace TypeScript build PASS.
  - quality gate PASS; quality `sourceCommit` exactly `50b5ff426e19c31e93cae677d43b7e5106679712`.
  - release consistency PASS, Agent Core/server version `0.6.0`.
  - docs: 50 markdown files / 19 relative links PASS.
- Exact MCP surfaces:
  - Agent Core total: 56.
  - Agent Core memory tools: 9.
  - Codespace candidate: 19.
- Standalone Codespace verification before candidate certification: 18 test files / 70 tests PASS.
- Disaster/recovery gate: 7 files / 28 tests PASS.
- 100k deterministic-memory benchmark:
  - active memories: 100001.
  - integrity: `ok`.
  - preflight p95: `65.592 ms`.
  - target: `<150 ms` — PASS.
- Opaque Memory Context Lease benchmark:
  - 100 samples / 10 warmup.
  - before+after p95: `3.518 ms`.
  - target: `<50 ms` — PASS.
- Codespace shared-memory loopback benchmark:
  - 100 samples / 10 warmup.
  - operation: Codespace thin client -> loopback Agent Core shared-memory search -> SQLite authority.
  - p95: `2.154 ms`.
  - target: `<50 ms` — PASS.
- Non-functional invariants:
  - plugin SQLite references: 0.
  - second plugin hydration implementation: 0.
  - direct SQL in `CodespaceSharedMemoryService`: 0.
  - `.vscode/` diff from Phase-7 base: none.
  - tunnel defaults diff from Phase-7 base: none.
  - root/package lockfile dependency diff from Phase-7 base: none.
  - external model/provider additions: 0.
  - branch remains `feature/codespace-memory-self-healing`; `main` is not merged/touched by this candidate.

### Cutover rule

This candidate is eligible only for a separate controlled live replacement after the final documentation SHA itself passes the same release, scale, recovery, invariant, local/remote-SHA, and clean-worktree gates. No automatic merge to `main` is authorized by this certification.
