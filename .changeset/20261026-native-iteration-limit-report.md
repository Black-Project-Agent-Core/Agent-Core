---
"agent-core": patch
---

When a Native turn reaches the tool-iteration limit, the controller now makes one more model call without tools and sends the resulting short report (what was observed, what is inferred, what is unchecked) as `response` on the `turn.failed` event, so a stream consumer such as the external Native chat bridge receives the work done so far. The turn still fails with `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED`, the call is skipped when no provider attempt is left, and a failed report call keeps the previous behavior. The report is not stored in the conversation history.
