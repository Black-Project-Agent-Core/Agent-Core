---
"agent-core": patch
---

Start the optional Cloudflare named tunnel (`cloudflared`) together with Core from the desktop launcher, so the tunnel comes online whenever `Agent Core.exe` runs. The token reaches the child only through its environment or `--token-file`; a missing exe or token is skipped, a running project-local cloudflared is reused, the watchdog restarts only a dead process, and shutdown and the launcher restart actions include it.
