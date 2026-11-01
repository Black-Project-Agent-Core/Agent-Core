---
"agent-core": patch
---

Removed the legacy in-memory MCP client/server fallback for Native tool dispatch (`McpToolPort`, `AGENT_CORE_NATIVE_TOOL_TRANSPORT=mcp`), kept since `native-direct-tool-host` as an unused escape hatch. Native always dispatches its own tools through the in-process registry now; there is no remaining code path that builds an `McpServer`/`Client` pair for Native's own turns. MCP stays the surface for third parties only (`src/mcp/handler.ts`, the external HTTP `/mcp` route). No behavior change on the default path; `AgentRuntimeToolSession.transport` is now always `'direct'`.
