# Agent Core Wave G Core Re-Certification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and execute one repository-owned core certification authority that proves the complete Waves A–F Agent Core control plane as one coherent stable architecture.

**Architecture:** Wave G adds no runtime subsystem. A data-only certification contract maps the exact 18 roadmap matrix areas to evidence; a deterministic checker validates that contract and the no-external-model policy; a local orchestrator then runs release verification, 100k memory performance, execution performance, and stable-release parity before emitting one bounded certification report. Live Codespace runtime/public checks remain the post-publication environment gate.

**Tech Stack:** Node.js 24, TypeScript, Vitest, Git, npm, GitHub CLI/release parity, existing Agent Core benchmark/release scripts.

**Spec:** `docs/roadmap/agent-core-wave-g-design.md`

## Global Constraints

- Codespace only; never use the Mac Agent Core runtime for Wave G.
- No external AI model/API, model worker, embedding/reranking service, cloud AI judge, or hidden multi-agent dependency.
- No new MCP tool; existing 55-tool surface remains unchanged.
- No core behavior change unless a fresh certification failure proves a concrete defect.
- Local Agent Core certification, not GitHub Actions/CI, is release authority.
- Non-force publication plus fetch/readback equality only.
- Preserve concurrent main work and unrelated `.vscode/` state.
- Remote Wave G branch remains after local worktree/branch cleanup.

---

### Task G0: Design and clean baseline

**Files:**
- Create: `docs/roadmap/agent-core-wave-g-design.md`
- Create: `docs/roadmap/agent-core-wave-g-implementation-plan.md`

**Interfaces:**
- Produces the exact 18-area certification matrix and canonical gate sequence used by every later task.

- [x] **Step 1: Audit current `origin/main` and concurrent commits after Wave F.** Current start is `00ced56815b126433d3398e649656428159ecbef`; the only post-Wave-F change is Super-Runtime documentation.
- [x] **Step 2: Create isolated worktree `.worktrees/wave-g-core-recertification` on branch `wave-g/core-recertification` from current `origin/main`.**
- [x] **Step 3: Run `npm ci` and fresh `npm run verify:release`.** Required baseline: zero failures.
- [x] **Step 4: Run current `npm run verify:stable-parity`.** Required baseline: published stable `v0.5.4` with all required assets.
- [x] **Step 5: Run `git diff --check`, brand scan, doc-link checker; commit design/plan and push/read back branch equality.**

### Task G1: Deterministic core-certification contract

**Files:**
- Create: `scripts/release/core-certification-contract.mjs`
- Create: `scripts/release/check-core-certification.mjs`
- Create: `tests/core-certification-contract.test.ts`

**Interfaces:**
- Produces `CORE_CERTIFICATION_SCHEMA`, `CORE_CERTIFICATION_MATRIX`, `REQUIRED_PACKAGE_SCRIPTS`, dependency/source policy constants, and a CLI contract report.
- Consumes the exact 18 IDs/evidence paths from the Wave G design.

- [x] **Step 1: Write failing tests** that require exactly 18 unique matrix IDs, exact roadmap labels, tracked evidence paths, the no-external-model policy scopes, safe bounded checker JSON, and no secret values.
- [x] **Step 2: Run `npx vitest run tests/core-certification-contract.test.ts` and require RED because the contract/checker do not exist.**
- [x] **Step 3: Implement the data-only contract and deterministic checker.** The checker must run `git diff --check`, validate evidence paths/scripts, scan root + Codespace plugin dependency names, scan tracked core source/scripts for forbidden external model endpoint/API-key markers, and emit zero violations on the current repository.
- [x] **Step 4: Re-run the focused test and checker; require GREEN and `matrixCount=18`, `dependencyViolations=0`, `sourceMarkerViolations=0`.**
- [x] **Step 5: Run build, brand, doc-link, and dependency diff against Wave G base; require no dependency-list change.**
- [x] **Step 6: Commit `test: define core certification contract`, push branch, fetch, and require local/remote SHA equality.**

### Task G2: Canonical `certify:core` orchestrator

**Files:**
- Create: `scripts/release/certify-core.mjs`
- Modify: `package.json`
- Test: `tests/core-certification-contract.test.ts`

**Interfaces:**
- Produces package command `npm run certify:core` and final schema `agent-core-core-certification/1`.
- Consumes the checker from G1 plus existing `verify:release`, memory benchmark, execution benchmark, and stable-parity checker.

- [x] **Step 1: Extend the contract test and require RED** for missing `certify:core` script/orchestrator and missing exact gate order.
- [x] **Step 2: Implement the orchestrator** with fail-fast subprocess execution and bounded stdout/stderr handling. It must run contract check -> `verify:release` -> 100k memory benchmark (5 samples, 2 warmups, 150 ms target) -> execution benchmark (20 samples, 3 warmups) -> stable parity.
- [x] **Step 3: Parse benchmark/stable-parity JSON and emit one final report** containing source/version, 18-area matrix count, release pass, exact performance facts, stable tag/commit, no-external-model violation counts, and `ok=true` only after all gates pass.
- [x] **Step 4: Re-run focused contract tests and a lightweight orchestrator argument/contract test; require GREEN.**
- [ ] **Step 5: Commit `feat: add core certification command`, push branch, fetch, and require local/remote SHA equality.**

### Task G3: Execute the complete Wave G matrix

**Files:**
- Modify: `docs/stability.md`
- Modify: `docs/roadmap/agent-core-balanced-evolution.md`
- Modify: `docs/roadmap/agent-core-wave-g-implementation-plan.md`

**Interfaces:**
- Produces exact pre-integration Wave G certification evidence.

- [ ] **Step 1: Run fresh `npm run certify:core` at a committed feature SHA.** Record exact 100k memory p95, DAG/dispatch/wake p95, max concurrency, stable-release tag/commit, test totals, quality metrics, and zero external-model violations.
- [ ] **Step 2: Run supplemental read-only GitHub Fabric acceptance** using Codespace GitHub authentication without printing the token. Record whether all four read-only probes pass; report any credential-scope limitation factually.
- [ ] **Step 3: Run focused trust/isolation matrix** covering OAuth/auth, principal/project isolation, operational audit, dual-era MCP, backup/restore, retention, audit integrity, observability, resource governance, and GitHub regression; require zero failures.
- [ ] **Step 4: Run a temporary feature-build local HTTP/MCP canary** proving health/local+remote metrics classification/no-token/evil-Origin/correlation + 55 tools in both protocol eras.
- [ ] **Step 5: Update docs with exact feature certification evidence, commit `docs: record wave g feature certification evidence`, push/read back equality.**

### Task G4: Integrate, publish, source-sync, and architecture-level certification

**Files:**
- Modify as needed only for final certification docs: `docs/stability.md`, `docs/roadmap/agent-core-balanced-evolution.md`, `docs/roadmap/agent-core-wave-g-implementation-plan.md`

**Interfaces:**
- Produces final published architecture-level stable claim on one exact main/runtime SHA.

- [ ] **Step 1: Fetch `origin/main` immediately before integration.** If it advanced, inspect all concurrent commits/path overlap and reconcile explicitly; never reset unrelated work.
- [ ] **Step 2: On the exact integration candidate run `npm ci` + fresh `npm run certify:core`; require PASS.**
- [ ] **Step 3: Publish `main` non-force, fetch, and require `HEAD == origin/main`.**
- [ ] **Step 4: Controlled Codespace source-sync/repair; require `HEAD == origin/main == connection.sourceCommit`.** Preserve unrelated `.vscode/` state.
- [ ] **Step 5: Run final production public/runtime matrix:** health `200`, remote metrics `403`, local metrics `200`, no-token `401`, evil Origin `403`, correlation headers, memory/execution integrity `ok`, safe concurrency `<= operator max`, maintenance default disabled, legacy `2025-11-25/55`, modern `2026-07-28/55`, audit verify PASS.
- [ ] **Step 6: If a temporary canary key is created, revoke it and verify revocation.**
- [ ] **Step 7: Publish final docs-only architecture certification if evidence changes the docs; run fresh `npm run certify:core` on that exact docs SHA before publication/source-sync.**
- [ ] **Step 8: Require final `main == origin/main == connection.sourceCommit` equality and clean tracked status.**
- [ ] **Step 9: Remove only local Wave G worktree and local Wave G branch; retain remote `wave-g/core-recertification` for audit.**
- [ ] **Step 10: Only now state the architecture-level Agent Core control plane as certified stable and mark Wave G complete.**
