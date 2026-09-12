# Agent Core Documentation

The current documentation tree is intentionally compact. Historical implementation plans, per-task checkpoints, and temporary architecture exports are preserved by Git history rather than kept in the active repository surface.

## Runtime architecture

- [`deterministic-memory.md`](deterministic-memory.md) — DMF storage, retrieval, redaction, backup, recovery and integrity.
- [`local-agent-continuity.md`](local-agent-continuity.md) — durable task/checkpoint/frontier state across routes and sessions.
- [`deterministic-execution-fabric.md`](deterministic-execution-fabric.md) — DAG execution, logs, events, retries, recovery and operational boundaries.
- [`multi-command-wake-workflow.md`](multi-command-wake-workflow.md) — agent-facing dependency-aware asynchronous execution behavior.
- [`github.md`](github.md) — Native GitHub Fabric credentials, REST/Git/Packages transports, destructive gates, rotation, and live read-only acceptance.

## Stability and operations

- [`stability.md`](stability.md) — maintained stability baseline and release gates.
- [`windows-installation-cutover.md`](windows-installation-cutover.md) — moving a Windows installation to a fresh canonical clone while preserving connector authentication identity.
- [`../SECURITY.md`](../SECURITY.md) — repository/runtime security model and secret boundaries.

## Roadmap

- [`roadmap/agent-core-balanced-evolution.md`](roadmap/agent-core-balanced-evolution.md) — certified A-G evolution history and the architectural constraints carried forward from those waves.
- [`roadmap/agent-core-cross-session-memory-nervous-system-design.md`](roadmap/agent-core-cross-session-memory-nervous-system-design.md) — implementation-oriented design for evolving DMF into a bounded local-first cross-session and cross-Codespace memory graph with mandatory Private Memory Remote durability, fresh-Codespace hydration, mandatory memory decisions, `remember_more`, revision/branch/root governance, causal failure-solution history, Codespace enforcement, and a read-only Memory Observatory. This document is a design specification, not an implemented capability claim.
- [`roadmap/agent-core-v0.7-stabilization-shared-memory-release-implementation-plan.md`](roadmap/agent-core-v0.7-stabilization-shared-memory-release-implementation-plan.md) — 31-task stabilization-first implementation plan for v0.7.0: exact release identity, Windows lifecycle repair, persistent memory posture, Private Memory Remote, stable cross-host memory identity, PC/Codespace continuity, enforced lifecycle canaries, zero-touch Codespace recovery, exact-SHA certification, and post-stable Observatory design refresh.

Roadmap/design documents are not statements that a feature is already implemented unless the document explicitly records a completed certification. The live MCP capability surface remains the factual source for currently available behavior.
