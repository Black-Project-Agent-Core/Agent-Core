# Serena Second-Wave LSP Freshness + Multi-Language Integration Plan — Agent Core

> **Status:** COMPLETE — VERIFIED FOR APPROVED SCOPE — LIVE-ACTIVATED — REFERENCE RETIRED
> **Implemented baseline:** COMPLETE — VERIFIED FOR FULL SELECTED SECOND-WAVE SCOPE; the user approved both 2026-09-20 residual proposals, S3-P1/S3-P2 are implemented and live-accepted, and the final zero-value/dependency census retired `Audit\Serena`.
> **Created:** 2026-09-19; source-first re-grounding refreshed 2026-09-20
> **Current stable Agent Core:** 0.11.0
> **Grounded reference:** `Audit\Serena`
> **Reference HEAD:** `2a6deef83861d61f839ab4b94f1fc323b2fe8edf`
> **Last MIT application cutoff:** `74c38a65f03fc0764d7ee4b3016ef6a07572ed64`
> **License boundary:** current Serena application = GPL-3.0-or-later; `src\solidlsp` = MIT.
> **Primary goal:** present an exhaustively source-grounded proposal set for selectively absorbing remaining high-value Serena/SolidLSP mechanisms into existing Agent Core subsystems without importing the Serena runtime.
> **Retirement goal:** retain `Audit\Serena` through user proposal review, then delete it only after every selected/rejected disposition is closed and a final zero-value/dependency census finds no unique remaining mechanism.

## 1. Objective

Agent Core already ships a verified Semantic IDE/LSP sibling with:
- `code_symbol`;
- `code_refactor`;
- semantic rename/safe-delete/range edits;
- transactional rollback/fingerprint protection;
- provider restart-on-confirmed-exit;
- generic extension-based language-server routing;
- Grafel synchronization after semantic mutation.

This second wave targets what is still missing, not a rewrite of first wave.

## 2. Remaining capability census

The 2026-09-19 re-grounding identified two **required adoption targets**.

### 2.1 Required A — workspace-wide external-file freshness

Serena's `LanguageServerFileChangeNotifier` maintains an mtime snapshot of source files and, before symbolic work, detects:
- created files;
- changed files;
- deleted files.

It sends LSP `workspace/didChangeWatchedFiles` notifications.
For newly created files it can additionally perform an open/close refresh so language servers that do not fully bind new files from watched-file notification alone update cross-file references.

Agent Core currently:
- hashes/resyncs a file when that file is explicitly opened through `ensureDocument`;
- resyncs files changed through Agent Core semantic mutation;
- does **not** scan the workspace for external changes made by normal machine-control tools, another editor, Git checkout, or another process.

This gap can make a warm LSP process answer from stale cross-file state.

### 2.2 Required B — Agent Core-owned provider registry/discovery

Agent Core routing is already language-generic, but the built-in default provider is TypeScript/JavaScript.
Extra language servers currently require explicit `servers.json` definitions.

MIT `src\solidlsp` contains reusable provider ideas:
- language/server identifiers;
- source-extension matching;
- provider priority;
- external-provider contract;
- project-isolated extension configuration;
- discovery/configuration patterns for many language servers.The second wave will steal the **registry/discovery model and MIT-safe provider metadata concepts**, not the SolidLSP Python runtime.

Initial built-in/provider targets should cover the languages most relevant to Agent Core engineering:
1. TypeScript / JavaScript — existing implementation, must remain unchanged;
2. C# — launcher/source ecosystem;
3. PowerShell — Windows automation ecosystem;
4. Python — common local tooling/provider ecosystem.

The registry architecture must remain extensible to additional languages without another public MCP tool.

## 3. Additional Serena mechanisms reviewed

### 3.1 Conditional — multi-root LSP workspace folders

Serena can attach additional workspace folders to one language-server project.
Agent Core already has `CodeWorkspaceRecord.repos` and request-scoped `code_workspace` identity.

This is useful only if it can reuse that existing workspace authority cleanly.
It must **not** create a Serena-style second project registry.

Decision: **CONDITIONAL ADOPT**.
It may be implemented in this plan if the existing Code Intelligence service exposes registered repo roots without new cross-subsystem ownership ambiguity.
Otherwise document the rejection and do not block completion.

### 3.2 Already covered / no longer valuable

- External-project identity -> existing `code_workspace`.
- Progressive result shortening -> existing Semantic IDE `bounded()/boundedSymbols()`.
- Provider restart after confirmed exit -> existing bounded `withRecovery`.
- Semantic rename/safe-delete/range editing -> already implemented.
- Symbol/declaration/reference/implementation/diagnostics -> already implemented.
- Workspace/ref/worktree safety -> already implemented.
- Grafel structural graph/impact/patterns -> stronger existing sibling.

### 3.3 Explicitly not adopted

Do not integrate:
- Serena full MCP server/runtime;
- current GPL `src\serena` application source;
- full SolidLSP Python runtime;
- Serena MemoryManager or project/global memory directories;
- `mem:` textual memory-reference system as a second relationship authority;
- Serena onboarding writes into a parallel memory store;
- Serena REPL;
- Serena dashboard/GUI;
- generic Serena shell/file/search tools;
- dynamic tool/capability gating as an execution permission layer;
- autonomous Serena agent/task-executor framework;
- JetBrains plugin dependency;
- silent language-server downloads/installations;
- automatic broad build/test/lint after refactoring.

Serena onboarding and context/mode prompts remain **optional workflow inspiration only**, not root backlog.
Agent Core already has AGENTS.md, Memory, Learning, Grafel, request-scoped workspaces, and direct controller authority.

## 4. Target architecture

```text
AI / Controller
      |
      v
Agent Core MCP
      |
      +-- code_symbol
      +-- code_refactor
             |
             v
      SemanticIdeService
        |            |
        |            +--> ProviderRegistry / ProviderResolver
        |                     |
        |                     +-- TypeScript/JavaScript
        |                     +-- C#
        |                     +-- PowerShell
        |                     +-- Python
        |                     +-- explicit servers.json
        |
        +--> WorkspaceFreshnessCoordinator
                      |
                      +-- bounded source snapshot
                      +-- created/changed/deleted diff
                      +-- didChangeWatchedFiles
                      +-- created-file bind refresh
```

No new MCP facade is required.

## 5. Architectural invariants

1. Exact filesystem source remains final authority.
2. Semantic IDE remains a sibling capability, never an execution gate.
3. Grafel remains structural/graph/pattern authority.
4. Memory remains durable-knowledge authority.
5. `code_workspace` remains workspace identity authority.
6. Provider state is derived/restartable state under `runtime\semantic-ide`.
7. No default Python requirement is introduced.
8. No provider may auto-install/download itself in this approved wave.
9. Provider failure must fail soft to normal search/read/manual editing.
10. Existing `code_symbol` / `code_refactor` schemas remain backward compatible.
11. Public production tool count remains unchanged at 62 unless another independent feature changes it first.
12. Protected paths remain denied unless a separate explicit authorization exists.

## 6. Proposed source ownership

Expected additions/changes, minimized where possible:

```text
src\semantic-ide\
  freshness.ts              # new: bounded external-change snapshot/diff
  provider-registry.ts      # new: Agent Core-owned provider descriptors/resolution
  language-server.ts        # extend notifications + one-shot created-file refresh
  service.ts                # freshness preflight + provider resolution
  types.ts                  # optional health/provider/freshness fields

src\config.ts              # only if new provider/freshness config is required
.env.example                # document non-secret optional provider settings

tests\
  semantic-ide-freshness.test.ts
  semantic-ide-provider-registry.test.ts
  existing semantic-ide-* regression files
```

Do not create `src/serena`, `src/solidlsp`, a provider daemon, a second workspace service, or a new MCP tool family.

## 7. Phase 0 — baseline, source map, license boundary

Before implementation:
- view canonical Agent Core memory;
- verify `code_orient(status)` index is current;
- record current `/health.semanticIde`;
- record current 62-tool MCP server contract;
- record current release plan/check-intent;
- verify Serena checkout HEAD + clean working tree;
- verify relevant mechanisms exist at the MIT cutoff;
- create a scoped backup of files that will be changed.

Create one capability source map with:
- Serena current file;
- MIT-cutoff equivalent file;
- Agent Core destination;
- adoption method: behavior rewrite / metadata adaptation / rejected.

No GPL application code may be copied into active Agent Core source.

Exit:
- license/source boundaries explicit;
- implementation points confirmed against current source;
- no runtime mutation yet.

## 8. Phase 1 — WorkspaceFreshnessCoordinator

Implement a small Agent Core-owned coordinator.

State is keyed by concrete workspace/worktree root plus provider identity.

Per snapshot retain only bounded metadata required for freshness:
- normalized relative path;
- mtime / size or a similarly cheap fingerprint;
- provider/language match.

First scan establishes baseline and sends no notifications.

Subsequent scan calculates:
- Created;
- Changed;
- Deleted.

No transcript, source body, credential, or learned knowledge is persisted by the coordinator.

### 8.1 File-discovery boundary

Scan only source files matching configured provider extensions.

Hard-ignore at minimum:
- `.git`;
- `node_modules`;
- `dist`;
- `bin`;
- `obj`;
- `runtime`;
- `release`;
- protected `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT`;
- other existing derived/build directories already excluded by Agent Core architecture.

Prefer existing project ignore knowledge when safely reusable, but freshness correctness must not depend on Grafel availability.

Add hard bounds:
- maximum files scanned;
- maximum emitted events;
- maximum scan duration or deterministic timeout;
- bounded error detail.

If a workspace exceeds limits, return degraded freshness evidence rather than silently claiming current state.

### 8.2 Invocation policy

Do **not** create an always-running watcher daemon.

Preferred behavior:
- on-demand freshness preflight before symbol operations that depend on cross-file state;
- before semantic refactor planning;
- explicit `code_symbol(status)` may report freshness state without forcing expensive mutation;
- avoid duplicate rescans inside one logical operation.

This keeps the feature deterministic and portable.

## 9. Phase 2 — LSP watched-file synchronization

Extend existing `LanguageServerSession` with narrow notifications:
- `workspace/didChangeWatchedFiles`;
- one-shot open/close refresh for created files when needed;
- close/reconcile an already-open document that was deleted externally.

Do not expose raw LSP methods publicly.

For changed files already open in the session:
- reuse current hash-aware `ensureDocument` / `didChange` behavior;
- avoid duplicate conflicting version increments.

For files changed outside the session:
- send watched-file notification;
- let the next explicit document access re-read canonical filesystem content.

### 9.1 Failure behavior

Freshness notification failure:
- records a Semantic IDE issue;
- may mark semantic freshness degraded;
- does not make top-level Execution unavailable;
- does not make Memory/Grafel unavailable;
- does not block machine-control tools.

A terminated language server continues to use existing bounded one-restart recovery.
Do not add another retry loop.

## 10. Phase 3 — ProviderRegistry

Create a provider-neutral Agent Core registry.

Proposed descriptor:

```text
id
languages[]
extensions[]
languageIds{}
priority
discovery[]
args
initializationOptions?
capabilities/notes?
source = builtin | explicit
```

Resolution priority:
1. explicit `servers.json` user definition;
2. project-local approved binary/package;
3. known system command already present;
4. not-configured.

No network lookup or install in resolution.

Existing TypeScript configuration remains the known-good default and should be represented by the same registry contract after migration.

### 10.1 Initial built-in provider descriptors

First implementation target:
- TypeScript / JavaScript;
- C#;
- PowerShell;
- Python.

A provider may be listed as known but unavailable.
Known != installed.
Unavailable providers must not degrade unrelated configured languages.

### 10.2 Discovery rules

Discovery must be deterministic and Windows/portable friendly:
- project-relative candidates first where applicable;
- project-local runtime/tool locations when explicitly owned by Agent Core;
- system PATH only as read-only discovery;
- optional explicit environment/config override;
- never hardcode drive `F:`;
- never mutate system PATH;
- never install into AppData/system locations.

Commands from explicit user config remain allowed subject to current Semantic IDE validation and path/workspace safety.

### 10.3 SolidLSP usage boundary

Do not import Python SolidLSP.

Permitted steal/use forms:
- reproduce MIT behavioral concepts;
- adapt provider identifiers/extensions/discovery metadata;
- copy small MIT data/code fragments only when materially useful and with required notice/attribution.

If substantial MIT material is copied:
- retain license/notice in the appropriate source or third-party notice surface.

## 11. Phase 4 — conditional multi-root workspace folders

Evaluate whether existing `CodeWorkspaceRecord.repos` can be exposed to Semantic IDE without creating ownership coupling.

If clean:
- initialize LSP `workspaceFolders` with the concrete primary root plus existing registered repo roots;
- keep one Agent Core workspace identity;
- require every folder to pass protected-path and concrete-path validation;
- keep ref/worktree rules unchanged.

If not clean:
- explicitly record **REJECTED FOR THIS WAVE**;
- continue with single-root LSP sessions;
- do not add a parallel Serena project registry.

This phase is not allowed to block the two required adoption targets.

## 12. Phase 5 — health and observability

Extend Semantic IDE health only with backward-compatible optional fields, for example:
- freshness: current | degraded | unknown;
- lastFreshnessScanAt;
- filesObserved;
- eventsLastSync;
- configuredProviders[];
- availableProviders[];
- unavailableProviders[].

Do not expose sensitive command arguments/environment secrets.

Activity Tracker should receive only major boundaries:
- freshness degraded/recovered;
- provider discovered/unavailable;
- provider restart;
- bounded sync failure.

Do not log every scanned file.

## 13. Phase 6 — MCP/controller contract

No new public tools.

`code_symbol` keeps actions:
- status;
- overview;
- find;
- references;
- declaration;
- implementations;
- diagnostics;
- restart_server.

`code_refactor` keeps its existing mutation actions.

Update descriptions/controller instructions only after implementation exists:
- LSP freshness is automatically synchronized before relevant semantic operations;
- explicit provider configuration takes precedence over built-in discovery;
- unavailable language provider fails soft;
- no implicit installation;
- source remains final authority;
- Grafel remains complementary structural evidence.

Do not turn provider selection into an AI routing gate.

## 14. Phase 7 — targeted verification

Verification is targeted to affected behavior, not broad unrelated regression.

### Freshness gates

1. Existing TypeScript semantic smoke still succeeds.
2. First freshness scan establishes baseline with zero notifications.
3. External modification of an existing source file produces Changed.
4. External creation produces Created.
5. External deletion produces Deleted.
6. Watched-file notifications use correct file URI + LSP change type.
7. New-file bind refresh makes the fake/real LSP observe the created file.
8. Open-document changes do not produce conflicting duplicate document versions.
9. Protected/derived directories are excluded.
10. Scan limit/timeout produces truthful degraded status.
11. Freshness failure does not block normal machine control.
12. Provider restart recovery remains bounded to one replacement attempt.

### Provider registry gates

13. TypeScript resolves exactly as before.
14. Explicit `servers.json` overrides a built-in descriptor with the same provider/language identity.
15. C# descriptor can resolve a configured fixture/known command without installation.
16. PowerShell descriptor can resolve a configured fixture/known command without installation.
17. Python descriptor can resolve a configured fixture/known command without installation.
18. Missing provider returns handled not-configured/unavailable evidence.
19. Unsupported extension never falls through to the wrong server.
20. Provider discovery performs no network/download/install.
21. No drive-letter hardcode is introduced.
22. Per-project/provider extension configuration cannot leak into another workspace instance.
23. Multi-language routing tests still keep servers isolated by file type.
24. Existing provider crash/restart tests remain PASS.

### Architecture/regression gates

25. `code_symbol` + `code_refactor` remain the only Semantic IDE MCP facades.
26. Server-side production tool count remains unchanged from the then-current contract.
27. Existing semantic transaction/rollback/source-drift tests PASS.
28. Existing Grafel post-refactor dirty/reindex behavior PASS.
29. Direct machine-control call still bypasses Semantic IDE.
30. Memory/Learning/Partner health remains independent.
31. Active source contains no Serena GPL runtime import/dependency.
32. Active runtime does not require Python for Semantic IDE.
33. Protected Serena checkout remains clean throughout implementation.
34. Release-intent check is healthy.

Conditional workspace-folder tests are added only if Phase 4 is implemented.

## 15. Phase 8 — final Serena capability census

After all required gates PASS, re-ground the protected Serena checkout **one final time**.

Classify every remaining major Serena mechanism as exactly one:
- integrated;
- already-covered by a stronger Agent Core subsystem;
- explicitly rejected with reason;
- intentionally out-of-scope and preserved elsewhere as sufficient reference.

The final census must specifically revisit:
- current symbolic/refactor/LSP lifecycle;
- SolidLSP provider catalog/discovery;
- file freshness synchronization;
- project/workspace folders;
- memory/reference maintenance;
- onboarding;
- context/mode profiles;
- REPL/dashboard;
- generic file/shell tools;
- JetBrains/client surfaces;
- task executor/agent framework;
- output shortening/budgeting.

## 16. Phase 9 — Serena retirement gate

Only when Phase 8 finds **no approved unique mechanism worth retaining** may the checkout be treated as corpse.

Retirement prerequisites:
1. required freshness mechanism integrated + verified;
2. provider registry/discovery mechanism integrated + verified;
3. any conditional workspace-folder decision explicitly documented;
4. all other mechanisms classified integrated/covered/rejected;
5. source map records Serena origin, current HEAD, MIT cutoff, and license boundary;
6. no active Agent Core source imports the checkout;
7. no tests/scripts/runtime depend on the checkout path;
8. checkout is Git-clean immediately before deletion;
9. CODEBASE and durable Semantic IDE memory contain enough provenance to continue without the checkout.

Then delete only:
```text
<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\serena
```

After deletion:
- verify path is absent;
- scan active docs/source for stale statements saying the checkout still exists;
- change CODEBASE wording to **former protected Serena checkout retired**;
- update durable Semantic IDE memory to retired-reference state;
- do not create a hidden replacement copy elsewhere.

If any retirement prerequisite fails, do **not** delete the checkout.

## 17. Release/version integrity

Creating/reviewing this plan is docs-only:
- no changeset required for this planning turn.

When implementation starts:
- create exactly one **minor** Agent Core release intent for the combined Semantic IDE second-wave capability;
- summary should describe freshness + multi-language provider support, not research history;
- actual next version must be calculated from then-current release state;
- do not run `release:apply` merely because implementation/tests finish;
- stable release remains separately user-authorized.

The protected Serena deletion itself does not require a second changeset if it occurs in the same completed integration task and changes no shipped behavior beyond the already-recorded capability intent.

## 18. Rollback boundary

Rollback must be surgical.

Likely rollback set:
- `src\semantic-ide\freshness.ts`;
- `src\semantic-ide\provider-registry.ts`;
- focused edits in existing Semantic IDE files;
- related tests/config/docs.

Rollback must not:
- alter canonical Memory records unrelated to this integration;
- reset Grafel provider state;
- reset repository-wide user changes;
- restore from legacy Git;
- remove current first-wave Semantic IDE;
- delete Serena unless the retirement gate passed before rollback.

Provider runtime cache/state remains derived and may be removed only when explicitly part of rollback.

## 19. Definition of done

Required implementation is complete only when:
- workspace-wide external changes are detected before relevant semantic operations;
- LSP receives bounded Created/Changed/Deleted synchronization;
- new external files can be bound into providers that need explicit parse/open refresh;
- freshness is bounded, observable, and fail-soft;
- provider registry/discovery is Agent Core-owned;
- TypeScript remains stable;
- C#/PowerShell/Python have deterministic no-install discovery/configuration paths;
- explicit provider config still works;
- no auto-download/install occurs;
- no current GPL Serena code is embedded;
- no Python runtime is required by default;
- public Semantic IDE facade remains compact;
- all required targeted gates have real PASS evidence;
- CODEBASE and durable memory reflect implemented truth;
- release intent exists;
- no hidden first-wave/second-wave task remains inside this plan.

Serena retirement is a **separate final gate inside the same plan**: implementation may be complete while retirement is blocked if useful reference material still remains.

## 20. Review decisions for the user

The user should review these design decisions before implementation:
1. adopt on-demand workspace freshness polling instead of an always-running watcher;
2. send standard LSP watched-file notifications + created-file bind refresh;
3. keep public MCP surface unchanged;
4. add Agent Core-owned provider registry rather than importing SolidLSP runtime;
5. initial built-in provider targets: TypeScript/JS, C#, PowerShell, Python;
6. no silent provider installation/download;
7. multi-root workspaceFolders is conditional, not mandatory;
8. one minor release intent for implementation;
9. final Serena deletion happens only after a post-implementation zero-value census.

## 21. Historical state at original second-wave proposal creation

```text
First-wave Semantic IDE       = COMPLETE / VERIFIED
Serena reference              = RETAINED / CLEAN AT THAT CHECKPOINT
Second-wave freshness         = THEN PROPOSED / LATER IMPLEMENTED + VERIFIED
Multi-language provider layer = THEN PROPOSED / LATER IMPLEMENTED + VERIFIED
Serena retirement             = LATER COMPLETED FOR THE HISTORICAL PROTECTED CHECKOUT
```

This block is historical evidence, not active backlog. The document header and Sections 31–35 contain the current implemented baseline plus the 2026-09-20 re-grounded proposal-only state.

## 22. Authoritative source-grounding revision — 2026-09-19

> **This section and the proposal catalog below supersede any narrower assumption in earlier sections when there is a conflict.**
>
> No proposal in this section is approved merely because it is recommended. Implementation remains blocked until the user explicitly selects proposals.

### 22.1 Evidence basis

This revision was grounded primarily from current source and tests, not Serena documentation.

Directly inspected/audited surfaces:

- current Serena HEAD: `2a6deef83861d61f839ab4b94f1fc323b2fe8edf`;
- last MIT application cutoff: `74c38a65f03fc0764d7ee4b3016ef6a07572ed64`;
- `src\serena`: 70 tracked Python source files;
- `src\solidlsp`: 96 tracked Python source files;
- `test\serena`: 42 tracked Python test files;
- `test\solidlsp`: 209 tracked Python test files;
- extracted test-function census: 1,779 test functions;
- MIT-cutoff -> current-HEAD source/test diff: 195 changed entries, including 26 additions and 168 modifications, with no deleted entries observed in the scoped diff;
- temporary Grafel structural audit: 988 files / 14,475 entities / 87,156 relationships, 14 flows, 8 endpoints.

The Grafel index was used only as a structural lens. Exact current Serena source and exact current Agent Core source remain authoritative.

### 22.2 License classification rule

Every proposal is classified by provenance:

- **MIT-SAFE SOURCE REFERENCE** — the relevant mechanism is present in `src\solidlsp` MIT source or was confirmed present at the last MIT application cutoff;
- **CLEAN-ROOM BEHAVIOR ONLY** — useful behavior exists only or materially evolved in current GPL Serena application source; Agent Core may independently implement the behavior from requirements/evidence but must not copy GPL implementation;
- **AGENT CORE-NATIVE HARDENING** — a gap discovered while comparing systems, but not claimed as a Serena mechanism.

Current GPL `src\serena` remains reference-only.
No Python Serena/SolidLSP runtime is proposed as an Agent Core dependency.

### 22.3 Selection contract

Before implementation, the user should mark each proposal as one of:

```text
APPROVE
APPROVE-LATER
REJECT
DEFER
NEEDS-DISCUSSION
```

Only APPROVE items enter implementation scope.

A proposal marked REJECT is still retained in this plan as audit evidence so a future controller does not repeatedly rediscover it.

No dependency installation, provider installation, source mutation, stable release application, or Serena deletion is authorized by this plan.

## 23. Recommended core proposal catalog

### P01 — Workspace-wide external-file freshness synchronization
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source evidence:
- `src\serena\ls_manager.py::LanguageServerFileChangeNotifier`;
- present at the last MIT application cutoff;
- tests include `test\serena\test_ls_file_sync.py` and `test\solidlsp\test_nextflow_workspace_scan_flush.py`.

Observed mechanism:
- bounded workspace source snapshot;
- Created / Changed / Deleted detection;
- `workspace/didChangeWatchedFiles`;
- explicit open/close bind refresh for newly-created files when a provider otherwise fails to add them to cross-file analysis.

Agent Core gap:
- current `LanguageServerSession.ensureDocument()` refreshes only explicitly touched files;
- edits made by normal filesystem tools, another editor/process, or Git can leave a warm language server's cross-file index stale.

Agent Core adaptation:
- on-demand `WorkspaceFreshnessCoordinator`, not a permanent watcher daemon;
- one scan per logical semantic operation;
- provider-extension filtering + hard ignore boundaries;
- first scan establishes baseline;
- bounded files/events/time;
- freshness degradation is observable and fail-soft.

### P02 — Provider registry + deterministic discovery
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source evidence:
- `src\solidlsp\ls_config.py`: `LanguageServerIdLike`, `LanguageServerRegistry`, `FilenameMatcher`, priorities and extension matching;
- provider modules under `src\solidlsp\language_servers`;
- project composition mechanism confirmed in source and present at MIT cutoff.

Agent Core gap:
- provider contract is generic, but built-in real provider is TypeScript/JavaScript;
- additional providers require hand-authored `servers.json`;
- first matching extension wins, with no provider priority or project-suitability signal.

Agent Core adaptation:
- Agent Core-owned typed registry;
- explicit `servers.json` remains highest priority;
- project-local owned provider -> known system executable -> unavailable;
- no network/install during discovery;
- descriptor priority and extension matching;
- reset/isolate mutable extension configuration per workspace so one project cannot leak provider matching state into another.

Initial provider descriptors proposed:
1. TypeScript/JavaScript;
2. C#;
3. PowerShell;
4. Python.

### P03 — Provider adapter hooks
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Direct source evidence shows providers need different startup and callback behavior:
- C#: `workspace/configuration`, work progress, project-initialization-complete, Roslyn-specific requests;
- PowerShell Editor Services: dynamic capability registration and readiness signals;
- Pyright: log/progress/quiescent readiness signals;
- TypeScript: `$/typescriptVersion`, progress tokens, abnormal tsserver-exit evidence.

Agent Core gap:
- current server-request handler is generic: `workspace/configuration -> null[]`, several known methods -> null;
- no typed provider-specific initialization/readiness/fatal-signal contract.

Adaptation:
- typed built-in provider adapter interface, never arbitrary callback code from JSON;
- hooks may define:
  - initialization options;
  - deterministic `workspace/configuration` responses;
  - required/optional capabilities;
  - notification observers;
  - provider readiness evidence;
  - fatal-child evidence;
  - provider-specific environment overrides;
  - post-initialize steps.
- explicit external config remains data-only.

### P04 — Provider readiness / indexing truth
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source/tests:
- `test\solidlsp\test_typescript_timeout_policy.py`;
- TypeScript, C#, PowerShell and Pyright provider implementations.

Problem:
- successful LSP `initialize` does not necessarily mean workspace indexing is complete;
- querying references too early can return incomplete results.

Adaptation:
- distinguish `process-running`, `initialized`, `indexing`, `ready`, `degraded`;
- wait only where a provider adapter has real readiness evidence;
- provider-specific bounded timeout;
- timeout returns truthful degraded/unknown readiness, not false PASS;
- unrelated providers and normal Agent Core tools remain available.

### P05 — LSP process-tree containment and startup cleanup
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source evidence:
- `src\solidlsp\util\subprocess_util.py` managed process-tree termination;
- tests: process-group cleanup, PDEATHSIG, language-server startup cleanup.

Agent Core gap:
- current close path kills only the top child PID after timeout;
- wrapper providers can spawn descendants such as tsserver/PSES which may survive the wrapper.

Adaptation:
- Agent Core-owned process lifetime manager;
- Windows implementation should prefer a native/process-tree mechanism without introducing Python/psutil as a runtime dependency;
- graceful tree termination -> bounded wait -> kill fallback;
- startup failures must clean partially-started descendants;
- never touch unrelated processes.

### P06 — Selective LSP ContentModified retry
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source/tests:
- SolidLSP request retry logic;
- `test\solidlsp\test_content_modified_retry.py`.

Mechanism:
- retry error `-32801 ContentModified` only for methods that the client declared under `general.staleRequestSupport.retryOnContentModified`;
- bounded attempts;
- no retry for arbitrary provider errors or cancelled requests.

Adaptation:
- explicit allowlist derived from advertised client capability;
- hard max attempts + bounded delay;
- no controller-level retry loop;
- provider termination remains handled by the existing one-restart recovery path.

### P07 — Symlink-safe atomic semantic writes
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE + Agent Core stricter safety adaptation

Source evidence:
- `src\serena\util\file_system.py::write_file_atomic`, present at MIT cutoff;
- tests include atomic-write interruption, symlink write-through, permission preservation, encoding/newline behavior, and Windows replace failures.

Agent Core gap:
- current transaction temp+rename can replace a symlink itself with a regular file;
- lexical in-workspace checks do not prove the symlink target remains inside the authorized workspace.

Adaptation must be stricter than Serena:
- resolve the actual target before mutation;
- if real target escapes authorized workspace/worktree or enters a protected path -> refuse;
- if target remains authorized -> atomically write the real target while preserving the symlink;
- preserve mode where applicable;
- keep existing EOL preservation;
- bounded Windows sharing/replace retry;
- never downgrade to non-atomic overwrite;
- cleanup temporary files on every failure.

### P08 — Ignore/Gitignore semantics shared by freshness and result filtering
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source/tests:
- Serena file-system Gitignore parser at MIT cutoff;
- extensive current tests for root/subdirectory rules, negation, globbing, escaped characters, missing paths and permission errors.

Adaptation:
- hard exclusions remain Agent Core-owned first;
- in Git workspaces prefer local read-only Git plumbing such as `git check-ignore` against the current worktree; never contact legacy remote;
- provider-specific ignored directory names may augment the hard list;
- missing/deleted paths must not fail freshness reconciliation;
- use the same filtering policy for:
  - freshness scans;
  - LSP-returned locations;
  - language composition.

Do not create an independent second ignore authority when existing workspace/Git evidence can answer the question.

### P09 — Diagnostics freshness generation + Windows file-URI canonicalization
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source evidence:
- SolidLSP tracks a monotonically increasing published-diagnostics generation per file;
- canonicalizes equivalent Windows URI forms such as `file:///c%3A/...`, `file:///c:/...`, `file:///C:/...`.

Agent Core gap:
- diagnostics are keyed by exact URI string;
- explicit diagnostics may reuse stale published state;
- equivalent Windows URI spellings can miss the cache.

Adaptation:
- canonical file-URI key;
- generation counter per document;
- explicit diagnostics request can wait for a post-change generation up to the existing bounded call timeout;
- if provider cannot produce fresh diagnostics, report stale/timeout truthfully;
- keep automatic diagnostics-after-every-edit disabled.

### P10 — Overload-aware symbol identity and name-path matching
**Recommendation:** APPROVE for multi-language wave  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source evidence:
- SolidLSP adds `overload_idx` when siblings have identical normalized names;
- Serena `NamePathMatcher` supports simple names, relative suffixes, absolute paths and `method[i]`.

Agent Core gap:
- current `namePath` does not distinguish overloaded siblings;
- enabling C#/Java-style providers can make exact symbol resolution ambiguous.

Adaptation:
- normalize provider symbol name first;
- count duplicates among siblings;
- append stable zero-based `[i]` only when needed;
- preserve existing names for non-overloaded symbols;
- support exact absolute path and relative suffix matching;
- optionally add kind filters and last-segment substring matching as bounded query refinements.

### P11 — Provider symbol-normalization hooks
**Recommendation:** APPROVE for selected providers  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Example source evidence:
- C# Roslyn provider receives names such as `Add(int, int) : int`;
- Serena normalizes to `Add` while preserving the signature/type in detail/hover information.

Adaptation:
- provider adapter can normalize raw symbol names/details before overload counting;
- only implement normalization required by selected built-in providers;
- every normalization recipe needs a provider-specific regression fixture;
- never apply heuristic normalization globally across all languages.

### P12 — Implement existing includeInfo contract with bounded hover enrichment
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Agent Core fact:
- `SemanticSymbolQuery.includeInfo` already exists but current `service.ts` does not use it.

Serena evidence:
- batch symbol information/hover lookup with hard time budget exists at MIT cutoff;
- tests verify full, partial and unlimited-budget behavior.

Adaptation:
- use symbol selection range for `textDocument/hover`;
- group work by provider/session;
- total operation/time budget, not unbounded N requests;
- partial info is valid and marked truncated/incomplete;
- no new public MCP tool.

### P13 — Safe LSP location filtering
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

SolidLSP location normalization:
- accepts normal Location and LocationLink;
- skips paths outside the repository;
- skips nonexistent generated locations;
- skips ignored paths.

Agent Core gap:
- current location normalization can return `..\outside` relative paths for external URIs and does not verify existence/ignore status.

Adaptation:
- define authorized roots: primary concrete workspace plus separately approved additional workspace folders;
- by default drop outside-root, protected, ignored and nonexistent locations;
- return dropped-location counts/reasons in bounded metadata;
- do not automatically read/mutate dependencies outside authorized roots.

### P14 — Transactional WorkspaceEdit RenameFile
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source evidence:
- Serena code editor supports text edits and `documentChanges.kind == rename` at MIT cutoff.

Agent Core gap:
- current transaction handles text edits only.

Adaptation:
- support `RenameFile` only in this wave;
- validate old/new URI against workspace/protected/realpath rules;
- source fingerprint/existence;
- explicit destination-conflict semantics;
- rollback if any later operation fails;
- sync Semantic IDE freshness and Grafel after commit.

Keep CreateFile/DeleteFile resource operations unsupported unless separately selected with evidence.

### P15 — Externally-managed TCP LSP transport
**Recommendation:** IMPLEMENTED — FINAL DEFERRED WAVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source:
- SolidLSP `TCPLanguageServer` with bounded connect retry;
- external owner survives disconnect; client closes only its socket;
- broken socket fails pending requests and becomes recoverable state.

Use cases:
- Godot's built-in LSP and other already-running local IDE/server endpoints.

Adaptation:
- typed transport descriptor: `stdio-owned` vs `tcp-external`;
- TCP defaults to loopback only;
- no shutdown/exit of externally-owned process;
- no remote TCP without separate security review.

### P16 — LSP protocol interoperability hardening
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE + Agent Core comparison

Source/tests:
- protocol tests enforce void `shutdown` / `exit` without params;
- SolidLSP tolerates numeric-string response IDs;
- unknown request behavior follows JSON-RPC error semantics.

Agent Core gaps:
- shutdown/exit currently send `params:null`;
- dispatch accepts numeric IDs only;
- unknown server requests currently receive successful `null`.

Adaptation:
- support request/notification payloads with omitted params;
- use void shutdown/exit;
- normalize numeric-string response IDs safely;
- handler registry for known server requests;
- unknown server request -> JSON-RPC `-32601 Method not found`, not silent success.

Not a proposal:
- malformed JSON is already fail-soft in current Agent Core source;
- Serena runtime does not provide evidence of active `$/cancelRequest` timeout use, so cancellation is not claimed as a Serena steal/use item.

### P17 — Required/optional provider capability validation
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Provider sources explicitly inspect required capabilities after initialize.

Adaptation:
- provider descriptor declares required and optional capabilities;
- health exposes unsupported feature truth;
- action fails with precise `SEMANTIC_PROVIDER_CAPABILITY_UNAVAILABLE` rather than raw provider error;
- dynamic-registration providers may satisfy requirements during readiness phase;
- this is provider truth, not an execution permission gate.

### P18 — Deterministic client capabilities and no-background-network policy
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

TypeScript source evidence:
- disables Automatic Type Acquisition to prevent background npm fetches and nondeterministic startup.

Adaptation:
- TypeScript adapter sets `disableAutomaticTypingAcquisition=true`;
- advertise only client capabilities Agent Core actually supports;
- workDoneProgress/workspace configuration/watched-files capabilities enabled only when implemented;
- include Agent Core `clientInfo`;
- provider-specific background network auto-fetch should be disabled where the provider exposes such control.

This does not block normal project dependency usage already present on disk.

### P19 — Multi-root / additional workspace folders
**Recommendation:** IMPLEMENTED — FINAL DEFERRED WAVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source:
- initialize builder distinguishes indexed workspace folders from additional reference folders;
- tests cover workspace-folder effect on symbol tree;
- TypeScript contains extra-workspace activation/indexing behavior.

Agent Core decision rule:
- reuse existing `code_workspace` / `CodeWorkspaceRecord.repos`;
- never create a Serena-style project registry;
- every concrete folder passes protected-path/realpath/ref/worktree validation;
- provider adapter may need an activation/indexing trigger.

Final decision: current Code Intelligence exposes `CodeWorkspaceRecord.repos` cleanly. Agent Core-owned stdio providers may receive those authorized folders; external TCP and all ref/worktree contexts remain single-root.

### P20 — Encoding-safe source IO
**Recommendation:** APPROVE for multi-language correctness  
**Provenance:** MIT-SAFE SOURCE REFERENCE, adapted without Python charset dependency

Source:
- project/server config carries encoding;
- FileUtils can decode configured encoding and normalize newlines.

Agent Core gap:
- semantic source reads/writes assume UTF-8.

Adaptation:
- detect and preserve UTF-8 BOM / UTF-16LE BOM / UTF-16BE BOM;
- strict UTF-8 default;
- optional explicit workspace/provider encoding;
- refuse unsupported/ambiguous encoding instead of silently corrupting;
- keep current EOL preservation.

No new charset-detection dependency is required by default.

### P21 — Strict symbol-range validation
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Source:
- SolidLSP SymbolBody accepts the standard one-line-past-EOF/column-zero convention;
- rejects farther out-of-range coordinates instead of guessing.

Agent Core gap:
- read-side `offsetAt` clamps invalid far-past-EOF ranges to end-of-text.

Adaptation:
- validate provider ranges before body extraction and semantic edits;
- permit only valid coordinates plus the exact standard EOF convention;
- malformed provider range -> handled provider issue, not guessed body.

### P22 — Deterministic provider configuration request handling
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

Many provider sources pull settings through `workspace/configuration` or react to `workspace/didChangeConfiguration`.

Adaptation:
- provider adapter owns deterministic typed config responses;
- external JSON config remains data-only;
- default unknown configuration item -> explicit provider-defined null/empty response;
- no arbitrary executable callback loaded from config;
- do not expose secrets in health/logs.

### P23 — Fatal nested-provider signal detection
**Recommendation:** APPROVE  
**Provenance:** MIT-SAFE SOURCE REFERENCE

TypeScript source:
- language-server wrapper may remain alive while inner tsserver reports abnormal exit through `window/logMessage`;
- progress end alone is insufficient to distinguish a crash from successful indexing.

Agent Core gap:
- current recovery sees only wrapper process exit.

Adaptation:
- provider adapter may mark session fatal from narrowly-defined notification/log evidence;
- fatal state invalidates readiness;
- feed into the existing bounded one-replacement recovery;
- no repeated autonomous restart loop.

## 24. Optional / conditional proposal catalog

### P24 — Provider hot reload
**Recommendation:** IMPLEMENTED — FINAL DEFERRED WAVE

Serena can add/remove language servers dynamically.
Agent Core currently fixes descriptors at service initialization.

Implemented adaptation:
- explicit `code_symbol(action=reload_providers)` reloads the current provider set;
- version/compatibility probes run before acceptance;
- out-of-range providers reject the reload before replacing active definitions;
- changed/removed provider sessions are retired; unrelated sessions remain alive;
- no full Agent Core restart and no new MCP tool.

### P25 — Standard-LSP type hierarchy
**Recommendation:** IMPLEMENTED — FINAL DEFERRED WAVE

MIT protocol/request surface contains type-hierarchy requests.
Serena's richer active type-hierarchy UX is mainly visible through JetBrains integration.

Implemented provider-neutral extension:
- `code_symbol(action=type_hierarchy)`;
- prepare -> bounded supertypes/subtypes traversal;
- capability-gated, cycle-bounded and authorized-location filtered.

Do not bundle JetBrains plugin dependency.
Call hierarchy/code actions are not promoted here because source audit found protocol wrappers but insufficient evidence that they are an established Serena high-level mechanism needed by Agent Core.

### P26 — Explicit diagnostics delta around a refactor
**Recommendation:** IMPLEMENTED — FINAL DEFERRED WAVE
**Provenance:** CLEAN-ROOM BEHAVIOR ONLY

Current GPL Serena added diagnostics-delta helpers not present at the MIT cutoff.

Implemented behavior is an independent Agent Core implementation from the behavioral requirement/LSP interfaces; no Serena GPL code is copied:
- controller explicitly opts in with `verifyDiagnostics=true` on `code_refactor`;
- diagnostics are captured before and after the applied mutation;
- output reports introduced diagnostics, resolved count, freshness and partial issues;
- diagnostics remain evidence only: no automatic build/test/lint, no warning-triggered rollback, and no automatic diagnostics after every edit.

### P27 — Secure provider provisioning toolkit
**Recommendation:** HISTORICAL REJECT — SUPERSEDED BY 2026-09-20 `S3-P1` NARROW RE-GROUNDING PROPOSAL
**Provenance:** MIT-SAFE SOURCE REFERENCE

MIT SolidLSP has:
- pinned dependency versions;
- SHA-256 verification;
- allowed-host validation including redirect revalidation;
- temporary streaming downloads;
- platform-specific dependency descriptors;
- canonical archive-member containment in `FileUtils._validate_extraction_path`;
- ZIP/TAR extraction.

If later approved, Agent Core-native provisioning must:
- stay under project-owned isolated runtime;
- require pinned version and expected hash;
- use host allowlists;
- verify redirect destination host;
- validate every archive member before extraction;
- use atomic final placement;
- never install to global PATH/AppData/system directories.

Important audit note:
- do **not** copy the standalone `SafeZipExtractor` as a security primitive;
- the stronger source is verified download + `FileUtils._validate_extraction_path`.

### P28 — Provider version probes / compatibility ranges
**Recommendation:** IMPLEMENTED — FINAL DEFERRED WAVE

Providers can materially change behavior between versions.
Implemented optional descriptor support includes:
- bounded version command/probe;
- optional compatibility range;
- observed version and compatibility in health;
- out-of-range providers degrade health and are refused for use;
- explicit hot reload rejects out-of-range definitions before activation;
- probe failure is warning/degraded evidence, not an auto-upgrade trigger.

### P29 — Bounded/redacted LSP debug tracing
**Recommendation:** REJECT — FINAL FOR CURRENT ARCHITECTURE

Serena supports LSP communication tracing.
Raw protocol traces can contain source code and sensitive data.

If ever needed:
- explicit opt-in;
- redacted;
- bounded;
- stored only as transient operational evidence.

No default raw LSP trace.

### P30 — External MCP acceptance harness pattern
**Recommendation:** HISTORICAL ENGINEERING-ONLY REFERENCE — REOPENED AS OPTIONAL 2026-09-20 `S3-P2` PROPOSAL  
**Provenance:** CLEAN-ROOM BEHAVIOR ONLY

Source evidence:
- `scripts\live_test_grok.py` performs real external-client/MCP initialization, `tools/list`, `tools/call`, negative-path checks, evidence capture, private config backup, idempotency probes and scoped cleanup.
- Current Agent Core `scripts` tree has no equivalent reusable external MCP acceptance harness.

Potential Agent Core adaptation:
- a local, provider/client-neutral acceptance harness that can target a user-approved external MCP client;
- evidence written only under project-local transient/verification paths;
- private configuration backups kept project-local, permission-restricted where supported, and removed after the run;
- read-only handshake/tool-contract checks by default;
- mutating acceptance steps only when separately authorized;
- no autonomous scheduled verification and no replacement for user-controlled testing.

This is engineering support only. It does not change runtime behavior or authorize tests by itself.

### P31 — Provider-test partition / CI batching pattern
**Recommendation:** REJECT CURRENT ARCHITECTURE — NO CURRENT-LINE CI AUTHORITY  
**Provenance:** CLEAN-ROOM ENGINEERING PATTERN

Source evidence:
- `.github\workflows\pytest.yml` partitions language-server tests by marker/toolchain/OS rather than in-process xdist because provider processes, fixtures and on-disk resources can race;
- catch-all is derived as the negation of named groups;
- per-job timeout and provider/toolchain-specific caches bound CI cost and hung-process exposure.

Potential future Agent Core use:
- only if Agent Core establishes an authoritative current-line CI/release remote;
- partition provider tests by language/toolchain boundary;
- keep process-owning provider tests isolated from unsafe in-process parallelism;
- derive catch-all from named groups to avoid orphan tests;
- maintain hard timeout per provider batch.

Do not add GitHub CI now. Current local Agent Core is authoritative, the existing `legacy` remote remains reference-only, and the user controls test execution.

## 25. Agent Core-native prerequisites discovered during Serena grounding

These are not represented as Serena steal/use wins, but source comparison exposed them as necessary if selected proposals increase concurrency/provider breadth.

### N01 — Per-session startup single-flight
**Recommendation:** APPROVE as implementation prerequisite

Current flow stores a new `LanguageServerSession` before `await session.start()`.
Concurrent semantic requests can race into `start()`, which currently has no shared in-flight promise.

Add one startup promise per session:
- concurrent callers join the same startup;
- success clears the in-flight marker;
- failure clears state so a later explicit operation may retry according to existing recovery rules;
- never spawn duplicate provider children for the same workspace/provider key.

### N02 — Freshness-scan single-flight
**Recommendation:** APPROVE with P01

Concurrent symbol queries on the same workspace/provider should share one current freshness scan instead of duplicating a full tree walk.

### N03 — Provider-child environment boundary alignment
**Recommendation:** IMPLEMENTED — FINAL DEFERRED WAVE

Provider definitions may need small explicit environment overrides.
Do not broaden inheritance/sanitization semantics independently of the separate Agent Core provider-child environment-hardening work.

Implemented boundary:
- provider definitions may supply literal static non-secret environment overrides;
- secret-like keys, interpolation syntax and multiline values are rejected at descriptor load;
- environment values are not emitted in health/log output;
- general inherited-environment subtraction remains outside this plan and is not broadened here.

## 26. Covered / rejected mechanism census

The following were source-reviewed and are **not** hidden backlog.

| ID | Serena/SolidLSP surface | Classification | Reason |
| --- | --- | --- | --- |
| C01 | full Serena MCP/runtime | REJECT | duplicate runtime/agent layer; GPL current app; conflicts with Agent Core ownership |
| C02 | Python SolidLSP runtime | REJECT | Node-native Semantic IDE remains authoritative; no Python default dependency |
| C03 | Serena MemoryManager | REJECT | Agent Core Memory is canonical and materially stronger for durable semantic memory |
| C04 | textual `mem:` reference authority | COVERED/REJECT | Agent Core uses stable typed memory links + delete repair; text references must not become second authority |
| C05 | onboarding auto-memory | DEFER/REJECT DEFAULT | changes durable capture policy; existing controller + Learning/Memory already cover reviewed capture |
| C06 | context/mode tool gating | REJECT | may inspire prompts, but cannot become execution permission/routing gate |
| C07 | grep/read denial hooks | REJECT | violates direct-tool/controller contract; symbolic guidance stays advisory |
| C08 | Serena TaskExecutor/background queue | REJECT | unnecessary second scheduler; timed-out Python threads may continue anyway |
| C09 | REPL/session facade | REJECT | overlaps MCP/direct controller; post-MIT GPL application surface |
| C10 | dashboard/GUI | REJECT | unrelated duplicate UI |
| C11 | generic shell/file/search/edit APIs | COVERED | Agent Core machine-control layer already owns these |
| C12 | external project/project server | COVERED | `code_workspace` owns request-scoped multi-repo/worktree identity; Agent Core security/auth stronger |
| C13 | JetBrains plugin dependency | REJECT | external/paid/plugin-specific; provider-neutral LSP mechanisms only |
| C14 | JetBrains move/inline/inspection API | REJECT CURRENT WAVE | no provider-neutral proven equivalent required for current goal |
| C15 | project read-only capability gate | REJECT | user intent + workspace mutation guards remain authority |
| C16 | activation commands | REJECT | arbitrary project command execution at activation is unnecessary risk |
| C17 | automatic build/test/lint after refactor | REJECT | user controls verification |
| C18 | global Git configuration mutation | REJECT | outside scope and conflicts with Git boundary |
| C19 | fail-all-if-one-language-server-fails | REJECT | Agent Core providers must remain independent/fail-soft |
| C20 | eager startup of all configured providers | REJECT | Agent Core lazy sessions are more isolated/portable |
| C21 | persistent document-symbol disk cache | REJECT CURRENT WAVE | adds stale derived semantic index; freshness + live provider preferred, Grafel already owns structural derived graph |
| C22 | auto-download/install language servers | REJECT CURRENT WAVE | only P27 may revive this after explicit user approval |
| C23 | Python entry-point provider plugins | REJECT | typed registry + explicit data config sufficient |
| C24 | standalone SafeZipExtractor | REJECT AS SECURITY MODEL | verified FileUtils containment path is stronger |
| C25 | raw LSP trace by default | REJECT | source/privacy risk |
| C26 | `$/cancelRequest` timeout adoption | NOT EVIDENCED | protocol definitions exist, but audit did not establish active Serena runtime use as timeout mechanism |
| C27 | automatic formatting/blank-line heuristics after every edit | REJECT GENERICALLY | exact semantic edits remain safer; provider-specific behavior requires separate evidence |
| C28 | memory read-only/ignored subsets | DEFER | not needed for current memory authority |
| C29 | Serena REPL external-project remote execution | REJECT | overlaps existing workspace + direct machine control |
| C30 | automatic type acquisition | REJECT/INVERT | TypeScript adapter should explicitly disable background acquisition |
| C31 | token analytics/agent telemetry | COVERED/OUTSIDE | not part of Semantic IDE capability gap |
| C32 | generic model/agent orchestration | REJECT | Hermes Partner/Learning/controller architecture already owns collaboration/learning boundaries |
| C33 | `src/interprompt` multilingual Jinja prompt runtime | REJECT | current code is GPL; Agent Core uses AGENTS/controller contract and must not add dynamic prompt/tool-gating runtime |
| C34 | `repo_dir_sync.py` / `sync.py` destructive cross-repository copy/commit sync | REJECT | conflicts with current-line/legacy Git boundary and can delete/overwrite target trees |
| C35 | Serena `bump_version.py` + tag/release/publish workflows | COVERED/REJECT | Agent Core release intent/version tooling is already stronger and deliberately does not auto-commit/tag/push/publish |
| C36 | Docker/Nix/devcontainer packaging surfaces | OUTSIDE CURRENT ARCHITECTURE | Agent Core is Windows/local portable runtime; no new toolchain/packaging dependency requested |
| C37 | demo/print/profile helper scripts | COVERED/OUTSIDE | useful only as examples; no unique production mechanism beyond classified runtime capabilities |
| C38 | downloaded-dependency hash maintenance script | FOLDED INTO P27 | only relevant if user later approves secure provider provisioning |
| C39 | Serena `server.json` MCP registry packaging metadata | OUTSIDE | registry publication is not Agent Core runtime/release authority |
| C40 | Serena CI provider batching | FOLDED INTO P31 | retained only as optional future engineering pattern |

## 27. Revised implementation sequence after user proposal selection

The earlier fixed phase list is now converted into a **selection-driven implementation sequence**.

### Gate S0 — user scope freeze

Required before any implementation:
- user selects proposal IDs;
- unresolved NEEDS-DISCUSSION items are resolved;
- selected proposal dependencies are explicit;
- proposals not selected remain untouched.

No package/dependency/provider installation occurs at this gate.

### Gate S1 — exact source map + scoped backup

For selected items only:
- re-view canonical memory;
- require current Grafel index or continue with source-only evidence;
- map exact files/functions to change;
- create scoped backup;
- verify Serena reference HEAD/cleanliness;
- capture current Semantic IDE health/tool contract;
- create one release intent only once selected implementation becomes material.

### Gate S2 — protocol/lifecycle correctness

If selected:
- P05 process-tree containment;
- P06 ContentModified retry;
- P09 diagnostics URI/generation;
- P16 protocol interoperability;
- P17 capability truth;
- P21 strict range validation;
- P23 nested-provider fatal signals;
- N01 startup single-flight.

This gate should land before broadening provider count.

### Gate S3 — filesystem/source freshness correctness

If selected:
- P01 freshness coordinator;
- P07 realpath/symlink-safe atomic writes;
- P08 ignore semantics;
- P13 safe location filtering;
- P20 encoding-safe IO;
- N02 freshness single-flight.

### Gate S4 — provider registry + initial providers

If selected:
- P02 registry/discovery/composition/priority;
- P03 adapter hooks;
- P04 readiness/indexing truth;
- P11 symbol normalization;
- P17 provider capability contract;
- P18 deterministic client/network policy;
- P22 configuration requests;
- P23 fatal signal detection.

Initial provider implementations are only those explicitly approved by user.

### Gate S5 — semantic precision/mutation extensions

If selected:
- P10 overload-aware identity;
- P12 includeInfo hover enrichment;
- P14 RenameFile WorkspaceEdit;
- P19 multi-root folders;
- P15 TCP external transport.

### Gate S6 — optional later proposals

Only when separately selected:
- P24 hot reload;
- P25 type hierarchy;
- P26 diagnostic delta;
- P27 secure provisioning;
- P28 version probes;
- P29 trace (default recommendation remains reject);
- P30 external MCP acceptance harness (engineering-only);
- P31 provider-test/CI batching (only after a current-line CI authority exists).

### Gate S7 — targeted acceptance

Testing remains scoped to selected proposals plus necessary affected Semantic IDE regressions.

Do not convert this plan into permission for broad unrelated Agent Core regression tests.

### Gate S8 — final zero-value Serena census

After selected implementation is complete:
- rerun source/test-level Serena census;
- compare current Serena HEAD and the retained MIT cutoff;
- classify every remaining mechanism as integrated / covered / rejected / explicitly deferred;
- verify no active Agent Core code depends on the checkout.

### Gate S9 — Serena retirement decision

The folder may be deleted only if:
- all user-approved adoption work is complete and verified;
- every remaining mechanism has an explicit non-adopt rationale;
- no unresolved APPROVE-LATER / DEFER item still requires the local checkout as unique evidence;
- provenance is preserved in this plan + CODEBASE + durable memory;
- Serena Git is clean immediately before deletion.

Otherwise keep it.

## 28. Expanded targeted acceptance matrix

This matrix applies only to selected proposals.

### Lifecycle/protocol
1. concurrent first requests create one provider child only;
2. graceful close removes owned provider descendants;
3. forced close removes owned descendants without touching unrelated processes;
4. startup failure leaves no provider child/orphan;
5. ContentModified retry occurs only for declared methods and bounded attempts;
6. non-ContentModified provider error is not retried;
7. numeric-string response ID resolves the correct pending request;
8. void shutdown/exit wire shape is correct;
9. unknown server request returns MethodNotFound;
10. malformed provider JSON remains fail-soft as already implemented.

### Freshness/path/source
11. first freshness scan establishes baseline;
12. external create/change/delete each generate correct LSP watched-file event;
13. created-file bind refresh is provider-adapter controlled;
14. ignored/protected/derived files are never scanned into semantic state;
15. external edit to an already-open document is reconciled without duplicate version corruption;
16. symlink inside workspace to outside/protected target is refused for mutation;
17. allowed symlink write preserves the link;
18. interrupted write preserves original content;
19. file permissions/mode remain stable where supported;
20. Windows replace-sharing failure retries only within bound;
21. UTF-8 BOM / UTF-16 BOM round-trip preserves encoding;
22. invalid provider range is rejected rather than silently clamped.

### Diagnostics/location
23. equivalent Windows file URIs share one diagnostics key;
24. explicit diagnostics can prove post-change generation or report stale/timeout;
25. Location and LocationLink normalize correctly;
26. outside-root / protected / ignored / nonexistent provider locations are dropped;
27. dropped-location metadata is bounded.

### Symbols
28. unique legacy namePath remains unchanged;
29. overloaded siblings receive stable `[0]`, `[1]` identifiers;
30. exact absolute/relative name-path matching behaves deterministically;
31. provider normalization happens before overload indexing;
32. C# signature/detail survives name normalization;
33. includeInfo actually invokes bounded hover enrichment;
34. hover budget returns partial result without exceeding limit.

### Provider registry/readiness
35. explicit config overrides matching built-in descriptor;
36. provider extension state does not leak between workspaces;
37. language composition ignores unrecognized asset files in denominator;
38. provider tie breaks by explicit priority;
39. unsupported extension never routes to wrong provider;
40. unavailable provider does not degrade unrelated providers;
41. readiness state distinguishes initialized vs indexing vs ready;
42. TypeScript nested tsserver fatal evidence invalidates ready state;
43. TypeScript Automatic Type Acquisition remains disabled;
44. C#/PowerShell/Python adapter fixtures answer required server requests correctly;
45. required capability missing yields precise handled provider error;
46. no selected provider performs network install/download unless P27 was separately approved.

### WorkspaceEdit / transport
47. RenameFile dry run reports exact file operation without mutation;
48. applied RenameFile is path/protected/fingerprint/conflict validated and rollback-capable;
49. TCP external transport never sends shutdown/exit to external owner;
50. TCP connection failure degrades only that provider;
51. process-tree logic is never applied to external TCP-owned servers.

### Architecture
52. public Semantic IDE facade remains compact;
53. machine-control remains directly callable if every Semantic IDE provider is down;
54. Memory/Learning/Partner/Grafel remain sibling authorities;
55. no active source imports Serena GPL runtime;
56. no Python runtime becomes mandatory;
57. no hidden auto-installer is introduced;
58. CODEBASE describes implemented truth;
59. one release intent covers material selected second-wave behavior;
60. stable release remains separately user-authorized.

## 29. Grounding completeness verdict before user review

Based on the source/test/graph/non-runtime engineering census above, the remaining meaningful mechanisms have been reduced to the explicit proposal catalog P01–P31 plus Agent Core-native prerequisites N01–N03.

No additional source-level Serena subsystem found in the audited checkout currently warrants an unclassified adoption proposal.

This is **not** permission to install or implement any proposal.
The next step is user selection/rejection of the proposal IDs.

Current state:

```text
Serena source grounding       = COMPLETE
Plan proposal catalog         = AUTHORITATIVE
Approved core implementation  = COMPLETE / TARGETED VERIFIED
Optional/deferred proposals   = NOT IMPLEMENTED
Provider installation         = NOT REQUIRED; NO AUTO-INSTALL
Pending release intent        = 1 minor -> release plan 0.11.0
Stable release mutation       = NOT AUTHORIZED / NOT APPLIED
Serena deletion               = BLOCKED BY UNSELECTED/DEFERRED PROPOSALS
```

## 30. Approved core implementation result — 2026-09-19

### 30.1 Scope executed

The user approved implementation of the plan. The implementation followed the plan's selection contract already stated in this conversation: all proposals with recommendation `APPROVE` plus required Agent Core-native prerequisites N01/N02 were implemented. Items marked `APPROVE-LATER`, `DEFER`, `REJECT`, or `NEEDS-DISCUSSION` remain intentionally unimplemented.

Implemented proposal IDs:
- P01 workspace-wide external-file freshness synchronization;
- P02 provider registry + deterministic discovery;
- P03 typed provider adapter hooks;
- P04 provider readiness/indexing truth;
- P05 owned LSP process-tree containment + startup cleanup;
- P06 selective bounded `ContentModified` retry;
- P07 realpath/symlink-safe atomic semantic writes;
- P08 shared hard-ignore + local Git ignore semantics;
- P09 diagnostics generation + canonical Windows file-URI keys;
- P10 overload-aware symbol identity/name-path matching;
- P11 provider-specific symbol normalization;
- P12 bounded implementation of existing `includeInfo` via hover;
- P13 safe LSP location filtering;
- P14 transactional `WorkspaceEdit/RenameFile`;
- P16 protocol interoperability hardening;
- P17 required/optional capability truth;
- P18 deterministic client capabilities + TypeScript background ATA disabled;
- P20 encoding-safe source I/O;
- P21 strict provider range validation;
- P22 deterministic provider configuration request handling;
- P23 nested-provider fatal-signal detection;
- N01 per-session startup single-flight;
- N02 freshness-scan single-flight.

Not implemented by selection contract:
- P15 external TCP LSP transport;
- P19 multi-root/additional workspace folders;
- P24–P31 optional/deferred engineering/runtime proposals;
- N03 general provider-child environment-boundary hardening.

### 30.2 Implemented source architecture

Agent Core remains Node/TypeScript-native and does not import Serena runtime or Python SolidLSP.

New/expanded native Semantic IDE surfaces include:
- `src/semantic-ide/freshness.ts` — bounded on-demand workspace snapshot/diff and watched-file synchronization;
- `src/semantic-ide/provider-registry.ts` — deterministic built-in/custom provider registry, adapters, readiness, capability contracts and project-local discovery;
- `src/semantic-ide/process-lifetime.ts` — owned provider process-tree snapshot/termination;
- `src/semantic-ide/path-safety.ts` — lexical + realpath workspace/protected-boundary validation;
- `src/semantic-ide/source-io.ts` — UTF-8/UTF-16 BOM-aware semantic reads plus symlink-preserving atomic writes;
- `src/semantic-ide/workspace-policy.ts` — source scanning, hard excludes, local `git check-ignore`, language composition;
- `src/semantic-ide/protocol.ts` — selective stale-content retry, numeric-string response IDs, void shutdown/exit, MethodNotFound server-request semantics, owned-child cleanup;
- `src/semantic-ide/language-server.ts` — startup single-flight, typed adapters, readiness/fatal state, diagnostics generation/canonicalization and created/deleted-file reconciliation;
- `src/semantic-ide/transaction.ts` — source-fingerprint transaction safety, encoding/EOL preservation, realpath guard and transactional RenameFile;
- `src/semantic-ide/service.ts` — provider routing/composition, freshness preflight, overload identity, bounded hover info, location filtering, diagnostics freshness and mutation synchronization.

Public controller surface remains exactly two Semantic IDE tools: `code_symbol` and `code_refactor`; no Serena tool family or execution gate was added.

### 30.3 Multi-language provider behavior

Built-in discovery is deterministic and no-install:
- TypeScript/JavaScript remains project-local known-good default;
- Python discovers project-local Pyright runtime or an already-present explicit/PATH server;
- C# discovers a project-local/explicit Roslyn language-server DLL plus project-local/explicit/already-present `dotnet`;
- PowerShell discovers project-local/explicit PowerShell Editor Services plus project-local/already-present `pwsh`;
- explicit `servers.json` definitions override built-ins;
- unavailable providers remain unavailable without degrading unrelated languages;
- Semantic IDE itself performs no provider download/install and does not mutate system PATH.

Optional discovery overrides are documented in `.env.example`.

### 30.4 Verification evidence

Verification remained targeted to the affected Semantic IDE scope, as required by this plan.

- `npm run build` — PASS.
- Existing first-wave Semantic IDE regression: 5 files / 18 tests — PASS.
- New second-wave acceptance: 5 files / 27 tests — PASS during incremental verification.
- Final combined Semantic IDE acceptance: **11 files / 47 tests PASS**.
- Real `npm run semantic:smoke` against project-local TypeScript language server — PASS:
  - health before query: `available`, issueCount `0`;
  - real TypeScript provider became `ready` via `$ /typescriptVersion`;
  - freshness baseline observed 459 source files, no truncation;
  - symbol query returned real project symbols;
  - health after query remained `available`, issueCount `0`.
- MCP contract regression confirms production registration remains **62 tools** with exactly `code_symbol` + `code_refactor` for Semantic IDE.

Acceptance evidence covers: Created/Changed/Deleted freshness events, scan degradation truth, Git ignore behavior, freshness single-flight, provider precedence/discovery, TypeScript ATA policy, C#/PowerShell normalization/config behavior, `ContentModified` retry, numeric-string IDs, MethodNotFound, parameterless shutdown/exit, process-descendant cleanup, UTF-16 BOM preservation, in-workspace symlink/junction preservation, escape refusal, RenameFile preview/apply/conflict handling, overload identity, `includeInfo`, outside-location filtering, diagnostics URI canonicalization, capability degradation, strict provider ranges, startup single-flight, nested tsserver fatal evidence and one-replacement recovery.

### 30.5 Structural-review evidence

Grafel reindex was explicitly requested after source mutation. During final review the provider remained in `indexing/dirty` state and refused graph impact calls with `CODE_INTELLIGENCE_INDEX_NOT_CURRENT`; this was treated as non-gating exactly as Agent Core's architecture requires.

Exact-source structural review therefore verified:
- `SemanticIdeConfig` remains owned by `src/config.ts` and consumed by `SemanticIdeService.initialize`; no second config authority was introduced;
- live health serialization in `src/index.ts` embeds `semanticIde.health()` additively and does not couple Execution/Memory/Grafel availability;
- MCP wiring in `src/mcp/server.ts` still conditionally calls only `registerSemanticIdeTools`; machine-control registration remains direct;
- the semantic MCP regression test proves the public tool count remains 62 and no generic Serena surface leaked into production;
- source-level imports keep the new modules under `src/semantic-ide` as one sibling subsystem.

Exact current source outranks the stale/in-progress graph. A later Grafel refresh may improve structural evidence but is not required to activate or validate this completed source change.

### 30.6 Release/version state

One required release intent was created:
- `.changeset/20260919082021-85569e.md` — `minor`;
- summary: `Add Semantic IDE workspace freshness synchronization and multi-language provider support with hardened LSP lifecycle and transactional refactors.`

`release:check-intent` result after implementation:
- release-relevant Semantic IDE files detected;
- exactly one new intent detected;
- `ok: true`.

`release:plan` after implementation:
- Current: `0.10.0`;
- Bump: `minor`;
- Next: `0.11.0`;
- Pending: `1`.

No `release:apply`, stable package replacement, commit, tag, push, publish, deployment, or Agent Core restart/cutover was performed.

### 30.7 Serena retirement state

The protected Serena checkout is **not yet retired**.

Reason: P15, P19, P24–P31 and N03 remain explicitly unselected/deferred/needs-discussion rather than rejected or integrated. The local checkout therefore still contains unique source evidence relevant to those future decisions. Retirement stays blocked until those items are either implemented or explicitly rejected and a new final zero-value census passes.

Current approved-scope verdict: **COMPLETE — VERIFIED FOR APPROVED SCOPE**.
## 31. 2026-09-20 source-first forensic re-grounding

This section is the current proposal authority for the re-cloned `Audit\Serena` reference. It does not reopen or invalidate the already verified Semantic IDE baseline.

### 31.1 Exact evidence boundary

- Audit checkout: `E:\Projects\Agent-Core\Audit\Serena`.
- Origin: `https://github.com/oraios/serena.git`.
- HEAD: `2a6deef83861d61f839ab4b94f1fc323b2fe8edf`.
- Working tree was clean before inspection.
- This is the exact revision previously used for the selected Serena/SolidLSP adoption.
- Direct AST inventory covered 437 Python files: 166 source files plus 271 test files.
- `src\serena` contains 70 Python files; `src\solidlsp` contains 96.
- `src\solidlsp\language_servers` contains 75 provider modules.
- Request-scoped Grafel indexing reached current HEAD and mapped 14,714 entities / 88,591 relationships.
- Git history for the scoped Serena/SolidLSP source was inspected directly.
- Exact Agent Core `src\semantic-ide` source was compared against the Serena mechanisms below.

README/docs were not used as implementation authority. Exact source, tests, Git history, and current Agent Core source outrank documentation.

### 31.2 Baseline parity result

The previous selected adoption is still present in current Agent Core source. No evidence was found that the core Serena-derived Semantic IDE capability was lost during corruption recovery.
Verified current parity includes:
- bounded workspace freshness and watched-file synchronization;
- deterministic provider registry, composition, priority, and adapters;
- provider readiness/indexing truth and dynamic capability registration;
- owned process-tree cleanup and bounded provider recovery;
- selective `ContentModified` retry;
- symlink/realpath-aware source safety and atomic semantic writes;
- diagnostics generation/cache handling and pull/push fallback;
- overload-aware symbol identity and provider-specific normalization;
- bounded hover/info enrichment;
- safe result-location filtering;
- transactional `RenameFile` handling;
- loopback-only externally owned TCP transport;
- JSON-RPC/LSP interoperability hardening;
- required/optional capability truth;
- deterministic client capabilities and TypeScript background-network suppression;
- authorized multi-root workspaces;
- encoding-safe source IO and strict range validation;
- deterministic `workspace/configuration` handling;
- nested-provider fatal-signal detection;
- explicit provider hot reload;
- bounded type hierarchy;
- opt-in diagnostics delta after refactor;
- provider version probes/compatibility truth;
- static non-secret provider environment overrides.

Raw protocol definitions such as code actions, semantic tokens, inlay hints, call-hierarchy types, file-operation requests, and cancellation types are not treated as steal/use wins merely because wrappers exist. Source search did not establish them as missing high-level Serena mechanisms needed by Agent Core.

## 32. New proposal set requiring user selection

### S3-P1 — Verified project-local language-server provisioning + repair

**Recommendation:** APPROVE for implementation review  
**Provenance:** MIT-SAFE SolidLSP source + Agent Core-native hardening  
**Current state:** NOT IMPLEMENTED

Direct source evidence:
- `src\solidlsp\dependency_provider.py` models pinned/versioned provider dependencies and platform-specific provider setup;
- `DownloadedDependency` supports expected SHA-256, allowed hosts, archive type, and explicit target placement;
- `src\solidlsp\ls_utils.py` validates the requested host and the final redirect host, streams downloads to temporary files, verifies SHA-256, and validates archive member containment before extraction;
- provider modules contain concrete pinned artifact/version/hash patterns.

Current Agent Core gap:
- `src\semantic-ide\provider-registry.ts` can discover already-present project-local/system providers but does not provision a missing verified provider artifact;
- missing C#/PowerShell/Python provider assets therefore remain a manual installation concern;
- current Anthropic-derived hardening supplies bounded outbound requests, bounded response consumption, HTTPS/loopback endpoint rules, owned-child environment isolation, and atomic persistence, but not a complete verified artifact/redirect/archive provisioning pipeline.

This gap is now materially smaller than when P27 was rejected, so P27 is reopened only as this narrower Agent Core-owned proposal.
Proposed Agent Core design:
- keep all managed provider artifacts under `runtime\semantic-ide\providers\<provider>\<version>`;
- use a data-only manifest containing provider id, exact version, platform, HTTPS URL, SHA-256, allowed hosts, archive format, expected executable path, and maximum artifact size;
- reject unpinned versions, missing SHA-256, unknown hosts, non-HTTPS remote URLs, path interpolation, and secret-bearing manifest fields;
- follow redirects manually/boundedly so every destination host is revalidated before body consumption;
- stream to project-local staging, enforce a hard byte budget, compute SHA-256, then extract/copy only after integrity passes;
- validate every archive member against traversal, absolute path, drive/UNC escape, symlink/reparse escape, and destination collision before extraction;
- stage the complete provider version in a temporary project-local directory, then atomically promote the final version directory;
- never modify global PATH, AppData, system package managers, registry, or user-global toolchains;
- provider runtime child environment continues to use existing Agent Core isolation/redaction rules;
- normal `code_symbol`/`code_refactor` calls must never silently fetch from the network;
- a missing/corrupt managed provider reports truthful degraded health until an explicit provisioning/repair action is authorized;
- an explicit repair may verify the installed manifest/hash and reinstall only that provider version.

Recommended public-surface shape:
- extend existing `code_symbol` rather than adding another MCP tool;
- additive action `provision_provider` with explicit provider id and confirmation semantics;
- keep `reload_providers` as the activation step after successful installation;
- preserve current 62-tool count; only additive schema/action changes occur.

Initial recipes should be limited to providers already owned by the Agent Core Semantic IDE design (C#, PowerShell, Python) and only after exact upstream artifact/version/hash review. TypeScript remains project-local through the existing Node dependency path.
Acceptance requirements if `S3-P1` is selected:
1. no network access occurs during ordinary semantic queries;
2. unapproved provider id/version cannot install;
3. non-HTTPS remote URL is rejected except explicit loopback test fixtures;
4. redirect to a non-allowlisted host is rejected before body download;
5. artifact byte budget is enforced while streaming;
6. SHA mismatch produces zero final installation;
7. traversal/absolute/UNC/drive-escape archive members are rejected before extraction;
8. partial extraction/download cannot become the active provider directory;
9. a valid provider installs only below project-owned runtime;
10. repeated provision of an already-valid exact version is idempotent;
11. explicit repair of a deliberately corrupted fixture restores the exact pinned artifact;
12. provider health/version probe becomes compatible after activation;
13. unrelated providers remain usable when one provision fails;
14. no secret is logged in Activity Tracker/tool history;
15. `release:compat` shows no removed tool/route and accepts the additive schema.

Release intent if selected: **minor**, because provisioning becomes a new public Semantic IDE capability even though it reuses the existing `code_symbol` facade.

### S3-P2 — External MCP client acceptance harness

**Recommendation:** OPTIONAL APPROVE — engineering support, not runtime subsystem  
**Provenance:** CLEAN-ROOM BEHAVIOR ONLY from current GPL Serena live-client acceptance script  
**Current state:** NOT IMPLEMENTED

Source evidence:
- `scripts\live_test_grok.py` performs a real external-client MCP registration/handshake, `tools/list`, read-only `tools/call`, negative-path checks, state-preserving cleanup, bounded evidence capture, and restoration verification;
- it keeps credential-bearing backups private and removes them after baseline restoration.
Current Agent Core gap:
- `release:compat` and `mcp-contract.mjs` validate the server/source/built manifest, not whether a specific external AI client has actually refreshed its cached MCP manifest;
- this distinction has repeatedly mattered when server-side 62-tool/schema truth was correct but an already-initialized external controller still exposed an older descriptor.

Proposed clean-room adaptation:
- add an explicit script under `scripts\verify`, not a daemon/service/tool;
- target only a user-approved external MCP-capable client/CLI adapter;
- default mode is read-only: initialize, `tools/list`, schema fingerprint, and one harmless read-only tool call;
- mutating registration/config probes require separate explicit authorization;
- snapshot any touched external-client config before mutation, restore it afterward, and verify byte/state parity;
- evidence lives only in a project-local transient verification directory and is bounded/redacted;
- do not copy Serena GPL code or Grok-specific hook logic;
- no scheduled/background verification and no execution gate;
- internal `release:compat` remains the release contract authority; this harness is external acceptance evidence only.

This proposal is useful when validating a real connector/client after public MCP schema changes, but it is not required for normal Agent Core runtime operation.

Release intent if selected alone: normally **patch** for an engineering verification capability; no MCP/runtime contract change is required.

## 33. Revalidated reject / covered census

The full earlier P/C catalog was rechecked against the exact same Serena HEAD plus current Agent Core source. The following remain non-candidates, not hidden backlog:
- full Serena agent/MCP runtime, Python SolidLSP runtime, REPL, dashboard/GUI, task executor, prompt/context/mode gating, generic shell/filesystem tools, and Serena memory authority;
- project-server/external-project remote execution and current shared-secret project-server layer;
- JetBrains-specific move/inline/inspection APIs and plugin dependency;
- project read-only capability gates, activation commands, automatic build/test/lint, global Git mutation, and fail-all/eager-start provider policies;
- persistent document-symbol disk cache: live LSP freshness plus Grafel structural derived state remain preferable;
- Python entry-point provider plugins and arbitrary callback code from config;
- raw LSP tracing by default;
- automatic formatting/blank-line heuristics after edits;
- Serena textual memory references, onboarding auto-memory, and memory read-only/ignored-pattern semantics;
- Serena version/tag/publish workflows, Docker/Nix/devcontainer packaging, registry metadata, analytics/telemetry, and generic model orchestration;
- protocol-wrapper-only surfaces such as call hierarchy, code actions, semantic tokens, inlay hints, document highlights, selection ranges, Create/Delete file operations, and cancellation are not promoted without high-level Serena usage plus a demonstrated Agent Core gap;
- provider-specific quirks across the 75 provider modules remain on-demand implementation references, not a reason to import the provider fleet wholesale.

Recent current-HEAD Serena changes were also classified directly:
- project-server shared-secret auth and writable external project contexts: reject/covered by existing Agent Core auth + workspace/direct-control boundaries;
- REPL/facade/session work: reject duplicate controller surface;
- config permission and persistent Serena secret changes: no unique Agent Core adoption beyond existing project-local security/persistence primitives;
- high-level symbol-cache invalidation: not applicable because Agent Core intentionally has no persistent semantic symbol disk cache;
- Godot/body-range fixes: provider-specific evidence only, to be consulted if that provider is explicitly selected;
- atomic source save evolution: already covered by Agent Core semantic transaction/source IO.

No third general-purpose adoption candidate survived the source/test/history/current-source comparison.

## 34. Selection and implementation contract

The user must explicitly select `S3-P1`, `S3-P2`, both, or neither before implementation.

Until selection:
- do not install a language server, archive utility, package, or other dependency;
- do not mutate `src\semantic-ide`, public MCP schema, or release tooling;
- do not run provisioning downloads;
- do not run external-client configuration mutation;
- do not create a release intent solely for this planning refresh.
If `S3-P1` is selected, implementation order is:
1. exact provider/artifact manifest design + scoped backup;
2. generic allowed-host/redirect/hash/bounded-download primitive built on current `src\net` hardening;
3. safe archive/staging/final-placement primitive;
4. project-local provider manifest/integrity state;
5. additive explicit `code_symbol` provisioning action;
6. one provider fixture before any real provider recipe;
7. selected real provider recipes only after exact version/hash verification;
8. targeted security/provisioning acceptance;
9. Semantic IDE health/version/hot-reload readback;
10. `CODEBASE.md`, release intent, and durable Serena memory synchronization.

If `S3-P2` is selected, implementation remains isolated under `scripts\verify` and must not become a server runtime dependency.

## 35. Reference-retirement rule after this re-grounding

`Audit\Serena` is **not a corpse at this checkpoint** because `S3-P1` is a real source-grounded missing capability and `S3-P2` is a distinct optional engineering capability.

Retain the checkout while proposal review is unresolved.

Delete `Audit\Serena` only when one of these becomes true:
- the user rejects all remaining proposals and a final dependency scan finds no active runtime/source need for the checkout; or
- every selected proposal is implemented/verified, all rejected/deferred dispositions are recorded, and a final zero-value census again finds no unique remaining mechanism.

Before retirement, require:
- exact checkout HEAD/origin/clean readback;
- no active `src`/`tests`/`scripts` import/path dependency on `Audit\Serena`;
- cleanup of temporary Grafel workspace/marker used only for grounding;
- `CODEBASE.md` + durable memory final disposition synchronized.

Current disposition: **RETAIN FOR USER PROPOSAL REVIEW; NO INSTALLATION OR ADOPTION PERFORMED BY THIS RE-GROUNDING.**

## 36. Approved S3-P1 / S3-P2 implementation evidence — 2026-09-20

The user approved both residual proposals. Current-line implementation is complete in source and rebuilt `dist`.

### S3-P1 implemented state

- Existing public facade extended only through additive `code_symbol(action=provision_provider)`; total MCP tool count remains 62.
- Required public confirmation: `confirmation=PROVISION_PROVIDER`.
- Provisionable managed providers: Python, C#, PowerShell.
- Recipes are pinned to exact artifact versions + SHA-256 + allowlisted hosts + compressed/expanded size budgets + entry limits.
- Remote artifact access is HTTPS-only except loopback fixtures; redirects are manual, bounded, and every redirect host is revalidated before body download.
- Downloads are streamed to project-local staging with hard byte bounds and SHA-256 verification.
- ZIP/TGZ extraction rejects traversal, absolute/drive escape, encrypted ZIPs, links/symlinks, collisions, entry overflow, and expansion overflow.
- Provider directories are promoted atomically only after entrypoint + tree-integrity validation.
- Existing corrupt managed provider state requires explicit `repair=true`; valid exact installs are idempotent and do not redownload.
- Managed provider health reports invalid manifest or missing required entrypoint truthfully.
A real-provider acceptance exposed one correctness defect during implementation: mutable runtime output had been placed under integrity-hashed provider trees. The fix is now part of the implementation:
- C# extension logs -> `runtime\semantic-ide\state\csharp\logs`;
- PowerShell session/log state -> `runtime\semantic-ide\state\powershell\session`;
- Roslyn-generated `roslyn/cache` is explicitly declared as the only C# mutable subtree excluded from immutable tree digesting.

Post-fix real managed-tree readback:
- Python -> `alreadyValid=true`, zero redownload;
- C# -> `alreadyValid=true`, zero redownload;
- PowerShell -> `alreadyValid=true`, zero redownload.

No global PATH, AppData, registry, winget/choco/scoop/npm-global, or system package-manager mutation is introduced.

### S3-P2 implemented state

- `scripts\verify\mcp-external-acceptance.mjs` implements a fresh external MCP HTTP client handshake.
- `npm run verify:mcp-external` exposes the harness explicitly.
- Harness forces `tools/list` refresh, computes a SHA-256 manifest fingerprint, can require tool names/schema params, and performs one harmless read-only tool probe.
- Evidence is bounded/redacted and restricted under `runtime\tmp\mcp-client-acceptance`.
- It is not a daemon, scheduler, runtime dependency, test gate, or replacement for `release:compat`.
### Targeted verification evidence

- `tests/semantic-ide-provisioning.test.ts`
- `tests/semantic-ide-provider-discovery.test.ts`
- `tests/mcp-external-acceptance-harness.test.ts`
- result: **3 files / 10 tests PASS**;
- root TypeScript build: **PASS / exit 0**;
- `release:compat`: **62 -> 62 tools**, no removed tool/route, `breakingEvidence=false`;
- built manifest: 105,146 bytes / ~26,287 tokens, below 120,000-byte / 30,000-token budget;
- `release:check-intent`: healthy;
- dedicated release intent: `.changeset/20260920101657-048227.md` = minor toward planned 0.12.0;
- no `release:apply`, commit, tag, push, publish, or deploy was performed.

Live activation and retirement are complete. Post-restart `/health` reports Semantic IDE `available` with issueCount `0`; TypeScript 6.0.0, C# 5.5.0, PowerShell 7.6.6, and Python 1.1.403 are all compatible. A fresh authenticated external MCP client observed 62 tools and the live `code_symbol` schema includes `provision_provider`, `providerId`, `repair`, and `confirmation`. A live Python provision call returned `changed=false`, `alreadyValid=true`, `repaired=false`, proving idempotent activation without redownload. Final active dependency scan returned zero Serena references, no `.grafel` marker remained, Grafel registry contained only the `agent-core` repo, and `Audit\Serena` was physically deleted (`EXISTS_AFTER=False`).
