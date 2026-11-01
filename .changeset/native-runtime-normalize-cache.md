---
"agent-core": patch
---

Native runtime updates no longer re-normalize every stored task. `AgentRuntimeService.mutate` used to load and normalize all of `runtime/agent-runtime/state.json` and normalize it again on save, so each `bumpMetrics`/`recordEpisode` cost seconds once hundreds of tasks were stored, and a tool step recorded 5 to 9 s for about 0.2 s of tool work. `normalizeState` now reuses the earlier result for a task whose serialized input is unchanged (validation still runs on every call; the file is still read, verified and rewritten). On a copy of the real state, `bumpMetrics` p50 went from 2.46 s to 0.65 s and a fake-provider controller loop from 147.5 s to 31.4 s for eight iterations. `AGENT_CORE_RUNTIME_NORMALIZE_CACHE=off` restores the previous behaviour without a rebuild. Live Native gain after a restart is not yet measured.
