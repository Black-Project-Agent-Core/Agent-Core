---
"agent-core": patch
---

Persist assistant narration (`assistant.progress`) as ordered rows in `chat_turn_steps` next to tool steps (server side, WP-B3a). Each non-empty narration becomes the next step of the turn with `kind: 'note'`, empty tool name, status `ok` and the masked text (≤400 chars) in `resultSummary`, so conversation detail and reload return narration → tool step → narration in the original order, also for turns started through the bridge. A failed narration write is logged and never fails the turn; `completeStep` never matches narration rows. No schema change. The UI rendering of note rows is a later package (WP-B3b).
