# Market Signal Lab — C3 / RC Lineage Reconciled — 2026-08-25

**Status:** RECONCILED / BASELINE VERIFIED / C3.0 TASK 1 NEXT
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Formal release:** NOT RELEASED

## Comparison result

A fresh fetch of every GitHub branch proved that the newest remote continuation decision is C3 at `0f6788e`, while the newest executable local lineage is RC hardening at `498fedb`.

The remote C3 delta after C2 contains five documentation/spec/plan commits and no production-source changes. The local RC branch contains the integrated C2 + TS0/TS1 baseline and 14 additional RC-hardening commits after integration head `64fc693`.

Therefore neither side alone represented the fullest project state. Cloning was unnecessary and would not solve the divergent history. The correct continuation is to preserve both lineages in the existing C3 worktree.

The older untracked local C3.0 draft was compared with the remote tracked plan. The remote plan is newer and more complete (838 lines versus 823) and adds the stage-policy identity, pinned source identities, representative adapter boundary, clarified release constraints, and corrected wording. The old draft was retained only under ignored `dist/.local-temp` evidence and is not used as the implementation plan.

## External repository preservation

Local `hardening/rc-stability-20260823` was pushed to GitHub before integration so the 14 local commits cannot be lost.

C3 was fast-forwarded to exact GitHub head `0f6788e` before the RC lineage was merged. Only `CONTINUE_MSL.md` and `CURRENT_MSL_CHECKPOINT.md` conflicted; production source merged without conflict.
## Verification evidence

- `git diff --check --cached`: PASS.
- Rust/Cargo full test suite: PASS.
- Rust release worker build: PASS.
- Bun frontend contract tests: 2/2 PASS.
- TypeScript `typecheck`: PASS after `bun install --frozen-lockfile` installed the declared TypeScript dev dependency locally.
- First full `go test ./... -count=1`: one Rust-v2 handshake-timeout failure in `TestRustV2ClientHardFailureRestartsBeforeNextBatch`; all other packages passed.
- Targeted handshake recovery test repeated with `-count=10`: 10/10 PASS.
- Fresh full `go test ./... -count=1` rerun: PASS across all packages.

The transient failure matches the previously observed handshake-timeout class and is retained as evidence. No source change was made to hide it.

## Current continuation truth

C1 numerics/history and C2 semantics remain frozen. TS0/TS1 remains verified. RC Wave 1 Tasks 1–3 are preserved and reviewed; RC Tasks 4–5 and the exact elevated installer replay remain open release-hardening gates.

The newest continuation decision is still the approved C3.0 plan. C3.0 production implementation has not begun at this checkpoint.

## Next exact action

Execute Task 1 of `docs/superpowers/plans/2026-08-24-msl-phase-c3-0-evidence-constitution-runtime.md` from this reconciled branch, then commit and push each completed task. Do not merge to `main` implicitly and do not start C3.1 automatically.