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

## Phase 3 — Bounded `remember_more`

**Purpose:** Recover only the minimum historical context necessary to explain a recalled current memory.

**Deliverables:**

- `src/memory/remember-more.ts` with bounded graph/history traversal;
- history traversal prioritizing revision, failure/cause, solution, validation, branch, conflict, and dependency relations;
- weak associative edges excluded from recursive historical expansion;
- expansion records written to `memory_recall_expansions`;
- `memory_remember_more` read-only MCP tool;
- current-revision-first default recall remains unchanged.

**Certification cases:** solution→prior-failure, revision predecessor, branch parent, conflict history, explicit user expansion, strict max-hops/item/character bounds, project/principal isolation, deterministic replay.

## Phase 4 — Memory Cognition / Write Decision Controller

**Purpose:** Force a postflight memory decision without forcing memory pollution.

**Deliverables:**

- `MemoryCognitionController`;
- write-policy and relation-policy enforcement;
- six decisions: `NO_DURABLE_MEMORY`, `REVISE_EXISTING`, `LINK_EXISTING`, `WRITE_BRANCH`, `WRITE_NEW_ROOT`, `OPEN_CONFLICT`;
- root and non-root creation gates;
- decision reason-code persistence;
- semantic-profile validation/redaction;
- advisory/audit mode first, with no silent change to existing promotion behavior.

**Certification cases:** duplicate rejection, same-belief/new-evidence, revise-vs-branch, fresh root justification, unrelated candidate no-write, ambiguous contradiction opens conflict, unjustified new-node acceptance exactly zero.

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
