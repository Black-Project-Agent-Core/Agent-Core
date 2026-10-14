# Reef - Source-Qualified Steal/Use Integration Plan

> Status: COMPLETE — RF-P1/RF-P2/RF-P3 CLOSED; RF-P3 LIVE-ACTIVATED / INSTALLED-DIST VERIFIED; REFERENCE RETIRED.
> Date: 2026-09-23.
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/04-reef`.
> Pin: `5ffac29acddeda199eca369aaf7edf837f642a80`.
> Disposition: RETIRED / DELETED after final zero-value and dependency/process/workspace safety census; no Reef training/inference/deployment runtime is installed.

## 1. Goal and native ownership

Adapt Reef's terminal failure semantics to Agent Core's existing LSP connection: once a transport is demonstrably unusable, outstanding and later requests must observe the same terminal state instead of treating an alive process as a usable pipe. Preserve the current bounded recovery owner and distinguish transport failure from ordinary LSP/business errors.

Target the native `LspConnection` and its existing `LanguageServerSession`/`SemanticIdeService` callers. Do not import Reef's executor framework, Ray, PyTorch, Slime, PostgreSQL, inference server, training algorithms, artifact repository or deployment lifecycle. This is a small TypeScript behavioral adaptation, not a new executor, scheduler or machine-control gate.

## 2. Exact evidence

| Source | Inspected semantics |
| --- | --- |
| `reef/runtime/executor/failure.py::FailureState.check/fail/close/track` | First terminal failure is retained; pending futures fail; later work is refused; late results cannot reverse the failed result; normal shutdown is separate. |
| Same file, `register/_notify` | Observer identity is deduplicated; an observer exception does not change executor state. |
| `tests/reef_service/test_executor_failure.py` | Covers terminal failure, once-only notifications, pending/queued rejection, late completion, ordinary scorer errors and normal teardown. Read, not run. |
| `reef/observability/operations.py` | Monotonic elapsed time, once-only finish and non-consuming snapshots; relevant evidence semantics, not a second metrics service. |
| `reef/core/artifact_ref.py` and `reef/artifact/release_chain.py` | Separates content/release/runtime-load identities and expected-head transitions. These are not permission to install a deployment controller. |
| `reef/core/batches.py` | Typed batch/trajectory groups and explicit absent training fields. Model-training scope is not a native Agent Core consumer. |
| Native `src/semantic-ide/protocol.ts` | Stdin errors reject current pending requests but do not latch the connection as terminal; state/request admission still use child exitCode or socket state. |
| Native `src/semantic-ide/service.ts::withRecovery` | Already owns one replacement attempt for a listed set of transport/fatal errors; `SERVER_PIPE_ERROR` is not listed. |
| Native `src/semantic-ide/language-server.ts` | Already owns provider sessions and capability checks. Do not create another owner for provider lifecycle. |

Source-derived counterexample: a provider's input pipe errors while its process has not exited. Current pending requests receive `SEMANTIC_IDE_SERVER_PIPE_ERROR`, but a subsequent call can still satisfy the process-running check and attempt another write. A live process is not sufficient evidence of a healthy transport. No provider was killed, fault-injected or restarted during this audit; this is not a newly reproduced production incident.

Generation fencing is an additional native requirement, not a claimed Reef feature: if a connection object can acquire a new transport, delayed callbacks from the old transport must not reject new pending requests or append into the replacement buffer. Confirm the exact reuse paths in current source before implementing that part.

## 3. RF-P1 â€” Terminal transport failure and coherent pending requests

**Historical implementation checkpoint (superseded by the 2026-09-24 closure below): APPROVED â€” IMPLEMENTED â€” TARGETED VERIFIED â€” NODE ACTIVATION PENDING at that time.**

Proposed exact owners:
- `src/semantic-ide/protocol.ts` â€” per-transport terminal state and request settlement.
- `src/semantic-ide/service.ts` â€” only if the existing bounded recovery classification needs a new pipe-failure category.
- `src/semantic-ide/language-server.ts` â€” only for existing state propagation if required; coordinate with Serena S7-P1 rather than competing edits.
- `tests/semantic-ide-terminal-failure.test.ts` plus the existing protocol tests.

Design:
1. Each started connection generation has one terminal transport outcome, initially absent. Normal close and confirmed failure are distinct. Preserve the first meaningful failure; do not replace it with later cleanup noise.
2. A narrow failure helper rejects and clears that generation's pending requests and timers exactly once. Requests arriving after failure reject immediately without another write; late responses are ignored.
3. Ordinary JSON-RPC errors, ContentModified responses, missing capabilities and domain failures do not poison the entire transport. Retain the current method allowlist and retry limits.
4. When replacing a transport within the same object, bind callbacks/buffers/pending ownership to that transport generation. Do not reset shared state in a way that lets an old exit/error event affect a new connection.
5. Normal close marks the transport closed and settles pending work; shutdown/exit notifications must follow one explicitly defined closing path. No deadlock while trying to send shutdown through an already-refused generic request method.
6. Cleanup is ownership-scoped. Never kill an external TCP provider or unrelated Node process. Existing captured process-tree ownership remains authoritative.
7. Any new recovery category uses the existing at-most-one replacement path; no autonomous retry loop. Do not add automatic replay for a mutation whose prior completion is unknown. Inspect all existing `withRecovery` call sites before changing classification.
8. Failure messages and tracker evidence remain bounded and redacted. No new full stderr/body export, global failure registry, Memory write or health-poll side effect.

Alternative considered: add only `SERVER_PIPE_ERROR` to the recovery string test. Rejected as insufficient by itself: later requests still cannot distinguish an unusable transport, and old callbacks/timers may remain. Conversely a generic multi-executor failure service would be unnecessary architecture. Prefer a small state helper local to the current connection.

### Implementation tasks after selection

- [x] RF1.1 Reread protocol/session/recovery and exact production callers; Grafel reported current but missed new entities, so exact source/import scans are the final structural authority.
- [x] RF1.2 Added an isolated fixture/test that emits a stdin pipe error while the provider process remains alive; no live provider was fault-injected.
- [x] RF1.3 Implemented first-failure latching and once-only pending settlement while retaining ordinary LSP errors and ContentModified behavior.
- [x] RF1.4 Added per-transport generation ownership; stale callbacks/responses are fenced from newer generations and normal close clears terminal state.
- [x] RF1.5 Added `SERVER_PIPE_ERROR` only to the existing bounded one-replacement recovery classifier; no new replay loop or mutation policy.
- [x] RF1.6 Final targeted matrix is 70/70 PASS; selected compile exits 0 and candidate smoke proves terminal failure remains latched. Live activation remains a separate stage.
- [x] RF1.7 CODEBASE/plan/memory and combined pending patch intent are synchronized; no release, restart or deployment occurred.

### Proposed acceptance matrix

| Case | Required observation |
| --- | --- |
| Pipe fails while child remains alive | All pending requests fail and later requests reject without another write. |
| Several concurrent requests | Every request settles once; pending timers are cleared. |
| Late successful response | Cannot reverse a terminal failure or resurrect a removed request. |
| Second failure / observer failure | Original reason remains authoritative; no double settlement or observer-controlled state. |
| JSON-RPC domain error | Only that request fails; connection remains usable. |
| ContentModified | Existing allowlisted behavior and bounded attempt count remain intact. |
| Normal shutdown | Closed is not an executor crash; no shutdown deadlock or invented success for pending calls. |
| Replacement generation | Old callbacks cannot corrupt new request/buffer state. |
| Owned stdio versus external TCP | Only owned processes are eligible for existing cleanup; external provider is never terminated. |
| Uncertain mutation outcome | No new blind replay policy is introduced. |

Suggested bounded verification after approval:
```powershell
& './runtime/node/node.exe' './node_modules/vitest/vitest.mjs' run tests/semantic-ide-terminal-failure.test.ts tests/semantic-ide-protocol.test.ts tests/semantic-ide-protocol-hardening.test.ts
```

Host-limited tests remain explicitly unverified/skipped, never silently accepted. No model, GPU, database, network provider or full Reef install is required for the proposed fixtures.

Rollback: restore only the scoped native connection/recovery edits and selected artifacts from their future backup. Preserve unrelated diagnostic/text-position changes, all evidence and current provider installations. Never revert the whole project or legacy Git history.

## 4. Family disposition ledger

| Family | Current decision |
| --- | --- |
| Executor terminal failures | RF-P1; compatible local concept with a demonstrated native pipe-state gap. |
| Executor multiprocess/Ray/placement/scheduler | No distributed executor owner is requested. Do not import a competing runtime. |
| Operation metrics | Useful reference; native tracker and SecondSight invocation proposals own any selected observability. No duplicate counters/service. |
| Artifact identity/repository/release chain | Existing release manifests, candidate hashes and activation provenance already own product identity. Live-weight load semantics have no model-serving consumer here. |
| Commit log/recovery/publication/deployment | No training transaction or deployment coordinator requested; existing explicit release/activation remains unchanged. |
| Core batches/reports/trajectories and record2dataset | No ATIF/training ingestion consumer or authority to ingest private agent traces. Native SIE reports remain the evidence owner. |
| Train/inference/scenario/recipe/service | Domain runtime; do not install GPU trainers, inference services, model APIs, SQL stores or scenario loops. |
| Harness, connector, sandbox and surface | No replacement of direct MCP machine control or the existing partner transport. Generic capabilities are not adopted merely for feature parity. |
| Recipes/tutorials, including GEPA and agent evolution | Task/model-specific integrations, not evidence that native Agent Core needs an optimizer. Existing ASI coverage port is not reopened. |
| Docs/assets/CI/container/packaging | Reference provenance and test design only. No Docker, UI or development toolchain installation. |
| `third_party/cordis`, `third_party/reef-client` | Gitlinks present but directories empty; their implementation is NOT audited. No submodule fetch occurred. |

## 5. Source integrity, license and limits

The local LICENSE is Apache-2.0, copyright Zhipu AI. A future substantial port must preserve applicable notices and mark adaptations. Do not infer licensing of the empty linked repositories from the parent license.

Census: 1,753 regular tracked files / 16,909,105 working-tree bytes excluding Git, plus two gitlinks. There are 936 structurally indexed code-suffix files including recipes/tests; this is not 936 semantically reviewed runtime modules.

Gitlinks: `third_party/cordis` at `2ceea231802cc23892b4ad10012c55c7dd4982d4`; `third_party/reef-client` at `a008cc8320e5e4d537fed5415618e3231bf5ad36`. Both directories were empty. Their absence is not filesystem corruption or proof of worthlessness, and no behavior from them is claimed.

Historical pre-activation evidence remains under `runtime/tmp/four-ref-grounding-20260923/` and `runtime/tmp/five-plan-adoption-20260923/`. At that checkpoint RF-P1 was implemented and targeted/candidate verified while active Semantic IDE dist still differed. That activation-pending boundary is now superseded by the 2026-09-24 closure below. No Reef runtime, submodule, model/trainer or dependency was introduced; the reference remains retained.

## 6. Post-RF-P1 residual source census — RF-P2 proposal — 2026-09-23

**Status: RF-P2 IMPLEMENTED — TARGETED VERIFIED as an explicit source cutover helper. Reference retained pending any future zero-value census.** RF-P1 remains separate.

### RF-P2 — expected-active compare-and-swap guard for candidate cutover

Source basis: Reef's artifact repository requires an observed `expected`/`expected_parent` when advancing current or installing a checkpoint; a concurrent head move raises `ArtifactConflict` instead of silently losing an update. `tests/reef_service/test_reef_concurrency.py` explicitly exercises stale expected-head rejection, and staged-release backends carry the same expected-parent contract.

Native comparison: Agent Core release metadata uses scoped transaction/rollback and provider provisioning verifies archive hashes, but current Agent Core source has no generic candidate→active runtime cutover primitive that binds installation to the exact active artifact hashes observed when a candidate was qualified. Search of owned source found no compare-and-swap/expected-active guard for `dist` candidate installation. Recent activation work therefore relies on task-local hash checks and manual scoped copy discipline rather than a reusable stale-candidate refusal contract.

Proposed owner: an explicit candidate-cutover helper/CLI under the existing release/runtime tooling, not a deployment daemon. Input must name a candidate manifest containing relative artifact paths, candidate hashes and the **expected active state** (expected SHA-256 or explicit expected-absent for each replaced target). Before the first write, re-read every active target with identity-safe/no-follow semantics and refuse the entire cutover on any mismatch. New targets must still be absent when `expected-absent` is declared.

After the compare-and-swap precondition succeeds, stage bounded scoped backups, copy only declared artifacts, fsync/readback/hash-verify each target, then emit an immutable installation result. On write/readback failure, rollback only artifacts changed by that cutover and verify rollback hashes. Never infer permission to restart Core, apply a release, alter package version, or activate providers; restart remains a separately authorized step. No generic repository service, model artifact store, Git-LFS backend or training publication state machine is introduced.

Implementation after selection: RED tests for stale active hash, expected-absent collision, candidate hash mismatch, mid-preflight replacement, partial write/readback failure and exact rollback; positive fixture proves only declared files change. Reuse existing file identity/atomic-write primitives where compatible. Record qualification manifest identity separately from install evidence and retain current source/candidate/installed truth labels.

Disposition: RETAIN for RF-P2. Reef training/inference/scenario/record2dataset/Ray/service stacks remain wrong-owner; marker/recovery logic is model-serving specific; generic operation metrics remain owned by Tracker/SecondSight-derived evidence. The two empty gitlinks remain unaudited and are not fetched merely to expand scope. Evidence: `runtime/tmp/five-ref-regrounding-20260923/`.


## 7. RF-P1/RF-P2 installed/operational closure — 2026-09-24

**COMPLETE — RF-P1 LIVE-ACTIVATED / INSTALLED-DIST VERIFIED; RF-P2 OPERATIONALLY VERIFIED.** Active `dist/semantic-ide/protocol.js` and `service.js` match the current-source build, and installed-dist terminal-failure tests pass **3/3**. RF-P2 then performed the real Agent Core cutover twice with expected-active compare-and-swap preflight: first 9 JavaScript artifacts, then their 9 sourcemaps. Both cutovers returned `ok:true`; final readback reports **18/18 hashes match** and no rollback was required.

RF-P2 still has no authority to restart Core, apply a release, change versions, or deploy. Backup/result paths and live health are recorded in `docs/Six-Plan-Activation-20260924.md`.
## 8. Post-RF-P2 source-first re-grounding — RF-P3 proposal — 2026-09-25

**Status: RF-P3 PROPOSAL — USER REVIEW REQUIRED — NO IMPLEMENTATION. Reference retained.**

The fixed Reef checkout remains `5ffac29acddeda199eca369aaf7edf837f642a80`, with 1,755 tracked paths at the current pin and only the temporary `.grafel` audit marker making the checkout appear dirty. The isolated Grafel workspace reached `current`; exact source and Git history remain final authority.

### RF-P3 — effect-proof evidence for verified Learning outcomes

**Source basis:** Reef commit `080c5bec` changes `reef/recipe/reefine/agent_rules.md` and `reef/recipe/reefine/evolution.py` so a successful call is not treated as proof of requested behavior. It requires an observed consequence that differs when the behavior is correct, and treats an unexercised core branch as uncovered rather than verified.

**Current native gap:** Agent Core `LearningReviewCoordinator` requires evidence refs for verified candidates and optionally validates metric evaluation envelopes, but an ordinary verified durable fact/operational reflection can still carry only generic evidence refs. `LearningDecisionEvidence` fingerprints those refs but does not distinguish “the call completed” from “the claimed effect was observed.”
**Proposed owner:** extend the existing Learning candidate/evidence contract only. Do not add a second verifier service, execution gate, retry controller or memory store.

Proposed additive `effectEvidence` declaration:
- `claimType`: `behavioral-outcome`, `source-state`, or `metric-evaluated`;
- `status`: `observed`, `not-exercised`, or `unavailable`;
- one to sixteen safe evidence refs plus a bounded description of the expected and observed consequence;
- optional environment/branch label describing what was actually exercised, without transcript or secret content.

For a candidate explicitly described as a verified behavioral outcome, durable capture should require `effectEvidence.status=observed`. `not-exercised` and `unavailable` stay proposals. Existing source facts and metric-evaluated claims retain their current evidence owners.
This rule applies only at durable Learning capture. It does not route, retry, approve or block ordinary MCP work.

Implementation after selection:
1. Add negative cases where execution-completion evidence exists but the claimed behavioral consequence was not observed.
2. Add positive cases for explicit state readback and targeted verification evidence while retaining existing safe-evidence validation.
3. Preserve legacy non-behavioral facts and existing `LearningEvaluation` semantics rather than forcing synthetic effect fields.
4. Record only bounded effect status/digests in existing decision telemetry; raw outputs remain outside durable Learning metadata.
5. Update the controller protocol so host-unavailable branches remain visibly unverified and can carry an operator exercise instruction instead of being promoted.

### Final family disposition for this Reef pin

- RF-P1 terminal transport failure and RF-P2 expected-active CAS remain closed.
- deploy signal/grace handling is not transplanted: Node Core already owns graceful close and the native launcher owns process lifecycle; no demonstrated Agent Core deadlock justifies another shutdown controller.
- E2B sandbox recovery, distributed executors, training/inference, recipe evolution, model binding, reply budgets, service/deployment and connector heartbeat behavior remain wrong-owner or lack a native consumer.
- operation metrics remain Activity Tracker territory; artifact publication remains release/candidate-cutover territory.
- no additional current-fit mechanism was found beyond RF-P3 in this fixed checkout.

**Disposition:** RETAIN for RF-P3 review. No Reef runtime, submodule, model/trainer or dependency is installed by this planning pass.
## Revalidation — 2026-09-25

Source-first recheck at clean pin `5ffac29acddeda199eca369aaf7edf837f642a80` reconfirmed RF-P3 as the only remaining current-fit residual in this fixed checkout. Reef's review source still distinguishes exercised calls from observed behavioral consequences and marks unexercised branches uncovered, while current Learning contracts still have no `effectEvidence` declaration. No additional non-duplicate current-fit mechanism was found after excluding RF-P1/RF-P2 and wrong-owner training/inference/distributed/deployment families.

**Disposition remains: RETAIN — RF-P3 PROPOSAL ONLY / USER REVIEW REQUIRED / NOT IMPLEMENTED.** No Reef runtime/submodule/model/trainer dependency was installed and no product test/build/restart/release or reference deletion occurred.

## 9. RF-P3 approved implementation qualification — 2026-09-25

**IMPLEMENTED — TARGETED + STAGING-COMPILE VERIFIED — ACTIVE DIST ACTIVATION PENDING.** Current source already contained the selected effect-proof Learning contract when execution resumed.

The native `effectEvidence` contract distinguishes `behavioral-outcome`, `source-state`, and `metric-evaluated` claims, with status `observed`, `not-exercised`, or `unavailable`. A verified behavioral claim is capture-eligible only when an observed consequence is present. Unexercised/unavailable behavior remains proposal-only. Existing non-behavioral facts and metric evaluation semantics remain compatible.

Decision telemetry records only bounded claim type/status plus a digest of effect evidence; raw expected/observed text is not emitted. The public Learning MCP schema accepts the bounded declaration, and `AGENTS.md` already carries the same controller rule: task completion alone is not behavioral proof.

Focused RF-P3 acceptance now passes **7/7** cases. A clean staging TypeScript build exits 0. Active `dist` still lacks `learning/effect-evidence.js` and does not yet match the qualified Learning modules, so resident activation remains separate. No Reef runtime, dependency, restart, or reference deletion occurred.

## 10. RF-P3 installed-runtime activation and reference retirement — 2026-09-25

**COMPLETE — LIVE-ACTIVATED — INSTALLED-DIST VERIFIED — REFERENCE RETIRED.** Active Learning modules and `mcp/learning-schemas.js` match the qualified candidate; `dist/learning/effect-evidence.js` is installed. Installed-dist RF-P3 acceptance passed **7/7**, and direct active-schema parsing accepts bounded `effectEvidence`.

Behavioral durable capture still requires an observed consequence; `not-exercised` and `unavailable` remain proposal-only. Raw effect text is not emitted in decision telemetry.

Before retirement, Reef remained exact-pin/Git-clean with 1,753 regular tracked files plus two gitlinks. Final checks found zero reparse points, zero live process references, zero Agent Core `src/scripts/tests` dependencies, and no Grafel workspace registration. Apache-2.0 provenance was retained in `THIRD_PARTY_NOTICES.md`.

The checkout `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/04-reef` was deleted and read back absent. Deleted tree: 1,781 files / 48,436,567 logical bytes including Git metadata. No Reef trainer, inference runtime, executor, model, service, or submodule was installed.
