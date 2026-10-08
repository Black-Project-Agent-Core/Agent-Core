# Memori Steal/Use Integration Plan

> **Dated implementation evidence — 2026-09-25.** The activation-pending and release-version statements below belong to that session. Current source retains [BM25 scoring](../src/memory/bm25.ts) and [legacy retrieval integration](../src/memory/retrieval.ts), while current Memory host ownership also includes the [v2 integration](Agent-Core-Memory-v2-Installation-20261008.md). This documentation review does not establish current resident ranking behavior or reopen an old restart request.
> Status: MEMORI-P1 IMPLEMENTED — TARGETED VERIFIED — COMPILED DIST QUALIFIED — LIVE ACTIVATION PENDING — REFERENCE RETIRED / DELETED
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\02-Memori`
> Remote: `https://github.com/MemoriLabs/Memori`
> HEAD ref text: `574b1ea3e876f100ef82c37817d603eb7e258e59`
> License: Apache-2.0
> Grounding date: 2026-09-25

## Evidence integrity
This audit uses executable source and tests rather than README claims.
The checkout contains substantial Python, TypeScript, and Rust implementation code.
Git metadata is degraded: `.git/HEAD` targets `refs/heads/main` and `git rev-parse HEAD` returns the hash above, but object-dependent Git operations report `fatal: bad object HEAD`.
Current file bytes are therefore the source authority for this plan.

Selected source anchors:
- `memori/search/_lexical.py` SHA-256 `930165C2CD24A94676B31D473B51960E2A7D740B1940BE7EA719253FC98E2725`
- `memori/search/_core.py` SHA-256 `4C2C39F38D40BADFA11D7CE3C7F6160A0ED6F563E994DDF9D5FFF73F768FEB8F`
- `core/src/retrieval/pipeline.rs` SHA-256 `06FA968C97E451D63A81CE6D8D45B8E77EE63B65275B883073A9E093B439A6CA`

## MEMORI-P1 — adaptive BM25 lexical signal for MemoryService search
**Recommendation: SELECTABLE — current native gap confirmed.**

Memori source computes BM25 over fact content, normalizes lexical scores, and combines them with dense similarity. It increases lexical weight for one/two-token queries. Rust retrieval tests independently exercise dense retrieval followed by reranking and preserve raw similarity separately from final rank score.

Current Agent Core `src/memory/retrieval.ts` is hybrid, but its lexical signal is token-set overlap plus metadata matches. It has no BM25 term-frequency/inverse-document-frequency signal and no query-length-aware lexical weighting. `src/memory/consolidation.ts` uses Jaccard only for merge review, not search ranking.

### Proposed native adaptation
Add a dependency-free TypeScript BM25 scorer over the existing canonical semantic document for each memory record.
Keep current exact phrase, token overlap, metadata, source-file, recency, semantic, and typed-link signals.
Expose BM25 as its own explainable retrieval component rather than changing the meaning of an existing component.
Use a bounded stronger lexical contribution for very short meaningful queries.
Use zero BM25 contribution for empty/stopword-only input.
Preserve deterministic tie ordering and existing fallback when embeddings are unavailable.

Do not copy Memori's dense-only candidate pruning unchanged. Agent Core has exact/source/metadata signals that can identify records outside a dense-only candidate pool, so whole-record eligibility should remain unless later evaluation proves a safe pruning rule.

### Implementation scope after user selection
Likely owners: new pure `src/memory/bm25.ts`, narrow retrieval/type changes, and focused retrieval tests.
No Memori runtime, database, storage adapter, external service, model, timer, or worker is required.
Whether the BM25 profile becomes default or remains explicitly selectable must be decided only after fixed-corpus comparison against current ranking.

### Acceptance
- rare exact terms receive stronger lexical separation than token overlap alone;
- short-query weighting remains bounded;
- semantic failure still returns deterministic results;
- exact/source-file boosts and linked-neighbor expansion continue to work;
- search limit and output-budget behavior remain unchanged;
- legacy versus BM25 ranking is recorded on fixed fixtures before any default change.

## Exhaustion ledger
Structured entity triples/knowledge-graph writes: REJECT — would create a second semantic graph beside typed Memory links/Grafel and require new extraction authority.
Automatic conversation augmentation and summaries: REJECT — duplicates controller/Learning ownership and introduces automatic model-driven capture.
Entity/process/session/conversation database hierarchy: REJECT — canonical file-native MemoryService is authoritative.
SQL/SQLite/Postgres/MySQL storage adapters and Rust storage bridge: REJECT — no current native consumer.
Cloud collector/API retry layer: REJECT — no external Memori service dependency should be added.
Embedding dimension validation: ALREADY COVERED by Agent Core MemoryIndex.
Transactional write batch: ALREADY COVERED by canonical mutation locking and `memory_batch`.
Raw/final score exposure: ALREADY COVERED by Agent Core total score plus retrieval components.

**Disposition: CLOSED — MEMORI-P1 selected and implemented; reference retired/deleted after final zero-value census.**


## Approved implementation result — 2026-09-25

The user explicitly selected MEMORI-P1. Agent Core implemented it natively without installing Memori or any new dependency.

Implemented ownership:
- new `src/memory/bm25.ts` dependency-free BM25 scorer;
- `src/memory/retrieval.ts` optional `rankingProfile: 'legacy' | 'bm25'`;
- additive public components `bm25Lexical` and `bm25Weight`;
- optional MCP `memory_search.rankingProfile` schema field;
- updated memory-search tool description;
- focused `tests/memory-bm25-ranking.test.ts` plus fallback/schema assertions.

Behavioral boundary:
- default remains `legacy`; no silent ranking change;
- `bm25` is opt-in;
- meaningful 1–2 token queries use bounded weight 0.9, longer queries 0.45, stopword-only queries 0;
- existing exact/token/metadata/source-file/semantic/link/recency signals remain;
- no dense-only pre-pruning was adopted.


Verification:
- BM25 ranking fixtures + semantic-fallback matrix: 6/6 PASS;
- additive MCP schema selection: 1/1 PASS;
- root TypeScript build: exit 0;
- compiled `dist` contains BM25 module, retrieval wiring, and MCP schema field.

A full `claude-mem-adoption.test.ts` run was not counted as a suite pass: six unrelated Git-fixture cases fail on this Windows filesystem because newly initialized temp repos require `safe.directory`; the directly relevant schema case passes. A separate `memory-maintenance.test.ts` run hung before producing a test result and was terminated; no PASS claim is made for it.

Release metadata:
- `.changeset/20260925-memory-bm25-ranking.md` records a minor additive capability;
- `THIRD_PARTY_NOTICES.md` preserves Memori Apache-2.0 attribution and exact source-byte hashes.

Final retirement guard found zero current `src/scripts/tests` dependency on the protected checkout, no reparse boundary, and no independent process using it. With every other source family already rejected/covered in the exhaustion ledger, `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\02-Memori` was deleted. Readback confirms it absent.

The connected live Core was not restarted. Source and compiled `dist` are qualified; live MCP activation remains pending an explicit restart.


Release readback:
- `release:plan`: current 0.13.0, minor, next 0.14.0, 2 pending intents;
- `release:check-intent`: `ok=true`;
- `release:compat`: `memory_search` adds only optional `rankingProfile`, no removed/newly-required/changed params, `breakingEvidence=false`, manifest budget within limits.

No `release:apply`, restart, commit, tag, push, publish, or deploy was performed.
