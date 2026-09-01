# Vault Intelligence Upgrade — Living Audit Status

Project: Agent Core / Agent Code Credential Vault
Branch: `feature/vault-intelligence-layer`
Stage: Vault standalone enhancement
Rule: Super Runtime integration remains blocked until Vault certification is complete.

## Current Baseline

Vault Core: **STABLE CANDIDATE**

Completed baseline capabilities:

- [x] Secure credential storage
- [x] Encryption/protected-secret boundary
- [x] OpenRouter current-key validation
- [x] Rotation state machine
- [x] Fail-closed corruption handling
- [x] Synthetic rotation stress coverage
- [x] Credential security boundary scan

Still pending baseline acceptance outside the intelligence work:

- [ ] Native Windows DPAPI acceptance
- [ ] Full live OpenRouter runtime failover

## Phase 0 — Baseline Lock & Contract Freeze

Status: **DONE**

- [x] Existing Vault security/rotation/validation contract frozen in `current-contract.md`
- [x] `npm run test:vault-baseline` created
- [x] Baseline command covers credential security scan, credential-core, Tauri contract, and focused Vault frontend regression
- [x] Baseline checkpoint published to the feature branch

Latest verified Phase 0 baseline before Phase 1:

- credential-core: 45 / 45 PASS
- frontend focused: 13 / 13 PASS
- Tauri contract: PASS
- credential-security scan: PASS
- production build: PASS

## Phase 1 — Credential Intelligence Data Model

Status: **DONE**

Implemented `CredentialProfile` metadata:

- `key_id`
- provider metadata (`OPENROUTER` is the only current provider type)
- `health_score`
- `reliability_score`
- `latency_score`
- `quota_score`
- `confidence_score`
- `last_observed_at_utc_ms`
- `updated_at_utc_ms`

Persistence architecture:

- Vault schema upgraded additively from v1 to v2
- New `vault_credential_profiles` table is separate from protected-secret storage
- Scores are bounded to `0..=100` and non-finite values are rejected
- Profiles are keyed by credential id
- Profile rows cascade with credential deletion
- Existing v1 Vaults migrate to v2 without losing credential records
- Restart recovery restores the same profile metadata

Acceptance:

- [x] Schema created
- [x] Profile create/update persistence PASS
- [x] Restart recovery PASS
- [x] Existing v1 → v2 migration PASS
- [x] Invalid score rejection PASS
- [x] Metadata-only serialization PASS
- [x] Plaintext canary absent from SQLite/WAL after profile persistence PASS
- [x] Existing rotation behavior unchanged

Fresh Phase 1 verification:

- credential-core: **49 / 49 PASS**
- synthetic rotation: **100,013 transitions** completed in the baseline suite
- `npm run test:vault-baseline`: PASS
- credential-security scan: PASS
- Tauri contract: PASS
- focused Vault frontend: **13 / 13 PASS**
- `npm run build`: PASS
- `git diff --check`: PASS

## Phase 2 — Intelligent Credential Scoring Engine

Status: **DONE — STANDALONE**

Locked formula:

- Health: 35%
- Reliability: 25%
- Quota: 20%
- Latency: 10%
- Recent Success: 10%

Implemented:

- [x] Deterministic weighted scoring engine
- [x] Decision explanation with per-component contribution
- [x] Deterministic best-candidate ranking
- [x] Stable slot-index tie-break for equal scores
- [x] Recent Success derived deterministically from last success/failure timestamps
- [x] Neutral Recent Success = 50 when no outcome history exists
- [x] Empty candidate and invalid/non-finite score edge cases rejected
- [x] Existing `CredentialManager::acquire` round-robin path remains unchanged and available as the frozen deterministic baseline
- [x] No change to protected-secret or provider-validation boundaries

Fresh Phase 2 verification:

- intelligence focused: **4 / 4 PASS**
- credential-core unit tests: **49 / 49 PASS**
- credential-core intelligence integration: **4 / 4 PASS**
- `npm run test:vault-baseline`: PASS
- credential-security scan: PASS
- Tauri contract: PASS
- focused Vault frontend: **13 / 13 PASS**
- `npm run build`: PASS
- `git diff --check`: PASS

The intelligent selector is deliberately standalone at this stage. It can make and explain a credential decision, while the legacy rotation API remains the default path until the later lease/integration phase explicitly adopts intelligence.

## Phase 3 — Credential Event System

Status: **REMOTE VERIFIED**

Implementation checkpoint: `763f8e6553875120da69f25678e1a4251441e1e2`

Publication readback: local SHA == `origin/feature/vault-intelligence-layer` == implementation checkpoint.

Implemented event vocabulary and semantics:

- `CredentialAdded`
- `CredentialRemoved`
- `CredentialHealthy`
- `CredentialCooldown`
- `CredentialRecovered`
- `CredentialExpired`
- `CredentialSelected`
- `CredentialWarning` remains reserved for Phase 4 predictive-warning transitions rather than being emitted as generic failure noise

Persistence and safety:

- Vault schema upgraded additively from v2 to v3
- `vault_credential_events` is append-only and metadata-only
- event reads are bounded to 1..=500 rows
- add/remove mutations and their events are transaction-coupled
- rotation state/cursor mutations and their events are transaction-coupled
- OpenRouter probe state mutations and emitted events are transaction-coupled
- provider response bodies and Authorization data are never stored in event rows
- existing v2 key/profile/protected-blob state survives v3 migration unchanged

OpenRouter probe event semantics:

- healthy 200 → `CredentialHealthy`
- rehabilitation from invalid/quarantined + healthy 200 → `CredentialRecovered` then `CredentialHealthy`
- exhausted/expired metadata → `CredentialExpired`
- explicit 429 retry hint → `CredentialCooldown`
- 429 without retry hint → no invented provider deadline/event
- provider transient/timeout → no false key-health event
- malformed/oversized provider response → no event payload/body persistence

Frontend observability:

- bounded metadata-only recent credential activity viewer added to Credential Vault
- no reveal/copy/export-secret action introduced

Fresh Phase 3 verification before publication:

- credential-core unit tests: **60 / 60 PASS**
- event integration tests: **1 / 1 PASS**
- intelligence integration tests: **4 / 4 PASS**
- synthetic rotation: **100,013 transitions PASS**
- `npm run test:vault-baseline`: PASS
- credential-security scan: PASS
- Tauri contract: PASS
- focused Vault/App frontend: **14 / 14 PASS**
- `npm run build`: PASS
- `git diff --check`: PASS
- changed-production forbidden secret-surface scan: PASS

## Phase 4 — Predictive Usage Intelligence

Status: **PENDING**

Required: usage tracking, consumption analysis, exhaustion prediction, warning state.

## Phase 5 — Shadow Health Monitor

Status: **PENDING**

Allowed provider operation: `GET /api/v1/key` only.
Model inference requests remain forbidden for health monitoring.

## Phase 6 — Credential Lease System

Status: **PENDING**

Super Runtime must eventually receive an opaque credential lease handle rather than plaintext API keys.

## Phase 7 — Vault Observability Dashboard

Status: **PENDING**

Required: credential health/status/score/quota/latency, activity events, and decision explanation.

## Phase 8 — Vault Certification Before Super Runtime Integration

Status: **NOT STARTED**

Super Runtime integration remains blocked until security, rotation, intelligence, monitoring, and audit/debug gates are all certified.

## Integration Decision

Do not add more providers yet.

Priority remains:

1. Stabilize Vault Intelligence
2. Certify standalone behavior
3. Prepare Super Runtime contract
4. Integrate Super Runtime + Vault
5. Add additional providers later

## Audit Log

### 2026-09-01 — Phase 0 baseline lock

- Frozen current Vault contract.
- Added reproducible `test:vault-baseline` gate.
- Published baseline checkpoint before intelligence mutation.

### 2026-09-01 — Phase 1 Credential Profile

- Added additive Vault schema v2 and credential intelligence profiles.
- Verified v1 migration, persistence, restart recovery, score bounds, and secret boundary.
- Full Vault baseline remained green after the change.

### 2026-09-01 — Phase 2 Intelligent Scoring

- Added deterministic 35/25/20/10/10 scoring with contribution-level explanations.
- Added deterministic best-candidate ranking and slot-index tie-breaking.
- Derived Recent Success from existing success/failure history without a new provider call.
- Preserved the existing round-robin rotation path unchanged as the deterministic baseline.
- Full Vault baseline remained green after the change.

### 2026-09-01 — Phase 3 Credential Event System

- Added additive schema v3 event persistence with bounded metadata-only reads.
- Transaction-coupled add/remove, rotation, and OpenRouter probe state mutations with their audit events.
- Added `Healthy`, `Recovered`, `Cooldown`, `Expired`, and `Selected` lifecycle observability without exposing secrets/provider bodies.
- Reserved `CredentialWarning` for Phase 4 predictive intelligence rather than generic key failure noise.
- Added bounded Credential Vault activity viewer and Tauri event-list contract.
- Verified v2→v3 migration preserves keys, profiles, and protected blob bytes/checksum.
- Full Vault baseline, production build, and secret-boundary scans remained green before publication.
