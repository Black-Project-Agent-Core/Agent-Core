# Documentation

Agent Core's current release preparation targets **0.15.0 for Windows x64**.
[Current release notes](releases/0.15.0.md) track the verification and packaging
status. Development supports both Native AI Agent Core and external controllers.
[Memory and Learning guidance](memory/EXTERNAL-LEARNING-PRIORITIES.md)
and [proposal review](proposals/REVIEW-GUIDE.md) describe the current workflows.

## Start here

| Document | Purpose |
| --- | --- |
| [Project overview](../README.md) | Capabilities, status, build requirements, and security boundaries |
| [Codebase map](CODEBASE.md) | Current architecture, source owners, and verification entry points |
| [Project folder structure](PROJECT-STRUCTURE.md) | Root/folder/subfolder map and canonical storage homes; inspect before creating a folder |
| [Product direction](Agent-Core-Product-Direction.md) | Cumulative-learning goals and evidence limits |
| [Operating contract](../AGENTS.md) | Rules for controllers operating through Agent Core |
| [Current release notes](releases/0.15.0.md) | Version, package, supported scope and verification |

## Implemented systems

- [Image inspection](MCP-Image-Inspection-Design.md): external MCP image/crop contract and source checks; its dated acceptance limits describe the original checkpoint.
- [Memory engine](memory/engine-history/README.md): historical engine extraction evidence; the current implementation is under `src/memory` (see [consolidation](memory/CONSOLIDATION.md)).
- [Memory host installation](memory/Agent-Core-Memory-v2-Installation-20261008.md) and [dated live acceptance](memory/Agent-Core-Memory-v2-Live-Acceptance-20261009.md): migration/rollback and original-host evidence; separate from Memory 01 acceptance.
- [Memory 01](memory/plans/2026-10-09-memory-01-filtered-semantic-retrieval.md): filtered semantic retrieval; [Windows functional acceptance closed](memory/verification/memory01-windows-functional-2026-10-10.md).
- [Unified Workflows](plans/2026-10-09-unified-workflows.md): one System + Memory source canvas; scoped production functional acceptance closed; see the [latest review](memory/verification/memory01-windows-functional-2026-10-10.md). See the [evidence summary](verification/workflows-windows-functional-2026-10-09.md).
- [Cumulative workflow](Cumulative-Workflow-Implementation-20261006.md): Learning ownership, task evidence, and evaluation limits.
- [Native AI Agent Core Revision 4 — CLOSED by user decision, 2026-10-24](history-agent-core/Native-Architecture-Integration-Revision-4-Execution.md): Native and authenticated external MCP are usable within current grants. User ended the R4 benchmark/model-test continuation; historically inconclusive Memory-effect evidence remains preserved but no longer blocks operational use or represents an active task. See the [closed master roadmap](history-agent-core/Integrasi-Arsitektur-Native-Agent-Core.md).
- [Self-improvement plan](Agent-Core-Self-Improvement-Plan.md) and [implementation](Agent-Core-Self-Improvement-Execution-20261007.md): proposals, exact decisions, and recorded acceptance/residuals.
- [Capability awareness](Agent-Core-Capability-Awareness-and-Usage-Disclosure-Plan-20261007.md): discovery, actual-use disclosure, and the recorded stop-test boundary.
- [Android/Game Mode](Agent-Core-Advanced-Android-Game-Mode-Plan-20261008.md) and [dated acceptance](Game-Mode-Live-Acceptance-20261008.md): implemented scope and unresolved live-game checks.

## Open proposals

The [active proposals](proposals/README.md) and [plan status index](plans/README.md)
separate implemented work from proposals. The current P08/P01/P02 and proposal
card scope is implemented; P03–P07 in its parent proposal remain unapproved.
Native AI Agent Core is available for active development and operation following
the user's 2026-10-24 decision. Historical plan status does not override current
source, runtime authority or user decisions.

A plan, unresolved checkbox, or historical approval request does not authorize implementation, installation, provider calls, or deployment. Follow current user scope and preserve existing stop boundaries.

## Verification and operation

- [Build and verification map](CODEBASE.md#build-and-verification)
- [Security policy](../SECURITY.md), [path governance](PATH-GOVERNANCE.md), and [contributing guide](../CONTRIBUTING.md)
- [Changelog](../CHANGELOG.md), [release intent workflow](../.changeset/README.md), and [recovery boundaries](CODEBASE.md#release-and-recovery)
- [Support](../SUPPORT.md)

Source tests, browser checks, Windows launcher checks, provider quality, and measured learning benefit require different evidence. This documentation refresh does not turn one into another.

## Historical evidence

Completed decisions and implementation records live in [history-agent-core](history-agent-core/); dated source investigations remain in [research](research/) and Memory engine history in [engine-history](memory/engine-history/README.md). Use the [folder map](PROJECT-STRUCTURE.md) for their existing locations. Read a record's final closure and explicit residuals before treating an early `OPEN` or `PENDING` paragraph as current work.
