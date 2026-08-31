# Agent Core Cross-Session Memory Nervous System — Implementation Program

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (or subagent-driven development when available) and `superpowers:test-driven-development` for every production behavior change.

**Goal:** Implement the approved cross-session/cross-Codespace Memory Nervous System as an additive evolution of Agent Core DMF without adding an external AI/model/API dependency or a second memory authority.

**Architecture:** DMF SQLite remains the single local semantic authority. The program adds cognition/audit ledgers, typed causal/evolution graph semantics, bounded historical expansion, explicit postflight decisions, write-through encrypted remote durability, deterministic hydration/replay, selected lifecycle enforcement, and a read-only observability surface. The Private Memory Remote is a durability transport, not a reasoning authority; the live SQLite database remains a disposable materialized working state in Codespaces.

**Tech Stack:** TypeScript 7, Node.js >=24.15, `node:sqlite`, existing Agent Core worker-backed SQLite access, existing Native GitHub Fabric, Vitest, deterministic JSON/hashing, application-level authenticated encryption, optional React/TypeScript only in the later Observatory phase.

**Spec:** `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`

## Global Constraints

- Preserve Agent Core v0.6.0 behavior until each phase is separately proven.
- Work only through the Codespace repository/runtime for this project; do not use the Mac Agent Core fallback.
- Every accepted implementation checkpoint is committed and pushed to GitHub for audit; no local-only accumulation.
- DMF remains the one memory authority; no LangGraph Store, vector DB authority, or second semantic database.
- No external AI model/API, cloud embedding, cloud reranker, or cloud AI judge is added.
- Never persist private chain-of-thought; persist only observable facts, accepted decisions, evidence, reason codes, and bounded safe metadata.
- Principal/project contamination targets remain exactly `0`.
- Existing 100k-memory preflight p95 gate remains `<150 ms`.
- New non-root durable nodes eventually require at least one evidence-backed semantic edge.
- `WRITE_NEW_ROOT` eventually requires `FRESH_DURABLE_CONTEXT` plus a persisted root reason.
- Failure memories are not revised away; solution/validation history is linked instead.
- Private Memory Remote is separate from the Agent Core source repository and stores encrypted logical records, never the live SQLite file.
- Remote Git synchronization is non-force and readback-verified.
- A fresh Codespace with a configured non-empty Memory Remote must hydrate before memory-authoritative mutation; remote failure must never be interpreted as an empty memory authority.
- Memory Observatory is observer-only and cannot mutate memory truth.

## Fresh Baseline — 2026-09-01

Implementation branch base:

```text
origin/main = 482489d799ed696b752875a1753cbdc6527e5115
```

Approved design commits were replayed onto that base as:

```text
3d49dcb docs: design cross-session memory nervous system
1c330a7 docs: require cross-codespace memory durability
```

Fresh baseline on the isolated implementation worktree:

```text
npm ci                                                     PASS
npm run build                                              PASS
focused memory/continuity suite                            PASS
31 test files / 116 tests PASS / 1 intentional skip
```

This establishes that Phase 1 is an additive migration against a clean baseline rather than a repair of pre-existing failures.

---

# Program Sequence

## Phase 0 — Design, Baseline, and Certification Corpus Contract

**Purpose:** Freeze the approved architecture and baseline before changing production behavior.

**Deliverables:**

- approved architecture specification in `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`;
- exact current-main baseline evidence recorded above;
- program plan plus executable Phase 1 and Phase 2 plans;
- later cognition-quality fixtures extend the existing deterministic Wave E corpus rather than introducing an AI judge.

**Exit gate:** design is versioned on the implementation branch, baseline is green, and the implementation worktree is forked from exact current `origin/main`.

## Phase 1 — DMF Schema v3 + Cognition/Audit Ledgers

**Purpose:** Add the durable structures and typed graph policy required by later cognition and remote durability without changing current recall/MCP semantics.

**Executable plan:** `docs/roadmap/agent-core-memory-nervous-system-phase-1-implementation-plan.md`

**Key deliverables:**

- DMF schema v3 additive migration with automatic pre-migration backup;
- `memory_write_decisions`;
- `memory_recall_expansions`;
- append-only `memory_edge_events`;
- `memory_node_metadata`;
- local remote sync/generation state;
- richer relation taxonomy with explicit directionality policy;
- new explicit anchor vocabulary;
- scoped internal ledger APIs;
- edge-created audit history while preserving existing graph behavior;
- unchanged model-facing memory tool count and unchanged default recall semantics.

**Exit gate:** migration rollback is proven, v2 data survives v3 migration, focused memory/continuity tests pass, full release gate passes, and no root dependency or external AI/model/API is added.

**Status:** **CERTIFIED COMPLETE — 2026-09-01 (Asia/Jakarta)**

**Certified implementation SHA:** `aa8ca5aacc06828999096da224d89ed8824a7bdf`

**Remote audit branch:** `origin/feature/cross-session-memory-nervous-system`

Fresh Phase 1 evidence on that exact implementation SHA:

- schema `v3` and migration `003_memory_cognition_ledgers` PASS, including populated v2→v3 preservation, pre-migration backup, rollback, and SQLite integrity;
- scoped cognition ledgers, explicit anchors, typed relation directionality, append-only edge-event history, and remote-state foundation PASS;
- authoritative Store rejects cross-project/principal explicit relation targets before persistence;
- focused memory/continuity/execution-memory suite: **33 test files PASS / 129 tests PASS / 1 intentional skip / 0 failures**;
- `mcp-memory` still exposes exactly **8** model-facing memory tools;
- deterministic quality gate PASS: memory Recall@K `1.0`, MRR `1.0`, cross-project contamination `0`, cross-principal contamination `0`, deterministic replay `1.0`; routing gate also PASS;
- 100k active-memory preflight benchmark p95 **109.87 ms < 150 ms** with SQLite integrity `ok`;
- full `npm run verify:release` exited `0`: **139 test files PASS / 681 tests PASS / 38 intentional skips / 0 failures**, release consistency `ok=true`, Agent Core/server version `0.6.0`, documentation links PASS;
- root `package.json` / `package-lock.json` diff from the Phase 1 base is empty;
- no new `openai`, `anthropic`, `gemini`, `langchain`, or `langgraph` dependency/source integration was introduced.

This certification completes only Phase 1. Private Memory Remote transport, encryption, hydration, and cross-Codespace disaster recovery remain Phase 2 work and are not claimed here.

## Phase 2 — Private Memory Remote Durability + Fresh-Codespace Hydration

**Purpose:** Make cross-Codespace memory survival real before claiming cross-session durability for ephemeral Codespaces.

**Executable plan:** `docs/roadmap/agent-core-memory-nervous-system-phase-2-implementation-plan.md`

**Key deliverables:**

- dedicated Memory Remote configuration;
- independent application-level encryption key contract;
- deterministic logical remote event/checkpoint envelopes;
- opaque scope IDs;
- non-force Git synchronization through a narrow adapter over Native GitHub Fabric;
- readback verification and `REMOTE_PENDING`/`REMOTE_SYNCED` truth;
- logical-state hashing;
- fresh local materialization/hydration;
- deletion/recreation equality certification;
- concurrent-writer transport reconciliation;
- truthful remote-outage behavior.

**Exit gate:** destroying all local memory state and hydrating a fresh workspace reproduces the certified logical state hash exactly; no plaintext semantic payload exists in the remote fixture; a failed readback never becomes `REMOTE_SYNCED`.

### Phase 2 certification — 2026-09-01

**Status:** `CERTIFIED COMPLETE` for the Phase 2 durability foundation and fresh-Codespace hydration boundary.

Certified implementation candidate:

```text
branch                              feature/cross-session-memory-nervous-system
implementation SHA                  57c975eb8d89605c45b7390014401b30a17813e1
remote-visible candidate            yes / exact SHA equality
Phase 2 base                        cccbd03cc97452664501e54f4fdbc510ec8240f0
```

Remote-visible Phase 2 checkpoints:

```text
63bbb1e  feat: add private memory remote configuration
f2de223  feat: encrypt private memory remote payloads
c65d48c  feat: hash canonical memory logical state
37abe5e  feat: define private memory remote journal format
2c8c498  feat: add private memory remote git transport
a00f116  feat: verify private memory remote synchronization
189994a  feat: hydrate memory from private remote
62526bd  test: prove permanent memory deletion recovery
edaa5c1  feat: reconcile private memory remote writers
57c975e  feat: gate codespace startup on memory hydration
```

Fresh certification evidence on that exact candidate:

```text
focused Phase 2 + Codespace files           65 PASS
focused tests                               281 PASS / 1 intentional skip
focused failures                            0
model-facing memory MCP tools               8 (unchanged)
full verify:release exit                    0
full test files                             148 PASS / 2 skipped
full tests                                  724 PASS / 38 intentional skips
full failures                               0
brand/build/Codespace build                 PASS
quality:gate                                PASS
release consistency                         PASS
document links                              44 markdown / 17 relative links PASS
```

Quality/performance remained inside the existing certified contract:

```text
Memory Recall@K                             1.0
Memory MRR                                  1.0
Hard guardrail recall                       1.0
Current revision correctness                1.0
Prior failure recall                        1.0
Graph target recall                         1.0
Conflict visibility                         1.0
Artifact/procedure recall                   1.0
Noise displacement                          0
Cross-project contamination                 0
Cross-principal contamination               0
Character-budget correctness                1.0
Deterministic replay equality               1.0
100k preflight p95                          59.275 ms
100k target                                 <150 ms
```

Durability/security certification:

```text
AES-256-GCM application encryption          PASS
independent Memory Remote key contract      PASS
GitHub credential used as encryption key    rejected
opaque principal/project scope path         PASS
immutable object/manifest verification      PASS
REMOTE_PENDING before remote proof          PASS
REMOTE_SYNCED only after readback            PASS
failed readback -> REMOTE_SYNCED             0
non-force push implementation               force: false
concurrent A+B object preservation           PASS
semantic-hash conflict auto-resolution       0
local-delete -> fresh-hydrate projection     exact equality
local-delete -> fresh-hydrate logical hash   exact equality
remote semantic plaintext sentinel leakage   0
remote principal/project plaintext leakage   0
remote unavailable interpreted as empty      0
fresh Codespace uncertified local DB trust   0
fresh bootstrap auth/integrity failure       fail closed / exit category 55
```

The deletion/recreation acceptance scenario materialized revision history, branch/failure/solution/validation nodes, typed causal/evolution edges, a conflict, write-decision metadata, and a terminal continuity checkpoint; it then removed the Codespace-A local state and reproduced the same logical projection/hash in an unrelated Codespace-B-like workspace. The scenario passed repeatedly from fresh temporary workspaces before certification.

The concurrent-writer acceptance path proves bounded non-fast-forward reconciliation without force push. Immutable objects from both writers are retained when their logical-state hash agrees; differing logical-state hashes remain a memory-layer conflict and are never silently resolved by Git transport.

Codespace bootstrap now runs a Memory Remote hydration gate before runtime startup when the feature is explicitly enabled. A dedicated `AGENT_CORE_MEMORY_REMOTE_KEY_HEX` may materialize the local encryption-key file and is unset before the Node hydration process. The verified hydration marker contains no key material and binds the configured remote/scope identity. Memory Remote remains disabled by default.

Dependency/model guardrails from the Phase 2 base remain unchanged:

```text
package.json / package-lock.json change       none
new OpenAI source/dependency integration      none
new Anthropic source/dependency integration   none
new Gemini source/dependency integration      none
new LangChain dependency/integration          none
new LangGraph dependency/integration          none
```

Concurrent `origin/main` drift observed during certification consisted only of Super Runtime paths under `SubProject/Super-Runtime`; it did not overlap the Phase 2 memory/config/Codespace implementation and was intentionally not merged into this isolated certification candidate.

**Phase boundary:** this certification proves the Private Memory Remote durability substrate, truthful synchronization/readback, deterministic encrypted recovery, concurrent transport reconciliation, and fresh-Codespace startup gate. It does **not** claim that every normal semantic/continuity/execution mutation is already automatically write-through synchronized. Program Phases 4–7 still adopt the cognition/write-decision authority and remote durability boundary into selected normal mutation/terminal lifecycle flows. The next implementation phase is Phase 3 bounded `remember_more`.

## Phase 3 — Bounded `remember_more`

**Purpose:** Recover only the minimum historical context necessary to explain a recalled current memory.

**Executable plan:** `docs/roadmap/agent-core-memory-nervous-system-phase-3-implementation-plan.md`

**Deliverables:**

- `src/memory/remember-more.ts` with bounded graph/history traversal;
- history traversal prioritizing revision, failure/cause, solution, validation, branch, conflict, and dependency relations;
- weak associative edges excluded from recursive historical expansion;
- expansion records written to `memory_recall_expansions`;
- `memory_remember_more` read-only MCP tool;
- current-revision-first default recall remains unchanged.

**Certification cases:** solution→prior-failure, revision predecessor, branch parent, conflict history, explicit user expansion, strict max-hops/item/character bounds, project/principal isolation, deterministic replay.

### Phase 3 certification — 2026-09-01

**Status:** **CERTIFIED COMPLETE** for bounded, seed-authorized historical expansion and its read-only MCP surface.

**Certified implementation SHA:** `627a3b57481489fc2725986f59cf58d246d917a3`

**Remote audit branch:** `origin/feature/cross-session-memory-nervous-system`

Fresh Phase 3 evidence on that exact implementation SHA:

```text
focused Phase 3 test files                     5 PASS
focused Phase 3 tests                          30 PASS
focused failures                               0
memory_remember_more authenticated call        PASS
model-facing memory MCP tools                  9
full Agent Core MCP tools                      56
full memory/continuity/execution-memory/MCP     49 test files PASS
full subsystem tests                           202 PASS / 1 intentional skip
subsystem failures                             0
quality:gate                                   PASS
Memory Recall@K / MRR                          1.0 / 1.0
Cross-project contamination                    0
Cross-principal contamination                  0
Deterministic replay equality                  1.0
100k preflight p95                             53.211 ms < 150 ms
verify:release exit                            0
full test files                                149 PASS / 2 skipped
full tests                                     734 PASS / 38 intentional skips
release failures                               0
document links                                 45 markdown / 17 relative links PASS
package.json / package-lock.json change        none
new external AI/model/API integration          none
```

The engine accepts only seed memories proven by the supplied live authenticated `memory_contexts` + `memory_access_log` context. Revision predecessors, causal failure/solution/validation chains, branch parents, conflicts, and dependencies are traversed under fixed hard ceilings; weak associative relations never recurse. Only packed results are appended to `memory_recall_expansions`, and generated audit IDs/timestamps do not participate in the deterministic result snapshot hash. Default search/preflight remains current-revision-first.

**Phase boundary:** Phase 3 adds historical explanation only. It does not add automatic expansion triggers, write-decision authority, new semantic-write policy, or universal remote write-through. Those remain Phase 4+ work.

## Phase 4 — Memory Cognition / Write Decision Controller

**Purpose:** Force a postflight memory decision without forcing memory pollution.

**Executable plan:** `docs/roadmap/agent-core-memory-nervous-system-phase-4-implementation-plan.md`

**Deliverables:**

- `MemoryCognitionController`;
- write-policy and relation-policy enforcement;
- six decisions: `NO_DURABLE_MEMORY`, `REVISE_EXISTING`, `LINK_EXISTING`, `WRITE_BRANCH`, `WRITE_NEW_ROOT`, `OPEN_CONFLICT`;
- root and non-root creation gates;
- decision reason-code persistence;
- semantic-profile validation/redaction;
- advisory/audit mode first, with no silent change to existing promotion behavior.

**Certification cases:** duplicate rejection, same-belief/new-evidence, revise-vs-branch, fresh root justification, unrelated candidate no-write, ambiguous contradiction opens conflict, unjustified new-node acceptance exactly zero.

### Phase 4 certification — 2026-09-01

**Status:** **CERTIFIED COMPLETE** for the advisory Memory Cognition / Write Decision Controller and its explicit apply path.

**Certified implementation SHA:** `a17007ecf7bc6c55d3dda6132bedc5aeb38885fe`

**Remote audit branch:** `origin/feature/cross-session-memory-nervous-system`

Fresh Phase 4 evidence on that exact implementation SHA:

```text
focused Phase 4 test files                     7 PASS
focused Phase 4 tests                          29 PASS
focused failures                               0
broad memory/continuity/execution-memory/MCP    52 test files PASS
broad subsystem tests                          218 PASS / 1 intentional skip
subsystem failures                             0
model-facing memory MCP tools                  9 (unchanged)
full Agent Core MCP tools                      56 (unchanged)
memory_postflight MCP tool                     absent
advisory semantic mutations                    0
unjustified new-node acceptance                0
failure revision acceptance                    0
weak-only non-root creation acceptance         0
quality:gate                                   PASS
Memory Recall@K / MRR                          1.0 / 1.0
Cross-project contamination                    0
Cross-principal contamination                  0
Deterministic replay equality                  1.0
100k preflight p95                             60.67 ms < 150 ms
verify:release exit                            0
full test files                                152 PASS / 2 skipped
full tests                                     750 PASS / 38 intentional skips
release failures                               0
document links                                 46 markdown / 17 relative links PASS
package.json / package-lock.json change        none
new external AI/model/API integration          none
```

The controller uses exact canonical identity, the existing Store value normalization/hash, bounded redacted semantic profiles, same-scope relation targets, and explicit evidence/reason gates. `evaluatePostflight()` always remains advisory: it records a write decision but does not create semantic nodes/revisions/edges/conflicts. `applyPostflight()` is explicit and is the only new Phase-4 mutation entry point. Existing normal commit/revise/preflight, Continuity promotion, Execution memory promotion, routing, and MCP registration are intentionally not adopted into automatic postflight yet.

Two Phase-2 remote-recovery fixtures were migrated from the pre-Phase-4 free-form semantic-profile shape to the approved bounded profile vocabulary. The remote replay/materialization path itself remains unchanged and still replays already-persisted logical metadata without reinterpreting it.

**Phase boundary:** Phase 4 proves deterministic decision classification and explicit policy-controlled application only. Phase 5 is still responsible for routing existing Continuity/Execution promotion through this controller and the remote durability boundary.

## Phase 5 — Continuity and Execution Adoption

**Purpose:** Route existing promotion paths through the cognition/write-decision authority and remote durability boundary.

**Deliverables:**

- Continuity promoter uses structured postflight decisions rather than direct semantic commits;
- execution-derived verified failures/solutions/artifacts preserve current evidence hierarchy;
- terminal continuity checkpoints are remote durability boundaries;
- a terminal task cannot be durably closed while required memory/continuity remote state is pending.

**Exit gate:** existing continuity/execution acceptance suites remain green, failure memories remain immutable episodic history, and remote durability state is truthful.

## Phase 6 — Agent Core Hard Memory Lifecycle

**Purpose:** Enforce preflight/postflight on selected Agent Core actionable flows with staged rollback.

**Deliverables:**

- memory context lifecycle state (`OPEN`, `POSTFLIGHT_PENDING`, `CLOSED`);
- selected mutation classes require a valid preflight context;
- pending prior postflight is reconciled before opening another meaningful mutation context;
- audit-only/advisory flag remains available for rollback;
- degraded memory never fabricates recall or compliance.

## Phase 7 — Codespace Hydration + Memory Context Lease Enforcement

**Purpose:** Extend lifecycle enforcement to direct ChatGPT→Codespace operations without making the bridge understand memory semantics.

**Deliverables:**

- Codespace bootstrap/hydration gate;
- Memory Context Lease validation for selected meaningful mutations;
- deterministic mutation classification;
- predictable `MEMORY_PREFLIGHT_REQUIRED` and `MEMORY_POSTFLIGHT_REQUIRED` errors;
- expired lease rejection;
- fresh-Codespace fail-closed behavior for configured existing remote state;
- `.vscode/` and unrelated user state preserved.

## Phase 8 — Read-Only Memory Observatory

**Purpose:** Visualize memory graph, recall, history, conflicts, write decisions, and remote durability without becoming part of the write path.

**Deliverables:**

- read-only activity projection;
- graph/timeline/recall/failure-solution/conflict/task views;
- safe event stream using IDs/reason codes rather than secrets or hidden reasoning;
- UI crash has zero effect on memory/execution authority.

## Phase 9 — Scale, Disaster Recovery, and Final Certification

**Purpose:** Recertify the entire subsystem under realistic scale and failure conditions.

**Required gates:**

```text
existing current-revision correctness                    PASS
hard guardrail recall                                    PASS
prior failure recall                                     PASS
remember_more causal/revision history                    PASS
unjustified new-node acceptance                          0
required linked-node orphan rate                         0
fresh-root reason persistence                            PASS
failure/solution chain preservation                      PASS
NO_DURABLE_MEMORY decision persistence                   PASS
pending postflight recovery                              PASS
remote write-through/readback                            PASS
terminal durable task with unsynced remote state         0
local-delete -> fresh-hydrate logical equality           1.0
remote replay deterministic equality                     1.0
remote empty-vs-failure ambiguity                        0
remote plaintext semantic/secret leakage                 0
non-force concurrent-writer reconciliation               PASS
cross-project contamination                              0
cross-principal contamination                            0
100k preflight p95                                       <150 ms
visualizer mutation authority                            0
external AI/model/API dependency                         0
```

---

# GitHub Audit Discipline

Each independently verified checkpoint follows this sequence:

```text
RED test evidence
→ GREEN focused test evidence
→ regression/build evidence
→ git diff --check
→ commit
→ push feature branch
→ fetch/read back origin/<feature-branch>
→ local SHA == remote SHA
```

No force push is permitted for ordinary implementation publication. Integration to `main` happens only after phase certification and concurrent-main reconciliation.
