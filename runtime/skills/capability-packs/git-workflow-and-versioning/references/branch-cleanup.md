# Cleaning up branches whose remote is gone

Agent Core addition, not upstream text. A local branch whose upstream was deleted (usually after a merge) is a candidate for cleanup. A candidate is not proof it is safe: after a squash merge the remote branch disappears while the local one may still hold commits that never reached the default branch. Deleting is irreversible in practice, so the order below is fixed.

## 1. List, read-only

```powershell
git fetch --prune
git for-each-ref refs/heads --format='%(refname:short)|%(upstream:track)' |
  Where-Object { $_ -match '\|\[gone\]$' } |
  ForEach-Object { ($_ -split '\|')[0] }
```

`git fetch --prune` updates remote-tracking references only; it does not touch your branches or files. The command prints the names of branches whose upstream is `[gone]`. Never delete the branch you are on or the default branch.

## 2. Check each branch for unique work

```powershell
# commits on the branch that are not in main; '+' means not present upstream
git cherry -v main feature/old-login
```

- No `+` lines: everything is in `main`, deletion is safe.
- Any `+` line: those commits are not in `main` by patch identity. After a squash merge this is expected, so look at the content before concluding: `git diff main...feature/old-login --stat` shows whether the work is really there. If you cannot tell, ask the user; do not guess.

## 3. Confirm with the user

Show the table: branch, last commit date and subject, number of `+` commits, your recommendation. Ask for confirmation per branch, or once for a named list. One approval does not cover branches added later.

## 4. Delete the safe way

```powershell
git branch -d feature/old-login
```

`-d` refuses to delete a branch that is not merged into its upstream or HEAD, and that refusal is the protection. Use `-D` (force) only when the user explicitly approves that branch by name after seeing its unique commits, for example when the work was squash-merged and you verified the content.

## 5. Worktrees

```powershell
git worktree list
```

A branch checked out in a worktree cannot be deleted. Remove the worktree with `git worktree remove <path>` and no `--force`. If git refuses because of local changes, show the user what is uncommitted and let them decide. Never add `--force` on your own.

## Do not

- Delete in a loop without the per-branch check in step 2.
- Combine cleanup with commit, push or pull request creation in one turn. Each of those needs its own approval.
- Run `git push origin --delete` as part of local cleanup.
- Use a global `safe.directory` workaround; use `git -c safe.directory=<path>` for the one command if git needs it.

## Pre-commit secret check without printing secrets

Checking staged changes for secrets must not echo the secret. A command that prints the matching line puts the value in the terminal and the transcript. List file names only:

```powershell
git diff --staged --name-only
git diff --staged -G"(password|secret|api[_-]?key|token)" --name-only
```

The second command prints the names of staged files whose changed lines match the pattern. Open the file and judge the line yourself; do not pipe matching lines to output or logs.
