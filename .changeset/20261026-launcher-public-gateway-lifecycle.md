---
"agent-core": patch
---

`Agent Core.exe` now starts and owns the public MCP gateway on `127.0.0.1:8788` after Core is healthy, so the Cloudflare VPC route is available whenever Agent Core runs. Launcher close stops only that exact-owned gateway. The gateway's behavior and routes are unchanged.
