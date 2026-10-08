# GGML Stable-VA File-Backed Residency Spike

> **Historical research evidence:** source observations, host paths, experiment results and proposed next steps below belong to the recorded Phase-0 work. The [master context](../SUPER-RUNTIME-MASTER-CONTEXT.md) governs subsequent decisions. See [current checkout prerequisites](../../README.md#source-checkout-reproducibility-status--8-october-2026) before trying to reproduce a reference-dependent result; this refresh neither fetched upstream references nor reran experiments.

Status: source-derived research spike, not production code.

Canonical substrate under test:

- repository: `https://github.com/ggml-org/llama.cpp.git`
- revision: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`
- backend: GGML CPU
- platform for this experiment: Linux host

The throwaway probe source lived only under `/tmp`. This document records the experiment and architectural conclusions; the spike program is not part of Super-Runtime production source.

## Question

Can a GGML weight tensor keep one stable virtual address while its file-backed physical pages are removed from the process resident set, optionally removed from the Linux page cache, and then brought back only for the expert slices actually consumed by `GGML_OP_MUL_MAT_ID`, without changing numerical output?

This is a critical feasibility question for Super-Runtime. If the answer were no, bounded weight residency on CPU would likely require relocating tensor storage or rebuilding graph pointers whenever a weight was evicted. If the answer is yes, residency can become a physical-page policy under a stable tensor identity.

## Why mmap alone is not enough

A file-backed mmap gives a stable address, but mapping a 1 TB model does not imply a 1 TB RSS. Conversely, having an mmap does not by itself give Super-Runtime a hard residency policy.

Three states must be distinguished:

1. **Virtual mapping exists**: address space contains a mapping.
2. **Process VMA is resident**: pages are mapped into this process and contribute to RSS.
3. **File page is in page cache**: the kernel may still hold file data in RAM even if this process dropped its PTE-backed residency.

The spike therefore measured VMA RSS and page-cache residency separately.

## Relevant canonical GGML interfaces

The pinned GGML revision exposes public interfaces that allow a model tensor to be backed by a caller-owned host address:

```c
GGML_API ggml_backend_buffer_t ggml_backend_cpu_buffer_from_ptr(void * ptr, size_t size);
GGML_API enum ggml_status ggml_backend_tensor_alloc(
    ggml_backend_buffer_t buffer,
    struct ggml_tensor * tensor,
    void * addr);
```

The backend header describes host-pointer buffers as useful for memory-mapped models and importing memory from other libraries.

Therefore the experiment did not mutate `tensor->data` manually and did not depend on a private GGML structure.

## Probe geometry

The file-backed weight tensor was:

```text
K      = 4096
M      = 2048
experts = 4
storage = F32
```

Tensor shape:

```text
[K, M, 4]
```

Total mapped size:

```text
4096 * 2048 * 4 * 4 bytes
= 134,217,728 bytes
= 128 MiB
```

A `GGML_OP_MUL_MAT_ID` graph used two expert lanes per token and three tokens. Expert IDs were:

```text
token 0 -> 1, 3
token 1 -> 0, 3
token 2 -> 1, 3
```

Thus the union of used experts was:

```text
{0, 1, 3}
```

Expert `2` was intentionally unused.

Each expert slice occupies exactly one quarter of the mapping:

```text
128 MiB / 4 = 32 MiB
```

Therefore a successful demand refault of only selected expert slices should make roughly 96 MiB resident.

## Tensor binding

The probe created a file, filled it with deterministic weights, and mapped it with `mmap`.

The mapping was bound to the GGML weight tensor through:

```text
mmap address
    ↓
ggml_backend_cpu_buffer_from_ptr
    ↓
ggml_backend_tensor_alloc
    ↓
GGML tensor data address
```

The experiment asserted:

```text
tensor->data == mmap base address
```

before the first computation and again after eviction.

## Measurements

### Process RSS

VMA RSS was read from `/proc/self/smaps` for the mapping containing the GGML tensor address.

This answers how many bytes from that mapping currently contribute to this process's resident set.

### Page-cache residency

`mincore()` was used separately.

This does **not** measure process RSS. It reports whether the mapped file pages are resident in the kernel page cache.

This distinction was discovered empirically during the spike: after `MADV_DONTNEED`, `mincore()` still reported all pages resident, while refault counters showed the process mapping had been discarded. Reading `/proc/self/smaps` then confirmed VMA RSS was actually zero.

## Experiment sequence

The sequence was:

```text
1. mmap 128 MiB file
2. bind GGML expert tensor directly to mmap address
3. touch every mapped page
4. compute MUL_MAT_ID baseline
5. record VMA RSS and page-cache residency
6. madvise(MADV_DONTNEED)
7. verify tensor address is unchanged
8. measure VMA RSS again
9. posix_fadvise(POSIX_FADV_DONTNEED)
10. measure page cache again
11. execute the SAME already-allocated GGML graph
12. measure VMA RSS / page cache / page faults
13. compare output against warm baseline
```

No graph rebuild and no weight pointer rewrite occurred between the warm and refault computations.

## Fresh result

Observed output:

```text
mapping bytes: 134217728
tensor addr stable: YES
VMA RSS warm: 128.00 MiB
VMA RSS after warm compute: 128.00 MiB
VMA RSS after MADV_DONTNEED: 0.00 MiB
VMA RSS after refault compute: 96.00 MiB
page cache warm: 128.00 MiB
page cache after warm compute: 128.00 MiB
page cache after MADV_DONTNEED: 128.00 MiB
posix_fadvise DONTNEED rc: 0
page cache after fadvise: 0.00 MiB
page cache after refault: 96.25 MiB
fault delta during refault: major +282, minor +1552
warm vs refault max |diff|: 0
RSS drop observed: YES
partial RSS refault observed: YES
exact output: YES
VERDICT: stable-VA file-backed GGML weights can shed RSS and refault exactly
```

## What was proven

### 1. GGML tensor identity can remain stable while physical residency changes

The virtual mapping address and `tensor->data` stayed unchanged across eviction and refault.

This means CPU weight pointers do not inherently need to move when Super-Runtime changes physical residency.

### 2. `MADV_DONTNEED` can drop process RSS without unmapping the tensor

The mapping went from:

```text
128 MiB VMA RSS
```

to:

```text
0 MiB VMA RSS
```

while the virtual address remained valid.

This is the key result for stable-VA bounded CPU residency.

### 3. `MADV_DONTNEED` and page-cache eviction are different operations

After `MADV_DONTNEED`:

```text
VMA RSS     = 0 MiB
page cache  = 128 MiB
```

So dropping a process's page mappings does not necessarily remove the underlying file pages from system RAM.

This matters for Super-Runtime accounting. A runtime that only watches worker RSS may believe memory was reclaimed while the kernel still retains the same model bytes in page cache.

### 4. `POSIX_FADV_DONTNEED` can additionally evict clean file cache in this environment

After the advisory call:

```text
page cache = 0 MiB
```

The call returned zero.

This was measured behavior in this Linux environment. It is not a portable guarantee and must remain a platform policy rather than a universal API promise.

### 5. Only selected expert slices returned to physical memory

The graph selected experts `{0,1,3}` and left expert `2` unused.

After cold refault:

```text
VMA RSS = 96.00 MiB
```

which is exactly:

```text
3 experts * 32 MiB/expert = 96 MiB
```

This is especially important when combined with the previous `ffn_moe_topk` spike. Together the two spikes establish:

```text
GGML routing
    ↓
selected expert IDs
    ↓
physical residency policy
    ↓
only selected expert ranges become resident
    ↓
MUL_MAT_ID
```

### 6. Cold-storage refault preserved exact output

After dropping both VMA RSS and page cache, the same graph was executed again.

The numerical comparison was:

```text
max |warm - refault| = 0
```

Thus residency changes did not alter the mathematical result for this F32 synthetic graph.

### 7. The second run really incurred cold faults

The refault run recorded:

```text
major faults +282
minor faults +1552
```

The presence of major faults after the page-cache drop is evidence that at least part of the working set had to be sourced through the file-backed fault path rather than simply remapped from already-hot process pages.

## A false conclusion avoided during the spike

The first version used only `mincore()` and concluded `MADV_DONTNEED` did not work because `mincore()` still returned 128 MiB resident.

That interpretation was wrong.

The actual state was:

```text
process VMA RSS = dropped
kernel page cache = still warm
```

This is a useful design lesson for Super-Runtime:

> worker RSS, process page residency, system page cache, and storage residency are distinct accounting domains.

A hard memory controller cannot collapse them into one number.

## Combined result with the CPU MoE selector spike

The previous spike proved:

```text
ffn_moe_topk
    ↓
selected IDs observable before MUL_MAT_ID
    ↓
load only selected expert slices
    ↓
exact output
```

This spike proves:

```text
file-backed expert tensor
    ↓
stable virtual address
    ↓
physical pages can be discarded
    ↓
selected expert ranges refault on use
    ↓
unused expert range stays non-resident
    ↓
exact output
```

Together they support a concrete CPU residency architecture:

```text
                  GGML GRAPH
                      │
               routing / selector
                      │
                      ▼
              selected expert IDs
                      │
                      ▼
        SUPER-RUNTIME RESIDENCY POLICY
          │               │
          │               ├── prefetch / WILLNEED
          │               ├── acquire range lease
          │               └── reclaim / DONTNEED
          │
          ▼
    FILE-BACKED STABLE VA
          │
       physical
       pages only
       when useful
          │
          ▼
             GGML CPU KERNEL
```

## Production implication: do not use page faults as the only scheduler

The experiment intentionally allowed the kernel to fault pages back on demand. That proves feasibility, not optimal production behavior.

A production runtime should normally know the next-use set before the kernel stalls inside a matmul. For MoE this is available from `ffn_moe_topk`; for sequential dense layers it is predictable from graph order.

Therefore the intended architecture is:

```text
know next range
    ↓
prefetch / materialize asynchronously
    ↓
READY
    ↓
acquire lease
    ↓
compute
    ↓
release lease
    ↓
reclaim when budget demands
```

Page faults should remain a correctness fallback for file-backed stable mappings, not the preferred latency path.

## Accounting implication

Super-Runtime needs at least these distinct metrics:

```text
virtual_bytes
worker_rss_bytes
mapped_weight_rss_bytes
page_cache_estimate_or_pressure_signal
resident_weight_bytes_by_class
prefetched_bytes
leased_bytes
bytes_reclaimed
storage_bytes_read
major_faults
minor_faults
```

Not every operating system exposes every metric the same way. The control-plane API should express the semantic categories; each platform backend supplies what it can measure reliably.

## Portability boundary

This spike proves a Linux strategy, not a universal OS mechanism.

The abstract state machine should remain platform-neutral:

```text
EVICTABLE
    ↓ reclaim
NONRESIDENT
    ↓ materialize/prefetch
READY
    ↓ lease
IN_USE
```

Linux may implement parts of it using `madvise`, `posix_fadvise`, `mmap`, and asynchronous reads.

Windows needs a separate implementation using Windows virtual-memory/file-mapping primitives. Super-Runtime must not expose POSIX calls in its public residency contract.

## Recommendation

The evidence now supports **stable virtual identity + explicit physical residency policy** as the primary CPU design direction.

The next research spike should test **explicit asynchronous prefetch of selected file ranges before `MUL_MAT_ID`**, rather than relying on synchronous page faults inside the CPU kernel. Success criteria:

1. selected IDs are discovered at the selector boundary;
2. only those expert ranges are prefetched;
3. prefetch completes before `MUL_MAT_ID` is allowed to execute;
4. major-fault count during the matmul falls substantially versus cold demand-fault execution;
5. unused expert ranges remain nonresident;
6. numerical output stays exact.

That would turn the current feasibility proof into a scheduling proof.
