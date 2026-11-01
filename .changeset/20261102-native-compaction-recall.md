---
"agent-core": minor
---

Native turn compaction is now recoverable and more faithful. A new read-only control tool `agent_core_compaction_source` (presented only once the turn has a compaction digest, so it costs no schema tokens before that) returns the exact, digest-verified, redacted messages a compaction replaced, in pages with a next offset; the digest header names the tool and the `cmp-` id. The extractive digest also raises its per-line caps (up to 4x) while it still fits the 12,000-character budget and, when lines must be dropped, keeps user notes and ERROR results first. No model call, no new store, no new permission.
