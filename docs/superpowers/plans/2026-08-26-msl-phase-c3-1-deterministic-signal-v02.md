# Market Signal Lab — Phase C3.1 Deterministic Signal v0.2 Implementation Plan

**Date:** 2026-08-26
**Baseline:** `ded29d898d8edfc11d3987ac09acb0ebf67ef17a`
**Branch:** `task/c3-1-deterministic-signal-v02-20260826`
**Design:** `docs/superpowers/specs/2026-08-26-msl-phase-c3-1-deterministic-signal-v02-design.md`

## Global constraints

- Preserve C1 formulas/history and exact fixture SHA-256 values.
- Preserve C2 `msl-semantic-contract/2` source/identity.
- Preserve C3.0 `msl-evidence-requirements/1` records and tests.
- New C3.1 numerical math is Rust-only in production.
- No calibrated thresholds; all unresolved sample/reliability/coverage thresholds remain `TO_BE_CALIBRATED`.
- Evidence stage ceiling remains `MOVEMENT_INDICATION`.
- No implicit main merge and no UAC bypass.
- TDD RED → GREEN for every production change.

## Task 1 — Baseline + design/plan checkpoint

- Verify clean C3.1 worktree at C3.0 final baseline.
- Record design decisions and implementation plan.
- Re-run focused C3.0/C1/C2 baseline gates.
- Commit/push design+plan only after green baseline.

## Task 2 — Freeze new operation identities with RED wire tests

Files:
- `internal/analyticsengine/protocol_v2.go`
- `internal/analyticsengine/c3_v02_schema.go` (new)
- `internal/analyticsengine/c3_v02_wire.go` (new)
- `internal/analyticsengine/c3_v02_wire_test.go` (new)
- Rust protocol/schema tests.

Lock operation IDs 9–13 and schema 1. Existing IDs 1–8 and existing golden frames must remain unchanged.

## Task 3 — Rust deterministic kernels

Files:
- `engines/rust/src/c3_v02.rs` (new)
- `engines/rust/src/schema_v2.rs`
- `engines/rust/src/protocol_v2.rs`
- Rust unit/integration tests.

Implement and test:
- Competition Acceleration v0.2;
- ODMI + Momentum Magnitude v0.2;
- PRR v0.2 tie-aware percentile, reject <2 peers;
- Author Concentration Change v0.2;
- movement weighted/equal/divergence family.

Negative tests: zero comparable, invalid counts, NaN/Inf, non-positive masses, missing subject, one peer, no movement child.

## Task 4 — Worker dispatch + Go execution clients

Files:
- Rust worker/batch dispatcher;
- `internal/analyticsengine/batch.go`;
- `internal/analyticsengine/c3_v02_client.go` (new);
- client/worker integration tests.

All five operations must execute through production `msl-analytics/2`. No direct Go formula copies.

## Task 5 — C3.1 evidence version registry

Files:
- `internal/evidence/contracts.go`
- `internal/evidence/requirements.go`
- `internal/evidence/evaluator.go`
- tests.

Add:
- `msl-evidence-requirements/2`;
- `msl-evidence-stage/c3.1-1`;
- C3.1 signal registry;
- `catalog-odmi-peer/1` peer definition.

Version-1 requirement lookup and C3.0 assessment IDs must remain unchanged.

## Task 6 — C3.1 facts and candidate adapters

Files:
- `internal/evidence/c3_v02.go` (new)
- tests.

Candidates accept Rust-produced values only and attach evidence facts/provenance. No recomputation.

## Task 7 — Historical orchestration for three-window and dynamic claims

Files:
- `internal/app/evidence_service.go`
- `internal/app/c3_v02_evidence.go` (new)
- tests.

Build current/prior/prior-prior comparable chains from persisted runs and snapshots. Compute Rust operations via production executor, then evaluate evidence and append records only after the build batch succeeds.

Must suppress acceleration when three windows are unavailable. Must suppress dynamic concentration when prior attribution is missing/incompatible.

## Task 8 — ODMI peer envelope and movement aggregation

- Build sibling catalog peer universes from persisted catalog hierarchy.
- Rank ODMI only after ODMI value is evidence-qualified/non-suppressed.
- Build movement aggregates from child ODMI records with positive product mass.
- Never allow PRR → ODMI circularity.
- Signed divergence requires at least two movement-eligible children.

## Task 9 — API version selection and compatibility

Files:
- `internal/web/evidence_handlers.go`
- tests.

`GET /api/evidence/requirements` without version remains C3.0-compatible. Explicit `requirementsVersion=msl-evidence-requirements/2` returns the C3.1 registry/version wrapper. Unsupported versions fail explicitly.

Assessment list remains mixed-version and filterable by `requirementsVersion`.

## Task 10 — Presentation integration

Existing Evidence Qualification table remains the canonical UI surface. Add localized signal labels for C3.1 IDs and ensure:
- suppression narrative is still evaluated first;
- confidence remains `UNCALIBRATED`;
- score magnitude cannot generate stronger prose;
- no C2 labels are changed.

## Task 11 — Full automated acceptance

Run:
- new Rust C3.1 unit/integration tests;
- focused evidence/storage/app/web/i18n suites;
- C3.0 full focused suite;
- C1 fixture fingerprint check;
- C2 semantics source/identity freeze;
- existing operations/golden-frame compatibility;
- full `cargo test` + release build;
- frontend Bun tests, typecheck, generated-diff;
- full `go test -p 1 ./... -count=1` against fresh release worker;
- `go vet ./...`;
- secret/generated-artifact hygiene.

Write ignored `dist/c3-1-acceptance/automated.json` from observed results only.

## Task 12 — Windows staged-native acceptance

Build exact Windows candidate from current source. Launch staged payload only (non-elevated), verify:
- host healthy;
- production analytics healthy / rust-production / msl-analytics/2;
- C3.0 requirements version 1 still queryable;
- C3.1 requirements version 2 exact registry;
- evidence UI shipped;
- current Setup literal install=false and uninstallVerified=false unless an interactive elevated replay actually occurs.

Write ignored `dist/c3-1-acceptance/native.json`.

## Task 13 — Whole-branch review + closeout

- whole-branch spec/quality review;
- no open Critical/Important findings;
- final QA doc `docs/qa/phase-c3-1-deterministic-signal-v02-qa.md`;
- update `CURRENT_MSL_CHECKPOINT.md` and `CONTINUE_MSL.md`;
- record C3.1 COMPLETE / VERIFIED only from observed evidence;
- push working branch and verify remote SHA equals local;
- open C3.2 design/plan gate, but do not invent calibration data.
