---
"agent-core": patch
---

A successful `skills(read)` now records bounded host-prepared delivery metadata (digest, offsets, content and result byte counts, result SHA-256, never the instruction text) in its activity record, so a client-visible result can be compared with what the host prepared.
