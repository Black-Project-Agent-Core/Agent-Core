# Context and State Memory Research

> **Historical research evidence:** source observations, host paths, experiment results and proposed next steps below belong to the recorded Phase-0 work. The [master context](../SUPER-RUNTIME-MASTER-CONTEXT.md) governs subsequent decisions. See [current checkout prerequisites](../../README.md#source-checkout-reproducibility-status--8-october-2026) before trying to reproduce a reference-dependent result; this refresh neither fetched upstream references nor reran experiments.

Status: Phase 0 research

## Why this is a core Super-Runtime problem

A low-memory weight engine can still fail the AI-agent goal if context/state grows without a budget.

Coding agents accumulate:

- system instructions;
- tool definitions;
- repository snippets;
- diffs;
- terminal/compiler/test output;
- tool-call arguments and results;
- conversation/task history.

The standalone K3 reference makes the danger concrete: its expanded MLA implementation reports roughly 2.37 MB of KV state per position, enough for the cache alone to exceed the desired runtime memory budget at modest agent context sizes.

Super-Runtime therefore needs two independent but coordinated resource systems:

```text
weight residency budget
          +
sequence/context state budget
```

Neither can be treated as "whatever memory remains".

## Important llama.cpp finding: sequence memory is already polymorphic

The pinned llama.cpp reference has a general `llama_memory_i` interface. KV cache is explicitly described as only one kind of LLM memory.

The interface supports:

- per-batch preparation/apply;
- sequence remove/copy/keep/shift operations;
- memory breakdown;
- state serialization/deserialization.

Current implementations include:

- ordinary attention KV cache;
- recurrent memory;
- hybrid recurrent + attention memory;
- sliding-window variants;
- sparse/indexer variants;
- architecture-specific DSA/DSV4-style memory.

This is a strong reusable abstraction. Super-Runtime should not invent one universal `[layer][position][K,V]` layout.

## Architecture-specific state representation matters

The Kimi K3 implementation in the pinned llama.cpp reference states that its MLA cache holds the **compressed latent**, unlike the standalone K3 C implementation whose scale test reports an expanded K/V representation.

The broader reference also contains models with recurrent state, sliding-window caches, sparse/indexer caches, and compressed architecture-specific state.

Therefore Super-Runtime must ask:

> What is the smallest mathematically valid state representation for this architecture?

before asking:

> How do we page a giant generic KV cache?

Compression inherent to the architecture is better than paging an unnecessarily expanded representation.

## State tiers

A useful conceptual classification is:

```text
SEQUENCE HOT
  state required for the next token

SEQUENCE WARM
  reusable state for active sessions but not immediately executing

SEQUENCE COLD
  persisted checkpoint/session state that can be rehydrated

RECONSTRUCTABLE
  state cheaper to recompute from a compact prefix/checkpoint than to keep resident
```

The runtime should eventually decide per architecture and workload which state can move between these tiers.

## KV datatype is a policy input, not a fixed constant

The reference exposes separate K and V cache data types (`type_k`, `type_v`) and CLI configuration for them. Some architectures force or benefit from specific representations, while others allow lower-precision KV.

Super-Runtime's memory planner should therefore receive a state-layout estimate from the architecture/memory adapter before allocating context.

A request for context `N` should be evaluated against:

```text
model maximum context
architecture state bytes/token
selected KV/state representation
parallel sequence count
runtime memory budget
weight residency floor
compute/scratch floor
safety reserve
```

## Context admission must happen before allocation

Agent clients can request or imply large contexts. The compatibility API must not accept a context size and then discover halfway through execution that the runtime cannot hold its state.

Conceptual admission flow:

```text
requested model + context + parallelism
                 |
                 v
model capability validation
                 |
                 v
state-memory estimate
                 |
                 v
global runtime budget negotiation
                 |
        +--------+--------+
        |                 |
      ACCEPT            REDUCE/REJECT
```

If policy allows automatic reduction, the effective context must be surfaced to the caller/metrics. Silent reduction is not acceptable for an agent whose correctness may depend on earlier tool results.

## Repository-scale agent context should be selective

Super-Runtime is not itself the repository-retrieval agent, but it can expose truthful constraints that encourage bounded context.

The consumer agent should prefer:

```text
repository index / search
        |
        v
relevant symbols + files + diffs + logs
        |
        v
bounded model context
```

rather than placing the complete repository and complete terminal history in every inference call.

This remains an agent-layer responsibility, but Super-Runtime needs admission/telemetry that makes the cost visible.

## Session checkpointing is useful for agent workloads

The memory abstraction in the reference supports state write/read. Super-Runtime should preserve this capability in its provider-neutral runtime contract.

Potential benefits:

- unload a model worker without losing every active agent session;
- move inactive sequence state from RAM to storage;
- recover after worker restart/OOM;
- maintain multiple agent sessions under a smaller hot-state budget;
- benchmark cold rehydration versus recomputation.

A stored state must carry a compatibility fingerprint, at minimum including model identity, architecture, quantization/state format, and relevant context parameters. Rehydrating state into an incompatible model/runtime must fail closed.

## Context checkpointing versus full state persistence

Two strategies should be benchmarked rather than assumed:

### Full state persistence

Serialize KV/recurrent state and restore it later.

Good when state is compact and restore I/O is cheaper than recomputation.

### Prompt/context checkpoints

Keep a bounded prefix/state checkpoint, compact old conversation/tool traces at the agent layer, and recompute a smaller recent suffix when necessary.

Good when serialized KV is enormous or highly architecture/device specific.

A future Super-Runtime may support both.

## Global budget negotiation

Context memory must compete with weight residency for the same process budget.

Conceptually:

```text
8 GiB worker target (example, not yet proven)

mandatory runtime + metadata
+ minimum compute/scratch
+ minimum architecture state
+ active context state
+ weight residency working set
+ I/O/device staging
+ safety reserve
<= hard worker budget
```

If context grows, weight residency may need to shrink, causing more SSD traffic. If weight residency is enlarged, admissible context may shrink. This is a runtime scheduling problem, not two independent CLI flags.

This suggests a future budget planner should optimize for **total task throughput/correctness**, not maximum cache hit rate in one subsystem.

## Acceptance metrics for agent context

A context/state benchmark should record at least:

- requested and effective context;
- tokens currently cached;
- bytes per sequence-state class;
- KV/recurrent data type;
- resident versus persisted state bytes;
- state save/restore time and bytes;
- recompute time after compaction/checkpoint;
- weight-cache impact caused by context growth;
- current and peak RSS;
- generation throughput;
- tool-call correctness across compaction/rehydration.

The last metric is essential: a memory optimization that forgets or changes prior tool state can emit fluent but operationally wrong agent actions.

## Current architecture consequence

Super-Runtime should reuse a polymorphic model-memory interface from the multi-architecture substrate, but place it under a **global budget controller** that can:

1. estimate state before context creation;
2. admit/reject/reduce requested context;
3. account state against the worker hard target;
4. coordinate state allocation with weight residency;
5. persist/rehydrate inactive session state;
6. report effective capacity to the caller/control plane.

The product goal is not "largest possible context". It is:

> enough trustworthy working context for agentic coding while preserving the configured resource envelope.
