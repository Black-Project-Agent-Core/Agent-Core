---
"agent-core": patch
---

`code_orient` action `context` excludes `release` and `runtime` folders at any depth, case-insensitively, so an install's state folders stay out of the index even when the workspace is registered on a parent folder. The one exception is a path whose first segment is a top-level code folder (`scripts`, `src`, `tests`, or `docs`): `scripts/release` and `src/runtime` stay indexed. `bin` and `obj` stay excluded everywhere, and the protected `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT` folder stays excluded with everything under it. A search root whose path passes through a `release` or `runtime` folder outside the repository is refused.
