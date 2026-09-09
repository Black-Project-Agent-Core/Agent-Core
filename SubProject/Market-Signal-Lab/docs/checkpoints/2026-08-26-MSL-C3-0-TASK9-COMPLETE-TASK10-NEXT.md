# Market Signal Lab — C3.0 Task 9 Complete / Task 10 Next

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Executor:** Agent Core
**Current implementation HEAD:** `72873bf` — `feat: expose C3 evidence API`
**Status:** C3.0 Tasks 1–9 COMPLETE / VERIFIED — Task 10 NEXT

## Task 9 completed

Added:
- `internal/web/evidence_handlers.go`
- `internal/web/evidence_handlers_test.go`

Modified:
- `internal/web/server.go`

## Additive C3 API contract

Registered without replacing the legacy `/api/evidence` route:

```text
GET  /api/evidence/requirements
GET  /api/evidence/assessments
POST /api/evidence/assessments
GET  /api/evidence/assessment
```

All C3 responses expose `contractVersion = msl-evidence-contract/1` in an additive wrapper.

Requirements response additionally exposes `requirementsVersion = msl-evidence-requirements/1` and the exact five registered requirements.

Plural GET filters:
- `assessmentId`
- `runId`
- `entityType`
- `entityId`
- `signalId`
- `signalModelVersion`
- `requirementsVersion`

Storage-backed filters combine with AND; the `assessmentId` filter is applied additively after the deterministic Store result and therefore cannot broaden any other filter.

Version behavior:
- absent `contractVersion` / `requirementsVersion` uses the current C3.0 contract;
- an explicitly unsupported evidence contract or requirements version returns HTTP 400;
- supported `requirementsVersion` also acts as the deterministic ledger filter.

POST build behavior:
- body is exactly `{ "runId": "..." }` under existing strict JSON decode rules;
- successful explicit build/persist returns HTTP 201 with a versioned wrapper and `EvidenceBuildResult`;
- unknown, empty, running, incomplete, or otherwise non-buildable runs return HTTP 422;
- malformed/unknown JSON fields remain HTTP 400.

Singular GET behavior:
- requires `runId`, `entityType`, `entityId`, and `signalId`;
- returns the latest matching persisted assessment;
- absent match -> HTTP 404;
- missing required query identity -> HTTP 400.

Method restrictions are explicit and return HTTP 405.

## C2 compatibility lock

The test uses the existing ranking HTTP API and verifies:
- `semantics.contract.version == msl-semantic-contract/2`;
- C2 semantic aliases retain their frozen numeric values;
- `evidenceStage`, eligibility, evidence confidence, and reason fields do not appear inside `semantics`.

The legacy `/api/evidence` route remains separately registered and untouched.

## TDD evidence

RED before the new C3 routes existed:

```text
go test ./internal/web -run 'TestEvidenceAPI|TestC3EvidenceDoesNotAlterC2Semantics' -count=1
TASK9_RED_EXITCODE=1
new routes -> HTTP 404
```

The C2 compatibility test itself did not fail during RED.

GREEN targeted:

```text
go test ./internal/web -run 'TestEvidenceAPI|TestC3EvidenceDoesNotAlterC2Semantics' -count=1
TASK9_GREEN_TARGETED_EXITCODE=0
```

Whole web package:

```text
go test ./internal/web -count=1
EXITCODE=0
```

Full Go regression with the verified Task 6 release Rust worker:

```text
go test -p 1 ./... -count=1
EXITCODE=0
```

`git diff --check` was clean before commit.

Task 9 changes no Rust or frontend source.

## Git evidence

Task 9 source commit:

```text
72873bf feat: expose C3 evidence API
```

Remote branch verification:

```text
72873bf827805988320638ec54cde6d508cadc04 refs/heads/task/c3-evidence-calibrated-model-v02-20260824
```

`main` was not merged. The dirty root checkout was not used.

## Next exact action

Execute C3.0 Task 10: factual evidence-qualification UI and hard narrative gate.

Required exact behavior from the canonical plan:

```text
COMPOSITION_ONLY + non-suppressed -> Current observed composition only.
MOVEMENT_INDICATION + DEGRADED    -> Early observed movement indication; evidence limitations apply.
SUPPRESSED                        -> Directional signal withheld because required evidence is unavailable or incompatible.
```

The suppressed branch must be evaluated before any score/stage formatting so a high legacy score can never leak stronger prose.

Add exact bilingual i18n keys/copy, explicit Build and Refresh behavior, C3 evidence confidence only (`UNCALIBRATED`, no legacy confidence), factual reason codes only, and locale parity tests.

Do not change C1 numerics, C2 semantics, existing C2 labels/contracts, or formal release state. Do not merge `main`. Do not start C3.1 automatically.
