# External Learning promotion — 22 October 2026

The user explicitly requested implementation of revision 2 of
`Penguatan-Learning-Proaktif-Self-Improvement-dan-Memory.md` in this chat.
The remaining authorized scope is P03–P07, for external controllers only.
P08/P01/P02 were already implemented. Native implementation, grants and routing
remain frozen. No dependency, daemon, scheduler, model router or additional
knowledge store is introduced. This is local development and activation, not a
versioned release or automatic Skill activation.

The exact approved document was preserved before editing at
`runtime/build/learning-promotion/approved-proposal-revision-2.md`, with approval
metadata in `approval-snapshot.json`. Its original SHA-256 is
`56370a2a6cafd213dfcee7937f21de62517a12d1409d2408e8aced8906c17a9f`.
Historical decisions remain in the proposal; the current explicit request
authorizes the remaining packages.

## Implemented contracts

### P03: general improvement lifecycle

`controller_learning(action=improvement, taskId=<host episode>, payload=...)`
uses the existing Learning state owner. `status.externalGuides.improvement`
describes inspect/register/notice/feedback/progress. Registration checks the
actual readable improvement Markdown and exact document digest, with CAS and
stable operation IDs. One originating opportunity is admitted per task.

Notices stay in their originating task/session. Busy state, repeat exposure,
unchanged HOLD/REJECT evidence and explicit review times suppress interruption.
Silence is unknown; exposed delivery is unconfirmed. Feedback is explicitly
controller-reported and never authenticated consent or execution permission.
Changed document/evidence invalidates acceptance. Progress requires acceptance
of the current document and evidence digest. Historical feedback is retained.
Other tasks of the same owner/workspace may explicitly follow that revision.

### P04: comparable evaluation and external outcome review

`controller_learning(action=evaluate, baselineEpisodeIds, candidateEpisodeIds,
payload=<manifest>)` checks declarations before returning differences.
`status.externalGuides.evaluation` describes purpose, model/controller,
loaded asset/config, evaluator/collector, case population, time window and task
membership/coverage. Missing independent host observations yields insufficient;
conflicting evidence yields incomparable. Declarations cannot manufacture
observations. Missing costs remain null, regressions remain signed, and
exploration does not receive a production score. Benefit remains withheld.

The pure evaluator accepts internal harness observations for controlled checks;
the public adapter does not populate those observations from caller payload.
Ordinary tasks do not require an expensive harness. External curation now uses
task plus artifact revision and verified outcome classes. Event verbosity does
not increase independent opportunities. Infrastructure, unavailable evidence,
interruption and unknown stay separate from method failures. The existing Native
default event pool and qualification behavior are preserved.

### P05: structured procedure admission

`controller_learning(action=procedure, procedureOperation=propose, taskId,
name, verificationRef, payload=<structured contract>)` uses the current host task
and workspace. `status.externalGuides.procedure` describes trigger,
prerequisites, ordered actions, avoid, consequence/checker, reversal/stop,
rollback or explained not-applicable, positive/negative/exception cases, and
provenance. Explicit source/field/fallback bindings can replace private constants.
Lookup execution is not implied and unknown private hostnames are not detected
automatically.

Labelled JSON values preserve negation, whitespace, order and repeated actions
inside the existing procedure contract. Ambiguous legacy-plus-structured fields,
secret-shaped text and oversize contracts are rejected rather than truncated.
The no-payload legacy path remains available and is labelled structurally
incomplete. Existing independent verification, task deduplication, readiness and
explicit Skill decisions still apply. A schema pass is not behavioral benefit.

### P06: explicit keyword repair after a recall miss

`memory_v2_read/write(action=recall_repair, scope:{taskId}, payload=...)` exposes
inspect, preview, apply, reject and verify through the existing Memory session.
Read `memory_v2_read(action=capabilities).recallRepair` first. An actual scoped
retrieval attempt must miss the target, and a later delivered attempt must bind
the current target fingerprint. Failed/unavailable retrievals cannot supply a
knowledge-miss proof. Cause selection is controller-assessed; no empty result
proves that knowledge is absent.

Apply uses the existing canonical batch transaction owner for a keyword-only
record change and atomic revision-bound receipt. Facts, links and neighboring
records are preserved. Rejected keyword hashes persist. Original, paraphrase
and negative query tests use three distinct actual ledger attempts, matching
query hashes, ranking profile and current record fingerprint. No raw query text
is retained by this workflow. Passing these declared queries does not establish
general semantic benefit or permit raw-query replay.

Receipts live under canonical `runtime/memory/state/recall-repairs`; complete
Memory transfer preserves them and blocked hashes. Knowledge-only transfer
omits them explicitly. Index refresh failure is reported after a durable commit;
inspect state before retrying. Capacity exhaustion asks for review rather than
dropping history.

### P07: selected-source derivation evidence

`memory_v2_read/write(action=derivation, scope:{taskId}, payload=...)` stores an
ordinary immutable scoped evidence artifact, not a second compactor. Its guide
is exposed in Memory capabilities. It records exact UTF-8 source SHA-256 and
Unicode code-point ranges, declared parser/normalizer/policy/prompt identity,
reference time, source-linked conclusions, corrections and excluded/lost ranges.
Changed interpretation contracts create distinct receipts; previous receipts
remain readable. Fields describing the controller's declared role/model/tool
are separated from host observations. Unobservable role/model/tool identity
stays unknown, and every receipt grants no instruction authority.

The writer checks bytes and ranges when available. Missing source stays
unavailable, never recoverable or semantically equivalent. Scope is checked
again at queued publication. No hidden reasoning or automatic whole-chat capture
is performed. Existing available-only backup semantics remain unchanged.

## Verification and activation

Verification results, build identity, activation receipt and remaining client
refresh limitations are recorded below when actually completed. No claim of
held-out benefit or arbitrary semantic equivalence is made.

- Final focused JSON: 68/68 passed, 0 failed/skipped/pending; `runtime/build/learning-promotion/focused-vitest.json`, SHA-256 `fef23943edfa5a5212bc8dbb793822bc5192fb7dd38c9aea88f742088aae8abe`.
- Real external API JSON: 16/16 passed, 0 failed/skipped/pending; `api-vitest.json`, SHA-256 `8b93fbbdd5992b338dd55a1ed37bd78bd06e7d877af931552c5539a00dd79199`.
- MCP manifest contract: 5/5 passed, including the optional-cohort handshake budget.
- Existing claim-review, external-scope and default feature-pool regression suites: 53/53 passed, one worker and 60-second per-test/hook budget. Total: 142 distinct targeted tests across 9 files. Full repository/UI/launcher test suites were not rerun; this task changes no UI or C# source.
- Final normal Core build passed historical governance checks (31 files/78 shared sections), path policy (464 authored files, 0 exceptions), transport build and TypeScript. The Release win-x64 self-contained single-file launcher publish passed with the then-current governance check and no package restore.
- Source/build identity: `runtime/build/learning-promotion/build-identity.json`, 48 verified source/compiled/launcher file hashes and HEAD `c8a0d306493ecbfaa8a5c9f9ae9df1754d813e98`. Candidate EXE SHA-256 `c6c1fbeccbe538530b8ca01f8eb55cebe0315953de55dbf861023e838e12773f`. Source identity includes the pre-existing working tree; HEAD alone is not the candidate.
- Recovery during development: initial type inference/narrowing build failures were corrected; two real acceptance-revision regressions and the external receipt projection bug were demonstrated and fixed. An early Memory integration fixture incorrectly assumed that all irrelevant queries return empty and confused artifact revision with body digest; corrected fixtures use actual top-one misses and the retained body manifest. One event expansion returned MEMORY_INPUT_INVALID; the exact canonical event was read back through the documented filesystem audit path. No ambiguous write was replayed.
- No downloads, dependency installation, global configuration changes, release/version bump, commit or push. Existing dirty files were preserved. Test/build processes are temporary; resident activation is recorded separately below.


## Resident activation and client refresh

One official `restart_agent_core(capabilitiesChanged=true)` request activated the checked EXE. Restart receipt `runtime/restart/2bf25435561047a7af7aaac9994a7890.json` completed 2026-10-22T05:44:34Z, exit 0. The earlier pending EXE had no marker and was preserved at `runtime/build/learning-promotion/pending-before-learning-promotion.exe` before staging; the official restart additionally retained the formerly active EXE at `runtime/launcher/backups/launcher-42b69a2611644251a3b1bd332c11c42b.exe`. The active EXE matches `c6c1fbeccbe538530b8ca01f8eb55cebe0315953de55dbf861023e838e12773f`, and its pending marker was consumed. No restart was repeated. Health was initially refused during cold start; after startup, HTTP 200/status ok, Memory/Learning available with zero issues and index available were observed. Core PID 11456 belongs to launcher PID 12436 at this observation. Normal startup reset only the existing Activity Log visible cutoff; JSONL was preserved.

The fresh contract handshake and same taskKey resumed the existing host task and Memory episode. Resident `controller_learning(status)` returns all three new guides; Memory capabilities returns recallRepair and derivation; actual evaluate returns insufficient with null differences and withheld benefit; scoped recall_repair reads the existing record without mutation. A real derivation artifact was written/read back with sourceValidation unavailable and semanticEquivalence unknown: the existing source capture scanner refused the report as safety-private-reasoning. That policy was not bypassed. Available-source/range/version behavior is covered by the isolated integration tests. Evidence: `runtime/build/learning-promotion/activation-evidence.json`.

**HISTORICAL (before user refresh confirmation) — client refresh was open.** Browser use attempted the exact ChatGPT settings link, but returned BROWSER_OBU_OPEN_OUTCOME_UNCERTAIN (ownedTabId 1523523034); observing that returned session failed with BROWSER_CONTROL_SESSION_NOT_FOUND. No second open or blind click was sent. The Refresh tools click and subsequent refreshed client schema are therefore unverified. The current chat's cached controller schema still lacks improvement/payload. Open [Agent Core plugin settings](https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503), **scroll down**, scroll again if **Refresh tools** is not visible, then click the visible **Refresh tools** control. Verify discovery in the next client context. Runtime activation is complete; client schema exposure and long-term benefit are separate.

At that earlier checkpoint, the proposal remained in the active directory with CLIENT_REFRESH_PENDING status; the gate was later resolved by user-confirmed refresh and the client-discovery acceptance documented below. Incomplete documents are not archived.


## User-confirmed refresh and Learning finalization

The user subsequently stated that Refresh tools is already completed. Build identity was saved at 05:40:25Z, official restart completed at 05:44:34Z and resident health was recorded at 05:47:25Z, all before that confirmation. The requested ordering was satisfied. No additional build/restart is required for this update. Refresh-click status is now user-confirmed; the failed automatic browser attempt above remains historical. The present chat still exposes the old cached controller schema without improvement/payload, so subsequent client discovery remains unverified. Do not ask the user to repeat the same refresh merely because this chat keeps an old snapshot.

Learning checkpoint455 (`learning-proactive-promotion-verified-recovery`) was reviewed with exact taskId/checkpointKeys on 2026-10-22T05:55:01.926Z; no-new-knowledge/complete=true, external linkage recorded. The28 earlier unrelated reviews remain untouched. The generic episode verifier cannot independently parse these ordinary test reports and remains unavailable; actual JSON test results/build/health are separate inspectable evidence. Canonical Memory continuity record f145cc16-a6ae-46c3-893d-b9785bf9f785 records the delivered scope and remaining client-discovery limit; the earlier working-state replacement was refused by MEMORY_PRESERVATION_REQUIRED and then corrected by resolving the old milestone before adding new items, without overwriting history.

Historical follow-up status at that time: CLIENT_DISCOVERY_PENDING. The subsequent controller session has now supplied direct discovery evidence below; local implementation and activation were already complete.

## Client discovery acceptance and closure — 22 October 2026

The **current client schema** declares `controller_learning.action="improvement"` and optional object `payload`, unlike the older cached chat descriptor. The new external episode started successfully in registered workspace `agent-core` with host task ID `ext-abc9dd1991b946dba49852f5cdd16b9e`. A real `controller_learning(action="improvement", taskId=<host ID>, payload={"operation":"inspect"})` succeeded with `items:[]` (valid empty state), a structured guide and `executionAuthority:false`. This is observed client-to-resident execution, not merely source or documentation parity.

Independent readback: `controller_learning(action="status")` reported the three `externalGuides` keys **improvement/procedure/evaluation**. Scoped `memory_v2_read(action="capabilities", scope.taskId=<host ID>)` reported **recallRepair** and **derivation** with read/write guides. These checks close **CLIENT_DISCOVERY_PENDING**. Refresh-click itself was user-confirmed, not directly observed by this assistant; the earlier uncertain browser outcome stays historical. No build, EXE publish, restart, Refresh tools retry, broad test or source mutation was necessary for this discovery-only closure.

The approved revision-2 proposal is **COMPLETED for its approved external-only scope**, while general held-out learning benefit, semantic equivalence and P03–P07 write-path replay beyond prior scoped verification remain unproven. The previously documented 142/142 tests, build, EXE hash and restart are historical implementation evidence, not new tests on this controller session. No Native change, Skill activation, release, commit, deploy or dependency installation occurred.

The human-readable proposal preserved decision history, evidence, limitations and completion date, and was moved to the archive after this task's Learning checkpoint **456** and exact-task review (`no-new-knowledge`, `complete=true`, 2026-10-22T06:19:03.710Z). Destination: [completed proposal](history-agent-core/Penguatan-Learning-Proaktif-Self-Improvement-dan-Memory.md) (from `docs/proposals/`); canonical Memory/Learning and original approval snapshot remain in their existing owners. Closure evidence: this host task ID plus report and `docs/CODEBASE.md`. The 28 older unrelated pending reviews are not altered. Archive filesystem readback confirmed `ARCHIVE_EXISTS=True` and `ACTIVE_EXISTS=False`; the archived Markdown SHA-256 is `880ab3e9ec247f09dff4180ab3b35b1eba3de899a6bcb639524d24aebc03295f`. The optional automatic checkpoint during the move was not captured (`quota-reached`); an explicit pre-closure project checkpoint `02e2634f-3d26-4123-b78b-6168cc01e3fe` had already been created. No rollback was needed. Current canonical Memory health reports available, `issueCount=0`; this closure episode has `pendingLearning=false` with `no-new-knowledge` decision. Generic episode verification still reports `unavailable`; the client/schema inspection is instead directly observed through successful typed host calls.
