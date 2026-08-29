# Market Signal Lab — Phase C3 Evidence-Calibrated Signal Model Design

**Date:** 2026-08-24 (Asia/Jakarta)
**Status:** FINAL DESIGN DRAFT — ARCHITECTURE APPROVED, WRITTEN SPEC REVIEW REQUIRED
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Design baseline:** `cfedc8c8fc8cf246bba679dae337e7a16a11f541`
**C2 product-source evidence baseline:** `82abd6a227140fdc61dd01799069e524ca6ad39a`
**Formal release status:** `NOT RELEASED`

## 1. Purpose

Phase C3 turns MSL's evidence constitution into a versioned runtime contract. The objective is not to invent a stronger score. The objective is to make every trend-direction or product-insight claim answer a prior question: **what evidence permits this claim, with what limitations, and when must it be withheld?**

The canonical product chain remains:

```text
Observed Envato Market Evidence
→ Historical / Cross-sectional Analysis
→ Evidence Quality and Signal Eligibility
→ Trend Direction Inference
→ Catalog / Product Trend Ranking
→ Product Insight
→ Better Product Decisions and Quality Benchmarking
```

C3 does not add market-entry timing, trading-style actions, buy/sell/hold semantics, or guaranteed future-performance claims.
## 2. Binding Precedence

This design is subordinate to, and must remain consistent with:

1. `docs/checkpoints/PERMANENT_MSL_PURPOSE_GUARDRAIL.md`;
2. `docs/superpowers/specs/2026-08-18-msl-phase-c0-signal-truth-audit.md`;
3. the frozen C1 v0.1 numeric/wire/history evidence;
4. `msl-semantic-contract/2` and the C2 completion evidence.

If later implementation text conflicts with those authorities, this phase must be corrected rather than weakening the earlier evidence contracts.

## 3. Immutable Baselines

C3 must not rewrite or silently reinterpret:

```text
C1 Rust numeric formulas, weights, clamps, rounding, ranking order
msl-analytics/2 production wire contract unless a separately versioned migration is approved
legacy v0.1 JSON/JSONL fields and history
C1 canonical golden fixture bytes/fingerprints
C2 msl-semantic-contract/2 aliases or identity projection
compatibility query/filter values such as minOpportunity and opportunity
Rust-mandatory production analytics for already migrated numerical kernels
```

C3 additions are additive and versioned. Historical C1/C2 output must remain independently readable and reproducible.
## 4. Core Architecture Decision

C3 is an **Evidence Operating System**, not another monolithic score. Its dependency direction is:

```text
observed facts
→ scope/evidence qualification
→ peer-independent atomic movement/composition signals
→ optional peer-relative ranking
→ optional aggregate/divergence signals
→ confidence assessment
→ UI interpretation
```

The following dependency directions remain forbidden:

```text
confidence → eligibility
PRR → ODMI → PRR
composition → performance claim
coverage → invented population
missing evidence → neutral score
raw score magnitude → unrestricted narrative
```

The constitutional state space remains two-dimensional:

```text
EvidenceStage × SignalEligibility
```

A single flat status ladder is not introduced.
## 5. C3 Version Families

C3 introduces a contract family separate from the frozen C2 semantic contract:

```text
Evidence wire/read contract       = msl-evidence-contract/1
Requirement registry              = msl-evidence-requirements/1
Evidence-stage policy             = msl-evidence-stage-policy/1
Confidence model before fitting   = msl-evidence-confidence/uncalibrated-1
```

`msl-semantic-contract/2` remains unchanged and is not nested inside or renamed by these contracts.

The first C3 implementation plan is authorized to target **C3.0 only**. C3.1–C3.3 are roadmap gates described by this design, not permission to implement every future numeric model at once.

## 6. Language and Runtime Ownership

### Go — evidence/control plane

Go owns requirement resolution, evidence-stage evaluation, eligibility evaluation, reason-code/provenance assembly, append-only persistence, API composition, and narrative gating. These are policy/control-plane responsibilities and do not constitute a numerical fallback for Rust.

### Rust — production numerical analytics

Existing migrated numerical kernels remain Rust-mandatory. New C3.1 numerical kernels such as true acceleration, ODMI, and movement-index math enter Rust only through separately versioned, tested interfaces. C3.0 does not change the `msl-analytics/2` numeric wire.

### Python — offline calibration laboratory

Python is reserved for C3.2 offline backtesting/calibration. It does not become a production request/runtime dependency.
## 7. C3 Roadmap Decomposition

```text
C3.0 Evidence Constitution Runtime
  → contracts, requirements, scope comparability, assessment,
    stage, eligibility, reasons, persistence, API/narrative gate

C3.1 Deterministic Signal v0.2
  → Competition Acceleration v0.2, ODMI, Momentum Magnitude,
    PRR evidence envelope, Author Concentration Change,
    Movement Index / Signed Movement Divergence

C3.2 Python Quant Research / Calibration Lab
  → backtesting, threshold calibration, sensitivity/stability,
    peer robustness, coverage breakpoints, seasonality validation,
    confidence fitting

C3.3 Calibrated Production Intelligence
  → calibrated PRELIMINARY_TREND / ESTABLISHED_TREND promotion,
    SEASONALITY_CANDIDATE policy, ConfidenceScore and bands
```

A later stage may consume artifacts from an earlier stage, but it may not retroactively mutate the earlier versioned evidence record.

## 8. C3.0 Scope

C3.0 converts the C0 constitution into executable, deterministic infrastructure while deliberately leaving statistically tuned values uncalibrated. It must be useful before C3.2 without pretending that calibration already exists.
C3.0 must provide these canonical enum/value families:

```text
EvidenceStage
  COMPOSITION_ONLY
  MOVEMENT_INDICATION
  PRELIMINARY_TREND
  ESTABLISHED_TREND
  SEASONALITY_CANDIDATE

SignalEligibility
  ELIGIBLE
  DEGRADED
  SUPPRESSED

RuleClass
  DETERMINISTIC_PRODUCTION_RULE
  CONFIGURABLE_THRESHOLD
  FUTURE_CALIBRATION_TARGET

RequirementApplicability
  REQUIRED
  RECOMMENDED
  NOT_APPLICABLE

FailureDisposition
  INFO
  DEGRADE
  SUPPRESS
```

`TO_BE_CALIBRATED` is a deliberate constitutional state for an unresolved threshold. It is not a placeholder that implementation may replace with a guessed number.
## 9. Canonical Requirement Contract

The additive domain contract is equivalent to:

```text
SignalEvidenceRequirement {
  signalId
  signalModelVersion
  claimType
  requirementsVersion
  stagePolicyVersion
  confidenceModelVersion
  rules[] RequirementRule
}

RequirementRule {
  dimension
  applicability
  ruleClass
  threshold: concrete | TO_BE_CALIBRATED | null
  failureDisposition
  reasonCode
}
```

The evaluator must reject an unsupported requirement version, duplicate requirement identity, invalid enum, or a deterministic rule whose mandatory threshold/input contract is absent. It must not silently fall back to another requirements version.

No universal evidence threshold is shared by every signal.
## 10. Scope Comparability Contract

Temporal claims must resolve a `ScopeComparabilityResult` before movement is authorized:

```text
ScopeComparabilityStatus
  NOT_APPLICABLE
  EXACT_MATCH
  DECLARED_COMPATIBLE
  INCOMPATIBLE
```

The result carries run identities plus compatibility facts for planner, sampling schema, taxonomy, weighting, source type/policy, window duration, query universe, and surface universe.

Current Market Map `CompatibilityKey` equality is a strong `EXACT_MATCH` anchor, but it does not prove query completion, surface completion, attribution coverage, observation reliability, or movement participation. Those remain separate evidence dimensions.

Partial scans are not automatically scope-incompatible. They retain the planned scope identity and expose incompleteness through the appropriate completion/reliability dimensions.

No material policy/schema change is treated as comparable unless an explicit versioned compatibility declaration exists.
## 11. Evidence Assessment Contract

Canonical per-signal assessment:

```text
EvidenceAssessment {
  assessmentId, requirementsVersion
  signalId, signalModelVersion
  entityType, entityId, runId
  evidenceStage, eligibility, reasonCodes
  comparableWindowCount
  observedProducts, comparableProducts
  temporalComparabilityRate, movementParticipationRate
  queriesPlanned, queriesObserved, queriesComparable
  queryObservationRate, queryComparabilityRate
  eligibleSurfaces, completedSurfaces, surfaceCompletionRate
  attributedProducts, attributionCoverage, observationReliability
  peerGroupSize, comparablePeerShare, peerSpread, tieDensity
  eligibleChildCount, totalChildCount, eligibleChildShare
  scopeComparability, confidence, provenanceId, assessedAt
}
```

Dimensions not applicable to a signal remain absent/null. They are never filled with a neutral numeric default.

A `SignalResult` couples `signalId`, `signalModelVersion`, `value: number|null`, and its evidence assessment. A suppressed result keeps the evidence record while its value is null/absent.
## 12. Reason-Code Constitution

C3.0 starts from the C0 factual registry:

```text
LIMITED_TEMPORAL_DEPTH, NO_COMPARABLE_WINDOW, WINDOW_DURATION_MISMATCH
UNSTABLE_SCAN_SCOPE, SAMPLING_POLICY_CHANGED, SOURCE_POLICY_CHANGED
INCOMPATIBLE_MODEL_VERSION, INSUFFICIENT_OBSERVED_PRODUCTS
LOW_TEMPORAL_COMPARABILITY, LOW_PARTICIPATION, LOW_OBSERVATION_RELIABILITY
LOW_QUERY_OBSERVATION, LOW_QUERY_COMPARABILITY, INCOMPLETE_SURFACE_COVERAGE
LOW_ATTRIBUTION_COVERAGE, NO_ATTRIBUTED_PRODUCTS
SMALL_PEER_GROUP, LOW_PEER_COMPARABILITY, LOW_PEER_SPREAD, HIGH_TIE_DENSITY
INSUFFICIENT_MOVEMENT_ELIGIBILITY, CAP_RELAXED_FOR_SMALL_PEER_SET
ZERO_BASELINE_DELTA, MISSING_REQUIRED_COMPONENT
```

Reason codes describe observations or contract failures; they must never fabricate a causal story about why the Envato market moved.

The same reason code may be informational, degrading, or suppressing only through the selected signal requirement version. New reason codes require explicit registry tests and documented semantics.

## 13. Confidence Contract

C3.0 confidence is explicitly uncalibrated:

```text
score = null
band = UNCALIBRATED
modelVersion = msl-evidence-confidence/uncalibrated-1
```

No default `50`, inferred HIGH/MEDIUM/LOW band, or reuse of legacy C1 confidence is permitted. Legacy confidence remains separately versioned historical output.
## 14. Deterministic Assessment Order

The runtime must evaluate in this order:

```text
1. Resolve signalId + signalModelVersion.
2. Load the exact SignalEvidenceRequirement version.
3. Validate required raw evidence inputs.
4. Resolve ScopeComparabilityResult when temporal comparison applies.
5. Apply deterministic mathematical/semantic prerequisites.
6. Determine maximum EvidenceStage justified by the available history.
7. Apply only configured thresholds with approved concrete values.
8. If a blocking prerequisite fails: SUPPRESSED + value null.
9. Otherwise obtain/retain the signal value from its approved model.
10. Apply configured non-blocking conditions: DEGRADED or ELIGIBLE.
11. Attach factual reason codes and provenance.
12. Evaluate confidence separately; C3.0 remains UNCALIBRATED/null.
13. Generate narrative from semantics × stage × eligibility × reasons.
```

A `TO_BE_CALIBRATED` rule is declared but not numerically executed. It does not authorize an invented threshold and does not silently become zero, fifty, or a generic percentage.

In C3.0, `ELIGIBLE` means deterministic eligibility under the selected requirements version. It does **not** mean high confidence or established trend. The UI/API must expose EvidenceStage and uncalibrated confidence alongside eligibility so that this distinction cannot be hidden.
## 15. C3.0 Package and Persistence Boundary

The implementation plan should use additive boundaries equivalent to:

```text
internal/domain/evidence.go
  → new evidence contract records only; no mutation of legacy structs

internal/evidence/
  → version registry, requirements, comparability, evaluator, reasons

internal/storage/evidence_assessment_store.go
  → append/read evidence ledger through existing Store conventions

internal/app/
  → orchestration only; connects observed facts and approved signal values
    to the evidence evaluator

internal/web/
  → additive evidence endpoints / presentation adapters
```

Canonical new history ledger:

```text
history/signal_evidence_assessments.jsonl
```

Each row is a `SignalEvidenceAssessmentRecord` carrying assessment identity, run/entity/signal/model/requirements versions, whether a value is present, the EvidenceAssessment, provenance, and assessed time.

The ledger is append-only. C3.0 must prove byte-for-byte that existing C1 ranking/integrity/history files are unchanged when evidence is assessed or read.
## 16. API Compatibility and Presentation

C3.0 must not change the shape or meaning of the C2 `semantics` object. Evidence is a sibling contract.

Canonical additive endpoints should be versioned around these responsibilities:

```text
GET /api/evidence/requirements
GET /api/evidence/assessments
GET /api/evidence/assessment?runId=...&entityType=...&entityId=...&signalId=...
```

Exact route consolidation may follow current web conventions in the implementation plan, but it must preserve the separate contract identity and support deterministic filtering by run/entity/signal/version.

Existing ranking/explorer/watchlist/comparison APIs keep their C1 legacy fields and C2 semantics unchanged. They may later carry an additive evidence reference/view, but C3.0 must not overload C2 semantic aliases with stage, eligibility, confidence, or reasons.

UI narrative rules:

```text
COMPOSITION_ONLY × ELIGIBLE
→ current observed composition language only

MOVEMENT_INDICATION × DEGRADED
→ early observed movement + explicit limitation/reasons

SUPPRESSED
→ no directional signal narrative; explain evidence limitation
```

The UI must never turn `PRR=100` into absolute market strength, a composition gap into performance divergence, two-window growth into acceleration, or uncalibrated confidence into probability.
## 17. Initial C3.0 Production Evidence Registry

The first implementation should prove the constitution across representative existing signals without creating new C3.1 math:

```text
catalog.directional_breadth.v0.1
catalog.competition_momentum.v0.1
product.peer_relative_rank.v0.1
catalog.peer_relative_rank.v0.1
structural.observed_segment_composition.v0.1
```

These identifiers wrap approved existing values; they do not replace C1 fields or C2 names.

Minimum deterministic semantics:

- Directional Breadth: temporal movement claim; comparable products and a valid comparable prior window are required. If none exist, the defensible SignalResult is suppressed/null even though the frozen legacy field may still contain its parity value.
- Competition Momentum v0.1: requires two comparable windows, comparable duration/scope, and stable approved count definition. `ZERO_BASELINE_DELTA` is preserved as explicit provenance where applicable.
- PRR v0.1: requires a declared peer definition and at least two members for a defensible comparative claim. A frozen legacy single-peer `50` remains in legacy/C2 output but the new evidence-qualified PRR result is suppressed/null with `SMALL_PEER_GROUP`.
- Observed Segment Composition: `COMPOSITION_ONLY` is sufficient; it must never authorize movement/trend narrative by itself.

All non-mathematical minimum sample, coverage, participation, reliability, peer-spread, and similar thresholds remain `TO_BE_CALIBRATED` unless already backed by a separately approved versioned policy.
## 18. C3.0 Evidence-Stage Ceiling

Until calibration artifacts are approved, C3.0 production promotion is intentionally capped:

```text
COMPOSITION_ONLY       → allowed from valid current-state evidence
MOVEMENT_INDICATION    → allowed from deterministic comparable-window prerequisites
PRELIMINARY_TREND      → not promoted by C3.0
ESTABLISHED_TREND      → not promoted by C3.0
SEASONALITY_CANDIDATE  → not promoted by C3.0
```

Legacy `direction-stage-v0.1` counts may continue to exist for compatibility but must not be reinterpreted as C3 EvidenceStage authorization.

This ceiling is a safety/epistemic feature, not a missing implementation. C3.2/C3.3 must supply approved calibration evidence before the upper stages receive production promotion policies.

## 19. C3.1 Deterministic Signal v0.2 Gate

C3.1 may begin only after C3.0 is COMPLETE / VERIFIED. New numerical models must be separately versioned and Rust-tested rather than added as Go fallbacks.

C3.1 target families are:

```text
Competition Acceleration v0.2
Observed Directional Momentum Index (ODMI)
Momentum Magnitude
PRR evidence envelope over an approved peer score
Author Concentration Change
Movement Index family / Signed Movement Divergence
```

C3.1 must not establish statistically tuned production thresholds.
Deterministic mathematical minima remain constitutional:

```text
true competition acceleration → at least 3 comparable windows
PRR comparative claim         → at least 2 comparable peer members
signed movement divergence    → at least 2 movement-eligible children
movement delta                → current + prior comparable window
```

ODMI remains peer-independent. PRR may rank an approved peer score, including an ODMI-based score, but ODMI must never consume finalized PRR.

Signed Movement Divergence retains the future definition:

```text
ProductMassWeightedMovement - EqualSegmentMovement
```

and cannot be computed by repurposing C1 structural composition values.

## 20. C3.2 Python Quant Research / Calibration Lab

C3.2 is an offline reproducible research environment. It may consume exported, privacy-safe MSL historical evidence and later-observed Envato outcomes to evaluate whether an inference made at time T matched later observations.

It is permitted to perform backtesting, threshold calibration, sensitivity/stability analysis, peer-size robustness analysis, coverage/participation breakpoint analysis, confidence fitting, and seasonality validation.

It must not require the production app to execute Python, and it must never transform research output into market-entry timing or trading semantics.
A calibration result becomes eligible for review only as a versioned artifact equivalent to:

```text
CalibrationArtifact {
  calibrationId
  datasetManifestHash
  featureContractVersions
  targetDefinition
  training/evaluation window policy
  candidateParameters
  holdout metrics
  stability/sensitivity metrics
  limitations
  generatedByVersion
  generatedAt
}
```

A notebook, console output, or best-looking parameter is not sufficient by itself. The artifact must make the dataset slice, target, versions, and evaluation policy reproducible.

Raw credentials are never exported into the lab. Research datasets and generated artifacts remain outside Git unless they are explicitly reduced to non-sensitive golden fixtures or documentation-safe summaries.

## 21. C3.3 Calibrated Production Intelligence Gate

C3.3 may instantiate a `TO_BE_CALIBRATED` production parameter only when an approved calibration artifact identifies the exact signal/model/requirements version and the repository records the justification.

Calibration changes create a new version; they never mutate the meaning of an already persisted evidence record.
Approved C3.3 responsibilities may include:

```text
PRELIMINARY_TREND promotion policy
ESTABLISHED_TREND promotion policy
SEASONALITY_CANDIDATE policy
EvidenceConfidenceScore model
LOW / MEDIUM / HIGH confidence-band boundaries
signal-specific calibrated degrade/suppress thresholds
```

A calibrated confidence model remains downstream of eligibility. It can quantify uncertainty in an eligible/degraded claim; it can never revive a suppressed signal or promote an EvidenceStage beyond the available temporal evidence.

## 22. Failure and Degradation Semantics

C3 must fail closed at the semantic boundary:

- unsupported evidence/requirements/model version → explicit error, no fallback contract;
- missing deterministic prerequisite → `SUPPRESSED`, value null, factual reason code;
- non-fatal configured evidence shortfall → `DEGRADED`, value may remain present, reason code required;
- applicable fallback that remains mathematically valid → value may remain, but fallback provenance/reason is recorded;
- unknown/non-applicable dimension → null/absent, never synthesized zero;
- persistence failure → do not claim that the evidence assessment was durably recorded;
- narrative generation failure → raw evidence contract may still be returned, but no stronger prose is invented.

A high legacy score, high C2 Insight Score, or future high confidence must not bypass these rules.
## 23. TDD and Regression Strategy

The C3.0 implementation plan must use red-green-refactor and include at least these independent gates:

```text
contract enum/version tests
requirement registry validation tests
scope comparability truth-table tests
evidence-stage deterministic prerequisite tests
eligibility degrade/suppress truth-table tests
reason-code provenance tests
uncalibrated confidence tests
append/read evidence-ledger tests
legacy-history byte-immutability tests
API version/filter/unknown-contract tests
UI narrative-gate tests
C1 fixture fingerprint lock
C2 semantic identity lock
Rust numeric/wire diff gate
full cargo test
full go test ./... -count=1
native Windows staged/installed smoke as applicable
```

Tests must include explicit negative cases proving that no-comparable-history does not become `50`, one-member PRR does not become a defensible comparative value, and a suppressed signal cannot be narrated as a trend.

No test may pass merely because the legacy value remains present; new evidence-qualified output must be asserted independently of frozen compatibility output.
## 24. C3.0 Acceptance Criteria

C3.0 is COMPLETE / VERIFIED only when all of these are simultaneously true:

```text
msl-evidence-contract/1 is version-validated and additive
msl-evidence-requirements/1 is explicit per signal
EvidenceStage and SignalEligibility remain separate axes
TO_BE_CALIBRATED thresholds have no guessed production values
confidence score is null and band UNCALIBRATED before calibration
ScopeComparabilityResult is evaluated for temporal claims
SUPPRESSED signals return null/absent evidence-qualified values
reason codes are factual/versioned and persisted with provenance
signal_evidence_assessments.jsonl is append-only and readable
legacy C1/C2 history bytes are not rewritten
C2 semantics remain msl-semantic-contract/2 and identity-preserving
initial C3.0 registry covers the approved representative existing signals
upper trend stages are not promoted by C3.0
no Go fallback recomputes Rust-owned migrated numerical kernels
C1 golden fingerprints and Rust numeric/wire freeze gates remain green
full Rust and Go regressions pass
native runtime remains healthy / rust-production / msl-analytics/2
formal release remains NOT RELEASED
```

If any load-bearing gate fails, C3.0 remains PARTIAL / BLOCKED and the checkpoint names the exact failed gate.

## 25. Baseline Verification for This Design

Before this design was written, the isolated C3 worktree was created from C2 verified HEAD `cfedc8c8`. Rust tests, a release Rust worker build, and full `go test ./... -count=1` against that worker all passed. Generated baseline artifacts are kept under ignored `dist/c3-baseline/`.
## 26. Explicit Non-Goals for the First C3 Plan

The C3.0 implementation plan must not include:

```text
calibrated numeric evidence thresholds
PRELIMINARY_TREND / ESTABLISHED_TREND promotion formulas
seasonality inference
confidence-score fitting or band thresholds
Python in the production runtime
C++ accelerator work
replacement of C1/C2 history
C2 semantic alias redesign
market-entry timing or trading-style actions
implicit merge to main
```

C3.1/C3.2/C3.3 require their own gate evidence. C++ remains subject to the separate profiling gate in the polyglot roadmap; it is not pulled into C3 merely because C3 performs more analysis.

## 27. RC / Formal Release Boundary

The deferred C2 elevated install-and-uninstall replay of the current Setup.exe remains a binding prerequisite for RC/final product sign-off. It is not a blocker for C3 design or isolated C3 development.

C3 must not rewrite that deferred gate as passed. Before any formal release claim, the repository must contain fresh native evidence for the exact release candidate, including normal interactive UAC elevation and uninstall cleanup, without a UAC bypass.

## 28. Repository and Secret Hygiene

Raw Envato credentials, local market-history datasets, generated calibration datasets, native installers, test installs, toolchains, and generated evidence remain outside tracked Git unless explicitly reduced to safe deterministic fixtures or documentation summaries.
## 29. Required Implementation Sequence After Spec Approval

```text
1. Invoke writing-plans and create a C3.0-only TDD implementation plan.
2. Re-verify the C1/C2 baseline in the C3 worktree.
3. Implement additive evidence contracts and version registry.
4. Implement requirement/scope/stage/eligibility evaluator with TDD.
5. Implement append-only evidence persistence.
6. Integrate the approved C3.0 representative signal registry.
7. Add evidence API and narrative-gate presentation without altering C2 semantics.
8. Run C1/C2 freeze gates, full Go/Rust regression, and native acceptance.
9. Independent task reviews + whole-branch review.
10. Record C3.0 COMPLETE / VERIFIED only from observed evidence.
```

Do not start C3.1 automatically after C3.0. Re-read the checkpoint and open the next design/implementation gate explicitly.

## 30. Final Design Decision

C3 will evolve MSL from a system that can calculate signals into a system that can **qualify its right to make each signal claim**. The first deliverable is the C3.0 Evidence Constitution Runtime, not a new predictive super-score.

C3.0 preserves C1 numeric truth and C2 semantic truth, adds `msl-evidence-contract/1` as a sibling evidence layer, evaluates deterministic stage/eligibility rules, records factual limitations append-only, and refuses to fabricate calibrated confidence or upper-stage trend claims.

C3.1 adds new deterministic numerical signal families only after C3.0 is verified. C3.2 then supplies reproducible offline calibration evidence. C3.3 alone may promote calibrated thresholds and confidence models into a new versioned production contract.

This staged architecture is the approved direction for the next MSL development lane.