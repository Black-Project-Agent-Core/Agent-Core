---
"agent-core": patch
---

Keep launcher recovery active after a cold-start failure so a late-ready Core is followed by its public MCP gateway and tunnels. Reuse and start the exact project Cloudflared Windows service without creating a second connector; launcher shutdown and residual cleanup preserve service-managed processes. Preserve existing authentication, path allowlists, lifecycle serialization and explicit Core stop behavior.
