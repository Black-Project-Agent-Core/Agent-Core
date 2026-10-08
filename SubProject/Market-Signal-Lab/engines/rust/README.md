# MSL Rust Analytics Worker

The production worker implements the binary `msl-analytics/2` protocol. `src/main.rs` enters `worker_v2::run_binary_worker_session`; the Go host creates the Rust engine through `internal/analyticsengine/runtime.go`. There is no automatic Go production fallback in that owner. Missing or unhealthy Rust execution is reported as unavailable.

## Implemented operation surface

`src/protocol_v2.rs` and `src/batch_v2.rs` define and dispatch:

- distribution similarity, item volatility, cluster volatility, selection probability;
- product and catalog ranking v0.1;
- structural index and structural direction v0.1;
- competition acceleration, directional momentum, peer-relative rank, author-concentration change and movement divergence v0.2.

The worker receives normalized mathematical input only. It must not read MSL storage or receive Envato credentials, authorization headers, cookies, browser sessions, raw account data, or raw authenticated API responses.

## Build and evidence

From `SubProject/Market-Signal-Lab/`, with a suitable Rust toolchain installed:

```bash
cargo test --manifest-path engines/rust/Cargo.toml
cargo build --manifest-path engines/rust/Cargo.toml --release
```

These are reproduction commands, not results of this documentation refresh. The old Preview.1 toolchain blocker and protocol-v1-only description are superseded by the checked-in v2 entry point, operations and [recorded integration checkpoint](../../docs/checkpoints/CURRENT_MSL_CHECKPOINT.md). Historical parity/performance reports apply only to their exact revisions, workloads and machines; source presence does not establish a packaged worker or native acceptance on a fresh checkout.
