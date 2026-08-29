# MSL Analytics Protocol v2 / IPC Optimization Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the verified but serialization-heavy `msl-analytics/1` NDJSON transport with a safe, bounded, binary-first `msl-analytics/2` transport that preserves exact analytical behavior, supports multi-operation batches, and meets the 10K/100K/1M latency gates before hard production cutover.

**Architecture:** Go keeps the stable language-neutral `Engine` business API and owns process supervision, bounded admission, encoding, health, and application lifecycle. A long-lived Rust worker reads fixed-header length-framed binary requests, validates schema/bounds, executes independent operations with bounded adaptive parallelism, and returns one binary response frame with per-operation status isolation. The v1 production path remains untouched on the recovery branch and is removed from the v2 implementation branch only after v2 correctness/performance gates pass.

**Tech Stack:** Go 1.22+ / verified portable Go 1.26.4 on Windows; Rust stable / verified rustc 1.97.1 + Cargo 1.97.1 GNU Windows toolchain; standard library binary encoding only; vanilla JavaScript/HTML/CSS diagnostics UI; PowerShell 5.1-compatible Windows verification scripts.

## Global Constraints

- Scope is Market Trends & Insights only.
- Go remains the Windows application/control plane.
- Rust remains the sole production analytics implementation for migrated kernels.
- No production Go analytics fallback.
- No production `msl-analytics/1` fallback after v2 cutover.
- No user-selectable transport/engine mode.
- `msl-analytics/2` is binary-first; arbitrary JSON is forbidden in the analytical hot path.
- Physical transport remains one long-lived stdin/stdout worker using fixed framed messages.
- Fixed frame header is 64 bytes, little-endian; operation descriptor is 32 bytes.
- Hard frame cap is 128 MiB.
- Target encoded 1M deterministic request is <=64 MiB.
- One analytical frame may be active; at most two jobs may wait; waiting jobs must not own pre-encoded large frames.
- Safe Rust decode only in v2.0; no `unsafe` zero-copy.
- No compression by default.
- No shared memory in v2.0.
- No intra-kernel parallel floating-point reductions that can alter deterministic accumulation order.
- Active caller cancellation drains/discards the already-issued response; ordinary cancellation does not kill the worker.
- Initial hard worker watchdog is 10 seconds for the current migrated analytical batch.
- Health/control diagnostics must not block behind a heavy analytical job.
- Rust receives normalized analytical inputs only; never credentials, cookies, browser sessions, or raw authenticated payloads.
- Performance release gate: 10K median <=10 ms, 100K median <=60 ms, 1M median <=500 ms.
- 1M <=250 ms is a stretch target, not a cutover requirement.
- Frozen deterministic correctness gate: `maxDelta=0`, `mismatchCount=0`, `workerErrorCount=0`, `verified=true`.
- Do not claim a speedup until measured end-to-end v2 benchmark evidence passes.
- Do not merge incomplete/unverified v2 production source to `main`.
- README stays evergreen; version/release publication is a separate decision.

## Canonical File Structure

### Go transport
- `internal/analyticsengine/protocol_v2.go` — v2 constants, header/descriptor/status/registry types, checked structural validation.
- `internal/analyticsengine/protocol_v2_test.go` — exact header/descriptor golden vectors and malformed-frame validation.
- `internal/analyticsengine/schema_v2.go` — schema-specific request encoders and response decoders for the four migrated operations.
- `internal/analyticsengine/schema_v2_test.go` — exact schema byte vectors, frame-size/cardinality tests, round-trip tests.
- `internal/analyticsengine/rust_client_v2.go` — long-lived process owner, handshake, bounded queue, active-frame lifecycle, cached health/metrics.
- `internal/analyticsengine/rust_client_v2_test.go` — fake worker transport, backpressure, cancellation/drain, watchdog, restart, health responsiveness.
- `internal/analyticsengine/testdata/fake_worker_v2.go` — deterministic Go fake binary worker for transport tests without requiring Rust.
- `internal/analyticsengine/batch.go` — transport-neutral batch operation/request/result types and internal batch capability.
- `internal/analyticsengine/batch_test.go` — batch ordering and per-operation error mapping.
- `internal/analyticsengine/rust_engine.go` — switch Rust engine methods to v2 client/one-op batches and expose internal multi-op execution.
- `internal/analyticsengine/rust_engine_test.go` — stable business API behavior over v2.
- `internal/analyticsengine/diagnostics.go` — v2 transport metrics in factual component health snapshot.
- `internal/analyticsengine/diagnostics_test.go` — diagnostics values and sanitized errors.

### Shared golden fixtures
- `testdata/analytics_v2/handshake_request.hex`
- `testdata/analytics_v2/handshake_response.hex`
- `testdata/analytics_v2/analytics_request_four_ops.hex`
- `testdata/analytics_v2/analytics_response_four_ops.hex`

Hex text is canonical reviewable representation of exact binary bytes; Go and Rust tests decode the same files. No generated fixture may contain real market history or credentials.

### Rust worker
- `engines/rust/src/protocol_v2.rs` — fixed header/descriptor parsing/encoding, handshake payloads, typed status codes.
- `engines/rust/src/schema_v2.rs` — safe borrowed schema views and response encoders.
- `engines/rust/src/batch_v2.rs` — per-operation dispatch, bounded adaptive operation-level parallelism, stable SlotID response ordering.
- `engines/rust/src/main.rs` — binary frame reader/writer and mandatory v2 handshake.
- `engines/rust/src/similarity.rs` — add slice/column kernel entry point without HashMap reconstruction in hot path.
- `engines/rust/src/selection.rs` — add weights+bitset kernel entry point without per-observation structs.
- `engines/rust/src/volatility.rs` — add rank validity/slice and shares-slice kernel entry points.
- `engines/rust/Cargo.toml` / `Cargo.lock` — remove JSON/serde runtime dependencies after hard cutover if no longer required.

### Benchmark / verification
- `internal/analyticsengine/parity_corpus.go` — add v2 pilot-batch parity path while preserving historical corpus fingerprints.
- `internal/analyticsengine/rust_parity_integration_test.go` — v2 worker frozen parity + 10K/100K/1M evidence.
- `cmd/analytics-bench/main.go` — warm-up 3, measure 11, end-to-end batch metrics, encoded bytes, p95/median.
- `cmd/analytics-bench/main_test.go` — benchmark gate formatting/acceptance tests.
- `scripts/benchmark-analytics.sh`
- `scripts/benchmark-analytics.ps1`
- `scripts/verify-analytics-v2-windows.ps1` — final Windows correctness/performance/package gate.

### UI / localization / continuity
- `internal/web/assets/js/analytics_engine.js`
- `internal/web/templates/index.html`
- `internal/web/analytics_engine_ui_test.go`
- `internal/i18n/locales/en.json`
- `internal/i18n/locales/id.json`
- `docs/qa/analytics-v2-ipc-optimization-qa.md`
- `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
- `docs/checkpoints/CONTINUE_MSL.md`

---

### Task 1: Freeze v2 Wire Constants, Registries, and Exact Go Golden Header/Descriptor Vectors

**Files:**
- Create: `internal/analyticsengine/protocol_v2.go`
- Create: `internal/analyticsengine/protocol_v2_test.go`
- Create: `testdata/analytics_v2/handshake_request.hex`
- Create: `testdata/analytics_v2/handshake_response.hex`
- Create: `testdata/analytics_v2/analytics_request_four_ops.hex`
- Create: `testdata/analytics_v2/analytics_response_four_ops.hex`

**Interfaces:**
- Produces:
  - `const ProtocolV2 = "msl-analytics/2"`
  - `const V2HeaderBytes = 64`
  - `const V2OperationDescriptorBytes = 32`
  - `const V2MaxFrameBytes uint64 = 128 << 20`
  - `type V2MessageType uint16`
  - `type V2OperationID uint16`
  - `type V2SchemaID uint16`
  - `type V2OperationStatus uint32`
  - `type V2FrameHeader struct`
  - `type V2OperationDescriptor struct`
  - `func EncodeV2Header(dst []byte, h V2FrameHeader) error`
  - `func DecodeV2Header(src []byte) (V2FrameHeader, error)`
  - `func EncodeV2Descriptor(dst []byte, d V2OperationDescriptor) error`
  - `func DecodeV2Descriptor(src []byte) (V2OperationDescriptor, error)`
  - `func ValidateV2FrameLayout(h V2FrameHeader, descriptors []V2OperationDescriptor) error`
- Consumes: no production v2 code yet.

- [ ] **Step 1: Write failing exact-vector tests for the 64-byte header**

Use an explicit expected byte sequence, not a self-generated expected value:

```go
func TestV2HeaderGoldenVector(t *testing.T) {
    got := make([]byte, V2HeaderBytes)
    h := V2FrameHeader{
        ProtocolMajor: 2,
        ProtocolMinor: 0,
        MessageType: V2MessageAnalyticsRequest,
        RequestID: 0x0102030405060708,
        OperationCount: 4,
        DescriptorBytes: 4 * V2OperationDescriptorBytes,
        PayloadBytes: 0x0000000000010203,
        TotalFrameBytes: V2HeaderBytes + 4*V2OperationDescriptorBytes + 0x10203,
    }
    if err := EncodeV2Header(got, h); err != nil { t.Fatal(err) }
    wantHex := "4d534c32020000000300000040000000080706050403020104000000800000000302010000000000c30201000000000000000000000000000000000000000000"
    if len(wantHex) != 128 { t.Fatalf("bad golden literal length=%d", len(wantHex)) }
    if hex.EncodeToString(got) != wantHex { t.Fatalf("header=%x", got) }
}
```

- [ ] **Step 2: Run the header test and verify RED**

```bash
go test ./internal/analyticsengine -run '^TestV2HeaderGoldenVector$' -count=1
```

Expected: compile failure because `V2FrameHeader`/`EncodeV2Header` do not exist.

- [ ] **Step 3: Implement minimal v2 constants and fixed header encoding/decoding**

Use only `encoding/binary` and checked arithmetic. The header layout must match the approved spec exactly:

```go
copy(dst[0:4], []byte{'M','S','L','2'})
binary.LittleEndian.PutUint16(dst[4:6], h.ProtocolMajor)
binary.LittleEndian.PutUint16(dst[6:8], h.ProtocolMinor)
binary.LittleEndian.PutUint16(dst[8:10], uint16(h.MessageType))
binary.LittleEndian.PutUint16(dst[10:12], h.Flags)
binary.LittleEndian.PutUint32(dst[12:16], V2HeaderBytes)
binary.LittleEndian.PutUint64(dst[16:24], h.RequestID)
binary.LittleEndian.PutUint32(dst[24:28], h.OperationCount)
binary.LittleEndian.PutUint32(dst[28:32], h.DescriptorBytes)
binary.LittleEndian.PutUint64(dst[32:40], h.PayloadBytes)
binary.LittleEndian.PutUint64(dst[40:48], h.TotalFrameBytes)
// dst[48:64] remains zero
```

Reject wrong magic, major/minor mismatch, non-64 header size, non-zero reserved bytes, frame >128 MiB, and integer overflow.

- [ ] **Step 4: Add failing descriptor/layout tests**

Cover exact 32-byte descriptor bytes, descriptor-table length, out-of-frame regions, `offset+length` overflow, overlap, request-invalid status, duplicate SlotID, and >32 operations.

```go
func TestValidateV2FrameLayoutRejectsOverlap(t *testing.T) {
    h := validV2AnalyticsHeader(2, 64)
    ds := []V2OperationDescriptor{
        {SlotID: 1, OperationID: V2OpDistributionSimilarity, SchemaID: 1, PayloadOffset: 0, PayloadLength: 40},
        {SlotID: 2, OperationID: V2OpSelectionProbability, SchemaID: 1, PayloadOffset: 32, PayloadLength: 32},
    }
    if err := ValidateV2FrameLayout(h, ds); err == nil { t.Fatal("overlap must fail") }
}
```

- [ ] **Step 5: Run tests RED, then implement descriptor/layout validation GREEN**

```bash
go test ./internal/analyticsengine -run 'V2(Header|Descriptor|FrameLayout)' -count=1
```

- [ ] **Step 6: Add canonical operation/status registries**

```go
const (
    V2OpDistributionSimilarity V2OperationID = 1
    V2OpItemVolatility         V2OperationID = 2
    V2OpClusterVolatility      V2OperationID = 3
    V2OpSelectionProbability   V2OperationID = 4
)
const (
    V2StatusOK V2OperationStatus = iota
    V2StatusInvalidInput
    V2StatusUnsupportedOperation
    V2StatusUnsupportedSchema
    V2StatusMalformedPayload
    V2StatusInternalError
)
```

IDs are append-only and never repurposed.

- [ ] **Step 7: Commit exact shared fixture hex files** and decode them from Go tests. Structural bytes are frozen here; schema payload content is completed in Task 2.

- [ ] **Step 8: Run focused + package tests**

```bash
go test ./internal/analyticsengine -count=1
git diff --check
```

- [ ] **Step 9: Commit**

```bash
git add internal/analyticsengine/protocol_v2.go internal/analyticsengine/protocol_v2_test.go testdata/analytics_v2
git commit -m "feat: freeze analytics v2 wire contract"
```

---

### Task 2: Implement Go Typed Columnar Schema Encoders and Response Decoders

**Files:**
- Create: `internal/analyticsengine/schema_v2.go`
- Create: `internal/analyticsengine/schema_v2_test.go`
- Modify: `testdata/analytics_v2/analytics_request_four_ops.hex`
- Modify: `testdata/analytics_v2/analytics_response_four_ops.hex`

**Interfaces:**
- Consumes: Task 1 wire types and existing business input/result structs from `engine.go`.
- Produces:
  - `type V2EncodedOperation struct { Descriptor V2OperationDescriptor; Payload []byte }`
  - `func EncodeDistributionSimilarityV2(in DistributionSimilarityInput, dst []byte) ([]byte, error)`
  - `func EncodeItemVolatilityV2(in ItemVolatilityInput, dst []byte) ([]byte, error)`
  - `func EncodeClusterVolatilityV2(in ClusterVolatilityInput, dst []byte) ([]byte, error)`
  - `func EncodeSelectionProbabilityV2(in SelectionProbabilityInput, dst []byte) ([]byte, error)`
  - `func DecodeDistributionSimilarityResultV2(src []byte) (DistributionSimilarityResult, error)`
  - `func DecodeVolatilityResultV2(src []byte) (VolatilityResult, error)`
  - `func DecodeSelectionProbabilityResultV2(src []byte) (SelectionProbabilityResult, error)`
  - `func EncodeV2AnalyticsRequest(requestID uint64, ops []V2EncodedOperation, dst []byte) ([]byte, error)`

- [ ] **Step 1: Write failing selection payload byte test** for weights `[2,1,3]` and selected bits `[true,false,true]`; exact schema bytes must contain count 3, bitset length 1, three f64 values, byte `0x05`, and zero alignment padding.
- [ ] **Step 2: Run RED** with `go test ./internal/analyticsengine -run '^TestEncodeSelectionProbabilityV2Golden$' -count=1`.
- [ ] **Step 3: Implement selection encoder** with one pre-sized buffer, `math.Float64bits`, direct bit packing, and validation of empty/non-positive/non-finite weights.
- [ ] **Step 4: Add item-volatility exact payload test/implementation** using contiguous `i64 ranks[]` plus validity bitset; no sentinel.
- [ ] **Step 5: Add cluster-volatility exact payload test/implementation** using contiguous shares.
- [ ] **Step 6: Add deterministic distribution dictionary test/implementation**. Canonical union keys are lexicographically sorted UTF-8 bytes; map insertion order must not affect frame bytes; reject invalid UTF-8 Go strings.
- [ ] **Step 7: Write response decoder tests then implement**. Exact response lengths: distribution 16 bytes, volatility 56 bytes, selection 48 bytes. Reject short/trailing bytes, invalid label enum, and count overflow.
- [ ] **Step 8: Implement multi-operation request assembly** with request-order descriptors, 8-byte payload alignment, frame cap, and no silent chunking.
- [ ] **Step 9: Complete shared four-operation request/response golden fixtures** with tiny deterministic inputs.
- [ ] **Step 10: Verify 1M encoded request <=64 MiB** with `BuildDeterministicCorpus(1_000_000)`.
- [ ] **Step 11: Run and commit**

```bash
go test ./internal/analyticsengine -count=1
git diff --check
git add internal/analyticsengine/schema_v2.go internal/analyticsengine/schema_v2_test.go testdata/analytics_v2
git commit -m "feat: encode analytics v2 columnar schemas"
```

---

### Task 3: Implement Safe Rust v2 Frame/Schema Codec Against the Same Golden Vectors

**Files:**
- Create: `engines/rust/src/protocol_v2.rs`
- Create: `engines/rust/src/schema_v2.rs`
- Modify: `engines/rust/src/main.rs` only to declare modules; keep entry behavior unchanged until Task 5.

**Interfaces:**
- Produces `FrameHeader`, `OperationDescriptor`, `decode_frame(&[u8])`, response encoders, and safe borrowed views:
  - `DistributionSimilarityView<'a>` with `values_a()`/`values_b()` iterators or indexed getters;
  - `ItemVolatilityView<'a>` with nullable-rank access plus scalar getters;
  - `ClusterVolatilityView<'a>` with shares getter/iterator plus scalar getters;
  - `SelectionProbabilityView<'a>` with `weight(i)` and `selected(i)`.

- [ ] **Step 1: Add failing Rust golden-header test** using the same shared hex fixture. Use a tiny test-only stdlib hex decoder; no dependency.
- [ ] **Step 2: Run RED**: `cargo test --manifest-path engines/rust/Cargo.toml protocol_v2`.
- [ ] **Step 3: Implement fixed-header/descriptor parser** using `from_le_bytes`, `get`, `try_into`, and checked arithmetic only; no pointer casting.
- [ ] **Step 4: Add malformed structure property corpus** by deterministic truncation/mutation of valid frames; parser never panics.
- [ ] **Step 5: Implement borrowed schema views**; do not reconstruct per-observation structs.
- [ ] **Step 6: Validate bitset/cardinality/dictionary/UTF-8/trailing-byte/schema invariants**.
- [ ] **Step 7: Decode all shared Go-generated fixtures** and run `cargo test`.
- [ ] **Step 8: Strict clippy and commit**

```bash
cargo clippy --manifest-path engines/rust/Cargo.toml --all-targets --all-features -- -D warnings
git add engines/rust/src/protocol_v2.rs engines/rust/src/schema_v2.rs engines/rust/src/main.rs
git commit -m "feat: decode analytics v2 frames in rust"
```

---

### Task 4: Add Allocation-Light Rust Kernel Entry Points Without Changing Numerical Semantics

**Files:** modify `similarity.rs`, `selection.rs`, `volatility.rs`.

**Interfaces:**
- `pub fn distribution_similarity_view(input: DistributionSimilarityView<'_>) -> f64`
- `pub fn selection_probability_view(input: SelectionProbabilityView<'_>) -> Result<SelectionProbabilityResult, String>`
- `pub fn item_volatility_view(input: ItemVolatilityView<'_>) -> VolatilityResult`
- `pub fn cluster_volatility_view(input: ClusterVolatilityView<'_>) -> VolatilityResult`

- [ ] **Step 1: Write failing equivalence tests** comparing current owned-input fixtures to new view functions with exact fields.
- [ ] **Step 2: Run RED** for missing view functions.
- [ ] **Step 3: Implement selection view kernel** as one deterministic sequential pass; no parallel reduction.
- [ ] **Step 4: Implement volatility view kernels** preserving median/MAD semantics; capped-rank temporary allocation remains acceptable.
- [ ] **Step 5: Implement distribution view kernel** over canonical parallel arrays without rebuilding HashMaps.
- [ ] **Step 6: Preserve established expected outputs**; do not edit expected numbers to hide changed accumulation order.
- [ ] **Step 7: Run Rust tests/clippy and commit**

```bash
cargo test --manifest-path engines/rust/Cargo.toml
cargo clippy --manifest-path engines/rust/Cargo.toml --all-targets --all-features -- -D warnings
git add engines/rust/src/similarity.rs engines/rust/src/selection.rs engines/rust/src/volatility.rs
git commit -m "perf: add columnar rust analytics kernels"
```

---

### Task 5: Implement Rust v2 Handshake, Multi-Operation Batch Executor, and Binary Worker Loop

**Files:** create `batch_v2.rs`; modify `protocol_v2.rs`, `schema_v2.rs`, `main.rs`.

**Handshake request payload:**
`u32 requiredFeatureFlags; u32 registryCount; u64 hostMaxFrameBytes; registryCount * {u16 operationID; u16 schemaID; u32 requiredFlags}`.

**Handshake response payload:**
`u32 status; u32 supportedFeatureFlags; u64 workerMaxFrameBytes; u32 registryCount; u16 engineVersionBytes; u16 reserved; registry entries; engineVersion UTF-8; zero align8 padding`.

Handshake statuses: `0 OK`, `1 INCOMPATIBLE_PROTOCOL`, `2 MISSING_REQUIRED_OPERATION`, `3 UNSUPPORTED_REQUIRED_FEATURE`.

- [ ] **Step 1: Write failing handshake tests** for all four required operation/schema pairs and negotiated frame max.
- [ ] **Step 2: Implement handshake validation/response encoding**; never healthy before handshake.
- [ ] **Step 3: Write failing partial-error batch test**: valid distribution + invalid selection + valid cluster; valid slots still succeed.
- [ ] **Step 4: Implement sequential batch dispatch** over borrowed views.
- [ ] **Step 5: Add bounded adaptive operation-level parallelism** only when >=2 operations and combined element count >=100,000; max threads `min(available CPUs, operation count, 4)`. Never parallelize one floating reduction.
- [ ] **Step 6: Prove stable SlotID response order** independent of completion order.
- [ ] **Step 7: Replace NDJSON main loop with exact binary frame read/write** and mandatory first-frame handshake.
- [ ] **Step 8: Add malformed-frame connection-failure test**; corrupted stream is not reused.
- [ ] **Step 9: Run Rust tests/clippy/release build and commit**

```bash
cargo test --manifest-path engines/rust/Cargo.toml
cargo clippy --manifest-path engines/rust/Cargo.toml --all-targets --all-features -- -D warnings
cargo build --manifest-path engines/rust/Cargo.toml --release
git add engines/rust/src
git commit -m "feat: run rust analytics over protocol v2"
```

---

### Task 6: Build Go v2 Fake Worker and Bounded Single-Flight Client/Scheduler

**Files:** create `fake_worker_v2.go`, `rust_client_v2.go`, `rust_client_v2_test.go`, `batch.go`, `batch_test.go`.

**Interfaces:**

```go
type BatchOperation struct {
    SlotID      uint32
    OperationID V2OperationID
    SchemaID    V2SchemaID
    Input       any // one existing typed business input; encoded only when active
}
type BatchOperationResult struct {
    SlotID uint32
    Status V2OperationStatus
    Payload []byte
    Err error
    DurationMicros uint64
}
type AnalyticsBatch struct { Operations []BatchOperation }
type AnalyticsBatchResult struct { Operations []BatchOperationResult }
type V2TransportMetrics struct {
    QueueDepth int
    InFlight bool
    LastFrameBytes uint64
    LastBatchOperationCount int
    LastQueueWaitMicros uint64
    LastEncodeMicros uint64
    LastRoundTripMicros uint64
    LastWorkerComputeMicros uint64
    LastDecodeMicros uint64
    WorkerRestartCount uint64
    LastSuccessfulResponseAt time.Time
}
```

`RustV2Client` provides `Start`, `ExecuteBatch`, `Health`, `Metrics`, `Close`.

- [ ] **Step 1: Build fake binary worker and write failing mandatory-handshake test**. Modes: normal, protocol mismatch, missing capability, malformed response, wrong request ID, hang, exit, slow batch.
- [ ] **Step 2: Implement process start + handshake** with startup context decoupled from worker lifetime.
- [ ] **Step 3: Write bounded-queue test** for 1 active + 2 waiting; fourth caller blocks/cancels.
- [ ] **Step 4: Implement one IPC-owner goroutine and bounded admission queue**; waiting jobs hold typed inputs/small metadata only.
- [ ] **Step 5: Write waiting-cancellation test**; canceled queued job never reaches worker.
- [ ] **Step 6: Implement context-aware admission**.
- [ ] **Step 7: Write active-cancellation drain/discard test**; worker survives and next job succeeds only after drain.
- [ ] **Step 8: Implement active drain/discard** without worker kill.
- [ ] **Step 9: Write watchdog/crash/malformed-response tests**; production default 10 s, test injectable 50 ms.
- [ ] **Step 10: Prove cached `Health()`/`Metrics()` remain responsive during slow batch**.
- [ ] **Step 11: Prove buffers >64 MiB are not retained** in normal reuse pool.
- [ ] **Step 12: Run Go + race tests and commit**

```bash
go test ./internal/analyticsengine -count=1
go test -race ./internal/analyticsengine -count=1
git diff --check
git add internal/analyticsengine/batch.go internal/analyticsengine/batch_test.go internal/analyticsengine/rust_client_v2.go internal/analyticsengine/rust_client_v2_test.go internal/analyticsengine/testdata/fake_worker_v2.go
git commit -m "feat: add bounded analytics v2 client"
```

---

### Task 7: Connect the Stable Rust Engine Business API to v2 and Real Rust Batch Integration

**Files:** modify `rust_engine.go`, `rust_engine_test.go`, `runtime.go`, `runtime_test.go`; create/modify `rust_v2_integration_test.go`.

**Interface:** existing `Engine` methods stay unchanged. Add internal transport-neutral:

```go
type BatchExecutor interface {
    ExecuteAnalyticsBatch(context.Context, AnalyticsBatch) (AnalyticsBatchResult, error)
}
```

`RustEngine` implements it.

- [ ] **Step 1: Write failing business API test over fake v2 worker**; callers construct no frame.
- [ ] **Step 2: Route each RustEngine business method through a v2 one-op batch** and typed result/status mapping.
- [ ] **Step 3: Add internal four-op batch test** proving one request frame has four descriptors.
- [ ] **Step 4: Add real Rust integration gate controlled by `MSL_RUST_WORKER`**: protocol v2, healthy, established fixture values, one four-op frame.
- [ ] **Step 5: Update runtime health identity to `ProtocolV2`** on v2 implementation branch.
- [ ] **Step 6: Preserve Rust-unavailable Market Autopilot publication behavior**.
- [ ] **Step 7: Run Go/race/vet and commit**

```bash
go test ./internal/analyticsengine ./internal/app -count=1
go test -race ./internal/analyticsengine -count=1
go vet ./...
git add internal/analyticsengine
git commit -m "feat: route rust engine through analytics v2"
```

---

### Task 8: Add Factual v2 Transport Observability Without Exposing Payloads

**Files:** modify `diagnostics.go`, tests, `analytics_engine.js`, template, UI contract test, EN/ID locales.

**Interface:** add nested `AnalyticsTransportDiagnostics` mirroring `V2TransportMetrics` in JSON-safe fields.

- [ ] **Step 1: Write failing diagnostics API test** after one fake v2 batch.
- [ ] **Step 2: Map cached metrics into diagnostics**; health HTTP call triggers no worker request.
- [ ] **Step 3: Write UI contract test before markup/JS change** requiring `analyticsQueueDepth`, `analyticsInFlight`, `analyticsLastFrameBytes`, `analyticsLastRoundTrip`, `analyticsWorkerRestarts`.
- [ ] **Step 4: Add compact factual rows + EN/ID locale keys**; no transport/mode selector.
- [ ] **Step 5: Update JS renderer**; absent metrics render `-`.
- [ ] **Step 6: Run web/i18n/JS tests and commit**

```bash
go test ./internal/web ./internal/i18n ./internal/analyticsengine -count=1
node --check internal/web/assets/js/analytics_engine.js
git diff --check
git add internal/analyticsengine/diagnostics* internal/web internal/i18n
git commit -m "feat: expose analytics v2 transport health"
```

---

### Task 9: Add v2 Batch Parity and End-to-End Performance Benchmark Gate

**Files:** modify `parity_corpus.go/tests`, Rust parity integration, benchmark command/tests, shell/PowerShell benchmark scripts.

**Interfaces:**
- `func BuildPilotBatch(c ParityCorpus) AnalyticsBatch`
- `func RunParityBatch(ctx context.Context, reference Engine, candidate interface{ Engine; BatchExecutor }, corpus ParityCorpus) ParityCorpusReport`
- benchmark records encoded request bytes, 3 warmups, 11 measured iterations, median/p95, release gate, stretch target.

- [ ] **Step 1: Write failing parity-batch test**; candidate executes one four-op frame.
- [ ] **Step 2: Implement batch parity while Go reference remains evidence-only**.
- [ ] **Step 3: Preserve exact historical corpus fingerprints**: 10K `891179ba4be2f04274e1d8c9caf8c0929f163f229247ea5d9284faeac6c020a2`; 100K `2aa1178d376c2b344e893049d0d4f630a100eba0f0a0053400c92415395e3266`; 1M `bb88b974abb952e6f023b5d37da8754ae6fa1bd92199b2d016af8dc076310cde`.
- [ ] **Step 4: Measure one end-to-end batch call** including Go encode, pipe, Rust decode/compute, response, Go decode.
- [ ] **Step 5: Implement 3 warmups + 11 measurements**; median sorted index 5; p95 uses established deterministic convention.
- [ ] **Step 6: Encode gates**: 10K<=10ms, 100K<=60ms, 1M<=500ms; 1M<=250ms stretch.
- [ ] **Step 7: Test that performance can never report PASS if parity fails**.
- [ ] **Step 8: Run internal tests/real worker benchmark where toolchain is available**; defer only unavailable native evidence.
- [ ] **Step 9: Commit**

```bash
go test ./internal/analyticsengine ./cmd/analytics-bench -count=1
go vet ./...
git add internal/analyticsengine/parity_corpus* internal/analyticsengine/rust_parity_integration_test.go cmd/analytics-bench scripts/benchmark-analytics.*
git commit -m "test: gate analytics v2 parity and latency"
```

---

### Task 10: Hard-Cut Production from v1 to v2 and Remove JSON Runtime Transport

**Files:** remove production use of old Go `protocol.go`, `rust_client.go`, old fake worker, Rust `protocol.rs`; modify Cargo files and production contract tests. Historical QA and test-only numerical references remain.

- [ ] **Step 1: Expand production-contract test first** to forbid `ProtocolV1`, `msl-analytics/1`, old `NewRustClient(`, NDJSON line-scanner transport, Rust `serde_json` request execution, and existing Go/Shadow/fallback tokens.
- [ ] **Step 2: Run RED** while old production path remains.
- [ ] **Step 3: Delete/migrate v1 Go transport references**; no hidden fallback.
- [ ] **Step 4: Delete v1 Rust protocol/JSON main path**; remove `serde_json` and `serde` if no longer needed; regenerate Cargo.lock with Cargo.
- [ ] **Step 5: Run `cargo tree`** and confirm no JSON serialization dependency in production worker graph.
- [ ] **Step 6: Run full Go/Rust/clippy/vet/diff gates**.
- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: hard cut analytics runtime to protocol v2"
```

---

### Task 11: Security, Fuzz/Property, Race, Regression, and Responsive Gates

- [ ] **Step 1: Add Go `FuzzDecodeV2Frame`** seeded from golden fixtures. Optional bounded evidence: `go test ./internal/analyticsengine -run=^$ -fuzz=FuzzDecodeV2Frame -fuzztime=10s`.
- [ ] **Step 2: Add deterministic Rust property corpus** with >=10,000 mutations; no panic or out-of-bound allocation.
- [ ] **Step 3: Add credential/privacy static tests**: no token/Authorization/cookie/session/raw payload logging; neutral fixture names to avoid secret-hook false positives.
- [ ] **Step 4: Run race packages**:

```bash
go test -race ./internal/analyticsengine -count=1
go test -race ./internal/app -run 'Analytics|Autopilot|Consensus' -count=1
go test -race ./internal/web -count=1
```

- [ ] **Step 5: Run full standard regression**: `go test ./... -count=1`, `go vet ./...`, Cargo test, strict clippy.
- [ ] **Step 6: Run all JS syntax, i18n, consensus/telemetry responsive checks**; 1366x768 EN/ID mandatory.
- [ ] **Step 7: Fix failures through TDD before proceeding; commit only resulting gate-support changes**.

---

### Task 12: Run Native Windows v2 Correctness/Performance/Package Gate and Record Durable Evidence

**Files:** create `scripts/verify-analytics-v2-windows.ps1`, `docs/qa/analytics-v2-ipc-optimization-qa.md`; update `.gitignore` if needed and checkpoint/continuation only after evidence.

**Outputs:** local `MSL_Analytics_V2_Windows_Gate.txt`, optional `MSL_Analytics_V2_Benchmark.json`; package `dist/analytics-v2-windows-verified/Market Signal Lab`.

- [ ] **Step 1: Write PowerShell 5.1-compatible gate using isolated F-drive portable toolchains**.
- [ ] **Step 2: Gate Rust tests, strict clippy, release build; record current worker SHA**.
- [ ] **Step 3: Gate Windows full Go regression + vet**, including legacy cleanup regression.
- [ ] **Step 4: Gate real v2 handshake/frozen parity**: all four schemas, 10K/100K/1M `maxDelta=0`, no mismatch/worker errors.
- [ ] **Step 5: Gate 1M encoded request <=64 MiB** and record exact bytes.
- [ ] **Step 6: Gate 3-warmup/11-measurement performance**: 10K<=10ms, 100K<=60ms, 1M<=500ms; record p95 and stretch target.
- [ ] **Step 7: If required performance fails, STOP before package/cutover claim**. Record encode/roundtrip/Rust/decode/frame timings; profile first. Do not restore v1/Go fallback. Shared memory requires a new reviewed design only if pipe transfer remains dominant.
- [ ] **Step 8: Package only after correctness/performance green**; packaged worker hash equals verified worker.
- [ ] **Step 9: Launch package and query `/api/system/analytics-engine`**: host healthy, Rust healthy, protocol v2, diagnostics responsive.
- [ ] **Step 10: Write QA from exact evidence with no exaggerated speedup claim**.
- [ ] **Step 11: Move checkpoint to Phase C only when every required gate PASS**.
- [ ] **Step 12: Commit safe source/docs only**; never commit exe, target, raw logs/history/credentials.

---

## Plan Self-Review

### Spec coverage
- Hard v2 cutover: Tasks 10 and 12.
- Fixed header/descriptors: Tasks 1 and 3.
- Columnar/dictionary/bitsets: Tasks 2 and 3.
- Safe borrowed Rust decode/no unsafe: Tasks 3-4.
- Batch/error isolation: Tasks 5 and 7.
- Queue/backpressure/cancellation/drain/watchdog: Task 6.
- Cached health/diagnostics: Task 8.
- Exact parity/performance: Tasks 9 and 12.
- Frame/memory targets: Tasks 1-2 and 12.
- Security/privacy: Tasks 3, 6, 8, 11.
- No JSON/v1 production fallback: Task 10.
- Windows package: Task 12.
- Cross-session recovery: this plan + checkpoint/continuation.

### Placeholder scan
No `TBD`, `TODO`, unresolved implementation placeholder, or ambiguous “implement later” step remains. Performance failure behavior is explicitly profile-first rather than silently selecting a fallback.

### Type consistency
- Wire IDs/types are defined Task 1 before schema/client use.
- Go schema encoders exist before client integration.
- Rust views exist before Rust kernels/batch.
- `AnalyticsBatch` exists before `BatchExecutor` integration.
- `V2TransportMetrics` exists before diagnostics mapping.

### Scope
Only IPC Optimization Gate is implemented. Phase C ranking/signal formulas remain outside this plan.

## Execution Rule

Use a dedicated isolated worktree/branch `feature/analytics-v2-ipc` created from the committed plan baseline. Execute strictly task-by-task with TDD and review between tasks. Perform every test available in the assistant environment first; use the user's Windows machine only for native evidence that cannot be reproduced internally, especially the final Windows Rust/Go/package/performance gate.
