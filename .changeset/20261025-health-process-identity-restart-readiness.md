---
"agent-core": patch
---

Add process and build identity to `GET /health` (`process.pid`, `process.startedAt`, `build.stale` when `dist` was written after the process started) and a report-only readiness line to the restart worker, copied into the restart receipt as `readiness`. The line never changes the restart exit code.
