# Agent Core Wave D — Audit & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent Core diagnosable end-to-end without leaking secrets by adding request-to-evidence correlation, an asynchronous bounded tamper-evident audit journal with rotation/retention, expanded local metrics, and an optional loopback-only OTLP/HTTP JSON traces+metrics exporter.

**Architecture:** Preserve the existing 55-tool MCP surface and all Wave A-C trust/execution semantics. A request-scoped `AsyncLocalStorage` correlation context carries W3C-compatible trace identifiers through HTTP, routing, tool execution, and execution attempts; the local audit journal enriches every record from that context and writes off the request path through a bounded async queue. Local metrics stay authoritative. Optional OTLP export is disabled by default, accepts only loopback HTTP(S) endpoints, emits traces/metrics only, and fails open when no collector is present.

**Tech Stack:** TypeScript 7, Node.js >=24.15 (`node:async_hooks`, `node:crypto`, `node:fs/promises`, built-in `fetch`), Vitest 4, existing Agent Core runtime metrics, MCP SDK v2. No new package dependency is required.

**Spec:** `docs/roadmap/agent-core-balanced-evolution.md` — P1-D and Wave D.

## External standards verified 2026-08-31

- OpenTelemetry JavaScript: traces stable, metrics stable, logs development.
- OTLP 1.11: traces/metrics/logs transport stable; OTLP/HTTP JSON uses `application/json`, `/v1/traces`, `/v1/metrics`.
- W3C Trace Context: valid trace IDs are 16 bytes / 32 lowercase hex and span IDs are 8 bytes / 16 lowercase hex; `traceparent` is the propagation boundary.
- Agent Core therefore exports traces/metrics only; local JSONL audit remains authoritative and is not replaced by OTel Logs.

## Global Constraints

- No external AI model, agent provider, cloud embedding/reranker/judge, or model API key.
- No SaaS telemetry backend or telemetry API key is required or configured.
- OTLP export must be disabled by default and loopback-only when enabled.
- Collector absence/failure must never affect HTTP/MCP/tool/execution success.
- Raw credentials, bearer tokens, API keys, raw execution stdout/stderr, and secret file contents must never enter audit/telemetry payloads.
- Local audit and local metrics remain authoritative for operation and diagnosis.
- Audit file I/O must not block the HTTP/routing request path.
- Audit queue must be bounded and expose dropped/error counters rather than growing without bound.
- Audit hash chaining is tamper-evident, not claimed tamper-proof against an attacker who can replace every local log/anchor file.
- Rotation/retention must preserve verifiability of the retained chain.
- Existing Wave A/B/C behavior and 55-tool MCP compatibility must remain unchanged.

---

### Task D1: Request correlation context and W3C trace boundary

**Files:**
- Create: `src/observability/correlation.ts`
- Modify: `src/http/app.ts`
- Test: `tests/observability-correlation.test.ts`
- Test: `tests/http-auth.test.ts`

**Interfaces:**
- `CorrelationContext` fields: `requestId`, `traceId`, `spanId`, `traceFlags`, optional `parentSpanId`, `routeContextId`, `toolName`, `runId`, `nodeId`, `attemptId`.
- `createRequestCorrelation(headers)` accepts one valid W3C `traceparent`; preserves its trace ID/flags, records parent span ID, and generates a fresh local span ID. Invalid/missing input creates a fresh trace/span with flags `00`.
- `runWithCorrelation(context, operation)` scopes context using `AsyncLocalStorage`.
- `currentCorrelation()` returns a cloned safe snapshot or `null`.
- `withCorrelation(fields, operation)` creates a nested context without mutating the parent.
- `correlationFields()` returns JSON-safe top-level audit fields using OpenTelemetry-compatible names `trace_id`, `span_id`, `trace_flags` plus Agent Core identifiers.
- HTTP responses expose `x-agent-core-request-id` and the local `traceparent`; no secret-bearing inbound headers are reflected.

- [x] **Step 1: Write failing tests** for valid traceparent propagation, invalid traceparent replacement, nested context immutability, concurrent request isolation, and response correlation headers.
- [x] **Step 2: Run focused tests and record RED.**
- [x] **Step 3: Implement correlation module** with cryptographically random non-zero IDs and strict header validation.
- [x] **Step 4: Wrap every HTTP request in `runWithCorrelation`.** Add response identifiers before route handling.
- [x] **Step 5: Run correlation + HTTP security/auth regression and record GREEN.**
- [x] **Step 6: Commit** `feat: add request correlation context`.

### Task D2: Asynchronous bounded tamper-evident audit journal

**Files:**
- Create: `src/observability/audit-journal.ts`
- Modify: `src/logging/audit-log.ts`
- Modify: `src/http/app.ts`
- Modify: `src/index.ts`
- Test: `tests/audit-journal.test.ts`
- Test: `tests/http-auth.test.ts`
- Test: `tests/routing-audit.test.ts`
- Test: `tests/github-secret-leakage.test.ts`

**Interfaces:**
- `AuditJournal.enqueue(input): boolean` performs no filesystem I/O; it copies/sanitizes the bounded event, enriches correlation, and schedules an async drain.
- Queue default capacity: 4096, hard bounded to <=65536.
- Records contain `schemaVersion:1`, monotonically increasing `sequence`, `timestamp`, `category`, `event`, correlation fields, bounded `data`, `previousHash`, `hash`.
- `hash = sha256(stableJson(recordWithoutHash))`, including `previousHash`.
- `AuditJournal.drain()` waits until queued records are persisted; `close()` drains and closes.
- `AuditJournal.status()` exposes queue depth, capacity, written/dropped/writeError counts, sequence/headHash, current file bytes, rotated file count, last write error code only.
- `FileAuditLogger` remains a compatibility facade for existing HTTP/routing call sites, but delegates to one `AuditJournal`; `log`/`logRouting` enqueue and never synchronously append.
- HTTP `finally` must enqueue audit and return without awaiting disk persistence.
- Journal payload sanitizer recursively bounds depth/keys/string length, redacts known secret shapes, and never stores Authorization/Cookie/raw body material.

- [x] **Step 1: Write failing tests** proving enqueue returns before delayed file I/O, queue bounds/dropped counter, deterministic hash chain, correlation enrichment, and raw credential redaction.
- [x] **Step 2: Run focused tests and record RED.**
- [x] **Step 3: Implement async journal** using `fs/promises` and a single serialized drain worker.
- [x] **Step 4: Convert compatibility logger and HTTP audit path** to enqueue-only behavior; expose `drain/close/status` for lifecycle/tests.
- [x] **Step 5: Wire service shutdown** to drain/close audit after listener close and after execution/memory shutdown evidence has been queued.
- [x] **Step 6: Run audit/auth/routing/secret-leak regressions and record GREEN.**
- [x] **Step 7: Commit** `feat: add asynchronous audit journal`.

### Task D3: Rotation, retention, chain verification, and operator verifier

**Files:**
- Modify: `src/observability/audit-journal.ts`
- Modify: `src/config.ts`
- Modify: `src/cli.ts`
- Test: `tests/audit-rotation.test.ts`
- Test: `tests/config.test.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- `ObservabilityConfig.audit`: `queueCapacity`, `maxFileBytes`, `maxRotatedFiles`, `retentionMs`.
- Environment: `AGENT_CORE_AUDIT_QUEUE_CAPACITY`, `AGENT_CORE_AUDIT_MAX_FILE_BYTES`, `AGENT_CORE_AUDIT_MAX_ROTATED_FILES`, `AGENT_CORE_AUDIT_RETENTION_MS`.
- Active file: `<logDir>/audit/audit.current.jsonl`; state/head: `<logDir>/audit/audit-head.json`; retention anchor: `<logDir>/audit/audit-anchor.json`.
- Rotation occurs only between records and produces immutable `audit.<firstSequence>-<lastSequence>.<utc>.jsonl` segments.
- Before deleting rotated segments, journal advances the retention anchor to the hash/sequence immediately before the first retained record, atomically writes the anchor, then deletes only whole oldest segments.
- `verifyAuditJournal(root)` reads anchor + rotated + current files in sequence order and validates JSON shape, strict sequence continuity, previousHash linkage, record hashes, and head state. Returns `{ok, firstSequence,lastSequence,records,files,headHash,anchorSequence}` or a stable failure code.
- CLI: `agent-core audit-verify [audit-root]` is read-only and never repairs/touches evidence.

- [x] **Step 1: Write failing tests** for multi-rotation integrity, retention-anchor advancement, retained-chain verification, byte/sequence naming, tamper mutation, deleted-middle-record detection, and CLI verification.
- [x] **Step 2: Run focused tests and record RED.**
- [x] **Step 3: Implement rotation + retention** with atomic head/anchor files and no partial-segment deletion.
- [x] **Step 4: Implement verifier** independent of the live writer.
- [x] **Step 5: Add config and read-only CLI verifier.**
- [x] **Step 6: Run rotation/config/CLI regressions and record GREEN.**
- [x] **Step 7: Commit** `feat: rotate and verify audit journal`.

### Task D4: End-to-end tool/execution correlation

**Files:**
- Create: `src/observability/tool-instrumentation.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/runtime/route-context-store.ts`
- Modify: `src/memory/operational-audit.ts`
- Modify: `src/execution/service.ts`
- Modify: `src/execution/runner.ts`
- Modify: `src/execution/log-store.ts`
- Modify: `src/execution/wake.ts`
- Test: `tests/observability-correlation.integration.test.ts`
- Test: `tests/execution-runner.test.ts`
- Test: `tests/memory-operational-audit.test.ts`
- Test: `tests/mcp-integration.test.ts`

**Interfaces:**
- Instrument `McpServer.registerTool` once at server construction so all 55 tool callbacks execute under `withCorrelation({toolName})`; no tool schema changes.
- Tool wrapper emits local `tool.calls.count`, `tool.duration_ms`, `tool.failures.count` metrics and audit events with tool name/status/duration only; no raw arguments/results.
- Route audit automatically records active request/trace IDs and routeContextId.
- `OperationalMemoryAudit` adds correlation identifiers to structured event metadata but keeps redacted operational summaries and project scope unchanged.
- `ExecutionService.create` injects bounded `metadata.observability.createdBy` from the active correlation unless the caller already owns a non-observability metadata namespace.
- `ExecutionCommandRunner.start` snapshots active correlation plus `runId/nodeId/attemptId`; terminal result markers gain optional `correlation` evidence. Old markers remain valid.
- Execution events merge safe correlation identifiers into payload under `correlation`, preserving persisted event truth and wake semantics.

- [x] **Step 1: Write failing integration test** performing capability route -> execution create/start -> terminal evidence and asserting the same trace/request lineage appears in HTTP audit, route audit, operational memory/event metadata, execution events, and result marker.
- [x] **Step 2: Run focused tests and record RED.**
- [x] **Step 3: Add server-wide tool wrapper** and route/operational correlation enrichment.
- [x] **Step 4: Persist execution correlation** in run metadata/events/result markers without schema migration.
- [x] **Step 5: Verify absent correlation remains backward-compatible for direct unit calls outside HTTP.**
- [x] **Step 6: Run MCP/execution/memory regression and record GREEN.**
- [x] **Step 7: Commit** `feat: correlate requests with execution evidence`.

### Task D5: Expanded bounded local metrics and audit health

**Files:**
- Modify: `src/runtime/metric-window.ts`
- Modify: `src/runtime/health-metrics.ts`
- Modify: `src/oauth/service.ts`
- Modify: `src/http/auth.ts`
- Modify: `src/execution/backup.ts`
- Modify: `src/execution/retention.ts`
- Modify: `src/runtime/services.ts`
- Modify: `src/index.ts`
- Test: `tests/health-metrics.test.ts`
- Test: `tests/oauth.test.ts`
- Test: `tests/execution-backup-restore.test.ts`
- Test: `tests/execution-retention.test.ts`

**Interfaces:**
- Registry gains `counterSnapshot()` / `metricNames()` bounded introspection; no unbounded label maps.
- New stable metrics without secret-bearing labels:
  - `http.request.duration_ms`, `http.requests.count`, `http.failures.count`
  - `oauth.handle.duration_ms`, `oauth.failures.count`, `auth.failures.count`
  - `routing.validation.duration_ms`, existing routing counters retained
  - `tool.duration_ms`, `tool.calls.count`, `tool.failures.count`
  - `execution.backup.duration_ms`, `execution.restore.duration_ms`, `execution.retention.duration_ms`
  - `audit.written.count`, `audit.dropped.count`, `audit.write_errors.count`, `audit.rotation.count`
  - `telemetry.export.duration_ms`, `telemetry.export_failures.count` (Task D6)
- Detailed health snapshot adds bounded `audit` and `observability` sections; no credential paths, raw IDs beyond counts/head hash prefix where needed for diagnosis.

- [x] **Step 1: Write failing tests** for new metric counters/durations and bounded health output.
- [x] **Step 2: Run focused tests and record RED.**
- [x] **Step 3: Instrument HTTP/OAuth/auth/routing/tool/backup/restore/retention paths.**
- [x] **Step 4: Add audit status and metric views to local detailed health.**
- [x] **Step 5: Run focused metrics/security regressions and record GREEN.**
- [x] **Step 6: Commit** `feat: expand bounded observability metrics`.

### Task D6: Optional loopback-only OTLP/HTTP JSON traces and metrics exporter

**Files:**
- Create: `src/observability/otlp-exporter.ts`
- Create: `src/observability/telemetry.ts`
- Modify: `src/config.ts`
- Modify: `src/http/app.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/runtime/services.ts`
- Modify: `src/index.ts`
- Test: `tests/otlp-exporter.test.ts`
- Test: `tests/config.test.ts`
- Test: `tests/health-metrics.test.ts`

**Interfaces:**
- `ObservabilityConfig.otlp`: `enabled`, `endpoint`, `timeoutMs`, `maxQueue`, `exportIntervalMs`.
- Environment: `AGENT_CORE_OTLP_ENDPOINT`; unset => disabled. Endpoint must be `http:` or `https:` and hostname must be loopback (`localhost`, `127.*`, `::1`) with no credentials/query/hash. No header/API-key configuration exists.
- Exporter uses OTLP/HTTP JSON (`Content-Type: application/json`) with `/v1/traces` and `/v1/metrics` appended to the base endpoint.
- Trace queue is bounded. HTTP/tool spans include only low-cardinality safe attributes: service name/version, route template, HTTP method/status, MCP tool name, result status, duration.
- Metric export converts the authoritative local snapshot/counters into OTLP gauge/sum points with no user/project/path/credential labels.
- Export failure/timeouts update local metrics/status and drop/retry only within bounded queue rules; never throw into request/tool paths.
- `TelemetryService.close()` performs a bounded best-effort final flush; collector absence remains operationally irrelevant.

- [x] **Step 1: Write failing local fake-collector tests** for exact `/v1/traces` + `/v1/metrics`, JSON content type, valid 32/16 hex IDs, safe attributes, collector unavailable behavior, and queue bounds.
- [x] **Step 2: Run focused tests and record RED.**
- [x] **Step 3: Implement config + exporter** with no new dependency and no remote endpoint support.
- [x] **Step 4: Implement `TelemetryService`** fed by HTTP/tool instrumentation and periodic authoritative local metric snapshots.
- [x] **Step 5: Wire lifecycle and detailed health status.**
- [x] **Step 6: Run exporter/config/HTTP/MCP regression and record GREEN.**
- [x] **Step 7: Commit** `feat: add optional local otlp export`.

### Task D7: Adversarial acceptance, documentation, full certification, and integration

**Files:**
- Modify: `docs/stability.md`
- Modify: `docs/roadmap/agent-core-balanced-evolution.md`
- Modify: `docs/roadmap/agent-core-wave-d-implementation-plan.md`
- Modify: `docs/README.md` only if a dedicated observability operator document is added.

- [x] **Step 1: Run focused Wave D acceptance** covering correlation isolation, async audit queue, secret redaction, hash-chain verification, rotation/retention, tamper detection, tool/execution correlation, metrics, OTLP loopback export, collector absence, and Wave A-C security/compatibility regressions.
- [x] **Step 2: Run `npm run build`, `git diff --check`, package dependency diff, brand scan and doc-link check.**
- [x] **Step 3: Run `npm run verify:release`.**
- [x] **Step 4: Live temporary-instance canary**: send a correlated MCP route+execution request, drain journal, verify request->route->run/attempt lineage, rotate/verify chain, tamper copied segment and prove verifier rejects it, run fake local OTLP collector, stop collector and prove Agent Core still operates.
- [x] **Step 5: Public Codespace compatibility baseline** on pre-integration source: Wave A gates + legacy/modern 55-tool paths.
- [x] **Step 6: Record exact local evidence and commit** `docs: record wave d local certification evidence`.
- [ ] **Step 7: Fast-forward `main` only if origin topology remains compatible; run fresh merged-main `npm ci` + `npm run verify:release`; push non-force and require local/remote equality.**
- [ ] **Step 8: Controlled real runtime restart; require `connection.sourceCommit == HEAD == origin/main`; public health/security + legacy/modern canary; verify live audit chain and collector-absent behavior.**
- [ ] **Step 9: Commit/push final docs-only certification if needed, source-sync runtime, then remove only the Wave D worktree/local branch after exact equality is proven.**

## Wave D Exit Matrix

```text
raw credentials in telemetry/audit          = 0
raw execution log content in telemetry      = 0
request-to-route correlation                complete
route-to-tool correlation                   complete
tool-to-run/node/attempt correlation        complete
request-path synchronous audit file I/O     = 0
audit queue                                 bounded
audit rotation integrity                    PASS
audit retention anchor integrity            PASS
audit tamper mutation detection             PASS
audit sequence deletion detection           PASS
local detailed metrics                      authoritative/bounded
OTLP endpoint                               loopback-only
OTLP traces/metrics                         PASS when collector present
collector absent/unreachable                Agent Core fully functional
new telemetry cloud/API credential surface  = 0
external AI model/API dependency            = 0
Wave A/B/C compatibility                    PASS
full regression                             PASS
```

## Wave D Pre-Integration Certification Evidence — 2026-08-31

```text
focused adversarial acceptance (serial)  23 files / 159 tests PASS
full npm run verify:release               123 files / 605 tests PASS
intentional platform/perf skips          38 tests
brand scan                               PASS
TypeScript build                          PASS
Codespace compatibility build             PASS
release metadata consistency              PASS
markdown link verification                34 files / 16 links PASS
package/dependency changes                none
external AI model/API dependency          0
```

Live temporary-instance evidence:

```text
request trace -> execution_create request        PASS
same trace -> execution_start request             PASS
creator/start request IDs remain distinct         PASS
run metadata creator correlation                  PASS
node.started / node.succeeded correlation         PASS
terminal result-marker run/node/attempt lineage   PASS
audit chain verification                          PASS; 19 records
audit rotation                                     PASS; 18 immutable segments
raw command sentinel in audit                      0
tampered copied audit chain                        rejected PASS
OTLP /v1/traces + /v1/metrics                      PASS
HTTP + execution_create + execution_start spans   PASS
collector removed                                  export failure isolated PASS
health after collector removal                     HTTP 200 / overall healthy
OTLP endpoint leaked by health                     0
```

Pre-integration public Codespace baseline remains the Wave C certified source `eaa50d8d50831fb8ba7126429477ca0d4273b085`:

```text
public /health                       200
public /health/metrics               403
public /mcp without token            401
public untrusted Origin              403
legacy MCP                           2025-11-25 / 55 tools PASS
modern MCP                           2026-07-28 / 55 tools PASS
temporary baseline key               revoked PASS
```

Final Wave D certification remains pending merged-main verification, push/readback, controlled runtime source-sync, and post-integration public/audit/collector-absent verification.
