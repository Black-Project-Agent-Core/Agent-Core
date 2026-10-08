# Super-Runtime Phase 0 Learning Freeze

Status: **LEARNING COMPLETE — READY FOR FIRST RUNTIME IMPLEMENTATION**
Date: 2026-08-31

## Purpose of this freeze

Phase 0 existed to answer one question before writing a new runtime:

> Which parts of K3-in-C's low-memory execution are general runtime mechanisms, and where can those mechanisms attach to llama.cpp/GGML without rebuilding every model graph and kernel?

That question is now sufficiently answered to begin the first runnable Super-Runtime implementation.

This document deliberately stops source archaeology from becoming an endless project. New research is allowed only when implementation evidence falsifies one of the frozen assumptions below or exposes a genuinely unknown correctness boundary.

## Active evidence base

Only two source references are active:

| Reference | Revision | Role |
|---|---|---|
| `kimi-k3-in-c` | `117e9d29bde14db9742f54fb66a191fd0bf03903` | primary low-memory/out-of-core runtime behavior and correctness methodology |
| `llama.cpp` / GGML | `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38` | production model-graph, tensor, CPU-kernel, GGUF, state, scheduler, and optional-backend substrate |

Downstream AI tools are **not** part of Phase 0 research and must not be cloned or studied to design the runtime core.

---

# The nine Phase-0 gates

## Gate 1 — Which K3 principles are architecture-agnostic?

**Decision: answered.**

The reusable mechanisms are:

1. **Plan before allocation.** Refuse configurations whose mandatory working set cannot fit the configured envelope.
2. **Storage is an active execution tier.** Weight bytes need not all be process-resident merely because the logical model is addressable.
3. **Transactional residency.** A range is not READY until its read/materialization has succeeded completely. K3's `EMPTY -> INFLIGHT -> READY` behavior is the concrete reference.
4. **Lease/in-use lifetime.** Bytes used by an active operation cannot be evicted or overwritten until a safe completion point.
5. **Access topology determines policy.** Predictable dense walks, routed experts, row-indexed tables, persistent state, and temporary staging need different policies.
6. **Physical I/O ordering is separate from mathematical ordering.** Reads may be sorted/coalesced while the graph preserves semantic and floating accumulation order.
7. **Look-ahead is useful only when ownership is safe.** One-slot asynchronous overwrite is not acceptable; a synchronous fallback is required when the budget cannot afford overlap.
8. **Context/state is part of the same memory problem.** Weight streaming alone does not satisfy a worker memory ceiling.
9. **Correctness and memory claims need executable oracles.** Exact/parity fixtures and measured RSS are more important than cache-hit storytelling.

These principles do not require Kimi K3's neural architecture.

## Gate 2 — Which K3 mechanisms are Kimi/checkpoint-specific?

**Decision: answered. Do not generalize these into the core.**

K3-specific material includes, among other details:

- Kimi K3's exact KDA / Gated MLA / Stable LatentMoE graph;
- its number of layers, experts, top-k, and architecture geometry;
- its six-span MXFP4 expert physical representation and exact expert byte size;
- its `trunk.bin` offline packed layout and K3-specific layer packing;
- its checkpoint tensor names/config schema/tokenizer assumptions;
- K3-specific recurrent/attention state representation;
- exact model-specific fusion and arithmetic-order rules.

Super-Runtime may learn the mechanism from K3, but physical ranges and state semantics must come from the actual model/container/substrate metadata.

## Gate 3 — What model/graph abstraction should Super-Runtime own?

**Decision: answered at the semantic level. Exact C/C++ ABI remains implementation detail.**

Super-Runtime does **not** own a universal neural graph. llama.cpp/GGML owns model graphs and model-family support.

Super-Runtime owns the resource view around those graphs:

```text
GGML operation / tensor dependency
        |
        v
Resource requirement
  semantic tensor identity
  access class
  physical locator/range
  byte size/alignment
  residency state
  lease lifetime
        |
        v
Residency manager / storage scheduler
```

Frozen access classes for the first implementation:

```text
ALWAYS_RESIDENT
SEQUENTIAL_CYCLIC
SPARSE_INDEXED
ROW_INDEXED
STATE
DEVICE_STAGING
EPHEMERAL
```

The exact struct names are not frozen; the separation of ownership is.

## Gate 4 — Which native compute/model ecosystem should be reused?

**Decision: answered.**

Use a pinned/controlled llama.cpp/GGML substrate for:

- GGUF and model metadata;
- broad model-family graphs;
- quantized tensor types;
- CPU kernels;
- tokenizer/chat-template functionality when runtime implementation later needs them;
- architecture-correct KV/recurrent memory;
- existing optional hardware backends.

Do not rebuild those capabilities merely to make Super-Runtime look independent.

Super-Runtime differentiation is resource-governed execution, not another matmul/kernel ecosystem.

## Gate 5 — How should RAM budgeting work?

**Decision: answered conceptually; hard-cap acceptance remains an implementation test.**

The global planner reserves mandatory memory first:

```text
configured worker envelope
  - runtime/control overhead
  - mandatory metadata/small weights
  - context/KV/recurrent state admission
  - compute/scratch requirements
  - staging requirements
  - safety reserve
  = discretionary dynamic weight residency budget
```

A request that cannot fit must be refused before uncontrolled allocation. It must not silently shorten context or hope the OS survives.

The configured `~8 GiB` worker target remains an engineering target, **not a promise that every model can run in 8 GiB**.

Required accounting domains are distinct:

```text
virtual mapped bytes
process RSS / mapped-weight RSS
intentional resident bytes
leased bytes
prefetched bytes
context/state bytes
scratch/staging bytes
optional device bytes
kernel page-cache estimate where measurable
```

Page cache is not process RSS and must not be reported as if it were runtime-owned resident memory.

## Gate 6 — What differs between dense and MoE residency?

**Decision: answered and executable.**

### Dense / fixed-order

Use graph order:

```text
current READY + leased
next PREFETCHED/READY when budget permits
previous EVICTABLE only after safe point
```

`GGML-DENSE-RING-RESIDENCY-SPIKE.md` proved a four-layer 64 MiB dense walk can remain bounded to a 32 MiB two-slot process-RSS ring while every managed matmul runs with zero compute-window page faults and exact output.

### MoE / sparse routed

Use selected IDs exposed by `MUL_MAT_ID`:

```text
router/selector
   -> selected expert union
   -> selected physical ranges
   -> READY + leased
   -> MUL_MAT_ID
```

`GGML-SELECTOR-PREFETCH-READY-SPIKE.md` proved a 128 MiB logical expert tensor can execute from a 96 MiB selected working set with zero page faults during `MUL_MAT_ID` and exact output.

The two policies share residency state/leases/budgeting, but not admission topology.

## Gate 7 — How should long-context KV/recurrent/state remain bounded?

**Decision: architecture boundary answered; real-model ceilings are implementation-time validation.**

Do not invent one universal KV representation. Reuse llama.cpp's architecture-correct state/memory implementations and account them under the same global budget.

Super-Runtime adds:

- admission before session allocation;
- explicit state-memory accounting;
- session ownership/generation boundaries;
- fail-closed save/load identity;
- transactional publication of state after successful execution;
- reclaim/rehydration policy only where the underlying architecture permits it.

K3's speculative/state history also establishes a general rule:

> compute may be speculative; persistent session state publication must be transactional.

No claim is made yet that arbitrary long contexts fit an 8 GiB envelope. That must be measured per architecture/model/context configuration.

## Gate 8 — What is the CPU-first scheduling policy and where does optional GPU fit?

**Decision: CPU architecture answered; GPU is deferred until CPU core exists.**

CPU is mandatory and defines correctness.

First CPU backing direction:

```text
stable virtual file-backed tensor identity
        +
explicit scheduler-owned READY/lease semantics
        +
access-topology residency policy
```

Executable evidence already proves:

- stable GGML tensor addresses survive process-RSS eviction/refault;
- selected MoE ranges can become READY before expert compute;
- dense graph-order ranges can be managed as a bounded ring.

GPU is an optional later staging target under the **same global ledger and residency semantics**. GPU integration is not required to start the runtime and is not a reason to continue Phase-0 research.

## Gate 9 — What benchmark gates prove Super-Runtime works?

**Decision: answered.**

A runtime feature is not accepted from a cache hit counter or synthetic timing alone.

Minimum gates:

### Correctness

- deterministic fixtures where bitwise equality is valid;
- substrate-declared numeric tolerance where bitwise equality is not a valid oracle;
- state reuse/save/restore correctness where state is involved;
- failed/short loads must never publish READY.

### Memory

- configured budget ledger never overshoots owned allocations;
- measured peak process RSS;
- mapped-weight RSS separated from page cache;
- context/state/scratch/staging breakdown;
- external hard memory ceiling on hosts where a real enforcement primitive exists.

### Residency / I/O

- requested semantic ranges;
- intentional prefetched/read bytes;
- leased/resident/evicted bytes;
- page faults in compute windows;
- storage bytes/requests where measurable;
- no access to non-READY ranges.

### Performance

- machine/runtime/source provenance;
- repeated measurements when timing noise is material;
- separate I/O wait/materialization time from kernel compute time;
- do not claim synchronous research callbacks are production performance.

The current build host does not provide a trustworthy hard cgroup memory ceiling, so hard-cap acceptance must run on a suitable supported host later rather than be faked with `ulimit -v`.

---

# Executable feasibility evidence now accumulated

## 1. CPU MoE selector seam

Selected IDs were observed after the router and before `MUL_MAT_ID`; only selected expert slices were materialized and output matched the fully resident oracle.

## 2. Stable file-backed virtual identity

A 128 MiB mapped GGML expert tensor dropped from 128 MiB VMA RSS to 0 without changing its tensor address, then refaulted only the 96 MiB selected working set and produced exact output.

## 3. Selector-driven READY barrier

Cold demand execution produced roughly 283-285 major faults in the expert compute window. Selector-driven prefetch/materialization produced zero major and zero minor faults during `MUL_MAT_ID`, with exact output.

## 4. Dense two-slot graph-order ring

A 64 MiB four-layer dense walk used a maximum 32 MiB mapped-weight RSS ring. Every managed layer compute had zero page faults; each completed layer was released only after a synchronized result safe point; final output was exact.

## 5. Invocation-state lifetime discovery

Repeated dense execution initially differed because the fixture assumed input tensor bytes persisted across graph invocations. Instrumentation proved the input storage changed after execution. Rewriting request input every invocation restored exact equality.

Frozen rule:

> graph/model state and request invocation state are separate ownership domains.

---

# First implementation architecture now frozen

For the first runnable Super-Runtime, the architecture is deliberately smaller than the long-term vision:

```text
small native runtime entrypoint
            |
            v
llama.cpp / GGML CPU substrate
            |
            v
Super-Runtime resource scheduler seam
            |
            +--> MemoryLedger / admission
            +--> Residency state machine + leases
            +--> SEQUENTIAL_CYCLIC policy
            +--> SPARSE_INDEXED policy
            +--> file-backed stable-VA residency backend
            |
            v
CPU execution
```

No Rust service, provider gateway, AI-tool integration, UI, or GPU requirement is needed to prove Milestone 1 exists.

A higher-level control plane may be introduced later when the native lifecycle and resource semantics are real enough to justify a stable boundary.

---

# Residency semantics frozen for Milestone 1

Conceptual state machine:

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
failed/short/invalid load -> never READY
```

Eviction rule:

```text
leased/in-use -> cannot evict
```

These are semantic contracts. Linux may implement the first backing using `mmap`/`madvise`/`posix_fadvise`; Windows will require corresponding platform-specific file-mapping/residency primitives behind the same runtime abstraction.

---

# What is deliberately deferred

The following are **not missing Phase-0 homework**:

- full asynchronous I/O overlap;
- exact production scheduler hook shape;
- Windows residency backend implementation;
- GPU staging/offload policy;
- Rust control-plane/service architecture;
- HTTP/OpenAI-compatible APIs;
- OpenClaw/Hermes/Odysseus or any other AI-tool integration;
- large Kimi K3 checkpoint download;
- broad real-model performance benchmarking;
- advanced learned/speculative residency policies.

They become implementation milestones only after the native runtime exists.

---

# Rejected directions

Do not restart these lines of work without new contradictory evidence:

1. Reimplementing llama.cpp's model graph/kernel ecosystem.
2. Copying K3's neural graph or checkpoint layout into a universal runtime.
3. Building separate streaming engines per model brand.
4. Treating mmap alone as a memory governor.
5. Treating page-cache bytes as process-owned resident bytes.
6. Letting demand faults inside compute be the intended production scheduler.
7. Using the eval callback as the final residency API.
8. Promising every model will fit an 8 GiB worker.
9. Designing downstream AI-tool adapters before Super-Runtime itself runs.

---

# Stop-learning rule

Phase 0 is closed.

From this point, source archaeology is permitted only when one of these events occurs:

```text
implementation contradicts a frozen assumption
OR
correctness cannot be explained by current contracts
OR
an upstream substrate behavior required by the runtime is undocumented/ambiguous
```

Otherwise the next action is implementation and test, not another research branch.

## Final Phase-0 verdict

There is enough source and executable evidence to justify building the first Super-Runtime core.

The central design is no longer speculative at the feasibility level:

```text
large logical model address space
        |
        v
bounded process-resident working set
        |
        +--> graph-order dense residency
        +--> selector-driven sparse residency
        +--> architecture-correct state under one budget
        |
        v
CPU-first GGML execution
```

What remains uncertain is production quality and performance. Those questions now belong to implementation, measurement, and iteration—not more pre-runtime study.
