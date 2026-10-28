---
"agent-core": patch
---

Documentation: the capability index gains a short section, "Satu produk, dua registrasi", for the case where Agent Core is registered both as a local MCP server and as a Claude Desktop connector. It says to pick one form per session, do one contract handshake for it, never pass a contract session to the other form, name the product "Agent Core" in reports, and not to match tools by client prefix (no `mcp__` appears in `src`). It lives in the on-demand index, not in `AGENTS.md`, so the always-loaded text does not grow.