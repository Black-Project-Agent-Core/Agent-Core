---
"agent-core": patch
---

Show the Native chat as a per-turn timeline instead of one separate Activity list. Assistant narration and tool steps appear in the order they happened (narration, steps, narration, ..., answer), a run of two or more consecutive steps collapses into one line with a category summary, step count and total duration (for example "4 pembacaan, 2 perintah · 6 langkah"), and each step still opens into its exact Input and Output. Under the answer, a compact "EXECUTED INVOCATIONS (N)" card lists the turn's tool calls with status, duration and a one-line result. While a turn runs, live steps are shown read-only until the stored steps catch up. The Inspector card "Tool Calls (N)" no longer counts narration rows, and the old Activity list is removed.
