from __future__ import annotations

import json
from pathlib import Path

from .schema import CalibrationRecord

_REQUIRED_OUTCOME_KEYS = {
    "recordId",
    "entityKey",
    "signalId",
    "signalModelVersion",
    "requirementsVersion",
    "observedAt",
    "signalValue",
    "eligibility",
    "evidenceStage",
    "outcomeDefinitionVersion",
    "outcomeAt",
    "outcomeLabel",
}


def discover_suitability(root: Path) -> dict:
    root = Path(root)
    files = sorted(path for path in root.rglob("*.jsonl") if path.is_file())
    with_outcomes = 0
    strict_ready = 0
    parse_failures = 0
    total_nonempty_rows = 0
    for path in files:
        file_has_rows = False
        file_has_outcomes = True
        file_strict = True
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for raw in handle:
                if not raw.strip():
                    continue
                file_has_rows = True
                total_nonempty_rows += 1
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    parse_failures += 1
                    file_has_outcomes = False
                    file_strict = False
                    continue
                if not isinstance(payload, dict) or not _REQUIRED_OUTCOME_KEYS.issubset(payload):
                    file_has_outcomes = False
                    file_strict = False
                    continue
                try:
                    CalibrationRecord.from_mapping(payload)
                except ValueError:
                    file_strict = False
        if file_has_rows and file_has_outcomes:
            with_outcomes += 1
        if file_has_rows and file_strict:
            strict_ready += 1
    return {
        "auditVersion": "msl-calibration-discovery/1",
        "jsonlFileCount": len(files),
        "nonEmptyRowCount": total_nonempty_rows,
        "withOutcomeFieldsCount": with_outcomes,
        "strictCalibrationReadyCount": strict_ready,
        "parseFailureCount": parse_failures,
        "printsRawRecords": False,
    }
