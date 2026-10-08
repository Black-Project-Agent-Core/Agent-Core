# DeepSeek Harness Steal / Use Integration Plan

> **Status:** DSH-P1/P2 COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — REFERENCE RETIRED
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\16-deepseek-harness`
> **Repository:** `https://github.com/deepseek-ai/deepseek-harness`
> **Observed revision:** `ddefc45fbc7f8e46dd73185e68295696d1297887`
> **Branch:** `master`
> **License:** MIT
> **Provenance update:** the degraded checkout was absent at approved execution time and was re-cloned directly from GitHub, then detached-pinned to `ddefc45fbc7f8e46dd73185e68295696d1297887`; the fresh replacement no longer has the prior `bad object HEAD` defect. The reference was retired after post-adoption zero-value census.

## 1. Source-first census

Fresh filesystem census found 11,239 non-Git files, 4,330 executable-code files and 2,202 test files. The audit covered core/session/agent-loop, compaction, spill, guard, goal, workspace, browser-use, bundle and direct tests. Exact source was compared against current Agent Core tracker, result-budget, terminal spill, process ledger, Reflexion and MCP metadata.

Grafel registration was attempted as a second opinion, but this repo graph remained unavailable in the audit workspace. No conclusion below depends on graph output.

## 2. DSH-P1 — interrupted MCP invocation reconciliation

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.
Source evidence:
- `packages/core/session/src/repair.ts::interruptedTurnClosers`;
- `packages/core/session/src/invariant.ts`;
- direct recovery tests in `packages/core/session/tests/repair.spec.ts` and resume tests;
- explicit distinction between a call that never started and a call that started but whose durable outcome is unknown;
- crash-tail repair never blindly re-executes an unknown side effect.

Verified Agent Core gap:
- `src/tracker/tool-invocation.ts` durably records `tool-invocation-start` and one terminal event sharing `invocationId` + `processSessionId`;
- startup does not currently reconcile a prior process session's orphan start into an explicit interrupted/unknown-outcome evidence event.

Proposed adaptation:
- add a tracker-owned startup reconciler over bounded recent Activity Tracker evidence;
- for prior process sessions only, identify invocation-start events with no matching terminal event;
- append one idempotent `tool-invocation-interrupted` evidence row, never rewrite old journal rows;
- distinguish not-started only when durable admission evidence proves it; otherwise classify conservatively as `outcome-unknown`;
- attach existing tool metadata/annotations for read-only/idempotent/destructive risk when available;
- never auto-retry; unknown mutating outcomes require external-state verification or controller/user judgment;
- reuse Activity Tracker and existing process-session IDs; no session database or second workflow engine.
Acceptance:
- balanced invocations produce no synthetic evidence;
- prior-session orphan starts produce exactly one interruption record;
- current-process in-flight calls are never reconciled;
- unknown mutating outcomes cannot become retry authorization;
- re-running reconciliation creates no duplicate terminal rows;
- compact failure/history views can surface the recovered failure family.

## 3. DSH-P2 — byte-accurate head/tail MCP result budgeting

**Disposition:** CURRENT-FIT HARDENING PROPOSAL — user selection required.

Source evidence:
- `packages/compaction/compaction-tool-result-pruner/src/index.ts`;
- `packages/spill/spill-policy/src/index.ts`;
- direct tests for Unicode-safe head/tail pruning and spill notice limits.

Verified Agent Core gap:
- `src/mcp/result-budget.ts` uses JavaScript serialized character length for the generic cap;
- its emergency preview is head-only;
- terminal spill is byte-aware, but generic MCP result budgeting is not.
Proposed adaptation:
- keep Agent Core redaction, non-persistable-tool policy, artifact ownership and TTL cleanup;
- measure controller-facing generic MCP budgets in UTF-8 bytes;
- use deterministic head+tail text retention with an explicit omission marker;
- reserve locator/notice bytes inside the cap before choosing preview size;
- never split Unicode surrogate pairs;
- spill failure stays fail-soft and never turns an otherwise successful call into an error;
- preserve non-text content blocks when safe rather than flattening them only for preview;
- do not create DeepSeek session/shadow-price runtime.

Acceptance:
- multibyte Unicode cannot bypass the byte cap;
- preview + notice stays within configured budget;
- both beginning and ending evidence survive;
- sensitive-capable non-persistable tools still never spill full output;
- spill failure remains fail-soft;
- ordinary in-budget responses remain behavior-compatible.

## 4. Covered / rejected families
Covered by current Agent Core:
- terminal output spill + SHA-256 evidence;
- process ledger / owned process trees;
- failure-loop Reflexion advisory;
- file checkpoints and atomic persistence;
- bounded browser_control structured-DOM lane;
- existing result spill/redaction and tool history.

Rejected:
- full DeepSeek session/model/agent runtime;
- provider/model loop, prompt/context runtime and autonomous goal loop;
- browser agent runtime and alternate workspace authority;
- Cordis plugin graph, shadow-price accounting and model-facing session replay.

## 5. Reference disposition

**RETAIN.** DSH-P1 and DSH-P2 remain concrete source-backed proposals. The checkout is Git-metadata-degraded, so it must never be used as a restoration authority. No implementation, product test/build, restart or release is performed by this plan.

## 6. Approved execution result — 2026-09-27

DSH-P1/P2 are present in current Agent Core source and freshly built `dist`. DSH-P1 is wired at startup through `reconcileInterruptedToolInvocations`; DSH-P2 is wired through the generic MCP result-budget wrapper.

Direct wave acceptance, result-budget tests, manifest contract and build passed as recorded in `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`. The post-adoption dependency/value census found no remaining current-fit mechanism, so the fresh reference checkout was deleted as a corpse after evidence capture.

No DeepSeek session/model runtime, Cordis runtime or dependency was installed. Live resident activation is complete after the user-controlled restart/reconnect; installed-runtime acceptance is recorded in `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`.
