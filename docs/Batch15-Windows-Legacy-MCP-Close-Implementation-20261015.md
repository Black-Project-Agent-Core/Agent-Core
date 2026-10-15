# Batch 15 #168 — Windows MCP close completion (2026-10-15)

## Post-user-restart activation readback — 15 October 2026 (current state)

- User reported performing the Agent Core.exe restart locally after the earlier platform-blocked assistant invocation. **No additional restart command was sent by this continuation.** The earlier blocked attempt remains historical and must not be mistaken for an executed restart.
- Actual newly observed Node Agent Core resident is **PID 3732**, started **18:42:27 WIB**; previous resident was PID 2428 (started 16:26 WIB). Batch15 compiled `dist/mcp/handler.js` was emitted **18:11:36 WIB**, before the new resident. Source `legacyJsonFallback` was read back through the new MCP connection and still has the memoized `closePromise`.
- Two recent existing official launcher receipts were inspected: `472046d1747942a28e2da970b7cc9130.json` at 18:40:33 WIB and latest `37b0b410d7d247d9be05d7bdf7b604.json` at **18:41:26 WIB**, each **exitCode=0, error=null**. The second is the latest successful receipt seen. This chronology supports activation; it does not establish who initiated every restart.
- Fresh local `http://127.0.0.1:8765/health`: **status ok**, product **0.15.0-beta.3**, canonical Memory **available**. Successfully connected MCP `read_file` and `list_directory` executed after restart.
- Compiled full public MCP descriptor remains the previous **79 tools / 130773 bytes** with SHA256 `299ada71a13f15506f37f9458d20055bd8389c1c6c664771cd5d9ace3e69c480`. Same app plugin **1.0.6** needs no new ZIP/upload or client refresh because the change is internal only.
- **State now:** Batch15 source compiled, the newer resident observed running after build, normal MCP operations and health observed. Neither a naturally aborted request nor the rare `abort → finally` join behavior was directly exercised; no physical teardown, no improvement metric, and no whole-system runtime certification is inferred.
- The historical **activation pending** text below describes the state before the user's separate restart and is superseded by this section. Canonical Memory record `571fe809-b965-4795-b7fb-187f30c71fac` was updated/read back in place with this new activation evidence; earlier source-build and blocked-attempt details are retained as history.
- The pre-existing host-bound Batch15 task `ext-b0047cff13354482a2b0b39d5cbca38a` received **checkpoint 382** with task-specific idempotency key `batch15-post-user-restart-resident-activation-readback-20261015`, reviewed `complete=true` / `no-new-knowledge`, zero candidates. Unrelated active CME episode was not rotated, and prior Batch15 checkpoint 379 remains historical.
- Cortex supplemental post-user-restart note `298fe725-cecd-4f2f-97dc-0ae40e22accb` was saved/fetched. It supersedes the earlier Cortex restart-pending note for activation only and is not a Memory writer or permission grant.
- Recoverable cleanup from Batch15 earlier in the same task is retained: **93 files / 305772 bytes, 93/93 SHA-256+size verified**, moved to `runtime/backups/batch15-legacy-mcp-close-20261015/cleanup-recovered/node-compile-cache`. The independent, hidden-inclusive final post-persistence readback is stored in `runtime/backups/batch15-legacy-mcp-close-20261015/final-readback.json` and records the actual point-in-time state after all updates, not a presumed perpetual emptiness.

Scope: existing external legacy JSON MCP route only. No OpenSandbox runtime, Native AI extension, new trust owner, or physical shutdown claim.

## Source and predecessor

- Primary root: `E:\Projects\Agent-Core`, branch `codex/cumulative-learning-workflow`, HEAD `70b12611374e1d2aa632f652758a4ced1997fd43`; existing local B13/Hooks/REA/B14 changes preserved.
- Canonical Memory and AGENTS viewed first. Batch14 final post-persistence receipt read: 16:45:51 WIB, temp absent and runtime/tmp empty (predecessor evidence only).
- Previously modified `src/mcp/handler.ts` REA wiring retained. Source checkpoint `8f7929e0-dfb3-45e8-a1bf-a9cf4202f8cd` contains pre-B15 SHA-256 `2efc7b3a44c30bdc8f1c2f218673547e5b405f93e8f9e8839c71573c4c8e4bf6`.
- Installed dependency `@modelcontextprotocol/server` is v2.0.0. Donor provenance: `opensandbox-group/OpenSandbox@c806a49c62ee1fc3baa036165e9044e7b0efd97f` (Apache-2.0). Native concept only; no donor code or dependency installed.

## Change

- Only product file: `src/mcp/handler.ts`, closure `legacyJsonFallback`.
- Replaces boolean `closed` with one request-local memoized `closePromise`, reserved before side effects and started eagerly on first call, including already-aborted requests.
- Transport and product close are attempted once, in order, with independent fail-soft error handling. `abort` callback is nonblocking; `finally` waits for both attempts via the same promise and detaches its existing listener.
- Completion means two close attempts settled, not physical resource destruction. No modern SSE/streaming, Native service, grant, task attribution, event, retry, timeout, or Memory owner change.

## Build and compiled contract

- Official `npm run build` exit 0; path guard 383 authored files / 0 exceptions. Memory/Core TypeScript compiled. `dist/mcp/handler.js` emitted at 18:11:36 WIB. No test suite or synthetic cancellation drill.
- Full compiled descriptor `SubProject/Agent-Core-Batch15-MCP-Schema-20261015.json` is 79 tools / 130773 bytes, SHA256 `299ada71a13f15506f37f9458d20055bd8389c1c6c664771cd5d9ace3e69c480` — identical to B14, 299 bytes under 131072 limit. No new/removed public tool/input schema/description.
- Same installed private Agent Core app plugin v1.0.6 release `pluginrel_6ad0936d34808191923847fd73d202a7` stays current: **no ZIP or re-upload needed**.
- Pending `.changeset/20261015-batch15-mcp-close-completion.md` is patch intent; no release, package version bump, commit or push.
- Original 216 unique research IDs and dispositions preserved. #168 narrowed to native external completion join; #190 records already present phone backend as a premise correction, without phone code changes.

## Activation and runtime evidence

- Before new build, resident Node PID 2428 started at 16:26 WIB, earlier than emitted handler 18:11 WIB. Restart script may run only when compiled code is newer than resident AND there is no public contract delta requiring web plugin re-upload. These are task-level operator checks, not claimed technical capability enforcement.
- **Restart gate decision:** condition 1 true (18:11:36 WIB B15 compiled handler newer than preexisting PID2428 since16:26:16); condition 2 true (compiled full descriptor exactly unchanged, so no plugin re-upload). Exact `Restart-Agent-Core.cmd` was read and chosen. The attempted native `start_process` invocation was **blocked by platform safety checks before execution**. This is an external host tool restriction, not a failed restart receipt. No alternate shell/bypass/retry was attempted; PID2428 remained live in subsequent `list_processes`. **B15 resident activation pending; previous B14 resident remains current.** No product-level two-condition gate was implemented or falsely claimed.
- Canonical Memory/Learning and final recoverable cleanup results are recorded separately from the unperformed restart. The user can execute the existing launcher via their trusted local Windows interface if they elect to finish activation; a subsequent resident/build/health readback will still be required.
- Genuine abort → finally completion branch remains **not-observed**, no physical cleanup success, latency benefit or entire runtime regression test is claimed.

## Final persistence evidence

Canonical Memory: `571fe809-b965-4795-b7fb-187f30c71fac`, read back. Learning: genuine Batch15 task checkpoint 379, scoped review complete/no-new-knowledge (0 candidates). Cortex: saved `4c81ef99-9ad6-430c-8980-6bf8ae377411`.

Recoverable cleanup: project `temp` absent; `runtime/tmp` contained only 93 Node cache files (305772 bytes), no reparse, locks, process references or scheduled-task references. Moved into `runtime/backups/batch15-legacy-mcp-close-20261015/cleanup-recovered/`, using `cleanup-preflight.csv` (per-file path, size, SHA256). Post-move 93/93 hashes and sizes matched, 0 mismatches; `cleanup-receipt.json` confirms recoverable relocation. Final post-persistence readback belongs to `final-readback.json` in the same backup directory.

Activation blocker: although both restart preconditions were true, invoking the exact authorized launcher was blocked by platform safety checks before execution. No alternate route was attempted. B15 resident activation remains pending; no abort-race behavior or physical shutdown benefit is claimed.
