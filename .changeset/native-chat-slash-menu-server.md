---
"agent-core": patch
---

Add the server side of the Native composer "/" menu: an endpoint that lists the `compact` command and the active Skills, and per-turn handling of a Skill chosen with `/<skill-name>`. The chosen Skill is passed to Native as a directive for that turn only; the saved message stays as typed and tool access does not change. The popup in the composer follows in a later change.
