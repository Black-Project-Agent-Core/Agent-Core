# Market Signal Lab — C3.1 COMPLETE / C3.2 NEXT

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** C3.1 DETERMINISTIC SIGNAL v0.2 COMPLETE / VERIFIED
**Formal release:** NOT RELEASED

## Canonical source

```text
branch = task/c3-1-deterministic-signal-v02-20260826
worktree = E:\Market-Signal-Lab\dist\.worktrees\c3-1-deterministic-signal-v02-20260826
baseline C3.0 = ded29d898d8edfc11d3987ac09acb0ebf67ef17a
design/plan = 174d467a3386f01b8c502ed4b3d61d43011c0ba8
product source = 6b4c1d1f59cb69de3613a1f6bc47277519e122a6
executor = Agent Core
```

QA: `docs/qa/phase-c3-1-deterministic-signal-v02-qa.md`.

## What C3.1 added

Rust-owned deterministic v0.2 signal families:
- Competition Acceleration;
- Observed Directional Momentum Index (ODMI);
- Momentum Magnitude;
- ODMI Peer-Relative Rank;
- Author Concentration Change;
- Product-Mass-Weighted Movement;
- Equal-Segment Movement;
- Signed Movement Divergence;
- Divergence Magnitude.

C3.1 evidence identity is `msl-evidence-requirements/2` + `msl-evidence-stage/c3.1-1`, additive to C3.0 version 1. Confidence remains uncalibrated and the production stage ceiling remains `MOVEMENT_INDICATION`.

## Verification truth

Automated acceptance and staged-native acceptance PASS. C1 fixture/numeric source and C2 semantics remain frozen. Requirements v1 remains default and exposes five C3.0 signals; explicit v2 exposes nine C3.1 signals. Full Cargo, full Go, frontend/typecheck/generated-diff, changed-package vet, secret hygiene, and staged Windows host/Rust protocol all pass.

Exact staged candidate source is `6b4c1d1f59cb69de3613a1f6bc47277519e122a6`.

## RC/final-product gate remains open

The exact C3.1 Setup.exe was built but not literally installed/uninstalled under Administrator elevation:

```text
currentSetupLiterallyInstalled = false
currentSetupUninstallVerified  = false
```

Do not rewrite this as passed. Any future RC/final sign-off must use normal interactive Windows UAC only and verify uninstall cleanup.

## C3.2 next boundary

C3.2 is the **offline** Python Quant Research / Calibration Lab. It must remain outside the production request/runtime path.

C3.2 may implement reproducible tooling for:
- privacy-safe evidence/history export ingestion;
- dataset manifest hashing;
- time-based train/evaluation/holdout policies;
- threshold candidate evaluation;
- sensitivity/stability analysis;
- peer-size robustness analysis;
- coverage/participation breakpoint analysis;
- confidence fitting evaluation;
- seasonality validation;
- versioned `CalibrationArtifact` emission.

However, actual calibrated production values cannot be declared until a real reproducible dataset and later-observed outcomes exist. A notebook, console printout, or selected best-looking parameter is not sufficient.

## Exact continuation target

```text
continue through Agent Core
→ create an isolated C3.2 worktree/branch from the verified C3.1 final state
→ design and implement the offline calibration-lab infrastructure with deterministic tests and synthetic fixtures only for pipeline correctness
→ do not treat synthetic fixtures as calibration evidence
→ inspect available local privacy-safe historical evidence/outcomes
→ if real outcome-labelled calibration data are absent, record the empirical-data gate explicitly
→ do not activate C3.3 thresholds/confidence/stage promotion without an approved versioned CalibrationArtifact
→ do not merge main implicitly
```
