# Grafel Re-Grounding + Final Steal/Use Proposal — Agent Core

> **Status:** G29.6-R / G29.7 / G30 COMPLETE / LIVE-ACTIVATED / INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS; EARLIER SELECTIONS PRESERVED; REFERENCE RETAINED
> **Latest review:** Production activation is complete; see the final activation section and docs/Wave7-Activation-20260923.md. Older NOT ACTIVATED/failed-checkpoint labels below are historical evidence, not current activation tasks.
> **Current audit checkout:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\steal-use-repos\Grafel` at `5eb5be1255aa7583b6310daf6d98c4fa648c4031`.
> **Current evidence:** G26/G27/G29/G30 provider is installed from selected qualified staging; G28 native behavior is preserved. This is not a wholesale upstream upgrade. Earlier G20–G25 and failed-G29 reports remain historical evidence.
> **Re-grounded:** 2026-09-20
> **Implemented:** 2026-09-20
> **Live activated:** G20–G25 on 2026-09-20; selected G26/G27/G28 on 2026-09-22
> **Historical G20–G25 open implementation:** none in the 2026-09-20 record. **Current G26/G27/G28:** selected implementations are live; installation and live readback are closed, with the separate unverified host-symlink case still disclosed.
> **Activation evidence:** restarted Node Core reports Code Intelligence `available/current`, `providerWireVersion=0.1.0`, `providerWireCompatible=true`, and `issueCount=0`. External MCP clients that initialized against an older tool manifest may need their own reinitialize/reconnect before additive enum values are accepted client-side.
> **Reference:** `E:\Projects\Agent-Core\Audit\Grafel`
> **Reference revision:** `45f9745d02f3662a8516fb35cd2d0624acf82cbf` (`v0.3.3-50-g45f9745d0`)
> **Origin:** `https://github.com/cajasmota/grafel.git`
> **Reference state:** retired/deleted after clean zero-value census
> **Active provider:** Agent Core-owned qualified Grafel build from the same source revision
> **Implementation authorization:** G20–G25 approved and executed; user subsequently restarted/reconnected Agent Core and live activation was verified.

## 1. Goal

Re-ground the exact Grafel source revision used by Agent Core and identify every remaining mechanism that can materially improve Agent Core without duplicating the Grafel runtime, creating another graph authority, or turning Code Intelligence into an execution gate.

This document supersedes the stale proposal-state portions of the previous post-v0.3.3 plan. Historical implementation evidence remains valid where corroborated by current source/runtime.

User review was completed and the full G20–G25 proposal set was approved for implementation on 2026-09-20.

## 2. Non-negotiable architecture boundaries

- Exact current source remains final authority.
- Grafel remains derived structural evidence, never execution authority.
- Agent Core Memory, Reflexion, Learning, Semantic IDE, Repair, Patterns, Fitness, and machine-control remain sibling capabilities.
- No user-global Grafel install/store/daemon may be mutated.
- No new top-level MCP tool is justified merely to expose an upstream helper.
- Prefer extending the existing seven `code_*` facades.
- No hidden second agent, workflow gate, release gate, or telemetry database.
- Any mutation proposed below must be explicit, previewable where practical, bounded, and separately authorized.## 3. Grounding methodology

The census is source-first, not README-first.

Evidence inspected:
- Git HEAD/origin/cleanliness.
- 8,505 tracked files.
- 5,301 Go source files.
- 3,047 Go test files.
- all 71 top-level `internal/*` package families.
- `internal/mcp` registration, canonical dispatchers, schema-contract tests, activity, budget, and payload handling.
- `internal/registry` lifecycle and containment logic.
- daemon/engine/index/status/ref/worktree lifecycle code.
- query/analysis/diff/pattern/security/test surfaces.
- exact current Agent Core `src/code-intelligence`, MCP schemas/tools, tests, and live provider diagnostics.

Current live provider diagnostics expose 22 canonical Grafel tools and report the qualified source commit above.

Important live finding: the Grafel registry currently retains stale forensic workspaces for deleted `Audit\A-MEM`, `Audit\Changesets`, and `Audit\Reflexion` paths. Agent Core can register/list/index workspaces but has no workspace unregister/stale-prune action.

Important cross-system finding: Agent Core recently reproduced the same class of MCP contract drift Grafel protects against — `get_recent_tool_calls` handled `compact`/`failuresOnly` internally while the public MCP schema omitted them.

## 4. 71/71 package-family census

The package-family census has no unclassified remainder.

### 4.1 Provider-owned / inherited — 52 families

These are already executed inside the qualified Grafel provider or are provider implementation details. Re-porting them into TypeScript would duplicate authority.`algorithms`, `authposture`, `classifier`, `cli`, `coverage`, `custom`, `daemon`, `dashboard`, `docgen`, `embed`, `engine`, `enrichers`, `enrichment`, `entkinds`, `executil`, `external`, `extractor`, `extractors`, `frameworks`, `generated`, `gitmeta`, `graph`, `indexer`, `indexstate`, `ingest`, `licenses`, `lifecycle`, `links`, `literalparity`, `membench`, `memtrace`, `module`, `perf`, `process`, `quality`, `relkinds`, `repolock`, `repowalk`, `resolve`, `responseshapediff`, `secrets`, `statusfile`, `stubdetector`, `substrate`, `tautology`, `testsupport`, `treesitter`, `txscope`, `types`, `vbnet`, `verify`, `version`.

Decision: **DO NOT PORT**. Consume through the provider where relevant.

### 4.2 Existing Agent Core equivalents — 6 families

`atomicfile`, `envguard`, `homeguard`, `pathboundary`, `protectedpath`, `safeio`.

Current Agent Core already has equivalent/current hardening for atomic persistence, environment isolation, protected/sensitive paths, and bounded regular-file I/O.

Decision: **COVERED — NO NEW ADOPTION**.

### 4.3 Pattern capability already exposed — 2 families

`agentpatterns`, `patterns`.

Agent Core already exposes code/graph/template pattern behavior through `code_patterns`, while generic operational lessons remain in Memory.

Decision: **COVERED — KEEP EXISTING BOUNDARY**.

### 4.4 Remaining source families with boundary-level value — 2 families

`mcp`, `registry`.

These contain the remaining mechanisms worth proposing because they harden Agent Core's own MCP/provider boundary rather than duplicate Grafel graph internals.

### 4.5 Explicitly rejected as duplicate or wrong-owner — 9 families

`agents`, `audit`, `errors`, `feedback`, `install`, `jobs`, `notifications`, `personas`, `progress`.

Reasons include external-host mutation, a second activity/feedback store, a hidden job/agent loop, duplicate telemetry, or a broad error-system rewrite with no demonstrated correctness gap.

## 5. Proposal G20 — workspace unregister + stale registry hygiene**Priority:** HIGH

Source evidence:
- `internal/registry.RemoveGroup(name)` is idempotent.
- Grafel uninstall removes registry state and optionally purges contained state.
- purge uses `StateDirForExisting`/containment protection before recursive removal.
- daemon tests verify rebuild work aborts safely when a group disappears and behaves correctly if a group is recreated.
- live Agent Core registry contains stale audit groups whose repo paths no longer exist.

Agent Core gap:
- `code_workspace` supports list/resolve/register/status/index/refs/pin/unpin/prune_refs.
- it does not support unregistering a workspace/group.
- it does not detect/prune registry entries whose repos have all disappeared.

Proposed Agent Core-owned surface:
- extend `code_workspace` with `unregister`.
- extend `code_workspace` with `prune_workspaces`.
- `prune_workspaces` defaults to dry-run.
- mutation requires explicit confirmation.
- current/default `agent-core` workspace is protected unless a separately explicit override is designed and reviewed.
- verify exact registry identity before mutation.
- purge provider state only through provider-owned safe lifecycle semantics; never raw `Remove-Item -Recurse` against derived paths.
- restart only the isolated Grafel provider if required; never restart Agent Core merely for registry cleanup.

Acceptance intent:
- stale deleted Audit workspaces are discoverable in dry-run.
- active workspaces are never selected as stale.
- unregister unknown workspace is idempotent.
- path containment is verified before optional purge.
- a removed workspace cannot continue to appear after readback.
- no external hooks/user-global Grafel state are introduced.## 6. Proposal G21 — MCP schema contract auto-derivation/parity guard

**Priority:** CRITICAL/HIGH

Source evidence:
- `internal/mcp/schema_contract_autoderiv_test.go` derives registered tool→handler ownership from the source AST.
- it follows dispatcher-to-subhandler call chains transitively.
- every tool that can reach a handler must advertise every argument that handler reads, unless explicitly allow-listed.
- ambiguous/dynamic registration patterns cause a hard STOP for manual review instead of silently guessing.

Why this is directly relevant:
- Agent Core's `get_recent_tool_calls` internal schema/handler accepted `compact` and `failuresOnly`.
- the public MCP schema in `src/mcp/rdc-schemas.ts` omitted both fields.
- the connector therefore discarded valid arguments even though compiled handler behavior was correct.
- reconnecting could not repair a source-level schema mismatch.

Proposal:
- add a TypeScript AST/source contract test owned by Agent Core.
- derive public MCP registrations and the schema object used by each registration.
- map registrations to handlers and known delegated/sub-handler paths.
- compare public schema properties against handler/parser schema properties and direct argument reads.
- fail the targeted contract check when a parameter is consumed but not advertised.
- fail closed to manual review when registration is generated dynamically and cannot be proven statically.
- do not run this as a runtime execution gate.

Preferred implementation:
- use the already-installed TypeScript compiler API; no new parser dependency unless source patterns prove it insufficient.
- cover both native Agent Core tools and vendored RDC-derived registrations.
- start with the exact `get_recent_tool_calls` drift as the positive regression fixture.## 7. Proposal G22 — complete MCP manifest fingerprint + handshake budget

**Priority:** HIGH

Source evidence:
- Grafel's `schema_trim_5386_test.go` snapshots exact registered tool parameter names and required sets.
- unexpected tools, removed/renamed parameters, or required-set drift fail loudly.
- Grafel also measures the serialized `tools/list` handshake against an explicit token ceiling.
- its design rule folds related operations into discriminated canonical tools rather than growing top-level tool count without bound.

Agent Core gap:
- `release:compat` currently catches tool/route addition/removal but did not catch the `compact`/`failuresOnly` omission.
- existing bridge tests inspect only a narrow subset of tool schema behavior.
- there is no full 62-tool schema fingerprint or manifest-size budget.

Proposal:
- derive a deterministic fingerprint for every public MCP tool:
  - tool name;
  - input property names;
  - required set;
  - relevant enum/default/type shape;
  - deliberate annotations.
- compare current surface to the released/baseline contract.
- classify removed params, newly-required old params, incompatible type/enum narrowing, and tool removal as breaking evidence.
- classify added optional params as additive evidence.
- add a serialized `tools/list` size/token budget with measured baseline + bounded headroom.
- keep Agent Core's explicit truthful annotations; do not copy Grafel's blanket annotation stripping.
- integrate this into read-only compatibility verification, not normal execution.

Acceptance intent:
- the current schema drift is detected before connector initialization.
- unchanged surfaces produce deterministic identical fingerprints.
- an optional field addition is non-breaking but visible.
- a required-field/type narrowing is breaking evidence.
- tool manifest size regression is measurable without blocking runtime startup.## 8. Proposal G23 — provider wire-version compatibility handshake

**Priority:** HIGH/MEDIUM

Source evidence:
- Grafel defines an MCP `wire_version` independent from the binary version.
- `grafel_whoami`/canonical `grafel_orient(view=me)` returns it even in quiet mode.
- source tests require the field to remain present.

Agent Core gap:
- bootstrap records provider binary version and tool names.
- it verifies required canonical tools and CLI capabilities.
- it does not negotiate/check provider `wire_version`.
- a binary can therefore expose familiar tool names while changing wire semantics in a way tool-name checks cannot detect.

Proposal:
- during provider bootstrap/diagnostics call canonical `grafel_orient` with `view=me`.
- parse and retain `wire_version`.
- define an Agent Core-supported wire-version range/major policy.
- expose `providerWireVersion` in health/diagnostics/provider provenance.
- unsupported wire version degrades only Code Intelligence and emits a precise issue.
- machine-control, Memory, Semantic IDE, and normal Agent Core execution remain available.

Acceptance intent:
- current provider wire version is discovered and reported.
- supported version stays healthy.
- synthetic unsupported version produces Code Intelligence degraded state only.
- missing field is reported distinctly from provider process failure.## 9. Proposal G24 — typed canonical query/discriminator parity

**Priority:** MEDIUM/HIGH

Source evidence from the registered canonical Grafel surface:
- `grafel_find` supports `search=bm25|substring`, mode/depth/token budget, result limit/format, `cross_repo`, `full`, `include_noise`, `context_filter`, and field projection.
- `grafel_inspect` supports field projection, unresolved-call inclusion, and opt-in facets such as `call_contexts`.
- `grafel_orient` supports `view=stats` and `view=me` in addition to views already surfaced.
- canonical analysis discriminators are finite and documented in code:
  - debt: `dead_code`, `find_dead_code`, `cycles`, `import_cycles`, `stubs`, `impure`, `license`;
  - security: `findings`, `secrets`, `auth_coverage`;
  - tests: `coverage`, `reachability`, `contract_effectiveness`, `coverage_effectiveness`.

Agent Core gap:
- several of these are reachable only through raw `params`.
- `code_analysis.analysis` is a free string, so accepted values are not discoverable in the MCP schema.
- `code_orient` cannot request provider corpus `stats` directly.

Proposal:
- add only stable, high-value typed fields to existing facades; no new top-level tool.
- type `search=bm25|substring` for `code_orient(action=find)`.
- add bounded `limit`, `fields`, `contextFilter`, and `crossRepo` where provider semantics are stable.
- add `fields`, `includeUnresolved`, and `includeFacet` for inspect.
- add `code_orient(action=stats)` for bounded corpus metrics.
- make known debt/security/test discriminator values discoverable and validated while preserving `params` as an escape hatch for provider-forward-compatible options.
- do not expose `view=me` publicly solely for protocol negotiation; G23 can use it internally.## 10. Proposal G25 — bounded graph-touch evidence in existing Activity Tracker

**Priority:** MEDIUM — OPTIONAL / USER SELECTABLE

Source evidence:
- Grafel's per-call ID collector records node/edge IDs while handlers still hold structured graph objects.
- activity events can include returned/touched entity IDs without modifying tool responses.
- the broker is non-blocking and treats visualization telemetry as best-effort.

Agent Core gap:
- current Code Intelligence activity records family/action/provider tool/workspace/ref/duration.
- it does not retain bounded evidence of which graph entities/edges a structural operation actually touched.

Proposal:
- do NOT import Grafel's SSE broker or second activity log.
- reuse Agent Core's existing Activity Tracker only.
- collect at most a small bounded set of touched entity/edge IDs from structured provider results and explicit input IDs.
- redact/bound values before persistence.
- record only for materially useful Code Intelligence operations.
- never change the tool's response shape merely for tracking.

Benefit:
- better evidence for Reflexion and forensic debugging of graph-assisted decisions.
- easier correlation between `code_*` calls and structural entities.

Constraint:
- user previously deferred broad Activity Log expansion; therefore this proposal must remain optional until explicitly selected.

## 11. Mechanisms explicitly evaluated and not proposed

### 11.1 Structured global error registry

Grafel's `internal/errors` provides stable codes, hints, and docs links. Agent Core already has bounded failure-family extraction, explicit error prefixes, Activity Tracker failures, and subsystem-specific health issues. A global rewrite would touch too many surfaces without a demonstrated correctness gap.

Decision: **REJECT NOW**. Revisit only if a concrete cross-subsystem error-contract problem appears.

### 11.2 Separate progress/activity/feedback brokers

`progress`, `audit`, `feedback`, `notifications`, and `personas` provide local event buses/logs/feedback stores.

Decision: **REJECT**. Agent Core already owns Activity Tracker, Tool History, Learning, Memory, and UI activity surfaces. A second bus/store would fragment evidence.### 11.3 Deferred structured-payload single-marshal optimization

Grafel's MCP layer uses structured content to avoid marshal→parse→remarshal cycles and supports field projection/TOON output.

Decision: **DEFER**. No Agent Core profile currently proves MCP serialization is a material bottleneck. G22 manifest budget and existing output bounds should land before any transport micro-optimization.

### 11.4 `statusfile` sidecar plane

Grafel exposes fast file-native engine/index status. Agent Core consumes provider-owned CLI/status behavior and already applies bounded process timeouts.

Decision: **DO NOT PORT**. This belongs inside the provider and is already inherited by the qualified provider build.

### 11.5 Agent/host injection and install lifecycle

`agents` and `install` can mutate AI-host guidance, hooks, watchers, scheduler units, and host-specific config.

Decision: **REJECT**. Agent Core must not mutate external AI hosts or Git hooks implicitly.

### 11.6 Enrichment jobs / hidden agent work

`jobs` and portions of enrichment orchestration can dispatch background agent work.

Decision: **REJECT**. This conflicts with Agent Core's no-hidden-second-agent/no-autonomous-workflow boundary.

### 11.7 Document semantic graph as product authority

`ingest`/doc semantics can create semantic document nodes and links.

Decision: **REJECT** for Agent Core architecture truth. `CODEBASE.md`, exact source, and Memory retain their existing ownership; graph-derived doc semantics may remain provider-internal evidence only.

### 11.8 Semantic embedding search duplication

Grafel has embedding/BM25/query internals; Agent Core Memory already has its own semantic engine and Code Intelligence already consumes provider search.

Decision: **REJECT DUPLICATION**.

### 11.9 Provider source retrieval as source authority

`grafel_get_source` can return source windows for entities.

Decision: **DO NOT PROMOTE**. Agent Core direct filesystem reads and Semantic IDE remain exact-source authorities; Grafel source windows are derived navigation aids only.### 11.10 Parser/extractor/framework/security-analysis internals

Tree-sitter/custom extractors, language/framework sniffers, auth-posture resolvers, taint/security classifiers, coverage analyzers, literal/response-shape/stub/tautology detectors, graph algorithms, and module rollups are already inside the qualified provider.

Decision: **PROVIDER-OWNED — NO TYPESCRIPT PORT**.

### 11.11 Generic Git/index/concurrency/daemon machinery

`gitmeta`, `indexstate`, `repolock`, `daemon`, `engine`, ref reapers, status sidecars, memory budgets, and request/dead-letter machinery are provider lifecycle internals.

Decision: **PROVIDER-OWNED** unless a future concrete Agent Core failure demonstrates a reusable gap.

## 12. Recommended proposal set for user review

Proposals with demonstrated current Agent Core gaps:

1. **G20 — workspace unregister + stale registry hygiene**
2. **G21 — MCP schema contract auto-derivation/parity guard**
3. **G22 — complete MCP manifest fingerprint + handshake budget**
4. **G23 — provider wire-version compatibility handshake**
5. **G24 — typed canonical query/discriminator parity**

Optional:

6. **G25 — bounded graph-touch evidence in existing Activity Tracker**

No other source mechanism from this revision currently clears the adoption threshold after the 71/71 family census.

## 13. Proposed implementation order after user selection

Recommended dependency order:

`G21 → G22 → G23 → G20 → G24 → G25(optional)`

Rationale:
- G21/G22 first harden the public contract before adding schema fields/actions.
- G23 hardens provider compatibility before lifecycle mutation.
- G20 then repairs registry lifecycle with explicit safety.
- G24 expands discoverability under the hardened contract.
- G25 is independent and can remain deferred.## 14. Targeted verification gates if approved

### Contract gates
1. public MCP schema and handler/parser consumption agree for the tested surface.
2. the `get_recent_tool_calls compact/failuresOnly` regression fixture is caught before fix and passes after fix.
3. every registered tool has deterministic property/required fingerprint.
4. optional-additive vs breaking schema changes are classified correctly.
5. `tools/list` serialized size stays under the reviewed budget.

### Provider compatibility gates
6. provider `wire_version` is discovered through canonical `grafel_orient(view=me)`.
7. supported wire version reports healthy.
8. unsupported synthetic wire version degrades Code Intelligence only.

### Workspace lifecycle gates
9. stale missing-path workspaces appear in dry-run.
10. active/current workspace is protected.
11. unregister is idempotent.
12. mutation requires explicit confirmation.
13. optional state purge proves containment before removal.
14. registry readback no longer contains removed workspace.
15. provider restart, if required, is isolated to Grafel.

### Query/discoverability gates
16. BM25 and substring modes route deterministically.
17. fields/limit/context filtering are bounded and preserve source authority.
18. inspect unresolved/context facets are opt-in.
19. `code_orient(stats)` returns bounded corpus metrics.
20. known analysis discriminator errors are self-correcting and discoverable.

### Optional evidence gates
21. touched entity/edge evidence is bounded and redacted.
22. Activity Tracker remains the only Agent Core activity store.
23. tracking failure never fails the code-intelligence operation.

### Architecture gates
24. public top-level tool count does not increase.
25. exact source remains final authority.
26. Grafel remains non-gating.
27. no user-global Grafel state or hooks are mutated.
28. no hidden agent/daemon/store is introduced.
29. `CODEBASE.md` and durable memory are synchronized only after implemented behavior is verified.
30. material shipped behavior receives one coherent release intent; no `release:apply` without explicit authorization.## 15. Release and mutation boundary

G20–G25 are implemented in current source and rebuilt `dist`.

Executed mutations were bounded to the approved scope:
- stale Grafel registrations `audit-a-mem`, `audit-changesets`, and `audit-reflexion` were removed through provider lifecycle `delete --force --json --keep-caches` only after source-new dry-run proved their repo paths missing;
- active `agent-core` and present fixture workspaces were preserved;
- no user-global Grafel state/hooks were touched;
- no provider binary/toolchain/dependency was changed or installed;
- no Agent Core-wide restart/reload was performed.

Release intent `.changeset/20260920085541-e0820f.md` records a minor capability change toward 0.12.0. `release:apply`, baseline refresh, commit, tag, push, publish, deploy, and stable packaging were not performed.

## 16. Audit reference retirement gate

`E:\Projects\Agent-Core\Audit\Grafel` passed the retirement gate and was deleted on 2026-09-20.

Retirement evidence:
1. user approved the complete G20–G25 proposal set;
2. G20–G25 were implemented and targeted-verified;
3. rejected/deferred mechanisms remain recorded in this plan;
4. dependency scans found zero `Audit\\Grafel` references in active `src`, `tests`, or `scripts`;
5. the final 71/71 package-family census found no additional unique mechanism worth retaining;
6. the checkout was Git-clean immediately before deletion at `45f9745d02f3662a8516fb35cd2d0624acf82cbf`;
7. source/provenance/decision evidence is retained in this plan, `CODEBASE.md`, provider metadata, release intent, and durable Agent Core memory.

No hidden replacement source checkout was created. The qualified provider binary and its rollback/provenance artifacts remain.## 17. Current verdict

```text
Grafel reference revision      = VERIFIED / CLEAN
Tracked source census          = 8,505 files
Go source census               = 5,301
Go test census                 = 3,047
internal/* family census       = 71 / 71 classified
Active provider same source    = YES
Existing major adoption        = PRESERVED
New source-backed proposals    = G20–G25
Runtime implementation turn    = YES — source + rebuilt dist
Targeted verification          = PASS
Primary Node reload            = COMPLETE — LIVE ACTIVATED
User review required           = NO — approved scope executed
Audit\Grafel deletion          = YES — REFERENCE RETIRED
```

Final re-grounding conclusion:

Grafel G20–G25 boundary hardening has been adopted into Agent Core-owned source and targeted-verified. The forensic checkout passed the post-implementation zero-value/dependency census and was retired. The qualified Grafel provider remains the structural evidence engine; exact source remains final authority.

## 18. Historical continuity note

Previous Grafel waves remain historical implemented work; this proposal does not reopen or downgrade them.

- first-wave Code Intelligence integration: completed;
- second-wave workspace/ref/repair/fitness/diagnostics integration: completed;
- post-v0.3.3 provider qualification and selected hardening: completed;
- later source-qualified provider remains the active runtime lineage;
- this document now records the **completed final re-grounded G20–G25 adoption and retirement evidence**.

Old `NOT STARTED`/unselected statements in prior snapshots must not be interpreted as current runtime truth.
## 19. G20–G25 implementation and verification result

Implemented:
- G20: code_workspace adds explicit unregister and dry-run-first prune_workspaces; default agent-core workspace is protected; mutations require exact confirmation and provider lifecycle deletion uses --keep-caches.
- G21: the public get_recent_tool_calls schema now advertises compact/failuresOnly, and an AST-derived RDC schema parity regression compares server registrations against handler parser schemas.
- G22: release:compat now performs parameter-level MCP contract comparison plus a complete 62-tool manifest/handshake budget check.
- G23: Code Intelligence negotiates Grafel wire_version through canonical grafel_orient(view=me), reports it in health/diagnostics, and degrades only Code Intelligence on incompatibility.
- G24: stable typed find/inspect/stats controls plus analysisPreset discovery were added without removing the legacy provider-forward analysis string or raw params escape hatch.
- G25: bounded/redacted graph entity/edge touch evidence is added only to the existing Activity Tracker and never changes provider response shape or gates execution.

Verification evidence:
- TypeScript build: PASS / exit 0.
- Targeted suite: 5 files / 21 tests PASS.
- MCP schema contract regression: PASS, including compact/failuresOnly exposure.
- release:compat: 62 -> 62 tools; removed tools/routes = 0; breakingEvidence=false; ok=true.
- manifest budget: 104,867 bytes / ~26,217 tokens, below 120,000-byte / 30,000-token reviewed ceiling.
- direct provider wire smoke: wire_version=0.1.0.
- direct typed provider smoke: substring find located CodeIntelligenceService; orient stats returned bounded corpus metrics.
- G25 Activity Tracker evidence: successful code_orient inspect event persisted touchedEntityIds=[repo::Foo].
- live registry hygiene removed exactly audit-a-mem, audit-changesets, and audit-reflexion after their repo paths were proven missing; active agent-core and present fixtures remained.
- release:check-intent: ok=true.
- release plan: stable 0.11.0; next 0.12.0; pending intents 6.
- Grafel intent: .changeset/20260920085541-e0820f.md (minor).

Activation boundary:
- rebuilt `dist` contains the implementation and the primary Node Core was subsequently restarted/reconnected by the user;
- post-restart `/health` reports Code Intelligence `available/current`, wire `0.1.0` compatible, issueCount `0`;
- live `get_recent_tool_calls(compact=true, failuresOnly=true)`, typed substring find, analysisPreset validation, and Activity Tracker touched-entity evidence all succeeded;
- the isolated Grafel provider was reloaded once after a stale queued snapshot so MCP readiness matched the already-current on-disk graph;
- no `release:apply`, baseline refresh, commit, tag, push, publish, deploy, or stable packaging was performed.

## 20. New reference and native facade audit — 2026-09-22

### 20.1 Provenance and coverage
Reference HEAD `5eb5be1255aa7583b6310daf6d98c4fa648c4031` was compared against `45f9745d02f3662a8516fb35cd2d0624acf82cbf`. Inventory: 8,590 tracked files; 6,074 files with inspected code suffixes, including Go/TS/JS/Python tests, fixtures and web UI; 188 changed paths. Every inventoried code file was byte-readable. File/hash inventory and graph indexing are not a claim of semantic review of every function or every historical commit.
`runtime/grafel/provider.json` currently records sourceCommit `45f9745d02f3662a8516fb35cd2d0624acf82cbf`, version `v0.3.3-50-g45f9745d0-agentcore`, and its qualified-build hash. This is provider provenance metadata, not a fresh binary execution/hash acceptance test. Do not label the candidate HEAD active.
The old 71-family census is historical. The new source adds `internal/jsext` and changes import/extractor, quality/history, daemon/watch/process and language/response-shape paths. The concrete selections below were inspected directly. Remaining provider-specific changes are not automatically bundled into a provider upgrade or declared worthless without qualification.
### 20.2 G26 — JS/TS emitted-extension import fidelity
**Status: APPROVED — IMPLEMENTED IN ISOLATED STAGING — TARGETED TESTED — NOT LIVE. Priority: HIGH. Provider-owned change.**
**Source:** `internal/jsext/jsext.go`, `internal/extractors/javascript/imports.go`, `internal/resolve/imports.go`, with focused `import_emitted_extension_7276_test.go`, `imports_ext_agreement_7272_test.go`, `imports_esm_ext_7272_test.go` and `jsext_shared_table_7276_test.go` tests.
The old extractor returned an explicit `.js` import path verbatim. The new source resolves emitted spellings against actual source files and shares the extension family table with the resolver: `.js` may address `.ts/.tsx/.js/.jsx`; `.mjs` stays with `.mts/.mjs`; `.cjs` stays with `.cts/.cjs`. It also keeps the extractor and resolver `.mts/.cts` module-carrier derivation aligned.
**Agent Core relevance:** the inspected native TypeScript files import `./*.js` while the source files are `.ts`, so this is directly relevant to Agent Core's structural graph. The exact count of wrong/missing edges in the live qualified provider was not measured; do not claim a production fix or a quantified recall gain.
**Adaptation:** qualify the minimal coherent provider-side import/extractor changes and their dependencies in an isolated, explicitly approved staging source, preserving the single derived-graph owner. Do not duplicate a resolver in the Node facade. No automatic latest-provider download, global Go toolchain install or binary replacement is authorized.
**Critical constraints:** source-first candidate precedence; no cross-family invented edge; no new out-of-workspace filesystem probing; preserve case policy rather than lowercasing one side only. Upstream comments explicitly acknowledge case-insensitive filesystem spelling limitations and out-of-repo stat attempts; contain those paths under the requested repository before adoption instead of treating upstream code as automatically safe.
**Acceptance after separate approval:** real NodeNext `.js -> .ts`; `.mjs -> .mts`; `.cjs -> .cts`; forbidden `.mjs -> .ts`; missing file remains unresolved; source/emitted siblings choose source; `.map/.orig` are not source modules; Windows mixed-case behavior is explicit; traversal cannot probe outside the requested root. Compare actual resolved IDs and paths, not only entity counts. Keep provider wire/tool compatibility unchanged.
**Targets:** candidate provider `internal/jsext`, JS extractor and resolver; Agent Core provider provenance only after qualified cutover; CODEBASE provider section. Do not alter `runtime/grafel/provider.json` or active executable before selection and verification.
### 20.3 G27 — Truthful quality metrics and corrupt-history rejection
**Status: APPROVED — IMPLEMENTED IN ISOLATED STAGING — TARGETED TESTED — NOT LIVE. Priority: HIGH. Provider-owned change.**
**Source:** `internal/quality/audit/bugrate.go` carries TotalImports/ResolvedImports with Known/PctPtr; `internal/quality/history.go` changes unmeasured rates/scores to optional fields and rejects out-of-range records. Related producer/consumer deltas include `cmd/grafel/rebuild_history.go`, dashboard and notification code. Focused source tests include `bugrate_7271_test.go`, `rebuild_history_7283_test.go`, and `history_range_7301_test.go`.
The source separates no measurement from a measured zero error rate. The history reader skips invalid-domain rows rather than clamping them to invented values that could fabricate a regression or budget breach. A zero-entity or no-import graph is not automatically a measured perfect-quality score.
**Adaptation:** preserve unknown/null throughout selected provider quality/history/diagnostic outputs and the existing Node forwarding surfaces. Validate count/percentage ranges before comparison; retain valid historical rows without rewriting them. Old stored zeroes cannot retrospectively be distinguished from unmeasured values and must not be silently relabeled as proven success.
**G27 acceptance after approval:** valid zero, positive and 100-percent measurements; no graph/no import edges -> unknown rather than 100 health; negative counts/rates and rates above 100 are excluded from comparisons; optional historical fields remain readable; valid rows survive corrupt neighbors; dashboard/CLI/history/webhook agree on measured versus unmeasured. Do not turn quality scores into permission to execute tools or delete source.
Keep external notifications disabled unless separately configured/authorized. G27 does not create a second history store, rewrite canonical memory, or repair Agent Core's unrelated corrupt Git/source state. A provider binary change requires separate qualification and activation authorization.
### 20.4 G28 — Exact-repo graph availability and honest workspace status
**Status: APPROVED — IMPLEMENTED IN NATIVE SOURCE — TARGETED TESTED — NOT LIVE. Priority: HIGH. Native facade/provider boundary hardening.**
**Observed tool evidence in this audit:** after registering five repositories and indexing the default context, `code_workspace(status)` exposed provider rows marking all five current; refs for four had only a 75-byte state entry and a zero last-seen timestamp. `code_orient(stats)` returned a graph only for `audit-anthropic-ts` and explicitly reported `no graph file found (graph.fb or graph.json)` for the other four. No interpretation of a documentation status label is needed for this discrepancy.
**Scope correction:** `indexWorkspace` intentionally indexes the selected context, not every workspace member. Its default selection is the first repository. A current first-repo index is not proof that the whole group has graph coverage. Explicit `repoFilter` calls successfully requested each remaining repo; these were inspection operations, not implementation of a fix.
**Current source:** `src/code-intelligence/service.ts::indexWorkspace` calls requestIndexFor only for context.cwd; `workspaceStatus` returns provider snapshot/readiness; `contextIndexState` checks whether the group's refs array is nonempty, not whether a usable graph belongs to the exact requested repository/ref. `workspace-resolver.ts::preferredRepoPath` selects the first repo when no filter matches. The precise provider-side default-state cause remains to be traced before editing; the observable mismatch and these facade limitations are proven independently.
**Native adaptation:** report selected-context status separately from group coverage. Correlate graph availability with the exact registered repo/ref and the provider's actual graph-load result, never merely any ref in the group. Missing/unreadable/wrong-ref graphs must remain unknown/unavailable. A valid empty graph may be current; do not use positive entity count as a substitute for graph existence and freshness.
Retain request-scoped indexing. Explicitly report which repository an index request targeted; do not introduce a hidden global scan. Reject an unknown nonempty repo filter rather than silently using the first member. Preserve protected-path authorization and avoid solving the worktreePath discrepancy by broadly disabling path protection.
**Targets after selection:** `src/code-intelligence/service.ts`, `workspace-resolver.ts`, and only necessary existing runtime/provider adapters after exact contract inspection; relevant `tests/code-intelligence-*.test.ts`; CODEBASE workspace/freshness section. Do not add a new execution gate, registry, workflow router, MCP tool or background indexer.
**Acceptance after approved tests:** five registered repos/one graph -> only that repo has measured graph availability; exact-ref mismatch -> not current; missing graph with a current status sidecar -> explicit mismatch; valid empty graph accepted; unavailable provider -> fail-soft evidence; unknown filter cannot index another repo; a repoFilter-targeted index names the requested repo; ordinary machine-control remains unaffected. Prefer fixture tool replies for negative cases rather than corrupting the live index.
### 20.5 Selection and execution order
- [x] G26 — approved selection;  emitted-extension import fidelity.
- [x] G27 — approved selection;  unknown quality state and history validation.
- [x] G28 — approved selection;  exact-repo freshness/availability reporting.
Each choice is independent. Recommended selection priority is G28 then G26, with G27 separately selectable. G26/G27 are provider-side work; G28 is the existing native/provider boundary. Any shared provider update must preserve selected scope and cannot implicitly adopt all 188 changed files.
For a selected change: inspect the exact dependency/consumer closure, obtain the specific targeted-test authorization, implement in the approved local staging/current-line scope, record result evidence, update CODEBASE and one appropriate patch/minor intent, and seek distinct activation authorization before replacing/restarting the provider. No current-line source/Git reconstruction is bundled in this plan.
### 20.6 Retention and audit limits
**RETAIN — NOT ZERO-VALUE.** Three concrete proposals remain open; the candidate graph/extractor/daemon changes are not installed. Deferred language-specific fixes, test/process protections, platform watch behavior and response-shape changes are retained as exact-source evidence rather than implicitly approved or universally dismissed.
The first multi-repo index request did not establish all-member graph coverage, and later graph calls could remain indexing. No acceptance claim relies on a dirty/unavailable graph. This pass ran no upstream tests, binary build, provider switch, restart, release apply, remote publication or dependency installation.


## 21. Approved implementation and resumed verification — 2026-09-22
G26/G27 are implemented in `runtime/build/grafel-g26-g27-20260922`, exported from qualified baseline `45f9745d02f3662a8516fb35cd2d0624acf82cbf` with selected import/quality changes only. G26 uses root-bound filesystem lookup and source-first family precedence; G27 carries measured/unknown state through history, dashboard, CLI and notification consumers. The final normalized delta contains 23 production Go files and 35 test files; it is not a wholesale upstream replacement. `provider-resume-source-delta.json` records the exact file set. The test-support classifier export is included in the production-file count.
The resumed selected provider run exited 0: 200 passing test/subtest events, 0 failures, 1 skipped symlink-escape test. There are 47 passing top-level tests; the 200 count must not be described as 200 independent top-level tests. The selected CLI package compiled but its platform/build-tag selection reported no runnable matching tests. Eight package invocations exited successfully. The skipped Windows symlink case is not verified; no privilege or volume change was made to force it.
The built candidate `grafel-g26-g27-candidate.exe` is 110092800 bytes, SHA-256 `087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94`. Its isolated `--version` probe exited 0. Active provider binary and metadata hashes match the pre-build baseline. Canonical `internal/mcp` source remains unchanged; this source comparison and version smoke are not a fresh live MCP handshake or production graph-fidelity benchmark. The candidate uses static linking but was built without trimpath and is not a release archive.
G28 and the other selected native changes now pass fresh source and emitted-candidate runs (45/45 each). The former missing-type compiler blocker was closed by source-consumer-grounded type reconstruction, not a permissive stub or historical restore. Strict selected checking has zero diagnostics and a 19-module native candidate is built. Neither active native dist nor active provider was replaced/restarted. See the execution report and the post-restart qualification below.
**Current disposition:** source/staging implementation recorded; activation and the documented verification limitations remain open. Retain reference and staging. User approval of implementation was executed, but the plan explicitly reserves provider cutover/restart for distinct activation authorization. No global install, Git mutation, release application or notification delivery occurred.


## 22. Post-launcher-restart candidate qualification — 2026-09-22
The existing G26/G27 candidate hash was reconfirmed. A fresh isolated daemon and MCP bridge under the task evidence directory completed initialize/tools-list with 22 canonical provider tools, then the client and daemon were closed; a machine process query found zero remaining candidate processes. This is isolated candidate qualification, not active-provider cutover, full schema/response parity acceptance, or a graph-fidelity benchmark. Prior Go evidence remains 200 passing test/subtest events (47 top-level), zero failures, one unverified host-symlink case; those Go suites were not rerun in this continuation. The candidate remains static-linked without trimpath and is not a release archive.
The post-launcher-restart continuation closed the selected native compiler blocker: src/semantic-ide/types.ts was reconstructed from six surviving semantic consumers and the config producer, not recovered byte-for-byte from history. Eleven negative type contracts and the semantic consumer closure compile cleanly; the emitted type module remains identical to the existing empty runtime module. Strict selected TS 6.0.3 no-emit now has zero diagnostics. A selected native candidate dependency closure of 19 JavaScript modules was built under runtime/build/native-approved-adoption-20260922/dist. Both fresh source and emitted-candidate runs passed the same 45 targeted cases, zero failed/skipped; these are two runs of the same cases, not 90 distinct tests. Native active dist was not replaced; no full-root build is claimed.
Evidence: `runtime/tmp/approved-adoption-20260922/semantic-types-reconstruction.json`, `native-typecheck-postrestart.json`, `native-candidate-build.json`, `native-postrestart.json`, `native-compiled-postrestart.json`, `compiled-native-test-provenance.json`, and `provider-candidate-mcp-postrestart.json`. The existing minor release intent remains pending. No active runtime replacement/restart, release apply, Git mutation, external notification or conditional adoption was performed.

### 2026-09-22 — Activation preparation (historical; now closed)

**CLOSED: the user completed installation; independent live readback is recorded below.** The user continued after the candidate report and asked that ambiguous boundary wording be replaced with concrete unfinished work.

Fresh comparison found four changed native programs and fifteen unchanged dependency programs. The replacement set is four JavaScript modules plus their four sourcemaps, Grafel executable and its updated provenance metadata. A fresh real-provider comparison returned 22 current and 22 candidate tools with zero missing tools and identical input schemas (`activation-schema-parity.json`). Earlier source/compiled 45-case test evidence remains valid as historical evidence; those suites were not rerun in this activation-preparation pass.

The platform rejected writing the automatic stop/start batch before execution. No production process was stopped and no active native/provider file was replaced. This is a concrete tool limitation, not a maximum-work limit or missing implementation approval. The incomplete automatic helper is archived as text and must not be executed.

`ACTIVATE-APPROVED-ADOPTION.cmd` now launches the task-local `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/install-when-stopped.mjs`. This offline helper never stops/kills processes: it reports running Core/Grafel/launcher PIDs, refuses installation while they remain active, validates the exact allowlisted candidate/current/backup hashes, uses same-directory replacement with scoped rollback on error, and requests launcher start after installation. At this preparation checkpoint only syntax and non-mutating preflight had been executed. The later user-run installation and live startup are verified below; the rollback-on-error path was not exercised. `installer-check.json` reports all candidate/backup hashes valid, alreadyInstalled=false and readyToInstall=false because processes are running.

Verified backup: `runtime/backups/approved-adoption-activation-20260922T095700`. Evidence and future installation result: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/`. The manual shutdown and root activation-launcher step were subsequently completed by the user; they are no longer pending. Preserve OAuth, tunnel, memory, other applications, references and current release version. Full source/Git recovery, the host-symlink check and pre-existing Semantic IDE provider damage remain separate unfinished work; no new release or broad repair was attempted.

### 2026-09-22 — Selected runtime activation verified

**CLOSED: installation and live readback completed.** The user installed the qualified files; independent checks now match all 10 installed files to the activation manifest. Node Core PID 18644 started at 2026-09-22T10:09:49Z after installation and serves the new native modules. The installed G26/G27 provider has SHA-256 `087f6df8d7bd7032b445a5683a3eb4cc39669f2ff7512527ed777e9ae803bd94`, a fresh 22-tool MCP handshake, wire 0.1.0 compatible and health available/current. G28 live status returns graphAvailability/groupCoverage and rejects unknown repo filters.

A fresh run of the same four targeted files against installed root dist passes 45/45 cases, zero failed/skipped, exit 0; this is not a broad regression suite or full-root build. Evidence: `runtime/tmp/approved-adoption-20260922/activation-20260922T095700/live-verification.json`, `installed-native-tests.json`, and the user-run `install-result.json`. See `docs/Approved-Adoption-Execution-20260922.md` for the consolidated record. No further installation/restart is required for these selections. Prior host-symlink validation remains unverified; pre-existing Semantic IDE provider damage, complete source/Git recovery, and release tooling repair are separate unresolved work. No new repair, release apply or publication was performed.


## Residual audit after live activation — 2026-09-22

### G29 — JS/TS external npm subpaths without masking unresolved local aliases
**Status: CORRECTED — NEW CANDIDATE MCP ACCEPTED — NOT ACTIVATED. Priority: MEDIUM (graph fidelity).**
The former 18/24 failure below is historical old-candidate evidence, superseded for the new candidate by Wave7; the unchanged old baseline remains a negative control.
**Goal:** distinguish genuine external npm imports with subpaths/uncatalogued scopes from malformed imports and unresolved project-local aliases.
**Architecture:** selectively adapt provider-owned external synthesis, including its named-import consumer. Do not reproduce the classifier in Agent Core's Node facade or replace the provider wholesale with upstream HEAD.
**Existing completion:** G26/G27/G28 are installed/live. G26 addresses emitted-extension resolution such as `./svc.js` to local TypeScript source. G27 preserves measured/unknown quality. G29 is a separate external-package classification mechanism, not another proposal for either completed fix.

### Source evidence and installed-build comparison
Reference root: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/Grafel`, HEAD `5eb5be1255aa7583b6310daf6d98c4fa648c4031`.
Selected upstream evidence: commit `a4cd9f80465c622bfac0da075a389b8044169ffe`, especially `internal/external/synth.go`, `internal/external/synth_named_imports.go`, and `internal/external/synth_npm_subpath_7274_test.go`.

| Evidence | Result of this source audit |
| --- | --- |
| Qualified active-build staging `runtime/build/grafel-g26-g27-20260922/internal/external/synth.go:1440+` | Scoped npm classification still requires known-package allowlisting; unscoped separator-bearing names reach the older rejection path. |
| Same staging `internal/external/synth_named_imports.go::importEdgePackageRoot` | JS-family named imports use package-root classification without the new internal-JS-root reconciliation. |
| Exact staging versus qualified `45f9745d...` comparison | Both production files are byte-identical to the old baseline and absent from the 23-file G26/G27 production delta. Hash evidence: `grafel-external-baseline-parity.json`. |
| Upstream `synth_npm_subpath_7274_test.go:27-187` | Source tests cover scoped/unscoped, subpath/plain and known/uncatalogued combinations, plus non-JS/non-import/local/malformed controls. These tests were READ, not run here. |
| Same upstream test file, named-import/internal-root tests | Both external synthesis and named-import routes are checked against repo-owned roots and varied layouts. |

**Source-derived examples, not a new executed graph benchmark:** `better-auth/node` and `@base-ui/react/toast` illustrate supported import shapes that the older classifier can leave as extraction defects. Conversely, classifying every slash-bearing import as npm would hide unresolved `components/Button` when the project actually owns that directory. Agent Core already exposes real JS/TS graph navigation and imports package subpaths in native source, so this is an existing provider consumer rather than a new runtime capability.
The full upstream revision delta has 188 changed paths across source, tests, documentation and other concerns. Only the selected external-classification closure is proposed; unrelated language, process, watcher, dashboard and response-shape changes must not hitchhike.

### Selected design for review
1. Derive the specifier once from the existing `import_path` property when present, otherwise from the original stub. Apply the slash gate and classification to that same value, not different spellings.
2. Add the narrowly scoped JS/TS IMPORTS route before the older separator/scoped-name rejection. Preserve other languages, relationship kinds, relative paths, URLs and malformed-input behavior.
3. Build the repo-owned JS source-root set from source-file extensions, including component-file formats, and conservatively unwrap the documented source/monorepo container prefixes. Do not turn nested vendored package folders into first-party roots.
4. Apply identical internal-root/known-package precedence to the main synthesis and named-import routes. A supported repo-owned alias must not be masked by the new catch-all route. Preserve existing definitive known-package precedence consistently on both routes; do not claim the root heuristic resolves every possible alias/package collision.
5. Keep Unknown-external versus Known-external classification honest. An allowlist is not a universal proof of externalness, but ambiguous dotted/legacy package names must not be accepted without the conservative evidence the classifier actually supports.
6. Retain upstream's documented uncertainty: an internal directory absent from indexed evidence can remain ambiguous, and conservative dotted/mixed-case names are not a complete npm resolver. Do not advertise universal package resolution or perfect quality scores.

```text
actual import specifier
  -> preserve existing definitive internal/relative/invalid handling
  -> JS/TS + IMPORTS + eligible package shape
  -> consult repo-owned roots and existing known-package precedence
  -> consistent external decision on main and named-import routes
  -> retain unresolved/unknown evidence when ambiguous
```

### Approved implementation tasks and observed completion
- [x] G29.1: create isolated provider staging from the CURRENT G26/G27-qualified source tree, not the bare old commit. Record its exact manifest so the already-installed selections cannot be lost.
- [x] G29.2: introduce focused tests in staged `internal/external/synth_npm_subpath_7274_test.go` and observe their expected behavioral failures against that baseline. Reuse or independently adapt the inspected matrix with attribution; do not grade an allowlist-only patch against hand-picked positive cases.
- [x] G29.3: change staged `internal/external/synth.go` and `synth_named_imports.go` for the selected closure. No Node-facade classifier or new language runtime. Census any necessary additional file before expanding the selected patch.
- [x] G29.4: run the selected external-classifier tests and existing external-synthesis compatibility cases; recheck the G26/G27 tests already applicable to the same source tree. Separate skipped, compile-only and executed cases in the result.
- [x] G29.5: build a project-local candidate with the existing qualified Go/toolchain procedure, hash it, and compare its provider schema to the CURRENT active provider. Do not overwrite the active binary during qualification.
- [x] G29.6: qualify an isolated graph fixture with real npm subpaths and local aliases; compare entity/edge decisions, not only the numerical quality score. Preserve the live provider, active workspaces and user source throughout this test.
- [x] G29.7: after explicit activation scope is approved and qualification succeeds, keep a verified rollback binary/metadata, install only selected artifacts, and obtain live readback. Update this plan, CODEBASE and local memory to actual results rather than assuming a build means live activation.

| Required case | Expected behavior |
| --- | --- |
| Scoped/unscoped x subpath/plain x known/uncatalogued | Correct external package-root decision for the supported positive matrix. |
| `better-auth/node`, deeper subpaths | External package root, not an extraction error solely because of a slash. |
| `@base-ui/react` and its subpaths | Unknown scope alone is not rejection evidence. |
| Repo owns components/ or src/components/ | Unresolved components/Button is not masked as an npm placeholder. |
| packages/ui/src/components/ and case variants | Correct root guard across supported wrapper layouts. |
| vendor/better-auth/ | Vendor descendants are not accidentally promoted as first-party roots. |
| Different stub versus import_path | Gate and classifier inspect the same actual specifier. |
| Main route versus named-import route | Same precedence for the same root/context; no contradictory placeholder. |
| Relative/absolute/Windows paths, URLs, malformed specifiers | No new external classification merely to improve a metric. |
| Go/Java/Python and non-IMPORTS relations | Existing behavior remains unchanged. |
| Dotted/legacy names and unindexed internal roots | Conservative limitations documented; no unsupported all-npm claim. |
| Existing G26/G27 behavior and 22 provider tools | No regression or tool-schema drift hidden by G29. |

Proposed test selection, NOT executed during this audit: run the project-local Go binary in the new staging root with the existing qualified build environment and `go test -p 2 -mod=readonly ./internal/external -run '7274|NamedImport'`. Also run the relevant pre-existing external-synthesis and G26/G27 cases explicitly approved for the execution scope. Reuse the documented project-local linker workaround when required; do not install a global toolchain or silently bypass platform test failures.
The runtime filename may retain a candidate label until packaging; record actual installed hash/version separately. Preserve input-schema parity and representative response evidence. Static classifier tests alone are not a full graph-fidelity benchmark.

### Tradeoffs, rollback, and selection
This is a fidelity correction, not dependency installation or a new graph authority. Over-broad external synthesis could hide local defects; the negative and cross-route controls are mandatory acceptance criteria. Root-wrapper expansion beyond the inspected supported set needs its own justification, not an arbitrary list.
Rollback is the prior qualified provider binary/metadata and selected staged source delta only. Do not roll back source repositories or user graph annotations. A later implementation normally carries a patch intent; no intent or release version is changed by this plan-only task.

- [x] Select G29 for isolated provider implementation and the listed qualification.
- [ ] Reject G29 with a recorded reason.

**Disposition: RETAIN — NOT CORPSE.** The requested Grafel checkout contains a concrete external-classification improvement absent from the qualified active-build source. Preserve both reference provenance and current G26/G27 staging; they are different revisions with different roles, not duplicate runtime dependencies.
**Audit coverage:** 8,590 tracked paths, three local remote refs and 188 changed paths versus qualified baseline were inventoried. The external-synthesis source/test closure was inspected and compared byte-for-byte where stated. Other extractor/framework/process/watcher changes remain mapped residual families, not wholesale approval and not an exhaustive semantic census of every branch/file.
**Evidence bundle:** `runtime/tmp/four-repo-residual-audit-20260922/`, including `grafel-npm-subpath-upstream.diff` and `grafel-external-baseline-parity.json`. No provider source implementation, test run, binary build/cutover, reindex, release action or reference deletion occurred in this planning pass.


### Approved execution result — 2026-09-22

**Current result: IMPLEMENTED — MCP ACCEPTANCE FAILED — NOT ACTIVATED.** User approval supersedes the prior plan-only status. Source-audit descriptions above are historical, not current bug behavior.

The selected implementation and qualification are recorded in `docs/Residual-Adoption-Execution-20260922.md`. Final native source and compiled candidate each report 94 cases: 92 PASS / 0 FAIL / 2 host SKIP. TypeScript 6.0.3 reports zero targeted diagnostics. Exactly six candidate modules differ; 21 dependencies are byte-identical to installed runtime. This is not a full-root build or real-LSP repair.

Evidence: `runtime/tmp/residual-adoption-20260922/`; backups: `runtime/backups/residual-adoption-20260922/`; canonical memory: `163fc8f2-9be1-4956-bcaa-7c7a6537fb35`. Two native symlink tests are EISDIR-blocked by the host, independently reproduced and explicitly skipped rather than called PASS. The four references and active dist/provider/metadata/package hashes remain unchanged. The new patch intent does not apply a release or activate candidates. Cold-fixture bootstrap ordering and pre-existing source/Git/provider issues remain separate, documented limitations.

G29.1–G29.5 completed; G29.6 is not accepted: 214 external-package top-level passes and 47 compatibility top-level passes; 38 external subcase skips and one Go host-symlink skip. Candidate SHA-256 `ccd6dcd9e8e63235db0c761f91addba7c92e11f449d7a9afbf8a7481a2497f7f`; 22/22 exact MCP schemas; Final settled graph verdict: 18 PASS / 6 FAIL, so G29.6 remains open. The alias remains unresolved, though an orphan external components root remains in both graphs. G29.7 is deferred: rollback-backed production installation/live readback requires its separate activation scope.

### Final settled acceptance — supersedes preliminary results

Final settled MCP acceptance supersedes preliminary passing snapshots: 18/24 graph checks PASS and 6 FAIL. Four failed checks concern the two npm-subpath IMPORTS edges; two concern ./canonical.js resolution in both baseline and candidate. The baseline/candidate health is available/current and the 22 tool schemas match, but that does not prove graph edge correctness. Root cause is not established. G29 is not accepted or activation-ready; no production installation occurred.

Corrected UTF-8 production delta and all Go tests were requalified; binary hash is unchanged. See g29-encoding-correction.json and *-utf8-summary.json in the evidence bundle. Acceptance failure is retained rather than hidden by unit-test success. Native selections remain verified separately.

## Post-implementation source-first re-grounding — 2026-09-22

**Status: APPROVED — IMPLEMENTED — CANDIDATE QUALIFIED — NOT ACTIVATED.**
**Spec:** the user asked to inspect this exact reference checkout against current Agent Core and write selectable proposals before installation. This audit does not authorize completing or activating earlier unfinished work.
**Audit-time continuity (historical):** G26/G27/G28 remained live/closed. G29 is implemented in isolated staging but **MCP ACCEPTANCE FAILED — NOT ACTIVATED**. Its settled result is 18/24 assertions, not the earlier transient 24/24 snapshot. G29.6 remains open and G29.7 was not performed. The stale PLAN ONLY header for G29 is corrected, not used to erase its failure.

### G29.6-R — Source-grounded qualification follow-up, not a new classifier proposal
**Goal:** explain and close the actual post-index graph mismatches without replacing the whole provider or changing acceptance expectations to obtain a green score.
**Observed prior evidence:** `runtime/tmp/residual-adoption-20260922/g29-graph-decisions.json` contains four failed assertions around candidate `better-auth/node` and `@base-ui/react/toast` import endpoints, plus two emitted-extension assertions for `./canonical.js` failing in both baseline and candidate. These are six assertions, not automatically six independent bugs.
Both settled graph snapshots retain package/path-shaped IMPORTS targets; the candidate does remove the false named Button external target. Local CALLS evidence remains distinct from the unresolved file IMPORTS assertions. Keep those outcomes separate.

| Re-read exact source | Implication for the next approved investigation |
| --- | --- |
| `cmd/grafel/index.go:2370-2520` | Real CLI indexing calls external.Synthesize at line 2389, then lineage/exception/manifest passes and final classification. Trace this actual consumer, not only a handcrafted classifier document. |
| `internal/external/synth.go:122-180,337-446` | Synthesis resolves against entity language/file maps and edge properties, then rewrites ToID in place. Observe actual inputs at this boundary. |
| `internal/external/synth_named_imports.go` | Named-import resolution is another route; its successful alias control does not establish main IMPORTS correctness. |
| Current staged `internal/resolve/imports.go` versus reference | The staged G26 closure has a root-escape check and source-first policy not present in the same form upstream. Blind replacement would lose intentional local protections. |

### G29.6-R bounded execution plan AFTER review
- [x] Preserve exact current G26/G27 baseline and G29 candidate hashes/manifests. Keep the existing failing fixture unchanged as the regression starting point, with complete expected source files and request/workspace/ref identity.
- [x] Trace one fixture through extraction, buildDocument/resolver, external synthesis, graph serialization and final MCP read. Capture only safe entity/edge metadata: IDs, kinds, language, source_file, import_path, imported_name, endpoint existence and file hashes. No raw user source or global workspace scans.
- [x] Determine whether the mismatch first appears before synthesis, after synthesis, during persistence/index refresh or in MCP projection. Test the actual pipeline route used by the daemon as well as the CLI consumer when they differ; do not assume a helper unit test exercises both.
- [x] Validate the emitted-extension expected target against the exact canonical.ts fixture and qualified G26 policy. A baseline failure requires an explicit finding: either a real existing defect or a demonstrably wrong assertion. Do not silently change the assertion or describe baseline failure as a candidate regression.
- [x] Correct only the identified current-line owner after a behavioral failure reproduces. If another production file is needed, record its source evidence and exact scope before expanding the patch. No wholesale upstream update and no rollback of root safety/source-first precedence.
- [x] Rerun cold-index and settled post-refresh assertions through a fresh isolated MCP client. Compare actual nodes/edges and all 22 tool input schemas. A current health flag or numerical quality score alone is not acceptance.
- [x] Record all failures/skips and absence of leaked fixture processes. Only a subsequently approved activation step may install the qualified binary/metadata; do not mark G29 complete while mandatory checks fail.

**Acceptance:** supported scoped/unscoped npm subpaths become the intended external targets; local aliases are not masked; both main and named routes agree; correct emitted-extension links obey G26; unchanged negative malformed/non-JS controls stay unchanged; fresh/cold and settled/warm graph outcomes are coherent.
**Current conclusion:** the first divergence/root cause has NOT been established by this planning audit. Existing failed evidence remains the acceptance authority. This section is a precise follow-up to G29.6, not a claimed fix.

### G30 — Optional provider qualification protection against real process signals
**Status: SELECTED — IMPLEMENTED — NO-SIGNAL QUALIFICATION PASSED — NOT ACTIVATED.**
**Goal:** allow provider lifecycle/diagnostic tests to exercise selection and error paths without a synthetic PID accidentally reaching a real OS process-termination function.
**Architecture:** selectively reuse the provider-owned test-binary guard and injected recorder seams, confined to the qualified Grafel source tree. It is not an Agent Core MCP permission layer, machine-control gate or automatic process-cleanup system.
**Evidence:** reference `internal/process/kill_testguard.go:44-79` separates the go-test refusal branch from production pass-through. `internal/daemon/supervise.go` wires `reapStaleKill = process.KillGuarded`; current G29 staging instead supplies raw process.Kill. `internal/cli/doctor.go` and `internal/dashboard/handlers_diagnostics.go` add recorder seams/default guarded calls; staged consumers still call raw Kill. The relevant source diffs are saved in this audit bundle.
**Platform accuracy:** reference `internal/process/process_windows.go:12-19` returns ErrUnsupported from FindByName, so the CLI/dashboard stale-process enumeration path is not a demonstrated Windows operational bug. The test-safety mechanism is still relevant to controlled lifecycle tests, including supervisor call sites. Do not claim an observed stranger process was killed here. No such test or signal was run.

### G30 scope, decisions and acceptance
Create a NEW isolated provider staging from the accepted baseline selected at execution time; do not overwrite the current G29 evidence tree. Add the selected guard from `internal/process/kill_testguard.go`, wire the existing stale-engine call in `internal/daemon/supervise.go`, and selectively wire recordable calls in `internal/cli/doctor.go` / `internal/dashboard/handlers_diagnostics.go`. Preserve G27 metric fields while applying only the approved call-site hunks.
The copied MIT source retains its copyright/license notice and exact upstream provenance. No global Go/dependency installation is needed by this proposal; use the existing project-local qualified toolchain.
- [x] G30.1: inventory real signal call sites reachable from selected tests and explicit default function wiring. Enumerating source is allowed; executing a live cleanup command is not the test.
- [x] G30.2: grade `underGoTest=true` with a recorder supplied to the decision function; assert refusal before the recorder is invoked. Grade pass-through with `underGoTest=false` and another recorder, never with a real PID.
- [x] G30.3: assert the supervisor/CLI/dashboard default function identity is the guarded function and exercise synthetic process-table branches using injected recorders. A test of a copied predicate is insufficient.
- [x] G30.4: ensure production selection/return semantics are unchanged outside this test guard. Run only named targeted tests in isolated staging, then build/hash/schema-check a candidate without replacing the live binary.
- [x] G30.5: record results in this plan, CODEBASE and local memory. Any deployment requires separate selected activation scope.

| Case | Expected observation |
| --- | --- |
| Go test guard enabled | Refusal occurs before any OS-signalling dependency; recorder call count is zero. |
| Production branch simulated | Recorder receives the intended scalar argument once; no real process is contacted. |
| Missing test seam | Deterministic failure, not a signal to a synthetic or host PID. |
| Explicit dry-run paths | Zero recorder calls and truthful would-act output. |
| Error in recorder | Existing error reporting is retained, not reported as successful cleanup. |
| Default wiring | Guard function identity remains load-bearing at all selected call sites. |
| Built executable invoked by a harness | Documented exclusion: testing.Testing is false; use only owned isolated child processes and explicit authorization. |

**Limits:** this does not harden every process.Kill call in the entire provider, and it does not make a go-build executable safe to run against arbitrary host processes. HTTP server panic recovery can turn a refused signal into an EOF/error response; direct recorder-based tests must inspect the actual refusal. No automatic retry or all-host kill sweep is introduced.
**Rollback:** selected isolated Go files/binary only. Never affect live Core/Grafel processes, user applications, reference repositories or their data during tests. No release intent is created now; evaluate one patch intent only when a shipped provider build changes.
- [x] Select G30 with the stated no-signal qualification.
- [ ] Reject G30 with a recorded reason.

### Residual mechanisms classified, not silently installed
**Process identity narrowing (conditional separate selection):** upstream IsCanonicalBinaryPath requires an absolute exact basename, not a full-path substring; the CLI/dashboard use it before stale selection. This is useful source evidence, but the Windows enumeration route is unsupported and the patch deliberately leaves ambiguous unknown-Exe/other-user cases. Do not widen stale selection, implement global process enumeration or copy POSIX /tmp rules into Windows merely to consume it.
**Watcher FIFO/socket accounting (platform-conditional):** upstream watcher/reconcile/pipeskip changes pair resource charging and release for unwatchable entries. Their substantive per-entry descriptor benefit is kqueue-specific; not a demonstrated need for this Windows provider.
**Language/framework extractors (consumer-conditional):** Django/DRF/Pydantic, Java, F#/Nim/Reason/ReScript/Scala and C++/Go framework deltas require a concrete workspace/language fixture before selection. Their existence is not evidence that Agent Core should install every upstream delta.
**Existing mechanisms:** graph/resolve/repair/pattern/ref/storage/MCP families largely remain provider-owned and already inherited; Node must not duplicate them. Process installers/agent-host injection, a parallel dashboard authority, automatic enrichment agents, alternate stores and global repair machinery remain wrong-owner or unselected.
**Intentional local divergence:** reference direct-hit import precedence and removal of the explicit joined-path escape check must not displace the qualified G26 source-first/root-bound policy. Source difference is not automatically missing adoption.

### Coverage / provenance / retention
Exact reference HEAD `5eb5be1255aa7583b6310daf6d98c4fa648c4031`, 8590 tracked paths, 3 local remote refs, no fetch. Byte census hashed all 8590 regular tracked files. Eleven initially omitted internal/secrets source/test paths were added after distinguishing code-module names from protected runtime credentials; no actual secret store or .env was read. Code-suffix census 6074 includes fixtures/tests.
Current staged production-Go comparison covers 2261 eligible .go paths after excluding _test.go: 2212 normalized-identical, 44 different, 5 absent from G29 staging. Counts are file comparisons, not independent features. CRLF is normalized for source equivalence while exact hashes are retained. The 72 top-level internal families are inventoried; equality/path inventories do not claim a semantic audit of every function and remote branch.
Focused semantic review covered the actual failing import pipeline, selected process/qualification and watcher deltas, current native boundaries, and existing proposal/result records. Full upstream HEAD is not an approved implementation baseline.
**Disposition: RETAIN — NOT ZERO-VALUE.** G29 still has an unresolved real acceptance result and G30 supplies a separately selectable current qualification mechanism. Reference and qualified staging are distinct evidence authorities, not redundant runtime dependencies. No folder was deleted.
Evidence: `runtime/tmp/four-repo-regrounding-20260922/` contains exact revisions, full tracked hash inventory, production comparison and selected source diffs. This audit ran no new Go tests, builds, graph fixtures, active provider restart, process cleanup, release operation or installation.


### Wave7 approved execution result — 2026-09-22

**IMPLEMENTED — CANDIDATE QUALIFIED WITH EXPLICIT SKIPS — NOT ACTIVATED.**

G29.6-R identified and reproduced the actual incremental-path omission: full Index binds correctly, TryIncremental reintroduced raw JS import targets. The actual daemon now passes a stateless canonical finalizer before merge/write; existing Synthesize and unchanged G26 root-bound/source-first resolution are reused. G30 guarded defaults and no-signal recorder seams are installed only in new staging. Eight G30 tests pass. Final Go suites: external 215 top-level PASS with 38 skipped subcases; compatibility/pipeline/CLI-dashboard 52 PASS with one host skip; process/supervisor four PASS. New candidate cold/warm MCP obligations pass 24/24; the preserved original baseline-and-candidate matrix remains 23/24 solely because the unmodified baseline still fails emitted-extension resolution. No old baseline success is invented.

Selected native source and compiled runs each report 172 PASS / 0 FAIL / 6 host SKIP or explicit exclusions from 178 cases, including 57 new passing cases. They are two executions of the same case set. Strict selected TypeScript 6.0.3 compilation has zero diagnostics; 36 candidate modules include 11 differences from installed runtime and 25 byte-identical dependencies. Missing unselected dependency source used installed unchanged JavaScript only through recorded isolated test configuration. No full-root rebuild is claimed.

Evidence: runtime/tmp/wave7-adoption-20260922/execution-summary.json, g29-candidate-acceptance.json, legacy24-comparison.json, provider-source-delta.json, final-integrity.json and docs-memory-readback.json. Consolidated report: docs/Wave7-Adoption-Execution-20260922.md. Scoped backup: runtime/backups/wave7-adoption-20260922. Canonical memory: 1b2416e6-d8e3-4964-bf29-6e2775ed196f.

Historical candidate qualification ended before production installation. Its activation item is now CLOSED by the 2026-09-23 readback below. Earlier test/skip/failure evidence is retained; conditional unselected families remain unselected.


### Production activation and installed-runtime readback — 2026-09-23

**COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS.** The user approved activation; 24/24 selected artifact hashes now match the qualified build, with 27 preserved dependency/package/launcher hashes unchanged. Installed-dist tests: 172 PASS / 0 FAIL / 6 unchanged host SKIP-excluded of 178 cases; all 11 modified programs are present in loaded-module provenance.

Node Core PID 5600 started after installation; Core HTTP200/ok, Execution/Memory/Learning available, Grafel available/current with zero issues. Fresh installed-provider MCP handshake retains all 22 input schemas; live code_orient status/search succeed. No manual user action or OAuth reset was needed. G29/G30 build is installed, not merely staged.

Six unverified native host cases and the three pre-existing managed-language-provider issues remain explicit; no language-server repair or whole-root recovery is claimed. Prior candidate-only graph 24/24 and old-baseline matrix 23/24 remain separate historical qualification results.

Report: docs/Wave7-Activation-20260923.md. Evidence: runtime/tmp/wave7-activation-20260923/. Backup: runtime/backups/wave7-activation-20260923/. Canonical activation memory: 561784e7-96b0-4b24-964a-940751b5e86e. OPEN activation items for this selected scope: NONE. No release apply, version bump, commit, push or reference retirement occurred.
