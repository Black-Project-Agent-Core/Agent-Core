# Agent Core Wave A — Trust Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development to implement this plan task-by-task. Every production behavior change begins with a failing test and is verified again before commit.

**Goal:** Repair the verified Agent Core trust-boundary gaps in project-scoped operational evidence, OAuth protected-resource binding, MCP Origin validation, detailed metrics exposure, and public-origin/trusted-proxy identity without introducing any external AI model/provider/API dependency.

**Architecture:** Wave A adds explicit project identity to operational audit writes and centralizes HTTP public-origin/security decisions behind a deterministic local policy. OAuth, `/mcp`, and detailed health metrics consume that policy so issuer/resource identity, browser-origin rejection, and proxy trust cannot drift. Existing non-browser MCP clients and direct Agent Core API-key authentication remain compatible.

**Tech Stack:** TypeScript 7, Node.js 24+, `node:http`, Vitest, existing `@modelcontextprotocol/sdk` v1 transport, local JSON/SQLite persistence.

**Spec:** `docs/roadmap/agent-core-balanced-evolution.md`

## Global Constraints

- Agent Core core is the target; Codespace is only a compatibility integration surface.
- Agent Core MUST NOT require or introduce any additional cloud AI model, external AI agent provider, or model API key.
- Backward-compatible behavior is the default; a behavior may narrow only where the approved security invariant requires it.
- Missing `Origin` must remain valid for non-browser MCP clients; a present malformed or untrusted Origin must fail before MCP dispatch.
- Direct/local requests must not gain public OAuth identity from `X-Forwarded-*` unless trusted-proxy mode is explicitly enabled.
- A configured canonical public base URL is authoritative over request headers.
- `GET /health` remains lightweight and unauthenticated.
- `GET /health/metrics` is local-loopback only; authenticated remote detailed metrics remain available through `agent_core_health_metrics`.
- Operational audit and failure-memory project identity must equal the routed/stored operation project identity.
- Full release-regression behavior must remain compatible with the existing connector path.

---

## File Structure

- `src/http/security-policy.ts` — deterministic external-base/resource resolution, trusted-proxy handling, MCP Origin validation, loopback detection.
- `src/config.ts` — parse HTTP trust settings from environment.
- `src/oauth/service.ts` — consume security policy for metadata, authorization target validation, challenge, and access-token resource binding.
- `src/http/auth.ts` — pass the current HTTP request into OAuth token authentication.
- `src/http/app.ts` — reject untrusted MCP Origin and restrict detailed metrics to loopback before dispatch.
- `src/index.ts` — construct one security policy and share it between OAuth and HTTP handler.
- `src/memory/operational-audit.ts` — require explicit project scope for every operational event/failure commit.
- `src/mcp/project-scope.ts` — resolve project identity for rejected routes without crossing principal boundaries.
- `src/mcp/tools.ts` / `src/mcp/github-tools.ts` — pass routed/stored project identity into audit calls.
- `src/runtime/process-manager.ts` — expose stored process owner context to the owning principal when the original route has expired.
- `scripts/codespace/start-agent-core.sh` — explicitly declare the existing Codespaces reverse proxy trusted so Wave A does not silently break that integration path.
- `tests/http-security.test.ts` — security-policy unit/adversarial matrix.
- `tests/oauth.test.ts` — canonical identity and cross-resource replay tests.
- `tests/http-auth.test.ts` — MCP Origin and HTTP-auth integration tests.
- `tests/health-metrics.test.ts` — loopback metrics contract.
- `tests/memory-operational-audit.test.ts` — multi-project evidence isolation and stored-process lifecycle scope.
- `tests/process-tools.test.ts` — stored-owner lookup isolation.
- `tests/config.test.ts` — HTTP security configuration parsing.
- `docs/stability.md` and roadmap docs — Wave A operational contract and evidence.

---

### Task 1: A1 Multi-project operational audit scope

**Files:**
- Modify: `src/memory/operational-audit.ts`
- Modify: `src/mcp/project-scope.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/github-tools.ts`
- Modify: `src/runtime/process-manager.ts`
- Test: `tests/memory-operational-audit.test.ts`
- Test: `tests/process-tools.test.ts`

**Interfaces:**
- Produce: `OperationalMemoryAudit.rejected(projectId, routeContextId, toolName, input, error)`.
- Produce: `OperationalMemoryAudit.lifecycle(projectId, routeContextId, toolName, phase, input, result?)`.
- Produce: `resolveAuditProjectId(runtime, key, routeContextId): string` which returns a route project only when the route belongs to the authenticated principal, otherwise the principal's default workspace project.
- Produce: `ProcessManager.sessionContextForPrincipal(sessionId, principalId): ProcessSessionOwner` which returns stored owner context only when the principal matches.

- [ ] **Step 1: Add a failing multi-project operational-audit test**

Extend the fixture to create two allowed roots and route an operation explicitly into the second root. Assert both `memory_events` and recalled failure memory exist only under `{ principalId, projectId: secondRoot }`, and do not appear under the first root.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/memory-operational-audit.test.ts --reporter=verbose
```

Expected: the new Project-B assertion fails because `OperationalMemoryAudit.scope()` currently uses `runtime.workspace.roots[0]`.

- [ ] **Step 3: Add a failing stored-process owner test**

Add a `ProcessManager` test that starts a session with `{ principalId: 'principal-a', projectId: projectB }`, verifies `sessionContextForPrincipal()` returns that stored context for `principal-a`, and rejects `principal-b`.

- [ ] **Step 4: Run the process test and verify RED**

Run:

```bash
npx vitest run tests/process-tools.test.ts --reporter=verbose
```

Expected: failure because `sessionContextForPrincipal` does not exist.

- [ ] **Step 5: Implement explicit project-scoped audit**

Refactor `OperationalMemoryAudit` so the private scope helper accepts `projectId: string`; route-backed methods derive `route.projectId ?? runtime.workspace.resolveProjectRoot()`, while `rejected` and `lifecycle` require explicit project identity. Do not silently fall back to `roots[0]` inside the audit class.

- [ ] **Step 6: Implement principal-safe route/process project resolution**

Add `resolveAuditProjectId()` to `src/mcp/project-scope.ts`. For process sessions add `sessionContextForPrincipal()` that checks the stored owner principal before returning `{ principalId, projectId, originRouteContextId }`; it must return the same not-found error for a foreign principal.

- [ ] **Step 7: Wire all operational/GitHub rejection and process lifecycle paths**

Use `resolveAuditProjectId()` in route-validation failure paths. For started processes capture the resolved route project in the terminal callback. For read/stop lifecycle events use the stored session owner project; an expired original route must not move evidence to another project.

- [ ] **Step 8: Verify GREEN and regression**

Run:

```bash
npx vitest run tests/memory-operational-audit.test.ts tests/process-tools.test.ts --reporter=verbose
```

Expected: all focused tests pass.

- [ ] **Step 9: Commit A1**

```bash
git add src/memory/operational-audit.ts src/mcp/project-scope.ts src/mcp/tools.ts src/mcp/github-tools.ts src/runtime/process-manager.ts tests/memory-operational-audit.test.ts tests/process-tools.test.ts
git commit -m "fix: bind operational audit to routed projects"
```

---

### Task 2: A5 Public-origin and trusted-proxy policy foundation

**Files:**
- Create: `src/http/security-policy.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Test: `tests/http-security.test.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produce: `HttpSecurityConfig { publicBaseUrl: string | null; trustProxy: boolean; allowedOrigins: string[] }`.
- Produce: `HttpSecurityPolicy.externalBaseUrl(request): string`.
- Produce: `HttpSecurityPolicy.protectedResource(request): string`.
- Produce: `HttpSecurityPolicy.validateMcpOrigin(request): { ok: true } | { ok: false; code: 'invalid_origin' | 'origin_not_allowed' }`.
- Produce: `HttpSecurityPolicy.isLoopbackRequest(request): boolean`.

- [ ] **Step 1: Write failing configuration tests**

Add expectations for defaults:

```text
publicBaseUrl = null
trustProxy = false
allowedOrigins = []
```

and overrides from `AGENT_CORE_PUBLIC_BASE_URL`, `AGENT_CORE_TRUST_PROXY`, and `AGENT_CORE_MCP_ALLOWED_ORIGINS`.

- [ ] **Step 2: Run config tests and verify RED**

```bash
npx vitest run tests/config.test.ts --reporter=verbose
```

Expected: the `httpSecurity` property is absent.

- [ ] **Step 3: Write failing policy tests**

Create `tests/http-security.test.ts` covering:

```text
canonical public base overrides Host and X-Forwarded-*
forwarded proto/host ignored when trustProxy=false
forwarded proto/host honored when trustProxy=true
invalid forwarded scheme fails closed
protectedResource is exactly <canonicalBase>/mcp
loopback recognition handles 127.0.0.1, ::1, and ::ffff:127.0.0.1
```

- [ ] **Step 4: Run policy test and verify RED**

```bash
npx vitest run tests/http-security.test.ts --reporter=verbose
```

Expected: module/function imports do not exist.

- [ ] **Step 5: Implement minimal deterministic policy**

Validate configured base URL as `http:`/`https:` with no credentials/query/hash and normalize trailing slash. Parse allowed origins as a semicolon-delimited set of valid HTTP(S) origins. If `publicBaseUrl` exists it is authoritative; otherwise use forwarded proto/host only under explicit trusted-proxy mode, then direct request Host as compatibility fallback.

- [ ] **Step 6: Wire one policy instance in startup**

Construct `HttpSecurityPolicy` from `config.httpSecurity` in `startAgentCoreService()` and prepare it for both OAuth and HTTP consumers in later tasks.

- [ ] **Step 7: Verify GREEN**

```bash
npx vitest run tests/config.test.ts tests/http-security.test.ts --reporter=verbose
npm run build
```

Expected: focused tests and TypeScript build pass.

- [ ] **Step 8: Commit policy foundation**

```bash
git add src/http/security-policy.ts src/config.ts src/index.ts tests/http-security.test.ts tests/config.test.ts
git commit -m "feat: add explicit HTTP trust policy"
```

---

### Task 3: A2 OAuth protected-resource binding

**Files:**
- Modify: `src/oauth/service.ts`
- Modify: `src/http/auth.ts`
- Modify: `src/http/app.ts`
- Modify: `src/index.ts`
- Test: `tests/oauth.test.ts`

**Interfaces:**
- Change: `OAuthService` receives the shared `HttpSecurityPolicy`.
- Change: `OAuthService.authenticateAccessToken(token, request)` requires `principal.resource === security.protectedResource(request)`.
- Change: OAuth authorization requests require their `resource` parameter to equal the canonical protected resource for the incoming request.

- [ ] **Step 1: Add failing cross-resource replay test**

Mint an access token for `https://agent-core-a.example/mcp`, send it to an MCP request whose canonical policy resolves to `https://agent-core-b.example/mcp`, and assert HTTP `401` with no MCP dispatch.

- [ ] **Step 2: Add failing authorization-target test**

Send `/oauth/authorize` with `resource=https://other.example/mcp` while canonical resource is `https://agent-core.example/mcp`; assert `400` and no code is issued.

- [ ] **Step 3: Verify RED**

```bash
npx vitest run tests/oauth.test.ts --reporter=verbose
```

Expected: cross-resource token and mismatched authorization target are accepted by current behavior.

- [ ] **Step 4: Implement request-bound OAuth authentication**

Pass `IncomingMessage` from `authenticateRequest()` to `OAuthService.authenticateAccessToken()`. Compare the stored access-token resource to `security.protectedResource(request)` before returning the verified key.

- [ ] **Step 5: Bind authorization metadata and target to the same policy**

Replace direct `externalBaseUrl()` calls with the shared policy. `challenge`, protected-resource metadata, authorization-server metadata, and authorization validation must resolve through one canonical base/resource identity.

- [ ] **Step 6: Verify GREEN**

```bash
npx vitest run tests/oauth.test.ts tests/http-auth.test.ts --reporter=verbose
```

Expected: current happy-path OAuth plus new cross-resource negative cases pass.

- [ ] **Step 7: Commit A2**

```bash
git add src/oauth/service.ts src/http/auth.ts src/http/app.ts src/index.ts tests/oauth.test.ts
git commit -m "fix: bind oauth tokens to protected resource"
```

---

### Task 4: A3 MCP Origin validation

**Files:**
- Modify: `src/http/security-policy.ts`
- Modify: `src/http/app.ts`
- Test: `tests/http-security.test.ts`
- Test: `tests/http-auth.test.ts`

**Interfaces:**
- Missing `Origin`: allowed.
- Present `Origin` with malformed syntax, opaque `null`, credentials/userinfo, or an unapproved hostname: rejected with `403` before authentication/MCP dispatch.
- Allowed origins: localhost-class origins plus configured canonical/allowlisted hostnames.

- [ ] **Step 1: Add failing adversarial Origin tests**

Cover at minimum:

```text
no Origin -> allowed to reach normal auth flow
Origin: null -> 403
Origin: not-a-url -> 403
Origin: https://evil.example -> 403
Origin: https://user@localhost -> 403
Origin: http://localhost:<any-port> -> allowed
configured/canonical public hostname -> allowed
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run tests/http-security.test.ts tests/http-auth.test.ts --reporter=verbose
```

Expected: current `/mcp` layer does not reject untrusted Origin.

- [ ] **Step 3: Implement Origin validator**

Parse a present Origin strictly, reject `null`, credentials, path/query/hash, and non-HTTP(S) schemes. Compare hostname port-agnostically against localhost-class hostnames plus hostnames derived from canonical public URL and explicit allowlist.

- [ ] **Step 4: Enforce before MCP auth/dispatch**

In `/mcp`, call the policy before bearer authentication. On rejection return `403 { "error": "forbidden_origin" }`; do not call the OAuth store, key store, or MCP handler.

- [ ] **Step 5: Verify GREEN**

```bash
npx vitest run tests/http-security.test.ts tests/http-auth.test.ts tests/oauth.test.ts --reporter=verbose
```

Expected: adversarial Origin matrix and OAuth compatibility pass.

- [ ] **Step 6: Commit A3**

```bash
git add src/http/security-policy.ts src/http/app.ts tests/http-security.test.ts tests/http-auth.test.ts tests/oauth.test.ts
git commit -m "fix: validate browser origin at mcp boundary"
```

---

### Task 5: A4 Restrict detailed metrics to loopback

**Files:**
- Modify: `src/http/app.ts`
- Test: `tests/http-security.test.ts`
- Test: `tests/health-metrics.test.ts`

**Interfaces:**
- `GET /health` remains anonymous on all reachable interfaces.
- `GET /health/metrics` returns detailed data only when `security.isLoopbackRequest(request)` is true.
- Non-loopback request returns `403 { "error": "metrics_local_only" }` without invoking the metrics provider.
- `agent_core_health_metrics` remains the authenticated remote-capable metrics surface.

- [ ] **Step 1: Add failing remote-address policy tests**

Exercise loopback and non-loopback socket addresses through the policy helper and assert non-loopback detailed-metrics access is denied before provider invocation.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/http-security.test.ts tests/health-metrics.test.ts --reporter=verbose
```

Expected: current `/health/metrics` does not apply the new local-only gate.

- [ ] **Step 3: Implement local-only metrics gate**

Check loopback before `healthMetricsProvider()`. Preserve the current local HTTP metrics behavior and MCP metrics tool behavior.

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run tests/http-security.test.ts tests/health-metrics.test.ts --reporter=verbose
```

Expected: detailed local metrics and authenticated MCP metrics pass; remote helper/gate is denied.

- [ ] **Step 5: Commit A4**

```bash
git add src/http/app.ts tests/http-security.test.ts tests/health-metrics.test.ts
git commit -m "fix: keep detailed metrics on loopback"
```

---

### Task 6: A5 Deployment compatibility and canonical identity

**Files:**
- Modify: `scripts/codespace/start-agent-core.sh`
- Modify: `tests/oauth.test.ts`
- Modify: `docs/stability.md`
- Modify: `docs/roadmap/agent-core-balanced-evolution.md`

**Interfaces:**
- Existing Codespaces reverse proxy explicitly exports `AGENT_CORE_TRUST_PROXY=true`; core default remains false.
- Operators may prefer `AGENT_CORE_PUBLIC_BASE_URL=<https-origin>` for immutable canonical issuer/resource identity.

- [ ] **Step 1: Add/extend OAuth identity tests**

Assert:

```text
trustProxy=false + spoofed X-Forwarded-* -> direct Host identity
trustProxy=true + forwarded https/public-host -> forwarded public identity
publicBaseUrl configured -> identical issuer/resource despite conflicting Host/forwarded headers
```

- [ ] **Step 2: Verify RED for any uncovered identity case**

```bash
npx vitest run tests/oauth.test.ts tests/http-security.test.ts --reporter=verbose
```

- [ ] **Step 3: Declare existing trusted proxy integration explicitly**

Export `AGENT_CORE_TRUST_PROXY=true` only in the known Codespaces startup integration. Do not make proxy trust global/default.

- [ ] **Step 4: Document Wave A HTTP trust contract**

Record environment variables, local metrics policy, Origin behavior, OAuth resource binding, and rollback rule in `docs/stability.md`. Mark Wave A implementation evidence in the roadmap without declaring later Waves implemented.

- [ ] **Step 5: Verify focused compatibility**

```bash
npx vitest run tests/oauth.test.ts tests/http-auth.test.ts tests/http-security.test.ts tests/health-metrics.test.ts --reporter=verbose
bash -n scripts/codespace/start-agent-core.sh
```

Expected: focused tests pass and shell syntax is valid.

- [ ] **Step 6: Commit A5/docs**

```bash
git add scripts/codespace/start-agent-core.sh tests/oauth.test.ts docs/stability.md docs/roadmap/agent-core-balanced-evolution.md
git commit -m "docs: certify wave a http trust contract"
```

---

### Task 7: A6 adversarial acceptance matrix and A7 full regression

**Files:**
- Test: all Wave A focused tests
- Verify: repository build/release/doc gates
- Update: `docs/roadmap/agent-core-wave-a-implementation-plan.md` checkboxes/evidence only after commands have passed

**Acceptance Matrix:**

```text
cross-project audit leakage             = 0
oauth cross-resource token acceptance   = 0
untrusted browser Origin accepted       = 0
detailed remote metrics anonymous       = 0
canonical issuer/resource disagreement  = 0
missing Origin non-browser compatibility = PASS
API-key MCP authentication              = PASS
OAuth MCP authentication                = PASS
existing Codespace integration syntax   = PASS
external AI model/API dependency        = 0
```

- [ ] **Step 1: Run all focused Wave A tests**

```bash
npx vitest run tests/memory-operational-audit.test.ts tests/process-tools.test.ts tests/config.test.ts tests/http-security.test.ts tests/oauth.test.ts tests/http-auth.test.ts tests/health-metrics.test.ts --reporter=verbose
```

Expected: zero failures.

- [ ] **Step 2: Run build and diff hygiene**

```bash
npm run build
git diff --check
```

Expected: both exit zero.

- [ ] **Step 3: Run the full local verification gate**

```bash
npm run verify
```

Expected baseline: all current Agent Core and Codespace test files pass with only intentional platform/performance skips.

- [ ] **Step 4: Run release/document consistency**

```bash
npm run verify:release
```

Expected: brand/build/tests/release consistency/document links all pass.

- [ ] **Step 5: Run a live local compatibility canary without secrets**

Start Agent Core on a temporary loopback port and temporary data/runtime directories, then verify:

```text
GET /health -> 200
GET /health/metrics from loopback -> 200
POST /mcp without token and without Origin -> 401
POST /mcp with untrusted Origin -> 403
OAuth metadata issuer/resource agree with configured canonical test base
```

Do not print or consume production credential values.

- [ ] **Step 6: Record final evidence and commit**

Update this plan and the roadmap with the actual verification counts/commands. Then:

```bash
git add docs/roadmap/agent-core-wave-a-implementation-plan.md docs/roadmap/agent-core-balanced-evolution.md
git commit -m "docs: record wave a verification evidence"
```

- [ ] **Step 7: Integrate to main and push**

After fresh verification evidence exists, fast-forward `main` from the isolated Wave A branch and push `origin/main`. Re-read remote HEAD and require local/remote equality before declaring completion.
