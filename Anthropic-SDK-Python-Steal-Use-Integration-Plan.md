# Anthropic SDK Python — Steal/Use Integration Plan

**Status:** RE-GROUNDED — PROPOSAL UPDATE — USER REVIEW REQUIRED — NO NEW IMPLEMENTATION
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

The earlier approved wave remains **IMPLEMENTED — LIVE-ACTIVATED — TARGETED VERIFICATION PENDING**:
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

## 9. Existing verification debt — separate from new proposals

The shipped Anthropic hardening must remain truthfully verification-pending until authorized targeted tests cover:
- retry classification and non-idempotent no-retry behavior;
- Retry-After bounds;
- bounded response/body/file behavior;
- endpoint safety;
- child-environment secret isolation;
- sensitive-file rejection;
- atomic durability/recovery;
- redaction/correlation safety;
- `release:compat` compatibility evidence.

Do not use new second-wave work to mask or reset this verification debt.

## 10. Retirement rule for Python reference

The Python checkout is **not corpse yet** because PY3-C1/C2/C3 remain source-backed conditional mechanisms and the prior shipped wave still has targeted verification debt.
Retire/delete only when:
1. targeted verification of the shipped wave is complete;
2. each conditional mechanism is either implemented through a real consumer or explicitly rejected;
3. final dependency scan finds no active import/runtime dependency on the checkout;
4. provenance/accept-reject evidence remains in this plan and durable memory.

## 11. User review gate

No new implementation is authorized by this re-grounding.
User may approve/reject PY3-C1, PY3-C2, PY3-C3 independently.
An approval does not override each proposal's activation condition: no consumer means no abstraction-only implementation.
