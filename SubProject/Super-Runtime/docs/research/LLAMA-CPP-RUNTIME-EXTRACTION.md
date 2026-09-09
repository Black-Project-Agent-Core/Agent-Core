# llama.cpp Runtime Extraction Notes

Reference: `research/references/llama.cpp`
Pinned revision: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

Purpose: determine what Super-Runtime should reuse conceptually or technically instead of rebuilding a mature multi-architecture compute ecosystem from zero.

## Major finding

The current reference is substantially closer to Super-Runtime's desired lower layer than an older mental model of "llama.cpp = Llama-only GGUF runner" would suggest.

At the pinned revision it already contains:

- a large architecture registry covering Llama, Qwen families, DeepSeek families, recurrent/hybrid families, many MoE families, Kimi Linear, and `KIMI_K3`;
- per-architecture model classes and graph construction;
- a backend registry with CPU plus optional CUDA, Metal, SYCL, Vulkan, WebGPU, OpenCL, CANN, BLAS, OpenVINO, RPC, and other backends when built;
- CPU fallback as a normal backend, not an afterthought;
- GPU layer/tensor split configuration;
- mmap, mlock, direct-I/O load modes;
- a lazy tensor-read mechanism for architecture-marked tensors;
- context/KV/recurrent memory abstractions and memory-breakdown reporting;
- chat-template and structured-generation infrastructure;
- server/CLI surfaces.

This does **not** mean Super-Runtime should become a thin wrapper around llama.cpp. It means the burden of proof has shifted: Super-Runtime should only replace or fork a lower-layer mechanism where its requirements demonstrably exceed what the reusable substrate can express.

## Architecture model is already adapter-like

`src/llama-model.cpp` maps a declared architecture to a model implementation. The registry includes explicit variants such as:

```text
LLM_ARCH_LLAMA
LLM_ARCH_QWEN3
LLM_ARCH_QWEN3MOE
LLM_ARCH_QWEN35
LLM_ARCH_QWEN35MOE
LLM_ARCH_DEEPSEEK2
LLM_ARCH_DEEPSEEK4
LLM_ARCH_KIMI_LINEAR
LLM_ARCH_KIMI_K3
...
```

Each architecture owns its tensor expectations and graph construction rather than relying on one universal transformer graph.

This is direct evidence for a Super-Runtime design rule:

> "Model flexible" must mean a common runtime contract with architecture-specific graph/tensor adapters, not one graph with many conditionals pretending every model is the same.

## Important surprise: Kimi K3 is already implemented

The pinned reference includes `src/models/kimi-k3.cpp`.

It implements Kimi K3-specific configuration and graph behavior, including:

- KDA recurrent layers;
- MLA layers;
- cross-layer residual attention;
- latent MoE;
- SiTU activation;
- K3-specific gates and tensor geometry.

This is strategically important. Super-Runtime does not need to port the Kimi K3 graph merely to prove a multi-architecture graph layer can represent it. A mature graph implementation already exists in this reference.

What remains novel is the **residency/execution policy** that lets the extreme K3 checkpoint operate under a small explicit RAM budget.

## Backend registry already matches CPU-first + optional accelerator philosophy

The GGML backend registry registers accelerator backends conditionally, but also registers a CPU backend as a normal device.

Model parameters include:

- device list;
- number of GPU layers;
- split mode;
- tensor split;
- load mode.

This is compatible with the Super-Runtime product requirement that CPU remain a first-class path and GPUs be optional accelerators.

The implication is that a new Super-Runtime compute abstraction should not casually duplicate CUDA/Vulkan/Metal/SYCL/etc. backend ecosystems. The more valuable layer to own is likely **policy**: budget-aware placement, residency, streaming, scheduling, and fallback.

## Existing load modes

The public load-mode enum at this revision includes:

```text
AUTO
NONE
MMAP
MLOCK
MMAP_MLOCK
DIRECT_IO
```

The CLI/server surfaces expose these modes.

On Linux, `DIRECT_IO` attempts to open the file with `O_DIRECT` and falls back to buffered I/O when direct I/O cannot be used. Aligned chunks are read through temporary aligned buffers.

This overlaps with some K3 low-level I/O philosophy, so Super-Runtime should avoid treating "direct I/O" itself as a unique invention.

The differentiator is whether the runtime can decide **what to load, when, how much to keep resident, how to overlap it with compute, and how to enforce a global memory budget**.

## Existing lazy tensor mode

The loader exposes:

```text
LLAMA_LAZY_MODE_OFF
LLAMA_LAZY_MODE_AUTO
LLAMA_LAZY_MODE_ON
```

But lazy reading only applies to tensors explicitly marked by an architecture with `TENSOR_READ_LAZY`.

The source describes its current use case as on-demand row reads for things such as large per-layer embedding/engram tensors. In auto mode it only lazily reads marked tensors above 4 GiB.

This is not equivalent to K3-style route-aware expert streaming.

### Critical Kimi K3 observation

In the pinned `src/models/kimi-k3.cpp`, routed expert tensors are created without the `TENSOR_READ_LAZY` flag:

```text
ffn_gate_exps  flags = 0
ffn_down_exps  flags = 0
ffn_up_exps    flags = 0
```

Therefore the existing generic lazy-row mechanism is not, at this revision, the same as the K3 reference's explicit expert cache that loads only routed experts into a byte-budgeted arena.

This is a key gap Super-Runtime can research rather than rebuilding the entire model stack.

## mmap is useful but is not a hard RSS contract

The model loader can memory-map model regions and create backend buffers from mapped host pointers. This can avoid eager copies and lets the operating system fault pages on demand.

However, mmap by itself does not provide the same contract as K3's explicit budgeted arenas:

```text
mmap:
  virtual mapping + OS paging policy

K3-style explicit residency:
  runtime-owned byte budget + known resident set + explicit admission/eviction/prefetch
```

Super-Runtime's 8 GB target requires the second category to be measurable and enforceable. The OS page cache may still be used as a mechanism, but it cannot be the only policy if the product promises a runtime memory budget.

## Memory breakdown already exists

The reference has memory-breakdown APIs for model, context, KV/recurrent memory, and compute buffers. `common/fit.cpp` prints per-device/host memory breakdowns.

This is highly reusable conceptually. Super-Runtime should extend such accounting to include explicit storage residency classes, for example:

```text
model-metadata
resident-weights
streaming-weight-cache
KV/recurrent-state
scratch/activations
CPU staging
GPU staging
compute buffers
provider/control overhead
unaccounted
peak RSS
```

A Super-Runtime memory budget should reconcile planned allocations with measured RSS rather than merely sum requested buffer sizes.

## Kimi K3 context implementation reveals an improvement over the standalone K3 reference

The Kimi K3 implementation states that its MLA cache holds the **compressed latent** and sets the full-attention value width accordingly.

This is materially different from the standalone K3 C reference notes, whose scale test reports a large expanded MLA KV cache cost. It suggests that context-memory research should not blindly inherit the standalone K3 state layout.

Super-Runtime must evaluate the best state representation per architecture and should reuse architecture-specific compressed KV/recurrent representations when they are mathematically valid.

## Proposed reuse boundary to investigate

The strongest current hypothesis is:

```text
Super-Runtime product/control/agent contract
                |
        runtime policy layer
                |
  hard memory / residency / I/O scheduler
                |
  multi-architecture graph + compute substrate
        (potentially GGML/llama-derived)
                |
        CPU + optional devices
```

The policy layer would own what the existing reference does not currently make a first-class global contract:

- total host-memory budget;
- per-region minimum working sets;
- explicit READY/INFLIGHT/EVICTED residency state;
- access-topology-aware policies (sequential dense, sparse MoE, row lookup, output head, KV/state);
- NVMe-aware async prefetch;
- route-aware expert fetching;
- model-aware cache partitioning;
- budget-aware CPU/GPU staging/offload;
- graceful fallback when an accelerator cannot be used;
- measured RSS enforcement and telemetry.

This is a hypothesis to test, not yet the final design.

## What Super-Runtime should not rebuild without evidence

At this point, writing these from scratch would require a strong justification:

- broad architecture registry;
- GGUF metadata/tensor model ecosystem;
- basic CPU tensor kernels;
- CUDA/Metal/Vulkan/SYCL backend ecosystems;
- tokenizer/chat-template plumbing for already-supported families;
- generic KV/recurrent memory abstractions;
- generic model conversion pipeline;
- baseline server protocol handling.

The project should focus research effort on the areas where its product requirements are genuinely different.

## Next experiments

1. Determine how expert tensors are represented in the GGUF Kimi K3 conversion and whether expert slices can be addressed without materializing the whole 3-D expert tensor.
2. Trace `build_latent_moe()` to the GGML MoE ops and identify the smallest seam where route-selected expert residency could be introduced.
3. Inspect direct-I/O and lazy-row behavior under an explicit cgroup/RSS limit with a manageable synthetic GGUF fixture.
4. Determine whether the backend scheduler can accept a custom weight buffer/residency backend without invasive graph changes.
5. Inspect memory-fit/no-allocation passes to see whether Super-Runtime can negotiate a global byte budget before real allocations.
6. Compare compressed KV/recurrent memory support across target coding-model families.
