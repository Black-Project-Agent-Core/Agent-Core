---
"agent-core": patch
---

Native chat Inspector: the "Workspace Artifacts" card becomes "Outputs". It lists the files changed by the current task (checkpoint-attributed first, then Git-only), with folder, state and +/- counts, refreshing while a turn runs (at most every 5 s) and when it ends. The host exchange for task changes moves into a shared `useTaskChanges` hook that `TaskChangesPanel` now also uses.
