# MSL RC Stability Hardening Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** eliminate stale `running` Market Autopilot history after process interruption, make the approved generated TypeScript asset byte-deterministic, harden RC cleanup verification, and produce a newly verified hardening candidate.

**Architecture:** Go owns interrupted-run lifecycle reconciliation after runtime ownership is established. Existing observations remain immutable; stale runs are terminalized as `failed`, never resumed or promoted to partial/completed. TypeScript ownership stays unchanged; `.gitattributes` stabilizes the one generated pilot asset. Installer changes affect verification only.

**Tech Stack:** Go 1.26.4, Rust 1.97.1 GNU, Bun 1.4.0, TypeScript 5.9.3, Inno Setup 6.7.3.

**Spec:** `docs/superpowers/specs/2026-08-23-msl-rc-stability-hardening-wave1-design.md`

## Global Constraints

- Base is `64fc693ade90bfafbbd4b3f6799b835d2e402e9a`.
- Preserve C1 numeric/Rust/wire paths and exact fixture fingerprints.
- Preserve `msl-semantic-contract/2`, `minOpportunity`, `value="opportunity"`, and the separate Market Opportunity subsystem.
- TS2+ and C3 remain unauthorized.
- No raw Envato token or raw market payload in evidence.
- No UAC bypass; elevated Setup replay remains separate.
- Any packaged-byte change invalidates the prior RC candidate hashes.

---
### Task 1: Reconcile interrupted Market Autopilot runs

**Files:**
- Create: `internal/app/autopilot_recovery.go`
- Create: `internal/app/autopilot_recovery_test.go`
- Modify: `cmd/market-signal-lab/main.go`
- Modify: `cmd/market-signal-lab/main_test.go`

**Interfaces:**
- Produce: `func (s *Service) ReconcileInterruptedAutopilotRuns() (int, error)`.
- Stable reason: `market map interrupted by previous application exit`.
- Preserve all persisted counters/observation ledgers; only status, completedAt, and error list change.

- [ ] **Step 1: write the failing service recovery test**

Seed one `running` run with non-zero counters and one `completed` run. Call `ReconcileInterruptedAutopilotRuns`. Require count `1`, recovered status `failed`, non-empty `completedAt`, exact stable reason once, every numeric counter unchanged, completed run unchanged, and a second call returning `0`.

- [ ] **Step 2: prove RED**

Run:
```bash
go test ./internal/app -run '^TestReconcileInterruptedAutopilotRuns' -count=1 -v
```
Expected: compile failure because `ReconcileInterruptedAutopilotRuns` does not exist.

- [ ] **Step 3: implement minimal recovery**

`internal/app/autopilot_recovery.go` must read `s.autopilot.MarketMapRuns()`, update only rows whose latest status is `running`, append the stable interruption reason only if absent, set `CompletedAt` to current UTC RFC3339, append the updated run through `AppendMarketMapRun`, and return the number reconciled. Do not create rankings, directions, confidence, or synthetic observations.

- [ ] **Step 4: prove lifecycle ownership**

Add a CLI test that seeds a `running` run, creates a real port conflict, calls `run serve`, then reopens the same data root and proves the run is still `running`. This pins the rule that reconciliation cannot occur before the listener is acquired.

- [ ] **Step 5: invoke recovery only after ownership**

In `serve`, acquire `net.Listen` first, then call `svc.ReconcileInterruptedAutopilotRuns()` before constructing/serving the HTTP server; fail startup if reconciliation fails. In `market-map`, refuse the normal same-port live-instance conflict before reconciliation, then reconcile and run the explicit headless map.

- [ ] **Step 6: run focused tests and commit**

```bash
go test ./internal/app ./cmd/market-signal-lab -count=1
```
Expected: PASS.

Commit:
```text
fix: reconcile interrupted market maps
```

### Task 2: Pin generated frontend bytes to LF

**Files:**
- Create: `.gitattributes`
- Modify: `internal/web/frontend_build_contract_test.go`
- Regenerate: `internal/web/assets/js/analytics_engine.js` only if line-ending normalization changes the tracked blob.

**Interfaces:**
- `.gitattributes` exact rule: `internal/web/assets/js/analytics_engine.js text eol=lf`.
- No wildcard normalization of other JS assets.

- [ ] **Step 1: write RED contract test**

Extend `TestFrontendBuildContract` to read `../../.gitattributes` and require the exact generated-asset LF rule.

- [ ] **Step 2: prove RED, then add the rule**

```bash
go test ./internal/web -run '^TestFrontendBuildContract$' -count=1 -v
```
Expected before implementation: FAIL because `.gitattributes` is absent.

Create `.gitattributes` with only the approved rule, then renormalize that one path with Git.

- [ ] **Step 3: prove byte determinism**

Run frozen Bun install, typecheck, frontend tests, build, and verify. Hash `analytics_engine.js`, rebuild again, hash again, and require equal SHA256 with a clean worktree after the second build.

- [ ] **Step 4: commit**

```text
build: pin generated analytics asset eol
```
### Task 3: Remove cleanup timing false failures

**Files:**
- Modify: `scripts/windows-installer-test-helpers.ps1`
- Modify: `scripts/verify-windows-installer.ps1`
- Modify: `scripts/verify-windows-installer-lifecycle.ps1`
- Modify: `scripts/tests/verify-windows-installer.Tests.ps1`
- Modify: `scripts/tests/verify-windows-installer-lifecycle.Tests.ps1`

**Interfaces:**
- Add `Wait-PortReleased([int]$Port, [int]$Attempts = 40, [int]$DelayMs = 250)`.
- Preserve `Wait-PathRemoved`, primary-error precedence, and all identity/UI assertions.

- [ ] **Step 1: write failing static contracts**

Require the shared helper to expose bounded `Wait-PortReleased`; require the RC verifier to use it after owned-process stop and after uninstall; require lifecycle verifier to use it where it currently performs immediate cleanup assertions; reject the dead binary check after successful `Wait-PathRemoved`.

- [ ] **Step 2: prove RED and implement minimal helper/wiring**

Run both installer verification contract suites. Expected pre-fix: FAIL on missing `Wait-PortReleased`.

- [ ] **Step 3: prove GREEN**

Run:
```powershell
scripts/tests/build-windows-installer.Tests.ps1
scripts/tests/verify-windows-installer.Tests.ps1
scripts/tests/verify-windows-installer-lifecycle.Tests.ps1
```
Expected: all PASS.

- [ ] **Step 4: commit**

```text
fix: bound installer cleanup polling
```

### Task 4: Full automated regression and new candidate build

**Files:** verification-only under ignored `dist/rc-hardening-wave1/`; no product source modifications.

- [ ] **Step 1: run frontend gates**

Frozen Bun install, typecheck, frontend tests, generated-drift verification, and a double-build SHA equality check.

- [ ] **Step 2: run C1/C2 freeze and fixtures**

Diff the frozen Rust/numeric paths against `bc5e49381df18516c4d296cbf164314ec5a35375`; require zero diff. Recompute the three normalized-LF fixture hashes and require exact historical values.

- [ ] **Step 3: run Go/Rust regressions sequentially**

Build a release Rust worker into ignored evidence, run full Go with `MSL_RUST_WORKER` set to that worker, run `TestRustV2ClientHardFailureRestartsBeforeNextBatch` 10x, then run full Rust tests. Never weaken timeouts/assertions.

- [ ] **Step 4: build a new Windows installer candidate**

Use repository-local Go/Rust/Inno tools and `scripts/build-windows-installer.ps1`. Record new sourceHead and Setup/app/worker SHA256. Do not launch Setup.exe from the non-elevated token.

- [ ] **Step 5: staged-runtime preflight**

Run the exact hash-matched stage payload and require `healthy / rust-production / msl-analytics/2`, one Rust-worker descendant, zero Bun descendants/package tree, safe Credential Manager status/fingerprint, C2 labels/semantic marker, and TS generated marker.

No market scan is started in this step.

### Task 5: Native interruption + repeated-scan hardening

**Files:** ignored acceptance harness/evidence plus tracked QA/checkpoint updates after verification.

- [ ] **Step 1: interruption test on a fresh data root**

Start staged host, verify health and credential, POST one Quick run, wait until real progress is observed (`completedWorkUnits > 0` or `requestsCompleted > 0`), record only run ID/counts, terminate only the owned host, and confirm it exited.

- [ ] **Step 2: restart recovery assertion**

Restart the same candidate on the same data root. Require the interrupted run's latest persisted status to be `failed`, `completedAt` non-empty, stable interruption reason present exactly once, and no change to already-persisted observation counters. Require no run to remain `running` before starting new work.

- [ ] **Step 3: prove a fresh Quick succeeds after recovery**

Start one new Quick on the recovered data root; require `completed`, 21/21 work units for current Quick planning, zero errors, non-empty products, and `msl-semantic-contract/2` identity. This is the recovery acceptance scan.

- [ ] **Step 4: repeated-scan lane**

Run five additional Quick maps sequentially on the same owned host/data root. Every run must terminate `completed`; any product error, stuck `running`, Rust-worker loss, or credential fallback is a failure. Record only run IDs, durations, product/request/work-unit counts, warning/error counts, and process/resource summaries.

- [ ] **Step 5: write tracked QA/checkpoint**

Create `docs/qa/rc-stability-hardening-wave1-qa.md` and `docs/checkpoints/2026-08-23-MSL-RC-HARDENING-WAVE1.md`; update `CURRENT_MSL_CHECKPOINT.md` and `CONTINUE_MSL.md`. Repin new candidate hashes and retain the exact elevated Setup gate plus extended-soak limitation.

- [ ] **Step 6: final review, fresh verification, publication**

Independent whole-branch review must return no Critical/Important. Then rerun frontend/full Go/full Rust/freeze/fixtures/installer contracts/secret/diff/clean-tree sequentially. Push only `hardening/rc-stability-20260823`; do not merge `main` and do not start C3/TS2+.
