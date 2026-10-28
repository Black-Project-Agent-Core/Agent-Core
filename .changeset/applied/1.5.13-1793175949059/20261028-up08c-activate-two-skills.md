---
"agent-core": patch
---

The two newly built Skills, `windows-powershell-host` and `skill-authoring`, are activated in the Skill catalog on the owner's instruction. They were imported from their source folders with the SkillService import path, so the active digests equal the source digests, a lexical search for a PowerShell exit-code question ranks `windows-powershell-host` first, and the catalog scans 45 valid Skills with none invalid. The capability index was not changed.