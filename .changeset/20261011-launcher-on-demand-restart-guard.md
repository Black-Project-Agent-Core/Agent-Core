---
"agent-core": patch
---

Stage a guarded, explicit-mode Windows Task Scheduler launcher restart helper with one-shot expiry, exact process identity checks, graceful close, and bounded readiness checks. The existing task remains Preflight-only and the limited-token scheduled preflight fails closed on unreadable launcher process metadata; no live restart was performed.
