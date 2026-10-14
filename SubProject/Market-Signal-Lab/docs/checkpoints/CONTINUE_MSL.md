# Continue Market Signal Lab Across Sessions

This is the stable cross-session entry point for Market Signal Lab.

## Canonical workspace rule

`E:\Market-Signal-Lab` is the canonical integrated project root. `.worktrees` are temporary implementation/review isolation only and must be disposable after accepted work has been integrated. Stable executable/release artifacts belong under `E:\Market-Signal-Lab\release-stable`, not inside `.worktrees`.

See: `docs/project/WORKTREE_INTEGRATION_POLICY.md`.

## Start here

1. `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
2. `docs/checkpoints/2026-08-26-MSL-CANONICAL-ROOT-INTEGRATION-COMPLETE.md`
3. `docs/checkpoints/2026-08-26-MSL-STABLE-PRERELEASE-C3-3-DATA-GATE.md`
4. `docs/checkpoints/2026-08-26-MSL-RC-RELEASE-PUBLISHED.md`
5. `docs/checkpoints/2026-08-26-MSL-RC-FINAL-RELEASE-SIGNOFF.md`
6. `docs/checkpoints/2026-08-26-MSL-C3-2-INFRA-COMPLETE-EMPIRICAL-DATA-BLOCKED.md`
7. `docs/qa/rc-stability-hardening-wave1-qa.md`
8. `docs/qa/phase-c3-2-quant-calibration-lab-qa.md`
9. `docs/qa/phase-c3-1-deterministic-signal-v02-qa.md`
10. `docs/qa/phase-c3-0-evidence-constitution-qa.md`
11. `docs/checkpoints/PERMANENT_MSL_PURPOSE_GUARDRAIL.md`
12. `docs/checkpoints/PERMANENT_DEVELOPMENT_EXECUTION_SCOPE_GUARDRAIL.md`
13. inspect current branch/upstream/working tree before writing.

Repository evidence is the source of truth. Do not reconstruct settled state from chat memory.

## Current product status

```text
Phase P mapping performance                   COMPLETE / NATIVE VERIFIED
Phase I Windows installer lifecycle           COMPLETE / NATIVE VERIFIED
Secure Envato credential runtime              COMPLETE / NATIVE VERIFIED
Phase C0 Signal Truth Audit                   COMPLETE / APPROVED
Phase C1 Rust ranking parity                  COMPLETE / VERIFIED
Phase C2 semantic correction                  COMPLETE / VERIFIED
TS0/TS1 selective TypeScript/Bun foundation  COMPLETE / VERIFIED
RC baseline integration                       COMPLETE / VERIFIED
RC Stability Hardening Wave 1                 COMPLETE / VERIFIED
Elevated exact hardening Setup.exe sign-off   COMPLETE / VERIFIED
Git tag v0.3.0-alpha.6.5.3-preview.1          PUBLISHED / VERIFIED
GitHub prerelease ID 377007837                PUBLISHED / VERIFIED / 5 ASSETS
Phase C3 architecture/spec                    COMPLETE / APPROVED
Phase C3.0 Evidence Constitution Runtime      COMPLETE / VERIFIED
Phase C3.1 deterministic signal v0.2          COMPLETE / VERIFIED
Phase C3.2 Quant Calibration Lab              OFFLINE INFRASTRUCTURE COMPLETE / VERIFIED
Phase C3.3 calibrated production intelligence BLOCKED / NOT AUTHORIZED
```

## Published stable preview

The published preview is the already signed-off RC lineage. Root integration must not mutate its bytes.

```text
release tag       = v0.3.0-alpha.6.5.3-preview.1
release commit    = 0ce427406f5418aa7040e607893ec0cb788ae2f0
GitHub release id = 377007837
product source    = 498fedb0c11ee6c955306aca2199390af22cc0b8
Setup SHA-256     = CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17
app SHA-256       = 79A6671A6016AC01DABC01FAB9BD368BC629B689539BC6FDF169072075C91358
Rust SHA-256      = D7D5AD35EF9D286F1B06BF486590C5C750C535876B3DA535EB8C588D800CF63F
```

Canonical local release path:

```text
E:\Market-Signal-Lab\release-stable\
```

The stable folder is operational output, not the source of truth for Git history. Its contents are promoted byte-for-byte from the verified release artifact set and may be regenerated from the published release without changing source history.

## Integrated development source

The canonical root development branch integrates the release-hardening lineage and the accepted C3.0/C3.1/C3.2 development lineage. The published preview does not retroactively include C3 code; integration only makes the project root represent the current accepted development state.

C3 contracts remain:

```text
C2 semantic contract            = msl-semantic-contract/2
C3 evidence contract            = msl-evidence-contract/1
C3.0 requirements               = msl-evidence-requirements/1
C3.0 stage policy               = msl-evidence-stage/c3.0-1
C3.1 requirements               = msl-evidence-requirements/2
C3.1 stage policy               = msl-evidence-stage/c3.1-1
confidence                      = msl-evidence-confidence/uncalibrated-1
production analytics protocol   = msl-analytics/2
```

## C3.3 empirical-data gate

The offline C3.2 lab is implemented and verified. Existing runtime history does not contain the required later-observed outcomes.

```text
JSONL files                     = 26
non-empty rows                  = 103,644
parse failures                  = 0
files with outcome fields       = 0
strict calibration-ready files = 0
EMPIRICAL_DATA_GATE             = BLOCKED
CALIBRATION_PARAMETERS          = NOT_AUTHORIZED
NUMERIC_CONFIDENCE              = NOT_AUTHORIZED
UPPER-STAGE PROMOTION           = NOT_AUTHORIZED
C3.3                             = BLOCKED_NO_APPROVED_ARTIFACT
```

Future C3.3 work requires privacy-safe historical signal/evidence records plus later-observed outcomes under a versioned `outcomeDefinitionVersion`, an untouched chronological holdout, reproducible C3.2 evaluation, and an explicitly approved `msl-calibration-artifact/1` with `productionEligible=true`.

## Worktree lifecycle

```text
1. Create isolated worktree for implementation/review when useful.
2. Implement and locally verify inside the worktree.
3. Commit accepted work on its branch.
4. Integrate accepted branch into the canonical root integration branch.
5. Resolve root-level checkpoints/documentation so they describe combined truth.
6. Promote any stable runtime/release output to root release-stable.
7. Verify the root branch and release-stable hashes.
8. Only then may the temporary worktree be removed.
```

A worktree path must never be the only location of a stable executable, release package, final checkpoint, or operational launcher.

## Exact continuation target

```text
canonical root = E:\Market-Signal-Lab
published RC preview = STABLE / PUBLISHED / VERIFIED
current accepted development source = release hardening + C3.0/C3.1/C3.2 integrated at root
C3.3 = BLOCKED by real empirical evidence, not by a software defect
-> preserve release bytes
-> keep release-stable at root
-> collect future outcome-labelled evidence
-> do not fabricate calibration
-> do not use GitHub Actions/CI
-> do not merge main implicitly
```

## Permanent development execution scope guardrail — verbatim


Canonical source: `docs/checkpoints/PERMANENT_DEVELOPMENT_EXECUTION_SCOPE_GUARDRAIL.md`.
