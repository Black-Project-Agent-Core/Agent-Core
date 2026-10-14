# OpenViking Steal/Use Integration Plan
> Status: COMPLETE — OV-P1 CLEAN-ROOM IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — CONDITIONAL REFERENCE RETAINED
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\09-OpenViking`
> Pin: `184a5cecef0612a893a8db5718674b3084c6811b`
> License: GNU AGPL-3.0
> Grounding date: 2026-09-25

## 1. License boundary
OpenViking is AGPL-3.0. This plan does NOT authorize copying OpenViking source into Agent Core.
Any selected behavior must be independently designed/reimplemented in Agent Core-owned TypeScript
from behavioral requirements and negative tests, with no line-by-line translation or transplanted implementation.

## 2. Grounding basis
The checkout contains 4,366 non-Git files, 3,247 source files and 1,108 test files.
Source-first review covered async task tracking/concurrency, session commit, durable ingest cursor,
snapshot/version control, memory/session components, resource watch lifecycle, and current Agent Core owners.
The high-value evidence is especially strong in `service/task_tracker.py`,
`tests/test_task_tracker_concurrency.py`, and `ingest/cursor_store.py`.

## 3. Selectable proposal
### OV-P1 — task lifecycle correctness hardening for Agent Core background processes
Use OpenViking only as behavioral evidence to strengthen the same native process ledger proposed by AH-P2.

Observed behaviors worth independently reproducing:
- explicit `pending -> running -> cancelling -> completed|failed|cancelled` state machine;
- per-task keyed serialization so concurrent updates cannot reorder lifecycle state;
- terminal state persisted before the final recovery/work item is acknowledged or evicted;
- cancellation remains explicit and distinguishable from failure;
- persistent store is authoritative over a bounded in-process cache;
- sanitized public snapshots and TTL cleanup;
- cross-event-loop/foreign-thread work is marshalled to an owner loop with cancellation propagation.

Current Agent Core gap:
TerminalManager has bounded active/completed maps and strong process I/O handling, but restart durability
and an explicit persistent cancellation/finalization state machine are absent.

Native design if selected:
- implement in Agent Core TypeScript, preferably as the lifecycle layer of AH-P2;
- no OpenViking package, Python service, SQLite dependency, VFS, or server is installed;
- state remains project-local and uses existing atomic file primitives;
- public process tool schemas change only if required for explicit detached/cancelling state.

Acceptance:
concurrent poll/terminate/finalize cannot regress a terminal state;
restart restores only identity-validated live detached sessions;
terminal state survives cache eviction;
foreign-loop cancellation propagates without double finalization;
sanitized result snapshots never expose secrets;
stale PID reuse is rejected.

Release impact if selected: patch if internal-only; minor if public process schemas expose new states/actions.

## 4. Conditional mechanism retained but not proposed now
The durable ingest cursor implements an excellent intent-before-effect protocol:
record pending cursor/count/baseline BEFORE append, reconcile after crash, then confirm and mark commit-needed.
Agent Core currently has no equivalent external ingestion consumer that justifies a new cursor database.
Record this as OV-C1 and activate only if a real append/ingest pipeline appears.

## 5. Rejected OpenViking families
- VikingFS snapshot/version control: REJECT — GA-P1 is smaller, MIT, and fits the current filesystem owner.
- OpenViking memory/session/vector stack: REJECT — duplicates canonical Memory/Grafel.
- resource watchers and autonomous tasks: REJECT — no new workflow daemon.
- training/policy rollout stack: REJECT — outside Agent Core's machine-bridge authority.
- server/auth/account model: REJECT — not needed for the local authenticated Agent Core architecture.

## 6. Retirement condition
The reference is NOT a corpse while OV-P1 remains selectable and OV-C1 remains a documented conditional lead.
Because of AGPL, preserve the pin/license as provenance even if the checkout is later deleted.

## 7. Approved clean-room execution result — 2026-09-25
OV-P1 is implemented independently in Agent Core TypeScript as lifecycle hardening inside the same process ledger used by AH-P2. No OpenViking source, package, Python service, SQLite/VFS stack, or AGPL runtime was copied or installed. The process-ledger acceptance passes 3/3 and covers command-digest persistence, PID identity reuse rejection, and serialized cancellation/terminal transitions. Compiled `dist` is qualified; resident live activation remains pending until Core restart. OV-C1 remains conditional only. Execution authority: `docs/Six-Reference-Adoption-Execution-20260925.md`.

## 8. Live activation and retained-conditional closure — 2026-09-25
OV-P1 is live as clean-room lifecycle hardening in the shared Agent Core process owner; no AGPL source/runtime was copied. The activation-time fast-exit race discovered in the shared owner was repaired and live-verified together with AH-P2.
Reference disposition: **RETAIN** because OV-C1, the source-audited durable ingest cursor intent-before-effect protocol, remains a conditional lead for a future real append/ingest consumer. The checkout remains reference-only and AGPL provenance-bound.

## 9. Five-reference source-first re-grounding — 2026-09-25

**Status: OV-P1 CLOSED/LIVE — NO NEW CURRENT-FIT INSTALLATION — OV-C1 RETAINED CONDITIONAL.**
The same clean AGPL pin `184a5cecef0612a893a8db5718674b3084c6811b` was revalidated. OV-P1 remains an Agent Core-owned clean-room behavior implementation in the shared process ledger.

Direct source readback of `openviking/ingest/cursor_store.py` reconfirmed OV-C1: durable pending cursor/count/baseline written **before** append, post-append confirmation, `needs_commit`, restart resume, and later commit acknowledgement. Current Agent Core source has no external append/import ingestion owner, ingest cursor, or pending-cursor contract. ProcessLedger solves local process lifecycle, not append idempotency.

OV-C1 remains a future activation condition, not an implementation backlog. If Agent Core later gains a real external ingestion/append pipeline, derive behavior from requirements and negative tests only; do not copy AGPL implementation source.

**Disposition: RETAIN — NOT CORPSE.** No other current-fit non-duplicate mechanism was found at this fixed checkout after existing Memory/Grafel/Semantic/process owners were excluded.
Evidence: `docs/Five-Reference-Conditional-Regrounding-20260925.md`.

## 10. Approved conditional execution closure — 2026-09-25

**APPROVED — OV-C1 DORMANT UNTIL REAL INGEST OWNER EXISTS — AGPL REFERENCE RETAINED.**
The user approved the plan. Agent Core still has no external append/import pipeline that needs a durable ingest cursor, so OV-C1 remains dormant rather than creating an unused cursor database. Any future adoption must remain clean-room and behavior-derived because the reference is AGPL-3.0. No runtime/dependency installation was performed.
