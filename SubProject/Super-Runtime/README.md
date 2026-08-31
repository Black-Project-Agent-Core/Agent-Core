# Super-Runtime

> **Canonical location:** this project is maintained inside the Agent-Core monorepo at `SubProject/Super-Runtime/`. The former standalone Super-Runtime repository is only the migration source and is no longer the canonical workspace after this import.

Super-Runtime is a CPU-first, polyglot runtime for local AI agents. Its purpose is to let agent frameworks such as OpenClaw, Hermes, Odysseus, and future tools consume a stable local inference/runtime service while the runtime itself manages model architecture compatibility, constrained RAM, NVMe-backed residency, context state, and optional accelerators.

## Product boundary

Super-Runtime is the product. Agent frameworks are consumers and integration targets, not its internal architecture.

The runtime must remain useful without a GPU. CPU execution is the baseline; GPU backends are optional accelerators chosen by capability and budget.

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
- an OpenAI-compatible agent-facing surface plus native control APIs;
- reproducible low-memory correctness and performance testing.

## Architecture direction

```text
OpenClaw / Hermes / Odysseus / Future Agents
                    |
          OpenAI-compatible surface
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

Pinned architecture references live under `research/references/`. They are research material and do not automatically become production dependencies. See `docs/research/REFERENCE-PROVENANCE.md` for exact revisions and licensing notes.

## Current phase

The project is in architecture-foundation work. The next implementation frontier is the storage/residency seam: preserve llama.cpp/GGML model support while adding a deterministic global memory governor and storage-aware weight residency without making streaming a per-model feature.
