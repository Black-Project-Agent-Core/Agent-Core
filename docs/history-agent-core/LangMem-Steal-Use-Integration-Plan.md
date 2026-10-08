# LangMem Steal/Use Integration Plan
> Status: SOURCE-FIRST EXHAUSTED — RETIRED / DELETED — ZERO CURRENT-FIT ADOPTION
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\03-langmem`
> Audited HEAD: `9d033b47d9ce53e37e92c92241b0496c0278932e`
> Remote: `https://github.com/langchain-ai/langmem.git`
> License: MIT
> Grounding date: 2026-09-25

## Source-first basis
The checkout was Git-clean before retirement and contained 91 tracked files.
Inspection covered implementation families under `src/langmem`: knowledge extraction/tools, local/remote reflection executors, prompt optimizers, short-term summarization, semantic examples, graph-RAG draft, and focused test/cassette evidence.
This plan does not use the README as implementation proof.

Current Agent Core comparison included MemoryService create/update/delete/batch, typed links, semantic search/evolution/consolidation, Learning review/curation/decision evidence, Reflexion controller policy, Grafel, and controller-owned conversation context.

## Family disposition
Memory create/update/delete tool: ALREADY COVERED by canonical MemoryService MCP tools and transactional `memory_batch`; LangMem's LangGraph store/namespace runtime is unnecessary.

Existing-memory-aware extraction with stable document IDs and insert/update/delete operations: REJECT as an internal model-driven mutation engine. Agent Core deliberately keeps semantic judgement in the controller and already exposes explicit canonical mutations. Learning review does not need a second hidden model to alter memory.

ReflectionExecutor delayed/latest-wins queue: REJECT for current architecture. It introduces a background reflection worker and timer semantics where Agent Core's controller/Learning checkpoints remain the authority. No current native consumer requires a per-thread deferred reflection daemon.

Prompt-memory, gradient, metaprompt, multi-prompt optimizers: REJECT — persistent instruction/prompt mutation is controller-owned and requires explicit review, not an internal optimizer.

Short-term rolling summarization: REJECT — conversation/context compaction belongs to the controller/product context layer, not the machine-side Agent Core bridge.

Graph-RAG source: REJECT — the file is commented demonstration code and graph ownership already belongs to canonical Memory links plus Grafel structural code intelligence.

Schema-specific memory stores and runtime namespaces: REJECT for current scope. Agent Core canonical records already have fixed validated metadata/provenance and this instance has no multi-tenant namespace consumer that justifies another store.

Semantic memory graph examples and search wrappers: ALREADY COVERED by MemoryService semantic index, typed links, consolidation, and search; no unique executable graph mechanism remains after excluding the commented draft.

## Final retirement census
Current Agent Core `src`, `scripts`, and `tests` contain zero references to `03-langmem` / `langmem`.
The checkout is a normal directory, not a reparse/link boundary.
No independent active process/session was using the checkout path at retirement time.
No source-backed current-fit capability remains after the family census above.

**Disposition: CORPSE — DELETE.**
The MIT pin/remote/license provenance is retained in this plan. No LangMem code is transplanted, so no runtime attribution notice is added.
No tests, dependency installation, build, restart, release action, or product mutation are part of this grounding task.

## Retirement closure — 2026-09-25
The protected checkout was deleted after the full source-family and zero-dependency/process/reparse census.
Readback of `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory` confirms `03-langmem` is absent.
No LangMem code was adopted and no runtime/source/release behavior changed.
