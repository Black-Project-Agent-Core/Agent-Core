# Alpha 6.5.3 Rust Production Analytics - Release QA

> **Historical QA evidence:** results below apply to their recorded revision, environment and date. They were not rerun during the monorepo documentation refresh. See [current continuation](../checkpoints/CONTINUE_MSL.md) before treating a pending step or machine path as current.

**Date:** 2026-08-17 (UTC+7)
**Branch:** `feature/polyglot-runtime-v2`
**Verified source commit:** `47288092ef552f101a838cb391c34d80c3b3e3b3`
**Status:** **VERIFIED IMPLEMENTATION / LOCAL WINDOWS RELEASE CANDIDATE**
**Publication status:** **NOT formally released**. The application still identifies itself as `0.3.0-alpha.6.5.3-preview.1`; formal version publication is a separate decision.

## Architecture acceptance - PASS

```text
Go     = Windows application/control plane
Rust   = mandatory production analytics for migrated calculations
Python = future offline Quant Research Lab
C++    = future conditional accelerator only after profiling evidence
```

Verified source no longer contains the production Go analytics engine, Shadow Verification runtime, Go analytics fallback, or user-selectable analytics engine mode. Rust unavailability is explicit and blocks publication of new derived analytics instead of silently substituting a Go result.

Runtime legacy demo/purge controls are removed. Legacy synthetic cleanup is a one-time internal migration and real observations/research are preserved.

## Rust production evidence

Initial production gate on Windows:

```text
rustc: 1.97.1
cargo: 1.97.1
toolchain: stable-x86_64-pc-windows-gnu
cargo test: 12 passed / 0 failed
cargo clippy -- -D warnings: PASS
cargo build --release: PASS
initial verified worker SHA-256:
1B74CB768E396DCDC30C5BA9232A6788CA4F65B17A60B0FF2C3C3A77EB790D48
```

A later verified release rebuild produced the current worker identity. The Rust source remained identical to the verified baseline and the rebuilt worker re-passed frozen reference and large-corpus parity.

```text
current verified worker SHA-256:
5E217FC5AD6508AB1EB5FBB0F4FF98A17A7B74EBFCA2105115570611DA368870
protocol: msl-analytics/1
engine version: 0.1.0
```

## Final Windows verification - PASS

The Windows resume gate successfully proved the repaired final source and packaged pair.

```text
Windows legacy cleanup regression          PASS
Windows full Go regression                 PASS
staged diff check                          PASS
frozen Alpha 6.5.2.1 Rust parity           PASS
production forbidden-token scan            PASS
Windows GUI build                          PASS
packaged worker deterministic smoke         PASS
packaged application + Rust health smoke    PASS
RESULT                                      PASS
```

### Frozen reference and deterministic parity

Operations verified:

```text
distribution_similarity
item_volatility
cluster_volatility
selection_probability
```

| Corpus | Max delta | Mismatches | Worker errors | Verified |
|---:|---:|---:|---:|---|
| 10,000 | 0 | 0 | 0 | true |
| 100,000 | 0 | 0 | 0 | true |
| 1,000,000 | 0 | 0 | 0 | true |

The reference in the post-cutover parity harness is explicitly test-only (`go-reference-test-only`), not a production fallback.

### Final package identities

```text
Market Signal Lab.exe
SHA-256: F6F507C2FD264DF49D17F65FCDDE7D7AED763D0248CECBEB04232E07413FF9FC

msl-analytics-rust.exe
SHA-256: 5E217FC5AD6508AB1EB5FBB0F4FF98A17A7B74EBFCA2105115570611DA368870
```

Verified local package path:

```text
F:\Chrome-Isolated\Downloads\Trends&Insights\Market-Signal-Lab\dist\alpha6.5.3-rust-production-windows-final\Market Signal Lab
```

The packaged Rust worker hash exactly matched the current verified worker and one deterministic operation passed through the packaged worker. The packaged application exposed healthy Go application-host and Rust production-analytics component health.

Large executables remain local/release artifacts rather than Git history.

## Windows cleanup repair - PASS

The one-time legacy synthetic cleanup originally exposed a Windows file-handle replacement defect. Final source explicitly closes the input JSONL before replacing it with the rewritten temporary file. Windows regression then passed:

```text
TestLegacySyntheticCleanupMigrationRemovesDemoAndKeepsRealRows PASS
TestLegacySyntheticCleanupMigrationRunsOnlyOnce                PASS
TestLegacySyntheticCleanupPreservesExactRealResearch           PASS
```

## Full Go/source regression

The final repaired source passed full Windows Go regression. A separate assistant-side reconstruction of the final source also passed:

```text
go test ./... -count=1              PASS
go vet ./...                        PASS
JavaScript syntax checks            PASS
EN/ID localization targeted gates   PASS
responsive/localization gates       PASS
forbidden runtime source scan       PASS
credential-assignment fixture scan  PASS
```

Earlier race/responsive verification for the cutover also passed, including targeted Go race gates and 1366x768 EN/ID responsive QA with no horizontal overflow or clipped primary controls.

## Production source contract - PASS

Verified remote source structure:

```text
ABSENT from production:
internal/analyticsengine/go_engine.go
internal/analyticsengine/shadow_engine.go
internal/analyticsengine/registry.go
internal/analyticsengine/circuit_breaker.go

PRESENT as non-production evidence only:
internal/analyticsengine/reference_engine_test.go
cmd/analytics-bench/reference_engine.go  // analyticsbench build tag only
```

Normal Service construction uses `ProductionRuntime`, and its production identity is `rust-production`. Market Autopilot checks Rust readiness before starting analytics-dependent mapping and before publishing derived completion. If Rust fails mid-run, raw normalized observations may remain while derived completed analytics are withheld.

Settings exposes factual component health instead of an analytics-engine selector:

```text
Application Host      Go
Production Analytics  Rust
Quant Research Lab    Python / not configured
Native Accelerator    C++ / not required
```

## Benchmark evidence - PASS as measurement, no speedup claim

The benchmark was allowed only after parity passed. Five iterations per corpus size:

| Engine | Observations | Median us | P95 us | Throughput obs/s |
|---|---:|---:|---:|---:|
| Go benchmark reference | 10,000 | 525 | 537 | 19,015,021.87 |
| Rust worker | 10,000 | 22,643 | 23,200 | 441,637.59 |
| Go benchmark reference | 100,000 | 539 | 557 | 185,528,756.96 |
| Rust worker | 100,000 | 200,500 | 200,969 | 498,752.12 |
| Go benchmark reference | 1,000,000 | 2,001 | 2,023 | 499,700,179.89 |
| Rust worker | 1,000,000 | 2,037,740 | 2,085,432 | 490,739.69 |

**Known limitation:** current process-boundary NDJSON/JSON transport is significantly slower than the in-process benchmark reference. The 1M analytical payload is roughly 29.6 MB, so serialization, pipe transfer, parsing, and allocation dominate this benchmark.

This is **not** an end-to-end Market Autopilot speedup claim. Scanner/network/API time is separate. The evidence creates an IPC optimization target; it does not justify restoring a production Go analytics fallback.

## Remote recovery verification - PASS

The verified source commit was pushed successfully to `feature/polyglot-runtime-v2`, and the remote tree was independently fetched and inspected. The full source tree, Browser Companion, Rust source/Cargo.lock, test-only references, locale files, QA, plans, and verification scripts are recoverable from GitHub.

Repository exclusions keep local build targets, verification logs, `dist/`, credentials, sessions, and real local history outside Git history.

## Known state / release boundary

- Implementation and local Windows packaging are verified.
- The package is usable locally as a verified build candidate.
- No formal GitHub Release has been created.
- `main` has not been merged as part of this verification.
- Version string still reads `0.3.0-alpha.6.5.3-preview.1`.
- A version bump/publication/merge must be treated as a separate explicitly approved release step.

## Next technical gate

Continue with a reviewed Phase C TDD plan for **Rust Ranking & Signal Expansion**. Before or alongside payload-heavy migration, add an **IPC Optimization Gate** to profile and reduce serialization/transport overhead. Do not introduce Python or C++ before their roadmap phases/evidence gates.
