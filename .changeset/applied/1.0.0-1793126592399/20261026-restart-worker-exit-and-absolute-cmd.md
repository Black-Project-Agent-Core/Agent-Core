---
"agent-core": patch
---

The restart worker now waits for the old launcher process itself to exit after the official exit event, instead of stopping at the child processes, so it never copies over a locked `Agent Core.exe`. The `restart_agent_core` tool starts `Restart-Agent-Core.cmd` by absolute quoted path, because cmd cannot find a bare file name when `NoDefaultCurrentDirectoryInExePath` is set in the inherited environment.
