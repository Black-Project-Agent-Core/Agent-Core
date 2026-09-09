# MSL Rust Analytics Worker

This directory contains the Alpha 6.5.3 Rust analytics worker source for protocol `msl-analytics/1`.

Pilot operations:

- distribution similarity;
- item volatility;
- cluster volatility;
- observed selection probability.

The worker receives normalized mathematical input only. It must not read MSL storage or receive Envato credentials, Authorization headers, cookies, browser sessions, raw account data, or raw authenticated API responses.

## Preview status

The current Alpha 6.5.3 Preview.1 development environment does not provide `rustc`, `cargo`, or `rustup`, so a verified `msl-analytics-rust.exe` is not yet available. Go remains the stable reference/default and automatic fallback.

Do not claim Rust parity or performance until `cargo test`, `cargo clippy -- -D warnings`, real Go↔Rust parity at 10K/100K/1M, and Windows worker packaging all pass.
