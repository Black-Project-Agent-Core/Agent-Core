# Graphiti Steal / Use Integration Plan

> **Status:** COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — REFERENCE RETIRED
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\13-graphiti`
> **Revision:** `c035afb7990b6077331a81e98b04efcfd9bf8184` (main, clean before inspection marker)
> **License:** Apache-2.0
> **Runtime dependency:** NONE
> **Scope exclusion:** New Chat, chat/session runtime, model/provider runtime.

## 1. Grounding evidence

Fresh source census: 363 files, 271 executable-code files, 72 test-code files, 22,462,071 bytes, 0 reparse points.

Executable families were inspected from source, not inferred from README:
- `graphiti_core`: graph entities/edges, temporal fact lifecycle, search/reranking, maintenance/dedup, drivers, model/embedder adapters, prompts and telemetry;
- `mcp_server` / `server`: alternate service/tool surfaces;
- examples/tests/signatures/spec: supporting evidence.

Grafel second opinion is current for workspace `ref-graphiti` with complete 1/1 graph coverage. Exact source remains authority.

Current Agent Core overlap:
- Memory links already support `related|supports|supersedes|contradicts|derived-from`, bounded strength/reason, same-target+type dedup and deterministic link expansion.
- Current Memory source has no `valid_at`, `invalid_at`, reference-time, or per-link evidence lineage fields.
- Agent Core already owns BM25/semantic fusion and redundancy-aware retrieval, so Graphiti's search stack is not a missing owner.

## 2. Selected proposal

### GRAPHITI-P1 — temporal Memory relationship validity + evidence lineage

Source mechanisms:
- `EntityEdge.valid_at`, `invalid_at`, `reference_time`, `episodes`;
- multi-episode attribution in `build_episodic_edges` / `extract_edges`;
- exact duplicate edge coalescing and explicit separation of duplicate vs invalidation candidates in `resolve_extracted_edges`;
- direct tests for duplicate reuse, episode attribution and invalidation results.

Independent Agent Core adaptation:
- extend canonical `MemoryLink` with optional temporal/evidence metadata such as:
  - `validFrom`;
  - `validTo`;
  - `referenceTime`;
  - bounded `evidenceRefs` referencing Memory IDs/source evidence, never chat/session IDs;
- preserve current link identity `targetId + type`; duplicate link material merges bounded evidence and preserves the earliest creation timestamp while only strengthening confidence explicitly;
- active link traversal/search expansion ignores links whose explicit validity window has ended by default;
- read/inspection surfaces can expose historical links rather than deleting them;
- explicit controller operations may close/supersede a relation and attach evidence; deterministic intelligence may propose but must not silently invalidate facts;
- existing `supersedes`/`contradicts` semantics remain relationship types, while temporal validity records *when* a relationship was considered valid;
- old canonical Memory notes without these fields remain valid and behavior-compatible.

Safety/authority constraints:
- no LLM-driven fact extraction or automatic contradiction judgment;
- no Graphiti graph database, drivers, server, MCP, telemetry or provider dependencies;
- no automatic deletion of historical Memory;
- pinned foundation rules and existing canonical transaction/rollback safeguards remain authoritative.

Acceptance for a later implementation:
- old v1 links parse without migration loss;
- duplicate evidence cannot create duplicate same-target+type links;
- `validTo` does not remove historical evidence from canonical Memory;
- active traversal excludes expired links deterministically while explicit historical inspection can still see them;
- invalid temporal ranges fail closed;
- evidence refs are bounded and target-valid where they are Memory IDs;
- no background process/model is introduced.

## 3. Covered / rejected source families

Covered by current Agent Core:
- BM25 + semantic hybrid retrieval, reciprocal-rank-style fusion and redundancy-aware selection;
- graph/code relationships through Grafel;
- canonical Memory relationship types and consolidation proposals.

Rejected:
- Neo4j/Falkor/Kuzu/Neptune persistence drivers;
- Graphiti LLM/embedder/reranker providers and prompt extraction pipelines;
- automatic fact contradiction/invalidation by model output;
- community-generation pipeline;
- Graphiti MCP/server deployment;
- PostHog/other telemetry transport.

Support only:
- examples, tests, signatures and specification material.

## 4. Reference disposition

**RETIRED/DELETED 2026-09-27.** GRAPHITI-P1 was independently implemented and targeted-verified. Fresh post-adoption census found zero current `src`/`scripts` path dependencies, zero non-shell live consumers, and no remaining current-fit ecosystem family. Retirement evidence: `runtime/tmp/graphiti-claude-codemem-tencent-post-adoption-retirement-20260927.json`.

## 5. Approved implementation closure — 2026-09-27

GRAPHITI-P1 is implemented in Agent Core-owned source:
- canonical `MemoryLink` supports optional `validFrom`, `validTo`, `referenceTime`, and bounded `evidenceRefs`;
- `normalizeLinks` validates temporal ranges, merges same-target/type evidence deterministically, rejects chat/session evidence authority, and validates `memory:<id>` evidence;
- active retrieval expansion ignores expired/not-yet-valid links while canonical read keeps historical relationship evidence;
- commit-time store validation rejects dangling Memory evidence refs;
- temporal fields are exposed through existing `memory_batch(op=link)`, avoiding repeated public-schema bloat in remember/update.

No Graphiti graph DB, server, LLM, provider, telemetry, or runtime dependency was added.

Verification: targeted adoption/regression/manifest suite 12/12 PASS; `npm run build` PASS; path policy 258/0. After the user-controlled restart/reconnect, resident Core PID 1624 is running `runtime\node\node.exe -> dist\index.js`, `/health` is `ok`, the fresh connector exposes 70 Agent Core tools, and the new Memory surfaces are callable live. GRAPHITI-P1 is therefore installed-runtime verified and live-activated.
