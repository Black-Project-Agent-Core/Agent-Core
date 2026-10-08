# K3 Source Archaeology

Status: source-derived research, not a Super-Runtime implementation spec.

Pinned reference:

- repository: `research/references/kimi-k3-in-c`
- revision: `117e9d29bde14db9742f54fb66a191fd0bf03903`

This document records findings obtained from the K3 source tree, tests, benchmark harnesses, and selected Git history. Claims are grounded in executable code/history unless explicitly labeled as a Super-Runtime inference.

## Evidence labels

- **K3 source** — directly visible in the pinned K3 code/tests/history.
- **Measured by K3** — recorded by K3 benchmark/result artifacts; not re-measured here against the 1.56 TB checkpoint.
- **Super-Runtime inference** — our architectural conclusion from the evidence.

## End-to-end execution path

**K3 source** — `src/cli/k3_run.c` integrates much more than model math:

```text
request/config/token input
  -> strict request + memory validation
  -> safetensors indexing
  -> resident or streamed trunk
  -> resident or streamed model tables
  -> bounded expert cache
  -> recurrent/context/scratch allocation
  -> prefill / incremental / recompute path
  -> for each layer:
       materialize/bind trunk layer if streamed
       prefetch next deterministic layer when safe
       attach sparse expert source
       execute KDA or MLA
       execute dense FFN or routed MoE
  -> output norm + lm_head
  -> verify corruption/error counters
  -> report RSS/I/O/cache/timing
  -> optionally persist sequence state
```

Low memory is not an isolated loader feature. Storage, model semantics, memory lifetime, and correctness are coordinated by the execution loop.

## Configuration is a semantic contract

**K3 source** — `include/k3/k3_cfg.h` refuses missing required architecture fields. The source describes the dangerous alternative: a reader can miss the real layer map, substitute plausible defaults, load successfully, and emit fluent-looking output from the wrong architecture.

Structural validation covers model dimensions, one-based MLA layer IDs, top-k bounds, AttnRes block size, and ShortConv geometry.

**Super-Runtime inference** — universal compatibility must be fail-closed capability negotiation. A model becomes compatible only when the adapter can fully describe the semantics the runtime needs; otherwise it is refused rather than guessed.

## Safetensors are a runtime address database

**K3 source** — `src/io/k3_st.c` indexes tensor names to:

```text
shard
absolute byte offset
byte length
dtype
shape
```

It validates ranges, rejects duplicates/unsupported dtypes, sorts shard discovery, builds an open-addressed hash table, and keeps ordinary plus optional direct-I/O descriptors for positioned reads.

**Super-Runtime inference** — model storage should expose stable tensor/range identities and physical offsets. A container is part of the runtime address space, not merely serialization.

## Binding uses plan-before-read

**K3 source** — `src/model/k3_bind.c` builds a `Plan` of required tensors before reading them:

```text
architecture requirement
  -> binding plan
  -> resolve names
  -> validate shape/count/dtype
  -> compute exact layout
  -> allocate
  -> read/widen selected tensors
  -> publish compute pointers
```

Large matrices remain BF16 where safe; small elementwise tensors are widened to fp32. The same logical layer plan is used for resident checkpoint binding and streamed-memory binding (`k3_bind_layer_mem`).

**Super-Runtime inference** — model adapters should declare a Tensor Contract; residency/storage should supply bytes independently of neural semantics.

## Memory policy follows access topology

**K3 source** — there is no single cache policy.

The trunk is deterministic/cyclic and uses a pinned prefix plus streaming ring. Routed experts are sparse/input-dependent and use a separate slot cache with victim selection and batch prefetch. Ultra model tables are row-indexed and use bounded staging.

**Super-Runtime inference** — generic residency classes should describe access semantics, for example:

```text
ALWAYS_RESIDENT
SEQUENTIAL_CYCLIC
SPARSE_INDEXED
ROW_INDEXED
STATE_RECURRENT
STATE_CONTEXT_GROWING
DEVICE_STAGING
EPHEMERAL
```

## Residency is transactional

**K3 source** — expert-cache slots effectively have semantic states:

```text
EMPTY
INFLIGHT
RESIDENT(key)
```

Batch prefetch performs reserve, parallel read, then publish. A historical bug exposed a reserved slot as empty; another expert reused it in the same batch and concurrent reads overwrote one buffer, silently corrupting inference.

K3 only registers an expert after a successful read. Failed/short reads are never published as valid residents.

**Super-Runtime inference** — `READY` must be a committed transition. A generalized state machine should distinguish `EVICTED -> RESERVED -> LOADING -> READY -> IN_USE -> EVICTABLE`, with failure never reaching READY.

## Compute lifetime constrains prefetch concurrency

**K3 source** — trunk async prefetch is enabled only with at least two ring slots. With one slot, layer `L+1` can overwrite layer `L` while compute still dereferences it.

Relevant history:

- `ca52ac5` — overlap trunk reads with layer compute;
- `918cc68` — disable async reader with a one-slot ring.

**Super-Runtime inference** — resident ranges need leases or equivalent scheduler-owned lifetimes. Eviction/reuse is allowed only after a graph/device safe point.

## Physical I/O order can differ from mathematical order

**K3 source** — MoE prefill routes a chunk, deduplicates experts, loads each unique expert once, applies expert-major work, then reconstructs each token's routed sum in original top-k accumulation order. Expert reads are also sorted by physical `(shard, offset)`.

```text
physical data-movement order != semantic floating-point order
```

**Super-Runtime inference** — storage scheduling may coalesce/reorder/prefetch byte movement aggressively while preserving graph semantics and required accumulation order.

## Packed representation remains compute-native

**K3 source** — routed experts remain packed MXFP4 in the cache and `k3_matmul_mxfp4()` consumes packed bytes directly. One real packed expert is 17,547,264 bytes. Full fp32 materialization would multiply transient memory.

Commit `f1cb772` optimizes the packed path rather than changing the resident representation.

**Super-Runtime inference** — residency should preserve backend compute-native quantized formats whenever possible.

## Direct I/O is a capability, not the architecture

**K3 source** — positioned reads and page-cache bypass are attempted across platforms with correctness-preserving fallback where possible. Aligned reads widen to storage boundaries and return the actual payload offset.

**Super-Runtime inference** — storage backends should expose positioned I/O, alignment, direct/cache-bypass support, queue/concurrency, and fallback capabilities. `O_DIRECT` itself is not the architecture.

## Alignment is a correctness property

**K3 source** — expert slot stride is rounded to direct-I/O alignment. Aligning only the arena base is insufficient because slot N begins at `base + N*stride`. The real expert size happened to be aligned, hiding this bug class until small fixtures exposed it. Trunk runs are likewise padded/aligned.

**Super-Runtime inference** — alignment belongs in the range residency contract and its tests.

## Huge-page awareness targets page-pinning overhead

**K3 source** — trunk/expert arenas use large alignment and `MADV_HUGEPAGE` where available, with an A/B switch. The rationale is specifically page-pinning overhead for large direct-I/O transfers.

**Super-Runtime inference** — page strategy should be a measured storage/device tuning dimension, not a universal toggle.

## State participates in transactions

**K3 source** — incremental execution carries KDA recurrent matrix + ShortConv history, MLA state, and the shared MLA slot. State files carry compatibility fingerprints and incompatible restore is refused.

Speculative execution snapshots recurrent state. On partial rejection, K3 restores and replays only the accepted prefix to recover the exact serial state.

**Super-Runtime inference** — sequence state needs checkpoint/rollback semantics; speculative modes alter the minimum working set and must participate in admission.

## Full recompute and incremental execution trade resources

**K3 source** — full recompute carries no MLA KV cache but repeats compute/storage traffic over the prefix. Incremental mode carries persistent recurrent/context state but processes only new tokens.

Ultra full recompute can reuse one recurrent-state slot across layers; incremental mode cannot because per-layer recurrent state must survive to the next token.

**Super-Runtime inference** — execution mode is a resource-planning choice that can trade persistent memory for compute/I/O.

## Policy-independent access traces

**K3 source** — expert requests are recorded before the cache serves them, making the trace independent of one cache capacity/policy. `tools/sim_cache.py` can replay traces across replacement policies and theoretical ceilings.

**Super-Runtime inference** — residency telemetry should record semantic requests independently from policy outcomes so policies can be simulated offline without rerunning huge checkpoints.

## Forecast is not measurement

**K3 source / Measured by K3** — the CLI distinguishes pre-allocation memory plans from measured peak RSS. Benchmark scripts use external cgroup ceilings with swap disabled and check output identity across budgets.

**Super-Runtime inference** — memory validation needs internal byte accounting, measured process RSS/working set, and external hard-limit enforcement.

## Fail closed on semantic corruption

**K3 source** — malformed config, incompatible state, missing expert data, capacity overrun, or incomplete model data are not treated as successful inference. Direct-I/O unavailability may fall back because it changes performance without changing semantics.

**Super-Runtime inference** — provider/runtime errors must distinguish performance fallback from semantic invalidation. Incomplete exact computation can never look like a successful response.

## Git history as architecture evidence

| Commit | Evidence carried forward |
|---|---|
| `b2f5b5b` | exact ultra-low-memory path and tighter table/state lifetimes |
| `ca52ac5` | async trunk read/compute overlap |
| `918cc68` | one-slot async overlap is a correctness violation |
| `f1cb772` | packed MXFP4 compute optimization |
| `65841a1` | synthetic trunk-streaming regression coverage |
| `1f19bbe` | Windows portability and positioned/direct I/O semantics |

**Super-Runtime inference** — comments/tests should preserve the corruption mode an invariant prevents. Apparently redundant code may encode a production failure discovered empirically.

## Universal extraction

The reusable principles are:

```text
strict model contract
plan-before-read binding
access-pattern-specific residency
transactional publish-after-load
compute leases before eviction
physical-locality scheduling
packed-format compute
positioned I/O + capability fallback
alignment/page-aware arenas
state fingerprinting + rollback
policy-independent access traces
forecast + hard-cap + measured RSS validation
fail-closed semantic corruption handling
```

K3-specific neural semantics remain model-adapter concerns: KDA equations, K3 MLA/NoPE geometry, AttnRes, Stable LatentMoE, routing layout, K3 MXFP4 checkpoint layout, tokenizer/config, and layer-map rules.

## Research conclusion

**Super-Runtime inference** — the deepest transferable K3 design is:

```text
semantic requirement
  -> byte-range identity
  -> access-pattern classification
  -> residency transaction + lifetime
  -> storage scheduling
  -> existing compute semantics
```

Super-Runtime should generalize this resource architecture across GGML model families rather than generalizing the K3 neural graph itself.
