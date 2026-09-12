# Agent Core Documentation

The current documentation tree describes the architecture Agent Core runs today. Audit snapshots explicitly identify their observation date and point to the current contract and verification results.

## Capability inventory

- [`AGENT-CORE-CAPABILITIES.md`](AGENT-CORE-CAPABILITIES.md) — canonical inventory of current built-in capabilities, their purpose, automatic versus explicit activation, source evidence, known boundaries, and capability change record. Read this first before comparing or changing capabilities; then inspect the source mapped to the affected entries.

## Runtime architecture

- [`source-grounded-workflow.md`](source-grounded-workflow.md) — task-bound source receipts, required craft plans, guarded mutations, current execution evidence and durable closure.
- [`engineering-workflow.md`](engineering-workflow.md) — default coding assessment, reuse ordering, parser scope, caller decisions, final complexity review and attempt reconciliation.

- [`supabase-direct-memory.md`](supabase-direct-memory.md) — direct Supabase API setup, scoped recall/read/write, deeper context search, and retry diagnostics.
- [`deterministic-memory.md`](deterministic-memory.md) — file-native Markdown vault storage, Graphify relation index, Supabase Second Memory, retrieval, redaction, backup, recovery and integrity.
- [`local-agent-continuity.md`](local-agent-continuity.md) — durable task/checkpoint/frontier state across routes and sessions.
- [`deterministic-execution-fabric.md`](deterministic-execution-fabric.md) — DAG execution, logs, events, retries, recovery and operational boundaries.
- [`multi-command-wake-workflow.md`](multi-command-wake-workflow.md) — agent-facing dependency-aware asynchronous execution behavior.
- [`github.md`](github.md) — Native GitHub Fabric credentials, REST/Git/Packages transports, destructive gates, rotation, and live read-only acceptance.

## Stability and operations

Runtime packages include the documents listed below. Source, test, and local report links inside dated audits are references to development evidence; they may require the development checkout. Private reports and runtime history are not bundled.

- [`stability-verification-2026-09-09.md`](stability-verification-2026-09-09.md) — deployed runtime, live memory evidence, verified fixes, and remaining certification gates.
- [`memory-lifecycle-audit-2026-09-09.md`](memory-lifecycle-audit-2026-09-09.md) — baseline memory observations before lifecycle corrections; it is not the current runtime status.
- [`memory-lifecycle-remediation-plan.md`](memory-lifecycle-remediation-plan.md) — baseline acceptance requirements; current implementation and outstanding work are recorded in the verification report.
- [`stability.md`](stability.md) — maintained stability baseline and release gates.
- [`windows-installation-cutover.md`](windows-installation-cutover.md) — moving a Windows installation to a fresh canonical clone while preserving connector authentication identity.
- [`agent-core-connection-troubleshooting.md`](agent-core-connection-troubleshooting.md) — layered connection diagnosis before declaring the runtime unreachable.
- [`../SECURITY.md`](../SECURITY.md) — repository/runtime security model and secret boundaries.

## Roadmap

`roadmap/` holds forward-looking design and study documents only. A roadmap document is not a statement that a feature is implemented. The live MCP capability surface remains the factual source for currently available behavior.

- [`roadmap/rtk-integration-assessment.md`](roadmap/rtk-integration-assessment.md) — local donor analysis, existing output-parser overlap, integration candidates, and conflicts. Proposed output-processing behavior is not yet implemented.
