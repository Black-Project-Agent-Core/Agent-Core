# MSL Analytics v2 Task 7 — Verified Usable Development Baseline

**Date:** 2026-08-18 (UTC+7)\
**Repository:** `rendevouz999/Market-Signal-Lab`\
**Branch:** `feature/analytics-v2-ipc`\
**Exact verified source SHA:** `e451846f0a0540b1fb75dca8d18c2239ae7449b6`\
**Status:** Task 7 COMPLETE / VERIFIED for the usable development baseline\
**Formal release status:** NOT released. Tasks 8–12 remain deferred hardening/release work.

## Permanent project guardrail — verbatim

> hal yang perlu di luruskan untuk alat yang kita bangun bukan untuk melakukan hal ilegal atau hacking web, melainkan hanya menganalisa arah market, membaca algoritma market, untuk mengetahui katalog, produk, dan nama pemilik produknya bukan berarti meng-hack orang tersebut melainkan melihat insight baru dan mengikuti alur trends, setiap katalog yang sedang hype di masukan ke daftar ranking Trends Katalog, dan produk apa yang bagus menjadi Insight agar aku tidak salah membuat produk, bukan bermaksud mencuri ide produk melainkan untuk bersaing tentang kualitas dan mengukur kualitas antara produkku dan orang lain.

Scope remains lawful **Market Trends & Insights / Observed Market intelligence only**.

## Architecture boundary preserved

```text
Go     = application/control plane
Rust   = sole production analytics implementation for migrated kernels
Python = future offline Quant Research / Calibration Lab
C++    = optional accelerator only after profiling evidence
```

No Go analytics fallback, Shadow runtime selector, v1 retry fallback, synthetic market data, or credential-bearing Rust payload was introduced.

## What Task 6 + Task 7 now provide

The usable analytics-v2 baseline now has:

- mandatory `msl-analytics/2` handshake before analytical frames;
- four required operation/schema capability validation;
- long-lived Rust worker lifetime decoupled from startup context;
- one IPC-owner goroutine;
- one active analytical frame + at most two waiting jobs;
- waiting jobs remain typed/unencoded until active;
- context-aware admission;
- waiting cancellation that never reaches the worker;
- active caller cancellation with drain/discard and no ordinary worker kill;
- hard watchdog/crash/malformed/wrong-request-id cleanup;
- automatic restart + mandatory re-handshake after hard failure;
- cached non-blocking `Health()` / `Metrics()`;
- oversized reuse buffers above 64 MiB dropped;
- stable `Engine` business API routed through Protocol V2 one-op batches;
- internal four-operation execution through one v2 request frame;
- real Rust Protocol V2 integration verified against the compiled worker;
- existing Market Autopilot Rust-unavailable behavior remains fail-closed.

## Regression evidence discovered during native/full-checkout verification

build host Gate A exposed pre-existing corruption in `internal/analyticsengine/schema_v2_test.go` originating from the earlier Task 2 schema commit. This was genuine regression evidence, so the completed-task no-repeat rule allowed a focused repair.

The repair commit is:

```text
e451846f0a0540b1fb75dca8d18c2239ae7449b6
message: test: repair analytics v2 golden regression fixtures
```

Only test fixture syntax/identifiers/golden literals were repaired:

- `kluster` -> `cluster`;
- `kesulif` -> `selection`;
- invalid `[\V2EncodedOperation` -> `[]V2EncodedOperation`;
- three corrupted golden hex literals replaced with canonical schema bytes.

No production encoder, decoder, analytical formula, Rust kernel, or Task 1–5 protocol semantics were changed by this repair.

## Fresh build host evidence on exact source SHA

Toolchains:

```text
Go    go1.26.4 linux/amd64
Cargo 1.97.1
rustc 1.97.1
```

### Gate A — full Go Task 7 packages without native worker env

Command:

```bash
unset MSL_RUST_WORKER
go test ./internal/analyticsengine ./internal/app -count=1 -v
```

Result:

```text
internal/analyticsengine: PASS
internal/app:             PASS
real-Rust gated tests:    SKIP only because MSL_RUST_WORKER was intentionally unset
```

Observed package timings in the final green run:

```text
marketsignallab/internal/analyticsengine  9.992s
marketsignallab/internal/app              18.776s
```

The 1M encoded request regression check reported:

```text
1M encoded request bytes = 8,168,608
```

which remains well below the 64 MiB target.

### Rust release worker build used for Gate B

Command:

```bash
cargo build --manifest-path ./engines/rust/Cargo.toml --release
```

Result:

```text
Finished `release` profile [optimized]
```

build host worker path:

```text
/workspaces/Market-Signal-Lab/engines/rust/target/release/msl-analytics-rust
```

Worker SHA-256 recorded before Gate B:

```text
698a2b880ebfdafaf96c9af9fd2aff1f48adcb3ae7c01e878d60d5e96f91bad2
```

The final source commit after the worker build changed only Go test fixtures, not Rust source.

### Gate B — focused real Rust Protocol V2 integration

Command:

```bash
export MSL_RUST_WORKER="$(realpath ./engines/rust/target/release/msl-analytics-rust)"
go test ./internal/analyticsengine \
  -run '^(TestRustV2RealWorkerIntegration|TestRustReferenceVectorParity)$' \
  -count=1 -v
```

Result:

```text
TestRustReferenceVectorParity     PASS
TestRustV2RealWorkerIntegration  PASS
package                           PASS
elapsed                           0.018s
```

Reference-vector parity passed for:

- distribution: identical, disjoint, normalized-weight invariance, empty-positive-mass;
- item volatility: stable fixture, missing-rank Top-K normalization, all-missing ranks;
- cluster volatility: stable fixture, maximum disagreement without shares;
- selection probability: weighted selection, all eligible not selected, empty/zero/negative invalid inputs.

There was no protocol mismatch and no worker-unavailable error.

### Final race / vet / diff hygiene

Commands:

```bash
unset MSL_RUST_WORKER
go test -race ./internal/analyticsengine -count=1
go vet ./...
git diff --check
git status --short
git rev-parse HEAD
```

Result:

```text
go test -race ./internal/analyticsengine -> PASS, 13.124s
go vet ./...                            -> no output / PASS
git diff --check                       -> no output / PASS
git status --short                     -> ?? .vscode/ only
git rev-parse HEAD                     -> e451846f0a0540b1fb75dca8d18c2239ae7449b6
```

`.vscode/` remained local/untracked and was not committed.

## Task status after this checkpoint

```text
Task 1  Freeze v2 wire constants + shared golden vectors          COMPLETE / VERIFIED
Task 2  Go typed columnar schema codec                            COMPLETE / VERIFIED
Task 3  Safe Rust v2 frame/schema codec                           COMPLETE / VERIFIED
Task 4  Allocation-light Rust view kernels                       COMPLETE / VERIFIED
Task 5  Rust handshake + batch executor + binary worker loop      COMPLETE / VERIFIED
Task 6  Go v2 fake worker + bounded single-flight client          COMPLETE / VERIFIED
Task 7  Stable Engine API -> v2 integration                       COMPLETE / VERIFIED
Task 8  Factual v2 diagnostics/UI                                 DEFERRED / NON-BLOCKING
Task 9  Batch parity + end-to-end performance gate                DEFERRED / NON-BLOCKING
Task 10 Hard cut remaining v1 production transport                DEFERRED / NON-BLOCKING FOR FEATURE DEVELOPMENT
Task 11 Security/fuzz/race/full regression                        DEFERRED / NON-BLOCKING
Task 12 Native Windows correctness/performance/package evidence   DEFERRED / RELEASE-BLOCKING LATER
```

The user explicitly chose this scheduling. Tasks 8–12 are not deleted; they remain the later diagnostics/performance/hard-cut/security/Windows-release track.

## Explicit non-claims / deferred facts

This checkpoint does **not** claim:

- final release readiness;
- Windows packaged-worker verification;
- the Task 9 10K/100K/1M end-to-end performance gate;
- removal of every legacy v1 source file;
- Task 8 UI diagnostics migration.

Therefore:

- legacy v1 transport source may still exist until deferred Task 10;
- top-level diagnostics may still expose the old protocol label until deferred Task 8;
- no speedup claim should be published yet;
- `main` remains untouched unless the user explicitly approves a later integration/release step.

## Usability boundary reached

The purpose of completing Task 6 + Task 7 was to create a stable enough analytics-v2 baseline to resume the product's primary direction. That boundary is now verified.

The canonical master roadmap defines the next product-development phase as:

```text
PHASE C — Rust Ranking & Signal Expansion
```

Candidate Phase C ownership includes:

- Product Exposure Score;
- Catalog Trend numeric components;
- Product Opportunity numeric components;
- Market Breadth;
- Relative Strength;
- Supply Velocity;
- Competition Acceleration;
- Author Concentration;
- Volume-Weighted / Equal-Sector index aggregation;
- index divergence calculation.

The roadmap also requires a **phase-specific design/TDD plan before Phase C production code is changed**.

## Next Exact Action

Do **not** start IPC Tasks 8–12 automatically.

Return to primary **Market Trends & Insights** development by drafting/reviewing the dedicated **Phase C — Rust Ranking & Signal Expansion** design and TDD implementation plan from the verified analytics-v2 baseline. Only after that plan is reviewed should a Phase C implementation branch/task sequence begin.
