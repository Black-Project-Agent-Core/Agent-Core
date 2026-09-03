# Agent Core Real Steel Prototype Audit

**Purpose:** Task 0 evidence for `agent-core-real-steel-crafting-engine.md`.

**Branch:** `feature/real-steel-crafting-engine`
**Audit HEAD:** `4fd51b34a66d884cd6cd131a872286d04f7ee9f9`
**Pre-prototype merge base:** `6b674c1f95a677dea5cb57263bb5b8b863faff5b`

## Baseline Evidence

- Working tree was clean before audit.
- `npm run build`: PASS, exit 0.
- Prototype-focused suite: 9 test files PASS, 65 tests PASS, 0 failures.
- Old strategy-gate roadmap documents are no longer tracked on this branch.
- Official authority is `docs/roadmap/agent-core-real-steel-crafting-engine.md`.

## Dependency Findings

Production runtime currently depends on the prototype through:
- `RuntimeServices -> ImplementationStrategyService`.
- `RouteContextStore -> ImplementationStrategyMode` and strategy projection.
- `routeGuarded -> implementation-strategy-guard` after memory lifecycle validation.
- `route-guard -> ImplementationStrategyError` serialization.
- `config/index -> ImplementationStrategyConfig` and runtime composition.

The donor-specific canary path is isolated:
- `GitWorkingTreeCodeIntelligenceSource -> GitHubGitService.listWorkingTreeFiles`.
- `code-intelligence.ts` is otherwise consumed by prototype verification/manifest and tests.
## Migration Matrix — Prototype Core

| Prototype component | Decision | Factual rationale |
|---|---|---|
| `src/implementation/strategy.ts` | `REWRITE` | Stable serialization, SHA-256 identity, immutable reference validation are useful; public vocabulary and mode semantics must become Real Steel. |
| `src/implementation/transplant-manifest.ts` | `REWRITE` | Decision normalization/hash is useful; current contract depends on donor-analysis abstractions and is narrower than `CraftPlan`. |
| `src/implementation/authority-conflicts.ts` | `REUSE` | Protected authority data and owner-conflict evaluation already match host-authority invariants; migrate types/path and extend tests. |
| `src/implementation/meaningful-work.ts` | `REUSE` | Read-only/documentation/source/verification classification is useful input to crafting enforcement; extend with donor-derived mutation intent. |
| `src/implementation/service.ts` | `REWRITE` | Scoped lease pattern is proven, but lease identity must bind crafting mode, grounding and `craftPlanId`. |
| `src/implementation/verification.ts` | `REWRITE` | Donor-vs-host verification separation and safe provenance are useful; current provider/manifest types are obsolete for Real Steel. |
| `src/mcp/implementation-strategy-guard.ts` | `REWRITE` | Memory-first ordering and advisory/enforce behavior are proven; guard must enforce Real Steel mutation-to-craft-plan mapping. |
| `src/implementation/code-intelligence.ts` | `REMOVE_DEFERRED` | External/general code-intelligence abstraction is not required by Real Steel core correctness. |
| `src/implementation/git-working-tree-source.ts` | `REMOVE_DEFERRED` | This is reference-specific canary infrastructure, not a generic Real Steel requirement. |

## Migration Matrix — Host Integration

| Host surface | Decision | Factual rationale |
|---|---|---|
| `src/config.ts` | `REWRITE` | Keep disabled/advisory/enforce rollout pattern; rename config and bind Crafting service. |
| `src/runtime/services.ts` | `REWRITE` | Keep one runtime composition point; replace prototype service with Crafting service. |
| `src/runtime/route-context-store.ts` | `REWRITE` | Keep scoped projection/freshness pattern; replace strategy/manifest fields with crafting/grounding/craft-plan identity. |
| `src/mcp/tools.ts` | `REWRITE` | Preserve route -> memory lifecycle -> crafting guard -> mutation order. |
| `src/mcp/route-guard.ts` | `REWRITE` | Preserve deterministic safe error serialization for new Crafting errors. |
| `src/index.ts` | `REWRITE` | Runtime config pass-through changes with the Crafting service rename. |
| `src/github/git-service.ts#listWorkingTreeFiles` | `REMOVE_DEFERRED` | Only current production caller is the deferred working-tree canary source. |
| `THIRD_PARTY_NOTICES.md` | `REMOVE_DEFERRED` | Remove if no adapted reference-specific source remains after Task 13 cleanup. |
## Test Migration Decisions

- Prototype strategy/manifest/authority/guard/verification tests are migration fixtures, not final naming authority.
- `tests/code-intelligence-provider.test.ts`, `tests/git-working-tree-code-intelligence.test.ts`, and `tests/implementation-strategy-real-graft.acceptance.test.ts` are deferred and must disappear from Real Steel core after replacement canaries exist.
- `tests/github-git.test.ts` additions for `listWorkingTreeFiles` are removed with that deferred path unless another non-deferred production caller exists.
- Existing route/config/memory-lifecycle tests remain adjacent regression authority throughout migration.

## Migration Order

1. Introduce new `src/crafting/` contracts beside the prototype.
2. Move deterministic mode/reference identity first.
3. Add mandatory source grounding and connected feature anatomy.
4. Replace manifest with `CraftPlan` and migrate authority evaluation.
5. Replace route/service/config projection and lease vocabulary.
6. Replace MCP guard only after new crafting lease tests are green.
7. Add iterative execution, multi-command DAG, verification and continuity.
8. Prove both Real Steel canaries.
9. Remove deferred prototype/canary residue only after caller search proves it unused.

## Task 0 Exit Gate

PASS: old roadmap authority is retired on this branch; every prototype component and host integration has an explicit migration decision; current prototype baseline compiles and its focused tests are green.
