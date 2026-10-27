---
"agent-core": patch
---

The official restart no longer waits for, or refuses to launch because of, a process that runs a script outside the checkout with the bundled `runtime\node\node.exe`, such as the Claude Desktop stdio bridge (`agent-core-stdio-bridge.mjs`). Such a process is an HTTP client of Core and does not exit when the launcher closes, so before this change every restart failed with "Batas tunggu shutdown habis" and left Agent Core stopped while Claude Desktop was running. Processes whose first argument is a flag, a relative path or a path inside the checkout stay counted as project processes.
