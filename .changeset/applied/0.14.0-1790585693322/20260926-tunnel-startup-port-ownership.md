---
"agent-core": patch
---

Start the desktop tunnel only after Core and OAuth discovery are ready, recover an owned tunnel stuck with failed startup discovery, and serialize launcher process lifecycle actions while reusing an existing Core process to prevent duplicate listeners on port 8765.
