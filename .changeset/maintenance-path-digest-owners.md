---
"agent-core": patch
---

Merge two more groups of identical helper functions into one owner each without changing behaviour: the path-containment test (`pathInside` in `src/portability/paths.ts`, replacing four local copies; `src/semantic-ide/path-safety.ts` still exports `inside`) and the Native turn digest (`sha256Digest` in `src/agent-context-compaction.ts`, replacing a copy in `src/agent-turn-checkpoint.ts`). Maintenance evidence and the groups left open are in `docs/verification/Maintenance-Pass-20261102.md`.
