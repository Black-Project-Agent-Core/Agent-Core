# MSL Phase P — Market Mapping Performance & Runtime Efficiency

**Status:** APPROVED FOR EXECUTION
**Date:** 2026-08-18
**Branch:** `feature/market-mapping-performance-phase-p-20260818`
**Base:** `feature/secure-envato-credential-runtime-resume-20260818` @ `46216a1dc772c646dffabfd588c2571b60b395ba`

## Purpose

Phase P temporarily supersedes production work on Phase C1–C3. Phase C0 remains complete and preserved; no Signal Truth decisions are discarded.

The goal is to make Market Autopilot mapping scale with observed history instead of becoming progressively slower as append-only ledgers grow.

## Non-negotiable guardrails

- JSONL remains the canonical, append-only, auditable history.
- Any index/cache is an accelerator only and must be rebuildable from JSONL.
- No market formula, score meaning, ranking semantics, signal semantics, credential boundary, or Rust production contract may change in Phase P1.
- No GPU work is authorized until profiling shows a suitable numerical hotspot after storage/algorithmic inefficiencies are removed.
- No speedup claim without repeatable benchmark evidence.
- Do not merge `main` silently and do not commit generated runtime data or binaries.
## Performance Truth Audit — observed baseline

A real Quick Market Autopilot run was observed directly on Windows:

- Run ID: `cc3d55ae080e60fd7348ea7dadc39496`.
- 28/28 planned Envato requests completed before the long local post-processing phase.
- 485 products were discovered.
- Progress reached 76.2% / 16 of 21 work units and then remained there while local finalization continued.
- Runtime heartbeat continued updating with zero warnings and zero errors.
- Go host remained CPU-active; Rust worker was idle during the observed finalization interval.
- `score_provenance.jsonl` grew from roughly 65 MB to more than 71 MB during the same run.
- The long phase is therefore not explained by Envato network latency alone.

The UI also exposes a granularity problem: taxonomy segmentation, signal quality audit, and ranking/consensus are marked running together around one large `finalizeAlpha65Outputs()` call, so useful internal progress is hidden.

## Root cause #1 — repeated full-ledger uniqueness scans

`AppendScoreProvenance()` currently calls `ScoreProvenances(ID)` before every append. That call scans and JSON-unmarshals the complete `score_provenance.jsonl` ledger.

The same pattern exists for data-quality assessments, market-index snapshots, legacy reviews, and several consensus unique-record append paths.

For `N` new rows and history size `H`, the duplicate check behaves approximately like `O(N × H)` ledger work instead of one history scan plus `O(1)` membership checks.
## Phase P1 architecture — rebuildable ledger ID index

Each high-volume unique ledger gets a process-local ID index owned by `storage.Store`.

The index is built lazily from the canonical JSONL ledger on first use. The scan decodes only the record ID needed for membership, not the full domain object.

The index stores:

- ledger filename;
- set of known IDs;
- observed ledger byte size after the last successful synchronization.

Before using a cached index, storage compares the current file size with the observed size. An unexpected size change invalidates and rebuilds the index from JSONL. This keeps external/manual append scenarios safe without making the accelerator authoritative.

After a successful application append, the in-memory IDs and observed byte size are updated. If writing or flushing fails, the index is invalidated so the next operation rebuilds from canonical history.

Existing single-row append APIs remain valid and become wrappers around the optimized path; callers are not forced to change atomically.

## Phase P1 batch persistence

High-volume finalization must not open, scan, marshal, and close a ledger independently for every row.

Add batch APIs for integrity outputs already accumulated in memory:

- `AppendDataQualityAssessments([]domain.DataQualityAssessment) error`
- `AppendMarketIndexSnapshots([]domain.MarketIndexSnapshot) error`
- `AppendScoreProvenances([]domain.ScoreProvenance) error`

The batch path performs one index synchronization, deduplicates candidates in memory, opens the ledger once, writes all new JSONL rows through a buffered writer, flushes once, and updates the accelerator only after successful persistence.
## Phase P2 — broaden batching without semantic change

After P1 benchmarks prove the hot path improvement, apply the same open-once batch write primitive to append-only ranking outputs that do not require uniqueness scans:

- product snapshots;
- catalog snapshots;
- product-direction clusters;
- classification reviews;
- production insights;
- saturation alerts.

P2 is about I/O amortization only. Record contents, ordering requirements, IDs, and append-only history semantics stay unchanged.

## Phase P3 — truthful fine-grained progress

Do not invent progress percentages from elapsed time. Instrument actual completed work inside finalization.

Keep the existing canonical scan stages for compatibility, but add factual detail events/counters for operations such as:

- build ranking 7D;
- build ranking 30D;
- build ranking 90D;
- quality rows prepared;
- provenance rows prepared;
- provenance rows persisted;
- product snapshots persisted;
- catalog snapshots persisted;
- final lifecycle/history publication.

ETA may use these factual counters only after enough runtime evidence exists. Low-confidence ETA must remain visibly low-confidence.

## Phase P4 — persistent accelerator gate

Do not add SQLite or a sidecar index by default. First benchmark P1/P2 with the process-local rebuildable index.

A persistent sidecar/SQLite accelerator becomes eligible only if startup/rebuild cost or cross-process lookup remains materially significant after P1/P2. If introduced, deleting the accelerator must never lose canonical history; it must be fully reconstructible from JSONL.
## Phase P5 — compute profiling and GPU gate

After storage and persistence complexity are corrected, profile the remaining local runtime separately for taxonomy, ranking, consensus, and lifecycle work.

Prefer algorithmic fixes, Rust CPU parallelism, allocation reduction, and SIMD before GPU work. GPU acceleration is allowed only when measurements show a large, parallel numerical kernel whose transfer/setup cost is justified.

## Correctness and concurrency invariants

- Duplicate IDs must never be appended by the optimized unique-ledger path.
- Existing duplicate rows in historical JSONL are not rewritten or deleted by Phase P.
- Concurrent callers must observe a coherent ID index and serialized append behavior.
- Unexpected external ledger growth invalidates the cached index before the next unique append.
- Empty batches are no-ops.
- Batch order is deterministic and preserves caller order for rows that are actually appended.
- A failed write/flush must not leave the accelerator claiming IDs that are not durably represented in canonical JSONL.

## Benchmark and acceptance evidence

P1 requires the same deterministic benchmark corpus before and after implementation. The benchmark must include a non-trivial pre-existing ledger and a batch containing both new and duplicate IDs.

Required evidence:

1. behavioral tests proving duplicate suppression, rebuild after external growth, single-row compatibility, and failure invalidation;
2. benchmark numbers for the old per-row full-scan path and the new batch/index path using the same machine and corpus;
3. storage package regression tests;
4. targeted app/finalization tests where the repository interface changes;
5. a native Windows Quick mapping observation after integration, without claiming a speedup until the run reaches a terminal state.

Full-Go baseline currently contains unrelated pre-existing compile failures in `internal/app` and `internal/web`; Phase P must not silently fix or attribute those failures to performance work.

## Phase C relationship

Phase C1–C3 are frozen until Phase P establishes an efficient mapping baseline. C0 remains the canonical signal constitution and will resume unchanged unless a later explicit design review finds a genuine contradiction.
