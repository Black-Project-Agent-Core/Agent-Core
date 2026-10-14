# Graphify Steal / Use Integration Plan

> **Status:** COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — GRAPHIFY-P1/P2 VERIFIED — CONSUMER REFERENCE
> **Grounded:** 2026-09-29
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\graphify`
> **Origin:** `https://github.com/Graphify-Labs/graphify.git`
> **Revision:** `26b02b5e3430e4ab85dd7e72c7b98836d8e65c48`
> **Branch:** `v8`
> **Package:** `graphifyy 0.9.63`
> **Primary license:** Apache-2.0; repository also contains `LICENSE-MIT` and `NOTICE`.
> **Checkout state:** moved intact to Consumer after adoption census; revision `26b02b5e...` and pre-existing untracked ZIP preserved.

## 1. Grounding basis

This plan is source-first. The audit read executable Python source, selected regression tests, package metadata and current Agent Core source. A temporary request-scoped Grafel workspace was also used as a structural second opinion; exact source remains final authority.

The inspected families include extraction/build/update, cache/manifest lifecycle, affected traversal, cross-repo resolution, clustering/dedup, global graph, SCIP/manifest/database ingestion, semantic fragments, query/report/reflect, MCP/server, security, host integrations and the large regression suite.

Current Agent Core boundary remains unchanged: Grafel is the sole structural graph provider; Semantic IDE/LSP and exact source own symbol/source truth; Code Intelligence is an advisory sibling and never an execution gate.

Two mechanisms remain current-fit without importing Graphify as a second graph engine.

## 2. GRAPHIFY-P1 — accepted-index integrity and unexplained-shrink guard

**Disposition:** CURRENT-FIT PROPOSAL — user review required.
Source/test mechanism:
- `tests/test_build_merge_shrink_guard.py` compares the accepted on-disk baseline by node identity and blocks losses from untouched sources unless the loss is explained by this run's explicit re-extraction or prune set.
- the same tests distinguish a legitimate prune/re-extract shrink from unexplained graph destruction and warn when a requested prune matched nothing.
- `tests/test_incomplete_build_guard.py` makes an incomplete extraction use the shrink guard instead of force-overwriting an existing complete graph; malformed existing state fails closed, and a refused write does not stamp the new manifest.
- `tests/test_unverified_semantic_shrink.py` tracks semantic shrink per source so growth in another source cannot hide under-production; the affected source remains unstamped so a later run retries it.

Verified Agent Core gap:
- current Code Intelligence health proves provider index state, graph availability and registered-repo coverage, but keeps no accepted structural baseline or unexplained-shrink classification;
- exact current source has no graph `node_count`/`edge_count` shrink guard, incomplete-build acceptance state, or previous-accepted graph fingerprint;
- therefore `provider says current` and `graph loads` are currently stronger evidence than Agent Core itself independently proves about destructive index replacement.

Proposed adaptation:
1. add a small Agent Core-owned graph-acceptance observer inside existing Code Intelligence ownership; do not create a second parser/index/database;
2. before an explicit index/reindex, capture bounded accepted evidence for the same workspace/ref (provider identity, commit/ref when known, entity/relationship counts and source-representation evidence from GRAPHIFY-P2);
3. after provider completion, compare the new state to the prior accepted state and the actual changed/deleted source basis;
4. classify only unexplained destructive loss or incomplete/unreadable evidence as degraded/unverified; legitimate source deletion/ref change/rebuild must remain possible;
5. never restore or rewrite Grafel graph state automatically; preserve the last accepted evidence and require explicit reindex/repair/operator override for unresolved anomalies;
6. keep this advisory to Code Intelligence health/readiness and never make it a machine-control execution gate.
### GRAPHIFY-P1 acceptance

1. A deliberately incomplete candidate that loses unrelated accepted entities cannot be reported as fully accepted/current by Agent Core merely because the provider process completed.
2. A legitimate deletion or explicit bounded re-extraction can reduce graph size without a false alarm when the loss is explained by current source/ref evidence.
3. One repo's growth cannot mask unexplained loss in another source/repo.
4. Missing/corrupt prior evidence fails soft to `unverified/degraded`; it never becomes proof that the new graph is safe.
5. No automatic rollback, provider-state rewrite, Git mutation, parser fleet or second graph store is introduced.
6. Existing public Code Intelligence tools remain compatible unless a separately reviewed schema change is required.

## 3. GRAPHIFY-P2 — truthful source-representation coverage

**Disposition:** CURRENT-FIT PROPOSAL — user review required.

Source/test mechanism:
- Graphify detection records files it encountered but could not classify or represent; `report.py` surfaces their count and dominant extensions instead of giving the same healthy-looking corpus verdict as a fully represented repository.
- `tests/test_detect.py` and `tests/test_report.py` pin visibility for extensionless/unclassified inputs and unsupported-extension-heavy corpora.
- partial/extraction warnings report the affected file and how much survived instead of collapsing partial extraction into a silent success.

Verified Agent Core gap:
- current `groupCoverage` answers whether registered repositories have an available/current provider graph; it does not say what fraction of relevant source files is represented inside that graph;
- exact Code Intelligence source has no `unclassified`, `unrepresented`, `unsupported language`, or source-representation coverage model.

Proposed adaptation:
1. augment existing Code Intelligence diagnostics/status with a bounded source-representation observation; do not create a new MCP tool unless compatibility review proves that additive output is unsafe;
2. enumerate a bounded/current repository source basis using existing project/Git/filesystem boundaries and compare it with provider-backed source-file evidence available from the current graph;
3. report represented, unrepresented/unknown and intentionally excluded counts separately, including bounded sample paths/extensions;
4. never treat missing provider evidence as proof that a file has no structural importance;
5. keep unsupported/generated/vendor/excluded classes explicit so coverage is not inflated by silently dropping them.
### GRAPHIFY-P2 acceptance

1. A fixture with supported source plus intentionally unsupported/unclassified files reports the latter instead of claiming complete representation.
2. Repository registration/current graph state and source representation are separate fields; 1/1 registered repo coverage cannot imply 100% source coverage.
3. Sample lists and extension summaries are bounded and path-safe.
4. Generated/vendor/excluded files are distinguishable from unknown/unrepresented source.
5. No provider reindex, filesystem mutation or model call occurs merely to compute the read-only coverage report.

## 4. Covered, conditional and rejected Graphify families

Already covered by Agent Core/Grafel/Semantic IDE: affected/caller traversal, paths/subgraphs/traces, graph-aware impact/diff, clusters/topology, cycles/debt/security/test analysis, cross-repo links, symbol diagnostics, workspace/ref freshness, repair candidates, patterns, quarantine and bounded call-context/source inspection.

Rejected as duplicate authority or unnecessary runtime: NetworkX/global graph store, parser/extractor fleet, separate MCP/server, Neo4j/FalkorDB backends, alternate watcher, host installers/hooks, wiki/Obsidian/canvas exporters, query log, report UI, LLM backends, semantic-cluster naming and the separate reflect/work-memory layer.

Source portability/stat-index self-healing and deleted-corpus husk prevention were reviewed but are not proposed as a new subsystem: current Agent Core already owns project-root portability, source freshness, atomic persistence and owned runtime lifecycle. Adopt only from a demonstrated current defect, not as duplicate cache infrastructure.

Semantic-fragment validation/evidence binding, manifest/SCIP/database ingestion, hyperedges and external semantic extraction remain conditional. Current Agent Core has no native producer that should submit untrusted LLM graph fragments or alternate graph corpora directly into structural authority; `code_repair` enrichment already requires explicit source verification. These families do not justify a consumer-only move because GRAPHIFY-P1/P2 keep this reference active.

## 5. Reference disposition and execution boundary

**RETAIN IN ACTIVE ADOPTION-REFERENCE POOL.** GRAPHIFY-P1 and GRAPHIFY-P2 are current-fit and await user review. The checkout is therefore neither corpse nor consumer-only.

No Graphify Python runtime, NetworkX graph engine, dependency, parser, service, MCP tool, hook or background daemon is authorized by this planning pass. No implementation, build, test suite, runtime cutover, restart, release, commit, tag, push, publish or deployment has been performed.
## 6. Approved implementation closure — 2026-09-29

User approval activated GRAPHIFY-P1/P2. Both mechanisms were implemented natively in Agent Core; no Graphify Python runtime, NetworkX store, parser fleet, watcher, backend, or MCP server was installed.

### GRAPHIFY-P1 implementation

`src/code-intelligence/graph-observability.ts` now keeps a bounded Agent Core-owned accepted structural observation per workspace/repo/ref. It records source identity plus provider entity/relationship counts, using atomic project-local persistence only.

Acceptance semantics are fail-closed:
- same-source entity/relationship shrink is `degraded` and never replaces the accepted baseline;
- source-changed shrink is `unverified` unless the exact source fingerprint was pre-authorized by an explicit `code_workspace(index)` request;
- a legitimate explicitly-indexed source-changed shrink can become the new accepted baseline;
- unavailable observer evidence remains unavailable rather than becoming proof of health;
- no automatic Grafel rollback, graph rewrite, Git mutation, or machine-control gate was added.

### GRAPHIFY-P2 implementation

`code_orient(action=diagnostics)` now includes a bounded `sourceRepresentation` observation. It enumerates the current Git worktree basis and separates:
- source candidates;
- intentionally excluded/generated/vendor/document/binary material;
- unclassified paths;
- represented, unrepresented, and unknown sampled source files.

The probe is bounded to 64 source candidates, runs only on the explicit diagnostics path, performs no provider reindex or model call, and returns `partial` whenever sampling is truncated or provider evidence is unknown. Registered-repository `groupCoverage` keeps its prior meaning; integrity and source representation are separate evidence rather than silently redefining old fields.

### Verification and release integrity

- dedicated Graft/Graphify acceptance: **5/5 PASS**;
- touched Code Intelligence regression matrix: **44/44 PASS**;
- `npm run build`: PASS; path policy 261 authored files / 0 exceptions;
- `release:compat`: **70 -> 70 tools**, no route/tool/schema removal or addition, `breakingEvidence=false`;
- post-change Grafel reindex: current / registered-workspace coverage 1/1;
- post-change structural cycle analysis: 0 cycles;
- `release:check-intent`: OK.

Release intent: `.changeset/20260929-graft-graphify-code-intelligence.md` (**minor**). Read-only release plan is `0.14.0 -> 0.15.0`, pending 1. No `release:apply`, version bump, commit, tag, push, publish or deploy occurred.

Provenance for both approved adaptations is recorded in `THIRD_PARTY_NOTICES.md`.

**Activation boundary:** compiled `dist` is ready, but resident live activation remains pending a user-controlled Agent Core restart/reconnect and fresh runtime readback. Keep the Graphify checkout until activation plus final classification of the remaining consumer-bound semantic/alternate-ingest families; those residuals are not current runtime proposals.

## 7. First resident activation, live correction, and Consumer classification — 2026-09-29

After the user restart/reconnect, live `code_workspace(status)` returned `current`, graph availability with **9,131 entities / 48,061 relationships**, and `graphIntegrity.state=accepted` / `stable-or-growing-graph`. Live `code_orient(diagnostics)` also returned the new bounded `sourceRepresentation` field, proving GRAPHIFY-P1/P2 from the first compiled candidate were resident.

That live diagnostics readback exposed a correctness gap: the first 64 sorted source candidates were under `SubProject/...`, while root `.grafelignore` explicitly excludes `/SubProject/`. They were therefore intentional provider exclusions, not true unrepresented source. `src/code-intelligence/graph-observability.ts` was corrected to parse bounded `.grafelignore` rules (root anchoring, directory rules, `*`, `**`, `?`, ordered negation) before classifying representation candidates; `.grafelignore` itself is treated as excluded provider configuration.

The correction is covered by the dedicated acceptance fixture: ignored source is no longer probed as a representation candidate. Post-correction acceptance is **5/5 PASS**; `npm run build` PASS with path policy **261/0**; `release:compat` remains **70 -> 70**, no route/tool/schema changes, `breakingEvidence=false`; `release:check-intent` remains OK. The attempted 44-test regression rerun was blocked by the outer safety wrapper before a process was created, so no new result is claimed for that rerun; the previously completed matrix remains **44/44 PASS**.

Final reference census found 0 active `src`/`scripts` consumers and no runtime process consumer. Graphify still retains conditional value only for future semantic-fragment / alternate-ingest consumers, so under the user's explicit reference rule it was moved intact to `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\graphify`. HEAD remains `26b02b5e3430e4ab85dd7e72c7b98836d8e65c48`, branch `v8`, with the pre-existing untracked audit ZIP preserved.

After the correction, Grafel was explicitly reindexed and returned `current` with integrity accepted, **9,140 entities / 48,111 relationships**. Because the `.grafelignore` correction itself was compiled after the first restart, final installed-runtime verification for the corrected GRAPHIFY-P2 classifier still requires one final user-controlled restart/reconnect. No release apply/version bump/commit/tag/push/publish/deploy occurred.
## 8. Final installed-runtime closure — 2026-09-29

The second user-controlled restart loaded the corrected GRAPHIFY-P2 build: Node PID **1740** started at **2026-09-29T08:01:41.390Z**, after corrected `graph-observability.js` modification at **07:53:30Z**.

Live `code_workspace(status)` is `current`; graph integrity is `accepted / stable-or-growing-graph` with **9,140 entities / 48,111 relationships**, registered-workspace coverage 1/1, and integrityComplete=true.

Live corrected `sourceRepresentation` now reports **373** source candidates, **967** intentional exclusions, **17** unclassified, **64** checked, **60 represented**, **4 unrepresented**, **0 unknown**, truncated=true. `SubProject/...` no longer appears in unrepresented evidence because `.grafelignore` exclusions are now honored.

The four remaining sampled unrepresented files are explicit PowerShell scripts under `scripts/...`; they remain visible as truthful unrepresented evidence rather than being silently excluded.

Reference lifecycle is closed for current scope: old `graphify` root is absent, while `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\graphify` remains intact at HEAD `26b02b5e3430e4ab85dd7e72c7b98836d8e65c48`, branch `v8`, with only the pre-existing untracked audit ZIP.

**Final state: COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.** No release apply, version bump, commit, tag, push, publish or deploy occurred.