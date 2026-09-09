# K3 Memory Lifetime Map

Status: source-derived quantitative research.

Pinned K3 reference: `117e9d29bde14db9742f54fb66a191fd0bf03903`.

This document replaces the vague statement "KV dominates context" with a fuller lifetime/accounting map. Numbers below are derived from the released K3 dimensions and allocation formulas in the pinned source unless marked otherwise.

## Released geometry used by the calculation

```text
hidden                  7168
layers                    93
KDA layers                 69
MLA layers                 24
KDA heads                  96
KDA head_dim              128
ShortConv kernel            4
MLA heads                  96
qk_nope                   128
qk_rope                    64
v_head                    128
kv_lora                    512
vocab                  163840
AttnRes block size          12
```

Derived:

```text
P = 96 * 128 = 12,288
AttnRes max block slots = 93 // 12 + 2 = 9
```

## Lifetime classes

| Class | Examples | Lifetime | Reclaimability |
|---|---|---|---|
| model metadata/index | safetensor index/hash/name pool | model lifetime | no while model is open |
| pinned/static model weights | optional trunk prefix, final norms | model lifetime | policy dependent |
| streaming sequential weights | non-pinned trunk layer bytes | one layer/op lease | yes after safe point |
| sparse expert residents | packed routed experts | policy/cache dependent | yes if not pinned/inflight/in-use |
| model-table staging | embedding/lm_head chunk buffer in ultra mode | one row/chunk operation | immediately reusable |
| recurrent state | KDA matrix + ShortConv history | active sequence lifetime in incremental mode | serializable but not freely reclaimable |
| context-growing attention state | expanded MLA cache in standalone K3 | active sequence/context lifetime | requires persistence/recompute policy |
| Tmax request buffers | `h`, block residual, main scratch | run allocation | released at run end |
| prefill temporary | batched MoE contribution/routing arrays | one <=64-token chunk | immediately freeable |
| per-op tiny dynamic | router / AttnRes scores | one op | immediately freeable |
| speculative snapshots | exact/draft recurrent snapshots | one speculative transaction | free after commit/rollback |

The core lesson is that "allocated arena bytes", "currently resident tensor identity", and "semantic state that must survive" are different quantities.

## Recurrent state

`k3_run.c` derives one KDA state slot as:

```text
recurrent matrix:
  96 * 128 * 128

ShortConv history:
  3 * (96*128) * (4-1)
```

Total:

```text
1,683,456 float32
= 6,733,824 bytes
= ~6.734 MB per slot
```

### Current standalone K3 allocation

Normal/incremental mode sizes the recurrent allocation by all bound layers. For a full 93-layer run:

```text
6,733,824 * 93
= 626,245,632 bytes
= ~0.626 GB
```

Only 69 KDA layers semantically require this state:

```text
6,733,824 * 69
= 464,633,856 bytes
= ~0.465 GB
```

About 0.162 GB is therefore a layout/CLI implementation overhead rather than a K3 neural requirement.

Ultra full recompute can reuse one slot, about 6.734 MB, because state for a completed layer is dead after that layer has processed the entire prefix.

## Standalone K3 expanded MLA context state

Incremental standalone K3 stores per MLA layer/position:

```text
96 * (qk_nope + v_head) float32
+ qk_rope float32

= 96 * (128 + 128) + 64
= 24,640 float32
```

Across 24 MLA layers:

```text
24 * 24,640 * 4
= 2,365,440 bytes / position
= ~2.365 MB / position
```

Examples:

| Positions | Expanded MLA state |
|---:|---:|
| 64 | ~0.151 GB |
| 512 | ~1.211 GB |
| 4,096 | ~9.689 GB |
| 16,384 | ~38.755 GB |
| 32,768 | ~77.511 GB |

This state alone is incompatible with an 8 GiB-class worker at a 4096-position context.

## Context-growing non-KV buffers

The CLI sizes several arrays to `Tmax = prior + prompt + gen + 1`.

### Hidden buffer `h`

```text
Tmax * 7168 * 4
= 28,672 bytes / position
```

### AttnRes block-residual buffer

```text
Tmax * 9 * 7168 * 4
= 258,048 bytes / position
```

### Main layer scratch

At the released dimensions, `k3_layer_scratch()` is KDA-dominated. The derived linear component is approximately:

```text
381,312 bytes / Tmax position
```

plus roughly 684,544 fixed bytes under these dimensions.

The production rule remains: use the source sizing functions rather than duplicating these formulas.

## Combined incremental core state

The table below includes expanded MLA state, `h`, block residual, main scratch, the current all-93 recurrent allocation, and the logits buffer. It intentionally excludes model/trunk weights, expert-cache arena, safetensor index/metadata, allocator/page rounding, tokenizer/control overhead, and OS/runtime overhead.

| Tmax | MLA state | h | block residual | scratch | recurrent 93 | approximate core total |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.002 GB | 0.000 GB | 0.000 GB | 0.001 GB | 0.626 GB | 0.631 GB |
| 64 | 0.151 GB | 0.002 GB | 0.017 GB | 0.025 GB | 0.626 GB | 0.822 GB |
| 512 | 1.211 GB | 0.015 GB | 0.132 GB | 0.196 GB | 0.626 GB | 2.181 GB |
| 4,096 | 9.689 GB | 0.117 GB | 1.057 GB | 1.563 GB | 0.626 GB | 13.053 GB |
| 16,384 | 38.755 GB | 0.470 GB | 4.228 GB | 6.248 GB | 0.626 GB | 50.328 GB |
| 32,768 | 77.511 GB | 0.940 GB | 8.456 GB | 12.496 GB | 0.626 GB | 100.028 GB |

### Corrected conclusion

Expanded KV is the largest standalone incremental term, but it is not the only context-growing memory. AttnRes storage and graph scratch become multi-gigabyte allocations at long contexts.

A Super-Runtime context admission calculation must include every context-growing object reported by the architecture/memory/graph substrate.

## Ultra full-recompute core buffers

Ultra full recompute has no persistent MLA KV cache and can reuse one recurrent slot, but the current K3 CLI still sizes `h`, block residual, and scratch to Tmax.

| Tmax | h | block residual | scratch | one recurrent slot | approximate core total |
|---:|---:|---:|---:|---:|---:|
| 64 | 0.002 GB | 0.017 GB | 0.025 GB | 0.007 GB | 0.051 GB |
| 512 | 0.015 GB | 0.132 GB | 0.196 GB | 0.007 GB | 0.350 GB |
| 4,096 | 0.117 GB | 1.057 GB | 1.563 GB | 0.007 GB | 2.744 GB |
| 16,384 | 0.470 GB | 4.228 GB | 6.248 GB | 0.007 GB | 10.953 GB |
| 32,768 | 0.940 GB | 8.456 GB | 12.496 GB | 0.007 GB | 21.898 GB |

Dropping KV therefore does not make arbitrary context length free; it changes the dominant terms and pays substantially more compute/I/O.

## MoE prefill temporary memory

`k3_moe_prefill()` limits a prefill subchunk to at most 64 tokens. Its dynamic arrays include routed IDs/weights, latent inputs, a `[T][topk][latent]` contribution buffer, unique expert list, and seen set.

At `T=64`, `topk=16`, `latent=3584`, the derived temporary footprint is roughly 15.6 MB, dominated by routed contributions.

This is a useful bounded-ephemeral pattern: prompt length can grow while the temporary prefill working set remains capped by chunk size.

## Per-op dynamic memory

Router score/choice arrays for 896 experts are only several KiB per invocation. AttnRes score arrays are also small. These belong to `EPHEMERAL` capacity rather than persistent residency, though repeated allocator traffic can still be a performance issue.

## Trunk allocation versus tensor identity

A `K3Trunk` has two resident allocation forms:

- pinned prefix allocations remain assigned to fixed layer identities;
- ring slots remain allocated but repeatedly change which layer they represent.

Thus:

```text
arena allocation lifetime = model/trunk lifetime
semantic layer residency lifetime = one or more graph operations
```

A generalized accounting system needs both views.

## Expert arena allocation versus expert identity

The expert arena itself is persistently allocated according to a byte budget, while each slot's expert identity changes with admission/eviction. Persistent metadata includes key/slot maps, clocks, pin bits, expert geometry, alignment offsets, histogram, and optional access trace.

A long-lived server should account the trace itself as telemetry memory; K3 enables it explicitly for research rather than treating it as free.

## Ultra model-table staging

`K3ModelStream` owns one aligned buffer sized around a 4 MiB stream chunk plus direct-I/O alignment slack. Embedding reads widen/copy one requested row into caller memory. The output head walks bounded row chunks and completes logits for each chunk before reuse.

This cleanly separates:

```text
persistent staging allocation
from
short-lived data identity inside that allocation
```

## Cold state persistence

K3 state files persist sequence token IDs, recurrent/ShortConv state, occupied MLA rows, and occupied shared slots. A configuration fingerprint prevents restoring state into incompatible geometry.

This is an example of a `SEQUENCE_COLD` tier. Rehydration moves cold bytes back into architecture-specific hot state.

## Speculative execution adds a working-set tax

Speculative mode snapshots exact recurrent state and a separate draft model can carry its own recurrent/KV state. Therefore speculative execution cannot be enabled after admission as if it were free. Optional execution modes must declare incremental state/staging memory before the global planner accepts them.

## Global budget implication

A universal runtime should not let subsystems independently consume their preferred GB until RSS exceeds the process target. A more truthful envelope is:

```text
hard worker limit
  - runtime/control native floor
  - model metadata/index
  - graph/compute floor
  - architecture state floor
  - active admitted contexts
  - required staging/leases
  = bytes available for dynamic weight residency
```

Context growth can force weight residency to shrink, increasing storage traffic. More weight residency can reduce admissible context. This is one global scheduling problem.

## Minimum accounting API implied by the source

Each memory-producing subsystem should eventually report enough information to build a reconciled ledger:

```text
category
semantic owner
allocated_bytes
resident_bytes where measurable
minimum_bytes
preferred_bytes
reclaimable_bytes
bytes_per_position / sequence multiplier when applicable
alignment/page overhead
persistent vs ephemeral
storage backing identity
safe reclaim condition
```

The planner must compare its ledger with measured process RSS/working set and expose unaccounted memory rather than hiding it.

## Acceptance consequence

An "8 GB mode" is valid only if the complete worker:

```text
model metadata + state + context + graph + scratch + staging + caches + runtime
```

stays inside an externally enforced memory envelope while preserving the reference output for the tested workload. Configuring individual cache budgets is not sufficient proof.
