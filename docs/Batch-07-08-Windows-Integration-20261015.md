# Batch 7–8 — Windows integration, 15 October 2026

## Source and scope

**Status:** Published Batch 7–8 source adopted into the existing Windows project, official build PASS, resident post-restart verified, recoverable cleanup performed. Canonical Memory and Learning finalization are documented in the closure section below.

- Active root: `E:\Projects\Agent-Core`; active branch: `codex/cumulative-learning-workflow`.
- Pre-adoption local HEAD: `06ffb7155cf59c3a0bb88bc970cb2b694805ddd8`; clean working tree.
- Published remote `origin/main`: `4a7478d67288e44fd39056681afaa6871313ca11`, fetched and inspected against its exact parent `06ffb7155cf59c3a0bb88bc970cb2b694805ddd8`.
- Adopted **exactly 14 published paths** via checked Git patch in the original worktree, without switching branches, merging, committing, resetting or overwriting unrelated changes.
- All 14 resulting worktree blobs matched the published commit; `git diff --check` returned no finding.
- Eight owner source files, source report, release-intent changeset, existing research register and current architecture notes were integrated. Neither dependencies nor lockfiles changed.
- The research register still has 216 entries, 216 unique IDs; historical counts remain reuse 88, defer 54, extend 15, reject 38, no-source 21.
- No Batch 9–10, Consumer, Invocate or broader #90 work was started. Batch 3–6 and invocation/checkpoint work were preserved.

## Recovery evidence

Before applying the patch, 12 existing files were backed up with verified SHA-256 and manifest. A complete Git patch is also retained, outside either cleanup target, under:

`runtime/backups/batch07-08-integration-20261015/`

Evidence files include `baseline-manifest.json`, `batch07-08.patch`, `build-receipt.json` and `activation-receipt.json`. A pre-adoption file checkpoint also exists as `78b636e9-5327-4fe0-b17d-da0e74ce2d83`.

## Build and installed runtime

- The sole official production build used `npm run build` from the main root, process PID 12876, exit code 0, 16.14 seconds.
- Its built-in path policy scanned 371 authored files with zero exceptions; Memory and root Core TypeScript compilation finished.
- All eight changed source/emitted pairs have `dist/*.js` and `dist/*.js.map` in the official output, with individual hashes recorded in `build-receipt.json`.
- Prior resident Core PID 12116 predated this build; one restart was required, and used only existing `Restart-Agent-Core.cmd`.
- Restart receipt: `runtime/restart/86ccd91da16f41ea9e1cd564c6eabb8c.json`, exit 0, completed 2026-10-14T20:47:26.7065198Z. No scheduled-task installation or elevation was needed; the existing manual restart task was ready.
- After restart, resident Core PID 18896 (parent launcher 17760) began 2026-10-15 03:47:28 WIB. Executable: `runtime/node/node.exe`; process command line targets `dist/index.js`. Local `/health` returned `ok`, product `0.15.0-beta.3`.
- Post-restart installed-hash readback confirmed **8/8 source/emitted/sourcemap triples unchanged** from the successful build; `activation-receipt.json` captures the identity.
- Real external-controller `controller_learning(context)` was called after restart for integration context; `synthesis` returned with actual capability/Skill references. The separate `memoryTaskContext` indicated `unavailable / MEMORY_TASK_NOT_FOUND`; it must not be counted as an empty successful Memory task recall.
- Real integration terminal process PID 8080 finished `cleanup-preflight.ps1`, produced the expected preflight manifest, and returned observed exit code 0. This is a real observed process lifecycle, not a forced lifecycle scenario or proof of all #69 branches.
- No scenario suite, synthetic failure, benchmark, forced timeout, multi-PID experiment, or broad validation was performed. Source/build identity, process activation, tool exposure and measured benefit are separate evidence classes.

## Plugin and public schema

- Batch 7–8 changes only additive response data, not public tool names, input schemas, registration descriptions or plugin descriptor. No plugin packaging or upload was necessary.
- The most recently **locally verified uploaded** release remains private app `asdk_app_6acd4cde8b008191bf289261ed843a17` plugin version 1.0.3, release `pluginrel_6ace893c75588191bc7d7b1d17ec6261`. No claim of independent inspection of ChatGPT's current app-admin version screen is made.
- No new ZIP, app, credential, grant, OAuth connection, tunnel, release, commit, push, tag or deployment was created.

## Recoverable cleanup

- Exact targets: `E:\Projects\Agent-Core\temp` and `E:\Projects\Agent-Core\runtime\tmp`.
- Preflight: `temp` absent; `runtime/tmp` contained only `node-compile-cache`, 93 files / 305,764 bytes, with zero reparse points, exclusive-lock failures, matching active process command-line references or scheduled-task references.
- Cache was moved, not permanently deleted, to `runtime/backups/batch07-08-integration-20261015/cleanup-recovered/runtime-tmp/node-compile-cache`.
- `cleanup-preflight.json` stores all original file paths, sizes and hashes; `cleanup-receipt.json` stores 93 original→recovery paths with verified post-move hashes.
- Immediately after moving: `temp` absent and `runtime/tmp` empty (0 direct children). Because project child-process TMP points at `runtime/tmp`, a final readback after Memory/Learning finalization is mandatory; future unrelated jobs could recreate ephemeral cache.
- Canonical `runtime/memory`, official backups, source, production dist and protected references remain intact.

## Canonical Memory and Learning

- Memory owner: `src/memory/host-runtime.ts` and validated schema-v2 activation marker `runtime/memory-v2-activation.json`, with `mode=experience-v2`, canonical root `runtime/memory`. Historical `runtime/memory-v2` is not used as a new writer.
- Native `memory_status`: canonical, index, embedding and intelligence available, issueCount 0 at initial and post-restart reads.
- Real controller episode: `ext-4c4e8139435c4ff0a464c5a26662d899`, stable key `agent-core-batch07-08-windows-integration-20261015`, registered workspace `agent-core`.
- Final Memory readback ID, Learning checkpoint/review ID, and final cleanup readback are recorded in the closure addendum below. Do not infer success or effectiveness from a missing receipt.

## Interpretation limits

Legacy recall failure-capsule delivery, planned retrieval completeness, oversized synthesis, nonzero/null terminal exit, silent exit, PID replacement, timeout and descendant-stream closure were not synthetically exercised. Do not equate text completion, process exit, packet synthesis or tool exposure with task success, verified use of every path or a measured improvement.

## Task-scoped Learning closure and external context evidence

- Canonical Memory record created with native owner: `e74fb4c7-648e-4743-9d3b-603a6a60c8da`, category `implementation-verification`, no duplicate Batch 7–8 Windows record.
- Native Learning checkpoint key `batch07-08-20261015-windows-activation-cleanup-closure`, task `ext-4c4e8139435c4ff0a464c5a26662d899`, workspace `agent-core`, advanced to checkpoint count **361**, `reviewDue=true`.
- Scoped review for that exact key and task returned `complete=true`, `status=no-new-knowledge`, reviewed `2026-10-14T21:02:22.381Z`, 0 candidates. Older unrelated pending reviews were not cleared.
- A real final `controller_learning(context)` packet returned nine-section coverage version 1, scope `packet-composition`, 6,864 of 16,000 UTF-16 units. Candidate/delivered rows: capabilities 25/25; task-evidence 1/1; memory-neighborhood 2/2; skills 3/3; evidence-gaps 2/2; remaining sections 0/0. Known omitted rows across sections: **0**; upstream detail completeness remains `null/unknown`.
- Skill discovery effective mode `lexical` delivered 2 hits with none omitted by local budget. This shows packet composition and discovery, not Skill instruction use or measurable improvement.
- Separate v2 task-memory context remained **unavailable** with latest advisory `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE`; no empty-success recall or successful planned/legacy branch is inferred. No failure-capsule or forced terminal lifecycle variants were exercised.
- After Learning review and canonical Memory update, perform an additional direct read of both cleanup paths to establish the actual final tree state.

## Final post-Learning and Cortex readback

- Native canonical Memory `e74fb4c7-648e-4743-9d3b-603a6a60c8da` was updated in place to include Learning checkpoint 361, complete scoped review, context coverage and final cleanup. A subsequent `memory_read` confirmed the same ID, Learning closure and Cortex pointer.
- Cortex supplemental memory publication was **confirmed saved** by the subsequent Cortex search outcome, ID `6c4808e8-3bbc-48db-b207-4c2dfe688d63`, distinct from the local canonical owner.
- After Memory and Learning operations, final native `list_directory` returned `E:\Projects\Agent-Core\temp` as **NOT_FOUND**, and `E:\Projects\Agent-Core\runtime\tmp` as an existing directory with **no children**. There were no remaining files or subdirectories at that readback. Future jobs may recreate ordinary temporary cache, but that is not a pending task cleanup.
- This closes the approved Windows adoption, activation, recoverable cleanup, and scoped Learning lifecycle. No full branch coverage or measured runtime/retrieval benefit is asserted.
