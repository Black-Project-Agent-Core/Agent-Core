---
"agent-core": minor
---

The Router page becomes a working page over the existing provider pool. Each configured provider has a Test button that lists every model its keys can see (`GET /v1/models`, all Anthropic pages), per key, with context window, max output and effort levels, through the new owner-only `POST /agent/chat/providers/{id}/test` (UI token required, external controllers refused). A failed key gets a fixed cause (key rejected, permission, rate limit, quota, provider down, wrong base URL, timeout, network) without echoing keys, URLs or provider text. Choosing a model uses the existing AI Models selection. The "Not active" badge and the disabled Enable Router control are removed.
