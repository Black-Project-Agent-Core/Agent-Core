---
"agent-core": patch
---

Merge seven groups of identical helper functions into one owner each without changing behaviour: `comparablePath` (`src/portability/paths.ts`), `pathExists` and `fingerprintBytes` (semantic IDE), `zipText` and `semanticRequested` (document projection helpers), workflow `diagramId`/`escapeHtml` (`src/workflows/text.ts`), `sendNoStoreJson` (`src/http/json-response.ts`) and the MCP text/error result builders (`src/mcp/text-result.ts`). Maintenance evidence and the groups left open are in `docs/verification/Maintenance-Pass-20261101.md`.
