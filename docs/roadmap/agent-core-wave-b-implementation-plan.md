# Agent Core Wave B — MCP Dual-Era Modernization Implementation Plan

**Date:** 2026-08-31
**Status:** APPROVED FOR IMPLEMENTATION — IN PROGRESS
**Scope:** Agent Core core MCP protocol/SDK layer. Codespace is compatibility-only, not an upgrade target.
**Base:** Wave A certified commit `f688789`.
**Strategy:** Migrate the Agent Core core from the monolithic MCP TypeScript SDK v1 to the stable v2 server/node packages while preserving 2025-era stateless MCP behavior and adding the 2026-07-28 stateless protocol era on the same authenticated `/mcp` endpoint.

## 1. Non-Negotiable Invariants

Wave B must preserve all Wave A trust boundaries and all current Agent Core tool semantics.

```text
external AI model/provider/API dependency added = 0
Agent Core tool count/semantics                  = unchanged unless protocol requires metadata-only differences
principal isolation                              = unchanged
project isolation                                = unchanged
OAuth protected-resource binding                 = unchanged
MCP Origin validation                            = unchanged
remote detailed HTTP metrics                     = still forbidden
legacy 2025-era connector behavior               = preserved
modern 2026-07-28 protocol                        = supported through official SDK behavior
rollback to legacy-only serving                   = configuration-only and tested
```

Do not migrate `plugin/codespace` to MCP SDK v2 in this wave. Its v1 client/server dependency is an integration surface used to prove legacy interoperability.

## 2. Evidence Basis

Current source at the Wave B base uses root dependency:

```text
@modelcontextprotocol/sdk 1.30.0
```

The current root MCP server uses v1 `McpServer` and `StreamableHTTPServerTransport` in:

```text
src/mcp/server.ts
src/mcp/handler.ts
src/mcp/*-tools.ts
```

The stable MCP TypeScript SDK v2 line is split into packages including:

```text
@modelcontextprotocol/server 2.0.0
@modelcontextprotocol/node   2.0.0
```

The official v2 `createMcpHandler()` contract serves modern `2026-07-28` requests and, by default, serves legacy 2025-era traffic with `legacy: 'stateless'`. The same factory can return the low-level `Server` or `McpServer` for either era. The SDK automatically owns `server/discover` and modern envelope/header validation. `legacyStatelessFallback()` provides a v2-SDK legacy-only serving path.

Therefore Wave B should not invent a custom dual-protocol classifier or custom `server/discover` implementation.

## 3. Target Architecture

```text
node:http /mcp
    |
    | Wave A Origin + authentication gate remains authoritative
    v
createMcpHttpHandler(runtime, protocolMode)
    |
    +-- protocolMode=dual (default)
    |      official createMcpHandler(factory, { legacy: 'stateless' })
    |         +-- legacy 2025 era -> initialize/stateless tool requests
    |         +-- modern 2026-07-28 -> server/discover + per-request envelope
    |
    +-- protocolMode=legacy
           official legacyStatelessFallback(factory)
           -> 2025-era only rollback posture

factory(ctx)
    -> createAgentCoreServer(runtime, verifiedKey)
    -> same 55 Agent Core tools
```

The authenticated `VerifiedKey` continues to come from Agent Core's HTTP authentication boundary. MCP SDK auth metadata does not replace Agent Core authentication.

## 4. Work Sequence

### B0 — Lock baseline and migration contract

- [x] Create isolated worktree `wave-b/mcp-dual-era` from certified Wave A.
- [x] Run fresh baseline after `npm ci` + Codespace plugin build.
- [x] Record baseline: 111 passed test files / 527 passed tests / 38 intentional skips.
- [x] Verify official v2 package/API contract before source edits.
- [ ] Commit this implementation plan.

Acceptance:

```text
main untouched
worktree clean except tracked plan
baseline full regression PASS
```

### B1 — Migrate root MCP SDK dependencies and server imports

TDD / migration checks:

1. Add/adjust package contract tests first so root package must use `@modelcontextprotocol/server` and `@modelcontextprotocol/node` v2 and must no longer depend on monolithic root `@modelcontextprotocol/sdk`.
2. RED: existing package contract should fail before dependency migration.
3. Replace root dependency with exact v2 packages.
4. Keep `plugin/codespace/package.json` on its existing v1 SDK dependency for legacy-canary value.
5. Update root Codespace bootstrap dependency-presence checks to the new root packages only; do not modify plugin protocol implementation.
6. Move core `McpServer` type/imports to `@modelcontextprotocol/server`.
7. Build until source is type-clean.

Acceptance:

```text
root monolithic MCP SDK dependency = 0
root MCP v2 server package         = 2.0.0
root MCP v2 node adapter           = 2.0.0
plugin/codespace v1 SDK            = preserved
npm run build                      = PASS
```

Suggested commit:

```text
build: migrate core mcp sdk to v2 packages
```

### B2 — Dual-era HTTP serving with explicit legacy rollback

Tests first:

1. Add config tests for `AGENT_CORE_MCP_PROTOCOL_MODE`:
   - absent -> `dual`;
   - `dual` -> accepted;
   - `legacy` -> accepted;
   - any other value -> rejected.
2. Add protocol tests that prove default mode still accepts the existing 2025-era initialize request and tool calls.
3. Add modern probe test expecting `server/discover` support in default mode.
4. Add rollback test proving `legacy` mode accepts legacy traffic but does not serve modern `2026-07-28` requests.
5. Observe RED on current v1 transport/config.

Production:

- Add a bounded MCP config with `protocolMode: 'dual' | 'legacy'`.
- Default to `dual` only after both era tests are green.
- Replace v1 `StreamableHTTPServerTransport` wiring with the official v2 HTTP handler.
- Use the official Node adapter to bridge the Fetch-shaped v2 handler into `node:http`.
- In `dual`, use official `createMcpHandler(..., { legacy: 'stateless' })`.
- In `legacy`, use official `legacyStatelessFallback(...)` so rollback does not require restoring SDK v1.
- Preserve the Agent Core `VerifiedKey` captured after Wave A authentication.

Acceptance:

```text
legacy initialize/list/call = PASS in dual
modern discover             = PASS in dual
modern request              = rejected in legacy-only rollback mode
legacy request              = PASS in legacy-only rollback mode
Wave A Origin/auth ordering = unchanged
```

Suggested commit:

```text
feat: serve legacy and modern mcp eras
```

### B3 — Modern 2026-07-28 semantics and validation matrix

Do not hand-code protocol validation that the official SDK already owns. Tests must exercise the SDK through Agent Core's real `/mcp` boundary.

Tests first for modern requests:

- `server/discover` returns the modern supported version and Agent Core capabilities.
- `tools/list` returns the same 55 tools as legacy.
- representative `tools/call` returns the same structured Agent Core semantics as legacy.
- missing modern per-request envelope behind a modern protocol header is rejected.
- malformed envelope is rejected.
- `Mcp-Method` header/body mismatch is rejected.
- `Mcp-Name` header/body tool-name mismatch is rejected when applicable.
- unsupported modern protocol version is rejected by the modern validation path, not silently routed to legacy.
- untrusted browser `Origin` still returns Wave A HTTP 403 before MCP protocol handling.
- invalid/missing bearer still follows Agent Core 401 behavior.

Where practical, use the official MCP v2 client in both default legacy negotiation and pinned/auto modern negotiation to prove interoperability in addition to raw-wire adversarial tests.

Acceptance:

```text
same tool names/count          = legacy == modern == 55
same representative tool facts = legacy == modern
modern validation ladder       = fail closed
untrusted Origin               = 403 before MCP
unauthenticated MCP            = 401
```

Suggested commit:

```text
test: certify mcp dual-era semantics
```

### B4 — OAuth/auth modernization compatibility decision

Wave B does not remove DCR merely because 2026-07-28 deprecates it as the long-term client-registration direction.

Tasks:

1. Re-run existing OAuth discovery, DCR, PKCE, resource-binding, canonical issuer/resource, and Origin/security tests against the v2 transport.
2. Verify the modern MCP transport does not bypass Agent Core's existing HTTP bearer authentication.
3. Evaluate current 2026-07-28 client metadata/CIMD requirements against Agent Core's custom authorization-server implementation.
4. Implement a modern client-registration path only if the required host behavior is factual and can be tested without breaking the existing ChatGPT connector.
5. Otherwise record DCR as compatibility-only and defer CIMD activation until host interoperability is proven. Do not add speculative endpoints/placeholders.

Acceptance:

```text
OAuth existing connector contract     = PASS
cross-resource replay acceptance      = 0
canonical issuer/resource disagreement = 0
DCR compatibility                     = preserved
speculative auth surface              = 0
```

### B5 — Codespace legacy compatibility canary

Codespace remains a compatibility surface only.

- Preserve `plugin/codespace`'s existing v1 MCP SDK implementation.
- Run its existing HTTP integration tests against the migrated Agent Core core.
- Confirm root bootstrap knows the new root dependency files while plugin bootstrap still knows its own v1 dependency.
- Run a live local Agent Core canary in `dual` mode.
- Exercise legacy calls through existing connector-compatible behavior.
- Exercise modern `server/discover` and one modern tool call directly against the temporary authenticated core instance.

Acceptance:

```text
existing Codespace/legacy integration = PASS
modern direct protocol canary          = PASS
no plugin protocol migration required  = true
```

### B6 — Focused Wave B acceptance

Minimum focused matrix:

```text
tests/config.test.ts
tests/plugin-package.test.ts
tests/mcp-integration.test.ts
tests/http-auth.test.ts
tests/http-security.test.ts
tests/oauth.test.ts
new dual-era/protocol tests
plugin/codespace/tests/http-mcp.integration.test.ts
plugin/codespace/tests/mcp.integration.test.ts
```

Required Wave B exit gates:

```text
legacy connector behavior        PASS
modern protocol acceptance       PASS
same Agent Core tool semantics   PASS
OAuth/security gates             PASS
rollback to legacy-only mode     PASS
external AI model/API dependency 0
```

### B7 — Full certification and integration

Before any merge/push:

```bash
npm run build
git diff --check
npm run verify
npm run verify:release
```

Then run live temporary-instance canaries with no production secret output.

Required final evidence:

```text
full regression                PASS
release/document gates         PASS
legacy live canary             PASS
modern live canary             PASS
legacy-only rollback canary    PASS
Codespace compatibility        PASS
package/dependency diff        only intended MCP v2 migration
external AI model/API dependency added = 0
```

After fresh evidence exists:

1. Update this plan and the Balanced Evolution roadmap with actual counts and evidence.
2. Commit certification evidence.
3. Fast-forward `main` from `wave-b/mcp-dual-era`.
4. Re-run required merged-state verification if branch topology changed.
5. Push `origin/main`.
6. Fetch/read remote HEAD and require exact local/remote commit equality.
7. Restart the live Codespace Agent Core process so connection metadata points at the Wave B source commit.
8. Run public readiness/security compatibility canary.
9. Only then mark Wave B certified complete.

## 5. Explicit Non-Goals

Wave B does not authorize:

```text
cloud AI models or external reasoning agents
model API keys
cloud embeddings/rerankers/judges
MCP Tasks adoption
MCP Apps adoption
new Agent Core business tools
new autonomous behavior
removal of working DCR compatibility without host evidence
migration of the Codespace plugin merely for protocol freshness
breaking legacy connector behavior to force 2026-07-28 adoption
```

## 6. Rollback Contract

Two rollback levels must remain factual:

1. **Runtime protocol rollback:** set `AGENT_CORE_MCP_PROTOCOL_MODE=legacy` to keep serving 2025-era stateless MCP through the v2 SDK while modern requests are rejected.
2. **Git rollback:** Wave B remains a bounded commit series on top of certified Wave A, so the operator can restore the prior `f688789` source if the v2 SDK itself creates an unforeseen deployment incompatibility.

The normal certified target is `dual`; the runtime rollback exists to isolate modern-era interoperability problems without weakening Wave A authentication/security boundaries.
