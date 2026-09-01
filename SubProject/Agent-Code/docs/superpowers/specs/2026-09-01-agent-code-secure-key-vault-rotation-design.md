# Agent Code Secure API Key Vault & Deterministic Rotation — Design Spec

Date: 2026-09-01
Status: Approved for implementation planning
Scope: Milestone 2A — OpenRouter-only secure credential vault and deterministic key-rotation core

## 1. Product intent

Agent Code Milestone 2A introduces the first native backend subsystem after the approved UI shell: a Windows-first credential vault and deterministic API-key rotation core for OpenRouter keys owned by the user.

The milestone is deliberately narrower than a model router. Its job is to make credential storage, selection, rotation, failure classification, cooldown, persistence, restart recovery, and security auditing stable before any multi-provider or full agent-inference integration is attempted.

The design optimizes for four properties:

1. API keys are never stored as plaintext at rest.
2. After initial import, no normal UI or IPC path can reveal a full API key.
3. Rotation decisions are deterministic, bounded, fast, and testable without consuming real model quota.
4. A provider-wide failure must not be misclassified as a key failure and cause wasteful key churn.

## 2. Frozen milestone constraints

- Product remains `Agent Code`.
- Target production host remains Windows desktop.
- OpenRouter is the only provider in this milestone.
- Do not add Gemini, Anthropic-direct, OpenAI-direct, or any other provider.
- Do not build a generic multi-provider abstraction prematurely.
- Do not connect Super-Runtime in this milestone.
- Do not implement a model picker, model-routing policy, agent loop, shell execution, or coding-agent execution.
- Do not add cloud sync, remote secret backup, or plaintext secret export.
- Do not add a `Reveal API Key` action.
- Do not store API keys in `.env`, JSON, localStorage, React state persistence, logs, SQLite text columns, or Tauri configuration.
- The frontend may accept a key once during import, but plaintext must never be returned from Rust to the frontend after storage.
- Rotation must be testable with synthetic keys and deterministic fault injection before any live-key acceptance run.
- Real OpenRouter keys are used only for final validation/probe acceptance, not for destructive quota-exhaustion tests.
- Existing `SubProject/Super-Runtime/` files remain untouched.
- Root `.vscode/` remains user-owned and untouched.

## 3. Security target and threat model

The milestone target is **no known secret exposure within the defined application threat model**. It must not claim that a locally stored credential is impossible to recover under a fully compromised operating system.

### In scope

Protect against:

- casual inspection of Agent Code files or databases;
- copying the vault database to another ordinary user profile/machine;
- plaintext secrets appearing in logs, diagnostics, panic messages, tracing output, UI state snapshots, serialized Tauri responses, or test artifacts;
- a normal user reopening Agent Code and asking the UI to reveal an imported key;
- accidental secret exposure through `Debug`/`Display` formatting;
- corrupted or tampered vault records being silently treated as valid keys;
- stale or invalid keys remaining eligible for rotation;
- retry loops that repeatedly select the same failed key;
- provider-wide failures causing every key to be burned through;
- restart/crash leaving the rotation cursor or cooldown states semantically inconsistent.

### Explicitly out of scope

No local application can truthfully guarantee secrecy against:

- a Windows administrator or malware that can execute as/impersonate the same user;
- kernel compromise;
- a debugger or memory scraper attached while a plaintext key is being used;
- external clipboard-history tools retaining a key before Agent Code receives it;
- recovery of secrets from a separately compromised OpenRouter account/provider;
- forensic guarantees that deleted ciphertext bytes are physically erased from SSD flash cells.

These boundaries must be documented in the product and tests rather than hidden behind an absolute “unhackable” claim.

## 4. Evaluated vault approaches

### Approach A — Windows DPAPI per API key — recommended for Milestone 2A

Each OpenRouter API key is protected individually with Windows `CryptProtectData` using current-user scope. Agent Code stores only the returned opaque DPAPI blob plus non-secret metadata.

Advantages:

- smallest cryptographic attack surface;
- no application-owned master key to persist or rotate;
- directly bound to the logged-in Windows user by the OS;
- DPAPI performs authenticated protection/integrity checking;
- fewer custom cryptographic primitives for Agent Code to get wrong;
- aligns with the current Windows-only product target.

Trade-off:

- protected keys are intentionally not portable to a different Windows profile/machine in the normal case.

### Approach B — DPAPI-wrapped master key + AES-GCM per secret

Agent Code could generate a random master key, protect that key with DPAPI, then encrypt every API key with AES-GCM and a per-secret nonce.

Advantages:

- crypto envelope is easier to migrate to another key-protection backend later;
- application-level encryption can be exercised cross-platform.

Disadvantages:

- more key-management code;
- one in-memory master key becomes a high-value aggregation point;
- more nonce/key-derivation/versioning code to audit;
- no meaningful improvement for the current Windows-only, same-user security boundary.

Milestone 2A deliberately does **not** add this extra encryption layer. If a real portability requirement appears later, migration can be designed explicitly rather than paying the complexity cost now.

### Approach C — Windows Credential Manager only

This reduces application persistence code but makes the credential lifecycle depend more heavily on an external generic credential store and provides less control over Agent Code’s transactional metadata and rotation state.

It is not selected for this milestone.

## 5. Selected secret-storage design

### 5.1 Per-user DPAPI protection

Every imported key is protected with `CryptProtectData` under the current Windows user context.

Rules:

- Do **not** set `CRYPTPROTECT_LOCAL_MACHINE`.
- Use a non-interactive protection path (`CRYPTPROTECT_UI_FORBIDDEN`).
- Plaintext is passed into DPAPI only from Rust native code.
- The protected BLOB is stored as binary data, never as a plaintext string.
- Every DPAPI allocation returned by Windows is released with the required Windows allocator contract.

Microsoft documents that the default DPAPI protection is normally decryptable only by the same logon user and ordinarily on the same machine. DPAPI also includes keyed integrity protection on the encrypted data.

### 5.2 Application-level corruption detection

Because Microsoft recommends applications not rely on one specific DPAPI error code for tamper detection, Agent Code stores a SHA-256 checksum of the **ciphertext blob**, not of the plaintext key.

On read:

1. load the protected blob;
2. recompute ciphertext checksum;
3. fail closed on mismatch;
4. only then call `CryptUnprotectData`;
5. validate the decrypted secret shape before use.

The checksum is for storage corruption/tamper diagnostics, not authentication or password hashing.

### 5.3 No plaintext fingerprint at rest

Milestone 2A does not persist `SHA256(api_key)` or another stable plaintext-derived fingerprint. OpenRouter keys are high entropy, but a plaintext-derived global fingerprint is unnecessary metadata leakage.

Duplicate detection occurs only when adding a new key: Rust decrypts existing candidate records one at a time, performs a constant-time comparison where practical, and zeroizes each temporary plaintext immediately afterward.

Each record is identified by a random opaque `key_id` and may expose only a masked suffix such as `••••3Fxa` for human recognition.

## 6. Plaintext lifecycle

Plaintext is unavoidable at two moments: initial user entry and an outbound authenticated request. The design minimizes both windows.

### Import path

```text
User pastes key into masked field
        ↓
WebView contains plaintext transiently
        ↓
single Tauri add-key invocation
        ↓
Rust Secret value
        ↓
DPAPI protect
        ↓
protected blob committed
        ↓
Rust plaintext zeroized
        ↓
input DOM value cleared
```

The import control should be an uncontrolled password input where feasible so React does not keep the key in long-lived component state. It must use `autocomplete="off"`, disable spellchecking, and clear its DOM value immediately after the invocation settles.

The UI must never display the full value again.

### Request/probe path

```text
Rotation selects key_id
        ↓
Vault loads protected blob
        ↓
DPAPI unprotect just-in-time
        ↓
Rust inserts Authorization header
        ↓
request completes / header object drops
        ↓
owned secret buffer zeroized
```

No plaintext secret is cached between requests.

A networking library may internally copy an authorization header for the lifetime of an HTTP request; the application can minimize that lifetime but must not claim it can zero every internal library copy.

## 7. Secret-safe Rust types

Production Rust code must use a dedicated secret wrapper instead of raw `String` values after the Tauri command boundary.

Required behavior:

- owned buffer zeroizes on drop;
- `Debug` renders only `[REDACTED]`;
- `Display` is not implemented for the secret;
- serialization is not implemented for the secret;
- helper methods expose bytes only through narrow closures/scope;
- error types never include request authorization values;
- tracing spans never attach plaintext headers.

A dependency such as `zeroize`/`secrecy` may be used, but the public Agent Code interface remains project-owned so dependency replacement does not leak through the architecture.

## 8. Persistent vault store

Use a small transactional local SQLite store under Agent Code’s per-user application-data directory.

Suggested production location conceptually:

```text
%LOCALAPPDATA%\Agent Code\vault\vault.db
```

The exact path should come from the Tauri application-data API rather than hard-coded string concatenation.

### Key table

Each record contains only protected secret data and bounded metadata:

```text
key_id                  random opaque identifier
slot_index              stable rotation order
label                    user-visible local label
masked_suffix            last 4 characters only
protected_blob           DPAPI ciphertext BLOB
protected_blob_sha256    checksum of ciphertext
lifecycle_state          ENABLED | DISABLED | INVALID | QUARANTINED
availability_state       READY | COOLDOWN | EXHAUSTED | UNVERIFIED
cooldown_until_utc       nullable
consecutive_failures     bounded integer
last_success_at          nullable
last_failure_at          nullable
last_failure_class       nullable bounded enum
last_probe_at            nullable
limit_value              nullable numeric metadata
limit_remaining          nullable numeric metadata
limit_reset              nullable DAILY | WEEKLY | MONTHLY
usage_daily              nullable numeric metadata
is_free_tier             nullable boolean
expires_at               nullable UTC timestamp
created_at               UTC timestamp
updated_at               UTC timestamp
```

No raw provider response body is persisted.

### Runtime state

The hot rotation path uses an in-memory registry loaded from SQLite at startup. SQLite is not queried to choose a key on every request.

Critical state transitions are transactionally persisted after they occur so restart rehydrates the same semantic state.

## 9. OpenRouter-only live validation boundary

Milestone 2A uses only OpenRouter’s current-key metadata endpoint for real credential validation:

```text
GET https://openrouter.ai/api/v1/key
Authorization: Bearer <candidate key>
```

The endpoint currently returns metadata including `limit`, `limit_remaining`, `limit_reset`, `usage_daily`, `is_free_tier`, and `expires_at` for the authenticating key.

Rules:

- adding a key stores it safely first as `UNVERIFIED`;
- a network probe then validates it asynchronously;
- a transient network failure leaves the key `UNVERIFIED`, not `INVALID`;
- `401` marks the key `INVALID`;
- a successful metadata response marks it `READY` unless its returned state indicates exhaustion/expiry;
- only explicitly returned reset metadata may be used to calculate a reset deadline;
- do not invent a free-tier reset timestamp when OpenRouter does not explicitly supply one for that key;
- do not require a Management API Key in this milestone.

This allows multiple ordinary OpenRouter account keys to be validated independently without giving Agent Code account-management privileges.

## 10. Rotation architecture

Milestone 2A uses a deterministic round-robin scheduler, not weighted scoring or AI-driven routing.

Weighted routing is intentionally deferred until real usage data demonstrates a need.

### 10.1 Separate lifecycle and availability state

Do not encode every condition into one giant enum.

Lifecycle:

```text
ENABLED
DISABLED
INVALID
QUARANTINED
```

Availability:

```text
UNVERIFIED
READY
COOLDOWN
EXHAUSTED
```

Additional runtime counters such as `in_flight` are tracked separately.

A key is selectable only when:

```text
lifecycle_state == ENABLED
AND availability_state == READY
AND cooldown deadline has passed
AND it has not already been tried in the current logical request
```

### 10.2 Deterministic cursor

Keys have stable `slot_index` order. The scheduler stores a cursor pointing after the last successfully leased key.

`acquire()` scans at most one complete pool cycle and either:

- returns the next eligible key lease; or
- returns a typed `PoolUnavailable` result with the earliest known retry time.

It must never spin indefinitely.

### 10.3 Lease token

The scheduler returns an opaque lease token containing identifiers, not a plaintext secret to the caller-facing API.

The vault/request layer resolves the secret just-in-time.

Each logical request also owns a `RotationSession` containing the set of `key_id`s already attempted. A failed request can therefore move to another key without ever cycling back to the same key during that logical operation.

### 10.4 Serialization of scheduling decisions

Rotation state mutations occur through one Rust-owned synchronized control point. A simple `Mutex`/single-writer state boundary is preferred over lock-free complexity because key selection takes microseconds and correctness is more important than theoretical scheduler throughput.

No database transaction is held while a network request is in flight.

## 11. Failure classification

Key rotation must be driven by **failure semantics**, not by “any error means try another key.”

OpenRouter currently documents standard error classes including `401`, `402`, `403`, `408`, `429`, `500`, `502`, `503`, `524`, and `529` on API surfaces.

### Key-scoped failures

#### 401 Unauthorized

- classify as `AUTH_INVALID`;
- mark key lifecycle `INVALID`;
- remove from selection immediately;
- next key may be selected.

#### 403 Forbidden

- classify conservatively as credential/account permission failure;
- mark `QUARANTINED` until a successful explicit probe/manual re-enable;
- next key may be selected.

#### 402 Payment Required

- classify as `CREDIT_BLOCKED`;
- mark availability `EXHAUSTED`;
- next key may be selected because another user-owned OpenRouter account can have independent credit/quota;
- do not hammer the exhausted key repeatedly.

#### 429 Too Many Requests

- classify as `RATE_LIMITED`;
- mark `COOLDOWN`;
- use an explicit server retry/reset hint when available;
- otherwise use bounded exponential backoff with deterministic per-key jitter;
- next eligible key may be selected.

### Request-scoped failures — no key rotation

Examples:

- malformed request / 400;
- unsupported payload / 422;
- invalid model identifier when the credential itself is valid.

These must return to the caller without poisoning the key.

### Provider/transient failures — do not burn the pool

Examples:

- 408;
- 500;
- 502;
- 503;
- 524;
- 529.

These are not evidence that one API key is bad. The rotation core must not march through every key on a provider-wide outage. It reports a typed transient-provider outcome and leaves key health unchanged except for bounded observability counters.

A future request executor can apply provider-level retry/backoff; that executor is outside Milestone 2A.

## 12. Retry budget and anti-loop invariants

Every logical rotation session has hard limits.

Required invariants:

- one key appears at most once in one logical request;
- scan at most one full key-pool cycle per acquisition decision;
- never retry a key whose cooldown has not expired;
- never select `INVALID`, `DISABLED`, `QUARANTINED`, `UNVERIFIED`, or `EXHAUSTED` keys;
- provider-transient errors do not consume additional keys;
- unknown errors fail closed rather than causing unbounded rotation;
- no recursion-based retry implementation;
- rotation terminates with a typed reason when no safe key remains.

## 13. Cooldown recovery

A cooldown deadline is monotonic in semantics even though it is persisted as UTC for restart recovery.

At runtime:

- expired cooldowns transition back to `READY` through a controlled reconciliation pass;
- a key that was `INVALID` or `QUARANTINED` never becomes ready merely because time passed;
- exhausted keys require explicit known reset metadata, a successful probe, or user action before returning to `READY`;
- revalidation runs out-of-band and does not block the hot selection path.

## 14. Minimal UI surface

Do not create a full Settings system yet.

Add one focused `API Keys` / `Credential Vault` surface accessible from the Agent Code shell.

It contains:

- `Add OpenRouter Key` masked import field;
- local label field;
- masked key list (`••••xxxx` only);
- state badge (`Ready`, `Cooldown`, `Invalid`, `Disabled`, `Unverified`, `Exhausted`);
- last successful validation time;
- optional bounded quota metadata returned by OpenRouter;
- `Validate` action;
- `Enable/Disable` action;
- `Delete` action with confirmation;
- no reveal/copy/export action.

The UI receives only `KeySummary` metadata from Rust.

## 15. Tauri command boundary

Milestone 2A introduces the first intentionally narrow native command surface.

Allowed commands conceptually:

```text
vault_add_openrouter_key(secret, label)
vault_list_openrouter_keys()
vault_validate_key(key_id)
vault_set_enabled(key_id, enabled)
vault_delete_key(key_id)
vault_run_native_self_test()
rotation_get_snapshot()
rotation_run_synthetic_self_test()
```

Forbidden commands:

```text
vault_get_plaintext_key()
vault_reveal_key()
vault_export_plaintext()
```

The command layer validates lengths/types before touching the vault. Tauri responses are serializable metadata-only structures.

The internal scheduler APIs (`acquire`, `report_outcome`) are Rust-only and are not exposed directly to the WebView.

## 16. Native Windows vault self-test

Because Linux Codespace can cross-compile Windows but cannot execute DPAPI, Agent Code includes a bounded native self-test that runs only on Windows.

The self-test:

1. generates a random in-memory canary secret;
2. protects it with DPAPI;
3. verifies the ciphertext does not contain the plaintext canary;
4. validates ciphertext checksum;
5. unprotects it;
6. compares result to the canary;
7. zeroizes plaintext buffers;
8. deletes the test record;
9. reports only PASS/FAIL and error class to the UI.

It never displays the canary.

This is a runtime acceptance test, not a substitute for the unit/security suites.

## 17. Synthetic rotation lab

Do not exhaust real OpenRouter accounts to test failover.

Build an internal Rust-only deterministic fake transport capable of scripting outcomes such as:

```text
Key A -> success
Key A -> 429 retry_after=30
Key B -> success
Key A -> 401
Key B -> 402
Key C -> success
provider -> 503
```

The synthetic lab drives the exact production scheduler and outcome classifier while using fake secrets.

It must produce a structured report containing only key IDs/states/counters, never secrets.

## 18. Test strategy

### 18.1 Vault unit tests

Cover:

- add/list/delete metadata;
- duplicate import rejection;
- corrupted ciphertext checksum fails closed;
- decryption failure quarantines rather than panics;
- disabled/invalid records are never eligible;
- restart rehydrates metadata and state;
- no plaintext secret returned by any public Rust/Tauri response type.

Linux unit tests use a test-only secret protector behind an internal trait. There must be **no production plaintext fallback** on non-Windows targets.

### 18.2 Secret-leakage tests

Use synthetic canary keys such as a long unique token and assert it never appears in:

- logs;
- tracing output;
- error messages;
- serialized `KeySummary` values;
- SQLite text fields;
- UI-rendered HTML snapshots;
- panic text from controlled failure cases;
- diagnostic/self-test reports.

Add a repository/runtime grep gate for the canary after the tests.

### 18.3 Rotation state-machine tests

Cover every transition and invariant:

- deterministic round-robin order;
- cursor persistence;
- cooldown expiry;
- 401 -> invalid -> next key;
- 402 -> exhausted -> next key;
- 429 -> cooldown -> next key;
- 503/529 -> provider transient -> no key churn;
- request error -> no key churn;
- no eligible key -> typed terminal result;
- no key selected twice in one `RotationSession`;
- disabled key skipped immediately;
- key deleted while not leased disappears safely;
- state survives restart.

### 18.4 Property-based and stress tests

Use generated key pools and generated event sequences to assert invariants over many combinations.

Targets:

- at least 100,000 synthetic scheduling/outcome transitions in stress mode;
- zero duplicate selection within a logical request;
- zero selection of an ineligible key;
- bounded completion for every event sequence;
- deterministic final state given the same initial state and event stream.

Performance target for pure in-memory selection is sub-millisecond on normal desktop hardware; correctness remains the hard gate.

### 18.5 Concurrency tests

All scheduling mutation passes through one synchronized state boundary. Tests must still race multiple callers against:

- acquire;
- report outcome;
- disable;
- delete;
- cooldown reconciliation.

The required invariant is not maximum parallelism; it is absence of double-use/state corruption caused by races.

### 18.6 Windows native acceptance

On an actual Windows host:

- DPAPI self-test PASS;
- add a real key -> UI never reveals it after save;
- restart application -> key remains usable;
- copy `vault.db` elsewhere -> no plaintext key visible;
- validate real key through `/api/v1/key`;
- invalid synthetic/temporary key is classified correctly;
- synthetic rotation lab PASS;
- installer/relaunch regression PASS.

A Linux cross-build alone cannot certify these runtime properties.

## 19. Storage/recovery behavior

The vault is intentionally local and user-bound.

Consequences:

- reinstalling Windows or losing the Windows user profile may make protected keys unrecoverable;
- Agent Code should clearly state that users must retain original provider credentials/recovery access outside Agent Code;
- no plaintext backup/export is introduced in Milestone 2A;
- a later encrypted portable backup feature, if ever required, receives its own threat model and design.

On database corruption:

- fail closed;
- do not silently recreate a blank vault over the corrupt file;
- preserve the corrupt file for user-directed recovery diagnostics without exposing contents;
- allow starting Agent Code with credential functionality degraded rather than crashing the entire UI shell.

## 20. Logging and observability

Credential observability is metadata-only.

Allowed examples:

```text
vault.add key_id=key-7 result=stored
rotation.acquire key_id=key-2 slot=2
rotation.outcome key_id=key-2 class=rate_limited cooldown_ms=30000
vault.probe key_id=key-3 result=valid
```

Forbidden:

```text
Authorization: Bearer ...
raw API key
full request headers
full provider error payload when it can echo sensitive data
```

Provider error bodies are parsed into a bounded typed error class and then discarded unless a separately audited non-secret field is needed.

## 21. Performance architecture

The hot path is intentionally simple:

```text
request needs credential
        ↓
lock in-memory rotation state
        ↓
choose eligible key_id
        ↓
unlock scheduler
        ↓
load protected blob
        ↓
DPAPI decrypt selected key only
        ↓
network operation
        ↓
zeroize plaintext
        ↓
report bounded outcome
```

Do not query every key or decrypt every key during normal selection.

Database writes happen after meaningful state transitions, not while holding the scheduler lock across network I/O.

## 22. Milestone phases

### Phase A — security contracts and secret types

Freeze threat model, secret wrapper, metadata-only DTOs, and forbidden exposure tests.

### Phase B — Windows vault persistence

Add per-user DPAPI adapter, transactional local store, add/list/delete/enable behavior, corruption handling, and Windows self-test.

### Phase C — deterministic rotation core

Add stable slots, cursor, eligibility rules, lease/session semantics, failure classifier, cooldown, restart recovery, and anti-loop invariants using synthetic keys only.

### Phase D — focused vault UI

Add masked import/list/state UI and only the narrow Tauri commands needed by that surface.

### Phase E — OpenRouter validation probe

Add Rust-only `GET /api/v1/key` validation and bounded metadata synchronization. Do not add model inference.

### Phase F — security/stress certification

Run secret-leakage tests, property tests, 100k+ synthetic transitions, concurrency races, restart/corruption tests, cross-build regression, and native Windows acceptance.

Only after Phase F passes is Milestone 2A considered stable enough for the user to define the next task.

## 23. Non-goals

Explicitly excluded:

- Gemini keys;
- multiple provider adapters;
- provider scoring/weighted routing;
- model selection;
- completion/chat/responses inference integration;
- agent execution;
- Super-Runtime fallback;
- cloud secret manager;
- cross-device vault sync;
- automatic account creation;
- plaintext credential export/reveal;
- Management API Key administration;
- automatic creation/deletion of OpenRouter keys;
- attempts to bypass provider account policies or limits.

## 24. Acceptance gates

Milestone 2A is not complete until all are true:

1. no plaintext API key exists in persistent storage;
2. no public Tauri/Rust read API can return a stored plaintext key;
3. secret canary leakage suite is clean;
4. DPAPI native Windows self-test passes;
5. vault survives normal app restart;
6. corrupt/tampered records fail closed without crashing Agent Code;
7. deterministic rotation state-machine suite passes;
8. provider-transient errors demonstrably do not burn through the key pool;
9. one logical request never selects the same key twice;
10. 100k+ synthetic transition stress test passes with all invariants intact;
11. concurrency tests show no scheduler state corruption;
12. OpenRouter current-key validation works with real user-owned keys without model inference;
13. Agent Code unit/type/build/visual gates remain green;
14. Windows x64 cross-build remains green;
15. native Windows add/restart/validate acceptance passes;
16. parent Agent-Core regression suite remains green;
17. Super-Runtime remains untouched.

## 25. Source notes used to validate the design

The design uses current official documentation rather than assuming behavior:

- Microsoft `CryptProtectData`: user-scoped DPAPI protection, non-machine scope behavior, UI-forbidden option, and integrity MAC. Microsoft Learn, updated 2026-05-20.
- Microsoft `CryptUnprotectData`: decrypt/integrity behavior and recommendation for additional application-level corruption checking rather than relying on one specific tamper error code. Microsoft Learn, updated 2026-05-20.
- OpenRouter `GET /api/v1/key`: current-key metadata including usage/limit fields, `is_free_tier`, and expiry information.
- OpenRouter API key references: standard errors include 401/429 on key endpoints and documented daily/weekly/monthly reset metadata for managed key limits.
- OpenRouter API/SDK error references: typed 401, 402, 403, 408, 429, 500, 502, 503, 524, and 529 classes inform the conservative failure classifier.

The runtime implementation must re-check provider behavior if OpenRouter documentation changes before implementation or release certification.
