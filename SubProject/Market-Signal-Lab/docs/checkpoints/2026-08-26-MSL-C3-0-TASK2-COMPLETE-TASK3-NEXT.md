# Market Signal Lab — C3.0 Task 2 Complete / Task 3 Next

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Current implementation HEAD:** `bfd734c` — `feat: register C3 evidence requirements`
**Status:** C3.0 Tasks 1–2 COMPLETE / VERIFIED — Task 3 NEXT

## Completed C3.0 implementation

Task 1 — evidence contract types and version registry:
- commit `881c840` — `feat: define C3 evidence contracts`
- `ContractVersion = msl-evidence-contract/1`
- `RequirementsVersion = msl-evidence-requirements/1`
- `StagePolicyVersion = msl-evidence-stage/c3.0-1`
- `ConfidenceModelVersion = msl-evidence-confidence/uncalibrated-1`
- confidence score remains null / `UNCALIBRATED`

Task 2 — five initial evidence requirements:
- commit `bfd734c` — `feat: register C3 evidence requirements`
- exactly five pinned signal/model identities registered
- exact lookup only; unknown signal/model combinations fail closed
- deterministic mathematical minima only use concrete thresholds
- preferred robustness/calibration thresholds remain explicit `TO_BE_CALIBRATED`
- product/catalog PRR peer-definition versions are pinned
- registry returns cloned requirement data so callers cannot mutate canonical state

## Verification evidence

TDD RED was observed before `requirements.go` existed: the registry tests failed on undefined `Requirements`, `Requirement`, and peer-definition constants.

GREEN verification:

```text
go test ./internal/evidence -run "Test(InitialRequirements|RequirementLookup|PeerDefinitionVersions)" -count=1
PASS
```

Final full Go regression used the compiled C3 release worker through the official `MSL_RUST_WORKER` override and serial package execution to avoid the known 50 ms fake-worker startup contention:

```text
go test -p 1 ./... -count=1
PASS — all packages
```

An earlier full-suite attempt without the correct absolute worker override produced runtime-unavailable failures. A separate stress replay also reproduced the pre-existing 50 ms fake-worker handshake timing sensitivity. No analyticsengine source or test timeout was changed because it is outside Task 2 scope.

Task 2 was pushed to GitHub branch `task/c3-evidence-calibrated-model-v02-20260824` (`881c840..bfd734c`).

## Next exact action

Execute C3.0 Task 3 from `docs/superpowers/plans/2026-08-24-msl-phase-c3-0-evidence-constitution-runtime.md`:

1. create `internal/evidence/comparability_test.go` first and observe RED;
2. create `internal/evidence/comparability.go` only after RED;
3. implement the factual scope-comparability truth table;
4. keep the production compatibility-declaration registry empty;
5. run the Task 3 targeted tests plus regression verification;
6. commit and push Task 3 before proceeding.

Do not modify frozen C1 numerics or C2 semantic aliases. Do not guess calibration thresholds. Do not start C3.1 automatically. Do not merge to `main` implicitly.
