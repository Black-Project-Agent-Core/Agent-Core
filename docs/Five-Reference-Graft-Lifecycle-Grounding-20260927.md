# Five-Reference Source-First Grounding — Supermemory / CBM / Continuous Claude / Spec-Kit / Graft

> **Status:** GROUNDING COMPLETE — GRAFT PROPOSAL READY FOR USER REVIEW — FOUR CONDITIONAL REFERENCES MOVED TO CONSUMER — NO RUNTIME IMPLEMENTATION
> **Date:** 2026-09-27
> **Authority:** exact source/tests and current Agent Core source/runtime first; existing plans/history second.

## 1. Scope

The audit rechecked five protected references against current Agent Core v0.13.0 after prior adoption waves. Existing capabilities were excluded from new proposals. A reference was classified by current value:
- **active adoption** when source contains a concrete current-fit gap;
- **Consumer** when the only remaining value requires a future owner/consumer not present today;
- **corpse** only when no current or conditional source-backed value remains and dependency/provenance checks are clear.

No implementation, dependency installation, build, product test suite, runtime restart, release, commit, tag, push, publish or deploy was authorized by this pass.
## 2. Lifecycle decisions

| Reference | Source pin | Final classification |
| --- | --- | --- |
| Supermemory | `2415a5c796d62c7ea9d709bc9337a6e1b6f6d837` | Consumer-only: SM-C1/SM-C2 require native prompt/session owners |
| Codebase Memory MCP | `4d8ac9e1cea0d645a02f876f47536c54a5bfa406` | Consumer-only: CBM-C1 requires Agent Core-owned Grafel binary install/update mutation |
| Continuous Claude | `b9d8ccf9343905d33a1296583114e3326fe102d3` | Consumer-only: CCLAUDE-C1 requires native model/provider execution loop |
| Spec-Kit | `307b3a537fb39721adc7c00aa18adfa1582649aa` | Consumer-only: SPK-C2/C3 require preset/template or cross-agent hook products |
| Graft | `65c29667bd59d7137caba8f6f5b5790e2d1f9404` | Active adoption reference: GRAFT-P1 ready for review |

The first four checkouts were moved into `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer`. Their exact Git identities were read back after the move. Pre-existing CBM `D Formula` plus audit ZIP and Continuous Claude audit ZIP remain unchanged.

Graft remains at `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Graft`; its pre-existing audit ZIP remains untracked and untouched.
## 3. Graft source-first finding

Current Agent Core already covers Graft's general graph/search/orientation/LSP families through Grafel + Semantic IDE. The unique current-fit residual is Graft's review-oriented blast projection:
- changed Git hunk -> innermost enclosing symbol;
- dependency walk from that precise seed rather than whole-file noise;
- per-area behavioural test reach and changed/stale/none/na semantics;
- bounded changed/dependent source snippets explaining the relation;
- bounded Git-history owner/reviewer evidence with author/bot exclusion and no guessed handles.

Current Agent Core `code_surface(action=impact)` forwards changeset/entity impact to Grafel, but exact source searches found no equivalent `changedTest`, `testFiles`, `unreached`, or blast-review layer.

The proposal is recorded as **GRAFT-P1** in `docs/Graft-Steal-Use-Integration-Plan.md`. It keeps Grafel as the only structural graph authority and must not import Graft's graph store, context graph, model runtime, host hooks, telemetry or MCP server.
## 4. Rejected / covered Graft families

Covered by current Agent Core:
- repo orientation/topology;
- symbol overview;
- callers/callees/path traversal;
- graph-aware impact/diff;
- LSP enrichment;
- workspace/ref routing;
- freshness/readiness and provider health;
- bounded result handling.

Rejected as duplicate or ownership-conflicting:
- `.context` Markdown graph and `graph.json` as a second code graph;
- hidden refresh/rebuild before read-only query;
- Tier-2 LLM semantic/concept graph as a second semantic authority;
- Graft external-host config/hook mutation;
- app/viewer/telemetry infrastructure;
- provider SDK/model transport ownership.

Graft search-fusion/file-rank algorithms are not proposed without measured current Grafel ranking defects.

## 5. Corpse decision

No folder in this five-reference set qualified for deletion in this pass:
- four retain conditional source-backed value and were moved to `Consumer`;
- Graft retains a current-fit proposal and remains in the active reference pool.

The active adoption pool is therefore cleaner without destroying future-consumer evidence.
