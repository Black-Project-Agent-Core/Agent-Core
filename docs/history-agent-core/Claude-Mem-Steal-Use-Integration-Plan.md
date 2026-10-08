# Claude Mem — Steal/Use Integration Plan

**Status:** HISTORICAL SINFawkes WAVE COMPLETE/RETIRED — THEDOTMACK CM2-P1 COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — REFERENCE RETIRED
**2026-09-27 audit reference:** `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\21-claude-mem` (`thedotmack/claude-mem` @ `dcfc44221deabc228b0698a0012f87ed2fe6bbe7`, Apache-2.0; re-cloned/pinned for execution and retired after zero-value census)
**Historical reference:** `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\claude_mem`
**2026-09-22 re-grounding reference:** `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\steal-use-repos\claude_mem` (temporary reference-only re-clone; deleted after final zero-value census)
**Pinned audit revision:** `da135e36010e888e8e97bcc43edac10aa0e3b383`
**Origin:** `https://github.com/sinfawkes/claude_mem.git`
**License evidence in checkout:** no top-level license file was present during grounding; treat direct code copying as not authorized unless license provenance is independently resolved.
**Authority:** exact current Agent Core source/runtime outranks the reference.

## 1. Purpose

Source-first census of `claude_mem` to identify mechanisms worth adapting into the existing Agent Core memory architecture without adding its Python MCP server, SQLite canonical store, NetworkX graph, sentence-transformers runtime, or a second memory authority.

This document records the completed approved implementation, verification, CM-C1 closure, final zero-value census, and reference retirement. No Claude Mem work remains open.

## 2. Grounding evidence

The checkout contains 8 primary Python implementation modules plus tests. Grounding inspected executable source, focused tests, and Git history rather than relying on README claims.

Observed implementation families:
- Pydantic memory model with proposed/confirmed/rejected lifecycle, source/file/git metadata, confidence, version and timestamps;
- SQLite canonical memories + separate memory_versions audit table;
- three-tier retrieval: in-process LRU, SQL project/type/tag prefilter, vector similarity or LIKE fallback;
- open-file-aware cache warmup;
- local sentence-transformers embeddings with candidate-bounded cosine search;
- file/memory knowledge graph with typed relations including superseded_by;
- AST/regex source scanner that generates proposed code-pattern memories;
- git-anchored staleness checks against referenced files;
- CLI project bootstrap/export/import/index/warmup;
- MCP propose/confirm/reject/search/get/update/delete/refresh/graph/cache/session-summary tools.

Focused tests substantiate:
- confirmed-only retrieval and proposal exclusion;
- project/type prefilter;
- bypass-prefilter behavior;
- open-file cache prioritization;
- L1 invalidation;
- proposed -> confirmed/rejected lifecycle;
- memory version audit rows;
- file-change git staleness detection;
- candidate-bounded vector search and embedding replacement/removal.

## 3. Current Agent Core comparison

Current Agent Core already has stronger native facilities for:
- file-native canonical Markdown authority;
- transactional process-safe create/update/delete/link batches;
- durable bounded evolution history;
- pinned foundational memory protection;
- deterministic semantic metadata enrichment;
- Cloudflare EmbeddingGemma semantic index with lexical/metadata ranking;
- reciprocal typed memory links and conservative evolution;
- duplicate/overlap consolidation review;
- Memory + Grafel Learning sinks with controller review;
- Grafel structural code intelligence and source verification;
- health/degraded-state reporting and deterministic index rebuild.

Therefore do not transplant claude_mem's Python MCP process, SQLite canonical database, local MiniLM model, NetworkX graph, generic source regex indexer, or parallel project-local memory authority.

## 4. Current-fit proposals

### CM-P1 — Git/file-anchored memory provenance and staleness advisory
**Recommendation:** APPROVE — HIGH VALUE / READ-ONLY FIRST.

Source fact:
`claude_mem` records referenced files plus capture commit/branch and computes whether those exact files changed since capture.

Current Agent Core gap:
`MemoryRecord.source` is only a generic type/ref pair; canonical records do not currently carry structured code-file anchors + capture revision, and memory health/search does not expose source-change staleness.

Target design:
- extend Agent Core-owned memory provenance with optional bounded code anchors: repository/workspace identity, relative file refs, capture commit/ref;
- never make Git availability a memory execution gate;
- add read-only staleness assessment over explicit anchors only;
- distinguish `current`, `changed`, `source-unavailable`, `unanchored`;
- changed source is advisory evidence, not automatic invalidation/deletion;
- exact source/Grafel verification remains authority before refreshing a memory;
- avoid scanning unrelated repositories or paths;
- keep canonical Markdown as sole memory authority.

Preferred exposure:
- enrich existing `memory_status`, `memory_read`, or a preview path rather than creating a new subsystem;
- only add a public MCP field/tool if existing schemas cannot express it cleanly.

Acceptance proposal:
- anchored memory reports changed files since its captured revision;
- unanchored memory stays valid and reports `unanchored`;
- unavailable Git fails soft;
- no memory is automatically deleted, rewritten, rejected, or hidden;
- path handling is workspace-bounded and source-safe.

### CM-P2 — Bounded content revision snapshots for mutable memories
**Recommendation:** REVIEW / APPROVE — AUDITABILITY.

Source fact:
`claude_mem` preserves prior content/version rows before update and increments a logical version.

Current Agent Core gap:
Agent Core keeps bounded evolution events describing changed fields, but an ordinary content update does not preserve the prior full content as a queryable revision after commit; the transaction journal is durability machinery, not a user-facing revision archive.

Target design:
- preserve bounded prior canonical snapshots for non-pinned memory mutations that change durable content;
- keep snapshot state subordinate to canonical memory, not a second canonical store;
- bounded retention by count/bytes and deterministic cleanup;
- snapshot capture occurs inside the same mutation/transaction authority;
- preview/read history first; restoration must require a separate explicit authorized mutation;
- preserve links/metadata provenance needed to understand the historical state;
- never persist hidden reasoning or raw transient controller scratchpads.

Acceptance proposal:
- successful content update leaves current canonical note authoritative and preserves the previous revision;
- failed/rolled-back mutation leaves no false revision;
- snapshots are bounded and corruption-tolerant;
- pinned foundational memory remains protected;
- restore is never implicit.

### CM-P3 — Source-file-aware retrieval boost
**Recommendation:** REVIEW / APPROVE — SMALL IF CM-P1 IS SELECTED.

Source fact:
`claude_mem` associates memories with files and prioritizes memories related to currently open files when warming its L1 cache.

Current Agent Core fact:
all canonical records are already loaded and hybrid ranked, so adding an LRU layer would be redundant; however explicit source-file context is not currently part of retrieval scoring.

Target design:
- do not add claude_mem's LRU/SQLite prefilter;
- if CM-P1 introduces file anchors, allow `memory_search` to accept an optional bounded source-context list or controller-provided active-file context;
- boost exact/related anchored files as one transparent scoring component;
- preserve semantic/lexical ranking and budget bounds;
- do not infer or monitor editor state automatically.

Acceptance proposal:
- without source context, search behavior remains compatible;
- with source context, matching anchored memories receive a bounded explainable boost;
- source context cannot bypass normal result budgets or canonical safety.

## 5. CM-C1 closure — proposal-before-persistence invariant

### CM-C1 — Proposed/confirmed review state for automatically discovered durable memories
**Disposition:** CLOSED — SATISFIED BY EXISTING LEARNING REVIEW BOUNDARY; NO SECOND MEMORY STATUS SYSTEM.

The reference's strongest principle is that auto-generated discoveries are proposed first and only reviewed/confirmed knowledge becomes searchable durable memory.

Agent Core already enforces the equivalent invariant at the correct boundary. `LearningReviewCoordinator` validates every learning candidate and returns `status=proposal` for any candidate with `verified=false`; those candidates are not sent to a sink. Only verified candidates reach `LearningSinkManager.capture(...)`, and `MemoryLearningSink` is the only non-interactive source path that calls `MemoryService.remember(...)`. `learning(action=curate)` is proposal-only, while direct `memory_remember` remains an explicit controller-authorized mutation rather than an automated discovery producer.

Therefore CM-C1 is complete as an architecture invariant without adding `proposed/confirmed/rejected` state to canonical notes and without waiting for a separate future producer. Any future automated discovery producer must enter through the existing Learning review boundary; bypassing it would violate the maintained Agent Core controller/learning contract.

## 6. Rejected / already-covered mechanisms

- SQLite as canonical memory store — REJECT; conflicts with file-native authority.
- sentence-transformers / MiniLM runtime — REJECT; Agent Core already has qualified EmbeddingGemma indexing.
- NetworkX knowledge graph — REJECT; Memory typed links + Grafel already cover relationship/navigation needs.
- generic AST/regex project scanner — REJECT; lower-confidence than Grafel + exact-source workflows and risks noisy memory generation.
- source scanner rate limiter as a standalone subsystem — REJECT; no approved producer needing it.
- LRU cache for memory records — REJECT; Agent Core already keeps canonical records in process and search cost is dominated by bounded ranking/index state.
- SQL project/type/tag prefilter — REJECT as storage design; project/source context can be represented directly in native metadata/ranking if approved.
- separate per-project `.claude_mem` database — REJECT; would fragment canonical Agent Core memory.
- MCP memory server from the reference — REJECT; Agent Core already owns the public memory MCP surface.
- import/export as a parallel JSON memory format — DEFER/REJECT for now; canonical Markdown + explicit memory APIs remain authority.
- hard delete with retained SQLite versions — REJECT as implementation shape; any revision retention must be native to current transaction/store architecture.
- automatic stale marking/deactivation — REJECT; source drift is evidence only.
- branch name as truth of validity — REJECT; revisions/file evidence are stronger than branch labels.

## 7. Implementation boundaries if proposals are selected

- Implement natively in TypeScript under existing `src\memory`; no Python runtime.
- No new canonical database, vector database, graph database, daemon, model, or hidden controller.
- Exact current source and Grafel verification outrank provenance metadata.
- Memory remains a sibling capability; no routing/execution gate.
- Public schema changes require structural review and release compatibility.
- Every selected source change updates `docs\CODEBASE.md`, root `MEMORY.md`, and canonical local durable memory in the same task.
- Material behavior receives one release intent; no release apply without explicit authorization.
- Targeted tests only unless user authorizes broader verification.
- No automatic commit/tag/push/publish/deploy.

## 8. Proposed implementation order

If user approves selected items:
1. CM-P1 provenance schema + read-only staleness computation + targeted tests.
2. CM-P2 bounded revisions as a separate state/archive layer under existing transaction authority + preview/read tests.
3. CM-P3 source-context search boost only after CM-P1 exists.
4. Build + targeted affected memory tests + structural review + release compatibility.
5. Sync CODEBASE/root MEMORY/canonical local memory.
6. Rebuild/cut over Node only if runtime-owned source changed, then live health/readback.
7. Re-run zero-value census against this reference.

## 9. Retirement decision

**REFERENCE RETIRED — ZERO-VALUE CENSUS CLOSED.**

All source-backed mechanisms identified during grounding now have a final disposition:
- Git/file-anchored staleness → implemented as CM-P1;
- bounded full-content revision snapshots → implemented as CM-P2;
- source-file retrieval prioritization → implemented as CM-P3;
- proposal-before-confirm invariant → satisfied by the existing Learning review boundary as CM-C1;
- all remaining runtime/storage/cache/indexer/graph mechanisms → explicitly rejected or already covered by stronger Agent Core-native architecture.

Final dependency scan found no active `src`, `tests`, or `scripts` dependency on the checkout. The reference is therefore no longer required for implementation or runtime and may be deleted as a corpse while this plan preserves its provenance and decisions.

## 10. Approved implementation result — 2026-09-20

The user approved all current-fit proposals CM-P1, CM-P2, and CM-P3. They are implemented natively in Agent Core TypeScript without adding the reference runtime.

### CM-P1 — implemented
- canonical `MemoryRecord` now supports optional bounded provenance with workspace/repo identity, relative file anchors, capture commit, and capture ref;
- when local Agent Core source files are supplied without a commit, MemoryService captures current Git commit/ref fail-soft;
- `memory_read` reports read-only staleness evidence with states `unanchored`, `source-unavailable`, `current`, or `changed`;
- source drift never invalidates, hides, rewrites, rejects, or deletes a memory;
- only explicit bounded relative file anchors are inspected and exact source remains authority.

### CM-P2 — implemented
- prior full canonical record snapshots are preserved only when durable content changes;
- revision state lives under derived/subordinate memory state, not the canonical Markdown note store;
- retention is bounded to 8 snapshots and approximately 1 MiB per memory;
- canonical note update and revision snapshot are committed through the same MemoryTransactionCoordinator mutation;
- failed batch transactions create no false revision;
- malformed revision state does not make canonical reads unavailable and is not silently overwritten;
- `memory_read(revisionLimit=...)` exposes bounded revision history; restore remains an explicit future mutation, never implicit.

### CM-P3 — implemented
- `memory_search(sourceFiles=[...])` applies a bounded transparent source-file ranking component only to memories whose provenance anchors intersect the supplied files;
- no editor monitoring, LRU cache, or automatic context capture was added;
- search without `sourceFiles` remains behavior-compatible and reports a zero source-file component.

## 11. Verification evidence

- root TypeScript build: PASS;
- `tests/claude-mem-adoption.test.ts`: 7/7 PASS;
- affected existing memory suites: `memory-maintenance` 23/23 PASS, `memory-phase8-10` 2/2 PASS;
- MCP manifest contract: 2/2 PASS;
- targeted total after implementation: 34/34 PASS;
- structural Grafel review: current index; staleness is exposed only through MemoryService/MCP, revision mutation is wired through store mutate/batch transaction paths, source-file boost remains inside retrieval;
- `release:compat`: 62→62 tools, no tool/route removals, `breakingEvidence=false`, no verification issues;
- additive public fields are `memory_read.revisionLimit`, `memory_search.sourceFiles`, and optional `provenance` on memory remember/update (including batch nested values);
- `release:check-intent`: OK;
- minor intent: `.changeset/20260920131504-f2cb0a.md`;
- stable remains 0.11.0; 10 pending intents aggregate to planned 0.12.0.

No Python MCP runtime, SQLite canonical store, sentence-transformers model, NetworkX graph, source regex indexer, LRU cache, or parallel per-project memory store was installed.

## 12. Final reference disposition after implementation

CM-P1/P2/P3 no longer require the reference at runtime and active Agent Core imports no code from it. CM-C1 is also closed because the existing Learning review boundary already enforces proposal-before-persistence: unverified candidates remain proposals and only verified candidates are routed to durable sinks. No second canonical memory lifecycle state is required.

Final zero-value/dependency census found no remaining unique current-fit mechanism and no active source/test/script dependency on the checkout. The `claude_mem` reference at pinned revision `da135e36010e888e8e97bcc43edac10aa0e3b383` was Git-clean before retirement and is deleted as a corpse; this plan is the retained provenance/audit record.

Live Node activation is verified: Node Core PID 17384 is running `<PROJECT_ROOT>\dist\index.js`, `/health` reports `status=ok`, Memory canonical/index/embedding/intelligence are available with issueCount 0, live `memory_read(revisionLimit=...)` returns staleness/revision fields, and live `memory_search(sourceFiles=[...])` accepts the additive source-context schema and reports the `sourceFileMatch` ranking component.

**Open items: NONE.**

## 13. Re-grounding census — 2026-09-22

### 13.1 Scope and authority

The reference was re-cloned at the same pinned revision `da135e36010e888e8e97bcc43edac10aa0e3b383` and re-audited source-first before any new adoption proposal was considered. The audit covered all current executable modules (`config.py`, `fetch_cache.py`, `knowledge_graph.py`, `memory_indexer.py`, `memory_manager.py`, `server.py`, `staleness.py`, `vector_store.py`), all focused tests, dependency/config files, all nine Git commits, and a request-scoped Grafel graph. README text was used only as a cross-check; executable source and tests outrank documentation.

The temporary Grafel workspace indexed the checkout as current with 482 entities / 2,216 relationships. Static test-edge coverage showed 29 / 92 production entities reachable from tests; this is graph-derived reachability, not executed line coverage. No test suite was run during this re-grounding because verification remains user-controlled.

The checkout has no top-level license file. Direct source copying therefore remains disallowed unless license provenance is separately established; any useful behavior would have to be independently reimplemented in Agent Core-owned code.

### 13.2 Source-vs-documentation corrections

The source does not support several README claims strongly enough to treat them as adoptable mechanisms:
- `PROPOSAL_TTL_DAYS` is loaded/configured but no expiry implementation consumes it; automatic proposal expiry is documentation-only in this revision.
- `MemoryIndexer._check_rate_limit()` exists but is not called by `index_project()`, so the CLI indexer is not actually rate-limited by that helper.
- the MCP `memory_check_staleness()` tool is still a placeholder returning `stale_count=0`; real Git staleness logic exists in `staleness.py` and is used by the CLI path instead.
- `MemoryFetchCache.search()` always performs L2 prefilter + L3 vector/text search; L1 is populated by results and used by `get()`, but it does not short-circuit `memory_search()` as described by the README.
- `sqlite-vec` is declared only as an unused future upgrade path; actual vector similarity is NumPy cosine over SQLite BLOBs.

These documentation/source mismatches are not adoption candidates.

### 13.3 Exhaustive mechanism disposition

The following mechanisms were re-evaluated against exact current Agent Core source plus the live MCP surface:
- Git/file provenance + advisory source drift: ALREADY ADOPTED as CM-P1 in native `src\memory\provenance.ts` and live `memory_read` staleness output.
- full prior-content revision snapshots: ALREADY ADOPTED as CM-P2 in native `src\memory\revisions.ts`, bounded to 8 revisions / ~1 MiB per memory and subordinate to canonical Markdown.
- open/source-file relevance: ALREADY ADOPTED as CM-P3 through bounded `memory_search(sourceFiles=[...])` scoring; no editor monitoring or cache layer is required.
- proposal-before-persistence for automatic discoveries: ALREADY COVERED by `LearningReviewCoordinator`; unverified candidates remain proposals and never reach durable sinks.
- confirmed-update -> proposed/re-confirm lifecycle: REJECTED for direct Agent Core memory APIs because `memory_update` is already an explicit controller-authorized mutation; automatic learning producers must use the Learning review boundary instead of adding a second canonical status lifecycle.
- manual add -> immediate confirmation: ALREADY COVERED by explicit controller-authorized `memory_remember`.
- `proposed/confirmed/rejected` state on every canonical note: REJECTED; it duplicates Learning review state and would complicate canonical file-native memory.
- tolerant memory-type normalization/fallback: REJECTED as unnecessary; Agent Core uses bounded free-form categories and typed Learning candidate kinds rather than coercing arbitrary user labels into a fixed enum.
- unique-prefix memory ID resolution: REJECTED; convenience does not justify ambiguity risk on update/delete paths, and exact IDs are already returned by list/search/read surfaces.
- proposal-per-minute limiter: REJECTED as a standalone memory primitive; current automatic learning flow is already bounded by review size/triggering and direct memory writes are explicit controller actions. The reference indexer limiter is also not wired into its own scan path.
- proposal TTL/auto-expiry: NOT IMPLEMENTED IN REFERENCE; no source-backed behavior to steal.
- session pending-summary counts: ALREADY COVERED conceptually by Learning status/review state plus Memory health; canonical Agent Core memories intentionally do not persist unverified proposals.
- refresh-by-clone-new-ID-and-reject-old: REJECTED; native provenance refresh/update + bounded revisions preserve identity and auditability without duplicating records.
- confidence scalar on canonical memories: REJECTED; the reference stores confidence but does not demonstrate retrieval/lifecycle semantics strong enough to justify adding an uncalibrated authority signal.
- fixed memory type enum: REJECTED; Agent Core semantic metadata/category model is more flexible and avoids schema churn.
- last-accessed metadata: ALREADY COVERED through `lastAccessedAt` + `retrievalCount`.
- typed supersession/relationship graph: ALREADY COVERED more directly by native Memory links (`related`, `supports`, `supersedes`, `contradicts`, `derived-from`) plus Grafel structural intelligence.
- NetworkX/pickle graph persistence: REJECTED as a second graph/storage authority and weaker than existing Memory links + Grafel.
- generic AST/regex project scanner: REJECTED; lower-confidence than exact-source + Grafel analysis, and it can generate noisy durable candidates.
- per-project SQLite databases: REJECTED; fragments canonical memory and conflicts with file-native authority.
- SQLite canonical store + SQL indexes: REJECTED; current transactional canonical Markdown + derived indexes are the authority.
- L1 LRU cache: REJECTED; canonical records are already resident/bounded and the reference search path does not actually use L1 as a search short-circuit.
- L2 SQL project/type/tag prefilter: REJECTED as storage architecture; native metadata/source scoring already provides bounded retrieval context.
- MiniLM/sentence-transformers runtime: REJECTED; Agent Core already has its own qualified semantic embedding/index path and must not add a second model runtime.
- SQLite BLOB vector store / NumPy cosine: REJECTED; duplicates the current semantic index and adds another persistence layer.
- `sqlite-vec`: REJECTED; unused in the reference and therefore not source-backed value.
- embedding lazy-load/warmup command: REJECTED; tied to the rejected second embedding runtime.
- project bootstrap that writes `.mcp.json`, `.env`, `.gitignore`, and project-local DBs: REJECTED; it installs a parallel memory subsystem and violates current Agent Core ownership boundaries.
- JSON import/export: REJECTED as a parallel interchange authority; canonical Markdown plus explicit Memory APIs/recovery artifacts remain the maintained recovery/portability model.
- hard delete while retaining version rows: REJECTED implementation shape; Agent Core already provides explicit delete, link repair, bounded revisions, and transaction authority.
- branch-name provenance: ALREADY SUBSUMED by optional `gitRef`, while commit/file evidence remains stronger and advisory.
- source/manual/from-chat enums: ALREADY SUBSUMED by flexible `source.type/ref` plus provenance.

### 13.4 Current Agent Core integrity caveat

The 2026-09-22 global Agent Core grounding audit found corruption in several unrelated current-line source files and canonical foundational memory. That does not create new Claude-Mem adoption value. The specific Agent Core-owned implementation files needed to verify CM-P1/CM-P2/CM-P3 (`provenance.ts`, `revisions.ts`, `retrieval.ts`, `service.ts`) are present and readable, and the live MCP schemas expose the adopted staleness/revision/source-context surfaces. Memory corruption recovery remains a separate current-line repair task; this reference must not be retained as a recovery authority.

### 13.5 Final dependency and value census

Exact searches found zero `claude_mem` dependency in active `src`, `tests`, or `scripts`. The current upstream checkout is the same pinned revision already exhaustively adopted/rejected in this plan; Git history contains only nine commits and no removed executable subsystem beyond the historical `.env` deletion. The re-grounding found no new current-fit mechanism that survives comparison with Agent Core-owned architecture.

**New proposals requiring user review: NONE.**

**Final disposition:** ZERO-VALUE RECONFIRMED. The request-scoped Grafel workspace was unregistered and the temporary 2026-09-22 reference clone was deleted as a corpse. Historical provenance remains preserved in this plan; no implementation, build, restart, release apply, or broad test was performed or required by this re-grounding.
## 14. New upstream re-grounding — thedotmack/claude-mem — 2026-09-27

> **Status:** PROPOSAL UPDATE — USER REVIEW REQUIRED — NO NEW IMPLEMENTATION
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\21-claude-mem`
> **Repository:** `https://github.com/thedotmack/claude-mem.git`
> **Revision:** `dcfc44221deabc228b0698a0012f87ed2fe6bbe7`
> **Branch:** `main`
> **License:** Apache-2.0
> **Important provenance boundary:** this is a different repository from the historical `sinfawkes/claude_mem` audited in sections 1–13. Prior zero-value closure does not apply to this checkout.

### 14.1 Source-first evidence

Fresh census covered 1,241 non-Git files, 797 executable-code files and 368 test files. Exact source and direct tests are authority; README/product claims are supporting evidence only. Grafel independently loaded the checkout as current and mapped 82 modules, with the main executable families under `src/services`, `src/server`, `src/shared`, `src/supervisor`, storage/sync workers, CLI/plugin adapters and tests.

The checkout had two pre-existing tracked deletions before this audit: `openclaw/skills/do/SKILL.md` and `openclaw/skills/make-plan/SKILL.md`. They are user-existing state and must not be restored or treated as audit mutations. The temporary `.grafel` marker is audit-only and must be removed at closure.

### 14.2 CM2-P1 — priority-aware bounded Memory result projection

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.

Source mechanism:
- `src/services/context/ContextBudget.ts::fitContextToBudget`;
- direct tests in `tests/context/context-budget-3802.test.ts`;
- budget fitting repeatedly renders the actual output and removes lower-value detail in a deterministic order;
- whole semantic items are preserved instead of blindly cutting them mid-record;
- the algorithm keeps at least one observation and explicitly reports the irreducible over-budget case.

Verified Agent Core gap:
- `MemoryService.search` applies `budgetChars` against full canonical record size before the MCP projection;
- `memory_search` then serializes a different, smaller projection containing content plus scoring diagnostics;
- under pressure this can discard otherwise useful ranked results before knowing the actual controller-facing size;
- the generic MCP result budget is a later emergency spill/truncation layer, not a Memory-aware projection policy.

Proposed Agent Core adaptation:
- add an Agent Core-owned Memory-search projection budget stage after ranking and before MCP serialization;
- measure the actual controller-facing projection, not the full canonical record JSON;
- reduce optional diagnostics first (component detail, selection diagnostics, suppressed-duplicate detail), then linked neighbors, then lower-ranked direct results;
- preserve result identity/title/category/trust and at least one ranked result whenever possible;
- if one Memory content item alone exceeds the requested budget, return a bounded explicit content preview plus the Memory ID so the controller can call `memory_read`; never silently return an empty search because one result is large;
- preserve ranking order and never mutate canonical Memory, ranking weights, retrieval ledger evidence or source provenance;
- record projection/truncation evidence in the existing retrieval ledger rather than adding a new store.

Acceptance:
- result projection never exceeds the requested Memory budget unless the explicit irreducible-state contract says so;
- same ranked inputs + same budget produce deterministic output;
- optional diagnostics disappear before core Memory identity/content;
- at least one useful result survives a tight-but-valid budget when any result can fit;
- oversized single records return an explicit preview/read-by-ID path;
- retrieval-ledger exposures remain truthful about selected vs controller-delivered records;
- legacy default behavior remains compatible when results already fit.

### 14.3 Covered / rejected / conditional families

Already covered or stronger in Agent Core:
- PID identity/process lifetime, owned process trees and restart safety: covered by `src/process`, `src/rdc/process-ledger.ts`, launcher ownership and current lifecycle hardening;
- file search/read: covered by bounded native search/read surfaces;
- source/repository identity: covered by native Memory/Skills provenance;
- health/readiness and failure tracking: covered by `/health`, Activity Tracker and subsystem health contracts;
- queue retry/error counters do not justify importing BullMQ/Redis/Postgres outbox infrastructure.

Rejected for current Agent Core:
- Bun/SQLite/Postgres canonical memory stores, Redis/BullMQ execution transport, sync-hub replication, plugin-specific hook injection, transcript harvesting, autonomous summarization and alternate prompt/session runtime;
- automatic cross-project context injection into model prompts;
- Claude-specific plugin/bootstrap/update machinery.

Conditional future evidence only:
- owned readonly context-block delimiters and context replacement are relevant if the separate Agent Core AI runtime later gains a real prompt-assembly consumer. Do not install a dormant prompt-injection subsystem merely to mirror Claude Mem.

### 14.4 Reference disposition

**RETAIN.** CM2-P1 is a source-backed current-fit proposal awaiting user review. The checkout is therefore not a corpse. No implementation, build, dependency installation, runtime restart or release action is authorized by this planning pass.


## 15. Approved thedotmack execution result — 2026-09-27

CM2-P1 is present in current source/dist through `src/memory/search-projection.ts` and the Memory retrieval ledger. The controller-facing projection degrades optional detail before dropping useful ranked results and preserves a bounded preview/read-by-ID path for an oversized first result.

Direct wave acceptance and the focused Memory-maintenance projection contract pass. The re-cloned/pinned `21-claude-mem` checkout was retired after zero-value census: CM2-P1 is native, and its remaining owned-context concept is represented more directly by retained Supermemory SM-C1.

Live resident activation is complete after the user-controlled restart/reconnect; installed-runtime acceptance is recorded in `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`.
