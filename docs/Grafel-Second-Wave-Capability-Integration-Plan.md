# Grafel Second-Wave Capability Integration Plan — Agent Core

> **Status:** COMPLETE — IMPLEMENTED AND TARGETED-VERIFIED FOR APPROVED SCOPE  
> **Implementation state:** HISTORICAL COMPLETE — NO OPEN SECOND-WAVE TASK  
> **Created:** 2026-09-18  
> **Continuity normalized:** 2026-09-20 after corruption/doc rollback audit  
> **Parent integration:** docs\Grafel-Code-Intelligence-Integration-Plan.md — COMPLETE  
> **Historical reference revision:** 45f9745d02f3662a8516fb35cd2d0624acf82cbf, describe v0.3.3-50-g45f9745d0  
> **Current runtime lineage:** qualified Agent Core-owned post-v0.3.3 Grafel provider  
> **Remaining proposal authority:** docs\Grafel-Post-v0.3.3-Exhaustive-Steal-Use-Plan.md

This document is historical implemented-state, not an active task queue. The 2026-09-20 source-first re-grounding found new boundary-hardening proposals and records them only in the post-v0.3.3 exhaustive plan.

## 1. Why a second wave exists

The first Grafel integration is complete and healthy, but its scope intentionally stopped at a fixed Agent Core workspace and a curated five-tool structural-intelligence facade:

~~~
code_orient
code_graph
code_surface
code_analysis
code_patterns
~~~

The re-audit on 2026-09-18 found seven Grafel capabilities that remain materially useful and are not yet represented in active Agent Core source:

1. dynamic multi-project / multi-repo Code Intelligence;
2. Git branch / ref / worktree-aware graphs;
3. residual-edge repair / graph self-correction;
4. architectural fitness rules;
5. structural code-review protocol;
6. graph-quality calibration;
7. provider diagnostics + quarantine visibility.

The objective is reuse, not reimplementation.

The preferred direction remains:

~~~
Agent Core
   |
   +-- stable native MCP facade
   |
   +-- thin typed adapter
   |
   +-- existing project-local Grafel binary / MCP / CLI
~~~

Do not copy Grafel's Go/tree-sitter/FlatBuffers implementation into TypeScript unless a future capability is proven inaccessible through supported provider surfaces.

## 2. Re-audit evidence

The following facts were directly verified before creating this plan.

### 2.1 Current Agent Core limitation

The isolated Grafel registry currently contains one group/repo only:

~~~
group = agent-core
repo  = agent-core
path  = <PROJECT_ROOT>
~~~

Current Agent Core configuration also treats Code Intelligence as a single fixed project:

~~~
CodeIntelligenceConfig.projectRoot
CodeIntelligenceConfig.group
CodeIntelligenceConfig.repoSlug
~~~

and the Grafel MCP client currently sends:

~~~
_meta.cwd = configured Agent Core project root
~~~

So Code Intelligence is healthy but workspace-fixed.

### 2.2 Current provider already exposes the necessary seams

The official v0.3.3 binary currently used by Agent Core was verified to expose:

- 22 Grafel MCP tools;
- grafel_docgen_apply with kind=repairs;
- grafel group add --track-worktrees;
- grafel branches --json;
- grafel quarantine list --json;
- grafel quality check --json;
- isolated group/registry operation without grafel install.

Therefore this second wave does not require a source build of Grafel to begin.

### 2.3 Protected checkout contains useful controller protocols

The protected reference includes controller/skill designs worth adapting rather than installing:

- grafel-aware-review;
- grafel-graph-quality;
- grafel-resolve;
- shared graph read/write protocols.

These are reference protocols only. Agent Core must not copy/install Grafel skills into Claude/Cursor/Codex/Windsurf or let Grafel overwrite AGENTS.md.

### 2.4 Reference HEAD is ahead of the runtime binary

The protected reference is v0.3.3-50-g45f9745d0. Those post-release changes include extractor accuracy, repository topology, Dubbo/cross-repo improvements, subtype visibility, truncation correctness, and daemon/Windows hardening.

Those improvements should normally arrive by upgrading the official project-local binary when a compatible release exists.

They are not candidates for manual TypeScript ports.

## 3. Seven-capability decision matrix

| # | Capability | Agent Core status now | Reuse seam | Planned public surface |
|---|---|---|---|---|
| 1 | Dynamic multi-project / multi-repo intelligence | fixed to Agent Core root | isolated Grafel group registry + request-scoped cwd/group | new code_workspace |
| 2 | Branch/ref/worktree-aware graph | provider supports it, Agent Core facade does not | --track-worktrees, per-ref graph, cwd/ref routing, branches --json | code_workspace + optional ref on existing tools |
| 3 | Residual-edge repair | provider tool exists but is not exposed | grafel_docgen_apply(kind=repairs) | new code_repair |
| 4 | Architectural fitness rules | provider CLI exists, no Agent Core facade | grafel quality check --json | extend code_analysis(kind=fitness) |
| 5 | Structural code-review protocol | generic structural tools exist, review protocol absent | controller contract derived from grafel-aware-review | AGENTS.md only |
| 6 | Graph-quality calibration | no explicit calibration protocol | controller comparison of graph vs source ground truth | AGENTS.md only |
| 7 | Provider diagnostics / quarantine visibility | health exists, deeper provider state absent | status/registry/tool-catalog + quarantine list --json | extend code_orient |

Planned production surface after this work:

~~~
existing:
  code_orient
  code_graph
  code_surface
  code_analysis
  code_patterns

new:
  code_workspace
  code_repair
~~~

If Memory, Game Mode, and Code Intelligence remain enabled, the public MCP count would move from 55 to 57.

This count is planned, not current.

## 4. Unified architecture

Target architecture:

~~~
AI / controller
      |
      v
Agent Core MCP
      |
      +---------------- normal machine/memory/phone tools remain direct
      |
      v
Code Intelligence facade
      |
      +-- workspace/ref resolver
      |      |
      |      +-- request-scoped workspace
      |      +-- request-scoped ref/worktree
      |
      +-- existing structural queries
      +-- repair facade
      +-- fitness analysis
      +-- diagnostics
      |
      v
CodeIntelligenceService
      |
      +-- GrafelClient (MCP)
      +-- GrafelRuntime (CLI/lifecycle)
      |
      v
isolated Grafel registry/daemon/state
~~~

There is still one Grafel provider runtime owned by Agent Core.

Do not create one daemon per workspace unless provider constraints prove that necessary.

## 5. State and authority model

### 5.1 No new database

Do not add a workspace database, repair database, fitness database, review database, or graph-quality database.

Reuse:

- Grafel isolated group/registry state as workspace registration authority;
- Grafel graph/ref state as structural authority;
- current source files as final code authority;
- Activity Tracker for bounded operational evidence;
- Agent Core Memory only for independently justified durable lessons.

### 5.2 Request-scoped context, not hidden global selection

Code Intelligence calls should resolve an explicit/request-scoped context:

~~~
workspace
ref
repoFilter
cwd/worktree path
~~~

Do not introduce a hidden global "currently selected project" that silently redirects later tool calls.

If no workspace is supplied, preserve the current Agent Core workspace as the backward-compatible default.

### 5.3 Provider registry is not Agent Core architecture truth

Grafel registry tells the provider what is indexed.

It does not become a general Agent Core project database.

## 6. Capability 1 — Dynamic multi-project / multi-repo Code Intelligence

### 6.1 Goal

Allow the same Agent Core instance to use structural intelligence against the project currently being engineered, instead of being permanently tied to the Agent Core repository.

Examples:

~~~
E:\Projects\Project-A
E:\Projects\Project-B
F:\Client\Monorepo
~~~

without changing the Agent Core installation root.

### 6.2 New public tool

Plan one new tool:

~~~
code_workspace
~~~

Initial actions:

- list — enumerate Agent-Core-managed Grafel workspaces/groups;
- resolve — resolve a path to an existing workspace/group/ref without mutation;
- register — explicitly register a user-scoped project/group;
- status — return workspace-specific daemon/index/repo/ref state;
- index — explicitly request index/reindex for a registered workspace;
- refs — list branch/ref lifecycle state for the workspace.

Do not include delete/prune in the initial public contract.

### 6.3 Workspace identity

Prefer deterministic group names when the caller does not supply one:

~~~
ac-<sanitized-basename>-<short-path-hash>
~~~

Requirements:

- stable for the same normalized path;
- collision-resistant across drives/directories;
- does not expose full paths in the group name;
- never relies on drive letter alone.

### 6.4 Multi-repo groups

A workspace may contain:

- one repo;
- several explicitly supplied repos;
- a monorepo registered as one repo/group according to Grafel's supported model.

Do not recursively scan disks to "discover projects".

Only register paths that are explicitly in the current user/task scope.

### 6.5 Protected-path rule

Automatic registration must refuse:

~~~
<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\*
~~~

unless the user explicitly names the exact protected path for that task.

The same rule applies to other known protected project boundaries.

### 6.6 Repo-local mutation problem

Grafel group registration can use a repo-local .grafel/group.json discovery marker.

For arbitrary external workspaces, Agent Core must not silently write repo-local Grafel metadata.

Implementation phase must first determine the narrowest supported provider path:

1. use a supported registry-only/no-marker mode if Grafel provides one;
2. otherwise use explicit group arguments and avoid marker dependence where possible;
3. if a repo-local marker is technically required, surface requiresRepoMarker=true and perform that mutation only under explicit workspace-registration authorization.

Do not hand-edit Grafel's internal registry format as a shortcut.

### 6.7 Source shape

Likely new source:

~~~
src\code-intelligence\workspace-resolver.ts
~~~

Likely responsibilities:

- normalize Windows paths safely;
- derive stable workspace IDs;
- resolve existing isolated Grafel groups;
- validate protected-path boundaries;
- produce CodeWorkspaceContext.

## 7. Capability 2 — Git branch / ref / worktree-aware graph

### 7.1 Goal

Ensure structural answers correspond to the branch/worktree the AI is actually editing.

### 7.2 Provider mechanisms to reuse

Current provider supports:

- group add --track-worktrees;
- per-ref graph state;
- CWD/ref inference;
- grafel branches --json;
- pin/unpin/keep-last/prune lifecycle operations.

Initial Agent Core scope should reuse read/ref routing first.

### 7.3 Schema extension

Add optional context fields to the existing Code Intelligence tools:

~~~
workspace
ref
worktreePath
~~~

The stable existing tool names remain unchanged.

Resolution order:

~~~
explicit workspace/ref
    ↓
worktree/CWD inference
    ↓
registered workspace default ref
    ↓
Agent Core default workspace
~~~

Never silently answer from a different ref when the requested ref is known but unavailable.

### 7.4 MCP client change

GrafelClient.callTool() currently fixes:

~~~
_meta.cwd = Agent Core root
~~~

Plan to change the call contract to accept a request context:

~~~
callTool(name, args, { cwd })
~~~

and pass the resolved workspace/worktree cwd.

### 7.5 Ref freshness

Health/freshness must become workspace/ref aware.

A graph that is current for main is not evidence that a feature-worktree graph is current.

Return enough context to make that explicit:

~~~
workspace
repo
ref
worktree
index
indexedCommit / provider ref metadata when available
~~~

### 7.6 Lifecycle mutation boundary

Do not automatically:

- pin refs;
- unpin refs;
- prune stale refs;
- enforce keep-last-N.

Those are provider storage lifecycle mutations and remain explicit future/user actions.

The initial capability only needs:

- track worktrees when workspace registration explicitly enables it;
- list refs;
- route queries to the correct ref/worktree.

## 8. Capability 3 — Residual-edge repair / graph self-correction

### 8.1 Goal

Expose Grafel's bounded residual repair mechanism so the AI can correct ambiguous/dynamic/external graph relationships instead of merely noticing them.

### 8.2 Provider seam

Reuse:

~~~
grafel_docgen_apply(kind=repairs)
~~~

Verified provider repair resolutions include:

- bind_to_entity;
- reclassify_as_external;
- reclassify_as_dynamic;
- reclassify_as_resolved;
- abandon.

Provider-side implementation already supplies validation and atomic repair-file persistence.

Do not duplicate that logic in TypeScript.

### 8.3 New public tool

Plan one new tool:

~~~
code_repair
~~~

Actions:

- list — list/paginate residual repair candidates;
- inspect — return bounded candidate context and target evidence;
- submit — submit one explicit resolution;
- abandon — explicitly abandon a candidate with reason;
- reindex — request refresh after an accepted repair, or delegate to code_workspace(index).

If reindex is already cleanly represented by code_workspace, prefer one authority and omit duplicate implementation.

### 8.4 Safety and evidence contract

Before submit:

1. graph candidate must still exist;
2. controller must inspect exact relevant current source through normal Agent Core file tools;
3. target entity must be verified when using bind_to_entity;
4. source/failure evidence must distinguish dynamic, external, resolved, or abandoned state;
5. provider validation remains mandatory.

Never auto-apply a repair merely because Grafel suggests one.

### 8.5 Reindex semantics

A submitted repair changes provider interpretation, not source code.

Do not pretend the graph is current immediately after a repair.

After mutation:

~~~
repair submitted
    ↓
workspace/ref becomes dirty/pending
    ↓
explicit index/rebuild request
    ↓
freshness becomes current
    ↓
structural answer may be trusted again
~~~

### 8.6 Repair state authority

Do not copy repair history into Agent Core Memory.

Grafel repair state remains provider-scoped graph metadata.

Only a separately verified reusable engineering lesson may be promoted to Memory under the normal Memory/Reflexion rules.

## 9. Capability 4 — Architectural fitness rules

### 9.1 Goal

Allow explicit structural architecture contracts to be checked against the graph.

Examples:

~~~
forbid UI -> Database
forbid Presentation -[IMPORTS]-> Persistence
require Route has-no-inbound-CALLS
threshold import_cycles.count == 0
threshold orphan_rate_pct < N
~~~

### 9.2 Provider seam

Reuse Grafel's existing:

~~~
grafel quality check --json <group|repo>
~~~

and its .grafel/fitness.yaml rule evaluator.

Do not reimplement the rule parser/evaluator in TypeScript.

### 9.3 Public surface

Extend existing:

~~~
code_analysis
~~~

with:

~~~
kind = fitness
~~~

Planned inputs:

- workspace;
- optional repo;
- strict;
- optional output detail level.

### 9.4 Exit-code handling

Grafel fitness intentionally uses:

~~~
0 = rules passed
1 = internal/provider error
2 = rule violation
~~~

Agent Core must not translate exit code 2 into "Code Intelligence provider failed".

It should return a successful analysis result containing violations.

### 9.5 Rule authoring boundary

code_analysis(kind=fitness) is read-only.

Creating/editing:

~~~
<repo>\.grafel\fitness.yaml
~~~

must use ordinary Agent Core file tools under an explicit user request.

Do not auto-generate or silently commit architecture rules.

### 9.6 No universal execution gate

Fitness violations are evidence.

They do not automatically block:

- file edits;
- process execution;
- commits;
- other MCP tools.

If the user later explicitly asks to enforce fitness in CI, that is a separate integration task.

## 10. Capability 5 — Structural code-review protocol

### 10.1 Goal

Adapt the useful behavior of Grafel's grafel-aware-review skill into Agent Core's controller contract without installing the skill.

### 10.2 Trigger

Use the structural review pass when a reviewed diff changes items such as:

- public function/method signatures;
- deleted callable entities;
- HTTP/API routes;
- inter-module/import relationships;
- message publishers/subscribers;
- cross-repo calls/contracts;
- shared patterns or architectural wiring.

Skip for clearly non-structural changes such as pure formatting/comments/static fixture edits.

### 10.3 Planned review sequence

~~~
read diff/current source
      ↓
code_orient(status)
      ↓
code_surface(impact) for changed structural entities
      ↓
code_graph / code_surface targeted checks
      ↓
exact source verification for material findings
      ↓
review conclusion
~~~

### 10.4 Confidence rule

Graph evidence must never outrank source.

For ambiguous or low-confidence structural paths:

~~~
graph finding
   ↓
exact current source verification
   ↓
only then escalate
~~~

Do not reproduce Grafel's severity rubric as an automatic policy engine.

Agent Core reports evidence and concrete consequences; the controller/user decides disposition.

### 10.5 Implementation location

Controller-only update:

~~~
AGENTS.md
~~~

No new runtime service.

No copied Grafel skill directory.

## 11. Capability 6 — Graph-quality calibration

### 11.1 Goal

Detect when the structural graph is incomplete/noisy before the AI over-trusts it.

### 11.2 What to steal

Adapt the useful calibration idea from grafel-graph-quality:

~~~
graph answer
vs
independent source/search ground truth
~~~

Do not copy the full Grafel benchmark orchestration, subagent pipeline, token-cost accounting, or shareable report machinery.

### 11.3 Trigger

Calibration should be targeted, not automatic on every coding task.

Use it when:

- onboarding an unfamiliar/large codebase;
- preparing a high-risk refactor;
- graph results conflict with source;
- expected entities/edges are missing;
- suspiciously large/noisy results appear;
- cross-repo structural evidence is important.

### 11.4 Calibration sample

A bounded pass may check:

- several known entities found by source search vs code_orient(find);
- several callers/callees vs exact source references;
- endpoint definitions/callers vs source;
- cross-repo links where applicable;
- representative high-degree entities for false-positive edges;
- obvious missing entity kinds/framework surfaces.

### 11.5 Output

Produce a concise task-local calibration summary:

~~~
sample size
confirmed graph hits
observed misses
observed false positives
affected capability/kind
confidence note
recommended fallback/next action
~~~

Do not create a new quality database.

Do not automatically save the calibration to Memory.

### 11.6 Existing observability reuse

Use existing Activity Tracker only for bounded metadata if implementation needs telemetry.

Do not import Grafel's separate feedback-report persistence or external issue-report workflow.

## 12. Capability 7 — Provider diagnostics + quarantine visibility

### 12.1 Goal

Expose enough Grafel-provider diagnostics to distinguish:

- daemon failure;
- index failure;
- workspace/ref mismatch;
- registration drift;
- provider/tool incompatibility;
- watcher/quarantine problems.

### 12.2 Extend code_orient

Add planned actions:

~~~
diagnostics
quarantine
~~~

Both are read-only.

### 12.3 Diagnostics content

Prefer deterministic Agent Core-owned composition of supported provider facts:

- provider version;
- provider artifact hash/metadata;
- daemon availability;
- required/optional MCP tool availability;
- isolated registry/group state;
- workspace/ref/index freshness;
- current provider cwd/group routing context;
- branch/ref summary where relevant;
- quarantine count/status;
- configuration isolation state.

### 12.4 Do not use full install doctor as authority

Grafel's full doctor checks assumptions from its standalone install model:

- external MCP-host registration;
- skills installation;
- rules files;
- installation drift.

Agent Core intentionally does not use those features.

Therefore do not expose the full Grafel install doctor as a health gate.

If useful, only reuse provider-safe subsets such as status or quick daemon checks after confirming they do not generate false failures for the embedded model.

### 12.5 Quarantine

Reuse:

~~~
grafel quarantine list [group] --json
~~~

Initial Agent Core exposure is visibility only.

Do not automatically:

- unquarantine;
- pin;
- unpin.

Those mutations require explicit user intent.

Current Agent Core group has watchers disabled, so quarantine may legitimately remain empty.

## 13. Provider capability discovery

The first integration has a fixed GRAFEL_CORE_TOOLS compatibility set.

Second-wave features need a more granular capability model.

Planned addition:

~~~
src\code-intelligence\provider-capabilities.ts
~~~

Conceptual shape:

~~~
coreNavigation        required
workspaceRouting      supported / unsupported
refGraphs             supported / unsupported
repairs               supported / unsupported
fitness               supported / unsupported
diagnostics           supported / unsupported
quarantine            supported / unsupported
patterns              supported / unsupported
~~~

A missing optional second-wave capability must degrade only that feature.

It must not turn the already-working first-wave Code Intelligence subsystem into a total failure.

## 14. Planned source changes

Likely source map:

~~~
src\code-intelligence\
  types.ts                    extend workspace/ref/capability contracts
  workspace-resolver.ts       NEW
  provider-capabilities.ts    NEW
  grafel-client.ts            request-scoped cwd
  grafel-runtime.ts           workspace registration, refs, fitness, diagnostics
  service.ts                  workspace/ref-aware calls + per-capability degradation

src\mcp\
  code-intelligence-schemas.ts
  code-intelligence-tools.ts
  server.ts                   only registration additions if new tools are introduced

src\config.ts                defaults only; no per-project hardcoded registry expansion
AGENTS.md                    review + quality calibration protocols
docs\CODEBASE.md             implemented-state updates during execution
~~~

Avoid adding more files unless source ownership becomes clearer during implementation.

## 15. Planned MCP contracts

### 15.1 code_workspace

Conceptual schema:

~~~
action:
  list
  resolve
  register
  status
  index
  refs

path?
workspace?
group?
repos?
trackWorktrees?
ref?
~~~

Mutation annotations must reflect actions conservatively.

### 15.2 Existing structural tools

Add common optional context:

~~~
workspace?
ref?
worktreePath?
~~~

Existing calls without those fields remain backward compatible.

### 15.3 code_repair

Conceptual schema:

~~~
action:
  list
  inspect
  submit
  abandon

workspace
ref?
repoFilter?
candidateId?
resolution?
targetEntityId?
module?
reasoning?
limit?
offset?
~~~

Do not expose raw arbitrary provider arguments for mutating repair operations.

### 15.4 code_analysis

Add:

~~~
kind = fitness
~~~

and typed fitness options rather than requiring provider-specific params.

### 15.5 code_orient

Add:

~~~
action = diagnostics
action = quarantine
~~~

## 16. Provider CLI runner change

Current GrafelRuntime.runCli() treats every non-zero exit as an exception.

Second-wave CLI reuse requires a typed runner that can distinguish:

~~~
process execution failure
provider internal failure
domain result encoded as non-zero exit
~~~

Fitness is the primary example because exit code 2 means structural violations, not a broken provider.

Plan a bounded internal result:

~~~
exitCode
stdout
stderr
~~~

and let each provider adapter define accepted domain exit codes.

Do not weaken error handling globally.

## 17. Workspace safety profile

Every new workspace must define a safe indexing boundary before first index.

Minimum principles:

- respect existing .gitignore;
- never index .env*, credentials, secrets, runtime caches, generated artifacts, or explicitly protected folders;
- never recursively absorb neighboring projects;
- never automatically include Agent Core protected references;
- preserve user-authored .grafelignore if one already exists;
- do not overwrite user project ignore policy.

If the provider requires a repo-local ignore file and none exists, implementation must prefer an explicit, reviewable workspace-registration action rather than silently creating one.

## 18. Observability

Reuse Activity Tracker module:

~~~
CODE_INTELLIGENCE
~~~

Planned bounded events:

- workspace resolved/registered;
- workspace index requested;
- ref/worktree context selected;
- repair listed/submitted/abandoned;
- fitness check completed;
- provider diagnostics completed;
- quarantine state observed;
- graph calibration completed.

Do not persist:

- full source snippets;
- full graph payloads;
- secrets;
- raw repair reasoning beyond what the provider itself must store;
- entire review reports by default.

## 19. Memory / Reflexion / Pattern boundaries

The existing authority split remains unchanged.

~~~
Agent Core Memory
= durable architecture + verified reusable operational lessons

Reflexion
= task-local failure diagnosis + changed next action

Grafel Patterns
= codebase-specific reusable implementation recipes

Grafel Repair
= provider graph correction metadata

Fitness
= explicit structural architecture assertions

Calibration
= task-local confidence evidence
~~~

Do not merge these authorities simply because they all relate to engineering knowledge.

## 20. Explicit non-goals

This second wave does not authorize:

- porting Grafel Go internals into Agent Core;
- building a second graph engine;
- running grafel install;
- installing Grafel skills/personas into external AI tools;
- allowing Grafel to edit Agent Core AGENTS.md;
- syncing Grafel patterns into CLAUDE/AGENTS automatically;
- replacing Activity Tracker with Grafel telemetry;
- replacing Memory with Grafel findings;
- exposing grafel_get_source as a source authority;
- enabling docgen as a default Agent Core workflow;
- auto-repairing ambiguous graph edges without evidence;
- auto-writing fitness rules;
- turning fitness/review/calibration into a universal execution gate;
- auto-pruning branch/ref graphs;
- modifying quarantine state without explicit user intent;
- importing post-v0.3.3 reference HEAD changes into TypeScript.

## 21. Implementation phases

### Phase 0 — Baseline and safety freeze

Before implementation:

- back up affected Agent Core source/docs;
- record live provider/runtime health;
- record current 55-tool MCP surface;
- record protected Grafel checkout HEAD/status;
- record current isolated Grafel registry;
- confirm protected/reference and secret exclusions.

No broad tests unless separately authorized.

### Phase 1 — Provider capability census

Implement capability detection against the actual project-local binary.

Required outcome:

- first-wave core capabilities remain required;
- second-wave capabilities are feature-scoped;
- absent optional features degrade locally.

### Phase 2 — Workspace context abstraction

Implement request-scoped:

~~~
CodeWorkspaceContext
workspace resolver
cwd routing
workspace-aware health
~~~

Preserve Agent Core root as default.

No external workspace registration yet.

### Phase 3 — code_workspace + multi-project registration

Add:

- list;
- resolve;
- register;
- status;
- index.

Prove one temporary/test workspace can be registered without external AI-host mutation.

Resolve repo-local marker/ignore safety before declaring this phase complete.

### Phase 4 — Branch/ref/worktree awareness

Add:

- track-worktrees registration option;
- refs action;
- request-scoped ref / worktree context;
- ref-specific freshness.

Prove a branch/worktree query cannot silently fall back to another ref.

### Phase 5 — Residual repair

Add code_repair.

Start read-only:

- list;
- inspect.

Then add explicit mutation:

- submit;
- abandon.

Prove exact-source inspection + provider validation + reindex/freshness transition.

### Phase 6 — Architectural fitness

Extend code_analysis(kind=fitness).

Implement typed expected-exit handling.

Prove:

- no-rule workspace returns a neutral result;
- passing rule set returns pass;
- violated rule set returns violations without classifying the provider as broken.

### Phase 7 — Review + graph-quality controller protocols

Update AGENTS.md with:

- structural review triggers/sequence;
- source-verification rule;
- bounded graph-quality calibration triggers/output.

No runtime service is added.

### Phase 8 — Diagnostics + quarantine visibility

Extend code_orient with:

- diagnostics;
- quarantine.

Keep quarantine mutation out of the initial scope.

### Phase 9 — Activation/documentation

After implementation and user-authorized verification:

- activate rebuilt Node core;
- refresh external controller MCP manifest if new tools were added;
- update docs\CODEBASE.md;
- update this plan to completed status only after evidence exists;
- update durable memory only for final implemented architecture facts.

## 22. Verification gates — require user authorization

Implementation may build/reload when required for activation, but tests beyond that follow the user's verification rule.

When authorization is given, targeted acceptance should cover the following.

### Workspace routing

- Agent Core default workspace remains functional.
- A second project can be resolved/registered.
- Queries return entities from the selected workspace only.
- Unregistered/protected path behavior is explicit and safe.

### Ref/worktree

- main/default ref query works.
- feature ref/worktree query works.
- stale/missing ref never silently returns default-ref evidence.
- refs output matches provider state.

### Repair

- residual list returns real provider candidates or truthful empty result.
- invalid repair is rejected by provider.
- valid synthetic/fixture repair updates provider state.
- post-repair graph is treated non-current until refresh.

### Fitness

- no-rule case;
- pass case;
- violation case;
- strict behavior;
- exit code 2 is domain data, not provider failure.

### Review protocol

- structural-change fixture triggers graph checks.
- style-only fixture skips graph review.
- material graph finding requires exact-source verification.

### Calibration

- graph/source agreement sample;
- known-miss/noise fixture produces bounded confidence warning;
- no automatic Memory persistence.

### Diagnostics/quarantine

- diagnostics reflects live provider identity/toolset/registry.
- quarantine empty state is truthful when watchers are disabled.
- no mutation occurs from read-only calls.

### Regression

If broad verification is explicitly authorized, rerun the final-graduation stack current at implementation time.

## 23. Rollback

Rollback must be surgical.

### Workspace/ref layer

- remove new workspace resolver/context code;
- revert MCP schema context additions;
- keep existing Agent Core default Code Intelligence unchanged.

### Repair

- remove code_repair registration/adapter only;
- do not delete provider repair history automatically.

### Fitness

- remove fitness analysis routing;
- never delete user-authored .grafel/fitness.yaml.

### Controller protocols

- revert only the second-wave review/calibration additions;
- preserve existing first-wave Code Intelligence and Reflexion contracts.

### Diagnostics

- remove new diagnostic/quarantine actions only.

Never delete external project Grafel metadata during rollback without explicit user authorization.

## 24. Risks and mitigations

### Risk — hidden workspace mutation

Mitigation: explicit registration path; no drive scans; no silent repo-local marker creation.

### Risk — wrong-ref answers

Mitigation: request-scoped ref/worktree context + ref-specific freshness + fail-soft refusal rather than fallback.

### Risk — repair corrupts graph interpretation

Mitigation: exact source evidence + provider validation + explicit mutation + freshness reset.

### Risk — fitness becomes a gate everywhere

Mitigation: analysis-only surface; CI enforcement is a separate explicit project.

### Risk — Grafel installer semantics leak into embedded runtime

Mitigation: never use grafel install; diagnostics ignore standalone-install assumptions.

### Risk — provider version drift

Mitigation: capability discovery; optional features degrade independently; pin runtime artifact; upgrade only through explicit provider update.

### Risk — second-wave scope balloons into Grafel reimplementation

Mitigation: every capability must map to an existing provider MCP/CLI seam or controller protocol. If it cannot, stop and re-evaluate instead of porting subsystems.

## 25. Definition of done

The second wave is complete only when all seven capabilities meet these conditions:

1. multi-project structural queries are request-scoped and no longer fixed to Agent Core root;
2. branch/ref/worktree context is correctly routed and freshness-aware;
3. residual repairs are listable and explicitly applicable through provider validation;
4. architectural fitness can be checked without becoming an execution gate;
5. structural code review is part of the controller protocol with source verification;
6. graph-quality calibration can bound trust using independent source evidence;
7. diagnostics/quarantine state is visible without adopting standalone Grafel install semantics.

And globally:

- normal machine-control tools remain direct;
- Memory/Reflexion/Patterns/Repair/Fitness remain separate authorities;
- no new database is introduced;
- no external AI-host configuration is modified;
- protected paths remain protected;
- source remains final authority;
- first-wave Code Intelligence remains backward compatible;
- documentation matches implemented reality;
- no item is marked complete without evidence.

## 26. Recommended implementation order

~~~
provider capability census
        ↓
workspace context abstraction
        ↓
code_workspace
        ↓
ref/worktree routing
        ↓
code_repair
        ↓
fitness analysis
        ↓
review protocol
        ↓
graph-quality calibration
        ↓
diagnostics/quarantine
        ↓
authorized acceptance
        ↓
activation + documentation
~~~

This ordering maximizes reuse and keeps risk localized: workspace/ref correctness becomes the foundation before any mutating graph repair or workspace-specific architecture evaluation is exposed.

## 27. Historical completion decision

**This second-wave scope was implemented and targeted-verified. No second-wave implementation task remains open.**

The document is retained as historical design/evidence. Any newly discovered Grafel mechanism from the 2026-09-20 source-first re-grounding belongs to `Grafel-Post-v0.3.3-Exhaustive-Steal-Use-Plan.md` and requires fresh user review before implementation.
