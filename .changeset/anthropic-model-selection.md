---
"agent-core": minor
---

Add explicit per-turn Anthropic model selection in Native Chat for Sonnet 5.5, Opus 5.5, Haiku 5.5 and Fable 5.1. Keep the configured default when omitted, qualify the selected model through existing readiness, bind its intent to durable chat/checkpoints and reject changed-model request replays. Forward the selection through the existing UI and launcher transport.
