# Market Signal Lab — Canonical Root Integration Complete

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** COMPLETE / LOCALLY VERIFIED
**Canonical root:** `E:\Market-Signal-Lab`
**Canonical branch:** `integration/root-current-20260826`
**Integrated head before this checkpoint commit:** `8376cd35eb64d4008853f7c2cd857a7531f05de0`

## What was corrected

The project previously allowed accepted work and even stable release artifacts to remain operationally dependent on paths under `.worktrees` / `dist/.worktrees`. That pattern is now rejected.

The permanent rule is:

```text
E:\Market-Signal-Lab\                  canonical integrated source checkout
E:\Market-Signal-Lab\release-stable\   canonical local stable runtime/artifact location
E:\Market-Signal-Lab\dist\.worktrees\ temporary disposable implementation isolation only
E:\Market-Signal-Lab\.worktrees\       legacy temporary isolation only
```

See `docs/project/WORKTREE_INTEGRATION_POLICY.md`.

## Source integration

A temporary integration worktree merged the accepted RC hardening lineage and accepted C3.2 development lineage:

```text
RC hardening parent = b82fac060d69d2e9dde5871edfc90c56f1b33544
C3.2 parent         = ce02455f284c8e76c3513bed57a9529ef3d93a83
merge commit        = 2cadfa329760242eb49e5f89a2d99d320fdeb311
policy head         = 8376cd35eb64d4008853f7c2cd857a7531f05de0
merge base          = 498fedb0c11ee6c955306aca2199390af22cc0b8
```

Only two merge conflicts occurred, both in rolling checkpoint documents. They were resolved into one combined RC + C3 truth. Production source merged without textual conflict.

## Local integration verification

No GitHub Actions/CI was used.

```text
Rust full cargo test                 PASS
Rust release build                   PASS
Go full repository test ./...        PASS
Bun frozen install                   PASS
TypeScript typecheck                 PASS
Frontend tests                       2/2 PASS
Generated frontend drift check       PASS
Python calibration lab unittest      8/8 PASS
Python compileall                    PASS
git diff --check                     PASS
remaining merge conflicts            0
```

The integration verification validates current development source only. It does not replace the separately signed-off published preview.

## GitHub Actions ban enforced

Executable workflow YAML files were removed from `.github/workflows/`. The directory now contains documentation only. GitHub Actions/CI is not an allowed MSL build, test, release, keepalive, recovery, or verification path under the current operator policy.

## Root checkout restored as canonical

The previous root checkout was on `task/windows-relay-ampersand-path-fix-20260821` with dirty tracked/untracked work. That state was preserved before switching the root:

```text
stash = fc22521e72d6f5f6ca6c776019fad8a99480343e
local preservation = E:\Market-Signal-Lab\dist\root-preservation\2026-08-26-pre-canonical-integration\
```

The preservation directory contains pre-switch status/patch metadata and an extra copy of the untracked frontend directory. The canonical root was then switched cleanly to `integration/root-current-20260826`.

## Stable release promoted to root

The already signed-off release bytes were copied, not rebuilt, into:

`E:\Market-Signal-Lab\release-stable\`

Canonical executable paths:

```text
Installer:
E:\Market-Signal-Lab\release-stable\Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Setup.exe

Portable app:
E:\Market-Signal-Lab\release-stable\Portable\Market Signal Lab.exe

Portable Rust worker:
E:\Market-Signal-Lab\release-stable\Portable\engines\rust\msl-analytics-rust.exe
```

Verified SHA-256:

```text
Setup = CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17
App   = 79A6671A6016AC01DABC01FAB9BD368BC629B689539BC6FDF169072075C91358
Rust  = D7D5AD35EF9D286F1B06BF486590C5C750C535876B3DA535EB8C588D800CF63F
```

The root launcher `Launch-MSL-Stable.bat` points only to `release-stable\Portable\Market Signal Lab.exe` and contains no `.worktrees` dependency.

`release-stable/` is intentionally ignored by Git because it is canonical local operational output, not source history.

## Promotion automation

`scripts/promote-stable-release.ps1` is now the canonical promotion mechanism. It:

- validates required source release files;
- validates optional expected Setup/app/Rust SHA-256 values before copy;
- copies into a root-level staging directory;
- validates the release `SHA256SUMS.txt` after copy;
- validates promoted Setup/app/Rust hashes;
- moves the verified staging payload into `release-stable`;
- never requires the final runtime to continue depending on the source worktree.

## Temporary integration worktree disposal proof

The temporary integration worktree used to create the canonical merge was removed after the root checkout and `release-stable` promotion completed.

Observed after removal:

```text
temporary integration worktree exists = false
canonical root still on integrated branch = true
release-stable portable app exists = true
```

This proves the corrected lifecycle: isolation may disappear without taking the integrated project or stable runtime with it.

## Completed task worktree cleanup

The completed E:-root task worktrees were audited before deletion. Each was clean, matched its remote branch, and its HEAD was already contained in the canonical root integration history. They were then removed with normal `git worktree remove` (no force):

```text
rc-hardening-wave1-20260826                  REMOVED
c3-1-deterministic-signal-v02-20260826       REMOVED
c3-2-quant-calibration-lab-20260826          REMOVED
c3-evidence-calibrated-model-20260826-repaired REMOVED
```

After removal, `E:\Market-Signal-Lab` remained on the integrated branch and `release-stable\Portable\Market Signal Lab.exe` still existed. This is the intended end state: accepted work lives at root; completed task worktrees do not remain operational dependencies.

Legacy historical worktree registrations outside the canonical E: root are not treated as the current project workspace and are not required by this checkpoint.

The visible legacy directory `E:\Market-Signal-Lab\.worktrees` was also audited. Its two child copies (`analytics-v2-ipc-red` and `phase-p-performance`) were not registered by the E: repository; their `.git` files pointed to the old F: repository, and both referenced commits were already ancestors of the canonical root. To remove root ambiguity without destructive deletion, the whole stale directory was moved to:

`E:\Market-Signal-Lab\dist\root-preservation\legacy-e-root-worktrees-20260826`

Therefore `E:\Market-Signal-Lab\.worktrees` is no longer a shadow project directory at the canonical root.

## Published preview remains immutable

The release itself was not rebuilt or retagged:

```text
tag               = v0.3.0-alpha.6.5.3-preview.1
release commit     = 0ce427406f5418aa7040e607893ec0cb788ae2f0
GitHub release id  = 377007837
release asset count= 5
```

C3.0–C3.2 are integrated development source but are not retroactively part of that published preview.

## C3.3 remains evidence-blocked

```text
JSONL files                     = 26
non-empty rows                  = 103,644
files with required outcomes    = 0
strict calibration-ready files = 0
C3.3                             = BLOCKED_NO_APPROVED_ARTIFACT
```

Do not fabricate calibration evidence to advance C3.3.

## Final operational rule

A task is not considered fully integrated merely because its worktree is clean, committed, or pushed. Accepted work must return to the canonical root integration branch, and stable user-facing artifacts must be promoted to the root `release-stable` directory before a worktree is considered disposable.
