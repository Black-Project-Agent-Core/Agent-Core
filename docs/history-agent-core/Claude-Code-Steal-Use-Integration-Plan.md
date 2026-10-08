# Claude Code Steal / Use Integration Plan

> **Status:** CC-P1/P2/P3 IMPLEMENTED/LIVE — CC-P4 TARGETED VERIFIED + LIVE-ACTIVATED + INSTALLED-RUNTIME VERIFIED — CC-P5 EXCLUDED — REFERENCE RETIRED
> **Created:** 2026-09-20; source-first re-grounded 2026-09-26 and ecosystem-only re-grounded 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\14-claude-code`
> **Grounded revision:** `b782847db9a18667f00918ea341197f201b22bb4`
> **Repository:** `https://github.com/anthropics/claude-code.git`
> **Reference state at grounding:** clean before the temporary Grafel inspection marker
> **Implementation authority:** CC-P1/P2/P3 were approved/implemented 2026-09-26; re-scoped CC-P4 was explicitly approved and implemented 2026-09-27
> **Legal boundary:** Anthropic PBC All Rights Reserved / Commercial Terms; no source copying. Any selected mechanism must be independently reimplemented as Agent Core-owned code.

## 1. Objective

Identify every mechanism in the available Claude Code checkout that can materially improve Agent Core without importing Claude Code as a runtime, copying proprietary implementation, creating hidden authority gates, adding an autonomous retry loop, or introducing a second model/agent authority.

This plan is source-first. Documentation and prompt-only plugin files are supporting evidence only when no executable source implements the mechanism.

The checkout is not the proprietary Claude Code core implementation. Its executable value is concentrated in public mods, plugin hooks/scripts, repository automation, examples, and the published TypeScript engine contract.

## 2. Grounding method

The audit used:
- exact Git-tracked source at the pinned revision;
- source/test census across all tracked files;
- executable-family census rather than README feature claims;
- direct comparison against current Agent Core source;
- Grafel request-scoped indexing as secondary structural evidence;
- exact source verification over graph-derived conclusions.

No tests from the reference checkout were executed. No reference source was modified except a temporary Grafel marker explicitly authorized for inspection.

## 3. Exhaustive source census

Tracked checkout:
- 1,153 tracked files.
- Approximately 14.26 MB tracked bytes.
- 969 executable/code files.
- 896 TypeScript files, 21 TSX, 21 Python, 21 shell, plus scripts/Terraform/PowerShell.
- Every executable/code file was mapped to `mods/`, `plugins/`, `scripts/`, `examples/`, or the two environment helpers under `.devcontainer/` and `Script/`.

Primary executable families:
- `mods/diff`: 779 files, 199 test files.
- `mods/telemetry`: 81 files, 20 tests.
- `mods/sec-default`: 60 files, 33 tests.
- `mods/types/claude-code.d.ts`: public engine/hook/type contract.
- `plugins/security-guidance`: deterministic patterns, Git-diff review state, optional model review.
- `plugins/hookify`: local rule parsing/evaluation plus prompt-based rule proposal workflow.
- `plugins/ralph-wiggum`: stop-hook repetition loop.
- `plugins/plugin-dev`: format-specific validators and authoring helpers.
- prompt-only review/feature/plugin bundles.
- GitHub issue lifecycle/duplicate automation.
- AWS/GCP gateway deployment examples.
- devcontainer firewall and MDM/settings examples.

The second-pass census found no executable family outside those groups.

## 4. Current Agent Core overlap

Agent Core already owns:
- bounded/redacted local Activity Tracker and failure snapshots;
- durable file-native Memory plus Learning review;
- Reflexion exact/same-family no-progress advisories;
- atomic file persistence and cross-process lock primitives;
- endpoint/credential/redaction hardening;
- Grafel-backed `code_analysis`, `code_surface`, `code_repair`, and request-scoped workspaces;
- Semantic IDE/LSP source operations;
- Git-aware release baseline/intent tooling;
- explicit confirmation/source-verification boundaries for mutating Code Intelligence actions.

Therefore Claude Code mechanisms are candidates only where they add a distinct capability rather than restating existing Agent Core behavior.

## 5. Proposal CC-P1 — Task-local working-tree change evidence

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.

Source evidence:
- `mods/diff/hooks/git/probes/dirty-paths-of/dirty-paths-of.ts`
- `mods/diff/hooks/git/probes/default-branch-of/default-branch-of.ts`
- `mods/diff/hooks/git/probes/merge-base-candidates-of/merge-base-candidates-of.ts`
- `mods/diff/hooks/git/probes/is-safe-ref-name/is-safe-ref-name.ts`
- `mods/diff/hooks/git/argv/git-child-env/git-child-env.ts`
- `mods/diff/hooks/classify/*`
- bounded/debounced refresh and body-load logic in `mods/diff/hooks/register.ts`.

Observed mechanism:
- snapshot dirty/untracked paths before work;
- distinguish pre-existing dirt from changes introduced later;
- use NUL-delimited Git status and deterministic Git locale;
- resolve a default branch through an evidence ladder rather than assuming one;
- treat “no common ancestor” as a stable Git state rather than generic failure;
- narrow ref-name/path handling before filesystem access;
- classify tests/generated/vendor noise separately;
- bound concurrency and context size.

Proposed Agent Core adaptation:
- Agent Core-owned request/task change-evidence helper, non-mutating and advisory.
- Capture a bounded initial working-tree baseline only when explicitly requested by the controller/task.
- Report `preExisting`, `introduced`, `modifiedSinceBaseline`, `untracked`, and `noiseClass` evidence.
- Reuse existing Code Intelligence / Activity Tracker surfaces rather than creating a workflow gate.
- Keep exact source/Git as authority; Grafel may enrich but never replace Git evidence.

Do not adopt:
- Claude Code diff pane/UI.
- auto-open behavior.
- hidden prompt injection of hunks.
- any implicit task completion gate.

## 6. Proposal CC-P2 — Deterministic changed-source security advisories

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.

Source evidence:
- `plugins/security-guidance/hooks/patterns.py`
- `plugins/security-guidance/hooks/security_reminder_hook.py`
- `plugins/security-guidance/hooks/diffstate.py`
- `plugins/security-guidance/hooks/gitutil.py`
- `plugins/security-guidance/hooks/extensibility.py`
- `plugins/security-guidance/hooks/review_api.py`.

Observed mechanism:
- deterministic path/content security rules run on changed files;
- stable rule identifiers kept in sync with the rule table;
- touched-path and baseline-SHA state limits review to changed source;
- findings carry a pending lifecycle and are later rechecked as fixed/unresolved;
- custom project rules are additive, bounded, schema-validated, path-filtered, and screened for common ReDoS structures;
- reminders/config are capped to prevent unbounded prompt/state growth;
- review sets prioritize relevant source and de-emphasize generated/noise files.

Proposed Agent Core adaptation:
- independently implement an Agent Core-owned deterministic advisory scanner in TypeScript.
- Integrate through the existing `code_analysis(kind=security)` / Code Intelligence facade rather than a new tool.
- Default to non-blocking findings with stable IDs, severity, source file/range, rule family, and remediation text.
- Prefer task/change evidence from CC-P1 when available; otherwise accept an explicit file set/scope.
- Track local-only finding lifecycle `new|still-present|resolved` in Activity Tracker evidence, not remote telemetry.
- Allow project-specific additive rules only through a bounded explicit config with strict schema, regex compile checks, ReDoS heuristics, include/exclude globs, reminder length caps, and maximum rule count.
- Built-in findings must not be suppressible by repository-controlled additive guidance.

Do not adopt:
- Anthropic API/SDK review calls.
- hidden second-model vulnerability review.
- stop-hook forcing/rewake loops.
- automatic commit/push review.
- SDK bootstrap/install behavior.

## 7. Proposal CC-P3 — Structured local outcome marks

**Disposition:** CONDITIONAL / LOW-RISK PROPOSAL — user selection required.

Source evidence:
- `mods/telemetry/hooks/telemetry-of/telemetry-of.ts`
- `mods/telemetry/hooks/entries/batch-of.ts`
- `mods/telemetry/hooks/is-analytics-off/is-analytics-off.ts`
- telemetry registration tests.

Observed mechanism:
- event names and feature outcomes use constrained structured values;
- malformed/free-text or non-finite property values are rejected;
- one failed asynchronous send does not poison later queued events;
- authorization/privacy status is evaluated at each emission;
- event batches are bounded and carry explicit feature/outcome identities.

Current Agent Core overlap:
- Activity Tracker is already local, bounded, redacted, journaled, repairable, and fail-soft.
- Remote analytics transport is neither required nor appropriate.

Proposed Agent Core adaptation:
- add an optional typed local `feature/outcome` envelope to Activity Tracker events;
- stable feature IDs and finite bounded properties only;
- reuse existing tracker persistence/redaction/locking;
- make the data available only through existing local history/evidence surfaces;
- no network export and no new analytics backend.

This proposal should be selected only if the user wants more machine-readable local outcome metrics; it is not required for recovery or normal MCP operation.

## 8. Proposal CC-P4 — Provenance-pinned mutable registration metadata

**Disposition:** CONDITIONAL / FUTURE-FIT PROPOSAL.

Source evidence:
- `mods/sec-default/hooks/register.ts`
- provider/tier ownership fields in `mods/types/claude-code.d.ts`
- policy memoization and restoration helpers under `mods/sec-default/hooks/policy`
- sec-default tests covering provider-origin rewrites and concurrent managed reads.

Useful mechanism:
- bind a mutable registration/config row to its original provider/owner;
- refuse silent ownership rewriting;
- use one immutable read snapshot during a short concurrent burst.

Current-fit limitation:
- Agent Core currently has a fixed public MCP surface, explicit subsystem owners, and no general third-party plugin runtime.
- Adopting Claude Code's tiered interceptor/managed-policy authority would violate the no-hidden-gate/direct-machine-control architecture.

Proposed future adaptation only if a dynamic extension registry is later authorized:
- immutable `owner/provider/source` metadata on extension records;
- owner identity included in mutation confirmation;
- short-lived immutable config snapshot for one explicit transaction/burst;
- no tiered bypass mechanism and no change to normal tool authorization.

Do not implement CC-P4 in the present architecture unless a concrete dynamic extension consumer exists.

## 9. Mechanisms already covered — no separate adoption

### Hookify rule engine / conversation-derived rules

Source:
- `plugins/hookify/core/config_loader.py`
- `plugins/hookify/core/rule_engine.py`
- `plugins/hookify/agents/conversation-analyzer.md`.

Useful concept:
- convert an explicit correction into a reusable deterministic warning proposal.

Agent Core already has:
- Reflexion for real failure evidence;
- Learning review;
- durable operational-reflection Memory;
- user-controlled operating contract.

Disposition:
- do not add a second blocking rule database or hidden hook gate.
- if CC-P2 is selected, its optional additive security-rule config may reuse the generic “review before persistence” principle.
- generic behavioral corrections continue through existing Memory/Learning/Reflexion instead of Hookify.

### Session-state locks, TTLs, counters, atomic writes

Claude Code security-guidance maintains per-session lock files, TTLs, bounded touched-path state, warning counters, and atomic-like state transitions.

Agent Core already owns stronger Windows-aware transaction/lock/atomic-file primitives and bounded Reflexion/Tracker state.

Disposition: mechanism is duplicate; preserve Agent Core implementations.

### High-signal finding validation

Prompt-only code-review / PR-review workflows propose multiple findings, independently validate them, and drop unverified results.

Agent Core already requires exact-current-source verification before Code Intelligence candidate mutations and treats graph/model-like findings as evidence rather than authority.

Disposition: retain as controller discipline only; no multi-agent runtime or second-agent orchestration.

## 10. Explicitly rejected mechanisms

### Ralph Wiggum repetition loop

Source:
- `plugins/ralph-wiggum/hooks/stop-hook.sh`
- `plugins/ralph-wiggum/scripts/setup-ralph-loop.sh`.

It prevents normal stop and feeds the same prompt back until a promise/iteration threshold.

**Reject.** This directly conflicts with Agent Core Reflexion and operating doctrine: no autonomous retry loops, no blind repetition, and every retry after failure must materially change evidence/strategy.

### Tiered hook/interceptor authority engine

Source:
- `mods/types/claude-code.d.ts`
- `mods/sec-default`.

**Reject as runtime architecture.** Provider/tier interception, `next.to(...tier)`, managed hook override prevention, and registration gates would create a parallel authority/routing layer that Agent Core explicitly does not use.

Only CC-P4's narrow provenance metadata concept remains conditional.

### Remote telemetry / analytics ingestion

Source:
- `mods/telemetry`.

**Reject.** Agent Core is local-first; upstream cloud telemetry is intentionally disabled. Only CC-P3's local structured-event discipline is potentially useful.

### Hidden LLM/agent security review

Source:
- `plugins/security-guidance/hooks/llm.py`
- prompt-based security/commit review paths.

**Reject.** No hidden second model/provider/agent may become an Agent Core execution or review authority. Deterministic CC-P2 remains model-free.

### Multi-agent feature and PR orchestration

Source:
- `plugins/code-review`
- `plugins/feature-dev`
- `plugins/pr-review-toolkit`
- `plugins/agent-sdk-dev`.

**Reject as Agent Core runtime.** Current controller + Grafel + Semantic IDE already provide exploration/review evidence, and Agent Core must not create hidden subagent orchestration.

### Claude Code plugin-authoring validators

Source:
- `plugins/plugin-dev` validation scripts and prompt agents.

**Reject for current fit.** They validate Claude Code-specific plugin/agent/skill/hook schemas and directory conventions. Agent Core does not have that plugin format. Generic lessons such as schema validation, path portability, input checks, and secret scanning are already present in Agent Core engineering practice.

### GitHub issue lifecycle / duplicate automation

Source:
- `scripts/auto-close-duplicates.ts`
- `scripts/issue-lifecycle.ts`
- `scripts/sweep.ts`
- helper shell scripts/workflows.

**Reject from Agent Core runtime.** These are repository-maintenance automation for the Anthropic issue tracker, not machine-side MCP capability. Any future GitHub maintenance belongs to separately authorized repository automation, not Agent Core execution.

### AWS/GCP Claude Apps Gateway examples

Source:
- `examples/gateway/aws`
- `examples/gateway/gcp`.

**Reject from current scope.** They provision Anthropic-specific cloud gateway infrastructure (IAM, secrets, databases, ECS/Cloud Run, OIDC). Agent Core's current tunnel is a separate local-first boundary. Cloud gateway adoption would be a distinct infrastructure project requiring explicit user request.

### Devcontainer firewall / MDM deployment

Source:
- `.devcontainer/init-firewall.sh`
- `examples/mdm`
- `Script/run_devcontainer_claude_code.ps1`.

**Reject for current fit.** These are environment/deployment policies for Claude Code containers/endpoints. Agent Core already has endpoint policy, local runtime isolation, and machine-specific launcher/runtime management; importing these would introduce platform assumptions and external endpoint policy.

### Example Bash command blocking hook

Source:
- `examples/hooks/bash_command_validator_example.py`.

**Reject as hidden command gate.** Agent Core already has explicit machine-control command policy and controller instructions. Generic warning ideas may be represented by existing advisory/Memory mechanisms, but no new silent hook gate is needed.

## 11. Final family disposition matrix

| Family | Evidence basis | Disposition |
| --- | --- | --- |
| diff Git backend / change model | executable TS + tests | **CC-P1 adopt mechanism, independent implementation** |
| diff UI/pane/rendering | executable TS + tests | reject current fit |
| diff ask/prompt carry | executable TS | reject hidden context injection |
| telemetry structured schema | executable TS + tests | **CC-P3 conditional adaptation** |
| telemetry network transport | executable TS + tests | reject |
| sec-default provenance | executable TS + tests | **CC-P4 future conditional** |
| sec-default tier/policy gates | executable TS + tests | reject |
| security-guidance deterministic patterns | Python source | **CC-P2 adopt mechanism, independent implementation** |
| security-guidance diff lifecycle | Python source | fold into CC-P1/CC-P2 |
| security-guidance LLM review | Python source | reject |
| security-guidance SDK bootstrap | Python source | reject |
| hookify deterministic rules | Python source | existing systems + CC-P2 overlap; no separate runtime |
| hookify conversation rule proposal | prompt config | reuse review-before-persistence principle only |
| ralph loop | shell source | reject |
| plugin-dev validators | shell source/prompt config | reject current fit |
| code-review / feature-dev / PR toolkit | prompt config | controller discipline only, no runtime adoption |
| GitHub issue automation | TS/shell/workflows | reject from Agent Core runtime |
| gateway AWS/GCP | shell/Terraform | reject from current scope |
| devcontainer / MDM / settings examples | shell/PS/config | reject current fit |
| public Claude Code engine types | TS declaration contract | evidence for provenance/event concepts only; do not reproduce API |
| README/changelog/docs | documentation | non-authoritative supporting context only |

After this matrix, no executable family remains without a disposition.

## 12. Proposed implementation sequence after user selection

No phase below is authorized until the user selects its proposal ID.

### Phase A — selected-proposal grounding
1. Re-read the exact cited reference source and tests for only the selected proposal.
2. Re-read current Agent Core owner source.
3. Confirm no intervening Agent Core changes have closed the gap.
4. Write an Agent Core-owned behavioral contract without copying reference source.
5. Define explicit non-goals and security/privacy boundaries.
### Phase B — independent Agent Core implementation
- Implement only selected behavior in Agent Core-owned TypeScript/current architecture.
- Reuse existing Tracker, security, persistence, Memory/Learning, Code Intelligence, and release primitives.
- Do not add Claude Code runtime dependencies, SDKs, plugin host, remote telemetry, model calls, or hidden orchestration.
- Do not change the current 64-tool public surface unless a selected proposal demonstrably cannot fit an existing facade and the user separately approves that public contract change.
- Update the affected docs/CODEBASE.md section in the same task.
- Add one release intent for material shipped behavior.

### Phase C — targeted verification
Verification remains user-controlled.

Candidate targeted checks if authorized:
- selected mechanism unit/contract tests only;
- root TypeScript build if needed for activation;
- release:check-intent;
- release:compat;
- source-vs-graph structural review for any public schema/wiring change;
- explicit live readback only if activation/restart is separately authorized.

No broad regression suite is implied by this plan.

### Phase D — final zero-value census
After all user-selected proposals are either implemented/verified or explicitly declined:
1. rescan all tracked executable families at the pinned/reference revision;
2. compare every previously deferred/conditional mechanism against the then-current Agent Core;
3. scan active Agent Core for any dependency/path/import/marker that still references this checkout;
4. verify Grafel inspection workspace/markers are removed;
5. record final proposal disposition and reference dependency count.

Only when that census proves **zero remaining selectable value and zero dependency** may the protected checkout be treated as a corpse.
## 13. Reference-retirement rule

The reference folder must **not** be deleted now because CC-P4/CC-P5 remain user-approved but prerequisite-bound future mechanisms, and the fixed checkout remains provenance for the independently implemented CC-P1/P2/P3 behavior.

Deletion is authorized by the user's current instruction only after the final zero-value census proves no remaining useful mechanism. Until then:
- keep the checkout at its grounded revision;
- do not modify its source;
- inspection markers must be removed after grounding;
- do not make Agent Core depend on it at runtime/build/test time.

When retirement becomes valid, delete only the protected claude-code reference checkout after preserving this plan as provenance.

## 14. Historical review decision surface — decision completed 2026-09-26

User review should select proposal IDs, not implementation details:
- **CC-P1** — task-local working-tree change evidence.
- **CC-P2** — deterministic changed-source security advisories.
- **CC-P3** — typed local outcome marks.
- **CC-P4** — provenance-pinned mutable registration metadata, future/conditional.
- **CC-P5** — native AI session/event contract, conditional on the future `New Chat` runtime.

Possible decision for each: APPROVE, DEFER, or REJECT.

Nothing in this plan installs or activates any proposal.
## 15. Grounding confidence and limitations

High-confidence conclusions:
- checkout revision/state and tracked-file census are direct Git evidence;
- mod/plugin mechanisms described above were read from executable source and, where available, tests;
- Agent Core overlap was checked against exact current source;
- all executable/code files were assigned to an audited family;
- the reference license prevents verbatim source adoption;
- the checkout contains useful selectable mechanisms, so it is not currently a corpse.

Limitations:
- proprietary Claude Code core implementation is not present in this checkout and cannot be inferred from the public mods/type contract;
- prompt-only agents/skills describe intended workflows, not runtime proof;
- Grafel findings are secondary evidence and were not accepted without exact-source support;
- no reference tests or Agent Core implementation tests were run during plan creation;
- source may evolve upstream after the grounded revision; this plan is about the pinned revision unless explicitly refreshed.

## 16. Grounding completion criteria

This grounding pass is complete when:
- plan existence was checked first;
- exact pinned source was inspected;
- executable-family census accounted for all code files;
- current Agent Core overlap was checked;
- adoptable and rejected mechanisms were separated;
- legal/runtime boundaries were recorded;
- temporary inspection marker/workspace were removed;
- protected reference returned to a clean Git state;
- no implementation occurred before user selection.

**Historical 2026-09-26 plan state (superseded by §19):** CC-P1/P2/P3 implemented and build-qualified; CC-P4/P5 were user-approved but deferred under the then-current prerequisites.

## 17. Source-first re-grounding after native AI direction — 2026-09-26

Exact checkout remains clean at `b782847db9a18667f00918ea341197f201b22bb4`; all previously classified executable families remain accounted for. Current Agent Core source/Grafel state was re-compared rather than trusting the 2026-09-20 overlap snapshot.

- **CC-P1 — RETAIN, NARROWED.** Existing `scripts/inspect/workspace-fingerprint.mjs` now owns aggregate HEAD/status/diff evidence. The remaining gap is bounded per-path task-local attribution: `preExisting`, `introduced`, `modifiedSinceBaseline`, `untracked`, and noise classification, anchored to explicit before/after fingerprints and never claiming causality from a digest alone.
- **CC-P2 — RETAIN, CURRENT-FIT.** Agent Core has provider-backed security analysis but no native deterministic changed-file scanner with stable rule IDs and a local finding lifecycle. Keep it advisory/non-blocking and model-free.
- **CC-P3 — RETAIN, CURRENT-FIT.** Activity Tracker is bounded/redacted but has no typed local `feature/outcome` envelope. No network telemetry is proposed.
- **CC-P4 — RETAIN, CONDITIONAL.** Provenance-pinned registration metadata becomes relevant only if Agent Core later gains a dynamic skill/capability registry; it must not create tier/interceptor authority.
- **CC-P5 — NEW CONDITIONAL PROPOSAL: native AI session/event contract.** The public type contract provides behavioral evidence for session identity, per-user-prompt correlation, cwd/workspace, permission mode, model changes, tool lifecycle, and agent identity. Agent Core currently has no native AI conversation/session model. If the planned `New Chat` runtime is selected, independently define an Agent Core-owned session event contract for session start/end, user prompt, model selection/change, permission decision, tool invocation/result/failure, and final-answer correlation.

CC-P5's future owner should be a small Agent Core-native AI session layer consumed by the future model/chat runtime. It may reuse Activity Tracker and existing invocation IDs but must not become a hidden hook gate, second authorization system, subagent framework, or provider-routing authority. The architecture remains `User -> AI model -> Agent Core -> task`.

No additional executable family remains unclassified after rechecking diff, telemetry, security-guidance, hookify, ralph, plugin-dev, public engine types, repository automation, gateways and environment examples. The checkout is **RETAINED**, not corpse. No implementation or runtime dependency is introduced by this re-grounding.


## 18. Approved implementation execution — 2026-09-26

User approved the re-grounded task plan. CC-P1/P2/P3 were independently implemented in Agent Core-owned code; no Claude Code runtime/source dependency was added.

- **CC-P1 implemented:** `scripts/inspect/workspace-fingerprint.mjs` now records bounded per-path status/content-hash evidence with noise classification and compares snapshots into `preExisting`, `introduced`, `modifiedSinceBaseline`, `resolved`, and `untracked`. Reports explicitly state that path evidence does not establish causality.
- **CC-P2 implemented:** `code_analysis(kind=security, analysisPreset=changed_source)` accepts explicit `worktreePath`, bounded `changedFiles`, and optional additive rules. `src/code-intelligence/changed-source-security.ts` enforces regular-file/path-containment bounds, stable rule IDs, ReDoS screening, size budgets, and `new|still-present|resolved` local lifecycle evidence without emitting matched secret values.
- **CC-P3 implemented:** `ActivityTracker.recordOutcome()` adds a bounded local-only `featureId/outcome/properties` envelope. No network analytics transport exists.
- **CC-P4 approved-deferred:** no live dynamic extension/skill registry consumer exists yet, so no dormant registration authority was added.
- **CC-P5 approved-deferred:** `New Chat` remains intentionally placeholder-only; native model/session/tool-loop events wait for a separately mature chat-runtime implementation.
Qualification evidence: final root `npm run build` exited 0 with `PATH POLICY PASS — 245 authored files scanned; 0 documented exceptions`; both modified `.mjs` programs passed `node --check`. Structural impact review covered `registerCodeIntelligenceTools`, `registerMemoryTools`, MemoryService and LearningCurator against a current Grafel index, with exact source retained as authority. No broad or targeted test suite was run because test execution remains user-controlled.

Release intent `.changeset/20260926-four-reference-adoption.md` is minor. `release:check-intent` returned `ok=true`; `release:plan` remains `0.13.0 -> 0.14.0` with 10 pending intents. Rebuilt `dist` contains the changes, but live Node Core was not restarted, so activation is not claimed.

Historical 2026-09-26 disposition: the protected `memory\\14-claude-code` checkout was retained because CC-P4/P5 were then prerequisite-bound. Current ecosystem-only disposition is defined in §19.

## Live activation readback — 2026-09-26

After explicit user approval, the desktop/Core was manually restarted. The active Node Core is PID 5532, started at 2026-09-26T23:35:48.9943128+07:00 from project-local runtime\node\node.exe. /health reports status=ok and loads the same rebuilt dist that contains CC-P1/P2/P3. CC-P1 is standalone tooling and required no runtime activation. CC-P2/P3 are present in the live dist, but direct changed_source invocation from this ChatGPT turn is blocked before reaching Core because the client-side cached MCP manifest still exposes the old code_analysis enum/fields. Current source and compiled server schema include changed_source, changedFiles, and securityRules. This client-cache limitation is not recorded as a Core runtime failure; direct chat acceptance should be repeated after MCP tool-manifest refresh. CC-P4/P5 remain prerequisite-deferred.

## 19. Ecosystem-only source-first re-grounding — 2026-09-27

The checkout is still clean at the exact previously grounded revision `b782847db9a18667f00918ea341197f201b22bb4`; no upstream-source drift exists relative to the 2026-09-26 family census. The current Agent Core architecture changed materially, however: the live `SkillService` now provides an artifact catalog plus explicit revision staging/evidence/promotion/rollback. That new owner changes the disposition of CC-P4.

This pass is strictly Agent Core **system/ecosystem** scope. New Chat, native AI session/model/tool-loop runtime and provider runtime are excluded.

### CC-P4 — CURRENT-FIT PROPOSAL: provenance-pinned Skill artifact source identity

Source evidence remains the public `sec-default` registration mechanism: mutation decisions are tied to the event's pinned origin/provider and policy reads fail closed. Because the Claude Code license is proprietary/all-rights-reserved, only the mechanism may be independently reimplemented.

Current Agent Core gap:
- Skill artifacts persist content digest/import time/parser profile;
- revision metadata persists name/digest/evidence refs/previous digest;
- current SkillService has no durable source repository/worktree/origin provenance;
- therefore a later same-name revision can be staged from a materially different source lineage without that lineage change being first-class evidence.

Independent Agent Core adaptation:
- add bounded `SkillSourceProvenance` to active/staged/history artifact metadata using Agent Core-owned repository identity primitives;
- record source kind (directory/archive), content digest, declared license when present, repository/worktree identity when resolvable, and bounded Git checkpoint evidence when available;
- do not persist secrets or require a Git repository;
- same repository/worktree lineage proceeds through existing revision evidence rules;
- a material source-lineage change is visible in `inspect/list_revisions` and requires an explicit source-change confirmation at promotion time;
- moved/copied worktrees are compared through existing repository/worktree identity rather than literal drive/path strings;
- source provenance is historical evidence only and never grants tool/execution authority;
- ordinary `import` collision behavior, staged non-execution, exact-digest promotion and rollback remain unchanged.

Acceptance for a later implementation:
- active/staged/history artifacts expose deterministic bounded provenance;
- path relocation alone does not masquerade as an unrelated source when repository identity matches;
- materially different source identity cannot be silently promoted;
- missing Git provenance fails soft to directory/archive identity rather than blocking valid local skills;
- provenance metadata cannot contain credentials;
- no tiered hook/interceptor/provider execution system is introduced.

### CC-P5 — REMOVED FROM CURRENT PROPOSAL SURFACE

The historical native AI session/event contract is valid evidence only for a future New Chat/runtime workstream. It is explicitly out of scope for this ecosystem grounding and is not a reason to retain the checkout for the current task.

### Final family disposition

- CC-P1/P2/P3: already adopted/covered.
- CC-P4: implemented and targeted-verified; live restart pending.
- CC-P5: excluded by explicit ecosystem-only scope.
- Hookify/Ralph/tiered interception, remote telemetry, automatic model security review, plugin runtime, GitHub automation, gateway/devcontainer/MDM examples: remain rejected or support-only.

**Reference disposition:** RETIRED/DELETED 2026-09-27. CC-P4 is implemented and targeted-verified; CC-P5 remains explicitly outside ecosystem scope. Fresh post-adoption census found zero current `src`/`scripts` path dependencies, zero non-shell live consumers, and no remaining current-fit ecosystem residual. Evidence: `runtime/tmp/graphiti-claude-codemem-tencent-post-adoption-retirement-20260927.json`.

## 20. CC-P4 approved implementation closure — 2026-09-27

CC-P4 is independently implemented in the Agent Core SkillService without copying Claude Code source:
- `SkillSourceProvenance` records source kind, content digest, declared license, and Agent Core repository/worktree identity when resolvable;
- active, staged, and history artifacts preserve provenance in Agent Core-owned metadata;
- list/inspect/revision surfaces expose provenance as historical evidence only;
- promotion still verifies the exact incumbent digest first;
- when active and staged artifacts have materially different source lineage, promotion additionally requires `CONFIRM_SKILL_SOURCE_CHANGE`;
- path strings do not become source authority, and missing Git identity falls back to directory/archive identity without blocking local skills;
- no tiered hook/interceptor/provider execution authority was introduced.

Targeted tests directly prove provenance persistence and source-lineage confirmation. Existing revision lifecycle regression was updated and remains PASS. This checkout was then retired under the fresh zero-value census. After the user-controlled restart/reconnect, resident Core PID 1624 is running the rebuilt `dist\index.js`; `/health` is `ok` and the fresh connector exposes the 70-tool manifest that includes this wave. CC-P4 is therefore live-activated and installed-runtime verified; CC-P5 remains intentionally excluded.
