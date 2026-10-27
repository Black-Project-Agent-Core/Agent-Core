---
"agent-core": minor
---

Native Agent: the turn Stop signal now reaches the in-flight MCP tool call (no dispatch after Stop; cooperative tools stop, late results are discarded, a mutating call keeps its unknown-result checkpoint). One context accounting (bytes, upper bound, estimate, observed provider usage, output reserve) now backs continuation requirements, route admission and refusals, and a request-size shortfall no longer overwrites a route's ready verdict. Durable, provenance-bearing compaction: a deterministic digest of chat messages that fall out of the history window and of the middle of a long turn, with the exact replaced messages archived in the chat store in the same transaction as the compacted checkpoint (`AGENT_CORE_AI_COMPACTION=off` disables it). Claude plugin skill compatibility preview and adapter, and a read-only actual-changes panel, ship in the same release (see CODEBASE).
