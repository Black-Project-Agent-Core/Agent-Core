---
"agent-core": patch
---

A read-only work receipt and a theme contract test. `node scripts/inspect/work-receipt.mjs` summarizes what the local Activity Tracker recorded over the last N days (tool calls, failures kept as their own stream, Learning checkpoints and reviews, Memory tool calls, active days) plus commit and distinct-file counts for repositories you name. It shows `?` instead of 0 when something cannot be read, reports no money, hours saved or per-project attribution (the journal has no project field), and writes a file only under `runtime/tmp`. The UI gains `theme-contract.test.ts`: every text colour token keeps at least 4.5:1 contrast on every surface, the focus ring keeps 3:1, the two weaker tokens are never used as text, and the stylesheet loads nothing from outside.