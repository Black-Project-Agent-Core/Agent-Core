# Graft Steal / Use Integration Plan

> **Status:** COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — GRAFT-P1 VERIFIED — REFERENCE RETIRED
> **Grounded:** 2026-09-29
> **Reference:** historical checkout `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Graft` — retired/deleted after adoption evidence capture
> **Checkout origin:** `https://github.com/Black-Project-Agent-Core/Graft.git`
> **Package upstream identity:** `https://github.com/NanoNets/context-graph-engine.git`
> **Revision:** `65c29667bd59d7137caba8f6f5b5790e2d1f9404`
> **License:** MIT
> **Checkout state:** retired/deleted after live adoption census; revision and source hashes retained in closure evidence and provenance docs.

## 1. Grounding basis

The audit used executable TypeScript source and direct tests as authority. It covered the context/graph engine, MCP tools, graph traversal, freshness, search/ranking, blast-radius review, Git ownership evidence, LSP enrichment, host integration, telemetry, app/UI and optional LLM meaning layer.

Current Agent Core comparison authority is the live v0.13.0 architecture: Grafel remains the sole structural graph provider, Semantic IDE/LSP owns symbol/source truth, Code Intelligence exposes request-scoped graph navigation/impact/diff, and Git/source evidence remains final authority.

The audit found one current-fit mechanism family that is not represented in current Agent Core source. It does not require importing Graft as a second graph provider.
## 2. GRAFT-P1 — changed-symbol review impact evidence

**Disposition:** CURRENT-FIT PROPOSAL — user review required.

Source mechanism:
- `src/blast/diff.ts` turns an explicit Git change basis into changed line ranges;
- `src/blast/blast.ts` maps each changed range to the innermost enclosing symbol before walking incoming dependencies;
- whole-file seeding is used only when no symbol can truthfully represent the change;
- changed areas carry behavioural-symbol test reach with explicit `changed | stale | none | na` semantics;
- `src/blast/evidence.ts` emits bounded changed-hunk and dependent-reference snippets explaining why an affected symbol is present;
- `src/blast/owners.ts` derives bounded recency-weighted owners/reviewers from Git history, excludes bots and authors, and never invents a GitHub handle;
- direct blast/owner/evidence tests pin these behaviors.

Verified Agent Core gap:
- current `code_surface(action=impact)` forwards changeset/entity impact to Grafel;
- current source has no changed-line-to-innermost-symbol seeding layer;
- current source has no per-changed-area test signal, changed-test list, unreached behavioural-symbol list, or bounded reviewer/owner evidence;
- exact searches for `changedTest`, `testFiles`, `unreached` and `blast` found no equivalent implementation.
## 3. Proposed Agent Core adaptation

Keep Grafel as the only structural graph provider and Semantic IDE/source as symbol authority. Do **not** import Graft's graph store, parser fleet, LSP client, MCP server or model runtime.

Add a small Agent Core-owned review projection around existing changeset impact:
1. accept the same explicit repo/base/head or bounded current-worktree change basis already used by Code Intelligence;
2. derive changed hunks from Git without mutating Git state;
3. resolve the tightest enclosing symbol using current source/Semantic IDE/Grafel evidence;
4. reuse existing Grafel impact/navigation for dependents rather than building a second graph;
5. classify test evidence only when graph/source evidence supports it; unavailable test reach must report `unknown`, never fabricate `none`;
6. attach bounded source snippets that explain the changed seed and the dependent reference;
7. optionally attach best-effort reviewer evidence from bounded Git history, with bot/author exclusion and no guessed handles;
8. keep output advisory/read-only and never make reviewer/test evidence an execution or merge gate.

Prefer additive output from the existing `code_surface impact` path without a new MCP tool. If response-shape compatibility cannot be preserved within the reviewed manifest budget, use an explicit offline inspector instead of expanding the public surface.
## 4. GRAFT-P1 acceptance

1. A one-line edit inside a nested method seeds the method rather than the enclosing class/file when exact spans exist.
2. Top-level/unresolved edits fall back to a truthful whole-file seed.
3. Impacted dependents come from the existing Grafel graph; no Graft graph database or second index is created.
4. Test state distinguishes changed/stale/none/na/unknown without treating missing graph evidence as proof of no tests.
5. Evidence snippets are bounded and quote only source lines that explain the seed/reach relation.
6. Reviewer evidence is best-effort, bounded, excludes bots/authors, and never guesses a handle.
7. Shallow/non-Git/unavailable-history cases fail soft and keep structural impact usable.
8. Read-only inspection performs no provider reindex, Git mutation, external-host write or model call.
9. Existing Code Intelligence tool count and unrelated response contracts remain compatible.
10. Exact source remains final authority.

## 5. Covered / rejected Graft families

**Covered by current Agent Core:** symbol overview, callers/callees/path traversal, repo topology, structural impact, graph-aware diff, search, LSP enrichment, workspace/ref routing, freshness/readiness, provider health and bounded result handling.

**Rejected as duplicate authority:** Graft `.context` Markdown graph, `graph.json`, Tree-sitter graph engine, separate MCP server, hidden auto-refresh-before-query semantics, Graft app/server/viewer, host config/hook mutation, telemetry subsystem, and OpenAI/Anthropic/LiteLLM/OrcaRouter model transports.
The optional Tier-2 LLM concept/summarization layer is also rejected for current Agent Core: it would introduce a second semantic code authority and provider/model runtime beside Grafel + Semantic IDE.

The multi-scope/file search fusion and bounded candidate pooling are **not proposed now**. They are well-tested in Graft, but Agent Core currently delegates structural ranking to Grafel and no measured current ranking defect justifies a client-side reranker. Revisit only from concrete retrieval-quality evidence, not as speculative duplication.

## 6. Reference disposition

**RETAIN IN ACTIVE REFERENCE POOL.** GRAFT-P1 is current-fit and awaits user review. The checkout is therefore neither corpse nor consumer-only.

No implementation, dependency installation, build, runtime activation, restart, release, commit, tag, push, publish or deployment is authorized by this grounding pass.

## 7. Source-first re-grounding closure — 2026-09-29

The fixed checkout was re-read against current Agent Core source, current Grafel/Semantic IDE ownership, and a temporary request-scoped Grafel audit workspace. The checkout remains at `65c29667bd59d7137caba8f6f5b5790e2d1f9404`; the only working-tree residue is the pre-existing untracked ZIP snapshot.

GRAFT-P1 remains a real current-line gap. Exact Agent Core source searches still find no equivalent `changedTest`, `testFiles`, or `unreached` review evidence, and no Git-history reviewer projection. Existing `code_surface(action=impact)` still delegates structural reach to Grafel without changed-hunk-to-innermost-symbol seeding or the bounded review evidence described above.

The re-grounding did not identify a second current-fit Graft family. Current Agent Core already owns graph navigation, graph-aware diff/impact, call-context inspection, LSP symbol/source truth, freshness, workspace/ref routing, patterns, repair, diagnostics, Learning/Reflexion, bounded MCP results and Activity Tracker evidence. Graft search fusion, alternate graph storage/parsing, host mutation, viewer/app, telemetry and model transports therefore remain rejected or deferred unless a measured defect creates a new consumer.

**Disposition:** keep `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Graft` in the active adoption-reference pool pending user review of GRAFT-P1. It is not corpse and not consumer-only. No runtime/source implementation, dependency installation, build, restart, release action, commit, tag, push, publish or deployment is authorized by this plan update.
## 8. Approved implementation closure — 2026-09-29

User approval activated GRAFT-P1. The implementation is Agent Core-owned TypeScript in `src/code-intelligence/change-review.ts`, wired additively into existing `code_surface(action=impact, scope=changeset)` through `src/mcp/code-intelligence-tools.ts`. `src/mcp/server.ts` now passes the existing Semantic IDE sibling into the Code Intelligence registration boundary; no new public MCP tool or alternate graph provider was added.

Implemented behavior:
- Git diff uses explicit base/head when supplied, otherwise bounded working-tree vs HEAD evidence, with rename-aware file status and zero-context changed hunks.
- Semantic IDE provides nested symbol ranges; each hunk selects the tightest enclosing symbol and truthfully falls back to a whole-file seed when symbol evidence is unavailable.
- Existing Grafel `grafel_find`/`grafel_impact_radius` remains structural authority for entity binding and dependents.
- Per-seed test evidence distinguishes `changed`, `stale`, `none`, `na`, and `unknown`; truncated/unavailable graph evidence never becomes a false `none`.
- Source snippets are bounded and redacted. Git reviewer evidence is bounded, recency-weighted, excludes the current author and common bot identities, and never guesses handles.
- Changeset impact preserves the provider payload at the top level and adds only `reviewEvidence`, so the old structural result shape remains readable.

Verification:
- dedicated Graft/Graphify acceptance: **5/5 PASS**;
- touched Code Intelligence regression matrix: **44/44 PASS** after aligning two stale test fixtures with the pre-existing provider-attestation runtime contract;
- `npm run build`: PASS; path policy 261 authored files / 0 exceptions;
- `release:compat`: **70 -> 70 tools**, no added/removed routes/tools/schema changes, `breakingEvidence=false`, manifest 117,703 bytes / ~29,426 tokens;
- post-change Grafel reindex: current, registered-workspace coverage 1/1; post-change cycle analysis: 0 cycles.

Release intent: `.changeset/20260929-graft-graphify-code-intelligence.md` (minor), planned `0.14.0 -> 0.15.0`. No `release:apply`, commit, tag, push, publish or deploy occurred.

**Activation boundary:** compiled `dist` is built, but this plan does not claim resident live activation until the user-controlled Agent Core restart/reconnect loads the new modules and a fresh MCP readback verifies `reviewEvidence`. Keep the Graft checkout until that activation and final zero-value/reference census are complete.
## 9. First resident activation + reference retirement — 2026-09-29

The user restarted/reconnected Agent Core. Resident launcher PID **16748** started at **2026-09-29T07:40:37.617Z** and resident Node PID **14624** started at **07:40:43.274Z**, after the approved compiled artifacts were written at **07:18:40–42Z**. `/health` returned `status=ok`, product `0.14.0`, Memory/Execution/Code Intelligence/Semantic IDE/Learning/Skills available, and Code Intelligence `current` with `issueCount=0`.

The resident compiled MCP module imports `buildChangedSymbolReview` and contains the additive `reviewEvidence` changeset-impact wrapper. Direct changeset invocation could not be behaviorally exercised against the live provider because Grafel has only the default ref graph (`ref=""`) and rejects named `HEAD/main` ref comparisons unless those named ref graphs exist. This is a provider ref-graph precondition, not a GRAFT-P1 runtime exception. Dedicated GRAFT-P1 acceptance remains **5/5 PASS** and the post-restart Node process is newer than the compiled review module.

Final census found **0 active `src` matches, 0 `scripts` matches, and 0 process consumers** for the Graft checkout; test matches are only adoption-wave labels/fixtures. No residual Graft mechanism remained current-fit after GRAFT-P1 adoption. Under the user's explicit corpse-retirement rule, the checkout was deleted after source-hash capture. Evidence: `runtime/tmp/graft-graphify-live-activation-closure-20260929.json`.

The later live GRAPHIFY-P2 correction does not change GRAFT-P1 source. Overall wave final resident closure remains pending only because the corrected diagnostics classifier was built after this restart.
## 10. Final installed-runtime closure — 2026-09-29

The second user-controlled restart completed final activation. Resident launcher PID **7428** started at **2026-09-29T08:01:36.594Z** and Node PID **1740** at **08:01:41.390Z**, after the corrected compiled artifact `dist/code-intelligence/graph-observability.js` was written at **07:53:30Z**.

`/health=ok`; Memory, Execution, Code Intelligence, Semantic IDE, Learning and Skills are available. Code Intelligence is `current`, provider attestation current, graph integrity accepted, and issueCount 0.

GRAFT-P1 therefore remains installed in the resident build through the same compiled MCP module already proven on the first restart; no later source change touched `change-review.ts` or its `reviewEvidence` wiring.

Reference lifecycle is closed: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Graft` is absent after the approved corpse-retirement census. Hash/provenance evidence remains in `runtime/tmp/graft-graphify-live-activation-closure-20260929.json`.

**Final state: COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.** No release apply, version bump, commit, tag, push, publish or deploy occurred.