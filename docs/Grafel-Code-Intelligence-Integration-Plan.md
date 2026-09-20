# Grafel Code Intelligence Integration Plan — Agent Core

> **Status:** COMPLETE — VERIFIED FOR APPROVED SCOPE  
> **Goal:** Deliver project-local Grafel-backed structural code intelligence as a first-class Agent Core sibling capability while preserving direct machine control, native Memory authority, Reflexion boundaries, protected-path exclusions, and fail-soft behavior.  
> **Scope:** Integrate Grafel as a local structural-code-intelligence provider for Agent Core with minimal glue code, no source-port rewrite, no execution gate, and no replacement of Agent Core Memory/Tracker/controller authority.  
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\grafel`  
> **Grounded reference state:** clean `main`, HEAD `45f9745d02f3662a8516fb35cd2d0624acf82cbf`, origin `https://github.com/cajasmota/grafel.git`, describe `v0.3.3-50-g45f9745d0`, MIT.  
> **Primary target:** new `src\code-intelligence` provider facade + curated MCP tools + `src\index.ts` lifecycle + controller contract.  
> **Implementation state:** Phases 0–9 are complete for the approved scope. The rebuilt primary `:8765` runtime was activated on 2026-09-18 and live readback reported Code Intelligence `available`, Grafel daemon `available`, index `current`, group `agent-core`, `issueCount=0`.

## 1. Objective

Give every Agent Core-connected AI/controller structural code intelligence without rebuilding Grafel's Go/tree-sitter/FlatBuffers stack.

The integration should let an AI answer structural questions such as:

- where an entity is defined;
- who calls / uses it;
- what it calls;
- what path connects two entities;
- how an endpoint/request flows;
- what changes are affected by a refactor;
- how repositories are connected;
- whether the graph is fresh;
- what codebase-specific recipe/pattern applies.

Grafel must remain an **intelligence sibling**, not a precondition for normal machine control.

Target operating model:

```text
AI / Controller
     |
     v
Agent Core MCP
     |
     +-- machine control -> src\rdc
     +-- memory          -> src\memory
     +-- code intelligence -> src\code-intelligence -> Grafel provider
```

## 2. Current Agent Core baseline

Current Agent Core already provides:

- 26 direct machine-control tools;
- 10 explicit native-memory tools;
- 14 Game Mode / Android phone-control tools;
- 50 live MCP tools total before Grafel integration;
- controller instructions through `AGENTS.md`;
- file/content search through ripgrep;
- local process/terminal execution;
- durable file-native memory;
- A-MEM-derived semantic capture/retrieval behavior;
- Reflexion-style failure learning;
- Tool History and Activity Tracker;
- secret redaction before evidence persistence.

Current Agent Core does **not** have a structural code knowledge graph, caller/callee graph, path tracer, endpoint topology, cross-repo dependency map, or change-impact engine.

Source remains authoritative. Code intelligence may accelerate discovery and reasoning but must never replace exact-source inspection before modification.

## 3. Grafel capabilities selected for reuse

### ADOPT / WIRE — core structural intelligence

1. **Index freshness**
   - Reuse Grafel's per-repo freshness state.
   - Distinguish `current`, `queued`, `indexing`, `dirty`, or unknown.
   - Never silently use stale graph evidence as current truth.

2. **Orientation / codebase map**
   - module/community orientation;
   - important entities;
   - structural overview;
   - repo/group identity.

3. **Entity discovery and inspection**
   - BM25 entity lookup;
   - precise entity metadata;
   - line/source references;
   - callers/called-by context.

4. **Relationship navigation**
   - callers;
   - callees;
   - neighbors;
   - uses / used_by;
   - bounded graph slices.

5. **Path and flow tracing**
   - confidence-weighted entity paths;
   - data flow;
   - control flow;
   - def-use;
   - effects;
   - process-flow chains.

6. **HTTP/API surface**
   - endpoint definitions/calls;
   - endpoint contracts/posture;
   - cross-repo client/server links.

7. **Impact analysis**
   - entity blast radius;
   - changeset/ref impact;
   - graph-aware version/ref diff.

### ADOPT LATER — after core query path is stable

8. **Codebase-scoped learned patterns**
   - task trigger;
   - ordered steps;
   - anti-patterns;
   - repo/module/language/stack/entity-kind scope;
   - real code exemplars;
   - confidence lifecycle.

9. **Specialized analysis**
   - debt: dead code, cycles, stubs, impurity, license;
   - security: taint findings, secrets, auth coverage;
   - tests: coverage, reachability, contract effectiveness.

## 4. Explicitly rejected / deferred Grafel parts

Do **not** make these Agent Core authorities:

- Grafel findings store as a replacement for Agent Core Memory;
- Grafel audit log as a replacement for Activity Tracker;
- Grafel LLM/enrichment controller as a replacement for the connected AI/controller;
- Grafel docgen workflow as an Agent Core workflow engine;
- Grafel installer that edits Claude/Cursor/Windsurf/Codex/etc. host configs;
- Grafel rules/skills injection into external AI tools;
- automatic Grafel writes into Agent Core `AGENTS.md`;
- automatic code-pattern export into root `AGENTS.md`;
- full Go implementation port into TypeScript;
- Grafel dashboard as a required runtime dependency;
- code-graph freshness as a hard execution gate;
- Grafel-generated conclusions as authority over current source.

Do not run `grafel install` as part of Agent Core integration.

## 5. Target architecture

```text
                          AI / MCP Client
                                |
                                v
                         Agent Core :8765
                                |
         +----------------------+----------------------+
         |                      |                      |
         v                      v                      v
  Machine Control            Memory             Code Intelligence
     src\rdc              src\memory          src\code-intelligence
                                                       |
                                                       v
                                             CodeIntelligenceService
                                                       |
                                  +--------------------+------------------+
                                  |                                       |
                                  v                                       v
                           Grafel runtime                         Grafel MCP client
                        project-local isolated                    thin adapter
                                  |                                       |
                                  v                                       v
                        grafel daemon/serve <---- local RPC ---- grafel mcp-bridge
                                  |
                                  v
                           structural graph
                              graph.fb
                                  |
                +-----------------+------------------+
                |                 |                  |
                v                 v                  v
          entity lookup      graph traversal      impact/analysis
```

Machine-control tools remain direct:

```text
AI -> Agent Core machine tool -> local machine
```

They must never become:

```text
AI -> Grafel approval/gate -> machine tool
```

## 6. Proposed Agent Core source layout

Preferred new subsystem:

```text
src\code-intelligence\
  types.ts
  service.ts
  grafel-runtime.ts
  grafel-client.ts
  grafel-adapter.ts
```

MCP integration:

```text
src\mcp\
  code-intelligence-schemas.ts
  code-intelligence-tools.ts
```

Existing integration points:

- `src\index.ts`
- `src\config.ts`
- `src\mcp\handler.ts`
- `src\mcp\server.ts`
- `AGENTS.md`
- `docs\CODEBASE.md`

Do not place provider-specific implementation under `src\rdc` or `src\memory`.

## 7. Project-local runtime layout

Grafel must not use the user's global Grafel installation/state.

Preferred runtime layout:

```text
runtime\grafel\
  bin\
    grafel.exe
    LICENSE.grafel
  home\
  daemon\
  logs\
  provider.json
```

Provider process environment must isolate all relevant home/state roots together:

```text
HOME=<PROJECT_ROOT>\runtime\grafel\home
USERPROFILE=<PROJECT_ROOT>\runtime\grafel\home
GRAFEL_HOME=<PROJECT_ROOT>\runtime\grafel\home\.grafel
GRAFEL_DAEMON_ROOT=<PROJECT_ROOT>\runtime\grafel\daemon
```

Reason: Grafel's own architecture explicitly documents that partial isolation is unsafe; `GRAFEL_HOME` and `GRAFEL_DAEMON_ROOT` must not accidentally point a private daemon at the user's live global store.

Do not add Grafel to system PATH.

## 8. Provider artifact strategy

Prefer reuse of Grafel's own compiled provider rather than rebuilding its feature set.

Implementation must choose a **version-pinned project-local artifact**:

1. preferred: official Windows Grafel binary whose behavior is compatible with the grounded provider contract;
2. otherwise: build the grounded source revision into `runtime\grafel\bin\grafel.exe` using project-local tooling only.

The protected checkout remains reference/source material and is not the runtime working directory.

Requirements:

- record provider version/commit/hash in `runtime\grafel\provider.json`;
- verify executable identity before kill/restart;
- retain Grafel's MIT license notice beside any bundled/distributed binary;
- never self-update from the network without explicit user authorization.

## 9. Protected-path and repository-boundary policy

This is a hard requirement.

Grafel must **not** automatically index:

- `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\`;
- `SubProject\` by default, because those are separate codebases unless explicitly scoped;
- root `.env`;
- `secrets\`;
- runtime/generated state already excluded by current repository ignore rules.

Before the first index, create a minimal root `.grafelignore` or equivalent Grafel-supported exclusion that at minimum contains:

```text
/DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/
/SubProject/
```

Existing `.gitignore` already excludes `runtime`, `.env`, `secrets`, `dist`, `node_modules`, and other generated state; the implementation must confirm Grafel's effective ignore set before indexing.

The initial acceptance index must prove protected-path entities are absent from graph results.

## 10. Grafel registration policy

Do not allow Grafel to install external hooks, MCP entries, rules, or AI-host integrations.

If Grafel group registration is required, use the narrowest supported non-interactive path.

Preferred semantics:

- group name: `agent-core`;
- repo: current resolved `<PROJECT_ROOT>`;
- no external MCP registration;
- no IDE/agent rules injection;
- no Git hooks;
- no OS watcher units unless later demonstrated necessary;
- no project-guidance injection;
- no modification of protected paths.

Grafel's `group add` supports disabling install side effects. Before implementation, inspect the exact resulting file mutations and permit only the minimum needed for the isolated provider.

If a repo-local `.grafel/group.json` marker is not necessary when Agent Core always passes explicit group context, prefer registry-only routing. Do not add a committed marker merely for convenience.

## 11. Provider lifecycle

Create a small `CodeIntelligenceService` responsible for:

- finding the project-local provider artifact;
- applying isolated environment variables;
- checking provider health;
- starting the provider when absent;
- keeping provider ownership/identity explicit;
- connecting via Grafel's supported local MCP bridge;
- closing only provider processes owned by Agent Core;
- never killing an unrelated Grafel instance by name alone.

Initial operating mode should be Grafel **background** mode unless measured evidence shows a different mode is required.

Code-intelligence failure must not stop Agent Core startup.

Expected health state:

```ts
{
  status: 'available' | 'degraded' | 'not-configured' | 'error',
  provider: 'grafel',
  providerVersion?: string,
  daemon?: 'available' | 'unavailable',
  index?: 'current' | 'queued' | 'indexing' | 'dirty' | 'unknown',
  group?: string,
  issueCount: number
}
```

Top-level Agent Core HTTP health may remain `ok` when code intelligence is degraded, just as optional derived memory capability can degrade without destroying canonical memory.

## 12. Provider client strategy

Do not write a Grafel-specific JSON-RPC protocol implementation from scratch unless the supported MCP route proves unusable.

Reuse:

```text
grafel mcp-bridge
```

as the provider seam.

Agent Core already carries `@modelcontextprotocol/client` as a development dependency. If runtime code imports it, move/promote that same package into runtime dependencies rather than adding a duplicate protocol stack.

The adapter must:

- initialize one bounded provider session;
- reuse the session rather than spawn a bridge per query;
- reconnect on transport death;
- apply timeouts/cancellation;
- map Grafel tool errors into fail-soft Agent Core results;
- never log raw provider payloads that may contain source/security findings.

## 13. Curated Agent Core MCP surface

Do not expose Grafel's full provider tool catalogue directly in v1.

Preferred stable Agent Core facade: **five tool families**.

### 13.1 `code_orient`

Actions:

- `status`
- `overview`
- `clusters`
- `modules`
- `find`
- `inspect`

Backed by Grafel:

- `grafel_index_status`
- `grafel_orient`
- `grafel_find`
- `grafel_inspect`

### 13.2 `code_graph`

Actions:

- `related`
- `paths`
- `subgraph`
- `trace`

Backed by:

- `grafel_related`
- `grafel_find_paths`
- `grafel_subgraph`
- `grafel_trace`

### 13.3 `code_surface`

Actions:

- `endpoints`
- `cross_links`
- `impact`
- `diff`

Backed by:

- `grafel_endpoints`
- `grafel_cross_links`
- `grafel_impact_radius`
- `grafel_diff`

### 13.4 `code_analysis`

Kinds:

- `debt`
- `security`
- `tests`

Backed by:

- `grafel_debt`
- `grafel_security`
- `grafel_test_analysis`

This tool is specialized/on-demand and should not be auto-run for every coding task.

### 13.5 `code_patterns` — later phase

Actions:

- `query`
- `record`
- `refine`
- `apply`
- `reject`
- `promote`
- `get`

Backed by `grafel_patterns`.

Do not ship `code_patterns` until the core structural query path is stable.

## 14. Freshness and fail-soft behavior

Every structural answer must carry or be preceded by freshness evidence.

Controller behavior:

```text
Code-intelligence index current?
        |
       yes
        |
        v
use structural graph
        |
        v
inspect exact source before edit
```

When stale/unavailable:

```text
index dirty/indexing/unavailable
        |
        +--> do not block machine tools
        +--> surface freshness state
        +--> fall back to Agent Core search/read
        +--> optionally request bounded refresh when appropriate
```

No stale graph result may be presented as verified current source truth.

## 15. Controller integration — “always used” without becoming a gate

Add a compact `AGENTS.md` code-intelligence protocol only after runtime capability exists.

Target rule:

For non-trivial coding tasks involving architecture, dependencies, callers/callees, flow tracing, endpoint contracts, cross-repo behavior, or refactor blast radius:

1. consult Code Intelligence when it is available/current;
2. use structural graph evidence before broad manual search where it can answer the question;
3. inspect exact current source before modification;
4. treat graph evidence as navigation/analysis, not source authority;
5. if Grafel is stale/unavailable, continue through normal Agent Core search/read rather than blocking;
6. do not invoke code intelligence for unrelated non-code work or trivial direct file operations.

This makes the subsystem consistently used where it adds value without creating a universal preflight gate.

## 16. Memory / Reflexion / Pattern authority boundaries

Keep three distinct knowledge classes:

### Agent Core Memory

Use for:

- durable architecture facts;
- operational lessons;
- cross-task continuity;
- verified generic failure corrections.

### Reflexion

Use for:

- task-local failure diagnosis;
- changed-next-attempt reasoning;
- verified reusable operational-reflection promotion.

### Grafel Patterns

Use for:

- codebase-specific implementation recipes;
- module/language/stack-scoped conventions;
- ordered steps grounded to real code exemplars;
- anti-patterns grounded to code examples.

Do not duplicate one fact into all three stores by default.

After a verified coding success:

```text
Generic operational lesson?
    -> Agent Core Memory

Codebase-specific repeatable recipe with real exemplar?
    -> Grafel Pattern candidate

Neither?
    -> do not persist
```

Pattern creation should default to candidate/review behavior, not automatic authoritative promotion.

## 17. Observability

Reuse Activity Tracker.

Recommended module:

```text
CODE_INTELLIGENCE
```

Record only bounded metadata such as:

- provider start/stop;
- health transition;
- index state transition;
- tool family/action;
- duration;
- error family;
- provider version.

Do not duplicate Grafel's full audit log into Agent Core tracker.

Do not persist full source snippets, secret-scan raw payloads, or large graph responses into Activity Tracker.

## 18. Implementation phases

### Phase 0 — baseline / safety freeze

Before runtime changes:

- confirm root worktree state without resetting anything;
- verify Grafel reference remains clean/read-only;
- record Agent Core health and current 50-tool surface (26 machine-control + 10 memory + 14 Game Mode);
- confirm protected-path exclusions;
- create scoped backup of exact files that will be modified;
- do not run broad tests.

### Phase 1 — provider artifact + isolation

Implement only provider packaging/runtime isolation:

- create `runtime\grafel` layout;
- place/pin `grafel.exe` project-locally;
- preserve MIT license notice;
- create provider metadata file;
- implement isolated environment;
- no Agent Core MCP tools yet.

Acceptance evidence:

- provider executable identity known;
- global Grafel state untouched;
- provider can start/stop in isolated runtime.

### Phase 2 — provider lifecycle + health

Target:

- `src\code-intelligence\types.ts`
- `src\code-intelligence\grafel-runtime.ts`
- `src\code-intelligence\service.ts`
- `src\config.ts`
- `src\index.ts`

Add:

- fail-soft initialization;
- provider health;
- lifecycle ownership;
- graceful close;
- code-intelligence subsection in `/health`.

No public code-query tools yet.

### Phase 3 — safe repository registration + initial index

Target:

- minimal Grafel group/registry setup;
- root `.grafelignore` or equivalent exclusion;
- initial explicit index.

Hard acceptance:

- protected directory excluded;
- `SubProject` excluded unless explicitly opted in;
- root secrets/environment/runtime state excluded;
- no external AI-host config, rules, hooks, or MCP registration modified.

### Phase 4 — provider MCP client

Target:

- `src\code-intelligence\grafel-client.ts`
- `src\code-intelligence\grafel-adapter.ts`

Implement:

- one reusable MCP bridge connection;
- bounded call timeout;
- reconnect;
- cancellation;
- structured error mapping;
- stable provider-version compatibility check.

### Phase 5 — core curated MCP tools

Target:

- `src\mcp\code-intelligence-schemas.ts`
- `src\mcp\code-intelligence-tools.ts`
- `src\mcp\handler.ts`
- `src\mcp\server.ts`

Register:

- `code_orient`
- `code_graph`
- `code_surface`

Pass shared `CodeIntelligenceService` through the same runtime factory pattern used for MemoryService.

Do not yet expose analysis/pattern mutation tools.

### Phase 6 — controller contract

Target:

- `AGENTS.md`

Add the structural-code-intelligence protocol only after Phase 5 is operational.

The rule must remain conditional by task relevance and fail-soft on stale/unavailable provider state.

### Phase 7 — specialized analysis

After the structural core has proved stable, add:

- `code_analysis`

Keep it explicit/on-demand.

### Phase 8 — Pattern × Reflexion integration

After query/impact paths are stable, add:

- `code_patterns`

Rules:

- query applicable pattern before meaningful repetitive code work;
- record only grounded recipes with real exemplars;
- mark successful apply only with real success evidence;
- failed pattern application may lower confidence/reject but must not auto-delete;
- generic operational lessons stay in Agent Core Memory;
- no automatic pattern export into `AGENTS.md`.

### Phase 9 — documentation / activation

After implementation exists:

- update `docs\CODEBASE.md`;
- update `MEMORY.md` only if actual memory authority/behavior changes;
- update public tool counts;
- record actual runtime topology;
- mark this plan complete only after user-authorized verification;
- add a durable Agent Core memory record only after the architecture is implemented and verified.

## 19. Verification gates

Verification runs only when the user authorizes it.

Before this plan can be marked COMPLETE, evidence should show:

1. Agent Core still starts and serves existing direct tools when Grafel is absent.
2. Grafel runtime uses only project-local isolated state.
3. User global Grafel state/config is untouched.
4. Protected paths are absent from the Grafel graph.
5. Initial Agent Core repo index reaches a current state.
6. `code_orient` can locate a known source entity.
7. `code_graph` returns a real caller/callee or relationship for a known entity.
8. `code_surface impact` reports a bounded blast radius for a representative entity.
9. Results include/obey freshness semantics.
10. Exact source is still inspected before a representative modification.
11. Provider death/restart degrades code intelligence but leaves machine-control and memory tools callable.
12. No Grafel install/rules/hooks/MCP-host configuration was written outside Agent Core runtime.
13. No new memory/audit authority was introduced.
14. Activity Tracker records only bounded code-intelligence metadata.
15. Existing Agent Core secret redaction boundaries remain intact.
16. Public MCP tool count/documentation matches the implemented facade.
17. `docs\CODEBASE.md` is synchronized.
18. Protected Grafel reference checkout remains unmodified unless a later explicit task says otherwise.

## 20. Regression risks

Primary risks:

- Grafel v0.x tool/schema drift;
- stale graph evidence being mistaken for current source;
- accidentally indexing protected or unrelated repositories;
- Grafel child process leaking outside Agent Core lifecycle;
- partial isolation touching the user's global Grafel store;
- provider restart causing long query stalls;
- excessive MCP surface growth;
- large graph responses consuming controller context;
- duplicate persistent knowledge between Memory and Grafel Patterns;
- automatic pattern reinforcement from unverified results;
- external Grafel installer mutating AI-host configs;
- dependency on hidden Grafel commands changing between versions;
- background indexing consuming too much CPU/RAM.

Mitigation:

- pin provider version;
- compatibility smoke at startup/activation;
- exact protected-directory exclusions;
- project-local runtime;
- background mode;
- bounded tool schemas/token budgets;
- fail-soft fallback;
- stable Agent Core facade instead of exposing raw provider tool names;
- explicit authority boundaries.

## 21. Rollback boundary

Rollback must be surgical:

- disable/remove Agent Core code-intelligence facade;
- stop only the Agent Core-owned Grafel provider;
- remove provider runtime state only if explicitly authorized;
- remove Grafel-specific controller rule;
- revert code-intelligence-specific configuration/tool registration;
- do not reset unrelated repository changes;
- do not delete Agent Core Memory;
- do not alter the protected Grafel reference checkout;
- normal machine-control and memory operation must remain available after rollback.

## 22. Definition of done

The integration is complete only when:

- Agent Core has a working structural code-intelligence sibling;
- Grafel is reused rather than reimplemented;
- provider state is project-local and isolated;
- protected paths are not indexed;
- structural queries are exposed through a small stable Agent Core facade;
- non-trivial coding tasks can use graph evidence automatically through the controller contract;
- source remains authoritative;
- stale/unavailable graph data fails soft;
- machine-control remains direct and ungated;
- Memory/Reflexion/Patterns have distinct authorities;
- no external AI tool configuration is modified;
- documentation describes verified implemented state.

## 23. Initial implementation order

Recommended execution order:

```text
baseline + backup
→ protected-path exclusion design
→ pinned project-local Grafel artifact
→ isolated provider lifecycle
→ provider health
→ minimal group/index bootstrap
→ MCP bridge client
→ code_orient
→ code_graph
→ code_surface
→ controller contract
→ specialized analysis
→ patterns + Reflexion
→ authorized verification
→ documentation sync
→ close plan
```

## 24. Implementation checkpoint — 2026-09-18

Core integration is implemented in source and compiled.

Completed:

- Phase 0 baseline/safety freeze and scoped backup;
- Phase 1 project-local official Grafel `v0.3.3` artifact with checksum verification, MIT notice, isolated runtime directories, and provider metadata;
- Phase 2 fail-soft provider lifecycle + `/health` integration under `src\code-intelligence`;
- Phase 3 isolated `agent-core` registration, root `.grafelignore`, current index, and verified exclusion of protected/reference + `SubProject` entities;
- Phase 4 reusable MCP stdio bridge client over `grafel mcp-bridge` with reconnect/timeouts and no custom wire-protocol reimplementation;
- Phase 5 curated `code_orient`, `code_graph`, and `code_surface` facade;
- Phase 6 `AGENTS.md` controller protocol with source-authority + stale/unavailable fallback rules;
- Phase 7 explicit/on-demand `code_analysis` for debt/security/test analysis;
- Phase 8 full `code_patterns` query/record/get/refine/apply/reject/promote facade grounded to Grafel exemplars, with Agent Core Memory/Reflexion authority boundaries preserved;
- root TypeScript build completed successfully after the integration changes;
- compiled registration smoke exposed all five `code_*` tools through `createAgentCoreMcpServer()` without altering the 26 direct machine-control handlers;
- direct Grafel MCP acceptance exercised real entity discovery, incoming relationship navigation, and entity impact analysis;
- direct provider acceptance confirmed a protected-reference-only identifier and the `SubProject` identifier `AgentCorePanel` are absent from the indexed graph while `CodeIntelligenceService` is discoverable from active Agent Core source;
- stale/unavailable handling is implemented as a handled Code Intelligence error path; it does not wrap or gate normal machine-control registration.

Provider compatibility finding:

- the pinned official Grafel Windows release is `v0.3.3`;
- its advertised `grafel_patterns` input schema is narrower than its actual handler surface, but direct binary probes confirmed `get`, `refine`, `apply`, `reject`, and `promote` are recognized in addition to `query` / `record`;
- the facade therefore supports the full observed lifecycle using the verified handler argument contracts rather than treating the incomplete advertised schema as the implementation limit;
- no extra compiler/toolchain is required for the approved integration because Agent Core reuses the official project-local binary rather than rebuilding Grafel.

## 25. Completion evidence

Approved-scope integration is closed.

- owner-checked activation replaced only the project-local Node listener on `:8765`; live listener readback shows `runtime\node\node.exe` executing `<PROJECT_ROOT>\dist\index.js`;
- post-activation `/health` reported HTTP `ok`, Execution `available`, Memory canonical/index/embedding/intelligence all `available` with zero issues, Game Mode `available`, and Code Intelligence `available` with Grafel daemon `available`, index `current`, group `agent-core`, `issueCount=0`;
- compiled MCP registration smoke reported exactly **55 tools** = 26 machine-control + 10 memory + 14 Game Mode + 5 Code Intelligence and exposed `code_orient`, `code_graph`, `code_surface`, `code_analysis`, `code_patterns`;
- compiled `loadAgentProtocol()` readback confirmed the Code Intelligence protocol, freshness rule, and source-authority rule are present;
- direct Grafel queries verified active Agent Core entity discovery, incoming relationship navigation, and impact analysis; protected reference and `SubProject` identifiers remained absent from the graph;
- the protected Grafel reference checkout remained clean and the user's global `~/.grafel` store remained absent;
- root TypeScript build passed after the final source changes;
- broad Vitest/UI/.NET suites were not rerun; broad testing remains user-authorized and the last broad pre-Grafel baseline is preserved separately in `docs\CODEBASE.md`.

**Open items from this plan: NONE.**

The protected Grafel checkout remains reference-only and unmodified.
