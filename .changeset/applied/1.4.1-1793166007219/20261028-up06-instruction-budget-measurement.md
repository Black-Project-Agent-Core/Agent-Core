---
"agent-core": patch
---

Measure the always-loaded text before anyone trims it. A read-only script, `scripts/verify/agents-md-audit.mjs`, reports the size of AGENTS.md by section, repeated lines, paths and tool names it cites that do not exist, the cost of the capability pack descriptors, the bytes of each tool in the manifest (largest first, with the headroom left under the 128 KiB budget) and where the first `controller_contract` instruction sits in the assembled server instructions. A test pins that instruction near the start of the assembled text. A compaction record now lists the request bytes by source (system, user, assistant, tool results, tool schemas). No contract wording changed and nothing is trimmed.
