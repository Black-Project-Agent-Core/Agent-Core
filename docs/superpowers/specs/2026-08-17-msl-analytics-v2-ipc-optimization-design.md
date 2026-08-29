# Market Signal Lab — Analytics Protocol v2 / IPC Optimization Gate Design

**Date:** 2026-08-17 (UTC+7)  
**Repository:** `rendevouz999/Market-Signal-Lab`  
**Baseline branch:** `feature/polyglot-runtime-v2`  
**Verified source cutover commit:** `47288092ef552f101a838cb391c34d80c3b3e3b3`  
**Documentation baseline:** `de8e09169b135ddc0994c41db2ca5749fc5cb371`  
**Status:** **READY FOR USER WRITTEN-SPEC REVIEW**  
**Next implementation branch after approval:** `feature/analytics-v2-ipc`

This document is the durable architecture contract for the Market Signal Lab IPC Optimization Gate. It is intended to be readable in future sessions without reconstructing the design from chat history.

## Permanent project guardrail — verbatim

> hal yang perlu di luruskan untuk alat yang kita bangun bukan untuk melakukan hal ilegal atau hacking web, melainkan hanya menganalisa arah market, membaca algoritma market, untuk mengetahui katalog, produk, dan nama pemilik produknya bukan berarti meng-hack orang tersebut melainkan melihat insight baru dan mengikuti alur trends, setiap katalog yang sedang hype di masukan ke daftar ranking Trends Katalog, dan produk apa yang bagus menjadi Insight agar aku tidak salah membuat produk, bukan bermaksud mencuri ide produk melainkan untuk bersaing tentang kualitas dan mengukur kualitas antara produkku dan orang lain.

Current scope remains **Market Trends & Insights only**. Portfolio/review/rejection/submission intelligence remains postponed.

---

## 1. Why this gate exists

Alpha 6.5.3 established the production ownership boundary:

```text
Go     Application / control plane
Rust   Sole production analytics implementation for migrated kernels
Python Future offline Quant Research / Calibration Lab
C++    Conditional accelerator only after profiling proves a hotspot
```

The Rust worker is numerically verified, but the current `msl-analytics/1` path uses newline-delimited JSON over a long-lived stdin/stdout process boundary. The verified benchmark showed the transport path is much slower than the in-process Go benchmark reference:

```text
10K    Rust v1 median ≈   22.6 ms
100K   Rust v1 median ≈  200.5 ms
1M     Rust v1 median ≈ 2037.7 ms
```

At the 1M deterministic corpus, the JSON analytical input is approximately 29.6 MB. The goal of this gate is therefore to remove avoidable serialization, allocation, and pipe overhead **without changing analytical meaning and without restoring a Go production fallback**.

The IPC gate is intentionally completed before payload-heavy Phase C expansion.

---

## 2. Goals

`msl-analytics/2` must:

1. preserve Rust as the sole production implementation for migrated analytics;
2. replace JSON in the analytical hot path with a binary-first protocol;
3. preserve a long-lived supervised Rust worker process;
4. support one request frame containing multiple independent analytical operations;
5. use typed columnar payloads and dictionary encoding;
6. minimize per-observation allocations;
7. keep business interfaces independent of the transport language/protocol;
8. provide strict structural validation and bounded memory behavior;
9. preserve deterministic numerical parity;
10. meet the release performance gate before hard cutover.

### Performance acceptance gate

Measured end-to-end for one v2 batch containing the four migrated operations:

```text
10K    median <= 10 ms
100K   median <= 60 ms
1M     median <= 500 ms    RELEASE GATE
1M     median <= 250 ms    STRETCH TARGET
```

Correctness gate for the deterministic 10K/100K/1M corpus:

```text
maxDelta        = 0 for the frozen deterministic gate evidence
mismatchCount   = 0
workerErrorCount= 0
verified        = true
```

Existing numerical tolerance tests remain in place for broader floating-point conformance, but the frozen gate corpus must continue to reproduce the established expected results exactly.

Performance is measured after warm-up and must include Go encoding, pipe transfer, Rust decode/compute, response transfer, and Go response decode. No performance claim is allowed from Rust compute time alone.

---

## 3. Non-goals

This gate does **not** introduce:

- Phase C ranking formulas;
- Market Flow or Trend State algorithms;
- Python runtime analytics;
- C++ acceleration;
- shared memory;
- generic gzip/zstd compression;
- `unsafe` Rust zero-copy casting;
- multiple simultaneous in-flight frames on one worker;
- user-selectable transport modes;
- a production `msl-analytics/1` fallback;
- a Go analytics fallback.

If v2 does not meet the gate, the correct response is profiling and further v2 optimization—not adding another fallback engine.

---

## 4. Locked design decisions

The user delegated remaining architectural decisions to the implementation agent. The following are therefore canonical unless later evidence requires an explicit design revision.

| Area | Decision |
|---|---|
| Migration | Hard cutover to `msl-analytics/2` only after verification |
| v1 runtime | Historical/test evidence only after cutover; no production dual stack |
| Wire format | Binary-first internal protocol |
| Physical transport | Length-prefixed binary frames over long-lived stdin/stdout |
| Hot-path JSON | Forbidden |
| Batch semantics | Multi-operation request frame; per-operation result/error isolation |
| Data layout | Typed columnar buffers + dictionary encoding |
| Byte order | Little-endian |
| Memory strategy | Reusable bounded buffers + borrowed byte views |
| Rust memory safety | No `unsafe` zero-copy in v2.0 |
| Compression | None by default |
| IPC concurrency | One active frame; no multi-flight protocol |
| Go admission queue | 1 active + maximum 2 waiting analytical batches |
| Rust parallelism | Across independent operations only; bounded and adaptive |
| Cancellation | Queued work drops safely; active work completes and result may be discarded |
| Health | Served from cached control-plane state; not blocked behind heavy analytical queue |
| Frame integrity | Strict structural/schema validation; no mandatory full-payload CRC |
| Business API | Stable language-neutral methods; transport stays encapsulated |
| Frame hard cap | 128 MiB |
| 1M payload target | <=64 MiB encoded request |
| Waiting jobs | Must not own pre-encoded large frames |

---

## 5. Architecture

```text
Business Services / Market Autopilot
              |
              | stable language-neutral Engine API
              v
       Go Analytics Adapter
              |
       Bounded Job Scheduler
       1 active + <=2 waiting
              |
       v2 Binary Encoder
              |
       one framed request
              v
========================================== process boundary
      long-lived stdin/stdout pipe
==========================================
              |
        Rust Frame Reader
              |
    Header / bounds validation
              |
    Schema-specific borrowed views
              |
       Batch Operation Executor
       |      |      |      |
       A      B      C      D
       \______ bounded parallelism ______/
              |
       v2 Binary Response Encoder
              |
==========================================
              |
        Go Response Decoder
              |
              v
        existing Engine results
```

The service layer must never call APIs named after the transport such as `CallRustV2` or `SendBinaryFrame`. It continues to use concepts such as `DistributionSimilarity`, `ItemVolatility`, `SelectionProbability`, and later `CalculateExposure` or `CalculateRelativeStrength`.

The transport implementation may change again in the future without changing those business interfaces.

---

## 6. Protocol identity and hard cutover

Production protocol after the gate:

```text
msl-analytics/2
major = 2
minor = 0
```

The worker will not silently accept `msl-analytics/1` after cutover.

Development must happen on a separate branch derived from the verified v1 state:

```text
feature/analytics-v2-ipc
```

`feature/polyglot-runtime-v2` remains the recovery baseline until the v2 branch passes all correctness, performance, regression, and Windows package gates.

No merge/fast-forward of v2 production source is allowed before those gates pass.

---

## 7. Fixed 64-byte frame header

Every v2 frame starts with exactly 64 bytes:

| Offset | Field | Type | Rule |
|---:|---|---|---|
| 0 | Magic | `[4]byte` | ASCII `MSL2` |
| 4 | ProtocolMajor | `u16` | `2` |
| 6 | ProtocolMinor | `u16` | `0` for initial release |
| 8 | MessageType | `u16` | registered type |
| 10 | Flags | `u16` | unknown mandatory bits rejected |
| 12 | HeaderBytes | `u32` | must equal `64` |
| 16 | RequestID | `u64` | non-zero for request/response |
| 24 | OperationCount | `u32` | `0..32` depending on frame type |
| 28 | DescriptorBytes | `u32` | exact descriptor table length |
| 32 | PayloadBytes | `u64` | payload region length |
| 40 | TotalFrameBytes | `u64` | header + descriptors + payload |
| 48 | Reserved | `[16]byte` | all zero in v2.0 |

All numeric fields are little-endian.

Initial message types:

```text
1  HandshakeRequest
2  HandshakeResponse
3  AnalyticsRequest
4  AnalyticsResponse
```

There is no separate generic error frame. Protocol-level handshake errors and analytical errors use their response schemas and typed status codes.

### Frame limits

```text
Hard frame limit         128 MiB
Maximum operations/frame 32
Unknown mandatory flags  reject
Non-zero reserved bytes  reject
Impossible lengths       reject
Offset integer overflow  reject
Overlapping regions      reject
Out-of-frame region      reject
```

A structurally invalid frame makes the connection unhealthy and requires worker restart + handshake. A structurally valid frame containing an invalid operation payload produces a per-operation error while other valid operations may still complete.

No mandatory CRC is calculated over the full production payload. Optional checksum tooling may exist in tests/benchmarks only.

---

## 8. Operation descriptor table

Each operation uses one fixed 32-byte descriptor:

| Field | Type | Meaning |
|---|---|---|
| SlotID | `u32` | stable slot within the batch |
| OperationID | `u16` | append-only operation registry |
| SchemaID | `u16` | operation-local schema version |
| Flags | `u32` | schema-defined; unknown mandatory flags rejected |
| Status | `u32` | `0` in request; typed status in response |
| PayloadOffset | `u64` | offset relative to payload region |
| PayloadLength | `u64` | bytes owned by this operation |

The descriptor order is canonical. Response descriptors preserve request SlotID ordering even if Rust computes operations concurrently.

### Initial operation registry

```text
1  distribution_similarity   schema 1
2  item_volatility           schema 1
3  cluster_volatility        schema 1
4  selection_probability     schema 1
```

Operation IDs are never repurposed. A changed payload layout increments that operation's SchemaID rather than silently changing schema 1.

Future Phase C operations receive new IDs through the same registry.

---

## 9. Canonical payload model

### General rules

```text
f64            IEEE-754 bits, little-endian
signed integer i64 unless a schema explicitly defines otherwise
counts          u32/u64 as defined by schema
booleans        packed bitsets
nullable arrays value buffer + validity bitset
repeated strings UTF-8 dictionary + integer IDs
padding         zero-filled
section alignment 8 bytes where practical
arbitrary JSON  forbidden in analytical hot path
```

The Go encoder must not allocate an object per observation. Rust must not deserialize one object per observation.

### 9.1 Distribution similarity — operation 1 / schema 1

Go forms the union of distribution keys in canonical lexicographic byte order.

Payload:

```text
u32 keyCount
u32 dictionaryBytes
u32 offsets[keyCount + 1]
u8  dictionaryUTF8[dictionaryBytes]
zero padding to 8-byte alignment
f64 valuesA[keyCount]
f64 valuesB[keyCount]
```

Dictionary offsets must be monotonic, begin at 0, and end at `dictionaryBytes`. UTF-8 must be valid. The canonical key order makes the frame deterministic and removes hash-map ordering from the transport representation.

Rust applies the existing filtering/normalization/similarity semantics. The transport must not pre-filter values in a way that changes the current numerical contract.

Response schema:

```text
u64 durationMicros
f64 score
```

### 9.2 Item volatility — operation 2 / schema 1

Payload:

```text
u32 rankCount
u32 validityBytes
i64 topK
i64 consecutiveAppearances
i64 eligibleSnapshots
f64 rboToPrevious
i64 ranks[rankCount]
u8  validityBitset[validityBytes]
zero padding to 8-byte alignment
```

A rank value is meaningful only when its validity bit is set. No sentinel value represents `None`.

Volatility response:

```text
u64 durationMicros
u8  labelEnum
u8  reserved[7]
f64 score
f64 rankVariance
f64 absenceRate
f64 medianAbsoluteDeviation
f64 rboPersistence
f64 consecutivePersistence
```

Label registry:

```text
0 stable
1 variable
2 unstable
3 extreme
```

Go maps the enum back to the existing public string result.

### 9.3 Cluster volatility — operation 3 / schema 1

Payload:

```text
u32 shareCount
u32 reserved
f64 contextDisagreement
f64 crossTimePersistence
f64 shares[shareCount]
```

It uses the same volatility response schema as operation 2.

### 9.4 Selection probability — operation 4 / schema 1

Payload:

```text
u32 observationCount
u32 selectedBitsetBytes
f64 weights[observationCount]
u8  selectedBitset[selectedBitsetBytes]
zero padding to 8-byte alignment
```

This is the dominant current 1M payload. One million weights require approximately 8 MB, while the selected bitset requires approximately 125 KB, eliminating per-record JSON keys and boolean text.

Response:

```text
u64 durationMicros
f64 score
f64 selectedWeight
f64 eligibleWeight
u64 selectedCount
u64 eligibleCount
```

Go validates count values before converting to platform `int` fields.

---

## 10. Handshake

The startup handshake is mandatory and precedes all analytical frames.

Go sends a `HandshakeRequest` containing:

- protocol major/minor required by the host;
- host maximum frame size;
- required operation IDs and schema IDs;
- host feature flags.

Rust returns a `HandshakeResponse` containing:

- protocol major/minor implemented;
- engine version;
- worker maximum frame size;
- supported operation/schema registry;
- supported feature flags.

Go validates all mandatory capabilities before marking production analytics healthy.

Any required protocol/schema mismatch results in:

```text
Rust Analytics Engine Unavailable / protocol mismatch
```

There is no automatic v1 retry and no Go analytics substitution.

---

## 11. Go-side scheduler and backpressure

The current call-wide mutex evolves into one IPC-owner worker loop plus a bounded submission queue.

Canonical capacity:

```text
1 active analytical batch
2 waiting analytical batches maximum
```

Waiting jobs contain references/typed input and small scheduling metadata only. They **must not** pre-encode large binary frames.

Encoding happens only when a job becomes active.

Admission behavior:

```text
queue has room
  -> accept

queue full, caller context still live
  -> wait for bounded admission

context canceled/deadline before admission
  -> return context error; nothing reaches Rust
```

The queue is not exposed as a user setting in v2.0.

### Health path

The HTTP/UI health endpoint must not enqueue a heavy analytical operation. It reads cached component state maintained by the transport/supervisor:

- worker process status;
- handshake status;
- protocol/version;
- in-flight state;
- queue depth;
- last successful response timestamp;
- last sanitized worker error.

Thus a long calculation cannot make the component-health UI itself wait behind the analytical queue.

---

## 12. Cancellation and hard failure behavior

### Canceled while waiting

Drop the job before encoding and return the caller's context error.

### Canceled while active

Normal user/request cancellation does **not** kill the Rust process.

The caller may return its context error while the IPC-owner loop continues to drain the already-issued response. That result is discarded if nobody is waiting for it. Only after the frame is drained may the next queued job execute.

### Hard worker watchdog

A separate internal hard watchdog protects against an actually hung worker. Initial v2.0 default:

```text
10 seconds for the current migrated analytical batch
```

A hard watchdog expiry, broken pipe, malformed frame, impossible response ID, or worker exit marks the worker unhealthy, kills/cleans the process if required, and forces restart + handshake before further analytical publication.

No partial derived analytics are finalized after a required Rust failure.

---

## 13. Buffer and memory policy

### Frame budget

```text
Hard request/response frame cap     128 MiB
Target 1M deterministic request     <=64 MiB
Waiting pre-encoded frames          0
```

Go reuses encoder buffers, but a buffer with capacity greater than 64 MiB is not retained in the normal pool after the request. Rust applies the same policy to oversized receive buffers.

This prevents a one-time unusually large request from permanently inflating steady-state memory.

There is no silent frame chunking in v2.0. An oversized request returns a typed host-side error such as:

```text
analytics_frame_too_large
```

A future explicit chunking design may be added only when operation semantics define how chunks combine.

---

## 14. Safe decode strategy

Rust v2.0 does not use raw pointer casting or unchecked slice reinterpretation.

The decoder:

1. reads the fixed header;
2. validates all lengths before allocation/growth;
3. reads exactly the declared remaining frame bytes;
4. validates descriptor regions;
5. validates schema-specific counts and offsets;
6. creates borrowed byte views over validated regions;
7. decodes numeric values using little-endian byte conversion/iterators;
8. validates dictionary UTF-8 and indices;
9. passes schema views into analytical kernels.

The hot path avoids per-row structs while preserving Rust memory safety.

If profiling later proves safe decoding itself is a major bottleneck, a separate reviewed design is required before introducing any `unsafe` optimization.

---

## 15. Rust execution concurrency

v2.0 parallelizes **independent operations in one batch**, not floating-point reductions inside a single operation.

Reason: intra-operation parallel reductions can alter floating accumulation order and threaten exact deterministic parity.

Adaptive rule:

```text
small batch / low element count -> sequential
large batch with >=2 independent operations -> parallel operation execution
maximum worker operation threads = min(available CPUs, operation count, 4)
```

Initial large-batch threshold: combined analytical element count >=100,000.

The exact threshold may be tuned from profiling without changing protocol semantics.

Each kernel remains deterministic internally. Response slots are emitted in request SlotID order.

---

## 16. Error isolation

A malformed frame is a connection-level failure.

A valid frame with one semantically invalid operation is not automatically all-or-nothing.

Example:

```text
slot 1 distribution_similarity  OK
slot 2 item_volatility          INVALID_INPUT
slot 3 cluster_volatility       OK
slot 4 selection_probability    OK
```

The caller receives each operation result/error separately. A higher-level business transaction may still choose not to publish a derived analytical set unless every required operation succeeded.

Initial typed operation status registry:

```text
0  OK
1  INVALID_INPUT
2  UNSUPPORTED_OPERATION
3  UNSUPPORTED_SCHEMA
4  MALFORMED_PAYLOAD
5  INTERNAL_ERROR
```

Optional error diagnostics are UTF-8, sanitized, and capped at 512 bytes. Raw analytical payloads are never echoed into diagnostics.

---

## 17. Observability

Production diagnostics must remain factual. v2 adds internal evidence fields such as:

```text
protocol = msl-analytics/2
workerVersion
queueDepth
inFlight
lastFrameBytes
lastBatchOperationCount
lastQueueWaitMicros
lastEncodeMicros
lastRoundTripMicros
lastWorkerComputeMicros / per-operation duration where available
lastDecodeMicros
workerRestartCount
lastSuccessfulResponseAt
lastSanitizedWorkerError
```

Diagnostics must not expose:

- Envato tokens;
- Authorization headers;
- cookies;
- browser session/local storage;
- raw authenticated requests;
- raw market payloads;
- full binary frame dumps in normal logs.

Benchmark/test tooling may emit aggregate frame sizes and timings, never credentials or real private scan history.

---

## 18. Security boundary

Rust continues to receive normalized analytical inputs only.

Credentials remain Go-owned. The binary protocol is not an excuse to move authentication material into the worker.

Validation requirements include:

- maximum frame length before allocating payload capacity;
- maximum operation count;
- checked integer arithmetic for every offset/length calculation;
- dictionary offset monotonicity;
- valid UTF-8 where schemas require strings;
- exact bitset length/cardinality consistency;
- exact column length/cardinality consistency;
- no trailing undeclared bytes within an operation payload;
- sanitized worker error text.

---

## 19. Benchmark methodology

The v2 performance gate uses the same deterministic corpus sizes:

```text
10,000
100,000
1,000,000
```

For each corpus:

1. construct deterministic typed inputs outside the measured call;
2. perform 3 warm-up batch calls;
3. perform 11 measured batch calls;
4. record median and p95 end-to-end latency;
5. record encoded request bytes;
6. record batch operation count;
7. record Go encode/decode timing where available;
8. record Rust operation duration evidence;
9. verify numerical parity on the same corpus;
10. reject performance publication if parity fails.

The primary gate is the v2 **end-to-end batch latency**, not Rust compute-only latency.

Historical v1 benchmark evidence remains in repository QA for comparison, but v1 does not need to remain available as a production runtime merely to run the v2 gate.

No speedup claim is written until measured evidence exists.

---

## 20. Test strategy

### Go tests

- exact header encode/decode golden vectors;
- operation descriptor golden vectors;
- schema encoding golden vectors;
- malformed-length/overflow rejection;
- frame hard-cap enforcement;
- bounded queue behavior;
- queue cancellation;
- active cancellation result discard/drain;
- health path remains responsive while heavy work is in flight;
- worker crash/restart behavior;
- protocol/schema mismatch typed failure;
- no v1 production fallback contract test.

### Rust tests

- exact cross-language golden frame decode/encode;
- truncated header/frame rejection;
- invalid offsets/overlap rejection;
- dictionary validation;
- bitset/cardinality validation;
- per-operation schema validation;
- batch partial error isolation;
- stable response ordering;
- deterministic analytical results;
- no unsafe decode implementation in v2.0.

### Cross-language tests

Frozen binary vectors are generated from explicit values and committed as small safe test fixtures. Go-encoded request bytes must be accepted by Rust; Rust response bytes must be accepted by Go with exact field agreement.

### Fuzz/property tests

Malformed frame fuzzing should target parsers and bounds validation. Fuzz input never contains real market history or credentials.

### Existing regression gates

The established Go/Rust/JS/i18n/responsive/privacy/security tests remain mandatory. A transport rewrite must not regress user-facing Market Autopilot behavior.

---

## 21. Cutover gate

Production changes may replace v1 only after all of the following are true:

```text
Go unit/integration tests                  PASS
Go race tests on transport/scheduler       PASS
go vet                                     PASS
Rust unit tests                            PASS
Rust clippy -D warnings                    PASS
Rust release build                         PASS
cross-language binary golden vectors       PASS
malformed-frame tests/fuzz corpus          PASS
frozen reference parity                    PASS
10K parity                                 PASS, maxDelta=0
100K parity                                PASS, maxDelta=0
1M parity                                  PASS, maxDelta=0
10K median                                 <=10 ms
100K median                                <=60 ms
1M median                                  <=500 ms
1M encoded request                         <=64 MiB
production v1 fallback scan                PASS
production Go analytics fallback scan      PASS
Windows packaged worker smoke              PASS
Windows packaged Go + Rust health smoke    PASS
```

`1M <=250 ms` is a stretch target and is not required to cut over if the <=500 ms release gate is met.

If the <=500 ms target is not met, profile first. Shared memory becomes eligible for a **new design discussion only if measurements show pipe transfer remains the dominant unavoidable cost after binary columnar encoding**.

C++ remains out of scope unless a later kernel-level profile independently justifies it.

---

## 22. Relationship to Phase C

Phase C Rust Ranking & Signal Expansion begins only after the v2 transport gate is stable enough that payload growth will not multiply known JSON/IPC overhead.

Phase C will append new operation/schema IDs for concepts such as:

```text
Observed Exposure
Market Breadth
Relative Strength
Supply Velocity
Competition Acceleration
Author Concentration
Hierarchical aggregation
```

The business interfaces remain named after those concepts, not after Rust or protocol details.

---

## 23. Expected implementation sequence

This is a design-level sequence, not the task-by-task implementation plan. The detailed TDD plan is written only after the user reviews this spec.

```text
1. Freeze v2 constants + cross-language golden frame vectors
2. Implement safe Go v2 codec
3. Implement safe Rust v2 codec
4. Implement mandatory v2 handshake
5. Implement Go single-flight scheduler/backpressure
6. Implement multi-operation batch request/response
7. Connect the four existing Engine operations to v2
8. Add cancellation/drain and hard-watchdog lifecycle behavior
9. Add factual v2 transport diagnostics
10. Run correctness/parity gates
11. Run performance profiling/gate
12. Optimize only measured bottlenecks
13. Run Windows package verification
14. Hard-cut production from v1 to v2
15. Update QA/checkpoint; then begin Phase C plan
```

---

## 24. Recovery and cross-session rule

The repository—not chat memory—is canonical.

Any future session must first read:

```text
docs/checkpoints/CONTINUE_MSL.md
docs/checkpoints/CURRENT_MSL_CHECKPOINT.md
```

Then read the active spec and implementation plan referenced by `CURRENT_MSL_CHECKPOINT.md` before changing source.

Do not reconstruct architecture from memory when the repository documents are available.

---

## 25. Written-spec review gate

The architectural choices in this document reflect decisions already delegated/accepted by the user. One written-spec review is still required before implementation planning so errors, contradictions, or accidental scope drift can be caught in a durable artifact.

After approval, the next process step is:

```text
write detailed TDD implementation plan
-> docs/superpowers/plans/2026-08-17-msl-analytics-v2-ipc-optimization-plan.md
-> commit it
-> update CURRENT_MSL_CHECKPOINT.md
-> create/use feature/analytics-v2-ipc
-> begin implementation task-by-task
```
