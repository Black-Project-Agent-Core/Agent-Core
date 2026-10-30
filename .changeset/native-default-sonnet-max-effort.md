---
"agent-core": patch
---

The default Native Anthropic model is Claude Sonnet 5.5 again, and when a caller does not choose a reasoning effort the provider now uses the highest level the model supports, up to `max` (`ANTHROPIC_REASONING_EFFORT` changes or disables this ceiling). `ANTHROPIC_MODEL` and an effort picked in the launcher still win.
