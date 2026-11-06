---
"agent-core": patch
---

`code_orient` action `context` indexes `release` and `runtime` folders that sit below the workspace root (for example `scripts/release` or `src/runtime`). They stay excluded directly under the root, where they hold install state. `bin` and `obj` stay excluded everywhere, and the protected `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT` folder stays excluded with everything under it. A search root whose own name is `release` or `runtime` is still refused.
