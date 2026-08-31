# Super-Runtime Master Context

Status: **CANONICAL SOURCE OF TRUTH**
Date: 2026-08-31
Canonical repository: `Black-Project-Agent-Core/Agent-Core`
Canonical path: `SubProject/Super-Runtime/`

> **MANDATORY READ:** Read this file before planning, researching, implementing, or modifying Super-Runtime.
>
> If an older Super-Runtime document conflicts with this file, **this file wins** unless a later explicitly approved master-context update supersedes it.

---

# 0. Why this document exists

Super-Runtime accumulated many Phase-0 research documents while studying K3-in-C, llama.cpp/GGML, memory lifetime, state, residency, I/O, and executable feasibility spikes.

Those documents are valuable evidence, but they were written at different times. Some contain historical hypotheses, future ideas, or questions that were later answered. Reading one document in isolation can therefore re-open an already closed question or pull the project into work that is not currently relevant.

This master context consolidates the authoritative meaning of all current Super-Runtime documents into one operational source of truth.

Its purposes are:

1. define exactly what Super-Runtime is and why it exists;
2. state the current factual project status;
3. freeze the Phase-0 decisions that have already been earned by source and executable evidence;
4. distinguish proven results from goals, hypotheses, and deferred work;
5. define the ownership boundary between K3-in-C, llama.cpp/GGML, and Super-Runtime;
6. prevent downstream AI-tool integration from entering the runtime-core build prematurely;
7. define the only active implementation frontier;
8. provide an evidence index so older documents remain auditable without becoming competing sources of direction.

This file is a **consolidation of existing approved/researched material**. It does not declare the runtime implemented when it is not.

---

# 1. Current factual status — read this first

As of this master-context checkpoint:

```text
SubProject/Super-Runtime/
├── CMakeLists.txt
├── README.md
├── docs/
├── runtime/
│   └── native/
│       ├── CMakeLists.txt
│       ├── LLAMA_CPP_REVISION
│       ├── README.md
│       ├── smoke.cpp
│       ├── super_runtime/
│       │   ├── memory_ledger.h
│       │   ├── memory_ledger.cpp
│       │   ├── file_residency.h
│       │   └── file_residency.cpp
│       └── tests/
│           ├── test_memory_ledger.cpp
│           └── test_file_residency.cpp
├── tests/
│   └── contracts/
│       └── native-substrate.sh
└── research/references/
```

Current implementation status:

```text
Task 1 native llama.cpp/GGML CPU substrate boundary   COMPLETE
Task 2 deterministic MemoryLedger                     COMPLETE
Task 3 stable-address file residency                   COMPLETE
dense production residency                            NOT STARTED
MoE production residency                              NOT STARTED
benchmarks/ hard-cap harness                          NOT STARTED
native runtime entrypoint                             NOT STARTED
```

Therefore:

> **Super-Runtime still does not yet exist as a runnable inference runtime product.**

Task 1 establishes the reproducible native llama.cpp/GGML CPU boundary. Task 2 adds the deterministic thread-safe `MemoryLedger`. Task 3 adds the first physical backing primitive: a Linux file-backed mapping whose virtual address remains stable while page-aligned ranges can be explicitly prefetched/released and charged to `ResidentWeights` in the ledger. These checkpoints still do not load a model or implement dense/MoE scheduler policy.

Phase 0 learning is complete, and the first three implementation checkpoints are complete.

The project frontier remains:

> **build the first real, runnable native Super-Runtime core one verified checkpoint at a time.**

## Immediate next action — exactly one task

The next eligible implementation checkpoint is **Task 4 only: add generic MoE selected-expert ID-to-range residency planning**.

Do not begin dense production policy, API work, GPU work, or downstream integration in parallel with Task 4. Task 4 becomes active only after the Task 3 commit is present and remotely verified on canonical `Agent-Core/main`.

Task 1 + Task 2 + Task 3 verification boundary:

```text
bash tests/contracts/native-substrate.sh
  -> pinned llama.cpp revision validated
  -> real GGML CPU backend initializes
  -> PASS

ctest -R super-runtime-memory-ledger
  -> hard-budget accounting
  -> category accounting
  -> overflow/underflow refusal
  -> concurrent accounting
  -> PASS

ctest -R super-runtime-file-residency
  -> stable virtual base address
  -> page-aligned prefetch/release
  -> ResidentWeights ledger integration
  -> deterministic bytes remain correct after refault
  -> bounded RSS evidence recorded without making reclaim timing a correctness gate
  -> PASS
```

The project advances one verified checkpoint at a time.

No document, synthetic probe, architecture diagram, substrate smoke target, or research result should be described as if the runtime itself already exists.

---

# 2. Product definition

Super-Runtime is intended to become a **CPU-first, local, model-flexible inference runtime** designed around explicit resource governance.

Its central resource problem is:

> A logical model can be much larger than the process-resident working set that the machine can afford.

Super-Runtime therefore aims to make model execution aware of a memory hierarchy such as:

```text
logical model address space
        |
        v
NVMe / file-backed model storage
        |
        v
bounded RAM residency
        |
        v
CPU execution
        |
        +----> optional GPU acceleration later
```

The ambition is to separate:

```text
logical model capacity
```

from:

```text
physical process-resident working set
```

by controlling what weight/state ranges are physically resident at each execution point.

This is an engineering goal, not a claim that arbitrary models already run under a small RAM limit.

---

# 3. Why build Super-Runtime

The project exists because ordinary model execution and storage capacity have different economics and constraints.

Large local models may be hundreds of gigabytes or more, while practical RAM and especially VRAM can be much smaller. Large NVMe storage is comparatively abundant.

The design question is not:

> Can SSD become physically as fast as RAM?

It cannot.

The design question is:

> Can a runtime deliberately schedule model bytes so only the currently required working set occupies expensive physical memory, while storage is treated as an active execution tier rather than passive model storage?

Super-Runtime is being built to own that scheduling/resource problem.

The desired behavior is conceptually:

```text
know what is required
        |
        v
admit it under a global budget
        |
        v
prefetch/materialize required ranges
        |
        v
publish READY only after successful materialization
        |
        v
lease while compute can dereference it
        |
        v
release at a safe point
        |
        v
evict/reclaim when the budget requires it
```

Weight streaming alone is not enough. Context/KV/recurrent state, scratch, staging, runtime overhead, and safety reserve are part of the same resource envelope.

---

# 4. What Super-Runtime is not

Super-Runtime is **not**:

- an AI model;
- an AI agent;
- an OpenClaw fork;
- a Hermes fork;
- an Odysseus fork;
- a Kimi K3 neural-architecture port;
- a renamed llama.cpp server;
- a UI project;
- an OpenAI-API project at the current milestone;
- a GPU-required runtime;
- a promise that every model will run in approximately 8 GiB RAM;
- a separate streaming implementation for every model brand.

Its product identity is the **resource-governed runtime layer** around a mature multi-architecture compute/model substrate.

---

# 5. Hard scope guard

Until the native runtime core actually exists and passes its correctness, memory, residency, and I/O gates:

**DO NOT**:

- clone or study OpenClaw to design the core;
- clone or study Hermes to design the core;
- clone or study Odysseus to design the core;
- design framework-specific runtime replacement;
- design downstream agent adapters;
- build an HTTP/OpenAI compatibility surface;
- build UI/product ecosystem layers;
- expand into unrelated AI-agent architecture research;
- continue source archaeology simply because more source exists;
- add GPU complexity as a prerequisite for CPU correctness;
- download the approximately 1.56 TB Kimi K3 checkpoint merely to continue Phase 0;
- redesign llama.cpp/GGML kernels/model graphs without contradictory implementation evidence.

Downstream AI tools are **future consumers**, not current research dependencies.

The integration question is deliberately deferred until this sequence is true:

```text
Super-Runtime native core exists
        -> loads/executes correctly
        -> memory ledger works
        -> residency works
        -> runtime lifecycle works
        -> measured evidence passes
        -> only then study integration/replacement
```

---

# 6. Authority and decision precedence

When interpreting project context, use this order:

```text
1. docs/SUPER-RUNTIME-MASTER-CONTEXT.md
        |
2. docs/research/PHASE-0-LEARNING-COMPLETE.md
        |
3. docs/architecture/SUPER-RUNTIME-FOUNDATION.md
        |
4. current approved implementation plan
        |
5. individual executable spike documents
        |
6. individual research/extraction documents
        |
7. historical hypotheses / old "next research" sections
```

An older document may correctly describe what was unknown **at the time it was written**. If a later spike answered that question, the later result wins.

Example:

- `GGML-RESIDENCY-HOOK-POINTS.md` says dense graph-order residency still needed a prototype.
- `GGML-DENSE-RING-RESIDENCY-SPIKE.md` later executed that prototype successfully.

Therefore the first statement is historical research state, not the current project state.

---

# 7. The only active source references

Only two external code references are active for the runtime-core phase.

| Reference | Pinned revision | License observed | Current role |
|---|---|---|---|
| K3-in-C | `117e9d29bde14db9742f54fb66a191fd0bf03903` | Apache-2.0 | primary low-memory/out-of-core runtime behavior, I/O, lifetime, correctness, and benchmark reference |
| llama.cpp / GGML | `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38` | MIT | production model graph, GGUF/tensor, CPU kernel, model-state, scheduler, quantization, and optional-backend substrate |

Local paths:

```text
research/references/kimi-k3-in-c
research/references/llama.cpp
```

Reference policy:

1. keep them isolated under `research/references/`;
2. retain exact revision provenance;
3. do not copy code into production merely because it is present locally;
4. preserve applicable license/notice obligations for any actual reuse/adaptation;
5. record provenance when an implementation is adapted rather than independently implemented from a documented mechanism.

---

# 8. What K3-in-C is teaching Super-Runtime

K3-in-C is not being used because Super-Runtime should become a Kimi-specific runtime.

It is useful because its implementation and history provide concrete evidence for low-memory execution mechanisms.

The transferable principles frozen from the K3 study are:

## 8.1 Plan before allocation

A configuration should be validated and memory planned before uncontrolled allocation begins.

If mandatory execution state cannot fit the envelope, admission fails.

## 8.2 Storage is an active runtime tier

Logical model addressability does not require every weight byte to remain process-resident.

## 8.3 Residency is transactional

K3's expert-cache state provides a concrete reference:

```text
EMPTY
  -> INFLIGHT
  -> READY only after successful read
```

A short, failed, corrupt, or incomplete load must never publish valid residency.

## 8.4 Active compute owns a lease

A resident range must not be overwritten or evicted while an operation can still dereference it.

## 8.5 Policy follows access topology

K3 demonstrates that deterministic trunk walks and routed experts should not use the same cache policy.

## 8.6 Physical I/O order can differ from mathematical order

Reads can be sorted, deduplicated, coalesced, or reordered for storage locality while graph/arithmetic semantics remain unchanged.

## 8.7 Prefetch requires safe independent capacity

K3 history includes a real corruption case showing that asynchronous overwrite with only one reusable trunk slot is unsafe.

Frozen rule:

```text
if overlap requires current + next to coexist,
budget must fund independent capacity;
otherwise use synchronous one-slot fallback.
```

## 8.8 Context/state belongs to the same budget

Weight residency cannot be optimized independently from KV/recurrent/session state.

## 8.9 Measurement is part of the runtime contract

K3 evolved toward:

```text
hard ceiling
+ exact output gate
+ raw counters
+ policy-neutral traces
+ machine provenance
+ replicated timing when timing matters
```

Super-Runtime should inherit that development discipline.

---

# 9. What must not be generalized from K3

The following remain Kimi/checkpoint-specific and must not become universal Super-Runtime assumptions:

- Kimi Delta Attention equations;
- Gated MLA / NoPE geometry;
- Stable LatentMoE ordering;
- Kimi K3 exact layer map;
- exact layer/expert/top-k counts;
- K3 routing-bias semantics;
- six-span MXFP4 expert physical representation;
- exact K3 expert byte size;
- K3 `trunk.bin` packing layout;
- K3 safetensors names;
- K3 `config.json` schema;
- K3 tokenizer contract;
- K3-specific recurrent/attention state layout;
- model-specific arithmetic/fusion ordering.

Super-Runtime generalizes the **resource mechanism**, not the K3 neural graph.

---

# 10. Why llama.cpp/GGML is the approved substrate

Super-Runtime does not need to rebuild mature capabilities that already exist in llama.cpp/GGML.

The approved substrate owns or supplies:

- multi-architecture model graph construction;
- GGUF model/container ecosystem;
- normalized tensor/model roles;
- quantized tensor formats;
- CPU tensor kernels;
- architecture-correct KV/recurrent primitives;
- broad model-family support;
- tokenizer/chat-template infrastructure when later needed;
- optional accelerator backends such as existing supported GPU/device backends.

This avoids spending project effort recreating:

```text
model architecture registry
quantized matmul ecosystem
GGUF tooling
CPU SIMD kernels
CUDA/Metal/Vulkan/SYCL-style backend ecosystems
generic model conversion/state machinery
```

Super-Runtime should be different where its actual requirement is different: **global resource-governed execution**.

---

# 11. Ownership boundary: llama.cpp/GGML vs Super-Runtime

The strongest frozen separation is:

```text
llama.cpp / GGML owns
--------------------
model architecture semantics
model graph construction
GGUF/tensor representation
quantized compute kernels
CPU execution
optional accelerator backends
architecture-correct KV/recurrent primitives

Super-Runtime owns
------------------
global worker memory envelope
admission/resource planning
access-topology classification
tensor/range residency metadata
residency transactions
leases / in-use lifetime
runtime storage scheduling
dense graph-order residency policy
sparse selected-expert residency policy
storage prefetch/coalescing policy
context/state accounting under same budget
telemetry / measured evidence
hard-cap acceptance methodology
```

The runtime must not make compute kernels guess file/checkpoint structure.

The desired semantic flow is:

```text
model semantics
    -> validated tensor requirement
    -> physical locator/range
    -> residency requirement
    -> validated materialization
    -> existing compute semantics
```

---

# 12. Tensor/resource boundary

The K3 binding study suggests separating semantic tensor requirements from physical storage identity.

Conceptually:

```text
TensorContract
    semantic identity
    model/architecture scope
    logical shape
    logical dtype
    accepted storage representation
    kernel consumption contract
    access class
    lifetime class
    alignment constraints

TensorLocator
    container identity
    shard/file identity
    byte range
    stored shape
    stored representation
    integrity identity
```

Responsibility split:

```text
Architecture / model substrate
    declares semantic requirements

Container resolver
    proves physical model data satisfies them

Residency manager
    controls when validated physical ranges are resident

Compute substrate
    consumes a valid representation
```

Exact C/C++ struct names are **not frozen**. The responsibility boundary is frozen.

---

# 13. Frozen access classes

The first implementation uses semantic access topology rather than model brand.

```text
ALWAYS_RESIDENT
    small mandatory objects that should remain resident

SEQUENTIAL_CYCLIC
    predictable dense/fixed-order weight walks

SPARSE_INDEXED
    data-dependent selected ranges such as MoE experts

ROW_INDEXED
    embeddings/output/lookup tables whose rows/chunks are selected

STATE
    KV, recurrent, sequence/session state

DEVICE_STAGING
    temporary CPU/device transfer ownership

EPHEMERAL
    temporary graph/scratch/invocation working memory
```

The runtime should ask:

> What is the access topology and safe lifetime of this resource?

not:

> Which model brand is this?

---

# 14. Residency state machine

The Milestone-1 semantic state machine is frozen conceptually as:

```text
NONRESIDENT
    |
    v
RESERVED
    |
    v
LOADING / PREFETCHING
    |
    | complete + validated
    v
READY
    |
    v
LEASED / IN_USE
    |
    | safe completion
    v
EVICTABLE
    |
    v
NONRESIDENT
```

Failure rule:

```text
failed / short / invalid materialization
        -> NEVER READY
```

Eviction rule:

```text
LEASED / IN_USE
        -> CANNOT EVICT
```

Publication of `READY` is a semantic commit point.

---

# 15. Stable virtual identity vs physical residency

Current GGML CPU kernels expect dereferenceable host pointers.

Research proved that for a Linux file-backed mapping, a GGML tensor can retain one stable virtual address while its physical mapped RSS changes.

This creates a useful first CPU backing direction:

```text
stable GGML-visible virtual address
        +
explicit physical residency policy
```

Important distinctions:

```text
virtual mapped bytes
!= process mapped RSS
!= intentional runtime resident bytes
!= kernel page-cache bytes
```

`mmap` alone is not a memory governor.

Page faults alone are not the intended production scheduler.

The runtime needs explicit READY/prefetch semantics before compute whenever predictable scheduling is possible.

Linux mechanisms used in research include `mmap`, `madvise`, and `posix_fadvise`. These are implementation evidence, **not the public cross-platform contract**.

## Task 3 implementation checkpoint — FileResidency

The first production stable-address backing primitive now exists under `runtime/native/super_runtime/file_residency.*`.

Frozen Task-3 behavior:

```text
file mapping created
  -> virtual address remains stable for object lifetime
  -> mapping alone charges 0 ResidentWeights bytes

prefetch(aligned range)
  -> reserve newly intentional bytes in MemoryLedger
  -> Linux WILLNEED advice + synchronous page materialization
  -> publish intentional residency only after success

release(aligned range)
  -> MADV_DONTNEED on reusable mapping
  -> never munmap the reusable range
  -> return intentional ResidentWeights bytes to MemoryLedger

demand refault after release
  -> bytes remain correct
  -> same virtual address
  -> not counted as intentional runtime residency
```

The current backend implementation is Linux-specific behind a platform-neutral C++ class. Non-Linux residency backends remain deferred.

Task 3 does **not** implement `READY`/lease ownership, dense ordering, MoE routing, asynchronous I/O, or a production scheduler hook. It supplies the physical file-backed primitive those later policies can drive.

The bounded 16 MiB Linux fixture produced fresh observational RSS evidence in this Codespace: process RSS rose by roughly the mapped working-set size after explicit materialization and returned near baseline after `MADV_DONTNEED`. The exact RSS delta is not a correctness contract; stable address, byte correctness, ledger accounting, and range validation are the functional gates.

---

# 16. Dense/fixed-order residency policy

Dense/fixed-order weights use:

```text
SEQUENTIAL_CYCLIC
```

The policy derives its next-use ordering from graph/tensor execution order rather than model-specific routing metadata.

Semantic policy:

```text
current
    READY + LEASED

next
    PREFETCHED / READY when budget permits

previous
    becomes EVICTABLE only after safe completion
```

A two-slot `current + next` strategy is useful when the budget can fund overlap.

A one-slot synchronous fallback remains necessary when it cannot.

Ordinary LRU is not assumed to be a good default for deterministic cyclic layer walks.

The exact grouping unit is still implementation/performance work. It may eventually be:

- one tensor;
- a coalesced physical range;
- a logical layer group;
- another metadata-derived reusable unit.

The semantic graph-order policy is already proven feasible.

---

# 17. MoE/sparse residency policy

MoE/data-dependent weights use:

```text
SPARSE_INDEXED
```

GGML `MUL_MAT_ID` already carries selected expert IDs.

The generic semantic flow is:

```text
architecture-specific router/selector
        |
        v
GGML selected expert IDs
        |
        v
selected physical tensor ranges
        |
        v
Super-Runtime residency request
        |
        v
RESERVED -> LOADING -> READY
        |
        v
LEASE selected ranges
        |
        v
GGML MUL_MAT_ID
        |
        v
safe completion
        |
        v
release -> EVICTABLE
```

Therefore a Kimi-specific expert loader is not required merely to discover selected experts.

The production scheduler hook shape is not yet frozen. The existing GGML eval callback was used as a synchronized research instrument, not chosen as the final API.

---

# 18. Row-indexed large tables

Embeddings, output tables, and other row/chunk-selective structures are not naturally dense-ring or MoE-cache resources.

They belong to:

```text
ROW_INDEXED
```

The substrate already contains row/lazy-access concepts for some large tables. Super-Runtime should preserve such architecture/substrate support rather than force every table through a universal streaming policy.

Milestone 1 is not required to solve every advanced row-indexed optimization before the native runtime exists.

---

# 19. Global memory governance

A memory budget is not valid merely because one internal cache was configured below a number.

The planned worker envelope must reconcile the whole process.

Conceptually:

```text
configured worker envelope
    - runtime/control overhead
    - mandatory metadata/small resident weights
    - architecture state floor
    - active context/KV/recurrent state
    - compute/scratch requirements
    - required I/O/device staging
    - safety reserve
    = discretionary dynamic weight residency budget
```

The planner must reserve mandatory costs before discretionary cache/residency capacity.

If the request cannot fit:

```text
REFUSE ADMISSION
```

Do not:

```text
silently shorten context
or
hope the OS avoids OOM
```

The historical approximately `8 GiB` worker target is an engineering target used to drive design and testing.

It is **not** a universal promise.

A model/context configuration may require more memory or may be infeasible under that envelope.

---

## Task 2 implementation checkpoint — MemoryLedger

The conceptual global budget now has its first production primitive under `runtime/native/super_runtime/memory_ledger.*`.

Frozen Task-2 semantics:

```text
reserve(category, bytes)
  accepted only if owned + bytes <= hard budget
  overflow/refusal is atomic

release(category, bytes)
  accepted only if that category owns enough bytes
  underflow/refusal is atomic

owned_bytes == sum(category ownership)
owned_bytes <= budget_bytes after every accepted mutation
```

Task 2 is intentionally **accounting only**. It does not claim that ledger bytes equal measured RSS, file-backed resident pages, page cache, or GPU allocations. Later subsystems must reconcile their owned allocations with this ledger and separately report measured memory.

The implementation is mutex-protected and its focused test exercises concurrent reservation/release accounting.

---

# 20. Required memory/accounting domains

The runtime should eventually reconcile at least:

```text
virtual mapped bytes
process RSS / working set
mapped-weight RSS where measurable
intentional resident weight bytes
leased weight bytes
prefetched weight bytes
context/KV bytes
recurrent-state bytes
scratch/compute bytes
staging bytes
backend allocations
optional device memory
runtime/control overhead
safety reserve
kernel page-cache estimate/pressure where measurable
unaccounted memory
```

Each memory-producing subsystem should expose enough information to describe:

```text
category
semantic owner
allocated bytes
resident bytes where measurable
minimum bytes
preferred bytes
reclaimable bytes
alignment/page overhead
persistent vs ephemeral lifetime
safe reclaim condition
```

Planned accounting must be compared against measured process memory.

---

# 21. Context, KV, recurrent state, and session state

Context/state is a first-class runtime resource problem.

Super-Runtime must **not** invent one universal KV layout.

Use architecture-correct state implementations from the substrate and account them under the global budget.

Important frozen rules:

1. estimate/admit state before expensive session allocation;
2. account KV/recurrent state against the same worker envelope as weights;
3. session state has semantic ownership independent of weight residency;
4. persistent state publication must be transactional;
5. state restore requires strong compatibility identity;
6. execution modes such as speculation must declare their incremental state/staging cost before admission;
7. no claim currently exists that arbitrary long contexts fit an approximately 8 GiB worker.

K3 state research establishes a broader rule:

> Compute may be speculative; authoritative persistent state publication must be transactional.

Conceptually:

```text
COMMITTED generation N
        |
        +--> WORKING generation N+1
                  |
                  | execution succeeds
                  v
             publish COMMITTED
```

A failed generation must not corrupt the last committed session state.

---

# 22. Request invocation state is separate from persistent graph/model state

The dense executable spike discovered an important lifetime issue.

Repeated execution initially produced small output differences. Instrumentation showed the input tensor bytes had changed after graph compute because scheduler allocation/lifetime reuse did not guarantee the fixture input bytes would persist unchanged across invocations.

Rewriting the request input before each invocation restored exact output equality.

Frozen ownership rule:

```text
graph/model state
!=
request invocation state
```

Callers/runtime entrypoints must establish request input state per invocation rather than assuming all graph input storage survives previous execution.

---

# 23. Storage scheduling is separate from neural semantics

Super-Runtime may optimize storage work such as:

```text
physical offset order
shard/file grouping
read coalescing
deduplication
queue depth
look-ahead prefetch
selected-expert batching
CPU/device staging
```

without changing the neural graph's semantic dependency/arithmetic order.

K3's history and source demonstrate this separation concretely.

A storage optimization must never silently reorder model arithmetic in a way that changes semantics.

---

# 24. Correctness and fail-closed rules

Optimization is accepted only if model/runtime semantics remain correct.

Frozen correctness principles:

- malformed/incompatible model contracts fail during load/admission;
- failed or short exact reads never publish `READY`;
- a lease prevents eviction/overwrite until safe completion;
- required ranges must be READY before their operation dereferences them;
- transient request inputs are re-established per invocation;
- state is published only after valid execution;
- incompatible persisted state is refused;
- no silent partial inference is reported as success;
- performance capability fallback may be allowed when semantics remain unchanged;
- semantic invalidation must fail closed.

Small structurally faithful fixtures are preferred for core correctness because they can run continuously without giant checkpoints.

Large-model validation is an additional gate, not the only possible correctness evidence.

---

# 25. Executable evidence accumulated in Phase 0

The following results are feasibility evidence, not a claim that production Super-Runtime already exists.

## 25.1 K3 reference validation

Fresh K3 weightless/reference tests passed, including its full tiny-model oracle with:

```text
teacher forcing exact
state reuse bit-identical
greedy decode exact
incremental decode exact
VERDICT: ENGINE MATCHES THE REFERENCE EXACTLY
ALL WEIGHTLESS TESTS PASSED
```

Tokenizer parity was not run because that path depends on checkpoint-supplied tokenizer material.

## 25.2 CPU MoE selector seam

A synthetic GGML graph demonstrated:

```text
selector
    -> selected IDs available
    -> only selected expert slices materialized
    -> materialization completed before MUL_MAT_ID
    -> exact output vs fully resident baseline
```

The tested selected union was `{0, 1, 3}` while expert `2` remained intentionally unloaded.

This proved that selected expert requirements can be discovered below model-specific graph code.

## 25.3 Stable-VA file-backed residency

A Linux synthetic experiment used a 128 MiB file-backed GGML weight tensor.

Observed behavior included:

```text
warm mapped-weight VMA RSS:       128 MiB
after MADV_DONTNEED:                0 MiB
after selected refault:            96 MiB
GGML-visible tensor address:       stable
output difference:                 0
```

This proved stable virtual tensor identity can coexist with changing physical mapped RSS in that environment.

It did **not** prove a cross-platform production memory governor.

## 25.4 Selector-driven prefetch + READY barrier

For the same logical 128 MiB expert geometry with a selected 96 MiB working set:

Cold demand execution produced roughly hundreds of major faults during the expert compute window.

Selector-driven prefetch/materialization produced:

```text
READY before compute:                  YES
selected mapped-weight RSS:            96 MiB
MUL_MAT_ID compute-window major faults: 0
MUL_MAT_ID compute-window minor faults: 0
output max difference:                  0
```

Linux kernel readahead caused a small amount of unused expert page-cache presence. That is not intentional runtime residency and must be measured separately.

This spike proved scheduling semantics, not asynchronous overlap or performance superiority.

## 25.5 Dense graph-order two-slot ring

A four-layer dense synthetic graph used 64 MiB total logical dense weights.

Managed execution showed:

```text
demand path mapped-weight RSS:       64 MiB
managed max ring mapped-weight RSS:  32 MiB
managed compute faults per layer:     0 major / 0 minor
managed final mapped-weight RSS:      0 MiB
output max difference:                0
```

This was repeated successfully.

The policy was:

```text
current + next resident
release previous only after safe synchronized completion
```

This proves bounded graph-order dense residency is executable in the synthetic CPU fixture.

It does not prove asynchronous performance, real-model grouping, Windows behavior, or optimal slot count.

---

# 26. Proven vs not yet proven

## Proven at feasibility/research level

- K3 low-memory mechanisms contain architecture-agnostic resource principles.
- K3-specific neural/checkpoint structure must remain model-specific.
- llama.cpp/GGML is a viable multi-architecture compute/model substrate.
- GGML exposes selected MoE expert IDs at a useful semantic seam.
- selected CPU expert ranges can be materialized before `MUL_MAT_ID`.
- stable file-backed GGML-visible addresses can survive Linux mapped-RSS eviction/refault.
- dense graph order can drive a bounded two-slot residency working set.
- READY/lease semantics are necessary to express correctness around dynamic residency.
- context/state must compete with dynamic weights under one global budget.
- demand paging should be considered a correctness fallback, not the intended scheduling strategy.

## Not yet proven / implementation-time validation

- a production-quality Super-Runtime executable;
- real model loading through a Super-Runtime-owned lifecycle;
- hard approximately 8 GiB worker compliance for specific real models;
- hard external memory-cap enforcement in the current Codespace;
- production scheduler-hook API shape;
- asynchronous I/O overlap with useful compute;
- real-model optimal grouping/prefetch depth;
- Windows residency backend;
- GPU residency/staging integration;
- production performance advantage over existing runtime modes;
- downstream AI-tool runtime replacement;
- HTTP/OpenAI-compatible integration;
- broad real-model performance or quality claims.

These are not reasons to reopen Phase-0 archaeology. They are implementation milestones/tests.

---

# 27. Benchmark and evidence policy

Super-Runtime should use an evidence hierarchy.

## Level 0 — structural proof

- source contracts;
- shapes/types;
- deterministic byte calculations;
- alignment/container invariants.

## Level 1 — synthetic correctness

- tiny graph/model fixtures;
- exact oracle comparison;
- short-read/failure/corruption/race injection.

## Level 2 — mechanism counters

- bytes requested/read/prefetched;
- residency state transitions;
- leases;
- cache/residency events;
- page faults;
- allocation/state bytes.

## Level 3 — enforced resource proof

- real external memory limit;
- swap disabled where appropriate;
- measured peak RSS/working set;
- explicit OOM classification.

## Level 4 — replicated performance

- repeated comparable runs;
- machine/runtime/storage provenance;
- raw samples;
- separate I/O/materialization and compute timing.

## Level 5 — real downstream workload

Deferred until the runtime exists. Real integration/task workload validation comes later.

Every optimization should have a primary metric that directly measures the mechanism it claims to improve.

A stopwatch alone is insufficient when timing noise is material.

---

# 28. Benchmark provenance requirements

Meaningful benchmark artifacts should eventually record:

```text
Super-Runtime commit
llama.cpp/GGML substrate commit
model/container fingerprint
architecture/model identity
quantization
OS/kernel
CPU / ISA / thread configuration
GPU/device/driver when applicable
storage device/filesystem
memory/residency policy
hard-limit mechanism
context size
parallelism
cold/warm policy
raw per-run records
```

A summarized chart without sufficient provenance must not become architectural evidence.

---

# 29. Platform boundary

## Linux

Linux Phase-0 probes established feasibility using file-backed mappings and Linux VM/page-cache mechanisms.

This is the first prototype platform for residency semantics because it provided measurable tooling in the Codespace research environment.

The current Codespace does **not** provide a trustworthy external hard cgroup memory ceiling suitable for final hard-cap claims.

Do not fake hard-cap acceptance with `ulimit -v`, because large stable virtual mappings can legitimately exceed the desired physical RSS target.

## Windows

A Windows residency backend is required later because the intended runtime is not POSIX-only.

The public residency abstraction must not expose Linux-specific primitives.

Windows should implement corresponding file-mapping/residency behavior behind the same semantic states:

```text
NONRESIDENT -> READY -> LEASED -> EVICTABLE
```

Windows backend implementation is deferred until the native runtime foundation exists.

## GPU

GPU is optional.

CPU defines the mandatory correctness path.

Future GPU staging/offload must participate in the same global budget/residency semantics instead of creating an unrelated second resource system.

GPU is not a Milestone-1 prerequisite.

---

# 30. Polyglot boundary

Long-term Super-Runtime may be polyglot, but Milestone 1 does not need a large control-plane architecture.

Frozen principle:

```text
hot tensor/I/O/residency/compute data path
        -> native C/C++
```

Python is acceptable for:

- conversion/development tooling;
- fixture generation;
- benchmark analysis;
- research utilities.

Python must not be inserted into the per-layer/per-token production hot path.

A future Rust or other systems-language control plane may coordinate coarse lifecycle/policy/telemetry if implementation evidence justifies it.

Do not cross the language boundary for every tensor read or matrix operation.

For Milestone 1, the higher-level control plane is **deferred**.

---

# 31. First real implementation architecture

The first runnable runtime is intentionally smaller than the long-term product vision.

```text
minimal native Super-Runtime entrypoint
            |
            v
llama.cpp / GGML CPU substrate
            |
            v
Super-Runtime resource scheduler seam
            |
            +--> MemoryLedger / admission
            +--> residency states + leases
            +--> file-backed stable-VA residency
            +--> SEQUENTIAL_CYCLIC dense policy
            +--> SPARSE_INDEXED MoE policy
            |
            v
CPU execution
```

No HTTP service is required to prove this milestone.

No downstream agent is required.

No GPU is required.

No UI is required.

---

# 32. Milestone 1 — `SUPER-RUNTIME EXISTS`

Super-Runtime is not considered to exist merely because its architecture is documented.

Milestone 1 is complete only when a real native implementation can demonstrate a lifecycle such as:

```text
start runtime
    -> initialize approved GGML CPU substrate
    -> load/admit a deterministic small model/fixture
    -> construct memory/resource plan
    -> execute through Super-Runtime-owned residency semantics
    -> report memory/residency telemetry
    -> preserve correctness oracle
    -> release resources
    -> unload/exit cleanly
```

A useful conceptual command target is:

```text
super-runtime run <fixture/model>
```

The exact CLI syntax is not frozen. The lifecycle behavior is the target.

---

# 33. Approved Milestone-1 implementation sequence

The current plan is deliberately sequential.

Do not implement all tasks at once.

## Task 1 — establish production native substrate boundary

Target:

- production/native location for the pinned/controlled llama.cpp/GGML baseline;
- CPU-only build/smoke target;
- revision and patch policy documented;
- provenance/license boundary explicit.

No residency behavior yet.

## Task 2 — deterministic `MemoryLedger`

Target categories include:

- resident weights;
- context/state;
- compute scratch;
- staging;
- accelerator memory;
- runtime overhead.

Core invariant:

```text
owned <= configured budget
```

Test overflow, reserve, refusal, release, and category totals.

## Task 3 — stable-address file-backed residency primitive

Target:

- stable virtual address;
- page/range prefetch/release semantics;
- range validation;
- memory-ledger integration;
- platform-specific details hidden behind abstraction.

First prototype uses Linux behavior already proven in research.

## Task 4 — generic MoE selected-expert planner

Input:

```text
GGML MUL_MAT_ID selected IDs
+ tensor shape/stride/physical metadata
```

Output:

```text
validated deduplicated/coalesced required ranges
```

It must not inspect a Kimi/Qwen/DeepSeek model-family enum merely to decide which selected expert slices to fetch.

## Task 5 — fixed-order dense residency policy

Target:

```text
current READY/leased
next look-ahead when budget allows
one-slot synchronous fallback
previous release at safe point
```

Avoid ordinary LRU as the default model for a deterministic cyclic walk.

## Task 6 — global runtime budget planner

Input includes:

- fixed model/runtime cost;
- context/state estimate;
- scratch/compute estimate;
- configured memory ceiling;
- dynamic weight residency requirements;
- optional device inventory later.

The planner must reject infeasible requests rather than overshoot.

## Task 7 — external memory-ceiling acceptance harness

On a supported host:

- use a real hard memory enforcement mechanism;
- disable swap where required by the test contract;
- distinguish OOM from runtime failure;
- capture provenance and peak RSS.

On unsupported environments:

```text
FAIL CLOSED / REPORT UNSUPPORTED
```

Do not fabricate a hard-cap result.

## Task 8 — minimal native runtime smoke entrypoint

Exercise:

```text
load -> admit -> execute -> telemetry -> cleanup -> unload
```

Use a small deterministic fixture.

No provider/API/AI-tool protocol belongs in this task.

---

# 34. Definition of Done for Milestone 1

Milestone 1 is accepted only if fresh executable evidence demonstrates all applicable items:

```text
[x] native Super-Runtime source exists
[x] controlled/pinned GGML CPU substrate builds
[ ] a deterministic fixture/model loads through the runtime path
[x] memory ledger is active
[x] infeasible ledger reservations are refused
[x] stable file-backed residency primitive is active
[ ] dense residency path executes correctly
[ ] MoE selected-range residency path executes correctly
[ ] required ranges are READY before dereference
[ ] leased ranges cannot be reclaimed early
[ ] output matches the correctness oracle
[ ] measured RSS/residency telemetry is reported
[ ] cleanup/unload releases runtime ownership cleanly
[ ] all tests pass
[ ] implementation is committed and verified on canonical GitHub
```

Only after those conditions are satisfied should the project say:

> **Super-Runtime exists as a first runnable core.**

Production quality, broad model compatibility, Windows, GPU, APIs, and AI-tool replacement remain later milestones.

---

# 35. Explicitly deferred until after Milestone 1

These items are not current work:

```text
OpenClaw integration
Hermes integration
Odysseus integration
runtime replacement inside downstream AI tools
OpenAI-compatible HTTP API
provider gateway
large Rust control plane
UI
cloud services
broad GPU optimization
advanced learned/speculative residency
large-model performance claims
full Windows backend
```

They must not be pulled into Milestone 1 because they multiply unknowns before the runtime foundation exists.

---

# 36. Rejected directions

Do not restart the following approaches without new contradictory implementation evidence:

1. rebuilding llama.cpp/GGML's broad model graph and kernel ecosystem from scratch;
2. copying K3's neural architecture/checkpoint layout into the universal core;
3. implementing independent streaming engines per model brand;
4. treating `mmap` alone as a memory governor;
5. treating page-cache residency as process-owned RSS;
6. using demand faults inside matrix compute as the intended scheduler;
7. freezing the GGML eval callback as the production residency API merely because it was useful in a probe;
8. promising all models fit approximately 8 GiB;
9. silently reducing requested context to satisfy a budget;
10. designing downstream AI-tool adapters before the runtime runs;
11. treating a synthetic timing win/loss as production performance evidence without provenance and replication.

---

# 37. Stop-learning rule

Phase 0 is closed.

Do not start another broad research branch unless at least one condition is true:

```text
implementation contradicts a frozen assumption
OR
correctness cannot be explained by the current contracts
OR
required upstream substrate behavior is genuinely undocumented/ambiguous
```

When such a condition occurs:

1. write the exact implementation blocker;
2. identify the smallest source question needed to unblock it;
3. run a bounded research spike;
4. update this master context only if the evidence changes a frozen decision;
5. return to implementation.

Research must be pulled by an implementation blocker, not pushed by curiosity.

---

# 38. How to prevent future scope drift

Any future session working on Super-Runtime should begin with this checklist:

```text
1. Read docs/SUPER-RUNTIME-MASTER-CONTEXT.md.
2. State the current milestone.
3. State the single task being worked on.
4. Confirm the task belongs to the active milestone.
5. Do not add downstream integration work.
6. Do not open a new research branch unless the stop-learning rule is triggered.
7. Keep K3-in-C and llama.cpp/GGML as the only active source references for runtime-core work.
8. Complete, test, commit, push, and verify one checkpoint before expanding scope.
```

If a proposed action cannot be connected directly to the active Milestone-1 sequence, stop and justify why it is necessary before doing it.

---

# 39. Source-document map

The documents below remain in the repository for auditability and detailed evidence.

They are **supporting evidence**, not separate competing roadmaps.

## `README.md`

Role: project entrypoint and scope summary.

Current meaning:

- canonical location is the Agent-Core monorepo subproject;
- CPU-first local inference runtime;
- K3-in-C + llama.cpp/GGML are the active reference/substrate boundary;
- Phase 0 is complete;
- next action is implementation.

## `runtime/native/README.md`

Role: authoritative Task-1 production substrate boundary documentation.

Current authority:

- records the exact pinned llama.cpp/GGML production revision;
- defines the CPU-only native build and smoke target;
- defines the upstream patch/provenance policy for the native substrate;
- documents the Task 2 `MemoryLedger`, its accounting-only semantics, and focused CTest path;
- documents the Task 3 Linux `FileResidency` primitive, stable-address/release semantics, and focused CTest path;
- documents Codespace native build tooling and the `tests/contracts/native-substrate.sh` verification path;
- does **not** imply that model loading, residency leases, dense/MoE scheduling, or a runnable inference lifecycle already exists.

If this document conflicts with general project direction, this master context still wins.

## `docs/research/PHASE-0-PROJECT-CHARTER.md`

Role: original Phase-0 goals, non-goals, memory research contract, and nine research gates.

Current authority:

- gates are answered by `PHASE-0-LEARNING-COMPLETE.md` and this master;
- its consumer integration deferral remains valid.

## `docs/research/KIMI-K3-RUNTIME-EXTRACTION.md`

Role: first extraction of reusable K3 low-memory mechanisms.

Key contribution:

- explicit byte budgets;
- packed-weight residency;
- access-pattern-specific I/O;
- transactional publish-after-I/O;
- storage-aware batching;
- direct positioned I/O and alignment;
- measurement discipline;
- warning that context/state can dominate memory.

Historical note:

- its "next research questions" were later answered by subsequent documents and are not an active roadmap.

## `docs/research/LLAMA-CPP-RUNTIME-EXTRACTION.md`

Role: assessment of llama.cpp/GGML as the reusable multi-architecture substrate.

Key contribution:

- broad model registry and backends should be reused;
- mmap/load/lazy modes do not by themselves create Super-Runtime's hard global residency policy;
- Kimi K3 is already represented in the multi-model substrate;
- architecture-correct compressed/polymorphic state should be reused rather than blindly copying standalone K3 state representation.

Historical note:

- its proposed reuse boundary was later frozen by the differential/foundation/Phase-0 freeze.

## `docs/research/CONTEXT-STATE-MEMORY.md`

Role: context/KV/recurrent/session memory analysis.

Key contribution:

- state must share the same global memory envelope as dynamic weights;
- architecture-specific state remains polymorphic;
- admission should precede context allocation;
- persistence/recomputation are policy choices, not one universal scheme.

Scope correction:

- references to agent-scale context are motivation/evidence, not permission to study downstream AI tools during Milestone 1.

## `docs/research/K3-SOURCE-ARCHAEOLOGY.md`

Role: deep source-level extraction of K3's execution, binding, residency, I/O, state, measurement, and fail-closed behavior.

Key contribution:

```text
semantic requirement
 -> byte-range identity
 -> access topology
 -> residency transaction/lifetime
 -> storage scheduling
 -> existing compute semantics
```

This remains a primary evidence source for why the runtime resource model is designed this way.

## `docs/research/K3-MEMORY-LIFETIME-MAP.md`

Role: maps persistent, context-growing, scratch, staging, and speculative memory lifetimes.

Key contribution:

- the worker budget is one reconciled envelope;
- context growth and weight residency compete;
- an "8 GB mode" is not valid without full-process accounting and hard evidence.

## `docs/research/K3-LLAMACPP-DIFFERENTIAL.md`

Role: compares K3 strengths with llama.cpp/GGML strengths.

Key contribution:

- strongest ownership boundary between substrate and Super-Runtime;
- reuse llama graphs/kernels/state;
- Super-Runtime owns global memory/residency/I/O policy.

Current authority:

- its ownership split is incorporated directly into this master context.

## `docs/research/K3-GIT-HISTORY-ARCHAEOLOGY.md`

Role: studies why K3's invariants evolved, including silent-corruption fixes.

Key contribution:

- one-slot async trunk overwrite is a real correctness hazard;
- residency transactions and lifetime invariants should be regression-tested;
- benchmark/policy decisions must be evidence-driven rather than aesthetic.

## `docs/research/K3-BENCHMARK-PROVENANCE.md`

Role: evidence/benchmark methodology.

Key contribution:

- hard ceiling + exact correctness + mechanism counters + provenance + replication;
- raw historical K3 timing should not be treated as universal Super-Runtime performance evidence.

## `docs/research/K3-STATE-EXECUTION-TRANSACTIONS.md`

Role: semantic-state and generation transaction analysis.

Key contribution:

- authoritative state publication is a transaction;
- speculative/working state must not corrupt committed state;
- state identity/persistence needs stronger compatibility/integrity than a loose geometry fingerprint.

Scope correction:

- any proposed future Rust control-plane details in that research are deferred; Milestone 1 remains native and minimal.

## `docs/research/K3-BINDING-AND-WEIGHT-CONTRACTS.md`

Role: tensor/binding ownership analysis.

Key contribution:

- semantic tensor contracts should be separated from physical locators;
- architecture semantics, container resolution, residency, and compute should have distinct responsibilities.

## `docs/research/RESIDENCY-SEAM-ANALYSIS.md`

Role: explores where storage residency could attach to GGML.

Key contribution:

- CPU kernels require dereferenceable host pointers;
- `MUL_MAT_ID` exposes selected expert IDs;
- dense weights need graph-order policy;
- stable VA plus explicit scheduler residency is a strong direction.

Historical note:

- its A/B/C seam choices were research alternatives; later executable spikes support stable-VA + scheduler-owned residency semantics for the first CPU implementation.

## `docs/research/GGML-RESIDENCY-HOOK-POINTS.md`

Role: source-level GGML scheduler/operation seam analysis.

Key contribution:

- selected expert IDs are visible before expert use;
- GGML already uses IDs for selected-expert backend transfer;
- dense, sparse, and row-indexed access classes can attach below model-specific graph code;
- eval callback can prove ordering but should not be the final residency API.

Historical note:

- several listed prototypes were later executed successfully.

## `docs/research/GGML-CPU-MOE-RESIDENCY-SPIKE.md`

Role: first executable CPU MoE selector-to-residency proof.

Key contribution:

- selected IDs can be observed before `MUL_MAT_ID`;
- only selected slices need valid bytes for the tested graph;
- exact output can be preserved.

Its formerly open stable-backing question was answered by the next spike.

## `docs/research/GGML-STABLE-VA-FILE-BACKED-RESIDENCY-SPIKE.md`

Role: executable stable-address file-backed physical-residency proof.

Key contribution:

- tensor virtual identity can remain stable while mapped process RSS is dropped/refaulted;
- process RSS and page cache are different measurements;
- only the selected working set returned to mapped RSS in the tested fixture.

Its recommended prefetch/READY scheduling question was answered by the later selector-prefetch spike.

## `docs/research/GGML-SELECTOR-PREFETCH-READY-SPIKE.md`

Role: executable selected-range prefetch + READY barrier proof.

Key contribution:

- selected ranges can be materialized before CPU `MUL_MAT_ID`;
- compute-window page faults can be reduced to zero in the tested fixture;
- exact output is preserved;
- synchronous proof does not imply production performance or async overlap.

## `docs/research/GGML-DENSE-RING-RESIDENCY-SPIKE.md`

Role: executable dense graph-order residency proof.

Key contribution:

- a four-layer 64 MiB logical dense walk was bounded to a 32 MiB two-slot mapped-RSS ring;
- managed layer compute had zero measured page faults;
- output was exact after correctly restoring invocation input state;
- graph inputs are invocation state, not guaranteed persistent storage.

## `docs/research/SUPER-RUNTIME-ARCHITECTURAL-EXTRACTION.md`

Role: consolidated architectural interpretation before the final freeze.

Key contribution:

- model-memory fabric concept;
- access classes;
- leases;
- storage scheduling separation;
- global budget controller;
- CPU-first architecture;
- verification fixtures;
- recommendation not to rebuild substrate capabilities without evidence.

Current authority:

- retained as detailed design reasoning;
- where its old future/control-plane language exceeds Milestone 1, this master context's scope guard wins.

## `docs/research/PHASE-0-LEARNING-COMPLETE.md`

Role: formal closure of Phase-0 learning.

Key contribution:

- answers all nine Phase-0 gates;
- freezes access classes, first CPU residency direction, global memory model, benchmark gates, and stop-learning rule;
- explicitly states the first runnable runtime is now the next frontier.

This is the strongest source below this master context.

## `docs/research/REFERENCE-PROVENANCE.md`

Role: exact active external source revisions and license/provenance policy.

Current authority:

- K3-in-C and llama.cpp/GGML are the only active runtime-core source references.

## `docs/architecture/SUPER-RUNTIME-FOUNDATION.md`

Role: approved foundation specification.

Key contribution:

- product definition;
- approved compute substrate;
- ownership responsibilities;
- residency/memory model;
- CPU-first / optional-GPU principle;
- correctness policy;
- immediate implementation frontier.

Scope interpretation:

- any high-level control-plane/integration diagram is long-term context;
- Milestone 1 uses the smaller native architecture defined in this master context and Phase-0 freeze.

## `docs/superpowers/plans/2026-08-31-residency-foundation.md`

Role: current implementation sequence.

Current meaning:

- execute tasks one by one;
- establish substrate first;
- then ledger;
- then residency primitive;
- then MoE and dense policies;
- then global budget;
- then hard-ceiling harness;
- then minimal native runtime entrypoint;
- no downstream AI-tool dependency belongs in those tasks.

---

# 40. Canonical project statement

Use this statement when a short explanation of Super-Runtime is needed:

> **Super-Runtime is a not-yet-runnable CPU-first local inference runtime whose first production foundations now exist: a pinned llama.cpp/GGML CPU substrate boundary, a deterministic `MemoryLedger`, and a Linux stable-address file-backed residency primitive. Its defining goal is to make model weights and architecture-correct state operate under an explicit global resource envelope. It reuses llama.cpp/GGML for model graphs, GGUF/tensors, kernels, and architecture-specific state, while Super-Runtime owns memory admission, file-backed weight residency, access-topology scheduling, storage I/O policy, leases, telemetry, and hard-cap validation. K3-in-C is the primary reference for proven low-memory execution patterns, not a neural architecture to copy. Phase 0 learning is complete; the active frontier remains building the first runnable native runtime core. Downstream AI-tool integration is deferred until that runtime actually exists.**

---

# 41. One diagram to preserve the direction

```text
                    DEFERRED
          future AI-tool integrations
                    |
                    v
        narrow compatibility adapters later
                    |
============================================================
                    |
             SUPER-RUNTIME CORE
                    |
        +-----------+-----------+
        |                       |
        v                       v
 Global Memory Governor   Residency / I/O Policy
        |                       |
        |        +--------------+--------------+
        |        |              |              |
        |   SEQUENTIAL      SPARSE         STATE / ROW
        |    dense          indexed           indexed
        |        |              |              |
        +--------+--------------+--------------+
                    |
                    v
             llama.cpp / GGML
       graph + GGUF + kernels + state
                    |
                    v
               CPU mandatory
                    |
                    +----> GPU optional later
                    |
                    v
             RAM <----> NVMe
        bounded resident working set
```

The lower half is the active runtime-core problem.

The upper deferred integration layer must not drive current implementation decisions.

---

# 42. Final operational instruction

For all future Super-Runtime work:

> **Finish one runtime-core checkpoint at a time. Do not solve future integration before the runtime exists. Do not reopen Phase-0 research unless implementation contradicts a frozen assumption. Preserve evidence, test correctness, push every meaningful checkpoint to canonical GitHub, and let implementation—not speculation—determine the next unknown.**
