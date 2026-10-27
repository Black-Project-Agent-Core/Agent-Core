---
"agent-core": major
---

Remove the Agent Core Browser Bridge, the second browser transport (`transport="extension"`), together with its `/browser-bridge/*` HTTP routes and the `conversation_draft` and `conversation_status` actions. Open Browser Use is the single browser transport. `conversation_read` stays external-only and is served by Open Browser Use. Callers selecting `transport="extension"` or passing `mode` must omit them or use `transport="open-browser-use"`.
