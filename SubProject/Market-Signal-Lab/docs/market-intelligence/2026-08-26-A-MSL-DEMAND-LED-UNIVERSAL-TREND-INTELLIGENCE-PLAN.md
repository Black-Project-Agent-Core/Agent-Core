# A — MSL Demand-Led Universal Trend Intelligence Implementation Plan

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** USER-APPROVED DIRECTION — IMPLEMENTATION PLAN READY
**Canonical root:** `E:\Market-Signal-Lab`
**Paired research:** `2026-08-26-B-DESIGN-PRODUCT-AND-TREND-FORMATION-RESEARCH.md`

---

## 1. Mission

Rebuild the analytical center of Market Signal Lab so that MSL no longer treats marketplace ranking/exposure as equivalent to demand.

The target system must answer, with evidence:

```text
WHAT are users looking for?
WHY is that need growing or shrinking?
HOW persistent is the movement?
HOW much supply already exists?
IS supply keeping up with demand?
WHAT visual and functional design pattern is forming around the need?
WHICH products actually represent that pattern?
ARE multiple independent sources confirming or contradicting the conclusion?
WHAT market lifecycle state are we observing?
HOW confident may MSL be, and why?
```

The central architecture becomes:

```text
DEMAND INTELLIGENCE
        +
SUPPLY INTELLIGENCE
        +
VISIBILITY INTELLIGENCE
        +
VISUAL DESIGN INTELLIGENCE
        +
ADOPTION / SATISFACTION EVIDENCE
        +
CROSS-SOURCE CONSENSUS & CONTRADICTION
        +
TEMPORAL / SEASONAL / CHANGE-POINT ANALYSIS
        ↓
MARKET STATE ENGINE
        ↓
PRODUCT ↔ TREND FIT ENGINE
```

---

## 2. Non-negotiable semantic correction

### Existing semantics that must be demoted/reframed

Current MSL signals such as:

- exposure score;
- rank velocity;
- peer-relative rank;
- popular/featured/new placement;
- API search position;
- cross-query presence;
- product insight score;
- catalog trend score;

must no longer be sufficient to emit a market-demand `TREND` claim.

They remain useful under these axes:

```text
VISIBILITY
SUPPLY
MARKET STRUCTURE
OBSERVED MOVEMENT
```

### New permanent rule

```text
NO DIRECT/HIGH-QUALITY DEMAND EVIDENCE
=> NO CONFIRMED MARKET TREND CLAIM
```

Allowed fallback states include:

```text
OBSERVED_VISIBILITY_RISING
SUPPLY_ACCELERATING
PUBLIC_INTEREST_RISING
UNCONFIRMED_DEMAND
INSUFFICIENT_DEMAND_EVIDENCE
```

This rule must be enforced in code, tests, UI copy, documentation and reason codes.

---

## 3. Core definitions

MSL shall use these definitions consistently.

### Demand

User intent expressed through search/query behavior or equivalent first-party intent data.

### Supply

Amount, breadth and growth of available content capable of satisfying an intent.

### Visibility

How strongly products are surfaced within marketplace/search/discovery contexts.

### Adoption

Downstream user behavior after discovery, where observable: click, save, favorite, download, purchase or equivalent.

### Intent Cluster

A canonical semantic representation of multiple related queries expressing the same underlying user need.

### Visual Trend Pattern

A statistically and semantically coherent set of visual features whose prevalence is increasing within a demand cluster and/or external visual culture.

### Market Trend

A sustained directional change in demand and/or adoption across comparable time windows, with sufficient evidence quality and no unresolved contradiction invalidating the claim.

### Opportunity

A demand state where market need is meaningful or growing while matching supply, quality, differentiation or satisfaction remains insufficient.

### Product Trend Fit

How well a specific product's functional and visual DNA matches a validated demand/trend cluster. A product is a representative of a trend; it is not the trend itself.

---

## 4. Target source architecture

Sources must remain separate and source-aware. The system must never flatten them into one unlabeled stream.

### Source Tier A — Direct Envato demand

Primary target:

- Envato Author Dashboard `Content Opportunities`.

Desired fields:

```text
searchTerm
demand
growth
results
searchToDownload
supply
contentType
countryRegion
timeWindow
languageSession
observedAt
```

Acquisition order:

1. official export/API if Envato exposes one;
2. user-authorized downloaded CSV/export if available;
3. explicit user-triggered Browser Companion visible-table capture;
4. never bypass login, scrape hidden/private endpoints, steal cookies or automate credentials.

### Source Tier B — Envato Market API

Keep and strengthen current connectors for:

- search;
- categories;
- popular;
- featured;
- new;
- random new;
- item detail;
- total/category supply metrics.

Semantic role:

```text
SUPPLY + VISIBILITY + MARKET STRUCTURE
```

not direct demand.

### Source Tier C — Envato public visible surfaces

Browser Companion continues to support user-triggered capture for:

- elements.envato.com;
- app.envato.com;
- GraphicRiver;
- ThemeForest;
- CodeCanyon;
- VideoHive;
- AudioJungle;
- PhotoDune;
- 3DOcean.

Role:

```text
PUBLIC EXPERIENCE / CROSS-CONTEXT VISIBILITY
```

### Source Tier D — External intent validation

Priority sources:

1. Google Trends API alpha if access is approved;
2. Google Trends UI/export fallback where appropriate;
3. Pinterest Trends / authorized exports or APIs where available;
4. future design-marketplace search-intelligence adapters where terms permit.

Role:

```text
BROADER USER INTENT / CULTURAL DEMAND CONFIRMATION
```

These sources must not be mislabeled as Envato demand.

### Source Tier E — Visual/cultural evidence

Examples:

- Canva design trend research;
- Adobe creative trend research;
- visual corpora collected from permitted public/owned sources;
- commercial campaign/reference corpora;
- human expert review.

Role:

```text
VISUAL PATTERN + CULTURAL CONTEXT
```

---

## 5. New data contracts

All new schemas must be versioned, deterministic and provenance-first.

### 5.1 `msl-demand-observation/1`

```text
id
sourceId
sourceType
intentRaw
intentNormalized
contentType
geo
language
windowStart
windowEnd
demandValue
demandScale
growthValue
resultCount
searchToDownload
supplyClass
observedAt
provenanceId
qualityFlags[]
```

### 5.2 `msl-intent-cluster/1`

```text
clusterId
canonicalLabel
canonicalKey
memberTerms[]
languages[]
contentTypes[]
semanticModelVersion
clusterConfidence
createdAt
updatedAt
```

### 5.3 `msl-supply-observation/1`

```text
intentClusterId
sourceId
resultCount
uniqueProducts
uniqueAuthors
newProductRate
authorConcentration
visualClusterDensity
observedAt
window
provenanceId
```

### 5.4 `msl-visibility-observation/1`

Wrap/reproject current ranking data into explicit visibility semantics:

```text
productId
intentClusterId
sourceContext
position
exposure
rankVelocity
crossQueryPresence
crossSurfacePresence
peerRelativeRank
coverage
observedAt
provenanceId
```

### 5.5 `msl-design-fingerprint/1`

```text
productId
assetVersion
visualEmbeddingRef
typographyFeatures
paletteFeatures
layoutFeatures
imageTreatmentFeatures
shapeFeatures
textureFeatures
motionFeatures
complexityFeatures
functionalFeatures
extractorVersion
provenanceId
```

### 5.6 `msl-market-source-assessment/1`

One assessment per source/intent/window:

```text
intentClusterId
sourceId
demandState
supplyState
visibilityState
adoptionState
seasonalityState
anomalyState
evidenceQuality
reasonCodes[]
```

### 5.7 `msl-source-contradiction/1`

```text
intentClusterId
window
sourceA
sourceB
dimension
directionA
directionB
severity
comparabilityStatus
reasonCodes[]
```

### 5.8 `msl-market-state/1`

```text
intentClusterId
state
previousState
demandState
supplyState
visibilityState
adoptionState
externalConfirmation
persistence
seasonalityClass
confidenceState
reasonCodes[]
sourceAssessmentIds[]
contradictionIds[]
```

### 5.9 `msl-product-trend-fit/1`

```text
productId
intentClusterId
functionalFit
visualFit
differentiation
qualityFit
visibilityContext
marketState
fitClass
reasonCodes[]
provenanceId
```

---

## 6. Market-state taxonomy

Do not begin with one universal numeric `Trend Score`.

First classify state transparently.

Initial deterministic states:

```text
NO_SIGNAL
INSUFFICIENT_EVIDENCE
LATENT_NEED
INTENT_EMERGING
DEMAND_ACCELERATING
EMERGING_UNMET_DEMAND
EXPANSION
MATURE_HIGH_DEMAND
HOT_BUT_CROWDED
SATURATION_RISK
LEGACY_VISIBILITY
DECLINING
SEASONAL_RISE
SEASONAL_DECLINE
FAD_CANDIDATE
REVIVAL
SOURCE_CONFLICT
```

Numeric confidence may only be introduced after real outcome-labelled calibration, consistent with existing C3 guardrails.

---

## 7. Implementation waves

Implementation must proceed in bounded waves. Do not attempt a monolithic rewrite.

# Wave D0 — Semantic freeze & truth correction

### Goal

Stop current MSL from presenting API exposure movement as proof of customer demand.

### Tasks

1. Audit every UI/API/doc occurrence of `trend`, `trending`, `trend score`, `opportunity` and related claims.
2. Classify each existing metric as:
   - visibility;
   - supply;
   - structure;
   - demand;
   - adoption;
   - evidence state.
3. Rename/relabel claims where necessary without changing frozen C1/C2 numeric kernels unless specifically required.
4. Preserve backward-compatible legacy fields where migration requires them, but expose corrected semantic projections.
5. Add tests that prevent a visibility-only result from emitting a demand-trend claim.

### Acceptance

```text
zero UI/API claims that equate API ranking with customer demand
legacy numeric kernels remain deterministic
all changed semantics have explicit migration notes
```

---

# Wave D1 — Source Registry & Provenance 2.0

### Goal

Make every observation source-aware before adding more data.

### Tasks

1. Add source registry containing:
   - provider;
   - access method;
   - semantic domain;
   - scale type;
   - geography capability;
   - time resolution;
   - reliability policy;
   - terms/access constraints.
2. Extend provenance to identify exact source/context/window.
3. Add explicit comparability rules between source types.
4. Block cross-source arithmetic when dimensions are not comparable.

### Acceptance

Every value contributing to market-state reasoning can answer:

```text
where did this come from?
what does its scale mean?
what population does it represent?
what time/geography/language does it cover?
is it comparable to the other source?
```

---

# Wave D2 — Direct Demand Ingestion

### Goal

Add first-class customer-demand observations.

### Priority 1: Envato Content Opportunities adapter

Implement safe ingestion for visible/exported fields:

```text
Search Terms
Demand
Growth
Results
Search-to-Download
Supply
Content Type
Country/Region
Based on Previous
language scope
```

Preferred ingestion sequence:

1. official export/API;
2. file import;
3. user-triggered Browser Companion capture.

Never automate authentication bypass or hidden endpoints.

### Priority 2: Google Trends adapter

If Google approves Trends API alpha access:

- consistently scaled search-interest series;
- 5-year rolling history;
- daily/weekly/monthly/yearly;
- region/subregion.

Fallback:

- user export/import from Google Trends UI;
- preserve UI 0–100 request-relative semantics.

### Priority 3: Pinterest/external discovery adapters

Only through authorized API/export/public mechanisms.

### Acceptance

MSL can store and query direct demand observations without mixing them into old ranking fields.

---

# Wave D3 — Intent Normalization & Semantic Clustering

### Goal

Analyze user need rather than isolated literal keywords.

### Tasks

1. Normalize case, punctuation, spelling and language variants.
2. Preserve exact raw query alongside normalized form.
3. Build deterministic synonym/related-term layer.
4. Add semantic clustering with versioned model.
5. Support one term belonging to zero/one/multiple candidate clusters with explicit confidence.
6. Allow manual correction/merge/split with audit history.
7. Build multilingual equivalence only when evidence supports it.

### Example

```text
social media report
social media analytics report
instagram report
monthly social report

=> social_media_reporting
```

### Acceptance

Trend calculations operate on canonical intent clusters while retaining raw-term provenance.

---

# Wave D4 — Temporal Normalization, Seasonality & Change-Point Engine

### Goal

Distinguish sustained demand movement from noise and predictable seasonal spikes.

### Tasks

1. Comparable-window framework:
   - previous period;
   - same period previous year;
   - rolling baseline;
   - source-specific historical baseline.
2. Source normalization:
   - relative search scale;
   - geography normalization;
   - content-type normalization;
   - source-activity normalization where possible.
3. Seasonality classifier.
4. Outlier/noise detector.
5. Change-point detector for regime shifts.
6. Growth persistence counter.
7. Acceleration/deceleration calculation.
8. Store raw and normalized series separately.

### Acceptance

A one-window spike cannot become `EXPANSION` without persistence/confirmation gates.

---

# Wave D5 — Supply Intelligence 2.0

### Goal

Reposition the current Envato API scanner as a strong supply/competition sensor.

### Tasks

1. Map Envato API results to intent clusters.
2. Track:
   - result counts;
   - unique products;
   - unique authors;
   - new-product velocity;
   - author concentration;
   - supply growth;
   - supply acceleration.
3. Preserve current popular/featured/new/random-new as visibility/supply contexts.
4. Add supply density by design fingerprint.
5. Detect near-duplicate saturation clusters.
6. Separate quantity supply from **quality-adjusted supply**.

### Acceptance

MSL can explain whether demand is under-served, matched or over-supplied.

---

# Wave D6 — Visual Design Intelligence Engine

### Goal

Understand the actual design, not only title/tags.

### Inputs

Use permitted product preview images/screenshots or locally available design previews.

### Feature families

#### Typography

- serif/sans/display/script/mono classification;
- weight/contrast;
- condensed/expanded;
- headline/body scale ratio;
- hierarchy depth;
- tracking/leading tendencies;
- mixed-type strategy.

#### Color

- dominant palette;
- hue families;
- saturation/value distribution;
- accent ratio;
- contrast behavior;
- monochrome/muted/vivid classification.

#### Layout

- grid topology;
- symmetry/asymmetry;
- modular/editorial;
- density;
- whitespace;
- overlap;
- frame geometry;
- image-to-text ratio.

#### Image treatment

- photography vs illustration;
- editorial/product/lifestyle;
- crop behavior;
- duotone/gradient/grain;
- cutout/collage;
- depth and compositing.

#### Style/motif

- retro/futurist/brutalist/editorial/minimal/etc. embeddings;
- texture/materiality;
- decorative motif families;
- motion grammar where relevant.

#### Functional design

- product type;
- use-case;
- page/layout count;
- editability;
- software;
- master/layout system;
- asset replaceability;
- documentation;
- commercial utility.

### Outputs

```text
visual embedding
interpretable feature vector
trend visual fit
market similarity
novelty distance
clone density
```

### Acceptance

Two products with similar titles but materially different visual DNA must not be treated as equivalent.

---

# Wave D7 — Product Quality & Commercial Utility Engine

### Goal

Separate “matches trend” from “good product”.

### Evaluation dimensions

Based partly on Envato's public quality standards:

- coherence;
- hierarchy;
- contrast;
- repetition;
- alignment;
- proximity;
- typography readability;
- preview clarity;
- technical cleanliness;
- editability;
- organization;
- compatibility;
- documentation;
- customization value;
- differentiation;
- commercial utility.

### Rule

```text
HIGH TREND FIT + LOW QUALITY
!= recommended product direction
```

### Acceptance

Product evaluation can explain both market fit and design/product quality independently.

---

# Wave D8 — Adoption / Satisfaction Layer

### Goal

Validate search intent with downstream behavior when data exists.

### Initial sources

- Envato Search-to-Download from Content Opportunities;
- future first-party/authorized conversion metrics;
- user's own portfolio outcome data only when explicitly scoped as own-account evidence.

### Rule

Never infer missing download/purchase behavior from ranking.

### Acceptance

Demand can be classified separately as:

```text
high search + high satisfaction
high search + low satisfaction
low search + high niche satisfaction
etc.
```

---

# Wave D9 — Cross-Source Consensus & Contradiction Engine

### Goal

Make disagreement informative.

### Tasks

1. Compare aligned source assessments, not raw incompatible numbers.
2. Compute direction agreement:
   - rising;
   - flat;
   - falling;
   - unknown.
3. Track contradiction severity.
4. Weight source evidence by semantic relevance, not arbitrary prestige.
5. Direct Envato demand must outrank Envato API visibility when the question is Envato customer demand.
6. External search can confirm broader interest but cannot overwrite first-party Envato demand.
7. Public visible surfaces can identify ranking anomalies.
8. Add reason codes such as:

```text
DIRECT_DEMAND_RISING
DIRECT_DEMAND_FALLING
SUPPLY_LAGGING
SUPPLY_ACCELERATING
VISIBILITY_OUTRUNS_DEMAND
DEMAND_OUTRUNS_VISIBILITY
EXTERNAL_CONFIRMATION
EXTERNAL_DIVERGENCE
SEASONAL_PATTERN
ONE_OFF_SPIKE
SOURCE_CONFLICT
```

### Acceptance

MSL never “solves” contradiction by averaging it away.

---

# Wave D10 — Market State Engine

### Goal

Turn evidence vectors into interpretable market lifecycle states.

### First deterministic classifier

Use structural gates, not calibrated pseudo-probabilities.

Example rule families:

```text
EMERGING_UNMET_DEMAND:
  demand rising/accelerating
  + supply low/lagging
  + minimum persistence
  + no severe invalidating contradiction

EXPANSION:
  demand rising persistently
  + supply responding
  + visibility rising or adoption confirming
  + >= 1 independent supporting context

HOT_BUT_CROWDED:
  demand high/rising
  + supply high and accelerating
  + competition high

LEGACY_VISIBILITY:
  visibility high
  + demand falling/flat
  + supply high or established

FAD_CANDIDATE:
  sharp short-term spike
  + weak persistence
  + limited cross-source confirmation
```

### Acceptance

Every state must return explicit reason codes and supporting source IDs.

---

# Wave D11 — Product ↔ Trend Fit Engine

### Goal

Answer which design products best represent a validated market trend.

### Process

```text
validated intent cluster
        ↓
functional requirements / use-case
        ↓
visual trend centroid(s)
        ↓
quality + differentiation
        ↓
product matching
```

### Product classes

```text
STRONG_REPRESENTATIVE
EMERGING_REPRESENTATIVE
VISUALLY_RELEVANT_FUNCTIONALLY_WEAK
FUNCTIONALLY_RELEVANT_VISUALLY_OUTDATED
OVER-SATURATED_LOOKALIKE
HIGH_QUALITY_NON_TREND_PRODUCT
LEGACY_WINNER
REVIVAL_CANDIDATE
```

### Acceptance

The system says:

> “Product A strongly represents the expanding Social Media Reporting intent cluster.”

not:

> “Product A itself is the trend because it ranks #1.”

---

# Wave D12 — Market Autopilot 2.0

### Goal

Make the full workflow automatic wherever lawful and technically supported.

### Orchestration

```text
1. discover/refresh source availability
2. collect direct demand
3. collect Envato supply/visibility
4. collect authorized external intent sources
5. refresh visible-public snapshots when automation is permitted,
   otherwise create explicit pending user-capture task
6. normalize terms
7. cluster intents
8. build comparable temporal windows
9. seasonality/anomaly/change-point analysis
10. supply analysis
11. visual fingerprint analysis
12. adoption evidence
13. source assessments
14. contradiction analysis
15. market-state classification
16. product-trend fit
17. explainable output + source provenance
```

### Important UX behavior

If a source cannot be collected automatically because it requires explicit user interaction, MSL must not silently omit it.

Show:

```text
SOURCE NEEDED: Envato Content Opportunities
ACTION: Capture / Import
WHY: Direct customer demand evidence is missing
IMPACT: Market trend cannot be confirmed yet
```

### Acceptance

Autopilot is transparent about what it knows, what it does not know and what source is blocking stronger conclusions.

---

# Wave D13 — UI / Explainability Redesign

### Goal

Make the analytical chain visible.

### Main surfaces

#### A. Demand Map

```text
Intent Cluster
Demand
Growth
Acceleration
Persistence
Seasonality
Geo/Language breadth
```

#### B. Supply Map

```text
Results
Supply growth
New-item velocity
Author breadth
Visual saturation
```

#### C. Market State

```text
Demand State
Supply State
Visibility State
Adoption State
External Confirmation
Contradictions
Lifecycle
```

#### D. Product Fit

```text
Functional Fit
Visual Fit
Quality
Differentiation
Visibility
Representative Class
```

#### E. Why this conclusion?

Every conclusion should expand into:

```text
claim
supporting sources
opposing sources
window
reason codes
missing evidence
confidence state
```

### Acceptance

A user can understand why MSL reached a conclusion without reading source code or trusting a mystery score.

---

# Wave D14 — Historical Backfill & Migration

### Goal

Reuse existing MSL history without rewriting its meaning.

### Rules

1. Old ranking data becomes historical visibility/supply evidence.
2. Do not retroactively manufacture historical demand.
3. Preserve original model/version/provenance.
4. Add semantic projection layers rather than destructive rewriting.
5. Old `trending` lifecycle events may be reprojected as `visibility-movement` history, with original events retained for audit.
6. Never infer missing Content Opportunities demand from API ranking.

### Acceptance

No historical evidence is lost and no old data is upgraded into a stronger claim than it originally supported.

---

# Wave D15 — Calibration & Outcome Learning

### Goal

Eventually turn structural states into calibrated probabilities/confidence only after real outcomes exist.

### Outcome examples

For an intent cluster at time T:

```text
demand continued rising after 30/60/90 days
search-to-download improved/declined
supply caught up
external validation persisted
trend entered maturity
trend collapsed as fad
```

### Requirements

- versioned outcome definition;
- chronological train/validation/test split;
- untouched holdout;
- no future leakage;
- sufficient sample size;
- reproducible calibration artifact;
- explicit approval;
- existing C3.2/C3.3 guardrails remain binding.

### Acceptance

No numeric “probability of trend success” before approved real outcome-labelled calibration data exists.

---

## 8. Technical architecture boundaries

### Rust

Own deterministic numerical kernels where performance/precision matters:

- time-series deltas;
- normalization primitives;
- change-point/statistical kernels where adopted;
- visual feature distance calculations if appropriate;
- clustering primitives where deterministic;
- ranking/peer statistics;
- contradiction/agreement metrics.

### Go

Own application orchestration, contracts, provenance, source adapters, persistence, APIs, evidence qualification and UI backend.

### Python

Remain offline/research/calibration where appropriate:

- exploratory model evaluation;
- visual-model experiments;
- clustering evaluation;
- calibration;
- backtesting;
- statistical research notebooks/tools.

Python must not silently become a production online dependency unless explicitly approved later.

### TypeScript/Bun

Own typed frontend behavior and generated browser application code within the existing selective TS foundation.

### Browser Companion

Own explicit user-triggered visible-page capture where direct automated access is unavailable or inappropriate.

---

## 9. Visual model strategy

Do not choose one monolithic vision model prematurely.

Evaluation lane should compare:

```text
image embeddings
interpretable CV features
OCR/text layout features where useful
layout geometry extraction
color/typography heuristics
hybrid embedding + deterministic features
```

Selection criteria:

- reproducibility;
- local/private feasibility;
- Windows compatibility;
- latency;
- embedding stability;
- ability to explain similarity;
- licensing;
- no dependence on prohibited/private scraping.

Visual embeddings should not replace interpretable features; use both.

---

## 10. Source access and compliance policy

User approval for full project access does **not** authorize bypassing third-party controls.

Permanent rules:

1. Prefer official APIs and exports.
2. Use authenticated data only through the user's legitimate authorized session/account.
3. Never steal or persist cookies/session secrets.
4. Never reverse-engineer private endpoints solely to bypass intended access controls.
5. Browser Companion remains explicit/user-triggered for visible pages unless a provider offers an approved automated API/export.
6. Respect request budgets/rate limits.
7. Preserve source terms and provenance.
8. Do not send the user's private marketplace data to external third-party AI services without explicit approval.

---

## 11. Testing strategy

### No GitHub Actions / CI

All verification remains local per permanent project policy.

### Required test layers

#### Contract tests

- schema versions;
- backward compatibility;
- provenance.

#### Source adapter tests

- parsing;
- scale semantics;
- missing fields;
- rate limits;
- corrupted exports;
- duplicate rows.

#### Temporal tests

- equal windows;
- unequal windows rejected/degraded;
- seasonality;
- one-off spikes;
- sustained acceleration;
- missing history.

#### Contradiction tests

- direct demand vs visibility conflict;
- external confirmation;
- non-comparable source rejection;
- no averaging of incompatible scale.

#### Design fingerprint tests

- identical image stability;
- small edit stability;
- visually different product separation;
- title/tag leakage prevention where visual-only test is expected.

#### Market-state golden tests

Freeze deterministic scenario fixtures:

```text
emerging unmet demand
expansion
mature
hot but crowded
legacy visibility
seasonal
fad candidate
decline
source conflict
```

#### UI semantic tests

No label may claim stronger certainty than evidence stage allows.

---

## 12. Performance strategy

Universal analysis can become expensive. Use staged computation.

```text
Stage 1: cheap source/term screening
Stage 2: intent clustering
Stage 3: demand/supply temporal analysis
Stage 4: shortlist candidate visual clusters/products
Stage 5: expensive visual fingerprinting only for relevant candidates
Stage 6: consensus / market-state generation
```

Cache by:

```text
source + query + window + geo + language + contentType + modelVersion
```

Never recompute immutable historical observations.

---

## 13. Autopilot output contract

A final market insight should look structurally like:

```text
INTENT CLUSTER
Social Media Reporting

MARKET STATE
EXPANSION

WHY
- direct Envato customer-search demand is rising
- growth persisted across comparable windows
- related terms are rising together
- supply is increasing but has not fully caught up
- search-to-download indicates unresolved customer need
- Google/Pinterest interest supports broader demand
- public marketplace visibility is beginning to rise

CONTRADICTIONS
- one public surface still shows low exposure

DESIGN PATTERN
- bold metric typography
- modular data/dashboard composition
- editorial photography
- compact high-contrast color system

PRODUCT REPRESENTATIVES
1. Product A — Strong Representative
2. Product B — Strong Representative
3. Product C — Visually Relevant / Functionally Weaker

OPPORTUNITY
create differentiated social reporting templates with high editability
and broader KPI/storytelling layouts; avoid near-copying saturated visual cluster.
```

Every bullet must trace to evidence IDs.

---

## 14. Implementation order — critical path

Do not start with computer vision first.

Correct sequence:

```text
D0  Semantic correction
D1  Source/provenance registry
D2  Direct demand ingestion
D3  Intent clustering
D4  Temporal/seasonality/change-point
D5  Supply intelligence
D8  Adoption layer
D9  Consensus/contradiction
D10 Market state
D6  Visual design intelligence
D7  Product quality
D11 Product-trend fit
D12 Autopilot 2.0
D13 UI explainability
D14 Historical migration
D15 Calibration/outcomes
```

Rationale:

A perfect visual analyzer built before direct demand exists would still answer the wrong question more beautifully.

---

## 15. First implementation milestone

### Milestone M1 — Demand Truth Foundation

Must deliver:

```text
1. corrected visibility-vs-demand semantics
2. source registry
3. msl-demand-observation/1
4. Envato Content Opportunities ingestion path
5. intent cluster v1
6. comparable demand windows
7. basic demand states:
   INSUFFICIENT_EVIDENCE
   LATENT_NEED
   INTENT_EMERGING
   DEMAND_ACCELERATING
   DECLINING
8. source provenance UI
9. no demand trend claim without demand evidence
```

M1 deliberately does **not** need advanced computer vision yet.

---

## 16. Second milestone

### Milestone M2 — Demand ↔ Supply Market State

Add:

```text
Envato API supply remapping
result/supply growth
competition acceleration
author breadth/concentration
search-to-download/adoption evidence
seasonality
source contradiction
market state:
EMERGING_UNMET_DEMAND
EXPANSION
HOT_BUT_CROWDED
MATURE_HIGH_DEMAND
SATURATION_RISK
LEGACY_VISIBILITY
```

At M2, MSL becomes a materially stronger market intelligence system even before visual trend modeling.

---

## 17. Third milestone

### Milestone M3 — Design Intelligence

Add:

```text
visual fingerprint
functional fingerprint
visual clustering
trend visual centroid
quality/commercial utility
differentiation/saturation
product-trend fit
```

At M3, MSL can answer not merely “what demand is rising?” but:

> “What should the design actually look like, what functionality does the market need, and which existing products best represent or oversaturate that direction?”

---

## 18. Fourth milestone

### Milestone M4 — Universal Cross-Market Validation

Add authorized external intent sources and stronger cultural/visual signals:

```text
Google Trends
Pinterest Trends
additional permitted design-marketplace signals
broader visual/cultural corpus
```

Outcome:

```text
ENVATO-SPECIFIC DEMAND
vs
BROADER DESIGN/CULTURAL TREND
```

This distinction is essential. A trend can be platform-specific or universal.

---

## 19. Completion definition

This plan may be declared complete only when the following are all true:

```text
[ ] direct demand is a first-class MSL data type
[ ] visibility can never masquerade as demand
[ ] intent clusters are canonical trend units
[ ] demand and supply are independent dimensions
[ ] seasonality/noise/change-point logic exists
[ ] source provenance is complete
[ ] cross-source contradictions are preserved
[ ] market lifecycle states are explainable
[ ] visual design fingerprints exist
[ ] product quality is separate from trend fit
[ ] product-trend fit is derived from validated market trend
[ ] Autopilot reports missing evidence explicitly
[ ] no fake neutral values for missing evidence
[ ] no calibrated probabilities without approved outcome-labelled data
[ ] local verification passes
[ ] no GitHub Actions/CI used
[ ] accepted work is integrated back into canonical root
```

---

## 20. Explicitly rejected architecture

The following must not return:

```text
API rank improves
=> product trending

new product appears often
=> market demand rising

popular/featured placement
=> customer demand proven

one Google Trends spike
=> universal trend

one Pinterest spike
=> market trend confirmed

multiple incompatible sources averaged
=> consensus score

high visual similarity to popular products
=> opportunity
```

All are analytically unsafe.

---

## 21. Plan sign-off state

The user has explicitly approved the direction and requested full research + planning.

This document is therefore:

```text
RESEARCH-BACKED
ARCHITECTURE DIRECTION APPROVED
READY FOR IMPLEMENTATION
NOT YET CLAIMED IMPLEMENTED
```

Implementation should begin from **Wave D0 / Milestone M1**, using an isolated worktree when code changes begin, then integrate accepted work back into `E:\Market-Signal-Lab` root according to the permanent worktree integration policy.

No GitHub Actions/CI. No implicit `main` merge. No fabricated demand/outcome evidence.
