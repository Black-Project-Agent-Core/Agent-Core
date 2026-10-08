# Alpha 6.5.3 Analytics Benchmark Gate

This document records the benchmark policy for the Polyglot Analytics Foundation.

## Gate order

1. A real compiled Rust worker must start and report `msl-analytics/1`.
2. Go <-> Rust parity must pass at 10K observations.
3. Go <-> Rust parity must pass at 100K observations.
4. Go <-> Rust parity must pass at 1M observations.
5. Only after all parity gates pass may performance measurements be emitted.

Run:

```bash
bash scripts/benchmark-analytics.sh /path/to/msl-analytics-rust
```

or directly:

```bash
go run ./cmd/analytics-bench --worker /path/to/msl-analytics-rust --iterations 5
```

## Current environment status

At the time this source snapshot was produced, the build environment did not have `rustc`, `cargo`, or `rustup`. Therefore no Rust compilation, real cross-language parity, or Rust performance claim is recorded here yet.

The benchmark command intentionally exits non-zero with `status: blocked` when the worker is missing/unhealthy or any parity corpus fails. It does not emit a `benchmarks` field before the gate is open.

## Corpus policy

The 10K / 100K / 1M corpora are deterministic mathematical fixtures generated locally. They are test/benchmark data only and must never enter runtime market observations, UI history, or product/catalog data.
