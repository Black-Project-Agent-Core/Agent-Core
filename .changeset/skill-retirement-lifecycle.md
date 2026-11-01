---
"agent-core": patch
---

Add a retirement step to the Skill lifecycle. `skills(action=retire)` (confirmation `RETIRE_SKILL`, exact active digest, evidence, optional active successor) archives the active Skill into its revision history and removes it from the active catalog without deleting anything; `list_retired` lists retired Skills with their restorable digests, and `rollback_revision` with the retired digest brings one back. Importing the same name again ends the retirement. Covered by `tests/skill-retirement.test.ts`.
