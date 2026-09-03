# Real Steel Prototype Audit

**Audit base:** `origin/main` / merge-base `6b674c1f95a677dea5cb57263bb5b8b863faff5b`  
**Audit branch:** `feature/real-steel-crafting-engine`  
**Plan authority:** `docs/roadmap/agent-core-real-steel-crafting-engine.md`

## Baseline evidence

- `npm run build` → PASS.
- Focused prototype suite → 7 files, 45 tests PASS, 0 FAIL.
- Old strategy-gate roadmap documents are no longer tracked.
- Runtime production callers of the prototype are limited to route context, runtime composition, MCP tools/guard/error handling.
- Code-intelligence/fingerprint prototype modules have no production runtime caller outside their own tests/canary.

## Migration matrix

| Prototype component | Decision | Real Steel destination / reason |
|---|---|---|
| `src/implementation/strategy.ts` | REWRITE | Split into `src/crafting/types.ts` + `mode-resolver.ts`; retain deterministic hashing/identity only. |
| `src/implementation/transplant-manifest.ts` | REWRITE | Become `src/crafting/craft-plan.ts`; preserve deterministic classification normalization. |
| `src/implementation/authority-conflicts.ts` | REUSE | Migrate policy data/evaluator to `src/crafting/authority-registry.ts` with crafting vocabulary. |
| `src/implementation/meaningful-work.ts` | REWRITE | Reuse structural mutation classification in Real Steel mutation guard. |
| `src/implementation/service.ts` | REWRITE | Reuse scoped lease mechanics as `src/crafting/service.ts`. |
| `src/implementation/verification.ts` | REWRITE | Reuse separated parity/host verification and bounded provenance as crafting verification. |
| `src/mcp/implementation-strategy-guard.ts` | REWRITE | Become `src/mcp/crafting-guard.ts`; preserve memory-first guard ordering. |
| `src/implementation/code-intelligence.ts` | REMOVE_DEFERRED | Not part of Real Steel core; external/codebase-intelligence work is deferred. |
| `src/implementation/git-working-tree-source.ts` | REMOVE_DEFERRED | Reference-specific canary/source-fingerprint machinery, not required by Real Steel core. |
| `src/config.ts` prototype config | REWRITE | Rename enforcement surface to `AGENT_CORE_CRAFTING_ENFORCEMENT`; default remains disabled during migration. |
| `src/runtime/services.ts` prototype service wiring | REWRITE | Replace `ImplementationStrategyService` wiring with `CraftingService`. |
| `src/runtime/route-context-store.ts` projection | REWRITE | Replace implementation-strategy projection with bounded `crafting` projection; retain freshness semantics. |
| `src/mcp/tools.ts` guard calls | REWRITE | Call Real Steel crafting guard after memory lifecycle and before side effects. |
| `src/mcp/route-guard.ts` error support | REWRITE | Replace prototype error type with crafting error type. |
| `src/github/git-service.ts` `listWorkingTreeFiles` addition | REMOVE_DEFERRED | Added only for the prior reference-specific canary; remove once no generic Real Steel caller remains. |
| `THIRD_PARTY_NOTICES.md` | REMOVE_DEFERRED | Remove if no adapted third-party implementation remains after deferred cleanup. |
| `tests/implementation-strategy*.test.ts` | REWRITE | Superseded by crafting mode/guard tests. |
| `tests/transplant-manifest.test.ts` | REWRITE | Superseded by `tests/crafting-plan.test.ts`. |
| `tests/authority-conflicts.test.ts` | REUSE | Port behavioral cases to crafting compatibility/authority tests. |
| `tests/implementation-verification.test.ts` | REWRITE | Port useful verification cases to crafting verification tests. |
| `tests/code-intelligence-provider.test.ts` | REMOVE_DEFERRED | Deferred codebase-intelligence scope. |
| `tests/git-working-tree-code-intelligence.test.ts` | REMOVE_DEFERRED | Deferred reference-specific canary scope. |
| `tests/implementation-strategy-real-graft.acceptance.test.ts` | REMOVE_DEFERRED | Replace with tool-neutral dual Real Steel canaries. |

## Production call-site facts

Current production chain is:

```text
src/config.ts
  → src/runtime/services.ts
  → src/runtime/route-context-store.ts
  → src/mcp/tools.ts
       → memory lifecycle guard
       → prototype implementation strategy guard
       → actual operational mutation
```

No deferred code-intelligence module is required by this production chain. This permits the Real Steel migration to proceed without carrying the earlier reference-specific intelligence implementation as a runtime dependency.

## Task 0 exit decision

The prototype is not discarded wholesale. Deterministic identity, lease scoping, host-authority protection, memory-first guard ordering, meaningful-work classification, and verification separation are retained as candidate spareparts. All public/core semantics are rewritten around the approved two-mode Real Steel contract. Deferred reference-specific code remains in place only until Task 13 proves it has no runtime import and removes it safely.
