---
"agent-core": patch
---

memory_search starts its recency touches after the retrieval ledger write, so a search no longer waits behind full-store touch commits on the memory lock.
