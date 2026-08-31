# Super-Runtime Native Substrate Boundary

Status: Task 1 substrate boundary + Task 2 memory ledger + Task 3 Linux file-residency primitive

This directory is the first production code boundary of Super-Runtime. It now contains the Task 1 native substrate boundary, the Task 2 deterministic `MemoryLedger`, and the Task 3 stable-address file-backed residency primitive for Linux. It deliberately contains **no dense/MoE policy, residency lease scheduler, API, GPU, or downstream AI-tool integration logic yet**.

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
                 └── FileResidency (Linux backend in Task 3)
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

### Codespace build tooling

Agent-Core Codespace bootstrap now restores `cmake`, `g++`, `ninja-build`, and `ccache` when they are missing. Ninja is the preferred generator for native development and llama.cpp/GGML automatically uses ccache when available, reducing repeated rebuild cost. The CMake project itself remains generator-agnostic.

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

release(page-aligned range)
  -> MADV_DONTNEED reusable pages
  -> do not munmap the reusable mapping
  -> release intentional ResidentWeights ownership
```

The Linux test uses a deterministic temporary file and verifies stable base address, correct bytes after refault, invalid-range refusal, budget refusal without ledger mutation, idempotent range accounting, and destructor cleanup. It also records `/proc/self/status` RSS as observational evidence. RSS changes are **not** a functional pass criterion because kernel reclaim timing is not a portable deterministic contract.

The public C++ class does not expose POSIX calls. Non-Linux builds currently report the backend as unsupported; a Windows implementation remains deferred behind the same semantic abstraction.

Task 3 deliberately does **not** implement leases, `READY` scheduler publication, dense graph-order policy, MoE selected-expert policy, or GPU staging. Those remain later checkpoints.

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

The policy therefore makes the one-slot safety rule executable: the next layer cannot replace/reuse current residency before explicit completion. This is a scoped dense safe-point contract, not yet a universal lease subsystem.

The focused GGML fixture uses four one-page `32 x 32` F32 dense matrices. With a three-page budget, the planner pins one layer and uses a two-slot ring; measured runtime-owned resident bytes peak at exactly `12,288` bytes and output matches the fully resident GGML baseline with `max_abs_diff = 0`. With a one-page budget, the policy switches to synchronous one-slot mode, peaks at exactly `4,096` bytes, rejects advance while the current layer is active, and again preserves `max_abs_diff = 0`.

Focused native test:

```bash
cmake -G Ninja -S . -B .build/dense-residency -DCMAKE_BUILD_TYPE=Release
cmake --build .build/dense-residency --target super-runtime-test-dense-residency --parallel "$(nproc)"
(cd .build/dense-residency && ctest --output-on-failure -R '^super-runtime-dense-residency$')
```

Task 5 proves deterministic fixed-order residency and safe one/two-slot budget behavior. It does **not** prove asynchronous I/O overlap, optimal real-model grouping, a universal lease engine, or the global worker-budget planner.

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

It does **not** mean the Super-Runtime inference runtime is complete. The next checkpoint is Task 7: a hard memory-ceiling acceptance harness that must fail closed when real external enforcement is unavailable.
