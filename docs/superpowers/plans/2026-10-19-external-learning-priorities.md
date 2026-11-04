# External Learning Priorities Implementation Plan

> For agentic workers: execute sequentially with test-first checks. Main owns integration; existing Raka handles the independent proposal documents/dashboard slice. User has explicitly authorized implementation and activation with auto-approval; no additional design permission round is required.

**Goal:** external recall stops waiting at its deadline, tasks retain resumable Memory context, claims carry explicit revalidation contracts, and readable Markdown proposals have visible dashboard notices.

**Architecture:** reuse Memory controller/episodes/retrieval, Learning and Skill proposal persistence, existing UI HTTP/launcher transport. External adapters opt into additions; frozen Native behavior and canonical store identities remain unchanged.

**Tech stack:** existing TypeScript, Vitest, React/WebView and .NET launcher; no new dependencies.

**Spec:** `docs/proposals/Penguatan-Learning-Proaktif-Self-Improvement-dan-Memory.md` P08/P01/P02 and the user's dashboard/Markdown request.

## Global constraints

- Native frozen; do not regenerate governance baseline or change Native sections/catalog/grants.
- Preserve current dirty working tree; task-before copies live under `runtime/build/learning-priorities-20261019`.
- No new canonical store, engine, hidden model, background scheduler or automatic proposal approval.
- Project paths resolve dynamically; user-readable proposals under `<PROJECT_ROOT>/docs/proposals`.
- Hold/reject/unknown remain distinct; existing decisions and exact revisions survive.

## Review focus

- Hung provider: deadline ends the local wait, never implies remote cancellation or permits late disclosure.
- Shared query flight: cancelling one waiter leaves other callers usable.
- Rotating task head: source scope is rechecked before/after await; no foreign task attribution.
- Unknown validation evidence: attempt is recorded without advancing last-success or changing claim truth/authority.
- Proposal drift/path aliases: read the exact bounded Markdown revision, never execute its content or treat a card as approval.

### Task 1 — Direct external recall deadline (Main)

Files: `src/memory/mcp/experience-tools.ts`, `src/memory/service.ts`, a bounded Memory recall wait helper if needed; `tests/memory/memory-external-recall-deadline.test.ts`.

Interface: external adapter carries one absolute deadline + signal through existing host context to semantic waiters and final disclosure admission. Mutations are not raced or labelled cancelled after commit.

- [x] RED: direct recall with hung embedder/deferred scope fails deadline/abort assertions before implementation.
- [x] Implement bounded await/cancellation with cleanup and handled late settlement; pass host signal to semanticContext only for provided external context.
- [x] GREEN: deadline, scope lookup, caller abort, late result/no receipt, and shared-flight tests plus existing relevant cache/disclosure tests.

### Task 2 — External task continuity bridge (Main, after Task 1)

Files: `src/learning/external-controller.ts`, `src/mcp/controller-learning-tools.ts`, external schemas only as needed, existing Memory episode facade; targeted external continuity tests.

Interface: start/resume Learning task links to idempotent existing Memory task start; bounded explicit working-state events/checkpoints use existing `memory_v2_write`. Context returns exact handle/revision/continuity plus actionable guidance rather than pretending a Learning event is a Memory capsule.

- [x] RED: start/resume context retains goal/constraint/failed-path/next-action; same key does not add duplicate episode/events.
- [x] Implement host-bound external linkage and structured lifecycle guidance; expose partial/unavailable safely.
- [x] GREEN: reopen/resume, head A→B during await, paused/completed state and insufficient budget remain safe.

### Task 3 — Cause-specific claim review (Main, after Task 2)

Files: existing Memory experience metadata/review paths and external Memory adapter; focused claim-review tests.

Interface: opt-in external review contract separates reality/decision/dependency/relevance method from cadence; revision-bound attempt and successful verification remain separate, along with retain/revise/externalize/retire disposition. No scheduler and no semantic truth inferred from source hashes.

- [x] RED: unchanged source bytes with changed world; future decision; dependency requiring representative check; unavailable source; rare safeguard; incomplete externalization.
- [x] Implement bounded typed review metadata and existing transaction/receipt persistence, preserving legacy unknown and history.
- [x] GREEN: stale revision/idempotency, attempts vs last success, authority and primary record content unchanged, no Native default behavior changes.

### Task 4 — Proposal documents and visible cards (Raka)

Files: proposal projector/coordinator/service wrappers, new proposal document/HTTP reader, nonfrozen dashboard and launcher transport sections, tests, `docs/proposals/README.md` and structured guide. Main owns `src/index.ts` wiring and `AGENTS.md`/bootstrap exposure.

Interface: readonly bounded metadata list and exact digest-bound Markdown read via existing loopback/UI-token transport. External proposal projection uses docs/proposals; Native canonical paths/behavior stay intact. Generic improvement docs remain documents, never fabricated Skill records. Cards show path/kind/status/revision and allow reading before an explicit decision through existing trusted channels.

- [x] RED: Markdown materialization/readback, path/alias/drift refusal, legacy decisions preserved, readable dashboard card.
- [x] Implement existing-owner projection, structured assistant guide exposure and visual cards matching dashboard style.
- [x] GREEN: backend and UI tests; actual rendered dashboard/card/Markdown check after activation.

### Task 5 — Integration, activation and readback (Main)

- [x] Review material diffs/source and structural impact; Raka reviews Main changes independently.
- [x] Record minor release intent; update CODEBASE with actual implemented state and evidence.
- [x] Native/path checks, focused tests, TypeScript/UI/launcher builds and packaged Agent Core.exe.
- [x] One official restart with capabilitiesChanged=true; inspect receipt/health, re-handshake and canonical Memory first.
- [x] Browser-use background direct-link → scroll until visible → click Refresh tools; verify discovery in subsequent context or report the precise limitation.
- [x] Connected scoped Memory and proposal UI readback; separate functional evidence from measured task benefit.
- [x] Final Learning checkpoint/review, scoped to this task, then user-facing ledger.

## Acceptance closeout

242 unique root passes / 2 filesystem skips, plus 15 UI passes; earlier 501-record transfer timeout remains recorded, not passed. Core/UI/local-SDK launcher builds, freeze/path/intent checks and two official restarts succeeded. Live scoped recall, same-task capsule reconnect and bounded claim-review readback succeeded. Refresh tools background scroll/click/loading-return/close acknowledged; subsequent descriptor readback now exposes claim_review and description(goal). The follow-up completed-proposal archive rule is documentation guidance, not an automatic history mover. See docs/External-Learning-Priorities-20261019.md for limits and provenance.

### Finalization recovery

- [x] Observe the real terminal closure publication error without replaying the committed Learning review.
- [x] Demonstrate RED: proposal publication incorrectly reports unavailable after episode closure.
- [x] Publish after durable review but before the episode mirror can close admission; preserve Native and partial results.
- [x] GREEN: 22 reconnect/terminal tests, independent Raka source review, Core build and native/path guards.
- [x] Second official restart with capabilitiesChanged=false, receipt/health, unchanged contract re-acknowledgment, canonical Memory read and same recovery task reconnect.
- [x] Verify final keyed Learning review on the resident correction and record the exact outcome: proposalDocuments not-required, episode linkage recorded, closedAt confirmed, 28 old reviews preserved; independent verifier unavailable.
