# Permanent Development Execution Scope Guardrail

**Status:** PERMANENT / USER-AUTHORED / VERBATIM
**Scope:** All Market Signal Lab development, debugging, verification, documentation, release-preparation, and continuation work.

This file is the canonical source for the user's execution-scope instruction. The verbatim block below must be copied unchanged into current/future MSL continuation checkpoints so that it survives cross-session handoffs.

**Mandatory companion purpose guardrail:** `docs/checkpoints/PERMANENT_MSL_PURPOSE_GUARDRAIL.md`

**Current Phase C resume marker:** `docs/checkpoints/2026-08-18-phase-c-resumed.md`

Read and preserve the purpose guardrail **before interpreting any roadmap, spec, plan, QA, UI wording, analytics name, or future feature proposal**. During the active Phase C continuation, also read the resume marker above before relying on older checkpoint text that still says Phase C/C1 is frozen.

MSL must remain focused on evidence-based Envato trend-direction inference and product insight, and must not be reframed as market-entry timing, trading, or buy/sell/hold decision support.

If an older/frozen document contains a legacy name such as `Opportunity`, `OpportunityScore`, `Product Opportunity`, `prediction`, or `forward outcome`, the purpose guardrail controls the current semantic interpretation. Exact historical/parity names may remain where regression evidence or compatibility requires them, but they must not be expanded into market-entry timing semantics.

## User instruction — verbatim


## Operational interpretation — non-verbatim

1. Prefer work that can be completed directly inside the assistant's currently available internal scope/tools.
2. If a required step cannot be performed there but can reasonably be performed in Linux build host, tell the user exactly what assistance/action is needed from them for the build host step instead of silently stalling.
3. If the step cannot reasonably be completed internally or in Linux build host, the authorized fallback is the user's local machine through an available plugin/tool such as Desktop Commander.
4. Use already-available relevant plugins when they materially help the task and remain inside project/security guardrails.
5. If a materially useful plugin/tool is not available in the current scope, tell the user and recommend the specific class of tool/plugin needed rather than pretending the capability exists.
6. When ambiguity in this instruction could create a dead end, explain the ambiguity and the proposed interpretation explicitly.
7. This hierarchy does not override security, credential, repository, no-`main`-merge, evidence, purpose, or other permanent MSL guardrails.
