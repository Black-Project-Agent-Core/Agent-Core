# MSL C2 + TS0/TS1 RC Baseline Integration Plan

**Required sub-skill:** subagent-driven-development + verification-before-completion
**Goal:** converge the reviewed Phase C2 branch and reviewed TS0/TS1 branch into one RC-baseline branch without changing C1 numerics, C2 semantics, or TS0/TS1 ownership boundaries.
**Architecture:** Go remains host/security/storage/API; Rust remains mandatory production analytics; TypeScript owns only the approved analytics-engine UI pilot; Bun remains dev/build/test-only.
**Tech stack:** Go 1.26.4, Rust 1.97.1 GNU, Bun 1.4.0, TypeScript 5.9.3, Inno Setup 6.7.3.
**Spec:** `docs/superpowers/specs/2026-08-22-msl-phase-c2-semantic-correction-design.md` + `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md`.
**Global constraints:** no implicit merge to main; no raw credential/payload evidence; preserve C1 fixtures/wire/numeric source; preserve `minOpportunity` and `value="opportunity"` compatibility; preserve separate Market Opportunity subsystem; TS2+ remains unauthorized; current elevated installer replay cannot be bypassed and is deferred to RC sign-off.

## Task 1 — Merge the two reviewed branches with explicit truth resolution

**Inputs:** `task/c2-semantic-correction-20260822@cfedc8c` and `feature/typescript-bun-foundation-ts0-ts1-20260822@848bb0c`.
**Files expected to conflict:** `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`, `docs/checkpoints/CONTINUE_MSL.md`; all source/tooling changes should otherwise compose additively.

1. Record the common ancestor `48b50f05ed952fb008be1349e46091a553d3d281` and both input SHAs.
2. Merge the TS0/TS1 branch into this integration branch with `--no-ff --no-commit`.
3. Resolve checkpoint conflicts to the combined truth: C2 `COMPLETE / VERIFIED`; TS0/TS1 `COMPLETE / VERIFIED`; C3 `DESIGN NEXT / NOT IMPLEMENTED`; formal release `NOT RELEASED`.
4. Preserve the C2-only and TS0/TS1-only handoffs as historical evidence; add a new integrated checkpoint rather than rewriting their original evidence claims.
5. Assert only approved TS files exist and that C2 UI terminology fixes remain present.
6. Commit the merge only after `git diff --check` and source-scope checks pass.

## Task 2 — Verify the integrated code contract

1. Clean-install frontend dependencies under repo-local cache and run `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:frontend`, `bun run verify:frontend-generated`.
2. Run the C1/C2 Rust freeze gate against `bc5e49381df18516c4d296cbf164314ec5a35375`; expected no diff in `engines/rust`, `internal/analyticsengine`, `internal/ranking/rust_input_v01.go`, `internal/ranking/rust_output_v01.go`, `internal/indexing`.
3. Run full Go regression with the real release Rust worker. If `TestRustV2ClientHardFailureRestartsBeforeNextBatch` flakes, run the targeted test 10×, then rerun full Go sequentially; never weaken timeouts or assertions to make it pass.
4. Run full Rust regression.
5. Recompute all three normalized-LF C1 fixture fingerprints and require exact historical values.
6. Run secret scan and require clean working tree.

## Task 3 — Build and smoke the combined RC candidate

1. Build a new native installer from the integrated commit using only repo-local Go/Rust/Inno tools and ignored `dist/rc-baseline-acceptance/` evidence paths.
2. Record integrated installer/app/packaged-worker SHA-256 and `sourceHead`; these supersede C2-only and TS0/TS1-only candidate hashes for RC work, without rewriting the historical C2/TS evidence docs.
3. Because the current Desktop Commander token is non-elevated, do not launch an admin-required Setup.exe or bypass UAC. Run the exact hash-matched installer-stage payload as the candidate runtime.
4. Require `healthy / rust-production / msl-analytics/2`, Go-host → Rust-worker process tree, no Bun runtime/package tree.
5. Verify Credential Manager using only `effectiveSource` + non-secret fingerprint and, if needed on fresh local metadata, the installed app's normal connection-test endpoint.
6. Run one real Quick scan to terminal completion; record work units/products/requests/warnings/errors but no raw market payload.
7. Assert C2 semantic API identity and final relabeled C2 UI/EN+ID locale values.
8. Assert TS0/TS1 generated analytics-engine marker is served and Bun is absent from runtime.

## Task 4 — Create the integrated RC-baseline checkpoint

**Create:** `docs/qa/c2-ts01-rc-baseline-integration-qa.md` and `docs/checkpoints/2026-08-23-MSL-C2-TS01-RC-BASELINE.md`.
**Modify:** `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`, `docs/checkpoints/CONTINUE_MSL.md`.

1. Record both parent branch SHAs, integration commit, test results, new candidate hashes, Quick run summary, semantic identity, TypeScript generated-drift result, and no-Bun runtime evidence.
2. State that C2 and TS0/TS1 remain complete; RC **sign-off is not complete**.
3. Replace any current continuation pointer that still implies RC should use the old C2-only installer hash.
4. Carry one binding elevated gate for the **new integrated installer**: from a pre-elevated Administrator PowerShell session, run `scripts/verify-windows-installer.ps1` without `-KeepInstalled`; require install/layout/hash/sourceHead/health/final UI+locale smoke and successful uninstall/cleanup. No UAC bypass or auto-elevation workaround.
5. Keep C3 unstarted until that RC gate and planned soak/failure testing are complete.

## Task 5 — Final review and publication

1. Request an independent whole-branch review from C2 parent to integrated HEAD; Critical/Important findings must be fixed before publication.
2. Run fresh sequential frontend, full Go, full Rust, freeze, fixture-hash, secret, and `git diff --check` gates on the final HEAD.
3. Push only `integration/c2-ts01-rc-baseline-20260823` and verify remote SHA == local SHA.
4. Do not merge to `main`, do not start TS2, and do not start C3 production work.
5. Preserve the integration worktree for RC feedback and the eventual elevated installer replay.

## Completion definition

The integration phase is complete when one branch contains the reviewed C2 final source and reviewed TS0/TS1 foundation simultaneously; all automated/native staged-runtime gates are green; current docs point to the integrated RC candidate; Bun remains dev-only; Rust remains mandatory; C1/C2 contracts remain frozen; and the exact current integrated Setup.exe install+uninstall replay is explicitly deferred as the only elevation-bound RC sign-off gate rather than silently waived.
