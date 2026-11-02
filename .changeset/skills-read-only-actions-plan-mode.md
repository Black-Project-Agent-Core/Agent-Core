---
"agent-core": patch
---

Plan mode and the mutation journal now treat all 11 read-only actions of the `skills` tool as reads. `status`, `validate`, `list_revisions`, `list_retired`, `proposals`, `self_awareness` and `explain_improvement` were refused as `PLAN_MODE_READ_ONLY` and journaled as mutations because `src/mcp/mutation-safety.ts` and `src/mcp/skills-tools.ts` kept two different read-only tables. `mutation-safety.ts` is now the single owner; `tests/mutation-safety-skills-actions.test.ts` pins every action of the tool schema.
