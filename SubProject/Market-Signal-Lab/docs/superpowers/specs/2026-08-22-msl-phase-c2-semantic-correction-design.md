# MSL Phase C2 Semantic Correction / Defensible Naming Design

**Date:** 2026-08-22 (Asia/Jakarta)
**Status:** DESIGN APPROVED / SPEC FOR REVIEW / NOT IMPLEMENTED
**Repository:** `rendevouz999/Market-Signal-Lab`
**Predecessor:** Phase C1 COMPLETE / VERIFIED
**Constitution:** `docs/superpowers/specs/2026-08-18-msl-phase-c0-signal-truth-audit.md`

## 1. Purpose

Phase C2 corrects misleading public semantics without changing the frozen C1 v0.1 numerical behavior.

The governing rule is:

```text
same observed evidence
→ same C1 numeric result
→ more defensible C2 name and presentation
```

C2 is a semantic projection and compatibility phase. It is not a new scoring model, not a confidence redesign, and not a temporal-evidence calibration phase.
## 2. Locked Boundaries

C2 must preserve all C1 product evidence and architecture:

- Rust remains the mandatory production analytics plane for migrated kernels.
- `msl-analytics/2` operation IDs, schema `1`, binary framing, and C1 golden fixtures remain unchanged.
- Existing v0.1 persisted JSONL fields remain readable and are not rewritten in place.
- Existing model versions and model refs remain stable unless a new semantic-only display contract is added beside them.
- Go continues to own IDs, timestamps, provenance, persistence, HTTP, UI, credentials, and semantic projection.
- Rust remains secret-blind.
- No production Go numerical fallback may return.
- No numeric weight, threshold, clamp, percentile, HHI, confidence cap, ranking order, or structural arithmetic changes in C2.

C2 must not implement C3 concepts:

```text
EvidenceStage evaluation
SignalEligibility
calibrated confidence
true acceleration
ODMI / Momentum Magnitude
movement index family
seasonality qualification
new evidence thresholds
```
## 3. Architecture

C2 adds a pure Go read-time semantic projection layer between legacy v0.1 persisted/domain data and public presentation surfaces.

```text
C1 persisted v0.1 snapshot / history
        ↓ unchanged
C1 domain + Rust numeric result
        ↓ unchanged
Go semantic projector v0.2
        ↓
versioned semantic view
        ↓
HTTP response aliases + UI copy
```

The projector must be deterministic, side-effect free, and numerically identity-preserving: every projected numeric semantic value is copied from an existing C1 field, not recomputed.

Canonical semantic contract version:

```text
msl-semantic-contract/2
```

The semantic contract version is independent from numeric `ModelVersion`. A semantic rename does not imply a new ranking formula.
## 4. Canonical Semantic Mapping

C2 defines these public semantic aliases while retaining the legacy fields internally and for backward compatibility.

| Legacy v0.1 field | C2 semantic name | Meaning |
|---|---|---|
| `ProductSnapshot.RelativeStrength` | `PeerRelativeRank` | Percentile-like rank inside the declared product peer group; not absolute strength. |
| `ProductSnapshot.OpportunityScore` | `ProductInsightScore` | Composite observed-market product insight score; not entry timing or success probability. |
| `CatalogSnapshot.ExposureBreadth` | `DirectionalBreadth` | Relative balance of rising vs falling comparable products. |
| `CatalogSnapshot.NewSupplyVelocityPercent` | `ObservedNewSupplyGrowthPercent` | Two-window change in newly observed supply. |
| `CatalogSnapshot.NewSupplyVelocityIndex` | `ObservedNewSupplyMomentumIndex` | Existing normalized v0.1 new-supply change index. |
| `CatalogSnapshot.CompetitionAcceleration` | `CompetitionMomentumPercent` | Two-window change in unique observed product competition; not acceleration. |
| `CatalogSnapshot.RelativeStrength` | `PeerRelativeRank` | Percentile-like rank inside the declared catalog peer group. |
| `CatalogSnapshot.OpportunityScore` | `CatalogInsightScore` | Composite observed-market catalog insight score; not entry timing. |
| `MarketIndexSnapshot.CompositionIndex` | `ObservedSegmentComposition` | Observed segment composition inside its parent scope. |
| `MarketIndexSnapshot.VolumeWeightedValue` | `CappedCompositionConcentration` | Existing capped volume/product-mass-weighted structural composition value. |
| `MarketIndexSnapshot.EqualSectorValue` | `MeanEligibleSegmentComposition` | Existing equal-eligible-segment structural mean. |
| `MarketIndexSnapshot.DivergenceValue` | `CompositionWeightingGap` | Difference between capped weighted and equal-segment structural composition values. |
The existing `CompetitionMomentumIndex` already uses the defensible C2 term and therefore remains unchanged.

`TrendScore`, `Direction`, `Confidence`, and `Coverage` are not renamed in C2. Their deeper evidence qualification belongs to C3. Structural snapshot `TrendScore` / `OpportunityScore` remain legacy compatibility fields and must not be promoted in new C2 UI as generic market-trend or market-opportunity evidence.

## 5. Semantic View Types

The semantic projector should produce explicit read-model types rather than mutate persistence structs.

```go
type SemanticContract struct {
    Version string `json:"version"`
}

type ProductSemanticV2 struct {
    Contract            SemanticContract `json:"contract"`
    PeerRelativeRank    float64          `json:"peerRelativeRank"`
    ProductInsightScore float64          `json:"productInsightScore"`
}

type CatalogSemanticV2 struct {
    Contract                       SemanticContract `json:"contract"`
    DirectionalBreadth             float64          `json:"directionalBreadth"`
    ObservedNewSupplyGrowthPercent float64          `json:"observedNewSupplyGrowthPercent"`
    ObservedNewSupplyMomentumIndex float64          `json:"observedNewSupplyMomentumIndex"`
    CompetitionMomentumPercent     float64          `json:"competitionMomentumPercent"`
    PeerRelativeRank               float64          `json:"peerRelativeRank"`
    CatalogInsightScore            float64          `json:"catalogInsightScore"`
}
```
```go
type StructuralSemanticV2 struct {
    Contract                       SemanticContract `json:"contract"`
    ObservedSegmentComposition     float64          `json:"observedSegmentComposition"`
    CappedCompositionConcentration float64          `json:"cappedCompositionConcentration"`
    MeanEligibleSegmentComposition float64          `json:"meanEligibleSegmentComposition"`
    CompositionWeightingGap        float64          `json:"compositionWeightingGap"`
}
```

Suggested package boundary:

```text
internal/semantics
  ranking_v2.go
  structural_v2.go
  registry.go
```

This package may depend on `internal/domain`, but it must not depend on storage, HTTP, Rust transport, or UI code.

## 6. HTTP Compatibility Contract

Existing routes remain stable. C2 does not replace `/api/ranking/*` or rewrite legacy JSON keys.

Ranking/explorer/watchlist response rows that already expose a snapshot gain an additive `semantics` object containing the corresponding C2 semantic view. Existing `snapshot` data remains unchanged.

```json
{
  "snapshot": { "relativeStrength": 73.4, "opportunityScore": 68.2 },
  "semantics": {
    "contract": { "version": "msl-semantic-contract/2" },
    "peerRelativeRank": 73.4,
    "productInsightScore": 68.2
  }
}
```
C2 deliberately does not rename existing query parameters such as `minOpportunity`; those are compatibility API parameters tied to legacy stored fields. UI labels must use C2 terminology while the transport may continue sending the legacy parameter until a separately versioned API migration is justified.

New C2 API documentation must state that legacy keys are compatibility aliases and must not be interpreted according to their old misleading names.

## 7. Persistence and Migration Policy

There is no destructive data migration in C2.

- Existing JSONL history stays byte-compatible and readable.
- `ProductSnapshot`, `CatalogSnapshot`, `MarketIndexSnapshot`, provenance score types, and C1 fixture JSON field names remain unchanged.
- No background rewrite of history is allowed.
- New semantic names are derived at read time.
- Historical model refs such as `product-opportunity-v0.1` remain historical identifiers.
- Model registry display notes may be corrected, but `Name`, `Version`, `Kind`, weight keys, and numeric weights stay unchanged in C2.

This preserves reproducibility: a historical snapshot can still be reconstructed using its original C1 contract while modern UI/API consumers receive a safer semantic projection.

## 8. Opportunity / Insight Boundary

C2 corrects ranking `OpportunityScore` presentation only where that field is the C1 composite ranking score.
It becomes:

```text
ProductSnapshot.OpportunityScore → Product Insight Score
CatalogSnapshot.OpportunityScore → Catalog Insight Score
```

The semantic contract must explicitly say these scores are not:

```text
market-entry timing
buy/sell/hold advice
success probability
expected revenue
competitor earnings
certainty of future demand
```

The separate legacy `Market Opportunity` analysis surface is not automatically renamed by C2 unless its own formula lineage is explicitly shown to be the same C1 ranking score. C2 must not silently relabel a different subsystem merely because it uses the word “opportunity”.

## 9. Structural Semantics Boundary

Structural C2 presentation must prefer composition/concentration language. New C2 UI must not describe `VolumeWeightedValue`, `EqualSectorValue`, or `DivergenceValue` as market performance.

Where structural snapshots also contain legacy `TrendScore` / `OpportunityScore`, C2 may retain those fields for compatibility but must avoid promoting them as generic market-trend or market-entry claims. C3 is responsible for a true movement-index family and evidence-qualified structural dynamics.
## 10. UI Copy Contract

Ranking, explorer, watchlist, comparison, and structural integrity surfaces fed by C1 snapshot fields must use C2 terminology.

Canonical English labels:

```text
Product Insight Score
Catalog Insight Score
Peer Relative Rank
Directional Breadth
Observed New-Supply Growth
Observed New-Supply Momentum
Competition Momentum
Observed Segment Composition
Capped Composition Concentration
Mean Eligible Segment Composition
Composition Weighting Gap
```

Canonical Indonesian labels:

```text
Skor Insight Produk
Skor Insight Katalog
Peringkat Relatif Kelompok Pembanding
Keluasan Arah Produk
Pertumbuhan Pasokan Baru Teramati
Momentum Pasokan Baru Teramati
Momentum Persaingan Teramati
Komposisi Segmen Teramati
Konsentrasi Komposisi Berbatas
Rata-rata Komposisi Segmen Layak
Selisih Pembobotan Komposisi
```
Visible copy must remove or reframe phrases such as `entry opportunity`, `opportunity gap`, or `competition accelerating` when they refer to these C1 ranking fields.

The UI may still show the legacy field name inside an audit/provenance compatibility view if it is clearly labeled `Legacy v0.1 field` and paired with the C2 semantic name.

## 11. Model Registry Presentation

C2 does not rename persisted model identifiers or versions. For example:

```text
product-opportunity-v0.1
catalog-opportunity-v0.1
```

remain valid historical identifiers.

However, their human-readable `Notes` must no longer describe entry timing. The model registry presentation layer may add a semantic display name, for example:

```text
product-opportunity-v0.1 → Product Insight Score (legacy numeric model)
catalog-opportunity-v0.1 → Catalog Insight Score (legacy numeric model)
```

Weight-map keys such as `relative_strength`, `new_product_velocity`, or `market_breadth` remain frozen C1 numeric-contract identifiers. They are not silently renamed inside the Rust protocol or golden fixtures.

## 12. Missing / Legacy Edge Cases

C2 does not numerically fix awkward v0.1 behavior. In particular, `ExposureBreadth == 50` when no products are comparable remains part of the C1 oracle.

The C2 presentation must not claim that this value proves neutral directional evidence. Where `ComparableProducts == 0`, UI copy should identify the value as a legacy compatibility result and avoid interpretive language such as “balanced market”. Full missing/eligibility semantics remain C3 work.
## 13. Error Handling

Semantic projection should fail closed only for impossible internal contract violations, such as a projection function receiving an unsupported semantic contract version.

Ordinary legacy snapshots require no migration error path. Projection copies values already present in the snapshot.

HTTP behavior:

- legacy response fields remain available even if semantic projection fails unexpectedly;
- server logs the projection error without including credentials or raw market secrets;
- new `semantics` data must never be partially populated with invented defaults;
- no semantic projection failure may trigger a Go analytics fallback or recomputation.

## 14. Expected File Boundaries

Likely implementation files:

```text
Create: internal/semantics/registry.go
Create: internal/semantics/ranking_v2.go
Create: internal/semantics/ranking_v2_test.go
Create: internal/semantics/structural_v2.go
Create: internal/semantics/structural_v2_test.go
Modify: internal/app/ranking_view.go
Modify: internal/app/explorer_service.go
Modify: internal/app/alpha65_orchestration.go only for read-model projection where required
Modify: internal/web/ranking_handlers.go and relevant explorer/watch handlers
Modify: internal/web/assets/js/app.js
Modify: internal/web/templates/index.html only where static legacy labels are visible
Modify: internal/i18n/locales/en.json
Modify: internal/i18n/locales/id.json
Modify: internal/ranking/models.go notes only
```
C2 should avoid touching `engines/rust` unless a source-level compatibility assertion is needed. No Rust computation change is expected.

## 15. Test Strategy

C2 is accepted only with evidence that semantics changed while numbers did not.

Required tests:

1. **Projection identity tests** — every C2 numeric alias exactly equals its legacy v0.1 source field.
2. **API additive compatibility tests** — legacy JSON fields remain and new `semantics.contract.version` equals `msl-semantic-contract/2`.
3. **Persistence immutability tests** — existing v0.1 JSONL can be read without rewrite; projection does not mutate stored rows.
4. **Golden protection** — C1 product/catalog/structural fixture SHA-256 values remain unchanged.
5. **Rust regression** — existing Rust suite remains green with no operation/schema changes.
6. **Go regression** — repository-wide Go suite remains green with a healthy release Rust worker.
7. **UI semantic-copy tests** — ranking/explorer/watchlist/structural surfaces use C2 labels and reject prohibited entry-timing wording for C1 ranking fields.
8. **Locale parity tests** — English and Indonesian contain all C2 semantic keys.
9. **Legacy filter compatibility** — existing query parameters such as `minOpportunity` continue to work.
10. **History regression** — history created before C2 remains readable and produces the same legacy numbers plus deterministic semantic aliases.

No test may update the C1 golden files merely to make C2 pass.
## 16. Acceptance Criteria

C2 is complete only when all of the following are true:

```text
C1 golden fixture fingerprints unchanged
C1 Rust wire protocol unchanged
C1 numeric outputs unchanged
legacy JSON/history readable without rewrite
new semantic aliases available in public read models
ranking UI uses defensible C2 names
product/catalog OpportunityScore no longer presented as entry timing
CompetitionAcceleration no longer presented as acceleration
RelativeStrength no longer presented as absolute strength
ExposureBreadth no longer presented as generic exposure breadth
structural weighted/equal/divergence labels use composition terminology
English + Indonesian copy aligned
full Go regression green
full Rust regression green
native installed smoke confirms semantic UI/API without breaking Rust health
```

## 17. Explicit Non-Goals

C2 does not:

- recalibrate confidence;
- decide whether a signal is eligible;
- add new temporal stage thresholds;
- infer unseen market population;
- create sales/revenue/reputation claims;
- introduce true acceleration;
- introduce ODMI or movement divergence v0.2;
- alter C1 weighting or ranking formulas;
- rewrite old JSONL history;
- remove legacy fields required by compatibility consumers;
- merge to `main` implicitly.
## 18. C2 → C3 Handoff

C2 leaves the engine with two clearly separated layers:

```text
legacy v0.1 numeric contract
+ defensible semantic projection v0.2
```

C3 may then introduce genuinely new evidence-qualified models rather than overloading renamed C1 numbers.

C3 must use new versioned contracts for:

```text
EvidenceStage
SignalEligibility
ScopeComparabilityResult
calibrated confidence
true acceleration
ODMI
Momentum Magnitude
movement index family
seasonality candidate research
```

The C2 semantic projector must remain useful for historical v0.1 snapshots even after C3 exists.

## 19. Final Design Decision

The approved C2 strategy is **additive semantic projection, not destructive rename**.

This is preferred over direct field renaming because it preserves historical reproducibility, existing API clients, Rust parity evidence, and JSONL auditability while immediately correcting what researchers see and how the system describes its evidence.

Production implementation is not authorized by this document alone until this written spec is reviewed and accepted. After acceptance, a separate TDD implementation plan must be written before code changes begin.
