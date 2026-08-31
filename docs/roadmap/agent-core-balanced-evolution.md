# Agent Core Balanced Evolution — Evidence-Backed Upgrade Proposal

**Date:** 2026-08-31
**Status:** APPROVED ROADMAP — WAVES A-B CERTIFIED COMPLETE; WAVES C-G NOT IMPLEMENTED
**Scope:** Agent Core core only. Codespace is not an upgrade target in this proposal.
**Strategy:** Hybrid compatibility — backward-compatible by default; a major change is allowed only when benefit is evidence-backed and a migration/rollback path exists.

## 1. Purpose

This proposal defines the next improvement/upgrade direction for Agent Core after the current v0.5.4 stable baseline.

The objective is not to maximize feature count. The objective is to make Agent Core a stronger local control plane by improving:

- correctness and project isolation;
- authentication and protocol security;
- execution safety and resource governance;
- backup, recovery, evidence retention and operator control;
- auditability and observability;
- routing and memory quality, not only latency;
- adaptive local resource management;
- maintainability of high-risk core modules;
- release certification of the core itself.

This proposal deliberately excludes features that cannot be proven to exist or cannot be implemented without changing Agent Core into a cloud-model orchestrator.

---

## 2. Non-Negotiable Architecture Invariants

These are hard constraints for every future implementation wave.

### 2.1 No external AI-model dependency

Agent Core MUST NOT require or introduce any additional cloud AI model, external AI agent provider, or model API key as a dependency for these upgrades.

Explicitly excluded as upgrade dependencies:

```text
OpenAI model API key for additional agents/models
Codex API/provider credential for delegated reasoning
Anthropic / Claude API
Google Gemini API
external hosted LLM providers
external multi-agent orchestration services
any hidden fallback from local Agent Core behavior to a cloud model
```

Agent Core remains a local deterministic control plane. The connected primary model/host may use Agent Core tools, but Agent Core itself does not gain intelligence by secretly calling another model.

If a future feature requires an external model primitive, it is **not part of this roadmap** until the operator explicitly redefines this invariant.

### 2.2 No speculative capability roadmap

A feature is not promoted into an implementation roadmap merely because it seems technically plausible.

Use three evidence classes:

- **Verified gap** — current source or tests demonstrate a correctness, security, durability, or operational gap.
- **Modernization opportunity** — current behavior is valid, but a documented standard/platform capability provides a measurable improvement path.
- **Deferred until evidence** — capability is not implemented and cannot yet be proven usable in the required architecture; do not build placeholders or fake abstractions for it.

### 2.3 Codespace is not the target

The target is Agent Core core behavior. Codespace lifecycle/tunnel work is out of scope unless a core change requires compatibility validation against the existing connector path.

### 2.4 Deterministic truth hierarchy remains authoritative

Existing Agent Core truth ordering must not be weakened:

```text
process truth
> verified artifact truth
> parsed/derived interpretation
> advisory optimization
> workflow recommendation
> semantic completion only through explicit checkpoint
```

### 2.5 Security boundaries must become narrower, never wider

A modernization may not weaken:

- principal isolation;
- project isolation;
- workspace path boundaries;
- route tool allowlists;
- credential isolation;
- destructive-operation gates;
- secret redaction;
- package/release secret exclusions;
- fail-closed handling of unknown or inconsistent evidence.

### 2.6 Hybrid compatibility policy

Default rule:

```text
preserve current clients and behavior
```

Major/breaking change is allowed only if all are true:

1. measurable benefit is documented;
2. dual-mode compatibility is impractical or unsafe;
3. migration path is explicit;
4. rollback path is tested;
5. current stable behavior remains recoverable until the new mode is certified.

---

## 3. Current Stable Strengths to Preserve

The proposal assumes the current Agent Core baseline already has strong foundations that should not be replaced casually:

- custom Agent Core API-key authentication plus OAuth bridge;
- principal/project-scoped routing;
- Deterministic Memory Fabric (DMF);
- Local Continuity Ledger;
- deterministic multi-command DAG execution;
- persisted event-driven wake with no busy polling;
- result markers and SHA-256 evidence;
- verified artifact indexing;
- execution-to-memory evidence promotion;
- restart recovery that never converts missing process state into success;
- Native GitHub Fabric with separated package credential;
- bounded health metrics;
- local release verification and stable release parity enforcement;
- current zero-touch connector lifecycle as an integration dependency, not a roadmap target.

The goal is evolutionary hardening, not architectural replacement for its own sake.

---

# 4. Verified Current-Source Findings

This section contains findings derived directly from the tracked Agent Core source as of the proposal date.

## P0-A — Multi-project operational audit scope can fall back to workspace root zero

**Evidence class:** Verified gap
**Priority:** P0 correctness / isolation

`OperationalMemoryAudit.scope()` currently resolves project scope with:

```text
projectId: runtime.workspace.roots[0]
```

while routed operations themselves can run against `route.projectId`.

Relevant source:

```text
src/memory/operational-audit.ts
src/mcp/tools.ts
src/mcp/github-tools.ts
```

Impact:

- an operation routed to Project B can have audit/failure memory persisted under Project A when multiple workspace roots are configured;
- operational evidence can become semantically associated with the wrong project even though filesystem/process execution itself remains project-scoped;
- this violates the stronger multi-project isolation model already enforced by route/path/execution layers.

Required direction:

- all operational audit writes must receive the resolved routed project identity explicitly;
- lifecycle events for long-running processes must preserve the stored project identity after route expiry;
- cross-project regression test must assert audit/failure memory cannot land in another project.

Acceptance invariant:

```text
operation.projectId == audit.projectId == failure-memory.projectId
```

for every routed operation.

---

## P0-B — OAuth access-token authentication does not bind the incoming MCP request to the token resource

**Evidence class:** Verified gap
**Priority:** P0 authorization correctness

The OAuth store persists a `resource` field in authorization codes, access tokens and refresh tokens. Code and refresh-token exchange compare the supplied resource to the stored record.

However, request authentication currently calls:

```text
FileOAuthStore.verifyAccessToken(token)
```

and verifies only token validity/scopes/key identity. The current MCP request resource/origin is not compared against the access token's stored `resource` before the token is accepted.

Relevant source:

```text
src/oauth/store.ts
src/oauth/service.ts
src/http/auth.ts
src/http/app.ts
```

Required direction:

- compute the canonical protected-resource identifier for the current request;
- require access-token resource equality with that canonical MCP resource;
- reject tokens minted for another resource even if the token itself is cryptographically/structurally valid;
- add negative tests for cross-resource token replay.

This change should remain compatible with the existing correct ChatGPT OAuth flow because the normal token is already minted for the MCP resource.

---

## P0-C — MCP HTTP layer has no explicit Origin validation policy

**Evidence class:** Verified gap against current MCP security requirements
**Priority:** P0 transport security

The current `/mcp` handler authenticates the bearer token and processes POST requests, but tracked source contains no explicit validation of the HTTP `Origin` header for MCP requests.

Relevant source:

```text
src/http/app.ts
src/mcp/handler.ts
```

Required direction:

- add explicit Origin validation at the public MCP HTTP boundary;
- define accepted behavior for legitimate clients that do not send Origin according to current MCP/host compatibility requirements;
- reject untrusted browser-origin traffic before MCP tool dispatch;
- preserve loopback/local compatibility;
- regression-test DNS-rebinding/browser-origin cases without relying on network assumptions.

The implementation must use the current MCP security specification as authority rather than inventing an ad-hoc browser policy.

---

## P0-D — `/health/metrics` is anonymously reachable before authentication

**Evidence class:** Verified gap
**Priority:** P0 operational information exposure

`GET /health/metrics` is handled before MCP authentication in `src/http/app.ts`.

The detailed metrics snapshot can expose operational metadata including:

- memory DB size and item count;
- memory/query timing and recent failure codes;
- active/queued execution state;
- routing counts;
- GitHub API/credential health state.

No raw credential is returned, but on a remotely reachable deployment this is still an unnecessary reconnaissance surface.

Required direction:

Choose and certify one explicit policy:

```text
A. authenticated-only detailed metrics endpoint; or
B. loopback-only detailed metrics endpoint + authenticated MCP metrics tool for remote clients
```

Recommended default: B when possible, because `agent_core_health_metrics` already provides an authenticated MCP surface.

`GET /health` may remain minimal/readiness-oriented and unauthenticated if its payload remains intentionally non-sensitive.

---

## P0-E — External origin construction trusts forwarded host/proto without an explicit trusted-proxy contract

**Evidence class:** Verified hardening gap
**Priority:** P0/P1 depending on deployment boundary

`externalBaseUrl()` currently prefers:

```text
x-forwarded-proto
x-forwarded-host
```

without a tracked trusted-proxy allowlist or canonical external-origin configuration.

Relevant source:

```text
src/oauth/service.ts
```

This means correct operation currently depends on deployment topology behaving as expected rather than an explicit Agent Core trust policy.

Required direction:

- introduce canonical public MCP origin configuration and/or explicit trusted-proxy mode;
- forwarded headers must only be authoritative when the request is known to come through the configured proxy boundary;
- OAuth metadata, issuer, resource and challenge generation must converge on one canonical origin;
- direct/local requests must not be able to spoof public OAuth identity through arbitrary forwarded headers.

This is a core HTTP/OAuth hardening task, not a Codespace feature.

---

# 5. Modernization Opportunities

## P1-A — MCP v2 / protocol 2026-07-28 dual-era modernization

**Evidence class:** Modernization opportunity
**Priority:** P1 protocol evolution

Current package dependency:

```text
@modelcontextprotocol/sdk 1.30.0
```

The MCP TypeScript SDK v2 is now the stable line for the 2026-07-28 specification and replaces the monolithic v1 package with v2 packages such as `@modelcontextprotocol/server`.

Important for the Hybrid strategy: the v2 HTTP server entry can serve the modern 2026-07-28 era and legacy 2025-era stateless traffic from one server factory. Therefore Agent Core does not need an immediate compatibility-breaking cutover.

Modern protocol benefits relevant to Agent Core:

- stateless protocol core;
- `server/discover` capability discovery;
- self-describing per-request envelope;
- `Mcp-Method` / `Mcp-Name` headers for routing/policy visibility;
- cache hints and deterministic lists;
- authorization hardening;
- cleaner dual-era migration path.

Recommended rollout:

```text
v1 current server
    ↓
SDK v2 while still serving legacy era
    ↓
dual-era acceptance matrix
    ↓
opt-in modern 2026-07-28 path
    ↓
modern becomes preferred only after host compatibility is proven
```

Do not remove legacy support merely because the new spec exists.

### OAuth client-registration modernization

Current Agent Core advertises Dynamic Client Registration (DCR) through `/oauth/register`.

MCP 2026-07-28 introduces authorization hardening and a formal shift away from DCR toward client metadata document/CIMD-style discovery. DCR should therefore become a compatibility path, not be expanded as the long-term architecture.

Required rule:

- preserve DCR while existing ChatGPT/legacy host behavior requires it;
- add modern metadata/auth behavior only when interoperability is proven;
- never break the working connector in order to claim protocol freshness.

---

## P1-B — Structured Execution Policy Engine

**Evidence class:** Modernization/hardening opportunity
**Priority:** P1 execution safety

Current command policy is shared correctly by operational commands and execution DAG validation through `assertCommandAllowed()`. This is a strength.

However, the policy is fundamentally based on parsing a free-form shell string and blocking a set of command names/nested forms.

Relevant source:

```text
src/runtime/process-manager.ts
src/execution/dag.ts
src/runtime/platform-shell.ts
```

A stronger architecture should introduce a structured policy decision before spawn:

```text
ExecutionIntent
  executable / interpreter class
  argv or shell compatibility payload
  cwd/project
  risk class
  timeout
  resource budget
  network/open-world characteristic
  expected side effects
        ↓
ExecutionPolicyDecision
  allow / reject / require explicit high-impact route
  reason codes
        ↓
platform runner
```

Compatibility mode remains available for existing shell commands. This is not a proposal to ban shell execution.

Enhancements:

- canonical nested-interpreter detection;
- explicit executable/interpreter classification;
- policy reason codes in execution evidence;
- per-run/process output quota;
- child process-tree control;
- optional CPU/memory/time budgets;
- platform-specific containment adapter.

### Windows resource control

Windows Job Objects can provide process-group containment and enforce limits such as process memory and process time. Agent Core can use them as a Windows implementation detail behind a platform-neutral resource-governance interface.

The Linux adapter should use local OS primitives available to the deployment environment and must fail safely when hard resource enforcement is unavailable.

No cloud execution service is introduced.

---

## P1-C — Execution Backup, Restore and Evidence Lifecycle

**Evidence class:** Verified operational gap + modernization opportunity
**Priority:** P1 durability

DMF has a first-class backup/restore implementation with integrity validation and pre-restore rollback protection.

Execution already has a low-level worker `backup` primitive and migration backups, but does not expose an equivalent high-level execution backup/recovery lifecycle. Documentation currently tells the operator to stop Agent Core and manually copy the execution database and matching logs.

Relevant source:

```text
src/memory/backup.ts
src/execution/db-worker.ts
src/execution/worker-client.ts
src/execution/store.ts
src/execution/log-store.ts
```

Target architecture: **Execution Recovery Bundle**.

Bundle metadata should include:

```text
execution DB backup
SQLite integrity result
schema version
createdAt/reason
selected evidence run directories
manifest of result markers
SHA-256 manifest
source Agent Core version
restore compatibility metadata
```

Restore rules:

- service must be stopped or execution subsystem quiesced;
- backup integrity verified before replacement;
- current DB gets a pre-restore rollback backup;
- WAL/SHM handled explicitly;
- evidence directories are validated against run/attempt/result-marker identity;
- missing evidence must never be converted into successful execution truth.

### Raw-log retention

Current execution documentation explicitly states there is no automatic raw-log retention/purge policy.

Add a local retention subsystem with:

- dry-run by default;
- age/size thresholds;
- protected run/evidence markers;
- never delete evidence referenced by active continuity/checkpoints without explicit operator policy;
- backup prerequisite for destructive purge profiles;
- advisory recommendations separated from actual deletion;
- audit record for every purge decision/action.

---

## P1-D — Audit & Observability Fabric

**Evidence class:** Modernization opportunity
**Priority:** P1 operability/security

Current HTTP/routing audit uses JSONL and `appendFileSync()`. Runtime health metrics already provide a bounded in-memory metric registry.

Relevant source:

```text
src/logging/audit-log.ts
src/runtime/health-metrics.ts
src/runtime/metric-window.ts
src/memory/operational-audit.ts
```

Target architecture:

```text
HTTP request
  requestId
     ↓
routeContextId
     ↓
tool operation / execution run
     ↓
runId / nodeId / attemptId
     ↓
artifact / memory evidence / GitHub operation
```

Add:

- end-to-end correlation identifiers;
- asynchronous bounded audit writer instead of synchronous append on request path;
- log rotation and retention;
- tamper-evident local hash chaining for security-sensitive audit records;
- clear separation between request audit, routing audit, operational audit, execution evidence and semantic DMF;
- latency/error/cardinality metrics for OAuth, route validation, tool calls, backup/recovery and storage maintenance.

### Optional OpenTelemetry export

OpenTelemetry JavaScript currently reports traces and metrics as stable, while logs remain in development.

Agent Core may add an **optional local exporter boundary** for traces/metrics, but:

- Agent Core must work fully with no collector;
- no SaaS telemetry backend is required;
- no cloud account/API key is required;
- local metrics remain authoritative for operation;
- telemetry export never contains raw secrets or raw execution logs by default.

This satisfies the no-external-AI-model invariant because OpenTelemetry is telemetry infrastructure, not an AI provider.

---

## P1-E — Routing Quality Evaluation, not only deterministic routing

**Evidence class:** Verified evaluation gap
**Priority:** P1 intelligence quality

Current capability routing is deterministic and understandable, but primary classification still depends on regex task signals and substring-weighted capability search.

Relevant source:

```text
src/capabilities/router.ts
src/capabilities/registry-service.ts
tests/capability-router.test.ts
```

Current tests prove selected examples and determinism. They do not yet establish a broad quantitative routing quality baseline.

Create an **offline, deterministic Routing Evaluation Corpus** stored in the repo.

Each case declares expected properties such as:

```text
expected tier
expected risk range
must-allow tools
must-not-allow tools
expected domain/capability family
whether a skill load is appropriate
whether verification must be required
```

Metrics:

- tier accuracy;
- false high-impact rate;
- unsafe overpermission rate;
- false read-only classification rate;
- relevant skill precision@K;
- unnecessary skill-load rate;
- deterministic replay equality.

Only after baseline metrics exist should routing heuristics be changed materially.

No cloud embedding/model/reranker is required or allowed by this proposal.

---

## P1-F — Memory Recall Quality Gate

**Evidence class:** Verified evaluation gap
**Priority:** P1 intelligence quality

DMF already has meaningful scenario tests and a 100k-item latency benchmark. The performance benchmark primarily answers:

```text
How fast can recall/preflight run at scale?
```

It does not yet provide a broad quantitative answer to:

```text
Did Agent Core retrieve the right memories, in the right order, with the right exclusions?
```

Relevant source:

```text
src/memory/retriever.ts
src/memory/scoring.ts
tests/memory-awareness.acceptance.test.ts
scripts/benchmark-memory.mjs
```

Add a deterministic quality corpus covering:

- hard guardrail recall;
- revised/current decision recall;
- prior failure recall;
- multi-hop graph recall;
- conflict recall;
- relevant artifact/procedure recall;
- stale-noise resistance;
- cross-project contamination;
- cross-principal contamination;
- character-budget packing behavior.

Candidate metrics:

```text
Recall@K
MRR / first-relevant rank
hard-guardrail recall = 100%
current-revision correctness = 100%
cross-project contamination = 0
cross-principal contamination = 0
conflict visibility rate
noise displacement rate
```

Weights in `MemoryConfig.scoreWeights` should not be tuned merely by intuition. Future tuning must improve the corpus without violating deterministic/security invariants.

No external embedding API, vector SaaS, cloud reranker or AI judge is allowed by this proposal.

---

# 6. P2 — Adaptive Local Control Plane

These upgrades should begin only after P0/P1 observability and quality gates exist.

## P2-A — Adaptive concurrency and local resource pressure

Current execution has a configured maximum concurrency and deterministic scheduler.

Upgrade direction:

- preserve configured hard maximum;
- introduce local pressure signals for CPU, memory, disk/evidence backlog and worker health;
- scheduler may temporarily reduce dispatch concurrency under pressure;
- never increase above operator hard maximum automatically;
- store reason codes for throttling decisions;
- deterministic tests use injected resource snapshots rather than host timing assumptions.

Example:

```text
configured maxConcurrency = 8
current safe concurrency  = 3
reason                    = local_memory_pressure
```

This is resource governance, not AI autonomy.

## P2-B — Evidence-based operator diagnosis

Agent Core can produce better local diagnosis by combining existing factual subsystems:

```text
health metrics
execution failures
memory prior failures
continuity blockers
GitHub availability
storage/backlog status
```

Output remains structured recommendations with evidence refs and reason codes.

Example categories:

```text
storage maintenance recommended
execution backup overdue
raw log retention threshold exceeded
high route rejection rate
memory recall latency regression
GitHub credential degraded
repeated process failure signature
```

Recommendations are not automatic destructive actions.

## P2-C — Scheduled local maintenance

Optional operator-configured maintenance can include:

- integrity checks;
- backup creation;
- backup rotation;
- evidence-retention dry run;
- old temporary auth/helper cleanup;
- performance/quality drift check.

Maintenance must remain local and auditable.

---

# 7. P2/P3 — Maintainability Hardening

Large modules increase regression blast radius. Current examples include approximately:

```text
src/execution/store.ts          ~50 KB
src/memory/service.ts           ~28 KB
src/execution/service.ts        ~27 KB
src/continuity/store.ts         ~26 KB
src/memory/store.ts             ~25 KB
```

Do not launch a repository-wide refactor merely to reduce file size.

Instead, when a wave modifies one of these domains, extract clear units around existing responsibility boundaries, for example:

```text
execution persistence
execution queries/views
execution migrations/backups
execution lifecycle
execution evidence

memory persistence
memory revision lifecycle
memory conflict handling
memory backup/recovery
memory retrieval
```

Acceptance rule:

- behavior stays regression-identical before new functionality is enabled;
- stable interfaces are defined before moving internals;
- no refactor-only release without an operational reason.

A second maintainability goal is a more unified structured error contract across subsystems so error code, safe message, details, retryability and severity can be observed consistently without exposing secrets.

---

# 8. Proposed Upgrade Waves

## Wave A — Repair Trust Boundaries

**Goal:** repair factual correctness/security invariants before adding sophistication.

Scope:

1. multi-project operational audit scope;
2. OAuth access-token resource binding;
3. MCP Origin validation;
4. `/health/metrics` exposure policy;
5. canonical public origin / trusted-proxy policy.

Implementation evidence before final A6/A7 certification:

```text
A1 project-scoped operational audit       implemented + focused tests pass
A2 OAuth protected-resource binding       implemented + focused tests pass
A3 MCP Origin validation                  implemented + focused tests pass
A4 loopback-only detailed HTTP metrics    implemented + focused tests pass
A5 canonical origin / trusted proxy       implemented + focused tests pass
focused final Wave A acceptance            7 files / 58 tests PASS
full repository regression                 111 files / 527 tests PASS; 38 intentional skips
release verification                       PASS
live local compatibility canary            PASS
external AI model/API dependency added     0
```

Exit gates:

```text
cross-project audit leakage             = 0
oauth cross-resource token acceptance   = 0
untrusted browser Origin accepted       = 0
detailed remote metrics anonymous       = 0
canonical issuer/resource disagreement  = 0
existing connector compatibility        = PASS
full regression                         = PASS
```

---

## Wave B — MCP Dual-Era Modernization

**Goal:** move Agent Core onto SDK v2 while preserving legacy interoperability.

Implemented scope:

- root/core migrated from monolithic MCP SDK v1 to `@modelcontextprotocol/server` 2.0.0 + `@modelcontextprotocol/node` 2.0.0;
- official `@modelcontextprotocol/client` 2.0.0 is dev-only for interoperability tests;
- existing Codespace plugin remains on MCP SDK v1.30.0 as a factual legacy compatibility canary;
- legacy 2025-era stateless MCP remains supported with the prior JSON response behavior;
- modern 2026-07-28 `server/discover`, envelope/header validation and tool traffic are served through the official v2 handler;
- default `AGENT_CORE_MCP_PROTOCOL_MODE=dual` serves both eras;
- `AGENT_CORE_MCP_PROTOCOL_MODE=legacy` is a tested runtime rollback that rejects/pushes auto-negotiating clients back from modern while retaining legacy service;
- the same 55 Agent Core tools and representative structured results are exposed in both eras;
- Wave A Origin/auth/resource boundaries remain ahead of protocol dispatch;
- DCR remains compatibility-only;
- authorization responses now emit RFC 9207 `iss` equal to the canonical Agent Core issuer;
- CIMD activation is deferred because required host interoperability and a safe metadata-fetch trust policy are not yet factual; no placeholder endpoint or speculative fetch surface was added.

Certification evidence:

```text
focused Wave B acceptance          15 files / 110 tests PASS
full repository regression         113 files / 542 tests PASS; 38 intentional skips
legacy tool surface                55 / 55 PASS
modern tool surface                55 / 55 PASS
modern server/discover             PASS
modern validation ladder           PASS
OAuth/security gates               PASS
RFC 9207 issuer response           PASS
Codespace v1 compatibility         PASS
live dual dist/index.js canary     PASS
live legacy rollback canary        PASS
merged-main npm ci + verify        PASS
origin/main exact equality         PASS
real Codespace sourceCommit        2408d41 verified
public legacy connector canary     legacy / 55 PASS
public modern protocol canary      modern / 2026-07-28 / 55 PASS
public OAuth issuer/resource       PASS
public Wave A security gates       PASS
public temporary canary key revoke PASS
external AI model/API dependency   0
```

Exit gates:

```text
legacy connector behavior        PASS
modern protocol acceptance       PASS
same Agent Core tool semantics   PASS
OAuth/security gates             PASS
rollback to legacy-only mode     PASS
main/public runtime integration  PASS
```

---

## Wave C — Execution & Recovery Hardening

**Goal:** strengthen local execution containment and durability.

Scope:

- structured Execution Policy Engine;
- compatibility shell policy;
- process-tree/resource-governance adapters;
- execution backup bundle;
- verified restore;
- raw evidence retention and safe purge workflow.

Exit gates:

```text
blocked/high-risk policy regressions       PASS
project/workspace escape                   = 0
orphan child processes after cancel        = 0 in certified scenarios
resource cap enforcement/fallback          factual
backup integrity                           PASS
restore rollback                           PASS
missing evidence never becomes success     PASS
retention dry-run/action parity             PASS
```

---

## Wave D — Audit & Observability

**Goal:** make Agent Core behavior diagnosable end-to-end without leaking secrets.

Scope:

- asynchronous audit journal;
- correlation IDs;
- rotation/retention;
- tamper-evident chain;
- expanded bounded health metrics;
- optional local OpenTelemetry traces/metrics export.

Exit gates:

```text
raw credentials in telemetry/audit    = 0
request-to-evidence correlation        complete
request-path synchronous log stalls    removed
rotation integrity                     PASS
tamper verification                    PASS
collector absent                       Agent Core remains fully functional
```

---

## Wave E — Routing & Memory Quality Intelligence

**Goal:** improve decision quality using deterministic local evaluation.

Scope:

- routing golden corpus;
- memory recall quality corpus;
- quantitative gates;
- only then evidence-backed tuning of deterministic heuristics/weights.

Exit gates include:

```text
cross-project memory contamination     = 0
cross-principal memory contamination   = 0
hard-guardrail recall                  = 100%
current-revision correctness           = 100%
unsafe route overpermission            below certified threshold
routing/retrieval determinism          PASS
performance gates                      no regression
external AI model/API dependency       = 0
```

---

## Wave F — Adaptive Resource Governance

**Goal:** let Agent Core adapt local execution load to local factual conditions.

Scope:

- adaptive concurrency below operator maximum;
- resource-pressure metrics;
- evidence-based diagnosis recommendations;
- optional scheduled local maintenance.

Exit gates:

```text
operator max concurrency never exceeded
resource throttling has explicit reason codes
no destructive maintenance without policy/confirmation
no cloud model/API dependency
factual execution semantics unchanged
```

---

## Wave G — Core Re-Certification

**Goal:** certify the evolved Agent Core as one coherent stable control plane.

Final matrix:

```text
Authentication / OAuth                 PASS
MCP legacy compatibility               PASS
MCP modern compatibility               PASS when enabled
Principal isolation                    PASS
Project isolation                      PASS
Operational audit isolation            PASS
DMF integrity + quality                PASS
Continuity                             PASS
Execution durability                   PASS
Execution policy/resource control      PASS
Backup/restore                         PASS
Evidence retention                     PASS
Audit integrity                        PASS
Observability                          PASS
GitHub Fabric regression               PASS
Release parity                         PASS
Performance                            PASS
No external AI model/API dependency    PASS
```

Only after Wave G should a new architecture-level stable claim be made.

---

# 9. Priority Matrix

| Candidate | Class | Impact | Risk if ignored | Effort | Recommended wave |
|---|---|---:|---:|---:|---|
| Operational audit project scope | Verified gap | Very high | High | Low-Medium | A |
| OAuth token resource binding | Verified gap | Very high | High | Medium | A |
| MCP Origin validation | Verified gap | Very high | High | Medium | A |
| Detailed metrics exposure | Verified gap | High | Medium | Low-Medium | A |
| Trusted proxy/canonical origin | Hardening gap | High | Medium-High | Medium | A |
| MCP SDK v2 + dual era | Modernization | High | Medium | High | B |
| Execution Policy Engine | Modernization | Very high | Medium-High | High | C |
| Execution backup/restore bundle | Verified op gap | High | High during recovery | Medium-High | C |
| Raw evidence retention | Verified op gap | High | Medium | Medium | C |
| Audit correlation/hash chain | Modernization | High | Medium | Medium-High | D |
| Optional OpenTelemetry | Modernization | Medium | Low | Medium | D |
| Routing quality corpus | Evaluation gap | High | Medium | Medium | E |
| Memory recall quality corpus | Evaluation gap | Very high | Medium-High | Medium | E |
| Adaptive concurrency | Modernization | Medium-High | Low-Medium | Medium-High | F |
| Evidence-based diagnosis | Modernization | Medium | Low | Medium | F |
| Targeted core refactors | Maintainability | Medium-High | Long-term | Incremental | C-G |

---

# 10. Explicit Non-Goals

This proposal does **not** authorize or propose:

- Self-Fork or cognitive-fork placeholders;
- hidden multi-agent architecture;
- calling cloud AI models from Agent Core;
- OpenAI/Claude/Gemini/Codex model API keys for extra reasoning workers;
- external embedding APIs or AI rerankers for DMF;
- cloud AI judges for routing/memory evaluation;
- destructive autonomous repair;
- automatic deletion of evidence without retention policy and audit;
- Codespace feature work;
- GitHub Actions/CI as the Agent Core release authority;
- speculative MCP extensions merely because the protocol defines them;
- adoption of MCP Tasks or other extensions until a real host use case and compatibility evidence exist.

---

# 11. Evidence and Research Basis

## Tracked Agent Core source reviewed

Primary evidence surfaces:

```text
src/http/app.ts
src/http/auth.ts
src/oauth/service.ts
src/oauth/store.ts
src/mcp/handler.ts
src/mcp/server.ts
src/mcp/tools.ts
src/mcp/route-guard.ts
src/memory/operational-audit.ts
src/runtime/route-context-store.ts
src/runtime/workspace.ts
src/runtime/process-manager.ts
src/runtime/platform-shell.ts
src/runtime/health-metrics.ts
src/execution/dag.ts
src/execution/runner.ts
src/execution/service.ts
src/execution/store.ts
src/execution/db-worker.ts
src/memory/backup.ts
src/memory/retriever.ts
src/capabilities/router.ts
src/capabilities/registry-service.ts
```

Relevant current tests/benchmarks reviewed:

```text
tests/oauth.test.ts
tests/http-auth.test.ts
tests/process-tools.test.ts
tests/platform-shell.test.ts
tests/memory-operational-audit.test.ts
tests/memory-awareness.acceptance.test.ts
tests/capability-router.test.ts
tests/memory-performance.test.ts
scripts/benchmark-memory.mjs
scripts/benchmark-execution.mjs
```

## External standards / platform references

These references inform modernization opportunities. They do not override verified current behavior without compatibility testing.

### Model Context Protocol

- MCP 2026-07-28 release overview:
  https://blog.modelcontextprotocol.io/posts/2026-07-28/
- MCP TypeScript SDK v2:
  https://ts.sdk.modelcontextprotocol.io/v2/
- Protocol eras / legacy + modern support:
  https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions
- v1 -> v2 migration:
  https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2
- 2026-07-28 support/migration details:
  https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28

### OpenTelemetry

- OpenTelemetry JavaScript status:
  https://opentelemetry.io/docs/languages/js/

At proposal time, JavaScript traces and metrics are documented as stable; logs are still development status. Therefore any Agent Core OpenTelemetry integration should initially target traces/metrics only and remain optional/local-first.

### Windows process containment

- Microsoft Windows Job Objects:
  https://learn.microsoft.com/windows/win32/procthread/job-objects
- Job Object basic limit information:
  https://learn.microsoft.com/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information

These are candidates for a Windows platform adapter behind Agent Core's own resource-governance interface, not a cross-platform API contract by themselves.

---

# 12. Recommended Starting Point

The first implementation work should be **Wave A only**.

Do not begin MCP v2 migration, execution resource governance, adaptive scheduling or intelligence tuning until the P0 trust-boundary findings are either fixed or disproven by stronger evidence.

Recommended Wave A task order:

```text
A1 multi-project operational audit scope
A2 OAuth protected-resource binding
A3 MCP Origin validation
A4 detailed metrics exposure policy
A5 canonical public origin / trusted proxy policy
A6 focused adversarial acceptance matrix
A7 full Agent Core regression + live compatibility canary
```

Wave A is intentionally narrow enough to be implemented and certified independently.

---

# 13. Decision Rule for Future Ideas

Any new Agent Core upgrade idea must answer these questions before becoming a tracked roadmap item:

1. What current source/test evidence demonstrates the need?
2. Is the capability actually available in the required host/runtime?
3. Can it be implemented locally without an external AI model/API dependency?
4. What invariant does it strengthen?
5. What regression surface does it create?
6. What quantitative or factual acceptance gate proves success?
7. What is the rollback path?

If questions 1-3 cannot be answered with evidence, the idea remains outside the active roadmap.

---

## Final Principle

> **Improve Agent Core by strengthening what it can prove, control, recover and explain locally. Do not manufacture intelligence by adding hidden cloud models, and do not promote technically plausible ideas into roadmap commitments before the required capability is factual.**
