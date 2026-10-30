---
"agent-core": minor
---

Native turns call their tools through a plain in-process registry instead of building an MCP server, client and transport each turn. The same tool registrations and their grant, mutation-safety and evidence wrappers are reused, the model sees the same tool contract, and Stop and the 60 s call bound still apply. MCP stays the surface for third parties. The previous in-memory MCP path remains only behind AGENT_CORE_NATIVE_TOOL_TRANSPORT=mcp.
