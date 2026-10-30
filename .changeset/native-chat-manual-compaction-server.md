---
"agent-core": patch
---

Native chat automatic context compaction now starts at 100% of the known context window instead of 75%, and the server accepts a manual "compact now" request for a running turn (`POST /agent/chat/turns/:turnId/compact`). A manual request compacts the running turn once at its next iteration; it is refused with `not-running` for any other turn. The Compact button and `/compact` command arrive in later changes.
