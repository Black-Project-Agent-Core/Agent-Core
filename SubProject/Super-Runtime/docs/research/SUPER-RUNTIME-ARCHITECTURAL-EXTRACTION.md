# Super-Runtime Architectural Extraction

Status: research synthesis, not a production implementation spec.

References:

- K3 `117e9d29bde14db9742f54fb66a191fd0bf03903`
- llama.cpp `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

Statements labeled **Inference** are Super-Runtime design conclusions rather than claims made by either reference project.

## The horizon we reject

A Super-Runtime that is only:

```text
llama.cpp server + OpenAI endpoint
```

would inherit mature model execution but would not make explicit low-memory out-of-core residency its governing resource contract.

A Super-Runtime that is only:

```text
generalized kimi-k3-in-c
```

would inherit strong low-memory engineering but also inherit a purpose-built graph, checkpoint assumptions, and K3-specific state semantics.

The source evidence supports a third architecture: retain a mature multi-model compute substrate and build a universal resource operating layer around it.

## Core first principle

**Inference** — the universal scheduling unit is a **semantic byte range with an execution lifetime**, not simply a model layer or cache entry.

A schedulable range needs enough information to answer:

```text
what tensor/semantic role is this?
where is the durable backing data?
what representation is it in?
which operation/backend consumes it?
what access topology does it follow?
how expensive is materialization?
how long must the bytes stay valid?
when can they be reclaimed safely?
what ordering constraints must not change?
```

## Model Memory Fabric

**Inference** — NVMe should be modeled as one tier of a model-specific memory fabric, not described as ordinary virtual RAM.

```text
compute-local CPU state/caches
          |
          v
CPU compute-ready resident memory
          |
          +---- optional accelerator resident memory
          |
          v
bounded host residency/staging arenas
          |
          v
NVMe / local file-backed model store
          |
          v
cold/import model storage
```

The runtime controls only semantic tiers it can observe and schedule; hardware CPU cache levels remain hardware-managed.

## Tensor/Range Contract

**Inference** — normalized model tensor roles should be enriched with residency metadata. Candidate logical fields:

```text
RangeId / TensorId / ModelId
semantic tensor role
shape + dtype/quant format
container + physical byte range
alignment
access_class
layer/expert/sequence grouping
minimum live group
compute-native representation
preferred/allowed device
reclaim class
semantic order constraints
```

This is planner information, not yet a frozen ABI.

## Access classes

The combined source evidence supports at least:

```text
ALWAYS_RESIDENT
  small mandatory model/runtime objects

SEQUENTIAL_CYCLIC
  predictable dense/repeating weight groups

SPARSE_INDEXED
  routed experts selected by runtime IDs

ROW_INDEXED
  embeddings / huge lookup-output tables

STATE_RECURRENT
  fixed-size architecture recurrence across tokens

STATE_CONTEXT_GROWING
  KV/compressed-attention state that scales with positions

DEVICE_STAGING
  CPU/GPU transfer regions

EPHEMERAL
  graph scratch, activations, routed contributions
```

Classification describes semantics; backend implementation can vary.

## Residency transaction

K3 demonstrates why load intention cannot equal residency. GGML CPU kernels demonstrate why required pointers must be valid before compute.

**Inference** — native residency should have semantics equivalent to:

```text
EVICTED
  -> RESERVED
  -> LOADING
  -> READY
  -> IN_USE (lease acquired)
  -> READY/EVICTABLE (lease released)
  -> EVICTING
  -> EVICTED

load/validation failure -> INVALID/EVICTED, never READY
```

Publication of READY is a commit point.

## Lease semantics

**Inference** — every graph operation that can dereference a dynamic resident range requires a lease or equivalent scheduler-owned lifetime. Prefetch/eviction may reclaim a range only after the lease reaches a graph/device safe point.

For asynchronous GPU work, release must follow device completion semantics rather than host submission.

## Storage scheduling is separate from neural semantics

K3 proves physical reads can be sorted/deduplicated while per-token floating accumulation order remains unchanged.

**Inference** — the storage scheduler can optimize:

- physical offset order;
- file/shard grouping;
- contiguous coalescing;
- queue depth;
- read-ahead;
- next-use prefetch;
- selected-expert batching;
- CPU/GPU staging;

while the graph preserves semantic dependencies and arithmetic ordering constraints.

## Generic sparse-expert seam

GGML exposes selected expert IDs in `MUL_MAT_ID`, and its backend scheduler already reasons about selected expert ranges for device copies.

**Inference** — sparse expert residency should be introduced below model-specific graphs:

```text
model router
   -> MUL_MAT_ID + selected IDs
   -> selected expert byte ranges
   -> residency planner
      reserve / coalesce / load / validate / lease
   -> existing GGML CPU/GPU kernel
```

This avoids implementing a storage cache inside every MoE architecture class.

## Generic sequential-weight seam

Dense operations need complete matrices, but graph order reveals next use.

**Inference** — a sequential policy should derive groups from upcoming graph/tensor use:

```text
current group: READY + leased
next group: PREFETCHING if budget permits
older group: EVICTABLE after safe point
small/high-value groups: optionally pinned
```

Grouping should be generated from normalized graph/tensor roles, not K3 `trunk.bin` assumptions.

## Row-indexed huge tables

K3 ultra mode demonstrates bounded embedding-row and output-head streaming. llama.cpp already has architecture-marked lazy row reading for some tensors.

**Inference** — `ROW_INDEXED` should be a first-class policy class, but existing substrate mechanisms should be reused when they already satisfy the global budget.

## Context/state remains polymorphic

llama.cpp demonstrates compressed K3 MLA state, filtered recurrent state, and multiple architecture-specific memory implementations.

**Inference** — state remains owned by a polymorphic model-memory interface, not forced into a generic `[layer][position][K,V]` representation. The global budget controller consumes state estimates and accounting from that interface.

## Global Budget Controller

**Inference** — independent cache-size flags are not sufficient for a universal long-lived worker.

A central controller should track:

```text
hard_limit
safety_reserve
measured_rss / working_set

mandatory:
  native runtime/control floor
  model metadata/index
  minimum graph/compute buffers
  minimum architecture state

admitted:
  active sequence/context state
  speculative/draft state

reclaimable/dynamic:
  sequential weight residency
  sparse expert residency
  row-indexed staging
  device staging
```

Dynamic consumers should expose `minimum`, `preferred`, `current`, `reclaimable`, a benefit/cost signal, and safe reclaim conditions.

The optimization target is useful agent throughput and correctness inside the envelope, not maximum hit rate of one cache.

## Admission happens before expensive execution

**Inference** — a request should be admitted only after computing the full memory floor for:

```text
model
+ requested/effective context
+ parallel sequences
+ selected architecture state representation
+ graph scratch/compute
+ staging
+ minimum weight working set
+ optional speculative mode
+ safety reserve
```

The outcome is ACCEPT, negotiated REDUCE where the API contract permits it, or REFUSE. Silent context reduction is not acceptable.

## CPU-first, optional accelerator

GGML already models CPU and accelerator backends.

**Inference** — accelerator placement should be one policy outcome:

```text
CPU compute-ready host range
   + optional selected staging/offload lease -> accelerator
   + CPU remains valid fallback when accelerator is absent/insufficient
```

GPU acceleration should improve execution without becoming a compatibility requirement.

## Polyglot boundary

**Inference** — keep graph scheduling, residency state transitions, and storage hot paths native. Cross-language boundaries should occur at coarse lifecycle/request/token/telemetry events.

Candidate boundary:

```text
Future consumer adapters (deferred)
               |
               v
OpenAI-compatible/provider gateway
               |
               v
Rust control plane
  model lifecycle
  session admission
  global budgets
  policy configuration
  capabilities
  telemetry aggregation
               |
       coarse IPC / C ABI
               v
C/C++ native worker
  llama/GGML graph + model adapters
  polymorphic model state
  residency engine
  storage scheduler
  CPU + optional device backends
```

Do not cross Rust/C++ per tensor read or matrix operation.

## Worker isolation

**Inference** — a model worker process is a strong candidate boundary because it makes hard memory enforcement and measured RSS more truthful, isolates OOM/crashes from the provider gateway, and keeps load/unload lifecycle clean.

On Linux this can map naturally to cgroup enforcement; other platforms can use their own process-memory enforcement primitive. This remains a design hypothesis until implementation evidence confirms the tradeoff.

## Observability is part of correctness

K3 shows that misleading hit counts, plan-only memory figures, or overlapping timers can produce false conclusions.

**Inference** — Super-Runtime telemetry should distinguish at least:

```text
planned bytes
allocated bytes
resident/working-set bytes where measurable
peak RSS
requested semantic ranges
bytes actually read
prefetch bytes
true avoided-I/O hits
inflight ranges
leases
read/validation failures
semantic invalidation counters
context/state bytes by class
CPU/GPU staging bytes
I/O device time vs wall-clock overlap
```

An exact-weight load failure must mark execution invalid, not merely slow.

## Verification architecture implied by K3

**Inference** — build small structural fixtures before large-model experiments:

```text
sequential cyclic fixture
  proves pin/ring/prefetch and budget behavior

sparse MUL_MAT_ID fixture
  proves only selected expert ranges materialize

short/failed read fixture
  proves partial bytes are never published READY

one-slot race fixture
  proves leases prevent overwrite

physical reorder fixture
  proves storage reorder preserves semantic output

recurrent state fixture
  proves state survives token boundaries and rollback

hybrid state fixture
  proves global accounting across recurrent + compressed attention state

budget ladder fixture
  proves identical output under multiple memory caps

trace replay fixture
  proves policy simulation is independent of model rerun
```

These should use manageable synthetic GGUF data and run in ordinary CI.

## Phased implementation seam recommendation

**Inference** — do not begin with the most invasive possible GGML rewrite.

### Phase A — instrument and classify

- expose normalized tensor/range identities;
- classify access types;
- add precise budget/trace telemetry;
- build synthetic residency fixtures;
- make no hard out-of-core production claim yet.

### Phase B — scheduler-owned host residency

- add range states and leases;
- add bounded staging/residency for synthetic sequential weights and sparse `MUL_MAT_ID` experts;
- preserve existing graph/kernel semantics;
- prove output identity under memory caps.

### Phase C — choose production backing mechanism from evidence

After Phase B, decide whether production needs primarily:

- stable file-backed mappings plus explicit page residency control;
- bounded arenas plus scheduler staging/rewiring;
- or a first-class storage-aware GGML buffer/backend cooperating with the scheduler.

The decision should be benchmark-driven.

## What not to rebuild without evidence

Current source evidence does not justify rebuilding:

- the multi-architecture registry;
- GGUF conversion ecosystem;
- K3 neural graph;
- broad quantized kernel libraries;
- CUDA/Metal/Vulkan/SYCL backend ecosystems;
- generic KV/recurrent memory abstractions;
- agent framework internals.

The unexplored value remains resource-aware execution across those capabilities.

## Current architecture statement

**Inference** — Super-Runtime is best defined as:

> a model-agnostic resource operating layer for local inference, built around a mature multi-architecture compute substrate, that makes weight/state residency, storage I/O, device placement, and process memory explicit schedulable resources behind a narrow native runtime boundary.

This is narrower and stronger than "another inference engine" and broader than "a K3 fork".
