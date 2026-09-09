from __future__ import annotations

from typing import Any, Mapping

from .metrics import binary_threshold_metrics

SPLITS = ("train", "validation", "holdout")


def _metric_delta(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None:
        return None
    return current - previous


def evaluate_threshold_candidates(
    split_records: Mapping[str, list], candidates: list[Mapping[str, Any]]
) -> dict:
    output: dict[str, dict] = {}
    seen_names: set[str] = set()
    for spec in candidates:
        name = str(spec.get("name", "")).strip()
        feature = str(spec.get("feature", "")).strip()
        comparison = str(spec.get("comparison", "")).strip()
        values = spec.get("values")
        if not name or name in seen_names:
            raise ValueError("threshold candidate names must be non-empty and unique")
        seen_names.add(name)
        if not feature:
            raise ValueError(f"threshold candidate {name!r} requires feature")
        if comparison not in {">=", "<="}:
            raise ValueError(f"threshold candidate {name!r} has invalid comparison")
        if not isinstance(values, list) or not values:
            raise ValueError(f"threshold candidate {name!r} requires candidate values")

        rows = []
        for raw_threshold in values:
            threshold = float(raw_threshold)
            rows.append(
                {
                    "threshold": threshold,
                    "splits": {
                        split: binary_threshold_metrics(
                            split_records.get(split, []), feature, comparison, threshold
                        )
                        for split in SPLITS
                    },
                }
            )

        sensitivity = []
        for previous, current in zip(rows, rows[1:]):
            split_deltas = {}
            for split in SPLITS:
                split_deltas[split] = {
                    metric: _metric_delta(
                        current["splits"][split].get(metric),
                        previous["splits"][split].get(metric),
                    )
                    for metric in (
                        "precision",
                        "recall",
                        "specificity",
                        "balancedAccuracy",
                        "selectionRate",
                    )
                }
            sensitivity.append(
                {
                    "fromThreshold": previous["threshold"],
                    "toThreshold": current["threshold"],
                    "deltas": split_deltas,
                }
            )

        output[name] = {
            "feature": feature,
            "comparison": comparison,
            "candidates": rows,
            "sensitivity": sensitivity,
        }
    return output


def temporal_stability(threshold_results: Mapping[str, dict]) -> dict:
    stability = {}
    for name, result in threshold_results.items():
        rows = []
        for candidate in result["candidates"]:
            validation = candidate["splits"]["validation"]
            holdout = candidate["splits"]["holdout"]
            rows.append(
                {
                    "threshold": candidate["threshold"],
                    "validationToHoldout": {
                        metric: _metric_delta(holdout.get(metric), validation.get(metric))
                        for metric in (
                            "precision",
                            "recall",
                            "specificity",
                            "balancedAccuracy",
                            "selectionRate",
                        )
                    },
                }
            )
        stability[name] = rows
    return stability
