---
"agent-core": patch
---

Three hotfixes from the Claude ecosystem donor proposal (Wave 0). The Claude plugin adapter no longer lets a hostile `SKILL.md` stall the server: link scanning covers the first 256 KiB and every quantifier of the link pattern is bounded, so repeated `](` is no longer quadratic. `kill_process` refuses its own PID, its parent's PID and any pid that is not a positive integer, returning an error instead of signalling. `code_surface` (impact and diff) and the changed-symbol review reject `base`, `head`, `refA` and `refB` values that start with `-` before any git or provider call, so an option such as `--output=` can no longer be passed as a revision.
