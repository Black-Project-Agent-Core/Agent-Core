# Agent Core Wave F — Adaptive Resource Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic local resource-governed dispatch, bounded evidence-based diagnosis, and optional safe scheduled local maintenance without exceeding operator concurrency, changing execution truth, or adding cloud/model dependencies.

**Architecture:** A shared injectable resource snapshot provider feeds a pure resource governor. The execution scheduler consumes only the resulting safe concurrency ceiling; health/diagnosis observes the same decision, and a separate maintenance coordinator runs only live-safe integrity and retention dry-run work. No new MCP tool or destructive scheduled action is added.

**Tech Stack:** TypeScript, Node.js 24, Vitest, existing SQLite execution/memory fabric, existing runtime metric registry and audit logger.

**Spec:** `docs/roadmap/agent-core-wave-f-design.md`

## Global Constraints

- Work only in `.worktrees/wave-f-adaptive-resource-governance` until integration.
- Base source is `047c62f112982ec0f33cd36b5cd133e39906015e`.
- TDD is mandatory: failing test first, observe RED, minimal implementation, observe GREEN.
- Do not add external AI/model/API, embedding/reranking, or cloud reasoning dependencies.
- Do not weaken the execution runtime lease.
- Do not terminate already-running execution nodes solely due to resource pressure.
- Never dispatch above the run maximum or configured operator maximum.
- Scheduled maintenance must not call destructive retention apply, restore, credential revocation, backup deletion/rotation, or helper deletion.
- Preserve legacy `2025-11-25` and modern `2026-07-28` MCP compatibility and existing tool count.
- Push every independently reviewable checkpoint to GitHub and verify local/remote SHA equality.

---

### Task F0: Design and baseline checkpoint

**Files:**
- Create: `docs/roadmap/agent-core-wave-f-design.md`
- Create: `docs/roadmap/agent-core-wave-f-implementation-plan.md`

**Interfaces:**
- Consumes: Wave F roadmap P2-A/P2-B/P2-C requirements.
- Produces: fixed policy thresholds, component boundaries, acceptance gates, and implementation order.

- [x] **Step 1: Create isolated worktree from `origin/main`.**
- [x] **Step 2: Run `npm ci`.**
- [x] **Step 3: Run fresh `npm run verify:release`.** First run exposed one non-reproducible retention timeout.
- [x] **Step 4: Re-run `tests/execution-retention.test.ts` five times.** Result 5/5 PASS.
- [x] **Step 5: Re-run full `npm run verify:release`.** Result 130 files / 627 tests PASS / 38 skips and quality gate PASS.
- [ ] **Step 6: Commit and push design/plan checkpoint.**

### Task F1: Resource snapshot contract and configuration

**Files:**
- Create: `src/runtime/resource-snapshot.ts`
- Modify: `src/config.ts`
- Test: `tests/resource-snapshot.test.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `ResourceSnapshot`, `ResourceSnapshotProvider`, `NodeResourceSnapshotProvider`, and `ExecutionConfig.resourceGovernance`.

- [x] **Step 1: Write failing snapshot tests** proving normalized CPU/memory/storage/backlog values, unavailable signals on probe failure, no secret/path leakage, and stable timestamp injection.
- [x] **Step 2: Run `npx vitest run tests/resource-snapshot.test.ts tests/config.test.ts` and require RED from missing Wave F interfaces.**
- [x] **Step 3: Implement minimal snapshot provider and config parsing** with the exact defaults from the design spec and warning/critical ordering validation.
- [x] **Step 4: Re-run focused tests and require GREEN.**
- [x] **Step 5: Run `npm run build` and `git diff --check`.**
- [x] **Step 6: Commit `feat: add local resource snapshots` and push/read back SHA equality.**

### Task F2: Pure adaptive concurrency governor

**Files:**
- Create: `src/execution/resource-governor.ts`
- Test: `tests/resource-governor.test.ts`

**Interfaces:**
- Consumes: `ResourceSnapshotProvider`, `ExecutionConfig.resourceGovernance`.
- Produces: `ResourceGovernor.decide(requestedMaxConcurrency)` and `ResourceGovernanceDecision`.

- [x] **Step 1: Write failing policy tests** for no pressure, warning halving, critical minimum, stable multi-reason order, unknown signals, disabled policy, and hard operator/run maximum invariants.
- [x] **Step 2: Run the new test and require RED.**
- [x] **Step 3: Implement the minimal pure policy and provider-failure fail-open behavior.**
- [x] **Step 4: Re-run tests and require GREEN; replay each deterministic table twice and require byte-equivalent decisions apart from an injected identical timestamp.**
- [x] **Step 5: Commit `feat: add deterministic resource governor` and push/read back SHA equality.**

### Task F3: Scheduler dispatch integration and durable reason evidence

**Files:**
- Modify: `src/execution/wake.ts`
- Modify: `src/execution/scheduler.ts`
- Modify: `src/execution/service.ts`
- Modify: `src/runtime/services.ts`
- Test: `tests/execution-scheduler.test.ts`
- Test: `tests/resource-governance.acceptance.test.ts`

**Interfaces:**
- Adds execution events `run.resource_throttled` and `run.resource_recovered`.
- Scheduler uses `ResourceGovernor` only to calculate slots for new launches.

- [ ] **Step 1: Write failing scheduler tests** with injected warning/critical/recovery snapshots. Prove max running nodes never exceeds the safe ceiling for newly launched work, existing running nodes are not terminated, reason transitions are persisted, and repeated identical pressure does not spam transition events.
- [ ] **Step 2: Run focused scheduler/governance tests and require RED.**
- [ ] **Step 3: Implement minimal scheduler integration and transition de-duplication.**
- [ ] **Step 4: Instrument bounded safe-concurrency/throttle/recovery/snapshot-duration metrics.**
- [ ] **Step 5: Re-run scheduler, execution wake, execution MCP, execution performance, and acceptance tests; require GREEN.**
- [ ] **Step 6: Commit `feat: govern execution dispatch under local pressure` and push/read back SHA equality.**

### Task F4: Bounded resource health and evidence-based diagnosis

**Files:**
- Create: `src/runtime/diagnosis.ts`
- Modify: `src/runtime/health-metrics.ts`
- Modify: `src/mcp/health-metrics.ts`
- Modify: `src/mcp/server.ts`
- Test: `tests/runtime-diagnosis.test.ts`
- Test: `tests/health-metrics.test.ts`
- Test: `tests/mcp-integration.test.ts`
- Test: `tests/mcp-dual-era.test.ts`

**Interfaces:**
- Produces `RuntimeDiagnosisRecommendation[]`.
- Extends existing health output with `resourceGovernance` and `diagnosis`; does not add a tool. Task F5 subsequently adds `maintenance` to the same surface.

- [ ] **Step 1: Write failing diagnosis tests** for active pressure, GitHub credential degradation, audit/telemetry degradation, memory p95 >150 ms, dispatch p95 >100 ms, continuity blockers when an authenticated scope is provided, and no recommendation when evidence is absent.
- [ ] **Step 2: Write failing health/MCP tests** proving bounded resource/diagnosis fields, absence of raw paths/credentials/request IDs/full hashes, and unchanged tool count in both MCP eras.
- [ ] **Step 3: Run focused tests and require RED.**
- [ ] **Step 4: Implement pure diagnosis classifier and optional scoped enrichment in `RuntimeHealthMetrics.getMetrics(scope?)`.**
- [ ] **Step 5: Update capabilities stage/features without changing tool count.**
- [ ] **Step 6: Run focused observability + MCP dual-era regressions and require GREEN.**
- [ ] **Step 7: Commit `feat: add evidence based runtime diagnosis` and push/read back SHA equality.**

### Task F5: Optional live-safe scheduled maintenance

**Files:**
- Create: `src/runtime/maintenance.ts`
- Modify: `src/config.ts`
- Modify: `src/runtime/services.ts`
- Modify: `src/index.ts`
- Test: `tests/runtime-maintenance.test.ts`
- Test: `tests/config.test.ts`
- Test: `tests/execution-runtime-lease.test.ts`
- Test: `tests/execution-retention.test.ts`

**Interfaces:**
- Produces `LocalMaintenanceCoordinator` and `LocalMaintenanceStatus`.
- Allowed scheduled calls: memory status/integrity, execution health/integrity, `planExecutionRetention` only.

- [ ] **Step 1: Write failing tests** proving disabled-by-default behavior, one bounded timer when enabled, deterministic due-time injection, integrity + dry-run plan results, failure reason recording, and close cancels future scheduling.
- [ ] **Step 2: Add a contract test that source for the coordinator contains no invocation/import of `applyExecutionRetention`, restore, key revocation, backup deletion/rotation, or helper deletion paths.**
- [ ] **Step 3: Run focused tests and require RED.**
- [ ] **Step 4: Implement minimal coordinator/config/lifecycle wiring and audit status.**
- [ ] **Step 5: Add `maintenance` status to the existing health metrics surface, then re-run maintenance, retention, runtime-lease, config, and health tests; require GREEN.**
- [ ] **Step 6: Commit `feat: add safe scheduled local maintenance` and push/read back SHA equality.**

### Task F6: Wave F adversarial/performance certification

**Files:**
- Modify: `docs/stability.md`
- Modify: `docs/roadmap/agent-core-balanced-evolution.md`
- Modify: `docs/roadmap/agent-core-wave-f-implementation-plan.md`

**Interfaces:**
- Produces final Wave F certification evidence and integration checklist.

- [ ] **Step 1: Run deterministic adversarial resource matrix** covering all single and combined warning/critical reasons and unknown-signal cases.
- [ ] **Step 2: Run execution stress with injected pressure transitions** and prove operator max is never exceeded and no already-running node is pressure-terminated.
- [ ] **Step 3: Run performance gate** and require dispatch p95 remains below existing 100 ms target under no-pressure baseline; record exact value.
- [ ] **Step 4: Run `git diff --check`, brand scan, doc-link check, dependency diff against `047c62f`, and verify external AI/model/API dependency remains zero.**
- [ ] **Step 5: Run fresh feature-branch `npm run verify:release` and record exact files/tests/skips.**
- [ ] **Step 6: Run local/public trust-boundary and dual-era MCP canaries; require same tool count in legacy/modern and Wave A security behavior.**
- [ ] **Step 7: Update docs with exact Wave F metrics/evidence, commit, push feature branch, and require SHA equality.**
- [ ] **Step 8: Fetch `origin/main`; reconcile concurrent main changes explicitly and never reset unrelated local work.**
- [ ] **Step 9: Fast-forward/integrate only if topology is compatible; fresh merged-main `npm ci` + `npm run verify:release`; non-force push; local/remote equality.**
- [ ] **Step 10: Controlled Codespace source-sync and require `HEAD == origin/main == connection.sourceCommit`; final health/audit/public/MCP canary.**
- [ ] **Step 11: Publish final docs-only certification if needed, source-sync to its SHA, remove only Wave F local worktree/branch after equality; retain remote Wave F branch for audit.**

## Wave F Exit Matrix

```text
operator max concurrency never exceeded              REQUIRED
resource throttling reason codes persisted           REQUIRED
running nodes preserved under pressure               REQUIRED
unknown snapshot signals fail open within hard max   REQUIRED
resource metrics bounded and identifier-free         REQUIRED
diagnosis factual / recommendation-only              REQUIRED
maintenance disabled by default                      REQUIRED
scheduled destructive maintenance call paths         0
runtime lease semantics                              unchanged
legacy/modern MCP tool count                         unchanged
Wave E quality gate                                  PASS
full release regression                              PASS
external AI model/API dependency                     0
```
