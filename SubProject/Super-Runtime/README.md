# Super-Runtime

> **READ FIRST — CANONICAL CONTEXT:** [`docs/SUPER-RUNTIME-MASTER-CONTEXT.md`](docs/SUPER-RUNTIME-MASTER-CONTEXT.md) is the authoritative source of truth for Super-Runtime. Read it before research, planning, or implementation. If an older document conflicts with it, the master context wins.

> **Canonical location:** this project is maintained inside the Agent-Core monorepo at `SubProject/Super-Runtime/`. The former standalone Super-Runtime repository is only the migration source and is no longer the canonical workspace after this import.

Super-Runtime is a CPU-first local inference runtime. Its active purpose is to build a model-flexible execution engine that can operate under constrained RAM using explicit memory governance, NVMe-backed residency, architecture-correct state, and optional accelerators. Future AI tools may consume the runtime later, but their internal architecture is not part of the current build scope.

## Product boundary

Super-Runtime is the product. Future AI tools are downstream integration targets, not research dependencies and not part of the runtime's internal architecture.

The runtime must remain useful without a GPU. CPU execution is the baseline; GPU backends are optional accelerators chosen by capability and budget.


## Current scope guard

Until the runtime core is proven, do **not** clone, study, or design around OpenClaw, Hermes, Odysseus, or other downstream AI-tool repositories. Their eventual compatibility must be solved through a narrow integration layer after the runtime exists. Current source archaeology and implementation work are limited to runtime mechanics and the approved K3-in-C + llama.cpp/GGML reference/substrate boundary.

## Approved foundation

The project is approved to use **llama.cpp / GGML as the production native compute and model-architecture substrate** instead of rebuilding the model graph and kernel ecosystem from zero.

Super-Runtime's own differentiation lives above and around that substrate:

- hard global RAM budgeting;
- NVMe/out-of-core weight residency;
- access-pattern-aware prefetch, admission, pinning, and eviction;
- dense and MoE streaming policies;
- context/KV/recurrent-state budgeting;
- CPU-first device policy with optional GPU acceleration;
- a native control plane and runtime observability;
- a narrow native control/runtime API;
- reproducible low-memory correctness and performance testing.

## Architecture direction

```text
Future AI-tool integrations (deferred)
                    |
          compatibility adapter later
                    |
             Super-Runtime API
                    |
          Control / Policy Plane
                    |
       +------------+-------------+
       |                          |
Model/Graph Substrate       Residency Engine
  llama.cpp / GGML        RAM <-> NVMe <-> GPU
       |                          |
       +------------+-------------+
                    |
               CPU primary
             GPU optional
```

## Research references

Pinned runtime references live under `research/references/`. The active reference set is intentionally limited to K3-in-C for low-memory/runtime design and llama.cpp/GGML for the approved compute/model substrate. See `docs/research/REFERENCE-PROVENANCE.md` for exact revisions and licensing notes.

## Current phase

**Phase 0 learning is complete. Task 1 and Task 2 implementation checkpoints are complete:** `runtime/native/` provides the pinned llama.cpp/GGML CPU production substrate boundary plus the first Super-Runtime-owned `MemoryLedger`. This is still a foundation checkpoint, not yet a complete inference runtime.

The next eligible checkpoint is **Task 3 only: stable-address file-backed residency primitive**. Dense/MoE production policies, API work, GPU work, and consumer integration remain deferred until their turn in the canonical master context.
