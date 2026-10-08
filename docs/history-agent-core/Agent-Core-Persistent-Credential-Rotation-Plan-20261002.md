# Agent Core Persistent Credential Rotation — Steal & Use Execution Plan
Date: 2026-10-02

Status: **RESIDENT ACTIVATED — BUILD + TARGETED ACCEPTANCE + BOUNDED REAL-PROVIDER ACCEPTANCE VERIFIED**

Primary grounding authority:
- docs\Provider-Credential-Rotation-Grounding-20261002.md

Protected donor references:
- DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\9router @ a99cf57239ff778b61e434c2786009d5ed1c412c
- DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\omnirouter @ ea0cdc559ccc087d723f311a4217598cee4bb2b8
- DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\freellmapi @ cc886c7c0be48731f7be10ab6bb42563e936f3b5

## 1. Goal

Build one Agent Core-owned deterministic credential-rotation substrate for Native Agent Runtime before interactive AI chat is treated as ready.

The scheduler must work independently of any AI model and must preserve operational continuity across shutdown/restart:

1. many providers;
2. many API keys per provider;
3. deterministic rotation;
4. exact restart continuation from the last durable rotation checkpoint;
5. skip keys that are cooling down, invalid, exhausted, or scope-blocked;
6. automatically re-qualify temporary cooldowns after their absolute expiry;
7. classify provider failures into credential/model/provider/request scope;
8. fail over to another key and, when appropriate, another provider;
9. persist only operational metadata, never AI Memory;
10. never expose raw API keys to Memory, Learning, logs, diagnostics, health, or runtime state.

Target mental model:

User/Native Agent
  -> Native Agent Controller
  -> OpenAICompatibleProviderPool
  -> Persistent Credential Scheduler
  -> Secret Resolver
  -> Provider endpoint

The AI requests a model completion. The scheduler, not the AI, chooses the credential.

## 2. Non-goals and boundaries

This plan does NOT:
- create the final interactive Agent Core chat UI;
- put cooldown/key state into Memory or Learning;
- let the model choose raw credentials;
- install or embed 9Router, OmniRoute, or FreeLLMAPI runtimes;
- copy donor code wholesale;
- move existing secrets out of protected environment configuration during the first implementation wave;
- add a second provider framework;
- add a new external dependency unless separately authorized;
- alter MCP machine-control ownership;
- run release:apply, commit, tag, push, publish, deploy, or restart automatically.

Initial secret authority remains the existing numbered environment slots. The first implementation wave changes the scheduler and operational state, not the credential-management UX.

## 3. Current Agent Core authority and exact gap

Current owner files:
- src\agent-provider.ts
- src\config.ts
- src\agent-runtime.ts
- src\agent-controller.ts

Current useful groundwork:
- OpenAICompatibleProviderPool already supports named provider routes;
- config already loads Atria, Gonka, and OpenRouter numbered API-key slots;
- provider calls already use one non-idempotent network attempt, so pool-level failover can remain the retry authority;
- AgentRuntimeService already demonstrates atomic durable state and serialized mutations.

Current blocker:
- OpenAICompatibleProviderPool.keyCursor is RAM-only;
- provider affinity is RAM-only;
- no durable credential cooldown/quota/error state exists;
- provider request errors are flattened into strings;
- no key/model/provider-scoped failure taxonomy exists;
- restart resets rotation position.

Grafel impact review shows src\agent-provider.ts directly affects src\agent-runtime.ts, src\config.ts, src\agent-controller.ts, src\agent-tool-session.ts, src\index.ts and existing provider/runtime tests, so implementation requires structural review after source changes.

## 4. Architecture decision

### 4.1 Dedicated operational store

Selected plan: create a dedicated SQLite operational store under:

runtime\agent-runtime\provider-state.sqlite

Use Node's built-in SQLite capability available under the project's Node >=24.15 runtime requirement, subject to a pre-implementation runtime capability check. No new npm dependency is planned.

Reason for SQLite instead of extending runtime\agent-runtime\state.json:
- credential state is high-churn operational data;
- cooldown and quota rows need targeted atomic updates;
- concurrent request selection benefits from transactions;
- compare-and-set recovery is easier;
- rolling quota/usage data should not rewrite the whole Agent Runtime task/session document;
- cognitive/runtime task state and provider operational state remain separate.

The database is live runtime state and must stay excluded from release/package publication.

### 4.2 Secret authority

Wave 1 keeps raw credentials in current protected configuration:
- ATRIA_API_KEY_01..20
- GONKA_API_KEY_01..20
- OPENROUTER_API_KEY_01..20
- legacy/default AGENT_CORE_AI_API_KEY where applicable

The scheduler DB stores only stable credential IDs and operational metadata.

Planned stable IDs:
- atria:01
- gonka:01
- openrouter:01
- default:01

config.ts must preserve slot identity instead of reducing credentials to string[] only.

A private non-output secret-revision fingerprint may be stored solely to detect that an operator replaced a key in the same slot; if implemented it must never be logged or surfaced. A changed secret revision resets terminal state for that credential.

No raw secret is copied into provider-state.sqlite.

## 5. Steal & Use decisions

### PCR-P1 — Durable rotation checkpoint
Donor:
- 9Router src/sse/services/auth.js
- OmniRoute src/sse/services/auth.ts

Steal:
- persisted lastUsedAt/consecutiveUseCount;
- deterministic pool ordering;
- LRU fallback after a failed credential.

Agent Core adaptation:
- persist an explicit lastCredentialId per provider route as the primary rotation checkpoint;
- persist lastUsedAt/useCount as secondary recovery/fairness metadata;
- choose the successor of lastCredentialId in configured stable slot order;
- skip ineligible entries and wrap;
- if the last credential disappeared, fall back deterministically to least-recently-used then configured order.

Why stronger:
- directly satisfies “continue after the last key used”;
- does not depend on RAM cursor;
- survives key-list edits more safely than a bare numeric index.

### PCR-P2 — Persistent cooldown/reset state
Donor:
- FreeLLMAPI server/src/services/ratelimit.ts
- 9Router account/model locks
- OmniRoute rateLimitedUntil/reset handling

Steal:
- absolute expiry timestamps;
- lazy expiry on read;
- earliest-next-available calculation;
- exact Retry-After/reset hints where available.

Agent Core adaptation:
- store cooldownUntilMs/resetAtMs, not countdown timers;
- no background timer is required while Agent Core is off;
- expired rows become eligible lazily on the next selection/status read.

### PCR-P3 — Typed failure taxonomy and scope
Primary donor:
- OmniRoute open-sse/services/accountFallback.ts

Complement:
- FreeLLMAPI server/src/lib/error-classify.ts

Agent Core classes:
- REQUEST_INVALID
- AUTH_INVALID
- RATE_LIMIT
- QUOTA_EXHAUSTED
- CREDIT_EXHAUSTED
- MODEL_ACCESS
- MODEL_NOT_FOUND
- MODEL_CAPACITY
- PROVIDER_TRANSIENT
- TRANSPORT_TRANSIENT
- INTERNAL_CONTRACT

Scope:
- request
- credential
- model+credential
- model+provider
- provider

Rules:
- malformed/request-invalid errors never punish a credential;
- 401 or explicit invalid/revoked credential => terminal credential state until credential revision changes or operator reset;
- 429 => temporary cooldown, Retry-After/reset-aware;
- quota/credit exhaustion => reset-aware long suppression, not blind rapid retry;
- model-not-found/access => model scope where evidence supports it, not automatic key death;
- genuine provider 5xx/transport outages => bounded provider/route degradation and failover;
- internal Agent Core contract failures => do not punish provider or key.

### PCR-P4 — Quota observation ledger
Donor:
- FreeLLMAPI provider_quota_state/provider_quota_observations
- OmniRoute quota preflight/reset handling

Steal:
- provider-reported remaining/limit/reset;
- Retry-After parsing;
- quota-pool concept;
- confidence/source metadata.

Agent Core adaptation:
- quota observation is operational state, not Memory;
- start with provider response headers/body hints;
- bounded rows keyed by provider/credential/scope/metric;
- use observations for preflight only when sufficiently fresh/reliable;
- stale/unknown quota never permanently disables a credential.

### PCR-P5 — Concurrency safety
Primary donor:
- OmniRoute provider-scoped selection mutex
- OmniRoute per-connection failure mutex
- OmniRoute CAS-style clearConnectionErrorIfUnchanged

Agent Core adaptation:
- serialize selection per provider route, not globally;
- perform checkpoint advance + credential touch in one SQLite transaction;
- failure updates carry a state revision/CAS token so an older completion cannot overwrite a newer failure;
- success clears only the relevant recoverable state and only when the state revision still matches.

Do not add a new global workflow gate.

### PCR-P6 — Provider circuit breaker
Donor:
- OmniRoute persistent CircuitBreaker

Steal:
- CLOSED / OPEN / HALF_OPEN;
- failure threshold;
- reset timeout;
- persisted state restoration;
- bounded half-open probe;
- failure-kind-aware breaker decisions.

Agent Core adaptation:
- only genuine provider/transport/server failures may trip provider breaker;
- credential 429/401 and request-invalid errors must not trip the whole provider;
- provider breaker is secondary to credential rotation: try healthy sibling credentials first where the error is credential-scoped;
- persist provider breaker state in the same operational DB.

### PCR-P7 — Secret boundary
Donor principle:
- OmniRoute encrypted connection fields
- FreeLLMAPI encrypted api_keys

Agent Core adaptation for Wave 1:
- do NOT duplicate secrets into SQLite;
- keep raw keys in protected env/config;
- scheduler references credentialId;
- raw key exists only in the resolver/call path;
- no raw key/fingerprint in public health, Activity, Memory, Learning, errors, or docs.

Later credential-management UI may adopt encrypted at-rest storage as a separate explicitly authorized phase.

## 6. Proposed state schema

### provider_rotation_state
- provider_id TEXT PRIMARY KEY
- last_credential_id TEXT NULL
- rotation_sequence INTEGER NOT NULL DEFAULT 0
- updated_at_ms INTEGER NOT NULL

Purpose:
authoritative checkpoint for exact continuation.

### provider_credential_state
Composite key: provider_id + credential_id

Fields:
- configured_ordinal
- last_used_at_ms
- consecutive_use_count
- state_revision
- state: active | cooldown | quota_blocked | invalid | disabled
- cooldown_until_ms
- cooldown_reason
- backoff_level
- last_success_at_ms
- last_error_at_ms
- last_error_class
- last_http_status
- secret_revision_fingerprint PRIVATE/NEVER-OUTPUT if selected during implementation
- updated_at_ms

### provider_scope_blocks
Composite logical scope:
provider + credential? + model? + scope_kind

Fields:
- scope_kind
- scope_key
- reason
- expires_at_ms
- created_at_ms
- state_revision

Purpose:
avoid disabling an entire credential because one model is unavailable.

### provider_quota_state
- provider_id
- credential_id
- quota_scope_key
- metric
- limit_value
- remaining_value
- reset_at_ms
- retry_after_ms
- source
- confidence
- observed_at_ms
- updated_at_ms

### provider_breaker_state
- provider_id PRIMARY KEY
- state
- failure_count
- last_failure_at_ms
- last_failure_class
- opened_at_ms
- retry_at_ms
- half_open_probe_count
- state_revision

No table contains raw API-key values.

## 7. Deterministic selection algorithm

Input:
- requested provider/model;
- configured provider order;
- stable credential list;
- per-request exclusion set.

For each provider route in route order:

1. Check provider breaker.
   - OPEN and retry_at_ms in future => skip route.
   - expired OPEN => allow bounded HALF_OPEN probe.

2. Load configured credential IDs in stable ordinal order.

3. Reconcile operational state:
   - new configured credential => create active state;
   - removed credential => retain no selectable state / prune later;
   - changed secret revision => reset invalid/terminal state;
   - expired cooldown/scope rows => treat as eligible and clean lazily.

4. Determine scan start:
   - successor after provider_rotation_state.last_credential_id;
   - if missing/unknown, use deterministic oldest-lastUsed/ordinal fallback.

5. Walk ring once:
   - skip request-excluded credential;
   - skip invalid/disabled;
   - skip unexpired credential cooldown;
   - skip matching model/provider scope block;
   - skip fresh quota state that proves exhaustion until reset;
   - choose first eligible credential.

6. In one transaction:
   - write last_credential_id;
   - increment rotation_sequence;
   - update last_used_at_ms/use count;
   - return selected credential ID.

7. Resolve raw secret by credential ID only after selection.

8. Perform exactly one upstream request through existing non-idempotent network policy.

9. Success:
   - record success;
   - safely clear relevant recoverable error/backoff state;
   - keep rotation checkpoint where selection placed it.

10. Failure:
   - classify;
   - persist scoped state;
   - exclude this attempt's credential when appropriate;
   - continue bounded pool/provider failover.

If no credential is eligible:
- compute earliest nextAvailableAt from cooldown/reset/breaker state;
- return a structured provider-pool-exhausted error;
- never busy-loop through blocked credentials.

## 8. Restart semantics

Example four-key provider:

configured order:
01 -> 02 -> 03 -> 04

Persisted before shutdown:
lastCredentialId = openrouter:03
openrouter:02 cooldownUntil = 03:15
openrouter:01 active
openrouter:03 active
openrouter:04 active

On restart at 03:00:
- load DB;
- start after 03;
- choose 04;
- later 01;
- skip 02 while cooldown is active.

On restart at 03:20:
- 02 is automatically eligible because current time is beyond cooldownUntil;
- no timer or AI process needed while Agent Core was off.

The rotation checkpoint is written before the upstream request so an abrupt process death does not cause the same credential to be blindly selected again on restart.

## 9. Failure policy baseline

### 400 request-invalid
Action:
- do not modify credential health;
- normally surface/stop that request unless a typed model/provider compatibility rule explicitly allows route fallback.

### 401 invalid credential
Action:
- mark credential invalid;
- persist across restart;
- rotate immediately;
- re-enable only after secret revision changes or explicit operator reset.

### 402 / insufficient credit
Action:
- classify CREDIT_EXHAUSTED/QUOTA_EXHAUSTED;
- use provider reset hint when available;
- otherwise apply bounded long suppression;
- do not hammer repeatedly.

### 403
Action depends on evidence:
- explicit invalid credential => credential scope;
- explicit model/tier access => model+credential or model+provider scope;
- ambiguous 403 => conservative bounded failure, not permanent global provider death.

### 404/410 model unavailable
Action:
- model+provider block where evidence shows model removal;
- do not mark sibling credentials invalid.

### 429
Action:
- parse Retry-After and reset headers/body;
- credential/model cooldown as evidence dictates;
- fallback to next eligible credential;
- repeated account-wide exhaustion may escalate to quota_blocked until reset.

### 5xx/timeouts/network
Action:
- short transient failure;
- rotate/fail over;
- repeated genuine provider-wide failures contribute to provider circuit breaker.

### Agent Core internal contract error
Action:
- no provider/key penalty.

## 10. Implementation phases

### PCR-0 — Preflight and contract freeze
Goal:
confirm implementation substrate without mutation.

Actions:
- verify current Node runtime supports built-in SQLite;
- snapshot current agent-provider/config/runtime signatures;
- record Grafel current impact set;
- define exact public health shape changes;
- define fixture-only provider error contract.

Exit:
implementation inputs are fixed; no runtime behavior changed.

### PCR-1 — Stable credential identity
Likely files:
- src\config.ts
- src\agent-provider.ts
- tests\agent-provider.test.ts

Actions:
- introduce AgentProviderCredentialConfig { id, secret, ordinal };
- preserve numbered env slot identity;
- preserve legacy default key compatibility;
- dedupe duplicate secret values in memory while retaining the first stable slot;
- never expose secret through health.

Exit:
provider routes have stable credential IDs independent of raw key strings.

### PCR-2 — Provider operational SQLite owner
New likely files:
- src\agent-provider-state.ts
- tests\agent-provider-state.test.ts

Actions:
- initialize runtime\agent-runtime\provider-state.sqlite;
- create/migrate schema;
- WAL/foreign-key/busy-timeout/durability policy appropriate for single Agent Core process;
- transactional selection/update APIs;
- state never contains raw secrets;
- corruption/unavailable state must produce explicit degraded health rather than silently resetting all cooldowns.

Exit:
durable state owner works independently of provider calls.

### PCR-3 — Restart-safe credential scheduler
New likely file:
- src\agent-provider-scheduler.ts

Modify:
- src\agent-provider.ts

Actions:
- replace RAM-only keyCursor as authority;
- implement persistent lastCredentialId ring;
- add lastUsed/use-count fallback;
- provider-scoped selection serialization;
- per-request exclusion set;
- all-blocked earliest-next-available result.

Exit:
rotation resumes correctly after scheduler/service reconstruction.

### PCR-4 — Typed provider error contract
New likely file:
- src\agent-provider-errors.ts

Modify:
- src\agent-provider.ts

Actions:
- OpenAICompatibleProvider must return/throw typed bounded error metadata:
  status, safe provider code/type, Retry-After/reset hints, bounded sanitized message;
- implement classifier and error scope;
- never embed raw authorization/secret;
- preserve maxAttempts=1 in fetchWithPolicy to avoid retry amplification.

Exit:
pool receives structured error evidence instead of parsing flattened strings.

### PCR-5 — Persistent cooldown and scoped block state
Modify:
- src\agent-provider-state.ts
- src\agent-provider-scheduler.ts
- src\agent-provider.ts

Actions:
- absolute cooldown/reset timestamps;
- auth-invalid persistence;
- model/credential/provider scoped blocks;
- lazy expiry;
- backoff escalation for repeated transient rate-limit events;
- success recovery with state revision/CAS guard.

Exit:
429/401/402/model failures rotate correctly and survive restart.

### PCR-6 — Quota observation and provider breaker
Actions:
- add bounded quota observations based on Retry-After/rate-limit headers/body;
- add provider breaker persistent state;
- provider breaker counts only provider-scope transport/server failures;
- HALF_OPEN allows bounded probes;
- successful probe closes breaker;
- quota/cooldown state remains distinct from breaker state.

Exit:
system avoids burning every key during a provider-wide outage and avoids premature retry before known quota reset.

### PCR-7 — Runtime integration and health
Modify likely:
- src\agent-runtime.ts
- src\agent-controller.ts only if structured exhaustion must be surfaced
- src\index.ts / health composition if aggregate health is exposed

Health may expose only aggregate safe fields:
- provider count;
- configured credential count;
- active/cooldown/invalid counts;
- breaker state;
- earliest next available time;
- scheduler-state health.

Never expose:
- raw key;
- authorization header;
- secret fingerprint;
- full provider error body containing credential-like content.

Exit:
Native Agent Runtime consumes the scheduler as the only credential-selection authority.

### PCR-8 — Targeted acceptance
No broad regression suite unless separately authorized.

Required targeted fixtures are listed in section 11.

### PCR-9 — Resident activation and donor closure
Only after implementation qualification and explicit lifecycle authorization:
- build/reload required runtime;
- bounded resident readback;
- update docs/CODEBASE and canonical Memory with implemented state;
- create one release intent for material provider-scheduler behavior;
- do NOT release/apply/publish automatically.

Protected donor repositories remain until a post-adoption zero-value census shows no unresolved mechanism value.

## 11. Targeted acceptance matrix

These are the exact tests to request/run during implementation qualification; this planning task does not run them.

### A1 — Exact restart rotation
Fixture:
four credentials 01..04.

Sequence:
01 success -> 02 success -> 03 success -> reconstruct scheduler/runtime -> next must be 04.

PASS:
durable state proves restart continuation.

### A2 — Cooldown survives restart
02 returns 429 Retry-After=120.
Expected:
- 02 gets absolute cooldown;
- request rotates to 03;
- reconstruct scheduler;
- 02 remains skipped before expiry;
- after controlled clock passes expiry, 02 becomes eligible again without manual reset.

### A3 — All keys unavailable
All credentials are cooling down.
PASS:
- no busy retry loop;
- structured exhausted state;
- earliest nextAvailableAt is correct.

### A4 — Invalid credential
01 returns explicit 401 invalid key.
PASS:
- 01 becomes invalid and stays skipped after restart;
- other key succeeds;
- replacing/revising credential 01 or explicit reset makes it eligible again.

### A5 — Request-invalid isolation
400 malformed request.
PASS:
credential state is unchanged.

### A6 — Model-scope isolation
one model returns 404/explicit access denial.
PASS:
same credential may still serve an unrelated valid model.

### A7 — Provider outage
multiple eligible credentials receive genuine 503/transport failures.
PASS:
- bounded attempts;
- provider breaker opens after configured threshold;
- later routes/providers are tried;
- breaker state survives restart;
- HALF_OPEN probe closes after recovery.

### A8 — Concurrent selection
multiple simultaneous completion requests.
PASS:
- provider-scoped selection transactions are serialized correctly;
- rotation checkpoint is not lost;
- stale failure/success update cannot overwrite newer state.

### A9 — Secret non-disclosure
Search resulting:
- provider-state DB projections;
- health response;
- Activity/log/error surfaces;
- Memory/Learning evidence created by the fixture.

PASS:
no raw API key is present.

### A10 — Existing Native Agent lifecycle preservation
Loopback integration:
Memory-first -> provider -> existing MCP tool -> verification -> Learning finalization.

PASS:
new scheduler does not bypass or duplicate Agent Core Memory/Learning/tool authority.

## 12. Hard acceptance gates

The provider credential scheduler is NOT accepted merely because rotation works in one process.

All MUST pass:

1. Stable credential identity.
2. Durable lastCredentialId checkpoint.
3. Restart continuity.
4. Cooldown persistence.
5. Automatic expiry eligibility.
6. Typed failure classification.
7. Correct failure scope.
8. Bounded key/provider failover.
9. All-blocked earliest retry state.
10. Concurrent state safety.
11. No raw secret in operational state/diagnostics.
12. Existing Native Agent lifecycle preserved.
13. Health reports truthful degraded state when scheduler persistence is unavailable.
14. No donor runtime/dependency becomes a hidden execution requirement.

## 13. Explicit donor adoption/rejection table

| ID | Mechanism | Donor | Decision |
| --- | --- | --- | --- |
| PCR-P1 | Persisted last-used/use-count rotation metadata | 9Router + OmniRoute | ADAPT |
| PCR-P1b | Explicit durable lastCredentialId checkpoint | Agent Core improvement over donors | IMPLEMENT |
| PCR-P2 | Absolute cooldown/reset timestamps | 9Router + OmniRoute + FreeLLMAPI | ADAPT |
| PCR-P3 | Error reason taxonomy and scope | OmniRoute + FreeLLMAPI | ADAPT |
| PCR-P4 | Persistent quota observations | FreeLLMAPI + OmniRoute | ADAPT |
| PCR-P5 | Provider selection mutex + CAS recovery | OmniRoute | ADAPT |
| PCR-P6 | Persistent provider circuit breaker | OmniRoute | ADAPT, bounded |
| PCR-P7 | Encrypted donor secret DB | OmniRoute/FreeLLMAPI | DEFER; keep env authority Wave 1 |
| PCR-R1 | 9Router raw-key-oriented usage persistence | 9Router | REJECT |
| PCR-R2 | OmniRoute apiKeyRotator RAM-only index | OmniRoute | REJECT |
| PCR-R3 | FreeLLMAPI roundRobinIndex RAM-only cursor | FreeLLMAPI | REJECT |
| PCR-R4 | Agent Core current keyCursor as durable authority | Agent Core current | REPLACE |
| PCR-R5 | Put key/cooldown state in AI Memory/Learning | none | REJECT |

## 14. Success state before interactive chat

Only after PCR-0..PCR-8 are qualified can the provider substrate be considered ready for the next UI/chat phase.

Expected architecture then:

Interactive Agent Core Chat
  -> NativeAgentController
  -> existing Memory-first / Skills / Learning lifecycle
  -> OpenAICompatibleProviderPool
  -> PersistentCredentialScheduler
  -> provider/credential operational DB
  -> protected secret resolver
  -> model provider

At that point the model may change, Agent Core may restart, and individual keys may enter/leave cooldown, while the credential scheduler continues deterministically without depending on AI Memory or AI reasoning.


## 15. Implementation result — 2026-10-02

Status after authorized execution:
- PCR-0 through PCR-8 are source-implemented and targeted-qualified.
- PCR-9 resident activation remains pending an explicit Core lifecycle/restart authorization.
- No donor runtime was installed or executed.
- No external helper dependency was needed: the resident project Node v24.21.0 exposes built-in `node:sqlite`.
- No real provider secret was inspected or used by the acceptance fixtures.

Implemented owners:
- `src\agent-provider-errors.ts`
- `src\agent-provider-state.ts`
- `src\agent-provider-scheduler.ts`
- `src\agent-provider.ts`
- `src\config.ts`
- `src\agent-runtime.ts`

Targeted acceptance owners:
- `tests\agent-provider-scheduler.test.ts`
- `tests\agent-provider-pool.test.ts`
- existing `tests\agent-provider.test.ts`
- existing `tests\agent-runtime-integration.test.ts`


### 15.1 Implemented runtime contract

The old RAM-only `keyCursor` is no longer the credential-selection authority.

Provider routes now preserve stable credential slot identities such as:
- `openrouter:01`
- `gonka:01`
- `atria:01`

The scheduler persists an explicit `last_credential_id` rotation checkpoint before upstream dispatch and keeps last-use/use-count metadata as deterministic recovery/fairness evidence.

Operational state is separate from Agent Memory and from task/session state:
- task/session/finalization: `runtime\agent-runtime\state.json`
- provider scheduler: `runtime\agent-runtime\provider-state.sqlite`

The SQLite store persists only stable credential IDs, private secret-revision digests, cooldown/reset metadata, scoped blocks, quota observations, and provider-breaker state. Raw API-key values are never written into this database.


### 15.2 Failure and recovery behavior

Implemented typed classes distinguish request-invalid, invalid credential, rate limit, quota/credit exhaustion, model access/not-found/capacity, provider/transport transient failures, and internal contract failures.

Implemented scope prevents unrelated damage:
- malformed request does not punish a credential;
- invalid 401 state survives restart until the slot secret changes or is explicitly reset;
- 429 creates reset-aware temporary suppression and rotates to a sibling credential;
- model-specific access/not-found state can block only the relevant model scope;
- genuine provider/transport failures contribute to a persisted CLOSED/OPEN/HALF_OPEN provider breaker;
- non-provider responses prove reachability and can close a HALF_OPEN breaker.

Absolute timestamps make cooldown recovery independent of a continuously running process. Expired cooldown/scope/quota rows become eligible lazily on the next selection/status read.


### 15.3 Qualification evidence

Final source build:
- `npm run build` — PASS
- path policy: 293 authored files scanned, 0 documented exceptions
- TypeScript compile — PASS

Final targeted acceptance:
- 4 test files
- 21 tests PASS
- 0 failed

Covered evidence includes:
- exact restart continuation 01 -> 02 -> 03 -> reconstructed runtime -> 04;
- cooldown survival across reconstruction and automatic expiry;
- invalid-key persistence and recovery when the stable slot's secret changes;
- request-invalid isolation;
- all-credentials-blocked earliest retry;
- persisted provider breaker and HALF_OPEN recovery;
- model-scope isolation;
- persisted quota preflight and reset release;
- escalating transient rate-limit backoff;
- provider-scoped concurrent selection;
- real pool 429 sibling-key failover;
- real pool 503 provider failover;
- degraded health when provider state cannot open;
- byte-level operational-state and health checks showing no raw fixture secret;
- preservation of Memory-first -> existing MCP tool -> mandatory Learning finalization.


### 15.4 Structural and security review

Grafel was explicitly reindexed after the source change and is current with accepted integrity at:
- 10,761 entities
- 58,335 relationships
- registered-repo coverage 1/1

The graph resolves both `PersistentCredentialScheduler` and `ProviderStateStore`. Impact review confirms the provider surface reaches the existing Native Agent Runtime/config/controller/tool-session composition and the relevant tests.

Grafel's generic security findings reported one pre-existing XSS advisory in `src/oauth/service.ts`, outside this provider change. A later Grafel secrets-mode query timed out and was not blindly retried. Changed-source secret safety is instead supported by:
- scoped source readback showing no provider secret logging/serialization path in the changed owners;
- targeted acceptance that scans SQLite/WAL bytes and public health output for raw fixture secrets.

No claim is made that this task resolved the unrelated OAuth advisory.


### 15.5 Release and activation boundary

A minor material-behavior changeset records this capability and remains unapplied. Product version and Git history were not changed by this work, and no package/publication action was taken. The user subsequently restarted Agent Core and resident activation was verified on the fresh connector.

After the user restart, one bounded resident Native Agent acceptance was performed through the configured provider runtime. It returned HTTP 200, finalized successfully, and wrote live Atria rotation checkpoints without exposing credential values.

Therefore the closure state is:

**SOURCE IMPLEMENTED + BUILD/TARGETED VERIFIED + RESIDENT ACTIVATION VERIFIED + BOUNDED REAL-PROVIDER ACCEPTANCE PASS.**

Resident readback now confirms the qualified build is loaded, scheduler health is available, and live rotation state is being written. Future provider work can proceed from this resident-verified baseline.
