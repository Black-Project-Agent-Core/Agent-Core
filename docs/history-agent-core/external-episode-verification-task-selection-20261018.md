# Enforce the intended task on external episode verification

Status: IMPLEMENTED AND RESIDENT-VERIFIED — source, directed regressions, build, restart, connector refresh and a live wrong-selector refusal completed.
Date: 2026-10-18. Owner: existing external controller Learning service.

## Observation and evidence

`controller_learning(episode/verify, taskId=ext-183e3fb9fbc3419f8d6ab3fd8a72082d)` selected active Browser Bridge episode `ext-031299dbbcb645f6a127df4b2c2a7a90` instead. The existing handler does not forward taskId to verifyEpisode. That episode received the OBU terminal declaration and was archived, while its verificationStatus remained unavailable.
Evidence: `runtime/build/open-browser-use-20261018/learning-attribution-incident.json`, `learning-attribution-repair-receipt.json` and `learning-closeout.json`. The mistaken closure was repaired with a scoped backup, exclusive Windows file access and full byte readback. The same Browser Bridge ID was restored through canonical start; it remains unverified. The earlier wrong event and a correction event are both retained.

## Implemented change

The existing verifyEpisode input now requires the intended taskId, and the external handler forwards the existing tool field. Public input validation requires an exact nonblank task selector for episode/verify. The service snapshots that selector and compares it with the genuine host-issued invocation task and current session head before verifier I/O, then again inside the existing mutation queue. Missing task IDs return EXTERNAL_EPISODE_VERIFICATION_TASK_REQUIRED at the service boundary; mismatches return EXTERNAL_EPISODE_VERIFICATION_TASK_MISMATCH. Existing stale-task, owner/workspace, closed-record and evidence checks remain in place. A caller ID never selects or authorizes a foreign episode.

The existing HTTP namespace uses an explicit session header when present; otherwise credential identity plus an hourly bucket. Owner scoping separates owners, not chats. Separate contract acknowledgements do not create separate Learning heads. The selector check safely refuses wrong-task verification in a shared namespace; it does not infer chat identity or redesign other head-based operations. No new state store, runtime or orchestration engine was introduced.

## Expected benefit and limits

Targeted regression evidence shows that a request for task A is refused after the active head becomes B, including before invocation capture and during verifier await. Service refusal leaves current/last-good state bytes unchanged; real HTTP admission adds normal tool telemetry but leaves verification outcome, closure and verified counts untouched. Separate session-header cases affect only the matching task. A correct selector does not turn task evidence or a native-form receipt into a workflow verifier pass, and no token-efficiency gain is claimed.

## Verification and risks

Regression owners: tests/batch16-exact-task-verification.test.ts and tests/learning-task-selector-http.test.ts, plus existing cumulative-workflow and Memory task-binding tests adapted to pass their actual task IDs. Three new bug probes first failed against the previous implementation. Targeted results and build/activation receipts are under runtime/build/learning-task-selection-20261018.

Final combined directed run: 74 passed, one host alias fixture skipped. Official build passed Native freeze (31 files/78 sections) and path policy. Restart receipt runtime/restart/30b51d4ee21e4a84b58dcff937d09029.json completed exit 0; one client Refresh tools returned idle. Actual connected verification returned EXTERNAL_EPISODE_VERIFICATION_TASK_MISMATCH for a mismatched requested ID and preserved the current episode's verification outcome, closure, count and verification-event fields. Positive and concurrency cases are isolated regressions, not forced production closures. The unrelated unchanged mcp-schema-contract test expects 28 literal registrations while source contains 27; it was not weakened or changed, and actual manifest checks pass.

Callers that omit taskId must now supply the actual host-returned task ID. This is an intentional fail-closed compatibility change, with no current-task fallback. Headerless or shared-header chats still need serial task activation or distinct host session headers. Existing historical incident records were not rewritten by this source repair.

Authorized by the user's request to repair the Learning error on 2026-10-18. Pending release intent: .changeset/20261018-external-learning-task-selection.md (patch, unapplied).
