---
"agent-core": patch
---

A read-only lint for the Skill pack sources. `scripts/verify/skill-pack-lint.mjs` parses every pack in runtime/skills/capability-packs with the strict SkillService parser and reports a baseline: parse and name errors, packs over the 8192-byte page size, Non-triggers text shared by many packs, dangling links, files a pack carries outside references/ that `skills(read)` cannot deliver, bash examples without a PowerShell equivalent and incomplete UPSTREAM.json provenance. `--strict` exits 1 on an error; `--remote` additionally compares each pinned upstream commit with the upstream HEAD and is the only mode that uses the network. Nothing is written and no Skill changed.
