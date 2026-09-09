# Market Signal Lab — C3.0 Task 7 Complete / Task 8 Next

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Executor:** Agent Core
**Current implementation HEAD:** `59772ca` — `feat: persist C3 evidence assessments`
**Status:** C3.0 Tasks 1–7 COMPLETE / VERIFIED — Task 8 NEXT

## Task 7 completed

Added:
- `internal/storage/evidence_assessment_store.go`
- `internal/storage/evidence_assessment_store_test.go`

Canonical C3 evidence ledger:

```text
history/signal_evidence_assessments.jsonl
```

The Store now exposes:
- `AppendSignalEvidenceAssessment`
- `AppendSignalEvidenceAssessments`
- `SignalEvidenceAssessments`
- `LatestSignalEvidenceAssessment`

Persistence behavior:
- append-only JSONL only; no database introduced;
- non-empty `assessmentId` is required;
- nested `assessment.assessmentId`, when present, must match the record identity;
- batch and single append are idempotent by `assessmentId`;
- duplicate IDs in the same batch keep the first durable row;
- duplicate IDs remain idempotent after Store reopen because existing assessment IDs are rebuilt from the canonical ledger itself;
- filters combine with AND across run/entity/signal/model/requirements dimensions;
- rows sort by `AssessedAt`, then `AssessmentID`;
- `Limit` follows existing Store convention after deterministic sorting;
- `LatestSignalEvidenceAssessment` ignores filter Limit and returns the actual latest matching row;
- malformed ledger rows and persistence failures propagate as errors.

Eligible and suppressed rows round-trip independently. Suppressed rows preserve `ValuePresent=false`, nil value, factual reasons, requirements version, and uncalibrated confidence.

## TDD evidence

RED before storage implementation:

```text
go test ./internal/storage -run 'TestSignalEvidence|TestC3EvidenceDoesNotRewrite' -count=1
TASK7_RED_EXITCODE=1
AppendSignalEvidenceAssessment undefined
AppendSignalEvidenceAssessments undefined
SignalEvidenceAssessments undefined
LatestSignalEvidenceAssessment undefined
```

GREEN targeted/package verification:

```text
go test ./internal/storage -run 'TestSignalEvidence|TestC3EvidenceDoesNotRewrite' -count=1
TASK7_GREEN_TARGETED_EXITCODE=0

go test ./internal/storage -count=1
STORAGE_PACKAGE_EXITCODE=0
```

## Legacy byte-immutability gate

Tests create and capture exact bytes for:

```text
history/product_snapshots.jsonl
history/catalog_snapshots.jsonl
history/market_index_snapshots.jsonl
```

After C3 evidence append, read/filter, and latest operations, all three files must remain byte-for-byte identical. The gate passed. Static source scan also confirms the new evidence store never names those legacy files as write targets.

## Full regression evidence

Full Go regression used the previously verified fresh Task 6 release Rust worker:

```text
go test -p 1 ./... -count=1
EXITCODE=0
```

Task 7 changes no Rust or frontend source. The Task 6 Rust test/release build and frontend/typecheck/generated-output gates had already passed immediately before this storage-only task, and full Go with the same release worker remained green after Task 7.

`git diff --check` was clean before source commit.

## Git evidence

Task 7 source commit:

```text
59772ca feat: persist C3 evidence assessments
```

Remote branch verification:

```text
59772caa5e69f183cbaef4f4fafed5cdcee510d2 refs/heads/task/c3-evidence-calibrated-model-v02-20260824
```

`main` was not merged. The dirty root checkout was not used.

## Next exact action

Execute C3.0 Task 8: orchestrate representative assessments in the app layer.

Required TDD cases:
- unknown run ID -> error;
- current run not completed -> error;
- missing current plan -> error;
- no prior compatible run -> movement rows persisted `SUPPRESSED`/nil;
- one-product catalog -> product PRR `SUPPRESSED`/nil;
- one-catalog catalog-peer universe -> catalog PRR `SUPPRESSED`/nil;
- second identical build -> same assessment IDs and no duplicate ledger rows.

Task 8 must load only persisted completed runs/plans, C1 snapshot/index rows, and catalog nodes; it must not invoke Rust or recompute the five frozen values. Unknown evidence dimensions remain nil rather than relabeling legacy `Coverage` or `Confidence`. Deterministic assessment identity is SHA-256-based from run/entity/signal/model/requirements identity. All candidates must be evaluated before batch persistence; `Persisted=true` is returned only after successful batch persistence.

Do not change C1 numerics, C2 semantics, legacy history, or formal release state. Do not merge `main`. Do not start C3.1 automatically.
