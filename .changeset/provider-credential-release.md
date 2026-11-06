---
"agent-core": patch
---

The AI Models page gets a "Release credentials" action for a configured provider route that cannot answer now. It calls `POST /agent/chat/providers/<id>/reset` for the owner UI only. The route's temporary locks are released (cooldown, quota, scope blocks and an open breaker); invalid and disabled keys stay as they are, and the answer carries the count only. Credential ids, keys and URLs never reach the UI or the logs, and each release is recorded in the activity log with the route id and the count.
