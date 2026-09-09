from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from tools.calibration_lab.artifact import build_candidate_artifact, canonical_json_bytes
from tools.calibration_lab.manifest import build_dataset_manifest
from tools.calibration_lab.report import evaluate_dataset
from tools.calibration_lab.schema import CalibrationRecord, load_jsonl_records
from tools.calibration_lab.split import SplitPolicy, split_records
from tools.calibration_lab.thresholds import evaluate_threshold_candidates


ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "tools" / "calibration_lab" / "testdata" / "synthetic.jsonl"
CONFIG = ROOT / "tools" / "calibration_lab" / "testdata" / "synthetic-config.json"


class CalibrationLabTests(unittest.TestCase):
    def test_schema_rejects_outcome_leakage_and_non_finite_signal(self) -> None:
        base = {
            "recordId": "x",
            "entityKey": "e",
            "signalId": "catalog.odmi.v0.2",
            "signalModelVersion": "directional-momentum-v0.2",
            "requirementsVersion": "msl-evidence-requirements/2",
            "observedAt": "2026-01-02T00:00:00Z",
            "signalValue": 10.0,
            "eligibility": "ELIGIBLE",
            "evidenceStage": "MOVEMENT_INDICATION",
            "outcomeDefinitionVersion": "outcome/1",
            "outcomeAt": "2026-01-03T00:00:00Z",
            "outcomeLabel": 1,
            "facts": {},
        }
        self.assertEqual(CalibrationRecord.from_mapping(base).outcome_label, 1)
        leaked = dict(base, outcomeAt="2026-01-02T00:00:00Z")
        with self.assertRaises(ValueError):
            CalibrationRecord.from_mapping(leaked)
        non_finite = dict(base, signalValue=float("nan"))
        with self.assertRaises(ValueError):
            CalibrationRecord.from_mapping(non_finite)

    def test_manifest_is_deterministic_and_marks_synthetic_evidence(self) -> None:
        records = load_jsonl_records([DATA])
        first = build_dataset_manifest([DATA], records, "SYNTHETIC_MECHANICS_ONLY")
        second = build_dataset_manifest([DATA], records, "SYNTHETIC_MECHANICS_ONLY")
        self.assertEqual(first, second)
        self.assertEqual(first["recordCount"], 12)
        self.assertEqual(first["evidenceClass"], "SYNTHETIC_MECHANICS_ONLY")
        self.assertEqual(len(first["manifestSha256"]), 64)
        self.assertEqual(first["signalIds"], ["catalog.odmi.v0.2"])

    def test_chronological_split_has_no_randomness_or_outcome_leakage(self) -> None:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        policy = SplitPolicy.from_mapping(config["splitPolicy"])
        records = load_jsonl_records([DATA])
        split = split_records(records, policy)
        self.assertEqual([len(split[name]) for name in ("train", "validation", "holdout")], [4, 4, 4])
        self.assertEqual(split["excluded"], [])
        self.assertTrue(all(r.observed_at <= policy.train_end for r in split["train"]))
        self.assertTrue(all(r.outcome_at <= policy.train_end for r in split["train"]))

    def test_threshold_evaluation_reports_every_candidate_and_split(self) -> None:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        records = load_jsonl_records([DATA])
        split = split_records(records, SplitPolicy.from_mapping(config["splitPolicy"]))
        result = evaluate_threshold_candidates(split, config["thresholdCandidates"])
        self.assertEqual(sorted(result), ["temporal-comparability"])
        candidates = result["temporal-comparability"]["candidates"]
        self.assertEqual([row["threshold"] for row in candidates], [50.0, 70.0, 90.0])
        for row in candidates:
            self.assertEqual(sorted(row["splits"]), ["holdout", "train", "validation"])
            self.assertIn("balancedAccuracy", row["splits"]["holdout"])
        self.assertEqual(len(result["temporal-comparability"]["sensitivity"]), 2)

    def test_full_synthetic_report_and_artifact_are_reproducible_but_never_production_eligible(self) -> None:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        report = evaluate_dataset(config, [DATA])
        artifact = build_candidate_artifact(config, report)
        self.assertEqual(report["datasetManifest"]["evidenceClass"], "SYNTHETIC_MECHANICS_ONLY")
        self.assertEqual(artifact["calibrationArtifactVersion"], "msl-calibration-artifact/1")
        self.assertEqual(artifact["approvalState"], "UNAPPROVED")
        self.assertFalse(artifact["productionEligible"])
        self.assertEqual(artifact["datasetManifestSha256"], report["datasetManifest"]["manifestSha256"])
        self.assertEqual(canonical_json_bytes(artifact), canonical_json_bytes(build_candidate_artifact(config, report)))
        self.assertEqual(
            hashlib.sha256(canonical_json_bytes(report)).hexdigest(),
            "1e3b95598ba7ea7e37373f41f05d9e4fb0c053f111e1d5508e155977a9c76994",
        )
        self.assertEqual(
            hashlib.sha256(canonical_json_bytes(artifact)).hexdigest(),
            "50f8cf96c846b179a068aa477d078649f0c3e5e3add2a5ea6747bc90266c1376",
        )
        self.assertEqual(
            report["datasetManifest"]["manifestSha256"],
            "109676b1664baea8073004457f96174232f08d5d9256fb5172a8a73c9e8a8f45",
        )
        self.assertIn("peerSizeRobustness", report)
        self.assertIn("confidenceReliability", report)
        self.assertIn("seasonality", report)

    def test_real_class_still_does_not_self_approve(self) -> None:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        config["evidenceClass"] = "REAL_OUTCOME_LABELLED"
        report = evaluate_dataset(config, [DATA])
        artifact = build_candidate_artifact(config, report)
        self.assertEqual(artifact["approvalState"], "UNAPPROVED")
        self.assertFalse(artifact["productionEligible"])

    def test_offline_boundary_has_no_production_import_or_invocation(self) -> None:
        forbidden = []
        roots = [ROOT / "cmd", ROOT / "internal", ROOT / "engines" / "rust", ROOT / "frontend" / "src"]
        needles = ("tools.calibration_lab", "calibration_lab")
        for root in roots:
            for path in root.rglob("*"):
                if not path.is_file() or path.suffix.lower() not in {".go", ".rs", ".ts", ".js"}:
                    continue
                text = path.read_text(encoding="utf-8", errors="ignore")
                if any(needle in text for needle in needles):
                    forbidden.append(str(path.relative_to(ROOT)))
        self.assertEqual(forbidden, [])

    def test_discover_suitability_never_requires_reading_raw_output(self) -> None:
        from tools.calibration_lab.discover import discover_suitability

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "good.jsonl").write_bytes(DATA.read_bytes())
            (root / "other.jsonl").write_text('{"foo":"bar"}\n', encoding="utf-8")
            result = discover_suitability(root)
            self.assertEqual(result["jsonlFileCount"], 2)
            self.assertEqual(result["withOutcomeFieldsCount"], 1)
            self.assertEqual(result["strictCalibrationReadyCount"], 1)
            self.assertNotIn("records", result)
            self.assertNotIn("raw", result)


if __name__ == "__main__":
    unittest.main()
