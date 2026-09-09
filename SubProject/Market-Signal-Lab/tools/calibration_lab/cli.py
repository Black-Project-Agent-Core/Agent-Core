from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .artifact import build_candidate_artifact
from .canonical import canonical_json_bytes
from .discover import discover_suitability
from .manifest import build_dataset_manifest
from .report import evaluate_dataset
from .schema import load_jsonl_records


def _load_config(path: Path) -> dict:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("calibration config must be a JSON object")
    return payload


def _write_json(value: dict, path: Path | None) -> None:
    data = canonical_json_bytes(value) + b"\n"
    if path is None:
        sys.stdout.buffer.write(data)
    else:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(data)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="msl-calibration-lab")
    sub = parser.add_subparsers(dest="command", required=True)

    audit = sub.add_parser("audit-dataset", help="validate dataset schema and emit canonical manifest")
    audit.add_argument("--config", type=Path, required=True)
    audit.add_argument("--data", type=Path, nargs="+", required=True)
    audit.add_argument("--output", type=Path)

    evaluate = sub.add_parser("evaluate", help="run offline calibration evaluation")
    evaluate.add_argument("--config", type=Path, required=True)
    evaluate.add_argument("--data", type=Path, nargs="+", required=True)
    evaluate.add_argument("--output", type=Path)
    evaluate.add_argument("--artifact-output", type=Path)

    discover = sub.add_parser("discover", help="report calibration suitability counts without raw rows")
    discover.add_argument("--root", type=Path, required=True)
    discover.add_argument("--output", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "discover":
            _write_json(discover_suitability(args.root), args.output)
            return 0
        config = _load_config(args.config)
        if args.command == "audit-dataset":
            records = load_jsonl_records(args.data)
            manifest = build_dataset_manifest(args.data, records, str(config.get("evidenceClass", "")))
            _write_json(manifest, args.output)
            return 0
        if args.command == "evaluate":
            report = evaluate_dataset(config, args.data)
            _write_json(report, args.output)
            if args.artifact_output is not None:
                _write_json(build_candidate_artifact(config, report), args.artifact_output)
            return 0
        raise ValueError(f"unsupported command: {args.command}")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"calibration-lab error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
