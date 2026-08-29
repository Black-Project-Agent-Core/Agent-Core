# Market Signal Lab — Phase C0 Signal Truth Audit Constitution

**Date:** 2026-08-18 (UTC+7)  
**Status:** FINAL DESIGN / AUDITS 1–6 REVIEWED / APPROVAL READY  
**Repository:** `rendevouz999/Market-Signal-Lab`  
**Recorded branch:** `feature/secure-envato-credential-runtime-resume-20260818`  
**Verified source head before this documentation update:** `1e54988e1b99cd79cbf8ad5640ab5460dbb13ff5`  
**Execution gate:** Windows Installer Lifecycle remains the next executable gate. This specification does **not** authorize Phase C production implementation.

## 1. Purpose

Phase C is not merely a Go-to-Rust port. Its target is an evidence-calibrated market signal engine whose outputs remain bounded by what MSL actually observed.

The approved conceptual sequence is:

```text
PHASE C0 — SIGNAL TRUTH AUDIT
        ↓
PHASE C1 — BEHAVIOR FREEZE + RUST PARITY MIGRATION
        ↓
PHASE C2 — SEMANTIC CORRECTION / DEFENSIBLE NAMING
        ↓
PHASE C3 — EVIDENCE-CALIBRATED SIGNAL MODEL v0.2
```

C0 establishes the semantic and epistemic constitution that later phases must obey.

## 2. Permanent Architecture Boundary

```text
Go
= Windows application/control plane
= security / credential boundary
= IDs, timestamps, provenance, storage, HTTP, UI

Rust
= mandatory production analytics plane
= deterministic numeric computation for migrated kernels

Python
= future offline Quant Research / Calibration Lab

C++
= only if profiling proves a justified hotspot
```

Prohibited without a new approved specification:

```text
production Go analytics fallback after Rust migration
user-selectable Go/Rust/Shadow production mode
synthetic runtime market data
fake progress / ETA / probability / performance claims
credential / cookie / browser-session material entering Rust
speedup claims without benchmark evidence
silent merge to main
```

## 3. Permanent Epistemic Guardrails

1. **Observed evidence only.** A signal may claim only what its observed input contract supports.
2. **Rust does not create truth.** Rust changes implementation ownership and deterministic execution, not semantic validity.
3. **Names must match mathematics.** A two-window delta is not acceleration; a percentile is not absolute strength; structural composition is not market performance.
4. **No hidden population estimation.** Observed counts must not be divided by coverage to invent unseen population size without a separately validated sampling estimator.
5. **Unknown is not neutral.** Unsupported or missing evidence must not silently become a visible `50`.
6. **Signal value, evidence stage, eligibility, and confidence are separate concepts.**
7. **Temporal claims require comparable temporal evidence.**
8. **Dynamics require scope comparability.** Catalog/query/surface scope, sampling/source policy, duration, and attribution context cannot drift silently.
9. **Parity first, correction second.** C1 freezes current behavior. C2/C3 change names/models only under new versioned contracts.
10. **Model changes are versioned.** Historical fixtures remain regression evidence.
11. **External reputation claims require external evidence.** Author IDs/product counts do not establish sales power, reputation, Elite status, copying, quality, or monopoly.
12. **Rust remains secret-blind.** Rust receives normalized analytical inputs only.

---

# AUDITS 1–5 — LOCKED CONCEPTUAL FINDINGS

## 4. Audit #1 — Supply / Competition

### 4.1 Current supply source truth

Current v0.1 supply counting is driven primarily by:

```text
ProductEntity.FirstSeenAt
+ current/previous observed catalog presence
+ ranking-window boundaries
```

It is not primarily a release-time model.

Current v0.1:

```text
new_current  = products first seen in current window
new_previous = products first seen in previous window

NewSupplyVelocityPercent
= SignedDeltaPercent(new_current, new_previous)
```

This is a two-window growth/change measure, not literal velocity.

C1 freezes exact current behavior, including zero-baseline behavior, clamping, rounding, and mapping.

C2 semantic candidates include:

```text
Observed New-Supply Growth
Observed New-Supply Momentum
```

C3 may introduce explicit rate/share measures, but coverage remains evidence quality rather than a population multiplier.

### 4.2 Current competition source truth

Current v0.1 compares unique observed product counts between two windows:

```text
competition_percent
= SignedDeltaPercent(unique_products_current, unique_products_previous)
```

The persisted field `CompetitionAcceleration` therefore overstates the mathematics.

C2 candidate:

```text
CompetitionAcceleration (legacy field meaning)
→ Competition Momentum v0.1
```

True acceleration v0.2 requires at least three comparable windows because two adjacent first-order changes are required before their change can be computed.

## 5. Audit #2 — Market Breadth Family

Current `ExposureBreadth` is more accurately:

```text
Directional Breadth
= 50 + 50 × (Rising - Falling) / Comparable
```

where `Comparable = Rising + Neutral + Falling`.

C3 keeps breadth atomic rather than compressing all evidence into one number:

```text
Directional Breadth
Temporal Comparability Rate
Movement Participation Rate
Query Observation Breadth
Cross-Query Movement Breadth
Cross-Surface Presence Breadth
```

Products without comparable temporal history are **not** “static”; their movement evidence is unavailable.

Cross-query presence is not cross-query movement. Cross-surface presence is not flow/transition.

## 6. Audit #3 — Relative Strength Family

Current percentile rank is not absolute strength.

C2 candidate:

```text
Relative Strength
→ Peer Relative Rank (PRR)
```

C3 separates three axes:

```text
Observed Directional Momentum Index (ODMI)
Momentum Magnitude
Peer Relative Rank (PRR)
```

PRR must carry:

```text
PeerGroupSize
PeerDefinition
PeerDefinitionVersion
PeerSpread
ComparablePeerShare
TieDensity where relevant
SignalEligibility
```

A peer percentile of `100` means highest inside the declared peer universe. It does not mean absolute market strength `100`.

ODMI must remain peer-independent. PRR must not feed ODMI and then recursively rank itself.

## 7. Audit #4 — Author Concentration Family

Current MSL HHI is:

```text
HHI_MSL = 100 × Σ share²
```

Scale:

```text
0–100
```

It measures concentration of **attributed unique observed products per author**. It does not measure sales, revenue, visibility, reputation, quality, Elite status, or market power.

C3 family:

```text
Observed Author Product Concentration
Concentration Change
Top-N Attributed Product Share
Dominant Author Identity Persistence
Observed Author Set Turnover
Author Attribution Coverage
```

Every dynamic concentration claim must carry attribution coverage and scope comparability for every compared window.

## 8. Audit #5 — Index / Divergence Family

Current v0.1 `Volume` is:

```text
count of unique observed products in a segment bucket
```

Current `Composition` is:

```text
segment unique observed products / parent unique observed products
```

Therefore current `VolumeWeightedValue`, `EqualSectorValue`, and `DivergenceValue` are structural composition/concentration constructs, not market-performance indices.

C0 separates:

```text
A. STRUCTURAL COMPOSITION INDEX FAMILY v0.1

Observed Segment Composition
Capped Composition Concentration
Mean Eligible Segment Composition
Composition Weighting Gap
Weight-Cap Sensitivity
Structural Concentration Change
```

from future:

```text
B. MOVEMENT INDEX FAMILY v0.2

Child Movement Index
Product-Mass-Weighted Movement
Equal-Segment Movement
Signed Movement Divergence
Divergence Magnitude
Segment Movement Participation
Movement Divergence Persistence
```

Future signed movement semantics:

```text
Signed Movement Divergence
= ProductMassWeightedMovement
- EqualSegmentMovement
```

Current weighting caps remain v0.1 parity behavior:

```text
Global/Site parent ≈ 45%
lower hierarchy    ≈ 50%
```

When the peer set makes the configured cap infeasible, the existing algorithm may relax the effective cap. That fallback must remain explicit in provenance.

---

# AUDIT #6 — EVIDENCE + CONFIDENCE CONSTITUTION

## 9. Core Question

Audit #6 answers:

> When may MSL emit a signal, how strongly may that signal be interpreted, when must it carry a warning, and when must MSL suppress the signal entirely?

The answer is deliberately **two-dimensional**:

```text
EvidenceStage × SignalEligibility
```

A single flat state machine is rejected.

## 10. EvidenceStage

Canonical stages:

```text
COMPOSITION_ONLY
MOVEMENT_INDICATION
PRELIMINARY_TREND
ESTABLISHED_TREND
SEASONALITY_CANDIDATE
```

### 10.1 Meaning

`EvidenceStage` is the **maximum temporal claim class justified by the evidence history**. It is not a quality grade, not confidence, and not signal eligibility.

### COMPOSITION_ONLY

Allowed claims:

```text
current observed state
current composition
current concentration
current peer-relative position when its peer score itself is non-temporal
```

Forbidden claims:

```text
rising / falling due to temporal change
trend
acceleration
persistence
turnover
seasonality
```

`COMPOSITION_ONLY` is a valid evidence stage, not failure.

### MOVEMENT_INDICATION

Requires at minimum a current and prior **comparable** window for the movement quantity being claimed.

This two-window minimum is a deterministic mathematical prerequisite for a delta. It does not by itself establish a durable trend.

### PRELIMINARY_TREND

Requires repeated qualified movement beyond a single transition plus stable scope and policy. The number of transitions, persistence threshold, and acceptable gap policy are:

```text
TO_BE_CALIBRATED
```

No universal numeric promotion rule is authorized by C0.

### ESTABLISHED_TREND

Requires a longer sequence of qualified comparable movement than `PRELIMINARY_TREND`, plus persistence/stability criteria. Promotion thresholds are:

```text
TO_BE_CALIBRATED
```

### SEASONALITY_CANDIDATE

Requires repeated periodic behavior across a declared period model. Minimum cycles, periodicity strength, tolerance, and confidence criteria are:

```text
TO_BE_CALIBRATED
```

The word `candidate` is intentional. Seasonality must not be inferred merely from having many scans.

### 10.2 Legacy DirectionStage compatibility

Current `direction-stage-v0.1` behavior uses fixed comparable-run counts, including legacy `2`, `3`, and `6` boundaries. Those values remain **C1 parity behavior only**.

They are not promoted into the new universal Evidence Constitution.

The older roadmap's fixed stage ladder is therefore superseded for future evidence semantics by this specification. C1 must still reproduce the legacy implementation exactly where it is part of v0.1 behavior.

## 11. SignalEligibility

Canonical values:

```text
ELIGIBLE
DEGRADED
SUPPRESSED
```

### ELIGIBLE

The signal's deterministic prerequisites are satisfied and no configured signal-specific evidence condition requires degradation.

### DEGRADED

The signal is mathematically and semantically valid to compute, but one or more non-fatal evidence dimensions are below the signal's declared preferred requirement or a transparent fallback reduces interpretability.

Rules:

- value may be present;
- factual reason codes are mandatory;
- UI language must state the limited evidence context;
- degraded evidence may not be narrated as established certainty.

### SUPPRESSED

A mandatory semantic/mathematical prerequisite fails, or evidence is incompatible with the claim.

Required output contract:

```text
value = null / absent
eligibility = SUPPRESSED
reasonCodes = [...]
```

Forbidden substitute:

```text
value = 50
```

A confidence score can never override `SUPPRESSED`.

## 12. Rule Classes

Every evidence requirement must be classified as one of:

```text
DETERMINISTIC_PRODUCTION_RULE
CONFIGURABLE_THRESHOLD
FUTURE_CALIBRATION_TARGET
```

### DETERMINISTIC_PRODUCTION_RULE

A mathematical, structural, or version-contract prerequisite that does not depend on statistical tuning.

Examples:

```text
movement delta requires a prior comparable window
true acceleration requires at least three comparable windows
PRR requires another peer to make a comparative rank claim
signed movement divergence requires multiple movement-eligible child segments
suppressed signal returns null rather than neutral 50
```

### CONFIGURABLE_THRESHOLD

A versioned operational threshold whose value must be justified by approved evidence or product policy.

Examples:

```text
minimum observed products for a production-grade signal
minimum temporal comparability rate
minimum movement participation for unrestricted narrative
minimum query comparability
minimum attribution coverage
minimum observation reliability
preferred peer-group size
minimum eligible-child share
```

If an approved value does not yet exist, the specification value is:

```text
TO_BE_CALIBRATED
```

### FUTURE_CALIBRATION_TARGET

A threshold or scoring relationship that must be fitted or validated using offline research/backtesting before production use.

Examples:

```text
PRELIMINARY_TREND promotion threshold
ESTABLISHED_TREND promotion threshold
SEASONALITY_CANDIDATE periodicity threshold
EvidenceConfidenceScore weights
ConfidenceBand cutoffs
signal-specific degrade vs suppress breakpoints beyond mathematical minima
```

## 13. SignalEvidenceRequirement

Canonical design contract:

```text
SignalEvidenceRequirement
{
  signalId
  signalModelVersion
  claimType

  minimumComparableWindows
  scopeComparability
  windowDurationComparability
  minimumObservedProducts
  temporalComparabilityRate
  movementParticipationRate
  queryObservationRate
  queryComparabilityRate
  surfaceEligibility
  surfaceCompletionRate
  attributionCoverage
  observationReliability
  minimumPeerGroupSize
  peerComparabilityRate
  peerSpreadRequirement
  minimumEligibleChildCount
  eligibleChildShare
  samplingPolicyStability
  sourcePolicyStability

  stagePolicyVersion
  confidenceModelVersion
}
```

Each requirement field is represented by a rule declaration equivalent to:

```text
RequirementRule
{
  applicability: REQUIRED | RECOMMENDED | NOT_APPLICABLE
  ruleClass: DETERMINISTIC_PRODUCTION_RULE |
             CONFIGURABLE_THRESHOLD |
             FUTURE_CALIBRATION_TARGET
  threshold: concrete value | TO_BE_CALIBRATED
  failureDisposition: INFO | DEGRADE | SUPPRESS
  reasonCode
}
```

There is **no universal coverage threshold** shared by every signal.

## 14. ScopeComparabilityResult

Canonical statuses:

```text
NOT_APPLICABLE
EXACT_MATCH
DECLARED_COMPATIBLE
INCOMPATIBLE
```

Contract:

```text
ScopeComparabilityResult
{
  status
  currentRunId
  priorRunIds

  compatibilityKeyMatch
  plannerVersionMatch
  samplingSchemaVersionMatch
  taxonomyVersionMatch
  weightingVersionMatch
  sourceTypeMatch
  sourcePolicyFingerprintMatch
  windowDurationComparable
  queryUniverseComparable
  surfaceUniverseComparable

  currentCompatibilityKey
  priorCompatibilityKeys
  reasonCodes
}
```

### 14.1 Current compatibility anchor

The existing Market Map `CompatibilityKey` already fingerprints significant planner/sampling/scope details. Exact key equality is therefore a strong deterministic `EXACT_MATCH` anchor for current Market Map dynamics.

However, exact identity does not prove:

```text
query completion quality
surface completion quality
attribution coverage
observation reliability
movement participation
```

Those remain separate signal evidence dimensions.

### 14.2 Declared compatibility

A future migration may explicitly declare two schema/policy versions compatible. Until such a mapping exists, a material policy/version change is not silently treated as comparable.

### 14.3 Partial scans

A partial scan does not automatically imply scope incompatibility. If the planned scope identity remains stable, incompleteness is assessed through query/surface completion and reliability dimensions. Whether it degrades or suppresses depends on the signal-specific requirement.

## 15. EvidenceAssessment

Canonical per-signal assessment:

```text
EvidenceAssessment
{
  assessmentId
  requirementsVersion

  signalId
  signalModelVersion
  entityType
  entityId
  runId

  evidenceStage
  eligibility
  reasonCodes

  comparableWindowCount
  observedProducts
  comparableProducts
  temporalComparabilityRate
  movementParticipationRate

  queriesPlanned
  queriesObserved
  queriesComparable
  queryObservationRate
  queryComparabilityRate

  eligibleSurfaces
  completedSurfaces
  surfaceCompletionRate

  attributedProducts
  attributionCoverage
  observationReliability

  peerGroupSize
  comparablePeerShare
  peerSpread
  tieDensity

  eligibleChildCount
  totalChildCount
  eligibleChildShare

  scopeComparability
  confidence
  provenanceId
  assessedAt
}
```

Fields that are not applicable to a signal remain absent/null rather than being populated with neutral defaults.

## 16. ReasonCode Constitution

Reason codes describe observed facts or contract failures. They must not speculate about market causes.

Canonical initial registry:

```text
LIMITED_TEMPORAL_DEPTH
NO_COMPARABLE_WINDOW
WINDOW_DURATION_MISMATCH
UNSTABLE_SCAN_SCOPE
SAMPLING_POLICY_CHANGED
SOURCE_POLICY_CHANGED
INCOMPATIBLE_MODEL_VERSION

INSUFFICIENT_OBSERVED_PRODUCTS
LOW_TEMPORAL_COMPARABILITY
LOW_PARTICIPATION
LOW_OBSERVATION_RELIABILITY

LOW_QUERY_OBSERVATION
LOW_QUERY_COMPARABILITY
INCOMPLETE_SURFACE_COVERAGE

LOW_ATTRIBUTION_COVERAGE
NO_ATTRIBUTED_PRODUCTS

SMALL_PEER_GROUP
LOW_PEER_COMPARABILITY
LOW_PEER_SPREAD
HIGH_TIE_DENSITY

INSUFFICIENT_MOVEMENT_ELIGIBILITY
CAP_RELAXED_FOR_SMALL_PEER_SET
ZERO_BASELINE_DELTA
MISSING_REQUIRED_COMPONENT
```

The same factual code may be `INFO`, `DEGRADE`, or `SUPPRESS` only as declared by that signal's versioned requirement contract.

Example:

```text
CAP_RELAXED_FOR_SMALL_PEER_SET
```

can be an informational provenance code when the mathematically feasible fallback remains valid. It does not automatically mean the signal is invalid.

## 17. Confidence Constitution

Confidence is not eligibility and cannot create evidence that does not exist.

### 17.1 Legacy confidence

Current v0.1 product/catalog/data-quality confidence formulas and hard caps remain frozen during C1 parity.

They must be identified explicitly as legacy/versioned fields, conceptually:

```text
legacyConfidenceScore
legacyConfidenceModelVersion
```

C1 must not reinterpret those numbers as the new Evidence Constitution.

### 17.2 Evidence confidence

Future contract:

```text
ConfidenceAssessment
{
  score: float64 | null
  band: UNCALIBRATED | LOW | MEDIUM | HIGH
  modelVersion
  reasonCodes
}
```

Until a signal-specific confidence model is calibrated:

```text
score = null
band = UNCALIBRATED
```

The following are explicitly:

```text
TO_BE_CALIBRATED
```

- component weights;
- nonlinear transforms;
- band boundaries;
- whether different signal families require different confidence models.

No default `50` is permitted for uncalibrated confidence.

## 18. Deterministic Assessment Order

Production evaluation must follow this precedence:

```text
1. Resolve the signal + model version.
2. Load that signal's SignalEvidenceRequirement.
3. Validate required raw inputs.
4. Determine ScopeComparabilityResult where temporal comparison applies.
5. Apply deterministic mathematical/semantic prerequisites.
6. Determine the maximum EvidenceStage justified by available history.
7. Evaluate signal-specific configurable evidence conditions.
8. If any blocking prerequisite fails:
       eligibility = SUPPRESSED
       value = null
9. Else compute the signal value using its model version.
10. If any non-blocking requirement is below policy:
       eligibility = DEGRADED
    else:
       eligibility = ELIGIBLE
11. Attach factual reason codes and provenance.
12. Evaluate confidence separately if a calibrated confidence model exists.
13. Generate UI narrative only from:
       signal semantics
       × EvidenceStage
       × SignalEligibility
       × reason codes
```

Important invariants:

```text
high confidence cannot upgrade SUPPRESSED
high confidence cannot upgrade COMPOSITION_ONLY into trend
ELIGIBLE does not mean ESTABLISHED_TREND
ESTABLISHED_TREND does not mean every signal is ELIGIBLE
```

---

# SIGNAL-SPECIFIC REQUIREMENT EXAMPLES

## 19. Directional Breadth

Claim:

> Directional balance among products with valid comparable temporal direction.

Deterministic requirements:

```text
comparable products > 0
underlying product direction has at least current + prior comparable evidence
window duration comparable for the underlying direction comparison
scope compatible for the underlying movement calculation
```

Evidence stage:

```text
minimum claim stage = MOVEMENT_INDICATION
```

Signal-specific thresholds:

```text
minimum observed products          = TO_BE_CALIBRATED
minimum temporal comparability     = TO_BE_CALIBRATED
preferred movement participation   = TO_BE_CALIBRATED
query/surface completion thresholds = TO_BE_CALIBRATED where required by the direction model
observation reliability            = TO_BE_CALIBRATED
```

Rules:

- if `ComparableProducts == 0`: `SUPPRESSED`, `value=null`, reason `NO_COMPARABLE_WINDOW` or `LIMITED_TEMPORAL_DEPTH` as appropriate;
- do **not** emit neutral `50` as a substitute;
- low temporal comparability can degrade interpretation even if the breadth formula is mathematically defined;
- low movement participation should prevent “broad market move” language even when directional balance can still be computed.

## 20. Competition Momentum v0.1

Claim:

> Two-window change in unique observed product count inside the declared comparable scope.

Deterministic requirements:

```text
at least 2 comparable windows
scope comparable
window duration comparable
same approved competition-count definition
sampling/source policy stable or explicitly declared compatible
```

Signal-specific thresholds:

```text
minimum observed products      = TO_BE_CALIBRATED
query comparability            = TO_BE_CALIBRATED
surface completion             = TO_BE_CALIBRATED
observation reliability        = TO_BE_CALIBRATED
```

Zero baseline:

The current v0.1 formula maps:

```text
previous == 0 && current > 0 → 100
```

C1 must preserve that exact numeric behavior. In the future evidence wrapper this special case should carry:

```text
ZERO_BASELINE_DELTA
```

and may be `DEGRADED` under the versioned requirement policy because ordinary percentage-growth interpretation has no non-zero denominator.

## 21. Competition Acceleration v0.2

Claim:

> Change in first-order competition movement between adjacent comparable transitions.

Deterministic requirements:

```text
at least 3 comparable windows
transition(t-2→t-1) valid
transition(t-1→t0) valid
scope comparable across all windows
window durations comparable
same competition measure/model across transitions
sampling/source policy stable or explicitly compatible
```

If fewer than three comparable windows exist:

```text
value = null
eligibility = SUPPRESSED
reasonCode = LIMITED_TEMPORAL_DEPTH
```

All sample/reliability/participation thresholds beyond this mathematical minimum are:

```text
TO_BE_CALIBRATED
```

## 22. Peer Relative Rank (PRR)

Claim:

> Relative percentile position inside the declared comparable peer universe using a declared peer-score definition.

Deterministic requirements:

```text
PeerDefinition present and versioned
peer score present for the subject
at least 2 members including the subject for a genuine comparative claim
same peer-score definition across ranked members
```

Preferred evidence requirements:

```text
preferred peer-group size      = TO_BE_CALIBRATED
minimum comparable peer share  = TO_BE_CALIBRATED
minimum peer spread            = TO_BE_CALIBRATED
maximum tie density            = TO_BE_CALIBRATED
```

Important compatibility rule:

Current v0.1 single-peer percentile behavior returns `50`. C1 freezes that legacy result. The future PRR evidence assessment must nevertheless mark a one-member peer universe as:

```text
value = null for the defensible PRR claim
eligibility = SUPPRESSED
reasonCode = SMALL_PEER_GROUP
```

without rewriting the historical legacy field.

`EvidenceStage` for PRR is inherited from the peer-score definition. A non-temporal peer score may be `COMPOSITION_ONLY`; an ODMI-based PRR inherits movement/trend requirements from ODMI.

## 23. Author Concentration

Claim:

> Concentration of attributed unique observed products among observed authors in the current scope.

Deterministic requirements:

```text
observed products > 0
attributed products > 0
```

Evidence stage:

```text
COMPOSITION_ONLY is sufficient
```

Attribution coverage requirement:

```text
minimum attribution coverage = TO_BE_CALIBRATED
```

Rules:

- zero attributed products → `SUPPRESSED`, `value=null`, `NO_ATTRIBUTED_PRODUCTS`;
- non-zero attribution with low coverage may remain mathematically valid **within the attributed subset**, but must be `DEGRADED` when the signal-specific threshold says so;
- UI must not generalize subset concentration to sales/revenue/market-power concentration.

## 24. Author Concentration Change

Claim:

> Change in attributed observed-product concentration between comparable windows.

Deterministic requirements:

```text
at least 2 comparable windows
scope comparable
window duration comparable
attributed products > 0 in each compared window
same author-attribution definition
sampling/source policy stable or explicitly compatible
```

Signal-specific thresholds:

```text
minimum attribution coverage in each window = TO_BE_CALIBRATED
minimum observed products                   = TO_BE_CALIBRATED
observation reliability                     = TO_BE_CALIBRATED
```

A scope or attribution-definition incompatibility suppresses the dynamic claim rather than converting missing change to zero.

## 25. Structural Composition Index

Claim:

> Current observed structural composition/concentration of eligible child segments.

Evidence stage:

```text
COMPOSITION_ONLY is sufficient
```

Deterministic base requirements:

```text
at least 1 eligible child segment
positive declared product mass for the relevant parent
segment/parent identity available
```

Current v0.1 configured weighting caps and deterministic cap relaxation remain parity behavior.

If the cap is relaxed because the peer set is too small for the configured cap:

```text
reasonCode = CAP_RELAXED_FOR_SMALL_PEER_SET
```

This can remain informational when the fallback is mathematically valid.

Derived family members have their own requirements. For example, a weighting-gap comparison needs multiple eligible children to carry meaningful cross-child dispersion semantics; it must not rely on a universal structural-index eligibility flag.

Sample size, child share, surface completion, and reliability thresholds are:

```text
TO_BE_CALIBRATED
```

## 26. Signed Movement Divergence v0.2

Claim:

> Difference between product-mass-weighted movement and equal-segment movement across movement-eligible child segments.

Formula:

```text
SignedMovementDivergence
= ProductMassWeightedMovement
- EqualSegmentMovement
```

Deterministic requirements:

```text
movement evidence available
scope comparable
window duration comparable
same child movement model/version
at least 2 movement-eligible child segments
all included child values individually not SUPPRESSED
```

Signal-specific thresholds:

```text
minimum eligible-child share        = TO_BE_CALIBRATED
minimum segment movement participation = TO_BE_CALIBRATED
minimum observation reliability     = TO_BE_CALIBRATED
```

If fewer than two movement-eligible child segments remain:

```text
value = null
eligibility = SUPPRESSED
reasonCode = INSUFFICIENT_MOVEMENT_ELIGIBILITY
```

A low eligible-child share may degrade or suppress only according to the versioned signal requirement; C0 does not invent the numeric breakpoint.

---

# PERSISTENCE + API CONSTITUTION

## 27. Preserve v0.1 History

Current ranking and integrity persistence is append-oriented JSONL, and current v0.1 snapshot fields use non-null numeric fields for many existing signals.

C0 therefore rejects an in-place rewrite of historical rows.

C1 must preserve existing persisted behavior exactly.

C2/C3 should add a versioned per-signal result/evidence layer equivalent to:

```text
SignalResult
{
  signalId
  signalModelVersion
  value: number | null
  evidence: EvidenceAssessment
}
```

Legacy snapshots remain readable and auditable.

## 28. Additive Evidence Persistence

Recommended future persistence unit:

```text
SignalEvidenceAssessmentRecord
```

with append-only/versioned identity containing:

```text
assessmentId
runId
entityType
entityId
signalId
signalModelVersion
requirementsVersion
valuePresent
EvidenceAssessment
provenanceId
assessedAt
```

A suppressed signal stores the evidence assessment while the value remains absent/null.

This is preferable to mutating legacy snapshot rows because it preserves parity fixtures and historical reproducibility.

## 29. UI Narrative Gate

UI language must be produced from the evidence contract, not from raw score magnitude alone.

Examples:

```text
COMPOSITION_ONLY × ELIGIBLE
→ “Current observed composition …”

MOVEMENT_INDICATION × DEGRADED
→ “Early observed movement indication; limited comparable coverage …”

ESTABLISHED_TREND × SUPPRESSED
→ no signal narrative for that suppressed signal
```

Prohibited:

```text
missing → neutral
partial evidence → confident trend narrative
PRR 100 → “market strength 100”
structural concentration gap → “performance divergence”
two-window growth → “acceleration”
```

---

# AUDITS 1–6 CONSISTENCY REVIEW

## 30. Resolved Inconsistencies

### 30.1 Legacy global DirectionStage vs per-signal evidence

Current Alpha6.5 orchestration derives one global `DirectionStage` and propagates it into several product/catalog outputs.

Resolution:

```text
C1: freeze this v0.1 behavior for parity.
C2/C3: EvidenceStage becomes per-signal/per-assessment, not a global authorization for every signal.
```

### 30.2 Legacy confidence vs eligibility

Current product/catalog/data-quality confidence is a composite numeric score with hard caps.

Resolution:

```text
C1: exact parity.
C2/C3: eligibility is a separate contract; confidence may not create eligibility.
```

### 30.3 Legacy fixed stage counts vs calibrated constitution

Older roadmap text describes fixed comparable-run thresholds for preliminary/established/seasonality stages.

Resolution:

```text
current direction-stage-v0.1 thresholds = legacy parity behavior
future EvidenceStage promotion thresholds = TO_BE_CALIBRATED
true acceleration mathematical minimum = 3 comparable windows
```

### 30.4 CompatibilityKey vs evidence quality

Current exact `CompatibilityKey` matching is useful but does not prove completion, attribution, reliability, or participation.

Resolution:

```text
ScopeComparabilityResult extends the current identity contract;
it does not replace signal-specific evidence checks.
```

### 30.5 Universal `DataQualityGrade != D` eligibility

Current segment-index code commonly uses DataQuality Grade D as an exclusion boundary.

Resolution:

```text
C1: freeze existing behavior.
C2/C3: no universal grade-based eligibility; each signal declares its own requirements.
```

### 30.6 Composition fallback must not authorize movement

Current orchestration can preserve a site-level composition signal when taxonomy is ambiguous.

Resolution:

```text
valid for COMPOSITION_ONLY where semantics remain factual;
never sufficient by itself for movement/trend claims.
```

### 30.7 Structural index direction semantics

Current direction logic may compare structural `VolumeWeightedValue` / `EqualSectorValue` across runs.

Resolution:

```text
C1: preserve exact legacy output.
C2: rename/reframe structural semantics.
C3: movement index family uses actual movement child signals before signed movement divergence is emitted.
```

### 30.8 PRR circularity

Current code avoids direct final-self-reference using a pre-rank step, but future ODMI/PRR redesign could accidentally reintroduce circularity.

Resolution:

```text
ODMI = peer-independent
PRR  = rank(approved peer score)
ODMI must not consume finalized PRR
```

## 31. No Remaining Conceptual Circular Dependency

After the resolutions above, the intended dependency direction is:

```text
observed facts
→ scope/evidence qualification
→ peer-independent atomic movement/composition signals
→ optional peer-relative ranking
→ optional aggregate/divergence signals
→ confidence assessment
→ UI interpretation
```

Not:

```text
confidence → eligibility
PRR → ODMI → PRR
composition → performance claim
coverage → invented population
missing → neutral score
```

---

# PHASE BOUNDARIES AFTER C0

## 32. Phase C1 — Behavior Freeze + Rust Parity

C1 is strictly migration/parity work:

```text
freeze current Go v0.1 behavior
capture deterministic golden fixtures
implement exact Rust parity
prove Go↔Rust integration parity
remove duplicate production Go formulas only after parity evidence
```

C1 must not:

```text
rename persisted semantics
change formula weights
change legacy stage thresholds
replace legacy confidence
introduce C3 evidence thresholds
silently correct current zero-baseline behavior
```

## 33. Phase C2 — Semantic Correction

C2 may introduce versioned naming/contracts such as:

```text
ExposureBreadth → Directional Breadth
RelativeStrength → Peer Relative Rank
CompetitionAcceleration legacy meaning → Competition Momentum v0.1
structural “performance/divergence” labels → composition/concentration terminology
```

Backward compatibility must remain explicit.

## 34. Phase C3 — Evidence-Calibrated Signal Model v0.2

C3 may implement:

```text
per-signal SignalEvidenceRequirement
EvidenceAssessment persistence
EvidenceStage evaluation
SignalEligibility
ScopeComparabilityResult
calibrated confidence
true acceleration
ODMI + Momentum Magnitude + PRR
movement index family
seasonality candidate research
```

Only after calibration evidence exists may `TO_BE_CALIBRATED` thresholds become approved numeric production parameters.

## 35. Python Quant Research / Calibration Lab Role

Future Python is an offline research/calibration environment for:

```text
threshold calibration
backtesting
stability analysis
sensitivity analysis
confidence-model fitting
seasonality validation
peer-size robustness
coverage/participation breakpoints
```

Python does not become the production runtime.

---

# GATES + STATUS

## 36. Phase C0 Completion Status

```text
Audit #1 — Supply / Competition             COMPLETE / REVIEWED
Audit #2 — Market Breadth Family            COMPLETE / REVIEWED
Audit #3 — Relative Strength Family         COMPLETE / REVIEWED
Audit #4 — Author Concentration Family      COMPLETE / REVIEWED
Audit #5 — Index / Divergence Family        COMPLETE / REVIEWED
Audit #6 — Evidence + Confidence Contract   COMPLETE / REVIEWED
```

Document status:

```text
FINAL DESIGN
APPROVAL READY
NOT YET AUTHORIZED FOR PRODUCTION C1 EXECUTION
```

## 37. Production Gate

At the time this specification was finalized, repository evidence still showed:

```text
Windows Installer Lifecycle = NOT YET VERIFIED PASS
```

Therefore:

```text
Phase C0 documentation/spec work       allowed
Phase C1 implementation                blocked
Phase C2 production implementation     blocked
Phase C3 production implementation     blocked
```

C1 may begin only after:

```text
1. Windows Installer Lifecycle = COMPLETE / VERIFIED
2. this Phase C0 specification receives explicit user approval
```

unless the user explicitly changes the gate.

## 38. Final Constitution

The Phase C signal engine must preserve this dependency:

```text
observed facts
→ explicit signal semantics
→ evidence qualification
→ deterministic computation
→ calibrated confidence where available
→ defensible interpretation
```

The engine must never reverse that chain by allowing a score, name, confidence number, or implementation language to imply evidence that was not observed.
