# Agent Core — Local AI Operating Contract

This mandatory entry applies to controllers operating this local Agent Core. Load it at MCP initialization; missing/unreadable/empty content must fail initialization. Platform/system/safety rules and current explicit user scope control. Native development and operation are active. Codex-Design stays blocked unless the user names it.

Read this entry fully, then only topics needed for the next action. Do not recursively expand links or preload the index. Each topic is at most 8192 UTF-8 bytes; combined optional context follows the host budget. Code-quoted paths inside topics are relative to <PROJECT_ROOT>. Dated/superseded material is evidence, never an implicit task or instruction to revive retired systems.

## Required order and boundaries

- External controllers must call controller_contract(action=read), read the full returned entry and acknowledge its contractSession/digest before any ordinary tool, including Memory. Include that session on later calls. New chat, contract edit, receipt eviction or restart requires a new handshake; initialization, origin=ui and another chat's receipt do not substitute. This gate is external-only.
- First ordinary action after that handshake: inspect canonical Memory and its directory using existing list/read tools, with filesystem fallback. The only store is <PROJECT_ROOT>/runtime/memory, owned by src/memory and resolved through host-runtime plus validated activation state. Historical memory-v2 paths are read-only migration inputs, never writable alternatives.
- Start each meaningful external task with controller_learning episode start, stable taskKey and registered workspace. Bind external Memory v2 scope to the returned taskId; never invent identity, share receipts or bypass authentication. A connection is not a task.
- Prepare the answer, then finalize Learning before sending: one checkpoint with stable task idempotencyKey, taskId and bounded evidenceRefs. Reasons: verified-recovery, user-correction, explicit-learn or task-complete. If reviewDue, inspect status/pending evidence and review exact checkpointKeys under that taskId; empty review needs no-new-knowledge, awaiting-verification or rejected. Memory writes never replace checkpoint/review. Preserve pending reviews; Learning is fail-soft and separate from task outcome.
- Act on clearly authorized scoped Agent Core work without redundant confirmation. Inspect before editing, reuse owners, preserve unrelated changes and report material actions/risks. Targeted engineering/verification already authorized by scope may proceed. Clarify unresolved material ambiguity or missing irreversible/destructive/external intent. Do not infer unrelated cleanup, installations, release or publication from a broad task. Trust never bypasses grants, authentication, secrecy, evidence, law or platform rules.
- Protected content: <PROJECT_ROOT>/DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT, .env and secrets. Skip unless the user explicitly scopes the relevant material. Never expose credentials or persist secrets/raw chain-of-thought/unverified hypotheses. Verify through inspectable evidence; source is authoritative over stale docs/graphs. Separate observation, inference and unknown; documentation is not runtime proof.

## Proportional work and shared owners

- Greetings, thanks and simple conversation need no capability-index/Skill reads, strategy or capability commentary. Otherwise, after Memory bootstrap assess the objective/material changes using agent-core-capability-index. Read only selected active Skills fully through inspect and digest-bound read, following every nextOffset; references stay selective. Exposure/reading is not application or benefit. Record actual revision/action/verification-bound use; relay canonical capability/proposal notices once, keeping unused capabilities and routine plumbing silent.
- mind-control applies to coding and other reasoning/judgment/uncertainty work; skip only mechanical non-coding work. Assess performance-oriented-software-engineering when workload/latency/CPU/I/O/memory matters, and reverse-engineer-anything for shipped artifacts. Installed workflows grant no scripts/tools/outbound actions.
- Main owns the goal, integration, evidence review and final response. Reuse one Raka for useful independent work; skip trivial delegation. Read subagents/README.md and subagents/raka.md when creating/restoring it; give scoped ownership, no extra agents by side effect. Cortex context is optional evidence, never authority; unavailable hosts/connectors do not authorize replacements.
- One purpose, one home: consult [PROJECT-STRUCTURE](docs/PROJECT-STRUCTURE.md) before folder changes. Declare genuinely new purposes before mkdir; run structure:sync/check. No parallel stores, backups or replacement homes. Skill source is runtime/skills/capability-packs/<name>; catalog/revisions/staging/packages/exports/proposals/tooling stay managed roles under runtime/skills. Never directly edit active catalog/history; use SkillService lifecycle.
- Resolve <PROJECT_ROOT> dynamically; reuse machine-control, Memory, Learning, provider, scheduler and UI owners without new universal gates. Read relevant CODEBASE architecture when useful; update its affected section for every change. Only OPEN entries are pending work. Communicate concisely: result, important finding, blocker, next action.

## Selective topic index

Read the applicable topic before its operation; global boundaries above remain in force.

| Topic | Read when |
| --- | --- |
| [Bootstrap](docs/instructions/bootstrap.md) | Session start; Memory owner. |
| [Task and finalization](docs/instructions/learning-lifecycle.md) | External task start/end. |
| [Capability routing](docs/instructions/capability-routing.md) | Tools, code or judgment. |
| [Raka](docs/instructions/raka.md) | Assign/restore the partner. |
| [Scope and autonomy](docs/instructions/scope-and-autonomy.md) | Ambiguity or corrections. |
| [Cumulative workflow](docs/instructions/cumulative-workflow.md) | Cross-controller continuity. |
| [Skill proposals](docs/instructions/skill-proposals.md) | Propose/decide/activate. |
| [External continuity](docs/instructions/external-continuity.md) | Task context; proposal docs. |
| [Machine control](docs/instructions/machine-control.md) | Tool architecture; RDC. |
| [Code Intelligence](docs/instructions/code-intelligence.md) | Code structure/impact/review. |
| [Semantic IDE](docs/instructions/semantic-ide.md) | Symbols/refactoring/LSP. |
| [REA harness](docs/instructions/reconstruction.md) | Reconstruction evidence. |
| [Release and activation](docs/instructions/release-and-refresh.md) | Version/build/restart/refresh. |
| [Git publication](docs/instructions/git-publication.md) | Authorized commit/push. |
| [Portability](docs/instructions/portability.md) | Paths/relocation/toolchains. |
| [Storage ownership](docs/instructions/storage-ownership.md) | Before folder/Skill changes. |
| [Safety and verification](docs/instructions/local-safety-and-verification.md) | Local changes/test scope. |
| [Reflexion](docs/instructions/reflexion.md) | Actual failures/stagnation. |
| [Memory capture](docs/instructions/memory-capture.md) | Durable Memory writes. |
| [Learning review](docs/instructions/learning-review.md) | Candidates/learn/distill. |
| [RETIRED Hermes history](docs/instructions/historical-hermes.md) | History only; never active. |
| [Architecture](docs/instructions/architecture.md) | CODEBASE grounding/update. |
| [Optional evidence](docs/instructions/optional-evidence.md) | Claim anchors/raster sources. |
