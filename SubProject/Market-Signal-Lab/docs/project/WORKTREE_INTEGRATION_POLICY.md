# Market Signal Lab — Canonical Root & Worktree Integration Policy

**Status:** PERMANENT PROJECT POLICY

## Core rule

`E:\Market-Signal-Lab` is the canonical integrated project root.

Git worktrees are temporary isolation environments for implementation, experiments, review, merge preparation, or verification. A worktree is **not** a replacement project root and must never become the only durable home of accepted source, final checkpoints, stable binaries, installers, release packages, or operational launchers.

## Canonical paths

```text
E:\Market-Signal-Lab\                  canonical integrated source checkout
E:\Market-Signal-Lab\release-stable\   canonical local stable release/runtime artifacts
E:\Market-Signal-Lab\dist\.worktrees\ temporary disposable implementation isolation
E:\Market-Signal-Lab\.worktrees\       legacy temporary worktree isolation only
```

## Required worktree lifecycle

1. Create an isolated worktree only when isolation materially helps implementation/review safety.
2. Implement and locally verify inside that worktree.
3. Commit accepted changes on the task branch.
4. Integrate the accepted task branch into the canonical root integration branch.
5. Resolve combined checkpoints/docs at integration time; do not leave contradictory truth split across task worktrees.
6. If the task produces a stable executable/release artifact, promote/copy the exact verified bytes to `release-stable` in the canonical root.
7. Verify root source status plus stable artifact hashes after promotion.
8. Only after steps 4–7 succeed may the implementation worktree be considered disposable and removed.

## Integration definition

A task is **not integrated** merely because:

- its branch was committed;
- its worktree is clean;
- its branch was pushed;
- a build exists under `dist/.worktrees/...`;
- a checkpoint inside the worktree says COMPLETE.

A task is integrated only when the accepted source/history is reachable from the canonical root integration branch or is explicitly documented as intentionally separate/unreleased, and any user-facing stable artifact has a durable root-level location independent from worktree lifetime.

## Stable artifact policy

The canonical local stable artifact directory is:

```text
E:\Market-Signal-Lab\release-stable\
```

It must contain the currently approved local release package in a human-discoverable layout, including the installer and/or portable runtime needed to launch the product. `release-stable` is operational output and is ignored by Git so large binaries do not pollute source history.

Promotion must be byte-for-byte. Do not rebuild an already signed-off candidate merely to move it out of a worktree. Copy the verified bytes and compare SHA-256 against the canonical release manifest/checkpoint.

## Root launcher

The repository may provide a small tracked root launcher such as `Launch-MSL-Stable.bat`. It must point only to `release-stable`, never to `.worktrees` or ephemeral build directories. If the stable payload is absent, the launcher must fail clearly and direct the operator to restore/promote the release artifacts.

## Cleanup rule

Before removing any worktree, verify:

```text
accepted commits integrated or intentionally preserved on a durable branch
canonical root checkpoint updated
stable artifacts promoted outside worktree when applicable
no operational launcher depends on the worktree path
no unique evidence required for future continuation exists only inside the worktree
```

If any condition fails, the worktree is not yet disposable.

## GitHub Actions / CI

GitHub Actions/CI is banned for MSL unless the operator explicitly replaces this permanent policy in the future. Stable local verification must not be repeated on GitHub-hosted runners merely to push, publish, release, or integrate work.

## Non-goals

This policy does not require merging unreleased experimental code into a published release tag. Published release bytes remain immutable. It requires the canonical root development checkout to reflect accepted integrated development state while release artifacts remain clearly separated under `release-stable`.
