# Native proposal promotion

Status: CLOSED for the Native change. Implementation, production build, 47 new feature regressions and resident activation are verified. The creator-authorized recovery through the same owner succeeded after test processes finished. The wider repository suite remains failing and was run once, as requested for the deadline.

## Problem and approved behavior

Native currently recognizes only canonical Skill decision commands. The creator uses “promote proposal” to mean integrating a recorded proposal into Agent Core's architecture, including improvements, upgrades, new Skills and Skill revisions. Recognize that intent at the persisted local-operator chat boundary, resolve an explicit or unambiguous conversational proposal reference, and preserve the complete current user request as the task scope.

## Owners and boundaries

- Reuse `LearningService.proposalDocuments()` for bounded discovery and exact document reads. Do not create a new proposal catalog or decision engine. Use `list()`, so approved but unimplemented proposals remain addressable.
- Bind the selected ID, kind, path, title, status, revision digest and document digest. Missing, ambiguous, unreadable, foreign-workspace and drifted proposals do not authorize implementation. History supplies a referent, never consent. A global singleton or newest file is not a referent.
- Improvements and upgrades enter the existing Native model/tool workflow as document data, with a Native contract defining integration and requiring scope, verification and rollback. Merely loading a Skill or marking a proposal approved does not complete integration.
- Registered Skill proposals reuse the existing host-only decision/build/activation owner. Only the fresh persisted local-operator message supplies `userEvidenceRef`. Keep the existing exact-revision/notice requirement; never synthesize approval from Memory, proposal text, history or an external-controller message. Limited/partial Skill scope needs a matching revised proposal instead of activation of the whole artifact.
- The Skill fast path carries the selected proposal ID/revision into that existing owner as a guard, separately from approval evidence. A concurrent revision/new notice cannot switch the artifact between resolution and the decision; the existing state mutation CAS protects the subsequent write.
- Persist and validate the proposal binding in the existing turn checkpoint. Revalidate before resumed execution without silently selecting a new proposal. Already-terminal commit-only recovery remains possible.
- Do not modify Claude, external-controller authority, exposed MCP schemas, provider settings or unrelated runtime state.

## Implementation and verification

1. Add an internal, read-only promotion intent/resolution helper under `src/learning/`.
2. Connect the existing Runtime and ChatService local-operator intake; add Native guidance and untrusted document context in the Controller.
3. Preserve the exact binding through checkpoint serialization and resume.
4. Test the new resolver and real Native chat wiring RED once, then GREEN through the full repository suite once. Use the project's bundled Node and existing Vitest; no benchmarks or new dependencies.
5. Update CODEBASE and a pending changeset, build, restart through the official owner once, inspect resident activation, and commit only this task's files. Do not apply a release or push.

## Acceptance and rollback

Explicit title/path and unambiguous prior references select the correct recorded proposal. The original request remains intact. Multiple or missing targets get a useful resolution response, not a request to redefine “proposal.” Document text stays data. Exact registered Skill consent reuses existing activation with no model-generated decision. Resume detects changed content. Full suite and build pass; a single official restart loads the internal Native change. Rollback is the task commit plus an ordinary build/restart; proposal and Skill owners retain their existing rollback mechanisms.

## Verification ledger

- Initial feature RED: 28 failures before implementation, including real Native intake and checkpoint behavior.
- Feature GREEN: 37 cases passed in `proposal-promotion.test.ts` and `native-proposal-promotion.test.ts` (additional variants were added during static review).
- Exact-path follow-up RED: four failures and three passing controls for extension/root/name boundaries and missing explicit targets. Follow-up GREEN: eight cases passed in `proposal-promotion-path-boundary.test.ts`, including a supporting-history-link control.
- Concurrent-revision follow-up RED: one failure and one passing prior-notice control. Follow-up GREEN: two cases passed in `native-proposal-promotion-race.test.ts`. Total feature cases: 47.
- TypeScript, `npm run build`, path/storage/structure checks and pending release-intent checks passed. Whitespace checking uses `core.whitespace=cr-at-eol` for this Windows checkout, with no global Git setting changes.
- Full `npm test` ran once: 4,096 passed, 198 failed, 19 skipped, four unhandled errors; 327 files passed and 48 failed. No complete project-suite pass or measured improvement is claimed. Existing controller (32), chat-service (26), and Skill decision (14) cases passed. The creator requested no redundant full-suite rerun while pursuing the deadline.
- First official activation request: `restart_agent_core(capabilitiesChanged=false)` once. Receipt `runtime/restart/f849158e54b24c1dad6d4b24ff23e35f.json` reports exit 1 at 2026-10-31 04:31:20 UTC, waiting for project processes and refusing replacement launch. The subsequent creator message grants automatic acceptance for Agent Core work and permits the bounded recovery after verification processes finish; no parallel launcher or unrelated restart route is authorized by this plan.
- Recovery receipt `runtime/restart/425df22cc80048b9b0b0ae5a054a60a6.json`: exit 0, backend PID 7244 started 2026-10-31 04:52:47 UTC, ready with no stale dist. MCP contract was re-acknowledged. Resident Native task `86aaccde-55fc-4be7-81ff-58e27eac698f` explained the broadened meaning with zero ordinary tool calls and no proposal promotion; this is a conceptual check, not real proposal outcome evidence.
