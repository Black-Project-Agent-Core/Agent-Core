# MRR-3.1 — Controller Surface & Authority Sync Plan

> Status: COMPLETE FOR LOCAL SCOPE — LOCAL SERVER CORRECT — EXTERNAL CONNECTOR DESCRIPTOR PENDING REFRESH/UPDATE
> Date: 2026-09-30 WIB
> Scope: Controller-visible `learning` schema authority and stale MRR documentation only. No new tool, API, Memory store, runtime AI, release, or deployment.

## 1. Observed mismatch

Current Agent Core source and compiled runtime advertise the existing `learning` facade with actions:

- `status`
- `checkpoint`
- `review`
- `curate`
- `journey`
- `receipt`

The fresh ChatGPT controller binding for this conversation advertises only:

- `status`
- `checkpoint`
- `review`
- `curate`
- `journey`

and omits the receipt-specific fields. A direct controller call with `action="receipt"` is therefore rejected by the controller/tool schema before reaching Agent Core.

## 2. Exact root cause

The authoritative Agent Core MCP source is already correct:

- `src/mcp/learning-schemas.ts` includes `receipt` and the bounded receipt fields.
- `src/mcp/learning-tools.ts` registers one `learning` facade and routes `action="receipt"` to `LearningService.receipt()`.
- `src/mcp/server.ts` registers that facade without a second Learning tool.
- `dist/mcp/learning-schemas.js` and `dist/mcp/learning-tools.js` contain the same receipt contract.
- A fresh tools/list-equivalent manifest generated from current `dist` reports 70 tools and learning actions including `receipt`.

The active controller tool descriptor is external to this repository. Fresh connector wrapper evidence identifies the active binding as `asdk_app_6ab67420e4bc81918c25e17b46693ab6`; its current schema/description is older and lacks receipt. The only local ChatGPT plugin ZIP in this repository is a packaging-only artifact containing app binding metadata and no tool schema; its `.app.json` instead references `asdk_app_6ab288f8a2e88191b706b2d3af6b525d`. It is therefore not the authority for the current connector-visible tool contract.

Therefore the exact locally provable boundary is:

`Agent Core source schema -> MCP server registration -> generated resident manifest: CURRENT`

`external registered connector/platform binding -> controller tool descriptor: STALE`

Whether the external layer is stale because of registration snapshotting, platform cache, or a connector publishing pipeline cannot be distinguished from this repository and must not be guessed.

## 3. Authority map

| Layer | Owner/file | Generated/handwritten | Current? | Mutable from this repo? | Activation | Evidence |
|---|---|---|---|---|---|---|
| Learning source schema | `src/mcp/learning-schemas.ts` | handwritten | YES | YES | build/restart only if changed | receipt enum + fields present |
| Learning MCP registration | `src/mcp/learning-tools.ts` + `src/mcp/server.ts` | handwritten | YES | YES | build/restart only if changed | one learning facade, receipt route present |
| Compiled schema/registration | `dist/mcp/learning-*.js` | generated build output | YES | via source/build | already resident | receipt present |
| Generated tools/list-equivalent contract | runtime registration from `createAgentCoreMcpServer` | generated | YES | indirectly via source | none for current build | 70 tools; receipt present |
| Local plugin ZIP | `SubProject/Agent-Core-ChatGPT-Plugin-v1.0.1.zip` | packaging metadata | not active authority | YES, but irrelevant | user upload if used | no tool schema inside; different app binding |
| Controller-visible Agent Core descriptor | external registered connector/platform binding | external/generated | STALE | NO | external connector refresh/update | fresh session tool definition omits receipt |

## 4. Implementation decision

No Agent Core product-source implementation is required or justified.

Do **not**:
- add a second Learning tool;
- add a `memory_use_receipt` public tool;
- add a compatibility shim;
- change auth/tool grants/mutation safety;
- duplicate the receipt implementation;
- change tool count.

The local server is already the desired additive/non-breaking design. The correct local task is documentation/authority cleanup and durable Memory capture of the external boundary.

## 5. Files to touch

Required:
- `docs/MRR-3.1-Controller-Surface-Sync-Plan.md`
- `docs/Memory-Reuse-Reliability-20260930.md`
- `docs/CODEBASE.md`
- `MEMORY.md`
- canonical Agent Core Memory

Conditional:
- `README.md` only if its current top-level MRR statement is stale.

No `src/**`, `dist/**`, dependency, auth, runtime, or plugin package mutation is planned.

## 6. Compatibility impact

- Tool count: unchanged at 70 locally.
- Existing actions: unchanged.
- Receipt contract: unchanged.
- Authentication: unchanged.
- Tool grants: unchanged.
- MCP mutation safety: unchanged.
- Breaking evidence: none introduced by this task because product schema is not changed.

## 7. Activation strategy

No local restart is required because no product source/dist change is needed.

The remaining controller mismatch can only be resolved by refreshing/updating the external registered connector descriptor/binding that supplies the tool schema to ChatGPT. A repository-local restart cannot prove that external descriptor has refreshed.

## 8. Targeted acceptance

Local/server-side acceptance:
1. Exact source schema contains all six actions.
2. Compiled schema contains all six actions.
3. Generated tools/list-equivalent manifest contains `receipt` and receipt fields.
4. Tool count remains 70.
5. MRR-3 historical behavioral evidence remains resident-verified.

Controller-side acceptance:
1. Fresh controller descriptor advertises `receipt` directly.
2. Direct `learning(action="receipt")` passes schema validation without helper.
3. Receipt still reaches existing authoritative owner and preserves MRR-3 guards.

Until controller-side acceptance passes, final status must remain:
`LOCAL_SERVER_CORRECT_EXTERNAL_CONNECTOR_PENDING`.

## 9. Non-goals

- MRR-4 matched procedural fixture/control.
- causal improvement claim.
- native AI runtime/provider.
- new public tool.
- new connector implementation.
- release/version/Git publication.

## 10. Rollback/checkpoint strategy

This task changes documentation and canonical Memory only. Before/after readback is sufficient. No runtime rollback artifact is required because no runtime artifact is replaced.

## 11. Documentation/Memory sync

Current truth must be consistent:
- MRR-1: resident verified.
- MRR-2: resident verified.
- MRR-3: resident verified.
- MRR-3.1: local server correct; external controller descriptor pending refresh/update.
- MRR-4: OPEN, formal matched procedural pilot not yet executed.

Historical design/pending sections may remain only when explicitly labeled historical/superseded.

## 12. Execution / verification closure

Observed local/server evidence:
- exact source `learning.action`: `status/checkpoint/review/curate/journey/receipt`;
- current compiled dist carries the same enum and receipt route;
- generated tools/list-equivalent manifest: **70 tools**, receipt visible, receipt fields present;
- fresh resident `/health`: **ok**, version **0.14.0**, Memory available/issueCount0, Learning available;
- dedicated targeted verification: **17/17 PASS** across `mcp-manifest-contract.test.ts` and `mrr3-knowledge-use-receipt.test.ts`;
- path policy: **280 authored / 0 exceptions**;
- read-only `release:compat`: **70 -> 70**, no removed/added tools, receipt parameters additive, `breakingEvidence=false`, manifest **118,907 bytes / ~29,727 tokens**, not stale, within budget;
- Grafel/Code Intelligence was current/accepted during authority review; structural contract-effectiveness analysis found no ineffective test specs.

Observed controller evidence:
- active connector binding: `asdk_app_6ab67420e4bc81918c25e17b46693ab6`;
- controller-visible `learning.action`: only `status/checkpoint/review/curate/journey`;
- receipt fields absent;
- repository-local legacy plugin ZIP binds `asdk_app_6ab288f8a2e88191b706b2d3af6b525d` and contains no tool schema.

No product source/dist/dependency was changed, so no build or restart was required. No helper workaround is treated as controller-surface closure. Local scope is complete; controller-surface closure requires the external connector/platform owner to refresh/update its registered descriptor.
