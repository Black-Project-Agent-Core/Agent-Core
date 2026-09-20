# Anthropic SDK TypeScript — Steal/Use Integration Plan

**Status:** FOURTH WAVE COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — CONDITIONAL RESIDUALS RETAINED
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

**Disposition:** IMPLEMENTED — TARGETED VERIFIED.

Source fact: Anthropic's MCP adapter accepts `structuredContent` when a tool returns no usable text content, because MCP does not require duplicated serialized text.
Pre-implementation gap: Code Intelligence previously scanned only `CallToolResult.content[]` text and returned null when a provider emitted structured-only MCP results.

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

**Disposition:** IMPLEMENTED — TARGETED VERIFIED.

Source fact: `{ once: true }` removes an abort listener only if abort fires; a normal successful lifecycle must explicitly detach listeners from long-lived signals.
Anthropic tests verify zero leftover listeners after success, errors, retries, consumed streams, and early stream exits.

Pre-implementation gap: `src/mcp/handler.ts::legacyJsonFallback()` attached an abort listener but did not explicitly detach it on normal completion.

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

**Disposition:** IMPLEMENTED — TARGETED VERIFIED after user approval of the full plan.

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

The TypeScript checkout is **not corpse yet** because TS3-C1/TS3-C2/TS3-C3 remain source-backed conditional references even though TS3-P1/TS3-P2/TS3-P3 are implemented and targeted-verified.
Re-run a final source/dependency census only after those conditional families are explicitly implemented through real consumers or rejected.
Delete the checkout only when zero remaining unique current/future-approved mechanisms remain and active Agent Core has no dependency on it.

## 10. Approved implementation result

The user approved the full current-fit proposal set. TS3-P1/TS3-P2/TS3-P3 are implemented and targeted-verified. TS3-C1/TS3-C2/TS3-C3 remain dormant because their required consumers do not exist; approval does not authorize abstraction-only subsystems.

## 11. Implementation evidence — 2026-09-20

- TS3-P1: new `src/mcp/call-tool-result.ts` preserves valid text-JSON precedence and falls back to object `structuredContent`; Code Intelligence uses it for provider JSON parsing.
- TS3-P2: legacy MCP fallback now binds a named abort close listener and explicitly detaches it on normal teardown while preserving abort-driven close.
- TS3-P3: `fetchWithPolicy` now exposes optional fail-soft per-attempt metadata hooks with sanitized target labels, retry decisions/delays, safe correlation IDs, and redacted failure families.
- No Anthropic TypeScript SDK package/runtime/model/provider was installed.
- Root TypeScript build: PASS.
- Targeted verification: `tests/anthropic-sdk-third-wave.test.ts` 13/13 PASS.
- Supporting hardening tests: `tests/atomic-owned-file.test.ts` 2/2 PASS; `tests/oauth-atomic-exchange-review.test.ts` 3/3 PASS.
- `release:compat`: 62→62 tools, no tool/route removals, `breakingEvidence=false`, no verification issues, manifest budget within limits.
- `release:check-intent`: OK.
- Patch intent: `.changeset/20260920112904-5ac81f.md`.
- Stable remains 0.11.0; aggregate pending release remains minor → planned 0.12.0.
- Live Node activation is verified: the rebuilt `dist` contains TS3-P1/P2/P3, Node Core respawned as PID 16196 at 2026-09-20 18:44:56 local time running `<PROJECT_ROOT>\dist\index.js`, and live `/health` returned `status=ok` with Execution/Memory/Grafel/Semantic IDE/Learning available. Hermes Partner separately reported `degraded` with `HERMES_API_SERVER_SOURCE_NOT_FOUND`; that optional subsystem issue does not invalidate Node Core activation.

## 13. Fourth-wave source-first re-grounding — 2026-09-20

This pass re-indexed the exact checkout, then re-read handwritten core/internal/lib/helpers/tools source, focused tests, and recent Git history. The isolated graph reached current at 13,665 entities / 52,256 relationships. Git authority stayed at `d10318284eece2f612d2758a6d5935fe32dc6f7d`; active Agent Core has zero runtime/import dependency on the checkout.

### TS4-P1 — converge internal MCP JSON-result decoding
**Recommendation:** APPROVE — SMALL / HIGH CONFIDENCE.

TS3-P1 fixed Code Intelligence service parsing, but exact current Agent Core still has text-only duplicate parsers in `src/mcp/code-intelligence-tools.ts`, `src/learning/code-pattern-sink.ts`, and the Phone gateway payload reader.

Target:
- reuse one Agent Core-owned structural decoder;
- parse valid text JSON first for compatibility;
- fall back to non-null object `structuredContent`;
- fail closed on tool error where the caller has not already handled it;
- preserve text error extraction and image-content handling;
- do not import Anthropic SDK.

Acceptance:
- Code Intelligence graph-touch/repair decoding accepts structured-only provider results;
- Learning duplicate/capture/sample paths accept structured-only Grafel results;
- Phone JSON payload helpers accept structured-only tool payloads without changing image paths;
- valid text JSON remains higher precedence.

### TS4-P2 — Phone Streamable-HTTP/SSE framing hardening
**Recommendation:** APPROVE — SMALL / CURRENT REAL CONSUMER.

Exact `src/phone/gateway.ts::parseRpc()` currently splits only on `/\r?\n/`, selects individual `data:` lines, and parses the last line. Anthropic's tested line/SSE decoder handles LF, CRLF and CR framing, event boundaries, comments, chunk boundaries, and multiple `data:` fields joined with newline.

Target a minimal Agent Core parser for the already-buffered Phone response:
- keep plain `application/json` behavior;
- parse SSE by complete blank-line-delimited events across LF/CRLF/CR;
- join multiple `data:` lines with `\n`;
- ignore comments and non-data fields unless needed for framing;
- choose a complete JSON-RPC response envelope, never an arbitrary last data line;
- bound diagnostics through existing truncation/redaction;
- do not introduce a generic Anthropic streaming runtime.

Acceptance:
- one-line SSE stays compatible;
- multi-line data and multiple events decode deterministically;
- CR, LF and CRLF work;
- incomplete/non-JSON frames fail clearly;
- all existing Phone operations retain their RPC behavior.

### TS4-P3 — outbound cancellation and response-body lifecycle
**Recommendation:** APPROVE — HIGH VALUE SHARED HARDENING.

Current `fetchWithPolicy()` treats `AbortError` as retryable without first distinguishing explicit caller cancellation, sleeps without caller-signal awareness, and retries HTTP responses without cancelling the discarded body. `bounded-response.ts` releases a reader lock after a byte-limit error but does not cancel the body. Anthropic source explicitly separates user abort, uses abort-aware retry sleep, cancels response bodies before retry, and cancels streams when consumption ends early.

Target:
- if the caller's supplied signal is aborted, stop immediately and never retry it as a network timeout;
- keep internally generated timeout/network aborts retryable under existing safety policy;
- make retry backoff abort-aware;
- best-effort cancel a discarded retry response body before delay/retry;
- on bounded-response overflow/read failure, cancel the reader/body before releasing its lock without masking the original error;
- never cancel a successful final response returned to its caller.

Acceptance:
- caller abort produces one terminal attempt;
- timeout/network failures still follow existing retry class;
- abort during backoff exits promptly;
- retryable HTTP bodies are cancelled before the next attempt;
- bounded body overflow cancels its reader;
- existing non-idempotent one-attempt semantics remain unchanged.

### TS4-P4 — race-bound owned/sensitive/config file I/O
**Recommendation:** REVIEW / APPROVE — SECURITY HARDENING, WINDOWS-NATIVE DESIGN REQUIRED.

Anthropic FileStore validates the opened handle and uses no-follow semantics where available. Current Agent Core sensitive-file reads and RDC `followSymlinks:false` config reads validate by path before a separate open/read, leaving a path-swap window. Project Node on Windows reports no `O_NOFOLLOW`, but a live probe shows `lstat` and handle `fstat` expose matching nonzero `dev/ino`.

Target:
- introduce a narrow Agent Core-owned secure-open helper, not a FileStore;
- open a handle, verify it is regular, and bind the consumed handle to the validated path identity using Windows-compatible `dev/ino`/reparse-aware checks;
- preserve bounded reads and current POSIX permission checks;
- use it for keys/OAuth sensitive reads and RDC config no-follow reads where behavior is equivalent;
- converge RDC config persistence on `writeOwnedFileAtomic` if locking/default-file semantics remain compatible;
- no new dependency unless exact Windows source inspection proves Node APIs insufficient.

Acceptance:
- normal files remain readable;
- symlink/reparse/path-swap attempts fail closed;
- keys/OAuth/config consume the validated handle rather than reopening by path;
- config writes remain atomic and do not replace an owned symlink target;
- existing lock/concurrency behavior is preserved.

## 14. Conditional families after fourth-wave census

TS3-C1 TokenCache, TS3-C2 credential/OIDC chain, and TS3-C3 lease worker remain conditional. The Python checkout supplies additional cache cancellation/invalidation-race evidence; the TypeScript checkout remains the native Node reference. No current Agent Core consumer justifies installing these abstractions.

External memory replica discipline is also retained conditionally:
- two-pass metadata/content reconciliation;
- delete corroboration/caps and marker trust;
- only-copy protection;
- read-only roots;
- bounded final/rescue flush.

## 15. Rejected / already-covered fourth-wave families

No new proposal is warranted for exact CRLF/byte preservation, Semantic provider archive/symlink safety, cross-realm standard AbortError/TimeoutError names, generic async queues, Managed-Agent event accumulation, pause-turn/response-container/session-runner semantics, Standard Schema/Zod helpers, Anthropic response workspace metadata, provider-specific cloud signing/adapters, model fallback/compaction, generated API resources, browser/runtime packaging matrices, or a full FileStore/streaming/MCP-to-Claude layer.

The four TS4 proposals above are the only new current-fit gaps found after exact-source matching. They are proposal-only and require user selection before implementation.

## 16. Retirement decision

**RETAIN — NOT CORPSE.** The checkout still contains source-backed conditional mechanisms plus the source/test evidence needed for TS4-P1 through TS4-P4 review. Delete only after selected TS4 proposals close, conditional families are implemented through real consumers or explicitly rejected, and a final dependency/uniqueness census reaches zero.

## 17. Fourth-wave implementation result — 2026-09-20

User approved TS4-P1 through TS4-P4. Implemented Agent Core-owned behavior:
- TS4-P1: one structural MCP JSON decoder is now shared by Code Intelligence service/tools, Learning's Grafel sink, and Phone JSON payload handling; valid text JSON still wins over object `structuredContent`;
- TS4-P2: Phone Streamable-HTTP parsing now consumes complete SSE event frames across LF/CRLF/CR, joins multi-line `data:` values, ignores comments/non-data fields, and selects a complete JSON-RPC response envelope rather than the last arbitrary data line;
- TS4-P3: caller abort is terminal, retry sleep is caller-signal-aware, discarded retry response bodies are cancelled, bounded-reader failures cancel the reader, and per-attempt hooks remain exactly once per actual fetch attempt;
- TS4-P4: sensitive/config reads bind pre/open/post file identity using exact BigInt `dev/ino`; config persistence uses the existing Agent Core atomic writer under the existing cross-process lock.

No Anthropic SDK package/runtime/model/provider and no additional tool dependency was installed.

Targeted evidence:
- TypeScript build PASS;
- fourth-wave suite 18/18 PASS;
- final P4 affected suites: Key Store 4/4, OAuth atomic exchange 3/3, RDC safe-file 5/5 PASS;
- targeted bridge config/file mutation path PASS;
- earlier post-P3 affected suites passed: Anthropic third-wave 13/13, Learning/Grafel 6/6, Grafel boundary 6/6, atomic owned-file 2/2;
- `release:compat` 62→62, no added/removed tools or routes, `breakingEvidence=false`, no verification issues, manifest within budget;
- `release:check-intent` OK;
- patch intent `.changeset/20260920122716-874f7f.md`;
- stable remains 0.11.0; 9 pending intents aggregate to planned 0.12.0.

The full legacy `bridge-runtime.test.ts` still contains an unrelated stale assertion expecting 36 tools while its test service exposes 37; its config/file subtest passes and release compatibility proves the real public surface remains 62→62. This stale harness assertion is not modified as part of Anthropic adoption.

Live Node activation/readback remains pending at this section's write time. Conditional TokenCache/OIDC/lease-worker/external-memory-sync families remain dormant without real consumers.

## 18. Fourth-wave live activation — VERIFIED

The rebuilt Node Core is live:
- Node Core PID: `18268`;
- creation time: `2026-09-20 19:39:16 +07:00`;
- command: `<PROJECT_ROOT>\runtime\node\node.exe <PROJECT_ROOT>\dist\index.js`;
- live `/health`: `status=ok`;
- Memory/Execution/Phone/Grafel/Semantic IDE/Learning all report available/current as applicable;
- compiled `dist\mcp\call-tool-result.js`, `dist\mcp\streamable-http.js`, `dist\net\outbound-request.js`, `dist\security\file-identity.js`, and `dist\security\sensitive-file.js` contain TS4-P1/P2/P3/P4.

Hermes Partner separately reports `degraded` with `HERMES_API_SERVER_SOURCE_NOT_FOUND`; this optional subsystem state is independent from the fourth-wave activation.

TS4-P1/P2/P3/P4 is therefore COMPLETE / IMPLEMENTED / TARGETED VERIFIED / LIVE-ACTIVATED. Conditional TokenCache/OIDC/lease-worker/external-memory-sync families remain inactive without real consumers.
