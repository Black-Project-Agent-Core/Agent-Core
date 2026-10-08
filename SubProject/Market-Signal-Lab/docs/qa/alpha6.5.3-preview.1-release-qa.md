# Market Signal Lab Alpha 6.5.3 Preview.1 — QA Report

**Status:** TEST / PRE-RELEASE BUILD  
**Runtime identity:** `0.3.0-alpha.6.5.3-preview.1`  
**Branch:** `feature/alpha6.5.3-polyglot`

## Purpose

Preview.1 lets the user test the Alpha 6.5.3 Go-side architecture and Settings diagnostics before the Rust verification gate is available in the build environment.

This build does **not** claim that Alpha 6.5.3 is released.

## Source baseline

The user supplied the complete Alpha 6.5.2.1 source archive used as the recovery baseline.

```text
Alpha 6.5.2.1 source SHA-256
b55b1fab30329c8aedcc6e066d62d424696b6c5967bfcafe46fb9267697f7bd7
```

The source hash matched the supplied release manifest. Before Alpha 6.5.3 changes, fresh `go test ./... -count=1` and `go vet ./...` passed.

## Preview implementation verified

- engine-neutral analytics contract;
- Go Native reference engine;
- Rust source tree and NDJSON protocol source;
- long-lived isolated worker client;
- Rust Native adapter with Go fallback;
- Shadow Verification with Go authoritative output;
- circuit breaker;
- mode-only local configuration;
- consensus engine injection path;
- Compute Engine Settings/API/UI;
- diagnostics including Rust verification state;
- English/Indonesia exact locale parity;
- deterministic 10K/100K/1M parity corpus source;
- benchmark gate refusing performance output until real Rust parity passes;
- bounded 64 MiB worker-line guard sized to carry the 1M deterministic corpus.

## Fresh verification

```text
go test ./... -count=1
PASS

go test -race ./internal/analyticsengine ./internal/consensus ./internal/web -count=1
PASS

go test -race ./internal/app -run 'TestServiceDefaultsToGoAnalyticsEngine|TestServiceSetAnalyticsEngineModePersistsModeOnly|TestConsensusServiceUsesInjectedAnalyticsEngine' -count=1
PASS

go vet ./...
PASS

All internal/web/assets/js/*.js via node --check
PASS

bash scripts/consensus-check.sh
PASS

bash scripts/telemetry-responsive-check.sh
PASS — 14/14 viewport×locale screenshots; body horizontal overflow 0/14; clipped primary controls 0/14

Locale parity
English 937 = Indonesia 937
PASS
```

### Extracted-source retest

The final Preview.1 source archive was extracted into a clean temporary directory and re-verified:

```text
go test ./... -count=1
PASS

go vet ./...
PASS

All embedded JavaScript via node --check
PASS
```

## Runtime smoke

Local runtime responded with:

```text
version:       0.3.0-alpha.6.5.3-preview.1
engine mode:   go-native
Go health:     healthy
Rust health:   unavailable
protocol:      msl-analytics/1
circuit state: closed
fallbacks:     0
rustVerified:  false
```

`Run Diagnostics` with the worker absent kept `rustVerified:false`. No fake parity result was published.

## Flaky-test repair discovered during package retest

The first extracted-source retest exposed an asynchronous web-test lifecycle race: the test TempDir could be removed while the background Autopilot fixture run was still persisting history.

The production runtime was not changed for this issue. The web test was corrected to wait for the run to reach a terminal state before test cleanup. The targeted regression test was then run 25 consecutive times and passed all 25 runs.

## Windows preview package

Go host cross-build:

```text
PE32+ executable (GUI) x86-64, for MS Windows
```

The package contains:

```text
Market Signal Lab.exe
browser-companion/
README.md
PREVIEW_STATUS.md
engines/rust/README.md
```

It deliberately does **not** contain a fabricated `msl-analytics-rust.exe`.

## Rust gate — still blocked

This environment has no `rustc`, `cargo`, or `rustup`.

Not yet verified:

- Cargo tests;
- clippy;
- real Rust worker compilation;
- Windows Rust worker;
- Go <-> Rust parity 10K / 100K / 1M;
- Rust performance benchmark.

Therefore Preview.1 remains a test/pre-release build and the final Alpha 6.5.3 release gate remains closed.
