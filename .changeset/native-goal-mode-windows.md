---
"agent-core": minor
---

Native Goal mode now works in iteration windows (default 200, `AGENT_CORE_AI_GOAL_MAX_TOOL_ITERATIONS`): at the end of a window the turn is parked as resumable for Continue instead of failing, so a long goal is no longer cut off by the iteration cap. When a normal turn reaches its cap, the final report now uses DONE / OPEN / NEXT headings and names the compaction ids that hold original tool output.
