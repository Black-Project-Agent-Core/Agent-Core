from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping


def parse_rfc3339(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("timestamp must be a non-empty RFC3339 string")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"invalid RFC3339 timestamp: {value!r}") from exc
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include an explicit timezone")
    return parsed.astimezone(timezone.utc)


def format_rfc3339(value: datetime) -> str:
    value = value.astimezone(timezone.utc)
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def _required_text(mapping: Mapping[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value.strip()


def _finite_optional_number(mapping: Mapping[str, Any], key: str) -> float | None:
    value = mapping.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{key} must be numeric or null")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{key} must be finite")
    return number


@dataclass(frozen=True)
class CalibrationRecord:
    record_id: str
    entity_key: str
    signal_id: str
    signal_model_version: str
    requirements_version: str
    observed_at: datetime
    signal_value: float | None
    eligibility: str
    evidence_stage: str
    outcome_definition_version: str
    outcome_at: datetime
    outcome_label: int
    outcome_value: float | None
    facts: Mapping[str, Any]

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "CalibrationRecord":
        observed_at = parse_rfc3339(_required_text(mapping, "observedAt"))
        outcome_at = parse_rfc3339(_required_text(mapping, "outcomeAt"))
        if outcome_at <= observed_at:
            raise ValueError("outcomeAt must be strictly later than observedAt")

        eligibility = _required_text(mapping, "eligibility")
        signal_value = _finite_optional_number(mapping, "signalValue")
        if signal_value is None and eligibility != "SUPPRESSED":
            raise ValueError("signalValue may be null only for SUPPRESSED records")

        raw_label = mapping.get("outcomeLabel")
        if isinstance(raw_label, bool) or raw_label not in (0, 1):
            raise ValueError("outcomeLabel must be binary 0 or 1")

        facts = mapping.get("facts", {})
        if not isinstance(facts, Mapping):
            raise ValueError("facts must be an object")
        for key, value in facts.items():
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError(f"facts.{key} must be finite")

        return cls(
            record_id=_required_text(mapping, "recordId"),
            entity_key=_required_text(mapping, "entityKey"),
            signal_id=_required_text(mapping, "signalId"),
            signal_model_version=_required_text(mapping, "signalModelVersion"),
            requirements_version=_required_text(mapping, "requirementsVersion"),
            observed_at=observed_at,
            signal_value=signal_value,
            eligibility=eligibility,
            evidence_stage=_required_text(mapping, "evidenceStage"),
            outcome_definition_version=_required_text(mapping, "outcomeDefinitionVersion"),
            outcome_at=outcome_at,
            outcome_label=int(raw_label),
            outcome_value=_finite_optional_number(mapping, "outcomeValue"),
            facts=dict(facts),
        )


def load_jsonl_records(paths: Iterable[Path]) -> list[CalibrationRecord]:
    records: list[CalibrationRecord] = []
    seen_ids: set[str] = set()
    for path in paths:
        with Path(path).open("r", encoding="utf-8") as handle:
            for line_no, raw in enumerate(handle, 1):
                if not raw.strip():
                    continue
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_no}: invalid JSON") from exc
                if not isinstance(payload, Mapping):
                    raise ValueError(f"{path}:{line_no}: calibration row must be an object")
                record = CalibrationRecord.from_mapping(payload)
                if record.record_id in seen_ids:
                    raise ValueError(f"duplicate calibration recordId: {record.record_id}")
                seen_ids.add(record.record_id)
                records.append(record)
    records.sort(key=lambda row: (row.observed_at, row.record_id))
    return records
