---
"agent-core": patch
---

Pictures that tools return to Native are now counted as a fixed token estimate (3,300 per picture, an upper bound for accounting, not an invoice) instead of as the length of their base64 text. Before, one picture could inflate the context bound by its whole base64 size and make a route look too small for the request. A request without pictures is measured byte for byte as before. The provider's observed input-token ratio now leaves the picture tokens out. `AGENT_CORE_NATIVE_VISION=off` is a new rollback switch, read at call time: pictures are left out of the tool result and its text says so.
