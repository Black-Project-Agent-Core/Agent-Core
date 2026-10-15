---
"agent-core": patch
---

Make the existing external legacy MCP JSON route wait for the same request-local transport/product close completion after abort or normal finalization, preserving eager initiation, teardown order, fail-soft errors, and the public MCP contract.
