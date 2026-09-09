# Market Signal Lab — C3.0 Task 8 Complete / Task 9 Next

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Executor:** Agent Core
**Current implementation HEAD:** `1a3bf60` — `feat: orchestrate C3 evidence assessments`
**Status:** C3.0 Tasks 1–8 COMPLETE / VERIFIED — Task 9 NEXT

## Task 8 completed

Added:
- `internal/app/evidence_service.go`
- `internal/app/evidence_service_test.go`

Extended:
- `internal/evidence/contracts.go` with deterministic `AssessmentID(...)`
- `internal/evidence/contracts_test.go` with stable-identity tests

## App-layer behavior now verified

`BuildEvidenceAssessments(runID)` now:
- requires a non-empty, persisted MarketMap run;
- rejects unknown run IDs;
- rejects current runs that are not `completed`;
- requires the persisted current plan;
- reads only persisted MarketMap runs/plans, C1 catalog/product snapshots, structural index snapshots, and CatalogNodes;
- does not call analytics runtime, analyticsengine, Rust, or recompute the five frozen source values;
- does not relabel legacy `Coverage` or `Confidence` fields into C3 evidence facts;
- locates the latest earlier completed run and its plan for factual scope comparison;
- filters approved C3 source model identities exactly;
- uses persisted `MarketMapRunID` plus ranking-window identity for C1 row selection;
- constructs exact product peer groups from same run/window/model/CatalogID;
- constructs exact catalog peer groups from same run/window/model and CatalogNode `Platform|ContentType|CatalogLevel`;
- evaluates all candidates before one batch persistence call;
- returns `Persisted=true` only after the batch append succeeds;
- produces stable assessment IDs across identical rebuilds;
- relies on Task 7 `assessmentId` idempotence so rebuilding the same run does not duplicate ledger rows.

Movement evidence remains fail-closed:
- no prior usable run/snapshot -> one comparable window -> movement signals suppressed/nil;
- prior compatible run + matching source snapshot + comparable window duration -> C3 movement stage may reach `MOVEMENT_INDICATION`;
- legacy run/snapshot Coverage/Confidence values remain ignored by the evidence fact layer.

Peer-relative evidence remains fail-closed:
- one-product CatalogID universe -> product PRR suppressed/nil with `SMALL_PEER_GROUP`;
- one-catalog `Platform|ContentType|CatalogLevel` universe -> catalog PRR suppressed/nil with `SMALL_PEER_GROUP`.

## Deterministic assessment identity

`AssessmentID(runID, entityType, entityID, signalID, modelVersion, requirementsVersion)` hashes the exact identity tuple with SHA-256 using a delimiter-separated canonical byte string and returns an `eva_` prefix plus a stable truncated hexadecimal digest.

Tests prove:
- the same tuple always returns the same ID;
- each identity component changes the ID when changed independently.

## TDD evidence

RED before Task 8 implementation:

```text
go test ./internal/app -run 'Test(BuildEvidence|AssessmentID|EvidenceService)' -count=1
TASK8_RED_EXITCODE=1
BuildEvidenceAssessments undefined
AssessmentID undefined
```

GREEN targeted:

```text
go test ./internal/app -run 'Test(BuildEvidence|AssessmentID|EvidenceService)' -count=1
TASK8_GREEN_TARGETED_EXITCODE=0
```

A first broad package regression without `MSL_RUST_WORKER` failed only because existing app integration tests require the production Rust worker. No Task 8 targeted test failed. The package gate was rerun with the verified Task 6 release worker and passed:

```text
go test ./internal/evidence ./internal/storage ./internal/app -count=1
TASK8_PACKAGES_WITH_RUST_EXITCODE=0
```

Static guard verification:

```text
internal/app/evidence_service.go references to:
  RequireAnalyticsRuntime = 0
  analyticsengine         = 0
  MSL_RUST_WORKER         = 0
  .Coverage               = 0
  .Confidence             = 0
```

All candidate evaluations occur before the single `AppendSignalEvidenceAssessments(records)` persistence call.

## Full regression evidence

Full Go regression using the verified Task 6 release Rust worker:

```text
go test -p 1 ./... -count=1
EXITCODE=0
```

`git diff --check` was clean before commit.

Task 8 changes no Rust or frontend source; the fresh Task 6 Rust test/release-build and frontend/typecheck/generated-output gates remain the immediately inherited baseline while full Go stayed green after Task 8.

## Git evidence

Task 8 source commit:

```text
1a3bf60 feat: orchestrate C3 evidence assessments
```

Remote branch verification:

```text
1a3bf60a5255c48eb1d3ceb2eb039f61ae8ecaf4 refs/heads/task/c3-evidence-calibrated-model-v02-20260824
```

`main` was not merged. The dirty root checkout was not used.

## Next exact action

Execute C3.0 Task 9 from the canonical plan. Read the exact Task 9 section before implementation, then use TDD RED→GREEN and preserve the additive C3 boundary. Do not infer API shape from memory if the plan differs.

Do not change C1 numerics, C2 semantics, legacy history rows, or formal release state. Do not merge `main`. Do not start C3.1 automatically.
