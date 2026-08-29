# Market Signal Lab — Phase C3.2 Quant Calibration Lab Design

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** IMPLEMENTATION AUTHORIZED / OFFLINE ONLY
**Baseline:** `8f8f89698ec10f60b190eb4f9683e5518c3f6c2b` (C3.1 COMPLETE / VERIFIED)
**Branch:** `task/c3-2-quant-calibration-lab-20260826`
**Formal release:** NOT RELEASED

## 1. Purpose

C3.2 builds a reproducible offline Python research/calibration laboratory for evidence requirements, confidence evaluation, robustness analysis, and seasonality validation. It does **not** change the production Go/Rust request path and it does not authorize any calibrated production parameter by itself.

Production dependency direction remains one-way:

```text
production append-only history/export
→ privacy-safe calibration dataset
→ offline Python lab
→ versioned UNAPPROVED CalibrationArtifact candidate
→ independent review/approval
→ only then possible C3.3 production consumption
```

Python is never invoked by `cmd/`, `internal/`, the Rust worker, HTTP handlers, or normal application startup.

## 2. Source-derived calibration requirements

The approved parent C3 design requires C3.2 to evaluate, where data support it:
- minimum observed-product / comparable-product support;
- temporal comparability and movement-participation breakpoints;
- query/surface/attribution coverage breakpoints;
- peer-group-size / comparable-peer-share / spread / tie-density robustness;
- confidence fitting and calibration diagnostics;
- seasonality / recurrence validation;
- sensitivity and stability across time splits;
- a reproducible `CalibrationArtifact` containing the exact signal/model/requirements identity, dataset hash/provenance, evaluation policy, candidate parameters, expected metrics, and creation identity.

C3.2 must not choose a production threshold because it "looks reasonable" or because it performs best on the same data used to search it.

## 3. Dataset contract

The lab consumes privacy-safe JSONL records. Required fields:

```text
recordId
entityKey                 # opaque/stable analytical key, not a secret
signalId
signalModelVersion
requirementsVersion
observedAt                # RFC3339
signalValue               # numeric, nullable only when explicitly suppressed
eligibility
evidenceStage
outcomeDefinitionVersion
outcomeAt                 # RFC3339 and strictly later than observedAt
outcomeLabel              # 0/1 for binary evaluation; optional outcomeValue may coexist
```

Optional factual features are carried under `facts`, for example:

```text
observedProducts
comparableProducts
temporalComparabilityRate
movementParticipationRate
queryObservationRate
queryComparabilityRate
surfaceCompletionRate
attributionCoverage
peerGroupSize
comparablePeerShare
peerSpread
tieDensity
eligibleChildShare
observationReliability
seasonKey
```

The lab rejects records whose outcome precedes/equal observation time, whose identity versions are mixed contrary to the run config, or whose values are non-finite.

## 4. Dataset manifest and provenance

Every input file is SHA-256 hashed. A canonical dataset manifest includes:
- sorted relative/source labels;
- file size and SHA-256;
- record count;
- min/max observedAt and outcomeAt;
- exact signal/model/requirements/outcome-definition identities;
- `evidenceClass`: `REAL_OUTCOME_LABELLED` or `SYNTHETIC_MECHANICS_ONLY`;
- canonical manifest SHA-256.

Raw credential material and private tokens are forbidden. The lab never exports them.

## 5. Time split policy

No random split is permitted for calibration claims. A run config declares chronological cutoffs:

```text
trainEnd
validationEnd
holdoutEnd
```

Records are assigned by `observedAt`, preserving forward-time evaluation. Outcome timestamps must still exist by the evaluation cutoff. Records outside the declared range are reported, not silently folded into another split.

Synthetic fixtures may use deterministic cutoffs to test mechanics only.

## 6. Candidate threshold evaluation

Threshold candidates are explicitly supplied by config, not generated from hidden heuristics. A candidate rule names:
- feature path;
- comparison (`>=` or `<=`);
- candidate values.

For each candidate and each split, the lab reports:
- eligible support;
- selected positive rate;
- precision;
- recall;
- specificity;
- balanced accuracy;
- Brier score when a probability source is explicitly provided;
- abstention rate.

The lab records results for **all** candidates. It does not silently output only the winner.

## 7. Sensitivity and stability

For ordered threshold candidates the lab computes adjacent-candidate metric deltas. Temporal stability reports validation-vs-holdout shifts for support, precision, recall, balanced accuracy, and selection rate.

A candidate parameter may be carried into an artifact only as a **candidate** with its neighboring sensitivity context.

## 8. Peer-size robustness

Config may declare peer-size bins. The lab groups outcome-labelled records by factual `peerGroupSize` and reports support + evaluation metrics by bin. It does not invent a minimum peer size from synthetic data.

## 9. Coverage / participation breakpoint analysis

The same explicit-candidate framework evaluates factual dimensions such as:
- `facts.temporalComparabilityRate`;
- `facts.movementParticipationRate`;
- `facts.surfaceCompletionRate`;
- `facts.attributionCoverage`;
- `facts.eligibleChildShare`;
- `facts.observationReliability`.

Breakpoints remain candidates until approved from real holdout evidence.

## 10. Confidence evaluation hook

C3.2 may evaluate an explicitly supplied candidate probability field or mapping. It reports Brier score and calibration-bin reliability. The initial lab does not fit a production confidence function automatically because the outcome definition and dataset must be reviewed first.

## 11. Seasonality validation hook

If records supply `facts.seasonKey`, the lab reports per-season support and outcome rates across chronological splits plus recurrence coverage. It does not promote `SEASONALITY_CANDIDATE` from a single recurrence or synthetic fixture.

## 12. CalibrationArtifact

Artifact schema identity:

```text
msl-calibration-artifact/1
```

Required artifact fields:

```text
calibrationArtifactVersion
artifactId
signalId
signalModelVersion
requirementsVersion
outcomeDefinitionVersion
datasetManifestSha256
datasetProvenance
evaluationPolicy
candidateParameters
expectedMetrics
sensitivity
stability
createdAt
approvalState
productionEligible
```

Default:

```text
approvalState = UNAPPROVED
productionEligible = false
```

For `SYNTHETIC_MECHANICS_ONLY`, `productionEligible=false` is immutable.

The lab never self-approves an artifact. A later approval process must explicitly bind a real dataset manifest, reviewed outcome definition, evaluation policy, and selected candidate parameters. C3.3 must reject any artifact not explicitly `APPROVED` and `productionEligible=true`.

## 13. Reproducibility

The lab uses Python standard library only. Deterministic inputs produce byte-stable canonical reports/artifacts when `createdAt` is supplied in config. JSON is serialized with sorted keys and normalized separators. Tests include a fixed synthetic fixture with frozen manifest/report hashes.

## 14. Offline boundary

Repository tests must prove no production Go/Rust/JS entry point references or invokes `tools.calibration_lab`. C3.2 may read exported/history-derived privacy-safe files only when explicitly executed by a researcher.

## 15. Empirical data gate

C3.2 infrastructure can be COMPLETE / VERIFIED even if real calibration is not yet possible. Actual calibrated parameters remain BLOCKED unless local/project data contain:
- enough historical observations for the declared signal/model/requirements identity;
- later-observed outcome labels under an explicit versioned outcome definition;
- a chronological holdout not used for candidate search;
- reproducible dataset/provenance hashes.

If those conditions are absent, C3.2 closeout must state `CALIBRATION_PARAMETERS = NOT AUTHORIZED` and C3.3 remains blocked.
