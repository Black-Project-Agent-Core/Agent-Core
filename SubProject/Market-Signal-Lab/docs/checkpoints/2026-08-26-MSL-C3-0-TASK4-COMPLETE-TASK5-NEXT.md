# Market Signal Lab — C3.0 Task 4 Complete / Task 5 Next

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Executor:** Agent Core
**Current implementation HEAD:** `7c95520` — `feat: enforce C3 evidence stage ceiling`
**Status:** C3.0 Tasks 1–4 COMPLETE / VERIFIED — Task 5 NEXT

## Task 4 completed

Added:
- `internal/evidence/stage.go`
- `internal/evidence/stage_test.go`

The C3.0 stage policy now enforces:
- composition claims remain `COMPOSITION_ONLY`;
- movement requires at least 2 comparable windows, compatible scope, and comparable window duration before reaching `MOVEMENT_INDICATION`;
- more temporal depth such as 6 or 20 comparable windows still cannot exceed `MOVEMENT_INDICATION`;
- movement without the deterministic prerequisites falls back to `COMPOSITION_ONLY` with `LIMITED_TEMPORAL_DEPTH`;
- peer-relative claims may inherit a C3 stage, but inherited `PRELIMINARY_TREND`, `ESTABLISHED_TREND`, or `SEASONALITY_CANDIDATE` are capped at `MOVEMENT_INDICATION`;
- missing or unknown inherited stage fails closed to `COMPOSITION_ONLY`;
- legacy `DirectionStage` is not part of `StageInput` and is never read by `stage.go`.

## TDD evidence

RED was observed before `stage.go` existed:

```text
go test ./internal/evidence -run 'Test(MaximumStage|UncalibratedConfidence)' -count=1
RED_EXITCODE=1
undefined: MaximumStage
undefined: StageInput
```

GREEN targeted verification:

```text
go test ./internal/evidence -run 'Test(MaximumStage|UncalibratedConfidence)' -count=1
TARGETED_EXITCODE=0

go test ./internal/evidence -count=1
EVIDENCE_PACKAGE_EXITCODE=0
```

Legacy authorization scan:

```text
internal/evidence/stage.go -> DirectionStage reference count = 0
```

## Whole-project regression evidence

Rust production analytics:

```text
cargo test --manifest-path ./engines/rust/Cargo.toml
PASS
cargo build --release --manifest-path ./engines/rust/Cargo.toml
PASS
```

Full Go regression used the freshly built C3 release worker through `MSL_RUST_WORKER`:

```text
go test -p 1 ./... -count=1
EXITCODE=0
```

Frontend/tooling regression used the pinned local Bun 1.4.0 executable:

```text
bun test frontend/tests
2 pass / 0 fail
bun run typecheck
PASS
bun run verify:frontend-generated
PASS
```

The first frontend probe only discovered that Bun was not in PATH; it was rerun with the pinned local Bun executable and passed. This was a tooling-path issue, not a source failure.

## Git evidence

Task 4 source commit:

```text
7c95520 feat: enforce C3 evidence stage ceiling
```

Remote branch verification:

```text
7c95520198488e32d33c09930f1ef7162f16cdcc refs/heads/task/c3-evidence-calibrated-model-v02-20260824
```

The isolated worktree was clean after source commit and push. `main` was not merged.

## Next exact action

Execute C3.0 Task 5 from the canonical plan: deterministic eligibility evaluator and factual reason provenance.

1. create `internal/evidence/evaluator_test.go` first and observe RED;
2. create `internal/evidence/facts.go` and `internal/evidence/evaluator.go` only after RED;
3. enforce suppression with `Value=nil` when deterministic prerequisites are missing;
4. ensure one-member PRR is suppressed with `SMALL_PEER_GROUP` rather than returning legacy neutral `50`;
5. retain values only for eligible/degraded evidence outcomes;
6. never numerically execute `TO_BE_CALIBRATED` rules;
7. unknown requirement/version combinations must error explicitly;
8. verify, commit, and push Task 5 before Task 6.

Do not change C1 numerics or C2 semantics. Confidence cannot create eligibility. Do not merge to `main`. Do not start C3.1 automatically.
