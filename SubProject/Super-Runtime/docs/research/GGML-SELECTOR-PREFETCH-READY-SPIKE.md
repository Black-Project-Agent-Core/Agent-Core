# GGML Selector-Driven Prefetch and READY Barrier Spike

> **Historical research evidence:** source observations, host paths, experiment results and proposed next steps below belong to the recorded Phase-0 work. The [master context](../SUPER-RUNTIME-MASTER-CONTEXT.md) governs subsequent decisions. See [current checkout prerequisites](../../README.md#source-checkout-reproducibility-status--8-october-2026) before trying to reproduce a reference-dependent result; this refresh neither fetched upstream references nor reran experiments.

Status: **completed research spike**
Date: 2026-08-31
llama.cpp / GGML reference: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

## Question

After a CPU MoE router has produced selected expert IDs, can Super-Runtime make only those file-backed expert ranges resident **before** `GGML_OP_MUL_MAT_ID` executes, so that the matrix operation itself performs no storage/page-fault work and still produces the same output as fully resident execution?

This spike follows the earlier executable proofs in:

- `GGML-CPU-MOE-RESIDENCY-SPIKE.md` — selector results are observable before `MUL_MAT_ID` and only selected expert slices need valid bytes;
- `GGML-STABLE-VA-FILE-BACKED-RESIDENCY-SPIKE.md` — a GGML tensor can retain a stable virtual address while file-backed physical pages leave process RSS and later refault exactly.

## Source seam

At the pinned GGML revision:

- `ggml_backend_sched_eval_callback` is declared in `ggml/include/ggml-backend.h` and provides an observation boundary after a requested node has been evaluated;
- the backend scheduler already reads `MUL_MAT_ID` IDs and discovers selected expert ranges in `ggml/src/ggml-backend.cpp` around the `ids_tensor` path;
- `ggml_backend_cpu_buffer_from_ptr()` plus `ggml_backend_tensor_alloc()` can bind a GGML tensor to externally managed host virtual memory.

The eval callback remains a **research instrument**, not the production residency API.

## Synthetic geometry

The probe used one file-backed F32 expert tensor:

```text
K             = 4096
M             = 2048
experts       = 4
bytes/expert  = 4096 * 2048 * 4 = 32 MiB
mapped bytes  = 128 MiB
n_used        = 2 experts/token
tokens        = 3
```

Router scores deterministically produced:

```text
token 0 -> experts 1, 3
token 1 -> experts 0, 3
token 2 -> experts 1, 3

selected union = {0, 1, 3}
intentional selected bytes = 96 MiB
unused expert = 2
```

Graph:

```text
router_scores
     |
     v
ARGSORT
     |
     v
ffn_moe_topk   <-- synchronized selector observation
     |
     v
MUL_MAT_ID
```

The 128 MiB file mapping was bound directly to the expert tensor, so `tensor->data` remained equal to the mapping base throughout every drop/refault cycle.

## Compared execution paths

### A. Cold demand-fault

1. Drop mapping RSS with `MADV_DONTNEED`.
2. Drop clean file-cache pages with `POSIX_FADV_DONTNEED` in this Linux environment.
3. Run the graph.
4. Observe selected IDs, but perform no residency work.
5. Let `MUL_MAT_ID` fault selected expert pages from storage.

### B. Selector-driven prefetch + READY barrier

1. Start from the same cold mapping/cache state.
2. Evaluate `ffn_moe_topk`.
3. Deduplicate selected IDs across the token batch.
4. Issue `POSIX_FADV_WILLNEED` for only the selected expert ranges.
5. Explicitly touch selected mapping pages before the scheduler may resume. This is the synchronous **READY barrier** for the research probe.
6. Resume into `MUL_MAT_ID` only after selected bytes are process-resident.

`POSIX_FADV_WILLNEED` is advisory. The explicit touch is what makes READY deterministic in this probe. Therefore this spike proves **scheduled prefetch/materialization before compute**, not full asynchronous overlap with useful compute.

## Fresh result

Representative run:

```text
DEMAND selected: 0 1 3
DEMAND READY before compute: NO
DEMAND selected cache before compute: 0.00 MiB
DEMAND unused expert2 cache before compute: 0.00 MiB
DEMAND VMA RSS before compute: 0.00 MiB
DEMAND compute-window faults: major +285 minor +1532
DEMAND VMA RSS after compute: 96.00 MiB
DEMAND page cache after compute: 96.25 MiB
DEMAND max |diff| vs warm: 0

PREFETCH selected: 0 1 3
PREFETCH READY before compute: YES
PREFETCH prefetch faults: major +3 minor +1536
PREFETCH selected cache before compute: 96.00 MiB
PREFETCH unused expert2 cache before compute: 0.19 MiB
PREFETCH VMA RSS before compute: 96.00 MiB
PREFETCH compute-window faults: major +0 minor +0
PREFETCH VMA RSS after compute: 96.00 MiB
PREFETCH page cache after compute: 96.19 MiB
PREFETCH max |diff| vs warm: 0

tensor addr stable: YES
```

Three repeated runs produced the same important invariants:

```text
cold demand compute major faults: 283 / 283 / 285
prefetch compute major faults:    0 / 0 / 0
prefetch compute minor faults:    0 / 0 / 0
READY VMA RSS:                    96.00 MiB / 96.00 MiB / 96.00 MiB
unused expert page-cache spill:   0.19 MiB / 0.19 MiB / 0.19 MiB
max output diff:                  0 / 0 / 0
```

## Interpretation

### Proven

1. Selected expert IDs can drive file-range residency before CPU expert matmul.
2. The selected working set can be process-resident while an unused expert remains absent from process RSS.
3. The selected set here is 96 MiB while the logical expert tensor is 128 MiB.
4. The READY barrier can move all page faults out of the `MUL_MAT_ID` compute window.
5. The same GGML tensor pointer survives cold-drop, prefetch, and compute.
6. Numerical output is bit-identical to the warm fully resident oracle in this fixture.

### Kernel readahead is not residency ownership

The unused expert accumulated about `0.19 MiB` of page-cache presence even though Super-Runtime never intentionally requested it. This is Linux fault-around/readahead behavior.

Therefore metrics must distinguish:

```text
intentional resident/requested bytes
process mapped RSS
kernel page-cache residency
```

Exact zero page-cache spill is not a valid correctness requirement. An earlier diagnostic with `MADV_RANDOM` eliminated the spill but caused roughly one major fault per 4 KiB page during materialization, a much worse trade-off.

### Not proven

This probe does **not** prove:

- asynchronous I/O overlapped with useful GGML compute;
- a latency or throughput improvement over demand paging;
- the final production scheduler hook/API;
- Windows residency primitives;
- GPU staging;
- quantized large-model performance.

The synchronous proof can be slower than demand paging because it deliberately pays the I/O plus callback/synchronization cost before compute. The value of the spike is semantic: **the scheduler can establish READY before the kernel dereferences weights**.

## Architecture decision extracted

For sparse routed weights, the first implementation may use this semantic contract:

```text
selector becomes available
        |
        v
ResidencyRequest(selected tensor ranges)
        |
        v
RESERVED -> LOADING -> READY
        |
        v
lease selected ranges
        |
        v
MUL_MAT_ID
        |
        v
safe completion -> release lease -> EVICTABLE
```

The production implementation should replace the eval-callback proof instrument with the smallest dedicated scheduler-owned residency hook needed to express this dependency without forcing graph-wide synchronization.

## Learning conclusion

The open research question is no longer whether CPU MoE expert bytes **can** be selected, prefetched, and made READY before `MUL_MAT_ID`. They can.

Future work here is implementation engineering: async I/O, overlap, queue depth, coalescing, platform backends, and performance tuning.
