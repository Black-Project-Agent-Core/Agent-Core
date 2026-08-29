from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Iterable

from .canonical import canonical_sha256
from .schema import CalibrationRecord, format_rfc3339

VALID_EVIDENCE_CLASSES = {"REAL_OUTCOME_LABELLED", "SYNTHETIC_MECHANICS_ONLY"}


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_dataset_manifest(
    paths: Iterable[Path], records: list[CalibrationRecord], evidence_class: str
) -> dict:
    if evidence_class not in VALID_EVIDENCE_CLASSES:
        raise ValueError(f"unsupported evidenceClass: {evidence_class}")
    path_list = [Path(path) for path in paths]
    if not path_list:
        raise ValueError("at least one calibration data file is required")
    if not records:
        raise ValueError("calibration dataset is empty")

    file_rows = []
    for path in sorted(path_list, key=lambda p: p.name):
        stat = path.stat()
        file_rows.append(
            {
                "sourceLabel": path.name,
                "sizeBytes": stat.st_size,
                "sha256": _file_sha256(path),
            }
        )

    manifest = {
        "manifestVersion": "msl-calibration-dataset-manifest/1",
        "evidenceClass": evidence_class,
        "files": file_rows,
        "recordCount": len(records),
        "observedAtMin": format_rfc3339(min(row.observed_at for row in records)),
        "observedAtMax": format_rfc3339(max(row.observed_at for row in records)),
        "outcomeAtMin": format_rfc3339(min(row.outcome_at for row in records)),
        "outcomeAtMax": format_rfc3339(max(row.outcome_at for row in records)),
        "signalIds": sorted({row.signal_id for row in records}),
        "signalModelVersions": sorted({row.signal_model_version for row in records}),
        "requirementsVersions": sorted({row.requirements_version for row in records}),
        "outcomeDefinitionVersions": sorted(
            {row.outcome_definition_version for row in records}
        ),
    }
    manifest["manifestSha256"] = canonical_sha256(manifest)
    return manifest
