# A-MEM Re-Grounding + Selective Adoption Plan — Agent Core

> **Status:** COMPLETE — IMPLEMENTED — LIVE-ACTIVATED — TARGETED VERIFIED — RE-GROUNDED 2026-09-22 — ZERO-VALUE RECONFIRMED — REFERENCE RETIRED
> **Updated:** 2026-09-22
> **Historical reference:** <PROJECT_ROOT>\Audit\A-MEM
> **2026-09-22 re-grounding reference:** <PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\steal-use-repos\A-MEM (temporary reference-only re-clone; deleted after final zero-value census)
> **Reference origin:** https://github.com/WujiangXu/A-mem-sys.git
> **Grounded revision:** f303dfc71e07bdc787f4bc135d4cea328ae30e99
> **Reference state:** retired/deleted after repeated zero-value census; provenance retained in this plan
> **Scope:** exhaustive source/test/history re-grounding of the exact A-MEM revision previously used by Agent Core
> **Install gate:** user approved the selected P1 + P2 implementation on 2026-09-20; no additional A-MEM mechanism is authorized beyond this documented scope

## 1. Purpose

Re-audit A-MEM from exact source and tests after Agent Core corruption recovery work, determine whether any useful mechanism remains unadopted, and prepare only evidence-backed proposals for user review.

This update supersedes the stale planning-only wording that survived filesystem recovery. Earlier A-MEM-derived mechanisms are already present in Agent Core; this document now separates:

- already-adopted behavior;
- mechanisms where Agent Core is stronger;
- dead/redundant A-MEM implementation;
- mechanisms rejected by Agent Core architecture;
- genuinely remaining proposal candidates.

No A-MEM runtime code is installed by this plan.

## 2. Audit method and evidence

Primary evidence was code, tests, Git history, and cross-repo structural inspection rather than README claims.

Audited source surface:

- agentic_memory/memory_system.py
- agentic_memory/retrievers.py
- agentic_memory/llm_controller.py
- agentic_memory/__init__.py
- tests/test_memory_system.py
- tests/test_llm_backends.py
- tests/test_utils.py
- pyproject.toml / requirements and relevant Git history

Census:

- 8 Python source/test files;
- approximately 1,570 Python lines;
- 21 repository commits total at this revision;
- code/test-changing history specifically re-read for consolidate_memories, metadata enhancement, SGLang, OpenRouter, and GPT-5 token handling;
- Grafel workspace audit-a-mem indexed at the exact grounded commit;
- structural dead-code analysis reported 23 unreachable entities/dependencies, which was treated as advisory and verified against exact source before drawing conclusions.

No A-MEM test suite was run during this planning task.

## 3. Exact A-MEM mechanism census

### M01 — MemoryNote metadata model

A-MEM stores content, id, keywords, links, retrieval_count, timestamp, last_accessed, context, evolution_history, category, and tags.

**Disposition:** ALREADY ADOPTED / AGENT CORE STRONGER.

Agent Core MemoryRecord already carries equivalent fields with stricter typing, ISO timestamps, typed weighted links, bounded evolution history, pinned protection, source metadata, and canonical Markdown persistence.

### M02 — LLM semantic metadata extraction

A-MEM analyze_content() asks an LLM for keywords, context, and tags, then selectively fills only missing/default fields.

**Disposition:** ALREADY ADOPTED BY DIFFERENT AUTHORITY BOUNDARY.

Agent Core deliberately keeps semantic judgment with the connected AI/controller and uses provider-independent deterministic fallback when fields are omitted. This avoids an internal memory-specific second LLM while preserving selective metadata enrichment.

### M03 — Enhanced embedding document

A-MEM ChromaRetriever.add_document() embeds content augmented with context, keywords, and tags.

**Disposition:** ALREADY ADOPTED / AGENT CORE STRONGER.

Agent Core semantic-document.ts already builds embedding text from content + context + keywords + tags + category, with one rebuildable derived index rather than Chroma metadata serialization.

### M04 — Vector-store retrieval

A-MEM uses in-process ChromaDB plus SentenceTransformer embeddings.

**Disposition:** REJECT.

Agent Core already has canonical file-native memory plus a rebuildable EmbeddingGemma index. ChromaDB would add a second derived authority and unnecessary Python/model dependencies.

### M05 — CRUD synchronization with vector retrieval

A-MEM update/delete mirrors mutations into ChromaDB by delete/re-add.

**Disposition:** ALREADY ADOPTED / AGENT CORE STRONGER.

Agent Core uses canonical atomic mutation, link repair, transactional memory_batch, and controlled index refresh/rebuild.

### M06 — Linked-neighbor retrieval expansion

A-MEM search_agentic() returns direct semantic results and adds linked memories as neighbors.

**Disposition:** ALREADY ADOPTED / AGENT CORE STRONGER.

Agent Core retrieval.ts performs bounded linked-neighbor expansion with typed links, strength-aware boosts, response budgets, hybrid lexical/metadata/semantic ranking, and deterministic fallback.

### M07 — Retrieval usage metadata

A-MEM defines retrieval_count and last_accessed.

**Disposition:** CONCEPT ADOPTED; A-MEM IMPLEMENTATION INCOMPLETE.

At the grounded revision, A-MEM defines these fields but its primary search path does not durably increment them. Agent Core does increment durable retrievalCount/lastAccessedAt and records bounded retrieval history.

### M08 — Evolution history

A-MEM exposes evolution_history as memory metadata.

**Disposition:** ALREADY ADOPTED / AGENT CORE STRONGER.

Agent Core has typed bounded events for creation, update, retrieval, metadata enrichment, link add/strengthen/remove, content/context/tag changes, and related lifecycle evidence.

### M09 — Similarity-driven link strengthening

A-MEM process_memory() can choose action "strengthen" and append suggested neighbor IDs to links.

**Disposition:** CORE MECHANISM ALREADY ADOPTED.

Agent Core uses deterministic nearest-neighbor evidence, weighted links, validation, deduplication, reciprocal synchronization, and strength upgrades. Raw A-MEM list links are weaker than the current implementation.

### M10 — Joint current-memory + nearest-neighbor evolution decision

A-MEM process_memory() constructs a neighborhood context and asks for a structured decision containing should_evolve, actions, suggested_connections, tags_to_update, new_context_neighborhood, and new_tags_neighborhood before mutating memory state.

**Disposition:** PARTIALLY ADOPTED — REMAINING HIGH-VALUE PATTERN.

Agent Core currently has deterministic MemoryEvolutionProposal generation and directly applies the proposal when memory_evolve or automatic evolution runs. It does not expose a first-class non-mutating preview of the exact evolution proposal and neighborhood evidence before apply.

This is one remaining useful A-MEM idea, but the adaptation must preserve controller authority and must not add an internal model.

### M11 — Neighbor metadata co-evolution

A-MEM action "update_neighbor" can rewrite context and tags of nearest-neighbor memories based on the new memory and neighborhood.

**Disposition:** RAW IMPLEMENTATION REJECTED; SAFE PROPOSAL VERSION REMAINS VALUABLE.

The A-MEM implementation mutates neighbor metadata automatically and does not synchronously rewrite those neighbor metadata back into Chroma in process_memory(), creating an internal consistency weakness.

Agent Core must never copy that mutation behavior.

However, the underlying idea has value if transformed into a non-mutating neighborhood-review proposal that lets the connected controller inspect source-backed neighbors and explicitly authorize any later memory_batch update.

### M12 — Evolution threshold / consolidate_memories

A-MEM increments evo_cnt and after evo_threshold evolved memories invokes consolidate_memories(), which rebuilds the Chroma collection.

**Disposition:** NO UNIQUE VALUE.

Agent Core already refreshes/rebuilds its derived index around canonical mutations, and Learning Curator provides separate proposal-only maintenance. Adding a count threshold solely to rebuild an already-current index would be regression/duplication.

### M13 — Multiple dedicated memory LLM backends

A-MEM includes OpenAI, Ollama, SGLang, and OpenRouter controllers.

**Disposition:** REJECT.

This would duplicate the connected AI/controller, add model/provider/runtime authority inside MemoryService, expand credential handling, and violate the current architecture.

### M14 — JSON-schema empty-response fallback

A-MEM backend controllers synthesize empty schema-shaped responses on provider failure.

**Disposition:** NO UNIQUE VALUE FOR AGENT CORE MEMORY.

Agent Core uses typed MCP/Zod contracts, deterministic metadata fallback, and fail-soft semantic capability boundaries instead of hiding a failed semantic provider behind synthetic model output.

### M15 — Backend-specific token parameter compatibility

A-MEM maps GPT-5/o1/o3 token parameters to max_completion_tokens.

**Disposition:** OUT OF SCOPE / NO VALUE.

Agent Core Memory does not own an OpenAI-style memory model client.

### M16 — BM25/sklearn/numpy/NLTK/transformers/pickle imports

The grounded source imports several retrieval/model utilities that are not part of the effective Chroma search path at this revision. Structural dead-code analysis also found unreachable/dead surfaces.

**Disposition:** REJECT / DEAD OR REDUNDANT.

Do not import these dependencies into Agent Core.

## 4. Remaining selectable proposals

Only the following mechanisms survived the source-based zero-value census.

### Proposal A2-P1 — Non-mutating memory evolution preview

**Priority:** HIGH
**Default recommendation:** SELECT
**Source inspiration:** A-MEM process_memory() structured should_evolve/actions decision before mutation.
**Agent Core adaptation:** extend the existing memory_evolve surface rather than add a new MCP tool.

Proposed behavior:

- add optional mode or dryRun semantics to memory_evolve;
- preview returns the exact validated MemoryEvolutionProposal that would otherwise be applied;
- include bounded nearest-neighbor evidence sufficient for controller review;
- preview performs zero canonical writes, zero reciprocal-link writes, and zero index mutation;
- existing apply behavior remains backward compatible;
- no model/provider is added;
- controller remains responsible for semantic interpretation.

Primary target files if selected:

- src/mcp/memory-schemas.ts
- src/mcp/memory-tools.ts
- src/memory/service.ts
- src/memory/intelligence.ts only if proposal evidence needs a bounded shape
- tests/memory-maintenance.test.ts during user-authorized verification

Value:

- exposes the exact change before mutation;
- improves inspectability of automatic/deterministic memory evolution;
- creates a safe seam for future controller-reviewed neighborhood reasoning;
- directly captures A-MEM's "decide first, mutate second" pattern without copying its internal LLM.

### Proposal A2-P2 — Proposal-only neighbor metadata review

**Priority:** MEDIUM
**Default recommendation:** SELECT only with P1
**Source inspiration:** A-MEM update_neighbor neighborhood co-evolution.
**Agent Core adaptation:** never auto-rewrite neighbors.

Proposed behavior:

- when an explicit evolution preview is requested, return a bounded neighborhood review context for the strongest related memories;
- expose enough current metadata to let the connected AI/controller judge whether a neighbor's context/tags are stale or incomplete;
- any suggested neighbor metadata change remains a proposal only;
- applying a neighbor metadata change requires an explicit native mutation, preferably one memory_batch transaction;
- pinned memory remains immutable through ordinary APIs;
- content is never inferred/replaced from neighboring memory;
- no hidden model call, no autonomous review daemon, no automatic co-evolution write.

Preferred implementation shape:

1. memory_evolve preview returns:
   - owner evolution proposal;
   - top bounded neighbor IDs;
   - link similarity/strength/reason;
   - current neighbor keywords/context/tags/category;
   - no generated neighbor patch.
2. Connected controller may produce a source-grounded patch itself.
3. Controller must use explicit memory_batch to apply selected updates.
4. evolutionHistory records only the explicit mutation actually committed.

Do not add a new "neighbor updater" service.

Value:

- preserves the useful A-MEM concept that a new memory can reveal stale categorization in neighboring knowledge;
- removes A-MEM's unsafe automatic overwrite;
- keeps the semantic judgment with the AI currently controlling Agent Core;
- uses existing transaction and safety infrastructure.

### Proposal relationship

P2 depends on P1's preview/evidence seam. If P1 is rejected, P2 should also be rejected rather than implemented through a separate interface.

## 5. Explicit rejection set after re-grounding

The following are now closed as no-adopt items for this A-MEM revision:

- Python AgenticMemorySystem runtime;
- ChromaDB;
- SentenceTransformer memory provider;
- dedicated OpenAI/Ollama/SGLang/OpenRouter memory controller;
- NLTK/BM25/sklearn/numpy retrieval stack;
- duplicate embedding/vector stores;
- collection reset on startup;
- raw automatic update_neighbor mutation;
- automatic merge/delete of canonical memories;
- evo_threshold-driven index rebuild;
- untyped list-only memory links;
- minute-resolution timestamp model;
- A-MEM's metadata serialization scheme;
- synthetic empty model output as semantic truth;
- any memory routing/approval/execution gate.

These should not reappear as future backlog unless new source evidence or a new explicit user requirement changes the architecture.

## 6. Source-derived defects that must not be copied

The re-grounding found implementation characteristics that are evidence against direct transplant:

1. process_memory() can mutate neighbor context/tags in self.memories without re-adding those neighbors to Chroma in the same path, risking metadata/index divergence.
2. retrieval_count and last_accessed exist in the model but are not durably advanced by the primary search_agentic path.
3. _search() performs duplicate retriever.search() calls against the same Chroma retriever and then treats the second result as a different embedding retriever shape.
4. several imported retrieval/model libraries are not used by the effective runtime path.
5. initialization resets the Chroma collection before creating a fresh retriever, which is incompatible with Agent Core's durable canonical authority.
6. broad exception handling frequently converts semantic failures into no-op behavior without durable health evidence.

Agent Core's existing store/index/health/safety boundaries must remain authoritative.

## 7. User selection result

The user explicitly approved execution of the newly updated A-MEM plan on 2026-09-20.

Selection result:

- [x] A2-P1 — Non-mutating memory evolution preview
- [x] A2-P2 — Proposal-only neighbor metadata review
- [ ] Reject both

No other A-MEM mechanism was selected or implicitly authorized.

## 8. Implementation phases after selection

### Phase 0 — Current-state freeze

- inspect current memory health and corruption-recovery status;
- do not confuse recovery work with A-MEM second-wave work;
- make a scoped backup of only files to be touched;
- preserve pending 0.12 release intents;
- create a dedicated release intent only when a selected shipped behavior change is actually implemented.

### Phase 1 — P1 preview contract, if selected

- extend memoryEvolve schema with backward-compatible preview semantics;
- separate proposal generation from proposal application inside MemoryService;
- return a bounded, serializable proposal/evidence shape;
- preserve current apply semantics for existing callers;
- make preview provably non-mutating.

### Phase 2 — P2 neighborhood review evidence, if selected

- attach bounded neighbor evidence to preview only;
- do not generate or apply neighbor patches internally;
- document controller review semantics in AGENTS.md only if the behavior is actually implemented;
- explicit memory_batch remains the mutation authority.

### Phase 3 — Safety and compatibility review

- pinned foundational memory remains protected;
- preview must not update retrieval counters merely because evolution was inspected unless normal explicit read/search semantics already require it;
- preview must not refresh/rewrite canonical notes;
- no new vector store;
- no new model/provider;
- no new service/daemon/database;
- no change to normal machine-control routing.

### Phase 4 — Documentation synchronization

Only after implementation:
- update CODEBASE.md;
- update root MEMORY.md implemented-state detail;
- update durable A-MEM strategy memory only after verified implementation;
- keep this plan's proposal decisions and rejection census as provenance.

### Execution result — 2026-09-20

Implemented without new dependency/toolchain:

- src\memory\intelligence.ts now exposes a deterministic preview containing the exact validated owner proposal plus bounded current neighbor metadata evidence;
- src\memory\service.ts separates proposal preparation from application and adds previewEvolution(); preview inspects an already-current index and never calls the index ensure/rebuild path;
- src\mcp\memory-schemas.ts extends the existing memory_evolve input with optional mode=apply|preview and neighborLimit=1..8;
- src\mcp\memory-tools.ts routes preview to the non-mutating path while preserving default apply behavior;
- AGENTS.md defines controller review semantics and keeps explicit memory_update/memory_batch as neighbor-mutation authority;
- no new MCP tool, model provider, vector store, service, daemon, Python runtime, or package dependency was added;
- dedicated minor release intent .changeset/20260920061525-3d26e4.md records the shipped capability change.

## 9. Verification gates

Run only with user authorization.

P1 gates:
1. preview returns a deterministic validated proposal;
2. preview changes zero canonical files;
3. preview changes zero reciprocal links;
4. preview performs no index mutation;
5. existing apply behavior still works;
6. malformed/nonexistent IDs fail truthfully;
7. pinned foundational memory remains protected;
8. embedding unavailable degrades preview truthfully without harming canonical memory.

P2 gates:
9. neighborhood evidence is bounded;
10. evidence contains only current canonical metadata plus relationship evidence;
11. no neighbor is changed by preview;
12. explicit memory_batch can apply a selected patch atomically;
13. failed batch yields zero partial mutation;
14. no hidden semantic model/provider call is introduced.

Architecture gates:
15. root TypeScript build passes;
16. memory public tool count remains unchanged unless explicitly approved otherwise;
17. normal machine-control direct call remains independent from Memory;
18. package dependency audit shows no Chroma/Python/A-MEM model stack;
19. release:check-intent remains healthy;
20. current corruption-recovery invariants are not weakened.

## 10. Corpse / retirement result

Retirement condition B is now satisfied:

- P1 and P2 are implemented;
- targeted verification passed;
- the exact grounded A-MEM revision was not modified during adoption;
- the final source census found no additional unique mechanism beyond P1/P2;
- active Agent Core src/scripts/package surfaces contain no dependency on Audit\A-MEM or A-MEM runtime packages;
- the only active-tree "chromadb" reference found is a forbidden-dependency assertion in the Reflexion regression test, not a runtime dependency.

Accordingly, Audit\A-MEM was deleted on 2026-09-20 under the user's pre-authorized corpse-retirement rule. Provenance remains in this plan, scoped backup material, CODEBASE, root MEMORY.md, and the durable A-MEM strategy memory.

## 11. Verification evidence

Targeted verification authorized by the user's approval of this plan:

- root TypeScript build: PASS / exit 0;
- compiled dist smoke: memoryEvolve schema accepts mode=preview + neighborLimit and MemoryService.prototype.previewEvolution exists;
- tests/memory-maintenance.test.ts: 1 file / 23 tests PASS;
- six new P1/P2 acceptance cases cover zero canonical/index mutation, stale-index no-repair behavior, bounded neighbor evidence, explicit batch-only neighbor metadata mutation, unavailable-intelligence safety, missing/pinned target rejection, and all-or-nothing failed batch behavior;
- release:compat: 62 -> 62 tools, no tool/route removals, breakingEvidence=false;
- release:check-intent: ok=true;
- release plan remains 0.11.0 -> 0.12.0 minor with three pending intents including the A-MEM second-wave intent;
- direct machine-control file inspection continued to work independently of Memory;
- no new package dependency/toolchain was installed.

Grafel structural reindex was requested but the workspace remained dirty/queued during review; per Agent Core contract, exact current source plus release compatibility evidence remained authoritative and work did not block on Grafel freshness.

## 12. Current conclusion

The original A-MEM first-wave concepts and the two final source-derived second-wave mechanisms are now absorbed into Agent Core-owned TypeScript.

Final selected additions:

- P1: non-mutating memory evolution preview;
- P2: proposal-only neighbor metadata review built on P1.

Everything else in grounded revision f303dfc71e07bdc787f4bc135d4cea328ae30e99 is already represented more strongly in Agent Core, redundant, unsafe for the current architecture, dead/import-only, or unrelated to Agent Core's memory authority.

Implementation, targeted verification, and live activation are complete. After launcher restart, the live Node Core listener on :8765 started from the rebuilt dist and direct MCP smoke calling memory_evolve(mode=preview, neighborLimit=3) returned the new preview result shape with applied=false and bounded neighbor evidence. The source reference is retired and no A-MEM runtime dependency remains.

## 13. Re-grounding census — 2026-09-22

### 13.1 Scope and evidence

The protected re-clone was inspected at the same grounded revision `f303dfc71e07bdc787f4bc135d4cea328ae30e99`. Exact executable source, all focused tests, package/dependency files, MIT license, all 21 reachable Git commits, and a request-scoped Grafel graph were inspected. Grafel indexed the checkout current with 242 entities / 1,091 relationships. Static TESTS-edge analysis showed 3 / 33 production entities covered; this is structural reachability only, not executed line coverage. No test suite was run during this planning task.

`git fsck --full --no-reflogs --unreachable` found no unreachable objects/commits. The only refs are local/main and origin/main at the pinned revision. Therefore no hidden locally retained PR implementation exists outside the 21-commit reachable history.

A full AST symbol census across all 21 commits found 51 historical source symbols versus 29 current production/test-package symbols. After excluding test-only symbols, only three production symbols existed historically and are absent from current HEAD: `_process_memory_evolution`, `SimpleEmbeddingRetriever`, and the old `create` API.

### 13.2 Historical mechanisms absent from HEAD

- `create`: old creation wrapper that always generated LLM metadata, inserted into two retrievers, incremented an evolution counter, and invoked the old evolution path. It was superseded by `add_note` and contains no unique mechanism beyond already-censused creation/evolution behavior.
- `SimpleEmbeddingRetriever`: a second SentenceTransformer/Numpy cosine retriever maintained in parallel with ChromaDB. It was removed when A-MEM converged on one Chroma-backed retriever. Agent Core already has stronger hybrid lexical/metadata/semantic retrieval in one derived index, so resurrecting this historical dual-retriever path would be a regression.
- `_process_memory_evolution`: an older evolution implementation. Historical revisions show automatic `merge`/`update` behavior, neighbor rewrites, and deletion of the incoming note during merge. Later A-MEM replaced it with `process_memory`. Agent Core already exposes proposal-only `memory_consolidate` plus explicit `memory_batch`/`memory_update`; automatic merge/delete remains rejected.
- historical evolution throttling: one early revision evolved only after an `evo_threshold` count, then reset the counter on successful evolution. A-MEM itself removed this behavior. There is no source/test evidence that delayed evolution improved correctness, and Agent Core evolution is deterministic/bounded rather than an expensive hidden LLM call. REJECT.

### 13.3 Current-head mechanism recheck

Every current executable mechanism was re-read against Agent Core-owned implementation evidence:
- MemoryNote metadata / usage / evolution fields: already covered more strongly by typed `MemoryRecord`, durable recall metadata, typed weighted links, and bounded evolution events.
- LLM metadata extraction: not adopted as a second internal model; connected controller + deterministic fallback remains the intended authority boundary.
- enhanced embedding document: already represented by Agent Core semantic-document/index behavior.
- Chroma CRUD/index synchronization: redundant with canonical file-native mutation + derived index refresh/rebuild.
- direct semantic retrieval + linked-neighbor expansion: already covered by bounded hybrid retrieval with source/metadata/semantic/link components and response budgets.
- `process_memory` strengthen decision: already covered by deterministic evolution proposal + weighted link add/strengthen semantics.
- `process_memory` neighbor metadata co-evolution: raw automatic rewrite remains unsafe; the useful review seam is already adopted as A2-P2 through preview neighbor evidence + explicit later mutation only.
- `evo_threshold` consolidation: current A-MEM uses it only to rebuild retrieval state after successful evolution; no unique value over Agent Core current-index maintenance.
- OpenAI/Ollama/SGLang/OpenRouter controllers and GPT-token compatibility: outside Memory ownership and would add a second provider/runtime authority.
- schema-shaped empty model fallback: rejected because it hides semantic provider failure rather than exposing truthful degraded state.
- BM25/NLTK/Numpy/sklearn/Transformers/Pickle import surface: no unique active mechanism in current HEAD; do not import this dependency stack.

Current Agent Core source for several memory modules was deleted earlier on 2026-09-22 because those files were proven 0-byte corrupt. This does not reopen A-MEM adoption: readable `src\memory\service.ts`, `src\memory\retrieval.ts`, `src\memory\consolidation.ts`, plus non-zero compiled `dist\memory\intelligence.js`, `dist\memory\evolution.js`, and `dist\mcp\memory-tools.js` still provide direct implementation evidence that A2-P1/P2 and the stronger native retrieval/consolidation boundaries had already been implemented. Missing current-line source is a separate recovery problem, not justification to substitute A-MEM runtime code.

### 13.4 Documentation-only claims excluded from adoption

`PR_REVIEW_ANALYSIS.md` and `MERGE_PR4_SUMMARY.md` mention PR/merge commit IDs such as `f11207f`, `a4b630a`, `092aa41`, `58b3756`, `0cfa443`, and `c6dd0c3`. Exact `git cat-file` checks show all six objects are absent from this checkout, and `git fsck` found no dangling/unreachable commit carrying them. Therefore PR #1 claims about `.env`, HTTP Chroma, Ollama embeddings, and example code are documentation-only evidence in this local reference and are not eligible as source-backed steal/use proposals.

### 13.5 Dependency and adoption boundary

Exact active-tree searches found zero `A-MEM` or `chromadb` references in `src`/`scripts`, and root `package.json` contains neither `chromadb` nor `sentence-transformers`. A-MEM remains reference-only and has no runtime/build/package dependency relationship with Agent Core.

The A-MEM checkout is MIT-licensed, but license compatibility does not create architectural value by itself. Direct transplant remains unnecessary because all useful mechanisms are already independently implemented in Agent Core-owned TypeScript or explicitly rejected by maintained boundaries.

### 13.6 Final proposal census

**New proposals requiring user review: NONE.**

A2-P1 (non-mutating evolution preview) and A2-P2 (proposal-only neighbor metadata review) remain the final useful source-derived mechanisms and were already selected, implemented, and historically targeted-verified. The 2026-09-22 re-grounding found no additional current-fit mechanism in current source, tests, reachable Git history, historical removed symbols, package configuration, or request-scoped graph structure.

**Final disposition:** ZERO-VALUE RECONFIRMED. The request-scoped Grafel workspace was unregistered, the temporary history-census helper was removed, and the 2026-09-22 A-MEM re-clone was deleted as a corpse. No new implementation, build, restart, release action, or test suite was performed or required by this re-grounding.
