---
"agent-core": minor
---

Persist every Native tool step with its exact Input and Output so the chat can show what was sent to each tool and what came back, for any turn (including turns started through the bridge). Tool events carry masked text capped at 16 KB per side (masking runs before the cut), a new `chat_turn_steps` table stores it with 30-day retention, the conversation detail carries step metadata only, and the owner-only `GET /agent/chat/steps/:turnId/:seq` returns the full text. The UI display is a separate change. Also fixes the UI transport test mock that had been missing `getLastSelection` since the selection change and adds route tests for the selection and step endpoints.
