---
"agent-core": patch
---

Add an optional AGENTS.md file to the operator-selected Native profile: 4,096-byte bounded read, same safe-read and snapshot rules as SOUL, injected after SOUL for every audience under an explicit precedence line (fixed Native policy, the AGENTS.md contract and the current request win). The metadata schema defaults the new file to absent so stored turn metadata keeps parsing. No new store, tool grant or automation; absent files still fall back to the existing prompt.
