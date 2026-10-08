# Market Signal Lab — Current Continuation Checkpoint

**Checkpoint:** 2026-08-26 (Asia/Jakarta)
**Canonical workspace policy:** `E:\Market-Signal-Lab` is the project root. `.worktrees` are temporary isolation only.
**Integrated branch:** `integration/root-current-20260826`
**Status:** ROOT INTEGRATION COMPLETE / LOCALLY VERIFIED — RC PRERELEASE PUBLISHED / VERIFIED — C3.2 COMPLETE / VERIFIED — C3.3 EMPIRICAL-DATA BLOCKED

## Canonical handoffs

- Stable release publication: `docs/checkpoints/2026-08-26-MSL-RC-RELEASE-PUBLISHED.md`
- RC final sign-off: `docs/checkpoints/2026-08-26-MSL-RC-FINAL-RELEASE-SIGNOFF.md`
- RC hardening: `docs/checkpoints/2026-08-23-MSL-RC-HARDENING-WAVE1.md`
- C3 stable/data-gate handoff: `docs/checkpoints/2026-08-26-MSL-STABLE-PRERELEASE-C3-3-DATA-GATE.md`
- C3.2 empirical gate: `docs/checkpoints/2026-08-26-MSL-C3-2-INFRA-COMPLETE-EMPIRICAL-DATA-BLOCKED.md`
- C3.2 QA: `docs/qa/phase-c3-2-quant-calibration-lab-qa.md`
- C3.1 QA: `docs/qa/phase-c3-1-deterministic-signal-v02-qa.md`
- C3.0 QA: `docs/qa/phase-c3-0-evidence-constitution-qa.md`
- Canonical root integration completion: `docs/checkpoints/2026-08-26-MSL-CANONICAL-ROOT-INTEGRATION-COMPLETE.md`
- Worktree/root policy: `docs/project/WORKTREE_INTEGRATION_POLICY.md`

## Current truth

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
Published preview includes C3.0-C3.2          NO — C3 remains development lineage
```

## Published stable preview identity

The signed-off release remains immutable and is not rebuilt by root integration.

```text
release tag       = v0.3.0-alpha.6.5.3-preview.1
release commit    = 0ce427406f5418aa7040e607893ec0cb788ae2f0
GitHub release id = 377007837
product source    = 498fedb0c11ee6c955306aca2199390af22cc0b8
Setup SHA-256     = CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17
app SHA-256       = 79A6671A6016AC01DABC01FAB9BD368BC629B689539BC6FDF169072075C91358
Rust SHA-256      = D7D5AD35EF9D286F1B06BF486590C5C750C535876B3DA535EB8C588D800CF63F
```

Stable runtime artifacts are promoted to `E:\Market-Signal-Lab\release-stable\` and SHA-256 verified. They no longer depend on a `.worktrees` path for long-term availability.

## Integrated development lineage

The canonical root integration combines:

```text
RC hardening/documentation head = b82fac060d69d2e9dde5871edfc90c56f1b33544
C3.2 development head           = ce02455f284c8e76c3513bed57a9529ef3d93a83
merge base                      = 498fedb0c11ee6c955306aca2199390af22cc0b8
```

C3.1 extends the production analytics protocol additively for development. C3.2 remains an offline Python calibration lab and does not move Python into production runtime.

## Root integration verification

Observed locally on the combined integration tree, with no GitHub Actions/CI:

```text
Rust full cargo test                 PASS
Rust release build                   PASS
Go full repository test ./...        PASS
Bun frozen install                   PASS
TypeScript typecheck                 PASS
Frontend tests                       2/2 PASS
Generated frontend drift check       PASS
Python calibration lab unittest      8/8 PASS
Python compileall                    PASS
git diff --check                     PASS
merge conflicts                      0 remaining
```

This verification applies to the integrated development source. It does not rebuild, retag, or replace the already published RC preview bytes.

## C3.3 empirical gate

Observed privacy-safe audit:

```text
JSONL files                     = 26
non-empty rows                  = 103,644
parse failures                  = 0
files with required outcomes    = 0
strict calibration-ready files = 0
EMPIRICAL_DATA_GATE             = BLOCKED
CALIBRATION_PARAMETERS          = NOT_AUTHORIZED
NUMERIC_CONFIDENCE              = NOT_AUTHORIZED
UPPER_STAGE_PROMOTION           = NOT_AUTHORIZED
C3.3                             = BLOCKED_NO_APPROVED_ARTIFACT
```

Do not fabricate outcomes, approve synthetic calibration, or relabel historical runtime rows as later-observed outcomes.

## Root/worktree invariant

```text
E:\Market-Signal-Lab                 = canonical integrated project checkout
E:\Market-Signal-Lab\release-stable  = canonical local stable runtime/artifact location
E:\Market-Signal-Lab\dist\.worktrees = disposable implementation isolation only
```

A worktree may be created for safe implementation, review, or merge preparation. Once work is accepted, its commits must be integrated into the canonical root branch (or explicitly documented as intentionally separate/unreleased), and any stable operational artifact must be copied/promoted outside the worktree before that worktree is considered disposable.

## Next exact action

```text
canonical root integration = COMPLETE / VERIFIED
release-stable root promotion = COMPLETE / SHA-256 VERIFIED
temporary integration worktree = REMOVED / ROOT UNAFFECTED
published RC preview = PRESERVE EXACT BYTES / NO REBUILD / NO RETAG
C3.3 = BLOCKED BY REAL EMPIRICAL EVIDENCE
-> continue future accepted work from isolated worktrees only when useful
-> integrate accepted work back into the canonical root branch before declaring it complete
-> promote any future stable runtime artifact to root release-stable before worktree cleanup
-> collect future outcome-labelled evidence for C3.3
-> never use GitHub Actions/CI
-> never merge main implicitly
```

## Permanent development execution scope guardrail — verbatim


Canonical source: `docs/checkpoints/PERMANENT_DEVELOPMENT_EXECUTION_SCOPE_GUARDRAIL.md`.
