# Residency Seam Analysis

Status: Phase 0 research hypothesis

References:

- `kimi-k3-in-c` @ `117e9d29bde14db9742f54fb66a191fd0bf03903`
- `llama.cpp` @ `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

## Question

Where can Super-Runtime introduce K3-style explicit memory residency without rebuilding every model graph and every hardware backend?

## Finding 1: a buffer callback alone is not enough on CPU

GGML exposes extensible backend-buffer interfaces with allocation, tensor initialization, set/get, copy, and async backend operations.

However, the normal CPU math path ultimately uses direct pointers. For `GGML_OP_MUL_MAT_ID`, the CPU kernel calculates the selected expert address from `src0->data` and the expert stride, then reads the bytes directly.

Therefore a hypothetical storage buffer whose `get_tensor()` callback loads bytes on access would **not** automatically intercept CPU matrix multiplication.

The residency contract has to guarantee:

```text
needed weight range READY in the tensor's stable address space
                    |
                    v
             graph op executes
                    |
                    v
range becomes evictable when its lifetime is complete
```

This shifts the useful hook from passive buffer access toward graph scheduling / pre-execution residency.

## Finding 2: MoE already exposes the selected expert IDs

`GGML_OP_MUL_MAT_ID` has the exact shape needed for generic sparse residency:

```text
weights -> [cols, rows, n_expert]
input   -> [cols, n_expert_used, n_tokens]
ids     -> [n_expert_used, n_tokens]
```

The CPU implementation groups work by selected expert and skips experts whose selected-row count is zero.

The GGML backend scheduler already uses the same IDs when transferring MoE weights to another backend. It builds a used-expert bitset, groups consecutive IDs, and copies only those expert byte ranges.

This proves the route-selection information is available **below individual model graphs**.

### Consequence

A Super-Runtime residency layer can potentially make MoE streaming generic at the `MUL_MAT_ID` / scheduler boundary:

```text
model-specific router/graph
        |
        v
GGML_OP_MUL_MAT_ID + ids
        |
        v
Super-Runtime residency planner
        |
        +--> ensure selected expert ranges READY
        +--> batch/coalesce physical reads
        +--> optional prefetch
        +--> pin ranges for op lifetime
        +--> release/evict after safe point
        |
        v
existing CPU/GPU kernel
```

That is much better than adding a custom streaming implementation to every Qwen/DeepSeek/Kimi/Mixtral-style model class.

## Finding 3: dense weights need a different policy

Dense `MUL_MAT` has no expert IDs because the complete matrix is semantically required.

For dense layers, the useful information is graph/layer order. A residency manager can know which weight tensors the next graph nodes reference and apply a sequential policy:

```text
current layer READY
next layer PREFETCHING
older layer EVICTABLE
pinned hot/mandatory tensors stay READY
```

This resembles K3's pinned-prefix + ring policy, but the exact unit should be tensor/range groups derived from the actual model graph/container rather than a hard-coded K3 layer layout.

This supports a central Super-Runtime principle:

> Residency policy is selected by access topology, not by model brand.

Possible access classes include:

- `ALWAYS_RESIDENT` — small metadata, norms, mandatory state;
- `SEQUENTIAL` — dense layer weights walked in predictable order;
- `INDEXED_EXPERT` — MoE matrices addressed by selected expert IDs;
- `ROW_INDEXED` — embeddings / sparse lookup tables;
- `STATE` — KV/recurrent/session memory;
- `DEVICE_STAGING` — CPU/GPU transfer buffers;
- `EPHEMERAL` — activations and scratch.

## Finding 4: stable virtual addresses can coexist with low physical residency

Current llama.cpp uses file-backed mmap and tensors can point directly into mapped file ranges.

The same tree contains an OpenVINO optimization that intentionally calls `madvise(MADV_DONTNEED)` on host weight pages to drop RSS while keeping the owning allocation/address valid. That specific OpenVINO path is one-way because later recompilation would see zero-filled anonymous pages, but it proves an important structural point: **GGML tensor identity does not require all backing pages to remain physically resident**.

For file-backed model mappings on POSIX systems, a residency design can retain stable virtual addresses while using page advice/prefetch/eviction around file-backed ranges. A later access can fault the file-backed page in again.

This mechanism should be treated as one residency backend, not the universal semantics itself.

## Finding 5: `munmap` is not suitable for reusable weight eviction without remapping

`llama_mmap::unmap_fragment()` removes virtual mappings and is currently used for model ranges no longer needed after loading/offload.

If a tensor's `data` pointer may be used again, simply unmapping its bytes would leave a stale pointer. Super-Runtime therefore needs either:

1. stable mapped address + page eviction/advice; or
2. stable reserved virtual range + explicit commit/map/unmap-remap at the same address; or
3. a graph rewrite/staging mechanism that points the op at a bounded resident arena.

These are implementation strategies for the same higher-level residency contract.

## Finding 6: K3 direct-I/O and llama.cpp DIRECT_IO solve different moments

The K3 C runtime uses positioned direct I/O repeatedly during inference for streamed trunk/expert regions.

The current llama.cpp `DIRECT_IO` load mode mainly changes how model bytes are read into model/backend buffers during loading. It does not by itself create a K3-like bounded CPU resident set for every dense/MoE weight during token generation.

Therefore "llama.cpp already has direct I/O" does not eliminate Super-Runtime's core research problem.

## Proposed native residency state machine

The exact API is not frozen, but a useful semantic model is:

```text
UNMAPPED / EVICTED
       |
       | request(range, deadline, priority)
       v
INFLIGHT
       |
       | successful materialization / page-in
       v
READY
       |
       | acquire for op
       v
PINNED
       |
       | op safe-point / release
       v
READY
       |
       | budget pressure
       v
EVICTING
       |
       v
EVICTED
```

Failure must never transition a range to READY. This carries forward one of the strongest K3 correctness lessons.

The state machine is deliberately independent of whether implementation uses mmap faults, `pread`, Direct I/O, Windows file mappings, a GPU staging buffer, or a future remote-storage transport.

## Global budget manager hypothesis

Subsystems should not independently consume "their" configured GB until the process exceeds the real limit. A central byte ledger should negotiate allocations.

Conceptually:

```text
RuntimeBudget
  hard_limit
  safety_reserve

  mandatory
    metadata
    recurrent state floor
    minimum scratch

  dynamic
    sequential weight residency
    expert residency
    KV/context state
    device staging
    speculative/draft state
```

Each subsystem declares:

```text
minimum_bytes
preferred_bytes
current_bytes
reclaimable_bytes
priority
```

The planner then allocates based on measured benefit and correctness constraints.

This generalizes the K3 observation that allocating memory to the trunk can be more valuable than allocating it to a low-hit expert LRU.

## Runtime-enforced budget versus external hard ceiling

Super-Runtime needs both concepts.

### Internal budget

The runtime plans allocations, residency, cache sizes, and state sizes before and during execution.

This provides portability and graceful degradation.

### External enforcement

A benchmark must prove the process does not simply exceed the intended ceiling.

The K3 memory ladder uses Linux cgroup v2 through `systemd-run` with both:

```text
MemoryMax=<budget>
MemorySwapMax=0
```

and treats an OOM kill as a failed-to-fit data point rather than silently accepting swap.

Super-Runtime should adopt this methodology for Linux acceptance testing.

On other operating systems, the enforcement primitive may differ; the runtime's own measured RSS/working-set telemetry remains mandatory.

## build host limitation discovered

This build host uses cgroup v2, but its current root cgroup reports no explicit `memory.max`/`memory.high` ceiling and `systemd-run --scope --user` fails because there is no user session bus.

Therefore the K3 `memory-ladder.sh` hard-cap harness cannot be reused **as-is** inside this build host.

Phase 0 source analysis and synthetic correctness tests remain valid here. A later memory-budget acceptance gate will need one of:

- a CI/self-hosted Linux runner with a usable cgroup delegation;
- a container/process launcher that can create a bounded child cgroup;
- another verified hard-limit harness.

Do not substitute `ulimit -v` for this without proof: virtual-address limits interact badly with designs that intentionally reserve/map model address space larger than physical RAM.

## Process isolation strengthens the polyglot architecture

The low-memory inference worker should be considered separately from the control/API service.

A promising boundary is:

```text
Rust control/API daemon
        |
        | bounded IPC / C ABI boundary
        v
native C/C++ model worker
        |
        +-- graph/model substrate
        +-- residency manager
        +-- CPU primary backend
        +-- optional GPU backends
```

Benefits:

- the model worker has a measurable independent memory budget;
- crashes/OOMs can be isolated from the API/control process;
- model load/unload is process-lifecycle clean;
- Linux cgroup / Windows Job Object style enforcement can target the worker;
- no language crossing is required per layer/tensor operation;
- streaming across the language boundary occurs at coarse events/tokens, not tensor hot paths.

This remains a design hypothesis until the overall architecture is approved.

## Three plausible implementation seams

### Seam A — residency-aware mmap / virtual-memory policy around existing CPU weights

Keep existing graph and CPU kernels. The scheduler ensures required file-backed ranges are resident before each op and evicts safe ranges under budget pressure.

Strengths:

- minimal graph changes;
- CPU kernels keep direct pointers;
- strong fit for dense sequential and row-indexed weights;
- potentially simple first prototype.

Risks:

- OS page-cache behavior can weaken strict byte-level predictability;
- cross-platform eviction/prefetch semantics differ;
- GPU staging still needs a separate policy.

### Seam B — explicit bounded residency arena integrated with graph scheduler

Reserve/materialize selected weight ranges into runtime-owned arenas. Scheduler rewires/stages the op or maintains stable virtual regions before execution.

Strengths:

- strongest explicit accounting;
- portable semantics independent of page-cache heuristics;
- closest generalization of K3's direct-I/O arenas;
- good foundation for NVMe-aware scheduling.

Risks:

- more invasive integration with GGML scheduling/tensor addresses;
- careful lifetime/synchronization required;
- dense layers can cause heavy repeated I/O.

### Seam C — new storage-aware GGML backend/buffer type plus scheduler extensions

Create a first-class backend/buffer that represents storage-resident weights and cooperates with the scheduler to materialize required ranges on CPU/GPU backends.

Strengths:

- clean conceptual separation;
- potentially reusable across many graph architectures;
- naturally models storage as another tier/device.

Risks:

- current CPU kernels require dereferenceable host pointers, so a storage backend alone is insufficient; scheduler staging or stable virtual backing is still needed;
- highest integration complexity in GGML internals.

## Current recommendation

Do not choose only one seam yet.

The strongest direction is a **hybrid of A + C semantics**:

- model weights retain stable virtual identities where possible;
- a formal storage/residency tier exists in the scheduler's resource model;
- `MUL_MAT_ID` receives route-aware residency using its existing IDs;
- dense weights receive graph-order prefetch/eviction;
- explicit bounded arenas are used where mapping semantics cannot provide reliable control;
- the same policy feeds optional GPU selective transfer.

A small proof with synthetic GGUF data should decide how much of B is actually necessary before production architecture is frozen.
