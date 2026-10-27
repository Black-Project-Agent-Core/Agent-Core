#!/usr/bin/env python3
"""Supply a bounded, non-blocking relevance reminder; never classify or log briefs."""

import json
import sys
from pathlib import Path

MAX_INPUT_BYTES = 1024 * 1024


def context_for(payload):
    if not isinstance(payload, dict) or payload.get("hook_event_name") != "UserPromptSubmit":
        return {}
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return {}
    skill = Path(__file__).resolve().parents[1] / "SKILL.md"
    if not skill.is_file():
        return {}
    context = (
        "First understand the user's current task and constraints. For software work where "
        "workload scale, latency, throughput, CPU/I/O, or memory use affects implementation, "
        f"read $performance-oriented-software-engineering at {skill.as_posix()}. "
        "Analyze the workload before selecting an implementation strategy. "
        "Choose only beneficial techniques and verify performance claims. "
        "For unrelated work or trivial edits, continue without this skill."
    )
    return {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": context}}


def main():
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        # Drain without retaining a large brief or breaking the host pipe.
        while sys.stdin.buffer.read(65536):
            pass
        return 0
    try:
        result = context_for(json.loads(raw))
    except (ValueError, TypeError, OSError):
        return 0
    if result:
        print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
