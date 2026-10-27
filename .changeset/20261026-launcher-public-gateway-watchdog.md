---
"agent-core": patch
---

`Agent Core.exe` now runs a watchdog that checks Core `/health` and the public MCP gateway on `127.0.0.1:8788` every 30 seconds, and starts whichever is down. A Core stop chosen in the desktop UI is respected until Core is started again. The gateway and Core routes and their authentication are unchanged.
