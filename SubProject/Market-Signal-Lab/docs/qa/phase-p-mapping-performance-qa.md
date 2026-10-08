# Phase P — Market Mapping Performance QA

> **Historical QA evidence:** results below apply to their recorded revision, environment and date. They were not rerun during the monorepo documentation refresh. See [current continuation](../checkpoints/CONTINUE_MSL.md) before treating a pending step or machine path as current.

**Date:** 2026-08-18
**Branch:** `feature/market-mapping-performance-phase-p-20260818`
**P1 implementation commit:** `55a3dd387a3c4c1d97b983407646a85184fdcf49`
**P2 implementation commit:** `360bd018a8369628b8f3cface681e10e96339a10`
**P3 implementation commit:** `c4aaaa32699c6edc512d0ab80030f10f3529b749`
**P4 implementation commit:** `5bd405e560abaf88c451595da4060ee0f47364de`
**P5 implementation commit:** `293773886ba12a78b7c43bb96f48c78404fd0e00`
**P6 implementation commit / native-performance source:** `e3d8874eb03aeb34a09dcefbfed9a084d1430fb0`
**Repository-wide verified integrated head:** `8049f1b66c578d54acb892f796effec6a1cf57b3`
**Test-debt repair PR:** `#17` — MERGED into Phase P
**Status:** P1–P6 IMPLEMENTED / COMPONENT BENCHMARKED / NATIVE WINDOWS QUICK-MAPPING VERIFIED / FULL GO GREEN / PRODUCTION BUILD GREEN / RUST GREEN

## Scope and invariants

Phase P was authorized after Phase C was explicitly frozen. The purpose was to remove measured Market Autopilot runtime bottlenecks before resuming C1–C3.

Locked invariants throughout Phase P:

- JSONL remains canonical, append-only, and auditable history.
- Accelerators are rebuildable and never authoritative.
- No market formula, threshold, score meaning, confidence rule, ranking model, or signal semantic was intentionally changed.
- No Envato credential/token material enters accelerators, Rust, QA datasets, or Git history.
- Production Rust remains `rust-production / msl-analytics/2` for the already-migrated analytics kernels.
- No GPU path was introduced because profiling showed the dominant defects were algorithmic CPU/storage complexity, not GPU-suitable numerical kernels.
- Whole-mapping speedup is claimed only from measured native end-to-end runs, not from component microbenchmarks.

## Baseline runtime — pre-Phase-P native Quick mapping

A real Windows Quick Market Autopilot run on the pre-Phase-P runtime was preserved until terminal completion rather than interrupted.

```text
runId=cc3d55ae080e60fd7348ea7dadc39496
mode=quick
status=completed
elapsedMs=8649613
elapsed=144.1602 minutes
elapsed=2h24m09.613s
warnings=0
errors=0
```

During direct observation, all 28/28 source requests had already completed while the run remained at `76.2% / 16 of 21 work units / ranking_consensus` for well over 95 minutes. The Go host remained CPU-active while the Rust worker was idle in that finalization interval.

This established that the dominant delay was local post-processing/storage/ranking work rather than Envato network collection.

## P1 — unique integrity-ledger accelerator

### Proven bottleneck

Before P1, each high-volume unique integrity append performed a full JSONL scan + JSON unmarshal to search for one ID before appending one row. The pattern affected data-quality assessments, score provenance, and market-index snapshots. During the observed baseline, `score_provenance.jsonl` exceeded 70 MB and continued growing.

P1 execution shape:

```text
canonical JSONL
→ lazy one-time ID scan
→ process-local rebuildable ID set
→ O(1) membership checks
→ buffered batch append
→ update accelerator only after successful persistence
```

External ledger growth invalidates/rebuilds the accelerator. Marshal/write-path failure invalidates cached state conservatively.

### Deterministic P1 benchmark

Environment:

```text
Windows amd64
Intel Core i5-4570 @ 3.20GHz
Go 1.26.4
200 pre-existing provenance rows
64 deterministic catalog-distribution entries per row
40 new provenance rows
benchtime=1x
count=3
```

Old per-row full-ledger scan:

```text
820.7992 ms
834.4834 ms
830.8425 ms
mean = 828.7084 ms
```

Optimized singular compatibility path:

```text
17.4681 ms
18.3218 ms
16.3236 ms
mean = 17.3712 ms
```

Component ratio: approximately **47.7×**.

Buffered integrity batch path:

```text
8.2153 ms
8.8635 ms
9.5648 ms
mean = 8.8812 ms
```

Component ratio old-path to batch: approximately **93.3×**.

## P2 — non-unique finalization batch I/O

P2 removed per-row `open → marshal → write → close` loops from finalization families where the caller already owns an in-memory set of rows.

Batched families:

```text
product snapshots
catalog snapshots
product-direction clusters
classification reviews
production insights
saturation alerts
```

Existing singular APIs remain direct singular appends so one-row callers do not pay batch-buffer overhead.

### Deterministic P2 benchmark

500 ProductSnapshot rows, old per-row loop:

```text
48.0801 ms
47.9153 ms
48.0879 ms
mean = 48.0278 ms
```

Buffered batch path:

```text
2.0336 ms
1.4624 ms
1.3866 ms
1.4849 ms
1.4916 ms
mean = 1.5718 ms
```

Component ratio: approximately **30.6×**.

## P3 — ProductTrendEvent composite-key batching

The old path searched the complete `product_trend_events.jsonl` ledger for every event using `(ProductID, RunID, WindowDays)` and re-read history across 7D/30D/90D lifecycle windows.

P3 preserves exact idempotency/conflict semantics while changing the execution shape:

```text
read lifecycle history once
→ build 7D / 30D / 90D events in memory
→ accumulate one pending lifecycle batch
→ scan canonical trend ledger once for composite-key validation
→ preserve idempotent same-state duplicates
→ preserve conflicting-state error
→ buffered append accepted events once
```

### Deterministic P3 benchmark

1,000 pre-existing trend events + 200 new events, old singular path:

```text
1075.2961 ms
1077.5647 ms
1077.7056 ms
mean = 1076.8555 ms
```

New composite-key batch path:

```text
4.7707 ms
5.6081 ms
4.7817 ms
mean = 5.0535 ms
```

Component ratio: approximately **213.1×**.

## P4 — reusable catalog hierarchy in ranking hot paths

### Proven CPU bottleneck

After P1–P3, a native run still spent substantial CPU time after network collection. Source audit found that catalog ranking repeatedly called ancestry checks inside product/query/session/catalog loops while legacy `IsCatalogWithin()` rebuilt the entire catalog lookup map on every call.

P4 builds one reusable hierarchy index per ranking build and resolves ancestry through parent traversal. Formulae, rounding, windows, confidence, coverage, direction, percentiles, and persisted output structures remain unchanged.

A parity edge discovered during self-review was preserved: same-ID returns true even when the ID is not present in the tree, matching legacy behavior; orphan-parent traversal semantics also remain compatible.

### P4 deterministic benchmark

`BuildCatalogSnapshots()` corpus: 120 catalogs / 600 products / 1,200 observations.

Old hierarchy-rebuild path mean: approximately **15,897 ms**.

Reusable-hierarchy path mean: approximately **35.95 ms**.

Component ratio: approximately **442×**.

Optional ancestor-bucketing P4b was deliberately deferred because the hierarchy-only change reduced the component to tens of milliseconds; adding more indexing complexity was not justified by measurement.

## P5 — rebuildable read indexes for large history

After mapping itself became fast, `/api/autopilot/latest` still exceeded 30 seconds on large QA history because product-direction enrichment repeatedly reparsed large history ledgers, especially `product_snapshots.jsonl`, product observations, metadata, release/conflict history, and trend history.

P5 adds process-local read indexes keyed by canonical file signature. JSONL is still the only source of truth. File growth/rewrite causes rebuild; live-metadata rewrite explicitly invalidates its cache.

Observed endpoint progression on the native QA history:

```text
pre-P5 /api/autopilot/latest: >30.117 s (timeout threshold exceeded)
P5a snapshot index: ~10.27 s
P5b expanded universe/temporal indexes, warm: ~1.5–1.6 s
```

Final clean-source run read timings after P5/P6:

```text
/api/autopilot/latest = 1849 ms, 1674 ms, 1592 ms
```

Public API signatures and view semantics remain unchanged.

## P6 — reusable catalog hierarchy in universe/explorer views

After P5, `/api/universe/catalogs` remained about 1.76 seconds because each catalog rebuilt ancestry scope repeatedly.

P6 adds reusable `universe.CatalogHierarchy` and reuses it inside catalog/product/author universe views and the affected explorer caller.

Native timings on the same QA history:

```text
before P6 /api/universe/catalogs ≈ 1761 ms
final /api/universe/catalogs = 187 ms, 196 ms, 212 ms
```

Other final read timings:

```text
/api/research/queries = 16 ms, 70 ms, 15 ms
/api/ranking/catalogs?windowDays=30 = 211 ms, 206 ms, 230 ms
/api/ranking/products?windowDays=30 = 764 ms, 937 ms, 729 ms
```

## Final native Windows Quick-mapping verification

Final production source commit tested natively:

```text
e3d8874eb03aeb34a09dcefbfed9a084d1430fb0
```

Native build identity used for the final QA run:

```text
AppSHA256=F659AF7710ECAD9DEF8D9D37E246F3EE1D01D36557E816118DD09DF39CCD60F4
RustWorkerSHA256=139247605F9DD2D38D415D7AE2028C00987860494D8B69A42F2CD37992F5F5AE
credentialSource=credential_manager
credentialFingerprint=106B-8C76
productionAnalytics=healthy / rust-production / msl-analytics/2
```

Final Quick run:

```text
runId=09d37420e56bd781aaca1a20eb6bd618
status=completed
productsDiscovered=489
requestsCompleted=28/28
workUnits=21/21
warnings=0
errors=0
elapsedMs=355010
elapsed=5m55.010s
```

Network/source work reached the historical `76.2% / 16 of 21` boundary at approximately `337585 ms`; terminal completion occurred at `355010 ms`, so final local post-network completion was approximately **17.425 seconds**.

Final QA data-root structural validation:

```text
JSONL files=26
JSONL records=118197
invalid JSONL records=0
```

## End-to-end measured result

Comparable native Windows Quick Market Autopilot runs on the same machine:

```text
pre-Phase-P baseline = 8,649,613 ms = 144.1602 min = 2h24m09.613s
final Phase-P run    =   355,010 ms =   5.9168 min = 5m55.010s
```

Measured operational ratio:

```text
speedup = 24.3644×
time reduction = 95.8957%
```

This is an operational end-to-end benchmark, not a deterministic market-data benchmark: Envato is live and the final run discovered 489 products while the earlier observed baseline had 485 products at the 76.2% observation point. The ratio is therefore evidence for the real runtime improvement on comparable Quick scans, while component microbenchmarks remain the deterministic evidence for individual code-path changes.

## Repository-wide merged verification

PR #17 repaired only pre-existing Go test debt and merged into Phase P as:

```text
merge commit = 8049f1b66c578d54acb892f796effec6a1cf57b3
```

The test-debt repair changed only test files. A repository compare from native-performance source `e3d8874...` to merged head `8049f1b6...` shows only the three closeout documents plus six Go test files; no production Go or Rust source changed after native performance verification.

Fresh Linux build host verification on merged Phase P head `8049f1b66c578d54acb892f796effec6a1cf57b3`:

```text
go version go1.26.4 linux/amd64
cargo 1.97.1
rustc 1.97.1

go test ./... -count=1
PASS — all Go packages green, including internal/app and internal/web

go build ./internal/app ./cmd/market-signal-lab
PASS

cargo test --manifest-path engines/rust/Cargo.toml
PASS — 22 library tests + existing V2 worker/batch integration tests

git status --short
(clean)
```

This closes the previously documented full-Go compile/runtime test debt. No production behavior was changed by that repair.

## Correctness contracts added

- unique batch duplicate IDs append once;
- accepted row order follows caller order;
- empty batches are no-ops;
- external ledger growth rebuilds unique/read indexes;
- write/marshal failure invalidates unique index state conservatively;
- generated IDs are persisted without mutating caller-owned slices;
- ProductTrendEvent composite-key idempotency/conflict semantics are preserved;
- reusable catalog hierarchy preserves same-ID, descendant, unrelated, missing-candidate, and orphan-parent legacy behavior;
- read indexes reproduce canonical filtering/sorting and rebuild from JSONL after file changes;
- JSONL remains the authoritative history throughout;
- secure-credential tests reject legacy plaintext token request paths;
- asynchronous Autopilot tests wait for background completion before temporary-history cleanup.

## Phase P closeout state

Phase P has met its measured performance objective for the tested Quick Market Autopilot path and the integrated branch is repository-wide green under the recorded build host verification.

Current status:

- native Windows Quick mapping performance: **VERIFIED**;
- end-to-end operational improvement: **24.3644×**, **95.8957% time reduction** on the recorded comparable runs;
- full Go suite on merged Phase P head: **GREEN**;
- production Go build: **GREEN**;
- Rust suite / V2 worker integration: **GREEN**;
- JSONL remains canonical/auditable;
- no GPU acceleration is justified by the measured bottlenecks;
- Phase C remains frozen; Phase P closeout does not implicitly authorize C1;
- Draft PR #15 remains Draft until an explicit next integration/release decision;
- no merge to `main` is authorized.
