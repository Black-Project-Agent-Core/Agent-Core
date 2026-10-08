# Super-Runtime

## Source-checkout reproducibility status — 8 October 2026

The Agent Core `8a80251` source snapshot contains the Milestone-1 implementation and its historical evidence, but is **not self-contained for a fresh native build**. Static inspection found:

- `research/references/llama.cpp` and `research/references/kimi-k3-in-c` are absent; the repository has no gitlinks despite the retained `.gitmodules` declarations.
- Root CMake references absent `cmake/SuperRuntimePinnedGitSource.cmake` and `tests/contracts/pinned-source-cleanliness.cmake`.
- Native CMake references absent `super_runtime/runtime_workspace.cpp`, `tests/test_runtime_workspace.cpp`, and `tests/test_file_residency_contract.cpp` under `runtime/native`.
- `tests/contracts/native-substrate.sh` requires the llama.cpp gitlink; `git submodule update --init` alone cannot recreate a gitlink missing from the commit.

These are source/package completeness blockers, not a new runtime test failure. Restore the intended tracked files and exact pinned reference through a separately scoped source correction before using the build instructions below. `SUPER_RUNTIME_LLAMA_SOURCE` can select an authorized pinned checkout for CMake, but does not repair the missing helper/tests or the contract script's gitlink requirement. No dependency download, CMake configure, build or runtime test was performed in this documentation refresh. Historical milestone acceptance remains scoped to its original source and environment.


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

The reference policy places pinned runtime checkouts under `research/references/`; those checkouts are absent from this source snapshot as detailed above. The active reference set is intentionally limited to K3-in-C for low-memory/runtime design and llama.cpp/GGML for the approved compute/model substrate. See `docs/research/REFERENCE-PROVENANCE.md` for exact revisions and licensing notes.

## Recorded milestone and implementation scope

**Super-Runtime v0.1.0 — Milestone 1 Stable Core:** Phase 0 learning, Tasks 1 through 8, and the corrective lease/reclaim stability audit are complete. The native core now includes the pinned llama.cpp/GGML CPU substrate, `MemoryLedger`, Linux stable-address file residency with RAII range leases, generic MoE range planning, deterministic dense residency, global runtime admission planning, real delegated cgroup-v2 hard-cap acceptance, and a unified `RuntimeEntry` lifecycle that loads a deterministic fixture, admits resources, executes through GGML CPU under residency policy, reports telemetry, handles coarse cancellation at safe layer boundaries, and unloads cleanly.

The stable claim is scoped to the frozen Milestone-1 contract. Broad real-model certification, Windows residency, GPU policy, asynchronous I/O overlap, HTTP/provider APIs, downstream AI-tool integration, and production-GA support remain outside v0.1.0. See `docs/STABILITY-AUDIT-MILESTONE-1.md` for the audit evidence and `VERSION` for the canonical Super-Runtime version. No post-Milestone feature is active until explicitly requested.
