# Memory domain consolidation — 16 October 2026

Status: Windows source consolidation, main root build, offline control-state migration, and resident live Memory acceptance COMPLETE on 2026-10-16.

**Windows evidence (newer than the Linux handoff below):** Source owners are now `src/memory` (80 TypeScript modules) and root compilation emits `dist/memory` (80 JS modules). Main `npm run build` passed with path policy 410 authored files/zero exceptions after removing the old package and correcting imports. `SubProject/agent-core-memory`, the four old `src/mcp/memory-*.ts` sources, old Learning re-export, and obsolete compiled entry points have been removed. Current native/external decision, calibration, and improvement-handoff logic outside the package was retained; Memory-specific reconsolidation report was moved into `src/memory`. Source snapshot/recovery backup: `runtime/backups/memory-domain-consolidation-20261016-c5fcdbd4`. The user-operated offline helper completed metadata migration after the earlier successful dry-run; live readback verified the canonical control marker under `runtime/memory/state/host` with `schemaVersion=2`, `status=complete`, `hostLayoutVersion=1`, and preserved rootId `84705917-7036-4eb4-b4a4-bf9de887aab8`. Resident Node Core PID 14956 started after both build and metadata migration, Memory reported available/0 issues, and task-scoped live `memory_v2_read(capabilities)` returned `writeMode=experience-v2`. Do not rerun migration on this completed root. Historical Linux-only and deferred statements below are retained as dated provenance, not the current Windows implementation status.

## User-required ownership

- Memory-specific implementation, transport registration, schemas, task scope, and integrations belong in `src/memory/`.
- The main TypeScript compilation emits that implementation into `dist/memory/`.
- Memory documentation belongs in `docs/memory/`; scripts in `scripts/memory/`; tests in `tests/memory/`.
- The existing canonical user store remains `runtime/memory/`. No new store is initialized by this source consolidation.
- Generic MCP, Learning, native controller, and runtime consumers invoke the one memory owner. They do not retain a parallel memory implementation.
- The repository `Black-Project-Agent-Core/Agent-Core` is active. Its old legacy-repository designation is historical.

## Inputs and evidence boundary

The user supplied `src.zip` (67 files, partial source tree) and `SubProject.zip`. Only the `agent-core-memory` package in the latter is in this task. Other projects are outside scope. Missing generic caller/build context comes from the existing checkout at `4986379311b250c50a8536b52ceae9292997a077`; this is not a claim that all Windows files match that checkout.

The supplied root memory directory has 32 modules. The package has 49 memory modules. Thirty filenames overlap: eight are equal after CRLF normalization; 22 differ. Consolidation requires preserving the stronger active engine and useful host integrations rather than blind file replacement. `memory/index.ts` already implements the search index; the public exports must not overwrite it.

## Historical location decisions

Earlier instructions on 9 and 11 October explicitly directed edits and builds in `SubProject/agent-core-memory`. That retained the split package. These instructions are superseded by this task. Earlier reported successful activation does not establish compliance with the user's required source ownership.

Dated reports preserve their original evidence and paths. They are not directions to recreate old folders or activate the old service.

## Data preservation

No Windows data or running process is modified from this task. Root identity, canonical records, revisions, evidence archives, task capsules, receipts, and access checks must survive later installation. Old activation metadata cannot simply be deleted before a validated location migration. No fallback to an empty writable store is acceptable.

## Delivery status

The canonical memory domain contains 78 TypeScript modules and emits 78 JavaScript files plus 78 maps. The exact standalone memory package is removed from this working source. Forty-eight obsolete compiled paths recorded in `scripts/memory/consolidation-source-map.json` are absent. No canonical user store was created.

Evidence retained under `verification/`:
- Final official main build: path policy 407 authored files / zero exceptions, TypeScript exit 0.
- Focused activation/scope/cancellation/identity run: 7 suites / 65 tests passed.
- Engine/outcome run: 6 suites / 80 tests passed.
- Relocated retrieval evaluation run: 9 suites / 95 tests passed.
- Public memory schema source and experience tool registration bodies match the uploaded source after newline normalization. No new public tool was added.
- Syntax checks of changed release helpers passed. Release-intent readback sees 48 unique pending IDs, including 11 memory-domain records. No release/version/tag operation was executed.
- Diff whitespace check with `cr-at-eol` passed; supplied CRLF bytes were not blanket-normalized.

Initial failed fixture runs are preserved: old marker paths, stale dynamic helper import paths, and host-auth mock assumptions were corrected without relaxing production authorization. Compiled-only synthetic snapshots emitted missing-source-map warnings; fixture status above is the actual outcome, not a claim that every warning disappeared.

No measured retrieval/token benefit is claimed by moving files. No Windows installation, actual canonical-data migration, process restart, cloud provider call, full regression suite, or publication is claimed.

## Evidence: stale repository designation

User screenshot received 16 October 2026 08:48 UTC: [original image](evidence/image%2820261016-084811%29.png), SHA-256 `0f69ba8291f8d0e0a42f27e7979ad6fe33e63e11e6f45ec5d7d575760f6c75dd`. It displays `legacyRepository` pointing to the active Agent Core repository. The same field was present in baseline `4986379311b250c50a8536b52ceae9292997a077` root package.json. This proves stale active configuration remained; it does not establish that no historical instruction ever requested an update. The Linux working source now uses the standard repository object. No Windows modification is claimed.

## Active control-state migration

The existing activation owner now supports `--migrate-control-state` for the currently reported schema-2 root. It moves the old root-level activation marker into `runtime/memory/state/host/activation.json` and referenced memory backup under `runtime/memory/state/backups`, preserving root identity and relocated/fresh provenance. It never opens a second legacy service. Historical schema-1 roots use the explicit historical relocation operation. No migration is performed automatically at startup.

Do not run `--fresh` against existing user data. Stop all writers before applying metadata relocation. The installation note in this delivery distinguishes source installation from control-state migration and old-file removal.

Canonical relocation map: `scripts/memory/consolidation-source-map.json`. Current logical flow: [WORKFLOW.md](WORKFLOW.md). Previous source-layout instructions are superseded.
