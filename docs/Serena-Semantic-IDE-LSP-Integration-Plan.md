# Serena-Inspired Semantic IDE / LSP Integration Plan — Agent Core

> **Status:** COMPLETE — VERIFIED FOR APPROVED FIRST-WAVE SCOPE — NO OPEN FIRST-WAVE WORK
> **Created:** 2026-09-18
> **Historical implementation baselines:** Agent Core 0.9.0 and the then-current stable line 0.11.0. Current product version comes from root `package.json` (0.14.0 at source review `8a80251`).
> **Historical grounded reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\serena`; current re-grounding authority is `Audit\Serena` in the second-wave plan
> **Reference commit:** `2a6deef83861d61f839ab4b94f1fc323b2fe8edf`
> **Reference origin:** `https://github.com/oraios/serena.git`
> **License boundary:** current Serena application = GPL-3.0-or-later; current `src\solidlsp` = MIT; Serena repository identifies v1.7.0 / commit `74c38a65f03fc0764d7ee4b3016ef6a07572ed64` as the last MIT application cutoff.
> **Target:** add IDE-grade semantic symbol intelligence and safe refactoring to Agent Core without importing the Serena agent/runtime/memory architecture.
> **Hard rules:** no full Serena runtime, no Serena memory authority, no Serena REPL, no workflow/capability gate, no hidden model, no Python requirement by default, no replacement of Grafel.

## 1. Objective

Add a new **Semantic IDE / LSP** sibling capability to Agent Core that gives the connected AI/controller precise compiler/IDE-style understanding and refactoring operations:

- symbol overview;
- symbol search;
- references;
- declaration;
- implementations;
- diagnostics;
- rename;
- safe delete;
- replace symbol body;
- insert before/after symbol.

The new capability must complement the existing Grafel-backed Code Intelligence subsystem rather than replace or duplicate it.

Target relationship:

```text
AI / Controller
      |
      v
Agent Core MCP
      |
      +-------------------+-----------------------+
      |                   |                       |
      v                   v                       v
Machine Control       Grafel Code Intel      Semantic IDE / LSP
direct tools          structural graph       compiler/IDE semantics
                      impact / paths          symbols / references
                      repairs / patterns      refactor / diagnostics
      |                   |                       |
      +-------------------+-----------------------+
                          |
                          v
                 exact current source
                 remains final authority
```

## 2. Grounded Serena mechanisms

The protected Serena checkout was grounded read-only. The following mechanisms are directly evidenced in the source and are the basis of this plan.

### 2.1 Symbolic retrieval

Current Serena exposes:

- `get_symbols_overview`
- `find_symbol`
- `find_referencing_symbols`
- `find_declaration`
- `find_implementations`
- `get_diagnostics_for_file`
- `get_diagnostics_for_symbol`

The retrieval model is symbol/name-path based rather than line-number based. Results can include body, location, signature/hover-like information, child depth, and bounded/shortened output.

### 2.2 Symbolic editing and refactoring

Current Serena exposes:

- `replace_symbol_body`
- `insert_before_symbol`
- `insert_after_symbol`
- `rename_symbol`
- `safe_delete_symbol`

Important observed behavior:

- rename delegates to the language server's semantic rename/refactor capability;
- safe delete resolves the exact symbol, requests references, refuses deletion when references remain, and deletes only when the symbol is unreferenced;
- symbol body replacement and insert-before/after edit exact symbol ranges rather than relying on fragile line offsets;
- writes are atomic at the edited-file level.

### 2.3 Language-server lifecycle

Serena's language-server manager:

- routes files to the appropriate active language server;
- detects a terminated server;
- recreates/restarts the affected server;
- retries the interrupted symbolic operation once when failure evidence identifies a terminated language server;
- supports multiple language servers in one project;
- saves/maintains provider caches.

This is provider self-repair, not an autonomous agent retry loop.

### 2.4 Project/workspace concepts

Serena supports:

- project activation;
- multiple language servers per project;
- indexed workspace folders;
- additional workspace folders for cross-package references;
- querying registered external projects through read-only symbolic tools.

Agent Core already has `code_workspace` for workspace/ref/worktree identity. This plan reuses that existing concept where possible instead of creating a parallel project registry.

### 2.5 Memory ideas considered separately

Serena memories provide:

- project/global Markdown scopes;
- explicit `mem:<name>` references;
- rename propagation;
- stale-reference/integrity checks;
- read-only and ignored memory patterns;
- onboarding + `memory_maintenance`.

Agent Core MemoryService is already materially stronger as the canonical durable-memory authority. These mechanisms are not part of the first-wave Semantic IDE implementation; only small reference-integrity ideas may be proposed later as a separate memory plan.

## 3. Gap analysis against Agent Core 0.9.0

Agent Core already has strong structural intelligence through Grafel:

- graph relationships;
- paths/traces;
- impact radius;
- endpoint/cross-link surfaces;
- architectural fitness;
- residual repair;
- code patterns;
- multi-workspace/ref/worktree routing.

Active Agent Core currently has **no language-server/LSP subsystem**.

Therefore the missing capability is not another graph engine. The missing capability is:

```text
compiler / IDE semantic truth
        |
        +-- symbol identity
        +-- declarations
        +-- implementations
        +-- reference-aware rename
        +-- safe-delete evidence
        +-- diagnostics
        +-- exact symbol body ranges
```

This is complementary to Grafel and materially reduces fragile text-based refactoring.

## 4. Architecture decision

### 4.1 New sibling subsystem

Introduce an Agent Core-owned subsystem:

```text
src\semantic-ide\
```

It remains independent of:

- MemoryService;
- LearningService;
- Game Mode;
- machine-control execution;
- Grafel daemon lifecycle.

Proposed components:

```text
src\semantic-ide\
  types.ts
  service.ts
  runtime.ts
  workspace.ts
  language-server.ts
  json-rpc.ts
  document-sync.ts
  symbol.ts
  diagnostics.ts
  refactor.ts
  transaction.ts
  provider-config.ts
```

Exact filenames may be reduced during implementation if a smaller coherent design is sufficient.

### 4.2 Provider implementation strategy

**Preferred first-wave direction:** Agent Core-owned Node/TypeScript LSP provider.

Reasons:

- reuses the existing project-local Node runtime;
- avoids making Python/uv a new Agent Core runtime prerequisite;
- avoids importing current GPL Serena application code;
- preserves Agent Core packaging/portability;
- keeps provider lifecycle observable from the existing Node core.

Phase 0 must decide between:

**A. Minimal native LSP transport**
- Agent Core implements the small required JSON-RPC/LSP stdio client surface itself.

**B. Pinned permissive Node LSP protocol dependency**
- use only a narrowly scoped MIT/permissive library after explicit dependency/license review.

No new dependency is installed during planning. Implementation may add a dependency only after the user approves this plan and the exact dependency is reviewed.

### 4.3 Serena license boundary

For first wave:

- current GPL `src\serena` code is **reference-only**;
- no current Serena application source is copied/imported into Agent Core;
- current MIT `src\solidlsp` may be used as behavioral/source reference;
- the last MIT Serena application cutoff may be used as a historical source reference for mechanisms that existed there;
- any substantial copied MIT source must retain required notices;
- full Serena v2 runtime is explicitly outside first-wave integration.

## 5. Public MCP surface

Add exactly **two** Agent Core MCP facade tools.

### 5.1 `code_symbol`

Proposed actions:

- `status`
- `overview`
- `find`
- `references`
- `declaration`
- `implementations`
- `diagnostics`
- `restart_server`

Representative inputs:

```text
action
workspace?
ref?
worktreePath?
relativePath?
namePath?
query?
depth?
includeBody?
includeInfo?
maxResults?
maxAnswerChars?
language?
```

Rules:

- read-only actions never mutate source;
- `restart_server` mutates only isolated provider runtime state;
- symbolic calls fail soft when the language server/provider is unavailable;
- normal Agent Core filesystem/search remains the fallback;
- exact source remains final authority.

### 5.2 `code_refactor`

Proposed actions:

- `rename`
- `safe_delete`
- `replace_body`
- `insert_before`
- `insert_after`

Representative inputs:

```text
action
workspace?
ref?
worktreePath?
relativePath
namePath
newName?
body?
dryRun?
```

Rules:

- source mutation occurs only after the target symbol resolves uniquely;
- target paths must remain inside the resolved workspace/worktree;
- rename uses the language server's returned WorkspaceEdit rather than text search/replace;
- safe delete must refuse when references remain;
- replace/insert operations use semantic symbol ranges;
- `dryRun=true` returns the planned WorkspaceEdit/diff without mutation when the provider operation supports preview.

Expected production tool count after first-wave implementation:

```text
61 total = current 59 + code_symbol + code_refactor
```

This count is planned, not current state.

## 6. Semantic IDE health model

Add a separate sibling health surface rather than overloading Grafel health:

```text
/health.semanticIde
```

Proposed shape:

```text
status: available | degraded | not-configured | error
enabled: boolean
backend: lsp
workspace: <default current root>
activeServers: [...]
issueCount: number
issues?: [...]
```

Top-level Agent Core health remains independent:

- a Semantic IDE failure must not make Execution unavailable;
- a Semantic IDE failure must not make Memory unavailable;
- a Semantic IDE failure must not make Grafel unavailable;
- normal MCP machine control remains directly callable.

## 7. Workspace/ref/worktree behavior

The provider must not create an independent workspace naming authority.

Rules:

1. default calls operate on current `<PROJECT_ROOT>`;
2. when a `workspace` is supplied and current Code Intelligence workspace routing is available, reuse Agent Core's existing workspace resolution;
3. a `worktreePath` is treated as the concrete LSP root for ref-specific editing;
4. ref-specific mutations require an explicit worktree checkout/path rather than editing an abstract ref;
5. if non-default workspace routing is unavailable, return a handled Semantic IDE error rather than silently operating on the wrong root;
6. protected paths remain forbidden unless separately and explicitly authorized.

Grafel and Semantic IDE do not need identical indexing lifecycles:

- Grafel = structural graph derived state;
- LSP = live language-server workspace state.

They share workspace identity but remain separate provider authorities.

## 8. Language-server provisioning strategy

First wave must separate **LSP orchestration** from **language-server installation**.

### 8.1 First-wave rule

Agent Core may use:

- explicitly configured language-server commands;
- already-installed system language servers;
- project-local language-server binaries already present in the project;
- language servers shipped as part of an explicitly approved Agent Core provider package.

First wave must **not** silently download/install arbitrary language servers.

If a required server is missing:

```text
semanticIde.status = degraded/not-configured
code_symbol/code_refactor = handled error
normal Agent Core tools = unaffected
```

### 8.2 Initial language targets

Implementation should prove the architecture with the languages Agent Core itself uses:

1. TypeScript / JavaScript;
2. C#;
3. PowerShell where a compatible configured server exists.

The provider architecture must remain language-generic, but first-wave completion does **not** require Serena's full 40+ language matrix.

Additional language-server auto-provisioning is a later capability and requires separate review because it introduces supply-chain/install semantics.

### 8.3 Provider configuration

Proposed config surface:

```text
AGENT_CORE_SEMANTIC_IDE_ENABLED=true
AGENT_CORE_SEMANTIC_IDE_RUNTIME_DIR=runtime\semantic-ide
AGENT_CORE_SEMANTIC_IDE_STARTUP_TIMEOUT_MS=30000
AGENT_CORE_SEMANTIC_IDE_CALL_TIMEOUT_MS=15000
```

Language-server definitions should live in a non-secret local config under the Semantic IDE runtime directory or another Agent Core-owned local configuration file.

They must use portable/project-relative discovery where possible and must not encode a drive letter as project identity.

## 9. LSP session lifecycle

Each language-server session is keyed by:

```text
workspace/worktree root + language/server identity
```

Required lifecycle:

```text
resolve workspace
   |
   v
find server definition
   |
   v
start server if needed
   |
   v
initialize / initialized
   |
   v
workspaceFolders + capabilities
   |
   v
document sync / symbolic operation
   |
   v
reuse session for subsequent calls
```

### 9.1 Failure recovery

If a call fails because the server is confirmed terminated:

1. record provider failure evidence;
2. terminate stale process state;
3. recreate that affected language server;
4. perform the same provider operation **once**;
5. if it fails again, return the real failure.

This retry is permitted because it is deterministic provider self-recovery from a confirmed provider termination. It must not become an autonomous controller retry loop.

### 9.2 Shutdown

Agent Core graceful shutdown must close Semantic IDE sessions without coupling them to:

- tunnel lifecycle;
- OAuth lifecycle;
- external RDC;
- Grafel process lifecycle.

## 10. Document synchronization

The LSP layer must maintain correct source state.

Requirements:

- open documents only when necessary;
- use `didOpen`, `didChange`, `didSave`, and `didClose` according to provider capability;
- notify relevant sessions after Semantic IDE writes;
- observe source modifications performed through normal Agent Core filesystem tools before relying on stale in-memory document content;
- support a bounded resync/reopen path when filesystem/source fingerprints diverge.

The LSP provider must never become canonical source storage. The filesystem remains canonical.

## 11. Symbol identity and output contract

Use provider-neutral Agent Core symbol records.

Proposed normalized symbol shape:

```text
name
namePath
kind
relativePath
range
selectionRange?
signature/info?
children?
language
provider
```

Do not expose provider-internal object identities as stable Agent Core IDs unless a stable cross-call identifier is proven.

### 11.1 Name path

Serena's useful `name_path` concept should be retained at the public facade because it is concise and practical for AI controllers.

Examples:

```text
MemoryService/batch
LearningService/review
AgentCoreRuntime/EnsureCoreAsync
```

Overload disambiguation may append provider-specific indexes/signature hints when required.

## 12. Output budgeting / progressive shortening

Steal the **mechanism**, not current GPL implementation.

Large symbolic output must degrade gracefully:

```text
full result
  -> omit bodies/context
  -> compact file/namePath summaries
  -> counts
```

Public inputs may include:

- `maxResults`
- `maxAnswerChars`
- `depth`
- `includeBody`
- `includeInfo`

Hard output budgets prevent a large codebase from flooding controller context.

## 13. Refactor transaction safety

Semantic rename can touch many files. Agent Core should improve on Serena by adding an explicit transactional mutation boundary.

### 13.1 WorkspaceEdit validation

Before applying provider edits:

- resolve every URI/path;
- require every mutated path to be inside the concrete authorized workspace/worktree;
- reject protected paths;
- reject unsupported external-file edits;
- capture current fingerprints for every target file;
- validate non-overlapping text edits per file;
- normalize line endings through existing file semantics.

### 13.2 Staged mutation

For multi-file edits:

```text
LSP WorkspaceEdit
    |
    v
validate all target files
    |
    v
capture fingerprints + backups
    |
    v
stage transformed contents
    |
    v
re-check fingerprints
    |
    +-- drift -> abort with zero mutation
    |
    v
apply files
    |
    +-- failure -> rollback backups
    |
    v
commit
```

Transaction/journal state, if required, should live under:

```text
runtime\semantic-ide\transactions
```

It must not reuse MemoryService's transaction store because code files and memory have different authorities/lifecycles.

### 13.3 Rename

`rename`:

- resolves a unique symbol;
- asks the language server for rename preparation if supported;
- requests semantic rename;
- validates the WorkspaceEdit;
- applies it transactionally;
- returns a concise changed-file/change-count report.

No global textual rename fallback is allowed inside `code_refactor(rename)`.

### 13.4 Safe delete

`safe_delete`:

1. resolve exact unique symbol;
2. request semantic references;
3. exclude only the declaration/self location where appropriate;
4. if references exist, return refusal + bounded reference evidence;
5. if no references exist, remove exact symbol range transactionally.

Safe delete must never silently delete a referenced symbol.

### 13.5 Replace/insert

`replace_body`, `insert_before`, `insert_after`:

- resolve exact symbol;
- obtain semantic symbol range;
- operate on current source fingerprint;
- write through the transaction layer;
- preserve surrounding source outside the target range.

## 14. Grafel synchronization after semantic mutation

Grafel remains structural Code Intelligence authority, but semantic refactoring changes files and invalidates graph freshness.

After successful `code_refactor` mutation:

1. mark the relevant Grafel workspace/ref/worktree context dirty;
2. request/recommend Grafel reindex through the existing Code Intelligence path;
3. return reindex state in the refactor result;
4. do not let stale Grafel structural evidence be reported as current.

Desired result shape:

```text
mutation:
  changedFiles: N
  changedEdits: M
semanticIde:
  synced: true
grafel:
  markedDirty: true
  reindexRequested: true|false
```

If Grafel is disabled/unavailable, the refactor itself may still succeed; the result must truthfully report that structural reindex was unavailable.

No cross-provider gate is introduced.

## 15. Diagnostics behavior

Diagnostics are evidence, not an automatic test gate.

`code_symbol(action=diagnostics)` should support:

- file diagnostics;
- symbol-scoped diagnostics;
- severity filter;
- optionally diagnostics for referencing symbols when provider capability exists.

Refactor operations may optionally return diagnostics metadata when cheaply available, but must not automatically run broad build/test suites.

Serena current source disables automatic per-edit diagnostics by default because intermediate edits can intentionally create transient errors. Agent Core should preserve that principle:

- explicit diagnostics = supported;
- automatic diagnostics after every individual edit = not required first wave;
- controller/user decides whether additional verification is needed.

## 16. Controller protocol integration

Update `AGENTS.md` only after implementation exists.

Proposed controller behavior:

- use Grafel for broad structural/impact/path questions;
- use Semantic IDE for symbol identity, declaration/reference/implementation questions and semantic refactoring;
- use exact source reads for final material verification;
- prefer `code_refactor(rename)` over multi-file text replacement when symbol rename semantics are available;
- prefer `safe_delete` before callable/symbol deletion;
- if Semantic IDE is unavailable, fail soft to exact search/read/manual edit;
- never treat LSP output as authorization to run tests or unrelated mutations.

This is guidance, not routing enforcement.

## 17. Serena mechanisms explicitly rejected for first wave

Do **not** integrate:

- Serena full MCP server/runtime;
- current GPL `src\serena` as embedded Agent Core source;
- Serena MemoryManager as a second memory authority;
- project/global Serena memory directories as a second canonical store;
- Serena onboarding writes into a parallel memory system;
- Serena Python REPL interface;
- Serena dashboard/GUI;
- Serena generic shell/file/search tools;
- Serena tool-capability router as an Agent Core execution gate;
- Serena autonomous agent framework;
- JetBrains paid plugin dependency;
- automatic language-server installation/download in first wave;
- global Git configuration mutation such as automatic `core.autocrlf` changes;
- automatic build/test/lint runs after refactoring.

## 18. Optional follow-up mechanisms — NOT first-wave tasks

The following Serena ideas are useful but intentionally deferred:

### 18.1 Memory referential integrity

Potential Agent Core-native adaptation:

- explicit human-readable memory references;
- stale-link/reference report;
- safe rename propagation;
- read-only/ignored memory subsets.

Any future implementation must extend existing MemoryService, not introduce Serena memory.

### 18.2 Project onboarding

Potential Agent Core-native flow:

```text
new code workspace
   -> grounding
   -> build/runtime/entrypoint/convention summary
   -> controller review
   -> verified scoped Agent Core Memory
```

This requires separate scope because it changes durable-memory capture policy.

### 18.3 Advisory controller profiles

Serena contexts/modes may inspire optional instruction/tool-recommendation profiles, but Agent Core must not turn them into execution permission gates.

## 19. Implementation phases

### Phase 0 — Baseline + provider feasibility

No production mutation beyond plan-approved spike files.

Tasks:

- record Agent Core 0.9.0 current health/tool counts;
- confirm current code workspace/Grafel state;
- identify exact initial language-server commands available on the machine/project without installing anything;
- prototype LSP initialize/shutdown + one read-only symbol request;
- decide native minimal JSON-RPC vs reviewed permissive Node protocol dependency;
- document exact license/dependency decision;
- create scoped implementation backup before source edits.

Exit criteria:

- one viable LSP transport path is proven;
- no full Serena/Python requirement has been introduced;
- no source implementation begins if the provider transport is not viable.

### Phase 1 — Semantic IDE core runtime

Implement:

- config/types;
- provider process/session lifecycle;
- stdio JSON-RPC/LSP transport;
- initialize/shutdown;
- workspace root + language routing;
- provider health;
- graceful close.

No public refactoring yet.

### Phase 2 — Read-only symbol facade

Implement `code_symbol`:

- status;
- overview;
- find;
- references;
- declaration;
- implementations;
- diagnostics;
- explicit provider restart.

At this point public MCP surface becomes 60 tools.

### Phase 3 — Symbol range editing

Implement:

- unique symbol resolution;
- replace body;
- insert before;
- insert after;
- source fingerprint validation;
- single/multi-file transaction substrate.

Do not expose rename/safe-delete until transaction behavior is proven.

### Phase 4 — Semantic rename

Implement provider `prepareRename`/rename support:

- preview WorkspaceEdit;
- validate paths/edits;
- transactional apply;
- output summary;
- no textual fallback.

### Phase 5 — Safe delete

Implement:

- exact symbol resolve;
- references lookup;
- bounded refusal evidence;
- semantic-range deletion only when no live references remain.

At completion of Phase 5 public surface is planned as 61 tools:

```text
59 existing + code_symbol + code_refactor
```

### Phase 6 — Grafel coordination

Wire successful code mutation to current Code Intelligence:

- mark matching context dirty;
- request/recommend reindex;
- expose provider synchronization evidence;
- ensure Grafel stale data never remains labelled current after Semantic IDE mutation.

### Phase 7 — Multi-workspace/worktree support

Reuse Agent Core workspace context:

- default root;
- registered workspace;
- explicit worktree;
- ref-specific edits only through real worktree path;
- fail closed on ambiguous/wrong workspace.

No new independent project registry.

### Phase 8 — Agent/controller protocol + health/UI mapping

Update:

- `AGENTS.md`;
- `/health.semanticIde`;
- launcher/UI status only if current UI architecture warrants a passive sibling status;
- `.env.example`;
- `docs\CODEBASE.md`;
- root memory only after implementation is actually verified.

### Phase 9 — Release intent / completion

Because this is a material new Agent Core capability, implementation must create one **minor** changeset when shipped.

Expected release direction from current 0.9.0:

```text
minor -> 0.10.0
```

This is a planned semantic-version outcome, not an authorization to run `release:apply`.

No commit/tag/push/publish/deploy/release apply occurs automatically.

## 20. Acceptance / verification gates

Verification runs **only after explicit user authorization**. Implementation must not mark this plan COMPLETE without real evidence.

### A. Baseline / architecture

1. Current Agent Core machine-control tools remain directly callable.
2. Memory, Learning, Game Mode, Grafel, OAuth, and tunnel behavior remain sibling/independent.
3. No current Serena GPL application source is imported/copied into active Agent Core source.
4. Any reused MIT source retains required notice.
5. Root Agent Core product still starts without requiring Python/uv by default.
6. Semantic IDE absence/failure does not make top-level Execution unavailable.

### B. Provider lifecycle

7. A configured language server starts successfully in the isolated Semantic IDE runtime context.
8. LSP initialize/initialized negotiation succeeds and capabilities are recorded.
9. Provider shutdown terminates only owned language-server processes.
10. Confirmed language-server termination triggers one provider-level restart + one retry.
11. Repeated provider failure is returned truthfully; no autonomous retry loop occurs.
12. Two language servers can coexist for different file types without routing the wrong file to the wrong server.

### C. Symbol retrieval

13. `overview` returns top-level symbols for a known source file.
14. `find` resolves an exact known symbol by name path.
15. `references` returns known cross-file references.
16. `declaration` resolves a known declaration/definition.
17. `implementations` returns known implementation(s) where the language server supports it.
18. `diagnostics` returns provider diagnostics with severity/path/symbol grouping where available.
19. Large symbol/reference output respects hard answer budgets and progressively shortens instead of flooding context.
20. Symbol calls against an unsupported/unconfigured language fail soft and direct the controller to normal source search/read.

### D. Workspace/ref/worktree correctness

21. Default Semantic IDE root resolves dynamically from current `<PROJECT_ROOT>`, not a hardcoded drive.
22. A registered non-default workspace routes to its actual path.
23. Worktree/ref-scoped calls use the concrete worktree path.
24. A ref mutation without a real worktree is rejected rather than editing the default branch/root.
25. Protected path access is rejected unless separately explicitly authorized.
26. A wrong/unregistered workspace fails rather than silently falling back to the current root.

### E. Symbol editing

27. `replace_body` changes only the resolved symbol body and preserves surrounding content.
28. `insert_before` and `insert_after` use semantic symbol boundaries and preserve line endings.
29. Source drift between preview/validation and apply aborts before mutation.
30. A failed multi-file transaction rolls back already-applied files.
31. External/out-of-workspace WorkspaceEdit targets are rejected.
32. Overlapping/invalid provider edits are rejected before write.

### F. Rename

33. Semantic rename changes declaration + references across multiple files.
34. `dryRun`/preview returns the intended WorkspaceEdit without changing files.
35. Rename does not fall back to project-wide textual search/replace.
36. Ambiguous/non-unique target symbol returns a handled error with zero mutation.
37. Rename preserves unrelated same-spelling identifiers not semantically bound to the target.

### G. Safe delete

38. A referenced symbol is refused and returns bounded reference evidence.
39. An unreferenced test symbol can be deleted successfully.
40. Safe delete never deletes a symbol when the language server reports live references.
41. Ambiguous symbol identity results in zero mutation.

### H. Grafel coordination

42. Successful Semantic IDE mutation marks the matching Grafel context dirty.
43. Grafel structural calls cannot report stale graph evidence as current after semantic mutation.
44. Reindex restores Grafel current state against the changed source.
45. Semantic refactor can still succeed when Grafel is unavailable, while reporting synchronization unavailability truthfully.
46. Grafel remains the structural/pattern authority; Semantic IDE does not create a second graph/pattern store.

### I. Regression / system boundaries

47. MCP surface contains exactly the intended two new tools, with no Serena generic file/shell/memory/REPL tool leakage.
48. Existing 59-tool behavior remains unchanged except the intentional addition to 61.
49. Direct machine-control remains ungated by Code Intelligence/Semantic IDE.
50. Memory canonical count/content is unchanged by Semantic IDE operations unless the user explicitly performs a memory task.
51. Learning does not automatically persist every refactor as memory.
52. Reflexion/failure-loop advisory remains controller/failure behavior and is not replaced by provider retry logic.
53. No broad tests/builds are triggered automatically by refactor operations.
54. Provider logs/tool history do not persist credentials or hidden/private reasoning.
55. `docs\CODEBASE.md` and public MCP descriptions state the provider boundaries accurately.

### J. Release readiness

56. Root TypeScript build succeeds.
57. Targeted Semantic IDE tests pass.
58. Targeted MCP registration/parity tests pass.
59. Targeted Grafel dirty/reindex integration tests pass.
60. Targeted existing Reflexion/Memory contract tests affected by public tool wiring remain green.
61. Release intent exists as one reviewed **minor** changeset before release application.
62. `release:check-intent` is clean for the implementation state.
63. No `release:apply` occurs unless separately explicitly authorized.

## 21. Targeted test plan

Proposed new test files:

```text
tests/semantic-ide-transport.test.ts
tests/semantic-ide-symbols.test.ts
tests/semantic-ide-refactor.test.ts
tests/semantic-ide-workspace.test.ts
tests/semantic-ide-grafel-sync.test.ts
tests/semantic-ide-mcp.test.ts
```

Tests should prefer deterministic fixture language servers or a small controlled fixture project.

Do not make broad repository regression a hidden prerequisite. If broader regression is genuinely needed after implementation, state the exact command and obtain user authorization.

## 22. Failure / safety semantics

### 22.1 Provider unavailable

Return a handled failure such as:

```text
SEMANTIC_IDE_UNAVAILABLE
```

with:

- affected workspace;
- language/file;
- provider/server state;
- safe fallback guidance.

Do not block other Agent Core tools.

### 22.2 Language server unsupported

Return:

```text
SEMANTIC_LANGUAGE_NOT_CONFIGURED
```

No automatic installer runs in first wave.

### 22.3 Ambiguous symbol

Return:

```text
SEMANTIC_SYMBOL_AMBIGUOUS
```

with bounded candidates. Do not choose automatically for mutations.

### 22.4 Source drift

Return:

```text
SEMANTIC_SOURCE_DRIFT
```

with zero mutation.

### 22.5 Refactor rollback failure

If rollback itself fails:

- preserve transaction evidence;
- report every affected path;
- mark provider/workspace degraded;
- do not claim success/fixed/atomic completion.

## 23. Security boundaries

- Semantic IDE language-server processes are local project tooling.
- They receive only the workspace paths needed for the request/session.
- No root `.env`, `secrets`, Memory canonical store, OAuth state, or tunnel credentials are intentionally exposed as provider configuration.
- WorkspaceEdit target validation prevents writes outside authorized workspace/worktree.
- Provider commands/config are user/Agent-Core controlled, not silently derived from an untrusted repository in first wave.
- Repository-supplied activation commands are not adopted from Serena.
- Auto-download/package-install functionality is deferred.

## 24. Performance / resource boundaries

- one reusable server session per concrete workspace root + language identity;
- idle-session eviction may be added only if real resource pressure is observed;
- no duplicate language-server process for every MCP call;
- hard timeouts for startup/call/shutdown;
- hard output budgets;
- no full-project symbol dump unless explicitly requested;
- index/cache paths remain derived provider state.

## 25. Rollback boundary

Rollback must be surgical.

Likely implementation files:

```text
src\semantic-ide\*
src\mcp\semantic-ide-schemas.ts
src\mcp\semantic-ide-tools.ts
src\config.ts
src\index.ts
src\mcp\handler.ts
src\mcp\server.ts
AGENTS.md
.env.example
docs\CODEBASE.md
tests\semantic-ide-*.test.ts
```

Rollback rules:

- remove only Semantic IDE integration code/config;
- do not alter Grafel provider data beyond normal derived-state reindex;
- do not alter canonical Memory;
- do not reset repository-wide user changes;
- do not touch the protected Serena reference checkout;
- generated Semantic IDE caches/runtime may be removed only when explicitly part of rollback/cleanup.

## 26. Release/version integrity

This plan itself is documentation/planning only and does not require a Changeset.

When implementation becomes material shipped behavior:

- create exactly one **minor** release intent;
- describe the user-visible capability, not the Serena research history;
- current Agent Core `0.9.0` would normally plan to `0.10.0`;
- do not apply/release merely because the changeset exists.

## 27. Definition of done

This plan is complete only when all of the following are true:

- Agent Core has a live Semantic IDE/LSP sibling service;
- `code_symbol` provides reliable symbol/declaration/reference/implementation/diagnostic queries;
- `code_refactor` provides semantic rename, safe delete, replace-body, and insert-before/after;
- mutations are path-validated, fingerprint-checked, and rollback-capable;
- Grafel is marked stale/dirty after semantic source mutation and can be reindexed cleanly;
- Agent Core default root portability remains drive-independent;
- unsupported/unavailable language servers fail soft;
- no Serena memory/REPL/dashboard/basic tools are integrated;
- no current GPL Serena application source is embedded;
- no Python runtime becomes a default Agent Core prerequisite;
- exact source remains final authority;
- machine-control remains direct;
- Memory remains canonical durable-memory authority;
- Grafel remains structural code-intelligence/pattern authority;
- tests required by the approved scope have real PASS evidence;
- CODEBASE reflects implemented state;
- one minor release intent exists;
- no hidden outstanding first-wave item remains.

## 28. Review decisions for the user

The implementation should **not start** until this plan is reviewed.

The important design choices to review are:

1. **Provider architecture**
   - recommended: Node/TypeScript-native LSP provider;
   - no full Serena/Python runtime by default.

2. **Public tools**
   - `code_symbol`
   - `code_refactor`
   - no raw Serena tool explosion.

3. **Initial language scope**
   - TypeScript/JavaScript first;
   - C# next;
   - PowerShell when a compatible server is configured;
   - architecture remains generic.

4. **Language-server installation**
   - first wave: use already available/explicitly configured servers;
   - no silent auto-download.

5. **Mutation behavior**
   - semantic WorkspaceEdit;
   - transactional path/fingerprint validation;
   - no textual rename fallback.

6. **Grafel relationship**
   - complementary sibling;
   - refactor marks Grafel dirty/reindex-needed;
   - no graph replacement.

7. **Licensing**
   - current Serena GPL app remains reference-only;
   - MIT SolidLSP / MIT cutoff may inform reuse;
   - notices preserved for any actual copied MIT code.

## 29. Historical first-wave implementation checklist — closed

The original checklist called for Phase 0–9 implementation and its authorized acceptance gates. The COMPLETE / NO OPEN FIRST-WAVE WORK status at the top of this document supersedes that old OPEN label. Subsequent work and its own evidence are recorded in the [second-wave plan](history-agent-core/Serena-Second-Wave-LSP-Freshness-Multi-Language-Integration-Plan.md); do not rerun first-wave acceptance merely because the original design is retained.

No other Serena-derived implementation is implied by this plan.

Deferred Serena memory/onboarding/context ideas are explicitly **not** first-wave backlog. They become work only if the user separately requests them.
