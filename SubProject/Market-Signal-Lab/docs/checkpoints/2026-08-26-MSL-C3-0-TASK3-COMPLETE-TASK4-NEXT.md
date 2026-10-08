# Market Signal Lab — C3.0 Task 3 Complete / Task 4 Next

> **Historical checkpoint:** the status, pending actions, machine paths, branch names and verification below belong to the dated revision. For the imported monorepo source and continuation boundary, use [CONTINUE_MSL.md](CONTINUE_MSL.md). This record is preserved as evidence and does not authorize resuming old work or certify the current checkout.

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Current implementation HEAD:** `d75f132` — `feat: evaluate C3 scope comparability`
**Status:** C3.0 Tasks 1–3 COMPLETE / VERIFIED — Task 4 NEXT

## Task 3 completed

Added `internal/evidence/comparability.go` and `comparability_test.go` using TDD.

Truth table now enforces:
- no temporal comparison -> `NOT_APPLICABLE`;
- same non-empty CompatibilityKey -> `EXACT_MATCH`;
- explicit injected versioned declaration -> `DECLARED_COMPATIBLE`;
- otherwise -> `INCOMPATIBLE`.

Unknown detail facts remain nil. Planner/sampling/taxonomy/weighting/source/window/query/surface facts are evaluated independently from scope status.
Same CompatibilityKey does not hide a window-duration mismatch.
Production compatibility declarations remain empty in C3.0.

## Verification evidence

TDD RED was observed before `comparability.go` existed: targeted tests failed on undefined `CompareScope`, `ScopeDescriptor`, and `ScopeCompatibilityDeclaration`.

GREEN targeted verification:

```text
go test ./internal/evidence -run TestCompareScope -count=1
PASS

go test ./internal/evidence -count=1
PASS
```

Full regression used the exact C3 release worker through `MSL_RUST_WORKER` and serial package execution:

```text
go test -p 1 ./... -count=1
EXITCODE=0
```

Task 3 source commit `d75f132` was pushed to GitHub.

## Next exact action

Execute C3.0 Task 4 from the canonical plan:
1. create `internal/evidence/stage_test.go` first and observe RED;
2. create `internal/evidence/stage.go` only after RED;
3. enforce the C3.0 ceiling at `MOVEMENT_INDICATION`;
4. ignore legacy `DirectionStage` as evidence authorization;
5. verify, commit, and push Task 4 before Task 5.

Do not modify C1 numeric outputs or C2 semantics. Do not infer preliminary/established/seasonality stages in C3.0. Do not merge to `main` implicitly.
