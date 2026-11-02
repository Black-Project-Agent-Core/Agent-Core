---
"agent-core": patch
---

Add the read-only script `scripts/inspect/shadow-replay.mjs`: it replays two candidate stuck-task rules (a repeated failure streak, and a task longer than the per-workspace p90 x 1.25 of finished tasks) over the finalized tasks in `runtime/agent-runtime/state.json` and prints how many tasks each rule would touch, how many of those ended `verified` and the effective cost after the firing point on `failed` tasks. It writes no file and changes no Native behaviour. `effectiveTaskCost` moves into the leaf module `src/effective-cost.ts` (re-exported from `agent-runtime.ts`, callers unchanged) so the script can load it without constructing the activity tracker.
