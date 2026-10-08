# Phase C3.2 Quant Calibration Lab — QA Evidence

> **Historical QA evidence:** results below apply to their recorded revision, environment and date. They were not rerun during the monorepo documentation refresh. See [current continuation](../checkpoints/CONTINUE_MSL.md) before treating a pending step or machine path as current.

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** OFFLINE LAB INFRASTRUCTURE COMPLETE / VERIFIED — EMPIRICAL CALIBRATION DATA GATE BLOCKED
**Formal release:** NOT RELEASED
**Branch:** `task/c3-2-quant-calibration-lab-20260826`
**Baseline:** `8f8f89698ec10f60b190eb4f9683e5518c3f6c2b` (C3.1 COMPLETE / VERIFIED)
**Lab source:** `9490f38f8dcc1468d4e28718d00947d092e69d01`

## Scope

C3.2 adds an offline, Python-standard-library-only calibration/research laboratory under `tools/calibration_lab`. No production Go/Rust/frontend file changes relative to the C3.1 final baseline.

Implemented:
- strict privacy-safe outcome-labelled JSONL schema;
- canonical SHA-256 dataset manifests;
- chronological train/validation/holdout splitting with outcome-maturity checks;
- explicit threshold-candidate evaluation across all splits;
- precision/recall/specificity/balanced-accuracy/selection/abstention metrics;
- adjacent-candidate sensitivity and validation-to-holdout stability;
- peer-size robustness bins supplied by config;
- factual coverage/participation breakpoint framework;
- optional confidence/Brier/reliability-bin evaluation;
- seasonality recurrence summaries;
- deterministic `msl-calibration-artifact/1` candidate emission;
- offline CLI for audit/evaluate/discover;
- production-boundary tests proving the lab is not imported/invoked by application runtime.

## Non-self-approval invariant

The lab emits candidates only:

```text
approvalState = UNAPPROVED
productionEligible = false
```

`SYNTHETIC_MECHANICS_ONLY` can never authorize production. `REAL_OUTCOME_LABELLED` also remains unapproved until an explicit later review binds a real dataset, outcome definition, evaluation policy, holdout evidence, and selected parameters.

## Synthetic mechanics acceptance

Synthetic testdata exists only to lock pipeline mechanics. It is not calibration evidence.

Observed:

```text
Python unittest       = 8/8 PASS
compileall            = PASS
report canonical SHA  = 1e3b95598ba7ea7e37373f41f05d9e4fb0c053f111e1d5508e155977a9c76994
artifact canonical SHA= 50f8cf96c846b179a068aa477d078649f0c3e5e3add2a5ea6747bc90266c1376
dataset manifest SHA  = 109676b1664baea8073004457f96174232f08d5d9256fb5172a8a73c9e8a8f45
approvalState         = UNAPPROVED
productionEligible    = false
```

## Production freeze

Compared with C3.1 final baseline `8f8f89698ec10f60b190eb4f9683e5518c3f6c2b`:

```text
cmd/              unchanged
internal/         unchanged
engines/rust/     unchanged
frontend/         unchanged
```

Additional verification:
- full `go test -p 1 ./... -count=1` PASS against the verified C3.1 Rust worker;
- canonical C1 fixture hashes unchanged;
- C2 `internal/semantics` unchanged from `82abd6a227140fdc61dd01799069e524ca6ad39a`;
- production references/imports to calibration lab = 0;
- secret scan = 0 matches;
- generated calibration outputs remain ignored under `dist/`.

## Real runtime empirical-data suitability audit

Canonical runtime data root is source-derived from `internal/storage.ResolveDataDir`:

```text
%LOCALAPPDATA%\MarketSignalLab
```

The audit deliberately emitted schema/count metadata only and no raw values.

Observed local runtime history:

```text
JSONL files                    = 26
non-empty rows                 = 103,644
parse failures                 = 0
files with outcome fields      = 0
strict calibration-ready files = 0
files with signalId + requirementsVersion = 0
raw values included in audit   = false
```

The existing ledgers cover operational/market-history structures such as analyses, catalog/product snapshots, market-map runs/observations, provenance, telemetry, temporal events, watchlists, and other application history. None currently provide the C3 calibration contract fields:

```text
outcomeDefinitionVersion
outcomeAt
outcomeLabel
```

and none provide the new versioned signal-assessment identity required by the offline calibration dataset.

Therefore existing runtime history cannot truthfully be relabelled as later-observed outcome evidence.

## Empirical gate

```text
EMPIRICAL_DATA_GATE = BLOCKED
CALIBRATION_PARAMETERS = NOT_AUTHORIZED
NUMERIC_CONFIDENCE = NOT_AUTHORIZED
PRELIMINARY_TREND / ESTABLISHED_TREND / SEASONALITY PROMOTION = NOT AUTHORIZED
C3.3 PRODUCTION ACTIVATION = BLOCKED_NO_APPROVED_ARTIFACT
```

This is an evidence/data availability gate, not a software-infrastructure failure.

## Required data to unblock

A future calibration dataset must contain enough privacy-safe historical C3 signal/evidence records plus later-observed outcomes under a versioned outcome definition, with a chronological holdout that was not used to search candidate parameters. The exact dataset/provenance manifest and evaluation policy must be reproducible.

## Review result

C3.2 infrastructure satisfies the approved offline boundary and reproducibility requirements. Synthetic mechanics tests are stable, production remains untouched, and empirical insufficiency is recorded rather than hidden.

**C3.2 infrastructure review:** SPEC PASS / QUALITY PASS.

C3.3 remains blocked until an explicit approved `msl-calibration-artifact/1` based on real outcome-labelled data exists.
