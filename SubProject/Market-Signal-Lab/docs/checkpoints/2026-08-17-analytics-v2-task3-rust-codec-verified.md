# MSL Analytics v2 — Task 3 Rust Codec Verification

**Date:** 2026-08-17 (UTC+7)  
**Branch:** `feature/analytics-v2-ipc`  
**Verified head:** `8f42f28ed937bd7d1a2c53955e2165d4bad69378`  
**Status:** **TASK 3 VERIFIED / COMPLETE**

## Scope

Task 3 implemented the safe Rust `msl-analytics/2` frame/schema codec against the same shared binary fixtures produced by Go.

Implemented components:

- `engines/rust/src/protocol_v2.rs`
- `engines/rust/src/schema_v2.rs`
- `engines/rust/src/lib.rs` as the public codec library boundary
- `engines/rust/src/main.rs` intentionally remains the v1 runtime until Task 5

The staging boundary is deliberate: Task 3 verifies the codec as a library; Task 5 later wires it into the production binary loop.

## TDD evidence

RED was proven earlier on the isolated Windows Rust toolchain at commit:

```text
d3e838476be4023c5adff08e9c96d27bb9c9a8de
```

The RED build failed because required v2 symbols such as `decode_frame`, `MessageType`, operation constants, borrowed schema views, and response encoders did not exist.

GREEN source was then implemented and strict-Clippy staging issues were fixed structurally by placing the codec behind the Rust library target instead of suppressing dead-code warnings.

## Final Windows verification

Toolchain:

```text
rustc 1.97.1 (8bab26f4f 2026-07-14)
cargo 1.97.1 (c980f4866 2026-06-30)
```

Command:

```text
cargo test --manifest-path .\engines\rust\Cargo.toml
```

Result:

```text
src/lib.rs:   8 passed, 0 failed
src/main.rs: 12 passed, 0 failed
doc tests:    0 failed
TOTAL:       20 passed, 0 failed
```

Strict lint gate:

```text
cargo clippy --manifest-path .\engines\rust\Cargo.toml --all-targets --all-features -- -D warnings
```

Result:

```text
PASS
Finished `dev` profile
0 warnings promoted to errors
```

## Safety / contract evidence

Verified Task 3 behavior includes:

- fixed `MSL2` header and descriptor parsing;
- checked offset/length arithmetic;
- exact total-frame validation;
- frame hard-cap enforcement;
- duplicate SlotID rejection;
- payload-overlap rejection;
- malformed/truncated frame rejection;
- safe borrowed operation payload slices;
- UTF-8 dictionary validation;
- strictly ordered dictionary keys;
- bitset cardinality/high-bit validation;
- zero alignment-padding validation;
- no trailing schema bytes;
- response encoders matching shared Go fixtures;
- no `unsafe` zero-copy implementation.

## Clippy staging root cause and resolution

An intermediate strict-Clippy run failed only because the new v2 modules were declared directly in the binary target before Task 5 used them. Clippy correctly classified that production-target API as dead code.

The fix was architectural rather than suppressive:

```text
src/lib.rs  -> public Task 3 codec library
src/main.rs -> unchanged v1 runtime until Task 5
```

No `#[allow(dead_code)]` workaround was used to pass the gate.

## Next exact action

Proceed to Task 4: add allocation-light Rust kernel entry points over the borrowed v2 views while preserving exact existing numerical semantics. Task 4 must start with RED equivalence tests and must not alter established expected numbers to hide accumulation-order changes.
