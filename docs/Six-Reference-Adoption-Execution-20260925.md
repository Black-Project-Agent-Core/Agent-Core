# Six-Reference Approved Adoption Execution — 2026-09-25

> Status: COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — FINAL REFERENCE CENSUS CLOSED
> Product source/package version: 0.13.0
> Live Node Core after activation: 0.13.0

## Approved scope
The user approved all current-fit proposals from the six-reference grounding:
GA-P1, ARC-P1, AH-P1, AH-P2, EAX-P1, EAX-P2 and OV-P1.
Awesome has no additional direct local-runtime proposal after ASI-P1–P6; it remains a discovery catalog.

## Implemented native owners
- GA-P1: `src/rdc/checkpoints/service.ts` + public `file_checkpoint` MCP facade.
- ARC-P1: `src/learning/verified-value-registry.ts` and numeric provenance in explicit Learning analysis output.
- AH-P1: `src/mcp/result-budget.ts`, integrated at the common MCP result boundary.
- AH-P2 + OV-P1: one shared `src/rdc/process-ledger.ts` lifecycle owner wired into `TerminalManager`.
- EAX-P1: `src/learning/retrieval-diversity.ts` + explicit `--diversity` analysis mode.
- EAX-P2: `src/learning/retrieval-stability.ts` + explicit `--stability` analysis mode.
- OpenViking source was not transplanted; OV-P1 was independently implemented from behavioral requirements because the reference is AGPL-3.0.

## Targeted verification
Primary capability matrix:
- file checkpoint: 3/3 PASS
- MCP result budget: 3/3 PASS
- process ledger: 3/3 PASS
- verified numeric provenance: 4/4 PASS
- retrieval diversity: 3/3 PASS
- retrieval stability: 4/4 PASS
- advanced Learning CLI: 4/4 PASS
Total: 24/24 PASS.

Public contract checks:
- mcp-schema-contract: 2/2 PASS
- mcp-manifest-contract: 2/2 PASS
- rdc-parity: 2/2 PASS after updating the additive RDC baseline from 26 to 27 tools
The first contract run correctly failed the old hard-coded 62/26 expectations; those tests were updated to the approved additive 63/27 surface and rerun.

TypeScript root compilation: exit 0.
`release:compat`: ok=true; 62 -> 63 MCP tools; added `file_checkpoint`; removed tools 0; removed routes 0; breakingEvidence=false.
Manifest budget: 112,147 bytes / ~28,037 tokens, within 120,000-byte / 30,000-token limits.

## Release integrity
Existing authoritative intent: `.changeset/20260925-six-reference-adoption.md` (minor).
A duplicate intent created during closure was removed after readback proved it described the same wave.
Expected next stable release from 0.13.0 is 0.14.0 while the intent remains pending.

## Activation closure
Node Core was restarted onto current `dist` and fresh `/health` readback reports Agent Core `0.13.0` with healthy Execution/Memory/Grafel/Semantic/Learning surfaces. A fresh authenticated external MCP client enumerated **63 tools**, required `file_checkpoint` was present, and `memory_status` probe succeeded. Evidence: `runtime/tmp/mcp-client-acceptance/2026-09-25T13-37-14-014Z`.

A preactivation rollback set was prepared from immutable stable v0.13.0:
`runtime/backups/six-reference-adoption-preactivation-20260925-v013`.
It contains 14 previous runtime artifacts plus explicit lists for 14 newly added artifacts.
Comparison against the stable integrity manifest isolates 28 relevant runtime artifacts (14 JS/map pairs).

## Documentation and memory
Plan documents, CODEBASE, root MEMORY.md, and canonical Agent Core memory are synchronized to this qualification state.
No external model/runtime, optimizer, workflow daemon, VFS, OpenViking package, Python service, or extra dependency was installed.

## Reference disposition
Final post-activation census retired/deleted GenericAgent (`05-GenericAgent`), AutoResearchClaw (`06-AutoResearchClaw`), and EvoAgentX (`08-EvoAgentX`) after clean-pin, zero-dependency, zero-process, zero-reparse checks and provenance preservation. atomic-hermes is retained for its conditional OAuth-refresh lead; OpenViking is retained for OV-C1 durable ingest-cursor behavior; Awesome remains discovery-only because 185 linked repositories are still unaudited.

## Activation-time process lifecycle correction
Live activation exposed one real AH-P2/OV-P1 regression: very short-lived child processes could exit while `executeCommand()` awaited ledger attachment before registering the child exit/error listeners. The OS process was gone, but TerminalManager and the durable ledger could remain `running`/`cancelling`.
The native owner was corrected so ledger attachment starts immediately without blocking listener installation; terminal/error finalization awaits that same attachment before persisting final state. A dedicated short-lived-process regression plus the existing process-ledger tests pass **4/4**; root TypeScript build exits 0.
After the corrected Core restart, live `start_process` on an immediate command returns normally and `list_sessions` reports no active sessions. This correction is part of the same pending six-reference minor intent; no second changeset was created.
