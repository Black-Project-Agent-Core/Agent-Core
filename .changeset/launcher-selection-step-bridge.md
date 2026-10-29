---
"agent-core": patch
---

The launcher bridge now forwards the UI's `agent-chat-select` to the owner-only `PUT /agent/chat/selection` (a failed write is ignored because localStorage keeps the pick) and serves `agent-chat-step` by reading the full Input/Output of one tool step from `GET /agent/chat/steps/:turnId/:seq` (`agent-chat-step-result`, or `agent-chat-error` on failure/404). Both use the existing async agent-chat request path, so the UI thread is never blocked.
