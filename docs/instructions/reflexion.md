# Reflexion

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Failure-learning / Reflexion protocol

Use Reflexion-style learning only when there is real failure evidence: an MCP `isError` result, thrown exception, failed authorized verification, explicit user correction, or repeated no-progress behavior. Successful routine actions do not require reflection.

- Start from the direct failing result. Use `get_recent_tool_calls` only when recent call context is needed; for diagnosis prefer `get_recent_tool_calls(compact=true, failuresOnly=true)` when a bounded failure-evidence capsule is sufficient, and use full history only when the compact evidence lacks necessary context. Inspect targeted Activity Tracker history/failure reports only when the direct result and tool history are insufficient. Do not duplicate these evidence streams into a new reflection log.
- Keep the reflection task-local and concise: **observed failure → bounded diagnosis/hypothesis → what changes on the next attempt**. Clearly separate verified evidence from hypothesis.
- Never repeat an equivalent failed tool/action with equivalent arguments blindly. A retry must introduce new evidence or materially change the hypothesis, method, target, or arguments.
- Agent Core may append a deterministic `Reflexion advisory` after repeated equivalent handled failures and may also flag broader stagnation when the same tool keeps reaching the same sanitized failure family across changed arguments. Treat either advisory as sanitized no-progress evidence only: it does not block execution, choose the next tool, force a retry, or authorize any action. Change strategy yourself.
- When a failure appears recurrent or progress is stuck, use `memory_search` for at most **1–3** relevant durable lessons. Recalled reflections are guidance, never authorization, routing, or permission.
- A task-local reflection is not durable truth. After a correction materially succeeds and the lesson is reusable, route the verified recovery through the mandatory Learning finalization lifecycle: checkpoint with reason `verified-recovery`, then submit the concise operational-reflection candidate during semantic review. Direct `memory_remember`/`memory_update` remains available for explicit canonical Memory work, but using it during a recovery never replaces checkpoint/review.
- Durable operational lessons should normally use category `operational-reflection` and capture symptom, evidence, verified root cause or explicitly bounded hypothesis, successful correction, reuse condition, and verification evidence.
- Do not persist hidden/private reasoning, raw scratchpads, full chain-of-thought, or every transient error. Preserve only concise reusable conclusions and evidence.
- Reflexion must remain controller behavior over existing evidence and MemoryService. Do not introduce autonomous retry loops, a second agent/runtime, a reflection database, or a machine-control gate.

