# K3 Git-History Archaeology

> **Historical research evidence:** source observations, host paths, experiment results and proposed next steps below belong to the recorded Phase-0 work. The [master context](../SUPER-RUNTIME-MASTER-CONTEXT.md) governs subsequent decisions. See [current checkout prerequisites](../../README.md#source-checkout-reproducibility-status--8-october-2026) before trying to reproduce a reference-dependent result; this refresh neither fetched upstream references nor reran experiments.

Status: Phase 0 source-derived research

Canonical reference:

- repository: `https://github.com/FareedKhan-dev/kimi-k3-in-c`
- pinned revision: `117e9d29bde14db9742f54fb66a191fd0bf03903`

This note uses the repository history as engineering evidence. It distinguishes mechanisms that were intentional from the first implementation from invariants that were discovered only after a real failure, measurement, or portability problem.

## Why history matters

Reading only the final source can make every invariant look equally obvious. The commit history shows which design ideas were present from the beginning and which ones were learned through failures that produced plausible output rather than obvious crashes.

That distinction matters for Super-Runtime because the latter category deserves explicit regression tests and state-machine semantics instead of comments alone.

## Timeline of runtime-relevant changes

Selected commits from the canonical history:

| Commit | Date | Change | Super-Runtime relevance |
|---|---|---|---|
| `4f6b4a4` | 2026-08-01 | numeric kernels | establishes compute baseline |
| `4a1730e` | 2026-08-01 | safetensors reader | model-container boundary |
| `e7d8b6a` | 2026-08-01 | routed-expert loader | storage-addressable expert ranges |
| `11af139` | 2026-08-01 | streaming trunk reader | sequential out-of-core weights |
| `7dd1a06` | 2026-08-01 | routed-expert LRU cache | transactional expert residency already present |
| `39b84e3` | 2026-08-01 | tensor-name binding | validated model-to-kernel contract |
| `5b0944c` | 2026-08-01 | weightless gates | synthetic correctness methodology |
| `64155c8` | 2026-08-01 | memory ladder and split sweep | enforced resource experiments |
| `80f3583` | 2026-08-05 | async trunk overlap | compute/I-O overlap |
| `918cc68` | 2026-08-06 | disable async reader with one slot | failure-discovered lifetime invariant |
| `eb6c414` | 2026-08-06 | auto memory budget, trunk-first | access-economics-aware allocation |
| `bc9d53c` | 2026-08-06 | conservative partial pinning | system reclaim matters to budget policy |
| `9956d88` | 2026-08-06 | speculative decode | state rollback / verification path |
| `c5d2521` | 2026-08-07 | save/load state | persistent session state |
| `6b1f2ef` | 2026-08-07 | expert-major prefill | I/O order separated from arithmetic order |
| `31f2fbb` | 2026-08-07 | bounded prefill contribution buffer | optimization itself must be memory-bounded |
| `b2f5b5b` | 2026-08-26 | exact ultra-low-memory mode | lifetime-driven state/table streaming |
| `1f19bbe` | 2026-08-26 | native Windows support | portability layer evidence |

## Transactional expert residency was an original design property

A source-history search for `K3_SLOT_INFLIGHT` resolves to `7dd1a06`, the initial routed-expert cache commit. Therefore the three-state cache model is not a later retrofit:

```text
EMPTY
INFLIGHT
RESIDENT(key)
```

The current cache implements a three-phase batch admission protocol:

```text
1. serial reserve
2. parallel positioned reads
3. serial publish after successful reads
```

The publication rule is load bearing: a failed read must never leave an address registered as resident.

The final source comments also record a concrete class of failure that the state prevents: marking an in-progress slot as merely EMPTY can cause the next parallel request to receive the same slot, allowing multiple reads to overwrite one buffer.

### Super-Runtime extraction

Residency must be treated as a transaction, not a boolean cache flag. At minimum a future range lifecycle should distinguish reservation/loading from committed READY state.

## The one-slot trunk invariant was discovered from a real silent corruption

Commit `80f3583` added overlap between layer compute and the next trunk read. Commit `918cc68` later disabled the reader when the ring contains only one slot.

The fix explicitly states why this is a correctness invariant:

```text
slot 0 contains layer L
       |
       +-- CPU still computes L
       |
prefetch L+1 chooses slot 0
       |
       +-- read overwrites bytes being consumed by L
```

Nothing in this failure necessarily crashes. File I/O succeeds, pointers remain valid, and the model emits tokens.

The source records a real-checkpoint comparison for the same prompt:

```text
expected:
17374 20829 10 427 414 1008 606 142957

one-slot async corruption:
32609 2329 146429 2539 11 152834 44449 7569
```

This is unusually strong evidence because it demonstrates the exact failure mode Super-Runtime must fear most: fluent but semantically corrupted inference.

### Super-Runtime extraction

Every resident range used by an executing op needs a lease/pin lifetime. Eviction or overwrite is legal only after an explicit safe point. Prefetch concurrency must be derived from available independent residency slots, not enabled as an unconditional performance feature.

## The cache is storage-topology aware, not just key aware

The current batch expert cache does not issue misses in expert-ID order. After reserving distinct slots, it sorts work by:

```text
shard
then physical byte offset
```

The reads are then issued concurrently using positioned I/O. The key insight is that logical expert identity and physical storage locality are separate coordinate systems.

### Super-Runtime extraction

A universal residency request should carry both semantic identity and physical storage ranges. The scheduler may reorder storage requests for locality as long as it preserves graph semantics.

## Expert-major prefill established I/O-order/arithmetic-order separation

Commit `6b1f2ef` changes prefill from repeated token-major expert loading to a batch process:

```text
route every token
collect unique experts
fetch each unique expert once
compute expert contributions
accumulate each token in original top-k order
```

The source explicitly preserves original top-k floating-point accumulation order. Therefore only the data-movement order changes.

Commit `31f2fbb` then bounds the temporary contribution memory using 64-token subchunks. The source notes that an unbounded 32k-token prefill could require roughly 7.3 GB for this optimization alone; fixed 64-token chunks keep the contribution buffer around 14.7 MB for the released geometry.

### Super-Runtime extraction

There are two independent schedules:

```text
semantic schedule
- defines mathematically observable ordering

resource schedule
- defines read order, prefetch, coalescing, staging, eviction
```

A Super-Runtime storage scheduler should optimize the second without mutating the first.

## Ultra-low-memory mode is lifetime analysis made executable

Commit `b2f5b5b` does more than lower constants.

It identifies objects that do not require process-long residency:

- embedding: only requested rows are streamed;
- lm_head: projected in bounded row chunks;
- full-recompute recurrent state: one layer state slot is reused after the layer returns.

The last optimization is only legal for full recompute. Incremental decode still requires persistent per-layer recurrent state.

This is a direct demonstration of the principle:

```text
same mathematical model
+ different execution lifetime
= different minimum resident memory
```

### Super-Runtime extraction

The runtime should model residency lifetime explicitly rather than assigning a static storage class solely from tensor type or model family.

## Auto-budget history rejects naive "fill RAM" policy

Commit `eb6c414` initially allocates memory trunk-first because each token deterministically traverses the trunk while expert-cache benefit is weak at small capacities.

Commit `bc9d53c` then corrects a second-order system effect: aggressive partial trunk pinning can push process RSS near physical RAM, provoke reclaim, and slow the remaining streamed reads enough to make the larger-resident configuration slower.

The correction caps partial pinning conservatively unless the complete trunk can be resident.

### Super-Runtime extraction

A global planner cannot optimize only:

```text
resident weight bytes
```

It must optimize the complete system:

```text
resident bytes
+ reclaim pressure
+ page-cache effects
+ storage bandwidth
+ compute overlap
+ context/state
+ staging
+ safety reserve
```

The correct objective is task throughput under a hard resource envelope, not maximum cache occupancy.

## History-derived invariant classes

The K3 evolution suggests four classes for Super-Runtime tests.

### A. Structural invariants

Known from architecture/container contracts before execution.

Examples:

- expected tensor shape/dtype;
- required config fields;
- storage alignment;
- model architecture compatibility.

Fail closed during admission/load.

### B. Residency transaction invariants

Examples:

- a loading range is not READY;
- failed reads are never published;
- one slot cannot be leased to two simultaneous materializations.

Gate with synthetic races, failures, and short reads.

### C. Lifetime/concurrency invariants

Examples:

- a range cannot be overwritten while an op holds a lease;
- async prefetch requires independent capacity;
- graph continuation cannot begin until needed weight ranges are READY.

Gate with scheduler stress tests.

### D. Performance-policy invariants

These are not semantic correctness rules but must be evidence driven.

Examples:

- trunk-first versus expert-cache allocation;
- hugepage advice;
- prefetch depth;
- storage-order sorting.

Gate with bytes/counts first and replicated timing second.

## Source-derived conclusion

The most reusable lesson from the K3 history is not one cache algorithm. It is the development method:

```text
explicit resource model
+ fail-closed state transitions
+ exact-output gates
+ raw I/O counters
+ real hard memory ceilings
+ regression tests for every silent corruption
```

Super-Runtime should institutionalize these as runtime contracts rather than importing K3-specific architecture assumptions.
