# Agent Core Ecosystem Residual Steal/Use Plan

> **Status:** COMPLETE — LIVE-ACTIVATED — TARGETED + INSTALLED-RUNTIME VERIFIED
> **Grounded:** 2026-09-27
> **Scope owner:** Agent Core system/ecosystem
> **Explicit exclusion:** Runtime/New Chat and every capability whose value depends on a future native chat/session/model runtime.
> **Authority:** exact protected-reference source/tests plus current Agent Core source and current Grafel index.
> **Installation authorization:** APPROVED BY USER ON 2026-09-27. Source implementation/build completed and the user subsequently restarted `Agent Core.exe`; installed-runtime acceptance is verified. No release apply/version bump/commit/tag/push/publish/deploy was performed.

## 1. Objective and hard scope boundary

This plan exists only to strengthen the existing Agent Core ecosystem/control plane.

In scope:
- MCP/control plane and machine-side execution safety;
- persistence/recovery and graceful system lifecycle;
- canonical Memory/index/embedding reliability;
- Learning and Memory governance;
- Skills artifact/evaluation/governance infrastructure;
- Code Intelligence/Semantic IDE integration when directly relevant;
- security/privacy;
- verification/release/operational safety.

Out of scope, even if source is valuable:
- Runtime/New Chat;
- chat/session engines;
- prompt admission/agent loops/context compaction;
- model/provider runtimes;
- TUI or interactive chat shell;
- daemon agent runtime;
- subagent/RLM/autonomous continuation;
- managed workstreams/handoffs;
- native session consolidation.

If a candidate needs any out-of-scope owner to become useful, it is rejected from this plan rather than deferred inside it.

## 2. Re-grounding evidence

Protected-reference census:
- Prime Agent: 1,266 files / 992 executable-code / 423 test-code / 23,112,691 bytes.
- MemOS: 2,021 files / 1,555 executable-code / 495 test-code / 30,821,487 bytes.
- Anthropic Skills: 419 files / 73 executable-code / 3 test-code / 10,987,398 bytes.
- ai-memory: 711 files / 472 executable-code / 103 test-code / 15,474,622 bytes.

Licensing used by selected source:
- Prime Agent: MIT.
- MemOS selected local-plugin mechanics: MIT.
- Anthropic Skills selected `skill-creator` mechanics: Apache-2.0.
- ai-memory: MIT.

Grafel readback during this grounding:
- index: current;
- registered workspace coverage: 1/1 complete;
- graph: available.

The four older per-reference plan files were deleted by the user and are intentionally not recreated. This single file is the only proposal authority for this re-grounding.

Evidence bundle:
`runtime/tmp/four-reference-ecosystem-only-regrounding-20260927/ecosystem-only-census.json`.

## 3. Selected proposal set

### AC-ECO-P1 — crash-safe idempotency journal for mutating MCP calls

**Source:** Prime Agent `command-recovery-journal.ts` and its direct tests.

**Current Agent Core gap:** Agent Core already has crash-safe bounded evidence logs, but it does not durably record a mutating MCP invocation as received before dispatch and distinguish completed vs uncertain-after-crash execution.

Design:
- add an optional explicit idempotency/invocation key only for mutating MCP calls;
- scope identity by authenticated caller + tool + invocation key;
- persist a compact `received` record before handler dispatch using Agent Core-owned persistence;
- persist terminal outcome after completion;
- an identical completed invocation must not execute twice;
- a received-without-terminal record is reported as **uncertain**, never replayed automatically;
- a reused key with mismatched tool/argument digest fails closed;
- retention/compaction stays bounded;
- AIM-P6 evidence-capture policy and existing redaction remain authoritative for persisted detail.

Acceptance:
- completed duplicate invocation executes zero additional mutations;
- crash-between-receipt-and-result becomes deterministic uncertain state;
- malformed/truncated final journal record does not become committed state;
- no credential/raw-secret material is required in the journal;
- clients that do not opt into the idempotency key remain behavior-compatible.

No new dependency or second dispatcher is required.

### AC-ECO-P2 — mutation quiescence during graceful Core shutdown

**Source:** Prime Agent `mutation-drain-latch.ts` and direct concurrency/cancellation tests.

**Current Agent Core gap:** `AgentCoreService.close()` closes HTTP/components, but there is no explicit count of admitted mutating MCP handlers. The HTTP grace fallback can therefore terminate connections without a tool-level mutation-drain invariant.

Design:
- use the existing MCP registration wrapper as the single admission point;
- classify mutating vs read-only calls from existing tool metadata;
- admitted mutating calls increment one in-process counter and release exactly once in `finally`;
- graceful shutdown switches mutation admission into draining state before component teardown;
- new mutations are rejected with one bounded deterministic shutdown response;
- wait only a reviewed bounded interval for already-admitted mutations;
- on bound expiry, current launcher/HTTP hard-stop fallback remains authoritative;
- no new scheduler, process manager, workflow gate or mutation queue.

Acceptance:
- shutdown cannot claim drained while a mutating handler remains active;
- racing completion decrements exactly once;
- no new mutation starts after drain state begins;
- abort/timeout leaves no listener/waiter leak;
- existing read-only behavior and launcher fallback remain compatible.

### AC-ECO-P3 — durable Memory embedding repair state

**Source:** MemOS local-plugin `embedding_retry_queue.ts`, `retry-worker.ts`, `retry-queue.test.ts`, and `retry-worker.test.ts`.

**Current Agent Core gap:** Memory index build is fail-soft and preserves lexical retrieval when embedding fails, but missing vectors have no durable per-record repair state, attempt count, provider retry-after memory, or stale-claim protection.

Selected adaptation is deliberately narrower than MemOS:
- keep canonical Memory and current JSON index as the only data authorities;
- store a bounded Agent Core-owned embedding-repair state under existing Memory state;
- identify repair work by Memory ID + current semantic fingerprint + embedder identity;
- persist attempts, next eligible retry time, terminal/degraded state and bounded safe error category;
- honor provider retry-after when available;
- use current Memory process lock/atomic persistence instead of SQLite;
- repair is driven only by existing foreground/system entrypoints such as explicit reindex or normal index reconciliation;
- **do not add a timer/background retry loop**;
- stale work whose Memory fingerprint/embedder identity changed is discarded rather than applied.

Acceptance:
- embedding outage never blocks canonical Memory or lexical retrieval;
- repair survives restart;
- repeated foreground repair respects next-attempt time and bounded attempts;
- stale repair result cannot overwrite a newer Memory/index state;
- successful repair clears the degraded vector gap;
- no new database, daemon, timer worker, or dependency is introduced.

### AC-ECO-P4 — offline stratified Skills trigger-routing holdout evaluator

**Source:** Anthropic `skill-creator/scripts/run_loop.py` and `run_eval.py`.

**Current Agent Core gap:** Current `skill-effectiveness-eval.mjs` measures task correctness/performance for skill-vs-control but does not measure trigger precision against both positive and negative routing examples with a protected holdout.

Design:
- fixture rows contain stable ID/query and `shouldTrigger`;
- deterministic seed-based stratified train/holdout split;
- fail closed if class counts cannot support requested holdout;
- evaluator consumes stored external observations only; it does not invoke a model;
- compute precision, recall, specificity, false-trigger rate, missed-trigger rate and balanced accuracy;
- bind evidence to skill digest, fixture digest, controller identity, MCP manifest fingerprint, seed and evaluator revision;
- holdout results stay absent from any candidate-generation input;
- reports are advisory only and never change the catalog.

Acceptance:
- identical fixture + seed gives identical split;
- no item appears in both cohorts;
- incomplete repeated observations cannot pass;
- positive and negative routing quality are both visible;
- evaluation never imports, rewrites, activates or promotes a skill.

### AC-ECO-P5 — explicit Skills revision staging, review, promotion and rollback

**Source:** current Agent Core SkillService plus Anthropic skill-creator artifact/evaluation lifecycle mechanics.

**Current Agent Core gap:** exact duplicate import is handled, but same-name/different-digest candidates hard-fail as collision and there is no controlled revision lifecycle.

Design:
- preserve ordinary `import` collision behavior unchanged;
- add a separate explicit revision-staging path;
- staged candidate must pass current SkillService validation and retain the same canonical skill name;
- staged bytes are non-active and non-executable;
- attach bounded evidence references from existing effectiveness evaluation and AC-ECO-P4;
- promotion requires explicit controller/user approval and exact expected incumbent/candidate digests;
- atomically preserve the previous active artifact as a bounded rollback revision;
- rollback also requires explicit expected-current digest;
- revision metadata stays bounded and path-contained.

Acceptance:
- ordinary import can never overwrite an active skill;
- stale incumbent digest blocks promotion;
- invalid/unsafe archive cannot be staged;
- failed replacement leaves incumbent intact;
- no evaluation/model automatically promotes anything;
- tool declarations still confer no execution authority.

No automatic skill rewriting or autonomous optimization is selected.

### AC-ECO-P6 — bounded explicit Memory feedback salience

**Source:** ai-memory `decay.rs`, page-feedback store operations and direct tests for helpful/not-helpful/stale/wrong bounds.

**Current Agent Core gap:** current retention review uses age/access evidence but has no explicit, bounded operator feedback signal attached to a Memory record.

Design:
- accept explicit feedback kinds: `helpful`, `not-helpful`, `stale`, `wrong`;
- persist bounded feedback evidence in existing Learning/Memory-owned state, not in canonical Memory body and not in a second database;
- event IDs are idempotent;
- feedback adjusts a bounded deterministic salience value only;
- Learning curator may use salience to order review proposals;
- stale/wrong can move a record earlier for review, but cannot delete/archive it;
- helpful can delay stale-review ordering, but cannot pin it permanently;
- canonical content, links and AIM-P4 historical-data trust stay unchanged.

Acceptance:
- duplicate feedback event cannot apply twice;
- salience remains inside reviewed bounds;
- feedback does not directly mutate/delete Memory;
- deleted Memory cannot leak feedback authority onto another ID;
- old Learning state without feedback remains valid;
- curator remains proposal-only.

### AC-ECO-P7 — dry-run Memory retirement review with stale-selection guard

**Source:** ai-memory conditional `delete_page_if_latest` / `evict_page_if_latest` semantics and forget-sweep candidate selection.

**Current Agent Core gap:** current Memory mutations are protected against canonical drift at commit time, but a human/controller review decision can become stale between candidate review and a later explicit delete because no review fingerprint is carried across that boundary.

Design:
- add a non-destructive lifecycle review preview for ordinary non-pinned Memory;
- candidate reasons may combine current retention score, AC-ECO-P6 feedback, age/access, contradictions and existing consolidation evidence;
- preview returns a deterministic expected-state fingerprint for the exact reviewed Memory state;
- preview performs no mutation;
- explicit deletion may optionally carry that fingerprint;
- guarded delete re-reads current canonical state and fails closed when the reviewed state has changed;
- pinned foundation remains undeletable;
- no automatic sweep, TTL deletion, tombstone daemon, or raw-observation pruning.

Acceptance:
- preview is deterministic for unchanged state;
- substantive update invalidates a prior review fingerprint;
- stale review can never delete refreshed content under guarded mode;
- preview alone has zero mutation effect;
- existing canonical completeness/link-repair protections remain mandatory.

## 4. Explicitly rejected after ecosystem-only re-grounding

Prime Agent rejected:
- session leases and session worker recovery;
- context tree/compaction;
- prompt admission for chat sessions;
- model/provider runtime;
- TUI;
- daemon agent runtime;
- RLM/subagents/autonomous continuation;
- package/runtime shell;
- external MCP connection catalog/store because Agent Core currently has no owning external-MCP client subsystem/consumer.

MemOS rejected:
- Dream reasoning/recall/persistence and any automatic create/update/merge/archive;
- generic executable plugin hooks;
- Redis/local task scheduler;
- background embedding retry timer/worker;
- alternate graph/vector/storage/server/chat/agent/memory stacks;
- LLM-driven feedback/world-model pipelines.

Anthropic Skills rejected:
- automatic description rewriting;
- iterative self-optimization loop;
- automatic skill selection/invocation;
- domain-specific bundled skills as Core features;
- report/viewer UI as core functionality.

ai-memory rejected:
- managed workstream/handoff;
- session consolidation;
- native harness transcript adapters;
- alternate SQLite/wiki/web/MCP/provider stacks;
- autonomous auto-improve;
- destructive forget/TTL sweeps.

These are rejected from this plan, not deferred.

## 5. Proposed implementation order after user selection

The proposals are independent enough to select individually.

Recommended dependency/order only where technically necessary:
1. AC-ECO-P1 and AC-ECO-P2 — MCP/control-plane reliability.
2. AC-ECO-P3 — Memory embedding resilience.
3. AC-ECO-P4 — Skills routing evidence.
4. AC-ECO-P5 — Skills revision lifecycle; should consume AC-ECO-P4 and existing skill-effectiveness evidence if selected.
5. AC-ECO-P6 — Memory feedback evidence.
6. AC-ECO-P7 — Memory retirement preview/guard; can use AC-ECO-P6 if both are selected.

No proposal requires Runtime/New Chat.

Before implementation, user approval should explicitly name selected AC-ECO IDs. Unselected proposals remain plan text only.

## 6. Verification boundary for a later approved implementation

Only plan-scoped verification should run unless the user authorizes broader testing:
- targeted unit/contract tests for selected proposals;
- TypeScript compile/no-emit if affected;
- MCP manifest/compat only if public schemas change;
- path policy;
- current Grafel freshness after structural source changes;
- installed-runtime/live acceptance only if runtime activation is part of the approved implementation.

No release apply, commit, tag, push, publish, deploy or restart is implied by approving this plan unless separately authorized.

## 7. Protected-reference disposition

**POST-ADOPTION RETIRED.** After AC-ECO-P1 through P7 were implemented and targeted-verified, a fresh zero-value census rechecked the prior family-level disposition, current `src`/`scripts` path dependencies, and live process command lines.

Result:
- `10-prime-agent`: zero-value after AC-ECO-P1/P2 harvest; remaining families are duplicate or Runtime/New Chat/session/model/TUI/daemon/subagent scope.
- `11-MemOS`: zero-value after AC-ECO-P3 harvest; remaining Dream/plugin/scheduler/alternate graph/vector/server/memory families are rejected or duplicate.
- `05-skills`: zero-value after AC-ECO-P4/P5 harvest; remaining content is domain/example/automatic rewrite-routing material outside Agent Core core.
- `06-ai-memory`: zero-value after AC-ECO-P6/P7 harvest; remaining workstream/session/runtime/alternate DB/wiki/web/MCP/provider/autonomous sweep families are rejected or out-of-scope.

Fresh runtime dependency scan found 0 path-name references in current `src`, 0 in `scripts`, and no live process consumer beyond the census command. Under the user's explicit prior deletion rule for proven corpse/zero-value protected references, all four folders were deleted.

Retirement evidence: `runtime/tmp/four-reference-post-adoption-retirement-20260927.json`.

## 8. Implementation closure — 2026-09-27

All seven approved ecosystem proposals are implemented in current source and compiled into local `dist`.

Implemented owners:
- AC-ECO-P1/P2: `src/mcp/mutation-safety.ts`, wired through `src/mcp/server.ts`, `src/mcp/handler.ts`, and `src/index.ts`.
- AC-ECO-P3: `src/memory/embedding-repair.ts` plus MemoryIndex/MemoryService integration.
- AC-ECO-P4: `scripts/verify/skill-routing-eval.mjs` and npm script `verify:skill-routing`.
- AC-ECO-P5: revision staging/history/promotion/rollback in `src/skills/service.ts` and the existing single `skills` MCP surface.
- AC-ECO-P6: `src/memory/feedback.ts` plus `memory_feedback`.
- AC-ECO-P7: `src/memory/retirement.ts`, `memory_retirement_review`, and optional guarded `memory_delete.expectedReviewFingerprint`.
- Release intent: `.changeset/20260927-ecosystem-residual-adoption.md` (minor).

Targeted verification:
- `npm exec vitest run tests/ecosystem-residual-adoption.test.ts tests/mcp-manifest-contract.test.ts` -> **8/8 PASS**.
- `npm run build` -> **PASS**; path policy scanned 255 authored files with 0 exceptions and TypeScript compilation exited 0.
- `npm run release:check-intent` -> **ok=true**.
- Grafel structural impact review resolved `createAgentCoreMcpServer` and source `MemoryService`; the MCP factory has a broad graph blast radius and therefore retained direct manifest-contract coverage, while MemoryService impact resolves into current Memory tests/source dependencies.

No additional dependency or helper installation was required.

Live activation closure:
- the user restarted `Agent Core.exe` after the source/build closure;
- fresh `/health` on the new listener is `ok`, Code Intelligence is `available/current`, and `mcpMutationSafety` is `available`;
- fresh authenticated installed-runtime MCP acceptance reports **66 tools**, including `memory_feedback`, `memory_retirement_review`, `skills`, and `code_workspace`; `partner` is absent;
- `memory_delete.expectedReviewFingerprint` and `code_workspace.allowRepoMarker` are present, and `memory_status` probe succeeds;
- live manifest fingerprint is `e42ac657446f1370e3fd577109b7be11e8bc922cac10f5a532d531f5112ead2c` with evidence under `runtime/tmp/mcp-client-acceptance/2026-09-27T10-22-43-747Z`;
- no release apply, version bump, commit, tag, push, publish or deploy occurred.
