# Deterministic Advisory Loop Detector — Agent Core

> **Status:** COMPLETE — LIVE-VERIFIED FOR APPROVED SCOPE  
> **Implemented:** 2026-09-18  
> **Parent system:** completed Reflexion controller integration  
> **Primary implementation:** `src\mcp\failure-loop-advisor.ts`  
> **Integration:** `src\mcp\handler.ts`, `src\mcp\server.ts`, `src\mcp\memory-tools.ts`  
> **Outstanding work:** NONE

This document records the completed deterministic repeated-failure advisory hardening. It is advisory-only and is not an execution gate, retry engine, workflow system, or second Reflexion runtime.

## 1. Purpose

Detect consecutive effectively equivalent failed actions and surface concise sanitized no-progress evidence so the AI/controller changes strategy.

The detector does **not**:

- choose a tool;
- change arguments;
- block execution;
- retry automatically;
- force memory recall;
- persist hidden/private reasoning;
- write canonical memory;
- authorize any action.

The controller remains responsible for diagnosis and the next action.

## 2. Detection fingerprint

Implemented fingerprint input:

```text
tool name
+ sanitized canonical arguments
+ normalized sanitized failure family
```

Implementation rules:

- existing `src\security\redaction.ts` is applied before argument fingerprinting;
- object keys are canonicalized in stable sorted order;
- non-semantic `origin` is removed;
- credentials are replaced before hashing;
- arguments are retained only as SHA-256 hashes inside detector state;
- the failure family is redacted and bounded;
- exact effective equivalence is used; no fuzzy semantic matching is performed.

## 3. Bounded state

The detector is process-local and in-memory only.

Current constants:

```text
TTL         : 10 minutes
Max entries : 64
Persistence : none
```

A Node restart constructs a new advisor and therefore clears detector state.

No new database, JSONL file, canonical note, or reflection log is introduced.

## 4. Threshold and reset behavior

Current behavior:

- first equivalent failure: record only;
- second consecutive equivalent failure: append a `repeat` advisory;
- third and later consecutive equivalent failure: append a stronger `no-progress` advisory;
- changed effective arguments start a new sequence;
- changed failure family starts a new sequence;
- any successful tool action breaks the current consecutive-failure streak;
- a success also clears stored failure state for the same tool/effective arguments;
- TTL expiry starts a fresh sequence.

This is intentionally conservative.

## 5. Exempt continuation/status tools

V1 exempts low-signal continuation/status failures:

- `read_process_output`
- `get_more_search_results`
- `list_sessions`
- `memory_status`

The detector remains failure-only; successful repeated calls are never treated as loops.

## 6. MCP integration position

A single `FailureLoopAdvisor` is created by `createMcpHttpHandler()` for the running Node core and shared with MCP server instances created by that handler.

Machine-control path:

```text
tool executes normally
    -> result/exception exists
    -> advisor observes failure/success
    -> optional advisory is appended
    -> original result/error semantics continue
```

Memory path:

```text
memory tool executes normally
    -> handled result exists
    -> advisor observes failure/success
    -> optional advisory is appended
```

The detector runs **after execution**. There is no preflight approval check.

## 7. Advisory behavior

Handled `isError` results preserve their original content and `isError: true`, then receive an additional text item such as:

```text
Reflexion advisory (repeat 2): Repeated equivalent failure detected.
The previous strategy produced no new evidence; change arguments, target,
hypothesis, or diagnostic method before retrying.
```

Third-and-later repeats use the stronger no-progress message.

Repeated thrown `Error` objects keep the same Error instance/type; the sanitized advisory is appended to the error message before rethrowing. The original exception is not converted into a successful result.

## 8. Observability

When an advisory is emitted, Agent Core reuses the existing Activity Tracker:

```text
module : REFLEXION
event  : failure-loop-advisory
level  : info / warn
context:
  tool
  repeatCount
  redacted failureFamily
```

No duplicate reflection log is created.

## 9. Controller contract

`AGENTS.md` now explicitly states that a deterministic `Reflexion advisory` is sanitized no-progress evidence only.

The advisory:

- does not authorize an action;
- does not choose the next tool;
- does not force retry;
- does not block execution;
- requires the controller to change strategy itself.

## 10. Verification evidence

Targeted unit/contract verification:

```text
tests/failure-loop-advisor.test.ts : 9 / 9 PASS
tests/reflexion-contract.test.ts    : 3 / 3 PASS
TOTAL                               : 12 / 12 PASS
```

The loop-detector regression verifies:

- first failure produces no advisory;
- second equivalent failure produces `repeat`;
- third equivalent failure produces `no-progress`;
- changed arguments reset effective sequence;
- changed failure family resets effective sequence;
- `origin` differences are ignored;
- intervening success breaks the streak;
- a fresh advisor instance starts empty, matching Node-restart semantics;
- TTL expiry resets state;
- exempt continuation/status tools do not warn;
- synthetic credentials are absent from retained state/failure family/advisory;
- handled result `isError` semantics and original content are preserved;
- repeated thrown Error identity is preserved while advisory text is surfaced.

Compiled MCP smoke verified:

```text
successful direct MCP call        = ungated
first missing-file failure        = isError, no advisory
second identical missing failure  = isError, advisory appended
original failure text preserved   = yes
```

Live post-activation acceptance on the primary Agent Core runtime verified:

- first real `read_file` ENOENT had no advisory;
- second identical `read_file` ENOENT appended `Reflexion advisory (repeat 2)`;
- third identical failure appended the stronger `repeat 3` no-progress advisory;
- an intervening successful `read_file` broke the streak, so the next same ENOENT again had no advisory;
- `memory_read` against a missing id produced no advisory on first failure and an advisory on the second identical failure;
- synthetic `token=<dummy>` failure records were persisted in redacted form (`token=[REDACTED]`). A later verification search that used the bare dummy value as its search pattern was itself logged by Tool History, creating a synthetic test-only literal; that verification artifact was surgically scrubbed. Final JSONL validation reported `jsonParseErrors=0`, `rawSyntheticSecret=0` in both Tool History and Activity Tracker, with redacted-token occurrences still present;
- Activity Tracker contains `failure-loop-advisory` events;
- post-restart `/health` remained `ok`; Execution, Memory, Game Mode, and Code Intelligence stayed available.

## 11. Build/activation evidence

Root TypeScript build completed with exit code `0`.

The rebuilt Node core was activated with listener/process identity checking on `:8765`. Post-activation health reported:

```text
HTTP/Core          ok
Execution          available / rdc-direct
Memory             available, issueCount=0
Game Mode          available
Code Intelligence  available
Grafel index       current
```

Broader root/UI/.NET regression was not run; broad testing remains separately user-authorized.

## 12. Rollback boundary

Rollback is limited to:

- `src\mcp\failure-loop-advisor.ts`;
- advisor wiring in `src\mcp\handler.ts`;
- machine-control wrapper hooks in `src\mcp\server.ts`;
- memory wrapper hooks in `src\mcp\memory-tools.ts`;
- the related targeted regression test and controller advisory sentence.

Rollback must not alter:

- canonical Agent Core Memory;
- Tool History;
- Activity Tracker history;
- machine-control routing;
- the Reflexion durable-lesson protocol.

## 13. Completion state

The approved advisory-loop-detector scope is implemented, activated, and live-verified.

**Outstanding work from this plan: NONE.**

## 14. 2026-09-20 Reflexion second-wave extension

The exact-repeat detector remains active exactly as documented above. The user-approved second wave adds a sibling broader stagnation signal without replacing first-wave behavior:

- exact tool + canonical args + failure family still emits repeat on the second equivalent failure and no-progress on the third;
- a separate process-local streak tracks consecutive same-tool + same-normalized-failure-family outcomes independent of arguments;
- that broader streak emits only on the third same-family failure when argument variation has actually occurred;
- success, different failure family, TTL expiry, reset, and existing continuation/status exemptions break or avoid the broader streak;
- advisory Activity Tracker events now include scope=exact|failure-family;
- the broader signal remains advisory-only and never blocks, retries, routes, authorizes, or invokes memory.

The same second-wave task also adds compact failure evidence to Tool History. Failed calls capture a redacted bounded failure-family/excerpt capsule before the normal raw-output 4 KiB cap. Full/default get_recent_tool_calls output intentionally hides that internal field; explicit compact=true returns the bounded capsule, and failuresOnly=true filters away unrelated successes.

Targeted second-wave verification passed tests/failure-loop-advisor.test.ts + tests/reflexion-second-wave.test.ts + tests/reflexion-contract.test.ts at 3 files / 18 tests after live acceptance exposed and closed volatile absolute-path normalization for coded failures. Root TypeScript build passed. Compiled schema smoke accepted compact=true/failuresOnly=true. release:compat remained 62 -> 62. The rebuilt Node core was live-activated as PID 18776 at 2026-09-20T14:46:49+07:00 with /health=ok and Memory/Execution available. Final live acceptance used three ENOENT read_file failures with different absolute paths; calls 1–2 were ordinary failures and call 3 emitted the new failure-family no-progress advisory. The current chat connector may require reconnect/reinitialize to refresh its cached get_recent_tool_calls input schema before compact/failuresOnly are forwarded by this client.
