from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from .manifest import build_dataset_manifest
from .robustness import confidence_reliability, peer_size_robustness, seasonality_summary
from .schema import CalibrationRecord, load_jsonl_records
from .split import SplitPolicy, split_records
from .thresholds import evaluate_threshold_candidates, temporal_stability


def _require_config_identity(config: Mapping[str, Any], records: list[CalibrationRecord]) -> None:
    expected = {
        "signalId": str(config.get("signalId", "")).strip(),
        "signalModelVersion": str(config.get("signalModelVersion", "")).strip(),
        "requirementsVersion": str(config.get("requirementsVersion", "")).strip(),
        "outcomeDefinitionVersion": str(config.get("outcomeDefinitionVersion", "")).strip(),
    }
    if any(not value for value in expected.values()):
        raise ValueError("config must declare signal/model/requirements/outcome identities")
    for record in records:
        actual = {
            "signalId": record.signal_id,
            "signalModelVersion": record.signal_model_version,
            "requirementsVersion": record.requirements_version,
            "outcomeDefinitionVersion": record.outcome_definition_version,
        }
        if actual != expected:
            raise ValueError(f"dataset identity mismatch for record {record.record_id}: {actual} != {expected}")


def evaluate_dataset(config: Mapping[str, Any], paths: list[Path]) -> dict:
    records = load_jsonl_records(paths)
    _require_config_identity(config, records)
    evidence_class = str(config.get("evidenceClass", "")).strip()
    manifest = build_dataset_manifest(paths, records, evidence_class)
    policy = SplitPolicy.from_mapping(config.get("splitPolicy", {}))
    splits = split_records(records, policy)
    threshold_results = evaluate_threshold_candidates(splits, list(config.get("thresholdCandidates", [])))
    report = {
        "reportVersion": "msl-calibration-report/1",
        "datasetManifest": manifest,
        "identity": {
            "signalId": config["signalId"],
            "signalModelVersion": config["signalModelVersion"],
            "requirementsVersion": config["requirementsVersion"],
            "outcomeDefinitionVersion": config["outcomeDefinitionVersion"],
        },
        "splitPolicy": dict(config["splitPolicy"]),
        "splitCounts": {name: len(splits[name]) for name in ("train", "validation", "holdout")},
        "excluded": list(splits["excluded"]),
        "thresholdEvaluation": threshold_results,
        "sensitivity": {name: result["sensitivity"] for name, result in threshold_results.items()},
        "stability": temporal_stability(threshold_results),
        "peerSizeRobustness": peer_size_robustness(splits, list(config.get("peerSizeBins", []))),
        "confidenceReliability": confidence_reliability(
            splits,
            str(config.get("confidenceField", "")).strip() or None,
            list(config.get("confidenceBins", [])) or None,
        ),
        "seasonality": seasonality_summary(
            splits, str(config.get("seasonField", "")).strip() or None
        ),
    }
    return report
