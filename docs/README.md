# Agent Core documentation index

Reviewed 2026-10-08 UTC against current-line source `8a80251` (`package.json` version `0.14.0`). The creator confirmed that [Black-Project-Agent-Core/Agent-Core](https://github.com/Black-Project-Agent-Core/Agent-Core) contains the current source. Older “legacy/reference-only” statements remain historical lineage evidence, not a restriction on reading this current source snapshot.

## Read this first

1. Use [CODEBASE](CODEBASE.md) for implemented architecture, [Product Direction](Agent-Core-Product-Direction.md) for goals, and [the operating contract](../AGENTS.md) for project rules.
2. Use the domain entry points below for the latest recorded outcome and unresolved scope. Read their final closure sections before treating an early `PENDING` or `OPEN` paragraph as an active task.
3. Use dated plans, reports and conversations as evidence from their original session. They are not permission to rerun a migration, restart a service, resume an old test, install a donor, or change release state.
4. See the [documentation audit](DOCUMENTATION-AUDIT-20261008.md) for this review's source coverage, limitations and static checks.

Current source contains both external-controller and Native-controller paths, persistent provider scheduling, chat persistence and shared Memory/Learning/Skill owners. Native runtime is no longer globally deferred. Specific donor proposals or conversation-control work can still be unimplemented. See [Native controller](../src/agent-controller.ts), [chat service](../src/agent-chat-service.ts), [provider scheduler](../src/agent-provider-scheduler.ts), [Memory host selection](../src/memory/host-runtime.ts), and [MCP Memory v2 adapters](../src/mcp/memory-experience-tools.ts).

Memory v2 is an internal host-selected engine under `SubProject/agent-core-memory`, not a second Memory gateway. When no host activation marker exists, startup selects legacy Memory. A present invalid marker fails closed instead of falling back. Do not infer private runtime state from a source clone or from another machine's acceptance report.

## Maintained architecture and policy

- [CODEBASE](CODEBASE.md): Implemented architecture and source-owner map; exact source wins over prose.
- [Agent-Core-Product-Direction](Agent-Core-Product-Direction.md): Product direction, controller relationship and evidence boundaries.
- [PATH-GOVERNANCE](PATH-GOVERNANCE.md): Dynamic-root policy and explicit exception procedure; registry is empty at this source baseline.

## Domain continuity and explicitly open scope

These are the useful domain entry points, not a statement that every item is an open task. Recorded live evidence remains attributable to the original host/session. No build, runtime test, credential inspection or production operation was performed in this documentation review.

- [Agent-Core-Advanced-Android-Game-Mode-Plan-20261008](Agent-Core-Advanced-Android-Game-Mode-Plan-20261008.md): Source implementation and partial live acceptance; post-restart fixes, calibration and companion decision remain bounded open work.
- [Game-Mode-Live-Acceptance-20261008](Game-Mode-Live-Acceptance-20261008.md): Original-host partial acceptance. No whole-suite or battle-outcome pass is claimed.
- [Agent-Core-Capability-Awareness-and-Usage-Disclosure-Plan-20261007](Agent-Core-Capability-Awareness-and-Usage-Disclosure-Plan-20261007.md): Creator accepted; respect the final stop-test boundary. Host-registration consumer and unexecuted checks are not claimed complete.
- [Agent-Core-Memory-v2-Installation-20261008](Agent-Core-Memory-v2-Installation-20261008.md): Host integration, migration chronology and rollback runbook. Final recorded acceptance supersedes initial cutover-pending wording.
- [Agent-Core-Memory-v2-Live-Acceptance-20261009](Agent-Core-Memory-v2-Live-Acceptance-20261009.md): Production external-controller acceptance record, dated in Indonesia local time. This clone does not reproduce that runtime.
- [Agent-Core-Native-Conversation-Control-Plan-20261003](Agent-Core-Native-Conversation-Control-Plan-20261003.md): OPEN, plan-only, pending creator review. Native Chat exists, but this separate conversation/Plan-mode redesign is not declared implemented.
- [Agent-Core-Self-Improvement-Plan](Agent-Core-Self-Improvement-Plan.md): Implemented proposal/Skill workflow with explicit residuals; optional work and release remain separate.
- [Agent-Core-Self-Improvement-Execution-20261007](Agent-Core-Self-Improvement-Execution-20261007.md): Recorded activation, Skill use and registry reconciliation; interrupted-stream/reconnect and host-junction checks remain open.
- [Cumulative-Workflow-Implementation-20261006](Cumulative-Workflow-Implementation-20261006.md): Shared Learning ownership and evidence contracts; preserves unresolved evaluation/history-recovery limits from its recorded handoff.
- [Canva-Penpot-Semantic-Bridge-Execution-Plan-20261001](Canva-Penpot-Semantic-Bridge-Execution-Plan-20261001.md): Separate Penpot project: tasks 1–6 recorded complete, task 7 not started. Agent Core provides engineering support only.

## Historical implementation, audit and acceptance records

These documents preserve a dated baseline, decision, implementation or test result. “Current”, paths, versions, counts, pending activation and defect statements inside them refer to that checkpoint unless a later section explicitly supersedes them. They are not the current architecture inventory. Historical restoration snapshots remain historical even if they contain `OPEN` or `PLANNED` labels.

- [Agent-Core-AI-Chat-Placeholder-Task-20260926](Agent-Core-AI-Chat-Placeholder-Task-20260926.md)
- [Agent-Core-Corruption-Recovery-Plan](Agent-Core-Corruption-Recovery-Plan.md)
- [Agent-Core-Cumulative-Learning-Architecture-Plan-20261001](Agent-Core-Cumulative-Learning-Architecture-Plan-20261001.md)
- [Agent-Core-Game-Agent-Donor-Grounding-20261008](Agent-Core-Game-Agent-Donor-Grounding-20261008.md)
- [Agent-Core-Native-Agent-Capability-Parity-Plan-20261002](Agent-Core-Native-Agent-Capability-Parity-Plan-20261002.md)
- [Agent-Core-PreRuntime-Maturity-Grounding-20260930](Agent-Core-PreRuntime-Maturity-Grounding-20260930.md)
- [Agent-Core-Reference-UI-Parity-Execution-20260924](Agent-Core-Reference-UI-Parity-Execution-20260924.md)
- [Anthropic-SDK-Python-Steal-Use-Integration-Plan](Anthropic-SDK-Python-Steal-Use-Integration-Plan.md)
- [Anthropic-SDK-TypeScript-Steal-Use-Integration-Plan](Anthropic-SDK-TypeScript-Steal-Use-Integration-Plan.md)
- [Approved-Adoption-Execution-20260922](Approved-Adoption-Execution-20260922.md)
- [Atomic-Hermes-Steal-Use-Integration-Plan](Atomic-Hermes-Steal-Use-Integration-Plan.md)
- [CBM-SpecKit-Adoption-Execution-20260927](CBM-SpecKit-Adoption-Execution-20260927.md)
- [Canva-Controlled-ReadWrite-Readback-Probe-20261002](Canva-Controlled-ReadWrite-Readback-Probe-20261002.md)
- [Canva-Desktop-Architecture-Grounding-20261001](Canva-Desktop-Architecture-Grounding-20261001.md)
- [Canva-Target-Capability-Matrix-20261002](Canva-Target-Capability-Matrix-20261002.md)
- [Capability-Residual-Wave-Execution-20260927](Capability-Residual-Wave-Execution-20260927.md)
- [ChatGPT-Custom-Plugin-Package-20260923](ChatGPT-Custom-Plugin-Package-20260923.md)
- [Cleanup-20260923](Cleanup-20260923.md)
- [Five-Reference-Conditional-Regrounding-20260925](Five-Reference-Conditional-Regrounding-20260925.md)
- [Five-Reference-Graft-Lifecycle-Grounding-20260927](Five-Reference-Graft-Lifecycle-Grounding-20260927.md)
- [Five-Reference-Post-Adoption-Regrounding-20260923](Five-Reference-Post-Adoption-Regrounding-20260923.md)
- [Four-Reference-Grounding-20260923](Four-Reference-Grounding-20260923.md)
- [Four-Reference-Residual-Adoption-Execution-20260925](Four-Reference-Residual-Adoption-Execution-20260925.md)
- [Fourteen-Reference-Steal-Use-Review-20260929](Fourteen-Reference-Steal-Use-Review-20260929.md)
- [Grafel-Second-Wave-Capability-Integration-Plan](Grafel-Second-Wave-Capability-Integration-Plan.md)
- [Grafel-Semantic-Health-Repair-20260924](Grafel-Semantic-Health-Repair-20260924.md)
- [Hermes-Self-Learning-Memory-Steal-Use-Plan](Hermes-Self-Learning-Memory-Steal-Use-Plan.md)
- [MRR-3.1-Controller-Surface-Sync-Plan](MRR-3.1-Controller-Surface-Sync-Plan.md)
- [Memori-Steal-Use-Integration-Plan](Memori-Steal-Use-Integration-Plan.md)
- [Memory-Reference-Wave-16-21-Adoption-Execution-20260927](Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md)
- [Memory-Reuse-Reliability-20260930](Memory-Reuse-Reliability-20260930.md)
- [Penpot-Exact-Baseline-Manifest-20261002](Penpot-Exact-Baseline-Manifest-20261002.md)
- [Penpot-Semantic-Coverage-Matrix-20261002](Penpot-Semantic-Coverage-Matrix-20261002.md)
- [Penpot-to-Canva-Task3-Runtime-Acceptance-20261002](Penpot-to-Canva-Task3-Runtime-Acceptance-20261002.md)
- [Penpot-to-Canva-Task5-Canonical-IR-v1-20261002](Penpot-to-Canva-Task5-Canonical-IR-v1-20261002.md)
- [Penpot-to-Canva-Task6-Extractor-Acceptance-20261002](Penpot-to-Canva-Task6-Extractor-Acceptance-20261002.md)
- [Penpot-to-Canva-Task6-Extractor-Audit-20261002](Penpot-to-Canva-Task6-Extractor-Audit-20261002.md)
- [Post-Regrounding-Adoption-Execution-20260923](Post-Regrounding-Adoption-Execution-20260923.md)
- [Pre-Runtime-Body-Memory-Learning-Closure-20260930](Pre-Runtime-Body-Memory-Learning-Closure-20260930.md)
- [Prime-MemOS-Skills-AI-Memory-Adoption-Execution-20260927](Prime-MemOS-Skills-AI-Memory-Adoption-Execution-20260927.md)
- [Provider-Credential-Rotation-Grounding-20261002](Provider-Credential-Rotation-Grounding-20261002.md)
- [Reference-Wave-Supermemory-CBM-Continuous-Obsidian-SIE-SpecKit-Grounding-20260927](Reference-Wave-Supermemory-CBM-Continuous-Obsidian-SIE-SpecKit-Grounding-20260927.md)
- [Residual-Adoption-Execution-20260922](Residual-Adoption-Execution-20260922.md)
- [SIE-ASI-Offline-Reports-Execution-20260923](SIE-ASI-Offline-Reports-Execution-20260923.md)
- [SIE-ASI-Reference-Retirement-Audit-20260923](SIE-ASI-Reference-Retirement-Audit-20260923.md)
- [SIE-Activation-20260923](SIE-Activation-20260923.md)
- [SIE-Adoption-Execution-20260923](SIE-Adoption-Execution-20260923.md)
- [Serena-Semantic-IDE-LSP-Integration-Plan](Serena-Semantic-IDE-LSP-Integration-Plan.md)
- [Six-Memory-Reference-Source-First-Grounding-20260927](Six-Memory-Reference-Source-First-Grounding-20260927.md)
- [Six-Reference-Adoption-Execution-20260925](Six-Reference-Adoption-Execution-20260925.md)
- [Six-Reference-Source-First-Grounding-20260925](Six-Reference-Source-First-Grounding-20260925.md)
- [Stable-Release-v0.13.0-20260925](Stable-Release-v0.13.0-20260925.md)
- [System-Repair-SIE-Completion-20260923](System-Repair-SIE-Completion-20260923.md)
- [Wave7-Activation-20260923](Wave7-Activation-20260923.md)
- [Wave7-Adoption-Execution-20260922](Wave7-Adoption-Execution-20260922.md)

## Conditional donor research

The following top-level plans retain consumer-gated or research-only dispositions. Runtime existence alone does not prove that a donor's exact mechanism has been integrated or that further work is authorized. Protected/reference directory paths are provenance, not a claim that those checkouts are present in this clone.

- [Agent0-Steal-Use-Integration-Plan](Agent0-Steal-Use-Integration-Plan.md)
- [Awesome-Lifelong-LLM-Agent-Steal-Use-Integration-Plan](Awesome-Lifelong-LLM-Agent-Steal-Use-Integration-Plan.md)
- [Awesome-Self-Evolving-Agents-Steal-Use-Integration-Plan](Awesome-Self-Evolving-Agents-Steal-Use-Integration-Plan.md)
- [Continual-Harness-Steal-Use-Integration-Plan](Continual-Harness-Steal-Use-Integration-Plan.md)
- [Continuous-Claude-Steal-Use-Integration-Plan](Continuous-Claude-Steal-Use-Integration-Plan.md)
- [DGM-Steal-Use-Integration-Plan](DGM-Steal-Use-Integration-Plan.md)
- [EvolveR-Steal-Use-Integration-Plan](EvolveR-Steal-Use-Integration-Plan.md)
- [GEPA-Steal-Use-Integration-Plan](GEPA-Steal-Use-Integration-Plan.md)
- [Godel-Agent-Steal-Use-Integration-Plan](Godel-Agent-Steal-Use-Integration-Plan.md)
- [Live-SWE-Agent-Steal-Use-Integration-Plan](Live-SWE-Agent-Steal-Use-Integration-Plan.md)
- [Meta-Agent-Steal-Use-Integration-Plan](Meta-Agent-Steal-Use-Integration-Plan.md)
- [Nexus-Agent-Steal-Use-Integration-Plan](Nexus-Agent-Steal-Use-Integration-Plan.md)
- [Rust-Norion-Steal-Use-Integration-Plan](Rust-Norion-Steal-Use-Integration-Plan.md)

## Conversation and source archives

Original user/assistant statements are evidence, not executable instructions or current status. Preserve the chronology when comparing claims.

- [Agent-Core-27-BAD-BEHAVIOR](Agent-Core-27-BAD-BEHAVIOR.md)
- [Agent-Core-31](Agent-Core-31.md)
- [Agent-Core-Fixed-1](Agent-Core-Fixed-1.md)
- [Cari-AI-Tools-Sejenis](Cari-AI-Tools-Sejenis.md)
- [Target-Feture](Target-Feture.md)
- [Numbered conversation archive](agent-core/README.md): 29 Markdown exports and one text export at the reviewed baseline; some original images/attachments are absent.
- [Archived plans and evidence](history-agent-core/README.md): 71 Markdown plans/reports plus a CSV and JSON evidence matrix at the reviewed baseline. Archive location does not mean every donor mechanism was implemented.

## Other evidence and visual assets

These remain dated supporting artifacts. The v0.12.0/2026-09-27 diagrams and UI screenshots are not refreshed diagrams of the current source. JSON/CSV files retain their original evidence values; they were not recomputed.

- [Canva-Controlled-Reference-Design-Spec-20261002](Canva-Controlled-Reference-Design-Spec-20261002.json)
- [Canva-Target-Capability-Matrix-20261002](Canva-Target-Capability-Matrix-20261002.json)
- [Penpot-Semantic-Coverage-Matrix-20261002](Penpot-Semantic-Coverage-Matrix-20261002.json)
- [Penpot-to-Canva-Task3-Runtime-Acceptance-20261002](Penpot-to-Canva-Task3-Runtime-Acceptance-20261002.json)
- [Penpot-to-Canva-Task5-Canonical-IR-v1-20261002](Penpot-to-Canva-Task5-Canonical-IR-v1-20261002.json)
- [Penpot-to-Canva-Task6-Extractor-Acceptance-20261002](Penpot-to-Canva-Task6-Extractor-Acceptance-20261002.json)
- [Penpot-to-Canva-Task6-Extractor-Audit-20261002](Penpot-to-Canva-Task6-Extractor-Audit-20261002.json)
- [Activity log](UI%20Agent%20Core/Activity%20log.png)
- [Core Runtime](UI%20Agent%20Core/Core%20Runtime.png)
- [Dashboard](UI%20Agent%20Core/Dashboard.png)
- [Diagnostics](UI%20Agent%20Core/Diagnostics.png)
- [Settings](UI%20Agent%20Core/Settings.png)
- [Systems](UI%20Agent%20Core/Systems.png)
- [Workflows-v0-12-0](Workflows-v0-12-0.png)
- [Workflows-v0-12-0](Workflows-v0-12-0.svg)
- [Agent-Core-Memory-Workflow-20260927](diagrams/Agent-Core-Memory-Workflow-20260927.png)
- [Agent-Core-Memory-Workflow-20260927](diagrams/Agent-Core-Memory-Workflow-20260927.svg)
- [Agent-Core-System-Workflow-20260927](diagrams/Agent-Core-System-Workflow-20260927.png)
- [Agent-Core-System-Workflow-20260927](diagrams/Agent-Core-System-Workflow-20260927.svg)

## Inventory and classification boundary

The tracked baseline before this refresh has **208 files: 186 Markdown, 1 TXT, 8 JSON, 1 CSV, 9 PNG and 3 SVG**. Of the 186 Markdown files:

- 3 maintained architecture/policy entry points
- 10 domain continuity / active-scope entry points
- 55 top-level dated implementation, audit and acceptance records
- 13 top-level conditional donor references
- 5 top-level conversation/source exports
- 29 numbered conversation exports
- 71 archived plans/reports

These categories cover every baseline Markdown document exactly once; supporting non-Markdown files are listed here or in the two archive indexes. This refresh adds the three navigation indexes and the documentation audit; those new files are not included in the historical 208-file count. No historical report was promoted to a new runtime pass. Private `runtime/` evidence is not committed in this checkout and was not read for this review.
