from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping

from .schema import CalibrationRecord, parse_rfc3339


@dataclass(frozen=True)
class SplitPolicy:
    train_end: datetime
    validation_end: datetime
    holdout_end: datetime

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "SplitPolicy":
        policy = cls(
            train_end=parse_rfc3339(str(mapping.get("trainEnd", ""))),
            validation_end=parse_rfc3339(str(mapping.get("validationEnd", ""))),
            holdout_end=parse_rfc3339(str(mapping.get("holdoutEnd", ""))),
        )
        if not (policy.train_end < policy.validation_end < policy.holdout_end):
            raise ValueError("split cutoffs must satisfy trainEnd < validationEnd < holdoutEnd")
        return policy


def split_records(records: list[CalibrationRecord], policy: SplitPolicy) -> dict:
    result: dict[str, list] = {
        "train": [],
        "validation": [],
        "holdout": [],
        "excluded": [],
    }
    for record in sorted(records, key=lambda row: (row.observed_at, row.record_id)):
        if record.observed_at <= policy.train_end:
            split_name, maturity_cutoff = "train", policy.train_end
        elif record.observed_at <= policy.validation_end:
            split_name, maturity_cutoff = "validation", policy.validation_end
        elif record.observed_at <= policy.holdout_end:
            split_name, maturity_cutoff = "holdout", policy.holdout_end
        else:
            result["excluded"].append(
                {"recordId": record.record_id, "reason": "observed_after_holdout"}
            )
            continue
        if record.outcome_at > maturity_cutoff:
            result["excluded"].append(
                {"recordId": record.record_id, "reason": "outcome_not_matured"}
            )
            continue
        result[split_name].append(record)
    return result
