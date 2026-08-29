# MSL Phase P Mapping Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the proven repeated JSONL full-scan bottleneck from Market Autopilot finalization while preserving append-only canonical history and market semantics.

**Architecture:** Keep JSONL as canonical truth. Add a rebuildable process-local ID index plus buffered batch append primitives, wire high-volume integrity persistence through batch APIs, then benchmark and add factual progress detail only after the storage hot path is proven faster.

**Tech Stack:** Go 1.26.x, append-only JSONL storage, existing repository interfaces, Windows native runtime; Rust analytics contract remains unchanged.

**Spec:** `docs/superpowers/specs/2026-08-18-msl-phase-p-market-mapping-performance-design.md`

## Global Constraints

- JSONL remains canonical and append-only.
- Accelerators are rebuildable and never authoritative.
- Phase P1 changes no market formulas, score semantics, credential behavior, or Rust protocol.
- Existing single-row append APIs remain source-compatible.
- No GPU work and no speedup claim without benchmark evidence.
- Full-Go baseline has unrelated pre-existing `internal/app` / `internal/web` test compile failures; do not hide or fix them in Phase P1.

---
### Task 1: Lock the storage performance baseline and RED contracts

**Files:**
- Modify: `internal/storage/integrity_store_test.go`
- Create: `internal/storage/integrity_store_benchmark_test.go`

**Interfaces:**
- Consumes existing `AppendScoreProvenance(domain.ScoreProvenance) error`.
- Produces regression expectations for new batch APIs and reusable benchmark corpus.

- [ ] **Step 1: Add failing batch/id-index behavior tests**

Add tests that call `AppendScoreProvenances`, `AppendDataQualityAssessments`, and `AppendMarketIndexSnapshots`; assert duplicate IDs are written once, empty batches are no-ops, caller order is preserved, and a ledger grown externally causes the cached ID view to rebuild before the next append.

- [ ] **Step 2: Run RED verification**

Run: `go test ./internal/storage -run 'TestIntegrityBatch|TestUniqueLedger' -count=1`
Expected: compile FAIL because the batch methods do not exist yet.

- [ ] **Step 3: Add the deterministic benchmark corpus**

Seed `score_provenance.jsonl` directly with deterministic rows containing stable IDs and representative distribution arrays, then benchmark 40 single-row appends against a pre-existing ledger. Do not use wall-clock assertions in unit tests.

- [ ] **Step 4: Capture old-path benchmark evidence before production code changes**

Run: `go test ./internal/storage -run '^$' -bench BenchmarkAppendScoreProvenanceGrowingLedger -benchtime=1x -count=3`
Record the three baseline durations in the Phase P QA evidence document created in Task 5.
### Task 2: Add the rebuildable unique-ledger accelerator

**Files:**
- Create: `internal/storage/unique_ledger.go`
- Modify: `internal/storage/store.go`
- Test: `internal/storage/integrity_store_test.go`

**Interfaces:**
- Produce internal generic helper `appendUniqueJSONLBatch[T any](s *Store, file string, rows []T, getID func(T) string) error`.
- `Store` gains a private per-ledger cache keyed by filename; no exported storage format changes.

- [ ] **Step 1: Implement the minimal ledger-index state**

Add a private `ledgerIDIndex` containing `ids map[string]struct{}` and `observedSize int64`, plus `uniqueIDIndexes map[string]*ledgerIDIndex` on `Store` initialized by `OpenWithPurgeReport`.

- [ ] **Step 2: Implement lazy rebuild from canonical JSONL**

Under `Store.mu`, stat the ledger. If no cache exists or the byte size differs from `observedSize`, scan the JSONL once and unmarshal only `struct { ID string `json:"id"` }`. Reject malformed non-empty rows and rebuild the ID set from canonical history.

- [ ] **Step 3: Implement buffered batch append**

Deduplicate against cached IDs and within the incoming batch, open the ledger once with `O_CREATE|O_APPEND|O_WRONLY`, marshal/write each accepted row through `bufio.Writer`, flush, stat the file, then update IDs and `observedSize`.

- [ ] **Step 4: Make failure conservative**

On marshal/write/flush/stat failure, delete the cached entry for that ledger so the next call must rebuild from JSONL. Never update the index before successful persistence.

- [ ] **Step 5: Run GREEN storage helper tests**

Run: `go test ./internal/storage -run 'TestIntegrityBatch|TestUniqueLedger' -count=1`
Expected: PASS.
### Task 3: Expose integrity batch APIs without breaking single-row callers

**Files:**
- Modify: `internal/repository/integrity.go`
- Modify: `internal/storage/integrity_store.go`
- Test: `internal/storage/integrity_store_test.go`

**Interfaces:**
- Add `AppendDataQualityAssessments([]domain.DataQualityAssessment) error`.
- Add `AppendMarketIndexSnapshots([]domain.MarketIndexSnapshot) error`.
- Add `AppendScoreProvenances([]domain.ScoreProvenance) error`.
- Existing singular methods remain and delegate to the corresponding batch method with a one-element slice.

- [ ] **Step 1: Add repository batch signatures**

Extend `repository.IntegrityRepository` with the three exact methods above.

- [ ] **Step 2: Implement batch methods in storage**

For each batch, generate `domain.NewID()` for any empty ID exactly as the singular method does, then call `appendUniqueJSONLBatch` with the correct ledger filename and `ID` selector.

- [ ] **Step 3: Convert singular methods to compatibility wrappers**

Each existing singular method calls its batch counterpart and preserves its error behavior.

- [ ] **Step 4: Verify storage regression**

Run: `go test ./internal/storage -count=1`
Expected: PASS.

- [ ] **Step 5: Verify production packages compile**

Run: `go build ./internal/app ./cmd/market-signal-lab`
Expected: PASS even though unrelated test files prevent full `go test ./...` from being a clean baseline.
### Task 4: Batch the Alpha 6.5 integrity publication hot path

**Files:**
- Modify: `internal/app/alpha65_orchestration.go:633-650`
- Verify: `internal/storage/integrity_store_test.go`

**Interfaces:**
- Consumes the three batch repository methods from Task 3.
- Produces identical JSONL record contents and caller-order publication, but with one storage operation per record family.

- [ ] **Step 1: Replace per-row integrity append loops**

Change finalization from individual `AppendDataQualityAssessment`, `AppendScoreProvenance`, and `AppendMarketIndexSnapshot` calls to exactly one batch call for `qualityRows`, `provenanceRows`, and `built.Hierarchy` respectively.

- [ ] **Step 2: Preserve fail-fast publication order**

Keep publication order `quality -> provenance -> index hierarchy -> ranking snapshots -> clusters/reviews/insights/alerts`. A batch failure returns immediately just as the first failing single-row append did.

- [ ] **Step 3: Compile the app and command**

Run: `go build ./internal/app ./cmd/market-signal-lab`
Expected: PASS.

- [ ] **Step 4: Run storage regression again**

Run: `go test ./internal/storage -count=1`
Expected: PASS.

- [ ] **Step 5: Commit P1 implementation**

Commit only storage/repository/finalizer/test files with message `perf: batch integrity ledger persistence`.

### Task 5: Prove the performance change and document evidence

**Files:**
- Create: `docs/qa/phase-p-mapping-performance-qa.md`
- Update: `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
- Update: `docs/checkpoints/CONTINUE_MSL.md`

- [ ] **Step 1: Re-run the identical benchmark**

Run: `go test ./internal/storage -run '^$' -bench BenchmarkAppendScoreProvenanceGrowingLedger -benchtime=1x -count=3`
Compare with Task 1 numbers; report raw durations and ratio, not marketing language.

- [ ] **Step 2: Run package verification**

Run: `go test ./internal/storage -count=1`, `go build ./internal/app ./cmd/market-signal-lab`, and `cargo test --manifest-path engines/rust/Cargo.toml`.

- [ ] **Step 3: Re-run the known full-Go baseline for transparency**

Run: `go test ./... -count=1` and record whether the same pre-existing `internal/app` / `internal/web` compile failures remain. Do not label Phase P as causing them if the failure signature is unchanged.

- [ ] **Step 4: Record Phase P state**

Document benchmark corpus, before/after measurements, behavioral evidence, unchanged semantics, pre-existing test debt, and remaining P2/P3 work. Checkpoint Phase C as frozen and Phase P as active.

### Task 6: P2 batch the non-unique finalization ledgers

**Files:**
- Modify: `internal/storage/store.go`
- Modify: `internal/storage/ranking_store.go`
- Modify: `internal/storage/autopilot_store.go`
- Modify: `internal/repository/ranking.go`
- Modify: `internal/repository/autopilot.go`
- Modify: `internal/app/alpha65_orchestration.go`
- Create/Test: `internal/storage/phase_p_batch_append_test.go`
- Create/Benchmark: `internal/storage/phase_p_batch_append_benchmark_test.go`

**Goal:** Replace per-row open/marshal/write/close loops in the Alpha 6.5 publication path with deterministic buffered batch appends. These ledgers are append-only and do not require ID uniqueness checks.

- [ ] **Step 1: Capture old-path benchmark before implementation**

Benchmark a deterministic batch of product snapshots using the existing singular `AppendProductSnapshot` loop. Record three runs with `benchtime=1x`.

- [ ] **Step 2: Add RED batch API contracts**

Require batch methods for product snapshots, catalog snapshots, product-direction clusters, classification reviews, production insights, and saturation alerts. Assert empty-batch no-op and caller-order preservation.

- [ ] **Step 3: Implement generic buffered `appendJSONLBatch`**

Under `Store.mu`, open the ledger once, marshal/write all rows through one buffered writer, flush once, close once. Empty slices are no-ops. Do not add uniqueness semantics.

- [ ] **Step 4: Preserve singular compatibility without regression**

Keep existing singular non-unique append APIs on the original direct `appendJSONL` path. Add batch APIs alongside them and use batch only where the caller already owns an in-memory family of rows.

- [ ] **Step 5: Batch Alpha 6.5 publication loops**

Replace per-row finalizer loops for product/catalog snapshots and cluster/review/insight/alert output families with one batch call per family, preserving publication order and fail-fast behavior.

- [ ] **Step 6: Verify and benchmark**

Run storage regression, production app/cmd build, the same benchmark corpus, and record raw before/after numbers. Do not extrapolate the microbenchmark to total mapping duration.

### Task 7: P3 eliminate ProductTrendEvent repeated history scans

**Files:**
- Modify: `internal/repository/universe.go`
- Modify: `internal/storage/temporal_store.go`
- Modify: `internal/app/temporal_trends.go`
- Create/Test: `internal/storage/phase_p_trend_event_test.go`
- Create/Benchmark: `internal/storage/phase_p_trend_event_benchmark_test.go`

**Goal:** Preserve `ProductTrendEvent` composite-key semantics while replacing per-event full-ledger scans and repeated per-window history reads with one history read plus batch validation/write.

- [ ] **Step 1: Capture old-path benchmark**

Seed a deterministic trend-event ledger directly, then append a deterministic family through the existing singular `AppendProductTrendEvent` loop. Record raw `benchtime=1x` runs before implementation.

- [ ] **Step 2: Add RED batch semantic contracts**

Require `AppendProductTrendEvents([]domain.ProductTrendEvent) error`. Assert same composite key + same type/active is idempotent, conflicting type/active returns the existing conflict error, empty batch is a no-op, caller order is preserved, and generated IDs do not mutate caller slices.

- [ ] **Step 3: Implement one-scan composite-key batch validation**

Under the store mutex, scan the trend ledger once, build the latest event map keyed by `ProductID + RunID + WindowDays`, validate the incoming batch against history and itself, then buffered-append accepted rows once. Preserve timestamp/event validation and singular API behavior.

- [ ] **Step 4: Collapse lifecycle history reads**

`persistTrendLifecycle` loads all trend events once before iterating 7D/30D/90D. Filter the in-memory history per window/run, accumulate the newly built events, then call the composite-key batch append once for the complete lifecycle publication.

- [ ] **Step 5: Verify and benchmark**

Run temporal/storage regression, production app/cmd build, and the same benchmark corpus. Record raw before/after numbers and keep whole-mapping claims gated on native end-to-end evidence.

### Task 8: P4 remove repeated catalog-hierarchy rebuilds; bucket scans only if evidence still requires it

**Files:**
- Create: `internal/ranking/catalog_hierarchy.go`
- Modify: `internal/ranking/product.go`
- Modify: `internal/ranking/catalog.go`
- Create/Test: `internal/ranking/phase_p_catalog_hierarchy_test.go`
- Create/Benchmark: `internal/ranking/phase_p_catalog_ranking_benchmark_test.go`

**Goal:** Preserve ranking v0.1/v0.2 numerical behavior while first eliminating repeated `IsCatalogWithin()` map rebuilds. Add ancestor observation/product bucketing only if the post-hierarchy benchmark remains materially slow.

- [ ] **Step 1: Capture old market-sized ranking benchmark**

Build a deterministic synthetic dataset with a realistic catalog tree, products, observations, queries, and product snapshots. Benchmark `BuildCatalogSnapshots` before production changes and save raw runs.

- [ ] **Step 2: Add RED hierarchy equivalence tests**

Test reusable catalog containment semantics, including same-ID, descendant, unrelated branch, missing candidate, and orphan-parent edge behavior. Existing ranking tests remain the numerical parity oracle.

- [ ] **Step 3: Build one reusable hierarchy index per ranking build**

Precompute `byID` once and resolve ancestry by parent traversal without rebuilding maps per call. Replace ranking hot-path ancestry checks while preserving empty/unknown/same-ID behavior.

- [ ] **Step 4: Gate optional P4b ancestor bucketing on benchmark evidence**

If the hierarchy-only implementation still leaves a material ranking bottleneck, pre-bucket observations/product snapshots by ancestor. If the identical benchmark falls to a small fraction of total native runtime, defer P4b to avoid unnecessary complexity.

- [ ] **Step 5: Preserve ranking semantics**

Existing catalog/product golden tests must remain exact. No formula, rounding, window, confidence, coverage, direction, percentile, or persistence behavior may change.

- [ ] **Step 6: Benchmark and gate**

Run ranking/storage regression, production build, and the identical old/new catalog benchmark. Record component measurements only; whole-mapping claims remain gated on native Phase P end-to-end evidence.

### Task 9: P5 accelerate post-run read paths without changing view semantics

**Files:**
- Create: `internal/storage/ranking_read_index.go`
- Modify: `internal/storage/ranking_store.go`
- Modify: `internal/storage/store.go`
- Create/Test: `internal/storage/phase_p_ranking_read_index_test.go`

**Goal:** Make `/api/autopilot/latest` responsive on large append-only history by replacing repeated full `product_snapshots.jsonl` parses with a rebuildable process-local read index. JSONL remains canonical.

- [ ] **Step 1: Lock endpoint baseline**

On the completed P4a QA data root, measure `/api/autopilot/latest`. Current evidence: request did not finish within 30.117 seconds.

- [ ] **Step 2: RED indexed-read contract**

Require a private snapshot index that reproduces latest-by-ID semantics, preserves canonical sorting, and rebuilds after external ledger growth.

- [ ] **Step 3: Use the index for ProductSnapshots**

Build decoded latest rows once per file signature and filter the cached rows in memory. Existing `ProductSnapshots` and `LatestProductSnapshot` signatures and results remain unchanged.

- [ ] **Step 4: Re-measure before expanding scope**

If `/api/autopilot/latest` becomes acceptably small relative to UI refresh, stop. Only add metadata/observation/temporal read indexes if measured evidence still shows a bottleneck.

- [ ] **Step 5: P5b index repeated universe/temporal reads if still measured slow**

P5a reduced `/api/autopilot/latest` from >30.117s to ~9.9–10.3s, and one four-product direction resolver still took 579ms. Add rebuildable indexes for Products, live metadata, product observations, releases/conflicts, and trend events. Keep every public repository signature, filter, sorting rule, and JSONL/cache file unchanged.

### Task 10: P6 reuse catalog scope hierarchy in universe views

**Goal:** Remove repeated catalog-tree reconstruction from `/api/universe/catalogs` and scoped universe views while preserving exact descendant scope membership.

- [ ] Add a tested reusable `universe.CatalogHierarchy` built once from catalog nodes.
- [ ] Preserve self, descendant, orphan-parent, empty-scope, and missing-scope behavior needed by existing views.
- [ ] Use one hierarchy per `CatalogUniverse` / `ProductUniverse` / `AuthorUniverse` request instead of repeated `IsCatalogWithin` calls.
- [ ] Re-measure `/api/universe/catalogs` and terminal refresh components before considering any further optimization.
