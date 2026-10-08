# Super-Runtime — Phase 0 Project Charter

> **Historical research evidence:** source observations, host paths, experiment results and proposed next steps below belong to the recorded Phase-0 work. The [master context](../SUPER-RUNTIME-MASTER-CONTEXT.md) governs subsequent decisions. See [current checkout prerequisites](../../README.md#source-checkout-reproducibility-status--8-october-2026) before trying to reproduce a reference-dependent result; this refresh neither fetched upstream references nor reran experiments.

Status: Phase 0 research complete; architecture direction frozen for first implementation

## Product identity

Super-Runtime is the product. It is not a downstream AI-tool fork, a Kimi K3 port, or a thin llama.cpp launcher.

Its purpose is to become a CPU-first, polyglot, model-flexible local inference runtime with explicit control over memory, storage residency, context/state, and optional accelerators. AI tools may connect later, but consumer-framework architecture is deliberately outside the current research and implementation scope.

## Primary goals

1. CPU-first inference. CPU operation must remain a first-class path.
2. GPU acceleration is optional, never a hard dependency of the runtime design.
3. Model flexibility through explicit architecture/model adapters rather than pretending all model graphs are interchangeable.
4. Polyglot architecture with narrow, stable boundaries between languages.
5. Robust long-running inference operation, including cancellation, telemetry, deterministic state handling, and bounded context/runtime memory.
6. Treat RAM as a bounded resource and storage as a potential extended model-memory layer.
7. Research a target model-runtime resident-memory budget around 8 GB. This is a runtime target, not a promise that a complete workstation needs only 8 GB total RAM.
8. Treat context/KV/state memory as a first-class problem, not only model-weight residency.
9. Keep core inference independent of cloud-model APIs. A local model path must be viable without a cloud AI dependency.

## Non-goals

Phase 0 must not:

- download the 1.56 TB Kimi K3 checkpoint;
- make Qwen/Llama/DeepSeek pretend to be Kimi K3 by reusing the K3 graph;
- copy K3-specific KDA, Gated MLA, Stable LatentMoE, tokenizer, tensor names, or config schema into a supposedly universal core;
- clone, study, or build around downstream AI-tool internals before the runtime core is proven;
- declare "8 GB RAM achieved" without measured peak RSS and a memory ledger;
- begin production runtime implementation before the architecture discovery gates are answered.

## Architectural boundary to preserve

Conceptual relationship:

```text
Future AI-tool integration layer (deferred)
                  |
                  | narrow runtime contract
                  v
            Super-Runtime
                  |
       +----------+----------+
       |          |          |
  Model/Graph   Memory     Compute
   Adapters     Engine      Engine
       |          |          |
   model data   RAM/NVMe   CPU primary
                           GPU optional
```

The integration layer above Super-Runtime is replaceable and deferred. The model families below Super-Runtime are also replaceable. The current project frontier is the runtime itself.

## Polyglot rule

Polyglot does not mean arbitrary language crossings in the token hot path.

The intended principle is:

- native data-plane code for performance-critical inference, memory, I/O, tensor execution, and device work;
- a higher-level control plane may use a different systems language if it improves lifecycle, scheduling, safety, observability, and integration;
- future integration adapters may use a separate language without entering the native inference hot path;
- Python is acceptable for conversion, research, fixtures, benchmark analysis, and development tooling, but should not bounce through the production per-layer/per-token hot path.

The exact language split is a Phase 0 research decision, not yet frozen.

## Consumer integration is deferred

Consumer protocol details, tool-call behavior, and framework-specific compatibility are not Phase 0 prerequisites. They are validated only after the runtime core can load supported models, execute correctly, stay within its memory ledger, and prove its residency/I/O mechanisms.

## Memory research contract

A target such as an 8 GB runtime budget is only considered real when the runtime can report and enforce a ledger including, where applicable:

- resident model metadata and mandatory weights;
- streamed weight cache;
- KV/recurrent state;
- activations and scratch arenas;
- tokenizer/runtime overhead;
- device staging buffers;
- thread/work queues;
- safety reserve;
- measured process peak RSS.

Dense and MoE models must be evaluated separately because their storage traffic and reusable working sets differ fundamentally.

## Phase 0 research gates

Before a production implementation plan, research must answer:

1. Which K3 memory/I/O principles are architecture-agnostic?
2. Which K3 techniques only work because Kimi K3 is MoE or because of its exact checkpoint layout?
3. What model/graph abstraction should Super-Runtime expose?
4. Which existing native compute/model ecosystem should be reused rather than reimplemented?
5. How should hard/soft RAM budgeting work across weights, KV/state, scratch, and device buffers?
6. What is the policy difference for dense versus MoE models?
7. How can long-context KV/recurrent/state memory remain bounded under the same global budget?
8. What is the CPU-first scheduling policy and what belongs in optional GPU offload?
9. What benchmark gates prove numerical correctness, memory-budget compliance, storage/residency correctness, and useful CPU-first throughput?

## Research reference policy

External projects used for architecture study must remain clearly separated from Super-Runtime production source and pinned to known revisions where practical.

The active runtime references are:

```text
research/references/kimi-k3-in-c
research/references/llama.cpp
```

K3-in-C is the primary low-memory/runtime-behavior reference. llama.cpp/GGML is the approved production compute/model substrate. Downstream AI-tool repositories are intentionally excluded from this phase.
