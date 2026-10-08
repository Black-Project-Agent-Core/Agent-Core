# Kimi K3 Runtime Extraction Notes

> **Historical research evidence:** source observations, host paths, experiment results and proposed next steps below belong to the recorded Phase-0 work. The [master context](../SUPER-RUNTIME-MASTER-CONTEXT.md) governs subsequent decisions. See [current checkout prerequisites](../../README.md#source-checkout-reproducibility-status--8-october-2026) before trying to reproduce a reference-dependent result; this refresh neither fetched upstream references nor reran experiments.

Reference: `research/references/kimi-k3-in-c`
Pinned revision: `117e9d29bde14db9742f54fb66a191fd0bf03903`

This document records source-derived findings from the pinned K3 reference. It intentionally separates reusable runtime principles from Kimi-specific neural architecture.

## Baseline validation in this build host

Command:

```bash
make -j"$(nproc)" test
```

Result: exit code 0.

The weightless suite passed the kernel, cache, safetensors, model-stream, configuration, scale, trunk-streaming, and tiny full-model oracle gates. Tokenizer parity was explicitly reported as not run because `tiktoken.model` ships with the checkpoint rather than the repository.

This validates an important methodology for Super-Runtime: correctness can be gated with small, structurally faithful synthetic fixtures rather than requiring a massive production checkpoint for every test.

## What K3 actually does with memory

The K3 architecture documentation reports:

- routed experts: about 1.45 TB, never resident, streamed in MXFP4;
- dense trunk: about 108.81 GB, resident or streamed;
- embedding/final norm/lm_head: about 4.70 GB, normally resident;
- recurrent state: about 626 MB reported in the architecture overview;
- MLA KV cache: about 2.37 MB per position when incremental mode is used.

The source and performance documentation therefore support a crucial distinction:

```text
weight-storage size != mandatory resident memory != context/state memory
```

Super-Runtime should preserve that distinction explicitly.

## Reusable principle: explicit byte budgets

`k3_cache_init()` receives `budget_bytes`, derives the actual expert slot size from checkpoint geometry, rounds slot stride for direct-I/O alignment, and calculates the number of cache slots from the byte budget.

It refuses a budget that cannot hold at least `topk + 1` expert slots. This is a correctness guard, not only a performance preference: the cache must not evict an expert still needed by the current token.

Reusable idea:

- budget in bytes, not vague presets alone;
- calculate actual capacity from the loaded model/container geometry;
- validate the minimum live working set before execution;
- do not let a memory optimization silently break semantic correctness.

## Reusable principle: packed-weight residency

Routed experts stay in native packed MXFP4 form and are multiplied without first materializing full fp32 matrices.

K3 documents one routed expert as roughly 17.55 MB packed versus roughly 132 MB if dequantized to fp32. Widening streamed weights would destroy the low-memory design.

Reusable idea:

> A storage format should remain compute-consumable as deep into the hot path as possible. Avoid temporary full-precision materialization when a kernel can consume the quantized representation directly.

The exact MXFP4 format and kernels are K3-specific, but the principle is general.

## Reusable principle: I/O policy follows access pattern

K3 intentionally uses different cache policies for two different access patterns.

### Trunk

The trunk is walked in deterministic layer order. K3 therefore uses:

- a pinned prefix of layers;
- a small streaming ring for the rest;
- asynchronous prefetch of the next layer when at least two ring slots fit.

The source explicitly rejects LRU for this cyclic sequential scan because it would evict exactly the layer needed on the next cycle.

### Routed experts

Expert access is data-dependent. K3 uses an expert cache and batch prefetch instead.

Reusable idea:

> Cache policy must be chosen from the workload's access topology, not selected globally as "LRU everywhere".

Super-Runtime should classify weight regions by access behavior before assigning residency and eviction policy.

## Reusable principle: budget-aware asynchronous I/O

K3 requests a two-slot trunk ring so layer N+1 can be read while layer N is computed. However, it falls back to one slot if the byte budget cannot pay for two.

The one-slot case disables the asynchronous reader entirely. The source records that running the reader with one slot can overwrite the layer still being computed and produce plausible but wrong tokens.

Reusable idea:

- asynchronous prefetch is permitted only when ownership/lifetime rules make overlap safe;
- a performance path must have a correctness-preserving synchronous fallback;
- resource budgets must constrain concurrency, not be ignored by it.

## Reusable principle: publish residency only after successful I/O

The expert batch path reserves work, performs reads, and only then publishes successful residents. K3 source comments describe prior bugs where publishing too early could cause a failed read to be treated later as a cache hit containing valid data.

The trunk regression tests similarly require a truncated read to leave the target layer unpublished and existing bindings unchanged.

Reusable idea:

> "Resident" is a committed state transition, not an intention to load.

Super-Runtime should make loading state explicit, e.g. EMPTY -> INFLIGHT -> READY, with failure returning to a non-resident state.

## Reusable principle: storage-aware batching

The expert batch path can issue top-k misses concurrently rather than serially. K3 also has a prefill path that collects unique experts across a token chunk, fetches an expert once, and reuses it for every token in the chunk that selected it.

Reusable idea:

- coalesce storage requests when model semantics allow it;
- distinguish decode access from prefill/batched access;
- schedule by physical/storage locality when it does not alter mathematical ordering.

## Reusable principle: direct positioned I/O with portability fallback

The K3 I/O shim supports the same semantics across platforms using different mechanisms:

- Linux: `O_DIRECT` and `pread`;
- Darwin: `F_NOCACHE` plus native positioned reads;
- Windows: `FILE_FLAG_NO_BUFFERING` and `ReadFile` with `OVERLAPPED` offsets.

Direct I/O is treated as a performance path, while correctness is preserved with buffered fallback where possible.

Reusable idea:

- use positioned reads for concurrency without shared file-pointer races;
- separate correctness from cache-bypass optimization;
- expose storage capabilities rather than hardcoding one OS behavior.

## Reusable principle: aligned arenas and huge-page awareness

K3 aligns direct-I/O arenas and on supported systems advises huge pages. The source rationale is not generic "huge pages are faster"; it specifically targets page-pinning overhead from very large direct-I/O transfers.

Reusable idea:

> Alignment and page strategy should be driven by the actual I/O/device backend and measured pin/copy overhead, not treated as a universal toggle.

## Reusable principle: measurement is part of the runtime contract

The K3 performance documentation distinguishes requested budgets from measured peak RSS and explicitly says the peak-RSS figure is authoritative.

The code records cache hits/misses, bytes read, load time, prefetch accounting, trunk bind timing, and peak process RSS. The documentation also warns about a large timing noise floor and distinguishes byte/count evidence from stopwatch evidence.

Reusable idea for Super-Runtime:

- memory-plan forecast;
- measured current/peak RSS;
- bytes read by weight class;
- cache/prefetch hit accounting;
- I/O time and effective bandwidth;
- scratch/KV/state allocation;
- cold-start versus steady-state throughput;
- repeated benchmark samples before performance claims.

## Critical finding for AI-agent workloads: KV/context can dominate

The K3 `scale_test` reports MLA KV at about 2.37 MB per position for its architecture. It prints approximately 19.38 GB at 8,192 positions and roughly 310.04 GB at 131,072 positions.

This is the strongest reason Super-Runtime cannot focus only on out-of-core model weights. A coding agent can accumulate system instructions, tool schemas, repository fragments, test output, diffs, and history. Weight streaming alone does not guarantee a low-memory agent runtime.

Super-Runtime therefore needs a separate context/state research track covering:

- KV/state representation and quantization where supported;
- bounded context policy;
- repository retrieval/indexing instead of blindly stuffing whole repositories into context;
- prompt/session compaction;
- state persistence and rehydration;
- architecture-specific recurrent state;
- correctness when context state is paged, compressed, or rebuilt.

## K3-specific elements that must not become universal assumptions

The following are part of the Kimi K3 neural architecture or released checkpoint contract and should remain behind a Kimi-specific adapter if Super-Runtime ever supports it:

- Kimi Delta Attention (KDA);
- Gated MLA geometry and NoPE behavior;
- Stable LatentMoE ordering;
- 896 experts with top-16 routing;
- K3-specific routing-bias semantics;
- K3-specific MXFP4 tensor layout/nibble convention;
- K3 safetensor tensor names;
- K3 `config.json` schema;
- K3 tokenizer contract;
- K3 layer map and residual-block rules.

## Design consequences for Super-Runtime

The reference strongly suggests the universal runtime should have distinct abstractions for at least:

1. model architecture / graph adapter;
2. model container / tensor locator;
3. quantization-aware kernel/backend;
4. residency and memory-budget manager;
5. storage scheduler / positioned-I/O backend;
6. access-pattern-specific cache policy;
7. scratch/activation allocator;
8. sequence state / KV manager;
9. device scheduler (CPU primary, optional accelerators);
10. metrics and benchmark instrumentation.

These are research conclusions, not yet the final production architecture. They must be compared against multi-model runtimes before the implementation plan is frozen.

## Next research questions

The K3 study makes the next questions sharper:

- Can a single residency API support dense sequential layers, sparse MoE experts, embeddings, output heads, and KV/state without hiding fundamentally different policies?
- Which existing multi-architecture runtime gives the best reusable graph/tensor/kernel layer while allowing Super-Runtime to own hard memory budgeting?
- How should a model adapter describe access topology so the runtime can choose pin/ring/cache/prefetch policies automatically?
- Can the memory manager expose a global byte budget while negotiating per-subsystem minimum working sets?
- How should optional GPU offload share the same budget model without making CPU fallback a second-class code path?
