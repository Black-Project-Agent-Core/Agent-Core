---
"agent-core": minor
---

Show every Native tool step with its exact Input and Output in the chat. Each persisted step is a one-line row (tool, status, duration, argument preview) that opens into the Input and Output (scrollable, copyable, with a note when cut at 16 KB); the detail is requested through the launcher only when a finished step is opened and answered per step, so reload and bridge-started turns show the same steps. The Inspector card "Desktop tool activity" is replaced by "Tool Calls (N)" for the latest turn of the open conversation. A running step is fetched only after it finishes so a partial Output is never cached.
