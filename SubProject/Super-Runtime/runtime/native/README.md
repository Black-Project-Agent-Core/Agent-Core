# Super-Runtime Native Substrate Boundary

Status: Task 1 production boundary

This directory is the first production code boundary of Super-Runtime. It deliberately contains **no residency, memory-ledger, model-policy, API, GPU, or downstream AI-tool integration logic yet**.

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

## Scope boundary after Task 1

Passing this contract means only:

> Super-Runtime has a real, reproducible production native boundary linked to the pinned llama.cpp/GGML CPU substrate.

It does **not** mean the Super-Runtime runtime itself is complete. The next checkpoint after Task 1 is the deterministic `MemoryLedger`; it must not be implemented as part of this task.
