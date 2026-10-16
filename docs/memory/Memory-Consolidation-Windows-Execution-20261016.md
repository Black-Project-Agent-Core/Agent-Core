# Windows Memory single-owner consolidation — execution report

**Status:** source consolidation, main root build, offline metadata migration, and resident Memory activation **COMPLETE — LIVE READBACK VERIFIED** (2026-10-16).

## Ownership and migration map

| Previous owner | Canonical destination / disposition |
|---|---|
| `SubProject/agent-core-memory/src/memory/*` | Merged into `src/memory/*`; former package directory deleted |
| `SubProject/agent-core-memory/src/index.ts` | `src/memory/facade.ts` (public API exports), alongside `src/memory/index.ts` (index implementation) |
| `SubProject/agent-core-memory/src/standalone.ts` | `src/memory/initialize.ts` |
| `src/mcp/memory-tools.ts` | `src/memory/mcp/tools.ts`; original removed |
| `src/mcp/memory-experience-tools.ts` | `src/memory/mcp/experience-tools.ts`; original removed |
| `src/mcp/memory-schemas.ts` | `src/memory/mcp/schemas.ts`; original removed |
| `src/mcp/memory-scope.ts` | `src/memory/mcp/scope.ts`; original removed |
| `src/learning/memory-sink.ts` | `src/memory/learning-sink.ts`; old implementation removed |
| `src/learning/workflow-verifier.ts` | `src/memory/workflow-verifier.ts`; old re-export shim removed |
| `src/learning/reconsolidation-report.ts` | `src/memory/reconsolidation-report.ts`; imports rewired, old path removed |
| Historical `src/learning/reconsolidation-experiment.ts` contract | Recovered at `src/memory/reconsolidation-experiment.ts` based on exact repository source; old compiled files removed |
| `src/learning/*` other Learning consumers | Left in Learning, with direct imports of owner `src/memory` and newer local decision/calibration/handoff features preserved |
| `src/workflows/*`, `src/agent-knowledge-synthesis.ts`, generic MCP/server | Generic services retained; they consume Memory directly, not a duplicate engine |
| Memory-specific test, script, documentation folders | `tests/memory`, `scripts/memory`, `docs/memory` |

## Evidence

- Input: `E:\New folder\MANIFEST.json` and source/patch as reconciliation material; baseline patch conflicted with newer working-tree edits and was not applied blindly.
- Packaged input files were hash-validated (552/552 in initial preflight), with conflicting local work backed up before scoped implementation.
- Snapshot: `runtime/backups/memory-domain-consolidation-20261016-c5fcdbd4` (1,054 existing files in pre-mutation snapshot).
- `SubProject/agent-core-memory` deleted only after compiled main build succeeded; old MCP files and obsolete generated artifacts removed.
- Main `npm run build` after removal: exit 0; path policy PASS (410 authored files, 0 exceptions).
- `src/memory` has 80 `.ts` modules, `dist/memory` has 80 generated `.js` modules.
- The public Memory tool names remain unchanged; a new custom plugin ZIP is not required for this refactor.
- Source scan found no active dependency on `SubProject/agent-core-memory`; a mapping JSON still mentions historical paths as archival evidence.
- Root project `MEMORY.md` retained to preserve newer local continuity; it is not executable Memory engine code.

## Canonical data and completed activation

- `runtime/memory` data was not replaced by package contents, and user notes, archived evidence, revisions, capsules and receipts were preserved.
- Canonical schema-2 activation metadata now exists at `runtime/memory/state/host/activation.json`; root-level historical marker is absent.
- Migrator initially rejected regular historical Memory log/audit files in `runtime/backups`; typed-file handling was fixed without discarding evidence.
- `node scripts/memory/activate-canonical.mjs --migrate-control-state --dry-run` **PASS**, existing rootId `84705917-7036-4eb4-b4a4-bf9de887aab8`.
- **DONE:** user-operated non-dry-run migration and official resident restart. Canonical marker reports `schemaVersion=2`, `status=complete`, `hostLayoutVersion=1`, identical rootId `84705917-7036-4eb4-b4a4-bf9de887aab8`, and `metadataMigratedAt=2026-10-16T15:13:20.966Z`. New Node Core PID 14956 started at `2026-10-16T15:40:33.307Z`, after migration and build (`dist/memory/host-runtime.js` updated `10:47:08Z`). MCP `memory_status` returns available canonical/index/embedding/intelligence, 212 notes and issueCount 0. Task-scoped live `memory_v2_read(capabilities)` returns `writeMode=experience-v2`.
- Migration is complete. Do not rerun `scripts/memory/Finalize-Memory-Consolidation.cmd` against the completed root; retain it only as an explicit recovery/install utility for an unmigrated installation.
- If preflight fails, do not retry blindly: inspect the error; never use `--fresh` on existing user data.

## Documentation and durable memory

- Updated `AGENTS.md`, `docs/CODEBASE.md`, `docs/memory/CONSOLIDATION.md`, `docs/memory/WORKFLOW.md`.
- Canonical record `857518bc-5131-494b-bdee-c36763fc8b8b` initially captured source/build completion and pending activation; this closure updates it with actual resident evidence.
- `.changeset/20261016-memory-single-owner-consolidation.md` records intended material behavior change; no release/version change was applied.

## Scope and non-claims

No speed benchmark, broad regression test, automatic release, Git commit/push, credential change, or wholesale canonical-data rewrite is claimed. Resident activation was validated with process chronology, canonical marker, and live scoped MCP reads; this does not prove broad regression coverage or measurable performance improvement. Earlier Linux package-path directions are historical evidence, not instructions to restore the former engine.
