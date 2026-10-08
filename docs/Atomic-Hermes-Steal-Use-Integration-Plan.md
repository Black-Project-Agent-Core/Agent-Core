# atomic-hermes Steal/Use Integration Plan
> Status: COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — CONDITIONAL REFERENCE RETAINED
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\07-atomic-hermes`
> Pin: `d73323210d1f6e01325f4e112371a14fede93c78`
> License: MIT
> Grounding date: 2026-09-25

## 1. Grounding basis
The checkout contains 2,680 non-Git files, 1,615 source files and 767 test files.
Inspection focused on executable mechanisms in `tools/process_registry.py`,
`tools/tool_result_storage.py`, `tools/file_state.py`, `tools/mcp_oauth_manager.py`,
`agent/context_compressor.py`, gateway lifecycle, and their tests.
Agent Core comparison used `src/rdc/terminal-manager.ts`, process tools, MCP result paths,
existing redaction, Activity Tracker, bounded response I/O, and Semantic freshness protections.

## 2. Selectable proposals
### AH-P1 — oversized tool-result spill with aggregate response budget
Adapt `tool_result_storage.py` as Agent Core-owned TypeScript at the MCP result boundary.

Observed mechanism has three layers:
1. per-tool output bounds;
2. persist an oversized full result and return a bounded preview + retrieval reference;
3. enforce a per-turn/result aggregate budget by spilling the largest results first.

Current gap:
Agent Core bounds terminal buffers and many individual reads, but oversized heterogeneous MCP results
can still be truncated or consume excessive controller context without a retrievable spill artifact.

Proposed owner:
- `src/mcp/result-budget.ts`;
- project-local `runtime/tool-results` with TTL cleanup;
- use existing safe file identity/atomic persistence/redaction utilities.

Security requirements:
- secrets/sensitive fields are redacted before any spill artifact is persisted;
- tools explicitly marked sensitive are non-persistable unless their owner supplies a safe projection;
- returned reference is project-local and bounded; no public URL;
- persisted artifacts have count/byte/age caps and deterministic cleanup;
- the original MCP schema/tool count is unchanged.

Acceptance:
small results remain byte-equivalent; oversized results return deterministic preview + retrievable artifact;
aggregate budget cannot discard the only copy; secret fixtures never appear on disk; failed spill degrades
to explicit bounded truncation rather than pretending full output survived.

### AH-P2 — restart-resilient detached process-session ledger
Adapt the process-registry durability concept into existing `TerminalManager`, not a second process engine.

Observed mechanism:
- background session registry;
- bounded rolling output;
- finished-session TTL;
- crash checkpoint metadata;
- detached recovered sessions;
- completion/watcher backpressure.

Current gap:
Agent Core already manages active/completed process maps, pagination, output caps and process-state detection,
but those maps are process-local; a Core restart loses the management identity of still-running child processes.

Proposed owner:
- `src/rdc/process-ledger.ts` plus minimal TerminalManager hooks;
- project-local atomic state under `runtime/rdc`.

Recovery contract:
- persist PID, executable identity, cwd, sanitized command digest, start time and lifecycle state;
- on restart validate OS process identity before reattaching as a DETACHED read-only session;
- never claim stdin control after the original pipe is lost;
- kill/terminate requires fresh identity validation;
- stale/dead records expire by TTL;
- no automatic restart of the child and no background workflow orchestration.

OpenViking OV-P1, if selected, should harden the same native owner rather than create a duplicate task tracker.

## 3. Rejected / conditional atomic-hermes mechanisms
- auxiliary-model context compressor: REJECT — controller-owned context, second model/runtime not appropriate.
- cross-agent file-state registry: REJECT as duplicate — Claude-Mem provenance + Semantic freshness/transaction guards already exist.
- OAuth manager 401 single-flight/disk-watch: CONDITIONAL — no current Agent Core consumer needing client-side MCP OAuth refresh.
- gateway watcher/notification automation: REJECT for first wave — avoid new autonomous event loop.
- full Hermes agent/gateway runtime: REJECT — external Hermes remains a sibling integration, not Agent Core internals.

## 4. Retirement condition
Reference is NOT a corpse while AH-P1/AH-P2 remain selectable.
Preserve MIT notice for substantial ports. Final retirement requires implementation/rejection plus zero-dependency/source-uniqueness census.

## 5. Approved execution result — 2026-09-25
AH-P1 and AH-P2 are implemented in existing Agent Core owners. Result-budget tests pass 3/3; process-ledger tests pass 3/3; root TypeScript compilation exits 0. AH-P1 is wired at the common MCP result boundary. AH-P2 shares one lifecycle owner with OV-P1 rather than creating a second process engine. Compiled `dist` is qualified; the connected Core has not restarted, so resident live activation is pending. Execution authority: `docs/Six-Reference-Adoption-Execution-20260925.md`.

## 6. Live activation and retained-conditional closure — 2026-09-25
AH-P1/AH-P2 are live in Agent Core 0.13.0. Activation exposed a fast-exit race in `TerminalManager`: ledger attachment had been awaited before child exit/error listeners were installed, so very short-lived commands could exit before finalization was observed. The ordering is now hardened by starting ledger attachment without blocking listener installation and awaiting the attachment from terminal/error finalization paths.
Targeted process-ledger regression is 4/4 PASS including a real short-lived-process case; root TypeScript build exits 0; live `start_process` fast smoke completes and leaves no active session.
Reference disposition: **RETAIN** because the source-audited OAuth 401 single-flight/disk-watch mechanism remains a conditional lead if Agent Core later gains a real client-side MCP OAuth-refresh consumer.

## 7. Five-reference source-first re-grounding — 2026-09-25

**Status: COMPLETE EXISTING ADOPTIONS — NO NEW CURRENT-FIT INSTALLATION — CONDITIONAL OAUTH REFERENCE RETAINED.**
The same clean pin `d73323210d1f6e01325f4e112371a14fede93c78` was revalidated. AH-P1/AH-P2 and the fast-exit lifecycle correction remain closed/live.

Direct source/test readback reconfirmed the unadopted OAuth family in `tools/mcp_oauth_manager.py`: per-server provider ownership, token-file mtime invalidation, cold-load expiry seeding/metadata discovery, 401 single-flight keyed by failed token, and reconnect signalling. Current Agent Core has a hardened **server-side** OAuth issuer/store, but no outbound refreshable MCP OAuth client. Phone Gateway uses a configured bearer token; Hermes Partner is loopback. Those are not valid consumers for transplanting this manager.

The OAuth family therefore remains **conditional only**. Activate/re-ground it only after Agent Core owns a real outbound remote-MCP/client credential flow with refreshable tokens and an explicit persistence/refresh contract. Until then, adding it would create an unused credential subsystem.

**Disposition: RETAIN — NOT CORPSE.** No additional non-duplicate current-fit mechanism was found at this fixed revision.
Evidence: `docs/Five-Reference-Conditional-Regrounding-20260925.md`.

## 8. Approved conditional execution closure — 2026-09-25

**APPROVED — DORMANT UNTIL OUTBOUND OAUTH CONSUMER EXISTS — REFERENCE RETAINED.**
The user approved the plan, but current Agent Core still has no outbound refreshable MCP OAuth client owner. The source-qualified disk-watch/expiry/401-single-flight/reconnect family is therefore intentionally not installed. Existing inbound/server OAuth storage is not treated as a substitute consumer. No dependency/helper installation was required.
