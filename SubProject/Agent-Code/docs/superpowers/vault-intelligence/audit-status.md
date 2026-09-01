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

Status: **PENDING**

Locked formula:

- Health: 35%
- Reliability: 25%
- Quota: 20%
- Latency: 10%
- Recent Success: 10%

Required before completion:

- [ ] Deterministic scoring engine
- [ ] Decision explanation / reason breakdown
- [ ] Deterministic fallback mode preserved
- [ ] Edge-case tests
- [ ] No change to frozen Vault security boundary

## Phase 3 — Credential Event System

Status: **PENDING**

Required events include credential added/removed/healthy/warning/cooldown/recovered/expired/selected, plus persistence and viewer support.

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
