# Changesets Re-Grounding + Selective Adoption Plan — Agent Core

> **Status:** COMPLETE — IMPLEMENTED — TARGETED VERIFIED — REFERENCE RETIRED
> **Updated:** 2026-09-20
> **Former reference:** <PROJECT_ROOT>\Audit\Changesets
> **Reference origin:** https://github.com/changesets/changesets.git
> **Grounded revision:** c9269c01af5f3f7463adc648890fc3a8a729dd18
> **Reference state:** retired/deleted after final zero-value census; provenance retained in this plan and scoped backups
> **Reference license:** MIT
> **Scope:** exhaustive source/test/history re-grounding of the Changesets revision previously used by Agent Core, followed by selective second-wave proposals only
> **Install gate:** user explicitly approved execution of C2-P1 through C2-P4 on 2026-09-20; no additional Changesets mechanism is authorized beyond this documented scope

## 1. Purpose

Re-ground Changesets after the Agent Core corruption/recovery cycle and determine, from exact source rather than documentation claims, whether any mechanism remains worth stealing/adapting into Agent Core.

This document supersedes the old assumption that Phase 0–7 plus deferred snapshot/prerelease exhaustively described the useful surface.

The re-grounding separates:

- mechanisms already implemented in Agent Core;
- mechanisms where Agent Core is already stronger or more appropriate;
- Changesets mechanisms that are monorepo/npm-specific and should remain rejected;
- genuinely useful second-wave mechanisms still absent from Agent Core;
- conditional mechanisms that are useful only if the user wants a new release workflow.

No Changesets runtime, publishing workflow, Git mutation, release application, package installation, or release state mutation is authorized by this plan.

## 2. Audit method and evidence

Primary evidence was exact code, tests, Git history, current Agent Core release source, and current .changeset/config.json.

Grounded Changesets source facts:

- exact HEAD: c9269c01af5f3f7463adc648890fc3a8a729dd18;
- origin: https://github.com/changesets/changesets.git;
- 21 packages under packages\;
- 128 tracked package source/test files under package src trees;
- source families inspected include apply-release-plan, assemble-release-plan, config, get-dependents-graph, get-release-plan, git, parse, pre, read, release-utils, should-skip-package, types, write, CLI status/version/pack/publish-plan/publish, changelog helpers, and relevant utility code;
- current and recent Git history was inspected through the grounded revision, including dependency-range preservation, pre-mode changeset movement, private-package behavior, status/publish refactors, changed-file handling, and snapshot behavior;
- source tests were read for snapshot planning, prerelease enter/exit, Git change detection, config validation, dependency propagation, and apply-release behavior;
- tests were not executed during this planning task;
- Grafel workspace registration/indexing was attempted with the user-authorized marker, but provider state remained dirty/queued; exact current source therefore remained authority and graph output was not used as factual proof.

Current Agent Core release source compared directly:

- .changeset\config.json;
- scripts\release\create-intent.mjs;
- scripts\release\release-lib.mjs;
- scripts\release\release-plan.mjs;
- scripts\release\sync-version.mjs;
- scripts\release\apply-release.mjs;
- scripts\release\current-line-baseline.mjs;
- scripts\release\check-release-intent.mjs;
- scripts\release\package-release.mjs;
- root package.json release scripts and current release/archive semantics.

## 3. Current Agent Core baseline

The first Changesets-derived wave is already implemented and must not be reimplemented.

Current Agent Core already has:

- .changeset/*.md release-intent ledger;
- @changesets/parse as the only direct Changesets-derived package dependency;
- deterministic highest-bump aggregation;
- read-only release:plan and release:plan --json;
- root package.json::version as canonical product-version authority;
- deterministic cross-surface release:sync-version;
- explicit transactional release:apply;
- root CHANGELOG generation from consumed intents;
- applied-intent archival rather than destructive evidence loss;
- synthetic current-line Git baseline refs/agent-core/current-line-baseline;
- read-only release:check-intent;
- read-only release:compat;
- stable immutable release\v<version>\ packaging with notes, manifest and SHA-256;
- no automatic commit/tag/push/publish/deploy/restart;
- legacy GitHub explicitly excluded as release authority.

The current stable version remains 0.11.0 and pending minor intents target 0.12.0. This re-grounding must not consume or apply those intents.
## 4. Exact mechanism census

### C01 — Changeset Markdown parser

Changesets parses YAML-like frontmatter into package/version bump records and a summary, with validation for malformed frontmatter, invalid package names, and unsupported release types.

**Disposition:** ALREADY ADOPTED.

Agent Core already uses @changesets/parse directly and adds a stricter single-product rule: each intent must target exactly agent-core and use patch, minor, or major.

### C02 — Changeset writer / unique intent IDs

Changesets writes quoted package names, human-readable unique IDs, and optional formatting.

**Disposition:** ALREADY ADOPTED / AGENT CORE FIT IS STRONGER.

Agent Core create-intent.mjs generates collision-resistant timestamp+random IDs, validates the generated content through the official parser, writes with exclusive-create semantics, and avoids formatter/runtime coupling.

### C03 — Changeset reader filtering

Changesets readChangesets() ignores hidden Markdown files plus README.md, AGENTS.md, CLAUDE.md, and GEMINI.md before parsing changeset files.

**Disposition:** PARTIALLY ADOPTED — REMAINING HARDENING VALUE.

Agent Core readPendingChangesets() excludes README.md but otherwise attempts to parse every root .md file. In an AI-operated repository, instruction files placed inside .changeset can therefore become accidental parse failures. This is a small but real source-derived gap.

### C04 — Highest bump aggregation

Changesets flattens multiple changesets and resolves the effective release level.

**Disposition:** ALREADY ADOPTED.

Agent Core calculateReleasePlan() deterministically collapses pending intents to the highest patch/minor/major bump while preserving all contributing intent IDs and summaries.

### C05 — Read-only status / machine-readable release plan

Changesets status can return a release plan and write JSON output.

**Disposition:** ALREADY ADOPTED.

Agent Core release:plan is read-only and release:plan --json already provides product, currentVersion, bump, nextVersion, and contributing intents.

### C06 — Version application

Changesets apply-release-plan updates package versions, dependency ranges, changelogs, and removes/moves consumed changesets.

**Disposition:** ALREADY ADOPTED BY DIFFERENT SINGLE-PRODUCT IMPLEMENTATION / AGENT CORE STRONGER.

Agent Core release:apply uses an Agent Core-owned transaction over all product-version surfaces and changelog, then archives rather than discards consumed intents. It explicitly avoids automatic commit/tag/push/publish/restart.

### C07 — Cross-surface version synchronization

Changesets owns package-version edits and dependency-range edits in a monorepo.

**Disposition:** ALREADY ADOPTED IN PRODUCT-SPECIFIC FORM.

Agent Core synchronizes root package/lock, UI package/lock, generated src/version.ts, and native launcher metadata from root package.json. The vendored machine-control version remains intentionally independent.

### C08 — Declarative changedFilePatterns

Changesets config exposes changedFilePatterns and its Git/package-change detector actually consumes that config when deciding whether a package changed.

**Disposition:** PARTIALLY PRESENT BUT NOT WIRED — HIGH-VALUE GAP.

Agent Core .changeset/config.json already declares changedFilePatterns, but check-release-intent.mjs and current-line-baseline.mjs do not read that field. They independently hard-code release-relevant scopes. The config therefore currently advertises policy that is not authoritative.

### C09 — Git divergence/change detection

Changesets uses merge-base and changed-file discovery relative to a branch/ref.

**Disposition:** CONCEPT ADOPTED WITH SAFER AGENT CORE LINEAGE BOUNDARY.

Agent Core intentionally uses refs/agent-core/current-line-baseline rather than baseBranch/legacy/main. The synthetic local ref avoids coupling current Agent Core to the legacy GitHub line and is the correct authority for this product.

### C10 — Shallow-clone deepening

Changesets can fetch additional history when file-add commits are ambiguous in a shallow clone.

**Disposition:** REJECT FOR CURRENT AGENT CORE RELEASE INTENT.

Agent Core release intent must not contact remotes or mutate repository history just to decide whether an intent is missing. Its synthetic local baseline removes this requirement.

### C11 — Fixed package groups

Changesets forces configured package groups to share release versions.

**Disposition:** REJECT / NOT APPLICABLE.

Agent Core is one product with one canonical product version. UI and launcher versions are derived surfaces, not independently released packages.

### C12 — Linked package groups

Changesets raises linked package versions together while preserving group constraints.

**Disposition:** REJECT / NOT APPLICABLE.

Agent Core does not have independently published linked packages.

### C13 — Dependency graph propagation

Changesets recursively adds dependent package releases and rewrites dependency ranges, including workspace protocol and bounded range preservation.

**Disposition:** REJECT FOR PRODUCT RELEASE AUTHORITY.

Agent Core does not independently version/publish internal workspaces. Product-version surfaces are synchronized directly. Importing dependency bump propagation would create false package-release semantics.

### C14 — Ignore/private-package release rules

Changesets can skip ignored/private packages and validates skipped dependents.

**Disposition:** NOT NEEDED AS PACKAGE VERSIONING LOGIC.

Agent Core release intent is product-level. Exclusion policy belongs to release relevance and package/archive boundaries rather than npm package skip semantics.

### C15 — Changelog generation

Changesets can generate release and dependency changelog entries, optionally enriched from Git/GitHub.

**Disposition:** CORE ADOPTED; NETWORK ENRICHMENT REJECTED.

Agent Core already writes deterministic local changelog/release notes from archived intent summaries. GitHub/API enrichment would add credentials/network dependency without improving release authority.

### C16 — Automatic Git commit/tag/push

Changesets CLI can commit version changes, create tags, and publishing flows can interact with Git remotes.

**Disposition:** REJECT.

Agent Core policy explicitly requires commit/tag/push/publish to remain separately authorized user actions.

### C17 — npm/package-manager publishing orchestration

Changesets supports publish plans, npm/pnpm/yarn behavior, registry inspection, package ordering, dist-tags, and private-package tags.

**Disposition:** REJECT.

Agent Core is packaged locally and does not use Changesets as a registry publishing authority.

### C18 — Snapshot version synthesis

Changesets assemble-release-plan can synthesize snapshot identities using tag, commit, commit-short, timestamp, and datetime placeholders. Source tests cover default and tagged snapshots.

**Disposition:** UNIQUE AND POTENTIALLY USEFUL, BUT RAW APPLY BEHAVIOR MUST NOT BE COPIED.

Changesets snapshot versioning is tied to its version/apply flow. Agent Core should not mutate stable package.json, consume pending intents, or replace immutable stable release archives merely to create an experimental artifact. The useful mechanism is the non-stable identity calculation plus isolated packaging concept.

### C19 — Prerelease mode state machine

Changesets pre mode uses .changeset/pre.json with mode pre|exit and a tag; enter/exit operations are explicit and source tests cover invalid transitions.

**Disposition:** UNIQUE BUT CONDITIONAL.

This is useful only if Agent Core actually wants beta/next/rc channels with persistent release state. Current Agent Core has stable local releases plus pending intents, so adding channel state today would expand release semantics materially.

### C20 — Prerelease changeset movement

Changesets moves versioned prerelease changesets into .changeset/pre and later resolves exit behavior.

**Disposition:** REJECT AS A DIRECT TRANSPLANT.

Agent Core keeps applied-intent archives as evidence. If prerelease channels are ever selected, their intent accounting must preserve Agent Core audit history rather than silently mirror Changesets file movement.

### C21 — Snapshot/prerelease package dependency-range rewriting

Changesets rewrites internal package dependency ranges to exact snapshot/prerelease-compatible values.

**Disposition:** REJECT / NOT APPLICABLE.

Agent Core does not need internal independently versioned package ranges.

### C22 — Formatter auto-detection for changesets/changelogs

Changesets can auto-detect formatters and format generated files.

**Disposition:** REJECT.

Release metadata correctness must not depend on formatter discovery or new toolchains.

### C23 — NDJSON/process output parsing

Changesets CLI includes helpers for structured package-manager output.

**Disposition:** NO UNIQUE VALUE.

Agent Core release tooling already emits deterministic JSON where machine-readable output is needed.

### C24 — Release package/publish planning

Changesets can build publish plans and dependency-safe publish order.

**Disposition:** AGENT CORE HAS A DIFFERENT STRONGER LOCAL PACKAGING CONTRACT.

Agent Core release:package builds an allowlisted immutable local archive with release manifest, release notes, checksum, source snapshot, and explicit secret/runtime exclusions.

### C25 — Config validation

Changesets validates config types and cross-field/group invariants.

**Disposition:** PARTIALLY USEFUL.

Most package-group validation is irrelevant, but release-relevance and future snapshot/prerelease configuration should be schema-validated if selected. Agent Core should validate only the small subset it actually owns rather than import the full Changesets config runtime.
## 5. Remaining selectable proposals

Only the following mechanisms survived the source-based zero-value census.

### Proposal C2-P1 — Wire declarative release-relevance policy

**Priority:** HIGH
**Default recommendation:** SELECT
**Source inspiration:** Changesets changedFilePatterns config consumed by getChangedPackagesSinceRef().

Problem proven in current Agent Core:

- .changeset/config.json already declares changedFilePatterns;
- release:check-intent ignores that field and independently hard-codes release-relevant paths;
- release:baseline independently hard-codes another path list;
- therefore one visible policy file is currently not the actual authority for release relevance.

Proposed Agent Core adaptation:

1. Introduce a small Agent Core-owned release-policy reader for the subset of .changeset/config.json Agent Core actually supports.
2. Validate changedFilePatterns as a bounded array of non-empty strings.
3. Use one shared release-relevance function from both current-line-baseline and check-release-intent so baseline capture and missing-intent enforcement cannot drift.
4. Preserve mandatory release-control paths that cannot be self-excluded, including package.json/package-lock.json, scripts/release, and the release policy itself.
5. Apply changedFilePatterns only to product/source relevance, not as permission to exclude release-control code.
6. Keep generated artifacts and test-only exclusions explicit and centralized.
7. Keep legacy/main forbidden; this does not change the synthetic current-line baseline authority.

Primary targets if selected:

- scripts/release/release-policy.mjs or equivalent shared helper;
- scripts/release/check-release-intent.mjs;
- scripts/release/current-line-baseline.mjs;
- .changeset/config.json only if pattern semantics need clarification;
- release-focused targeted tests if authorized.

Value:

- turns existing config into real policy rather than decorative/stale metadata;
- removes duplicated path logic;
- reduces false-positive/false-negative release-intent enforcement drift;
- preserves Agent Core's stronger current-line lineage boundary.

### Proposal C2-P2 — Harden intent reader against AI-host instruction Markdown

**Priority:** HIGH / SMALL
**Default recommendation:** SELECT
**Source inspiration:** Changesets readChangesets() explicitly ignores hidden Markdown plus README.md, AGENTS.md, CLAUDE.md, and GEMINI.md.

Problem proven in current Agent Core:

- readPendingChangesets() currently parses every root .changeset/*.md except README.md;
- Agent Core is routinely operated by multiple AI hosts/controllers;
- an instruction file such as AGENTS.md, CLAUDE.md, or GEMINI.md placed under .changeset would be treated as release intent and fail parsing.

Proposed adaptation:

- centralize ignored metadata Markdown names;
- ignore hidden Markdown files and known AI-host instruction files before parsing;
- keep pending intent recognition narrow and deterministic;
- do not silently ignore malformed files that are actually named as Agent Core intent files;
- preserve strict parser failure for real intent candidates.

Primary target:

- scripts/release/release-lib.mjs readPendingChangesets().

Value:

- prevents accidental instruction/context Markdown from becoming release metadata;
- keeps malformed real intents fail-closed;
- requires no new runtime or publishing subsystem.

### Proposal C2-P3 — Safe non-consuming snapshot artifacts

**Priority:** MEDIUM
**Default recommendation:** SELECT only if experimental/test binaries are useful to the user
**Source inspiration:** Changesets snapshot suffix generation using tag, commit, commit-short, datetime, and timestamp placeholders.

Do not copy raw Changesets snapshot application behavior. Agent Core snapshot packaging must not consume stable pending intents, mutate the active product version, overwrite stable archives, refresh the release baseline, or create Git tags/commits.

Preferred Agent Core shape:

- release:snapshot-plan — read-only preview of the pending stable plan plus proposed snapshot identity;
- release:snapshot-package — explicit packaging action producing an isolated non-stable artifact;
- default identity based on the calculated next stable version plus a bounded suffix such as dev.<datetime> or <tag>.<datetime>.<short-commit>;
- optional template variables limited to a validated allowlist derived from Changesets: tag, commit, commit-short, datetime, timestamp;
- snapshot artifacts stored separately from immutable stable release\v<version> archives;
- pending .changeset intents remain untouched;
- root package.json and active src/version.ts remain stable unless the implementation uses an isolated staging copy;
- if runtime product identity inside the snapshot must show the snapshot version, apply temporary version edits only inside a disposable staging tree, never the live worktree.

Potential implementation boundary:

- scripts/release/snapshot-plan.mjs;
- scripts/release/snapshot-package.mjs;
- shared pure snapshot identity helper;
- package.json scripts;
- release packaging code refactored only enough to accept an isolated staging identity.

Value:

- lets the user produce experimental binaries without pretending they are stable releases;
- preserves stable 0.11.0/next-0.12.0 release intent state;
- captures the useful Changesets snapshot identity concept without adopting its package-version mutation model.

### Proposal C2-P4 — Explicit prerelease channel state

**Priority:** LOW / CONDITIONAL
**Default recommendation:** DEFER unless the user explicitly wants beta/next/rc channels
**Source inspiration:** Changesets pre.json state machine with explicit enter/exit transitions.

Potential Agent Core shape if selected:

- explicit release:pre-enter <tag> and release:pre-exit commands;
- small validated .changeset/pre.json state containing only mode and tag plus Agent Core-specific audit metadata if needed;
- release:plan displays channel state and proposed prerelease identity;
- release:apply in prerelease mode must preserve intent evidence rather than silently lose/move it;
- stable release archives remain separate and immutable;
- no npm dist-tag, registry publish, Git tag, or remote behavior is implied.

Why conditional:

- Agent Core currently has no established beta/next/rc distribution channel;
- adding prerelease state changes release semantics more deeply than snapshot artifacts;
- there is no current need to create persistent channel state merely because Changesets supports it.

## 6. Proposal dependencies

- C2-P1 and C2-P2 are independent and can be selected separately.
- C2-P3 is independent of prerelease mode and should remain stateless/non-consuming.
- C2-P4 is a larger release-lifecycle change and must not be implicitly pulled in by C2-P3.
- No proposal authorizes release:apply, release:baseline, commit, tag, push, publish, deploy, or restart.
## 7. Explicit rejection set after re-grounding

The following Changesets mechanisms are closed as no-adopt items for the current Agent Core architecture unless the user later changes the product/release model:

- npm/pnpm/yarn publishing orchestration;
- registry inspection and dist-tag management;
- automatic Git commit;
- automatic Git tag creation;
- automatic Git push/fetch/deepen as part of release-intent enforcement;
- GitHub changelog enrichment that requires network credentials;
- independent fixed-package groups;
- linked-package groups;
- recursive package dependency release propagation;
- workspace protocol dependency-range rewriting;
- private npm package tag/version semantics;
- formatter auto-detection for release metadata;
- package-manager-specific NDJSON publish parsing;
- Changesets CLI command tree as an Agent Core runtime dependency;
- Changesets as an MCP/runtime release gate;
- any release daemon, scheduler, or automatic release application.

These are not hidden backlog. They are rejected for the current single-product/local-release architecture.

## 8. Source-derived behavior that must not be copied blindly

1. Changesets prerelease reader contains an explicit TODO noting pre-state validation is incomplete. Agent Core must validate any persistent prerelease state before use.
2. assemble-release-plan intentionally mutates release maps while iterating dependency/fixed/linked constraints. Agent Core should keep pure/single-product planning where possible.
3. Raw snapshot mode is coupled to the version/apply pipeline. Agent Core must not consume or mutate stable release state just to create an experimental build.
4. Changesets apply-release-plan normally deletes or moves consumed changeset files. Agent Core's archived-intent evidence model is stronger and must remain.
5. Changesets Git helpers may deepen shallow clones via fetch. Agent Core release enforcement must remain local and must not contact a remote implicitly.
6. Changesets config contains many monorepo/npm fields that do not belong in Agent Core. Do not import the full config schema merely to reuse changedFilePatterns or snapshot fields.
7. Changesets version command can optionally commit output. Agent Core must keep version application and Git authorization separate.
8. Publishing code mixes release planning with external registry state. Agent Core local packaging must stay registry-independent.

## 9. User selection result

The user explicitly approved execution of the complete second-wave plan on 2026-09-20.

Selection result:

- [x] C2-P1 — Wire declarative release-relevance policy
- [x] C2-P2 — Harden intent reader against AI-host instruction Markdown
- [x] C2-P3 — Safe non-consuming snapshot artifacts
- [x] C2-P4 — Explicit prerelease channel state
- [ ] Reject all

P3 and P4 remain architecturally separate: snapshot artifacts are stateless/non-consuming, while prerelease channels use explicit persistent state and separate package sequencing. Neither authorizes stable release application.

## 10. Implementation phases after selection

### Phase 0 — Freeze current release state

- record current stable version and pending intent list;
- preserve immutable release archives;
- do not run release:apply or release:baseline;
- make scoped backups of only release-policy/tooling files to be touched;
- keep current 0.12.0 pending intent set intact.

### Phase 1 — P1 declarative relevance, if selected

- centralize release relevance in one shared helper;
- validate the supported config subset;
- wire baseline capture and intent enforcement to the same policy;
- retain mandatory control-plane paths that config cannot exclude;
- preserve generated/test-only exclusions and legacy boundary.

### Phase 2 — P2 reader hardening, if selected

- add ignored metadata/instruction filename policy;
- ignore hidden Markdown and known AI-host instruction files;
- retain fail-closed parsing for real intent candidates;
- preserve exclusive intent creation and official @changesets/parse validation.

### Phase 3 — P3 safe snapshots, if selected

- implement pure snapshot identity calculation first;
- add read-only snapshot plan;
- package only after explicit command;
- keep live worktree/stable version/pending intents unchanged;
- if snapshot runtime identity is required, use isolated staging version edits;
- store snapshots outside stable release archive namespace.

### Phase 4 — P4 prerelease state, if selected

- define validated minimal state schema;
- implement explicit enter/exit transition rules;
- integrate channel state into release plan without registry behavior;
- preserve archived intent provenance across prerelease cycles;
- define stable-exit semantics before enabling mutation.

### Phase 5 — Documentation/memory synchronization

Only after a selected mechanism is implemented:

- update CODEBASE.md in the same task;
- update root MEMORY.md for implemented release behavior;
- refresh the durable Changesets release-strategy memory when implementation state materially changes;
- update this plan from proposal to exact implemented/verified state;
- create release intent for shipped behavior changes as required by Agent Core's own release policy.

### Execution result — 2026-09-20

Implemented natively without adding a new dependency/toolchain:

- scripts\release\release-policy.mjs now owns the supported Changesets config subset, validates bounded project-relative changedFilePatterns, centralizes generated/test-only exclusions, mandatory release-control paths, baseline pathspecs, pending-intent detection, and metadata-Markdown filtering.
- release:check-intent and release:baseline now consume the same shared release-policy helper. The synthetic local ref remains the only baseline authority; legacy/main is still forbidden.
- readPendingChangesets() now filters hidden/metadata Markdown before parsing while real intent candidates remain fail-closed through @changesets/parse.
- .changeset/config.json now includes the selected snapshot policy with calculated stable target versions and the bounded {tag}.{datetime}.{commit-short} prerelease template.
- snapshot-lib.mjs provides pure validated snapshot identity generation using only tag, commit, commit-short, datetime, and timestamp placeholders.
- release:snapshot-plan is read-only and release:snapshot-package creates an allowlisted artifact under release\snapshots\<artifactVersion> without consuming pending intents or mutating stable product identity/baseline/stable archives.
- development-artifact.mjs packages snapshot/prerelease artifacts with a separate artifact identity, stable runtime product identity, explicit non-consuming boundary, manifest, notes, ZIP, and SHA-256.
- release-state.mjs fingerprints stable product/release state and aborts/removes development artifact output if packaging changes stable package/version/changelog/pending-intent/baseline/archive state.
- prerelease-lib.mjs implements validated versioned prerelease state with explicit pre|exit modes, tag validation, sequence tracking, atomic state writes, invalid-transition rejection, and concurrent-sequence checking.
- release:pre-enter, release:pre-exit, and release:pre-package are explicit commands. Prerelease packaging leaves stable pending intents untouched and advances sequence only after successful isolated packaging.
- release:plan exposes prerelease state/proposed prerelease version when active.
- Stable release:apply is blocked while prerelease mode is active; after explicit prerelease exit, a later separately authorized stable apply archives pre.json together with release evidence.
- Dedicated minor intent .changeset/20260920070130-c8f093.md records this second-wave capability.
- No automatic commit, tag, push, fetch, publish, deploy, restart, registry call, or stable release application was introduced.

## 11. Verification gates

Run only when implementation is selected and the user authorizes the relevant targeted verification.

P1 gates:

1. baseline capture and check-release-intent resolve product/source relevance through the same shared policy;
2. changedFilePatterns is actually consumed rather than merely documented;
3. mandatory release-control paths cannot be excluded by config;
4. generated/test-only exclusions remain deterministic;
5. legacy/main is never consulted;
6. no remote fetch/pull occurs.

P2 gates:

7. README.md, AGENTS.md, CLAUDE.md, GEMINI.md, and hidden Markdown are not parsed as pending intents;
8. malformed real intent candidates still fail closed;
9. valid pending intent ordering remains deterministic;
10. create-intent output remains parseable and collision-safe.

P3 gates:

11. snapshot-plan is read-only;
12. snapshot-package leaves root package.json, src/version.ts, pending intents, baseline ref, stable archives, and CHANGELOG unchanged;
13. snapshot IDs are valid and deterministic for explicitly supplied tag/commit/time inputs;
14. unknown/missing template placeholders fail clearly;
15. artifact manifest clearly distinguishes snapshot identity from stable product identity;
16. snapshot output cannot overwrite immutable stable release directories.

P4 gates:

17. invalid prerelease state is rejected rather than silently accepted;
18. invalid enter/exit transitions fail;
19. prerelease planning does not consume stable intent evidence;
20. exiting prerelease mode produces an explicitly reviewable stable plan;
21. no registry/Git tag/publish behavior is implied.

Architecture gates:

22. release tooling remains outside MCP execution routing;
23. no automatic commit/tag/push/publish/deploy/restart;
24. existing release:plan, release:check-intent, release:compat and stable release packaging remain compatible;
25. no unrelated package/versioning framework is introduced.

## 12. Verification evidence

Targeted verification authorized by the user's approval of this plan:

- syntax validation passed for all new/modified release helper scripts;
- tests\release-tooling-second-wave.test.ts passed 1 file / 7 tests;
- policy tests prove changedFilePatterns affects product/source relevance while mandatory release-control paths remain relevant;
- parser-level tests prove metadata/instruction Markdown is filtered before parsing and malformed real intent candidates still fail closed;
- snapshot helper tests prove deterministic validated placeholder rendering and actual ZIP artifact creation under a non-stable namespace without rewriting fixture product state;
- prerelease tests prove validated state, explicit enter/exit transitions, sequence increment, invalid-state rejection, and stable-version prerelease calculation;
- deterministic snapshot-plan smoke produced 0.12.0-dev.20260920060000.5dc20d6 from explicit tag/commit/time inputs;
- release:plan remained Current 0.11.0 / Bump minor / Next 0.12.0 and now reports four pending intents with no active prerelease state;
- release:check-intent consumed the configured changedFilePatterns and returned ok=true with the four pending intents;
- release:compat remained 62 -> 62 MCP tools, unchanged selected routes, no added/removed public tools, breakingEvidence=false;
- root TypeScript build completed with exit code 0;
- Grafel returned to current state; structural review found the shared release-policy helper impacts the release module/snapshot planner and the dedicated second-wave test scope, not Agent Core runtime/MCP routing;
- release:baseline was not run; release:apply was not run; no stable release archive was replaced; no commit/tag/push/publish/deploy/restart occurred.

## 13. Corpse / retirement result

Retirement condition B is satisfied:

- C2-P1 through C2-P4 are implemented and targeted-verified;
- the complete package-family census covered all 21 Changesets packages and 87 non-test package source files at the grounded revision;
- every source family is accounted for by first-wave adoption, second-wave adoption, explicit rejection, or support-only code;
- final active-source dependency scan found no Audit\Changesets path, changesets/changesets source dependency, or @changesets package dependency other than the intentional @changesets/parse first-wave dependency;
- the Audit checkout remained clean at c9269c01af5f3f7463adc648890fc3a8a729dd18.

The checkout was therefore deleted under the user's corpse-retirement authorization. Windows briefly retained the now-empty directory handle after the Grafel audit workspace; a scoped Microsoft Sysinternals Handle helper was placed under runtime\tools to diagnose the lock, after which the empty directory was removed successfully. The helper is audit tooling only and is not an Agent Core runtime dependency.

## 14. Current conclusion

The original Changesets first wave and all four remaining source-derived second-wave mechanisms are now absorbed into Agent Core-owned release tooling.

Final second-wave additions:

- C2-P1: changedFilePatterns-backed shared release-relevance policy;
- C2-P2: metadata-safe, fail-closed pending-intent discovery;
- C2-P3: non-consuming snapshot planning/packaging with separate artifact identity;
- C2-P4: validated explicit prerelease channel state and isolated prerelease packaging.

Everything else in grounded revision c9269c01af5f3f7463adc648890fc3a8a729dd18 is already represented more appropriately in Agent Core, monorepo/npm-specific, network/publishing-oriented, support-only, redundant, or contrary to the current release authority and Git boundary.

Stable product version remains 0.11.0. Planned next stable release remains 0.12.0 with four pending minor intents. No release application or baseline refresh was performed.
