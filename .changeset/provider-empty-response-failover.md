---
"agent-core": patch
---

An accepted model reply with no text, no tool call and no provider refusal is no longer recorded as a success. It fails as `EMPTY_RESPONSE` (`AGENT_RUNTIME_PROVIDER_RESPONSE_EMPTY`), a short model-credential block that lets a sibling key or the next route answer, without touching the provider breaker or the rate-limit backoff. A user-chosen route still pauses instead of rotating. Anthropic streams go through the same check.
