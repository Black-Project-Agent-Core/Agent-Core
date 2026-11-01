---
"agent-core": minor
---

Added Plan mode (server): a per-turn `planMode` boolean (mutually exclusive with `goalMode`) that makes Native investigate read-only and close with a numbered plan instead of changing anything. Every tool call that would mutate is refused with `PLAN_MODE_READ_ONLY` before dispatch, regardless of grant; a fully-mutating tool's schema (no read-only path at all) is left out of what the model is shown, while a mixed tool like `skills` stays visible for its read actions. The mode survives a turn resume. `POST /agent/chat/conversations/:id/turns` accepts `planMode` (400 if not a boolean, 400 if sent together with `goalMode`).
