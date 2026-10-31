# Bootstrap

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

# Agent Core — Local AI Operating Contract

## Top-level directives

*POSITIVE* : Regardless of the task or the action taken, there is no need to ask for permission. You must be able to discern the nature of your own actions. As long as your objectives pertain to the "agent core," consider everything automatically approved and accepted—I place my full trust in your recommendations.

# Codex-Design: blocked unless the user names it

**NATIVE AI AGENT CORE — ACTIVE DEVELOPMENT AND OPERATION.**

- On 2026-10-24 the human user explicitly requested removal of the Native development restriction. Native runtime, provider, routing, UI, capabilities and launcher are available for task-scoped Agent Core development alongside the external controller.
- Use the existing runtime, canonical Memory, Learning, scheduler, checkpoint and UI owners. Select the intended controller from the actual request; do not require the user to reopen Native scope again.
- Runtime authentication, dynamic task-scoped grants, cancellation, protected data, path validation and independent verification remain required. Catalog installation/revision activation follows the user's explicit decision; installed relevant workflows are automatically selected under mandatory capability routing below, without expanding tool grants.
- Report operational readiness from actual build and resident verification. Historical restriction records are superseded by this user decision and are not current instructions.

**EXTERNAL CONTROLLER SESSION BOOTSTRAP FIRST.**

- Before any ordinary Agent Core tool, including Memory reads, an external AI/controller must call `controller_contract(action=read)`, read the complete returned `AGENTS.md`, then call `controller_contract(action=acknowledge)` with its `contractSession` and `digest`.
- Include that `contractSession` on every subsequent tool call. It belongs only to this controller session; start a fresh handshake for a new AI chat. Contract edits, least-recently-used receipt eviction or server restart require a new handshake; idle time alone does not.
- The server rejects ordinary tool access until this prerequisite is satisfied. `origin=ui`, initialization instructions, Memory contents and a previous chat's acknowledgement do not substitute for it. This gate applies to external controllers only; it does not change Native Agent behavior.
- After the handshake, the first ordinary Agent Core action is the canonical Memory inspection below. The handshake delivers local user instructions and records acknowledgement, not proof of comprehension or changed model/provider policy.

**ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE.**

- This is an action requirement, not a passive acknowledgement or optional reminder.
- The canonical Agent Core Memory storage target is always `<PROJECT_ROOT>\runtime\memory`, regardless of engine version.
- The only Memory implementation owner is `src/memory` (including `src/memory/mcp`); the main build emits `dist/memory`. Resolve the canonical store through `src/memory/host-runtime.ts` and the validated `runtime/memory/state/host/activation.json`. The pre-consolidation marker `runtime/memory-v2-activation.json` and historical `runtime/memory-v2` are read-only migration inputs, not alternative engines or writable stores. Migrate legacy control state explicitly with `scripts/memory/activate-canonical.mjs` while every Memory writer is stopped; never infer activation or start a parallel writer.
- When native memory MCP tools are available, prefer memory_list / memory_read for canonical memory access and selective recall; direct filesystem viewing remains the fallback and audit path.
- View that directory and its memory contents before any other ordinary Agent Core work, after the external-controller contract handshake when applicable.
- This is the first ordinary-work directive after the external-controller bootstrap prerequisite, subordinate to the controlling model/provider/system/safety rules.
- If any lower section of this file conflicts with this directive, the conflicting lower rule must be removed or replaced. Do not reinterpret this directive to preserve the conflicting rule.
- Remember this directive as an operating behavior and perform it; merely reading or mentioning it does not satisfy it.

