# Proposal completion evidence

Date: 2026-10-29 (Asia/Tomsk)
Status: COMPLETED — zero proposal documents and zero dashboard review items independently verified.
Plan: [Proposal completion](../plans/Proposal-Completion.md).

## Initial state

Six substantive proposal documents and one Skill projection existed under `docs/proposals`; authenticated `/agent/proposals` returned five review items and no scan warnings. Native/Claude donor roadmaps were already closed and remain historical, not reopened scopes. Pre-existing worktree changes are preserved.

Native conversation `f95d1b42-ef97-40b6-832e-abee637830a8`, turn `937c47b7-057c-4c79-9491-1af3c65259f3`, request `all-proposals-opus-preflight-20261029-v1`, runtime task `4b5fc9d4-f125-4494-a963-62e4a2714b5d`: request persisted `claude-opus-5-5` and effort `max`; actual completed response remains pending.

## Harness2 P3

SkillService's common artifact summary now derives up to 32 `SKILL_REFERENCE_MISSING` warnings from admitted package bytes. Markdown links and backtick literal `references/`/`scripts/` paths are checked; remote URLs, anchors, globs and outside paths are excluded. Nothing is opened or executed, digests remain unchanged, and warnings do not reject import or staging.

`rtk npm test -- --run tests/skill-structural-warnings.test.ts --maxWorkers=1`: original service failed 3/3 because warnings were absent; final service passed 3/3. Tests cover folders/archives, import/inspect/staging, present/absent references and bounded output. One staging fixture initially failed `SKILL_REVISION_EVIDENCE_REQUIRED`; supplying its required `source:warning-fixture` corrected the fixture without changing the guard. Existing `skill-reference-read` passed 3/3 in the preceding combined run. Build, resident and installed-catalog census remain pending.

## Harness2 P4/P5

Shared handoff and review guide now separate verified outcome from confounded attribution when components change together without an isolated contrast. Lessons supported only by that evidence remain awaiting-verification. `docs/Capability-Index.md` maps eight harness surfaces, existing owners and authorization boundaries. Handoff/bootstrap tests remain pending.

## Incident Skill

Exact proposal `skill-proposal:66f03991dc32f37714f8088d98a5a4f6`, revision `sha256:e64a9f46c3598399625d71cba2acdc23db7611470eecfc1e007e4565651e4ef7`, was approved/build-and-activated through the authenticated allowlisted controller and SkillService. Artifact `sha256:479334c2c90b1bbb16c6be2ef81af60ada010c3e52768fecc315e561c245dc74` read back through `skills(inspect)`: one file, 3,308 bytes, allowedTools empty, matching proposal ID/revision. Routing and grounded postmortem acceptance remain pending.

Initial approval failed `SKILL_PROPOSAL_CONTROLLER_NOT_AUTHORIZED`. `episode/status` then returned current:null after the headerless transport crossed its hourly session bucket. Credential `59a9447b-06fc-4961-a533-1bdc03213222` retained live allowance, no expiry/revocation; `canApproveSkillProposal` returned true. Reconnecting the same taskKey returned the original episode/Memory linkage; unchanged exact approval succeeded. No auth source or allowance changed.

## Open work

Historical checkpoint: these items were pending when this section was first written. Later sections below supersede it. No release, dependency installation, commit or push.

## Verified implementation milestones

- Inquiry: optional strict 4 KiB extension on existing immutable decisions, append-only declared findings, parent task/workspace and alternative-ID validation. Exact-task read projection, no duplicated store/checkpoint, no extra model/recall call. Existing conversation detail HTTP/launcher route carries it; synchronous service API is preserved.
- UI: closed details panel, escaped source text, foreign-task suppression, unresolved/unavailable/truncation visible, goal verification separate from declared findings.
- Decision/controller/durable continuation/projection: **71/71 passed** in four suites. Later structural/projection run with omitted-reference coverage: **7/7**.
- Chat service/authenticated HTTP: **24/24 passed**. UI NativeChatReliability: **13/13**. Auth/Skill discovery: **10/10**. Core build, UI build and UI typecheck passed. A build-detected TS18048 closure narrowing issue was corrected and rebuilt. Full suite/model-quality benefit is not claimed.
- Grafel getConversation impact identified service/store/durable-continuation consumers; exact source and focused tests are final authority. Its generic no-coverage label is contradicted by the direct transport/recovery checks above.

## Harness2 F1-B adapted scope

Native guidance states common read/coverage rules once and shortens three route descriptions, preserving the complete mind-control gate, identical structured descriptors/read requests, simple-turn exemption, selective references and grant boundaries. External guidance and the full contract handshake are unchanged. Measured guidance only: **4,145 → 3,041 bytes (26.63% smaller)**, recorded in [Native-Guidance-Budget.json](Native-Guidance-Budget.json). Six guidance tests passed; combined bootstrap/handoff regression is running. No latency, total-token, cost or compliance gain is claimed.

## Retention measurement — conditional score replacement is NO-OP

The repeatable read-only script resolves validated canonical activation, parses note bytes and compares feedback bound to current revisions. [Memory-Retention-Review.json](Memory-Retention-Review.json): **256 notes, 4,697 retrievals, top-ten share 23.845%, zero current-revision explicit feedback**. The earlier live observation had 4,693 reads; the persisted snapshot reflects intervening legitimate reads.

Replacing counts with available helpful-only feedback changes zero legacy stale memberships but 26 default-confidence forgetting memberships. This is a counterfactual with fixed salience/confidence, not verified causal outcome. Eight recent retrieval diagnostics also reported zero assessed feedback/receipts and observational-incomplete status. Concentration alone does not establish harmful bias; empty feedback cannot justify outcome weighting. Existing scores and advisory curator are retained; measurement mutates no canonical record and discloses no note identities/content.

## Incident acceptance

SkillService validates the approved digest, with empty allowedTools; discovery ranks the incident query first. Lint on 47 active artifacts reports zero parser errors/dangling Markdown links. Incident notes are advisory: no UPSTREAM.json for a local artifact, singular Trigger/Non-trigger headings recognized by discovery, and managed metadata outside references. Non-triggers are distinct from siblings. [Incident-Postmortem.md](Incident-Postmortem.md) applies the workflow to the recorded HTTP forwarding incident, with sourced/unknown timestamps, contributing conditions, impact, actions and runbook. It does not claim this later-authored Skill caused the old recovery. Benefit remains unmeasured.

## Native partner recovery

First broad preflight: 24 observed Opus 5.5 calls, requested/persisted max effort; spent tool iterations and returned resumable/provider-wait without an answer. Main inspected the checkpoint (no pending mutation), cancelled through the bridge, and confirmed stopped. No budget reset/replay. Second bounded review: request `all-proposals-r8-review-20261029-v1`, turn `26024c6e-63d7-4580-8676-877ce19efd25`, task `ac0816e6-1fd2-42d6-a25e-f437aa42e5c8`, same model/effort, final result pending. Do not claim the first preflight completed.

## R8-S2 exact cleanup

Seven abandoned atomic temporary files (2026-10-08 through 2026-10-21), **20,528,749 bytes**, had no live original writer PIDs (18484/1004/11608/16316/21068/23312/5440). The atomic owner creates fresh PID/UUID names, never reopens these old files; current canonical writers use different names.

Existing checkpoint **90a0e017-5de6-40a3-bb15-3c77748ba5ea** captured all bytes, including partial/empty JSON. Manifest readback matched 7/7; independent source/blob SHA256 matched. Immediately before deletion Main rechecked hashes, sizes, exact learning-directory confinement, symlinks and absent owner PIDs. Nonrecursive literal Remove-Item removed **7/7; 0 remaining**. Canonical state/last-good/corrupt snapshots/episode archives were excluded. Recovery bytes remain in existing checkpoint blobs; no net disk-space saving is claimed.

R8-S1b measurement: 700 episodes/204 distinct heads; 77 reviewed/nonpending/notclosed idle ≥7 days. Excluding every referenced head leaves 25 episodes/226,924 bytes of 6,493,125 (**3.49%**), below the stated 10% stop threshold. No live episode was closed/archived. Broader eviction requires additional session-activity and safe-reconnect semantics. Native's independent disposition is pending.

## Resident activation and Native disposition

One official restart activated the verified launcher, SHA256 `b93566b06b54d8c9e379e0377065cbc16d491d58e640e37dccdd067f17c8b78f`. The original EXE is retained at `runtime/launcher/backups/launcher-c14732e9430b4183869076f249461e62.exe`. Restart's 60-second readiness observation timed out; an independent later health read returned Core PID **5748**, started **2026-10-28T19:44:42.709Z**, `build.stale=false`, canonical Memory available with zero issues. No second restart was dispatched. A new controller handshake acknowledged the unchanged contract digest; canonical Memory was inspected and the same Learning/Memory task reattached.

Resident `skills(list)` returned **47 artifacts, zero structural warnings**, including the exact incident digest above. Combined guidance/bootstrap/handoff tests passed **11/11**. Launcher Release self-contained publish, Core build, UI typecheck/build and release-intent validation passed. Source/build hashes were checked before activation; no global connector refresh is claimed. This Codex client's available schemas still expose the required existing tool names and task-scope fields; inquiry is carried inside the existing decision payload.

Native R8 review completed using observed `claude-opus-5-5`, persisted effort `max`: eight completed calls, five tool calls, no tool failures, finalized Learning/no-new-knowledge. [Native-Proposal-Review.md](Native-Proposal-Review.md) preserves the actual response and its limits. Native reviewed Main's bounded measured/source packet rather than independently opening every source file. It recommends **NO-OP R8-S1b**, including the strongest contrary argument and safe-reconnect falsifier. Main accepts this evidence-gated disposition. There is no automatic reopen, background benchmark or future authorization created by its suggested flip condition.

## Final inquiry and Skill acceptance

Additional required external-scope/salience/decision/projection suites passed **65/65** (overlap with prior runs; totals are not added). Native inquiry turn `d17ae8e4-612f-435e-ab36-93d1c98cf3df`, task `179816cc-fc96-4a9b-ad41-436cf58fd0e3`, finalized with observed Opus5.5, max effort, eight model calls, five host-counted ordinary tool calls and zero failures. Native self-reports ten tool actions when internal strategy/finalization actions are included. Learning is complete/no-new-knowledge; verification remains unavailable. [Its actual review](Native-Inquiry-Resident-Review.md) preserves the distinction between a tool accepting a finding and an independently verified goal.

[Resident-Proposal-Acceptance.json](Resident-Proposal-Acceptance.json) independently checked authenticated HTTP, exact latest-turn task binding, one inquiry record/two declared findings, **935-byte payload**, controller-declared attribution and goal not established. Main also read the durable Learning bytes. The implementation projects from records, addressing Native's concern about absent inquiry fields in evaluations. Negative contract tests cover unknown findings, UTF-8/count limits, scope and immutability. A raster of the owned launcher window confirms it renders; UI Automation exposed only containers, so manual WebView panel interaction is not claimed. DOM tests plus resident transport provide its bounded interaction/serialization acceptance.

All ten latest UP-09 reference revisions were promoted sequentially through SkillService, after diffing admitted package bytes: added references and SKILL pointer/adapter metadata only, no removed file, original license bytes retained, empty allowedTools. [Skill-Reference-Promotions.json](Skill-Reference-Promotions.json) records all baselines/candidates and **10/10 matching resident readbacks**. The two superseded security/debug candidates and revision history remain historical; no purge. `tests/skill-reference-deltas.test.ts` passed **29/29**. `mind-control` source SKILL.md now matches selected v13+trust candidate; its old entrypoint is preserved in checkpoint `bf881e92-153e-41e0-ba84-e6541b7c03e5`, historical source refs/evals retained. Reference activation is not measured Skill benefit.

### D9 caller regression and bounded correction

After synchronizing the source entrypoint, targeted callers found two failures: strict discovery does not recognize v13's `Triggers & Domain Scope` heading, and the old revision-10 test still demanded a single fragment despite the explicitly paged v13 body. The active v13 baseline already had the nonstandard heading; propagation exposed it to source/package tests. Main should have checked these callers before copying the entrypoint, and corrected the omission here.

The correction uses the existing canonical source: exact `Triggers` heading with the two mandatory current-contract gates, original domain examples under their own heading, exact routine non-coding exclusion, and removal of a decorative separator being parsed as another exclusion. No reasoning body or license is discarded. The delivery test now checks complete contiguous digest-bound pages, every serialized response ≤8,192 bytes, exact reassembly and declared boundaries. An intermediate run correctly caught the separator as an extra non-trigger (31 passed/2 failed). Candidate `528c52df…` was staged but never activated. Final tests/promotion are recorded below when observed; the original ten-promotion ledger remains historical lineage.

**Final recovery:** all three suites passed **33/33**. Canonical source was staged/promoted as `sha256:8c201ebf5425fac94871de2bd9a81eae76a75e0d90a70e83d209013aebaa4795`, baseline `c6968e2f…`, 20 admitted files, empty allowedTools. Staging includes the source's existing historical references; it is not a fresh external copy. Resident inspect matches that digest; discovery reports **declared**, exactly two mandatory triggers and one routine exclusion. Complete read delivered 9,389 body bytes over offsets **0→7,814→null**, with the v13 body/trust reference preserved. This is one corrective promotion after the ten original UP-09 promotions, all recorded separately in the ledger. No code runtime restart was needed for this catalog-owned activation.

## Performance contract and controlled-experiment disposition

- **Workload:** the inspected external state contains 700 episodes; the selected safe archival subset represents 3.49% of its serialized bytes. Chat evidence derives at most three decisions and emits at most 4 KiB from the existing Learning owner. Skill warnings scan admitted package bytes; no referenced script/file is executed or opened.
- **Objective:** reduce redundant guidance bytes and bound added read payload/work without changing authority, scope, recovery or semantic truth. The archival proposal's own 10% threshold is the decision gate; no invented p99 or latency target.
- **Observed:** guidance bytes decrease 4,145→3,041 for identical structured routes; no full-load CPU/I/O profile, cost or latency comparison was collected. The projection adds one existing-state read on conversation-detail retrieval and no model or recall call. A separate persistent cache would add invalidation complexity without measured need.
- **Rival/flip:** primary Learning writes may remain expensive; excluding live heads leaves most bytes untouched. Reconsider only in an explicit task with measured safe savings or a representative latency bottleneck and independently checked reconnect semantics.

AR-P1's eight controlled-experiment rules are mapped to existing owners in Lab R7. They are applied here as bounded verification discipline: freeze candidate/schema fixtures before tests, keep pre-edit checkpoint/lineage, retain failed fixtures/builds/interrupted Native attempts, preserve all negative results, and separate measured bytes from unknown model benefit. This is a completed design/application scope, **not a claimed 12-pair or 32-run model experiment**. HS-P0's stop rule applies to the selected current failures: the Native preflight budget exhaustion, external hourly task reconnection and historical HTTP authorizer incident do not supply two independently verified tasks for one matched failure family with a frozen common oracle. No optimizer or DARC extension is justified from them. R6-E is rejected for this queue; R6-F/R7/HS execution beyond deterministic feasibility is stopped for insufficient evidence rather than left as an active HOLD.

## Harness2 remaining scope decisions

F1-C was a potential follow-up, explicitly not proposed for implementation in R2. Splitting the external contract would conflict with the current complete-contract bootstrap requirement and has no reviewed instruction-delivery contract. This queue resolves it as **not selected/no source change**; the complete handshake is preserved. F1-B is the bounded guidance simplification described above, not conditional removal of reasoning gates.

P2's explicit falsifier is met: the inspected evaluator receives `ExternalEvaluationObservation` through internal options, but the external coordinator has no independent per-arm attempt collector. Source references in tests are fixtures, not live host observations. Adding declaration-supplied attempts would counterfeit independence. **NO-OP P2**; `benefitVerdict=withheld` and existing comparability checks remain. P3/P4/P5 are implemented/documented and verified as described above. No remaining Harness2 implementation request is silently carried into history.

## Final closure and action ledger

[Proposal-Queue-Closure.json](Proposal-Queue-Closure.json) records independent authenticated HTTP and recursive filesystem readback: **0 proposal documents, 2 guides, 0 dashboard items, 2 dashboard guides, warnings=[]**. All seven readable proposals are in `docs/history-agent-core`; canonical Skill/Learning records and historical decisions remain with their owners. The seven canonical Skill proposals are approved or implemented, with no proposed/pending item. This closes the selected engineering/no-op/historical scopes; every research idea is not represented as an implemented feature.

[Proposal-Archive-Ledger.json](Proposal-Archive-Ledger.json) records source/initial archive SHA256 equality **7/7**, final hashes after link repair, and the byte-preserved initial queue-guide copy. Forty-two Markdown destinations were repaired across 16 documents. All **105 local links** in moved documents, the historical queue guide and active README resolve. The active folder retains only README and REVIEW-GUIDE; empty existing directories remain. The first count assertion compared Windows backslash paths against slash guide names; platform-separator normalization corrected the checker without another document move/deletion. The corrected assertions passed and were read back.

- **Source:** optional inquiry/findings and bounded projection; existing chat service/HTTP/host/UI path; SkillService reference warnings; compact Native guidance; confounded-attribution handoff. Meaningful tests/fixtures, CODEBASE and capability-owner mapping updated.
- **Skills:** incident approved/catalog-active; ten UP-09 reference promotions plus one corrective mind-control promotion. [Promotion lineage](Skill-Reference-Promotions.json) retains exact digests, failed stage and readbacks. Source lint42/catalog lint47 returned zero parser errors/dangling links; the later routing correction passed33 tests and source/catalog digest equality. Existing history/evals and superseded stages remain.
- **Cleanup:** seven exact abandoned Learning temp files removed after owner/hash/checkpoint checks; recovery bytes retained. No episode, pending review, Memory note, canonical proposal record or backup was removed.
- **Processes:** one official restart; Core PID5748 healthy/stale=false, launcher hash and old EXE backup verified. First broad Native attempt cancelled after budget exhaustion; two bounded Opus5.5/max turns finalized. No new background monitor/service.
- **Installation/configuration:** no dependency download, provider-default change, global tool change, auth allowance or grant expansion. No release, version bump, commit or push. Pre-existing worktree edits preserved.
- **Verification:** focused backend/controller/recovery/transport/UI tests; Core/UI build/typecheck; launcher publish; release-intent check; source/catalog checks; live HTTP/health; archive hashes and final queue assertions. Final path policy508 authored files, structure471 directories, no documented exception. Overlapping test counts are not summed.
- **Learning:** checkpoint `complete-all-proposals-20261029-final-recovery`, reason verified-recovery, reviewed **complete/no-new-knowledge**; episode readback pendingLearning=false. Native Learning complete. Episode goal-verifier status remains unavailable; feature/queue outcomes have separate inspectable checks. No new Skill/procedure proposal was manufactured.

### Applied workflows and limits

Replica `replica-recon` adapted verified upstream/source inventory and bounded flow/feature mapping; no donor code copied. Agent-skills `planning-and-task-breakdown` supplied acceptance/dependencies; `incremental-implementation` supplied verified schema/transport/UI slices. Mind-control separated facts, rivals and falsifiers; tool-output-trust preserved declared-versus-verified and partial-versus-complete distinctions. Performance-oriented-software-engineering justified measured no-ops and bounded work; runtime-activation-audit checked hashes/backup/outer health; incident-postmortem produced the sourced historical runbook. Exact active Skill action receipts were recorded. Causal benefit remains unmeasured.

Not run: full repository suite, a 32-run model-quality pilot, representative latency/cost profiling, production rollback exercise or manual WebView panel interaction. UI acceptance uses DOM tests plus resident transport; the rendered launcher was inspected. Existing shell/process guard limits and inconclusive historical benchmarks remain in their archives. These limits create no active proposal or automatic future work.

An additional default `git diff --check` reported 621 CRLF-related trailing-whitespace diagnostics across the shared dirty worktree. Rechecking with the normal whitespace rules plus the command-local `cr-at-eol` setting passed with zero issues. No persistent Git configuration or unrelated line endings were changed.

## Readable archives

- [Harness2 donor](../history-agent-core/Harness2-Donor-Proposals.md)
- [Evidence-gated harness lab](../history-agent-core/Evidence-Gated-Harness-Self-Improvement-Lab.md)
- [Investigation and decision quality](../history-agent-core/Kualitas-Investigasi-dan-Keputusan-Agent-Core.md)
- [Memory retention review](../history-agent-core/Memory-Retention-Outcome-Weighted-Review.md)
- [Claude ecosystem donor](../history-agent-core/Claude-Ecosystem-Donor-Proposals.md)
- [Native architecture R4 closure](../history-agent-core/Integrasi-Arsitektur-Native-Agent-Core.md)
- [Incident postmortem Skill](../history-agent-core/incident-postmortem.md)
- [Prior review queue — historical](../history-agent-core/Proposal-Review-Queue-History.md)
