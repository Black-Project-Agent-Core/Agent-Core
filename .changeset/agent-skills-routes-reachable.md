---
"agent-core": patch
---

Make the launcher Skill panel routes reachable: `GET /agent/skills` and `POST /agent/skills/:name/native-enabled` were declared inside the `/agent/chat/` branch of `src/http/app.ts` and always answered 404. They now sit before that branch, work without a chat service, and return the short digest without the `sha256:` prefix. Covered by `tests/agent-skills-http.test.ts`.
