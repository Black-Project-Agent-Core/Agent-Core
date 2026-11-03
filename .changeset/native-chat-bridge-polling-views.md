---
"agent-core": patch
---

The Native chat bridge gets two cheap ways to follow a running turn. `read <conversationId> --status` (MCP `read` with `statusOnly`) returns only the newest turn's small scalar fields and the message count, plus the reply once the turn has ended; the brief and the profile are left out. `wait <conversationId> [--timeout-ms 1000..540000]` (MCP action `wait`, default 45 s) polls every 5 s and returns one status record, with `waiting: true` when the turn is still running at the timeout. The ordinary `read` also drops the inline profile avatar, about 2.5 KB per read. Nothing else in the bridge or the Native route changes.
