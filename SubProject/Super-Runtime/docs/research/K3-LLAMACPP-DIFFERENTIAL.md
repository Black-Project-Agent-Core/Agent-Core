# K3 vs llama.cpp Differential Study

Status: source-derived comparative research.

Pinned references:

- `kimi-k3-in-c` @ `117e9d29bde14db9742f54fb66a191fd0bf03903`
- `llama.cpp` @ `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

The purpose is not to rank the projects. It is to identify which subsystem Super-Runtime should reuse, extend, or build.

## Evidence labels

- **K3 source** — direct evidence from the pinned K3 tree.
- **llama.cpp source** — direct evidence from the pinned llama.cpp tree.
- **Super-Runtime inference** — our design conclusion.

## Model architecture representation

**K3 source** — the C engine is purpose-built around one K3 architecture and directly encodes KDA, MLA, AttnRes, latent MoE, and K3 tensor naming.

**llama.cpp source** — `LLM_ARCH_KIMI_K3` is one architecture in a broad registry. `src/models/kimi-k3.cpp` implements K3 through generic GGML graph/tensor/backend/memory infrastructure.

**Super-Runtime inference** — reuse llama.cpp/GGML as the multi-architecture graph and compute substrate. Generalizing the K3 neural graph would recreate functionality that already exists.

## K3 conversion is semantic, not only tensor renaming

**llama.cpp source** — `conversion/kimi_k3.py` performs K3-aware conversion including validation, lazy MXFP4 expert repacking, AttnRes folding, per-layer KDA/MLA metadata, A-log transformation, KDA-versus-MLA gate handling, and MLA projection transformation.

It records K3 latent-MoE/SiTU geometry and configures full-attention versus recurrent layers in normalized model metadata.

**Super-Runtime inference** — use normalized GGUF/GGML tensor roles where possible. Runtime residency should not depend on original Hugging Face K3 tensor names.

## Routed expert representation

**K3 source** — routed experts are independent physical byte runs and only selected experts are loaded into a bounded cache.

**llama.cpp source** — converted expert matrices are stacked tensors consumed by `GGML_OP_MUL_MAT_ID`. Selected expert IDs are explicit inputs to the op. The CPU path groups work by selected expert and ignores unselected experts; the backend scheduler already uses those IDs when selectively copying expert ranges to another backend.

**Super-Runtime inference** — `MUL_MAT_ID` is the strongest generic sparse-residency seam. Expert streaming should be introduced below individual model graphs.

## Host expert hard-cap residency is still a gap

**K3 source** — host expert bytes may remain absent until selected. K3 owns admission, LRU/prefetch, aligned slots, physical reads, and publish state.

**llama.cpp source** — at the pinned revision K3 expert tensors are not marked with the generic architecture `TENSOR_READ_LAZY` row-reading mode, and normal CPU compute expects dereferenceable weight pointers. Selective expert device copying is not equivalent to a bounded host expert cache during generation.

**Super-Runtime inference** — preserve GGML expert IDs/tensor identity but add a host/runtime residency mechanism that guarantees selected expert ranges are READY before CPU/GPU execution.

## Dense/sequential weight residency

**K3 source** — deterministic trunk weights use packed per-layer runs, a pinned prefix, one/two-slot streaming ring, and next-layer prefetch.

**llama.cpp source** — ordinary weights can be resident, mmap-backed, offloaded, or read with direct-I/O load mode. Generic lazy mode applies only to architecture-marked row-lazy tensors rather than arbitrary dense graph weights.

**Super-Runtime inference** — add graph-order-aware sequential residency below model-specific graph code. The grouping unit should be derived from GGML/GGUF tensors and graph use rather than K3 `trunk.bin` assumptions.

## Direct I/O: same primitive, different lifetime

**K3 source** — positioned direct I/O repeatedly materializes trunk/expert data during inference into bounded runtime arenas.

**llama.cpp source** — `LLAMA_LOAD_MODE_DIRECT_IO` attempts direct I/O while loading model bytes into tensor/backend buffers and falls back when necessary.

**Super-Runtime inference** — low-level direct-I/O machinery may be reusable, but the distinctive problem is runtime residency lifetime and scheduling, not the existence of `O_DIRECT`.

## mmap: useful mechanism, insufficient policy

**llama.cpp source** — mmap offers stable virtual addresses, page faulting, and advice mechanisms.

**K3 source** — K3 favors explicit positioned/direct reads for the extreme checkpoint so resident capacity and storage bytes can be measured directly.

**Super-Runtime inference** — mmap can be one implementation backend but not the semantic contract. A hard worker budget still needs explicit accounting, policy, and external enforcement.

## MLA context state: llama.cpp is materially more memory efficient

**K3 source** — standalone incremental K3 caches expanded per-head K/V plus the shared 64-value slot in fp32:

```text
~2,365,440 bytes / position across 24 MLA layers
```

**llama.cpp source** — K3 conversion/graph normalizes MLA around compressed latent state. It sets full-attention layers to one KV head and uses compressed key geometry:

```text
kv_lora_rank + qk_rope = 512 + 64 = 576 values
```

The absorbed MLA path uses a K-only cache arrangement; `llama_kv_cache` detects MLA and can omit a separate value cache.

With default F16 cache type, the approximate footprint is:

```text
24 * 576 * 2
= 27,648 bytes / position
= ~27.648 KB / position
```

Relative to standalone K3 expanded fp32 state:

```text
2,365,440 / 27,648 ~= 85.56x smaller
```

**Super-Runtime inference** — do not inherit standalone K3's expanded context layout. Reuse architecture-native compressed state through the llama memory substrate and account it globally.

## Recurrent KDA state: semantic filtering is cleaner in llama.cpp

**K3 source** — the CLI normal/incremental allocation reserves one recurrent state slot for every bound layer, including MLA layers that do not semantically need KDA state.

**llama.cpp source** — K3 is classified as a hybrid architecture. Hybrid memory filters attention memory to non-recurrent layers and recurrent memory to recurrent layers. K3 conversion marks KDA layers as recurrent/no-KV and MLA layers with attention geometry.

**Super-Runtime inference** — llama's hybrid/recurrent memory is a better universal substrate for state layout and accounting.

## Context memory abstraction

**K3 source** — state handling is faithful and powerful but K3-specific.

**llama.cpp source** — `llama_memory_i` explicitly treats KV as one kind of model memory among ordinary KV, recurrent, hybrid, sliding-window, indexed/sparse, and architecture-specific variants. It includes state read/write and memory breakdown behavior.

**Super-Runtime inference** — reuse the polymorphic model-memory interface and add global admission/tiering policy above it rather than inventing one generic KV array.

## Tensor/binding contracts

**K3 source** — `Plan` validates required tensors before reading and reuses the same semantic plan for resident and streamed memory.

**llama.cpp source** — model classes and conversion describe normalized tensor roles/geometry, while the loader validates container/tensor properties.

**Super-Runtime inference** — enrich normalized tensor roles with residency metadata: access class, backing byte range, alignment, group/minimum live set, device affinity, and safe reclaim condition.

## Packed compute

**K3 source** — MXFP4 expert bytes remain packed through cache and execute in packed kernels.

**llama.cpp source** — K3 conversion repacks routed experts into GGML MXFP4 and GGML provides quantized expert kernels/backends.

**Super-Runtime inference** — residency must preserve backend compute-native quantized formats rather than introduce dequantization as a mandatory materialization step.

## CPU/GPU ecosystem

**K3 source** — focused optimized CPU implementation with x86/ARM/portability work.

**llama.cpp source** — CPU is a first-class backend and a mature optional accelerator ecosystem exists.

**Super-Runtime inference** — use the existing backend ecosystem; own placement, budget, residency, and fallback policy.

## Correctness methodology

**K3 source** — small structural fixtures, full tiny-model oracle, real-layer checks, real full-logit comparisons, regression tests, and history-derived corruption invariants form a strong verification stack.

**Super-Runtime inference** — adopt the methodology for new substrate-agnostic residency fixtures while relying on the llama ecosystem for broad graph/model semantics.

## Memory enforcement

**K3 source** — internal budgets are checked externally with cgroup hard ceilings and swap disabled; output identity is part of memory-ladder acceptance.

**llama.cpp source** — memory breakdown and fit/admission logic are rich, but memory estimation is not the same as a process hard ceiling.

**Super-Runtime inference** — combine llama memory introspection with K3-style external hard-cap acceptance.

## Summary matrix

| Concern | K3 strength | llama.cpp strength | Super-Runtime action |
|---|---|---|---|
| K3 neural graph | faithful purpose-built implementation | K3 already supported in multi-model graph | reuse llama graph/model adapter |
| broad model families | not goal | mature architecture registry | reuse llama |
| CPU/GPU kernels/backends | focused CPU | broad backend ecosystem | reuse llama/GGML |
| K3 conversion | direct released-checkpoint loader | semantic GGUF conversion | reuse llama conversion/roles |
| expert ID visibility | explicit router/cache | `MUL_MAT_ID` IDs below graph | use GGML seam |
| host expert hard-cap residency | explicit | no equivalent K3 host arena at pinned rev | build Super-Runtime layer |
| sequential weight streaming | explicit ring/prefix | ordinary load/mmap, not same runtime policy | build generic graph-order residency |
| direct I/O during inference | explicit | primarily load-mode primitive | extend/adapt under scheduler |
| MLA state | expanded fp32 speed-oriented | compressed/K-only cache | reuse llama state |
| recurrent state | K3-specific | hybrid/recurrent polymorphism | reuse llama + global budget |
| access traces/policy simulation | explicit | not same first-class workflow | add Super-Runtime telemetry |
| hard-cap benchmark | explicit methodology | fit/breakdown | combine both |

## Recommended ownership boundary

**Super-Runtime inference**:

```text
llama.cpp / GGML owns
  architecture semantics
  graph construction
  normalized model tensor roles
  quantized compute kernels
  CPU + optional accelerator backends
  polymorphic KV/recurrent memory primitives

Super-Runtime owns
  global worker memory envelope
  access-pattern classification
  tensor/range residency metadata
  residency transactions + leases
  runtime storage scheduler
  sequential dense-weight policy
  sparse expert policy using MUL_MAT_ID IDs
  storage-locality prefetch/coalescing
  context admission across weights + state
  policy-independent access traces
  hard-cap validation + telemetry
  truthful provider/agent capacity/error surface
```

This is currently the strongest source-supported separation of responsibility.
