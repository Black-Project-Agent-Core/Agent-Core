# EverOS Steal/Use Integration Plan

Status: **EV-P1 IMPLEMENTED — LIVE-ACTIVATED — ZERO-VALUE/DEPENDENCY CENSUS PASSED — REFERENCE RETIRED / DELETED AS CORPSE**

Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\04-EverOS`
Upstream: `https://github.com/EverMind-AI/EverOS`
Observed branch/ref file: `main` / `5076683ab88d714390573d8f88ff3c470e51129a`
License: Apache-2.0.
Git caveat: local object pack `pack-dfdd1633...pack` is truncated, so object-dependent Git status/history is not authoritative. Exact source bytes and tests were used instead.

## Grounding basis

This proposal was derived from executable source/tests, especially:
- `src/everos/memory/cascade/{scanner,reconciler,worker}.py`
- `src/everos/memory/search/{hierarchy,agentic,llm_multiround,skill_hybrid}.py`
- `src/everos/memory/reflection/orchestrator.py`
- `src/everos/infra/ome/{gates,triggers}.py`
- crash-recovery and cascade unit tests.
Current Agent Core owners compared directly: `src/memory/store.ts`, `service.ts`, `retrieval.ts`, `consolidation.ts`, `src/learning/*`.

## EV-P1 — incomplete-canonical scan/index safety

**ADOPT — high value, small native change.**
EverOS scanner deliberately fails closed when a directory/read scan is partial, because reconciling a partial inventory can manufacture deletions. Agent Core currently loads healthy notes while reporting unreadable ordinary notes as degraded, then may still refresh the derived index from that partial record set.
Adapt this as a native completeness contract:
- `FileMemoryStore.loadAll()` exposes whether canonical enumeration is complete and which failures are positive absence versus unreadable/transient evidence.
- Derived index reconciliation must not drop previously indexed ordinary memories solely because the current canonical scan is incomplete.
- A positive deletion requires a complete inventory or an explicitly verified missing target; generic I/O/parse failure is not deletion evidence.
- Successful explicit memory mutations keep their existing transactional/index refresh path.
- Health stays degraded while canonical evidence is incomplete; do not silently claim current index completeness.

No watchdog, LanceDB, SQLite, Python runtime, OME scheduler, or new persistent store is introduced.

### EV-P1 targeted acceptance
1. unreadable/transient ordinary note => canonical health degraded and prior derived entry retained;
2. verified deletion under complete scan => derived entry removed;
3. successful repaired scan => index converges to canonical set;
4. bootstrap corruption remains blocking/error;
5. explicit create/update/delete/batch semantics remain unchanged;
6. embedding failure still falls back to deterministic retrieval.

## Explicitly rejected/deferred EverOS families

- OME trigger/gate/scheduler engine: **REJECT** — Agent Core contract forbids adding a parallel workflow/gating authority.
- watcher + cascade daemon: **REJECT** — current MemoryService is request-time file-native; background daemon would add lifecycle/state without need once EV-P1 closes partial-scan risk.
- agentic multi-round retrieval/sufficiency LLM: **REJECT** — hidden second model/controller and extra routing authority.
- cluster reflection that merges/deprecates memories: **REJECT** — conflicts with proposal-only conservative curation and canonical-memory authority.
- per-partition strategy locks: **REJECT** — no new cross-locking system; current file/process transaction locks remain authority.
- episode/fact hierarchy + MaxSim/cross-encoder rerank: **DEFER** — current MemoryRecord has no episode/fact corpus or reranker consumer; importing that hierarchy now would create a second memory model.
- EverOS storage stack/API/TUI: **REJECT** — duplicate platform/runtime.

## Integration boundary

Owner: existing `src/memory` only. Public MCP tool count should remain unchanged. Any schema addition must be internal unless runtime evidence proves an explicit caller needs it.
Release intent if selected: patch unless public MCP response semantics materially change.
Activation/restart remains a separate explicit step after implementation qualification.

## Reference disposition

**SUPERSEDED BY 2026-09-26 EXECUTION.** EV-P1 is implemented in Agent Core; the reference is retirement-qualified. The fresh zero-value and active-dependency census has now passed; only the blocked physical retirement operation remains.

## Source-first re-grounding — 2026-09-26

The pinned ref file still resolves `main` to `5076683ab88d714390573d8f88ff3c470e51129a`; object-dependent Git operations remain degraded by the truncated pack, so exact current source/tests are authority.

**EV-P1 remains the only immediate current-fit residual.** `CascadeScanner._collect_scan_inputs()` aborts a sweep for non-ENOENT file-system failure because a partial inventory could manufacture deletes; `reconcile()` derives deletion only from the observed inventory. Current Agent Core `FileMemoryStore.loadAll()` returns readable records plus degraded issues for unreadable ordinary notes, while `MemoryService` can inspect/ensure/rebuild the derived index from the readable record set when canonical state is degraded rather than blocked. This preserves the partial-inventory risk EV-P1 targets.

The second pass found no separate current-fit proposal in cascade watcher/worker maintenance, OME orchestration, agentic/multi-round retrieval, reflection strategies, specialized episode/profile/skill extraction, or alternate storage/API/TUI stacks. Those families either require a resident projection daemon that Agent Core does not own, duplicate current ownership, or lack a current canonical consumer.

EV-P1 should remain inside existing `src/memory` if selected; no new subsystem is needed for this reference. The checkout remains **RETAINED** pending user selection and final post-decision zero-value census.

## Approved implementation execution — 2026-09-26

User approved EV-P1. The mechanism was implemented natively without adding EverOS runtime dependencies: `FileMemoryStore.loadAll()` now reports canonical scan completeness, Memory health exposes `canonicalComplete`, and MemoryIndex can preserve prior derived entries when a degraded ordinary-note scan is incomplete instead of interpreting unseen records as deletion evidence. Full rebuild is allowed only when the canonical scan is complete; explicit mutation semantics remain on the existing transaction path.

The final source census found no second current-fit EverOS mechanism after EV-P1. Active dependency scans for `04-EverOS` across Agent Core `src`, `scripts`, and `tests` each returned zero matches. Preserved grounding evidence before retirement includes ref `5076683ab88d714390573d8f88ff3c470e51129a`, scanner SHA-256 `A8FEE6143C3537ED3BF74E2CC6D731B9AC33DB54A1A2B06C017F4811FF766A37`, reconciler SHA-256 `61BD3B3E6D8855DE005D253C29FF973EA1FC8CE5B8178109076740D5DC84D0DF`, and main-ref-file SHA-256 `D2624E0F5A66BEABC3C3022C164F1B28E506A0FD57FF2384C9E6554167AB2527`.
Build qualification: final root `npm run build` exited 0 with `PATH POLICY PASS — 245 authored files scanned; 0 documented exceptions`. No broad or targeted test suite was run because test execution remains user-controlled. Rebuilt `dist` contains EV-P1, but live Core was not restarted.

The checkout satisfies the documented zero-value and zero-active-dependency retirement criteria. On 2026-09-26, after a fresh zero-match dependency scan across Agent Core `src`, `scripts`, and `tests`, the explicitly authorized retirement succeeded: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\04-EverOS` was removed with process exit code 0 and exact-path readback returned `NOT_FOUND`. The plan preserves the ref/source hashes above as provenance. EverOS is now **RETIRED / DELETED AS CORPSE**; Agent Core has no runtime/build/test dependency on the removed checkout.

## Live activation readback — 2026-09-26

After explicit user-approved restart, /health on the live Core reports Memory status available, canonicalStore available, canonicalComplete=true, issueCount=0, index available, embedding available, and intelligence available. This directly proves EV-P1's new canonical completeness field is loaded by the running dist. The EverOS reference remains retired/deleted as corpse with provenance preserved in this plan.
