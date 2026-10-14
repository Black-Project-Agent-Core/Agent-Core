# Batch 10 — Windows declared text-source freshness (15 October 2026)

## Implemented source scope

Candidate #144: only the slides-grab-inspired local source-fingerprint comparison. The original `image_inspect` owner remains responsible for scoped views, raster integrity, crop and review. New internal helper `src/rdc/tools/image-source-dependencies.ts` reuses the existing `validatePath`, evidence-capture policy and strict identity/digest/UTF-8 source snapshot reader. `src/rdc/tools/image-review.ts` explicitly clarifies that `bindingStatus` is raster-only; `src/mcp/rdc-tool-metadata.ts` describes the new opt-in source list.

`image_inspect({action:"overview",path:<local-raster>,sourceFiles:[<1..8-local-text-paths>]})` accepts up to eight distinct absolute local paths under the existing permissions; crop and review reject fresh sourceFiles and inherit the exact overview snapshot. Input with sourceFiles is capped at 24 KiB before file read. Alias/UNC/device path and duplicates are refused. A per-dependency `read_file` evidence policy decision occurs before each bounded read; omitted/invalid/non-full policy means unavailable, not permission to read. Only UTF-8 local text (HTML/CSS/JS/TS and supported text formats) can become captured; binary, unsupported, missing or unreadable dependencies stay unavailable.

Per source limit 2 MiB; at most eight source reads per pass and two passes per invocation, reserving at most 32 MiB across the two-pass budget including failed reads. Initial baseline captures the expected SHA-256, byte length and file identity without storing source bodies; one final comparison after overview output is ready, or separate compare/final passes for crop/review, checks observed current bytes/identity. A stable source change relative to the immutable baseline is `changed`; changed between first and final observation is `unavailable`/read-race. Missing source after captured baseline is changed; unavailable initial baseline cannot silently become current. A source set must match for every view in one review, or all referenced views must be unsourced. Crop expiry does not outlive the overview source baseline.

The extra `sourceDependencies` report is capped at 4 KiB and contains version 1, opaque snapshotId, capture/check timestamps, declared/checked/changed/unavailable counts, at most eight d1–d8 handle entries and `state=not-requested|current|changed|unavailable`. No source path/body is emitted in that report, and no new persistent store is created. `declaredDependenciesOnly=true`, `closureCompleteness=unknown`, `derivationVerified=false` remain explicit. No source execution, renderer or export gate is added; raster views retain the existing image/TTL/output limits and their previous truth boundary.

## Build and plugin descriptor

- Windows root: `E:\Projects\Agent-Core`, active source branch `codex/cumulative-learning-workflow`. Build final process **21416**, `npm run build`, exit 0, 372 authored paths/0 exceptions, Memory/Core TypeScript compiled. An initial build exposed four TypeScript definite-assignment diagnostics and was repaired before the successful source build; no broad test suite was run.
- Official `release:compat --manifest-only` compiled descriptor: `SubProject/Agent-Core-Batch-10-MCP-Schema-20261015.json`, SHA-256 `605fa606c60cff875272e3f438f4cc69e82fb0a5213ad15ef2d8039a3deefb45`.
- Reviewed cohort: **75 tools / 124403 bytes**; full optional-with-controller cohort: **78 tools / 130539 bytes** (limit 131072, spare 533); current and not stale. Both cohorts measured separately. Schema JSON is not the plugin ZIP.
- Existing plugin app identity: `asdk_app_6acd4cde8b008191bf289261ed843a17`, key/name `dev-6acd4cde8b008191bf289261ed843a17`. Owner/admin metadata was read directly: installed **1.0.3**, active release `pluginrel_6ace893c75588191bc7d7b1d17ec6261`.
- New wrapper from the existing two-entry plugin archive: `SubProject/Agent-Core-ChatGPT-Plugin-Batch-09-10-v1.0.4.zip`, **543 bytes**, SHA-256 `93986b888f92a8de78315d0bf6fc2a8ddd83987eb5cfa8863ba6febac46136d9`. The original `.app.json` and `.codex-plugin/plugin.json` identity/binding are preserved; only semantic version is incremented. No app/tunnel/auth/grant/release product is created.

## Activation and evidence boundary

**Source-ready, plugin ZIP-ready; external-client/resident adoption remains pending.** The current connector schema advertised to this conversation does not yet include `sourceFiles`. Because this batch requires a public input update, the existing `Restart-Agent-Core.cmd` has not been invoked again. Upload plugin 1.0.4 through **Upload new version** on the existing Agent Core app, refresh its connector manifest, and then activate the new resident build through the existing launcher when permitted. Do not create another app or tunnel.

A real authenticated image-inspection workflow with declared HTML/CSS/JS inputs has not yet been observed. There is therefore no claim that the installed client can pass `sourceFiles`, that a particular renderer used the files, or that visual quality improved. No synthetic preview, artificial source mutation, unrelated process test, or invalid-argument suite was run. The follow-up acceptance is one real overview with known local preview and declared sourceFiles, optional crop, and review using the same scoped immutable snapshot.

## Activation handoff

1. In the existing ChatGPT Agent Core app, select **Upload new version** and upload `E:\Projects\Agent-Core\SubProject\Agent-Core-ChatGPT-Plugin-Batch-09-10-v1.0.4.zip`. Existing version verified before packaging: 1.0.3; proposed: 1.0.4.
2. Refresh/reconnect the **same app** and resident Agent Core using the existing launcher only after the re-upload step is satisfied. Verify `sourceFiles` is exposed and actual resident source/emitted hashes match the build receipt.
3. Provide one real locally known PNG/JPEG/WebP plus its actual text-source paths or reuse a suitable current project preview; verify sourceDependencies from the caller. Avoid implied render lineage.
4. Close activation, canonical Memory/Learning for this stage, and cleanup only with fresh evidence.

Temporary backup of three original touched owners and the first descriptor draft is stored in `runtime/backups/batch10-preview-sources-20261015`. This feature does not implement Batch 11/12, Consumer, Invocate or the deferred #83/#90 expansions.
