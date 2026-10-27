# WeKnora knowledge, retrieval and ingestion audit — Raka

> Final integration update: this report preserves the pre-adaptation comparison and excerpts. K-LOC-01 was subsequently implemented, passed58 targeted checks, and Main built/activated it with a real resident plugin read. Current state and limits: [Main audit](../WeKnora-Donor-Audit.md) and `runtime/build/weknora-donor-20261026/xlsx-execution.md`. Earlier proposed/not-implemented wording below describes the comparison stage.

Donor: `G:/repos/weknora`, clean pinned commit `22a331a2eac6d9ca367cd2fd2cf295cf42c4526e`. Recipient: `E:/Projects/Agent-Core`, current working sources, including existing local changes. This is a source comparison and an isolated MMR experiment, not evidence of donor deployment or user-task benefit.

The donor has substantially more document-library, enterprise connector, multi-store and wiki product machinery. Agent Core already has lexical/BM25/semantic fusion, MMR, scoped canonical Memory, passage indexing, embedding repair, exact-revision evidence and bounded document projection. Adding those donor product subsystems would create dependencies and overlapping state owners without an established local consumer. The first concrete performance candidate was measured and rejected. Structured Office source locations remain a credible bounded capability candidate, requiring a recipient-side consumer and verification before implementation.

## Evidence and coverage contract

- Canonical inventory assigns **1,608 files / 13,848,379 Git-blob bytes** to this audit. Every assigned file was opened by the mechanical content scanner, classified, indexed for declarations and relevant terms, and compared with its pinned blob. No normalized-content mismatch was found. **498** working files have CRLF-only differences; line anchors remain one-based physical text lines.
- Kind counts: **491 source, 698 tests, 374 migrations, 7 binary fixtures, 15 text fixtures, 5 generated files, 6 documentation files, 12 configuration/support files**. Binary fixtures were identified and hashed, not decoded or semantically validated.
- `raka-coverage.json` enumerates every assigned path and blob, content kind, source family, comparison owner, disposition, excerpt ranges, mechanically found declaration anchors and remaining unknowns. Mechanical full-content scanning is explicitly distinct from semantic reading. A group anchor never means every member was deeply reviewed.
- Final ledger: **86 assigned files have reviewed excerpts (19 full-file excerpts); 1,522 remain mechanical-only**. It contains **148 triage families**, 45 with reviewed excerpts. Comparative responsibility is Raka 734 / Main 550 / Native 324 paths; these handoffs do not change the canonical inventory.
- Exact excerpts were read through `runtime/build/weknora-donor-20261026/raka-read.cjs`; its log preserves byte digests and requested ranges. The coverage generator excludes invalid ranges and narrows the initially truncated fanout delivery. Other symbol/search observations remain mechanical triage, not deep-review proof.
- Source families containing agent/session/tool/skill/model/stream material retain their original inventory ownership but carry a **Native comparative handoff**. Tenant/auth/storage/automation/platform families carry a **Main comparative handoff**, as Main explicitly clarified. They remain unresolved in this domain report rather than being silently declared inferior or fully audited.
- No donor service, donor test suite, connector, model, parser service, migration or installation was run. No `.env`, secrets, protected reference tree, canonical Memory data, Agent Core MCP, Native or Cortex operation was used. Production source and configuration were not edited. Main owns CODEBASE integration.

## Recipient owners inspected before comparison

| Recipient owner | Observed responsibility and anchor |
| --- | --- |
| `src/memory/service.ts::search` | `1329–1418`: reload/current-index; workspace/general/pinned scope; expiry, archive, forgotten and superseded filtering; synthesis eligibility before ranking and again before delivery; bounded projection and content-digest evidence. |
| `src/memory/controller-session.ts::ControllerMemorySession` | `72–104`: host-authorized workspace/task/root cursor binding; stale or foreign cursor refusal. |
| `src/memory/retrieval.ts::searchMemories` / `searchMemoriesFusion` | `197–242`, `443–550`: BM25/fusion routing, separate rank channels, RRF, concrete-identifier eligibility, threshold, signature dedup and MMR. |
| `src/memory/retrieval.ts::selectFusionCandidates` | `378–440`: token admission capped at 256 candidates, 8,192 code points, 512 unique tokens and 8,192 lexical pairs; semantic precedence; exact pair metrics and redundancy basis. Policy constants at `30–36`. |
| `src/memory/bm25.ts::buildBm25Profile` | `23–65`: corpus term statistics, length normalization and max-normalized scores. |
| `src/memory/passages.ts::buildMemoryPassages` | `33–49`: 600-codepoint windows, 80 overlap, 128 cap, parent revision, exact offsets and partial-coverage status. |
| `src/memory/index.ts::build` | `281–341`: same-embedder/fingerprint reuse, pending repair admission, full-vector-batch validation before publication, lexical fallback and degraded coverage. |
| `src/memory/query-embedding-cache.ts` | `4–26`, `56–82`: provider/model/dimension/representation/query key, bounded entries/bytes/flights/waiters, copied finite vectors. |
| `src/memory/learning-sink.ts::findDuplicates` | `79–90`: same workspace, exact content/category/reuse condition; title equality alone is insufficient. `112–158` revalidates correction evidence and exact target revisions. |
| `src/learning/sink-manager.ts::capture` | `23–55`: supported sink selection, availability and duplicate checks, explicit captured/duplicate/failure result. |
| `src/memory/project-synthesis.ts` | `8–35`, `51–83`: bounded claim-to-source references, no self-awarded verified status, current/stale/unknown dependencies and request deadline. |
| `src/memory/subquestion-retrieval.ts` | `5–50`, `67–108`: opt-in controller-owned decomposition, call/byte/deadline limits; round-robin merging avoids comparing query-local scores; repeated exposure cannot upgrade epistemic status. |
| `src/memory/retrieval-ledger.ts` | `565–610`: exposures, explicit feedback and applied/adapted/rejected receipts remain separate. |
| `src/memory/evidence-excerpt.ts` | `16–56`: query-centered bounded quote, exact Unicode span and source revision, independent quote verification. |
| `src/web-research/service.ts::open` | `730–798`: native/external selection, explicit cancellation, public-document provenance, content hash and bounded PDF evidence. |
| `src/rdc/document-projection/{types,service,office-converters}.ts` | `types:31–41`: result carries markdown and optional PDF evidence; `service:130–178` preserves archive preflight, cancellation and bounded output; `office-converters:287–313` emits XLSX sheet headings/rows without a structured row-location sidecar. |
| `src/rdc/tools/pdf/lib/evidence.ts` | `3–6`, `13–80`: source SHA-256, extractor identity, approximate item geometry, explicit unsupported OCR, coverage and page/item/byte caps. PDF evidence is already present; this audit does not allege its absence. |

## Feature findings

### K-01 — ingestion identity and dedup: useful separation, existing recipient parity

`internal/application/service/knowledge_create.go::CreateKnowledgeFromFile:86–123` hashes bytes, then checks duplicates within tenant + KB. Datasource channels additionally scope by datasource ID and external ID (`104–110`). `internal/application/repository/knowledge.go::CheckKnowledgeExists:420–455` excludes failed/deleting rows and distinguishes file type. Thus two equal-byte documents from different source identities need not collapse, while a retry for one source can be idempotent.

Agent Core's corresponding *learning* duplicate admission already uses exact content, category, reuse condition and workspace (`learning-sink.ts:79–90`); transfer planning uses allowed source workspace and a stable import key (`transfer.ts::planMemoryImport:181–218`). It has a different identity contract from a document library. Copying file-hash admission into canonical Memory would erase relevant applicability distinctions. **Disposition: parity of scoped dedup principle; source-document identities are product-specific.**

The donor uses MD5 for these file/content identifiers (`knowledge_util.go::calculateFileHash:131–148`, `calculateStr:151–155`). Do not promote these hashes to Agent Core's source-integrity or verification authority. The donor string helper concatenates inputs without framing; Core already uses structured/framed digests in inspected evidence and cache paths. No adversarial collision was attempted.

### K-02 — chunking and parent context: donor capability is richer, benefit unresolved

The active ingestion service uses the Go infrastructure chunker (`knowledge_process.go:362–380`), not the Python splitter. The parser facade explicitly says conversion has no chunking (`docreader/parser/parser.py:34–39`). A bounded caller search for `TextSplitter` found its definition/demo and tests, not an active parser caller; Python split support is **source-present, production consumption unestablished**.

The Go `internal/infrastructure/chunker/strategy.go::Split:34–57` tries configured tiers and validates their outputs, retaining a final legacy fallback. `heading_splitter.go::splitByHeadingsImpl:32–120` tracks hierarchy and puts breadcrumbs in `ContextHeader` separately from exact content spans. `fenced_code.go::consume:16–52` recognizes backtick/tilde fences, matching closure and CRLF. `knowledge_process.go:577–654` persists parent/child relationships and locators; `710–724` indexes child/flat chunks rather than parent context.

Core passage indexing is deliberately a revision-bound projection of canonical notes, with exact Unicode offsets and bounded partial coverage. Its fixed windows can cross document structure, but that observation alone does not establish worse retrieval on the actual note workload. **Disposition: donor-superior structural chunking capability; no demonstrated recipient quality gain.** A potential adaptation must preserve exact original span identity and existing coverage caps; synthetic headers must never masquerade as source text. Do not add a second document/Memory owner.

### K-03 — embedding windows, repair and cancellation: mechanism parity, no blanket port

`service/retriever/keywords_vector_hybrid_indexer.go::BatchIndex:88–152` processes 200-row windows (40 × 5), finishes each window's DB writes before embedding the next and checks vector count. Precomputed image vectors preserve row order and reject duplicate source IDs (`precomputed.go::BatchIndexVectors:24–51`).

Core `index.ts::build:281–341` already reuses matching fingerprints/model identity, admits bounded repair jobs and validates dimensions/finite values before publishing any vector. Its embedder batches provider calls (`embedder.ts:124–140`) and repair state limits jobs/attempts/backoff (`embedding-repair.ts:8–11`, `174–205`). A donor 200-row constant is not an appropriate default for a note index without corpus/heap evidence. **Disposition: parity of bounded work and validation principles; different persistence/scale tradeoff.**

Donor `batchEmbedWithBackoff:158–179` retries every returned error in that loop; the local code does not itself classify “transient” despite the comment. The helper named `boundedConcurrentBatchSaveNoEmbedding:242–263` creates one goroutine per batch and acquires its semaphore inside each goroutine: active saves are bounded, queued goroutine count is not. Do not describe that as a fully bounded producer queue or copy it wholesale. No load was executed against donor storage.

### R-01 — hybrid retrieval/fusion: source parity, multi-engine product differences

`knowledgebase_search_fusion.go::classifyRetrievalResults:17–35`, `fuseOrDeduplicate:58–83`, `fuseWithRRF:170–219`, `bestRanks:224–233` preserve engine result lists, use each chunk's best rank within its own retriever lists and normalize the weighted RRF maximum. Keyword-only lists normalize by their own finite maximum (`rescaleUnboundedScores:125–153`). `retriever/normalizer.go::Normalize:64–78` clamps vector cosine envelopes while leaving keyword scores for rank-based fusion.

Core already uses distinct lexical, metadata, semantic and source channels with RRF (`retrieval.ts:492–502`), normalized BM25 (`bm25.ts:62–65`), signature dedup and bounded MMR. It currently has one canonical Memory index, not several independent vector stores whose scores must be calibrated. **Disposition: parity; engine-aware normalization/fanout is product-specific until multiple authorized stores are a real consumer.** Raw fusion score magnitude is not a confidence or truth score in either product.

### R-02 / W-01 — sparse-overlap MMR: measured, rejected

Donor `internal/reranking/mmr.go::SelectMMR:17–83`, `buildMMRPostings:90–123` builds flat token postings and updates maximum Jaccard only for candidates sharing tokens with the new selection. Core already caches maxima but counts intersections by scanning candidate token sets (`retrieval.ts:399–418`). This is a concrete alternative implementation mechanism, not proof of superiority.

Main authorized a runtime-only prototype against the exact current selection helper. `runtime/build/weknora-donor-20261026/raka-mmr-prototype.cjs` transpiles current retrieval code, the exact current tokenizer, and the exact cosine function using the existing TypeScript LSP runtime. It removes imports and invokes only the pure selection helper; it does not instantiate a service. Original input-source digests, candidate source, per-fixture counts and raw timing rounds are retained.

- **Postings correctness:** 100 deterministic synthetic fixtures matched selected IDs, exact scores, maximum redundancy, `redundancyBasis`, evaluated and skipped pair counts. Cases include 0/1/2/4/16/50/255/256/257/320 candidates, limits 1/5/50, no/all/mixed semantic vectors, 512/513 token cases, long text and Unicode. Zero-overlap pairs still consume the original pair budget; token admission order and semantic precedence remain unchanged.
- **Smaller-set correctness:** a second minimal variant scans the smaller token set for each exact intersection, without postings. All 104 fixtures matched, including four extra uneven-length cases.
- Timings include tokenization and candidate copies in the selection helper. Each condition was warmed up and the paired order alternated; all raw rounds are retained. The host was not isolated, so these are bounded local engineering observations, not a statistical or service-latency claim.

| Synthetic selection workload | Baseline median ms | Postings median ms | Decision |
| --- | ---: | ---: | --- |
| 8 candidates × 20 tokens, k=5 | 0.3045 | 0.3178 | Regression |
| 50 × 20, k=5 | 1.9757 | 2.3922 | About 21% slower; fails normal-workload gate |
| 256 × 256 sparse, k=50 | 157.4996 | 150.7414 | Small/noisy gain |
| 256 × 512 sparse, k=50 | 299.0511 | 281.7011 | Small/noisy gain |
| 256 × 256 dense, k=50 | 136.3070 | 141.8455 | Regression |
| 256 × 512 dense, k=50 | 285.1228 | 246.2591 | Larger synthetic gain, insufficient to offset normal regression |
| 256 × 256 mixed semantic, k=50 | 159.6821 | 124.5968 | Larger synthetic gain; not default workload |
| 256 × 256 sparse, k=5 | 120.0070 | 131.7598 | Default-k regression |

The smaller-set variant was immaterial on ordinary 50-candidate input (1.8420 → 1.8370 ms), around 1% better on uneven 50-row input, and worse on mixed-semantic input (148.0616 → 156.2267 ms). It also remains unpromoted. Heap deltas in the JSON are post-call heap growth, affected by GC; they are **not peak or retained-memory measurements**. Core's existing 50-candidate public default and tokenizer cost make removing intersection work less valuable than donor structure alone suggests.

**Disposition: reject both implementations; retain existing production algorithm.** Evidence: `raka-mmr-results.json` (initial postings run, 100 fixtures) and `raka-mmr-smaller-set-results.json` (104 fixtures), plus their compiled/source artifacts in the runtime directory. There is no production diff and no claimed user-task improvement. Further optimization needs a measured recipient workload, not another forced postings variant.

### R-03 — rerank and query rewriting: connected donor features, no established local model consumer

`internal/reranking/rerank.go::Rerank:111–231` bounds candidate/passage work, checks provider result indices, preserves original order on model failure and records diagnostics; `applyThreshold:289–306` deliberately degrades thresholds/falls back. `CompositeScore:364–373` mixes model and retrieval scores using product heuristics. `knowledgebase_search_rerank.go::rerankCandidates:159–198` is an actual service consumer with model-unavailable/error fallback. `passage.go::CleanPassage:65–95` protects fenced code from prose cleaning.

`chat_pipeline/query_understand.go::OnEvent:61–141` defaults to the original query, optionally calls a rewrite/vision model, bounds completion size and falls back on failure. `query_expansion.go::runQueryExpansion:22–120` expands keyword-only searches with bounded active work; `expandQueries:125–169` creates local query variants. The semaphore is inside one goroutine per job (`61–110`), so queued work is not globally bounded by its 16 active slots.

A scoped search of `src/memory`, `src/learning` and `src/web-research` found no automatic cross-encoder rerank service or model-backed rewrite owner. This is **not a claim that the Native/external reasoner cannot formulate another query**: Core already exposes bounded controller-owned subquestion retrieval (`subquestion-retrieval.ts`). No configured recipient reranker/provider consumer was established in this audit. **Disposition: donor-superior connected optional feature; defer adoption pending an actual task, private-data/network policy, model qualification, equal-budget quality oracle and latency/cost evidence.** Heuristic score mixing and relaxed thresholds must not alter Memory trust/admission.

### C-01 / K-LOC-01 — structured source locations: strongest bounded follow-up candidate

`internal/sourceloc/office.go::SupportsStructure:27–32`, `StructureUnits:48–61` handles Word paragraphs, slide structure, spreadsheet rows, CSV and EPUB units. `Align:26–76` maps complete units and refuses unaccounted repeated occurrences. Numeric boundaries reject false partial-number matches (`align.go:125–133`). `Index.Locators:42–79` quotes overlapping ranges and marks visible unmapped gaps partial. `RemapBlocks:120–135` re-aligns unchanged full text after markup rewrites rather than manufacturing coordinates by interpolation. The general `Remapper.Map` still contains interpolation; it is **not** the evidence-preserving remap path to port.

`knowledge_source_locators.go::buildSourceIndex:103–131` connects remapped blocks to final text and image positions. The Go chunk persistence includes those locators (`knowledge_process.go:583–637`), and migration `sqlite/000033_chunk_source_locators.up.sql:2` persists the sidecar. Python PDF `source_locator.py::locate_lines:115–169` also refuses ambiguous repeated/numerically unsafe placements. Source tests encode omitted-block, repeated-text, numeric-change and changed-text rejection (`precision_test.go:11–86`); these tests were read, not run.

Core already has a stronger explicit PDF fidelity/coverage envelope and SHA-256-bound evidence (`pdf/lib/evidence.ts:13–80`). The narrower observed gap is **structured Office locations in document projection**: `ProjectionResult` has only `pdfEvidence` as a location sidecar (`types.ts:31–41`), and `xlsxConverter.convert:287–313` emits sheet names/rows as markdown without source row mappings. Its read/tool projection is a real consumer; there is no need to auto-ingest that evidence into Memory.

**Disposition: donor-superior Office-location source capability; proposed recipient adaptation, not implemented or benefit-proven.** Start with XLSX row/cell origin metadata produced directly during the existing ExcelJS conversion, avoiding a second Go/Python parser and ambiguous post-hoc alignment. Keep source SHA-256, exact source/output spans, converter identity, independent budgets, omission and uncertainty status. Only extend other formats when a concrete citation task needs them. A copied quote or precise region still does not verify the claim made from it.

### C-02 — quote/merge helpers: mostly parity, preserve recipient revision semantics

`searchutil/chunkmerge.go::JoinChunkContent:15–44` uses actual current text and bounded overlap rather than trusting stale parser offsets; `AppendWithOverlap:107–136` avoids trimming adjacent non-overlapping text. These are useful for editable document chunks and synthetic table headers. Core's indexed children are immutable revision-bound spans, so importing editable-chunk reconstruction is unnecessary unless that consumer is introduced.

`searchutil/snippet.go::ExtractSnippet:11–49` produces a regex-context display snippet with whitespace normalization and no exact-revision span. Core's `selectMemoryExcerpt/verifyMemoryExcerpt` already provides bounded original text, Unicode offsets and source revision. **Disposition: current Core evidence contract is stronger for canonical Memory; no snippet replacement.**

### G-01 — graph and wiki: source-grounded product machinery, not a second Memory engine

`graph_search.go::Search:30–47` requires an explicit KB grant, retrieve capability and timeout. `115–153` re-fetches all cited chunks and rejects nodes if any source is missing or in another document; `199–230` returns relationships only between surviving nodes. `repository/graph_search.go::GetGraphSourceChunks:21–54` explicitly filters tenant/KB, soft-deleted rows, enabled state and ready index status, using bounded SQL substrings. This is stronger than trusting vector/graph payload metadata alone.

Wiki `wiki_ingest_cite.go::splitChunksIntoCitationBatches:151–207` keeps document order and maps local model handles back to stable chunks. Its 12,000-rune citation target is not a strict cap: an oversized chunk is admitted in a batch alone (`191–203`). `wiki_page.go::UpdateWithRevision/updateWikiPageRow:118–175` snapshots and CAS-checks versioned pages. `wiki_write_row_guard.go:23–34`, `72–102` checks row *identities*, with 20% tolerated loss for ingestion; it cannot prove all amounts, wording or facts survive. `wiki_lint.go::RunLint:94–124` streams page checks but still retains all live slugs and accumulates issues; do not claim constant total memory from its bounded page batch alone.

Core already has relation links, exact-revision promotion/synthesis dependencies and independent verification (`project-synthesis.ts`, `relations.ts`, `learning-sink.ts`). Its code graph owner is separate from Memory. No current wiki-page database, Neo4j document graph or document-library consumer was established in those exact owners. **Disposition: product-specific; preserve provenance revalidation principle, do not add donor graph/wiki stores.** Source-grounded citations are evidence lineage, not semantic correctness proof.

### G-02 — donor personal Memory: do not transplant exposure-as-use or auto-maintenance policy

`service/memory/scope.go::ResolveScope:34–51` derives caller tenant/principal identity rather than accepting an arbitrary client scope. This is a useful isolation principle, corresponding to Core's host-bound task/workspace sessions, although the products' principal models differ.

`service/memory/search.go::SearchMemory:97–119` selects scoped lexical/vector candidates, then explicitly treats searched memory as used and calls `touchAsync`. Core separates exposure, explicit use attribution, feedback and outcome (`retrieval-ledger.ts:565–610`); exposure is not task reuse or success. Donor `consolidate.go::reviewStore:90–169` performs maintenance expiry, merges/demotion and vector backfill. Core already has explicit retention, review, promotion and correction owners. **Disposition: donor weaker against Agent Core's use-attribution/authority contract; no Memory implementation import.** This does not judge the donor's different personal-memory product goal.

### D-01 — connectors and resumable fetch: broader donor product, defer without a sync consumer

`datasource/connector.go:11–51` defines provider validation, lazy resource selection, full/incremental fetch; `54–104` adds interleaved Emit/Checkpoint and full-stream deletion baseline. The checkpoint is specified as a complete resumable snapshot. `datasource_service.go:1088–1128`, `1153–1205` connects streamed items to ingestion and durable progress. `scheduler.go::triggerSync:192–257` suppresses overlap and uses a deterministic datasource/minute task ID, with separate task retries and timeouts.

Provider source families were separately inspected rather than assuming all implementations satisfy one interface identically:

| Provider family | Mechanism and verified source anchor |
| --- | --- |
| Feishu Drive/Wiki shared core | `feishu/core/engine.go:158–209`: edit-time fast path, fetch-failure retry identity, progressive checkpoints; `217–234` suppresses deletion on partial listings. Drive/wiki adapters remain separately content-triaged. |
| GitLab | `gitlab/connector.go::FetchStream:216–271`: compare prior project commit, emit initial files/changes and checkpoint each project. |
| Seafile | `seafile/sync.go::runSync:40–87`: validate selected library before binding cursor, scan roots, then reconcile. |
| Confluence | `confluence/sync_plan.go::buildSyncPlan:28–110`: validate selected spaces and page ancestry; refuse destructive reconciliation for unavailable selected scope; collapse overlapping roots. |
| DingTalk | `dingtalk/connector.go:1005–1025`: reconcile union of selections; postpone deletion and retain revisions when any scope is unavailable. |
| IMA | `ima/connector.go:325–352`: transient fetch failures stay out of “synced” cursor while present identity prevents false deletion. |
| Notion | `notion/connector.go::FetchIncremental:174–232`: edit-time cursor, initial full fetch and subsequent resource discovery; batch materialization remains a distinct path. |
| RSS | `rss/connector.go:244–316`: separate feed signal/body fingerprint; preserve prior full article on transient resolution failure; explicit partial-fetch error. |
| Yuque | `yuque/connector.go:337–385`: source metadata and incremental deletion by listed document identity. Remote listing completeness/error variants outside these excerpts remain unverified. |

Core's exact web-research owner is an on-demand bounded read/search service. Its canonical Memory/Learning sink is not a continuously mirrored enterprise document library. A bounded owner search did not establish a persistent connector-cursor/scheduled-ingest consumer. That is missing-consumer evidence, not a reason to manufacture a sync engine. **Disposition: source-superior connector breadth; product-specific/no current port.** A future connector should use the existing authorized research/import/learning boundary, creator-selected scope and an explicit source-revision contract.

### D-02 — two source-derived donor sync risks: reject these semantics

1. **Delete before replacement:** `datasource_service.go::ingestItem:1415–1453` deletes and hard-deletes the previous knowledge before calling creation at `1457–1503`. Creation error returns have no restoration in that function. The separate manual `ReplaceKnowledgeFile` has compensating source restoration (`knowledge_replace.go:130–198`); that does not repair the datasource function's deletion ordering. A source-derived lost-last-good-copy window exists if recreation fails. No donor service was exercised.
2. **Cursor can outrun ingestion:** Feishu core stores the successful fetch edit time before Emit (`engine.go:184–191`). Its production stream handler calls `applyFetchedItem` but returns nil for per-item ingestion failure (`datasource_service.go:1092–1098`); Checkpoint persists the cursor (`1104–1115`). A later unchanged edit-time pass can skip the item (`engine.go:158–163`). Download failure retry handling is present; successful download followed by ingestion failure is a different failure class. This is a traced static risk, not a reproduced outage.

Minimal future donor-side regressions can invoke the actual stream handler/connector with fake repositories and failure injection: retain existing content through create failure; fail one Emit ingestion, checkpoint, then retry unchanged source and require the missing item to be retried. They were not run here. Neither risky workflow is a candidate for canonical Memory.

### Q-01 — task queues, stale recovery and cancellation: good mechanisms with different owners

`repository/task_queue.go::ClaimBatch:260–361` claims disjoint dedup keys in a transaction, prioritizes lower fail-count/older work and uses `SKIP LOCKED` for Postgres; stale claims can be recovered. `migrations/versioned/000041_task_queue_and_wiki_indexes.up.sql:51–122` supplies durable pending/dead-letter rows. `knowledge_task_options.go:11–25` defines three retries and timeouts for document/postprocess tasks.

`knowledge_process.go::processChunks:428–443`, `675–683` checks cancellation, replacement and supersession; `CancelKnowledgeParse:3250–3335` persists canceled state, zeroes pending subtasks, aborts spans and best-effort dequeues/scrubs pending wiki work. `knowledge_housekeeping.go::runSweep:157–218` distinguishes stale state from recent stage activity and queued work. `knowledge_reparse_scope.go:14–59` revalidates the whole batch's persisted tenant/KB binding before destructive submissions.

These document-pipeline mechanisms are real; they are not a missing replacement for Core's Memory transactions, learning reviews, host cancellation or Native checkpoint owners. **Disposition: product-specific queue/ingestion state; parity in stale/revision/cancellation principles.** Main/Native own the final cross-runtime queue/recovery comparison. Do not create a parallel Redis/Asynq/SQL owner for learning tasks merely because donor infrastructure exists.

### A-01 — attachment and parser service: broad support, selective applicability

`attachment/reader.go::Resolve:66–91` resolves stored session inventory, optionally waits for document readiness and reports projection-sync warnings; `awaitDocument:152–169` checks context cancellation and bounded wait. This is an actual donor conversation attachment consumer. Native owns the recipient chat/tool attachment comparison; the file is retained in this audit's coverage and handed off rather than declared absent locally.

`docreader/parser/parser.py::parse_file_stream:87–117` uses a lazy parser path when available, but materializes non-streaming parser results before wrapping the stream. Sending one image per RPC frame does not imply incremental parsing. `parser/concurrency.py::parser_worker_limit:22–39` bounds active heavy parser operations, with a blocking acquire. `preprocess.py::PreprocessRunner:137–272` supervises bounded reusable workers, time/memory/cancel checks and original-image fallback. Its `pass_fds` subprocess path is POSIX-oriented; Windows portability must be demonstrated before adoption. Core's existing Office/PDF/archive/projection pipeline already has source-aware evidence and guardrails. **Disposition: parser breadth/source-present optional OCR/preprocessing; no service adoption.**

Importing the Python docreader would pull a separate Python service, gRPC/protobuf, PDF engines, office/image libraries, OpenCV/ONNX/RapidOCR, Playwright and model assets (`docreader/pyproject.toml:1–40`). None was installed. It would also add a versioned wire contract, process/resource supervision and cross-platform behavior to maintain. A local TS capability adaptation is preferable when an existing converter can supply the required data.

### E-01 — datasets, metrics and migrations: support material, not benefit proof

`dataset/qa_dataset.py::sample_data:64–104` chooses high-qrel-count queries and samples extra distractors without a fixed seed in that call. Its answer generator calls a model. `service/dataset.go::GetDatasetByID:41–50` loads the default dataset regardless of the incoming ID; `DefaultDataset:54–75` uses relative sample paths and panics on loading failure. Parquet fixtures are not a sealed, recipient-specific independent oracle.

Core already has digest-bound retrieval observations and an independently recomputed hit@k verifier (`evaluation/retrieval-evaluation.ts:30–53`, `retrieval-verifier.ts:27–80`). **Disposition: recipient evaluation contract is stronger for acceptance; no donor default dataset/metrics adoption.** Donor fixtures can inspire explicitly synthetic regressions, but their presence or assertions are not executed results.

All 374 SQL migrations were mechanically content-triaged: 268 versioned, 102 SQLite, two MySQL and two ParadeDB files. Representative source-location, query-index, queue and wiki-index migrations were semantically read. Other product-wide schemas remain explicitly handed off to the relevant final owner; migration mapping is not proof that every up/down pair, database version and existing-data path is correct. Core's canonical JSON/file-backed Memory is not a GORM document database. **No SQL migration port is proposed.**

### E-02 — Chinese FAQ conversion and framing policy: distinct product consumers

`textconv/simplified.go::ToSimplified:49–79` applies longest dictionary matches, phrase dictionary before character dictionary, and chooses the first alternative. The copied OpenCC dictionaries are Apache-2.0 (`textconv/data/README.md:3–12`) and affect persisted FAQ hashes when changed. No equivalent Chinese FAQ-normalization consumer was established in the inspected Core owners. **Disposition: product-specific; do not alter canonical note text or identifiers.**

`embedpolicy/origin.go` is **browser framing and API-origin policy**, not vector embedding. `NormalizeOrigin:13–29` rejects invalid origin components; `FrameAncestors:90–114` builds CSP with fail-closed empty policy. Main owns the HTTP-security comparison. **Disposition: product-specific framing consumer / Main handoff.** Avoid a feature-gap claim based on the misleading package name.

## Candidate decisions, minimal checks and costs

| Candidate | Recipient consumer and minimal discriminating check | Portability/dependency/license cost | Decision |
| --- | --- | --- | --- |
| W-01 postings or smaller-set MMR | Existing `selectFusionCandidates`; exact-output and budget comparison on synthetic sparse/dense/mixed/default/edge workloads. Executed as above. | Pure TS adaptation needs no new package; copied substantial donor logic requires MIT/Tencent notice. Postings add bounded maps/arrays and allocation overhead. | **Rejected after measurement.** |
| K-LOC-01 XLSX source row locations | Existing `xlsxConverter` and projection output. Construct a tiny in-memory workbook with Unicode, duplicate text on separate sheets, blank/merged rows and truncation. Independently expect sheet/row/cell locations from the workbook, verify SHA-256/output spans, and ensure omitted rows never acquire coordinates. Measure conversion and serialized sidecar bytes against current baseline. Not run. | Reuse existing ExcelJS/Node; no Go/Python/gRPC. Optional bounded sidecar schema and downstream projection delivery need review. Preserve Core digest/fidelity/coverage rules; retain MIT attribution if adapting donor code. | **Actionable bounded follow-up; source advantage observed, benefit unproven.** |
| W-03 heading-aware passage projection | Existing passage granularity only. An equal-budget corpus with question evidence straddling heading/code/table boundaries must improve held-out hit@k without losing exact offsets, duplicate/revision safety or partial coverage. Existing independent retrieval scorer/verifier is the oracle. Not run. | TS-native derived representation/version bump, reindex/invalidation and backward compatibility; no external engine necessary. Donor Go chunker depends on its types/logger, so adapt principle rather than wholesale copy. | **Deferred; richer donor capability does not establish a real note-retrieval problem.** |
| W-04 optional rerank/rewrite | No configured Core model consumer established. Requires a concrete task, fixed model, private-data/network approval, equal total-call budget, held-out relevance IDs, fallback/cancel tests and measured latency/tokens. Not run. | Provider/model integration, possible remote disclosure and recurring cost; donor rerank service/type/config coupling. No new trust owner. | **Defer / no automatic installation.** |
| W-05 resumable enterprise connector | No continuous sync consumer established. If requested later, use fake paginated API + actual adapter: crash after an item, resume complete cursor, partial listing must not delete, ingest failure must remain retryable, replacement must retain last-good content. Not run. | Provider credentials, network policy, API drift, scheduler/queue/state lifecycle and deletion semantics; full donor needs GORM/Redis/Asynq. Each provider's dependency/asset notices require separate review. | **Product-specific; no current port.** |
| W-06 graph/wiki/background ingestion | Core already owns relations, evidence-linked synthesis and learning. A future page/graph consumer would need exact current source invalidation and independent factual verification, not only generated citations/row identity. Not run. | Postgres/SQLite schemas, optional Neo4j, model calls, pending queue, revisions, cleanup and visibility policy. Avoid a second Memory engine. | **No current port.** |

The donor top-level `LICENSE:7–28` grants MIT terms for WeKnora and requires preserving copyright/permission notices in substantial copies. It separately lists third-party components; this is not a blanket permission to relicense dictionaries, Python assets, model weights or provider SDKs. The OpenCC data's Apache-2.0 notice is explicit. This audit did not produce an exhaustive transitive-license audit or obtain model assets. No external research was needed for these source-local observations.

## Remaining unknowns and stop conditions

- No donor runtime correctness, connector API behavior, parser output fidelity, multi-engine performance, migration rollback or distributed queue interleaving was exercised. Source tests were not silently promoted to passing results.
- Individual files outside the listed excerpts remain content-triaged; unresolved semantic paths are explicit in the coverage ledger. Native/Main comparative handoffs are pending their respective reports and must not be counted as knowledge deep-review completion.
- MMR timing uses synthetic candidates, one host and concurrent machine activity; it says nothing about provider latency, retrieval quality, total task success or causal Memory benefit. The normal-case regression is sufficient to reject the proposed port without trying to force a win.
- Recipient sources may change concurrently. Coverage retains read digests, and MMR results retain exact source digests. Revalidate a candidate's current owner and digest before implementing it.
- K-LOC-01 is a capability proposal, not a claimed bug fix. Stop if no actual projection/evidence consumer needs source row locations, if output cannot be bounded without false coverage, or if implementation would create a second parser/Memory owner. W-03/W-04/W-05 remain deferred until the specified consumer and oracle exist. Main separately owns W-02 transport classification; the names must not be conflated.

The companion coverage ledger is the exhaustive path-level triage record. Its excerpt sets, feature anchors and handoff statuses are the basis for extending this audit; directory ownership alone is never deep-review proof.
