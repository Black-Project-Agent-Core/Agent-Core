# Super-Runtime Native Substrate Boundary

Status: Task 1 substrate boundary + Task 2 memory-ledger foundation

This directory is the first production code boundary of Super-Runtime. It now contains the Task 1 native substrate boundary and the Task 2 deterministic `MemoryLedger`. It deliberately contains **no file-residency, model-policy, API, GPU, or downstream AI-tool integration logic yet**.

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
                 └── MemoryLedger
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

## Scope boundary after Task 2

Passing Task 1 + Task 2 means only:

> Super-Runtime has a reproducible native CPU substrate boundary and a deterministic thread-safe memory ownership ledger.

It does **not** mean the Super-Runtime inference runtime is complete. The next checkpoint is Task 3: the stable-address file-backed residency primitive.
