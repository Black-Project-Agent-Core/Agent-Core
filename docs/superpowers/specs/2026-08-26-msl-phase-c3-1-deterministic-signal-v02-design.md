# Market Signal Lab — Phase C3.1 Deterministic Signal v0.2 Design

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** IMPLEMENTATION AUTHORIZED BY EXPLICIT USER CONTINUATION
**Branch:** `task/c3-1-deterministic-signal-v02-20260826`
**Baseline:** `ded29d898d8edfc11d3987ac09acb0ebf67ef17a` (C3.0 COMPLETE / VERIFIED)
**Formal release:** NOT RELEASED

## 1. Purpose

C3.1 adds deterministic, separately versioned numerical signal families after the C3.0 evidence constitution. It does not introduce statistical calibration, probability, market-entry timing, or upper-stage trend promotion.

The binding dependency direction remains:

```text
observed facts
→ evidence qualification
→ peer-independent deterministic movement
→ optional peer-relative ranking
→ optional aggregate/divergence signals
→ uncalibrated confidence
→ UI interpretation
```

C1 legacy numerics, C2 `msl-semantic-contract/2`, and C3.0 persisted assessments remain immutable.

## 2. Source-derived requirements vs new C3.1 design decisions

Source-derived from C0/C3:
- true competition acceleration requires three comparable windows;
- PRR requires a declared versioned peer score and at least two peers;
- ODMI must be peer-independent and must not consume finalized PRR;
- Author Concentration Change is the change in the approved observed author-product concentration measure across comparable windows;
- Signed Movement Divergence is `ProductMassWeightedMovement - EqualSegmentMovement` and requires at least two movement-eligible children;
- statistically tuned sample/reliability/coverage/participation thresholds remain `TO_BE_CALIBRATED`;
- C3.1 remains capped at `MOVEMENT_INDICATION`.

C0 did **not** supply a numerical ODMI formula. C3.1 therefore makes the following explicit new design decision rather than presenting it as inherited truth:

```text
ODMI v0.2
= 100 × (RisingProducts - FallingProducts) / ComparableProducts
where ComparableProducts = RisingProducts + NeutralProducts + FallingProducts
```

This is a zero-centered, peer-independent directional-balance measure on `[-100, 100]`. It is intentionally the signed counterpart of the already-approved Directional Breadth balance, avoiding new arbitrary weights. It does not claim demand, success probability, or absolute market strength.

```text
MomentumMagnitude v0.2 = abs(ODMI v0.2)
```

Momentum Magnitude expresses strength of the observed directional imbalance only; it removes sign and does not add evidence.

## 3. Deterministic formulas

### 3.1 Competition Acceleration v0.2

For unique observed-product counts `N[t-2], N[t-1], N[t0]`:

```text
Dprev = SignedDeltaPercent(N[t-1], N[t-2])
Dcurr = SignedDeltaPercent(N[t0],   N[t-1])
CompetitionAccelerationV02 = round1(Dcurr - Dprev)
```

Unit: percentage points of first-order competition movement. The existing C1 `SignedDeltaPercent` zero-baseline/clamp/round behavior is reused inside Rust for deterministic continuity, but the new acceleration model is separately versioned. If either transition uses a zero denominator with positive current count, provenance carries `ZERO_BASELINE_DELTA`.

### 3.2 ODMI / Momentum Magnitude v0.2

```text
Comparable = Rising + Neutral + Falling
ODMI = round1(100 × (Rising - Falling) / Comparable)
MomentumMagnitude = round1(abs(ODMI))
```

`Comparable == 0` is invalid input and the evidence-qualified result is suppressed.

### 3.3 PRR over ODMI v0.2

Peer score definition:

```text
catalog-odmi-peer/1
```

PRR uses the existing tie-aware percentile definition over ODMI values but the C3.1 kernel rejects a peer universe smaller than two. The subject and every ranked peer must use the same ODMI model version and peer definition.

### 3.4 Author Concentration Change v0.2

The approved current-state concentration scale remains `HHI_MSL = 100 × Σ share²`.

```text
AuthorConcentrationChangeV02
= round1(CurrentAuthorConcentration - PriorAuthorConcentration)
```

Unit: HHI points on the existing 0–100 MSL concentration scale. This is not sales/revenue/market-power change.

### 3.5 Movement Index / Signed Movement Divergence v0.2

For movement-eligible child values `x_i` and positive observed product masses `m_i`:

```text
ProductMassWeightedMovement = Σ(m_i × x_i) / Σm_i
EqualSegmentMovement        = Σx_i / n
SignedMovementDivergence    = ProductMassWeightedMovement - EqualSegmentMovement
DivergenceMagnitude         = abs(SignedMovementDivergence)
SegmentMovementParticipation = 100 × eligibleChildCount / totalChildCount
```

All values are rounded to one decimal after the canonical aggregate is computed. Negative child movement remains negative. No C1 structural composition value is repurposed as movement.

## 4. Rust ownership and wire extension

Production numerical ownership remains Rust. `msl-analytics/2` remains the protocol identity; C3.1 extends it additively with new operation IDs and schema `1`, without changing existing operation payloads or IDs:

```text
9  competition_acceleration_v02
10 directional_momentum_v02
11 peer_relative_rank_v02
12 author_concentration_change_v02
13 movement_divergence_v02
```

Handshake supported operation/schema pairs are extended additively. Existing golden protocol frames remain unchanged.

## 5. C3.1 model and evidence identities

```text
catalog.competition_acceleration.v0.2      model=competition-acceleration-v0.2
catalog.odmi.v0.2                          model=directional-momentum-v0.2
catalog.momentum_magnitude.v0.2            model=directional-momentum-v0.2
catalog.peer_relative_rank_odmi.v0.2       model=peer-relative-rank-v0.2
catalog.author_concentration_change.v0.2   model=author-concentration-change-v0.2
structural.product_mass_weighted_movement.v0.2 model=movement-divergence-v0.2
structural.equal_segment_movement.v0.2     model=movement-divergence-v0.2
structural.signed_movement_divergence.v0.2 model=movement-divergence-v0.2
structural.divergence_magnitude.v0.2       model=movement-divergence-v0.2
```

Evidence contract remains additive `msl-evidence-contract/1`.

C3.0 requirements remain `msl-evidence-requirements/1`. C3.1 signals use:

```text
msl-evidence-requirements/2
msl-evidence-stage/c3.1-1
msl-evidence-confidence/uncalibrated-1
```

Both requirement versions remain readable. Existing C3.0 assessment IDs and records are not rewritten.

## 6. Evidence requirements

Competition Acceleration:
- comparableWindowCount >= 3;
- compatible scope across both adjacent transitions;
- comparable durations;
- stable competition-count definition;
- future sample/reliability/completion thresholds remain `TO_BE_CALIBRATED`.

ODMI / Magnitude:
- comparableWindowCount >= 2;
- comparableProducts >= 1;
- scope and window duration compatible;
- future participation/reliability thresholds remain `TO_BE_CALIBRATED`.

PRR-over-ODMI:
- peer definition exactly `catalog-odmi-peer/1`;
- peerGroupSize >= 2;
- underlying stage at least `MOVEMENT_INDICATION`;
- future peer spread/share/tie thresholds remain `TO_BE_CALIBRATED`.

Author Concentration Change:
- comparableWindowCount >= 2;
- scope/window compatible;
- deterministic `attributionPresent` in both windows; because persisted C1 source exposes `ObservedProducts` plus `AuthorAttributionCoverage` rather than an exact attributed-product count, C3.1 defines this factual predicate as `ObservedProducts > 0 && AuthorAttributionCoverage > 0` and does not synthesize a count from rounded coverage;
- stable author-attribution definition;
- future attribution coverage/reliability thresholds remain `TO_BE_CALIBRATED`.

Movement divergence family:
- child movement values must come from the same approved movement model/version;
- every included child must be non-suppressed;
- product mass must be positive;
- weighted/equal movement require >=1 eligible child;
- signed divergence and divergence magnitude require >=2 eligible children;
- future eligible-child share/participation/reliability thresholds remain `TO_BE_CALIBRATED`.

## 7. Stage and confidence

C3.1 does not activate calibrated promotion. Maximum production evidence stage remains:

```text
MOVEMENT_INDICATION
```

Confidence remains:

```text
score = null
band = UNCALIBRATED
modelVersion = msl-evidence-confidence/uncalibrated-1
```

## 8. Orchestration

C3.1 builds from persisted source truth only:
- completed MarketMapRun / MarketMapPlan history;
- persisted C1 catalog snapshots;
- persisted current/prior author concentration values;
- catalog hierarchy for sibling peer universes and child aggregation.

Go orchestrates and qualifies evidence. Go must not recompute the new Rust-owned formulas.

C3.1 needs two prior completed windows for acceleration. It must fail closed when the three-window chain cannot be established.

## 9. Compatibility

- No legacy C1 snapshot field is renamed or overwritten.
- C2 semantics remain byte/source frozen.
- C3.0 requirements/version 1 remain queryable.
- Evidence API may query requirements version 2 explicitly; default version-1 behavior remains backward compatible.
- New assessments are appended to the existing evidence ledger with their own requirements version.
- Existing UI is additive and may render the new signal IDs through the generic evidence table; no stronger narrative is inferred from score magnitude.

## 10. Non-goals

C3.1 does not implement:
- statistically calibrated thresholds;
- PRELIMINARY_TREND / ESTABLISHED_TREND / SEASONALITY promotion;
- confidence fitting or numeric confidence bands;
- Python production runtime;
- market-entry timing, trading semantics, or success probability;
- rewrite of C1/C2/C3.0 history;
- implicit merge to main.

## 11. Acceptance

C3.1 is COMPLETE / VERIFIED only if:
- every new formula is implemented in Rust and exercised over the production wire;
- existing protocol frames/operation IDs remain compatible;
- C1 fixture fingerprints remain exact;
- C2 semantics remain unchanged;
- C3.0 tests and requirements version 1 remain green;
- C3.1 requirements version 2 and new assessments are deterministic/append-only;
- zero/one/insufficient-history cases suppress rather than synthesize neutral values;
- full Cargo and full Go regressions pass against a fresh release worker;
- frontend/generated contract checks remain green;
- staged Windows runtime reports `healthy / rust-production / msl-analytics/2`;
- no credential or generated acceptance artifact is tracked;
- formal release remains NOT RELEASED.
