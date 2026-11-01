# Merged from

This pack (app-replica) absorbed the former Skills below. Their full text is kept as stage references; nothing was summarized away.

| Former Skill | Upstream repository | Commit | Upstream path | Upstream SKILL.md sha256 (first 16) |
|---|---|---|---|---|
| replica-recon | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-recon | b1fd6a60cf0bcd48 |
| replica-entrepreneur | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-entrepreneur | 041724878b4c40b1 |
| replica-design | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-design | 34f0375bef33a713 |
| replica-architect | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-architect | 411c429c9b3e6858 |
| replica-backend | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-backend | 8dda218e858f88d3 |
| replica-build | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-build | e50e00ec3ea1cb23 |
| replica-test | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-test | dd27a6fe4d95ea12 |
| replica-diff | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-diff | bd9fc956c347233f |
| replica-brand | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-brand | 3838f17043dc395f |
| replica-launch | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-launch | 082aeac878f9638e |
| replica-deploy | https://github.com/Jakeschincariol/replica-skill | 77c9436fb3d1 | replica-deploy | 3f91a04a0f38162a |

Adapter changes in the moved text: only statements that pointed to files "in this folder" or to sibling folders now point to `references/kit/`. The Agent Core integration paragraph of each former Skill is replaced by the single paragraph in SKILL.md.

Restore: `skills(action=list_retired)` shows each retired original with its digest; `skills(action=rollback_revision, targetDigest=<retired digest>)` brings it back.
