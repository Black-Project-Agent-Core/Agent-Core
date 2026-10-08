# Provider Credential Rotation Grounding — 2026-10-02

Status: **HISTORICAL GROUNDING — FOLLOWED BY IMPLEMENTATION AND RECORDED RESIDENT ACCEPTANCE.** See the [persistent credential rotation execution plan](history-agent-core/Agent-Core-Persistent-Credential-Rotation-Plan-20261002.md). Current source includes [PersistentCredentialScheduler](../src/agent-provider-scheduler.ts) and SQLite-backed [ProviderStateStore](../src/agent-provider-state.ts); the process-local gap below describes the pre-implementation checkpoint, not current architecture. No new credential/runtime inspection was performed during the 2026-10-08 documentation review.

## 1. Scope and user intent

This grounding covers only the provider/credential operational mechanisms needed before Agent Core's interactive native AI chat is built.

The user's requirement is **not AI Memory**. It is deterministic internal runtime state persistence, analogous to a game restoring a player's last position after reconnect.

Required behavior:
- multiple providers and multiple credentials per provider;
- rotate to another eligible credential on rate-limit/quota/provider/account errors;
- preserve the logical rotation position across Agent Core shutdown/restart;
- persist absolute cooldown/reset timestamps and automatically re-qualify credentials after expiry;
- distinguish transient rate limits, quota exhaustion, auth/permission faults, model-level faults, and upstream/server faults;
- never require an AI model to choose, remember, or schedule raw API keys;
- keep secrets separate from operational routing state and avoid secret leakage to logs, Memory, or learning artifacts.

The three protected checkouts are donor/reference material only. No dependency install, runtime execution, source import, or Agent Core wiring is authorized by this grounding.
## 2. Current Agent Core gap

Current source authority is src/agent-provider.ts, src/config.ts, and src/agent-runtime.ts.

OpenAICompatibleProviderPool already supports ordered named routes and multiple API keys, but its rotation state is process-local:
- private readonly keyCursor = new Map<string, number>();
- nextKey() increments that cursor in RAM;
- the cursor is lost when Agent Core stops;
- failed attempts are collected as strings, but there is no durable per-key cooldown/quota/health state;
- there is no error taxonomy that decides key-level vs model-level vs provider-level suppression.

src/config.ts already loads numbered provider credential slots for Atria, Gonka, and OpenRouter, so provider/key enumeration groundwork exists.

AgentRuntimeService already owns durable runtime\agent-runtime\state.json, atomic writes, and serialized mutations, but provider-pool operational state is currently outside that durable state.

Therefore the concrete missing subsystem is a **deterministic persistent provider/credential scheduler**, not another Memory or learning subsystem.

## 3. Donor identity

- 9Router: decolua/9router, commit a99cf57239ff778b61e434c2786009d5ed1c412c, MIT.
- OmniRoute: devolkus/omniroute, commit ea0cdc559ccc087d723f311a4217598cee4bb2b8, MIT.
- FreeLLMAPI: leiworm/freellmapi, commit cc886c7c0be48731f7be10ab6bb42563e936f3b5, MIT.

Grounding is source-first at these exact revisions.
## 4. 9Router findings

Primary source:
- src/sse/services/auth.js
- open-sse/services/accountFallback.js
- open-sse/config/errorConfig.js
- src/lib/db/repos/connectionsRepo.js

### 4.1 Durable round-robin without a numeric cursor

9Router's useful account-level round-robin reconstructs position from persisted usage metadata rather than persisting an integer cursor.

getProviderCredentials():
- reads eligible provider connections from SQLite;
- sorts by lastUsedAt;
- stays on the most-recent connection until stickyRoundRobinLimit;
- otherwise selects the least-recently-used connection;
- persists lastUsedAt and consecutiveUseCount before returning the credential;
- uses a selection mutex to avoid simultaneous selection races.

This naturally resumes after restart because selection state lives on connection rows.
### 4.2 Durable cooldown/fallback state

checkFallbackError() classifies configured text/status errors and returns fallback/cooldown decisions.

Persistent connection state includes:
- rate-limit/model-lock expiry timestamps;
- backoff level;
- last error/code/time;
- lastUsedAt;
- consecutiveUseCount.

Model-specific locks are written as absolute timestamps and are checked against current time. Expired locks become eligible without requiring a continuously running timer.

If all connections are locked, selection can return the earliest retry time instead of looping blindly.

### 4.3 9Router cautions

The source stores several credential/usage values directly in its local DB structures, including API-key-related values in usage history. This is not an acceptable security design to copy into Agent Core.

Its error taxonomy is useful but comparatively coarse. Long-lived 401/402/403/404 treatment is mainly fixed cooldown/backoff and needs stronger separation between invalid credential, exhausted credit, model access, and provider/server failures.

**Use from 9Router:** persisted lastUsedAt/consecutiveUseCount, LRU-style restart-safe rotation, selection serialization, absolute model/account locks, earliest-retry calculation.

**Do not copy:** raw-key-oriented persistence/logging or the donor's exact credential storage model.
## 5. OmniRoute findings

Primary source:
- src/sse/services/auth.ts
- src/lib/db/providers.ts
- src/lib/credentialHealth/scheduler.ts
- src/lib/monitoring/providerHealthAutopilot.ts
- open-sse/services/accountFallback.ts
- src/sse/services/cooldownAwareRetry.ts
- open-sse/services/apiKeyRotator.ts

### 5.1 Rich persistent connection state

provider_connections persists operational fields including:
- last_used_at, consecutive_use_count;
- rate_limited_until, backoff_level;
- error code/type/source/time;
- health-check and test state;
- quota/rate-limit overrides and concurrency data.

touchConnectionLastUsed() is a lightweight hot-path DB update specifically designed for credential selection.
### 5.2 Restart-safe account rotation

The main auth.ts round-robin path uses persisted lastUsedAt and consecutiveUseCount, not a process-local numeric cursor.

It also:
- switches directly to LRU selection during fallback so a just-failed account is not sticky-selected again;
- penalizes higher backoffLevel;
- auto-decays stale backoff after rateLimitedUntil expires;
- supports least-used, P2C, random, strict-random, cost-oriented, affinity, and other routing modes.

For the user's requirement, the persisted LRU/sticky round-robin path is the relevant donor, not every strategy.

### 5.3 Error taxonomy and reset-aware cooldown

accountFallback.ts distinguishes AUTH_ERROR, QUOTA_EXHAUSTED, RATE_LIMIT_EXCEEDED, MODEL_CAPACITY, and SERVER_ERROR.

Provider-specific rules may override generic status rules. It parses Retry-After and rate-limit reset headers and can preserve exact upstream reset windows.

The source distinguishes connection-, model-, and provider-scoped suppression in multiple paths instead of treating every failure as a dead API key.
### 5.4 Concurrency and recovery safety

OmniRoute has provider-scoped credential-selection mutexes and per-connection anti-thundering-herd protection.

clearConnectionErrorIfUnchanged() uses compare-and-set style guards over error/cooldown state so a stale recovery path cannot erase a newer concurrent failure.

This is strong donor material for Agent Core's scheduler integrity.

### 5.5 OmniRoute cautions

open-sse/services/apiKeyRotator.ts is **not** suitable as the primary Agent Core design:
- its _keyIndexes map is explicitly RAM-only;
- the source explicitly says rotation index resets on process restart;
- extra keys are represented as plain strings in providerSpecificData.extraApiKeys.

Although key-health state can be synchronized to DB, this helper violates the user's restart-position requirement and should not be transplanted.

OmniRoute's main provider-connection persistence does encrypt credential fields before DB write. That separation is closer to the Agent Core security boundary.

**Use from OmniRoute:** durable account-level selection metadata, refined error/scope taxonomy, exact reset hints, auto-decay, CAS recovery, provider-scoped mutexes, health scheduling.

**Reject as direct donor:** RAM-only apiKeyRotator cursor and plain extra-key representation.
## 6. FreeLLMAPI findings

Primary source:
- server/src/services/router.ts
- server/src/services/ratelimit.ts
- server/src/services/provider-quota.ts
- server/src/lib/error-classify.ts
- server/src/db/migrations.ts
- server/src/lib/crypto.ts

### 6.1 Strong durable cooldown/quota ledger

SQLite persists:
- encrypted API-key records;
- rate_limit_usage;
- rate_limit_cooldowns;
- provider_quota_state;
- provider_quota_observations.

setCooldown() writes an absolute expiry to DB. isOnCooldown() reloads persisted expiry, clears expired rows, and therefore survives restart without a live timer.

Request/token counters are persisted and used for RPM/RPD/TPM/TPD preflight checks.
### 6.2 Quota observation

FreeLLMAPI parses provider quota/rate-limit headers and persists observations keyed by platform, credential ID, quota pool, and metric.

It tracks:
- limit and remaining values;
- reset timestamps;
- Retry-After;
- source/confidence;
- provider/model/account context.

It can learn a more conservative provider limit from an upstream error body and persist the lower limit.

### 6.3 Useful error classification

error-classify.ts separates retryable/failover-worthy conditions from fatal/request-specific conditions and distinguishes rate limiting, payment/credit exhaustion, model removed/not found, model access forbidden, transport/server failures, and request/payload cases where another route may succeed.

### 6.4 FreeLLMAPI gap against the user's exact requirement

router.ts uses const roundRobinIndex = new Map<string, number>().

That cursor is process-local. Cooldown/quota state survives restart, but the key rotation position does not.

Its escalating cooldown hit history is also partly RAM-only, although daily usage counters are durable.

**Use from FreeLLMAPI:** encrypted secret storage pattern, durable cooldown table, durable quota/usage ledgers, Retry-After handling, provider quota observations, error taxonomy.

**Do not copy unchanged:** RAM-only round-robin index or any state explicitly documented to reset on restart.
## 7. Comparative result

| Requirement | 9Router | OmniRoute | FreeLLMAPI | Agent Core current |
| --- | --- | --- | --- | --- |
| Multiple keys/provider | Yes | Yes | Yes | Yes, config slots |
| Restart-safe rotation position | **Yes via persisted last-used state** | **Yes via main connection selection** | **No, RR cursor RAM-only** | **No, keyCursor RAM-only** |
| Persistent cooldown expiry | Yes | Yes | **Yes, explicit DB table** | No |
| Exact Retry-After/reset | Partial/provider-specific | **Strong** | **Strong** | No |
| Persistent quota observations | Partial/provider-specific | Strong | **Strong explicit ledger** | No |
| Error taxonomy | Moderate | **Strong/scoped** | **Strong** | Generic request failure only |
| Concurrency protection | Global selection mutex | **Provider + connection scoped** | Limited in routing path | None in key cursor |
| Automatic expiry eligibility | Yes | **Yes + backoff decay** | Yes | No |
| Credential encryption | Not suitable to copy | **Yes** | **Yes** | Env-only today |
| Avoid raw secret in operational state | Not reliably | Better separation | Better separation | Not yet applicable |

No single donor should be transplanted wholesale.
## 8. Proposed Agent Core-native design — proposal only

The strongest composite design is:

1. **Credential Secret Store**
   - raw keys encrypted or resolved from protected configuration;
   - referenced by stable credentialId;
   - never written into Memory/Learning/tool-history/error text.

2. **Persistent Credential Scheduler State**
   - separate from AI Memory and learning;
   - contains only credential IDs and operational metadata;
   - absolute timestamps, never countdown timers that require a live process.

3. **Restart-safe rotation derived from durable usage state**
   - prefer persisted lastUsedAt + consecutiveUseCount/sequence over a RAM-only numeric cursor;
   - deterministic tie-breaker by configured priority and stable credential ID.

4. **Cooldown/quota ledger**
   - per credential/provider/model/quota-scope state;
   - cooldownUntil / resetAt;
   - Retry-After and provider-reported reset timestamps;
   - optional request/token rolling usage ledger.
5. **Typed failure state machine**
   - request-invalid: do not punish credential;
   - auth-invalid/revoked: disable or quarantine credential pending explicit recovery;
   - rate-limit: temporary cooldown;
   - quota/credit exhausted: reset-aware or long unavailable state;
   - model-level access/not-found: suppress that model/scope without killing the whole credential when appropriate;
   - transient upstream/server/transport: bounded retry/failover without permanent disable.

6. **Concurrency control**
   - provider/pool-scoped selection serialization;
   - per-credential failure-update serialization or compare-and-set guards;
   - later add bounded leases/in-flight counters if parallel native-agent requests require them.

7. **Recovery semantics**
   - on startup/request, load persisted scheduler state;
   - expired absolute cooldowns become eligible lazily;
   - no background AI and no always-running timer required;
   - state continues from the last durable selection position.

8. **Observability without secret exposure**
   - credential IDs/masked labels only;
   - reason, scope, cooldown/reset, attempt/outcome;
   - no raw API key in Activity, Memory, Learning, or provider errors.
## 9. Recommended donor mapping

- **Rotation continuity:** 9Router + OmniRoute persisted lastUsedAt / consecutiveUseCount.
- **Cooldown persistence:** FreeLLMAPI explicit cooldown ledger + OmniRoute connection state.
- **Quota/reset intelligence:** FreeLLMAPI quota ledger + OmniRoute provider-specific reset handling.
- **Failure taxonomy:** OmniRoute first, FreeLLMAPI complementary.
- **Concurrency/recovery safety:** OmniRoute provider mutex + CAS clear.
- **Secret handling:** OmniRoute/FreeLLMAPI patterns; do not inherit 9Router's raw-key-oriented usage persistence.

## 10. Boundaries before implementation

This document does **not** authorize implementation.

Before source mutation:
- define the Agent Core-owned scheduler/state owner and persistence format;
- decide whether provider operational state lives in a dedicated SQLite store or a narrowly scoped atomic state file;
- define migration from current env-numbered keys without ever copying secrets into non-secret state;
- define public/native-runtime health and diagnostics without exposing credentials;
- define targeted tests for restart continuity, cooldown expiry, error scope, concurrent selection, and secret redaction;
- structurally review any changed provider/runtime signatures and wiring with current Grafel evidence.

Interactive Agent Core chat should be built **after** this provider/credential substrate is resident and verified, so the AI agent consumes reliable model invocation rather than implementing key management itself.
