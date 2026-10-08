# Anthropic SDK TypeScript — Steal/Use Integration Plan

**Status:** TS7-P1 / TS7-P2 / TS6-P1 COMPLETE / LIVE-ACTIVATED / INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS; EARLIER SELECTIONS PRESERVED; REFERENCE RETAINED
**Latest review:** Production activation is complete; see the final activation section and docs/Wave7-Activation-20260923.md. Older NOT ACTIVATED/failed-checkpoint labels below are historical evidence, not current activation tasks.
**Current re-grounding:** 2026-09-25; `Consumer\anthropic-sdk-typescript` at `3c5d9c0c15bb847a628f3f2876ac09719abe3012`.
**Evidence boundary:** historical TS3/TS4 implementation/verification below remains historical; current source/runtime evidence controls present conclusions. TS5/TS6/TS7 selected waves are implemented and live-activated; conditional families remain unselected until a real consumer exists.
**Reference:** `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\anthropic-sdk-typescript`
**Earlier audit baseline:** `d10318284eece2f612d2758a6d5935fe32dc6f7d`
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

## 19. Fifth-wave source-first audit — 2026-09-22

### 19.1 Scope and provenance
Current reference: `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\anthropic-sdk-typescript`, HEAD `3c5d9c0c15bb847a628f3f2876ac09719abe3012`; previous baseline `d10318284eece2f612d2758a6d5935fe32dc6f7d` exists locally. The checkout was clean before the authorized audit marker. Inventory: 728 tracked files, 500 code-suffix files including tests/examples/generated code, 20 remote refs, 127 changed paths against the baseline. These are inventory counts, not a claim that every file/function was semantically reviewed.
The decision is based on exact changed handwritten client/internal/library source, its focused tests, and the current Agent Core consumers. Generated API declarations, cloud adapters, examples and ecosystem test configuration were classified separately. Graph indexing is supplementary evidence, never a replacement for source. Remote-ref inventory is not proof that every unmerged branch has been exhaustively evaluated; this repository is retained, not declared zero-value.
### 19.2 TS5-P1 — Prevent retries of one-shot request bodies
**Status: APPROVED — IMPLEMENTED IN NATIVE SOURCE — TARGETED TESTED — NOT LIVE. Priority: MEDIUM.**
**Upstream evidence:** `src/client.ts::makeRequest` checks `isStreamBody(options.body)` and sets retry count to zero. `isStreamBody` distinguishes ReadableStream/async iterable/iterator bodies from reusable payloads. `tests/index.test.ts:628-655` includes the ReadableStream and async-iterator 503 cases and asserts exactly one send. The upstream test was read, not executed.
**Agent Core evidence:** `src/net/outbound-request.ts:138-196` accepts `RequestInit`, calculates attempts only from safety/maxAttempts, and repeats `fetch(input, { ...init, signal })` with the same body. Operation idempotency does not establish that a consumed body can be sent again. There is no body-replayability guard in this implementation.
**Confidence boundary:** this is a directly visible shared-helper contract gap. The inspected first-party callers use JSON bodies or GET requests; no currently failing production stream-upload call was observed. Do not describe this as a verified live upload incident.
**Adaptation:** add a small local body classifier in the existing outbound module. A one-shot body forces one attempt regardless of an idempotent safety label; no-body/string/byte-buffer and other demonstrably repeatable supported BodyInit values retain the existing bounded policy. Do not add a second request engine, automatically buffer arbitrary streams, call iterator.next() during classification, or install the Anthropic SDK.
**Compatibility:** retain the current `fetchWithPolicy` signature, caller-abort behavior, response-body ownership, metadata-only attempt hook, and single-attempt non-idempotent rule. For unsupported body objects fail according to the existing fetch contract rather than inventing implicit serialization. Node stream detection must cover the Node-compatible bodies actually accepted by the runtime without invoking untrusted accessors unnecessarily.
**Implementation targets after approval:** `src/net/outbound-request.ts`; a focused `tests/outbound-body-replayability.test.ts`; the affected CODEBASE networking section. The deleted `src/failure-evidence.ts` dependency must be restored in a separately authorized source-recovery task before treating a full build as available.
**Acceptance matrix for later authorized tests:** ReadableStream plus 503 -> one attempt; async-iterable/Node stream supported by the selected runtime -> one attempt; string/bytes plus retryable response -> unchanged bounded retry; non-idempotent request -> one attempt; abort during backoff -> prompt termination; successful final body remains consumable; onAttempt fires once per actual send. A mock that never reads the request body is insufficient as the only test: include a consumer that actually consumes it.
**Selection steps:** record accept/reject; approve the exact focused test; implement only the selected native helper change; run that test/build only within approval; document evidence and one patch release intent. No release:apply, restart, publish, or new public MCP tool is implied.

### 19.3 Other source changes and existing integration
The new lazy debug formatting in `src/internal/utils/log.ts::debugLogRequestDetails` avoids copying headers/options when debug is disabled. It is useful source evidence but no measured equivalent Agent Core hot-path bottleneck was established; do not add a logging framework for it. Pagination type-only exports, stream type alias changes, schema-transform stubs, managed-agent compaction and generated API additions are SDK-specific and do not justify importing a provider/controller into Agent Core.
Existing `src/net/outbound-request.ts` still contains caller-abort checks, abort-aware sleep, discarded-response cancellation and bounded attempt hooks. This is direct present-source evidence for parts of TS3/TS4, not proof of current end-to-end operability. `src/net/bounded-response.ts`, `src/failure-evidence.ts` and other files removed as corrupt remain missing. Their recovery is not implemented by this plan.
### 19.4 Conditional references and coordination
TS3-C1 token-cache refresh, TS3-C2 identity/credential discovery, TS3-C3 lease/heartbeat lifecycle, and external-memory synchronization remain **CONDITIONAL — NOT SELECTED FOR INSTALLATION**. The earlier retained evidence has not been revoked, but a real approved consumer is required before implementation. No new credential provider, distributed worker or parallel memory store is proposed merely to consume reference code.
The Python plan's PY5-P1 targets the same outbound helper for a separate Retry-After/budget defect. TS5-P1 and PY5-P1 are independently selectable; coordinate edits/tests if both are approved and avoid duplicate networking abstractions. No Python or TypeScript Anthropic runtime dependency is necessary.
### 19.5 User selection and retention
- [x] TS5-P1 — approved; implemented, targeted-tested and live-activated; activation verified on 2026-09-22.
- [ ] Reject TS5-P1.
Later explicit user approval selected TS5-P1; conditional families remain unselected.
**Reference disposition: RETAIN.** The selected source change is implemented, but activation and unresolved conditional families remain; zero-value retirement is not justified. The requested `steal-use-repos` checkout is distinct from any older `memory` checkout; no other protected directory is authorized for removal by this task.
**Verification performed in this pass:** source reads, Git revision/delta inventory, graph-assisted inspection, and documentation readback only. No SDK/client execution, request replay test, build, install, product restart or release operation has been performed.

## Approved execution result — 2026-09-22 (TS5-P1)
The user approved the six new selections and local memory repair. TS5-P1 is implemented in current native source; the fourth-wave/historical records above do not substitute for this new evidence.
Exact evidence: `runtime/tmp/approved-adoption-20260922/native-verified.json`: 45 passing cases, zero failing cases across the four selected native test files, including this selection. Real behavior regressions were established before the correction; the first missing-import test-loader failure was not counted as behavioral RED.
See `docs/Approved-Adoption-Execution-20260922.md` for changed source, acceptance cases, required-import reconstruction and memory record IDs. Four narrowly necessary missing imports were reconstructed from surviving local dist and their emitted runtime statements were verified identical.
The active Node dist and active provider were not replaced or restarted. The earlier missing-type compiler blocker is now closed by the post-restart continuation below: strict selected checking has zero diagnostics and an isolated native candidate is built/tested. Whole-source recovery and live activation remain incomplete; conditional families remain unselected. No release apply, commit, tag, push or publication occurred.
Native canonical memory repair was verified through list, reindex, remember and readback; historical lost notes were not recreated. Durable execution record: `71ca3311-98ac-4f70-8b95-4c6da22f4788`; recovery record: `46a4013d-695e-4450-9aac-602b2cdcca09`.

### Resumed verification and memory sync — 2026-09-22
The earlier resumed native run passed 45 tests (`native-resume.json`) while its historical compiler probe reported four diagnostics. That compiler blocker is superseded by the verified post-restart result below; the old evidence files remain historical and are not rewritten. See the execution report and canonical memory `71ca3311-98ac-4f70-8b95-4c6da22f4788` for the current candidate-versus-live state.


### Post-launcher-restart qualification — 2026-09-22
The post-launcher-restart continuation closed the selected native compiler blocker: src/semantic-ide/types.ts was reconstructed from six surviving semantic consumers and the config producer, not recovered byte-for-byte from history. Eleven negative type contracts and the semantic consumer closure compile cleanly; the emitted type module remains identical to the existing empty runtime module. Strict selected TS 6.0.3 no-emit now has zero diagnostics. A selected native candidate dependency closure of 19 JavaScript modules was built under runtime/build/native-approved-adoption-20260922/dist. Both fresh source and emitted-candidate runs passed the same 45 targeted cases, zero failed/skipped; these are two runs of the same cases, not 90 distinct tests. Native active dist was not replaced; no full-root build is claimed.
Evidence: `runtime/tmp/approved-adoption-20260922/semantic-types-reconstruction.json`, `native-typecheck-postrestart.json`, `native-candidate-build.json`, `native-postrestart.json`, `native-compiled-postrestart.json`, `compiled-native-test-provenance.json`, and `provider-candidate-mcp-postrestart.json`. The existing minor release intent remains pending. No active runtime replacement/restart, release apply, Git mutation, external notification or conditional adoption was performed.

### 2026-09-22 — Activation preparation (historical; now closed)

**CLOSED: the user completed installation; independent live readback is recorded below.** The user continued after the candidate report and asked that ambiguous boundary wording be replaced with concrete unfinished work.

Fresh comparison found four changed native programs and fifteen unchanged dependency programs. The replacement set is four JavaScript modules plus their four sourcemaps, Grafel executable and its updated provenance metadata. A fresh real-provider comparison returned 22 current and 22 candidate tools with zero missing tools and identical input schemas (`activation-schema-parity.json`). Earlier source/compiled 45-case test evidence remains valid as historical evidence; those suites were not rerun in this activation-preparation pass.

The platform rejected writing the automatic stop/start batch before execution. No production process was stopped and no active native/provider file was replaced. This is a concrete tool limitation, not a maximum-work limit or missing implementation approval. The incomplete automatic helper is archived as text and must not be executed.

`ACTIVATE-APPROVED-ADOPTION.cmd` now launches the task-local `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/install-when-stopped.mjs`. This offline helper never stops/kills processes: it reports running Core/Grafel/launcher PIDs, refuses installation while they remain active, validates the exact allowlisted candidate/current/backup hashes, uses same-directory replacement with scoped rollback on error, and requests launcher start after installation. At this preparation checkpoint only syntax and non-mutating preflight had been executed. The later user-run installation and live startup are verified below; the rollback-on-error path was not exercised. `installer-check.json` reports all candidate/backup hashes valid, alreadyInstalled=false and readyToInstall=false because processes are running.

Verified backup: `runtime/backups/approved-adoption-activation-20260922T095700`. Evidence and future installation result: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/`. The manual shutdown and root activation-launcher step were subsequently completed by the user; they are no longer pending. Preserve OAuth, tunnel, memory, other applications, references and current release version. Full source/Git recovery, the host-symlink check and pre-existing Semantic IDE provider damage remain separate unfinished work; no new release or broad repair was attempted.

### 2026-09-22 — Selected runtime activation verified

**CLOSED: installation and live readback completed.** The user installed the qualified files; independent checks now match all 10 installed files to the activation manifest. Node Core PID 18644 started at 2026-09-22T10:09:49Z after installation and serves the new native modules. The installed G26/G27 provider has SHA-256 `087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94`, a fresh 22-tool MCP handshake, wire 0.1.0 compatible and health available/current. G28 live status returns graphAvailability/groupCoverage and rejects unknown repo filters.

A fresh run of the same four targeted files against installed root dist passes 45/45 cases, zero failed/skipped, exit 0; this is not a broad regression suite or full-root build. Evidence: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/live-verification.json`, `installed-native-tests.json`, and the user-run `install-result.json`. See `docs/Approved-Adoption-Execution-20260922.md` for the consolidated record. No further installation/restart is required for these selections. Prior host-symlink validation remains unverified; pre-existing Semantic IDE provider damage, complete source/Git recovery, and release tooling repair are separate unresolved work. No new repair, release apply or publication was performed.


## Residual audit after live activation — 2026-09-22

### TS6-P1 — Single-flight Code Intelligence health refresh with stale-completion protection
**Status: IMPLEMENTED — QUALIFIED WITH EXPLICIT HOST SKIPS — NOT ACTIVATED. Priority: MEDIUM (concurrency/correctness).**
**Goal:** concurrent health readers should share one current refresh, and an older in-flight refresh must not overwrite a newer invalidation or completion.
**Architecture:** adapt the SDK's in-flight-promise ownership pattern inside the existing `CodeIntelligenceService`. No generic cache service, token authority, SDK runtime, daemon, or background poller is proposed.
**Existing completion:** TS5-P1 and TS3/TS4 remain implemented; one-shot body replay protection is not being proposed again. The new consumer is real provider health collection, not hypothetical future credentials.

### Source evidence and actual consumer
Reference root: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/anthropic-sdk-typescript`, HEAD `3c5d9c0c15bb847a628f3f2876ac09719abe3012`.

| Evidence | What it establishes |
| --- | --- |
| `src/lib/credentials/token-cache.ts::refresh`, `backgroundRefresh`, `doRefresh` | The TypeScript SDK stores a pending promise so concurrent mandatory readers share an exchange. |
| `tests/lib/credentials/token-cache.test.ts:157-185` | Three concurrent calls must invoke the provider once and receive the shared result. This test was read, not executed in this audit. |
| Python sibling `src/anthropic/lib/credentials/_cache.py::_next_step`, `_end_refresh`, `_end_failed_refresh` | Owner/waiter release and invalidation-aware publication provide additional race/cancellation evidence. This is supporting evidence, not a second proposed credential subsystem. |
| Agent Core `src/code-intelligence/service.ts:204-208` | `health()` only checks a completed-value TTL, then directly starts `refreshHealth()`; no per-service in-flight refresh is stored. |
| Same file `refreshHealth():1032-1123` | A refresh invokes provider status/index/ref/graph reads and unconditionally stores `lastHealth` and `lastHealthAt` after asynchronous work, including the error path. |
| Same file `lastHealthAt = 0` callsites | Tool-surface refresh, indexing and repair invalidate the timestamp without invalidating already-running collectors. |
| Agent Core `src/index.ts:137-146` | Actual HTTP health requests call Code Intelligence health. Existing service query paths also call `health()`; multiple callers can overlap an expired cache window. |

**Static deductions, not a production load measurement:** simultaneous expired-cache calls can duplicate provider work. If a collector started before an invalidation finishes afterward, its unconditional timestamp/result assignment can make its older observation the cached current result. G28 added real graph-load evidence to this path, so duplicated work is more than a scalar flag read.
**Do not copy the TypeScript cache blindly:** forced refresh bypasses an existing pending promise and its `doRefresh` callbacks unconditionally clear/store shared fields. The inspected implementation itself does not establish generation-safe late-completion behavior. Borrow deduplication; add native owner/generation checks, informed by the Python sibling.

### Selected design for review
Keep the public `health(force = false): Promise<CodeIntelligenceHealth>` signature and current TTL. Add instance-local `healthGeneration`, `pendingHealth` and closed-state bookkeeping; no global cache shared across roots.
Separate collecting a health snapshot from committing it. A collector must not write `lastHealth` internally; only its matching generation/owner may publish. Centralize timestamp invalidation in a small private method that increments the generation as well as expiring the cached value.

```text
pendingHealth = { generation, promise } | absent
health(force):
  disabled -> existing not-configured result
  valid completed cache and !force -> cached result
  pending generation equals current generation -> join that promise
  otherwise -> create one owner for the current generation and collect
on completion:
  publish only if not closed and generation still current
  clear pending only if the completing owner is still the stored owner
on invalidation:
  generation += 1; lastHealthAt = 0
```
`force=true` bypasses completed-value TTL; it does not multiply an identical already-running collection in the same generation. A superseded collector must not return its old observation as newly verified healthy: return the existing degraded/unknown health shape with an explicit superseded reason, allowing the next call to collect current evidence. Do not add an unbounded retry loop or quietly lengthen TTL.
Preserve G28's exact-repository graph/ref checks and fail-soft behavior. Do not serve known-stale health as available while doing advisory background refresh. The SDK's advisory stale-token policy is deliberately NOT adopted for health truth.

### Approved implementation tasks and observed completion
- [x] TS6.1: add `tests/code-intelligence-health-refresh.test.ts`. Instantiate an isolated service as in the existing exact-graph tests; mock provider boundaries, not `health()` or its refresh algorithm. Use deferred promises to control ordering without timing sleeps.
- [x] TS6.2: reproduce duplicated runtime.status calls and a stale collector overwriting an invalidated cache on the current implementation. A loader failure does not prove the race.
- [x] TS6.3: modify `src/code-intelligence/service.ts` only: split collect/commit, add per-instance owner/generation bookkeeping and replace all health timestamp invalidations with the centralized method. Include bootstrap and close paths in the census.
- [x] TS6.4: run the selected tests and existing `tests/code-intelligence-exact-graph.test.ts` after approval. Record the actual provider-call counts and final cached state, not merely Promise resolution.
- [x] TS6.5: update CODEBASE and this result record with evidence. Preserve public tool names and G28 availability decisions; no new runtime endpoint or dependency is required.

| Required case | Expected behavior |
| --- | --- |
| 20 simultaneous expired-cache calls | One collector/provider-status chain; all same-generation readers share its outcome. |
| Completed unexpired value | No provider call unless forced. |
| Concurrent forced calls | One same-generation collector, not one per caller. |
| Collection error followed by another call | Pending owner is released; no permanently stuck promise. |
| Old success completes after invalidation/new failure | Old success cannot overwrite the newer generation or be published as freshly healthy. |
| Old failure completes after newer success | Old failure cannot clear the new pending owner or replace the new healthy cache. |
| Close while collection is pending | No stale cache resurrection or process restart from the completion callback. |
| Two service instances/workspaces | No cross-instance promise or snapshot sharing. |
| G28 missing/wrong-ref graph | Remains unknown/degraded even when the refresh is deduplicated. |
| Root status plus a tool health read overlap | Correct shared read; no loss of ordinary machine-control availability. |

Proposed focused command, NOT run in this planning pass:
```powershell
& '.\runtime\node\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/code-intelligence-health-refresh.test.ts tests/code-intelligence-exact-graph.test.ts
```
This test file is to be created only after selection. Targeted compile/build and runtime activation require the later implementation scope; missing unrelated current-line source is not permission for a wholesale restoration.

### Tradeoffs, rollback, and selection
Concurrent forced reads now explicitly share a same-generation collector. A read invalidated while in flight may return degraded/unknown once instead of a misleading fresh success. Keep this visible; do not claim reduced latency or a measured resource saving until a later controlled test establishes it. Avoid locks held across network work, detached background retries, and reusing a rejected promise forever.
Rollback would restore only the service change, corresponding tests and matching compiled module. User memory, provider graph content and reference trees are not rollback targets. A later implementation normally needs a patch intent; this docs-only task creates none and does not consume the existing adoption intent.

- [x] Select TS6-P1 for native implementation and its listed verification.
- [ ] Reject TS6-P1 with a recorded reason.

**Disposition: RETAIN — NOT CORPSE.** The requested TypeScript checkout now has a concrete deduplication mechanism with a current native consumer. Credential-specific TS3-C1/TS3-C2/TS3-C3 and external-replica proposals remain unselected; the health proposal does not activate those families.
**Audit coverage:** 728 tracked paths, 20 local remote refs, and 127 changed paths versus the prior baseline were inventoried. Selected handwritten cache/request-signal/client code and focused tests were inspected; this is not a semantic review of every generated API file or every remote branch. The six newly completed native/provider selections are not counted as new opportunities.
**Evidence bundle:** `runtime/tmp/four-repo-residual-audit-20260922/`. No SDK installation, production source change, test execution, new cache subsystem, release action or checkout deletion occurred in this planning pass.


### Approved execution result — 2026-09-22

**Current result: IMPLEMENTED — QUALIFIED WITH EXPLICIT HOST SKIPS — NOT ACTIVATED.** User approval supersedes the prior plan-only status. Source-audit descriptions above are historical, not current bug behavior.

The selected implementation and qualification are recorded in `docs/Residual-Adoption-Execution-20260922.md`. Final native source and compiled candidate each report 94 cases: 92 PASS / 0 FAIL / 2 host SKIP. TypeScript 6.0.3 reports zero targeted diagnostics. Exactly six candidate modules differ; 21 dependencies are byte-identical to installed runtime. This is not a full-root build or real-LSP repair.

Evidence: `runtime/tmp/residual-adoption-20260922/`; backups: `runtime/backups/residual-adoption-20260922/`; canonical memory: `163fc8f2-9be1-4956-bcaa-7c7a6537fb35`. Two native symlink tests are EISDIR-blocked by the host, independently reproduced and explicitly skipped rather than called PASS. The four references and active dist/provider/metadata/package hashes remain unchanged. The new patch intent does not apply a release or activate candidates. Cold-fixture bootstrap ordering and pre-existing source/Git/provider issues remain separate, documented limitations.

### Cross-selection final handoff

This native selection retains its verified result. G29 has a separate final MCP acceptance failure (18 PASS / 6 FAIL), documented in docs/Residual-Adoption-Execution-20260922.md. No candidate has been activated.

## Post-implementation source-first re-grounding — 2026-09-22

**Status: APPROVED — IMPLEMENTED — CANDIDATE QUALIFIED WITH EXPLICIT SKIPS — NOT ACTIVATED.**
**Spec:** the current user request is source-first inspection of the exact four reference directories, with proposals written here for selection before installation.
**Continuity:** TS5-P1 remains live/closed. TS6-P1 is already implemented and qualified in native source/compiled candidate, NOT ACTIVATED. Its prior result is preserved. TS7-P2 is a different consumer, not a second implementation of CodeIntelligenceService.health.

### TS7-P1 — Consume the matching bounded MCP response incrementally
**Goal:** finish a Phone gateway RPC when its complete matching response arrives, without waiting for the server to close an SSE body or accepting an unrelated response.
**Architecture:** reuse the SDK incremental line/event and iterator-lifetime mechanism inside the existing native MCP response parser. No Anthropic client, model event loop, SDK runtime, reconnecting command queue, or additional provider is proposed.
**Evidence class:** source-derived transport counterexamples, not a newly executed Phone incident.

| Exact source | Current evidence |
| --- | --- |
| Reference `src/internal/decoders/line.ts:10-79` | Keeps partial bytes/newline state across chunks rather than splitting a whole body after EOF. |
| Reference `src/core/streaming.ts:282-405` | Incremental complete SSE event extraction with multiline data and comment handling. |
| Reference `src/core/streaming.ts:148-165,249-278` | Iterator finalization owns abort/release; readable-stream cancellation calls iterator.return. Copy the ownership pattern, not raw-payload logging or swallowed application errors. |
| Native `src/phone/gateway.ts:88-115` | Sends one non-idempotent request with id=1, waits for a bounded whole body, then parses. |
| Native `src/mcp/streamable-http.ts:1-46` | Buffered JSON accepts an object; SSE keeps the last complete object with result/error, without checking jsonrpc or matching an expected id. |

**Deductions:** a final SSE response followed by a still-open stream does not return until EOF/timeout; a later response for another id can replace the intended result. Existing TS4 framing handles completed LF/CRLF/CR bodies; do not count those completed-body fixes as new work.

### TS7-P1 selected design and file scope
Modify `src/mcp/streamable-http.ts` and `src/phone/gateway.ts`. Add `tests/mcp-streaming-response.test.ts`. Keep the existing buffered parser export for its current callers/tests while introducing a bounded asynchronous reader.
Proposed interface: `readJsonRpcHttpResponse(response: Response, options: { expectedId: string | number; maxBytes: number; maxFrameBytes: number; signal?: AbortSignal }): Promise<Record<string, unknown>>`. Gateway supplies its actual request id and retains the existing 32 MiB total limit and 30-second request budget. Set maxFrameBytes to the same 32 MiB for screenshot compatibility; no arbitrary smaller limit is imposed on existing images.
- Decode UTF-8 incrementally and maintain line/frame state across LF, CRLF, CR and chunk boundaries. Commit an event only at a real frame terminator; an EOF-only unfinished event is incomplete, not an invented response.
- Validate a matching response as jsonrpc=2.0, same id type/value, and exactly one of result/error. A matching error is a failure, not success; an unscoped protocol error with id=null must fail explicitly. Ignore legitimate progress/notification or other-id frames within the byte/deadline budget, never treating result-like notification params as the response.
- Return the first complete matching response. Cancel/release only the owned body reader in finally, once, on early return/abort/overflow/error. No second tools/call after timeout and no automatic resumption/replay of device actions.
- Preserve plain JSON and bounded HTTP-error handling. Do not emit raw response text, credentials or images into diagnostics. Reuse native sanitization and correlation IDs.
- Preserve the gateway protocol version in use. Do not silently adopt a newer MCP transport version, session rules or cancellation meaning while borrowing a byte-decoding mechanism.
- The upstream buffering/tee implementation is not itself a memory bound. Enforce total bytes before accumulation, frame bytes before appending, and retain no unbounded event history.

```text
POST exactly once -> Response
  JSON: bounded read -> validate expected response
  SSE: bounded chunk -> line state -> complete frame -> parse envelope
      notification / other id -> continue within original budget
      matching result -> return; matching error -> fail
  finally -> cancel/release owned reader; never resend tools/call
```

### TS7-P1 tasks and acceptance after selection
- [x] TS7.1: add real ReadableStream fixtures that split bytes and keep the stream open after emitting a final event; establish the current failure without running a Phone command.
- [x] TS7.2: implement the incremental reader plus correlation validation, then route GatewayTransport.call through it while preserving one-attempt semantics.
- [x] TS7.3: exercise the matrix below, the existing fourth-wave networking tests and selected compiler closure; record source versus compiled-candidate evidence separately.
- [x] TS7.4: update this plan, CODEBASE and canonical memory with actual results; do not replace active dist as part of qualification.

| Case | Required result |
| --- | --- |
| Valid result followed by an open stream | Promise settles before EOF; owned reader cancellation is observed once. |
| One-byte chunks, split emoji and CRLF boundary | Same decoded JSON result as an unsplit valid frame. |
| Other id then correct id | Only the matching response is returned. |
| Only unrelated responses; EOF | Explicit matching-response-not-found failure, not another operation result. |
| Progress notification containing result-like params | Not accepted as a response. |
| Missing/wrong jsonrpc, both result and error, invalid id | No success; bounded protocol failure. |
| Multiline data, comments, CR-only, multiple frames | Existing supported framing retained without full-body buffering. |
| Frame/total byte overflow and caller abort | Stops reading, cancels once, releases lock, no request replay. |
| Plain JSON response/error and non-2xx body | Correlation and HTTP failure behavior stay bounded and sanitized. |
| Complete event then incomplete trailing frame | Complete matching result wins; trailing partial data cannot replace it. |

**Prerequisite honesty:** the audit found `src/net/bounded-response.ts` missing while gateway still imports it and surviving dist exists. This is pre-existing current-line source loss, not an implemented reader to invent. At execution, inspect the selected build closure and reconstruct only an explicitly approved necessary source prerequisite from trusted current-line evidence; never quietly restore the whole project or legacy source. No such recovery is performed now.
**Rollback:** gateway/parser changes and matching compiled artifacts only; keep TS4/TS5 behavior, device state, auth and memory unchanged. This normally warrants a patch intent when implemented.

### TS7-P2 — Session/generation-safe Semantic IDE freshness invalidation
**Goal:** clearing or replacing an LSP session must prevent an earlier in-flight scan from notifying the old session, restoring a cleared snapshot, or being joined by the new session.
**Architecture:** apply the already-native owner/generation pattern to WorkspaceFreshnessCoordinator. This is a narrow lifecycle correction inside the existing sibling capability, not a credential cache, global lock, execution gate or background retry system.

| Exact source | What is supported |
| --- | --- |
| Reference `src/lib/credentials/token-cache.ts:74-130` | Distinguishes forced invalidation and shared pending refresh. Its completion callbacks are not generation-safe; do not transplant them unchanged. |
| Python supporting reference `_cache.py:237-332` | Explicit owner/waiter and invalidation-aware publication discipline. It is supporting design evidence, not a ready-made LSP session algorithm. |
| Native `src/semantic-ide/freshness.ts:46-70,74-185` | Key is provider-id/root; pending promise captures a session. clear removes snapshots/recent but not pending work. finally deletes by key without owner identity. |
| Native `src/semantic-ide/service.ts:516,552,1142,1400` | Reload, close, restart and post-refactor paths really call freshness.clear; this has current lifecycle consumers. |

**Source-derived race:** scan A is awaiting enumeration; clear(root) removes its cached state; new session B calls reconcile and joins A because inFlight still contains the old promise. A can later write recent/snapshots or send old-session notifications. TS6-P1 solved this publication class for CI health, not this coordinator. No new race reproduction was executed in this audit.

### TS7-P2 design / tasks
Modify `src/semantic-ide/freshness.ts`; change service call sites only if needed to supply the existing concrete session identity. Add `tests/semantic-ide-freshness-generation.test.ts`. Keep reconcile and clear public signatures compatible.
Use a root/provider epoch plus an owner object `{ epoch, session, promise }`. Same-root callers may join only the same live session/epoch owner. An explicit clear invalidates that epoch, removes pending ownership immediately and clears matching recent/snapshots; a new session never joins the old owner. Epoch tokens must not be reused after clear-all.
Check owner/epoch immediately after awaiting the scan, before each notification/cache mutation and after awaited bind/close actions. Superseded results return degraded with `SEMANTIC_FRESHNESS_SUPERSEDED`; do not publish them as fresh or loop until success. Keep a bounded one-scan outcome.
Finalization removes pending only when the stored object is the completing owner. Closing a service does not allow a completion callback to restart a language server. Cache reuse must also require the same session identity.
- [x] TS7.5: control enumeration with deferred promises and establish scan-A / clear / session-B races through the real coordinator; assert notification target, pending ownership and final snapshot, not just resolved Promises.
- [x] TS7.6: implement the epoch/session owner checks without changing PY6 completeness or delivered-event commit behavior.
- [x] TS7.7: verify old success after new success, old failure while new pending, clear-all, root-only clear, restart/close, same-session coalescing and different-root independence.
- [x] TS7.8: compile and record only the selected closure; synchronize result documentation/memory and leave activation explicit.

```text
reconcile -> reuse only matching session + epoch
clear(root) -> replace epoch token; release pending ownership; erase that root cache
await scan -> require still-current owner before effects
finally -> delete pending only when pending[key] is this owner
superseded -> degraded return, zero new old-session effects, no autonomous retry
```

**Coordination:** TS7-P2 and PY7-P1 both touch freshness.ts. When selected together, implement session/epoch ownership first, then layer stamp evidence onto that owner; run both matrices together without reverting PY6/TS6/S5. Either proposal remains independently selectable.
Proposed commands after selection, not executed now:
```powershell
& '.\runtime\node\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/mcp-streaming-response.test.ts tests/anthropic-sdk-fourth-wave.test.ts
& '.\runtime\node\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/semantic-ide-freshness-generation.test.ts tests/semantic-ide-freshness.test.ts tests/semantic-ide-scan-completeness.test.ts
```
**Tradeoffs:** one invalidated request may receive degraded rather than a stale success. No claim of measured latency/memory improvement is made. Notifications already sent before invalidation cannot be undone; the guarantee applies to later effects after the invalidation is observed.
**Rollback:** selected coordinator/service lifecycle code and compiled candidates only, not user edits or snapshots from unrelated roots.
- [x] Select TS7-P1 and its listed verification.
- [x] Select TS7-P2 and its listed verification.
- [ ] Reject either proposal with its ID and reason.

**Attribution:** the local reference LICENSE was read; retain its Anthropic copyright/permission notice for substantial reuse. No SDK dependency is added.

### Coverage and disposition
Exact checkout `3c5d9c0c15bb847a628f3f2876ac09719abe3012`: 728 tracked files/20 locally available remote refs, 728 regular files hashed, 500 code-suffix files including test/example/adapter code. No fetch. Inventory is not exhaustive semantic review of every branch.
Core request/retry/body replay, completed SSE framing, abort-listener teardown, structural result decoding and observation are already covered by previous waves. Streaming byte/event lifetime and the separate coordinator invalidation consumer supply the new proposals. Credential/OIDC/token-expiry policies, lease workers and external memory remain conditional; generated API surfaces, hosted-model runners, middleware model fallbacks and package-specific adapters do not justify another Agent Core runtime. Raw SDK error logging and unbounded tee buffers are explicitly not adopted.
**Disposition: RETAIN — NOT ZERO-VALUE.** Concrete current-consumer proposals remain; zero native path dependencies does not prove reference retirement. Evidence: `runtime/tmp/four-repo-regrounding-20260922/`. No product installation, test suite, build, restart, release or checkout deletion occurred.


### Wave7 approved execution result — 2026-09-22

**IMPLEMENTED — CANDIDATE QUALIFIED WITH EXPLICIT SKIPS — NOT ACTIVATED.**

TS7-P1 is wired through the actual GatewayTransport.call: bounded incremental correlated response consumption, a single non-idempotent send, no raw body echo and owned-reader cleanup. Its 22 new synthetic-stream/gateway cases pass without sending a Phone action. TS7-P2 binds concrete sessions and epoch owners through scan/side-effect/cache boundaries; its eight new cases pass. The existing buffered parser remains available.

Selected native source and compiled runs each report 172 PASS / 0 FAIL / 6 host SKIP or explicit exclusions from 178 cases, including 57 new passing cases. They are two executions of the same case set. Strict selected TypeScript 6.0.3 compilation has zero diagnostics; 36 candidate modules include 11 differences from installed runtime and 25 byte-identical dependencies. Missing unselected dependency source used installed unchanged JavaScript only through recorded isolated test configuration. No full-root rebuild is claimed.

Evidence: runtime/tmp/wave7-adoption-20260922/execution-summary.json, g29-candidate-acceptance.json, legacy24-comparison.json, provider-source-delta.json, final-integrity.json and docs-memory-readback.json. Consolidated report: docs/Wave7-Adoption-Execution-20260922.md. Scoped backup: runtime/backups/wave7-adoption-20260922. Canonical memory: 1b2416e6-d8e3-4964-bf29-6e2775ed196f.

Historical candidate qualification ended before production installation. Its activation item is now CLOSED by the 2026-09-23 readback below. Earlier test/skip/failure evidence is retained; conditional unselected families remain unselected.


### Production activation and installed-runtime readback — 2026-09-23

**COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS.** The user approved activation; 24/24 selected artifact hashes now match the qualified build, with 27 preserved dependency/package/launcher hashes unchanged. Installed-dist tests: 172 PASS / 0 FAIL / 6 unchanged host SKIP-excluded of 178 cases; all 11 modified programs are present in loaded-module provenance.

Node Core PID 5600 started after installation; Core HTTP200/ok, Execution/Memory/Learning available, Grafel available/current with zero issues. Fresh installed-provider MCP handshake retains all 22 input schemas; live code_orient status/search succeed. No manual user action or OAuth reset was needed. G29/G30 build is installed, not merely staged.

Six unverified native host cases and the three pre-existing managed-language-provider issues remain explicit; no language-server repair or whole-root recovery is claimed. Prior candidate-only graph 24/24 and old-baseline matrix 23/24 remain separate historical qualification results.

Report: docs/Wave7-Activation-20260923.md. Evidence: runtime/tmp/wave7-activation-20260923/. Backup: runtime/backups/wave7-activation-20260923/. Canonical activation memory: 561784e7-96b0-4b24-964a-940751b5e86e. OPEN activation items for this selected scope: NONE. No release apply, version bump, commit, push or reference retirement occurred.

## Five-reference source-first re-grounding — 2026-09-25

**Status: PREVIOUS TS WAVES CLOSED/LIVE — NO NEW CURRENT-FIT INSTALLATION — CONDITIONAL CREDENTIAL/LEASE REFERENCE RETAINED.**
The requested checkout remains clean at `3c5d9c0c15bb847a628f3f2876ac09719abe3012`. TS6/TS7 and earlier transport/result/cancellation waves remain closed/live and were excluded from candidate discovery.

Direct source readback reconfirmed three residual families: `credentials/token-cache.ts` proactive advisory/mandatory refresh and single-flight invalidation; `credentials/credential-chain.ts` plus `oidc-federation.ts` deterministic credential/OIDC resolution; and `lib/environments/worker.ts` heartbeat-TTL/lost-lease ownership with abort-on-lease-loss and no stale-owner finalization. Current Agent Core exposes no OIDC/federation/workload-identity contract and no distributed claimed-work heartbeat-TTL consumer.

These families remain **conditional**. Do not create a background worker/credential layer until a real native owner needs those semantics. Existing local ProcessLedger is not a distributed lease and must not be expanded merely to consume this reference.

**Disposition: RETAIN — NOT CORPSE.** No new current-fit immediate proposal was found at this fixed revision.
Evidence: `docs/Five-Reference-Conditional-Regrounding-20260925.md`.

## Approved conditional execution closure — 2026-09-25

**APPROVED — CONDITIONAL TOKEN-CACHE / OIDC / LEASE-WORKER FAMILIES DORMANT — REFERENCE RETAINED.**
The user approved the plan. Current Agent Core still has no matching outbound credential provider, OIDC/workload-identity owner, or distributed claimed-work heartbeat/TTL consumer. Installing these abstractions now would create unused ownership, so they remain dormant until a concrete native consumer appears. No Anthropic SDK dependency/runtime or helper tool was installed.
