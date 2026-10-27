---
"agent-core": patch
---

Normalize the Worker `Host` request header in the project-local public MCP gateway by removing an invalid trailing slash. This fixes a reproducible local HTTP 500 response on unauthenticated `/mcp` requests while preserving OAuth routing, route restrictions, and the existing backend. The remote Cloudflare Worker origin migration is separate and remains pending.
