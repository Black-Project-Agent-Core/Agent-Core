# Memary Steal/Use Integration Plan

Status: **CLOSED — ZERO-VALUE FOR CURRENT AGENT CORE — REFERENCE RETIRED / DELETED**

Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\08-memary`
Upstream: `https://github.com/kingjulio8238/memary.git`
Observed ref: `main` / `b2331a2c0844d66f69acd607b9e4dbaba56552c1`.
License: MIT.

## Source-first census

The checkout contains 27 Python files. Executable families were inspected directly:
- JSON `MemoryStream` and `EntityKnowledgeStore`;
- chat/context eviction and summarization;
- Neo4j/FalkorDB/LlamaIndex knowledge-graph retrieval;
- LLM entity extraction and synonym expansion;
- ReAct routing/default utility tools;
- recursive retrieval development code and its LLM-judge benchmark;
- the only memory unit tests, covering basic add/remove/save/load/entity-count behavior.

Current Agent Core owners compared directly: transactional file-native MemoryService, hybrid semantic/lexical/BM25 retrieval, typed memory links, provenance/revisions, Learning verified-evidence review, Memory curator, Grafel graph, and controller semantic metadata.

## Final classification

No current-fit mechanism remains that is both stronger than current Agent Core and adoptable without creating a duplicate authority.

- MemoryStream JSON list: **REJECT** — materially weaker than canonical Markdown + transaction journal + revisions.
- entity count/latest-date store: **REJECT** — overlaps keywords/tags/retrievalCount/lastAccessedAt without adding durable relationship semantics.
- Neo4j/FalkorDB knowledge graph: **REJECT** — would add a third memory/graph store beside MemoryService and Grafel.
- LLM entity extraction/synonym expansion: **REJECT** — hidden provider/model dependency; controller metadata + BM25/semantic retrieval already owns this role.
- recursive KG neighborhood retrieval: **REJECT** — depends on the rejected second graph store and unverified LLM extraction pipeline.
- context eviction/summarization: **REJECT** — Agent Core does not own the external controller transcript and must not mutate it.
- ReAct routing/tools: **REJECT** — duplicates external controller/tool routing and introduces unrelated web/location/vision/stocks behaviors.
- LLM response judge benchmark: **REJECT** — weaker than Agent Core's evidence-bound Learning evaluation and verifier-revision model.
- basic age-based deletion: **REJECT** — current curator is proposal-only; automatic memory deletion is intentionally not adopted.

The development recursive-retrieval code is exploratory rather than a production subsystem. Its entity/synonym approach can be reproduced from generic retrieval knowledge and does not justify retaining this checkout.

## Retirement preconditions checked

- Current Agent Core production source/scripts/tests contain no dependency on the `08-memary` checkout path or upstream name; remaining hits are conversation/history documentation only.
- Process inventory contains no `08-memary` path reference.
- Root folder is a normal directory, not a symlink/junction/reparse target.
- No Memary code has been copied into current Agent Core during this grounding.
- Provenance required for future audit is preserved in this document: upstream URL, observed ref, license, and audited source families.

## Decision

**DELETED AS CORPSE** under the user's explicit instruction. Pre-delete inventory: **143 files / 48 directories / 20,174,208 logical bytes**. Exact-path readback after removal returned `existsAfter=false`. This retirement removed only the protected reference checkout; Agent Core Memory, Learning, Grafel, runtime state, and historical conversation documentation were not removed.

Open implementation items: **NONE**.
