---
"agent-core": patch
---

Persist the local user pre-authorization for Grafel `.grafel/group.json` creation so Agent Core controllers automatically supply `allowRepoMarker=true` without repeated prompts while preserving marker-conflict, protected-path, and explicit-deny gates.
