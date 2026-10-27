---
"agent-core": patch
---

The dashboard "Proposals to review" list now shows only proposals that still wait for the user: undecided (`PROPOSED`, `DRAFT`, `AWAITING`), on hold (`HOLD`, `DEFERRED`) or needing revision (`REVISE`). Approved, implemented, completed, closed, superseded, archived, withdrawn and rejected proposals, and Skill proposals in the matching states, are no longer listed. A document whose status cannot be classified stays visible. The full catalog (`list()`, exact reads and the MCP `proposals` action) is unchanged.
