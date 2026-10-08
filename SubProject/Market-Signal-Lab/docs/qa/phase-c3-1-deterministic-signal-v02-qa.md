# Phase C3.1 Deterministic Signal v0.2 — QA Evidence

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** COMPLETE / VERIFIED
**Formal release:** NOT RELEASED
**Branch:** `task/c3-1-deterministic-signal-v02-20260826`
**Design/plan commit:** `174d467a3386f01b8c502ed4b3d61d43011c0ba8`
**Product-source commit:** `6b4c1d1f59cb69de3613a1f6bc47277519e122a6`

## Scope

C3.1 adds deterministic signal v0.2 families after the C3.0 evidence constitution while preserving C1 numerics, C2 `msl-semantic-contract/2`, and C3.0 requirement/history meaning.

New production signal families:

```text
catalog.competition_acceleration.v0.2
catalog.odmi.v0.2
catalog.momentum_magnitude.v0.2
catalog.peer_relative_rank_odmi.v0.2
catalog.author_concentration_change.v0.2
structural.product_mass_weighted_movement.v0.2
structural.equal_segment_movement.v0.2
structural.signed_movement_divergence.v0.2
structural.divergence_magnitude.v0.2
```

New evidence version identities:

```text
msl-evidence-requirements/2
msl-evidence-stage/c3.1-1
catalog-odmi-peer/1
```

Confidence remains `msl-evidence-confidence/uncalibrated-1`; score remains null.

## Numerical ownership

All new numerical formulas are production-owned by Rust. Go only validates inputs, orchestrates persisted facts, invokes the Rust BatchExecutor, qualifies evidence, and persists append-only assessments.

Protocol `msl-analytics/2` is extended additively with schema-1 operation IDs 9–13. Existing operations 1–8 and existing C1 request/result golden identities remain compatible.

Observed real-worker integration PASS for:
- Competition Acceleration;
- ODMI + Momentum Magnitude;
- ODMI PRR;
- Author Concentration Change;
- Product-mass/equal-segment movement and signed divergence.

## Deterministic evidence behavior

Verified:
- acceleration requires three comparable windows;
- two-window history suppresses acceleration with null value while ODMI may remain eligible;
- ODMI is peer-independent and is computed before PRR;
- one-member peer universe suppresses PRR rather than returning neutral 50;
- movement aggregation consumes only non-suppressed ODMI children with positive observed product mass;
- one eligible child retains weighted/equal movement but suppresses signed divergence/magnitude with null value;
- author concentration change requires factual attribution presence and stable measure definition;
- C3.1 never synthesizes an attributed-product count from rounded attribution coverage;
- all upper-stage promotion remains disabled; maximum stage remains `MOVEMENT_INDICATION`;
- repeated builds remain idempotent by deterministic assessmentId while the ledger stays append-only.

## C1/C2/C3.0 freeze gates

Canonical C1 fixture SHA-256 values remained exact:

```text
product_v01_cases.json = 0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4
catalog_v01_cases.json = 95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3
structural_index_v01_cases.json = bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea
```

No C3.1 diff exists versus C3.0 final `ded29d8` for:
- `engines/rust/src/ranking_v01.rs`;
- `engines/rust/src/structural_index_v01.rs`;
- `engines/rust/src/structural_direction_v01.rs`;
- `internal/ranking`;
- `internal/indexing`.

`internal/semantics` remains unchanged from C2 baseline `82abd6a227140fdc61dd01799069e524ca6ad39a`.

C3.0 requirements version 1 remains the default API registry with exactly five signals; explicit version 2 exposes exactly nine C3.1 signals.

## Automated acceptance

Ignored evidence:

`dist/c3-1-acceptance/automated.json`

Observed results:

```text
full Cargo test                         PASS
Rust release build                     PASS
real Rust worker C3.1 integration      PASS
focused Go C3.1/C3.0 packages          PASS
full go test -p 1 ./... -count=1       PASS
changed-package go vet                 PASS
frontend Bun tests                     2/2 PASS
TypeScript typecheck                   PASS
generated frontend diff                PASS
C1 fixture/source freeze               PASS
C2 semantics freeze                    PASS
diff check                             PASS
secret scan                            0 matches
tracked generated artifacts            0
```

Fresh automated release worker SHA-256:

`3573d11bd5a906233cbe55bc86725f82d54a46f5bddd98afd9eeb88f0c748be6`

Global `go vet ./...` still reports the pre-existing Windows credential warning at `internal/credentials/store_windows.go:92` (`possible misuse of unsafe.Pointer`). The file is byte/source unchanged from the C3.0 baseline and is outside C3.1 scope. Vet over every C3.1-changed package passes.

## Windows staged-native acceptance

Ignored evidence:

`dist/c3-1-acceptance/native.json`

Candidate:

```text
version = 0.3.0-alpha.6.5.3-preview.1
sourceHead = 6b4c1d1f59cb69de3613a1f6bc47277519e122a6
installerSha256 = 920F562CC2F6616F6CFB57D6B991FF27076AC3123611CCEB10058AA57A1C9BD8
candidateAppSha256 = 554CA42DAB80E9177420F5B48261B3885547B6A4D5B9BFE3FE09D875A07EF1E2
packagedRustWorkerSha256 = 6ACA7483842BB2DD671C2D3DB88EAC9132E0F83C12D14C707D5C29A71B2051E5
```

Staged runtime observation:

```text
applicationHost = healthy
productionAnalytics = healthy
engine = rust-production
protocol = msl-analytics/2
requirements v1 count = 5
requirements v2 count = 9
Evidence Qualification UI/version selector = present
C3.1 localized signal/requirements wiring = present
```

## Binding native limitation

Task 12 built the exact Setup.exe but did not execute an elevated install/uninstall lifecycle:

```text
currentSetupLiterallyInstalled = false
currentSetupUninstallVerified  = false
```

This does not block C3.1 isolated code/contract closure. It remains binding for RC/final-product sign-off and must use normal interactive Windows UAC only, never a bypass.

## Whole-branch review

Range reviewed from C3.0 final `ded29d8` through C3.1 product source `6b4c1d1`:
- changed paths match the C3.1 design/plan boundary;
- no C1/C2 numeric/semantic source files were modified;
- no TODO/FIXME/HACK remained in changed files;
- no Go fallback recomputes C3.1 Rust-owned numerical kernels;
- evidence v1/v2 are additive rather than mutable;
- suppression/null and uncalibrated-confidence invariants remain intact;
- no Critical or Important finding remains open.

**Review result:** SPEC PASS / QUALITY PASS.

## C3.2 gate

C3.1 is complete. C3.2 may now build the offline reproducible Python Quant Research / Calibration Lab. C3.2 may not invent calibrated thresholds. Actual candidate parameters, confidence fitting, seasonality validation, and later C3.3 promotion require a reproducible historical dataset plus later-observed outcomes and a versioned `CalibrationArtifact`.
