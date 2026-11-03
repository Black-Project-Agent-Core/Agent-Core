---
"agent-core": patch
---

The official restart (`Restart-Agent-Core.cmd`) no longer waits for bundled-Node processes that a coding agent started. A Codex app-server broker or an MCP server such as context-mode runs with the project's Node and a script under `runtime\npm-prefix`, so the worker counted it as part of Core's runtime. It never exits when the launcher closes, so the shutdown wait ran out after 120 seconds and the worker refused to launch, leaving Core stopped. The worker now reads the process ancestry: a bundled-Node process whose ancestors include a shell or agent host (`bash.exe`, `sh.exe`, `codex.exe`, `claude.exe`) and none of Core's roots is treated as a client, and stays one for the whole restart. Core's own children, orphans whose parent is gone, and reused PIDs are still counted as owned.
