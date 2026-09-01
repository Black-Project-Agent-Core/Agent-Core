# Agent Core Memory Nervous System — Phase 7 Implementation Plan

> **Execution requirement:** Use the approved Cross-Session Memory Nervous System design plus certified Phase-2 hydration and Phase-6 lifecycle behavior as authority. Execute inline when no subagent facility is available. Follow TDD RED→GREEN, keep the implementation isolated on `feature/cross-session-memory-nervous-system`, push/read back major checkpoints, and never merge to `main` without explicit operator instruction.

**Goal:** Extend certified memory preflight/postflight enforcement to the direct ChatGPT→`codespace` bridge using an opaque Memory Context Lease, without making the bridge understand memory semantics, hold Agent Core credentials, or own semantic state.

**Architecture:** Agent Core remains the sole lifecycle authority. A valid persisted Phase-6 context may receive an opaque service-lifetime lease token. The token is generated/verified only inside Agent Core, contains encrypted bounded context authority, expires no later than the underlying lifecycle, and is never placed in the remote logical-state projection. The Codespace bridge accepts the opaque token on potentially meaningful operations and sends it to one loopback-only Agent Core endpoint for deterministic before/after mutation decisions. The bridge never receives Agent Core API keys, Memory Remote keys, principal IDs, raw memory content, or SQLite access. Existing Phase-2 `memory-hydration-gate.sh` remains the only fresh-Codespace hydration authority and is reused by bridge startup.

**Phase boundary:** This phase covers direct Codespace bridge mutation enforcement. It does not introduce the Phase-8 Observatory or Phase-9 broad scale/quality program, and it does not alter OpenAI/ChatGPT internals.

---

## Non-negotiable invariants

1. **Single semantic authority.** DMF/Phase-6 lifecycle stays authoritative; the plugin stores no semantic memory database.
2. **Opaque lease.** The bridge only transports the lease. It does not decode principal/project/objective/context semantics.
3. **No root credential propagation.** `CONTROL_PLANE_API_KEY`, OAuth credentials, GitHub credentials, Memory Remote keys, and the lease cryptographic secret never enter the bridge process or child shells.
4. **Loopback-only control plane.** Lease validation/completion is accepted only from a direct loopback request. Proxy-forwarded/public requests are rejected before token processing.
5. **Service-lifetime authority.** Lease cryptographic authority is generated locally at Agent Core process startup. Restart invalidates old leases and therefore fails safely back to preflight.
6. **Scope binding.** A lease is bound to principal, project, route context, memory context, objective hash, issued time, and expiry. Agent Core revalidates current persisted lifecycle on every meaningful operation.
7. **Meaningful classifier authority.** `execute_command` meaningful/read-only classification is performed by the same Agent Core classifier certified in Phase 6. The bridge does not maintain an independent shell-semantic rule set.
8. **Recovery exemption.** `stop_process` stays usable without a lease.
9. **No token leakage.** Lease values must never be passed to shell commands, persisted in plugin logs/status files, emitted in errors, or included in audit payloads.
10. **Truth after mutation.** If workspace mutation succeeds but post-mutation lifecycle marking fails, enforce mode returns `MEMORY_POSTFLIGHT_REQUIRED` with `mutationCommitted: true`; it never pretends the mutation rolled back.
11. **Advisory rollback.** `disabled` skips the adapter; `advisory` reports would-block/after-failure state but does not prevent workspace mutation; `enforce` fails closed.
12. **Fresh Codespace truth.** When Memory Remote is configured, the existing Phase-2 hydration gate must pass before the bridge is considered mutation-ready. An uncertified local DB or hydration failure never silently becomes empty authority.
13. **No `.vscode/` damage.** Bridge/bootstrap edits must preserve repository/user state unrelated to this phase.
14. **MCP surface stability.** No new Agent Core model-facing MCP tool is required. Codespace tool names/count remain unchanged; only bounded optional lease input is added to potentially meaningful tools.

---

## Completion ledger — candidate certification

- [x] Task 1 — Agent Core Opaque Memory Context Lease Authority
- [x] Task 2 — Codespace Bridge Lease Adapter
- [x] Task 3 — Codespace Startup/Hydration Coupling and Fail-Closed Recovery
- [ ] Task 4 — Phase 7 Regression and Certification (final documentation SHA verification pending)

## Task 1 — Agent Core Opaque Memory Context Lease Authority

**Files:**
- Create: `src/memory/context-lease.ts`
- Modify: `src/memory/service.ts`
- Modify: `src/mcp/capability-tools.ts`
- Create: `src/http/memory-context-lease.ts`
- Modify: `src/http/app.ts`
- Modify: `src/index.ts`
- Test: `tests/memory-context-lease.test.ts`
- Test: `tests/http-memory-context-lease.test.ts`
- Extend: `tests/continuity-routing.test.ts`
- Extend: HTTP/security tests where required

### Step 1: RED — lease cryptographic contract

- [x] Complete

Specify:
- a persisted `OPEN`/`POSTFLIGHT_PENDING` lifecycle can receive a bounded opaque lease;
- lease expiry is `min(route/lifecycle expiry, configured/requested cap)` and cannot be extended by the caller;
- a lease cannot be issued for missing, expired, cross-principal/project/route, or `CLOSED` lifecycle;
- token content is not plain JSON/base64-readable and does not contain the principal/project/objective strings verbatim;
- one-byte tamper, truncation, malformed version, and old service key are rejected with predictable `MEMORY_PREFLIGHT_REQUIRED`;
- Agent Core process restart/authority recreation invalidates old token by design;
- issuing/validating a lease does not change logical-state hash or remote projection.

### Step 2: GREEN — stateless opaque authority

- [x] Complete

Implement a service-lifetime AES-256-GCM authority with a random 32-byte key generated in-process. The encrypted payload is bounded and versioned, for example:

```text
version
principalId
projectId
contextId
routeContextId
objectiveHash
issuedAt
expiresAt
```

The key is never exported. The token is encoded as a bounded opaque URL-safe string. Validation decrypts, validates shape/time, then calls Phase-6 persisted lifecycle validation before returning an internal authority object.

Expose through `MemoryService`:
- `issueContextLease(...)`
- `validateContextLease(...)`
- `completeContextLeaseMeaningfulWork(...)`

No new schema table and no new logical projection field are required.

### Step 3: RED — loopback control endpoint

- [x] Complete

Add failing tests proving:
- direct loopback request reaches the endpoint;
- public/proxy-forwarded request is 403 before lease processing;
- endpoint accepts only bounded JSON POST requests;
- `before` without lease returns allowed only when the shared Phase-6 classifier says the operation is non-meaningful;
- meaningful `before` without/invalid/expired lease returns `MEMORY_PREFLIGHT_REQUIRED`;
- valid meaningful `before` returns a bounded permit without exposing decoded identity;
- successful `after` with valid lease marks the lifecycle `POSTFLIGHT_PENDING`;
- after failure is truthful and bounded;
- token is not echoed in any response.

### Step 4: GREEN — internal endpoint

- [x] Complete

Add `/internal/memory-context-lease` to the existing Agent Core HTTP server. It is not OAuth/MCP and does not accept Agent Core API credentials as authority. It must pass `HttpSecurityPolicy.isLoopbackRequest()` before reading the request body.

Requests:

```text
POST /internal/memory-context-lease
{ action: 'before', toolName, input, workspaceRoot, lease? }

POST /internal/memory-context-lease
{ action: 'after', toolName, workspaceRoot, lease }
```

Agent Core:
- uses the Phase-6 classifier;
- revalidates encrypted lease + persisted lifecycle;
- verifies `workspaceRoot` equals lease project scope;
- marks successful meaningful work pending only on `after`;
- never returns principal/project/context/objective payloads.

### Step 5: Capability route issuance

- [x] Complete

When Phase-6 preflight/lifecycle is healthy and mode is not `disabled`, return:

```text
memoryContextLease: <opaque token>
memoryContextLeaseExpiresAt: <ISO timestamp>
```

Do not return a lease for an ambiguous/degraded/missing/closed lifecycle. Existing `memoryContextId` remains for Agent Core internal orchestration compatibility.

### Step 6: Verify/checkpoint

- [x] Complete

Run focused crypto, routing, HTTP security, lifecycle, logical-hash, and build tests. Commit/push/readback only after GREEN.

---

## Task 2 — Codespace Bridge Lease Adapter

**Files:**
- Create: `plugin/codespace/src/memory-lease.ts`
- Modify: `plugin/codespace/src/mcp-server.ts`
- Modify: `plugin/codespace/src/errors.ts` if bounded error vocabulary needs extension
- Modify: `plugin/codespace/src/constants.ts` only for safe non-secret endpoint config if needed
- Test: `plugin/codespace/tests/memory-lease.test.ts`
- Extend: `plugin/codespace/tests/mcp.integration.test.ts`
- Extend: `plugin/codespace/tests/http-mcp.integration.test.ts`
- Extend: secret/sanitization tests

### Step 1: RED — bridge adapter behavior

- [x] Complete

Specify for `write_file`, `edit_file`, `execute_command`, and `start_process`:
- optional `memoryContextLease` accepted, max bounded length;
- token is stripped before underlying workspace/shell/process call;
- `disabled` mode preserves pre-Phase-7 behavior and does not call Agent Core lease endpoint;
- `advisory` endpoint reject/unavailable permits mutation but returns bounded lifecycle advisory metadata;
- `enforce` missing/invalid/expired/unreachable authority rejects before mutation with `MEMORY_PREFLIGHT_REQUIRED`;
- read-only `execute_command` can proceed without a token only after Agent Core classifier says `required:false`;
- `stop_process` stays ungated;
- workspace root sent to Agent Core exactly matches the resolved bridge root;
- lease is absent from filesystem payload, command environment, logs, error details, and response echo.

### Step 2: GREEN — thin loopback client

- [x] Complete

Implement one client that knows only:
- configured lifecycle mode;
- loopback Agent Core lease endpoint URL;
- opaque lease string;
- tool name/input/workspace root;
- bounded before/after response vocabulary.

The client validates endpoint URL is `http://127.0.0.1:<port>/internal/memory-context-lease` (or equivalent explicit loopback only), uses bounded timeout/body size, and never follows redirects.

### Step 3: RED — post-mutation truth

- [x] Complete

Specify:
- before permitted + underlying mutation failed => do not call `after` and do not fabricate pending work;
- mutation succeeded + enforce `after` failed => MCP error `MEMORY_POSTFLIGHT_REQUIRED`, `mutationCommitted:true`;
- mutation succeeded + advisory `after` failed => successful operation result plus bounded advisory code, no claim that postflight is pending;
- multiple successful mutations with the same lease are allowed while lifecycle is `POSTFLIGHT_PENDING` and count correctly.

### Step 4: GREEN — wrap potentially meaningful tools

- [x] Complete

Use a common adapter wrapper rather than four duplicated policies. Keep existing tool names/annotations. Add only optional `memoryContextLease` to the four potentially meaningful mutation schemas.

### Step 5: Verify/checkpoint

- [x] Complete

- [x] Complete

Run standalone plugin build/tests plus root integration guards. Commit/push/readback.

---

## Task 3 — Codespace Startup/Hydration Coupling and Fail-Closed Recovery

**Files:**
- Modify: `plugin/codespace/scripts/start-http-mcp.sh`
- Modify: `plugin/codespace/scripts/ensure-http-mcp.sh` only if required for explicit endpoint propagation
- Modify: `plugin/codespace/scripts/ensure-running.sh`
- Modify: `plugin/codespace/scripts/verify.sh`
- Modify: `scripts/codespace/start-agent-core.sh` only for lifecycle-mode propagation if necessary
- Reuse, do not fork: `scripts/codespace/memory-hydration-gate.sh`
- Extend: `tests/codespace-memory-hydration.test.ts`
- Create/extend: plugin lifecycle/startup tests

### Step 1: RED — existing hydration authority remains first

- [x] Complete

Tests must prove:
- plugin startup references the root Phase-2 `memory-hydration-gate.sh`; there is no second hydration implementation;
- when Memory Remote is enabled and gate fails, mutation-ready bridge startup fails before local MCP/tunnel readiness is declared;
- verified marker for exact principal/project/owner/repo/branch still permits startup;
- stale marker or uncertified local DB still fails closed;
- remote disabled keeps rollback path available;
- no script deletes or rewrites `.vscode/` or unrelated workspace state.

### Step 2: GREEN — reuse hydration gate

- [x] Complete

At Codespace bridge lifecycle startup, run the existing root hydration gate before starting/re-registering the mutation-capable loopback MCP server whenever Phase-7 lifecycle adapter is active. Do not duplicate its marker logic, key restoration, remote query, or SQLite installation.

### Step 3: Endpoint/runtime coupling

- [x] Complete

Resolve Agent Core lease endpoint from the same local Agent Core service-port authority already used by Codespace startup (`agent_core_service_port`). Export only the non-secret loopback URL + lifecycle mode to the plugin process. Continue explicitly unsetting root credentials.

Enforce mode startup/readiness must not report mutation readiness when:
- hydration gate failed;
- Agent Core lifecycle endpoint is unreachable/unhealthy;
- configured remote state is uncertified.

Advisory mode may expose read-only/mutation bridge availability with explicit degraded lifecycle metadata, but it may not fabricate a successful hydration marker.

### Step 4: Recovery/session-loss tests

- [x] Complete

Specify and prove:
- old lease after Agent Core restart is rejected;
- fresh `capability_route` produces a new valid lease;
- same lease can continue the same pending context;
- prior same-task/objective `POSTFLIGHT_PENDING` is still rejected by Phase-6 route reconciliation before a new lease can be issued;
- after terminal checkpoint + verified remote closure, old lease is rejected because lifecycle is `CLOSED`;
- fresh Codespace hydrate reconstructs lifecycle truth but no old service-lifetime lease authority; new preflight is required for mutation.

### Step 5: Verify/checkpoint

- [x] Complete

- [x] Complete

Run hydration, plugin lifecycle, restart, secret-sanitization, and build suites. Commit/push/readback.

---

## Task 4 — Phase 7 Regression and Certification

### Step 1: Focused Phase-7 suite

- [x] Complete

Require zero failures for:
- opaque lease crypto/tamper/expiry/restart;
- loopback endpoint security;
- capability-route lease issuance;
- bridge before/after mutation adapter;
- advisory/disabled/enforce modes;
- shell read-only classification through Agent Core;
- post-mutation truthful failure;
- hydration gate/startup ordering;
- secret/token leakage guards.

### Step 2: Broad regressions

- [x] Complete

Run root memory + continuity + MCP + execution + HTTP/security suites and full standalone `plugin/codespace` verification. Verify:
- Agent Core MCP tool count unchanged;
- Codespace tool names/count unchanged;
- direct Continuity/Execution semantic commit bypass remains zero;
- existing tunnel identity/control-plane key behavior remains unchanged;
- `.vscode/` and unrelated repository state are untouched.

### Step 3: Cross-Codespace disaster proof

- [x] Complete

Create acceptance evidence:

```text
Codespace A
  hydrate certified remote
  capability_route -> opaque lease
  meaningful Codespace mutation -> POSTFLIGHT_PENDING
  terminal checkpoint -> CLOSED + REMOTE_SYNCED receipt
  destroy local memory/lease authority

Codespace B / fresh local destination
  Phase-2 hydrate exact lifecycle state
  old lease rejected
  new actionable mutation without new preflight rejected in enforce mode
  new capability_route/preflight -> new lease
  mutation succeeds and becomes pending
```

Also prove hydration failure leaves the existing destination unchanged and no bridge success marker is fabricated.

### Step 4: Quality/performance/dependency gates

- [x] Complete

Run:
- `npm run verify:release`
- standalone Codespace plugin verification
- memory quality gate
- 100k preflight benchmark p95 `<150 ms`
- lease before/after micro-benchmark with a bounded local target documented in certification evidence
- dependency diff from Phase 6
- external model/API integration scan
- docs link checker

### Step 5: Exact-SHA certification

- [ ] Final documentation SHA verification pending

On the implementation candidate:
- push/readback exact branch SHA;
- run full release and Phase-7 acceptance gates;
- update design/master/phase plan certification docs;
- commit/push docs;
- rerun exact-final-documentation-SHA release verification and benchmark;
- require local SHA == remote SHA and clean worktree.

---

## Phase 7 Definition of Done

Phase 7 is **CERTIFIED COMPLETE** only when:

```text
Agent Core semantic/lifecycle authority only                  PASS
opaque lease plaintext identity leakage                      0
tampered/expired/old-service lease accepted                  0
public/proxy internal lease endpoint access                  0
Agent Core root credentials in bridge process/shell          0
potentially meaningful bridge mutation without lease         rejected in enforce mode
read-only execute_command without lease                       allowed only after Agent Core classification
successful bridge mutation -> POSTFLIGHT_PENDING             PASS
failed bridge mutation -> fake pending                       0
mutation committed + after failure                           truthful MEMORY_POSTFLIGHT_REQUIRED
stop_process recovery exemption                              PASS
prior pending same task/objective before new lease           rejected in enforce mode
existing Phase-2 hydration gate reused                       PASS
second hydration implementation                              0
fresh remote-required hydration failure -> mutation ready    0
old lease after process/Codespace recreation                 rejected
fresh preflight -> fresh lease                               PASS
Agent Core MCP tool names/count                              unchanged
Codespace MCP tool names/count                               unchanged
`.vscode/` / unrelated state mutation                        0
external AI/model/API dependency                             0
100k preflight p95                                           <150 ms
full root release verification                               PASS
standalone Codespace plugin verification                     PASS
local branch SHA == remote branch SHA                        PASS
worktree clean                                               PASS
```


---

## Phase 7 Candidate Certification Record — 2026-09-01

**Implementation candidate SHA:** `592b79efb5738532ca5dcdd7fe3a87c70a72a673`
**Branch:** `feature/cross-session-memory-nervous-system`
**Candidate local == remote:** PASS

### Architecture and authority gates

```text
Agent Core semantic/lifecycle authority only                  PASS
opaque lease implementation                                  AES-256-GCM / process-lifetime key
lease identity plaintext leakage                             0
tampered/expired/old-service lease accepted                  0
public/proxy internal endpoint access                        0
bridge semantic DB / SQLite authority                        0
bridge root credential propagation                           0
shared Phase-6 meaningful-work classifier                    PASS
stop_process recovery exemption                              PASS
second hydration implementation                              0
existing Phase-2 hydration gate reused                       PASS
fresh hydration failure -> mutation-ready bridge             0
`.vscode/` mutation                                           0
direct Continuity/Execution semantic commit bypass           0
new external AI/model/API dependency                         0
```

The bridge transports only the opaque `memoryContextLease`; it does not decode principal/project/objective/context identity. The internal authority endpoint is exact loopback-only and returns bounded decisions rather than decoded lease identity. A mutation that commits locally but loses postflight authority returns `MEMORY_POSTFLIGHT_REQUIRED` with factual `mutationCommitted: true`.

### Startup and hydration proof

`plugin/codespace/scripts/memory-lifecycle-preflight.sh` calls the existing root `scripts/codespace/memory-hydration-gate.sh`. The plugin contains no independent `memory-hydrate` or `remote-hydration.json` implementation. In active lifecycle mode the Phase-2 gate runs before the mutation-capable bridge is considered ready. Enforce-mode hydration failure propagates exit `55`; an unreachable lease authority propagates exit `56`. Disabled and advisory rollback modes remain available.

After the root hydration gate has consumed required credentials, bridge lifecycle startup scrubs GitHub, Memory Remote, Cloudflare, control-plane, and lease-secret environment classes from the bridge process, tunnel/watchdog children, MCP runtime, and command shells.

### Cross-Codespace disaster acceptance

The tracked acceptance flow proves:

```text
Codespace A
  Phase-2 hydrate -> REMOTE_EMPTY_CONFIRMED
  preflight + Continuity turn/lifecycle binding
  opaque lease before/after meaningful work -> POSTFLIGHT_PENDING
  real terminal Continuity checkpoint + promotion + turn close
  lifecycle CLOSED
  encrypted continuity_terminal boundary -> REMOTE_SYNCED
  local durable receipt attached without hash drift
  lease token absent from remote bytes
  service authority closed + local DB deleted

Codespace B
  fresh Phase-2 hydrate -> REMOTE_HYDRATED exact generation/hash
  CLOSED lifecycle + completed Continuity task/checkpoint recovered
  exact remote receipt reconciled locally
  Codespace-A service-lifetime lease rejected
  meaningful mutation without new lease rejected
  fresh preflight -> fresh lease
  successful meaningful work -> POSTFLIGHT_PENDING
```

A separate acceptance case proves remote-auth hydration failure leaves an existing local destination byte-for-byte unchanged.

### Candidate verification evidence

```text
focused Phase-7 root files                              8 PASS
focused Phase-7 root tests                              52 PASS
standalone Codespace test files                         17 PASS
standalone Codespace tests                              63 PASS
Agent Core MCP tools                                    56 (unchanged)
memory MCP tools                                        9 (unchanged)
Codespace MCP tools                                     12 (unchanged)
full root test files                                    163 PASS / 2 skipped
full root tests                                         812 PASS / 38 intentional skips
full release failures                                   0
npm run verify:release                                  PASS / exit 0
quality:gate                                            PASS
release consistency                                     PASS
document links                                          49 markdown / 19 relative links PASS
Memory Recall@K / MRR                                   1.0 / 1.0
cross-project / cross-principal contamination           0 / 0
deterministic memory replay                             1.0
100k active memories                                    100001
100k preflight p95                                      67.75 ms < 150 ms
lease loopback before+after samples/warmups              100 / 10
lease loopback p95                                      3.735 ms < 50 ms
disaster/cross-Codespace files                          6 PASS
disaster/cross-Codespace tests                          27 PASS
package/package-lock dependency diff from Phase 6       none
external AI/model/API integration diff                  none
tunnel identity defaults                                unchanged
`.vscode/` diff                                          none
```

**Candidate status:** all implementation and certification gates are green. Final Phase-7 certification remains contingent on committing these documentation records, pushing/readback, and rerunning release/plugin/performance gates on the exact final documentation SHA.
