# K3 Binding and Weight Contracts

Status: Phase 0 source-derived research

Canonical reference:

- repository: `https://github.com/FareedKhan-dev/kimi-k3-in-c`
- pinned revision: `117e9d29bde14db9742f54fb66a191fd0bf03903`

Purpose: extract how K3 separates model semantics, tensor validation, byte representation, storage location, and kernel-facing pointers, then translate those lessons into a model-adapter contract for Super-Runtime.

## The binder is the semantic firewall between checkpoint and kernels

K3's public binding header describes the problem directly:

```text
safetensors reader knows what exists on disk
kernel structs know what computation expects
binder connects the two
```

The important part is not simply assigning pointers. The binder validates the model-to-kernel contract before bytes are consumed by compute.

The internal `Req` structure records per requested tensor:

```text
name
resolved tensor metadata
expected element count
number of elements actually taken
storage representation decision
kernel destination pointer
blob offset
```

A collection of requests forms a `Plan`.

## Planning happens before loading

`plan_resolve()` walks the complete plan and checks:

- tensor exists;
- expected element count matches;
- requested prefix does not exceed available data;
- narrow/BF16 assumptions match actual dtype;
- partial narrow reads are rejected;
- each destination region receives aligned placement.

Only after the complete plan resolves does `plan_load()` read bytes.

Conceptually:

```text
architecture/config
       |
       v
construct tensor plan
       |
       v
resolve every tensor
       |
       +-- missing/shape/type incompatibility -> REFUSE
       |
       v
size representation
       |
       v
allocate
       |
       v
load / point / widen
       |
       v
publish kernel-facing bindings
```

This is stronger than allocating while discovering the model one tensor at a time.

### Super-Runtime extraction

Model admission should produce a complete machine-readable tensor contract before expensive allocations or inference begin.

A universal model adapter should describe what the graph needs; a separate container resolver should prove the checkpoint can satisfy it.

## Shape compatibility is treated as a semantic issue

K3 comments repeatedly emphasize a dangerous failure class:

```text
wrong shape assumption
-> valid memory access
-> finite plausible numbers
-> different model
```

Examples in the canonical source include:

- convolution tensor rank differs from the kernel-facing logical view while byte order remains compatible;
- `A_log` contains more values on disk than the semantic per-head subset used by the model;
- a transposed/swapped real weight can remain finite and plausible.

The real-layer conformance test exists specifically because synthetic kernel tests cannot prove the binder connected the correct checkpoint tensor to the correct kernel argument.

### Super-Runtime extraction

Testing needs at least three independent gates:

```text
kernel correctness
container/binding correctness
end-to-end graph correctness
```

Passing one does not imply the others.

## Representation is chosen by consumer semantics

K3 has two major ordinary trunk storage classes:

```text
NARROW
- large matrices remain BF16 from checkpoint
- consumed through matrix kernels aware of representation

WIDE
- small elementwise vectors become F32
- consumed directly by norm/conv/decay/router code
```

This is not generic "quantize large tensors" logic. It is based on the operation that consumes the bytes.

A tensor that a kernel indexes elementwise cannot safely be handed a pointer with a different element representation merely because byte count fits.

### Super-Runtime extraction

A Tensor Contract should include both logical dtype and **consumer representation contract**, for example:

```text
logical_dtype
stored_dtype
compute_dtype
kernel_accepted_encodings
requires_materialization
can_be_consumed_packed
```

Storage optimization is legal only when the selected kernel/backend accepts that representation directly.

## K3 exposes a weakness of coarse representation tags

K3 weight structs carry one `wdt` tag across groups of matrices. If one supposedly narrow large tensor is not BF16, `k3_bind_layer()` cannot safely describe a mixed representation inside that coarse tag.

The source therefore falls back the **whole layer** to F32.

Similarly, the memory-binding path refuses a packed run whose large tensors cannot be represented by the layer-wide format tag.

This is correct fail-closed behavior, but it exposes an abstraction limit.

### Super-Runtime extraction

Do not make representation metadata coarser than the physical object that can vary.

The universal tensor contract should allow per-tensor or per-range representation metadata, while optional fused groups may declare a shared invariant when a kernel requires it.

## Resident and streamed layer binding reuse the same semantic plan

This is one of K3's strongest architectural patterns.

Ordinary `k3_bind_layer()` resolves tensors from safetensors and loads a resident layer blob.

`k3_bind_layer_mem()` binds the same logical layer from a memory buffer belonging to the streaming trunk.

The source explicitly reuses the same tensor-name/shape/storage plan so the two paths cannot quietly diverge semantically.

Only byte provenance differs:

```text
resident path:
checkpoint -> owned layer blob -> kernel pointers

stream path:
checkpoint packed run -> residency slot -> kernel pointers
```

### Super-Runtime extraction

The model adapter must not have separate semantic definitions for "resident model" and "streaming model".

There should be one graph/tensor contract and multiple materialization providers.

```text
Tensor Contract
      |
      +--> resident mmap/RAM provider
      +--> bounded NVMe residency provider
      +--> GPU staging provider
      +--> future remote/storage tier
```

Changing residency policy must not change the model definition.

## Model-level streaming proves ownership can change without arithmetic changing

Ultra-low-memory mode avoids keeping the 2.35 GB embedding table and 2.35 GB lm_head resident.

`K3ModelStream` uses one bounded aligned buffer.

For embeddings:

```text
read one requested row
widen into caller-owned hidden vector
buffer becomes immediately reusable
```

For lm_head:

```text
walk output rows in <=4 MiB chunks
run same matrix arithmetic over each chunk
write completed logits
reuse buffer for next chunk
```

Returned semantic values do not retain pointers into the streaming buffer.

This is a clean lifetime transformation:

```text
same tensor
same arithmetic
smaller physical residency
shorter byte ownership lifetime
```

### Super-Runtime extraction

The architecture should make **materialization lifetime** independent from logical tensor lifetime.

A logical model tensor can exist for the entire worker lifetime while only a bounded physical range is materialized for one operation window.

## The Expert Source interface is an early form of residency provider

`K3ExpertSrc` abstracts routed-expert acquisition away from MoE math.

Its operations are:

```text
get(layer, expert) -> expert pointers
getmany(layer, experts[]) -> optional concurrent prefetch
resident(layer, expert) -> optional no-I/O probe
```

The interface comment includes a critical lifetime promise:

> pointers returned by `get()` must remain valid until the caller finishes the token.

This is effectively an implicit residency lease.

### Super-Runtime extraction

The universal API should make that lease explicit rather than encode it as "until token end".

Conceptually:

```text
lease = residency.acquire(range_set, use_scope)
wait until READY
execute op(s)
residency.release(lease)
```

Why explicit leases are better:

- prefill can span many tokens;
- one expert set can serve gate/up/down ops;
- GPU copies can outlive CPU scheduling moments;
- future parallel sequences may overlap;
- dense layer safe points differ from token boundaries.

## Optional methods demonstrate capability negotiation

`getmany` and `resident` may be NULL. Callers must retain a correct fallback through `get()`.

`getmany` also permits a short return; the ordinary path then loads remaining misses synchronously.

This separates:

```text
correctness capability: get
performance capability: getmany
policy/query capability: resident
```

### Super-Runtime extraction

Storage/device backends should advertise capabilities rather than force one implementation contract.

Example capability surface:

```text
POSITIONED_READ
ASYNC_BATCH_READ
DIRECT_READ
RANGE_PREFETCH
RESIDENCY_QUERY
PAGE_EVICT
GPU_DIRECT_STAGING
```

The scheduler must have a correctness-preserving baseline when optional accelerations are absent.

## Binding from packed memory minimizes copying

`k3_bind_layer_mem()` points directly into a resident trunk slot when the packed bytes already match what the kernel consumes.

Only tensors requiring a different elementwise representation are widened into a side buffer.

This avoids creating a second complete layer copy after I/O.

### Super-Runtime extraction

A residency arena should ideally be **compute-consumable storage**, not an intermediate that is always copied into another full-size CPU tensor.

For each range, the planner should know whether the target backend can consume it directly:

```text
storage bytes -> resident arena -> kernel
```

instead of:

```text
storage bytes -> I/O buffer -> decoded full tensor -> kernel
```

unless conversion is genuinely required.

## Model stream validates the physical matrix before using range arithmetic

Before row streaming begins, `model_matrix()` verifies exact rank, row count, column count, and supported dtype for embedding/lm_head.

Only after this validation does `model_read_rows()` calculate byte offsets for requested row ranges.

This ordering is important: range arithmetic should never be performed from assumed geometry that has not been checked against container metadata.

### Super-Runtime extraction

A container resolver should issue a validated locator such as:

```text
TensorLocator {
    file/shard identity
    payload offset
    shape
    strides/layout
    stored dtype/encoding
    byte length
    required alignment
    integrity identity
}
```

Residency code consumes the validated locator. It should not reconstruct model-specific tensor offsets itself.

## Alignment is a property of both I/O and typed consumption

K3's model streaming uses page-aligned direct-I/O buffers, but it also checks alignment of the **payload pointer inside that buffer** before typed BF16/F32 access.

A safetensors payload can legally begin at an address misaligned for the eventual C element type even if the destination buffer base is page-aligned. The source compacts such a range before typed consumption.

### Super-Runtime extraction

Do not collapse these separate requirements:

```text
storage-request alignment
DMA/direct-I/O buffer alignment
tensor payload alignment
kernel/vector alignment
```

The residency/materialization contract should carry all required alignment constraints and validate the final compute pointer.

## The real-layer test demonstrates independent binder verification

`tests/unit/test_real_layer.c` explains why binding needs a separate oracle: a transposed or swapped weight may have the right shape and still yield finite values.

The test runs a real checkpoint layer and dumps intermediate stages. A separate Torch implementation reads the same shards and verifies those stages independently.

This is an important testing pattern for Super-Runtime adapters:

```text
canonical container bytes
       |                 |
       v                 v
Super-Runtime adapter   independent oracle
       |                 |
       +------ compare --+
```

A test generated solely by the same adapter implementation cannot prove its own tensor mapping.

## Proposed Super-Runtime Tensor Contract

Source evidence now supports a more concrete conceptual contract:

```text
TensorContract {
    semantic_role
    architecture_scope
    logical_shape
    logical_dtype

    accepted_storage_encodings[]
    kernel_consumption_contract

    access_class
      ALWAYS_RESIDENT
      SEQUENTIAL_FULL
      INDEXED_EXPERT
      ROW_INDEXED
      STATE

    lifetime_class
    grouping/fusion constraints
    minimum_alignment
}

TensorLocator {
    container_id
    shard_id
    byte_range
    stored_shape
    stored_encoding
    integrity_id
}
```

The model adapter produces `TensorContract` objects. The container layer resolves them into `TensorLocator` objects. The residency layer materializes locators according to runtime access events. Kernels consume only validated/materialized representations.

## Proposed separation of responsibilities

```text
Architecture Adapter
- declares graph and semantic tensor requirements
- never chooses NVMe cache slots

Container Resolver
- proves checkpoint satisfies contracts
- maps semantic tensors to physical ranges
- never schedules compute

Residency Manager
- owns READY/INFLIGHT/EVICTED state
- materializes validated ranges
- never invents tensor geometry

Compute Substrate
- consumes approved representations
- never opens model files directly
```

This separation is a generalized version of what works well inside the K3 binder/cache/trunk split, while removing K3-specific tensor names and coarse layer-format assumptions.

## Current conclusion

K3's binder shows that model flexibility is not achieved by making kernels guess checkpoint structure.

It is achieved by making the boundary explicit:

```text
model semantics
-> validated tensor plan
-> physical locator
-> representation-aware materialization
-> stable kernel contract
```

For Super-Runtime polyglot design, this is likely the correct boundary between architecture adapters and the universal residency/data plane.
