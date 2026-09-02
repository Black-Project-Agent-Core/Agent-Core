# Agent Core v0.7.0 Stabilization, Shared Memory, and Stable Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current post-v0.6.0 `main` into one exact, cross-platform, evidence-backed Agent Core v0.7.0 stable release with reliable Windows lifecycle behavior, one DMF memory authority, Private Memory Remote durability, and verified PC ↔ Codespace shared-memory continuity.

**Architecture:** Stabilization precedes feature expansion. First repair version/release identity and certification invariants, then make Windows process/lifecycle behavior deterministic, then expose and persist memory runtime posture, activate Private Memory Remote in advisory mode, certify shared-memory recovery across PC and Codespace, promote hard lifecycle enforcement only after canaries pass, and finally publish one immutable exact-SHA v0.7.0 release.

**Tech Stack:** TypeScript 7, Node.js >=24.15, `node:sqlite`, Vitest, PowerShell, Bash/GitHub Codespaces, Native GitHub Fabric/GitHub CLI, existing MCP v2 packages, existing encrypted Memory Remote implementation.

**Spec:** `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`; stability contract: `docs/stability.md`; operational contracts: `docs/windows-installation-cutover.md`, `docs/codespaces.md`, `docs/deterministic-memory.md`, `docs/deterministic-execution-fabric.md`.

## Current factual baseline — 2026-09-02

- Canonical repository: `Black-Project-Agent-Core/Agent-Core`.
- Current `main` / local HEAD: `c4bdc373c1e80e2a3576c0ea70d9f0d41b078187`.
- Published v0.6.0 stable tag commit: `5c19c0535042174a0f9d9a8ff7dd5eeb5c23b087`.
- Current `main` is 95 commits beyond the v0.6.0 stable tag while package/server version still reports `0.6.0`.
- Current source is clean and equals `origin/main`; Git tree equality and both Super-Runtime submodule SHAs were verified.
- Live Windows DMF: schema v4, 318 active memories, 323 revisions, 4,996 edges, 318 FTS rows, SQLite integrity `ok`.
- Current memory suite: 40 files / 156 tests PASS; memory quality gate PASS; 100k memory preflight p95 78.968 ms (<150 ms).
- Current execution benchmark: DAG 1.34 ms, dispatch 20.945 ms, wake 7.542 ms p95; concurrency 4/4 PASS.
- Known blockers: release identity ambiguity, stable-parity HEAD/tag gap, Windows process/lifecycle failures, production-state test isolation, Memory Remote not configured locally, hard lifecycle still advisory, and shared-memory live PC↔Codespace continuity not yet certified on this Windows installation.
## Global Constraints

- DMF remains the one semantic memory authority. Do not add a second SQLite owner, vector database authority, second hydrator, or second memory writer.
- Do not introduce OpenAI/Anthropic/Gemini/cloud embedding/reranking/external AI-judge dependencies into Agent Core.
- Do not use Mac Agent Core as an execution or recovery fallback for this project. Windows PC and GitHub Codespaces are the supported audit environments in this plan.
- Never expose raw API keys, Memory Remote encryption material, OAuth tokens, tunnel credentials, or plaintext remote memory in logs, tests, commits, reports, or chat.
- `runtime/`, `secrets/`, `capabilities/`, logs, local tunnel credentials, and raw execution evidence remain ignored/unpublished runtime state.
- All source publication is non-force. Every accepted task checkpoint is committed and pushed, followed by fetch/readback equality.
- A stable claim requires exact identity: `candidate HEAD == origin/main == release sourceCommit == v0.7.0^{commit} == runtime source identity`; Codespace adds `connection.json.sourceCommit` to that equality.
- Unit/integration tests must never stop, reset, adopt, or mutate the real production Agent Core bundle unless the test explicitly runs inside a disposable isolated runtime root.
- Windows-only tests and Linux/Codespace-only tests must be classified explicitly; platform-inapplicable tests must be skipped by contract rather than fail because `/bin/bash`, `tmux`, or privileged symlink behavior is unavailable.
- Do not solve Windows lifecycle failures by increasing Vitest timeouts. The process tree, stream drain, scheduler settlement, or file-handle root cause must be proven first.
- Before any migration or remote-memory cutover, create a verified local backup and prove restore/hydration using an isolated copy.
- Private Memory Remote target is `Black-Project-Agent-Core/Agent-Core-Memory-Remote`, branch `main`; it must be private before first live checkpoint is pushed.
- Remote memory is encrypted before Git transport. The raw 32-byte key is file-backed under ignored `secrets/`; repository configuration stores only its path.
- Hard lifecycle rollout sequence is `advisory → canary enforce → live enforce`; never jump directly from current advisory state to global enforcement.
- Memory Observatory remains observer-only and is not a release blocker until core lifecycle/shared-memory gates are stable.

## Release Exit Gate

The plan is complete only when one exact candidate SHA passes Windows certification, Codespace certification, destructive recovery drills, remote-memory continuity, public MCP trust-boundary checks, package/release byte parity, and post-publication readback. Only then may the words **“Agent Core v0.7.0 Stable”** be used.

---

## Phase A — Restore trustworthy version and release identity
### Task 1: Advance development identity from v0.6.0 to v0.7.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/mcp/server.ts`, `CHANGELOG.md`.
- Test: `tests/mcp-integration.test.ts`, `tests/mcp-dual-era.test.ts`, `tests/release-package.test.ts`.

**Interfaces:**
- Produces one development version identity: `0.7.0` across package, lockfile, MCP server, User-Agent/version probes, and release tooling.
- Does not create the `v0.7.0` tag or publish artifacts.

- [ ] **Step 1:** Add/adjust a version-consistency test that expects package, lockfile, `SERVER_VERSION`, and MCP initialize response to all be `0.7.0`; run it before edits and require FAIL.
- [ ] **Step 2:** Change `package.json` and root package-lock version fields to `0.7.0`; change the server constant from `0.6.0` to `0.7.0`.
- [ ] **Step 3:** Move all post-v0.6.0 memory/lifecycle/shared-Codespace changes into the `## Unreleased` changelog section, grouped under Added/Changed/Fixed/Security. Do not call them stable yet.
- [ ] **Step 4:** Run `npm run build` and focused MCP/release version tests; require zero failures.
- [ ] **Step 5:** Launch an isolated runtime on a non-production port and require `/health.version == 0.7.0` plus MCP initialize `serverInfo.version == 0.7.0`.
- [ ] **Step 6:** Commit `chore: advance agent core development identity to 0.7.0`; push non-force; fetch and require local HEAD == `origin/main`.

**Exit gate:** No tracked core source after this task may still claim current development is v0.6.0 except historical changelog/stability references.

### Task 2: Make stable parity bind the running source to the release tag

**Files:**
- Modify: `scripts/release/check-stable-parity.mjs`, `scripts/release/certify-core.mjs`.
- Test: create `tests/stable-release-source-parity.test.ts`; update `tests/core-certification-contract.test.ts`.

**Interfaces:**
- `check-stable-parity.mjs` must return `headCommit`, `tagCommit`, `manifestSourceCommit`, and `sourceParity: true` only when all are equal.
- Postpublish `certify:core` must reject any release whose tag/assets exist but whose source commit differs from current HEAD.
- [ ] **Step 1:** Write a regression fixture where package version is `0.7.0`, GitHub release/tag metadata resolves, but test HEAD is intentionally one commit beyond the tag; require the parity checker to FAIL with `STABLE_SOURCE_COMMIT_MISMATCH`.
- [ ] **Step 2:** Extend the checker to resolve `git rev-parse HEAD`, `git rev-parse v0.7.0^{commit}`, and download/read `release-manifest.json.sourceCommit` from the actual release.
- [ ] **Step 3:** Require `HEAD === tagCommit === manifestSourceCommit`; preserve existing local/remote tag equality and required-asset checks.
- [ ] **Step 4:** Update `certify-core.mjs` report shape so `stableRelease` records `headCommit`, `tagCommit`, `manifestSourceCommit`, `sourceParity`, asset count, and release URL.
- [ ] **Step 5:** Add a positive fixture with exact equality and require PASS; run focused release tests.
- [ ] **Step 6:** Commit `fix: bind stable certification to exact release source`; push/fetch/readback.

**Exit gate:** The historical defect where a 95-commit-newer HEAD can reuse the old stable tag must be impossible by automated contract.

### Task 3: Make release-manifest identity independently verifiable

**Files:**
- Modify: `scripts/release/build-release.mjs`, `scripts/release/release-contract.mjs`, `scripts/release/check-release.mjs`.
- Test: `tests/release-package.test.ts`, `tests/quality-release-contract.test.ts`.

**Interfaces:**
- `release-manifest.json` must include exact `sourceCommit`, `sourceTree`, `version`, `tag`, channel, generated asset digests, and core tool-count/protocol contract expected from that source.

- [ ] **Step 1:** Add failing tests requiring `sourceTree = git rev-parse HEAD^{tree}` and sourceCommit equality with the package candidate.
- [ ] **Step 2:** Add `sourceTree`, `legacyMcpToolCount`, `modernMcpToolCount`, and supported protocol versions to the manifest without including credentials or runtime paths.
- [ ] **Step 3:** Update release check to reject package/server/manifest version disagreement and malformed source hashes.
- [ ] **Step 4:** Build a local release package twice from the same clean SHA; require identical source identity fields and independently reproducible SHA256 files.
- [ ] **Step 5:** Run `npm run package:release` and release-package tests; inspect archive listing for zero `runtime/`, `secrets/`, `.env`, or raw evidence.
- [ ] **Step 6:** Commit `build: strengthen stable release identity manifest`; push/fetch/readback.

### Task 4: Define explicit Windows vs Codespace certification suites

**Files:**
- Modify: `package.json`, `vitest.config.ts`, `scripts/release/core-certification-contract.mjs`.
- Create: `scripts/release/check-platform-test-contract.mjs`.
- Test: create `tests/platform-certification-contract.test.ts`.
**Interfaces:**
- Add `verify:windows`, `verify:codespace`, and `verify:core-portable`; `verify:release` composes the portable suite plus the suite native to the current release environment rather than executing impossible foreign-platform behavior.

- [ ] **Step 1:** Inventory tests that invoke `/bin/bash`, `tmux`, Codespaces port visibility, Linux symlink semantics, Windows tray/PowerShell, `taskkill.exe`, or Windows ACL behavior; encode that inventory in the platform contract script.
- [ ] **Step 2:** Write a failing contract test requiring every platform-specific test file to be declared exactly once as Windows-only, Codespace/Linux-only, or portable.
- [ ] **Step 3:** Implement explicit Vitest include/exclude projects or bounded wrapper scripts; do not hide failures with broad name-based exclusions.
- [ ] **Step 4:** On Windows, require `npm run verify:windows` to run portable + Windows-specific behavior and never attempt `/bin/bash`-dependent Codespace process tests.
- [ ] **Step 5:** In Codespace, require `npm run verify:codespace` to run portable + Linux/Codespace-specific behavior and skip Windows tray/ACL tests.
- [ ] **Step 6:** Keep a separate `verify:all-contracts` that statically proves both suites cover every required test even when one host cannot execute the other platform.
- [ ] **Step 7:** Commit `test: separate windows and codespace certification contracts`; push/fetch/readback.

**Exit gate:** Platform-inapplicable failures are eliminated by explicit ownership, while genuine platform regressions remain release blockers.

---

## Phase B — Make Windows lifecycle deterministic and test-isolated

### Task 5: Prevent test worktrees from touching the production Agent Core bundle

**Files:**
- Modify: `scripts/windows/agent-core-launcher.ps1`, `scripts/windows/agent-core-tray.ps1` only where isolation hooks are needed.
- Test: `tests/tray-manager.test.ts`, `tests/unified-launcher.test.ts`, `tests/tray-autostart.test.ts`.
- Create: `tests/windows-production-isolation.acceptance.test.ts`.

**Interfaces:**
- Every test bundle gets an explicit isolated identity containing root, ports, tray runtime directory, locator path, mutex name, process-signature namespace, and shutdown-request path.
- Production defaults remain unchanged when no test-isolation override is supplied.

- [ ] **Step 1:** Reproduce the audited bug: start a disposable “production sentinel” listener/process, run tray tests from a separate worktree, and require the sentinel to remain alive; preserve the initial FAIL as evidence.
- [ ] **Step 2:** Trace all machine-global identifiers used by controlled takeover, tray mutex, `%LOCALAPPDATA%\AgentCore\root.txt`, fixed ports 8765/8787, shutdown request, and service-state files.
- [ ] **Step 3:** Add bounded test-only overrides such as `AGENT_CORE_TEST_INSTANCE_ID`, `AGENT_CORE_TEST_LOCALAPPDATA`, `AGENT_CORE_PORT`, and `AGENT_CORE_TUNNEL_READY_PORT`; derive mutex/state/locator names from that identity.
- [ ] **Step 4:** Harden controlled takeover so it only adopts/stops a process whose executable, canonical entry path, configured root, port, and instance identity all agree.
- [ ] **Step 5:** Run tray/launcher tests while a real Agent Core production bundle is live; verify production PID, `/health`, memory counts, and tunnel PID do not change.
- [ ] **Step 6:** Repeat from a detached worktree and from the canonical root; require no cross-instance takeover.
- [ ] **Step 7:** Commit `fix: isolate windows lifecycle tests from production`; push/fetch/readback.

**Exit gate:** A test or audit worktree can never stop or adopt the real 8765 production Agent Core process.

### Task 6: Make Windows process-tree termination factual and bounded

**Files:**
- Modify: `src/runtime/process-governance.ts`.
- Test: `tests/process-governance.test.ts`, `tests/process-tools.test.ts`, `tests/execution-runner.test.ts`.

**Interfaces:**
- Extend `terminateManagedProcessTree(child, force?)` into a termination result contract that can distinguish `already_exited`, `terminated`, `forced`, and `termination_failed` without treating taskkill launch as proof of child death.

- [ ] **Step 1:** Add a Windows regression process that spawns a child which keeps an open working-directory/file handle; current termination must reproduce the EBUSY/timeout failure.
- [ ] **Step 2:** Add a helper that waits for factual child `close` after `taskkill /T`, with a short bounded grace period; if still alive, retry `/T /F` once.
- [ ] **Step 3:** Capture taskkill exit but determine success from process exit/close, not taskkill exit alone. Do not expose full command lines in error text.
- [ ] **Step 4:** Ensure POSIX behavior remains process-group SIGTERM→SIGKILL compatible and untouched by Windows-specific code.
- [ ] **Step 5:** Run process governance/tools tests 10 consecutive times on Windows; require zero leaked descendant PIDs and zero locked temp directories.
- [ ] **Step 6:** Commit `fix: make windows process-tree termination factual`; push/fetch/readback.

### Task 7: Make execution runner shutdown drain streams without hanging

**Files:**
- Modify: `src/execution/runner.ts`, optionally a focused helper under `src/execution/` if stream lifecycle needs separation.
- Test: `tests/execution-runner.test.ts`.

**Interfaces:**
- `ExecutionRunHandle.completion` must settle after factual process death and bounded stdout/stderr pipeline completion; output-limit, timeout, interrupt, and cancel states must never wait forever on a pipe owned by a terminated descendant.
- [ ] **Step 1:** Keep the two audited failing cases as regression tests: missing terminal marker interruption and output-flood termination; require them to fail before implementation.
- [ ] **Step 2:** Separate process termination completion from stream pipeline completion; explicitly destroy/end child stdout/stderr only after process-tree termination has been initiated and all readable bytes already emitted are accounted for.
- [ ] **Step 3:** Add a bounded stream-drain deadline used only after process death; if exceeded, finalize hashes for bytes actually persisted and record a deterministic governance error instead of hanging.
- [ ] **Step 4:** Preserve authority order: no terminal result marker may be written until process exit state, byte counts, stream hashes, and declared-artifact verification are factual.
- [ ] **Step 5:** Test normal success, non-zero exit, timeout, cancel, interrupt, output quota, child-process descendant, and zero-output commands on Windows.
- [ ] **Step 6:** Run `tests/execution-runner.test.ts` 20 repetitions with temp-root cleanup after every repetition.
- [ ] **Step 7:** Commit `fix: bound execution stream shutdown on windows`; push/fetch/readback.

### Task 8: Correct scheduler cancellation and graceful close semantics

**Files:**
- Modify: `src/execution/scheduler.ts`, `src/execution/service.ts` only if service-level state transition needs tightening.
- Test: `tests/execution-mcp.test.ts`, `tests/execution-unified-lifecycle.test.ts`, `tests/execution-scheduler.test.ts`.

**Interfaces:**
- `ExecutionScheduler.close()` must prevent new dispatch, interrupt every active handle, await factual settlement, persist terminal attempt/node/run state, then return.
- Node-specific cancel must not imply unrelated nodes remain running if they factually finish first; assertions must inspect ordering/event truth rather than race-prone wall-clock assumptions.

- [ ] **Step 1:** Instrument the existing cancellation regression with exact event sequence, node start/finish timestamps, terminate request timestamp, and scheduler active-map membership; reproduce current `B == succeeded` race.
- [ ] **Step 2:** Decide from evidence whether the defect is implementation ordering or an invalid test assumption. If B legitimately finishes before A cancel completes, fix the assertion to require “B was never terminated by A cancellation,” not “B must still be running.”
- [ ] **Step 3:** For true scheduler defects, serialize terminal-state handling per run so cancel/close cannot race duplicate state transitions.
- [ ] **Step 4:** Ensure `close()` waits for every `execution.settled` promise and no active handles remain before `ExecutionService` closes SQLite.
- [ ] **Step 5:** Re-run cancellation, scheduler, unified lifecycle, and execution recovery suites 10 times.
- [ ] **Step 6:** Commit `fix: stabilize execution cancellation and close ordering`; push/fetch/readback.

### Task 9: Eliminate Windows retention and temp-root EBUSY leaks

**Files:**
- Modify: `src/execution/retention.ts` and/or log/store lifecycle files only if evidence points there.
- Test: `tests/execution-retention.test.ts`, `tests/execution-backup-restore.test.ts`.

- [ ] **Step 1:** Reproduce the retention test with handle/process diagnostics before cleanup; identify the exact PID or open stream holding the fixture `work` directory.
- [ ] **Step 2:** Require active attempts to expose a factual runtime lease/handle until their terminal result marker is durable; retention planning must exclude any attempt whose runtime ownership is still active.
- [ ] **Step 3:** Ensure all read streams, write streams, workers, and SQLite clients used by retention planning/backup are closed before fixture cleanup.
- [ ] **Step 4:** Preserve dry-run immutability: apply may delete only unchanged candidates from the signed/hashed plan and must never widen the deletion set.
- [ ] **Step 5:** Run retention + backup/restore tests 20 repetitions and require `Remove-Item -Recurse`/Node `rm()` succeeds immediately after every test.
- [ ] **Step 6:** Commit `fix: release windows execution retention handles`; push/fetch/readback.

### Task 10: Make PowerShell operational scripts independent of machine execution policy

**Files:**
- Modify: call sites/tests for `scripts/prepare-agent-core-cutover.ps1` and other operator-owned PowerShell scripts.
- Test: `tests/cutover-scripts.test.ts`, `tests/unified-launcher.test.ts`.

**Interfaces:**
- Repository-owned PowerShell test invocations use `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ...` exactly as the production launcher does.

- [ ] **Step 1:** Preserve the audited failure where default machine policy blocks `prepare-agent-core-cutover.ps1`.
- [ ] **Step 2:** Change test/launcher invocation only; do not weaken system-wide PowerShell policy and do not set machine/user ExecutionPolicy.
- [ ] **Step 3:** Add a test proving the command line contains Bypass but no secrets or raw key values.
- [ ] **Step 4:** Run cutover scripts from a path containing spaces and from a relocated canonical root.
- [ ] **Step 5:** Commit `fix: make windows operator scripts policy-independent`; push/fetch/readback.

### Task 11: Certify Windows fresh-install, upgrade, restart, and rollback lifecycle

**Files:**
- Modify tests and operator docs as required; source changes only for defects discovered by the acceptance cases.
- Test/Create: `tests/windows-lifecycle.acceptance.test.ts` or a bounded PowerShell-driven acceptance harness.
- Update: `docs/windows-installation-cutover.md`.

- [ ] **Step 1:** Fresh-install case: clone canonical source into a disposable root, `npm ci`, build, create isolated Agent Core key state, launch, require health/MCP/tunnel readiness, then cleanly exit.
- [ ] **Step 2:** Upgrade case: start from a v0.6.0-format runtime/memory fixture, upgrade to current source, require verified pre-migration backup, schema v4 integrity, and identical semantic memory counts.
- [ ] **Step 3:** Restart case: kill only the owned MCP process, require tray watchdog recovery, same runtime root, same memory DB, same key metadata, and no foreign process termination.
- [ ] **Step 4:** Relocation case: move the project root, run launcher, require `%LOCALAPPDATA%\AgentCore\root.txt` and root-derived paths rebind without changing semantic state.
- [ ] **Step 5:** Rollback case: stop bundle, restore the pre-upgrade runtime backup in an isolated copy, prove rollback data integrity; never roll back the live production DB during automated tests.
- [ ] **Step 6:** Repeat the complete lifecycle matrix three times; require zero orphan PIDs, zero locked temp roots, clean Git source, and unchanged production state outside each disposable root.
- [ ] **Step 7:** Commit `test: certify windows lifecycle recovery matrix`; push/fetch/readback.

**Phase B exit gate:** `npm run verify:windows` passes repeatedly; all formerly observed execution/EBUSY/isolation failures have permanent regression coverage; production runtime survives test-suite execution.

---

## Phase C — Make memory posture observable and persistent on Windows

### Task 12: Expose safe memory runtime posture through status surfaces

**Files:**
- Modify: `src/memory/service.ts` or its status types, `src/mcp/server.ts`, `src/config.ts` as required.
- Test: `tests/mcp-memory.test.ts`, `tests/memory-unified-lifecycle.test.ts`, `tests/http-codespace-shared-memory.test.ts`.

**Interfaces:**
- Extend safe memory status with non-secret fields: `hardLifecycleMode`, `enforceHardGuardrails`, `principalConfigured`, `remote.enabled`, `remote.owner`, `remote.repo`, `remote.branch`, `remote.keyConfigured`, `remote.workRootConfigured`, and last verified remote generation/state when available.
- Never return principal raw value when it can be considered identity-sensitive; expose configured/hashed/bounded status only unless existing public contract already authorizes it.

- [ ] **Step 1:** Add a failing MCP status test requiring current defaults to report `hardLifecycleMode: advisory`, hard guardrail enforcement false, and remote disabled.
- [ ] **Step 2:** Add a configured fixture requiring remote enabled and keyConfigured true while asserting the serialized result does not contain key bytes, key-file contents, OAuth/GitHub token, or bearer text.
- [ ] **Step 3:** Reuse the same status provider for `/health` summary and `memory_status` so UI/operator tools cannot disagree on posture.
- [ ] **Step 4:** Run memory/MCP security tests and explicit secret-leak scan.
- [ ] **Step 5:** Commit `feat: expose safe memory runtime posture`; push/fetch/readback.

### Task 13: Persist memory runtime configuration through the Windows tray lifecycle

**Files:**
- Modify: `scripts/windows/agent-core-launcher.ps1`, `scripts/windows/agent-core-tray.ps1`.
- Create: `scripts/windows/memory-runtime-config.ps1` if parsing/validation exceeds one responsibility.
- Test: `tests/tray-manager.test.ts`, `tests/unified-launcher.test.ts`, create `tests/windows-memory-runtime-config.test.ts`.

**Interfaces:**
- Operator config file: ignored `runtime/data/memory-runtime.json` containing only non-secret posture and secret *paths*.
- Encryption material remains in ignored `secrets/memory-remote.key`; config stores `keyFile`, never key contents.
- [ ] **Step 1:** Add a failing launcher test showing current tray only propagates `AGENT_CORE_MEMORY_ENABLED` and `AGENT_CORE_MEMORY_DB_PATH`, losing remote/principal/lifecycle settings across background restart.
- [ ] **Step 2:** Define strict JSON schema/PowerShell validation for: `principalId`, `hardLifecycleMode`, `enforceHardGuardrails`, `remoteEnabled`, `remoteOwner`, `remoteRepo`, `remoteBranch`, `remoteKeyFile`, `remoteWorkRoot`.
- [ ] **Step 3:** Reject unknown fields, control characters, non-private-key-file paths outside approved ignored roots, invalid owner/repo/branch syntax, and remoteEnabled without required fields.
- [ ] **Step 4:** Have `Start-AgentCoreService` add the validated memory variables to `$envNames`/`$newValues` before `Start-Process`, then restore parent process environment exactly as it does today.
- [ ] **Step 5:** Add a restart acceptance proving the child retains memory posture after tray restart and Windows autostart shim execution.
- [ ] **Step 6:** Add a negative test proving raw key material accidentally placed in JSON causes startup failure rather than being forwarded.
- [ ] **Step 7:** Commit `feat: persist windows memory runtime posture`; push/fetch/readback.

### Task 14: Certify live local DMF migration and cognition activation without polluting production memory

**Files:**
- Test/Create: `tests/windows-live-memory-canary.acceptance.test.ts` or operator script under `scripts/acceptance/`.
- Update: `docs/deterministic-memory.md` with the live-canary procedure.

**Interfaces:**
- Canary uses a copied DB or isolated `AGENT_CORE_MEMORY_DB_PATH`, never writes synthetic test memories into the production 318-item database.

- [ ] **Step 1:** Snapshot production memory status: schema, active items, revisions, edges, FTS rows, logical-state hash, integrity, and backup path; never serialize memory values.
- [ ] **Step 2:** Copy the DB with the existing verified backup API, open the copy under a dedicated canary root, and require identical logical projection/hash.
- [ ] **Step 3:** On the canary only, execute one routed preflight→decision→postflight lifecycle and one `remember_more` history expansion.
- [ ] **Step 4:** Require `memory_write_decisions > 0`, `memory_recall_expansions > 0`, expected edge event records, integrity `ok`, and deterministic replay after restart.
- [ ] **Step 5:** Close/delete the canary root; re-read production DB counts/hash and require exact equality with Step 1.
- [ ] **Step 6:** Commit `test: certify isolated windows memory cognition canary`; push/fetch/readback.

**Phase C exit gate:** Windows launcher can persist and report memory posture; current production DMF remains unchanged while isolated cognition/hard-lifecycle machinery is proven operational.

---

## Phase D — Provision and certify Private Memory Remote
### Task 15: Provision the canonical private Memory Remote and encryption key

**External resource:** `Black-Project-Agent-Core/Agent-Core-Memory-Remote`, private, default branch `main`.

**Local files:**
- Create ignored: `secrets/memory-remote.key` containing exactly 32 raw random bytes or 64 hexadecimal characters accepted by `MemoryRemoteCrypto`.
- Create ignored after Task 13: `runtime/data/memory-runtime.json`.

- [ ] **Step 1:** Query GitHub for `Black-Project-Agent-Core/Agent-Core-Memory-Remote`. Current audit returned “repository not found/unresolvable”; treat either missing repo or missing authorization as a blocker until resolved.
- [ ] **Step 2:** If missing and the authenticated account has organization permission, create it with GitHub CLI as private with issues/wiki disabled; immediately read back `visibility == PRIVATE` before writing memory.
- [ ] **Step 3:** Generate key material directly to `secrets/memory-remote.key`; never print stdout containing the key. On Windows restrict ACL to the current operator/SYSTEM/Administrators as appropriate; in Codespace use mode 0600.
- [ ] **Step 4:** Run the existing crypto key parser against the file and require successful AES-256-GCM encrypt/decrypt of synthetic bytes plus rejection with a different key.
- [ ] **Step 5:** Populate non-secret config: owner `Black-Project-Agent-Core`, repo `Agent-Core-Memory-Remote`, branch `main`, keyFile absolute path, remote work root under `runtime/memory/remote`, stable principal ID, lifecycle `advisory`.
- [ ] **Step 6:** Run `git status --ignored` and release archive tests proving key/config runtime files are ignored and excluded.
- [ ] **Step 7:** Record only repo identity, key fingerprint/hash if an existing safe fingerprint function exists, and configuration posture in a bounded certification record appended to this plan; never record the raw key.
- [ ] **Step 8:** Commit the non-secret certification record as `ops: record private memory remote provisioning`; push/fetch/readback.

**Exit gate:** Private remote exists and is readable/writable by the authorized GitHub Fabric credential; encryption key exists only in ignored operator storage.

### Task 16: Push the first verified encrypted checkpoint from an isolated copy

**Files:** existing `src/memory/remote-sync.ts`, `remote-transport.ts`, `remote-crypto.ts`, `remote-journal.ts`; modify only if the live canary exposes a defect.
- Test: `tests/memory-remote-sync.test.ts`, `tests/memory-durability-boundary.test.ts`, create a live remote acceptance harness.

- [ ] **Step 1:** Create a verified backup/copy of the production DMF and compute its logical-state hash; this copy, not the live DB, is the first remote writer.
- [ ] **Step 2:** Configure isolated MemoryService with the canonical private remote and key; invoke the existing durability/checkpoint boundary.
- [ ] **Step 3:** Require encrypted object/manifest/journal files in the remote checkout and non-force Git push success.
- [ ] **Step 4:** Fetch/read back the remote commit through GitHub Fabric and require exact object hash, manifest logical-state hash, generation/predecessor rules, and remote HEAD equality.
- [ ] **Step 5:** Scan remote checkout bytes for known plaintext canary strings and selected production metadata strings; require zero plaintext semantic leakage.
- [ ] **Step 6:** Repeat one no-op checkpoint; require deterministic logical identity and no fabricated semantic generation.
- [ ] **Step 7:** Append a bounded non-secret checkpoint result to this plan and commit tracked harness/docs/source changes as `test: certify first encrypted memory remote checkpoint`; never commit the remote checkout or live memory payload. Push/fetch/readback.

### Task 17: Prove destructive local-loss recovery from the Private Memory Remote

**Files:** existing hydration/recovery code; modify only for demonstrated defects.
- Test: `tests/memory-remote-deletion-recovery.acceptance.test.ts`, `tests/memory-remote-hydration.test.ts` plus live private-remote acceptance.

- [ ] **Step 1:** Record the isolated source DB logical hash, schema version, memory/revision/edge/FTS counts, and remote generation.
- [ ] **Step 2:** Stop the isolated MemoryService and delete its local DB, WAL, SHM, and isolated remote work checkout; preserve only config/key and GitHub remote.
- [ ] **Step 3:** Invoke hydration into a fresh destination; require authenticated fetch, decrypt, plaintext hash verification, SQLite integrity, schema migration if needed, and atomic install.
- [ ] **Step 4:** Require exact logical-state hash and semantic count equality with Step 1; old service-lifetime leases must not survive hydration.
- [ ] **Step 5:** Corrupt ciphertext/auth tag in a disposable remote clone and prove hydration fails closed without replacing the local destination.
- [ ] **Step 6:** Test wrong key, missing manifest, concurrent generation mismatch, and remote branch missing; each must produce a bounded deterministic error and no invented memory.
- [ ] **Step 7:** Restore remote clone to the valid head and run hydration again; require PASS.
- [ ] **Step 8:** Append the bounded recovery drill evidence to this plan and commit `docs: record memory remote recovery drill`; push/fetch/readback.

**Exit gate:** Complete loss of local memory storage is recoverable exactly from encrypted remote truth, while corrupt/unauthorized remote state cannot become local authority.

### Task 18: Enable Private Memory Remote on the live Windows Agent Core in advisory mode

**Files:** ignored runtime config only unless defects are found; source changes require their own regression test.

- [ ] **Step 1:** Create a fresh verified production memory backup and record production logical-state hash/counts before cutover.
- [ ] **Step 2:** Update `runtime/data/memory-runtime.json` to remote enabled, canonical owner/repo/branch/key path/stable principal, lifecycle `advisory`, hard guardrails false.
- [ ] **Step 3:** Restart through the canonical tray launcher; never start a second manual `node dist/index.js` authority.
- [ ] **Step 4:** Require `memory_status` to report local health/integrity plus remote enabled/configured posture; require `/health` and MCP auth remain healthy.
- [ ] **Step 5:** Perform one meaningful but low-risk operator checkpoint through normal Agent Core flow; require local decision/postflight truth then verified non-force remote durability.
- [ ] **Step 6:** Restart Windows Agent Core again and require same principal scope, same logical memory truth, remote state reconstructed, and no duplicate decisions.
- [ ] **Step 7:** Compare production memory counts/hash to expected post-checkpoint state and inspect `memory_remote_state`/durability receipts for non-zero verified activity.
- [ ] **Step 8:** Append a non-secret live advisory certification record to this plan and commit `docs: record windows memory remote advisory cutover`; push/fetch/readback.

**Phase D exit gate:** Live Windows Agent Core uses Private Memory Remote durably in advisory mode with no plaintext leakage and verified restart recovery.

---

## Phase E — Certify one memory authority across Windows PC and GitHub Codespaces
### Task 19: Introduce a stable logical memory project identity across host paths

**Files:**
- Modify: `src/config.ts`, `src/mcp/project-scope.ts`, `src/mcp/memory-lifecycle-guard.ts`, `src/memory/codespace-shared-memory.ts`.
- Test: `tests/project-scope-routing.test.ts`, `tests/memory-principal-scope.test.ts`, `tests/codespace-shared-memory-cross-session.acceptance.test.ts`, `tests/codespace-shared-memory-service.test.ts`.

**Interfaces:**
- Add optional `memory.projectId` from `AGENT_CORE_MEMORY_PROJECT_ID`.
- Add `persistentMemoryProjectId(runtime, workspaceProjectId): string` in `src/mcp/project-scope.ts`.
- For safety, configured global memory project ID is valid only when the runtime has exactly one allowed workspace root; multi-root runtimes must keep existing path-scoped behavior unless a future explicit per-root map is designed.
- Canonical Agent Core logical ID for this deployment: `github:Black-Project-Agent-Core/Agent-Core`.

- [ ] **Step 1:** Add a red regression: two fresh roots with the same stable principal and hydrated logical memory currently fail to recall the same item because `projectId` is the physical path.
- [ ] **Step 2:** Parse/validate `AGENT_CORE_MEMORY_PROJECT_ID` as a bounded printable identifier; reject it at startup if more than one allowed root exists.
- [ ] **Step 3:** Route every semantic memory scope through `persistentMemoryProjectId`; do not change filesystem route/project isolation, which remains physical-root based.
- [ ] **Step 4:** Update `CodespaceSharedMemoryService.scope()` to use stable logical memory project identity while still validating `workspaceRoot` through `WorkspacePolicy` before accepting the request.
- [ ] **Step 5:** Keep current path-based project IDs when the new setting is absent; rerun cross-project contamination tests to prove no compatibility regression.
- [ ] **Step 6:** Re-run the previously failing cross-session acceptance on Windows and Codespace; require the same memory ID to be recalled after fresh-root hydration.
- [ ] **Step 7:** Commit `fix: stabilize memory project identity across hosts`; push/fetch/readback.

### Task 20: Unify Codespace hydration/bootstrap configuration with the stable memory identity

**Files:**
- Modify: `scripts/codespace/memory-hydration-gate.sh`, `scripts/codespace/common.sh`, `scripts/codespace/bootstrap.sh`, `scripts/codespace/ensure-running.sh` as required.
- Modify: `plugin/codespace/src/shared-memory.ts` only if environment forwarding requires it.
- Test: `tests/codespace-memory-hydration.test.ts`, `plugin/codespace/tests/memory-startup-exec.test.ts`, `plugin/codespace/tests/memory-startup-contract.test.ts`.

- [ ] **Step 1:** Replace physical `/workspaces/Agent-Core` as semantic remote scope with `AGENT_CORE_MEMORY_PROJECT_ID=github:Black-Project-Agent-Core/Agent-Core`; keep physical root only for workspace containment.
- [ ] **Step 2:** Preserve backward compatibility for `AGENT_CORE_MEMORY_REMOTE_PROJECT_ID` for one release if tests/operator config still rely on it; emit no secret-bearing warning.
- [ ] **Step 3:** Require bootstrap to restore key file mode 0600, validate private remote identity, hydrate before mutation readiness, then launch shared-memory lease authority.
- [ ] **Step 4:** Fail closed if remote may contain memory but hydration/auth/integrity fails; a local empty DB must never silently replace remote truth.
- [ ] **Step 5:** Run shell tests in actual Codespace/Linux only; Windows static contract still verifies script ordering and required variables.
- [ ] **Step 6:** Commit `fix: bind codespace hydration to stable memory project identity`; push/fetch/readback.
### Task 21: Certify PC → Remote → fresh Codespace → Remote → PC continuity

**Files:**
- Test: extend `tests/codespace-shared-memory-cross-session.acceptance.test.ts` for platform-neutral logical identity.
- Create: `scripts/acceptance/shared-memory-live-canary.mjs` if a live orchestration harness is needed.

**Interfaces:**
- One stable scope: principal configured by operator + project `github:Black-Project-Agent-Core/Agent-Core`.
- One durability authority: encrypted Private Memory Remote `Black-Project-Agent-Core/Agent-Core-Memory-Remote`.

- [ ] **Step 1:** On Windows, record a unique canary decision through normal memory lifecycle and complete its terminal checkpoint; require `REMOTE_SYNCED` with generation/logical hash.
- [ ] **Step 2:** Stop any competing writer before starting fresh Codespace; never run two concurrent writers against the same remote generation during this certification.
- [ ] **Step 3:** In a fresh/rebuilt Codespace with no local memory DB, hydrate from remote and require exact logical hash, canary memory ID, revision ID, and continuity frontier.
- [ ] **Step 4:** Open a shared memory context through the Codespace MCP surface; require the canary in `memorySummary`/search and verify principal ID is not leaked in the bridge projection.
- [ ] **Step 5:** Complete one Codespace decision/checkpoint, sync non-force, and record the new remote generation.
- [ ] **Step 6:** Stop Codespace writer; restart Windows Agent Core, hydrate/reconcile remote, and require the Codespace-created memory/decision is visible under the same logical scope.
- [ ] **Step 7:** Require zero duplicate semantic memories, exact revision lineage, no open conflict unless intentionally generated, and deterministic logical hash after a second restart.
- [ ] **Step 8:** Append bounded round-trip evidence to this plan and commit harness/tests/docs as `test: certify pc codespace memory round trip`; push/fetch/readback.

### Task 22: Certify key rotation, service-lifetime lease invalidation, and writer concurrency

**Files:** existing remote/lease code; modify only with a failing regression.
- Test: `tests/codespace-memory-context-lease.acceptance.test.ts`, `tests/memory-remote-concurrency.test.ts`, `tests/codespace-shared-memory-cross-session.acceptance.test.ts`.

- [ ] **Step 1:** Issue a valid opaque memory context lease, then restart Agent Core/service lifetime; require the old lease is rejected while persisted memory truth remains unchanged.
- [ ] **Step 2:** Rotate the Agent Core API/auth key while keeping the configured stable memory principal; require memory scope continuity and old authentication key rejection.
- [ ] **Step 3:** Perform Memory Remote encryption-key rotation only through an explicit re-encryption migration plan: decrypt verified current generation with old key, write a newly encrypted generation with new key, verify remote readback, then retire old key. Never overwrite remote with an unverified new key.
- [ ] **Step 4:** Simulate two writers from the same predecessor with different logical hashes; require transport refuses merge/force push and reports a concurrency conflict.
- [ ] **Step 5:** Resolve concurrency by hydrating latest remote truth and re-applying the intended semantic change through normal memory policy; require a new non-force generation.
- [ ] **Step 6:** Commit `test: certify shared memory rotation and concurrency`; push/fetch/readback.

### Task 23: Promote hard memory lifecycle from advisory to enforced canary

**Files:** ignored runtime config first; source only for proven defects.
- Test: `tests/mcp-memory-hard-lifecycle.test.ts`, `tests/memory-hard-lifecycle-recovery.test.ts`, `tests/http-memory-context-lease.test.ts`, Codespace lease acceptance suites.
- [ ] **Step 1:** On isolated canary config, set `hardLifecycleMode=enforce` while keeping production Windows live runtime advisory; run representative read-only operations and require they remain ungated.
- [ ] **Step 2:** Attempt a meaningful filesystem mutation without preflight/lease; require rejection before filesystem side effect.
- [ ] **Step 3:** Open a valid context, use its opaque lease for one meaningful mutation, then require lifecycle moves to `POSTFLIGHT_PENDING` and blocks same-objective continuation until checkpoint reconciliation.
- [ ] **Step 4:** Complete checkpoint with explicit evidence/decision/frontier; require local closure and, when remote enabled, `DURABLY_CLOSED` only after verified remote synchronization.
- [ ] **Step 5:** Kill/restart between mutation and postflight; require recovery surfaces pending reconciliation rather than inventing completion.
- [ ] **Step 6:** Run the same canary through Codespace shared-memory tools and direct Agent Core MCP tools; enforcement semantics must agree.
- [ ] **Step 7:** After a clean canary soak, set live Windows and Codespace runtime config to `enforce`; keep a documented one-change rollback to `advisory` that does not alter memory truth.
- [ ] **Step 8:** Enable `AGENT_CORE_MEMORY_ENFORCE_HARD_GUARDRAILS=true` only after hard lifecycle enforcement is already stable; prove matching hard guardrail blocks before mutation/execution persistence.
- [ ] **Step 9:** Commit any source/test changes as `feat: enforce certified memory lifecycle`; push/fetch/readback.

### Task 24: Re-certify zero-touch Codespace self-healing with shared memory enabled

**Files:** `scripts/codespace/common.sh`, `bootstrap.sh`, `ensure-running.sh`, `plugin/codespace/src/watchdog.ts`/scripts only for demonstrated defects.
- Test: Codespace watchdog/lifecycle tests, `tests/codespace-public-readiness-recovery.test.ts`, `tests/codespace-port-visibility-recovery.test.ts`, live fault injection.

- [ ] **Step 1:** Start a configured Codespace from stopped state; require source sync, dependency/build, memory hydration, local Agent Core readiness, shared-memory authority, tunnel registration, public OAuth/MCP readiness, and watchdog supervision.
- [ ] **Step 2:** Kill the loopback MCP process; require watchdog/attach repair restores it without user-entered credentials and without reinitializing memory authority.
- [ ] **Step 3:** Kill the tunnel process; require forced reconnect restores exact fixed tunnel identity and public MCP front door.
- [ ] **Step 4:** Simulate three fresh internal 502 events; require one sanitized repair trigger and no secret leakage.
- [ ] **Step 5:** Make forwarded port 8765 private; require bounded re-publication logic verifies GitHub visibility after mutation.
- [ ] **Step 6:** Restart/rebuild the Codespace container with local memory absent; require fail-closed hydration from Private Memory Remote before mutation readiness.
- [ ] **Step 7:** Break Memory Remote auth/key deliberately in an isolated canary; require startup refuses enforce-mode mutation readiness rather than creating empty truth.
- [ ] **Step 8:** Restore valid credentials; require automatic recovery and exact remote logical hash.
- [ ] **Step 9:** Run `npm run benchmark:codespace-memory`; require p95 shared-memory operation target <50 ms and no duplicate SSE/events if observability stream exists.
- [ ] **Step 10:** Commit `test: recertify codespace shared-memory self healing`; push/fetch/readback.

**Phase E exit gate:** Windows PC and fresh Codespace demonstrate the same logical memory scope, durable encrypted remote truth, enforced lifecycle, old-lease rejection, bounded writer conflicts, and zero-touch bridge recovery.
---

## Phase F — Rebuild certification around the v0.7.0 architecture

### Task 25: Expand the core certification matrix for the new release contract

**Files:**
- Modify: `scripts/release/core-certification-contract.mjs`, `scripts/release/check-core-certification.mjs`, `scripts/release/certify-core.mjs`.
- Test: `tests/core-certification-contract.test.ts`.

**Interfaces:**
- Expand the current 18-area matrix to 22 areas by adding explicit entries for `windows_lifecycle_isolation`, `memory_remote_durability`, `cross_host_memory_continuity`, and `codespace_zero_touch_recovery`.
- Existing `release_parity` now includes exact HEAD/tag/manifest source identity from Task 2.

- [ ] **Step 1:** Change the contract test first to expect exactly 22 unique areas and tracked evidence for every entry; require FAIL against the old 18-area contract.
- [ ] **Step 2:** Map Windows lifecycle evidence to the new isolation/lifecycle acceptance tests, not generic launcher unit tests alone.
- [ ] **Step 3:** Map Memory Remote durability to crypto/sync/hydration/deletion-recovery/live acceptance evidence.
- [ ] **Step 4:** Map cross-host continuity to stable project identity, shared-memory cross-session, lease, key-rotation, and PC↔Codespace live-canary evidence.
- [ ] **Step 5:** Map Codespace zero-touch recovery to hydration-before-readiness, watchdog, public readiness, port visibility, tunnel recovery, and fresh-container acceptance.
- [ ] **Step 6:** Update certification JSON schema/version so old 18-area reports cannot be mistaken for v0.7 reports.
- [ ] **Step 7:** Run contract checker and secret scan; require 22/22 evidence paths tracked and zero forbidden dependency/source-marker hits.
- [ ] **Step 8:** Commit `test: expand v0.7 core certification matrix`; push/fetch/readback.

### Task 26: Run the complete Windows prepublication certification on one clean candidate SHA

**Candidate rule:** Stop merging unrelated work once this task begins. If HEAD changes, certification restarts from the beginning.

- [ ] **Step 1:** Fetch origin; require branch `main`, tracked clean, no staged changes, `HEAD == origin/main`, submodules at recorded SHAs, runtime health known.
- [ ] **Step 2:** Record candidate SHA/tree and run `npm ci` from the exact candidate.
- [ ] **Step 3:** Run `npm run verify:windows`; require zero failures and zero production-runtime side effects.
- [ ] **Step 4:** Run `npm run quality:gate`; require gate PASS and memory contamination metrics exactly zero.
- [ ] **Step 5:** Run `node scripts/benchmark-memory.mjs --count=100000 --samples=5 --warmup=2 --target-p95-ms=150`; require PASS.
- [ ] **Step 6:** Run `node scripts/benchmark-execution.mjs --samples=20 --warmup=3`; require DAG <50 ms, dispatch <100 ms, wake <250 ms, concurrency within configured max.
- [ ] **Step 7:** Run isolated Windows lifecycle, memory remote recovery, and live advisory/enforce canaries; require all exit gates from Phases B-D.
- [ ] **Step 8:** Run `npm run certify:core:prepublish`; require 22/22 and sourceCommit equal to candidate SHA.
- [ ] **Step 9:** Save a bounded certification report under `runtime/` or another ignored evidence path; do not commit machine paths/secrets.
- [ ] **Step 10:** Do not create any tracked commit after certification begins. If a fix or tracked documentation change is required, invalidate the candidate, return to the owning task, commit there, and restart Task 26 from Step 1.

**Exit gate:** One Windows candidate SHA is fully green with no skipped Windows release blocker.
### Task 27: Run the complete Codespace prepublication certification on the same SHA

- [ ] **Step 1:** Read the exact 40-hex candidate SHA captured by Task 26 Step 2, create/resume one Codespace from that commit, and require both `HEAD` and `origin/main` to equal that recorded SHA after lifecycle source sync.
- [ ] **Step 2:** Require Memory Remote hydration before mutation readiness and `connection.json.sourceCommit`/sourceVersion equal candidate/0.7.0.
- [ ] **Step 3:** Run `npm ci` and `npm run verify:codespace`; require zero failures.
- [ ] **Step 4:** Run shared-memory benchmark, remote deletion recovery, fresh-Codespace hydration, enforce lease acceptance, watchdog/tunnel/port fault injection, and public readiness canary.
- [ ] **Step 5:** Query public `/health`/OAuth/MCP trust boundary using only bounded test credentials; public health as designed, detailed metrics denied remotely, authenticated MCP succeeds, invalid/old key fails.
- [ ] **Step 6:** Require memory logical hash/remote generation and stable project ID equal the Windows certified state after all synchronized writes are closed.
- [ ] **Step 7:** Run `npm run certify:core:prepublish` in Codespace if the certification contract is platform-composable; otherwise run its portable+Codespace component and attach evidence to the Windows report.
- [ ] **Step 8:** If any source commit changes during repair, invalidate both Windows and Codespace certification and restart Tasks 26-27.
- [ ] **Step 9:** Do not create a tracked commit in this certification task; its accepted checkpoint is the exact candidate SHA plus ignored/bounded evidence.

### Task 28: Freeze release content and convert Unreleased into v0.7.0 release notes

**Files:**
- Modify: `CHANGELOG.md`, `docs/stability.md`, relevant operator docs.
- No core behavior change is allowed in this task except documentation/release metadata.

- [ ] **Step 1:** Resolve the UTC release date with `node -e "console.log(new Date().toISOString().slice(0,10))"`; if it emits `2026-09-03`, the heading must be exactly `## [0.7.0] - 2026-09-03 - Stable`. Use the actual emitted date, only after Tasks 26-27 pass.
- [ ] **Step 2:** Document exact candidate SHA, 22/22 matrix, Windows/Codespace test counts, memory/execution p95, remote recovery, PC↔Codespace continuity, and zero-touch fault-injection evidence.
- [ ] **Step 3:** Explicitly state that v0.6.0 stable remains historical at `5c19c0535042174a0f9d9a8ff7dd5eeb5c23b087` and v0.7.0 includes post-v0.6.0 Memory Nervous System/shared-memory evolution.
- [ ] **Step 4:** Run doc link check, brand scan, release package test, and source diff review; require only intended release-doc changes since certified candidate. If docs modify source-generated identities, recertify.
- [ ] **Step 5:** Commit `docs: prepare agent core v0.7.0 stable release`; push/fetch/readback and define this new docs commit as the final release candidate.
- [ ] **Step 6:** Because candidate SHA changed for release docs, rerun the complete deterministic prepublish certification on the final release-doc SHA before tagging.

### Task 29: Publish v0.7.0 as an immutable exact-SHA stable release

- [ ] **Step 1:** On final clean candidate, require `npm run certify:core:prepublish` PASS / 22 of 22 and all performance/recovery gates PASS.
- [ ] **Step 2:** Run `npm run package:release`; independently verify local `release-manifest.json.sourceCommit` and `sourceTree` equal final candidate.
- [ ] **Step 3:** Create annotated tag `v0.7.0` on the exact final candidate; push tag non-force and read back `refs/tags/v0.7.0^{}` from origin.
- [ ] **Step 4:** Create the GitHub Release for tag `v0.7.0` as a draft, upload the complete version-matched asset set and SHA256SUMS, and verify every uploaded digest/readback while it is still non-public.
- [ ] **Step 5:** Publish `@black-project-agent-core/agent-core-plugin@0.7.0` to GitHub Packages with `stable` dist-tag using file-backed Packages credentials only.
- [ ] **Step 6:** Download/read back every draft GitHub Release asset; require byte-for-byte SHA256 parity with local release outputs, then publish the release as non-draft/non-prerelease only after this parity passes.
- [ ] **Step 6A:** Read back GitHub Packages metadata after publication and require package version `0.7.0` plus `stable` dist-tag resolve to the published artifact; package/release disagreement blocks stable completion.
- [ ] **Step 7:** Run `npm run verify:stable-parity`; require `HEAD == tagCommit == manifestSourceCommit` and all required assets present.
- [ ] **Step 8:** Run postpublish `npm run certify:core`; require sourceCommit/tag/manifest equality and 22/22 PASS.
- [ ] **Step 8A:** Do not create any tracked commit in this publication task after the immutable tag exists; any source fix requires a new versioned release rather than moving `v0.7.0`.
- [ ] **Step 9:** Update the live Windows canonical root from the exact tagged source only if it is not already that SHA; restart via tray and require `/health.version=0.7.0`, source identity, memory integrity, remote durability, and execution health.
- [ ] **Step 10:** Rebuild/resume Codespace from the exact tagged source; require `connection.json.sourceCommit == v0.7.0^{commit}`, public MCP readiness, shared-memory continuity, and zero manual key/tunnel entry.

### Task 30: Post-release soak, rollback proof, and final stable declaration

- [ ] **Step 1:** Keep the pre-v0.7 Windows source/runtime backup and pre-release memory backup untouched through the soak; do not delete v0.6-era rollback material yet.
- [ ] **Step 2:** Perform repeated Windows tray restart, MCP restart, tunnel restart, normal memory recall, one meaningful checkpoint, execution DAG, and remote sync; require no state drift or duplicate memory.
- [ ] **Step 3:** Suspend/resume Codespace and repeat hydration/readiness/shared-memory checks from an empty local memory state.
- [ ] **Step 4:** Verify GitHub Release remains non-draft/non-prerelease, tag immutable, package `stable` resolves 0.7.0, and asset digests remain unchanged.
- [ ] **Step 5:** Run a rollback rehearsal in an isolated copy using pre-release backups; prove the documented rollback works without touching live v0.7 truth.
- [ ] **Step 6:** Inspect audit journal integrity, remote memory journal lineage, open conflicts, pending postflights, interrupted continuity turns, active execution runs, and orphan process count; all release-blocking states must be zero or explicitly explained.
- [ ] **Step 7:** Run final `git fetch`; require `HEAD == origin/main == v0.7.0^{commit}` on the stable checkout and no tracked modifications.
- [ ] **Step 8:** Do not mutate tracked source after the tag. Update the GitHub Release body and ignored/operator certification evidence with the final phrase `Agent Core v0.7.0 - STABLE`, exact SHA, 22/22 gates, platform evidence, and known non-blocking limitations. `docs/stability.md` must already contain the prepublication exact-SHA evidence from Task 28.
- [ ] **Step 9:** Require final `git status` clean and `HEAD == origin/main == v0.7.0^{commit}`. Any tracked correction discovered now becomes a separately versioned follow-up; never move the immutable v0.7.0 tag.

**Phase F exit gate:** The stable label describes the exact binary/source deployed on Windows and Codespace, not merely a version string or historical release asset.

---

## Phase G — Post-stable frontier: Memory Observatory shadow mode

This phase is intentionally **not a v0.7.0 release blocker**. Start it only after Phase F is stable so observability cannot hide or become coupled to memory authority.

### Task 31: Reconstruct the Memory Observatory shadow-mode specification against the certified v0.7 source

**Files:**
- Create a fresh roadmap/spec under `docs/roadmap/` because no active Observatory roadmap file exists in the current compact documentation tree.
- Basis: `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`, live audit/event schemas, memory/continuity/execution services.

- [ ] **Step 1:** Inventory factual observable events already emitted by memory, continuity, execution, routing, GitHub, and Codespace shared-memory paths; do not invent hidden chain-of-thought events.
- [ ] **Step 2:** Define an observer-only projection and exact loopback API/SSE contract; UI failure must never block DMF/MCP/execution/remote sync.
- [ ] **Step 3:** Define shadow ports separate from production and prohibit automatic public exposure of Observatory.
- [ ] **Step 4:** Define performance gates: instrumentation overhead <=10%, persisted event→visible p95 <250 ms, mutation→graph convergence p95 <500 ms, duplicate SSE events 0, undetected gaps 0, observer-caused memory failures 0.
- [ ] **Step 5:** Self-review the refreshed spec for placeholders, authority duplication, hidden-chain-of-thought claims, unsafe public exposure, and performance ambiguity; fix all findings inline.
- [ ] **Step 6:** Commit the spec as `docs: refresh memory observatory shadow mode design`; push/fetch/readback.
- [ ] **Step 7:** Require user review/approval of the committed Observatory spec before any implementation task begins.
---

## Mandatory Execution Order and Dependencies

```text
Task 1  version identity
  ↓
Tasks 2-4  release/certification foundation
  ↓
Tasks 5-11 Windows lifecycle stabilization
  ↓
Tasks 12-14 memory posture + isolated cognition proof
  ↓
Tasks 15-18 Private Memory Remote provisioning + live advisory
  ↓
Tasks 19-24 stable project identity + PC/Codespace continuity + enforce + self-heal
  ↓
Tasks 25-27 22-area certification on one exact SHA
  ↓
Task 28 release freeze; then recertify final docs SHA
  ↓
Tasks 29-30 immutable publication + soak
  ↓
Task 31 Observatory design refresh
```

Do not parallelize tasks that mutate the same lifecycle authority. Safe parallelism is limited to read-only investigation, independent test-fixture preparation, and documentation review. Memory Remote live writer tests must serialize writers unless the task specifically tests concurrency rejection.

## Per-Task Git Discipline

For every accepted task:

```bash
git fetch origin
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
# require no unrelated tracked changes before implementation
git add -- the exact files listed in the task's **Files** block
git commit -m "use the exact commit subject specified by that task"
git push origin HEAD:main
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
# require equality
```

Never force-push. Preserve unrelated `.vscode/`/operator state. If `origin/main` moves during a task, fetch and reconcile explicitly before publication; do not reset away concurrent accepted work.
## Standard TDD / Debug Loop for Every Defect Task

1. Reproduce the observed failure with one focused test or acceptance harness.
2. Run the focused test before source edits and retain the exact failure mode in task evidence.
3. Trace component boundaries until the failing ownership layer is known; do not patch the caller to mask a lower-level lifecycle defect.
4. Implement the smallest source change that corrects the factual contract.
5. Run the focused test until green.
6. Run adjacent subsystem tests.
7. Run the platform suite owning the behavior.
8. Inspect for leaked PID, file handle, temp directory, secret text, source diff, and unexpected runtime mutation.
9. Commit only after fresh verification output is green.

## Standard Verification Commands

```text
Root build:                 npm run build
Memory focused suite:       npx vitest run tests/memory-*.test.ts
Memory quality:             npm run quality:gate
Memory 100k:                node scripts/benchmark-memory.mjs --count=100000 --samples=5 --warmup=2 --target-p95-ms=150
Execution benchmark:        node scripts/benchmark-execution.mjs --samples=20 --warmup=3
Release package:            npm run package:release
Stable source parity:       npm run verify:stable-parity
Core prepublish:            npm run certify:core:prepublish
Core postpublish:           npm run certify:core
Windows platform gate:      npm run verify:windows       (created by Task 4)
Codespace platform gate:    npm run verify:codespace     (created by Task 4)
```

Do not use the historical mixed-platform `npm run verify` result by itself as a stable decision after Task 4; the explicit platform gates become authoritative for platform behavior while portable contract coverage remains mandatory.

## Hard Stop Conditions

Stop the current phase and do not proceed to the next when any of these occur:

- Production memory logical hash changes unexpectedly during an isolated test.
- A test worktree stops/adopts the real production process.
- Memory Remote repository is public or its visibility cannot be verified.
- Raw encryption/API/OAuth/tunnel credentials appear in stdout, audit records, Git diff, release archives, or remote memory Git history.
- Remote hydration cannot prove exact logical-state equality.
- A concurrent writer requires force push or transport-level merge to continue.
- Windows or Codespace release-blocking tests remain red.
- Candidate HEAD changes after certification starts.
- Release tag/manifest/source commit differ.
- Public trust-boundary behavior differs from the documented contract.

When a stop condition occurs, return to the owning task, gather root-cause evidence, add a regression test, and recertify downstream dependent tasks.
## Final Stable Acceptance Matrix

| Area | Required final evidence |
|---|---|
| Source identity | clean `main`; local HEAD == origin/main == annotated v0.7.0 tag commit == manifest sourceCommit/tree |
| Windows lifecycle | fresh install, upgrade, restart, relocation, controlled takeover, autostart, rollback rehearsal PASS; zero production-test cross-talk |
| Process governance | timeout/cancel/interrupt/output-limit terminate factual process tree; zero leaked descendants/locked fixture roots |
| Authentication | Agent Core key + OAuth flows PASS; old/revoked credentials fail; no raw secret persistence |
| MCP | legacy and modern supported protocol paths expose the exact version-matched tool surface |
| DMF | SQLite integrity/FK/revision/edge/FTS parity PASS; no orphan graph state |
| Cognition | write-decision, recall-expansion, edge-event, remember-more, revision/branch/conflict policy acceptance PASS |
| Continuity | resume/frontier/checkpoint/restart behavior deterministic and principal/project isolated |
| Execution | DAG, retry, cancel, recovery, evidence, retention, backup/restore, graceful close PASS on Windows |
| Memory Remote | private repo, AES-256-GCM, non-force sync, encrypted readback, deletion recovery, concurrency rejection PASS |
| Shared memory | same stable principal/project across Windows and fresh Codespace; PC→Codespace→PC round trip PASS |
| Hard lifecycle | enforce-mode preflight/lease/postflight/durable-close semantics PASS; advisory rollback preserved |
| Codespace | source sync, hydration gate, loopback MCP, fixed tunnel, public port, OAuth/MCP readiness, watchdog recovery PASS |
| Performance | memory 100k p95 <150 ms; execution DAG <50 ms, dispatch <100 ms, wake <250 ms; shared Codespace memory p95 <50 ms |
| Release | version-matched ZIP/TGZ/manifest/checksums/package assets; GitHub byte parity PASS |
| Security | zero external AI/model dependency violations; zero release secret/runtime leakage; public detailed metrics denied |
| Audit | audit journal verify PASS; remote generation lineage valid; release evidence references exact candidate SHA |

## Deferred Cleanup After Stable Soak

Do not delete `E:\Projects\Agent-Core.__legacy-20260902-151407`, pre-v0.7 memory backups, or prior release artifacts during implementation. After v0.7.0 has passed the post-release soak and rollback rehearsal, create a separate cleanup task that inventories each backup, confirms it is no longer the only recovery source, and requires explicit operator approval before deletion.

## Recommended First Execution Batch

Start with Tasks **1 → 5** only. They resolve the identity/certification/test-isolation foundation. Do not activate Memory Remote or hard enforcement until the Windows lifecycle gate is trustworthy; otherwise a lifecycle test can again stop the production bundle while remote durability is active, making failure analysis much harder.

## Intended final state

```text
Agent Core v0.7.0 Stable
  ├─ exact immutable source/release identity
  ├─ deterministic Windows lifecycle
  ├─ one local DMF authority
  ├─ encrypted Private Memory Remote durability
  ├─ stable logical principal + project identity
  ├─ Windows ↔ Codespace shared memory
  ├─ enforced preflight / lease / postflight lifecycle
  ├─ zero-touch Codespace recovery
  ├─ cross-platform certification on one exact SHA
  └─ Memory Observatory remains observer-only post-stable frontier
```
