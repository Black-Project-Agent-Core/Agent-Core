# R5-P0/P1 — Source Parity and Evaluation Observation Candidate
Tanggal: 2026-10-22
Status: P0 SOURCE AUDITED (bounded) / P1 ONE CONDITIONAL CANDIDATE; NO IMPLEMENTATION OR TESTS
Jenis: Supporting research evidence packet; **NOT** another proposal, approval registry, implementation, or completed feature.
Parent: `docs/proposals/Evidence-Gated-Harness-Self-Improvement-Lab.md` (revision 5, same existing proposal ID `evidence-gated-harness-self-improvement-lab`).
Approved scope: R5-P0 source parity and R5-P1 evidence-based candidate proposal preparation only. R5-P2–P6 require separate exact approval; Native development and operation are available under the 2026-10-24 user decision.

## 1. Evidence baseline and provenance
- Source research: `docs/plans/Riset Improvement Harness AI Agent.md`, SHA-256 `3c28d81ae29f86b4468d57fbc8d9c899dedad0014aa4c457e463c4e92e75d071`.
- Approved parent R5: SHA-256 `73bf43db002ddef334dddd9e1703de640c80a99cc9432e41b2f9e3fb668bf7c2`; accepted in existing `controller_learning(action=improvement)` record (controller-reported; executionAuthority=false).
- External evaluation owner: `src/learning/external-evaluation.ts`, SHA-256 `928c3d2ead81058d86075e61b29db2a95fcdb35db8bf9f301ccd186282e2d5ac`.
- External controller: `src/learning/external-controller.ts`, SHA-256 `8562898d67cb19c6749f1fd258dd3b302e766f5f99aae20afd77d93d539a970c`.
- Existing outcome scorer: `src/learning/controlled-outcome.ts`, SHA-256 `260e0245e3bff0d6690745d62073312ca539b948bed4fbf240241b3215effdfb`.
- Existing registry and handoff: `src/learning/external-improvements.ts` and `src/learning/improvement-handoff.ts` (read); no additional owner, queue, evaluator agent or approval state needed.
- Source basis is current on-disk bytes and read-only source searches, NOT executed fixtures, model evaluations, git-clean assertion or deployed behavior.

## 2. R5-P0 — Domain parity and deliberate NO-OPs
| Research claims | Source evidence / boundary | Current disposition |
| --- | --- | --- |
| F01–F04, H03–H04 | Single owner via `external-improvements.ts`, strict document reader `proposal-documents.ts`, approved parent R5; GET/read never grants action | REUSE; do not change proposal owner |
| M01–M04 | `memory/retention-score.ts` currently additive recency/access score; `memory/consolidation.ts` advisory duplicates; `memory/reconsolidation-experiment.ts` fixture-only edges | REUSE existing; query-dependent paper formula NOT drop-in |
| M05–M06, L01–L03 | `learning/external-procedure.ts` structured negative-case/checker/rollback admission; `learning/triggers.ts` meaningful checkpoint review; `learning/sink-manager.ts` dedupe | REUSE; no second Learning/Skill owner |
| R01–R02 | `memory/retrieval-ledger.ts` distinguishes retrieved/delivered/use; independent causal Memory benefit still requires controlled evaluation | REUSE tracing; causal attribution UNPROVEN |
| L04–L05 | `agent-learning-loop.ts` shared AgentFailureClass; `learning/external-evaluation.ts` enforces observations separate from caller declarations | DEFER DARC enum change; retain privileged oracle / optimizer barrier |
| P01–P03 | `memory/prospective-intentions.ts` pure 5-status projection; `memory/claim-review.ts` HOW/WHEN metadata | REUSE; no scheduler, autoexecution or expiry mutation |
| H01–H02, E01–E02 | `improvement-handoff.ts` at most one proposal; controlled scorer only baseline/candidate; no actual three-arm heldout evaluation yet | ONE CONDITIONAL TARGET below; no build/experiment |
| X01–X02, S01, B01, IMG | Polyglot is optional design; original source citations/formula images mapped in parent R5, academic efficacy not reproduced here | DEFER/REFERENCE ONLY; no worker or new memory engine |

## 3. P0 exact source-contract finding: observation provenance is the first bottleneck
**Verified source facts:** `external-evaluation.ts` declares strict v1 `baseline` and `candidate` arms (lines 19–28); observations are explicitly described as INTERNAL host/harness facts, never from manifest (lines 26–40). Its projection uses `options.observations ?? []` (lines 76–80), emits `actual-model-loaded-state-and-coverage-unavailable` when none exist (line 88), and withholds any causal benefit verdict (line 142).
`external-controller.ts::evaluate` calls `evaluateExternalComparison(episodes,input.payload,{selection:{baselineEpisodeIds,candidateEpisodeIds}})` without passing `observations` (around lines 1837–1890). Therefore **static source inference**: through this current caller, independently observed metadata is absent and `comparison.status=comparable` is unreachable for a valid two-arm manifest. Invalid/mismatched manifests may instead yield `incomparable`; neither case is causal proof. This exact behavior has NOT been exercised by a new test in this task.
Source-scoped search found references to `ExternalEvaluationObservation` only within `external-evaluation.ts`, and `loadedAssetRevision` only in that schema/guide. This is evidence of a missing current `src/` producer/call bridge, NOT proof that no external host could supply trusted evidence.
**Competing explanations:** (a) deliberate fail-closed until trustworthy host instrumentation exists; (b) bridge not yet implemented; (c) host metadata deliberately unavailable for external models; (d) a source/version mismatch outside the checked repo. Inspect the host owner before asserting which cause is true.
The second, downstream mismatch is three arms A/B/C versus existing two-arm v1. Fixing only the number of arms would still leave the observation provenance gap unsolved.

## 4. R5-P1 — One proposed hook, conditional only
Candidate ID (document-local): `HSL-OBS-01` — **Trusted Evaluation Observation Bridge (External Controller)**.
Problem/consumer: the approved R5 controlled research workflow needs independently corroborated case population, model/config/evaluator revision, actual attempts and budgets to judge whether a harness hook beats a matched-budget retry/null control.
**Single prospective hook:** `src/learning/external-controller.ts::evaluate` at the call into `evaluateExternalComparison`. If an existing trusted host evidence provider can establish the typed observations, pass that data via the current `ExternalEvaluationOptions.observations` boundary; keep v1 schema, data ownership, selected episode IDs, no-overlap guard, and `benefitVerdict='withheld'`. This is a *design hypothesis*, NOT an approved source delta or an assertion that a viable provider already exists.
Precondition STOP: inspect current host telemetry and observation provenance. If verified provider evidence cannot cover model + loaded asset/config + evaluator/collector revision + case identity + observed times/coverage, do not synthesize host facts from the manifest/controller; mark `insufficient` and **NO-OP**.
Existing-owner option before source change: keep `controller_learning(action=evaluate)` as advisory diagnostics and gather real task outcomes through existing episode/evidence receipts. Do not claim that the current public route already evaluates three arms.
Later A/B/C option (separate scope): use A/C and B/C pairwise comparisons on the **same preregistered cases, frozen verifier, equal budget**, with independently checked observations and untouched heldout; a pure additive adapter only if the existing v1 route demonstrably cannot express valid pairwise evidence. Neither observational difference nor two pairwise deltas is itself proof of causal benefit.

## 5. Falsifiers, protected cases and verification plan (all NOT RUN)
- Falsifier 1: find an already wired trusted `ExternalEvaluationObservation` provider consumed by this exact caller; if found, REUSE it and cancel duplicate adapter.
- Falsifier 2: prove approved use case does not need a `comparable` evaluation, or that observed 2-arm host data cannot be safely/accurately produced; then no new hook.
- Positive fixture (future approval): independently sourced, matching case IDs, actual model/config revisions, complete attempts and time windows becomes comparable without any caller-supplied fake evidence; `benefitVerdict` remains withheld until separate causal gates.
- Negative fixtures (future approval): absent host observations stays insufficient; conflicting model/config/time/coverage remains incomparable; overlapping IDs rejected; falsified controller metadata cannot become trusted observations; legacy v1 caller remains compatible; no Native/reflection/authorization side effects.
- Experiment gate (future approval): preregister A/B/C attempt inventory, protected passing cases, locked oracle/heldout, equal time/tool/model budgets, safety/privacy gates, outcomes and cost, predeclared minimum meaningful difference and uncertainty intervals. One hook only; rollback through exact guarded checkpoint if implementation later authorized.
- Source edits, new tests, build, Git changes, deployment, user messages, Skill promotion and Memory mutation were NOT authorized or performed by this packet.

## 6. Decision, status and continuation
**P0 result:** bounded owner/call-site parity completed for identified integration path; wider runtime/grant/host telemetry completeness is UNKNOWN. Previously documented 31 rows and 18 citations are retained in parent R5; their external primary sources are not claimed fully verified here.
**P1 result:** exactly one source-grounded candidate `HSL-OBS-01` specified with alternatives and fail-closed negative cases; it is NOT implementation-ready without trusted producer evidence and a candidate-specific independent oracle. If that evidence is unavailable, decision is `NO-OP / HOLD`, not forced feature creation.
**Next separate approval required:** scoped investigation/test of host-observation provenance and controlled fixtures, followed only if justified by an exact additive patch proposal (R5-P2/P3). R5-P0/P1 approval must not be read as authorization for this next action.
Parent proposal document/digest, its existing revision-bound acceptance, and the single owner in Learning remain unchanged. This packet is not a second proposal; it records audited findings and one conditional design candidate.

## 7. R5-P2 — Host provenance investigation and controlled fixture verification (2026-10-22)
**Authorization interpreted:** the user said “ok, silahkan lanjut” after the P1 handoff specifically described separate R5-P2 inspection of host observation provenance and targeted controlled fixtures. This enables that bounded investigation, NOT unrestricted source edits, security/credentials changes, builds, Native development, install, release or runtime activation.
**Source verification:** `src/tracker/tool-invocation.ts::ToolInvocationRequest` holds tool name, process-scoped invocation identity, host task binding and mutation context, with tool timing/outcome. `src/learning/external-controller.ts::ExternalControllerEpisode` holds episode metadata and tool-related counters; it contains no independently observed `model`, `loadedAssetRevision`, `loadedConfigRevision`, `evaluatorRevision`, `collectorRevision` or per-case `caseId`.
**Ingress boundary:** `src/mcp/controller-learning-tools.ts` routes `action=evaluate` directly into `external-controller.ts::evaluate` using caller-supplied `payload` plus selected episode IDs. The call to `evaluateExternalComparison` forwards `selection`, but no `options.observations`. Metadata from `payload` is a declaration, not host attestation. The current service-side invocation logger cannot establish the evaluator schema's required model/config/asset revisions.
**Source-consumer survey:** the searched `src/` references to `loadedAssetRevision` / `collectorRevision` were confined to the `external-evaluation.ts` schema/guide; the reviewed source contains no wired trusted producer of `ExternalEvaluationObservation`. This does **not** establish that upstream external host infrastructure cannot ever provide it; availability outside this repo remains UNKNOWN.
**Distinct pre-existing verifier:** `src/memory/outcome/contract.ts` already defines `off/current/candidate` for an isolated Memory outcome harness. That is a different intervention than harness A (current), B (matched-budget retry), C (single hook). REUSE only its general methodology as analogy; do NOT alias arm meanings, reuse task metrics as host model telemetry, or implement an evaluator/owner duplicate.

### 7.1 Executed bounded test evidence
- Command: `npm exec -- vitest run tests/external-evaluation.test.ts tests/external-learning-promotion-api.test.ts` from `E:\Projects\Agent-Core`.
- Observed process: PID `15144`, Vitest v4.1.11, `2 test files passed`, `34 tests passed`, exit code `0`, reported duration `70.34s`. The first suite contributed 18 passing tests. No new test file was created.
- `external-evaluation.test.ts` includes synthetic host observation positive fixtures and missing/changed model-config/membership/time negative cases. Successful fixture comparison is NOT independently attested live host telemetry.
- `external-learning-promotion-api.test.ts` exercises the existing MCP `action=evaluate` route. Its declared-only fixture expects `status=insufficient`, `metadataAuthority=declaration-only`, null differences, and `benefitVerdict=withheld`; spoofed `hostVerified` payload is rejected.
- The full 34-case run establishes current test behavior on the inspected source within those suites; it is not a build, full suite, Native check, hosted-model attestation, live activation or A/B/C causal experiment.

### 7.2 Decision and stop condition
- **R5-P2/HSL-OBS-01 decision: HOLD / NO-OP for source mutation.** Current host observation provenance cannot satisfy the independent metadata precondition. Adding a `controller_learning` payload field, relabeling tracker events as model facts, or wiring fake `options.observations` would silently weaken the evaluator's trust boundary. No source/API/schema, runtime, Native, Memory, Skill, grant, deployment, Git or security state has been changed for P2.
- **Minimum unblocking prerequisite:** an existing or explicitly scoped upstream trusted host collector must provide per-case, bounded, revision-bound, independently observable controller/model/loaded asset/config/evaluator/collector fields, case identity, attempt inventory and timestamp; verify its provenance without forwarding candidate claims as facts.
- **If that prerequisite is later observed:** separately approve one *additive external-only* hook at `external-controller.ts::evaluate` using the existing `ExternalEvaluationOptions.observations` argument, exact protected cases and rollback; run targeted positive/negative fixtures, preserve legacy v1 consumers and `benefitVerdict=withheld`. Evaluate matched-budget A/B/C only in a distinct authorized experiment with locked oracle/heldout and nondegradation gates.
- **If the prerequisite remains absent:** retain `insufficient` / declaration-only result and continue unrelated normal Agent Core tasks. Do not claim HSL-OBS-01 integrated, evaluate artificial success scores, or start another engine.
- The parent R5 proposal retains prior `accepted` decision and unchanged digest. This supporting research packet and `docs/CODEBASE.md` report the investigated P2 blocker; no new proposal registry or approval authority was created.
## 8. Follow-up after R5-P2 HOLD: trusted-host evidence boundary and alternate verification routes (2026-10-22)

**Scope:** approved continuation of the same R5/HSL-OBS-01 investigation; source/config inspection only. This section is a source-bound engineering disposition, NOT another candidate, second proposal or permission for Native development, patching, builds, tests, releases or deployment.

### 8.1 Newly inspected evidence

- Read-only connected `get_config` returned `currentClient` fields `name` and `version` only (name: `agent-core-http`), without model, model-revision, loaded-asset/config, case, evaluator or collector attestation. `telemetryEnabled=false` is a connector telemetry setting, NOT proof that enabling it would produce trustworthy model identity, and was not changed.
- `src/http/app.ts` authenticates an MCP request to a `VerifiedKey` for tool access. That verifies the caller credential/grants, NOT which LLM ran its reasoning, candidate revision, prompt, inference budget or held-out experiment case.
- `src/mcp/controller-learning-schemas.ts` and `controller-learning-tools.ts` accept evaluation manifest and episode IDs from the invoking external controller. `src/tracker/tool-invocation.ts` independently stamps local tool invocation IDs, process nonce, owner/task binding, timing and outcome, but does not attest upstream model/config/evaluator/case identity. Keep this trust boundary intact.
- `src/agent-provider-scheduler.ts` has model/provider-selection inputs for an Agent Core-hosted credential scheduler; they are NOT proof of the external ChatGPT/controller model used for MCP calls. Do not borrow this Native/shared subsystem, secrets, grants or credentials to fake external provenance.
- `src/learning/external-controller.ts::evaluate` still passes only episode selections to `evaluateExternalComparison`. The latter takes actual observations only through the internal `ExternalEvaluationOptions.observations` argument, which is not populated on this external API path. Thus **a valid declared manifest cannot reach independently comparable status through this existing route**; source inference, not a new runtime test.

### 8.2 Compare genuinely different paths, not cosmetic patches

| Route | Existing owner | Measurable claim and limits | Decision |
| --- | --- | --- | --- |
| Direct two-/three-arm controller manifest, synthesized model fields, or enabling connector telemetry | `src/mcp/controller-learning-tools.ts`, `src/tracker` | No independent upstream model/config provenance; would contaminate the evaluator | **REJECT as unsafe substitution** |
| Upstream host-issued, case-bound observation record and one validated additive pass-through into the existing v1 evaluator | External AI host as producer; existing `external-controller.ts::evaluate` as consumer | Potentially enables comparability, but this session provides no such authenticated producer/record. Requires exact identity, model/config/assets, evaluator/collector revision, attempts/time, provenance and an independently checkable source, without secrets/answer-key leakage | **HOLD HSL-OBS-01**, pending host prerequisite |
| Offline Memory retrieval hit@k against a separately grounded fixed cohort | Existing `src/memory/evaluation/retrieval-evaluation.ts`, `retrieval-verifier.ts`, `retrieval-profile.ts`; existing `scripts/memory/evaluation/evaluate-retrieval.mjs` | Can independently recompute reported hit@k/digests/membership and regressions from already-recorded results. Does **not** attest the truth of expected IDs, collect live results, or show downstream LLM task improvement. Checked unit/CLI tests construct synthetic cohorts; no independent real held-out corpus was established in this bounded read | **VIABLE SEPARATE OFFLINE RESEARCH OPTION**, not a substitute for HSL-OBS-01 or an automatically approved R5-P3 experiment |
| Existing Memory outcome 3-arm harness | `src/memory/outcome/evaluation.ts` | `off/current/candidate` changes Memory use; source explicitly rejects `mode=live` or `driver=real-controller` with `unsupported-live-evidence`. This is not harness A/current, B/matched-budget retry, C/single hook | **REUSE METHODOLOGY ONLY; NO PARITY CLAIM** |

### 8.3 Exact stop and re-entry rule

**Decision maintained: HSL-OBS-01 source implementation stays HOLD/NO-OP.** Current-source parity, synthetic test suites (34/34 PASS in prior P2), and connector config read do NOT satisfy independent upstream provenance. Repeating these checks, adding an advisory adapter with no producer, or inventing success scores has no real expected gain. No tests/builds or source changes were undertaken in this follow-up.

To reopen this SAME candidate, first supply a host-origin evidence contract that can be verified separately from controller-provided manifest: issuer/provenance, exact task/case/attempt identity, model and loaded asset/config revision, evaluator/collector revision, timestamp, non-sensitive verification link and integrity/freshness/coverage checks. Confirm host authority and bounded fields before proposing any Agent Core code; absent fields must remain `unknown` and `benefitVerdict=withheld`.

If the user instead chooses a measurable project-local path independent of ChatGPT model telemetry, prepare a **distinct authorized offline retrieval experiment** on an independently sourced, consented, frozen query/expected-record cohort with protected regressions and rollback. Keep its outcome strictly scoped to retrieval hit@k; it cannot prove model self-improvement or activate any candidate. Existing scripts/owner are sufficient; do not build another harness or rely on synthetic unit-test fixtures as real data. R5-P3/P4/P5/P6 have not been implicitly activated by this investigation.

Existing R5 proposal ID/approval and `src/memory`/`src/learning` owners remain unchanged. This packet records newly verified boundaries and a precise stop condition, not a deferred background job.

