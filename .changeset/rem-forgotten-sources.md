---
"agent-core": patch
---

REM maintenance no longer uses a record marked forgotten as a digest source. The planner excludes forgotten ids (a failed read fails the digest step), and the digest commit rechecks its members before the canonical transaction, so a source forgotten while a model rewrites the text is refused. Fixes forgotten text resurfacing in new digests and, with model assist enabled, reaching the provider. A digest written before its source was forgotten is not rewritten.
