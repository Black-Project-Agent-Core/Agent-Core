# Market Signal Lab C3.2 Calibration Lab

This package is an **offline research tool**. It is not part of the Market Signal Lab production request/runtime path.

## Commands

Validate a privacy-safe outcome-labelled JSONL dataset and write a canonical manifest:

```powershell
python -m tools.calibration_lab audit-dataset `
  --config path\to\calibration-config.json `
  --data path\to\dataset.jsonl `
  --output dist\calibration\manifest.json
```

Evaluate explicitly declared threshold candidates and emit a candidate artifact:

```powershell
python -m tools.calibration_lab evaluate `
  --config path\to\calibration-config.json `
  --data path\to\dataset.jsonl `
  --output dist\calibration\report.json `
  --artifact-output dist\calibration\artifact.json
```

Audit a runtime/export directory without printing raw rows:

```powershell
python -m tools.calibration_lab discover `
  --root "$env:LOCALAPPDATA\MarketSignalLab" `
  --output dist\calibration\discovery.json
```

## Safety and epistemic rules

- Dataset splits are chronological only; there is no random split.
- Candidate thresholds must be supplied explicitly by config. The lab reports all of them.
- Synthetic fixtures prove mechanics only. They are never calibration evidence.
- Candidate artifacts are emitted as `UNAPPROVED` and `productionEligible=false`.
- The lab never self-approves an artifact.
- `TO_BE_CALIBRATED` production thresholds remain unset until a real, reproducible, outcome-labelled dataset and holdout evaluation support them.
- Python must not be imported/invoked by `cmd/`, `internal/`, the Rust worker, or frontend production code.
- Do not include raw credentials, personal tokens, or secret material in calibration data.

## Artifact identity

Candidate artifacts use:

```text
msl-calibration-artifact/1
```

A later C3.3 production change may consume parameters only after an external/explicit approval process changes a reviewed real-data artifact to an approved production-eligible state. The C3.2 lab itself cannot perform that approval.
