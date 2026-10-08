from __future__ import annotations

from typing import Any, Mapping

from . import CALIBRATION_ARTIFACT_VERSION
from .canonical import canonical_json_bytes, canonical_sha256


def _candidate_expected_metrics(report: Mapping[str, Any]) -> dict:
    return {
        "splitCounts": report.get("splitCounts", {}),
        "thresholdEvaluation": report.get("thresholdEvaluation", {}),
        "confidenceReliability": report.get("confidenceReliability", {}),
        "peerSizeRobustness": report.get("peerSizeRobustness", []),
        "seasonality": report.get("seasonality", {}),
    }


def build_candidate_artifact(config: Mapping[str, Any], report: Mapping[str, Any]) -> dict:
    created_at = str(config.get("createdAt", "")).strip()
    if not created_at:
        raise ValueError("createdAt is required for deterministic artifact emission")
    manifest = report.get("datasetManifest")
    if not isinstance(manifest, Mapping):
        raise ValueError("report is missing datasetManifest")
    evidence_class = str(manifest.get("evidenceClass", ""))
    artifact = {
        "calibrationArtifactVersion": CALIBRATION_ARTIFACT_VERSION,
        "signalId": str(config.get("signalId", "")),
        "signalModelVersion": str(config.get("signalModelVersion", "")),
        "requirementsVersion": str(config.get("requirementsVersion", "")),
        "outcomeDefinitionVersion": str(config.get("outcomeDefinitionVersion", "")),
        "datasetManifestSha256": str(manifest.get("manifestSha256", "")),
        "datasetProvenance": {
            "evidenceClass": evidence_class,
            "recordCount": manifest.get("recordCount"),
            "observedAtMin": manifest.get("observedAtMin"),
            "observedAtMax": manifest.get("observedAtMax"),
            "outcomeAtMin": manifest.get("outcomeAtMin"),
            "outcomeAtMax": manifest.get("outcomeAtMax"),
        },
        "evaluationPolicy": {
            "splitPolicy": dict(config.get("splitPolicy", {})),
            "thresholdCandidates": list(config.get("thresholdCandidates", [])),
            "peerSizeBins": list(config.get("peerSizeBins", [])),
            "confidenceField": config.get("confidenceField"),
            "confidenceBins": list(config.get("confidenceBins", [])),
            "seasonField": config.get("seasonField"),
        },
        "candidateParameters": dict(config.get("candidateParameters", {})),
        "expectedMetrics": _candidate_expected_metrics(report),
        "sensitivity": report.get("sensitivity", {}),
        "stability": report.get("stability", {}),
        "createdAt": created_at,
        "approvalState": "UNAPPROVED",
        "productionEligible": False,
    }
    artifact["artifactId"] = "cal_" + canonical_sha256(artifact)[:24]
    return artifact


__all__ = ["build_candidate_artifact", "canonical_json_bytes"]
