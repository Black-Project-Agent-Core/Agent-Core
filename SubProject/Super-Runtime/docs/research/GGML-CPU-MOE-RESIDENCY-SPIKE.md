# GGML CPU MoE Residency Spike

> **Historical research evidence:** source observations, host paths, experiment results and proposed next steps below belong to the recorded Phase-0 work. The [master context](../SUPER-RUNTIME-MASTER-CONTEXT.md) governs subsequent decisions. See [current checkout prerequisites](../../README.md#source-checkout-reproducibility-status--8-october-2026) before trying to reproduce a reference-dependent result; this refresh neither fetched upstream references nor reran experiments.

Status: source-derived research + executed synthetic feasibility probe

Canonical reference:

- repository: `https://github.com/ggml-org/llama.cpp.git`
- pinned revision: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`
- backend exercised: GGML CPU
- model checkpoint required: no
- production code added: no

The executable used for this spike was deliberately built under `/tmp` and is not part of
Super-Runtime. This document records the result, the source seams it depends on, and the
constraints discovered by executing them.

## Question

Can a CPU-only GGML graph expose selected MoE expert IDs early enough for an external
residency manager to load only those expert weight ranges before `GGML_OP_MUL_MAT_ID`
dereferences them, without changing numerical output?

The source study suggested yes. This spike tested the claim by execution.

## Relevant canonical graph structure

The generic `llm_graph_context::build_moe_ffn()` path builds routing before expert
matmul. At the pinned revision it names the routing nodes:

```text
ffn_moe_argsort
    |
    v
ffn_moe_topk
    |
    v
GGML_OP_MUL_MAT_ID
```

`ffn_moe_topk` is built from `ggml_argsort_top_k()`. The function is not a new compact
allocation: it is a view over the leading `k` columns of a full descending argsort
result.

That distinction became important during the executed probe.

## Scheduler observation mechanism

`ggml_backend_sched_set_eval_callback()` supports two callback phases:

- `ask=true`: the scheduler asks whether this node must be observed;
- `ask=false`: after computing through that node, the scheduler synchronizes the backend
  and passes the resulting tensor to the observer.

The scheduler groups nodes until an observation boundary is requested. At an observation
boundary it computes the graph view, synchronizes the backend, and then invokes the
observer before continuing to later nodes.

The spike requested an observation at `ffn_moe_argsort`, the compute node underlying the
`ffn_moe_topk` view.

This creates the sequence:

```text
compute router / argsort
        |
        v
backend synchronize
        |
        v
residency callback
        |
        +--> read selected IDs
        +--> deduplicate IDs across token batch
        +--> populate selected expert ranges
        |
        v
resume scheduler
        |
        v
GGML_OP_MUL_MAT_ID
```

## Synthetic graph

The throwaway graph used:

- four experts;
- two selected experts per token;
- three tokens;
- small F32 expert matrices;
- F32 activation tensors;
- `ggml_argsort_top_k()` for routing;
- `ggml_mul_mat_id()` for expert multiplication.

The resulting graph nodes were:

```text
00 ARGSORT              ffn_moe_argsort
01 VIEW                 ffn_moe_topk
02 MUL_MAT_ID           moe_out
```

Two executions of the same graph semantics were compared.

### Baseline

All four expert slices were populated before graph compute.

### Dynamic residency run

The GGML expert-weight tensor started entirely zeroed.

Only after the routing observation boundary did the callback read the selected expert
IDs and copy the corresponding expert slices into the tensor. Unselected expert slices
remained zero for the entire run.

The routing batch was deliberately varied by token:

```text
token 0 -> experts 1, 3
token 1 -> experts 0, 3
token 2 -> experts 1, 3
```

Therefore the residency union was:

```text
{0, 1, 3}
```

Expert `2` was never populated.

## Executed result

The dynamic run reported:

```text
selected ids: 1 3 0 3 1 3
loaded experts: 0 1 3
selector observations: 1
loaded before MUL_MAT_ID: YES
baseline vs dynamic max |diff|: 0
```

The output of the dynamically populated run was bit-identical to the baseline that had
all expert weights populated before compute.

This is direct evidence for all of the following at this pinned GGML revision:

1. CPU graph execution can expose the routing result before `MUL_MAT_ID` executes.
2. A scheduler observation boundary can execute residency work between routing and expert
   matmul.
3. The CPU `MUL_MAT_ID` path does not require unselected expert slices to contain valid
   weights for this graph.
4. The selected-expert union can be formed across a token batch and only that union needs
   to be made valid before expert matmul.
5. Updating the selected expert ranges after routing but before `MUL_MAT_ID` does not
   change output relative to a fully resident baseline.

This proves the execution seam. It does not yet prove the final storage mechanism.

## Important discovery: `ffn_moe_topk` is strided

The first probe incorrectly read the top-k view as one contiguous array.

Observed IDs were:

```text
1 3 2 0 1 3
```

That looked like routing had selected unexpected experts. It had not.

`ggml_argsort_top_k()` constructs a view with:

```text
ne[0] = k
nb[1] = stride of the full argsort row
```

The discarded IDs still occupy the gap between visible rows. A single contiguous
`tensor_get` therefore crossed those gaps and read IDs outside the view's logical top-k
columns.

Reading each token row using the tensor's actual `nb[1]` stride produced the correct
logical values:

```text
1 3 | 0 3 | 1 3
```

### Super-Runtime consequence

A residency selector reader must never assume that a GGML tensor is contiguous merely
because its logical shape is small.

The selection extraction interface needs to carry or honor:

```text
logical dimensions
byte strides
view offset
backend placement
storage type
```

A correct residency hook should consume GGML tensor semantics rather than reinterpret a
raw pointer as a packed `int32[]`.

## What this validates in the proposed architecture

The source research proposed a generic MoE safe point:

```text
SELECTOR_READY
        |
        v
ResidencyManager::ensure(expert_ranges)
        |
        v
BEFORE_WEIGHT_USE
        |
        v
MUL_MAT_ID
```

This spike shows that the safe point is executable on the current CPU scheduler without
rewriting the model-specific graph.

The important abstraction is not Kimi K3's expert loader. It is:

```text
selector tensor
    -> logical selected IDs
    -> tensor/expert locator mapping
    -> residency leases
    -> range readiness
    -> compute continuation
```

The first two pieces are graph/backend concerns. Locator-to-range mapping belongs to the
model/container adapter. Residency and leases belong to Super-Runtime.

## Why the current eval callback is not the production API

The scheduler eval callback is useful as a proof instrument because it already guarantees
a synchronized observation boundary. It should not become the permanent Super-Runtime
contract.

Reasons:

- its API is framed as graph evaluation/observation, not residency;
- it synchronizes the backend at the observation boundary;
- its callback receives a tensor, but not an explicit residency request contract;
- relying on tensor names such as `ffn_moe_argsort` is less stable than using op/semantic
  metadata;
- production scheduling will need leases, asynchronous I/O, error propagation, and
  potentially overlap with useful compute.

The production direction should therefore be a narrow scheduler extension or equivalent
native hook with semantics such as:

```text
on_selector_ready(selector_metadata)
prepare_weight_ranges(request)
acquire_leases(request)
continue_compute()
release_leases(at safe point)
```

The experiment demonstrates where that hook can live. It does not freeze its API.

## Relationship to K3

K3 exposes the same concept explicitly through `K3ExpertSrc`:

```text
getmany(selected experts)
    -> make experts resident
get(expert)
    -> return valid pointers
```

The K3 cache also states that returned expert pointers must remain valid until the caller
finishes using the token.

GGML supplies a more general graph-level selector and `MUL_MAT_ID` operation. Combining
the two ideas gives Super-Runtime a model-independent form:

```text
GGML selected expert IDs
        |
        v
Super-Runtime range leases
        |
        v
storage-backed expert residency
        |
        v
existing GGML CPU/GPU compute
```

This is the key bridge from the K3 architecture into a multi-model runtime.

## What remains unproven

This spike deliberately did not claim more than it tested.

Still open:

1. file-backed stable virtual-address weight storage;
2. page dropping / re-residency while tensor addresses remain stable;
3. direct-I/O or async read integration at this GGML boundary;
4. lease release safe points after all consumers of an expert range finish;
5. prefetch overlap rather than synchronous callback loading;
6. quantized expert slices and backend-specific packed formats;
7. GPU-offload interaction with Super-Runtime-owned residency;
8. multiple MoE operations/layers in one graph;
9. cancellation and read failure semantics;
10. hard-RSS enforcement while these transitions occur.

Those are separate experiments. The selector-to-weight-use ordering no longer needs to be
considered hypothetical on the CPU path.

## Current architectural conclusion

For MoE models supported by the GGML graph builder, Super-Runtime does not need a
Kimi-specific routing integration just to discover which experts are required.

At the pinned reference revision, a viable generic architecture is:

```text
Architecture-specific graph
        |
        v
GGML generic MoE selector
        |
        v
selected expert IDs
        |
        v
Super-Runtime Residency Manager
        |
        v
only required expert ranges READY + LEASED
        |
        v
GGML MUL_MAT_ID
```

The next research question is no longer "can the CPU graph be intercepted in time?".
That has been demonstrated.

The next question is:

> Can the expert-weight tensor retain a stable GGML-visible address while its backing
> physical pages are dropped and restored from a file-backed store under an explicit
> residency budget?

That experiment determines whether Super-Runtime can implement K3-like out-of-core
residency beneath a reusable GGML graph without rebuilding tensor objects or model graphs.
