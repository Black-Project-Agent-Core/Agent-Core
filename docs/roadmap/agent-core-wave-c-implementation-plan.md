# Agent Core Wave C — Execution & Recovery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen Agent Core's local execution containment and durability with a structured policy engine, process-tree governance, factual resource limits/fallbacks, verified execution recovery bundles, stopped-runtime restore, and backup-gated raw-log retention.

**Architecture:** Preserve the existing shell-compatible execution API and deterministic DAG semantics, but move command classification into a shared structured policy module and process lifecycle into a shared governance adapter. Recovery remains operator-facing and local: SQLite backups use the existing execution worker; bundle validation and restore use Node's built-in `node:sqlite` plus SHA-256 manifests; raw-log retention deletes only terminal stdout/stderr files and preserves result markers/database truth.

**Tech Stack:** TypeScript 7, Node.js >=24.15 (`node:child_process`, `node:sqlite`, `node:fs/promises`, `node:crypto`), SQLite execution worker, Vitest 4, existing MCP/tooling.

**Spec:** `docs/roadmap/agent-core-balanced-evolution.md` — Wave C and P1-B/P1-C sections.

## Global Constraints

- No external AI model, agent provider, cloud embedding/reranker/judge, or model API key.
- Preserve shell compatibility; do not replace the existing command surface with a new required command format.
- Preserve principal/project/workspace isolation and current route/destructive-operation gates.
- Process disappearance, timeout, or missing evidence must never become semantic or execution success.
- Destructive evidence retention requires a verified recovery bundle first and must be auditable.
- Do not add a native dependency merely to claim CPU/memory resource enforcement; unsupported hard caps must be reported factually.
- Codespace is only a compatibility canary, not the Wave C product target.

---

### Task C1: Structured command policy engine

**Files:**
- Create: `src/runtime/command-policy.ts`
- Modify: `src/runtime/process-manager.ts`
- Modify: `src/execution/dag.ts`
- Test: `tests/execution-policy.test.ts`
- Test: `tests/process-tools.test.ts`
- Test: `tests/execution-dag.test.ts`

**Interfaces:**
- Produces `evaluateExecutionIntent(intent): ExecutionPolicyDecision`.
- Produces `assertExecutionIntentAllowed(intent): ExecutionPolicyDecision`.
- Keeps compatibility export `assertCommandAllowed(command)` from `process-manager.ts`.
- Decision contains no raw command text: only `code`, `allowed`, `riskClass`, `executable`, `interpreterClass`, and sorted `characteristics`.

- [ ] **Step 1: Write failing policy tests** for blocked direct commands, blocked nested `cmd /c`/PowerShell commands, allowed bounded commands, open-world/network classification, and deterministic replay equality.
- [ ] **Step 2: Run focused tests and record RED.**
- [ ] **Step 3: Implement `command-policy.ts`** with the current blocklist unchanged and deterministic classification.
- [ ] **Step 4: Delegate `assertCommandAllowed()` to the policy engine** so existing operational callers keep the same public function.
- [ ] **Step 5: Make DAG validation preserve the existing `EXECUTION_COMMAND_BLOCKED` public error while carrying the policy reason code in error details.**
- [ ] **Step 6: Run focused tests and record GREEN.**
- [ ] **Step 7: Commit** `feat: add structured execution policy engine`.

### Task C2: Shared process-tree governance and factual resource caps

**Files:**
- Create: `src/runtime/process-governance.ts`
- Modify: `src/runtime/process-manager.ts`
- Modify: `src/execution/runner.ts`
- Modify: `src/execution/log-store.ts`
- Modify: `src/config.ts`
- Modify: `src/execution/service.ts`
- Test: `tests/process-governance.test.ts`
- Test: `tests/process-tools.test.ts`
- Test: `tests/execution-runner.test.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- `spawnManagedCommand(command, cwd)` starts a new POSIX process group when not on Windows and retains normal piped stdio.
- `terminateManagedProcessTree(child, force?)` uses `taskkill /T` on Windows and a negative PID process-group signal on POSIX, with direct-child fallback.
- `processGovernanceCapabilities()` reports the factual adapter: tree termination + wall-clock + output-byte limits are enforced; CPU-time and memory hard limits are explicitly unsupported in the current pure-Node adapter.
- `ExecutionConfig.maxOutputBytes` is configured by `AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES`, default 64 MiB, hard maximum 1 GiB.
- Runner result markers may include bounded `governance` metadata; old markers remain readable.

- [ ] **Step 1: Write failing tests** proving descendant termination on POSIX, deterministic capability reporting, config parsing, and runner output-limit failure.
- [ ] **Step 2: Run focused tests and record RED.**
- [ ] **Step 3: Implement shared spawn/terminate adapter** and replace duplicated process spawn/tree termination code.
- [ ] **Step 4: Add output-byte quota to the execution runner.** Persist at most the configured total stdout+stderr bytes, terminate the process tree on first overrun, and mark the attempt `failed` with `EXECUTION_OUTPUT_LIMIT_EXCEEDED` evidence.
- [ ] **Step 5: Add bounded governance metadata** to the result marker without changing execution schema version.
- [ ] **Step 6: Run focused tests plus cancellation regression and record GREEN.**
- [ ] **Step 7: Commit** `feat: enforce execution process governance`.

### Task C3: Execution runtime lease for safe restore boundary

**Files:**
- Create: `src/execution/runtime-lease.ts`
- Modify: `src/execution/service.ts`
- Test: `tests/execution-runtime-lease.test.ts`
- Test: `tests/execution-unified-lifecycle.test.ts`

**Interfaces:**
- `ExecutionRuntimeLease.acquire(dbPath)` atomically owns `<dbPath>.runtime.json` with `{pid, token, startedAt}`.
- A live PID makes a second acquisition fail closed with `EXECUTION_RUNTIME_ACTIVE`.
- A stale/dead PID lease can be reclaimed.
- `assertExecutionRuntimeStopped(dbPath)` is the restore gate.
- Release removes only a lease whose token still matches the owner.

- [ ] **Step 1: Write failing tests** for live-owner rejection, stale reclaim, foreign-token-safe release, and service lifecycle cleanup.
- [ ] **Step 2: Run focused tests and record RED.**
- [ ] **Step 3: Implement the lease** with exclusive file creation and bounded stale recovery.
- [ ] **Step 4: Acquire before `ExecutionStore.open()` and release on open failure/close.**
- [ ] **Step 5: Run focused lifecycle/recovery tests and record GREEN.**
- [ ] **Step 6: Commit** `feat: guard execution runtime ownership`.

### Task C4: Verified Execution Recovery Bundle and stopped restore

**Files:**
- Create: `src/execution/backup.ts`
- Modify: `src/execution/service.ts`
- Test: `tests/execution-backup-restore.test.ts`
- Test: `tests/execution-recovery.test.ts`

**Interfaces:**
- `createExecutionRecoveryBundle(options)` creates a temporary bundle, checkpoints/backs up SQLite through the existing worker, refuses while running nodes exist, copies the complete execution evidence root, hashes every copied file, writes a v1 manifest last, then atomically renames the completed bundle.
- `verifyExecutionRecoveryBundle(bundlePath)` validates path safety, SHA-256/size, SQLite `PRAGMA integrity_check`, and schema compatibility using read-only `node:sqlite`.
- `restoreExecutionRecoveryBundle(options)` requires `assertExecutionRuntimeStopped(dbPath)`, verifies the source bundle before mutation, creates a pre-restore rollback bundle, stages DB/evidence, swaps them, removes stale WAL/SHM, and rolls back the live files if replacement fails.
- Bundle manifest includes format/version, source Agent Core version, execution schema version, createdAt/reason, DB integrity/hash/size, and complete evidence file manifest.

- [ ] **Step 1: Write failing tests** for consistent bundle creation, corrupt hash rejection, corrupt SQLite rejection, active-runtime restore rejection, successful restore, and pre-restore rollback evidence.
- [ ] **Step 2: Run focused tests and record RED.**
- [ ] **Step 3: Implement bundle creation/verification.**
- [ ] **Step 4: Implement stopped-runtime restore with staging + rollback.**
- [ ] **Step 5: Reopen an `ExecutionService` after restore and prove missing evidence never becomes success.**
- [ ] **Step 6: Run focused tests and record GREEN.**
- [ ] **Step 7: Commit** `feat: add execution recovery bundles`.

### Task C5: Backup-gated raw-log retention with dry-run/action parity

**Files:**
- Create: `src/execution/retention.ts`
- Modify: `src/execution/service.ts`
- Test: `tests/execution-retention.test.ts`

**Interfaces:**
- Retention candidates are only stdout/stderr files for terminal attempts whose result marker exists and whose age meets the cutoff.
- Result markers, execution DB, artifact index, and declared artifacts are never deleted by this subsystem.
- `planExecutionRetention(options)` writes/returns an immutable v1 plan with SHA-256 `planId`, candidate size/mtime, total bytes, and `dryRun:true`.
- `applyExecutionRetention(plan, verifiedBundle)` requires a verified recovery bundle created no earlier than the plan, revalidates every candidate unchanged, deletes exactly the candidate list (no re-query expansion), and appends one JSONL audit record per decision/action.
- Changed/missing candidates are skipped with explicit reason codes, never replaced by newly discovered files.

- [ ] **Step 1: Write failing tests** for terminal-only selection, result-marker preservation, active/missing-marker exclusion, backup prerequisite, exact dry-run/action parity, changed-file skip, and audit records.
- [ ] **Step 2: Run focused tests and record RED.**
- [ ] **Step 3: Implement deterministic planner.**
- [ ] **Step 4: Implement verified-bundle-gated apply path and audit journal.**
- [ ] **Step 5: Run focused tests and record GREEN.**
- [ ] **Step 6: Commit** `feat: add safe execution log retention`.

### Task C6: Operator CLI and documentation

**Files:**
- Modify: `src/cli.ts`
- Modify: `docs/deterministic-execution-fabric.md`
- Modify: `docs/stability.md`
- Modify: `docs/roadmap/agent-core-balanced-evolution.md`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Add operator commands that do not expose secrets:
  - `agent-core execution-backup [reason]`
  - `agent-core execution-restore <bundle-path>`
  - `agent-core execution-retention-plan [older-than-days]`
  - `agent-core execution-retention-apply <plan-path> <bundle-path>`
- Restore remains stopped-runtime only; retention apply remains backup-gated.
- No MCP destructive restore/purge tool is added.

- [ ] **Step 1: Write failing CLI tests** for backup, stopped restore gate, dry-run plan, and apply argument validation.
- [ ] **Step 2: Run focused tests and record RED.**
- [ ] **Step 3: Wire CLI commands to the Wave C services** while preserving all existing CLI commands.
- [ ] **Step 4: Update execution/stability/roadmap docs** with exact operator contract and factual resource capability matrix.
- [ ] **Step 5: Run CLI/docs regression and record GREEN.**
- [ ] **Step 6: Commit** `docs: document wave c execution recovery contract`.

### Task C7: Adversarial acceptance, full certification, live canary, integration

**Files:**
- Modify: `docs/roadmap/agent-core-wave-c-implementation-plan.md`
- Modify: `docs/roadmap/agent-core-balanced-evolution.md`
- Modify: `docs/stability.md`

- [ ] **Step 1: Run focused Wave C acceptance** covering policy, governance, runner, cancellation, runtime lease, backup/restore, retention, CLI, and existing execution recovery tests.
- [ ] **Step 2: Run `npm run build` and `git diff --check`.**
- [ ] **Step 3: Run `npm run verify` and `npm run verify:release`.**
- [ ] **Step 4: Live temporary-instance canary**: run a child+grandchild and prove cancel leaves no descendants; run output-limit overrun and prove bounded logs + failed marker; create recovery bundle; plan/apply raw-log retention; restore bundle while stopped; reopen and verify integrity/evidence truth.
- [ ] **Step 5: Compatibility canary** against existing Codespace/MCP behavior; Wave A/B gates must remain green.
- [ ] **Step 6: Record exact counts/evidence and commit** `docs: certify wave c execution recovery hardening`.
- [ ] **Step 7: Fast-forward `main`, re-run merged-state verification if topology changed, push, fetch/read remote HEAD, and require exact equality.**
- [ ] **Step 8: Restart real Agent Core only if the live runtime source commit must change; verify health, public MCP legacy+modern compatibility, and sourceCommit equality.**

## Wave C Exit Matrix

```text
blocked/high-risk policy regressions       PASS
project/workspace escape                   = 0
orphan child processes after cancel        = 0 in certified scenarios
wall-clock/output resource caps            enforced
CPU-time hard cap                          explicitly unsupported in pure-Node adapter
memory hard cap                            explicitly unsupported in pure-Node adapter
backup integrity                           PASS
restore rollback                           PASS
missing evidence never becomes success     PASS
retention dry-run/action parity             PASS
raw result markers deleted by retention    = 0
external AI model/API dependency added     = 0
Wave A/B compatibility                     PASS
full regression                            PASS
```
