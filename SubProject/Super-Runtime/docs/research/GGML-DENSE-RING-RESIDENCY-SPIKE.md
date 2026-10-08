# GGML Dense Graph-Order Ring Residency Spike

Status: **completed research spike**
Date: 2026-08-31
llama.cpp / GGML reference: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

## Question

MoE weights have explicit selected IDs. Dense weights do not. Can Super-Runtime instead use deterministic graph order to keep a bounded `current + next` file-backed working set resident, evict a layer only after its compute safe point, and preserve output exactly?

This spike tests the generic dense counterpart to the routed-expert residency seam.

## Synthetic geometry

The probe constructed four chained F32 dense matrix multiplications:

```text
layer count       = 4
matrix shape      = 2048 x 2048
bytes/layer       = 16 MiB
total weights     = 64 MiB
input             = 2048 x 1
```

All four matrices occupy one contiguous 64 MiB file-backed mapping. Each GGML weight tensor is bound to its corresponding stable subrange using the public CPU external-buffer APIs.

Graph:

```text
input
  |
  v
MUL_MAT w0 -> y0   <-- safe point 0
  |
  v
MUL_MAT w1 -> y1   <-- safe point 1
  |
  v
MUL_MAT w2 -> y2   <-- safe point 2
  |
  v
MUL_MAT w3 -> y3   <-- safe point 3
```

The research callback requests an observation at each `yN`. The scheduler synchronizes through that result before the residency policy releases `wN`.

## Two-slot policy

Initial state:

```text
w0 READY + leased-for-next-use
w1 READY (look-ahead)
w2 nonresident
w3 nonresident

RSS = 32 MiB
```

After layer 0 completes:

```text
release/evict w0
prefetch/materialize w2

resident: w1 + w2
RSS = 32 MiB
```

After layer 1:

```text
release/evict w1
prefetch/materialize w3

resident: w2 + w3
RSS = 32 MiB
```

After layer 2:

```text
release/evict w2
resident: w3
RSS = 16 MiB
```

After layer 3:

```text
release/evict w3
RSS = 0 MiB
```

The probe uses synchronous prefetch/materialization to prove ordering and safety. It does not claim I/O overlap or performance superiority.

## Debugging discovery: graph inputs are invocation state

The first run failed the bitwise oracle by about `4.4e-7`. Importantly, the same discrepancy appeared on **warm -> warm repeated execution before any eviction**, so residency was not the cause.

Instrumentation showed:

```text
INPUT after warm1 max |diff|: ~0.09
INPUT after warm2 max |diff|: ~0.09
```

The scheduler allocation may reuse transient graph storage after a tensor's last use. The fixture had assumed the original input bytes remained intact across repeated graph invocations.

The correct invocation contract is:

```text
persistent graph / weights
        !=
request input contents
```

The caller must repopulate request input tensors for each graph invocation. After the fixture rewrote the input before every compute, warm/demand/managed output became bit-identical.

This is a useful Super-Runtime lifecycle rule, not merely a test fix: **request inputs are transient invocation state and must never be treated as persistent graph state unless their lifetime is explicitly owned.**

## Fresh result

Representative corrected run:

```text
DEMAND compute faults: major +129 minor +1026
DEMAND RSS after graph: 64.00 MiB
DEMAND max |diff|: 0

MANAGED initial prefetch faults: major +2 minor +512
MANAGED initial ring RSS: 32.00 MiB
MANAGED observed boundaries: 4
MANAGED layer0 compute faults: major +0 minor +0
MANAGED layer1 compute faults: major +0 minor +0
MANAGED layer2 compute faults: major +0 minor +0
MANAGED layer3 compute faults: major +0 minor +0
MANAGED after layer0 policy RSS: 32.00 MiB
MANAGED after layer1 policy RSS: 32.00 MiB
MANAGED after layer2 policy RSS: 16.00 MiB
MANAGED after layer3 policy RSS: 0.00 MiB
MANAGED final RSS: 0.00 MiB
MANAGED max |diff|: 0

tensor addresses stable: YES
ring maximum RSS: 32.00 MiB of 64.00 MiB total dense weights
```

Three repeated corrected runs produced:

```text
demand major faults:        129 / 131 / 128
demand final weight RSS:    64 MiB / 64 MiB / 64 MiB
managed max ring RSS:       32 MiB / 32 MiB / 32 MiB
managed layer faults:       0 major, 0 minor for every layer in every run
managed final RSS:          0 MiB / 0 MiB / 0 MiB
managed output max diff:    0 / 0 / 0
```

## Proven

1. Dense weight residency does not need model-family-specific routing metadata when graph order is deterministic.
2. A two-slot `current + next` policy can cap this 64 MiB logical dense weight walk at 32 MiB mapped process RSS.
3. Previous-layer pages can be dropped after a synchronized result safe point without corrupting later computation.
4. Look-ahead ranges can be made READY before their matrix operation begins.
5. Each managed dense matrix operation ran with zero major and zero minor page faults in the measured compute window.
6. Every dense tensor retained the same virtual address throughout residency transitions.
7. Output was bit-identical to the warm fully resident oracle after correctly resetting transient input state per invocation.

## Not proven

This spike does not prove:

- asynchronous overlap of next-layer storage I/O with current-layer CPU compute;
- that exactly two slots are optimal for every dense model;
- latency or throughput superiority of synchronous prefetch;
- full GGUF grouping policy for real models;
- Windows or GPU residency behavior.

A one-slot synchronous fallback remains important when the budget cannot afford two full dense groups. K3's own trunk history demonstrates that enabling asynchronous overwrite with one slot is a correctness hazard.

## Architecture decision extracted

Dense/fixed-order weights should use the access class:

```text
SEQUENTIAL_CYCLIC
```

The residency planner derives ordered resource requirements from the GGML graph/tensor use sequence, not from model brand.

Policy semantics:

```text
current range: READY + leased
next range:    PREFETCHED/READY if budget permits
previous:      EVICTABLE only after compute safe point
```

The grouping unit may eventually be a tensor, a coalesced physical run, or a model-derived weight group. That choice is an implementation/performance decision; the graph-order residency semantics are now proven.

## Learning conclusion

The open research question is no longer whether generic dense graph-order residency can maintain a bounded working set while preserving GGML computation. It can.

Future work is implementation engineering: selecting grouping granularity, asynchronous look-ahead, I/O queueing, platform-specific eviction, and performance tuning.
