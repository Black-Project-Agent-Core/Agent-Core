# Phase C1 Rust Ranking Parity QA

Status: **COMPLETE / VERIFIED**

This document records only evidence actually observed for Phase C1. Phase C1 is now COMPLETE / VERIFIED because the frozen Go-v0.1 behavior, Rust parity migration, Rust-mandatory production ownership, native Windows positive acceptance, native no-fallback negative acceptance, real installed Quick run, ranking persistence, credential reuse, and restart/history preservation have all been observed.

## Tested source

- Branch: `task/c1-structural-direction-rust-20260821`
- Tested source commit: `76b09d28d517e7fa61560c17ac18a5a958cb3ba4`
- Evidence timestamp: `2026-08-20T19:18:58+00:00`
- Production analytics protocol expected/verified by automated runtime tests: `msl-analytics/2`

Relevant C1 milestones in this branch:

- Task 9 real-worker parity: `078a125d2ba9f3ecaf955283427e9e30bef83d4a`
- Task 10 Rust-mandatory production ranking cutover: `be1e099795a7319c33223ca6e9ab2d6e4c428c09`
- Task 11 safe duplicate-formula cleanup: `eb5c7f9776ec530f60cac0d7128e8d1805df4bcf`
- Task 12 Windows-CI trigger for C1 branches: `e066322a9bd8be44849c5fbb50a49bbcb21ae5a2`
- Structural direction Rust ownership completion: `76b09d28d517e7fa61560c17ac18a5a958cb3ba4`

## Automated Go regression

Command:

```text
MSL_RUST_WORKER="$PWD/engines/rust/target/release/msl-analytics-rust" go test ./... -count=1
```

Actual result: **PASS**, exit code `0`.

Repository package inventory at verification time: `25` Go packages; `24` packages reported test results and one package had no test files.

Additional targeted command:

```text
MSL_RUST_WORKER="$PWD/engines/rust/target/release/msl-analytics-rust" go test ./internal/app -run 'BuildRankingsFailsWithoutBatchRuntimeAndPersistsNothing|BuildRankingsLoadsUniverseBuildsAndPersistsSnapshots|Credential|Secret|History|Integrity' -count=1
MSL_RUST_WORKER="$PWD/engines/rust/target/release/msl-analytics-rust" go test ./internal/storage ./internal/credentials ./internal/security -count=1
go vet ./...
```

Actual result: **PASS**, exit code `0`.

The no-fallback test proves that a production ranking request with a healthy Engine that does not provide the required batch runtime returns an error and appends zero fresh product/catalog ranking snapshots.

## Rust regression

Command:

```text
cargo test --manifest-path engines/rust/Cargo.toml
```

Actual result: **PASS**, exit code `0`.

Product, catalog, structural golden tests, worker wire tests, and the new structural-direction v0.1 request/result tests all passed. The current run also exercises operation ID `8` in the Analytics v2 handshake/schema and malformed-payload coverage.

## Real Go -> Rust integration evidence

The retained integration tests use `ProductionRuntime` and the real release worker, not an in-process fake Rust implementation.

Actual targeted result:

```text
MSL_RUST_WORKER="$PWD/engines/rust/target/release/msl-analytics-rust" go test ./internal/app -run 'RustRankingParityFrozenSeed|RustStructuralParityFrozenSeed' -count=1
```

Result: **PASS**.

The frozen seed checks product/catalog values through Go normalization -> `msl-analytics/2` worker -> Go assembly. Structural current-composition/weight/divergence output is checked through the real worker, and the retained integration test now also sends prior/current structural-direction inputs through real Rust operation `8` and verifies movement-stage/rising/trend/confidence output after Go assembly.

## Frozen golden fixture fingerprints

```text
product_v01_cases.json
SHA256 0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4

catalog_v01_cases.json
SHA256 95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3

structural_index_v01_cases.json
SHA256 bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea
```

## Release artifact evidence available from Codespace

Rust release command:

```text
cargo build --release --manifest-path engines/rust/Cargo.toml
```

Actual result: **PASS**, exit code `0`.

Linux release worker produced from the tested source tree:

```text
engines/rust/target/release/msl-analytics-rust
bytes: 1034568
SHA256: 03e2b526c90e8a41289f246b6b86320a6859c5cedacabb72bce5dfcbcf8f3be7
```

A non-native Windows Go-host cross-build was also produced as an additional compile check:

```text
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -o /tmp/msl-task12/Market-Signal-Lab.exe ./cmd/market-signal-lab
bytes: 13406720
SHA256: a6426bb529d743b5d0703de1c6dac1fa1a8fd9d7ed4693c3dacc1e78faa2f834
```

This cross-build is **not** counted as native Windows acceptance and is **not** the installer artifact required by the C1 completion definition.

## Native Windows C1 acceptance — COMPLETE / VERIFIED

Direct native Windows acceptance ran under `F:\Market-Signal-Lab` against exact integration source `50d0c3b3c53fe78d0c379d5809960747ff63eef8`. No generated installer, local toolchain, credential material, or runtime history was added to Git source history.

```text
version=0.3.0-alpha.6.5.3-preview.1
installerSha256=6F6C76D4567B03A98AA8574E47AE46068F21A7D080C0D3CC1393A3B983CD5E7A
appSha256=01EAEBD2D8217CD0F77713CEA30A62363E63E3ED129119A71EA960AA9C3D26A9
rustWorkerSha256=FA05F51252EF732D8BFBB266598D6E6441767522A0020AB493ACAEC6D348BA64
```

Fresh installer deployment succeeded and the installed app/worker hashes matched `version.json`. Installed health reported `healthy / rust-production / msl-analytics/2`.

The controlled invalid-worker test returned HTTP 500 from `POST /api/ranking/build`, reported the Rust runtime unavailable, created no fresh product/catalog snapshots, and therefore proved there was no production Go ranking fallback. Restoring the exact worker returned the installed app to `healthy / rust-production / msl-analytics/2` with the same worker SHA-256.

A real installed Quick Market Autopilot run then completed using the Windows Credential Manager connection:

```text
runId=d09df3ed3cc4c93f0e8f3e7a9703d89c
status=completed
workUnits=21/21
productsDiscovered=487
requestsCompleted=28
warningCount=0
errorCount=0
elapsedMs=46654
```

Native ranking persistence advanced from no files to `1461` product-snapshot rows and `210` catalog-snapshot rows. The resulting SHA-256 values were `BC0E017FD3C3891B89A240BF17D38694D6EB03A94C6B3ADADBAA3D21BB74B890` and `5FFB3F547AE4A36AF888256ED69A42F56AB9E83650A10D3638233ED86E5D858F` respectively.

After a full application stop/start with no `ENVATO_TOKEN` process override, the connection rehydrated from `credential_manager` with the same non-secret fingerprint `807E-3CE1`. The 24-file history manifest remained byte-identical with digest `A7CD9898E5A28EE02293A2227401740C9C4E567E70FE82AD45DC93F7414C6139`, and the latest run remained `d09df3ed3cc4c93f0e8f3e7a9703d89c`. This proves credential reuse without API-key re-entry and restart/history preservation for the tested native candidate.

Local ignored evidence lives under `dist/native-c1-acceptance/`.

## Production ownership state

Verified source-level contract now rejects reintroduction of these migrated production Go paths:

- `BuildProductSnapshots`
- `BuildCatalogSnapshots`
- ranking `SignedDeltaPercent`, `PercentileRanks`, `HHI`, `OptionalWeightedScore`, `DirectionFromIndex`
- structural `indexing.Build`
- structural `CappedWeights`
- structural `EqualSectorValue`
- structural `ApplyDirection`
- structural `StageForComparableRuns`

The old production Go product/catalog/statistical formula files and structural build/weighting formula files were removed. Frozen JSON fixtures and Rust golden tests are the long-term numerical oracle.

### Structural direction ownership — resolved

Commit `76b09d28d517e7fa61560c17ac18a5a958cb3ba4` adds the explicitly versioned `V2OpStructuralDirectionV01` operation ID `8` / schema `1` on the existing `msl-analytics/2` transport. Go sends only local row keys plus comparable-run/current/prior numerical evidence; Rust owns the legacy direction-stage, direction, trend-score, confidence-cap, and reason-code arithmetic. Go maps the returned codes back into the unchanged v0.1 domain snapshot contract.

The production Go `ApplyDirection` and `StageForComparableRuns` formula bodies/tests were removed. `internal/indexing/direction.go` now retains only `DirectionModelVersion` compatibility metadata. Source-ownership regression checks reject reintroduction of those formula entry points.

This resolves the former Task 11 structural-direction blocker without changing C1 semantics and without adding a second transport or a Go fallback.

## Credential and persistence evidence

Automated secure credential/security/storage regressions: **PASS**.

No secret material was added to Rust DTOs; existing normalized-DTO tests reject credential/token/API-key-shaped fields. Diff scans during the C1 tasks found no committed secret material.

Native Windows credential/history acceptance: **PASS**. The real Quick run used `effectiveSource=credential_manager`; no raw token was read or printed. After full application restart with no process-token override, the same non-secret fingerprint `807E-3CE1` was recovered, all 24 history files retained the same manifest digest `A7CD9898E5A28EE02293A2227401740C9C4E567E70FE82AD45DC93F7414C6139`, and the latest Quick run ID remained `d09df3ed3cc4c93f0e8f3e7a9703d89c`.

## C1 disposition

**PHASE C1 — COMPLETE / VERIFIED.**

Completion evidence now covers deterministic Go-v0.1 golden behavior, exact Rust product/catalog/structural parity, real Go→Rust integration, Rust-mandatory production ownership, removal of duplicate production Go formulas, native installer identity, installed Rust-v2 health, explicit no-fallback failure, worker recovery, real installed Quick mapping, product/catalog ranking persistence, Windows Credential Manager reuse, and restart/history preservation.

Native-tested integration source: `50d0c3b3c53fe78d0c379d5809960747ff63eef8`. Automated-tested product source remains `76b09d28d517e7fa61560c17ac18a5a958cb3ba4`; later source in the tested descendant is tooling/workflow/documentation integration rather than a new ranking formula boundary.

Formal product release remains **NOT RELEASED**. The separate Codespace Full Rebuild behavioral-golden acceptance remains an infrastructure follow-up and is not reinterpreted as missing C1 product evidence.

Next phase: C2 semantic correction / defensible naming. C2 must receive its own design/review/TDD plan before changing production semantics; C1 v0.1 fixtures and historical field names remain immutable compatibility evidence.
