# Grafel Re-Grounding + Final Steal/Use Proposal — Agent Core

> **Status:** COMPLETE — IMPLEMENTED — LIVE-ACTIVATED — TARGETED VERIFIED — REFERENCE RETIRED
> **Re-grounded:** 2026-09-20
> **Implemented:** 2026-09-20
> **Live activated:** 2026-09-20
> **Open implementation work:** NONE
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
