---
"agent-core": patch
---

Bind REM digests to exact source revisions and bounded policy generations. Recheck admission and idempotency in the canonical transaction, preserve digest identity/history, defer ambiguous legacy or operator-edited output, and report skipped/failed/deferred work without source snippets. Keep the existing loop and work limits; add no model, scheduler, store or feature activation.
