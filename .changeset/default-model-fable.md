---
"agent-core": minor
---

The Anthropic route now defaults to `claude-fable-5-1` instead of `claude-sonnet-5-5` when `ANTHROPIC_MODEL` is not set. Native chats created through the bridge (which takes no model argument) and the launcher picker with no saved selection use it; a model the owner picks is still stored and wins, and `ANTHROPIC_MODEL` still overrides the default. Takes effect after the next Core restart.
