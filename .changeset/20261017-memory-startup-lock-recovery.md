---
"agent-core": patch
---

Allow cold Memory initialization to wait through the existing orphan-lock expiry after a restart, while preserving normal operation timeouts and active-writer exclusion. Include bounded canonical initialization failure details in host startup errors instead of hiding them behind ENGINE_NOT_ENABLED.
