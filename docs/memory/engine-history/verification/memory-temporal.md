> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../../CONSOLIDATION.md).

# Temporal and epistemic query verification (T6)

Date: 2026-10-07 UTC. Platform: isolated cloud Linux, synthetic temporary stores only.
Baseline: `97d0d202b99704ad1314c4cb1a76157f858d6f65`, branch `feat/memory-evolution`.
Status: **G6 independent spec/quality review passed**, 2026-10-07 20:18 UTC.

## Query contract

Activated v2 controller sessions advertise `temporalAsOf: true`. `recall({asOf})` means valid-time according to the evidence available now, not what the engine knew then (`knownAt` is not implemented). The historical snapshot removes current expiration/supersession filtering before temporal selection and ranking, while retaining current workspace and explicit forgotten visibility checks. Legacy service search and the v1 controller gate remain unchanged.

The candidate selector accepts an explicit reference instant. Exact instants require a timezone and normalize to UTC. Exact intervals are half-open `[from,to)`. Unknown starts remain unknown; partial day/month/year dates and unknown timezones are not silently converted to instants. Known eligible candidates precede uncertain candidates, which retain `applicability: unknown`. Atemporal classification does not elevate verification. Static observations are not automatically replaced by arrival order. Opinion, prediction, hypothesis or cross-scope links do not invalidate a fact. Typed retrieval deduplication preserves differences in epistemic and validity metadata.

Current canonical revisions are authoritative present evidence for discovery. A later correction to one memory ID governs historical recall too; obsolete same-ID content snapshots are not resurrected as competing truths. Exact retained revisions remain separately expandable/auditable under current scope and forgotten-state checks, even when the current record is expired/superseded. Hits expose v2 validity, optional observedAt, and a derived `invalidatedBy` list of successor references; that list describes retained transition relationships and does not say the successor was already active at the queried instant. Expansion warns that an exact retained revision does not establish current applicability.

Temporal cursors bind the normalized instant as well as query/view/retention/scope and semantic snapshot. A single pinned reference clock controls temporal candidate selection and ranking throughout pagination. The archive-tier discovery gate is still closed until T7: archive/all requests are explicitly incomplete, and even previously existing archive metadata does not enter default historical discovery. Explicit exact revision expansion remains available. No archive-tier metadata is rewritten.

## Explicit transition evidence

The internal `applyTemporalTransition` helper plans, rather than writes, a mutation of both exact predecessor/successor revisions. The public entry is consolidation action `supersede`, with `predecessor`, `successor`, `effectiveAt`, `evidence`, and `reason`, plus the existing action identity/inputRefs. The helper is not exported as controller authority.

An episode event may carry this optional typed assertion:

- `kind`: `correction` or `state-transition`
- `predecessor` and `successor`: exact memory references
- `effectiveAt`: explicitly zoned instant
- `evidence`: nonempty exact supporting references

The event must be an observation, correction or decision. Its endpoints and complete supporting lineage are resolved through existing scope, availability, safety and CAS checks. The event's `observedAt` and engine `recordedAt` are independent of `effectiveAt`: a report observed/recorded in June can explicitly support a February transition. Existing event bytes remain unchanged when the optional assertion is absent.

A matching typed assertion with available evidence permits a host-reviewed closure. Untyped/weak evidence or equal-start claims produce a reviewed `conflicted` relationship without closing either interval. No natural-language classifier, source hash, host approval, timestamp or ranking score becomes a semantic verifier. Verification and epistemic classifications are preserved; hypothesis ancestry is not upgraded.

Self-transitions, cycles (including unresolved traversal paths), cross-scope or incompatible claim kinds, conflicting explicit times and non-dynamic endpoint pairs reject. Unknown predecessor starts become an explicitly unknown lower bound with the supported exact cutoff, never an invented start date. Compatible scoped preferences can change; “newest record wins” is not a policy.

## Publication and reuse boundaries

Preparation and application reuse the existing promotion, store, transaction and archive owners. The reviewed digest covers both normalized outputs, exact read sets and transition audit data. Application recomputes the planned transition from frozen evidence, validates action/payload exclusivity, and uses semantic CAS while preserving independently accumulated read counters. Ordinary amendment targets retain current applicability requirements, including in a mixed temporal/ordinary plan.

Canonical before/after revisions, complete evidence lineage, outcome, effective time, recording time and reason are retained in immutable promotion audit manifests. Both canonical records and the receipt/episode event publish atomically. Canonical output hashes are computed after normalization, including padded reasons. The epistemic audit selector validates temporal output hashes, action shape, outcome/link/interval consistency and membership in the complete provenance graph. It still distinguishes actual evidence from unrelated candidate-comparison dependencies.

Exact historical evidence availability is separate from current target eligibility. A successor or transition audit can therefore be reused after its predecessor is superseded, without losing historical source references. Forgotten or cross-scope ancestry still blocks reuse and application. No staging clear, automatic verification, new transaction owner, or implicit source purge is introduced.

V2 canonical parsing and v2 link mutation preserve distinct intervals for the same target/type, including beyond the legacy link cap. V1 duplicate normalization remains unchanged. Full evidence ancestry is in immutable manifests/sourceRefs, not the legacy capped string evidence list. Transfer/1 keeps legacy interval metadata and leaves validity unknown; typed records continue to reject lossy transfer/1. Full typed transfer/2 remains T9.

## Clock behavior

Episode sequence/revision remains write order when wall time moves backward. New events retain the observed engine `recordedAt` plus a positive `clockSkewMs` diagnostic. Controller retrieval exposure adapts to the legacy ledger's nonnegative interval requirement by clamping `completedAt` to `startedAt`, while preserving `observedCompletedAt` and `clockSkewMs`, including empty-result operations. This is not a claim of external wall-clock accuracy.

## Evidence and reproducibility

Run from the repository root:

- `npm test -- tests/memory-temporal.test.ts tests/memory-temporal-order.test.ts`
- `npm test -- tests/memory-baseline-contract.test.ts`
- `npm run verify`
- `npm pack --dry-run --json --cache <task-local-cache>`

The focused corpus contains **45 tests** across two files. It covers E18–E23: positive T1/T2 boundaries, actual normal/reverse/intra-batch store ingestion with equal answer contents/classifications, late reports, equal-time conflicts in all ingestion orders, self/cycle and unavailable cycle paths, opinion/prediction/hypothesis/cross-scope rejection, partial dates/unknown timezone, backward clock diagnostics, expired/superseded historical recall, current-evidence corrections with old-revision preservation, exact source visibility, cursor binding, host-review/CAS denial, read-counter preservation, mixed-plan target isolation, audit-shape rejection and canonical/legacy-transfer roundtrips. Two original T0 negative asOf characterizations now also assert a positive eligible control, so empty search cannot trivially pass them.

RED logs captured each new behavior boundary before its fix. Initial tests first exposed the absent module/facade; later focused failures covered metadata deduplication, segment collapse, missing transition provenance, opinion invalidation, source reuse, mixed-plan authority, clock observability, action/payload mismatch and padded-reason output hashes. One fixture error expected the wrong existing transfer error code (`REQUIRED` versus `UNSUPPORTED`); only the assertion was corrected. Two old T5 unsupported-capability expectations were intentionally changed to malformed-input rejection after the capability became implemented. No timeout or assertion was weakened.

Terminal results (no failed/pending/skipped tests):

- Focused temporal: **45/45**, two files, exit 0, 4.82s.
- Full `npm run verify`: build exit 0 and **394/394**, 17 files, exit 0, 39.95s in the final repeat (preceding complete run 40.30s). Shared real-process preservation/recovery suites remain included.
- Package dry-run: **284 files**, 375866 compressed bytes, 1971334 unpacked bytes; no runtime, tests, private execution artifacts or temporary stores.
- `git diff --check`: exit 0. Dependencies and lockfile unchanged.

Earlier full verification had only two expected obsolete T5 capability-error assertions, updated for the implemented schema. Subsequent aggregate runs passed 382/382 and 392/392 as focused cases were added. Final verification is green; the earlier diagnostic logs are retained.

## Limits and deferred work

- These are deterministic synthetic acceptance tests, not a universal truth or chronology oracle.
- Typed temporal assertions are supported, explicitly reviewed claims. No model/verifier is executed.
- Partial-time candidates remain uncertain; no timezone/calendar-range inference or strict-only query option is introduced.
- `asOf` is not bitemporal knowledge history. Old content revisions require exact refs.
- T7 owns archive-tier discovery/retention and the previously tracked exact episode/event disclosure boundary. The existing malformed-UTF8 `readMemoryAuditRefs` error-code deferral remains unchanged.
- T9 owns typed transfer/2 and portable continuation packaging. Transfer/1 never substitutes for it.
- No new crash harness was needed: transition publication uses the existing shared atomic bundle, whose real-process recovery suites run in full verification. Focused temporal tests additionally verify pair atomicity on denial, CAS mutation and replay/restart.
- No Windows, live controller, network filesystem, hardware power-loss, user-data, release or deployment claims. No dependency or lockfile changes.


## G6 review round 1 — strict v2 link time boundaries

Independent review found one P2: existing link normalization and the canonical v2 link schema still accepted Date.parse-compatible zone-less/date-only/impossible dates. The same public v2 batch input therefore produced midnight UTC on a UTC process and 05:00 UTC on America/New_York, changing the historical answer set. Strict TimeValue/transition-input validation alone had not closed those legacy link entrances.

The fix reuses the existing strict zoned-instant schema for all four v2 link time fields: `createdAt`, `validFrom`, `validTo`, and `referenceTime`. Validation now precedes conversion at both mutation normalization and canonical parse/serialization. V2 public materialization preserves supplied empty/null fields so they are rejected, rather than silently dropped or defaulted. Batch creation is validated in activated-root mode even while its intermediate record still carries the v1 adaptation shape; the existing-link merge path and evolution normalization also use v2 validation. V1 permissive parsing/defaulting remains unchanged. Ambiguous observations belong in record TimeValue, since legacy link strings cannot encode uncertainty.

Twenty-six new tests cover the four-field invalid-input matrix, raw canonical parsing, canonical serialization, remember/update/batch remember/batch update/new and existing link mutation paths, no-write assertions, empty/null rejection and equivalent explicit-offset controls. Two real Node subprocesses independently run under `TZ=UTC` and `TZ=America/New_York`: ambiguous v2 input rejects, equivalent zoned offsets produce exactly the same boundary and historical answer, and v1 direct/canonical/public-mutation compatibility controls remain accepted.

- RED: 23 source-path failures plus two timezone subprocess failures; unrelated tests were intentionally filtered in those focused RED commands.
- GREEN targeted: **71/71**, two files, exit 0, 8.25s, zero failed/pending/skipped.
- The original synthetic timezone reproduction, adapted only to record rejection and continue to the second zone, now reports `MEMORY_LINK_VALID_FROM_INVALID` in both processes instead of two invented boundaries.
- A mechanical edit initially added an invalid Error constructor argument; TypeScript caught it before tests and it was removed. No workaround or weakened assertion was used.

Fresh full `npm run verify` passed build and **420/420 across 17 files**, exit 0, 42.92s, with no failed/pending/skipped tests. Final rebuild also passed. Package dry-run: **284 files**, 376686 compressed bytes, 1976082 unpacked bytes, no runtime/test/private artifacts. Dependencies and lockfile are unchanged; `git diff --check` passed. G6 remains pending independent re-review. No T7 or transfer/2 scope expansion.


## G6 acceptance

Scoped independent re-review closed G6-01 on commit99f4322. All four v2 link time fields are validated before permissive conversion across canonical parsing/serialization, mutation and duplicate merge. Reviewed 26 correction regressions, UTC/New York original proof and explicit-offset controls, plus full build/420 and targeted71 evidence. V1 semantics remain unchanged. No Windows or full bitemporal claim.
