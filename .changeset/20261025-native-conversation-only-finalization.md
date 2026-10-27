---
"agent-core": patch
---

A Native chat turn that uses no tools, such as a greeting, now finalizes instead of failing with `AGENT_RUNTIME_VERIFICATION_EVIDENCE_REQUIRED`. The host records the turn as conversation-only with its own observed reference, and a verified claim after tool work without a usable evidence reference is returned to the model for correction instead of failing the turn.
