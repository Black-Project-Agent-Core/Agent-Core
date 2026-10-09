# Documentation

Agent Core source prerelease **`0.15.0-beta.0`**. This guide describes the implementation baseline [`f22e6e4`](https://github.com/Black-Project-Agent-Core/Agent-Core/commit/f22e6e426d9c8937439763602f986b9fb3243f23) plus the subsequent source-version/documentation refresh. Production Windows activation and full-release acceptance remain separate.

## Start here

| Document | Purpose |
| --- | --- |
| [Project overview](../README.md) | Capabilities, status, build requirements, and security boundaries |
| [Codebase map](CODEBASE.md) | Current architecture, source owners, and verification entry points |
| [Product direction](Agent-Core-Product-Direction.md) | Cumulative-learning goals and evidence limits |
| [Operating contract](../AGENTS.md) | Rules for controllers operating through Agent Core |
| [Source release notes](releases/0.15.0-beta.0.md) | Source version, publication state, and outstanding acceptance |

## Implemented systems

- [Image inspection](MCP-Image-Inspection-Design.md): external MCP image/crop contract and source checks; its dated acceptance limits describe the original checkpoint.
- [Memory engine](../SubProject/agent-core-memory/README.md): standalone engine and controller facade.
- [Memory host installation](Agent-Core-Memory-v2-Installation-20261008.md) and [dated live acceptance](Agent-Core-Memory-v2-Live-Acceptance-20261009.md): migration/rollback and original-host evidence; separate from Memory 01 acceptance.
- [Memory 01](plans/2026-10-09-memory-01-filtered-semantic-retrieval.md): filtered semantic retrieval, locally verified offline; external acceptance pending.
- [Unified Workflows](plans/2026-10-09-unified-workflows.md): one System + Memory source canvas; isolated Windows/WebView2 functional acceptance passed; production activation pending. See the [evidence summary](verification/workflows-windows-functional-2026-10-09.md).
- [Cumulative workflow](Cumulative-Workflow-Implementation-20261006.md): Learning ownership, task evidence, and evaluation limits.
- [Self-improvement plan](Agent-Core-Self-Improvement-Plan.md) and [implementation](Agent-Core-Self-Improvement-Execution-20261007.md): proposals, exact decisions, and recorded acceptance/residuals.
- [Capability awareness](Agent-Core-Capability-Awareness-and-Usage-Disclosure-Plan-20261007.md): discovery, actual-use disclosure, and the recorded stop-test boundary.
- [Android/Game Mode](Agent-Core-Advanced-Android-Game-Mode-Plan-20261008.md) and [dated acceptance](Game-Mode-Live-Acceptance-20261008.md): implemented scope and unresolved live-game checks.

## Open proposals

The [plan status index](plans/README.md) separates implemented work from proposals. **Memory 02–11 and adaptive parallel execution are not implemented.** Native Chat exists, while the separate [conversation-control redesign](Agent-Core-Native-Conversation-Control-Plan-20261003.md) remains a plan.

A plan, unresolved checkbox, or historical approval request does not authorize implementation, installation, provider calls, or deployment. Follow current user scope and preserve existing stop boundaries.

## Verification and operation

- [Build and verification map](CODEBASE.md#build-and-verification)
- [Security policy](../SECURITY.md), [path governance](PATH-GOVERNANCE.md), and [contributing guide](../CONTRIBUTING.md)
- [Changelog](../CHANGELOG.md), [release intent workflow](../.changeset/README.md), and [recovery boundaries](CODEBASE.md#release-and-recovery)
- [Support](../SUPPORT.md)

Source tests, browser checks, Windows launcher checks, provider quality, and measured learning benefit require different evidence. This documentation refresh does not turn one into another.

## Historical evidence

The [archive index](archive/README.md) provides navigation to the preserved long-form CODEBASE, dated implementation reports, donor research, conversations, diagrams, and the historical maintenance record. Existing document paths remain available. Read a record's final closure and explicit residuals before treating an early `OPEN` or `PENDING` paragraph as current work.
