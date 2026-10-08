from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Mapping

from .metrics import brier_score, nested_value, outcome_summary, safe_div
from .schema import CalibrationRecord

SPLITS = ("train", "validation", "holdout")


def peer_size_robustness(split_records: Mapping[str, list[CalibrationRecord]], bins: list[Mapping[str, Any]]) -> list[dict]:
    output = []
    for spec in bins:
        name = str(spec.get("name", "")).strip()
        if not name:
            raise ValueError("peer-size bin name is required")
        minimum = int(spec.get("min", 0))
        maximum = spec.get("max")
        maximum = None if maximum is None else int(maximum)
        if maximum is not None and maximum < minimum:
            raise ValueError(f"peer-size bin {name!r} max < min")
        split_summary = {}
        for split in SPLITS:
            selected = []
            missing = 0
            for record in split_records.get(split, []):
                value = nested_value(record, "facts.peerGroupSize")
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                    missing += 1
                    continue
                size = int(value)
                if size >= minimum and (maximum is None or size <= maximum):
                    selected.append(record)
            split_summary[split] = {**outcome_summary(selected), "missingPeerSize": missing}
        output.append({"name": name, "min": minimum, "max": maximum, "splits": split_summary})
    return output


def confidence_reliability(split_records: Mapping[str, list[CalibrationRecord]], field: str | None, edges: list[float] | None) -> dict:
    if not field or not edges:
        return {"enabled": False, "reason": "confidence field/bins not configured"}
    normalized = [float(edge) for edge in edges]
    if len(normalized) < 2 or any(not math.isfinite(v) for v in normalized):
        raise ValueError("confidence bins must contain at least two finite edges")
    if any(left >= right for left, right in zip(normalized, normalized[1:])):
        raise ValueError("confidence bins must be strictly increasing")
    output = {"enabled": True, "field": field, "binEdges": normalized, "splits": {}}
    for split in SPLITS:
        records = split_records.get(split, [])
        bins_out = []
        for index, (low, high) in enumerate(zip(normalized, normalized[1:])):
            selected = []
            probs = []
            for record in records:
                value = nested_value(record, field)
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    continue
                probability = float(value)
                if not math.isfinite(probability) or probability < 0 or probability > 1:
                    continue
                is_last = index == len(normalized) - 2
                if probability >= low and (probability <= high if is_last else probability < high):
                    selected.append(record)
                    probs.append(probability)
            summary = outcome_summary(selected)
            bins_out.append(
                {
                    "low": low,
                    "high": high,
                    "support": summary["support"],
                    "meanPredicted": safe_div(sum(probs), len(probs)),
                    "outcomeRate": summary["positiveRate"],
                }
            )
        output["splits"][split] = {"bins": bins_out, **brier_score(records, field)}
    return output


def seasonality_summary(split_records: Mapping[str, list[CalibrationRecord]], field: str | None) -> dict:
    if not field:
        return {"enabled": False, "reason": "season field not configured"}
    seasons: dict[str, dict[str, list[CalibrationRecord]]] = defaultdict(lambda: defaultdict(list))
    missing = 0
    for split in SPLITS:
        for record in split_records.get(split, []):
            value = nested_value(record, field)
            if value is None or str(value).strip() == "":
                missing += 1
                continue
            seasons[str(value)][split].append(record)
    rows = []
    for season in sorted(seasons):
        split_summaries = {split: outcome_summary(seasons[season].get(split, [])) for split in SPLITS}
        recurrence = sum(1 for split in SPLITS if split_summaries[split]["support"] > 0)
        rows.append({"seasonKey": season, "recurrenceSplits": recurrence, "splits": split_summaries})
    return {"enabled": True, "field": field, "missingCount": missing, "seasons": rows}
