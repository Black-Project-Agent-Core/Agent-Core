# metaclaw - Source-grounded Steal / Use Plan

> **Status:** COMPLETE FOR APPROVED ADOPTION - AUTHENTICATED RESIDENT HTTP VERIFIED - REFERENCE IN CONSUMER
> **Grounded:** 2026-09-29
> **Inspected location:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/metaclaw`
> **Current reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/metaclaw`
> **Revision:** `e727cf86842b6411ad13591859349bb5a1fe3e69`; branch `main`; clean at initial inspection.
> **Origin:** `https://github.com/qhz991029/metaclaw.git`
> **Licence evidence:** Root MIT (2026 named contributors); this inspected origin is qhz991029/metaclaw.

**For agentic workers:** After explicit selection, use the executing-plans workflow; these proposals do not authorize implementation or verification by themselves.

**Goal:** Let callers bind optional native feedback to the exact Memory body they actually read.
**Architecture:** Reuse canonical Memory and its existing process lock; add an optional digest assertion to the current MCP read/feedback flow, not a second feedback engine or online trainer.
**Spec:** This plan defines the proposed scope; shared boundaries are in `Fourteen-Reference-Steal-Use-Review-20260929.md`.

## Inspection and confidence boundary

Available-file inventory: **88 files / 45,979,489 bytes**; **25 Python files** statically parsed and **1 other code files** indexed lexically. Hashes identify available bytes; they are not passing tests. Selected method bodies and selected assertions were read, not every branch, example or transitive dependency. No donor import, training, model call, test suite or build was run.
Excluded paths and empty submodules are recorded in the inventory. No credential values, environment-file content or private runtime data are used as semantic adoption evidence. Paper/README claims and remote links are leads, not independently checked results.
Evidence root: `runtime/tmp/fourteen-reference-grounding-20260929T152826Z/`; see `metaclaw-inventory.json`, `identities.json`, `read-anchors.json`, `native-gap-search.json` and the final lifecycle readback.

## Global constraints

Execution is authorized for P1 only. Preserve native Memory, Reflexion, Skills, Grafel, Semantic IDE and machine-control ownership. No automatic install, workflow execution gate, model/controller runtime, credential, restart, Git-history change or release. New systems are allowed in a selected proposal only when its concrete input/output consumer needs them. Do not recreate a covered subsystem merely to manufacture use for a reference.
User chooses targeted verification; builds/reloads required for activation are distinct from broad tests. A selected material implementation must update its CODEBASE section, canonical Memory and one changeset, without release:apply or auto-commit.
## METACLAW-P1 â€” optional stale-content feedback guard in native Memory

**SELECTED; implemented outcome is recorded below.** The concrete existing consumer is `memory_feedback`: a controller can read a memory, another authorized change can replace its content, and delayed feedback can then target the same ID. Add an optional exact-body identity guard so a controller can require that feedback still refers to the content it observed. This is not a new model trainer, automatic learning loop or lock on unrelated tools.

### Source and native comparison

The donor stamps `ConversationSample.skill_generation` in `metaclaw/data_formatter.py:47-49`; `api_server.py:1250-1252` binds generated samples to the skill manager generation. `trainer.py:317-356` drops queued samples after evolution and `387-390`/`483-486` filter them by generation. `tests/test_v03_live_tinker.py:227-250` specifies that old generations are excluded, while current and greater generations remain. That test is a simulated filtering assertion, not fresh end-to-end RL or MAML proof.

Transfer the stale-subject-evidence principle, not the integer generation, >= rule, trainer, sample deletion or model-service runtime. Agent Core has no chosen online-RL consumer. Its existing SkillService already protects promotion with expectedActiveDigest, so a second Skills revision guard would duplicate current behavior.

The native gap is concrete source behavior: `src/memory/service.ts:305-317` reloads a record then calls feedbackStore.apply(id,eventId,kind); `src/memory/feedback.ts` keys events by memory ID/event ID/kind and adjusts salience without a body digest. The canonical body can change while retaining that ID. This is a missing opt-in invariant, not a claim that a live stale-feedback incident was reproduced. `memoryFeedback` in `src/mcp/memory-schemas.ts` has no expected-content field; the MCP handler explicitly forwards only id/eventId/kind.

`MemoryFeedbackStore` already holds `paths.lock` during state mutation. `MemoryStore.read` at store.ts:109-120 is a non-locking canonical read; canonical writes use the same lock. Compare inside the existing critical section using that read, not a stale service Map or a nested lock. Grafel was current before the structural inspection but returned only broad module impact for MemoryFeedbackStore; exact source establishes service/MCP/lock consumers.

### Proposed contract

Create `src/memory/feedback-target.ts` with `memoryFeedbackContentDigest(record: Pick<MemoryRecord,'id'|'content'>): string`.
Digest is `sha256:` plus SHA-256 over UTF-8 bytes of `JSON.stringify(['agent-core-memory-feedback-content/v1', record.id, record.content])`. No trimming, whitespace normalization or omission of Unicode. Read/touch timestamps, retrieval counters, keywords, title, tags, links and provenance are deliberately outside this **body-only** contract. It is not a complete record revision, an authorization token, or evidence that the feedback is justified.

Add `feedbackTargetDigest` to non-pinned `memory_read` output only, computed from exactly the returned record. Do not persist this derived field into canonical records. Existing search, list, export and Memory schema remain unchanged; controllers can explicitly read the full subject before giving guarded feedback.

Add optional `memory_feedback.expectedContentDigest` matching `^sha256:[a-f0-9]{64}$`. It applies only to helpful/not-helpful/stale/wrong. If supplied with forget/restore, return `MEMORY_FEEDBACK_GUARD_MODE_INVALID`, not silently discard the requested guard. Absence preserves the current legacy behavior. Pinned-memory feedback remains refused.

Extend `MemoryService.feedback(id,eventId,kind,expectedContentDigest?)` and internal `MemoryFeedbackStore.apply` with an optional guarded validator invoked **inside its existing paths.lock**. The validator rereads the canonical record, rejects missing/pinned/malformed input, compares the body digest and returns the observed digest. No new cross-locking system; do not call a lock-acquiring service method from that callback. Before creating/updating the feedback row, require exact equality or return `MEMORY_FEEDBACK_CONTENT_CHANGED` with no salience/event/canonical change. Do not emit the new body in the error.

For accepted guarded feedback, record the optional `contentDigest` on that feedback event and return it with the outcome. Existing v1 events without it remain legacy/unbound, not retroactively proven. Validation/load/persistence recognizes the optional field without rewriting other records. Reusing one event ID with a different kind or different bound digest is a conflict, not a second effect. Guard validation precedes replay return: a currently stale guard may be refused even for a formerly applied event, but must never reapply the salience change. Unguarded duplicate behavior remains unchanged.

The guarantee covers concurrent writers cooperating with the existing canonical Memory lock, not arbitrary external processes editing files outside Agent Core. It does not reset historical salience, re-score old feedback after edits, or authenticate evidence. Those would be separate selected policies, not hidden extensions of this change.

### Task 1 â€” body identity and guarded mutation

Files: create `feedback-target.ts` and `tests/metaclaw-feedback-target-adoption.test.ts`; modify `src/memory/feedback.ts` and `src/memory/service.ts`.
- [x] Pin digest determinism for exact ID/body, whitespace/Unicode/body changes, and unchanged digest across metadata/touch-only changes.
- [x] Pin accepted matching-body feedback, replaced-body refusal, missing/pinned target, malformed expected digest, legacy no-guard behavior, event replay and bound-digest conflict. Every refusal leaves event list, salience and canonical bytes unchanged.
- [x] Use an isolated Memory fixture to coordinate a content update before lock admission: the validator must see the new body. Exercise the existing lock path without nested acquisition; no live user Memory as fixture.
- [x] After verification approval, run only `npx vitest run tests/metaclaw-feedback-target-adoption.test.ts` for red/green and implement the optional extension. Do not reset feedback state or introduce another store.

### Task 2 â€” real MCP read/feedback flow

Files: modify `src/mcp/memory-schemas.ts` and `src/mcp/memory-tools.ts`; extend the same focused fixture suite.
- [x] memory_read returns a digest of its actual non-pinned body; parse and forward the optional digest all the way through the real handler. Schema presence alone is not implementation proof.
- [x] Exercise read -> guarded feedback success, then read -> canonical update -> old-digest feedback refusal through actual isolated MCP handlers, plus unsupported lifecycle-mode refusal.
- [x] Check additive descriptor/manifest budget and read-result compatibility using specifically approved tests. A failure must not be swallowed into success by wrapper/advisory handling.
- [x] On selected implementation, update CODEBASE, notices and canonical Memory plus one material changeset. Build/restart/live acceptance is separately recorded; no key is implicitly authorized and no automatic restart occurs.

### Review focus

1. Digest must bind the returned subject body, not a later reread or only its ID.
2. Guard must be checked under the existing canonical lock, without deadlock or nested locking.
3. Duplicate events cannot acquire a new meaning or repeat salience mutation.
4. Unsupported forget/restore use and invalid options must not silently drop a requested guard.
5. Metadata-only changes, existing unbound history and concurrent noncooperating editors must have explicit scope limits.

## Remaining source families

| Family | Disposition |
|---|---|
| Generation-tagged feedback | METACLAW-P1 adapts subject freshness into current native Memory only; not a direct trainer transplant. |
| SkillManager add_skills / prompt retrieval | Existing Skills already own bounded artifact validation and digest-bound revisions. Donor add-to-memory-before-save and logging failed writes are not durable promotion proof; raw names/logged prompts are not native-safe persistence. |
| SkillEvolver success/failure analysis | Conditional MCL-C1: a chosen external rollout/skill-generation consumer. Reward>0 or missing reward defaults are not verified native effect evidence; no automatic model-generated Memory. |
| API proxy/token/logprob/teacher routes | Conditional MCL-C2: explicitly chosen model-service owner and accounts. No inference proxy or credential action in this planning task. |
| RL/OPD/trainer/Tinker backends | Conditional MCL-C1/C2; not a missing requirement for ordinary machine-control. Tests with live-provider sections were not run. |
| Idle/pause/calendar/OS activity scheduler | Conditional MCL-C3 with explicit privacy/scheduling scope. No desktop monitoring or calendar access is started. |
| Memory data, record logs and assets | Inventoried, not treated as verified lessons or imported into canonical Memory. |

**Current disposition:** RETAINED IN Consumer/metaclaw after completed resident acceptance; conditional families MCL-C1/C2/C3 remain unselected.


## Historical planning reference readback - 2026-09-29

Retained at the original path. Current path: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/metaclaw`. Postflight compared **88** included file sizes/SHA-256 values with no drift, extra or missing included files; original HEAD `e727cf86842b6411ad13591859349bb5a1fe3e69` remains and Git is clean. No symlink/junction or scoped runtime dependency/process consumer was found. Existing native GEPA mentions are attribution comments, not imports from its checkout. No repository was deleted.
Implementation remains unstarted for this review. Actual lifecycle evidence: `runtime/tmp/fourteen-reference-grounding-20260929T152826Z/reference-postflight.json`; plan self-review and native snapshot readback are recorded in final-closure.json.

## Approved execution and qualification — 2026-09-29

The user selected this P1 with the other two independent current-fit proposals. Preceding grounding observations are historical baseline evidence, not a claim that current source still lacks the implemented feature. Conditional C families remain unselected.

Qualification: **116/116 PASS, 0 failure, 0 skip** in the explicit seven-file scope: 79 new adoption tests (CORAL 38, GEA 17, MetaClaw 24) plus 37 selected existing retrieval/manifest regressions. The build passed with path policy 279 authored files / 0 exceptions. An additional **19/19 compiled checks** passed using an in-memory MCP transport and all eight analysis CLI modes; client/server and synthetic fixture were closed/removed. These are scoped tests, not a full-project benchmark or resident HTTP acceptance.

MCP compatibility remains 70 to 70 tools; expectedContentDigest is optional, with no removed/newly required parameter and breakingEvidence=false. Compiled manifest is fresh, 118234 bytes / approximately 29559 tokens, under 120000/30000 budgets. release:check-intent passed; read-only release:plan remains 0.14.0 to 0.15.0, not applied. One new minor intent is .changeset/20260929-coral-gea-metaclaw-adoption.md. No new dependency, donor runtime, model, credential, HTTP listener, automatic restart, Git-history change or deployment.

Grafel was explicitly indexed: current, accepted, 9659 entities / 51413 relationships, registered workspace coverage 1/1. Exact source imports/calls remain authoritative; initial MemoryFeedbackStore impact was broad-module only.

Evidence: runtime/tmp/coral-gea-metaclaw-implementation-20260929T161854Z/ (before-images, source-artifact-identities.json, qualification-final-vitest.json, compiled-acceptance.json, compatibility-result.json, graph-readback.json, reference/move readbacks, result.json). CODEBASE 0.1.77, MEMORY.md, the review index and canonical Memory record 206c85e5-8142-49bf-841b-7a9270b4bc25 retain the same stage distinctions.

### METACLAW-P1 implemented behavior and resident boundary

Implemented feedback-target.ts, optional feedback event contentDigest persistence, and the existing MemoryService/MemoryFeedbackStore validator callback. The body digest is exactly SHA-256 of UTF-8 JSON.stringify([domain, id, content]) with domain agent-core-memory-feedback-content/v1. Metadata/touch changes do not change this digest. Non-pinned memory_read returns feedbackTargetDigest from its actual returned body; it is never persisted into canonical records or added to list/search/export.

memory_feedback.expectedContentDigest is parsed and forwarded for helpful/not-helpful/stale/wrong. The canonical body is read without acquiring a nested lock after the existing canonical process lock is held, before state mutation or replay. Stale bodies, removed targets and malformed digests refuse without new feedback effects. Accepted events persist their optional bound digest; old events remain unbound. Replay cannot reapply salience or retroactively bind legacy events. Forget/restore with a supplied guard is refused. Actual source and compiled MCP paths, delayed writers, changed-during-advisory read results, isolated service restart, corrupted stored binding and unguarded legacy behavior are covered.

**HISTORICAL PRE-RESTART QUALIFICATION CHECKPOINT (superseded by the resident readback below).** The compiled SDK acceptance used in-memory transport, no credential and no HTTP listener. Current Core PID 19512 started 2026-09-29T15:23:11.7647380Z, before the last compiled artifact 2026-09-29T16:38:48Z. It has not been restarted or claimed to expose this new runtime field.

- [x] User-controlled restart/reconnect and bounded synthetic resident read/digest acceptance are verified.
- [x] Guarded-feedback success, stale-body refusal, replay and no-side-effect behavior verified through explicitly authorized resident HTTP; temporary key revoked and rejected.

metaclaw is now in Consumer/metaclaw; the 88 originally included file identities and original clean HEAD are preserved (see final closeout below). The eleven pre-existing Consumer references remain conditional, not installation tasks; no trainer/proxy/calendar subsystem was added.


## Historical resident read-only checkpoint — 2026-09-30 WIB

The earlier post-restart step verified PID17776, 32 matching file identities and exact Unicode body digests through native MCP. The synthetic record was deleted, without feedback. Guarded feedback was not exercised in that checkpoint because the chat descriptor omitted expectedContentDigest. This historical limitation was subsequently resolved for server acceptance by the explicitly authorized HTTP probe below; no connector-schema refresh is implied. Earlier readback reports are retained unchanged.


## Final authorized acceptance and Consumer relocation — 2026-09-30 WIB

**COMPLETE FOR APPROVED ADOPTION.** CORAL-P1 and GEA-P1 retain their completed offline CLI scopes. METACLAW-P1 is live-activated and authenticated resident HTTP verified. No implementation, activation or runtime acceptance remains open for these three selected proposals; conditional donor families are not installation tasks.

Authenticated acceptance at 2026-09-29T18:42Z (2026-09-30 01:42 WIB) completed with 19/19 bounded checks and exit 0. Matching feedback applied once; replay caused no second effect; old-body feedback and old-guard replay were refused with MEMORY_FEEDBACK_CONTENT_CHANGED without changing canonical bytes, salience or events. Guarded forget was refused; a new matching body digest was accepted. One authorized five-tool key was revoked at 18:42:15.172Z and the same key was rejected by native verification and HTTP 401. Synthetic canonical/feedback records were removed and 84 other note files stayed byte-identical across that probe. This is prior executed resident evidence, not a test rerun in the administrative closeout.

On the user's subsequent explicit update-and-move instruction, metaclaw was moved intact to DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/metaclaw. All 118 non-Git files and 28 Git files, plus directory inventory, match before/after. The 88 files included in the original audit still match that audit; 30 pre-existing __pycache__ files excluded by the original inventory were preserved, not deleted. HEAD remains e727cf86842b6411ad13591859349bb5a1fe3e69 on main, Git clean; old root absent, no reparse entries or observed process consumer. Workspace list contains only agent-core; scoped source/scripts search found only the existing attribution comment. Conditional MCL-C1/C2/C3 remain retained, not installed or declared exhausted.

The administrative step leaves all 32 selected source/compiled/test identities unchanged. No new credential, test suite, build, restart, release apply, dependency or Git-history mutation occurred. Product remains 0.14.0; the existing minor intent stays unapplied. The chat memory_feedback descriptor is not claimed refreshed: the authenticated server itself advertised and executed expectedContentDigest.

Primary evidence: runtime/tmp/coral-gea-metaclaw-implementation-20260929T161854Z/authorized-guard-http-20260930.json; final-admin-before-20260930.json; final-admin-after-20260930.json; final-doc-sync-20260930.json. Before-doc copies: before-final-admin-20260930/. Canonical continuity uses the existing record 206c85e5-8142-49bf-841b-7a9270b4bc25, not a duplicate.
