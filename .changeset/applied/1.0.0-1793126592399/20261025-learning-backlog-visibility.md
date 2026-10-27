---
"agent-core": minor
---

Make the Learning review backlog visible and closable. A checkpoint's `summary` is now stored on its pending review (bounded and safety-scanned; a secret-shaped summary is dropped and reported as `summaryDropped`). `learning(action=status)` reports `freshReviewCount`, `staleReviewCount` and `oldestPendingAt`, and `reviewDue` counts only reviews younger than seven days while `pendingReviewCount` stays the total. The new `learning(action=backlog)` returns the pending reviews and the latest decisions without the whole history. An external controller can close a pending checkpoint that no live task owns (older than seven days, with no task or a closed or equally untouched external episode) with a disposition and a written reason, recorded as a `stale-orphan` resolution. A `verified-recovery` checkpoint now returns a `procedureScaffold` with the questions that make a procedure candidate admissible.
