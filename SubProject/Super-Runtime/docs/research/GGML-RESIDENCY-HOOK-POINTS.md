# GGML Residency Hook Points

Status: Phase 0 source-derived research

Canonical reference:

- repository: `https://github.com/ggml-org/llama.cpp`
- pinned revision: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

Purpose: identify the smallest generic seam where Super-Runtime can introduce bounded storage residency without adding custom streaming code to every model architecture.

## Core constraint: normal CPU kernels dereference weight pointers directly

For `GGML_OP_MUL_MAT_ID`, the CPU implementation eventually forms an expert-specific pointer from the expert dimension of `src0` and calls the vector-dot kernel on those bytes.

Conceptually:

```text
src0->data
+ selected_expert * expert_stride
        |
        v
CPU vec_dot / GEMM
```

Therefore a storage backend whose bytes are not materialized cannot rely on a passive `get_tensor()` callback to intercept the access. Before compute begins, the selected expert range must already be readable at the address the CPU kernel will dereference, or the op must be staged/rewired to a resident arena.

This rules out a simplistic design:

```text
CPU accesses tensor
        -> storage callback magically loads it
```

The useful hook must be before the op consumes the pointer.

## Generic MoE already exposes selected expert IDs

`ggml_mul_mat_id()` represents:

```text
weights: [cols, rows, n_expert]
input:   [cols, n_expert_used, n_tokens]
ids:     [n_expert_used, n_tokens] i32
output:  [rows, n_expert_used, n_tokens]
```

This is model-agnostic. Qwen, DeepSeek, Kimi, and other MoE graph builders can all eventually express routed matrix multiplication using the same op.

That means the residency problem can potentially be solved once at this semantic boundary.

## Existing GPU/offload scheduler already implements selected-expert range discovery

Inside `ggml_backend_sched_compute_splits()`, current llama.cpp has a special path when a split starts with `GGML_OP_MUL_MAT_ID` and its weight input originates in host memory.

The scheduler:

1. obtains `ids_tensor = node->src[2]`;
2. copies/synchronizes the IDs to host-visible memory;
3. constructs a used-expert bitset;
4. groups consecutive selected expert IDs;
5. calculates expert byte offsets from the tensor expert stride;
6. copies only those expert byte ranges to the destination backend.

Conceptually:

```text
MUL_MAT_ID
    |
    +--> ids
            |
            v
      used expert set
            |
            v
 contiguous expert ranges
            |
            v
 selective backend copy
```

This is direct evidence that GGML already considers expert-selective data movement a scheduler concern rather than a model-graph concern.

### Super-Runtime extraction

The same selected-range logic should be generalized from:

```text
host RAM -> GPU
```

to:

```text
storage -> CPU resident tier -> optional GPU tier
```

while preserving the existing graph op and model implementations.

## CPU-only problem: routing and expert compute may live in one graph compute call

GPU offload naturally creates a transfer boundary. A CPU-only graph can calculate router output/top-k and immediately proceed into `MUL_MAT_ID` in one scheduler invocation.

If expert weights are not already resident, Super-Runtime needs a safe boundary after selected IDs exist but before expert matrix multiplication executes.

The current generic MoE builder reveals such a semantic point.

## Generic graph builder names the selected-expert tensor

In `llm_graph_context::build_moe_ffn()`, selected experts are produced before the routed matrix multiplies.

The builder calls:

```text
cb(selected_experts, "ffn_moe_topk", il)
```

`llama_context::graph_get_cb()` turns that into a stable layer-qualified tensor name such as:

```text
ffn_moe_topk-17
```

The selected tensor is then passed into `build_lora_mm_id(...)`, which creates the later `GGML_OP_MUL_MAT_ID` operations.

The ordering is therefore:

```text
router logits/probabilities
        |
        v
selected experts / ffn_moe_topk
        |
        v
weights/normalization
        |
        v
MUL_MAT_ID gate/up
        |
        v
activation
        |
        v
MUL_MAT_ID down
```

This is a promising generic CPU-only residency seam.

## Existing eval callback can prove the seam experimentally

GGML exposes `ggml_backend_sched_eval_callback`.

Its execution semantics are useful for a research prototype:

1. scheduler asks the callback about nodes using `ask=true`;
2. when the callback marks a node as needed, the scheduler computes through that node;
3. it synchronizes the backend;
4. callback is invoked again with `ask=false`, after that node's data exists;
5. scheduler then continues to later graph nodes.

Therefore a prototype can deliberately mark `ffn_moe_topk-*` as an observation boundary:

```text
compute router/top-k
       |
       v
synchronize at ffn_moe_topk
       |
       v
read selected IDs
       |
       v
ResidencyManager.ensure(selected expert ranges)
       |
       v
continue graph into MUL_MAT_ID
```

This would allow a correctness experiment without modifying Qwen/DeepSeek/Kimi graph classes.

## Why eval callback is a prototype seam, not the final architecture

The current callback exists primarily for observation/debug-style use. Selecting a node forces synchronization and segments graph execution.

Using it permanently for every MoE layer could introduce avoidable synchronization overhead and may interfere with pipeline/backend concurrency.

It also identifies the node through runtime tensor naming if used naively. A production contract should not depend on matching strings such as `ffn_moe_topk`.

### Production direction

The prototype should answer whether this execution ordering works. If yes, promote the idea into a dedicated scheduler concept, for example:

```text
ResidencyDependency {
    op
    weight_tensor
    selector_tensor?     // IDs for sparse/indexed access
    range_class
    backend/device
}
```

or a callback/event with semantics such as:

```text
BEFORE_WEIGHT_USE
SELECTOR_READY
AFTER_WEIGHT_USE
```

The key is that it should expose semantic dependencies rather than model names.

## Proposed sparse-MoE residency transaction

For a `MUL_MAT_ID` weight tensor:

```text
SELECTOR_READY
    |
    v
read selected IDs
    |
    v
convert IDs -> physical expert ranges
    |
    v
coalesce / sort requests by storage locality
    |
    v
reserve bounded slots/pages
    |
    v
INFLIGHT reads
    |
    +-- failure -> abort op / do not publish
    |
    v
READY ranges
    |
    v
lease ranges for MUL_MAT_ID
    |
    v
compute
    |
    v
release lease at safe point
    |
    v
READY/EVICTABLE
```

This directly combines the generic GGML selector op with the transactional K3 residency lessons.

## The selected-expert set may be reused across multiple MoE matrices

A typical gated MoE FFN uses the same selected experts for:

```text
gate experts
up experts
down experts
```

The residency planner should therefore treat selected IDs as a layer-level sparse working-set event rather than independently rediscovering the same IDs for every matrix op.

Depending on container layout, a policy may prefetch the corresponding gate/up/down ranges together or sequence them according to memory pressure.

This is analogous to K3's expert object bundling, but Super-Runtime should derive range grouping from the actual container/tensor metadata rather than assume K3's six-span MXFP4 layout.

## Prefill can expose more reuse than decode

For `n_tokens > 1`, the `ids` tensor carries selected experts across a batch. The residency planner can deduplicate the union before I/O.

This mirrors K3's expert-major prefill principle without requiring K3-specific math:

```text
all token selectors
      |
      v
unique selected expert ranges
      |
      v
load once per resident transaction
```

The graph's arithmetic remains unchanged; only the residency schedule changes.

A future policy should also distinguish:

```text
decode: small selector set, latency sensitive
prefill: larger selector set, throughput/locality sensitive
```

## Dense weights need graph-order hooks instead

`GGML_OP_MUL_MAT` does not have selected IDs because the complete matrix is semantically required.

The generic information available is:

- upcoming graph-node order;
- source weight tensors;
- backend assignment;
- weight buffer usage;
- tensor physical ranges/container locations.

A dense policy can therefore operate approximately as:

```text
current op weight READY + leased
next weight PREFETCHING
older safe weight EVICTABLE
small/hot tensors pinned
```

This is the generalized equivalent of K3's pinned-prefix + sequential ring, but the unit is graph-derived ranges instead of a hard-coded model layer struct.

## Row-indexed tensors form a third access class

GGML already has `GET_ROWS` and llama.cpp has lazy-row tensor support for selected large tables.

Embeddings and similar tables should not be forced through dense or MoE policies. Their natural residency request is indexed rows/ranges.

This reinforces a Super-Runtime access taxonomy:

```text
ALWAYS_RESIDENT
SEQUENTIAL_FULL
INDEXED_EXPERT
ROW_INDEXED
STATE
DEVICE_STAGING
EPHEMERAL
```

The architecture adapter/container supplies metadata; the graph op supplies runtime access evidence; the residency manager chooses policy.

## Existing graph allocator gives useful safe-point information, but weights are different

GGML's graph allocator already tracks compute-tensor child/view counts and frees ephemeral allocations after their final graph use.

That mechanism demonstrates that graph lifetime analysis already exists for activations.

Static model weights, however, normally live outside that ephemeral allocation lifecycle. Super-Runtime should not conflate:

```text
logical tensor lifetime
```

with:

```text
physical residency lifetime
```

A model weight can remain logically alive for the entire model session while its physical pages/range move between storage and RAM repeatedly.

## Recommended prototype sequence

### Prototype A - selector boundary proof

Use a synthetic MoE GGML graph with a small storage-backed expert tensor.

Instrument an eval-callback boundary at selected-expert output and prove:

- selected IDs can be observed before `MUL_MAT_ID`;
- the callback can materialize only selected expert ranges;
- exact output matches fully resident execution;
- an unselected expert range is never loaded.

This is a research proof, not production API design.

### Prototype B - transactional failure proof

Inject:

- short read;
- delayed read;
- concurrent selector requests;
- insufficient residency slots.

Require fail-closed behavior and no stale READY state.

### Prototype C - dense sequential graph proof

Use a tiny multi-layer dense graph whose weights are stored separately and prove current/next range prefetch with a bounded resident arena.

### Prototype D - remove debug callback dependency

Once the semantics are proven, introduce the smallest dedicated scheduler hook needed to express residency dependencies without per-node forced observation/synchronization.

## Current architecture recommendation

The strongest source-derived direction is now:

```text
llama.cpp / GGML graph + kernels
          |
          | semantic ops and selectors
          v
Super-Runtime scheduler residency extension
          |
          +-- selected expert dependency (MUL_MAT_ID)
          +-- sequential dense dependency (MUL_MAT)
          +-- row-indexed dependency (GET_ROWS)
          |
          v
transactional residency manager
          |
     +----+----+
     |         |
    RAM       NVMe
     |
     +----> CPU primary
              |
              +----> optional accelerator staging
```

No model-specific streaming implementation is required for the common access classes if the scheduler can express these dependencies generically.

## Decision status

Source evidence is sufficient to justify a synthetic prototype of this seam.

It is **not yet sufficient** to freeze the exact production API, because the prototype still has to establish:

- acceptable scheduler synchronization boundaries;
- stable-address versus bounded-arena strategy on CPU;
- interaction with graph reuse;
- GPU staging under the same residency ledger;
- behavior across at least one dense model and multiple MoE families;
- hard memory accounting under an external limit.

Those should be answered experimentally before modifying the production substrate broadly.
