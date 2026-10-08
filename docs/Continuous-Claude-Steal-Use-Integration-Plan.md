# Continuous Claude — Steal / Use Integration Plan

> **Status:** HISTORICAL CCLAUDE-C1 CONSUMER-ONLY DISPOSITION — NO CCLAUDE-C1 IMPLEMENTATION CLAIMED BY THIS RECORD.
> **2026-10-08 source reconciliation:** Native runtime, chat and provider scheduling now exist; the old blanket “no native runtime” prerequisite is superseded. This alone does not establish that CCLAUDE-C1's exact continuation contract was adopted or authorize new donor integration. Reassess a concrete consumer against [current architecture](CODEBASE.md) if that work is requested. The original donor analysis and disposition remain below.
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\continuous-claude`
> **Repository:** `https://github.com/AnandChowdhary/continuous-claude.git`
> **Revision:** `b9d8ccf9343905d33a1296583114e3326fe102d3`
> **Branch:** `main`
> **License:** MIT
> **Checkout state:** shallow; untracked audit ZIP preserved untouched.

## 1. Source-first scope

The audit read the Bash and PowerShell runners plus direct BATS tests. Executable source substantiates bounded run/cost/time controls, persistent task notes, durable knowledge prompt injection, reviewer iterations, consecutive completion-signal counting, stall/error thresholds, hourly call throttling, worktree/branch/commit/PR orchestration and provider adapters.

Current Agent Core has no native model/provider execution loop under `src`; `agentRuntime` is currently a UI/status contract rather than a real prompt/session/model owner. Therefore the reference's provider loop cannot be transplanted as a current hidden runtime.

## 2. CCLAUDE-C1 — native Agent Runtime continuation envelope

**Disposition:** CONDITIONAL HIGH-VALUE PROPOSAL — only when a real Agent Core AI/agentRuntime execution owner exists.

Source mechanisms:
- explicit max runs, max duration and optional cost budget;
- hourly provider-call ceiling and consecutive error threshold;
- stall threshold that records diagnostics and stops non-interactive continuation for human intervention;
- completion requires repeated/consecutive evidence rather than one model assertion;
- durable baton notes/knowledge are read on the next iteration;
- direct tests cover argument validation, notes/knowledge inclusion, completion-signal counting and provider-result handling.
Proposed future Agent Core adaptation:
- implement only inside the future native Agent Core AI runtime, never in the MCP machine-control layer;
- one bounded run envelope owns:
  - max iterations;
  - wall-clock deadline;
  - optional provider usage/cost ceiling when measured data exists;
  - hourly call budget;
  - consecutive operational-error threshold;
  - stall/no-progress threshold;
  - explicit completion evidence count;
- every stop reason is durable/inspectable and never silently resumes itself;
- task handoff references canonical Memory/Learning evidence rather than maintaining a competing `SHARED_TASK_NOTES.md` authority;
- human/controller review remains required after stall or uncertain side effects;
- no automatic commit, push, PR, merge or release authority.

Acceptance if the future consumer exists:
- budget exhaustion stops before another provider call;
- completion requires the configured consecutive evidence threshold and resets on contradictory/non-complete evidence;
- repeated no-progress generates a bounded handoff record and stops autonomous continuation;
- restart can recover the envelope without replaying a possibly completed mutating tool call;
- provider usage accounting is observational and never fabricated.

## 3. Covered / rejected mechanisms

Covered today:
- durable project knowledge/handoff: canonical Memory + Learning checkpoints/journey;
- repeated equivalent tool-failure detection: Reflexion failure-loop advisory;
- tool-call evidence: Activity Tracker/tool history;
- user-controlled verification boundary: current operating contract.

Rejected:
- `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, or equivalent bypass flags;
- autonomous provider loop in current MCP core;
- automatic Git staging/commit/branch/PR/merge;
- automatic broad tests/reviewer pass contrary to user-controlled verification;
- parallel notes/knowledge files as a new canonical authority;
- self-update logic and external GitHub workflow ownership.

## 4. Reference disposition

**CONSUMER-ONLY / MOVED.** There is no current native model/provider runtime consumer. CCLAUDE-C1 remains source-backed conditional evidence for the separate future Agent Core AI workstream, so the checkout is preserved but moved out of the active adoption pool into protected `Consumer`.

## 5. Approved conditional execution boundary — 2026-09-27

The user approved CCLAUDE-C1, but current Agent Core still has no native model/provider execution loop. Implementing the continuation envelope now would require inventing the consumer it is meant to harden.

No hidden provider loop, auto-commit/PR flow, permission bypass, or parallel knowledge authority was created. The reference remains preserved under `Consumer` for the separate native Agent Core AI workstream.

## 6. Final lifecycle re-grounding — 2026-09-27

Current Agent Core source still contains no native prompt/model/provider execution owner. CCLAUDE-C1 therefore remains useful only when that separate native AI runtime exists. Its unsafe permission bypass and autonomous Git/PR behavior remain rejected.

The exact checkout was moved from `continuous-claude` to `Consumer\continuous-claude`, preserving HEAD `b9d8ccf9343905d33a1296583114e3326fe102d3` and its pre-existing audit ZIP.

No provider loop, continuation scheduler, Git automation, build, restart, or release mutation was added.
