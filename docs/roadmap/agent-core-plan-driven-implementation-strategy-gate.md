# Agent Core Plan-Driven Implementation Strategy Gate — Architecture Design

**Status:** DESIGN SPECIFICATION — USER-APPROVED DIRECTION; NOT IMPLEMENTED
**Design base:** local `main` / `origin/main` at `6b674c1f95a677dea5cb57263bb5b8b863faff5b`
**Development identity observed during design:** `0.7.0`
**Target platform:** Agent Core local-first control plane on Windows and GitHub Codespaces
**Primary objective:** force every meaningful code implementation task to choose exactly one implementation strategy before mutation: `GREENFIELD` when no approved donor implementation exists, or `FEATURE_GRAFT` when an approved donor/reference implementation exists.

---

# 1. Executive Summary

Agent Core already routes work, scopes tools, performs memory preflight, enforces workspace boundaries, records operational evidence, and executes verified local actions. What it does not yet enforce is **how an implementation must be constructed when a reference codebase exists**.

Today an agent can receive a plan plus a reference repository and still choose to:

- ignore the donor implementation and rewrite the feature from scratch;
- copy isolated files without following their dependency cone;
- copy too much of the donor and import incompatible architectural authority;
- use the reference merely as inspiration without recording what was retained or replaced;
- silently mix greenfield code and transplanted code without provenance;
- reimplement mature behavior that could have been selectively reused;
- transplant implementation details that conflict with Agent Core's existing memory, execution, security, or lifecycle authorities.

This design replaces that ambiguity with a mandatory **Implementation Strategy Gate**.
The central rule is:

```text
NO APPROVED REFERENCE
        ↓
     GREENFIELD

APPROVED REFERENCE EXISTS
        ↓
    FEATURE_GRAFT
```

There is no third default state such as `agent_choice`, `inspired_by`, or `hybrid_unspecified`.

The plan remains the highest implementation authority. A donor repository supplies implementation material; it does **not** redefine the target architecture.

The intended behavior is closer to selective biological transplantation than copy/paste:

```text
PLAN → TARGET FEATURE CONTRACT → DONOR ANATOMY → DEPENDENCY CONE
     → TRANSPLANT MANIFEST → COMPATIBILITY SURGERY → INTEGRATION
     → BLAST-RADIUS VERIFICATION → ACCEPTED NATIVE FEATURE
```

The objective is not maximum code reuse. The objective is **maximum justified reuse with minimum architectural contamination**.

---

# 2. Problem Statement

Implementation references are valuable because they contain more than visible behavior. A mature feature often consists of a connected assembly:

```text
entry point
interfaces
state model
configuration
helpers
callers / callees
error contracts
lifecycle hooks
tests
operational assumptions
```

Rewriting the visible surface from zero discards this accumulated engineering. Copying files blindly creates the opposite failure: hidden dependencies and foreign authority are imported without understanding.

Agent Core therefore needs a deterministic boundary between:

1. **greenfield construction**, where the feature must be designed from first principles inside the target architecture; and
2. **feature transplantation**, where an approved donor must be anatomized and selectively grafted rather than ignored.

This boundary must exist before the first meaningful source mutation.

The gate must make the strategy observable, auditable, testable, and eventually enforceable through the same routed operational surface that already protects meaningful Agent Core work.

---

# 3. Goals

The design must:

- make implementation strategy a first-class route/task decision;
- force `GREENFIELD` when no approved donor implementation exists;
- force `FEATURE_GRAFT` when one or more approved donor implementations exist;
- require the target plan to be read and normalized before donor analysis;
- model donor features as connected dependency cones rather than isolated files;
- classify donor components as `KEEP`, `ADAPT`, `REPLACE`, `DROP`, or `REIMPLEMENT`;
- require a transplant manifest before target mutation in `FEATURE_GRAFT` mode;
- preserve existing Agent Core authorities over memory, execution, routing, workspace policy, audit, authentication, and durability;
- detect authority conflicts before donor code is accepted;
- record provenance without storing raw donor source in DMF;
- support one or multiple donor repositories without making cross-repo discovery itself an implementation authority;
- allow Graft, codebase-memory-mcp, or future providers behind one code-intelligence abstraction;
- require behavior preservation plus host-integration verification for grafted features;
- use existing route context and operational audit lineage rather than introducing an unrelated orchestration plane;
- remain local-first and deterministic for strategy enforcement;
- fail closed before mutation when required strategy evidence is absent or inconsistent.

---

# 4. Non-Goals
This design does **not** aim to:

- make Agent Core automatically copy code from arbitrary repositories;
- treat every mentioned URL or repository name as an approved donor;
- replace software design with mechanical code reuse;
- create a marketplace of untrusted code fragments;
- bypass license, attribution, security, or provenance obligations;
- import an entire donor repository when only one feature is required;
- make donor architecture override the target plan;
- make Graft, CBM, GitHub, or any external index the authoritative implementation planner;
- persist copyrighted/raw donor source as long-term Agent Core memory;
- require an LLM or external model to enforce the strategy state machine;
- add a second execution engine, memory authority, or routing authority;
- permit a transplant simply because two functions have similar names;
- silently reinterpret an unavailable donor as a greenfield task;
- call code “transplanted” when the implementation was actually recreated from zero;
- call code “greenfield” when donor implementation material was used as source material.

The system is an implementation-governance layer, not a source-code ownership policy engine. License compatibility remains an explicit gate whose factual inputs come from repository metadata and operator-approved policy.

---

# 5. Terminology
## 5.1 Plan

The target implementation contract. It defines required behavior, constraints, non-goals, verification expectations, and target architecture. The plan outranks all donors.

## 5.2 Approved Reference

A repository, commit, directory, artifact, or source bundle explicitly declared as implementation reference material for the current feature. Mere mention is not approval.

## 5.3 Donor

An approved reference that contains implementation material from which a feature may be selectively transplanted.

## 5.4 Target

The project receiving the implementation. In this design the primary target is Agent Core, but the gate should be reusable by future Agent Core-managed projects.

## 5.5 Feature Contract

A normalized statement of the exact behavior required by the plan before donor code is inspected.

## 5.6 Feature Anatomy

The set of donor symbols, files, interfaces, state, configuration, tests, and lifecycle hooks that collectively implement the requested behavior.

## 5.7 Dependency Cone

The bounded graph reachable from the feature anatomy that is required to preserve its behavior or understand its integration assumptions.
## 5.8 Transplant Manifest

A pre-mutation record describing which donor components will be kept, adapted, replaced, dropped, or reimplemented, and why.

## 5.9 Compatibility Surgery

The bounded changes required to make retained donor logic obey target contracts without turning the donor into a second architectural authority.

## 5.10 Authority Conflict

A condition where donor code attempts to own a concern already owned by a target subsystem, for example memory persistence, execution state, authentication, audit, workspace containment, or lifecycle truth.

## 5.11 Provenance

The trace from target behavior to donor repository identity, commit/tree identity where available, source paths/symbols, classification decisions, adaptations, and verification evidence.

## 5.12 Behavioral Parity

Evidence that the transplanted feature still preserves the intended donor behavior selected by the plan.

## 5.13 Host Integration Parity

Evidence that the transplanted feature obeys target architecture, security, lifecycle, and verification contracts.

---

# 6. Factual Agent Core Integration Baseline
The design does not start from a blank orchestration layer.

Current Agent Core already provides:

```text
CapabilityRouter
  → RoutePlan
  → routeContextId
  → allowedTools / verification

MemoryPreflightEngine
  → bounded recall / guardrails / prior failures / decisions

memory-lifecycle-guard
  → meaningful-work classification
  → disabled / advisory / enforce
  → POSTFLIGHT_PENDING transition

OperationalMemoryAudit
  → intended / succeeded / failed / rejected evidence

WorkspacePolicy
  → allowed-root containment

ExecutionService / ProcessManager
  → bounded local execution

GitHubService
  → repository/GitHub fabric
```

The Strategy Gate must compose with these services rather than bypass them.
Current `RoutePlan` already records:

```text
tier
mode
domain
confidence
risk
recommendedCapabilities
requiredSkillLoads
allowedTools
verification
reasonCodes
```

The Strategy Gate should extend routed task context with implementation-strategy state rather than create a parallel task identity.

Current operational mutations already pass through routed tools such as `write_file`, `edit_file`, `create_directory`, `move_file`, `execute_command`, and execution operations. These are the correct enforcement boundary for future strategy leases.

The current design base is not a clean working tree. Several v0.7.0 and launcher/GitHub changes are already present locally. This specification therefore creates only a new roadmap document and must not be interpreted as certification of the current working tree.

---

# 7. Architectural Principles
## 7.1 Plan over donor

The plan defines what must exist. The donor is evidence/material for how part of that behavior has been implemented elsewhere.

```text
PLAN > TARGET ARCHITECTURE > DONOR IMPLEMENTATION
```

## 7.2 Strategy before mutation

No meaningful implementation mutation may begin before the strategy state is resolved and persisted for the route/task.

## 7.3 Forced mode, not suggested mode

When an approved donor exists, `FEATURE_GRAFT` is mandatory. When none exists, `GREENFIELD` is mandatory.

## 7.4 Reuse behavior, preserve host authority

A donor can contribute logic, algorithms, tests, state transitions, and internal composition. It cannot silently replace an existing target authority.

## 7.5 Graph before file copy

No file should be transplanted until its role and dependency relationships are understood sufficiently to classify it.

## 7.6 Evidence before transplantation

Similarity is a discovery signal. It is not authorization to reuse a component.
## 7.7 Provenance without source duplication

DMF should remember durable decisions such as donor identity, component classification, rejected authority, and verified outcome. It should not become a mirror of donor source code.

## 7.8 Fail closed on ambiguity

An unresolved donor identity, missing plan, unclear license posture, stale manifest, or mismatched strategy lease blocks meaningful mutation in enforcement mode.

## 7.9 Provider-agnostic code intelligence

Agent Core owns the strategy contract. Graft, CBM, native search, LSP, or future analyzers are interchangeable evidence providers.

## 7.10 Minimal transplantation surface

Prefer the smallest dependency-complete assembly that preserves the selected behavior. Do not equate more copied code with higher fidelity.

## 7.11 Tests are transplant organs too

Relevant donor tests, fixtures, invariants, and failure cases are part of feature anatomy. Porting behavior without its verification contract is incomplete transplantation.

## 7.12 No hidden hybrid

A task cannot silently switch from `FEATURE_GRAFT` to greenfield because grafting became inconvenient. Strategy changes require an explicit transition record and reason code.

---

# 8. Strategy Decision Contract
The strategy vocabulary is intentionally small:

```ts
export type ImplementationStrategyMode =
  | 'GREENFIELD'
  | 'FEATURE_GRAFT';
```

A resolved strategy should minimally carry:

```ts
export interface ImplementationStrategyDecision {
  strategyId: string;
  routeContextId: string;
  projectId: string;
  mode: ImplementationStrategyMode;
  planRef: string;
  approvedReferences: ApprovedReference[];
  reasonCodes: ImplementationStrategyReasonCode[];
  createdAt: number;
  expiresAt: number;
  planFingerprint: string;
  referenceSetFingerprint: string;
}
```

The strategy is a scoped operational contract, not a global repository setting.
Proposed reason codes:

```text
NO_APPROVED_REFERENCE
APPROVED_REFERENCE_PRESENT
MULTIPLE_APPROVED_REFERENCES
PLAN_REQUIRES_REFERENCE
REFERENCE_UNAVAILABLE
REFERENCE_IDENTITY_CHANGED
LICENSE_BLOCKED
ARCHITECTURE_INCOMPATIBLE
TECHNICALLY_NONPORTABLE
REFERENCE_BROKEN
DONOR_BEHAVIOR_UNVERIFIABLE
```

`REFERENCE_UNAVAILABLE` does **not** automatically convert `FEATURE_GRAFT` to `GREENFIELD`. If the plan declares a donor and it cannot be read, the correct default is blocked strategy resolution.

A deliberate strategy transition may be allowed only when the plan/operator explicitly changes the reference contract or an exception reason is accepted.

Example:

```text
FEATURE_GRAFT
  -- LICENSE_BLOCKED + explicit reimplementation authorization --> GREENFIELD
```

The transition itself must be auditable.

---

# 9. Reference Declaration and Resolution
An implementation reference must be explicit. Valid declaration sources may include:

- a structured reference block inside the plan;
- an explicit user/operator declaration tied to the current task;
- a repository URL plus feature/subsystem target;
- a local donor path plus immutable Git identity when available;
- an attached source bundle whose hash is recorded.

A repository merely mentioned for comparison, research, inspiration, benchmarking, or documentation is **not** automatically a donor.

Proposed reference shape:

```ts
export interface ApprovedReference {
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
```

Where Git identity is available, a floating branch name alone is insufficient provenance for an accepted transplant manifest.
Reference resolution should produce:

```text
resolved donor identity
feature scope
availability
license metadata/evidence location
source fingerprint
analysis provider availability
```

The gate should hash the normalized reference set. A manifest created for one donor SHA must become stale if that donor identity changes.

For multiple donors, every donor remains separately identifiable. Agent Core must never flatten provenance into an opaque statement such as “based on several projects”.

---

# 10. Mode A — GREENFIELD

`GREENFIELD` means no approved donor implementation is available for the feature being implemented.

Required lifecycle:

```text
PLAN
  ↓
FEATURE CONTRACT
  ↓
TARGET ARCHITECTURE / EXISTING INTERNAL PATTERNS
  ↓
FAILING TEST / ACCEPTANCE CONTRACT
  ↓
IMPLEMENT FROM FIRST PRINCIPLES
  ↓
VERIFY
```

Greenfield mode is not permission to ignore existing code in the target repository.
The agent should still study:

- target interfaces;
- target architectural conventions;
- adjacent working implementations;
- existing tests;
- current memory guardrails and decisions;
- official library/runtime documentation when needed.

What greenfield mode forbids is silently introducing a donor implementation after the strategy decision without reopening the gate.

Proposed greenfield invariant:

```text
approvedReferences.length == 0
strategy.mode == GREENFIELD
transplantManifest == absent
```

If a donor is discovered mid-task and the operator approves it for implementation use, the current strategy lease becomes stale. Mutation pauses, the gate reruns, and the task transitions to `FEATURE_GRAFT` before donor-derived code is introduced.

Greenfield verification remains target-oriented:

```text
plan behavior
+ target architecture
+ focused tests
+ blast radius
+ regression
```

---

# 11. Mode B — FEATURE_GRAFT
`FEATURE_GRAFT` means at least one approved donor contains implementation material relevant to the plan.

The agent is prohibited from starting with a clean-room rewrite merely because it is easier to reason about.

Mandatory lifecycle:

```text
1. READ_PLAN
2. NORMALIZE_FEATURE_CONTRACT
3. RESOLVE_DONOR_IDENTITY
4. ANALYZE_DONOR_ANATOMY
5. EXPAND_BOUNDED_DEPENDENCY_CONE
6. IDENTIFY_DONOR_TESTS_AND_INVARIANTS
7. DETECT_AUTHORITY_CONFLICTS
8. BUILD_TRANSPLANT_MANIFEST
9. VALIDATE_LICENSE / PROVENANCE POSTURE
10. ISSUE_STRATEGY_LEASE
11. TRANSPLANT_INCREMENTALLY
12. ADAPT_HOST_BOUNDARIES
13. RUN_DONOR_BEHAVIOR_TESTS
14. RUN_HOST_INTEGRATION_TESTS
15. RUN_BLAST_RADIUS_VERIFICATION
16. RECORD_FINAL_PROVENANCE
17. MEMORY_POSTFLIGHT / CONTINUITY CHECKPOINT
```

Steps 1–10 occur before meaningful target-source mutation.

---

# 12. Feature Contract Before Donor Analysis
Donor analysis must not define the feature request retroactively.

The normalized feature contract should capture:

```ts
export interface FeatureContract {
  featureId: string;
  title: string;
  objective: string;
  requiredBehaviors: string[];
  requiredInvariants: string[];
  explicitNonGoals: string[];
  targetAuthorities: string[];
  verificationRequirements: string[];
  targetPaths?: string[];
  planFingerprint: string;
}
```

Example:

```text
Feature: automatic process recovery
Required: detect death, bounded retry, restart, verify health
Non-goals: dashboard, remote telemetry, notification service
Authority: existing Agent Core process/execution ownership
```

Only after this contract exists should donor anatomy be queried. This prevents donor convenience from silently widening the task.

---

# 13. Donor Anatomy and Dependency Cone
Feature anatomy is not a list of matching filenames. It is a bounded graph centered on the requested behavior.

The analysis provider should attempt to identify:

- implementation entry points;
- defining symbols;
- inbound callers;
- outbound calls;
- imported modules;
- interfaces/types/contracts;
- state persistence;
- configuration inputs;
- lifecycle/startup/shutdown hooks;
- error and retry behavior;
- tests and fixtures;
- public API/route/tool surfaces;
- cross-repository edges where applicable.

The dependency cone expands only while a component is required to:

```text
preserve behavior
understand an invariant
satisfy compilation/runtime linkage
port a verification contract
or identify an authority boundary
```

Weak lexical similarity alone must not expand the cone.
Suggested bounded analysis defaults for an initial implementation:

```text
seed feature symbols       <= 32
expanded symbols           <= 500
expanded files             <= 200
max dependency hops        4
candidate donor tests      <= 100
```

These are safety starting points, not certified performance numbers. Providers may return less when a smaller cone is sufficient.

The analysis result must distinguish `unknown` from `not_required`. Missing graph evidence must never be silently interpreted as absence of dependency.

---

# 14. Transplant Classification

Every component selected into the manifest receives one primary action:

```text
KEEP
ADAPT
REPLACE
DROP
REIMPLEMENT
```

The classification is about integration intent, not file ownership.

A single source file may contain symbols with different classifications.
## 14.1 KEEP

Retain donor logic with only mechanical integration changes when the behavior and architectural assumptions are compatible.

## 14.2 ADAPT

Preserve the donor's core behavior while changing interfaces, configuration, types, paths, error mapping, lifecycle wiring, or host bindings.

## 14.3 REPLACE

The role is required, but the donor implementation conflicts with or duplicates a target authority. Bind the feature to the existing target subsystem instead.

## 14.4 DROP

The component is not required by the feature contract and is not needed for dependency completeness.

## 14.5 REIMPLEMENT

The behavior remains required but donor code cannot be transplanted directly. This classification requires an explicit reason such as incompatible license posture, technical non-portability, broken donor implementation, or irreducible architectural conflict.

`REIMPLEMENT` is not a convenience escape hatch from `FEATURE_GRAFT`. The manifest must still show what donor behavior is being preserved and how parity will be verified.

---

# 15. Transplant Manifest Contract
Proposed manifest shape:

```ts
export interface TransplantManifest {
  manifestId: string;
  strategyId: string;
  featureContractHash: string;
  donorSetHash: string;
  components: TransplantComponent[];
  authorityConflicts: AuthorityConflict[];
  donorTests: DonorTestMapping[];
  hostVerification: VerificationRequirement[];
  createdAt: number;
}

export interface TransplantComponent {
  referenceId: string;
  sourcePath: string;
  symbol?: string;
  action: 'KEEP' | 'ADAPT' | 'REPLACE' | 'DROP' | 'REIMPLEMENT';
  rationaleCode: string;
  targetPath?: string;
  targetBinding?: string;
  evidenceRefs: string[];
}
```

The manifest is immutable by identity. A changed donor SHA, changed plan fingerprint, or changed component decision creates a new manifest revision rather than silently rewriting prior evidence.
Required manifest invariants:

```text
FEATURE_GRAFT requires manifest
manifest.strategyId == active strategyId
manifest.featureContractHash == active plan-derived feature hash
manifest.donorSetHash == active resolved donor set
all transplanted donor symbols have provenance
all REPLACE/REIMPLEMENT actions have rationale
all detected authority conflicts are resolved or blocking
```

The initial implementation may persist manifests under ignored runtime state and expose a bounded safe projection through route/audit surfaces. A future tracked manifest format may be added for explicitly version-controlled transplantation records, but that is not required for the first gate.

---

# 16. Authority Conflict Detection

Agent Core must preserve one owner for each authoritative concern.

Initial protected target authorities include:

```text
semantic memory         → DMF / MemoryService
memory lifecycle        → hard lifecycle + memory lifecycle state
workspace containment   → WorkspacePolicy
routing                 → CapabilityRouter / RouteContextStore
operational execution   → ExecutionService / ProcessManager
GitHub operations       → GitHubService
operational audit       → AuditJournal / OperationalMemoryAudit
authentication          → Agent Core auth/key/OAuth layer
runtime health truth    → existing health services
```

A donor component that attempts to become a second owner of one of these concerns must not be `KEEP` by default.
Example:

```text
DONOR
RecoverySupervisor
  ├─ DonorProcessRegistry
  ├─ DonorLogger
  └─ RetryPolicy

TARGET
RecoverySupervisor        KEEP / ADAPT
RetryPolicy               KEEP
DonorProcessRegistry      REPLACE → Agent Core process/execution authority
DonorLogger               REPLACE → Agent Core audit authority
```

Another example:

```text
DonorMemoryStore → REPLACE → DMF
```

The correct operation is to transplant capability while reconnecting it to target-owned truth.

An unresolved authority conflict is a hard blocker for strategy lease issuance.

---

# 17. Compatibility Surgery and Adapter Preference
When donor core behavior is sound but host interfaces differ, prefer an explicit adapter boundary over widespread modification of donor internals.

```text
Donor Core
    │
    ▼
Compatibility Adapter
    │
    ▼
Agent Core Authority
```

Adapter preference is not absolute. If an adapter would preserve a wrong ownership model, hide unsafe state duplication, or create permanent translation debt larger than a direct adaptation, the manifest may choose `ADAPT` at the donor boundary instead.

Compatibility mappings should be explicit, for example:

```text
DonorConfig          → AgentCoreConfig projection
DonorLogger          → RuntimeAuditLogger
DonorProcessRegistry → ProcessManager / ExecutionService adapter
DonorEvents          → bounded runtime audit events
DonorStore           → existing target storage authority
```

The adapter must not fabricate success, suppress target guardrails, or weaken workspace/authentication boundaries.

---

# 18. Code Intelligence Provider Abstraction
Agent Core should define a provider-neutral interface rather than importing a specific code-intelligence product into core strategy logic.

Proposed minimum interface:

```ts
export interface CodeIntelligenceProvider {
  providerId(): string;
  mapArchitecture(request: ArchitectureRequest): Promise<ArchitectureResult>;
  findFeature(request: FeatureSearchRequest): Promise<FeatureSearchResult>;
  traceInbound(request: SymbolTraceRequest): Promise<SymbolTraceResult>;
  traceOutbound(request: SymbolTraceRequest): Promise<SymbolTraceResult>;
  findTests(request: TestDiscoveryRequest): Promise<TestDiscoveryResult>;
  blastRadius(request: BlastRadiusRequest): Promise<BlastRadiusResult>;
  freshness(request: FreshnessRequest): Promise<FreshnessResult>;
}
```

Candidate adapters may include:

```text
GraftCodeIntelligenceProvider
CodebaseMemoryMcpProvider
NativeSearchFallbackProvider
```

The provider returns evidence. The Strategy Gate decides what that evidence means.

If no graph provider is available, a bounded native fallback may use repository search/read operations, but `FEATURE_GRAFT` must not claim dependency completeness unless the fallback evidence actually supports it.

---

# 19. Graft and CBM Roles
Graft and codebase-memory-mcp solve overlapping but different parts of donor understanding.

A future integration may use them as complementary providers:

```text
Graft
  → readable subsystem/context nodes
  → repo map
  → callers / blast radius
  → working-tree freshness

CBM
  → dense structural knowledge graph
  → cross-repo relationships
  → semantic/structural search
  → deep symbol/call/data-flow analysis
```

Neither becomes durable Agent Core memory authority. Their indexes remain regenerable code-intelligence state.

The Strategy Gate must also function without either provider so core correctness is not coupled to optional analysis tooling. In that state, complex graft tasks may block with `DONOR_ANALYSIS_INSUFFICIENT` rather than pretending a shallow file scan is equivalent.

---

# 20. Route Integration

The Strategy Gate should attach to the existing route lifecycle.

Target logical flow:

```text
capability_route
     ↓
RoutePlan
     ↓
Memory Preflight
     ↓
Implementation Strategy Resolution
     ↓
RouteContext + Strategy Lease
     ↓
operational tools
```

Read-only donor analysis may occur before a mutation lease exists; target mutation may not.
Proposed `RouteContext` strategy projection:

```ts
implementationStrategy?: {
  strategyId: string;
  mode: 'GREENFIELD' | 'FEATURE_GRAFT';
  planFingerprint: string;
  referenceSetFingerprint: string;
  manifestId?: string;
  leaseId?: string;
  state: 'analysis' | 'ready' | 'mutation_started' | 'verification_pending' | 'closed';
}
```

`CapabilityRouter` should remain responsible for tier/risk/tool routing. The new resolver is a separate policy component invoked for tasks classified as implementation-bearing meaningful work.

This avoids teaching the lexical router how to parse complex donor manifests while preserving one route authority.

Suggested runtime composition:

```text
RuntimeServices
  ├─ router
  ├─ routes
  ├─ memory
  ├─ execution
  ├─ github
  └─ implementationStrategy
```

---

# 21. Implementation-Bearing Work Classification
Not every routed tool call needs a strategy gate.

The first implementation should distinguish:

```text
read-only investigation                 → no mutation lease required
planning/documentation only             → no implementation strategy enforcement
source/config/test mutation for feature → strategy required
build/test command after mutation       → strategy context required
unrelated operator maintenance          → governed by existing route/lifecycle policy
```

The classification must be structural/tool-aware rather than relying only on words in the user prompt.

A route whose objective is `implement`, `fix`, `refactor`, `add feature`, `port`, `integrate`, or equivalent and which attempts code/config/test mutation should require strategy resolution.

Pure documentation edits may optionally record strategy metadata when documenting a graft, but must not be blocked as though they were source transplantation unless the plan explicitly treats generated/config artifacts as implementation material.

---

# 22. Strategy Lease and Mutation Guard

A resolved strategy should produce an opaque scoped lease analogous in spirit to the memory context lease.

The lease proves only that the required implementation planning gate was completed for the current plan/reference snapshot. It does not prove the implementation is correct.

Proposed lease validation inputs:

```text
principal/project
routeContextId
strategyId
planFingerprint
referenceSetFingerprint
manifestId when FEATURE_GRAFT
expiry
```

A lease is invalidated by plan or donor identity drift.
Target enforcement point:

```text
routeGuarded(...)
  ↓
validateMemoryLifecycleBeforeOperation(...)
  ↓
validateImplementationStrategyBeforeOperation(...)
  ↓
actual mutation
```

The order should preserve existing hard memory lifecycle semantics. The precise ordering between memory and strategy guards must be tested so rejection creates no filesystem/process side effect and no false postflight transition.

Proposed enforcement modes mirror the proven memory rollout pattern:

```text
disabled
advisory
enforce
```

Initial production rollout should be:

```text
disabled → advisory → isolated enforce canary → live enforce
```

Advisory mode records what would have been rejected without changing tool behavior.

---

# 23. Strategy State Machine
Proposed lifecycle:

```text
UNRESOLVED
   │
   ▼
PLAN_RESOLVED
   │
   ▼
REFERENCE_RESOLVED
   │
   ├─ no donor ──────────────► GREENFIELD_READY
   │
   └─ donor exists
          │
          ▼
     DONOR_ANALYZED
          │
          ▼
     MANIFEST_READY
          │
          ▼
     FEATURE_GRAFT_READY

READY
  ↓ first meaningful mutation
MUTATION_STARTED
  ↓
VERIFICATION_PENDING
  ↓ verified
CLOSED
```

A blocked state may be entered from any pre-mutation state.
Blocking examples:

```text
BLOCKED_PLAN_MISSING
BLOCKED_REFERENCE_UNAVAILABLE
BLOCKED_REFERENCE_IDENTITY_CHANGED
BLOCKED_DONOR_ANALYSIS_INSUFFICIENT
BLOCKED_MANIFEST_MISSING
BLOCKED_AUTHORITY_CONFLICT
BLOCKED_LICENSE_POSTURE
BLOCKED_STRATEGY_STALE
```

`CLOSED` requires verification evidence or an explicit failed/abandoned terminal decision. Merely stopping work does not imply success.

A new route/task may reuse prior strategy knowledge as memory context, but must obtain a fresh strategy lease against current plan/reference fingerprints before new meaningful mutation.

---

# 24. Operational Audit and Provenance Events

Strategy decisions should enter the existing local audit journal with bounded fields.

Proposed event vocabulary:

```text
implementation.strategy_resolved
implementation.strategy_blocked
implementation.reference_resolved
implementation.donor_analyzed
implementation.manifest_created
implementation.authority_conflict_detected
implementation.authority_conflict_resolved
implementation.mutation_started
implementation.verification_completed
implementation.strategy_closed
```

Audit records must not contain complete donor file bodies.
Safe audit fields may include:

```text
strategyId
mode
routeContextId
projectId hash/safe scope
plan fingerprint
reference IDs
commit/tree hashes
manifestId
component counts by classification
authority conflict codes
verification status
reason codes
```

Provenance should be detailed enough to reconstruct why a target component exists without requiring DMF to store the original donor implementation.

---

# 25. Memory and Continuity Integration

The durable memory value is not the copied source. It is the engineering decision around the transplant.

High-value postflight memories may include:

```text
feature X used donor Y at commit Z
component A was retained because behavior matched target contract
component B was replaced by target authority C
adapter D is the compatibility boundary
approach E failed during transplantation because ...
verification F proved donor behavior and host integration
```

Existing memory decision policy remains authoritative over whether these facts deserve durable memory.
Recommended memory relations for future use may include existing generic relations plus semantically explicit evidence in values/metadata such as:

```text
grafted_from
adapted_from
replaced_donor_authority
validated_by
failed_because
resolved_by
```

This design does not require a new DMF relation vocabulary before the Strategy Gate can ship. If relation schema changes are proposed later, they must follow the existing Memory Nervous System authority and migration rules.

Continuity checkpoints should record:

```text
strategy mode
active donor identities
manifestId
current transplant step
verification pending/completed
blocking reason if interrupted
```

This allows a later session to resume the same operation without reclassifying the donor from scratch, while still revalidating freshness.

---

# 26. Verification Contract

`GREENFIELD` and `FEATURE_GRAFT` share target verification, but graft mode adds donor-parity requirements.

Greenfield acceptance:

```text
plan behavior PASS
target architecture PASS
focused tests PASS
blast radius PASS
regression PASS
```

Feature graft acceptance:
```text
donor selected behavior PASS
transplanted component tests PASS
host adapter/integration tests PASS
authority conflict checks PASS
blast radius PASS
regression PASS
provenance complete
```

The verification engine must distinguish:

```text
behavior preserved
behavior intentionally changed by plan
behavior dropped as non-goal
behavior unverified
```

A donor test that encodes behavior explicitly excluded by the target plan must not become an accidental target requirement.

For a modified donor algorithm, parity may be established through ported tests, fixtures, differential tests, or equivalent deterministic acceptance evidence.

The Strategy Gate does not weaken the existing rule that process exit or lack of error is insufficient evidence of success.

---

# 27. Blast-Radius Verification

Blast radius is required for meaningful source transplantation because the target may already have callers and contracts absent from the donor.

The preferred evidence path is a graph provider. Native repository search is a bounded fallback.

Required blast-radius output should include affected target symbols/files, inbound dependencies, relevant tests, API/tool surfaces, and unresolved unknowns.
The final verification record must identify whether blast-radius analysis was graph-backed, fallback-backed, or incomplete.

Incomplete blast-radius evidence may be acceptable only for an explicitly bounded canary; it cannot support a stable transplantation claim.

---

# 28. License and Provenance Gate

Before direct donor source transplantation, the implementation must have a known reuse posture.

The first implementation does not need to become a universal license lawyer. It does need to fail closed when direct reuse authorization is unknown.

Proposed posture states:

```text
COMPATIBLE
REQUIRES_ATTRIBUTION
REIMPLEMENT_ONLY
UNKNOWN_BLOCKING
```

The factual evidence may come from repository license files, package metadata, operator policy, and explicitly recorded approval.

If direct reuse is blocked but behavior may lawfully be independently implemented, the task remains conceptually `FEATURE_GRAFT` until the manifest records the affected components as `REIMPLEMENT`; donor behavior/tests remain reference evidence while donor source is not transplanted.

No credential, access token, or restricted repository content should be copied into provenance records.

---

# 29. Security and Trust Boundary
The Strategy Gate operates inside existing Agent Core trust boundaries.

It must not:

- widen allowed filesystem roots;
- authorize GitHub access beyond existing GitHubService credentials/policy;
- bypass routed tool permissions;
- weaken memory hard guardrails;
- expose raw secret values in manifests or audit;
- execute donor installation scripts merely to understand a feature;
- trust generated donor indexes more than source identity;
- treat code-intelligence output as authenticated source when the donor has changed;
- permit a donor to introduce a second remote writer or storage authority without explicit architecture approval.

Donor analysis should prefer read-only operations until the transplant manifest is accepted.

Any optional code-intelligence process should be launched with the minimum workspace scope required for the donor/target analysis and should remain non-authoritative.

---

# 30. Proposed Error Codes

```text
IMPLEMENTATION_STRATEGY_REQUIRED
IMPLEMENTATION_STRATEGY_STALE
IMPLEMENTATION_PLAN_REQUIRED
IMPLEMENTATION_REFERENCE_REQUIRED
IMPLEMENTATION_REFERENCE_UNAVAILABLE
IMPLEMENTATION_REFERENCE_IDENTITY_MISMATCH
IMPLEMENTATION_MANIFEST_REQUIRED
IMPLEMENTATION_MANIFEST_STALE
IMPLEMENTATION_DONOR_ANALYSIS_INSUFFICIENT
IMPLEMENTATION_AUTHORITY_CONFLICT
IMPLEMENTATION_LICENSE_BLOCKED
IMPLEMENTATION_PROVENANCE_INCOMPLETE
IMPLEMENTATION_VERIFICATION_REQUIRED
```

Errors must be deterministic and safe to expose without embedding donor source or credentials.
---

# 31. Configuration and Rollout

Proposed configuration:

```text
AGENT_CORE_IMPLEMENTATION_STRATEGY_MODE=disabled|advisory|enforce
```

Default during initial development should remain `disabled` until contract tests and isolated canaries pass. The production rollout should follow the same conservative progression already used for hard memory lifecycle.

Optional provider configuration belongs outside the strategy decision itself, for example:

```text
preferred code-intelligence provider
provider executable/path
provider cache root
analysis bounds
```

Provider failure must not mutate strategy truth. It may produce a blocked analysis state.

Rollback from enforcement to advisory/disabled changes mutation gating only; it must not delete manifests, audit history, or DMF decisions.

---

# 32. Performance Contract

Strategy planning occurs before mutation and may be more expensive than an ordinary atomic route, but it must remain bounded and cache-aware.
Initial performance goals should be measured separately for:

```text
strategy resolution without donor graph
reference identity resolution
donor graph query latency
manifest construction
lease validation on each mutation
blast-radius query latency
```

The hot-path mutation guard must be cheap. After strategy/manifest creation, per-tool validation should be a bounded local lookup/hash comparison rather than rerunning donor analysis.

Suggested first targets, subject to measurement:

```text
strategy lease validation p95        < 10 ms
local manifest lookup p95            < 10 ms
no-drift freshness validation p95    < 50 ms when provider supports cheap fingerprints
```

Full donor indexing/build time is not part of the per-mutation hot path and must be reported separately rather than hidden inside route latency.

---

# 33. MCP and Tool Surface Policy

The first implementation should avoid unnecessary public MCP tool expansion.

Preferred path:

```text
capability_route / route context
+ internal strategy resolver
+ existing read/search/GitHub tools
+ strategy-aware mutation guard
```

If explicit model-facing operations are later required, add only the minimum bounded surface, for example `implementation_strategy_status` or a manifest-inspection tool, after proving internal routing cannot provide sufficient visibility.
The tool surface must never expose raw donor source simply because provenance exists.

---

# 34. Implementation Roadmap

The feature should be implemented as a staged governance capability, not as one large patch.

## Task 1 — Define Strategy Types and Deterministic Resolver

**Files:** create a focused module under `src/implementation/` or equivalent; extend route/runtime types only where required.
**Tests:** create strategy resolver contract tests.

- [ ] Define `GREENFIELD` and `FEATURE_GRAFT` as the only normal resolved modes.
- [ ] Define approved reference and feature-contract types.
- [ ] Resolve `0 references → GREENFIELD`, `>=1 approved reference → FEATURE_GRAFT`.
- [ ] Reject unavailable/ambiguous explicitly-required references rather than silently falling back.
- [ ] Add deterministic reason codes and fingerprints.
- [ ] Prove replay with identical inputs produces identical strategy identity fields except opaque instance/time fields.

**Exit gate:** strategy resolution is deterministic and no mutation enforcement exists yet.

## Task 2 — Bind Strategy State to Route Context

**Files:** `src/runtime/route-context-store.ts`, capability route/runtime composition as required.
**Tests:** route-context and capability-routing tests.

- [ ] Add bounded strategy projection to route context.
- [ ] Preserve existing `RoutePlan` tier/mode/risk semantics.
- [ ] Ensure read-only routes remain usable while strategy analysis is pending.
- [ ] Add stale-plan/reference fingerprint detection.

**Exit gate:** one route can carry strategy state without changing existing operational behavior.
## Task 3 — Introduce Code Intelligence Provider Interface

**Files:** provider-neutral interfaces plus adapters outside core authority paths.
**Tests:** provider contract fixtures with deterministic fake graphs.

- [ ] Implement architecture/feature/trace/test/blast/freshness contracts.
- [ ] Add a deterministic fake provider for tests.
- [ ] Add bounded native fallback behavior.
- [ ] Distinguish `complete`, `partial`, and `insufficient` analysis evidence.
- [ ] Do not make Graft or CBM a mandatory core dependency in this task.

**Exit gate:** donor anatomy can be represented independently of any single external analyzer.

## Task 4 — Build Donor Anatomy and Transplant Manifest Planner

**Files:** `src/implementation/` planner modules and manifest persistence under ignored runtime state.
**Tests:** feature-cone, classification, stale-manifest, multi-donor fixtures.

- [ ] Normalize the plan-derived `FeatureContract` before donor graph calls.
- [ ] Discover entry points, dependency cone, tests, lifecycle, and state/config dependencies.
- [ ] Require every selected component to receive one classification.
- [ ] Record `KEEP/ADAPT/REPLACE/DROP/REIMPLEMENT` rationale.
- [ ] Hash plan + donor set + manifest content.
- [ ] Reject manifest readiness when required graph evidence is unknown.

**Exit gate:** `FEATURE_GRAFT` can reach `MANIFEST_READY` with no target mutation.
## Task 5 — Implement Authority Conflict Registry

**Files:** target-authority registry plus manifest conflict evaluation.
**Tests:** memory/execution/workspace/audit/auth conflict fixtures.

- [ ] Encode current Agent Core authority owners as policy data, not donor-specific heuristics.
- [ ] Detect donor storage, process, routing, audit, authentication, and lifecycle ownership collisions.
- [ ] Require conflicts to resolve to `REPLACE`, `ADAPT`, explicit architecture approval, or blocking state.
- [ ] Prove a donor SQLite memory subsystem cannot become a second semantic-memory authority.
- [ ] Prove donor process ownership cannot bypass existing ProcessManager/ExecutionService policy.

**Exit gate:** manifest readiness is impossible with unresolved protected-authority conflicts.

## Task 6 — Add Strategy Lease and Mutation Guard in Advisory Mode

**Files:** routed operational guard path, runtime service composition, config.
**Tests:** write/edit/process/execution mutation acceptance plus read-only controls.

- [ ] Classify implementation-bearing meaningful work.
- [ ] Issue scoped strategy leases after required planning state is ready.
- [ ] Validate lease before source/config/test mutation.
- [ ] Start in advisory mode; record would-reject events without changing mutations.
- [ ] Prove existing memory hard-lifecycle semantics remain unchanged.
- [ ] Prove rejected/stale strategy checks occur before filesystem/process side effects in enforce-mode fixtures.

**Exit gate:** advisory evidence is complete and existing tool behavior remains backward compatible.
## Task 7 — Verification, Blast Radius, Provenance, and Memory Bridge

**Files:** verification coordinator, audit projection, bounded memory/continuity integration.
**Tests:** donor parity, host integration, blast-radius, provenance redaction, continuity resume.

- [ ] Record intended donor behavior and ported verification requirements.
- [ ] Require target integration verification separately from donor parity.
- [ ] Query blast radius and record provider/fallback completeness.
- [ ] Emit bounded strategy/provenance audit events.
- [ ] Persist only high-value strategy decisions through existing DMF postflight policy.
- [ ] Add continuity checkpoint projection for active transplant work.
- [ ] Prove raw donor bodies and credentials do not appear in audit/DMF by default.

**Exit gate:** a completed graft is explainable from provenance and evidence without duplicating donor source into memory.

## Task 8 — Enforce with a Real Complex Canary

**Files:** only defects exposed by the canary plus acceptance harness/docs.
**Test:** one explicitly approved donor feature complex enough to require multiple connected components.

- [ ] Choose a donor feature with entry point, dependencies, tests, host conflicts, and at least one adapter boundary.
- [ ] Capture RED behavior showing current workflow can bypass transplantation.
- [ ] Run plan → anatomy → manifest → graft → verification under isolated target/worktree conditions.
- [ ] Require at least one real `KEEP` or `ADAPT`, one host-boundary mapping, and one blast-radius check.
- [ ] Run the same strategy in advisory and isolated enforce modes.
- [ ] Verify no unrelated production process, memory DB, or source tree is mutated.
- [ ] Only after repeated canary PASS consider live `enforce` rollout.

**Exit gate:** the gate proves selective transplantation on a non-trivial real feature, not merely synthetic fixtures.
---

# 35. Required Acceptance Matrix

| Area | Required evidence |
|---|---|
| Strategy resolution | zero donors → `GREENFIELD`; approved donor → `FEATURE_GRAFT`; no silent third mode |
| Plan authority | donor cannot widen required behavior beyond plan without explicit plan change |
| Reference identity | donor commit/tree or bundle fingerprint is captured and drift invalidates readiness |
| Greenfield integrity | donor introduction after lease invalidates strategy before donor-derived mutation |
| Donor anatomy | entry point, bounded dependencies, tests, lifecycle/state assumptions represented |
| Manifest | every selected component classified; rationale present; fingerprints stable |
| Authority conflicts | protected target authorities cannot be duplicated silently |
| Mutation guard | stale/missing strategy rejected before side effect in enforce mode |
| Read-only work | investigation remains possible before mutation readiness |
| Memory lifecycle | existing preflight/postflight semantics remain authoritative |
| Verification | donor behavior and host integration independently evidenced |
| Blast radius | affected target dependents/tests surfaced with completeness status |
| Provenance | donor identity + component lineage recoverable without raw source duplication |
| Security | no secrets/raw restricted source leaked to audit, DMF, or error messages |
| Continuity | interrupted graft resumes with manifest identity and freshness revalidation |
| Provider failure | analysis failure blocks safely; it never changes implementation strategy truth |
| Regression | existing Agent Core routing/execution/memory/GitHub tests remain green |

---

# 36. Hard Stop Conditions

Stop implementation/transplantation when any of these occur:
- an explicitly approved donor cannot be resolved to the expected source identity;
- plan and donor requirements contradict and the plan has not been updated;
- donor dependency analysis is insufficient to identify a safe transplant boundary;
- a protected target authority would be duplicated without an explicit replacement mapping;
- direct source reuse posture is unknown or blocking;
- the active strategy/manifest fingerprint no longer matches current plan/reference state;
- a mutation would occur without the required strategy lease in enforce mode;
- graft verification cannot distinguish intentional target divergence from accidental behavior loss;
- blast-radius analysis exposes unresolved high-impact dependents;
- donor source/credentials appear in unsafe audit or memory projections;
- an isolated strategy test touches the live production Agent Core bundle or production DMF unexpectedly;
- implementation attempts to solve a grafting difficulty by silently switching to greenfield construction.

When a hard stop occurs, return to the owning planning/anatomy/manifest step. Do not patch around the gate.

---

# 37. Design Decisions Fixed by This Specification

The following decisions are considered part of the approved direction unless explicitly reopened:

1. There are exactly two normal implementation modes: `GREENFIELD` and `FEATURE_GRAFT`.
2. Approved reference presence forces `FEATURE_GRAFT`; absence forces `GREENFIELD`.
3. The target plan outranks donor implementation.
4. Feature transplantation operates on connected components/dependency cones, not blind file copy.
5. `KEEP`, `ADAPT`, `REPLACE`, `DROP`, and `REIMPLEMENT` are the transplant classification vocabulary.
6. A transplant manifest is mandatory before meaningful target mutation in graft mode.
7. Existing Agent Core authorities cannot be silently replaced by donor authorities.
8. Graft/CBM are optional code-intelligence providers, not strategy or memory authorities.
9. Provenance is required; raw donor source is not durable memory.
10. Strategy enforcement rolls out `disabled → advisory → isolated enforce → live enforce`.
---

# 38. Recommended First Canary Characteristics

The first real transplantation canary should not be trivial. It should contain enough structure to prove the method rather than merely the gate plumbing.

Recommended donor-feature characteristics:

```text
3–15 core implementation symbols
at least 2 files
at least 1 meaningful dependency
at least 1 donor test/invariant
at least 1 target integration boundary
at least 1 component that must be ADAPT or REPLACE
observable blast radius
no requirement to replace a foundational Agent Core authority
```

Avoid using the first canary for authentication, destructive recovery, release publication, or the canonical DMF writer. Those are too authoritative to serve as initial transplantation experiments.

A recovery helper, code-intelligence adapter, bounded watcher, analysis subsystem, or other replaceable support capability is a better first specimen.

---

# 39. Intended Operator / Agent Experience

The desired interaction is concise at the user layer even though the internal engineering path is strict.

Example with no donor:

```text
User: implement feature X from this plan.
Agent Core: strategy GREENFIELD → implement → verify.
```

Example with donor:

```text
User: implement feature X from this plan; use repository Y as reference.
Agent Core: strategy FEATURE_GRAFT → donor anatomy → manifest → transplant → verify.
```
The agent should be able to report bounded status such as:

```text
Implementation Strategy: FEATURE_GRAFT
Plan fingerprint: verified
Donors: 1 resolved
Donor analysis: complete
Manifest: 8 components
  KEEP        3
  ADAPT       2
  REPLACE     1
  DROP        2
Authority conflicts: 1 resolved
Mutation state: verification pending
Blast radius: 4 dependent target areas
```

This is operational transparency, not private chain-of-thought.

---

# 40. Intended Final Architecture

```text
                              USER / CHATGPT
                                   │
                                   ▼
                              TASK / PLAN
                                   │
                                   ▼
                           MEMORY PREFLIGHT
                                   │
                                   ▼
                        IMPLEMENTATION STRATEGY
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
               GREENFIELD                   FEATURE_GRAFT
                    │                             │
          target-first design             donor identity
          tests / contracts               code intelligence
                    │                     dependency cone
                    │                     transplant manifest
                    │                     authority surgery
                    └──────────────┬──────────────┘
                                   ▼
                          STRATEGY LEASE
                                   │
                                   ▼
                         ROUTED OPERATIONS
                                   │
                                   ▼
                   TEST + BLAST RADIUS + VERIFY
                                   │
                                   ▼
                    AUDIT + MEMORY POSTFLIGHT
                                   │
                                   ▼
                        CONTINUITY CHECKPOINT
```

The final system should make implementation strategy as explicit and enforceable as Agent Core already makes route scope, memory lifecycle, execution evidence, and workspace authority.
