> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# TencentDB Agent Memory Steal / Use Integration Plan

> **Status:** COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — REFERENCE RETIRED
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\12-TencentDB-Agent-Memory`
> **Revision:** `b545fe9acf08b47b56d85872eb04b6aee24c85eb` (branch `feat/server_team`, clean before inspection marker)
> **License:** MIT
> **Runtime dependency:** NONE
> **Scope exclusion:** New Chat, session/offload/model runtime, prompt injection.

## 1. Grounding evidence

Fresh source census: 1,103 files, 891 executable-code files, 8 test-code files, 33,654,237 bytes, 0 reparse points.

Executable census covered MemoryCore, MemoryKnowledge, MemoryProxy, MemoryPanel, SDK/adapters/deploy trees. The selected mechanisms were taken from executable source, not product documentation.

Grafel registration succeeded but the checkout graph is unavailable in the current provider session; exact source is authority.

Two current Agent Core gaps were verified:
- `LearningStateStore` persists one shared `state.json`; `checkpoint()`, `review()`, and `curate()` each perform independent load -> transition -> save without a serialized state mutation primitive. Atomic file replacement prevents torn files but does not prevent lost read-modify-write updates.
- `memory_list` has no cursor/limit contract; Skill listing uses a fixed upper slice but no continuation cursor.

## 2. Selected proposals

### TDB-P1 — serialized Learning state transactions + field ownership

Source mechanism:
- `MemoryCore/src/utils/checkpoint.ts`;
- same-path process-wide async serialization;
- re-read **inside** the held critical section;
- atomic replacement;
- explicit state-owner separation to avoid one subsystem clobbering another;
- distributed lock errors/lost ownership fail without treating the write as successful.

Narrow Agent Core adaptation:
- add a local `LearningStateStore.mutate()`/transaction primitive that:
  - serializes same-state-file mutations;
  - reloads the latest state after admission;
  - applies one typed transition;
  - atomically persists;
  - returns committed state/result;
- route checkpoint/review/curator state transitions through this primitive;
- make ownership explicit:
  - checkpoint cadence/idempotency fields;
  - review/rejection fields;
  - curator timestamp fields;
- preserve current single-process/local architecture; **do not add Redis or distributed locking**;
- reuse Agent Core-owned persistence/locking primitives;
- persistence failure must not be reported as a successful state transition.

Acceptance:
- concurrent checkpoint calls cannot lose increments/idempotency records;
- concurrent review and curator updates preserve both transitions;
- transition callback operates on state reread inside serialization;
- failed save leaves prior committed state authoritative;
- no new scheduler/worker/DB/network dependency.

### TDB-P2 — bounded opaque cursor pagination for growing list surfaces

Source mechanisms:
- `core/storage/list-page.ts`: stable key ordering and resume strictly after marker;
- generation-log list: reverse-time ordering with deterministic tie-breaker and opaque base64url cursor.

Agent Core adaptation:
- preserve existing `memory_list` response for backward compatibility;
- add an opt-in read-only paged Memory listing surface (prefer a dedicated `memory_page` tool rather than changing legacy response shape);
- optionally add `skills(action=list_page)` using the same utility once the Memory contract is stable;
- cursor contains only bounded opaque state: stable sort key + snapshot/state digest + checksum/version;
- continuation fails closed as stale if the canonical collection snapshot changed materially, rather than silently skipping/duplicating records;
- deterministic order, bounded limit, workspace filtering and pinned foundation semantics;
- no server-side session cursor or background state.

Acceptance:
- identical snapshot + cursor produces deterministic non-overlapping pages;
- modified collection invalidates a snapshot-bound cursor explicitly;
- malformed/tampered cursor fails closed;
- legacy `memory_list` remains unchanged;
- page limit bounds MCP output independently of total Memory count.

## 3. Covered / rejected source families

Covered:
- Memory generation logging concepts by existing Memory provenance/revision history + Activity Tracker for current non-generative Memory;
- generic backup/checkpoint functionality by Agent Core file checkpoints, revisions and project backup conventions;
- L1 candidate recall/dedup by current Memory retrieval/consolidation/link systems;
- skill versioning by current SkillService stage/promote/rollback lifecycle.

Rejected:
- Redis/distributed checkpoint lease for current single-Core architecture;
- LLM conflict adjudication/automatic Memory rewriting;
- Mongo/SQLite/TCVDB and alternate BM25/embedding stores;
- offload/session/context-token/local-LLM hooks;
- MemoryProxy/MemoryPanel/MemoryKnowledge alternate runtime/server/UI stacks;
- Kafka/Langfuse/OTel/ClickHouse telemetry stack;
- plugin adapters and deployment stacks.

## 4. Reference disposition

**RETIRED/DELETED 2026-09-27.** TDB-P1/P2 were independently implemented and targeted-verified. Fresh post-adoption census found zero current `src`/`scripts` path dependencies, zero non-shell live consumers, and no remaining current-fit ecosystem family. Retirement evidence: `runtime/tmp/graphiti-claude-codemem-tencent-post-adoption-retirement-20260927.json`.

## 5. Approved implementation closure — 2026-09-27

- **TDB-P1:** `LearningStateStore.mutate(owner,...)` serializes same-state-file read-modify-write operations, rereads after admission, enforces checkpoint/review/curator field ownership, and atomically persists. `LearningService.checkpoint/review/curate` now use this path. No Redis/distributed lock, scheduler, or second state store was added.
- **TDB-P2:** `src/memory/page.ts` plus `memory_page` provide deterministic bounded pagination with versioned opaque checksum-protected cursors bound to the exact canonical snapshot/workspace. Tampered cursors fail closed; canonical drift returns stale-cursor failure; legacy `memory_list` is unchanged.

Verification directly covers 20 concurrent same-file Learning mutations with zero lost increments, owner violation rejection, deterministic non-overlapping pages, cursor tamper rejection, and stale-snapshot rejection. Targeted suite 12/12 PASS; build PASS; path policy 258/0. After the user-controlled restart/reconnect, resident Core PID 1624 is running `runtime\node\node.exe -> dist\index.js`, `/health` is `ok`, the fresh connector exposes 70 tools, and `memory_page` executes live with snapshot-bound opaque pagination. TDB-P1/P2 are therefore live-activated and installed-runtime verified.
