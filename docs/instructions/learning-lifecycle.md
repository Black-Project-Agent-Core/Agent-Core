# Task and finalization

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

**MANDATORY LEARNING FINALIZATION AFTER MEANINGFUL WORK.**

- After a meaningful completed user task, prepare the user-facing answer first, then finalize Learning before sending that answer.
- Start each meaningful external task with `controller_learning(action=episode, episodeOperation=start, taskKey=<stable key>)`. A connection is not a task. Call `learning(action=checkpoint)` once with the returned episode `taskId` and a stable task-scoped `idempotencyKey`. Include bounded inspectable `evidenceRefs` and the relevant `workspace` when known.
- Use reason `verified-recovery` after a real failure was corrected and verified, `user-correction` after a material user correction, `explicit-learn` when the user explicitly asks to learn/distill, otherwise `task-complete`.
- If the checkpoint reports `reviewDue=true`, call `learning(action=status)`, review the bounded pending evidence, derive verified reusable candidates if warranted, then call `learning(action=review)` with explicit `checkpointKeys` and the same `taskId`. Associate candidates with their originating checkpoint. Empty reviews require `disposition=no-new-knowledge`, `awaiting-verification`, or `rejected`. Legacy unscoped capture never clears pending reviews. Preserve partial successes and retry unresolved candidates.
- Direct `memory_remember`/`memory_update`, Reflexion promotion, or a successful final answer does **not** substitute for this checkpoint/review lifecycle. After a verified recovery, use checkpoint reason `verified-recovery` even if a durable Memory was already written; the later review may legitimately resolve to duplicate or nothing worth saving.
- Do not persist raw chain-of-thought, secrets, or unverified hypotheses. Learning semantic judgment remains the controller's job; Agent Core validates and persists accepted evidence/knowledge.
- Declare work outcome separately from Learning status. Source identity and model-declared `verified=true` do not prove a claim; verification must be independently repeatable. Record actual applied/adapted/rejected reuse with the delivered revision, task, action and verification references; exposure is not use.
- Learning remains fail-soft. A Learning failure must be reported truthfully but must not erase an otherwise verified user-task result or authorize blind retries.
- This finalization rule is a top-level local operating behavior, not an optional periodic housekeeping suggestion. Merely returning a successful task result without the required checkpoint is incomplete Agent Core controller behavior.

## External Memory v2 task selection

- Inspect canonical Memory first using the existing list/read tools. Bind a real task before external memory_v2_read/write, including capability discovery.
- Start a controller_learning episode with a stable taskKey and registered workspace; use its returned episode ID as the top-level scope.taskId for external v2 calls. Do not invent task IDs or supply workspace/owner overrides in payloads.
- Authenticate credential ownership and current workspace registration on each request. Reject missing, foreign, stale or unbound task scopes rather than silently treating a connection as a task.
- Native execution keeps host-owned identity. Serialize Learning activation, observed operations and checkpoint/review within each task session; switching Memory tasks does not switch the active Learning head.
- After connector upgrade, refresh exposed tool schemas. If top-level scope is unsupported by the client, report the blocker instead of bypassing task binding.

