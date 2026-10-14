# Super-Runtime Native Substrate Boundary

Status: **Super-Runtime v0.1.0 — Milestone 1 Stable Core**

This directory is the native production core of the first Super-Runtime milestone. It now contains the pinned GGML/llama substrate boundary, deterministic memory ledger, stable-address file residency with RAII range leases, generic MoE range planning, fixed-order dense residency, global budget planning, and the unified `RuntimeEntry` lifecycle. HTTP/provider APIs, GPU runtime policy, downstream AI-tool integration, Windows residency, and broad real-model product hardening remain deferred.

## Purpose

Super-Runtime reuses llama.cpp/GGML for model graphs, tensor formats, CPU kernels, architecture support, and future optional hardware backends. Task 1 establishes a reproducible CPU-only build boundary that later Super-Runtime-owned runtime components can target without treating the research tree as an informal build convention.

The production boundary is:

```text
SubProject/Super-Runtime/CMakeLists.txt
        |
        +--> pinned llama.cpp/GGML source
        |      revision checked at configure time
        |
        +--> runtime/native/
               super-runtime-native-smoke
               super-runtime-core
                 ├── MemoryLedger
                 ├── FileResidency + FileResidencyLease
                 ├── MoeResidency planner
                 ├── DenseResidencyPolicy
                 ├── RuntimeBudgetPlan
                 └── RuntimeEntry
```

## Pinned upstream baseline

The authoritative revision is stored in `LLAMA_CPP_REVISION`:

```text
daef7b6874397a5a7c3d7e38b55e2ee0adf7da38
```

It must match both:

1. the `research/references/llama.cpp` gitlink in the Agent-Core repository; and
2. the checked-out llama.cpp source used by CMake.

CMake fails closed if the checked-out source revision differs from this pin.

## Source and patch policy

For Task 1, the production wrapper consumes the already pinned canonical llama.cpp source at `research/references/llama.cpp`. This avoids duplicating the upstream repository while the runtime boundary is still small.

Rules:

- do not edit the research reference in place as an untracked production fork;
- Super-Runtime-owned code belongs under `runtime/`;
- any future llama.cpp/GGML substrate modification must be explicit, reviewable, and provenance-preserving;
- if production patches become necessary, establish a controlled patch/fork workflow before the first patch is accepted;
- do not advance the pinned revision casually; an upstream update is a separate compatibility task with its own tests.

## License and provenance

The pinned llama.cpp/GGML reference is MIT-licensed at the recorded revision. Super-Runtime must preserve applicable upstream license and notice obligations for any redistributed or adapted upstream code.

K3-in-C remains an Apache-2.0 research reference for low-memory/runtime behavior. It is **not** linked into this Task 1 production smoke target.

See:

- `../../docs/research/REFERENCE-PROVENANCE.md`
- `../../docs/SUPER-RUNTIME-MASTER-CONTEXT.md`

## CPU-only build

From `SubProject/Super-Runtime/`:

```bash
cmake -G Ninja -S . -B .build/native \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CUDA=OFF \
  -DGGML_HIP=OFF \
  -DGGML_VULKAN=OFF \
  -DGGML_METAL=OFF \
  -DGGML_SYCL=OFF \
  -DGGML_OPENCL=OFF

cmake --build .build/native --target super-runtime-native-smoke --parallel "$(nproc)"
.build/native/runtime/native/super-runtime-native-smoke
```

Expected smoke output includes:

```text
super-runtime-native-smoke: PASS
llama.cpp revision: daef7b6874397a5a7c3d7e38b55e2ee0adf7da38
backend: CPU
```

The smoke target initializes llama.cpp, creates a real GGML CPU backend, verifies that it is a CPU backend, reports the pinned revision, and shuts both layers down cleanly. It does not load a model yet; model lifecycle belongs to a later verified checkpoint.

### Local build tooling

Install `cmake`, `g++`, and `ninja-build` in the local Linux development environment before configuring the native targets. `ccache` is optional and llama.cpp/GGML uses it when available. Ninja is the preferred generator for native development; the CMake project itself remains generator-agnostic.

## Contract test

From `SubProject/Super-Runtime/`:

```bash
bash tests/contracts/native-substrate.sh
```

The contract validates the revision pin, configures a CPU-only build, builds only `super-runtime-native-smoke`, runs it, and requires the expected revision/backend identity.

## Task 2 — deterministic MemoryLedger

`super-runtime-core` now owns the first resource-governance primitive:

```text
MemoryLedger
  hard budget
  owned total
  per-category totals
  atomic reserve/refuse
  atomic release/refuse
  mutex-protected concurrent accounting
```

The frozen Task-2 categories are:

```text
ResidentWeights
ContextState
ComputeScratch
Staging
AcceleratorMemory
RuntimeOverhead
```

The ledger deliberately tracks **runtime-owned accounting**, not process RSS or OS residency. It performs no mmap, file I/O, eviction, prefetch, page-cache inspection, or model-specific policy. Those belong to later checkpoints.

Reservation semantics are fail-closed: a reservation that would exceed the hard budget or overflow integer accounting returns `false` and does not mutate totals. Release beyond category ownership also returns `false` without mutation.

Focused native test:

```bash
cmake -G Ninja -S . -B .build/memory-ledger -DCMAKE_BUILD_TYPE=Release
cmake --build .build/memory-ledger --target super-runtime-test-memory-ledger --parallel "$(nproc)"
(cd .build/memory-ledger && ctest --output-on-failure -R '^super-runtime-memory-ledger$')
```

The test covers accepted reservations, hard-budget refusal, release and underflow refusal, category totals, uint64 overflow refusal, the invariant `owned <= budget`, and concurrent accounting.

## Task 3 — stable-address file-backed residency primitive

`FileResidency` is the first production bridge between `MemoryLedger` accounting and physical file-backed memory behavior.

Frozen Task-3 semantics:

```text
construct mapping
  -> stable virtual base address
  -> virtual mapping alone does not charge ResidentWeights

prefetch(page-aligned range)
  -> reserve newly intentional bytes in MemoryLedger
  -> Linux POSIX_FADV_WILLNEED / MADV_WILLNEED advice
  -> synchronously touch pages so the requested range is materialized
  -> publish intentional residency only after the operation succeeds

acquire_lease(READY aligned range)
  -> move-only RAII lease token
  -> per-page lease counts
  -> release/reclaim returns InUse while any covered page is leased

release(page-aligned range)
  -> first reject leased ranges before any VM or ledger mutation
  -> MADV_DONTNEED reusable pages
  -> do not munmap the reusable mapping
  -> release intentional ResidentWeights ownership
```

The Linux test uses a deterministic temporary file and verifies stable base address, correct bytes after refault, invalid-range refusal, budget refusal without ledger mutation, idempotent range accounting, RAII lease acquisition, `InUse` reclaim refusal while leased, nonresident lease refusal, and destructor cleanup. It also records `/proc/self/status` RSS as observational evidence. RSS changes are **not** a functional pass criterion because kernel reclaim timing is not a portable deterministic contract.

The public C++ class does not expose POSIX calls. Non-Linux builds currently report the backend as unsupported; a Windows implementation remains deferred behind the same semantic abstraction.

Task 3 originally stopped at backing/residency semantics. The Milestone-1 stability audit later added the generic `FileResidencyLease` primitive so a READY range can be protected against reclaim while compute owns it. Dense policy now consumes that primitive. Lease lifetime is subordinate to the issuing `FileResidency`: a token must not outlive its owner mapping. `RuntimeEntry` guarantees the required destruction order by resetting `DenseResidencyPolicy` and its lease before destroying `FileResidency`, then releasing the ledger last. A full MoE scheduler hook, shared/cross-process lease lifetime, and GPU staging remain later work.

Focused native test:

```bash
cmake -G Ninja -S . -B .build/file-residency -DCMAKE_BUILD_TYPE=Release
cmake --build .build/file-residency --target super-runtime-test-file-residency --parallel "$(nproc)"
(cd .build/file-residency && ctest --output-on-failure -R '^super-runtime-file-residency$')
```

## Task 4 — generic MoE selected-expert range planning

`MoeResidency` adds a model-family-independent planner between GGML selector semantics and the file-residency primitive. It consumes a strided logical expert-ID view plus physical expert layout metadata and produces validated, deduplicated, sorted, residency-aligned, coalesced byte ranges.

Frozen Task-4 behavior:

```text
strided selected expert IDs
  -> honor logical element/token byte strides
  -> reject negative/out-of-range IDs
  -> deduplicate selected union across tokens
  -> derive exact expert offsets from expert stride
  -> align to residency granularity
  -> coalesce overlapping/adjacent residency ranges
  -> publish plan only after complete validation
```

The planner has no Kimi/Qwen/DeepSeek/model-family switch. It uses only selector/tensor-layout metadata. Invalid IDs, invalid geometry, and arithmetic overflow fail closed with no partial output plan.

The focused GGML fixture constructs a real CPU `GGML_OP_MUL_MAT_ID` graph with four expert matrices. The selected union is `{0, 1, 3}`; expert `2` is deliberately poisoned with `NaN` in the managed copy. The planner drives `FileResidency` for only the selected ranges, charges exactly three expert pages to `ResidentWeights`, and the managed output matches the fully resident baseline with `max_abs_diff = 0`.

Focused native test:

```bash
cmake -G Ninja -S . -B .build/moe-residency -DCMAKE_BUILD_TYPE=Release
cmake --build .build/moe-residency --target super-runtime-test-moe-residency --parallel "$(nproc)"
(cd .build/moe-residency && ctest --output-on-failure -R '^super-runtime-moe-residency$')
```

Task 4 deliberately does **not** freeze the production GGML scheduler hook and does not yet implement `READY` publication or leases around `MUL_MAT_ID`. The research eval callback remains evidence, not a production API commitment.

## Task 5 — fixed-order dense residency policy

`DenseResidencyPolicy` adds deterministic `SEQUENTIAL_CYCLIC` planning above `FileResidency`. It does not use LRU. The planner first keeps the entire walk pinned when the full weight set fits; otherwise it prefers a two-slot dynamic ring and maximizes a pinned prefix under that constraint, then falls back to a one-slot synchronous ring when two slots cannot fit.

Runtime sequencing is explicit:

```text
start
  -> materialize pinned prefix

prepare(layer)
  -> require fixed graph order
  -> reject a second prepare while current is active
  -> materialize current dynamic range
  -> materialize next dynamic range when two-slot look-ahead is enabled

compute

complete(layer)
  -> safe point
  -> release current dynamic range
  -> preserve pinned prefix and any valid next-layer look-ahead
```

The policy makes the one-slot safety rule executable and now acquires a `FileResidencyLease` for the active current range. External reclaim of that range returns `InUse` until `complete(layer)` releases the lease at the safe point. The next layer therefore cannot replace/reuse or externally reclaim current residency while compute owns it.

The focused GGML fixture uses four one-page `32 x 32` F32 dense matrices. With a three-page budget, the planner pins one layer and uses a two-slot ring; measured runtime-owned resident bytes peak at exactly `12,288` bytes and output matches the fully resident GGML baseline with `max_abs_diff = 0`. With a one-page budget, the policy switches to synchronous one-slot mode, peaks at exactly `4,096` bytes, rejects advance while the current layer is active, and again preserves `max_abs_diff = 0`.

Focused native test:

```bash
cmake -G Ninja -S . -B .build/dense-residency -DCMAKE_BUILD_TYPE=Release
cmake --build .build/dense-residency --target super-runtime-test-dense-residency --parallel "$(nproc)"
(cd .build/dense-residency && ctest --output-on-failure -R '^super-runtime-dense-residency$')
```

Task 5 plus Milestone-1 lease hardening prove deterministic fixed-order residency, safe one/two-slot budget behavior, and active-range reclaim protection through the generic RAII lease primitive. They do **not** prove asynchronous I/O overlap, optimal real-model grouping, or a production MoE scheduler hook.

## Task 6 — global runtime budget planner

`RuntimeBudgetPlan` turns the resource-envelope model into deterministic admission output. Mandatory host costs are reconciled first: runtime overhead, mandatory weights, context/state, compute scratch, staging, and safety reserve. Only the remaining host ceiling is available to dynamic dense/MoE residency. Dynamic minima are mandatory; discretionary headroom uses an explicit `dense_share_percent` and never exceeds preferred targets. Optional device-memory requests are validated against separately reported device inventory.

The planner fails closed on invalid inputs, arithmetic overflow, mandatory host oversubscription, dynamic-minimum oversubscription, or device oversubscription. A failed request publishes a zero/empty plan. Unused host ceiling stays visible as `unallocated_host_bytes`; it is not counted as runtime ownership.

Focused native test:

```bash
cmake -G Ninja -S . -B .build/runtime-budget -DCMAKE_BUILD_TYPE=Release
cmake --build .build/runtime-budget --target super-runtime-test-runtime-budget --parallel "$(nproc)"
(cd .build/runtime-budget && ctest --output-on-failure -R '^super-runtime-runtime-budget$')
```

The fixture includes the required case where dynamic weights are zero/small but context state makes admission infeasible. Task 6 is a deterministic planner; it is **not** evidence that the operating system enforced the planned ceiling.

## Scope boundary after Task 6

Passing Task 1 through Task 6 means only:

> Super-Runtime has a reproducible native CPU substrate, deterministic memory ownership accounting, stable file residency, generic sparse-MoE and dense residency policy fixtures with exact GGML CPU parity, and a deterministic global host/device admission plan.

Task 7 supplies the separately documented hard memory-ceiling harness under `benchmarks/`, Task 8 supplies the unified native runtime entrypoint, and the final stability audit adds generic RAII lease/reclaim protection. Milestone 1 is closed as v0.1.0 Stable Core; no post-Milestone feature is active without explicit instruction.

## Task 8 — unified native runtime entrypoint

`RuntimeEntry` is the first coarse lifecycle boundary that composes the previously separate primitives into one execution path:

```text
load fixture metadata
  -> validate exact file/layer geometry
  -> Loaded

admit RuntimeBudgetRequest
  -> global RuntimeBudgetPlan
  -> one MemoryLedger(host ceiling)
  -> reserve actual fixed runtime/context/scratch/staging ownership
  -> FileResidency
  -> DenseResidencyPlan
  -> GGML CPU backend
  -> Admitted

execute(input)
  -> Running
  -> DenseResidencyPolicy::start
  -> prepare current/next as allowed
  -> readiness gate counted before dereference
  -> GGML CPU dense matmul
  -> complete at safe layer boundary
  -> cancellation checked between completed layers
  -> stop residency policy
  -> Completed or Cancelled

unload
  -> release residency/backend/ledger ownership
  -> current_owned_bytes = 0
  -> Unloaded
```

The entrypoint deliberately exposes only coarse lifecycle/request/telemetry operations. It does not expose HTTP/provider/tool-call protocols, does not request GPU memory, and does not bypass `MemoryLedger`.

The Task-8 deterministic fixture contains four one-page `32 x 32` F32 dense matrices. Its expected output is computed by an independent manual matrix-vector oracle. Fresh evidence reports `runtime-vs-oracle max_abs_diff = 2.91038e-11`, below the `1e-6` correctness gate. The test also proves failed context-heavy admission publishes no ownership, cancellation after one completed layer releases all intentional file residency, and final `unload()` returns ledger ownership to zero.

Focused native test:

```bash
cmake -G Ninja -S . -B .build/runtime-entry -DCMAKE_BUILD_TYPE=Release
cmake --build .build/runtime-entry --target super-runtime-test-runtime-entry --parallel "$(nproc)"
(cd .build/runtime-entry && ctest --output-on-failure -R '^super-runtime-runtime-entry$')
```

The same runtime-entry test has also passed through `benchmarks/memory-ceiling.sh` under a real 128 MiB delegated cgroup-v2 ceiling with `memory.swap.max=0` and byte-identical stdout SHA-256 parity against a fresh direct baseline.

Task 8 establishes the executable first runtime lifecycle. The subsequent Milestone-1 stability audit found and closed the missing generic active-range lease/reclaim invariant, then re-ran native, sanitizer, hard-cap, parent-repository test, and build gates. Version `0.1.0` is the first Stable core within the scope defined by `../../docs/STABILITY-AUDIT-MILESTONE-1.md`.
