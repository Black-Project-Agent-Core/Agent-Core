# Alpha 6.5.3 Rust Production Analytics Benchmark Evidence

> **Historical QA evidence:** results below apply to their recorded revision, environment and date. They were not rerun during the monorepo documentation refresh. See [current continuation](../checkpoints/CONTINUE_MSL.md) before treating a pending step or machine path as current.

**Date:** 2026-08-17 (UTC+7)  
**Branch:** `feature/polyglot-runtime-v2`  
**Status:** Task 13 benchmark gate PASS; Alpha 6.5.3 is still NOT released.

## Verified worker

```text
Worker: engines/rust/target/release/msl-analytics-rust.exe
WorkerBytes: 1,585,587
WorkerSHA256: 1B74CB768E396DCDC30C5BA9232A6788CA4F65B17A60B0FF2C3C3A77EB790D48
Protocol: msl-analytics/1
Engine version: 0.1.0
Health: healthy
Rust startup: 6,296 microseconds
Benchmark iterations: 5
```

## Parity prerequisite

The benchmark was allowed to run only after the same real worker re-passed deterministic parity at 10K, 100K, and 1M observations.

For all three corpus sizes:

```text
maxDelta = 0
mismatchCount = 0
workerErrorCount = 0
verified = true
```

The four checked operations were:

```text
distribution_similarity
item_volatility
cluster_volatility
selection_probability
```

## Measurements

| Engine | Observations | Median us | P95 us | Throughput observations/s |
|---|---:|---:|---:|---:|
| Go reference | 10,000 | 525 | 537 | 19,015,021.87 |
| Rust worker | 10,000 | 22,643 | 23,200 | 441,637.59 |
| Go reference | 100,000 | 539 | 557 | 185,528,756.96 |
| Rust worker | 100,000 | 200,500 | 200,969 | 498,752.12 |
| Go reference | 1,000,000 | 2,001 | 2,023 | 499,700,179.89 |
| Rust worker | 1,000,000 | 2,037,740 | 2,085,432 | 490,739.69 |

## Interpretation

The current Rust worker is **numerically verified but not faster than the in-process Go reference in this benchmark**. This benchmark crosses a process boundary and serializes the analytical request through newline-delimited JSON, while the Go reference executes in-process. At the 1M corpus the selection payload alone is about 29.6 MB, so serialization, pipe transfer, parsing, and result transport dominate this benchmark.

This evidence must NOT be represented as a Market Autopilot end-to-end speedup. The benchmark measures only this analytical execution path and its current IPC contract. Scanner/network/API latency is outside this measurement.

The result does not change the approved production ownership contract:

```text
Go   = application/control plane
Rust = sole production implementation for migrated analytics
```

No Go analytics fallback is reintroduced. The performance evidence instead creates a later optimization target: reduce cross-process payload volume and serialization overhead, batch/aggregate normalized analytical inputs more efficiently, and profile before considering a different transport or any native accelerator.

## Evidence provenance

Evidence was produced on the user's isolated Windows environment on drive `F:` using portable Go and the locally compiled Rust GNU worker. The raw user-provided evidence files were:

```text
MSL_Rust_Production_Gate.txt
MSL_Rust_Parity_Gate.txt
MSL_Rust_Benchmark_Gate.txt
MSL_Rust_Benchmark_Evidence.json
```

These raw local logs are not required runtime inputs and must never contain or be combined with Envato credentials, browser sessions, or local MSL market-history data.
