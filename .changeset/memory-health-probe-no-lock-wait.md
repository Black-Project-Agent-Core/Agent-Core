---
"agent-core": patch
---

The /health memory probe answers from the last known in-process state, marked stale, instead of queueing on the memory lock and timing out.
