---
"agent-core": minor
---

The Context card's per-category estimate now splits Skill content out of "System Instructions" into its own "Skills" category (the host Skill guidance text plus any `skills` tool result), and ordinary tool results into "Tool Results" (previously folded into "Conversation"). The real per-call measurement now also carries the provider's cache-read/cache-write tokens, kept across later ticks until the next real call. Between provider calls in the same turn, once tool results have been appended to the prompt, a display-only interim `context.usage` estimate (`estimated: true`) extrapolates from the last real measurement plus the newly added characters, so the context meter updates on every tool step instead of jumping only after the next model call; it is never read by compaction, checkpoint or any limit decision. Old turns and stored breakdowns without these fields keep reading exactly as before.
