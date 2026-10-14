from __future__ import annotations

import math
from typing import Any, Iterable

from .schema import CalibrationRecord


def safe_div(numerator: float, denominator: float) -> float | None:
    if denominator == 0:
        return None
    return numerator / denominator


def nested_value(record: CalibrationRecord, path: str) -> Any:
    if path == "signalValue":
        return record.signal_value
    if path == "outcomeValue":
        return record.outcome_value
    if path.startswith("facts."):
        value: Any = record.facts
        for part in path.split(".")[1:]:
            if not isinstance(value, dict) or part not in value:
                return None
            value = value[part]
        return value
    raise ValueError(f"unsupported feature path: {path}")


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def binary_threshold_metrics(
    records: Iterable[CalibrationRecord], feature: str, comparison: str, threshold: float
) -> dict:
    if comparison not in {">=", "<="}:
        raise ValueError(f"unsupported threshold comparison: {comparison}")
    if not math.isfinite(float(threshold)):
        raise ValueError("threshold must be finite")

    tp = fp = tn = fn = abstained = 0
    total = 0
    selected = 0
    for record in records:
        total += 1
        value = _finite_number(nested_value(record, feature))
        if value is None:
            abstained += 1
            continue
        predicted = value >= threshold if comparison == ">=" else value <= threshold
        selected += int(predicted)
        actual = record.outcome_label == 1
        if predicted and actual:
            tp += 1
        elif predicted and not actual:
            fp += 1
        elif not predicted and actual:
            fn += 1
        else:
            tn += 1

    evaluated = tp + fp + tn + fn
    precision = safe_div(tp, tp + fp)
    recall = safe_div(tp, tp + fn)
    specificity = safe_div(tn, tn + fp)
    balanced_accuracy = (
        None
        if recall is None or specificity is None
        else (recall + specificity) / 2.0
    )
    return {
        "totalCount": total,
        "evaluatedCount": evaluated,
        "selectedCount": selected,
        "abstainedCount": abstained,
        "selectionRate": safe_div(selected, evaluated),
        "abstentionRate": safe_div(abstained, total),
        "precision": precision,
        "recall": recall,
        "specificity": specificity,
        "balancedAccuracy": balanced_accuracy,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
    }


def brier_score(records: Iterable[CalibrationRecord], probability_field: str) -> dict:
    total = 0
    error_sum = 0.0
    abstained = 0
    for record in records:
        probability = _finite_number(nested_value(record, probability_field))
        if probability is None or probability < 0.0 or probability > 1.0:
            abstained += 1
            continue
        total += 1
        error_sum += (probability - record.outcome_label) ** 2
    return {
        "evaluatedCount": total,
        "abstainedCount": abstained,
        "brierScore": safe_div(error_sum, total),
    }


def outcome_summary(records: Iterable[CalibrationRecord]) -> dict:
    rows = list(records)
    positives = sum(row.outcome_label for row in rows)
    return {
        "support": len(rows),
        "positiveCount": positives,
        "positiveRate": safe_div(positives, len(rows)),
    }
