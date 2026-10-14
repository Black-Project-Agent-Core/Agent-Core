# Anthropic SDK TypeScript — Steal/Use Integration Plan

**Status:** RE-GROUNDED — PROPOSALS READY FOR USER REVIEW — NO IMPLEMENTATION
**Reference:** `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\anthropic-sdk-typescript`
**Pinned audit revision:** `d10318284eece2f612d2758a6d5935fe32dc6f7d`
**Package version at audit:** `0.126.0`
**License:** MIT
**Authority:** current Agent Core source/runtime outranks this reference.

## 1. Goal

Find remaining TypeScript SDK mechanisms that materially improve Agent Core without importing Anthropic's client/model/agent runtime.
The reference is especially useful where it exposes lifecycle bugs or MCP interoperability gaps directly applicable to Node Agent Core.

## 2. Grounding evidence

- Indexed source/tests with request-scoped Grafel; exact source was then read for material findings.
- Audited core middleware, request signal lifecycle, abort helpers, async queue, credential chain/cache, environments poller/worker, sessions, tool runners, compaction, MCP adapters, local memory/skills toolsets, helper clients, and generated API surfaces.
- Cross-checked Agent Core `src/net`, MCP HTTP handler, OAuth store, provider clients, Memory/Learning, Grafel and Semantic IDE.
- Verified Git origin/revision and MIT license.
- No dependency install or runtime mutation was performed.

## 3. Current-fit proposals
### TS3-P1 — MCP structuredContent fallback

**Recommendation:** APPROVE — HIGH VALUE / SMALL CHANGE.

Source fact: Anthropic's MCP adapter accepts `structuredContent` when a tool returns no usable text content, because MCP does not require duplicated serialized text.
Current Agent Core fact: `src/code-intelligence/service.ts::parseProviderJson()` only scans `CallToolResult.content[]` text and returns null otherwise.

Target design:
- add one Agent Core-owned MCP result decoder helper;
- preserve current parseable text-content precedence for compatibility;
- if no parseable text JSON exists and `structuredContent` is a non-null object, return it directly;
- never stringify/reparse when a structured object is already available;
- preserve `isError` fail-closed behavior;
- bound/validate only where the downstream contract already requires it.

Primary consumer: Grafel internal MCP provider results.
Do not add Anthropic SDK as a dependency.

Acceptance:
- existing text JSON result unchanged;
- structured-only object accepted;
- text takes precedence when both are valid;
- malformed text may fall through to structured content;
- `isError=true` remains rejected;
- no public MCP tool/schema change is required.
### TS3-P2 — explicit abort-listener teardown

**Recommendation:** APPROVE — HIGH VALUE / SURGICAL.

Source fact: `{ once: true }` removes an abort listener only if abort fires; a normal successful lifecycle must explicitly detach listeners from long-lived signals.
Anthropic tests verify zero leftover listeners after success, errors, retries, consumed streams, and early stream exits.

Current Agent Core fact: `src/mcp/handler.ts::legacyJsonFallback()` attaches an abort listener and closes resources in `finally`, but does not explicitly detach that listener on normal completion.

Target design:
- use a named abort callback;
- attach once to preserve abort behavior;
- remove the listener during normal `finally` teardown before/while closing transport/product;
- keep close idempotent;
- only create a shared `linkAbort` helper if a second real Agent Core consumer is identified; otherwise keep the patch local.

Acceptance:
- normal legacy MCP request leaves no abort listener;
- aborted request still closes resources;
- repeated calls with a reusable synthetic signal do not accumulate listeners;
- product/transport close stays exactly-once/idempotent;
- modern MCP path behavior is unchanged.
### TS3-P3 — bounded outbound attempt hooks

**Recommendation:** OPTIONAL / MEDIUM — USER SELECTABLE.

Source fact: SDK middleware is executed inside the retry loop per HTTP attempt and has a typed context; timeout still belongs to the underlying fetch.
Current Agent Core fact: `fetchWithPolicy()` is a shared seam used by Phone, Memory embedding, Hermes, Semantic provisioning, PDF and filesystem URL reads.

Do not transplant arbitrary middleware. If selected, implement only metadata-only hooks around each attempt:
- attempt number / maximum attempts;
- safety classification;
- sanitized host/path label, never credential-bearing query/header/body;
- response status and bounded provider correlation ID;
- retry decision/delay;
- error family after redaction.

Hooks must be optional, fail-soft, and must never route/block/retry independently.
Activity Tracker integration is not mandatory; the primitive should remain usable without creating log noise.

Acceptance:
- hooks observe every actual fetch attempt exactly once;
- hook failure cannot change request result;
- no raw credentials or request body are exposed;
- non-idempotent policy still forces one attempt;
- existing callers require no behavior change when hooks are absent.
## 4. Conditional mechanisms — retain as reference, do not implement yet

### TS3-C1 — expiring credential TokenCache

Two-tier advisory/mandatory refresh plus single-flight deduplication is source-backed and well tested.
No current Agent Core outbound subsystem owns an expiring external bearer-token provider, so abstraction-only installation is prohibited.
Re-evaluate if such a provider is added.

### TS3-C2 — credential chain / OIDC federation

Useful precedence/fail-closed semantics exist for profile/env/OIDC/user OAuth credentials.
Agent Core currently has different credential authorities; do not add an Anthropic-style profile system without an explicit provider requirement.

### TS3-C3 — lease/heartbeat worker lifecycle

EnvironmentWorker and SessionToolRunner contain strong lease-loss, heartbeat, bounded result-send, and per-item credential isolation semantics.
Agent Core currently has no distributed work-item lease queue; retain as reference only.

## 5. Rejected mechanisms

- Anthropic model/API client as Agent Core runtime dependency;
- `BetaToolRunner` / `SessionToolRunner` as an internal controller or execution gate;
- user-confirmation gate duplicated below the platform/controller authorization boundary;
- client-side compaction ownership;
- refusal/model fallback middleware;
- Anthropic Memory Stores or local memory tool as replacement for MemoryService;
- Anthropic Skills/toolset as replacement for Learning/Grafel Patterns;
- generic MCP-to-Claude tool/message conversion layer;
- generated agents/deployments/dreams/vaults/webhooks API resource surfaces;
- broad browser/Bun/Deno/cloud runtime matrix for this Windows local product.

## 6. Security invariants worth carrying without new subsystem

- when a scoped child credential replaces a parent credential, inherited auth headers must be stripped rather than merged;
- request-scoped credentials must not leak into generic child environments;
- callbacks/hooks receive sanitized metadata, not raw secrets;
- explicit configuration failure should fail closed; implicit discovery failure may fail soft only where documented.

These are invariants for selected implementations, not authorization to create a credential framework.

## 7. Implementation order if approved

Phase 0 — scoped backup + release-intent decision.
Phase 1 — TS3-P1 MCP structuredContent decoder and targeted contract tests.
Phase 2 — TS3-P2 abort lifecycle patch and listener-leak regression.
Phase 3 — TS3-P3 only if user explicitly selects it.
Phase 4 — TypeScript build + targeted tests only; no broad suite without authorization.
Phase 5 — update CODEBASE + root MEMORY + canonical durable memory with verified state.
Phase 6 — rebuild/cutover Node Core only if runtime-owned files changed, then live readback.
Phase 7 — final zero-value census and reference-retirement decision.
## 8. Release semantics

TS3-P1/P2 are hardening/correctness improvements and can share a patch intent if implemented together without new public capability.
TS3-P3 may still be patch if entirely internal/optional; use minor only if it creates a durable public capability.
No `release:apply`, baseline refresh, commit, tag, push, publish, deploy or automatic restart is authorized by this plan.

## 9. Retirement rule

The TypeScript checkout is **not corpse** while TS3-P1/P2 are unresolved and C1-C3 remain source-backed conditional references.
After selected proposals are implemented/rejected, run a final source/dependency census.
Delete the checkout only when zero remaining unique current/future-approved mechanisms remain and active Agent Core has no dependency on it.

## 10. User selection

Selectable current-fit proposals:
- `TS3-P1` — MCP structuredContent fallback;
- `TS3-P2` — abort-listener teardown;
- `TS3-P3` — bounded outbound attempt hooks (optional).

No implementation occurs until user review/selection.
