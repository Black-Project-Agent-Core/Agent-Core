# Market Signal Lab — Phase C3.2 Quant Calibration Lab Implementation Plan

**Date:** 2026-08-26
**Baseline:** `8f8f89698ec10f60b190eb4f9683e5518c3f6c2b`
**Branch:** `task/c3-2-quant-calibration-lab-20260826`
**Design:** `docs/superpowers/specs/2026-08-26-msl-phase-c3-2-quant-calibration-lab-design.md`

## Constraints

- Offline Python only; no production Go/Rust/JS dependency on the lab.
- Standard library only for reproducibility and deploy independence.
- Synthetic data verify mechanics only and must never authorize production parameters.
- No random split; chronological train/validation/holdout only.
- No `TO_BE_CALIBRATED` production value is instantiated without a real reviewed artifact.
- C1/C2/C3.0/C3.1 production source remains frozen.

## Task 1 — Design/plan + baseline

- Record C3.2 design/plan.
- Verify clean C3.2 worktree from C3.1 final.
- Verify Python 3 availability.
- Re-run C3.1 focused production baseline using verified worker if available or source-freeze tests when build cache was intentionally removed.

## Task 2 — Dataset schema + canonical manifest

Create `tools/calibration_lab` package:
- `schema.py`
- `manifest.py`
- unit tests.

Validate record identities/timestamps/finiteness and build deterministic file/dataset hashes.

## Task 3 — Chronological split engine

Create `split.py`:
- explicit trainEnd / validationEnd / holdoutEnd;
- no random split;
- report excluded records;
- tests for boundary timestamps and outcome leakage.

## Task 4 — Metrics + explicit threshold candidates

Create `metrics.py`, `thresholds.py`:
- confusion metrics;
- balanced accuracy;
- abstention/selection rate;
- optional Brier score;
- evaluate all explicit candidates across all splits;
- adjacent sensitivity.

## Task 5 — Robustness hooks

Create `robustness.py`:
- peer-size bins from config;
- factual coverage/participation breakpoints;
- temporal stability deltas;
- confidence reliability bins;
- seasonality recurrence summaries.

No auto-selected production threshold.

## Task 6 — Artifact + canonical report

Create `artifact.py`, `report.py`:
- `msl-calibration-artifact/1`;
- candidate artifact always UNAPPROVED by the lab;
- synthetic artifact immutable `productionEligible=false`;
- deterministic canonical serialization;
- tests/frozen synthetic hashes.

## Task 7 — CLI

Create `cli.py` and package entrypoint:

```text
python -m tools.calibration_lab audit-dataset --config ...
python -m tools.calibration_lab evaluate --config ... --output ...
python -m tools.calibration_lab discover --root ...
```

`discover` reports only schema/provenance suitability counts and never prints raw records.

## Task 8 — Offline-boundary contract

Tests scan production entry points to prove there is no `tools.calibration_lab` invocation/import under:
- `cmd`;
- `internal`;
- `engines/rust`;
- frontend production JS/TS.

## Task 9 — Synthetic golden acceptance

Add small synthetic fixture/config under `tools/calibration_lab/testdata`.
Run stdlib `unittest` and CLI evaluation.
Freeze deterministic report/artifact hashes.
Artifact must say:

```text
evidenceClass=SYNTHETIC_MECHANICS_ONLY
approvalState=UNAPPROVED
productionEligible=false
```

## Task 10 — Real local data suitability audit

Inspect privacy-safe local MSL history/export candidates without exposing raw values. Record only:
- candidate file counts;
- presence/absence of required calibration fields;
- distinct version identities;
- chronological coverage;
- presence/absence of later outcome labels;
- whether chronological holdout is possible.

If real outcome-labelled data are absent/insufficient, record `EMPIRICAL_DATA_GATE=BLOCKED`.

## Task 11 — Production regression/freeze

- full Python unittest;
- CLI golden test;
- Go/Rust/frontend source freeze against C3.1 final;
- C1 hashes and C2 semantics freeze;
- secret scan;
- no tracked generated calibration output;
- no production references to calibration lab.

## Task 12 — C3.2 closeout

Create `docs/qa/phase-c3-2-quant-calibration-lab-qa.md`.
Update `CURRENT_MSL_CHECKPOINT.md` and `CONTINUE_MSL.md`.
C3.2 infrastructure may be COMPLETE / VERIFIED while empirical calibration remains BLOCKED.
Do not start C3.3 unless an approved real `CalibrationArtifact` exists.
