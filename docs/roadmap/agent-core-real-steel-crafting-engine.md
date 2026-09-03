# Agent Core Real Steel Crafting Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` or `superpowers:subagent-driven-development` task-by-task. Every implementation task uses TDD, evidence-first verification, and frequent local commits.

**Status:** APPROVED DESIGN DIRECTION — IMPLEMENTATION PLAN; NOT YET STABLE/ENFORCED

**Goal:** Make Agent Core perform coding work with a mandatory Real Steel crafting behavior: when no approved implementation reference exists it must build from zero; when an approved reference exists it must perform source-grounded feature transplantation rather than silently reimplementing the feature from scratch.

**Architecture:** The Real Steel Crafting Engine sits between task/plan understanding and meaningful coding mutation. It locks one of exactly two coding modes, requires factual source grounding for transplantation, models the requested feature as connected spareparts, produces explicit crafting and compatibility decisions, gates mutation with a scoped crafting lease, then drives iterative execution and verification until the transplanted feature behaves as a native part of the host project.

**Tech Stack:** TypeScript, Node.js 24+, Vitest, existing `RuntimeServices`, `RouteContextStore`, `ExecutionService`, `ProcessManager`, `WorkspacePolicy`, `GitHubService`, `MemoryService`, Continuity, and existing Agent Core audit/observability.

**Spec authority:** This document captures the approved Real Steel contract from the user and replaces the retired `agent-core-plan-driven-implementation-strategy-gate*` documents.

## Global Constraints

- This plan is about **coding behavior and crafting intelligence only**.
- Do not integrate unrelated codebase-intelligence/memory products in this plan.
- Existing prototype code under `src/implementation/` is candidate material, not architectural authority.
- `PLAN > REFERENCE SOURCE > REFERENCE DOCUMENTATION > inference` for requested behavior.
- Target-project architecture and established authority boundaries outrank donor architecture.
- No approved reference means `BUILD_FROM_ZERO`; approved implementation reference means `FEATURE_TRANSPLANTATION`.
- No normal third/hybrid mode is permitted.
- In `FEATURE_TRANSPLANTATION`, reading actual source code is mandatory before target-source mutation.
- README, metadata, package descriptions, or summaries alone never satisfy source grounding.
- Never force-push or mutate unrelated production runtime/memory state during development or canaries.

---

## 1. User Contract — Real Steel

The following statements define the intended engineering behavior and must remain recognizable in the implementation:

> “cara kerja ini yang paling aku suka karna ber-unsur elemen, kalau di film real steel sih robot samsak yang memakai sparepart bermacam, itu pun tergantung pada kepintaran crafting juga sih.”

> “baca plan untuk mengetahui fitur apa yang akan di ambil > lalu baca codebase tersebut yang mau di ambil fiturnya sebagai potongan yang saling tersambung bukan di tiru dari nol, lalu ubah codebase referensi tersebut pada bagian tertentu agar sync dengan project utama”

> “nanti setiap kerja polanya ada 2 hal, misalkan tidak ada referensi artinya di paksa bikin dari nol, jika ada referensi di paksa untuk bekerja secara feature transplantation”

The engineering interpretation is deliberately strict:

```text
TASK / PLAN
    ↓
REFERENCE CONTRACT
    ↓
┌──────────────────────┬──────────────────────────────┐
│ no approved source   │ approved implementation     │
│ reference            │ reference exists            │
│                      │                              │
│ BUILD_FROM_ZERO      │ FEATURE_TRANSPLANTATION     │
└──────────────────────┴──────────────────────────────┘
```

The quality of transplantation is determined by crafting intelligence: where the feature is cut, what connected pieces are retained, what host-bound parts are replaced, and how the resulting assembly becomes native to the target project.

---

## 2. Scope and Non-Goals

This subsystem governs meaningful coding work such as feature implementation, bug fixes that materially change code, refactors, integrations, ports, migrations, and reference-driven transplantation.

It does **not** turn every read/search/build operation into a crafting task. Read-only investigation remains possible before a mutation-ready state exists.

Explicit non-goals for this plan:

- no generic repository-memory platform;
- no external code-intelligence product integration;
- no second semantic-memory authority;
- no replacement for `CapabilityRouter`;
- no replacement for `ExecutionService`;
- no new GitHub credential authority;
- no autonomous force-push/merge policy;
- no requirement that all donor files be copied;
- no clean-room rewrite when transplantation is the locked mode;
- no claim of completion based only on process exit code.

The current prototype contains useful mechanisms but also vocabulary and donor-specific canary code from an earlier misunderstanding. The first implementation task must audit it instead of treating it as finished architecture.

---

## 3. Official Vocabulary

Use these names in the final implementation:

```ts
export type CraftingMode =
  | 'BUILD_FROM_ZERO'
  | 'FEATURE_TRANSPLANTATION';
```

Do not keep legacy prototype mode names as public/core vocabulary. `FEATURE_TRANSPLANTATION` is intentionally tool-neutral and describes the engineering behavior itself.

Core terms:

- **Host project:** project being changed.
- **Reference:** explicitly approved implementation source used for transplantation.
- **Source grounding:** factual inspection of actual reference code and tests.
- **Sparepart:** one connected implementation component that contributes to requested behavior.
- **Feature anatomy:** bounded connected set of spareparts required to understand and preserve the feature.
- **Crafting decision:** `KEEP`, `ADAPT`, `REPLACE`, `DROP`, or `REIMPLEMENT` for one sparepart.
- **Compatibility surgery:** changes required to make selected donor logic obey host contracts.
- **Craft plan:** immutable decision record for the selected spareparts and target bindings.
- **Crafting lease:** scoped proof that required pre-mutation crafting gates were completed.
- **Native feature:** final host implementation whose ownership, lifecycle, state, errors, tests, and interfaces conform to the host project.

The phrase “reference” never means documentation-only material unless the task explicitly asks only for conceptual research. For coding transplantation, a reference must resolve to inspectable implementation source.

---

## 4. High-Level Architecture

```text
USER TASK
   ↓
PLAN / FEATURE INTENT
   ↓
CRAFTING MODE RESOLVER
   ↓
┌────────────────────────────┬───────────────────────────────┐
│ BUILD_FROM_ZERO            │ FEATURE_TRANSPLANTATION      │
│                            │                               │
│ host grounding             │ reference source grounding   │
│ first-principles design    │ connected anatomy discovery  │
│ implementation plan        │ crafting decisions           │
│                            │ compatibility surgery map     │
└──────────────┬─────────────┴───────────────┬───────────────┘
               ↓                             ↓
                     CRAFTING LEASE
                           ↓
                  ITERATIVE EXECUTION
                           ↓
                    MULTI-COMMAND DAG
                           ↓
                       VERIFY
                           ↓
                    NATIVE FEATURE
```

---

## 5. Mode Resolution Contract

Mode resolution must occur before meaningful implementation mutation and must be deterministic from the task's approved reference contract.

Proposed contract:

```ts
export interface CraftingReference {
  referenceId: string;
  kind: 'git_repo' | 'local_repo' | 'source_bundle';
  repository?: string;
  localPath?: string;
  commit?: string;
  tree?: string;
  bundleHash?: string;
  featureScope: string;
  approvalSource: string;
}

export interface CraftingModeDecision {
  craftingId: string;
  routeContextId: string;
  projectId: string;
  mode: CraftingMode;
  featureContractHash: string;
  references: CraftingReference[];
  referenceSetHash: string;
  reasonCodes: string[];
}
```

Rules:

```text
references.length == 0 → BUILD_FROM_ZERO
references.length >= 1 → FEATURE_TRANSPLANTATION
```

If a declared reference is unavailable, ambiguous, or identity-invalid, transplantation blocks. It must not silently downgrade to `BUILD_FROM_ZERO`.

---

## 6. Source Grounding Gate

`FEATURE_TRANSPLANTATION` cannot produce a mutation-ready craft plan until the actual reference implementation has been inspected.

A grounding receipt records facts, not summaries:

```ts
export interface SourceEvidence {
  evidenceId: string;
  referenceId: string;
  sourcePath: string;
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
  contentHash?: string;
  role: 'entry_point' | 'dependency' | 'state' | 'config' | 'lifecycle' | 'test' | 'interface' | 'error_path';
  observation: string;
}

export interface SourceGroundingReceipt {
  receiptId: string;
  referenceSetHash: string;
  featureContractHash: string;
  evidence: SourceEvidence[];
  inspectedSourceFiles: string[];
  inspectedTests: string[];
  completeness: 'sufficient' | 'insufficient';
  missingEvidence: string[];
}
```

Minimum transplantation grounding requires factual evidence for the feature entry point, connected implementation pieces, host-facing interfaces, material state/config/lifecycle assumptions, and relevant donor tests when they exist.

README and metadata may orient discovery, but they cannot create `completeness: 'sufficient'` without source evidence.

---

## 7. Connected Sparepart Discovery

The engine must prevent the agent from treating a feature as one matching filename. It should require a bounded feature anatomy describing how selected pieces connect.

```ts
export type SparepartRelation =
  | 'DEFINES'
  | 'CALLS'
  | 'IMPORTS'
  | 'IMPLEMENTS'
  | 'CONFIGURES'
  | 'READS_STATE'
  | 'WRITES_STATE'
  | 'STARTS'
  | 'STOPS'
  | 'TESTS'
  | 'OWNS';

export interface FeatureSparepart {
  sparepartId: string;
  referenceId: string;
  sourcePath: string;
  symbol?: string;
  role: string;
  evidenceRefs: string[];
}

export interface FeatureConnection {
  from: string;
  to: string;
  relation: SparepartRelation;
  evidenceRefs: string[];
}
```

Discovery expands only when a connected piece is necessary to preserve requested behavior, understand an invariant, satisfy runtime/compile linkage, port verification, or identify a host-authority boundary.

Lexical similarity alone must never pull unrelated donor subsystems into the transplant.

---

## 8. Crafting Intelligence

Every sparepart admitted into a transplantation craft plan receives exactly one primary decision:

```text
KEEP        retain donor logic with only mechanical host integration
ADAPT       preserve core behavior while changing host-facing contracts
REPLACE     preserve the role but bind it to an existing host authority
DROP        exclude it because the plan does not require it
REIMPLEMENT preserve required behavior when direct transplantation is factually blocked
```

`REIMPLEMENT` is an exception inside transplantation mode, not an escape back to build-from-zero. It requires a factual reason such as non-portable runtime assumptions, incompatible reuse posture, broken donor logic, or irreducible host conflict.

Proposed decision record:

```ts
export interface CraftingDecision {
  sparepartId: string;
  action: 'KEEP' | 'ADAPT' | 'REPLACE' | 'DROP' | 'REIMPLEMENT';
  rationaleCode: string;
  targetPath?: string;
  targetBinding?: string;
  preservedBehaviors: string[];
  intentionallyChangedBehaviors: string[];
  evidenceRefs: string[];
}
```

The engine must reject a craft plan when selected spareparts lack decisions, rationale, or provenance.

The core quality question is not “did we copy code?” It is “did we select and reshape the correct connected elements while preserving host ownership?”

---

## 9. Compatibility Surgery

Transplantation becomes native only after donor assumptions are mapped onto host contracts.

The compatibility map must cover relevant boundaries explicitly:

```text
donor interface/type     → host interface/type
donor config             → host config projection
donor storage/state      → host state authority
donor logger/audit       → host audit authority
donor process ownership  → host execution/process authority
donor Git operations     → host GitHub/Git authority
donor lifecycle          → host startup/shutdown lifecycle
donor error contract     → host error/result contract
donor concurrency model  → host scheduler/resource policy
donor tests              → preserved/changed host verification
```

```ts
export interface CompatibilityBinding {
  sparepartId: string;
  boundary: string;
  donorContract: string;
  hostContract: string;
  surgery: 'NONE' | 'ADAPTER' | 'TYPE_MAP' | 'AUTHORITY_REPLACEMENT' | 'LIFECYCLE_REWIRE' | 'ERROR_MAP';
  verificationRequirement: string;
}
```

An adapter is preferred when mature donor core behavior can remain intact behind a stable boundary. Direct adaptation is preferred when an adapter would preserve a wrong ownership model or create larger permanent translation debt.

---

## 10. Host Authority Rules

Real Steel crafting may reshape donor code, but it must not accidentally create a second owner for an existing Agent Core concern.

Protected authorities remain factual target architecture, including:

```text
semantic memory        → MemoryService / DMF
memory lifecycle       → existing hard lifecycle
workspace containment  → WorkspacePolicy
routing                → CapabilityRouter / RouteContextStore
operational execution  → ExecutionService / ProcessManager
GitHub operations      → GitHubService
operational audit      → existing audit services
authentication         → Agent Core auth/OAuth/key layer
runtime health truth   → existing health/runtime services
```

A donor component claiming one of these ownership roles cannot default to `KEEP`. It must be adapted/replaced or the craft plan remains blocked.

The current `authority-conflicts.ts` prototype is a strong candidate for reuse after vocabulary cleanup and additional host-authority tests.

---

## 11. Craft Plan Contract

```ts
export interface CraftPlan {
  craftPlanId: string;
  craftingId: string;
  mode: CraftingMode;
  featureContractHash: string;
  referenceSetHash: string;
  groundingReceiptId?: string;
  spareparts: FeatureSparepart[];
  connections: FeatureConnection[];
  decisions: CraftingDecision[];
  compatibilityBindings: CompatibilityBinding[];
  hostVerification: string[];
  donorVerification: string[];
  status: 'draft' | 'ready' | 'blocked';
  blockingReasons: string[];
}
```

`FEATURE_TRANSPLANTATION` requires `groundingReceiptId`, sparepart anatomy, decisions, and compatibility bindings before `ready`.
`BUILD_FROM_ZERO` requires no donor anatomy and must reject donor-derived mutation until the mode is intentionally reopened.

---

## 12. Crafting State Machine

```text
UNRESOLVED
   ↓
MODE_LOCKED
   ├─ BUILD_FROM_ZERO ─────────────→ HOST_GROUNDED
   │                                  ↓
   │                              CRAFT_PLAN_READY
   │
   └─ FEATURE_TRANSPLANTATION ────→ SOURCE_GROUNDED
                                      ↓
                                  ANATOMY_READY
                                      ↓
                                  CRAFT_PLAN_READY
                                      ↓
                                  LEASE_READY
                                      ↓
                                  MUTATING
                                      ↓
                                  VERIFYING
                                      ↓
                                  CLOSED
```

Any pre-terminal state may transition to `BLOCKED` with a deterministic reason. `CLOSED` requires verified evidence or an explicit failed/abandoned terminal record; stopping work never implies success.

Plan/reference drift invalidates mutation readiness. A fresh session may resume the same crafting record only after revalidating current plan/reference identity.

---

## 13. Mutation Guard

A scoped crafting lease proves that the correct pre-mutation method was followed for the current task snapshot. It does not prove implementation correctness.

Validation inputs:

```text
principal/project
routeContextId
craftingId
mode
featureContractHash
referenceSetHash
craftPlanId
expiry
```

Target guard order:

```text
route permission
→ memory hard lifecycle
→ Real Steel crafting guard
→ actual mutation
```

This preserves current memory lifecycle authority while ensuring source/config/test mutation cannot bypass the crafting contract in enforce mode.

---

## 14. Transplant Mutation Discipline

In `FEATURE_TRANSPLANTATION`, every meaningful target mutation must map back to a craft-plan decision.

Examples:

```text
copy/adapt donor algorithm     → sparepart KEEP/ADAPT
new compatibility adapter      → compatibility binding
bind host service              → REPLACE/ADAPT decision
remove donor-only dependency   → DROP decision
rewrite non-portable behavior  → REIMPLEMENT + factual reason
```

The guard must reject undocumented donor-derived mutation in enforce mode.

The engine must also reject the opposite failure: creating a clean-room parallel implementation while a transplantable donor component is selected as `KEEP` or `ADAPT`.

Incremental transplantation is preferred. One bounded component/boundary is changed, tested, and observed before expanding to the next connected component.

This creates the Real Steel behavior: assemble intelligently piece-by-piece instead of either copying an entire foreign robot or rebuilding everything from raw metal.

---

## 15. Autonomous Iterative Execution

Crafting does not stop after one mutation or one command. The execution loop is evidence-driven:

```text
OBJECTIVE
  ↓
PLAN NEXT BOUNDED STEP
  ↓
EXECUTE
  ↓
OBSERVE FACTUAL OUTPUT
  ↓
EVALUATE AGAINST CRAFT PLAN
  ├─ gap/failure → diagnose → adapt → execute again
  └─ pass        → advance to next dependency / verification
```

The agent must not infer success from silence, process exit alone, or a plausible-looking diff.

Failure evidence updates the next iteration while preserving previous attempt evidence. A repair must be followed by the smallest focused test that proves the failure condition changed, then by the relevant adjacent/regression gates.

The existing `ExecutionService` attempt/evidence model is the authority to reuse; Real Steel must not introduce a parallel process runner or execution database.

---

## 16. Multi-Command DAG

Independent evidence-producing work should run concurrently; dependent work must remain ordered.

```text
              ┌─ focused tests ───────┐
mutation ─────┼─ target diff audit ───┼─ evidence aggregation
              └─ independent scan ────┘

build → start → health
```

The first group may run in parallel. The second chain may not.

Each command node must record:

```text
node/attempt identity
command purpose
start/end timestamp
exit state
bounded stdout/stderr evidence
artifacts/results
hard dependencies
next decision
```

`ExecutionService` scheduling, retry, wake, artifact, and log facilities should be extended/reused instead of creating a separate “multi-command runner”.

---

## 17. Verification Contract

Both modes require host correctness. Transplantation adds donor-behavior evidence.

`BUILD_FROM_ZERO` completion requires:

```text
plan behavior PASS
host architecture contract PASS
focused tests PASS
adjacent tests PASS
blast/impact evidence sufficient for claimed scope
regression PASS
```

`FEATURE_TRANSPLANTATION` additionally requires:

```text
selected donor behavior PASS or intentionally-changed with plan evidence
ported/differential donor tests PASS where applicable
compatibility bindings PASS
host authority conflicts resolved
provenance complete
```

Verification must distinguish `preserved`, `intentionally_changed`, `dropped_non_goal`, and `unverified`. Any required behavior left `unverified` blocks stable completion.

---

## 18. Memory and Continuity

DMF should remember high-value engineering decisions, not donor source bodies.

Useful durable facts include:

```text
which mode was selected and why
which reference identity was used
which spareparts were retained/adapted/replaced/dropped
which compatibility boundary was chosen
which approach failed and why
which verification evidence proved the final result
```

Continuity should preserve active crafting state:

```text
craftingId
mode
reference identities
source-grounding receipt
craftPlanId
current sparepart/boundary
active execution run
verification state
blocking reason
```

A resumed session must revalidate plan/reference freshness before continuing mutation but should not rediscover already-certified evidence unnecessarily.

---

## 19. Prototype Audit and Migration Policy

Current prototype files must be reviewed as candidate spareparts before reuse:

```text
src/implementation/strategy.ts
src/implementation/transplant-manifest.ts
src/implementation/authority-conflicts.ts
src/implementation/meaningful-work.ts
src/implementation/service.ts
src/implementation/verification.ts
src/mcp/implementation-strategy-guard.ts
```

Likely reusable concepts: deterministic mode identity/fingerprints, classification actions, protected-authority evaluation, scoped lease pattern, memory-first guard ordering, and verification separation.

Required vocabulary migration:

```text
ImplementationStrategy*  → Crafting*
legacy zero-reference mode   → BUILD_FROM_ZERO
legacy reference-driven mode → FEATURE_TRANSPLANTATION
TransplantManifest       → CraftPlan where semantics broaden beyond file transplant
AGENT_CORE_IMPLEMENTATION_STRATEGY_MODE
                         → AGENT_CORE_CRAFTING_ENFORCEMENT
```

No rename is accepted mechanically; tests must prove semantics remain correct after each migration.

The following prototype areas are **out of Real Steel core scope** and must be removed from this branch or isolated so they have no runtime dependency:

```text
src/implementation/code-intelligence.ts
src/implementation/git-working-tree-source.ts
reference-specific canary tests
reference-specific Git enumeration additions used only by those canaries
reference-specific third-party notices if no adapted source remains after cleanup
```

This is not a judgment that those ideas are bad. They are deferred to another project/session so the Real Steel engine remains conceptually pure.

The implementation audit must use `git diff`, call-site search, tests, and build evidence before deleting anything. If a supposedly deferred component has become a required generic dependency, extract only the generic contract needed by Real Steel and document the extraction.

---

## 20. Configuration and Rollout

Proposed rollout control:

```text
AGENT_CORE_CRAFTING_ENFORCEMENT=disabled|advisory|enforce
```

Default remains `disabled` during migration. `advisory` records what would block while preserving current operations. `enforce` is enabled only after both Real Steel canaries and adjacent regression suites remain stable.

Changing enforcement mode never changes the selected crafting mode. `BUILD_FROM_ZERO` versus `FEATURE_TRANSPLANTATION` is task truth; `disabled/advisory/enforce` controls only how strongly Agent Core blocks non-compliant mutation.

---

# 21. Implementation Tasks

## Task 0 — Retire Ambiguous Artifacts and Baseline the Prototype

**Files:**
- Delete tracked: `docs/roadmap/agent-core-plan-driven-implementation-strategy-gate.md`
- Delete tracked: `docs/roadmap/agent-core-plan-driven-implementation-strategy-gate-execution.md`
- Audit: `src/implementation/**`, `src/mcp/implementation-strategy-guard.ts`
- Audit: related modifications in `src/config.ts`, `src/runtime/services.ts`, `src/runtime/route-context-store.ts`, `src/mcp/tools.ts`, `src/mcp/route-guard.ts`
- Test: existing prototype tests plus `npm run build`

**Produces:** a factual keep/rewrite/remove matrix for every prototype file and a clean baseline before semantic migration.

- [ ] Capture `git status`, branch/head, and diff against the pre-prototype base.
- [ ] Map all imports/callers of current implementation-strategy modules.
- [ ] Classify each prototype file as `REUSE`, `REWRITE`, `EXTRACT_GENERIC`, or `REMOVE_DEFERRED`.
- [ ] Run current focused prototype tests and record exact baseline counts.
- [ ] Run `npm run build` and record baseline compiler state.
- [ ] Commit only the retirement docs and audit evidence; do not silently mix semantic code changes into this task.

**Exit gate:** no old plan remains authoritative and every existing prototype component has an explicit migration decision.

## Task 1 — Establish the Two-Mode Real Steel Contract

**Files:**
- Create: `src/crafting/types.ts`
- Create: `src/crafting/mode-resolver.ts`
- Test: `tests/crafting-mode.test.ts`

**Interfaces:**
- Produces: `CraftingMode`, `CraftingReference`, `CraftingFeatureContract`, `CraftingModeDecision`, `resolveCraftingMode()`.

- [ ] Write failing tests proving zero references resolves exactly to `BUILD_FROM_ZERO`.
- [ ] Write failing tests proving one or more approved references resolves exactly to `FEATURE_TRANSPLANTATION`.
- [ ] Write failing tests proving unavailable/ambiguous required references block instead of falling back.
- [ ] Write failing tests proving normalized identical input reproduces the same feature/reference hashes and crafting identity fields.
- [ ] Implement the minimum deterministic resolver using canonical stable serialization + SHA-256.
- [ ] Port only useful identity validation from the prototype; do not retain legacy prototype mode aliases.
- [ ] Run `npx vitest run tests/crafting-mode.test.ts`.
- [ ] Run `npm run build`.
- [ ] Commit as `feat: define real steel crafting modes`.

**Exit gate:** Agent Core has exactly two normal coding modes with no silent hybrid/fallback.

## Task 2 — Make Source Grounding Mandatory for Transplantation

**Files:**
- Create: `src/crafting/source-grounding.ts`
- Create: `src/crafting/reference-resolution.ts`
- Test: `tests/crafting-source-grounding.test.ts`

**Interfaces:**
- Consumes: `CraftingModeDecision`, `CraftingReference`, `CraftingFeatureContract`.
- Produces: `SourceEvidence`, `SourceGroundingReceipt`, `validateGroundingReceipt()`.

- [ ] Write failing tests proving README/package metadata alone is insufficient.
- [ ] Write failing tests requiring actual source-path evidence for entry point, dependency/interface, and relevant tests/lifecycle when declared applicable.
- [ ] Write failing tests proving source evidence is rejected when its reference identity/hash no longer matches the locked reference.
- [ ] Write failing tests proving `BUILD_FROM_ZERO` does not require donor grounding and refuses donor-derived evidence unless mode is reopened.
- [ ] Implement reference resolution using existing workspace/GitHub boundaries; do not create a second credential or clone authority.
- [ ] Implement immutable grounding receipts with bounded observations and no raw source-body persistence.
- [ ] Run focused tests, `npm run build`, and relevant GitHub/workspace tests.
- [ ] Commit as `feat: require source-grounded transplantation`.

**Exit gate:** target mutation in transplantation mode cannot become ready from documentation/metadata alone.

## Task 3 — Build Connected Feature Anatomy

**Files:**
- Create: `src/crafting/feature-anatomy.ts`
- Create: `src/crafting/evidence-ledger.ts`
- Test: `tests/crafting-feature-anatomy.test.ts`

**Interfaces:**
- Consumes: `SourceGroundingReceipt`, feature intent.
- Produces: `FeatureSparepart`, `FeatureConnection`, `FeatureAnatomy`.

- [ ] Write failing tests proving one matching file is not accepted when source evidence shows connected dependencies.
- [ ] Write failing tests for bounded `CALLS`, `IMPORTS`, `CONFIGURES`, `STATE`, `LIFECYCLE`, and `TESTS` relationships.
- [ ] Write failing tests distinguishing `unknown` from `not_required`.
- [ ] Write failing tests preventing weak lexical similarity from expanding anatomy.
- [ ] Implement evidence-ledger validation so every connection cites actual grounding evidence.
- [ ] Implement bounded anatomy limits and deterministic ordering/hashing.
- [ ] Verify no external analyzer is required for correctness; agent/tool-driven evidence may populate the ledger.
- [ ] Run focused tests and build.
- [ ] Commit as `feat: model connected feature spareparts`.

**Exit gate:** transplantation is planned from connected implementation anatomy, not filenames or README descriptions.

## Task 4 — Implement Crafting Decisions and Craft Plan

**Files:**
- Create: `src/crafting/craft-plan.ts`
- Migrate useful logic from: `src/implementation/transplant-manifest.ts`
- Test: `tests/crafting-plan.test.ts`

**Interfaces:**
- Consumes: mode decision, feature anatomy, grounding receipt.
- Produces: `CraftingDecision`, `CraftPlan`, deterministic `craftPlanId`.

- [ ] Write failing tests requiring every selected sparepart to receive exactly one `KEEP|ADAPT|REPLACE|DROP|REIMPLEMENT` action.
- [ ] Write failing tests requiring rationale and evidence for every action.
- [ ] Write failing tests requiring factual exception reasons for `REIMPLEMENT`.
- [ ] Write failing tests proving decision order does not change `craftPlanId`.
- [ ] Write failing tests blocking a transplantation plan with missing/insufficient grounding.
- [ ] Implement deterministic craft-plan normalization and validation.
- [ ] Remove old `TransplantManifest` naming where the new contract supersedes it.
- [ ] Run focused tests + migrated prototype tests + build.
- [ ] Commit as `feat: add real steel craft plans`.

**Exit gate:** the engine can describe exactly which spareparts will be kept, shaped, replaced, dropped, or exceptionally reimplemented before mutation.

## Task 5 — Compatibility Surgery and Host Authority Protection

**Files:**
- Create: `src/crafting/compatibility-surgery.ts`
- Create/migrate: `src/crafting/authority-registry.ts`
- Migrate useful logic from: `src/implementation/authority-conflicts.ts`
- Test: `tests/crafting-compatibility.test.ts`

**Interfaces:**
- Consumes: `CraftPlan`, host authority registry.
- Produces: `CompatibilityBinding[]`, authority-conflict assessment, ready/blocked craft plan.

- [ ] Write failing tests for interface/type/config/error/lifecycle mappings.
- [ ] Write failing tests proving donor memory, routing, execution, GitHub, audit, auth, workspace, and health ownership cannot become second authorities.
- [ ] Write failing tests proving `REPLACE` can bind a donor role to an existing host service.
- [ ] Write failing tests proving adapters cannot weaken workspace/auth/memory guardrails.
- [ ] Implement explicit compatibility binding validation.
- [ ] Migrate protected authority data without donor-specific heuristics.
- [ ] Run focused tests plus existing route/workspace/GitHub/memory authority tests.
- [ ] Commit as `feat: add crafting compatibility surgery`.

**Exit gate:** every host-bound donor assumption is either mapped to a host contract or blocks transplantation.

## Task 6 — Crafting Lease and Route Projection

**Files:**
- Create/migrate: `src/crafting/service.ts`
- Modify: `src/runtime/route-context-store.ts`
- Modify: `src/runtime/services.ts`
- Modify: `src/config.ts`
- Test: `tests/crafting-route-context.test.ts`

**Interfaces:**
- Produces: `CraftingLease`, route `crafting` projection, `AGENT_CORE_CRAFTING_ENFORCEMENT` config.

- [ ] Write failing tests for route-scoped crafting state and immutable plan/reference hashes.
- [ ] Write failing tests proving read-only operations remain available before mutation readiness.
- [ ] Write failing tests proving stale plan/reference/craft-plan hashes invalidate lease readiness.
- [ ] Write failing tests proving `FEATURE_TRANSPLANTATION` cannot receive a mutation lease without sufficient source grounding and ready craft plan.
- [ ] Implement lease issuance/validation by adapting the proven prototype lease pattern.
- [ ] Rename config/runtime surface away from `ImplementationStrategy*` terminology.
- [ ] Default enforcement to `disabled` during migration.
- [ ] Run focused route/config tests and build.
- [ ] Commit as `feat: bind crafting state to routes`.

**Exit gate:** Real Steel planning state can be carried safely on a route without yet changing default mutation behavior.

## Task 7 — Enforce Real Steel Before Meaningful Coding Mutation

**Files:**
- Create/migrate: `src/mcp/crafting-guard.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/route-guard.ts`
- Migrate useful logic from: `src/implementation/meaningful-work.ts`, `src/mcp/implementation-strategy-guard.ts`
- Test: `tests/crafting-mutation-guard.test.ts`

**Interfaces:**
- Consumes: route crafting projection + lease + current mutation intent.
- Produces: deterministic allow/advisory/block decision before side effect.

- [ ] Write RED acceptance: enforce mode blocks source/config/test mutation with no crafting state before filesystem/process side effect.
- [ ] Write RED acceptance: build-from-zero lease allows original implementation work but rejects donor-derived mutation evidence.
- [ ] Write RED acceptance: transplantation lease rejects mutation not mapped to a selected craft-plan decision/binding.
- [ ] Write RED acceptance: transplantation rejects clean-room parallel implementation for a `KEEP`/`ADAPT` sparepart.
- [ ] Prove memory hard-lifecycle validation remains earlier in the guard order.
- [ ] Implement advisory mode with factual would-block result but unchanged side effects.
- [ ] Implement enforce mode with no false postflight transition on crafting rejection.
- [ ] Run MCP route/memory/workspace tests and build.
- [ ] Commit as `feat: enforce real steel crafting guard`.

**Exit gate:** meaningful coding mutation cannot bypass the selected Real Steel method when enforcement is enabled.

## Task 8 — Autonomous Iterative Crafting Execution

**Files:**
- Create: `src/crafting/execution-controller.ts`
- Reuse/extend: `src/execution/service.ts`, scheduler/evidence interfaces only where required
- Test: `tests/crafting-iterative-execution.test.ts`

**Interfaces:**
- Consumes: ready `CraftPlan`, current evidence, existing `ExecutionService`.
- Produces: bounded next-step advice/plan tied to sparepart/boundary and factual attempt evidence.

- [ ] Write failing tests for execute → observe → evaluate → repair/retry loop without inventing success.
- [ ] Write failing tests preserving failed attempt evidence before a repaired attempt succeeds.
- [ ] Write failing tests proving only the failed/dependent transplant branch is blocked while unrelated work may continue.
- [ ] Write failing tests proving a successful process with missing required artifact/test evidence remains unverified.
- [ ] Implement a coordinator over existing execution APIs; do not create a second process runner/database.
- [ ] Persist bounded crafting correlation IDs in execution evidence rather than raw donor source.
- [ ] Run focused execution tests plus existing scheduler/wake/artifact tests.
- [ ] Commit as `feat: add iterative crafting execution`.

**Exit gate:** Real Steel work advances through factual feedback loops instead of one-shot tool calls.

## Task 9 — Multi-Command Crafting DAG

**Files:**
- Extend: `src/crafting/execution-controller.ts`
- Reuse/extend: `src/execution/scheduler.ts` and existing run/node contracts only where necessary
- Test: `tests/crafting-multi-command.test.ts`

**Interfaces:**
- Produces: dependency-aware execution batches and evidence aggregation, not an alternate scheduler.

- [ ] Write failing test where independent focused test, diff audit, and source inspection run concurrently.
- [ ] Write failing test where `build → start → health` remains strictly ordered.
- [ ] Write failing test where one branch failure leaves an unrelated branch running and blocks only hard dependents.
- [ ] Write failing test proving max concurrency/resource-governance limits remain authoritative.
- [ ] Write failing test proving completion evaluation waits for every required evidence-producing branch, not the first successful command.
- [ ] Implement crafting-to-ExecutionService DAG translation.
- [ ] Surface node/attempt purpose, sparepart/boundary correlation, exit, artifact and next-dependency evidence.
- [ ] Run scheduler/resource/wake tests and build.
- [ ] Commit as `feat: orchestrate multi-command crafting`.

**Exit gate:** Agent Core exploits safe parallelism without violating dependency order or losing factual logs/evidence.

## Task 10 — Real Steel Verification and Native-Feature Gate

**Files:**
- Create/migrate: `src/crafting/verification.ts`
- Migrate useful logic from: `src/implementation/verification.ts`
- Test: `tests/crafting-verification.test.ts`

**Interfaces:**
- Consumes: craft plan, execution evidence, donor/host test evidence, impact evidence.
- Produces: `CraftingVerificationResult`, terminal state, bounded provenance/memory candidate.

- [ ] Write failing tests separating donor-behavior parity from host-integration verification.
- [ ] Write failing tests for `preserved`, `intentionally_changed`, `dropped_non_goal`, and `unverified` behavior dispositions.
- [ ] Write failing tests proving required `unverified` behavior blocks stable completion.
- [ ] Write failing tests proving process exit zero without required tests/artifacts cannot close crafting successfully.
- [ ] Write failing tests for bounded impact/blast evidence and unresolved unknowns.
- [ ] Implement safe provenance containing identities/decisions/hashes/counts but not raw donor bodies or secrets.
- [ ] Run focused tests + observability/redaction tests + build.
- [ ] Commit as `feat: verify crafted features as native`.

**Exit gate:** completion means the feature is behaviorally verified and host-native, not merely copied or compiled.

## Task 11 — Crafting Memory and Cross-Session Continuity

**Files:**
- Create: `src/crafting/continuity.ts`
- Integrate through existing MemoryService/Continuity APIs; no new persistence authority
- Test: `tests/crafting-continuity.test.ts`

**Interfaces:**
- Consumes: active crafting state and terminal verification result.
- Produces: bounded continuity projection and high-value memory candidates.

- [ ] Write failing tests persisting mode/reference/craftPlan/current-sparepart/verification state without donor source bodies.
- [ ] Write failing test resuming interrupted transplantation on a fresh route while revalidating current plan/reference hashes.
- [ ] Write failing test preventing stale continuation lease from authorizing new mutation.
- [ ] Write failing test proving unrelated projects/principals cannot see or resume each other's crafting state.
- [ ] Write failing test proving terminal verified decisions can become DMF candidates through existing write policy, not bypass it.
- [ ] Implement projection/adapters over existing continuity and memory services.
- [ ] Run memory hard-lifecycle, continuity resume, principal-scope, redaction tests.
- [ ] Commit as `feat: persist real steel crafting continuity`.

**Exit gate:** a later session can continue the same crafting job without re-inventing decisions or weakening freshness checks.

## Task 12 — Dual Real Steel Canaries

**Files:**
- Test: `tests/crafting-build-from-zero.acceptance.test.ts`
- Test: `tests/crafting-feature-transplantation.acceptance.test.ts`
- Fixtures: isolated temporary host/reference repositories created by the tests or one explicitly approved real reference feature.

**Canary A — BUILD_FROM_ZERO:**
- [ ] Start from a feature task with no approved reference.
- [ ] Prove the engine locks `BUILD_FROM_ZERO`.
- [ ] Build a small connected feature from host contracts/first principles.
- [ ] Prove donor/reference introduction without reopening the mode becomes stale/blocked.
- [ ] Run iterative + multi-command verification to terminal PASS.

**Canary B — FEATURE_TRANSPLANTATION:**
- [ ] Use an explicitly approved reference containing multiple connected components and tests.
- [ ] Ground actual source before mutation.
- [ ] Require at least one `KEEP`/`ADAPT`, one host `REPLACE`/compatibility binding, and one excluded `DROP` or justified exception.
- [ ] Transplant incrementally; do not rebuild the selected donor core from zero.
- [ ] Run donor behavior parity + host integration + impact verification.
- [ ] Run in advisory, then isolated enforce mode.
- [ ] Repeat the canary at least three times with identical expected decisions/evidence identity where inputs are unchanged.

**Exit gate:** both mandatory branches of the user's two-mode rule are proven end-to-end, not only by unit fixtures.

## Task 13 — Remove Deferred Prototype Residue and Stabilize Rollout

**Files:**
- Remove/move deferred prototype files proven unused by Real Steel core.
- Remove obsolete tests/config names after semantic replacements are green.
- Update: relevant roadmap/changelog/config documentation only after implementation evidence exists.
- Test: `tests/crafting-stability.acceptance.test.ts`

- [ ] Prove no runtime imports remain from deferred donor-specific prototype modules before deleting them.
- [ ] Remove old `ImplementationStrategy*`, legacy prototype mode names, and obsolete environment-variable vocabulary from production code/tests/docs.
- [ ] Verify third-party notices reflect only source actually remaining in this branch.
- [ ] Run `git diff --check` and secret/provenance scans.
- [ ] Run `npm run build`.
- [ ] Run the complete Real Steel focused/adjacent suite.
- [ ] Run both canaries repeatedly.
- [ ] Run full repository tests and distinguish pre-existing baseline failures from Real Steel regressions factually.
- [ ] Snapshot production ports/process ownership and memory DB hash before/after isolated canaries.
- [ ] Keep production enforcement `disabled` until the full acceptance matrix below passes; then promote to `advisory` before any live `enforce` decision.
- [ ] Commit as `chore: stabilize real steel crafting engine`.

**Exit gate:** the branch contains one unambiguous Real Steel implementation, no accidental deferred integration, clean provenance, and repeatable evidence for both coding modes.

---

## 22. Required Acceptance Matrix
| Area | Required evidence |
|---|---|
| Two-mode contract | No reference → `BUILD_FROM_ZERO`; approved reference → `FEATURE_TRANSPLANTATION`; no silent third mode |
| Plan authority | Requested feature intent is fixed before reference convenience can widen scope |
| Source grounding | Transplantation reads actual source/tests; documentation-only evidence cannot become sufficient |
| Connected anatomy | Entry point and required connected spareparts/relationships are represented with factual evidence |
| Crafting intelligence | Every selected sparepart has one action, rationale, and preserved/changed behavior record |
| Compatibility surgery | Host-facing donor assumptions map explicitly to host contracts |
| Host authority | Existing memory/routing/execution/GitHub/audit/auth/workspace authorities cannot be duplicated silently |
| Mutation guard | Missing/stale crafting state blocks before side effect in enforce mode |
| Build from zero integrity | Donor-derived mutation cannot enter a locked zero-reference task silently |
| Transplant integrity | Selected transplantable core cannot be silently rebuilt in parallel from scratch |
| Iteration | Failed attempt evidence is preserved and drives factual repair/retry |
| Multi-command | Independent branches run concurrently; dependencies remain ordered; evidence aggregation is complete |
| Verification | Donor behavior and host integration are independent evidence dimensions |
| Continuity | Interrupted crafting resumes with freshness revalidation and project/principal isolation |
| Security | No raw credentials or unrestricted donor bodies leak into audit/DMF/error surfaces |
| Rollout | disabled → advisory → isolated enforce → optional live enforce only after canaries |

---

## 23. Success Definition

The Real Steel Crafting Engine is stable only when an agent cannot accidentally choose a third path.

A successful no-reference coding task looks like:

```text
PLAN → BUILD_FROM_ZERO → host-grounded design → iterative implementation → verify → native feature
```

A successful reference-driven task looks like:

```text
PLAN → FEATURE_TRANSPLANTATION → actual source grounding → connected spareparts
→ crafting decisions → compatibility surgery → incremental transplant
→ autonomous iteration/multi-command verification → native feature
```
