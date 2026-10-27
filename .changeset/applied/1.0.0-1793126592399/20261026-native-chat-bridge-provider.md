---
"agent-core": patch
---

`scripts/external/native-chat-bridge.mjs send` accepts `--provider <id>` and forwards it as the turn's `providerId`, so an external controller can pin a Native turn to one route listed by `GET /agent/chat/providers` instead of the automatic rotation. A malformed id is rejected before anything is sent; the server still validates the route.
