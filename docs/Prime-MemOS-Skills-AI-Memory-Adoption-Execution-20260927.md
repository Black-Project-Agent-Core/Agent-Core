# Prime Agent / MemOS / Anthropic Skills / AI-Memory Adoption Execution — 2026-09-27

> **Status:** COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED
> **Product version:** 0.13.0
> **Planned release:** 0.14.0
> **Release intent:** `.changeset/20260927-prime-memos-skills-ai-memory-wave.md` (minor)

## Implemented scope

- **PRIME-P1:** canonical same-target filesystem mutation serialization for `write_file`, `edit_block`, and source/destination move ownership; realpath aliases converge and multi-path acquisition is deterministic.
- **PRIME-P2:** TerminalManager retains its bounded in-memory tail and gains ordered stdout/stderr full-output spill under `runtime/terminal-output`, bounded by bytes, age, and file count with explicit complete/degraded status and digest.
- **PRIME-P3:** bounded HTTP AsyncIterable consumption explicitly settles the iterator on early error while preserving the original source/limit failure.
- **MEMOS-P1:** durable Activity Tracker `featureOutcome` events feed a bounded, deduplicated, positive/negative, small-sample-shrunk Learning evidence pool that emits curator proposals only.
- **MEMOS-P2:** Memory retrieval suppresses only deterministic exact-equivalent direct slots after ranking and before result-budget/neighbor expansion; canonical Memory is never merged or mutated.
- **MEMOS-P3:** verified Grafel exemplars must now be resolvable and deterministically coherent with candidate trigger/steps before code-pattern capture.
- **SK-P3:** the Agent Core-owned offline MCP task-effectiveness evaluator is present and qualified against a real HTTP MCP fixture, including read-only mutation refusal, correctness, tool counts/timing, guards, and incomplete-run handling.
- **AIM-P3:** Memory provenance can carry stable hashed repository/worktree identity plus bounded Git checkpoint evidence without source mutation or raw rename/untracked path disclosure.
- **AIM-P4:** `memory_list`, `memory_read`, and `memory_search` return explicit `historical-data` trust metadata; stored Memory body bytes remain unchanged and are never promoted to instruction authority.
- **AIM-P5:** existing Learning state stores bounded 30-day proposal/rejection fingerprints as advisory evidence; unchanged evidence can surface prior review while changed evidence reopens review.

## Qualification evidence

- New direct acceptance: `tests/four-plan-adoption-wave.test.ts` — **12/12 PASS**.
- SK-P3 real HTTP MCP fixture: `tests/mcp-task-effectiveness-eval.test.ts` — **2/2 PASS**.
- MEMOS-P3 scoped Grafel Learning cases: **5/5 PASS**, with unrelated relocation cases deliberately excluded from this gate.
- MCP manifest contract: **2/2 PASS**, public surface remains **64 tools** and handshake budget stays within 120,000 bytes / 30,000 approximate tokens.
- Final TypeScript `--noEmit`: **exit 0**.
- Final isolated source compile: **exit 0** to `runtime/build/four-plan-adoption-20260927-final/dist`.
- Qualification-time `release:compat`: `ok=true`, `breakingEvidence=false`, no removed tool/route. Final resident activation was verified separately by CAS cutover + 24/24 installed-hash readback.
- `release:check-intent`: `ok=true`; release plan is `0.13.0 -> 0.14.0`, aggregate minor, 11 pending intents.
- Structural Grafel review was run only after graph status was `current`. Impact stays on expected Memory MCP/server, Memory search, Learning tool/service, and Grafel pattern test surfaces; exact current source was used to validate material findings.

A related regression sample produced **86 PASS / 5 FAIL**. Those five are not used as acceptance for this wave: two are host junction fixture creation failures (`EISDIR`), one is an older portability startup fixture missing `projectRoot`, one is a stale schema assertion predating this wave (`effectEvidence`), and one legacy in-memory MCP transport test still times out. AIM-P5 was separately proven through direct `LearningService.review` with legacy state plus the real HTTP MCP SK-P3 fixture.

## Runtime repair encountered during implementation

The desktop blank-black state was traced to a stale/mixed active `dist`: `dist/http/app.js` imported missing `dist/agent-runtime/http.js`, while exact current `src/http/app.ts` had no Native Agent import. Current source passed no-emit; a clean staging compile was built, active Node dist was backed up and repaired (`377` existing artifacts backed up, `383` staging artifacts copied), and launcher-owned Core recovered to `/health = ok` on v0.13.0. WebView diagnostics then loaded `index.html`, CSS, and JS with HTTP 200 and the new session had no UI JavaScript error.

Recovery backup: `runtime/backups/core-dist-repair-20260927`. Pre-implementation scoped backup: `runtime/backups/four-plan-implementation-20260927`.

The recovery cutover happened **before** the final MEMOS-P1/P3 and AIM-P4/P5 edits, so a final qualified candidate was built at `runtime/build/four-plan-adoption-20260927-final/dist`. Final resident activation is now complete: the CAS manifest at `runtime/tmp/four-plan-final-activation-20260927/manifest.json` installed **24/24 artifacts** and `cutover-result.json` records `rollbackRequired=false`. Fresh readback verifies **24/24 active artifact hashes match the candidate**. The current launcher (PID `15800`) and Node Core (PID `20432`) started after that cutover; `/health` is `ok` on v0.13.0 with Memory canonical/index/embedding/intelligence available, Grafel available/current, Semantic IDE available, and Learning available. Live Memory output exposes explicit `historical-data` trust metadata and live Learning state exposes `recentRejections`, confirming AIM-P4/P5 are resident.

## Boundaries preserved

No new database, daemon, model judge, autonomous promotion loop, duplicate Memory store, duplicate execution stack, or new public MCP tool was introduced. No dependency installation was required. No `release:apply`, version bump, commit, tag, push, publish, or deploy was performed. Protected reference checkouts were not modified or deleted; they remain retained until a separate explicit zero-value/destructive retirement census.
