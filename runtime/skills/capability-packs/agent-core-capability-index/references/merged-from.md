# Merged from

This pack (agent-core-capability-index) absorbed the former Skills below. Their full text is kept as stage references; nothing was summarized away.

| Former Skill | Upstream repository | Commit | Upstream path | Upstream SKILL.md sha256 (first 16) |
|---|---|---|---|---|
| using-agent-skills | https://github.com/addyosmani/agent-skills | aeac41d4d005 | skills/using-agent-skills | 30787ef2c77bf1a4 |

Adapter changes in the moved text: only statements that pointed to files "in this folder" or to sibling folders now point to `references/kit/`. The Agent Core integration paragraph of each former Skill is replaced by the single paragraph in SKILL.md.

Restore: `skills(action=list_retired)` shows each retired original with its digest; `skills(action=rollback_revision, targetDigest=<retired digest>)` brings it back.
