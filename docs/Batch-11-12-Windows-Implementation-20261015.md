# Batch 11–12 — Windows adoption and activation (2026-10-15)

## Scope and source provenance

- Primary checkout: `E:\Projects\Agent-Core`, registered workspace `agent-core`; active branch before and after: `codex/cumulative-learning-workflow`.
- Initial HEAD and source baseline: `5a6c7ffb72a8ba63f6489fadf1dbc0eeafc788b5`.
- Explicitly authorized official source: `origin/main` at `70b12611374e1d2aa632f652758a4ced1997fd43`, with the baseline as its exact parent. Local `git fetch origin main` confirmed ancestry; a single `git merge --ff-only origin/main` advanced HEAD without a branch switch, reset, rebase or push.
- Official delta: 25 files / 19 TypeScript, plus maintained documentation, one patch release intent and the 216-candidate register. Source commit is the final local HEAD.
- Pre-existing local `docs/CODEBASE.md` addition covering `docs/diagrams/Agent-Core-Full-Anatomy/` was copied to `runtime/backups/batch11-12-windows-20261015/CODEBASE-before-integration.md`, SHA-256 `2D65D3DC80E073AAA0A8230F9E659B195C4C542133D4DE186D75A558C9215512` on both sides, temporarily removed to admit fast-forward, and restored alongside the new Linux section. The untracked diagram tree and plugin 1.0.4 ZIP were preserved; nothing in those trees was deleted.
- The candidate register still contains 216 entries with 216 unique IDs. Historical category counts remain reuse 88, defer 54, extend 15, reject 38 and no-source 21. Only #36/#27 selected submechanism annotations were adopted.

## Implemented contracts

- **Batch 11 / #36:** Existing Learning procedure fingerprint retained. Contract-v1 digest binds exact trimmed name/steps, resolved workspace, purpose/description, effective trigger and sorted unique tool names. In-transaction field-level conflicts precede support/failure changes. New evidence receipts are task+digest+outcome+own references, bounded at 32 per procedure and 32 refs each; legacy arrays are not retroactively attributed. Qualification replays each receipt independently, and approved/active Skill lifecycle remains attribution-only absent explicit user decision. External/native outcomes bind the delivered contract revision.
- **Batch 12 / #27:** Existing experience Memory checks project-synthesis eligibility before temporal/supersession selection and all ranking/neighbors, for both normal search and controller recall. Real host-bound scope is required; shared cache with 32 distinct synthesis-graph resolutions (not all file reads), 15-second-or-shorter absolute deadline, zero automatic retries and ancestry-cycle guard. Rejected synthesis cannot displace ordinary records; timeout, missing scope and drift withhold affected synthesis while ordinary Memory remains fail-soft. Aggregate ledger and diagnostics contain no dependency body or private path.
- No new model-facing schema, MCP tool, donor runtime, dependency, second store or execution permission was introduced. Source implementation details and static Linux review stay in `docs/Batch-11-12-Linux-Implementation-20261015.md`.

## Windows build and descriptor

- Official root `npm run build`: **exit 0**; built-in path policy **372 authored files, 0 exceptions**; Memory and Core TypeScript emitted.
- Rebuild emitted `dist/learning/service.js` and `SubProject/agent-core-memory/dist/memory/service.js` after the new source revision. There was no broad test suite, synthetic fixture or benchmark.
- Fresh compiled-registration schema artifact: `SubProject/Agent-Core-Batch-11-12-Windows-MCP-Schema-20261015.json`, **78 tools / 130539 bytes**, SHA-256 `605fa606c60cff875272e3f438f4cc69e82fb0a5213ad15ef2d8039a3deefb45`. Its hash is byte-for-byte identical to the prior Windows Batch 10 full schema. Reviewed cohort: 75 tools / 124403 bytes, not a substitute for the full client descriptor. Linux published full 78 / 130219 bytes differs by the existing 320-byte platform-specific `start_process` description.
- Owner-side ChatGPT plugin metadata readback confirms same private `plugin_asdk_app_6acd4cde8b008191bf289261ed843a17`, installed version **1.0.4**, current release `pluginrel_6ad0031b71d88191a7739fa2238ae80b`. No ZIP, upload, authentication, tunnel or grant change is required by this source adoption.

## Resident activation and actual observation

- Existing `Restart-Agent-Core.cmd` was invoked; its controlling tool call was interrupted, so no blind retry was sent. Subsequent independent restart receipt `runtime/restart/f5a8dd64b0e540af9b7be6116f5f2171.json` records `exitCode=0` and no error; the newest resident launcher PID **12648**, Node Core PID **8108** started after compilation, at about 11:22 WIB.
- Independent local `http://127.0.0.1:8765/health` readback: `status=ok`, `version=0.15.0-beta.3`, Memory `available`. Canonical owner is `runtime/memory` through validated schema-2 `runtime/memory-v2-activation.json` and `src/memory/host-runtime.ts`; no historical `runtime/memory-v2` owner was initialized.
- Actual `controller_learning(context)` for the new authorized `agent-core` episode returned v1 synthesized context but task-memory capsule `MEMORY_TASK_NOT_FOUND` (advisory unavailable), not an empty successful v2 result. Real ordinary `memory_search` delivered historical records. Neither flow established a new verified procedure receipt, nor proved project-synthesis current/stale/unknown/cycle/deadline behavior. Those branches, compatibility conflicts and measured reuse benefit remain **unobserved**, not automatically qualified.
- Batch 10 genuine raster + declared sourceFiles preview usage remains separately unobserved and is not an acceptance gate here.

## Canonical Memory, Learning, cleanup

- Existing canonical Memory engine: experience-v2 rooted at `runtime/memory`, validated activation marker schema 2, root ID `84705917-7036-4eb4-b4a4-bf9de887aab8`. Memory status reports canonical complete, index/embedding/intelligence available, zero issues.
- New unique Batch 11–12 canonical record: `26edf721-bdae-49ff-baf2-41a320b04ce0` (linked to historical Batch 9–10 record, not a replacement); a native `memory_read` confirmed ID/title/content after persistence.
- Real external host episode for this adoption: `ext-a64d1d7d5e8b41eeac9fe27e92aea0f6`, workspace `agent-core`, stable task key `batch-11-12-windows-adoption-20261015`. Native Learning checkpoint **365**, idempotency key `batch11-12-windows-source-resident-canonical-cleanup-20261015`, `reviewDue=true`, followed by a review scoped to that key only. Review returned `complete=true`, `no-new-knowledge`, zero candidates. All other pending checkpoints/reviews were left untouched.
- Cleanup preflight: project-root `temp` absent; `runtime/tmp` contained one Node compile-cache subtree, **93 files / 305756 bytes**, no reparse points, no exclusively locked files, no other-process command-line references, and zero matching scheduled-task references.
- Scoped script `runtime/backups/batch11-12-windows-20261015/recoverable-tmp-cleanup.ps1` wrote a preflight SHA-256 manifest, moved the single top-level cache directory to `runtime/backups/batch11-12-windows-20261015/cleanup-recovered`, verified **93/93 recovered file hashes**, and wrote `cleanup-receipt.json` (`RECOVERABLY_RELOCATED`, exit 0). No permanent deletion, cleanup of neighboring folders, or cache dependency rewrite.
- **Independent post-Learning directory readback:** after canonical Memory update/readback, task-bound checkpoint **365** and scoped review, documentation synchronization and Cortex submission, Agent Core's exact directory owner reported `E:\Projects\Agent-Core\temp` **NOT_FOUND** and `E:\Projects\Agent-Core\runtime\tmp` with **zero children**. A final hidden-inclusive filesystem readback closes the evidence after this report update; future new temporary writes are not excluded by a point-in-time check.
- Supplementary Cortex memory was confirmed saved, ID `ec499db4-59af-4e81-b57b-9ba5006ee603`. It is a separate continuity aid, not the canonical Agent Core store.
