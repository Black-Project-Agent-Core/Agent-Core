# Market Signal Lab — C3.0 Task 5 Complete / Task 6 Next

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Executor:** Agent Core
**Current implementation HEAD:** `37eaf52` — `feat: evaluate C3 signal eligibility`
**Status:** C3.0 Tasks 1–5 COMPLETE / VERIFIED — Task 6 NEXT

## Task 5 completed

Added:
- `internal/evidence/facts.go`
- `internal/evidence/evaluator.go`
- `internal/evidence/evaluator_test.go`

The deterministic evidence evaluator now:
- consumes typed pointer-based `EvidenceFacts` so missing differs from concrete zero;
- validates exact registered signal/model identity and the requirements/stage/confidence contract versions;
- executes only `RuleClassDeterministic` rules in C3.0;
- leaves `TO_BE_CALIBRATED` rules declared but numerically unexecuted;
- treats a missing required deterministic fact as `SUPPRESSED` with `MISSING_REQUIRED_COMPONENT`;
- applies factual requirement reason codes when a present deterministic fact fails;
- supports deterministic `INFO`, `DEGRADE`, and `SUPPRESS` dispositions without allowing degradation to override suppression;
- invokes `MaximumStage` after deterministic prerequisite evaluation;
- attaches stage reason codes without using legacy `DirectionStage` as authorization;
- forces `Value=nil` for every `SUPPRESSED` result regardless of the frozen legacy/C2 value;
- retains the approved value for `ELIGIBLE` and `DEGRADED` results;
- deduplicates and lexicographically sorts reason codes for deterministic output;
- uses `UncalibratedConfidence()` exclusively in C3.0;
- copies assessment identity, evidence facts, scope comparability, provenance, and assessed time into the additive `EvidenceAssessment`.

## TDD evidence

RED was observed before `facts.go` / `evaluator.go` existed:

```text
go test ./internal/evidence -run TestEvaluate -count=1
RED_EXITCODE=1
undefined: Evaluate
undefined: EvidenceFacts
undefined: AssessmentContext
```

GREEN targeted and package verification:

```text
go test ./internal/evidence -run TestEvaluate -count=1
GREEN_TARGETED_EXITCODE=0

go test ./internal/evidence -count=1
EVIDENCE_PACKAGE_EXITCODE=0
```

The Task 5 truth table includes explicit tests for:
- movement without comparable history -> `SUPPRESSED`, `Value=nil`;
- one-member PRR with legacy `50` -> `SUPPRESSED`, `Value=nil`, `SMALL_PEER_GROUP`;
- valid structural composition -> `ELIGIBLE`, `COMPOSITION_ONLY`, value retained;
- synthetic deterministic shortfall with `DEGRADE` -> `DEGRADED`, value retained;
- zero-valued `TO_BE_CALIBRATED` facts -> no invented numeric degradation;
- unsupported signal/model or contract versions -> explicit error;
- missing required deterministic fact -> `MISSING_REQUIRED_COMPONENT`;
- concrete zero -> evaluated as zero, not missing;
- duplicated reasons -> deduplicated and sorted;
- catalog PRR without movement-eligible inherited C3 stage -> `SUPPRESSED` with `INSUFFICIENT_MOVEMENT_ELIGIBILITY`;
- context/fact copying and uncalibrated confidence identity.

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

`git diff --check` was clean before source commit.

## Git evidence

Task 5 source commit:

```text
37eaf52 feat: evaluate C3 signal eligibility
```

Remote branch verification:

```text
37eaf529493f69b125e397ead4159015dd456ce8 refs/heads/task/c3-evidence-calibrated-model-v02-20260824
```

`main` was not merged. The dirty root checkout was not used for implementation.

## Next exact action

Execute C3.0 Task 6 from the canonical plan: adapt the five frozen C1 values into evidence candidates without recomputation.

1. create `internal/evidence/representative_test.go` first and observe RED;
2. create `internal/evidence/representative.go` only after RED;
3. map the five approved signal IDs to the exact existing frozen C1/C2 source fields with distinctive-value identity tests;
4. do not import or invoke `internal/analyticsengine` and do not recompute any Rust-owned numeric value;
5. preserve product PRR peer universe = same current run/window/model/CatalogID;
6. preserve catalog PRR peer universe = same run/window/model and `Platform|ContentType|CatalogLevel`;
7. ensure `ComparableProducts==0` suppresses evidence-qualified Directional Breadth even when legacy `ExposureBreadth=50` remains frozen;
8. ensure structural `SampleSize==0` suppresses evidence-qualified composition;
9. record `ZERO_BASELINE_DELTA` only from explicit upstream zero-denominator evidence, never infer it from displayed value `100`;
10. verify, commit, and push Task 6 before Task 7.

Do not change C1 numerics or C2 semantics. Do not start C3.1 automatically. Do not merge to `main`.
