# Stability Baseline

This document is the maintained release-facing summary of Agent Core's certified core behavior. Historical implementation checkpoints remain available in Git history, but are intentionally not carried in the current repository tree.

## Certified core

The current stable baseline covers:

- OAuth/MCP availability and custom Agent Core key authentication;
- Deterministic Memory Fabric integrity and deterministic recall;
- Local Continuity snapshot/rehydration;
- dependency-correct concurrent command execution;
- persisted event-driven wake without busy polling;
- factual per-attempt logs/result markers;
- cross-route continuation;
- restart recovery with no false success;
- secret-safe execution-to-memory promotion;
- Windows launcher/tray graceful shutdown and restart;
- legacy operational-tool regression safety.

## Wave A trust-boundary contract

Wave A narrows Agent Core HTTP/OAuth and operational-audit trust boundaries without adding any external AI model, agent provider, or model API key.

The contract is:

```text
operational audit projectId = routed/stored operation projectId
OAuth access-token resource = canonical <base>/mcp resource
missing MCP Origin          = allowed for non-browser clients
invalid/untrusted Origin    = HTTP 403 before authentication/dispatch
GET /health                 = anonymous lightweight readiness
GET /health/metrics         = loopback-only detailed diagnostics
agent_core_health_metrics   = authenticated remote-capable detailed diagnostics
X-Forwarded-* trust         = disabled by default
canonical public identity   = AGENT_CORE_PUBLIC_BASE_URL when configured
```

HTTP trust configuration:

```text
AGENT_CORE_PUBLIC_BASE_URL=<http-or-https-origin>   optional canonical issuer/resource origin
AGENT_CORE_TRUST_PROXY=true|false                   default false
AGENT_CORE_MCP_ALLOWED_ORIGINS=<origin;origin;...>  optional browser-origin hostname allowlist
```

`AGENT_CORE_PUBLIC_BASE_URL` is authoritative when set. Otherwise forwarded host/protocol are used only when `AGENT_CORE_TRUST_PROXY=true`; direct requests cannot manufacture a public OAuth identity merely by sending `X-Forwarded-*` headers. The known GitHub Codespaces reverse-proxy integration opts into trusted-proxy mode explicitly in its startup script; the Agent Core core default remains false.

Rollback is configuration-local: remove `AGENT_CORE_PUBLIC_BASE_URL` when canonical identity is not desired, keep `AGENT_CORE_TRUST_PROXY=false` for direct deployments, and use the authenticated MCP metrics tool instead of exposing detailed HTTP metrics remotely. The security fixes for cross-resource OAuth replay, browser-Origin rejection, and project audit isolation are not intended to have permissive fallback modes.

### Wave A certification evidence

Wave A was certified locally on 2026-08-31. Final evidence from the post-hardening source state:

```text
focused trust-boundary acceptance  7 files / 58 tests PASS
npm run verify                     PASS
full regression                    111 files / 527 tests PASS
intentional platform/perf skips    38 tests
npm run verify:release             PASS
release metadata consistency       PASS
document links                     PASS
live temporary-instance canary     PASS
package/dependency changes          none
external AI model/API dependency   0
```

The live canary used temporary storage and a temporary loopback port with GitHub disabled; it did not consume production secrets. It proved local readiness and detailed metrics, non-browser MCP compatibility, browser-Origin rejection, and canonical OAuth issuer/resource agreement.

## Wave B MCP dual-era contract

Wave B migrates the Agent Core core MCP layer onto the stable split MCP SDK v2 packages while deliberately preserving the existing legacy connector path.

Core dependency contract:

```text
@modelcontextprotocol/server   2.0.0
@modelcontextprotocol/node     2.0.0
@modelcontextprotocol/client   2.0.0 dev-only interoperability test client
@modelcontextprotocol/sdk      absent from root core
plugin/codespace MCP SDK       1.30.0 preserved as legacy compatibility surface
```

Protocol serving contract:

```text
AGENT_CORE_MCP_PROTOCOL_MODE=dual     default
AGENT_CORE_MCP_PROTOCOL_MODE=legacy   runtime rollback

dual mode:
  legacy 2025-era stateless MCP       supported
  modern 2026-07-28 MCP               supported
  server/discover                     supported
  modern per-request envelope         validated by official SDK v2
  Mcp-Method / Mcp-Name               validated by official SDK v2

legacy mode:
  legacy 2025-era stateless MCP       supported
  modern 2026-07-28 negotiation       rejected / auto clients may fall back to legacy
```

Agent Core intentionally retains buffered JSON responses for the certified legacy stateless path by using the official v2 `WebStandardStreamableHTTPServerTransport` with `enableJsonResponse=true`. Modern traffic remains on the official v2 `createMcpHandler` validation/serving path. Agent Core does not implement its own modern protocol parser or `server/discover` semantics.

Wave A remains authoritative ahead of either protocol era: untrusted browser `Origin` is rejected before authentication/dispatch, bearer authentication remains Agent Core-owned, OAuth access tokens remain protected-resource-bound, and detailed HTTP metrics remain loopback-only.

OAuth compatibility policy for Wave B:

```text
DCR                                 preserved for existing connector compatibility
authorization-code response iss     emitted and bound to canonical Agent Core issuer (RFC 9207)
CIMD activation                     deferred until host interoperability and safe metadata-fetch trust policy are proven
speculative auth endpoints          none
```

### Wave B local pre-integration evidence

The isolated Wave B branch passed the following gates before main/public-runtime integration:

```text
focused Wave B acceptance         15 files / 110 tests PASS
npm run verify                    PASS
full regression                  113 files / 542 tests PASS
intentional platform/perf skips  38 tests
legacy tool surface              55 / 55 PASS
modern tool surface              55 / 55 PASS
modern 2026-07-28 discover       PASS
legacy-only rollback             PASS
Codespace v1 compatibility       PASS
live dist/index.js dual canary   PASS
live dist/index.js rollback      PASS
external AI model/API dependency 0
```

Final Wave B certification requires fast-forward integration into `main`, exact remote equality, restart of the real Codespace runtime on the integrated source commit, and public readiness/security/legacy compatibility canaries. Until those integration gates pass, this section records local certification rather than a final public-runtime claim.

## Last core certification

The final continuity/execution core certification was completed on 2026-08-26 after the execution WAL durability fix and staged default-enabled rollout.

### Regression gate

```text
npm ci          PASS
npm run build   PASS
npm test        PASS
```

Certified regression totals:

- test files: 68 / 68 passed;
- normal tests: 267 passed;
- benchmark-only timing tests: 4, executed separately under performance-gate mode;
- explicit performance-gate tests: 6 / 6 passed.

### Execution performance gate

Certified isolated measurements:

```text
DAG validation @ 128 nodes p95   1.916 ms   target < 50 ms
ready dispatch p95               23.586 ms  target < 100 ms
persisted wake delivery p95      29.667 ms  target < 250 ms
max observed concurrency          4 / 4
max event queries per wait        2
```

The measurements describe the validated environment; correctness is governed by persisted state and tests rather than timing assumptions.

### Memory scale gate

The 100k-item Deterministic Memory Fabric benchmark passed with SQLite integrity `ok` and end-to-end preflight/recall p95 of 67.137 ms against the certified `<150 ms` target.

### Acceptance and recovery

Final acceptance coverage proved:

- dependency-correct parallel scheduling;
- a dependent node can begin after its actual dependency succeeds while an unrelated slow node keeps running;
- fresh same-principal routes can continue owned active execution;
- restart recovery treats a valid terminal result marker as authority;
- missing terminal evidence becomes `interrupted`, never inferred success;
- raw stdout/stderr is not promoted wholesale into DMF;
- synthetic secret evidence does not appear as plaintext in DMF search/export/database paths.

### WAL / graceful exit proof

Execution SQLite automatic WAL checkpointing was replaced with explicit durable boundaries at graph/dynamic-graph/terminal-run transitions. After a real live execution workload, the corrected runtime demonstrated a clean old-process exit during controlled restart and a healthy replacement service.

## Release gate

Stable certification is performed locally by the Agent Core execution authority. Every stable release must pass the local gates below before publication. Once those local gates pass and the build is declared stable, that evidence is authoritative and must not be repeated through GitHub Actions or any other CI runner. GitHub Actions is disabled for this repository and is not an allowed verification or publication path.

The local release gates are:

| Gate | Requirement |
|---|---|
| Dependencies | clean `npm ci` |
| Build | TypeScript build passes |
| Regression | full test suite passes |
| Brand | tracked-source brand scan passes |
| Release metadata | package/server/changelog versions consistent; README remains version-neutral |
| Security packaging | no secrets/runtime/capability caches in release staging |
| Plugin package | tracked-core plugin bundle builds successfully |
| Artifact integrity | SHA-256 checksums generated for published assets |
| GitHub Release | release is published only after verification succeeds |
| GitHub Package | plugin package publishes successfully under the stable channel |

If any local gate fails, local publication stops. After the local gates pass, publication proceeds directly from the verified local artifacts through Native GitHub Fabric and GitHub Packages. CI must not rerun those gates or block the release.

## Evidence policy

Agent Core distinguishes semantic conclusions from operational evidence:

```text
raw stdout/stderr       -> local execution evidence only
execution events        -> execution journal
verified artifact/hash  -> structured evidence
accepted decision       -> DMF / continuity checkpoint
semantic task completed -> explicit task checkpoint only
```

A process disappearing, a timeout, or a restart is never sufficient evidence of success.
