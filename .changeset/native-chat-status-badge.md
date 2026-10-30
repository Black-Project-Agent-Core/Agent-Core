---
"agent-core": patch
---

The chat bar badge no longer flips between "Agent Ready" and "Provider Not Configured" when a status poll misses: it keeps the last known runtime state and reads "Connecting…" before any has arrived. The "Finalizing N" chip beside it is removed.
