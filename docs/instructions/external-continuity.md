# External continuity

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Capability awareness and usage disclosure — 2026-10-07

### External continuity, claim review and proposal documents — 2026-10-19

- External tasks should start/reconnect with the same `controller_learning` episode `taskKey`, registered workspace and `description` containing the goal. Inspect `memoryTask` linkage; a missing/unavailable link is not a Memory checkpoint. Omitting description preserves the manual `memory_v2_write(action=task_start)` workflow. Existing paused/completed Memory tasks are not reopened automatically.
- Use the returned host taskId with Memory tools. Read `task_context`, expand handle-only sources with paging, revalidate stale/unknown evidence, then append explicit constraints, failed paths, blockers and next action using stable operation IDs and current episode revisions. Checkpoint Memory at handoff; Learning checkpoint/review remains a separate finalization obligation.
- Direct external recall stops local asynchronous waiting after 15 seconds or caller cancellation. This does not cancel provider work, preempt synchronous filesystem calls, undo an admitted durable disclosure, or prove network delivery. Do not replay an ambiguous mutation.
- External `memory_v2_read(action=capabilities)` exposes the structured `claim_review` guide. Define HOW (reality/decision/dependency/relevance, claim, scope, authority, method) separately from WHEN (triggers/cadence). Append revision-bound attempts with actual available evidence. Unavailable checks stay unresolved; last-success history does not advance on failure. Review metadata is controller-assessed and advisory: it never automatically rewrites, retires or promotes a fact or grants permission.
- Active external Skill/improvement proposals **and revisions** must have a readable `.md` document under `<PROJECT_ROOT>/docs/proposals`. Read `docs/proposals/REVIEW-GUIDE.md` for structured authoring/revision steps. Use existing Learning/Skills proposal ownership for Skill records; its explicit external projection is `docs/proposals/skills/<workspace>/<semantic-name>.md`. Generic improvement Markdown remains a document, not a fabricated Skill state. Preserve Native runtime paths/behavior.
- After the exact approved scope and its required verification are complete, archive the readable proposal `.md` in `<PROJECT_ROOT>/docs/history-agent-core`. Preserve decisions, revisions, evidence and completion date; verify the target/readback, update links and give the user the archive link. APPROVED alone is not complete. Keep mixed documents with open/unapproved packages active. Archive the human-readable document only; never relocate canonical Native/runtime/Skill state or overwrite existing history. Follow the guide's explicit archive procedure after existing publication/Learning finalization.
- After writing, read back the exact path/revision and tell the user what to review. Dashboard → Proposals to review shows document cards, paths, status and a Markdown reader. Cards/GET never approve, build, activate or invent user-message evidence. APPROVE / REVISE / HOLD / REJECT use the existing explicit decision workflow; missing, unknown or drifted documents cannot substitute for an exact user decision.


Use the registered capability inventory and task-relevant descriptors automatically when they materially help the current task. The inventory is a current projection of existing owners, not another permission system. Discoverable, granted, selected, used and beneficial are different states.

A CAPABILITY USAGE NOTICE is generated from actual tool dispatch or a delivered artifact's applied/adapted declaration. Relay it once in the current user response, grouping related capabilities instead of listing every primitive call. External capsule exposure is not confirmed user delivery. Do not claim a Skill was used merely because it appeared in context; use the exact delivered revision for artifact attribution. Missing outcome verification does not turn an actual-use declaration into a benefit claim.

Keep unused capabilities and routine Memory/file/config/Learning plumbing silent. Native final-response composition adds the canonical usage sentence once; the model should not duplicate it. Do not install, activate or grant permissions because a capability is relevant. Host-only plugins/connectors remain unknown unless an actual host registration bridge exists.

