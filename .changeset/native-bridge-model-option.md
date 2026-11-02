---
"agent-core": patch
---

The Native chat bridge script accepts `--model <id>` next to `--provider <id>` on `send`, so an external controller can pick the model of a Native turn (for example Sonnet 5.5 for implementation and Haiku 5.5 for test sessions). A model without a pinned provider, or a malformed id, is refused before any request. The MCP tool schema is unchanged.
