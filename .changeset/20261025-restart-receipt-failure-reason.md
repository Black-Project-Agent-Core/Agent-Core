---
"agent-core": patch
---

Make restart receipts explain failures: the restart worker now always ends its output with a final status line, and the scheduled-task wrapper records the worker's last failure line, or a note that the worker ended without a final line, in the receipt's `error` field instead of leaving it empty.
