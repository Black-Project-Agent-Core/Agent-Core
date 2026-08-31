# Super-Runtime Foundation Specification

Status: Approved
Date: 2026-08-31

## 1. Product definition

Super-Runtime is a standalone CPU-first local inference/runtime product. It is not a downstream AI-tool fork, a Kimi K3 port, or a thin llama.cpp launcher.

Downstream AI-tool integrations are a later phase. Their repositories and internal architecture are not prerequisites for designing or implementing the runtime core.

## 2. Approved compute substrate

The project may use and maintain a pinned/forked llama.cpp/GGML substrate for production model graphs, tensor formats, kernels, CPU execution, and optional hardware backends.

This decision exists to avoid reimplementing mature model-family support and backend kernels. Super-Runtime must keep its own product boundary and must not reduce itself to a renamed llama.cpp server.

## 3. Super-Runtime-owned responsibilities

Super-Runtime owns the mechanisms that turn a general compute substrate into a resource-governed AI-agent runtime:

1. Global memory governance across model weights, runtime scratch, context/KV/recurrent state, caches, staging buffers, and control-plane overhead.
2. Storage-tier residency where NVMe is treated as a managed model-memory tier rather than passive file storage.
3. Access-pattern-aware policies for fixed sequential dense layers, data-dependent MoE experts, embeddings/output tables, and architecture-specific state.
4. CPU-first execution. The runtime must function without a GPU.
5. Optional GPU acceleration selected from measured device capabilities and the active budget.
6. Context-aware operation for long-running agent sessions, including bounded working context and architecture-correct KV/recurrent-state handling.
7. A narrow native runtime/control surface for budgets, devices, telemetry, lifecycle, and test harnesses; downstream compatibility adapters are deferred.
8. Measurement-first correctness: a low-memory mode is accepted only when output parity/correctness gates and measured memory ceilings prove it.

## 4. Core architecture

```text
+-----------------------------------------------------------+
|            Future integration adapters (deferred)         |
|      downstream AI tools must not shape runtime internals  |
+-------------------------------+---------------------------+
                                |
                    Compatibility / Native API
                                |
+-----------------------------------------------------------+
|                 Super-Runtime Control Plane               |
| model lifecycle | budgets | capability discovery | policy |
| sessions | telemetry | health | configuration             |
+-------------------------------+---------------------------+
                                |
+-----------------------------------------------------------+
|                 Native Runtime Worker                     |
|                                                           |
|  llama.cpp/GGML substrate    Super-Runtime residency      |
|  model graphs & kernels   <-> governor / storage policy   |
|                                                           |
|  context memory              scheduling / staging         |
|  KV / recurrent state     <-> RAM / NVMe / GPU tiers      |
+-------------------------------+---------------------------+
                                |
                         CPU is mandatory
                         GPU is optional
```

## 5. Model universality

Model families are supported through the model/graph substrate and architecture-specific metadata, not by forcing checkpoints through a Kimi-specific graph.

The runtime must permit model families such as Llama, Qwen, DeepSeek, Kimi, and future GGML-supported architectures without requiring the runtime core to be redesigned.

Architecture-specific state representation remains architecture-specific. A global memory governor manages those implementations through common accounting/policy interfaces instead of pretending every model has identical KV or recurrent state.

## 6. Residency model

The central design goal is to separate virtual model addressability from physical residency.

A tensor may remain addressable by the graph while only a bounded subset of its backing pages or staged ranges is physically resident. The residency manager decides what must be present before an operation executes and what may be evicted afterward.

### Dense/fixed-order weights

Dense layer walks are predictable. Policies may use pinned prefixes, deterministic rings, look-ahead prefetch, or other fixed-order strategies. Ordinary LRU is not assumed to be appropriate for cyclic scans.

### MoE weights

MoE selection is data-dependent. GGML's `MUL_MAT_ID` already exposes selected expert IDs, creating a generic seam for expert-aware prefetch/staging/residency. Super-Runtime should exploit this generic op boundary rather than add Kimi-specific expert loaders to every model graph.

### Embedding/output tables

Large tables whose access is row/chunk selective may use lazy/on-demand access when supported by the model/substrate.

## 7. Memory governance

A requested memory budget is not considered satisfied because an internal arena was sized correctly. Acceptance is based on measured process/device memory.

The budget ledger must eventually account for at least:

- resident model pages;
- explicit resident caches;
- context/KV memory;
- recurrent state;
- graph scratch/compute buffers;
- embeddings/output buffers;
- CPU/GPU staging;
- backend allocations;
- control-plane and allocator overhead.

Linux acceptance tests should use a real external cgroup memory ceiling with swap disabled where the environment permits it. Other platforms need equivalent platform-specific enforcement or conservative verification rather than a fake portable cap.

## 8. Polyglot boundary

The hot inference/data path remains native C/C++ through the GGML/llama.cpp substrate and Super-Runtime residency extensions.

A higher-level control plane may use Rust where ownership, service lifecycle, telemetry, and policy benefit from it. The final language boundary must avoid per-token cross-language chatter.

Python is allowed for conversion, fixture generation, benchmark analysis, and development tooling, not the token-generation hot path.

## 9. External integration boundary

External consumer compatibility is intentionally deferred until the runtime core is proven. The core must expose a narrow, stable native control/runtime boundary so later adapters can be added without changing storage, scheduling, model, or memory-governance internals.

The native runtime surface may expose:

- memory budget and residency policy;
- device selection/offload policy;
- model lifecycle;
- context/state telemetry;
- cache hit/miss and bytes-read metrics;
- measured memory/throughput statistics;
- health and capability reporting.

## 10. Correctness policy

Optimization must not silently change model semantics.

The project will prefer small structurally faithful fixtures and adversarial synthetic tests so core correctness can be tested without downloading huge checkpoints. Large-checkpoint verification is an additional gate, not the only source of truth.

Performance claims require reproducible machine provenance and repeated measurements when timing noise is material.

## 11. Reference-code policy

Research repositories remain isolated in `research/references/` and pinned to exact commits.

K3's Apache-2.0 implementation is the primary low-memory/runtime-behavior reference and may inform compatible adaptations when provenance and notices are preserved. llama.cpp/GGML is MIT licensed and approved as the production compute/model substrate. Downstream AI-tool repositories are not part of the current reference set.

## 12. Immediate implementation frontier

The next implementation work should build a minimal, testable residency prototype around the approved llama.cpp/GGML substrate before building a large control plane.

The prototype must prove these properties on small fixtures/models:

1. the graph/model remains correct while physical residency is bounded;
2. a deterministic memory ledger predicts and reports owned memory;
3. MoE selected-expert IDs can drive bounded expert staging or residency;
4. dense/fixed-order weights can be prefetched/evicted without per-model graph rewrites;
5. a minimal native test/control entrypoint can drive the runtime without bypassing its storage policy.
