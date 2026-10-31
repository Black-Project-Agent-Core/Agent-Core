# Memory capture

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Memory capture protocol

- Treat the connected AI/controller as the semantic analyzer for durable memory capture. Before calling `memory_remember`, derive concise high-signal `keywords`, a factual `context`, non-redundant `tags`, and a meaningful `category` from the durable content when those fields can be determined confidently, and send them in the same tool call.
- When `memory_update` replaces substantive content, refresh semantic metadata in the same call when the existing keywords/context/tags/category would become stale.
- Do not invent facts or rewrite a memory from neighboring-memory inference. Use typed links for relationships; Agent Core's internal memory evolution remains conservative and may only enrich missing metadata plus add/strengthen bounded related links.
- When inspecting a possible memory evolution before committing it, use `memory_evolve(mode=preview)`. Preview is proposal-only: it returns the exact deterministic owner proposal plus bounded current neighbor metadata/relationship evidence and must not mutate canonical memory, reciprocal links, or the derived index.
- Neighbor evidence is review context, not mutation authority. If it reveals stale neighbor metadata, derive any patch yourself from inspectable evidence and apply it only through an explicit `memory_update` or preferably one atomic `memory_batch`; never treat similarity alone as permission to rewrite neighboring memory.
- If semantic metadata cannot be determined confidently, omit the uncertain optional fields. MemoryService deterministic enrichment remains the fail-soft fallback, so memory capture must not depend on a second internal LLM/provider.

