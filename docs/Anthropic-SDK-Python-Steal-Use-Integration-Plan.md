# Anthropic SDK Python — Steal/Use Integration Plan

**Status:** FOURTH WAVE COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — CONDITIONAL RESIDUALS RETAINED
**Reference:** `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\anthropic-sdk-python`
**Pinned audit revision:** `7e5ca5c94126a6d7de159a169ff43eb9b1cac57f`
**License:** MIT
**Authority:** current Agent Core source/runtime outranks this reference.

## 1. Purpose

This plan is the source-first re-grounding of the Anthropic Python SDK after the 2026-09-20 recovery.
It preserves the already-shipped Anthropic-derived hardening separately from any new proposal.
No Python SDK runtime, model provider, agent loop, or second execution framework is authorized by this document.
New work remains proposal-only until the user selects it.

## 2. Grounding method

- Inspected executable source and tests, not README claims as authority.
- Inspected transport, middleware, retry, credentials/cache, environment worker, session/tool runner, memory sync, MCP adapters, FileStore, scoped client, and generated resource surfaces.
- Cross-checked exact Agent Core source in `src\net`, `src\security`, `src\persistence`, OAuth, MCP, Memory, Learning, Partner, Semantic IDE, Grafel, and internal machine control.
- Used request-scoped Grafel indexing only as structural evidence; exact source remains final authority.
- Checked Git revision/origin and test families; temporary audit markers must be removed after grounding.

## 3. Existing shipped scope — preserve, do not reimplement

The earlier approved wave is **IMPLEMENTED — LIVE-ACTIVATED — TARGETED VERIFIED**:
- safe/idempotent outbound retry classification, jitter/backoff, Retry-After handling;
- bounded response/file/PDF consumption;
- HTTPS-or-loopback credential endpoint policy;
- Agent Core-owned child environment secret isolation;
- sensitive-file validation and atomic credential persistence;
- correlation-safe provider diagnostics and expanded secret redaction;
- read-only `release:compat` compatibility evidence.

Existing release intent `.changeset/20260920031739-4d499b.md` remains the release record for that shipped wave.
Do not duplicate these mechanisms from Python source.

## 4. Exhaustive source-family disposition

| Source family | Source-backed mechanism | Current Agent Core disposition |
|---|---|---|
| `_base_client.py`, `_request.py`, `_retry.py` | retry/error/timeout/request lifecycle | ALREADY ADOPTED in `src/net`; no second client stack |
| `_middleware.py` | per-attempt middleware inside retry loop | shared concept re-evaluated in the TypeScript SDK plan; do not add Python runtime |
| credentials `_chain.py` / `_cache.py` | precedence, expiring token cache, single-flight refresh | CONDITIONAL; no current expiring outbound credential provider consumer |
| credentials workload/OIDC/user OAuth | federation/profile credential providers | DEFER; no present Agent Core requirement |
| environments `_poller.py` / `_worker.py` | leased work polling, heartbeat, loss-of-lease discipline | CONDITIONAL on a future distributed work queue |
| tools `_beta_session_runner.py` | stream reconciliation, confirmation gate, bounded drain/send retry | REJECT as Agent Core execution layer; outer controller/user authorization remains authority |
| tools `_beta_runner.py` / tool dispatch | internal LLM tool loop | REJECT; Agent Core is a tool host, not a hidden model runner |
| memory sync | two-pass remote/local synchronization and deletion discipline | CONDITIONAL only if Agent Core ever adds an explicit external memory sync target |
| `_file_store.py` | confined regular-file store, symlink refusal, atomic temp replace, hashtree cache | MOSTLY OVERLAP with current filesystem/sensitive-file/atomic primitives; no parallel FileStore |
| scoped client/helper auth | per-helper credential replacement and parent-auth stripping | SECURITY INVARIANT only; no separate client framework |
| MCP adapter helpers | convert MCP tools/results into Anthropic runner types | REJECT for runtime; Agent Core already owns MCP server/client boundaries |
| refusal fallback/model routing | model-specific fallback semantics | REJECT; Agent Core does not own controller model selection |
| generated API resources | Anthropic product API surface | REJECT as adoption source unless a future explicit Anthropic API feature is requested |

## 5. Conditional proposal PY3-C1 — expiring credential single-flight cache

**Disposition:** CONDITIONAL — DO NOT IMPLEMENT WITHOUT A REAL CONSUMER.

Steal the behavior, not the SDK class:
- fresh token returns immediately;
- advisory refresh window may serve still-valid cached token while one background refresh runs;
- mandatory window blocks on exactly one in-flight refresh;
- failed advisory refresh backs off and keeps the still-valid token;
- failed mandatory refresh fails closed;
- invalidation forces the next provider call to bypass lower cache layers;
- late refresh results must not overwrite a newer invalidated/replaced token.

Activation condition: Agent Core gains an outbound provider with genuinely expiring bearer credentials.
Do not apply this to Agent Core's own issued OAuth grants merely to create abstraction.

## 6. Conditional proposal PY3-C2 — lease-aware worker lifecycle

**Disposition:** CONDITIONAL — DO NOT IMPLEMENT WITHOUT A DISTRIBUTED WORK QUEUE.

Reusable semantics:
- claim/lease is established before expensive setup;
- heartbeat extends ownership and exposes remaining TTL;
- loss-of-lease stops ownership-sensitive follow-up work;
- one failed item does not kill the polling worker;
- result-send retry budget must not outlive the lease;
- opaque work secrets are never logged and per-item credentials do not inherit parent auth.

Do not transplant `EnvironmentWorker`, poller threads, or Anthropic session APIs.

## 7. Conditional proposal PY3-C3 — external memory sync discipline

**Disposition:** CONDITIONAL — NOT FOR CURRENT CANONICAL MEMORY.

If an explicit external memory replica is ever approved, reuse these principles:
- two-pass observation before destructive deletion;
- keep-only-copy protection;
- bounded final flush;
- folder trust / symlink discipline;
- reconciliation treats the canonical owner as explicit, never inferred.

Current file-native MemoryService remains the sole canonical memory authority.

## 8. Rejected/deferred families

- full Anthropic Python dependency/runtime;
- hidden LLM/controller, tool runner, session runner, managed-agent runtime;
- model refusal fallback and compaction ownership;
- Anthropic Memory Stores as a replacement for MemoryService;
- Anthropic Skills as a replacement for Grafel Patterns/Learning;
- provider-specific Bedrock/Vertex/Azure adapters without explicit product need;
- generic background worker/daemon with no current queue;
- duplicate filesystem store or credential database.

## 9. Targeted verification — COMPLETE

Authorized verification now covers:
- safe + idempotent transient retries and non-idempotent one-attempt behavior;
- Retry-After-driven retry timing;
- bounded response-body limits;
- HTTPS-or-loopback credential endpoint policy;
- owned-child and machine-shell secret environment boundaries;
- non-regular sensitive-file rejection;
- atomic owned-file writes plus OAuth atomic exchange rollback/concurrency;
- Agent Core token/credential redaction and correlation-ID handling;
- `release:compat` read-only compatibility evidence.

Evidence: TypeScript build PASS; `tests/anthropic-sdk-third-wave.test.ts` 13/13 PASS; `tests/atomic-owned-file.test.ts` 2/2 PASS; `tests/oauth-atomic-exchange-review.test.ts` 3/3 PASS; `release:compat` reports 62→62 tools, no tool/route removal, no breaking evidence, no verification issues.

## 10. Retirement rule for Python reference

The Python checkout is **not corpse yet** because PY3-C1/C2/C3 remain source-backed conditional mechanisms even though the shipped hardening is now targeted-verified.
Retire/delete only when:
1. each conditional mechanism is either implemented through a real consumer or explicitly rejected;
2. final dependency scan finds no active import/runtime dependency on the checkout;
3. provenance/accept-reject evidence remains in this plan and durable memory.

## 11. Current conditional disposition

The user approved the plan, but PY3-C1/PY3-C2/PY3-C3 remain dormant because their explicit activation conditions are not present in current Agent Core.
Approval does not override those architecture guards: no expiring external credential consumer, distributed lease queue, or approved external memory replica means no abstraction-only implementation.

## 12. Final zero-value census — 2026-09-20

Final re-check found zero active Agent Core runtime/import dependency on this checkout, but the checkout is **NOT CORPSE**.
It still contains source-backed behavior not currently represented by an Agent Core consumer:
- richer expiring-token single-flight semantics, including forced refresh after invalidation/401, advisory-failure fallback/backoff, waiter release on arbitrary provider failure/cancellation, and protection against late stale refresh repopulation;
- workload/OIDC/user credential precedence and fail-closed federation behavior;
- lease-loss/heartbeat worker semantics tied to ownership TTL;
- conflict-safe external memory synchronization with marker trust, corroborated/capped deletion, only-copy protection, and bounded final flush.

These mechanisms are not installed because current Agent Core has no expiring external bearer-token consumer, distributed leased work queue, or approved external canonical-memory replica. Absence of a consumer is an activation guard, not evidence that the source has zero value.

**Retirement decision:** RETAIN. Do not delete this checkout yet.

## 13. Fourth-wave source-first re-grounding — 2026-09-20

This pass re-indexed the exact protected checkout and re-read handwritten core/lib/tools source, tests, and recent Git history. The request-scoped Grafel graph reached current at 20,304 entities / 136,340 relationships. Git authority stayed at `7e5ca5c94126a6d7de159a169ff43eb9b1cac57f`; no runtime import/dependency from active Agent Core was found.

New source-backed current-fit contribution:

### PY4-P1 — race-bound regular/sensitive-file reads
**Recommendation:** REVIEW / APPROVE JOINTLY WITH TS4-P4.

Python `lib/tools/_file_store.py` binds regular-file validation to the opened handle, refuses symlink/special-file reads, and uses atomic temp replacement. Current Agent Core sensitive reads perform `lstat` validation followed by a separate path read, and RDC config `followSymlinks:false` similarly pre-checks then opens by path. This leaves a path-swap window between validation and open.

Steal the invariant, not the Python store:
- validate the actual opened handle as regular;
- bind path identity before/after open so a symlink/reparse/path replacement cannot redirect a sensitive/config read;
- preserve existing size and POSIX permission checks;
- keep Windows as the primary runtime: project Node reports no `O_NOFOLLOW`, but real `lstat` and handle `fstat` expose matching nonzero `dev/ino`, so use a Windows-compatible identity strategy rather than importing POSIX flags;
- reuse Agent Core atomic persistence instead of adding a parallel FileStore.

Acceptance for PY4-P1:
- keys/OAuth/config reads validate the same file identity that is consumed;
- an ordinary regular file remains compatible;
- a symlink/reparse/path-swap attempt fails closed;
- non-regular files remain refused;
- size/permission semantics remain unchanged;
- no new dependency or Python runtime.

## 14. Conditional families — source evidence strengthened

### PY4-C1 — expiring external credential cache
Retain only for a future real external bearer-token consumer. In addition to the earlier advisory/mandatory windows, Python source/tests add:
- `expires_at == 0` per-request provider-cache semantics;
- arbitrary provider exception/cancellation must always release single-flight waiters;
- token-endpoint 401 gets one forced provider retry;
- forced refresh must not coalesce into an older non-forced refresh;
- a late pre-invalidation result must not repopulate the invalidated cache;
- legacy providers without a force-refresh parameter remain callable.

### PY4-C2 — external credential resolution
Retain only when a provider actually needs profile/OIDC/user OAuth:
- explicit/static credentials shadow auto-discovery;
- env-only federation avoids a disk token cache that could survive organization/workspace changes;
- identity-token environment values may be read fresh at exchange time;
- force-refresh bypasses disk freshness;
- cache write-back preserves unknown credential fields it does not own.

### PY4-C3 — lease-aware distributed work
Retain only if Agent Core gains a leased work queue:
- heartbeat begins before expensive setup/download;
- heartbeat request duration is bounded;
- HTTP 412 means ownership is lost and the old worker must not stop/mutate the item;
- transient heartbeat failure beyond the reported TTL becomes assumed lease loss;
- one failed item does not kill the polling loop;
- tool-result send retry budget is capped by live lease TTL;
- per-item short-lived credentials take precedence without logging secret material;
- teardown/memory flush remains inside the lease lifetime.

### PY4-C4 — external memory replica reconciliation
Retain only if an explicit external replica is approved. Source/tests additionally prove:
- metadata-first/content-second sync; unchanged stores move no content;
- local delete requires corroboration + re-check + per-pass cap;
- full folder wipe or marker loss triggers recovery, not remote mass-delete;
- swapped/untrusted folders neither upload nor delete;
- unpushed local edits survive remote deletion and may recreate the writable remote;
- read-only roots never push;
- refused content retries only after local content changes where appropriate;
- final sync and push-only rescue flush are bounded; one broken store does not prevent others.

## 15. Fourth-wave exhaustive disposition

Already covered or rejected after source comparison: exact-line-ending preservation, archive/symlink extraction safety, streaming/model event accumulation, pause-turn/container ownership, tool/session runners, confirmation gates, Anthropic model/refusal/compaction routing, Memory Stores/Skills as replacements, AWS/Bedrock/Vertex/Foundry/Google adapters, generated API resources, and a generic parallel FileStore. The current-fit MCP/SSE/outbound-stream proposals are owned by the TypeScript plan because Agent Core is Node/TypeScript.

**Fourth-wave retirement decision:** RETAIN. The checkout still carries unique cache race/cancellation evidence plus conditional lease/memory-sync behavior and therefore is not corpse. No new implementation is authorized until user review.

## 16. Fourth-wave implementation result — 2026-09-20

User approved the fourth-wave current-fit scope. PY4-P1 is implemented through Agent Core-owned TypeScript rather than Python runtime code:
- race-bound sensitive/config reads now consume the opened handle that was identity-checked against pre-open and post-open path state;
- Windows identity comparison uses BigInt `dev/ino` from `lstat(..., {bigint:true})` and handle `stat({bigint:true})`, because observed NTFS inode values exceed JavaScript safe-integer range;
- RDC no-follow config reads use the same identity-bound regular-file path;
- RDC config writes converge on `writeOwnedFileAtomic`, preserving the existing cross-process lock as the mutation authority.

No Python dependency/runtime was installed. PY4-C1/C2/C3/C4 remain dormant behind their original real-consumer activation conditions.

Verification evidence for the joint file-safety scope:
- root TypeScript build PASS;
- `tests/anthropic-sdk-fourth-wave.test.ts` 18/18 PASS;
- `tests/key-store.test.ts` 4/4 PASS;
- `tests/oauth-atomic-exchange-review.test.ts` 3/3 PASS;
- `tests/rdc-safe-regular-file.test.ts` 5/5 PASS;
- targeted bridge config/file operation PASS;
- atomic-owned-file regression had previously passed 2/2 and the shared atomic writer was not modified;
- live Node activation remains pending at this section's write time.

The first Windows file-symlink test attempt could not create privileged file symlinks (EPERM); verification was changed to Windows junction/reparse-point evidence rather than skipped. An initial number-based identity design also failed on real NTFS inode values above JS safe integer; BigInt identity corrected the implementation and the affected suites then passed.

## 17. Fourth-wave live activation — VERIFIED

The rebuilt Node Core is live:
- Node Core PID: `18268`;
- creation time: `2026-09-20 19:39:16 +07:00`;
- command: `<PROJECT_ROOT>\runtime\node\node.exe <PROJECT_ROOT>\dist\index.js`;
- live `/health`: `status=ok`;
- Memory available, Execution available, Phone available/online, Grafel available/current with issueCount 0, Semantic IDE available with issueCount 0, Learning available with issueCount 0;
- compiled `dist\security\file-identity.js` and `dist\security\sensitive-file.js` contain the BigInt identity-bound file-read implementation.

Hermes Partner separately reports `degraded` with `HERMES_API_SERVER_SOURCE_NOT_FOUND`; this optional subsystem state is independent from the Anthropic fourth-wave Node activation.

PY4-P1 is therefore COMPLETE / IMPLEMENTED / TARGETED VERIFIED / LIVE-ACTIVATED. Conditional PY4-C1/C2/C3/C4 remain retained and inactive until a real consumer exists.
