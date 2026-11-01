# Merged from

This pack (requirements-and-planning) absorbed the former Skills below. Their full text is kept as stage references; nothing was summarized away.

| Former Skill | Upstream repository | Commit | Upstream path | Upstream SKILL.md sha256 (first 16) |
|---|---|---|---|---|
| interview-me | https://github.com/addyosmani/agent-skills | aeac41d4d005 | skills/interview-me | ace4b675999bb504 |
| idea-refine | https://github.com/addyosmani/agent-skills | aeac41d4d005 | skills/idea-refine | 21ef828e3a214424 |
| spec-driven-development | https://github.com/addyosmani/agent-skills | aeac41d4d005 | skills/spec-driven-development | c4b97ce3d7f24be0 |
| planning-and-task-breakdown | https://github.com/addyosmani/agent-skills | aeac41d4d005 | skills/planning-and-task-breakdown | ed0f90cc5951ddd4 |

Adapter changes in the moved text: only statements that pointed to files "in this folder" or to sibling folders now point to `references/kit/`. The Agent Core integration paragraph of each former Skill is replaced by the single paragraph in SKILL.md.

Restore: `skills(action=list_retired)` shows each retired original with its digest; `skills(action=rollback_revision, targetDigest=<retired digest>)` brings it back.
