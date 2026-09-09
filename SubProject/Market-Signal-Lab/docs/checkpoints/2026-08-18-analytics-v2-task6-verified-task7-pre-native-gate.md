# Market Signal Lab — Analytics v2 Task 6 Verified / Task 7 Pre-Native Gate

**Date:** 2026-08-18 (UTC+7)  
**Repository:** `rendevouz999/Market-Signal-Lab`  
**Branch:** `feature/analytics-v2-ipc`  
**Source head before this evidence document:** `f7d0b3929a55ac625d5d0ddaeeeb30ca27176eea`  
**Protocol target:** `msl-analytics/2`

## Why this checkpoint exists

This checkpoint records the first usable-development cut of the Analytics v2 IPC work after Tasks 1–5 were frozen as COMPLETE/VERIFIED.

The user explicitly chose to **defer Tasks 8–12** so Market Signal Lab can return to feature development after Task 6 + Task 7. Tasks 8–12 are not deleted; they remain future diagnostics, benchmark, hard-cut, security/hardening, and native Windows release evidence work. They are not blockers for resuming Market Trends & Insights feature development once the remaining real-Rust Task 7 gate passes.

## Locked project constraints retained

- Go remains application/control plane.
- Rust remains the sole production analytics implementation for migrated kernels.
- No Go analytics fallback is introduced.
- No user-selectable Go/Rust/Shadow mode is introduced.
- No synthetic runtime market data is introduced.
- No fake progress/ETA/probability/performance claims are introduced.
- No incomplete analytics work is merged to `main` by this checkpoint.

## Task 6 — COMPLETE / GO-SIDE VERIFIED

Task 6 source now exists on `feature/analytics-v2-ipc`:

```text
internal/analyticsengine/batch.go
internal/analyticsengine/batch_test.go
internal/analyticsengine/rust_client_v2.go
internal/analyticsengine/rust_client_v2_test.go
internal/analyticsengine/testdata/fake_worker_v2.go
```

Implemented/verified contracts:

```text
mandatory Protocol V2 handshake before healthy
required four operation/schema capabilities checked
startup context does not own long-lived worker lifetime
one IPC-owner goroutine
1 active request + max 2 waiting jobs
waiting jobs retain typed inputs/small metadata and are encoded only when active
context-aware queue admission
canceled waiting job never reaches worker
active caller cancellation returns to caller but response is drained/discarded
ordinary active cancellation does not kill/restart worker
hard watchdog failure marks timed_out and restarts before next job
worker exit marks crashed and restarts before next job
malformed response marks invalid_result and restarts before next job
wrong RequestID marks invalid_result and restarts before next job
restart performs mandatory handshake again
cached Health()/Metrics() remain responsive during slow active batch
buffers with capacity >64 MiB are not retained in normal reuse pool
operation descriptor order is preserved
```

TDD evidence included explicit RED before GREEN for handshake, bounded queue, waiting cancellation, active cancellation/drain, hard failure restart, exit classification, and oversized-buffer retention.

A real race was found during verification: `Close()` could mutate lifecycle-channel fields while the IPC owner goroutine read them. The root fix was to pass immutable channel locals into the owner loop. Race verification passed after this correction.

## Task 7 — IMPLEMENTED / FAKE-V2 VERIFIED / REAL-RUST GATE PENDING

Implemented source changes:

```text
internal/analyticsengine/batch.go
internal/analyticsengine/rust_engine.go
internal/analyticsengine/rust_engine_test.go
internal/analyticsengine/runtime.go
internal/analyticsengine/runtime_test.go
internal/analyticsengine/rust_v2_integration_test.go
internal/analyticsengine/testdata/fake_worker_v2.go
```

Implemented contracts:

- transport-neutral `BatchExecutor` exists;
- `RustEngine` production adapter now owns `RustV2Client` instead of legacy `RustClient`;
- existing `Engine` business method signatures remain unchanged;
- each business method routes through a one-operation Analytics v2 batch and decodes the canonical typed v2 result payload;
- internal four-operation batch path sends one request frame with four descriptors;
- production runtime unavailable/health identity reports `ProtocolV2`;
- Rust-unavailable behavior remains fail-closed; no Go fallback was added;
- a gated real-worker integration test is present and activates only when `MSL_RUST_WORKER` is set.

Legacy v1 transport source/tests intentionally still exist because the user deferred Task 10 hard-cut/removal. Production `RustEngine` no longer uses that legacy client, but deleting all v1 source is still future Task 10 work.

## Fresh assistant-environment verification

The assistant environment has no direct Git checkout/network path to the private repository and no Rust toolchain. A package snapshot was reconstructed from branch source required for Task 6/7 and aligned with the repository's actual `Engine` and `ProductionRuntime` contracts before the final run.

Fresh final commands/results:

```text
go test ./internal/analyticsengine -count=1 -v
  -> PASS
  -> all Task 6 / fake-v2 Task 7 tests PASS
  -> TestRustV2RealWorkerIntegration SKIP: MSL_RUST_WORKER is not set

go test -race ./internal/analyticsengine -count=1
  -> PASS

go vet ./...
  -> PASS / no output
```

GitHub Actions evidence is unavailable for this branch because the repository currently reports no workflow runs for `feature/analytics-v2-ipc`.

Rust-native execution could not be reproduced in the assistant environment because `rustc`, `cargo`, and `MSL_RUST_WORKER` are unavailable there.

## Remaining Task 7 gate — ONE NATIVE COMMAND

Task 7 must **not** be labeled fully COMPLETE/VERIFIED until the real Task 5 Rust worker executes the new v2 client/business adapter on the current source branch.

From the repository root on the user's Windows machine, with the Task 5 release worker built, run:

```powershell
$env:MSL_RUST_WORKER = (Resolve-Path .\engines\rust\target\release\msl-analytics-rust.exe).Path
go test .\internal\analyticsengine -run 'TestRustV2RealWorkerIntegration|TestRustReferenceVectorParity' -count=1
```

If the worker path differs, set `MSL_RUST_WORKER` to the exact verified Task 5 worker path instead; do not rebuild/replace the verified Task 5 worker merely to make the test pass unless a genuine regression is proven.

Expected gate:

```text
PASS: TestRustV2RealWorkerIntegration
PASS: existing real Rust reference-vector parity tests selected by the command
no protocol mismatch
no worker unavailable error
```

If this gate fails, investigate the exact current-branch integration failure through TDD. Do not reopen Tasks 1–5 without concrete regression evidence.

## Scheduling decision — Tasks 8–12 DEFERRED

```text
Task 8  v2 transport diagnostics/UI                         DEFERRED / NON-BLOCKING
Task 9  batch parity + end-to-end performance benchmark     DEFERRED / NON-BLOCKING
Task 10 hard-remove v1 production transport                 DEFERRED / NON-BLOCKING FOR FEATURE DEV
Task 11 security/fuzz/race/full hardening                   DEFERRED / NON-BLOCKING
Task 12 native Windows release/performance/package gate     DEFERRED / RELEASE-BLOCKING LATER
```

This does **not** mean Tasks 8–12 are unnecessary for a final hardened release. It means they do not block the next development phase requested by the user.

## Next exact action

1. Run the single native Task 7 command above.
2. If green, update `CURRENT_MSL_CHECKPOINT.md`: Task 7 -> COMPLETE/VERIFIED.
3. Then resume primary Market Trends & Insights feature development from the product checkpoint/plan, while keeping Tasks 8–12 in a deferred hardening track.
4. Do not perform Tasks 8–12 merely to delay feature development unless new regression evidence makes a specific deferred task necessary.
