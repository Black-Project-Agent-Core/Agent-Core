# B — Design Product & Market Trend Formation Research Foundation

> **Dated research foundation:** external-service observations and citations reflect the 26 August 2026 research. This refresh does not revalidate those services or claim the paired plan has been implemented. Use [current continuation](../checkpoints/CONTINUE_MSL.md) to distinguish the imported source from future design work.

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** RESEARCH FOUNDATION COMPLETE — READY TO GOVERN IMPLEMENTATION
**Scope:** Market Signal Lab (MSL), design-product intelligence, demand analysis, trend formation, cross-source evidence
**Paired plan:** `2026-08-26-A-MSL-DEMAND-LED-UNIVERSAL-TREND-INTELLIGENCE-PLAN.md`

---

## 1. Executive conclusion

The research does **not** support treating marketplace ranking, visibility, newness, popularity placement, or API exposure as proof of market demand.

The strongest recurring pattern across Envato, Google, Pinterest, Canva, Adobe, Etsy, academic visual-style forecasting, diffusion theory, change-point research, and social-media forecasting literature is:

> A defensible market trend is a **persistent directional change in user intent and/or adoption**, observed across comparable time windows and supported by more than one independent evidence channel. Visibility and supply are explanatory dimensions, not substitutes for demand.

For MSL this implies a permanent semantic split:

```text
DEMAND      = what users are trying to find / solve / obtain
SUPPLY      = how much content exists to satisfy that intent
VISIBILITY  = what the marketplace currently exposes or ranks
ADOPTION    = what users do after discovery: save, click, download, purchase, use
DESIGN FIT  = how strongly a specific product expresses the visual + functional intent
TREND       = sustained movement of demand/adoption, not a high position snapshot
OPPORTUNITY = demand growth + insufficient/weak supply + usable product gap
```

A product may be old or new. Age is not a trend definition. A five-year-old product can become trend-relevant again if user intent returns or accelerates. A brand-new product can be highly visible without proving any meaningful increase in user demand.

---

## 2. What current MSL can prove — and what it cannot

### What current MSL can prove

Current MSL has legitimate machinery for:

- Envato Market API observations;
- search-result position;
- popular / featured / new / random-new surfaces;
- cross-query appearance;
- cross-surface appearance;
- product exposure;
- rank velocity between comparable windows;
- peer-relative ranking;
- catalog breadth;
- competition/supply movement;
- temporal movement evidence;
- public visible-page snapshot comparison through Browser Companion;
- evidence qualification and source provenance.

These are useful **supply, visibility, market-structure and movement sensors**.

### What current MSL cannot prove from those signals alone

Current Envato Market API data does not expose broad customer search demand volume equivalent to Envato's Author Dashboard `Content Opportunities` report. Therefore the existing API ranking stack cannot by itself prove:

- that more customers are searching for a design concept;
- that an intent cluster is accelerating;
- that a visible product is popular because demand is increasing rather than because ranking logic, incumbency or promotion favors it;
- that a product should be called a market trend in the demand sense;
- that an observed spike will persist rather than being noise, seasonality or placement anomaly.

The old `Product Insight Score` and exposure/ranking signals remain useful, but their role must be downstream of demand intelligence rather than acting as the definition of trend.

---

## 3. Evidence from independent sources

### 3.1 Envato — direct customer-demand model

Envato's official **Content Opportunities** feature is the closest known first-party ground truth for the problem MSL wants to solve.

Envato explicitly describes the feature as connecting authors with **customer demand** and identifies six key inputs:

1. `Search Terms` — keywords customers search for on Envato Elements;
2. `Demand` — search volume for the term;
3. `Growth` — change in demand versus the previous period;
4. `Results` — number of returned search results;
5. `Search-to-Download` — percentage of searches that result in a download;
6. `Supply` — how much matching content is already in the library.

It also allows content-type, geography/region, time-window, language and additional filters.

This is strong evidence that a marketplace opportunity model should begin with **search intent and its growth**, then compare it with supply and downstream behavior.

Reference:
https://help.author.envato.com/hc/en-us/articles/10710258805529-Content-Opportunities-Feature

### 3.2 Envato Market API — discovery/supply/visibility, not complete demand

The official Envato Market API exposes item search, similar items, popular items, categories, new files, featured items, random new files, item details, user items and marketplace statistics.

These endpoints are valuable for:

- supply discovery;
- product availability;
- ranking/exposure observation;
- catalog composition;
- author and item metadata;
- freshness/new-supply response;
- market structure.

They are not documented as direct customer search-volume telemetry for the whole demand side.

Reference:
https://build.envato.com/api/

### 3.3 Google Trends — search interest must be normalized and treated as one evidence source

Google states that Trends uses a sample of actual aggregated, anonymized searches. Data is normalized by geography/time and scaled relative to total search activity. Google also explicitly warns that:

- small/no-volume queries can show statistical noise;
- one-off spikes should not automatically be interpreted as real user activity;
- Trends is not a scientific poll;
- a spike does not mean a topic is inherently “winning”;
- Trends should be considered as **one data point among others**.

This is directly applicable to MSL: one source, one spike, or one ranking surface must never be enough to declare a trend.

References:
https://support.google.com/trends/answer/4365533
https://support.google.com/trends/answer/17309543

Google also introduced a limited alpha **Google Trends API** with consistently scaled data, 5-year history, multiple aggregation intervals and region/sub-region support. Its consistent scaling is specifically intended to make multi-request comparison and merging more reliable than repeated 0–100 UI rescaling.

Reference:
https://developers.google.com/search/apis/trends

### 3.4 Pinterest — trend identification uses volume, growth, normalization, long windows and human curation

Pinterest describes a four-stage trend forecasting approach including data examination and curation. It applies volume and growth thresholds to billions of searches, analyzes periods up to two years, and normalizes search data to reduce seasonality bias.

Pinterest Predicts also combines billions of searches with **visual content engagement**, machine learning, predictive analytics and real-world observations. This is important for design markets because visual style can emerge before users consistently describe it with one stable keyword.

References:
https://business.pinterest.com/blog/how-we-forecast-trends-pinterest-predicts/
https://business.pinterest.com/en-ca/blog/pinterest-predicts-2026-turn-trends-into-unlimited-possibilities/

### 3.5 Canva — search behavior + expert design interpretation + creator survey

Canva's 2026 Design Trends methodology states that it analyzed search trends from a community of more than 260 million people, combined this with a Designer Advisory Board and a global survey of 1,000 creators.

This demonstrates another recurring principle:

> quantitative search movement is stronger when paired with expert interpretation of visual pattern and cultural meaning.

Reference:
https://www.canva.com/newsroom/news/design-trends-2026/

### 3.6 Adobe — commercial campaigns + customer/community feedback + search history + visual pattern

Adobe explains that its Creative Trends work reviews commercial campaigns and creative projects, incorporates feedback from Creative Cloud communities, and tracks search history. Adobe uses these together to identify visual patterns, techniques and styles rising in commercial relevance, engagement and demand.

This reinforces the need for MSL to analyze not only keyword demand but also **what the designs actually look like**.

Reference:
https://blog.adobe.com/en/publish/2026/01/08/how-creators-leveraging-adobe-2026-creative-trends

### 3.7 Etsy — direct search volume must be compared with listing supply; conversion validates relevance

Etsy Marketplace Insights exposes real Etsy search data and lets sellers compare searches and listings for a keyword. Etsy search documentation also uses listing engagement signals such as clicks, favorites and purchases to understand whether results are actually useful to shoppers.

This is another independent marketplace converging on the same model:

```text
search intent
+ supply/listing count
+ downstream engagement/conversion
```

References:
https://help.etsy.com/hc/en-gb/articles/35122361353239-How-Do-I-Use-Etsy-s-Marketplace-Insights-Tool
https://www.etsy.com/seller-handbook/article/creating-listings-that-convert/366469719354
https://www.etsy.com/seller-handbook/article/375461474487

### 3.8 Academic visual-style forecasting — images contain trend information unavailable in text alone

`Fashion Forward: Forecasting Visual Style in Fashion` showed that forecasting visual-style popularity benefits strongly from image-based analysis, in its experiments more than textual or metadata cues surrounding products.

`Modeling Fashion Influence from Photos` demonstrated that visual styles can be tracked across brands and locations and that style influence propagates spatially and temporally.

Although these papers focus on fashion, the methodological lesson is directly relevant to digital design products: product titles and tags cannot fully represent typography, composition, color systems, texture, image treatment, layout structures, motion grammar or stylistic similarity.

References:
https://arxiv.org/abs/1705.06394
https://arxiv.org/abs/2011.09663

### 3.9 Diffusion and trend-cycle research — trend is a process, not a snapshot

Diffusion-of-innovation research describes adoption as a process across time and social groups rather than an instantaneous event. Modern Bass-type diffusion research continues to model how innovation/adoption spreads through populations.

A mathematical trend-cycle model published in 2023 explicitly models onset, rise, peak, decline and obsolescence and distinguishes fad, fashion and classic behavior.

MSL should therefore classify **market state and lifecycle**, not reduce everything to one current score.

References:
https://arxiv.org/abs/2602.19488
https://arxiv.org/abs/2304.10225

### 3.10 Change-point detection — real trends require regime-change detection, not simple delta

Time-series change-point literature studies significant shifts in statistical behavior. For MSL this means that “growth” should eventually distinguish:

- ordinary variance;
- one-off spike;
- seasonal recurrence;
- sustained acceleration;
- structural regime change.

Reference:
https://pmc.ncbi.nlm.nih.gov/articles/PMC5464762/

### 3.11 Social-media forecasting literature — large data can still be biased and noisy

A systematic literature review of social-media forecasting found recurring problems including data bias, noisy signals, weak generalizability and insufficient domain theory.

This supports a strict MSL rule:

> More sources do not automatically mean more truth. Every source needs provenance, source semantics, quality assessment and contradiction handling.

Reference:
https://arxiv.org/abs/1706.06134

---

## 4. Cross-source methodological consensus

Across the independent sources above, the following principles repeat often enough to become MSL design laws.

### Law 1 — Start with intent, not products

Users usually express a **need, use case, problem, theme or aesthetic**, not a specific marketplace item.

The first unit of trend analysis must therefore be an `Intent Cluster`, for example:

```text
social media report
instagram analytics report
monthly social report
social media performance presentation
```

These may map into a canonical intent:

```text
INTENT: social_media_reporting
```

Products are evaluated later for how strongly they satisfy that intent.

### Law 2 — Trend requires movement over time

A static high value is not trend evidence.

MSL needs at minimum:

- current level;
- prior comparable level;
- growth rate;
- acceleration;
- persistence;
- comparable time windows.

### Law 3 — Normalize before comparing

Raw source magnitudes are not directly comparable.

Normalization must account for:

- source-specific scale;
- geography;
- time period;
- total source activity;
- content type;
- language;
- seasonality;
- query ambiguity.

### Law 4 — Demand and supply must remain separate axes

A market can have:

```text
high demand + low supply     = opportunity
high demand + high supply    = hot but crowded
low demand  + high supply    = saturation / legacy supply
low demand  + low supply     = weak/no market
```

Combining them prematurely into one opaque score destroys interpretability.

### Law 5 — Adoption/behavior strengthens search intent

Search means “interest or need”. It does not always mean “satisfaction” or “purchase”.

Where available, downstream signals should validate demand:

- search-to-download;
- click-through;
- saves/favorites;
- downloads;
- purchase/conversion;
- repeated usage.

### Law 6 — Visual style must be analyzed visually

Text-only similarity cannot reliably identify design trends.

A design product requires a visual fingerprint covering, where applicable:

- typography category and hierarchy;
- color palette and contrast behavior;
- layout topology/grid;
- image composition/crop treatment;
- shape language;
- border/radius behavior;
- texture/materiality;
- illustration/photo treatment;
- whitespace/density;
- motion grammar;
- decorative motifs;
- era/style references;
- visual complexity;
- editorial vs modular behavior.

### Law 7 — Function/use-case matters as much as aesthetic style

Two visually similar products can serve different demand.

A separate functional fingerprint should capture:

- product type;
- target job-to-be-done;
- audience;
- content structure;
- required software;
- editable capabilities;
- quantity/depth of layouts/assets;
- technical delivery quality;
- localization/language suitability;
- commercial utility.

### Law 8 — Contradiction is evidence

Sources must not be blended until disagreement disappears.

Examples:

```text
Demand ↑↑, Visibility ↓, Supply ↓
=> emerging unmet demand

Demand ↓, Visibility ↑↑, Supply ↑
=> legacy visibility / possible saturation

Demand ↑, External search ↑, Public visual interest ↑, Supply beginning ↑
=> cross-source confirmed expansion
```

### Law 9 — Seasonality and anomalies need explicit treatment

Holiday/event terms may show large growth that is entirely expected and cyclical.

MSL must distinguish:

- seasonal recurrence;
- secular growth;
- novelty spike;
- short fad;
- durable trend;
- classic/stable demand.

### Law 10 — Confidence comes from evidence coverage and agreement, not score magnitude

A high demand number from one weak source can have lower confidence than moderate movement confirmed by several independent, comparable sources.

---

## 5. Correct unit of analysis for design marketplaces

### Wrong unit

```text
Product A is #1 => Product A is trend
```

### Correct hierarchy

```text
1. USER NEED / INTENT
2. INTENT CLUSTER
3. DEMAND MOVEMENT
4. SUPPLY RESPONSE
5. VISUAL / FUNCTIONAL DESIGN PATTERN
6. ADOPTION BEHAVIOR
7. MARKET STATE
8. PRODUCT-TO-TREND FIT
```

Example:

```text
Intent cluster:
SOCIAL_MEDIA_REPORTING

Demand:
accelerating

Supply:
moderate

Search-to-download:
low-to-moderate

Visual pattern emerging:
bold metric typography + modular dashboard layout + editorial photography

Product A:
94% intent fit
91% visual-pattern fit
high technical quality

Conclusion:
Product A is a strong representative of an expanding market trend.
```

The trend belongs first to the **intent + pattern**, not to the individual SKU.

---

## 6. Design-product analysis framework

MSL should evaluate every design product across six independent dimensions.

### A. Demand Fit

Questions:

- What user problem/use-case is the product solving?
- Which search terms map to that problem?
- Is search demand rising, flat or falling?
- Is growth persistent across multiple windows?
- Is the term literal or part of a broader semantic topic?
- Is demand local, regional or global?

Outputs:

```text
intentClusterId
demandLevel
demandGrowth
demandAcceleration
demandPersistence
seasonalityClass
geoBreadth
languageBreadth
```

### B. Supply & Competition

Questions:

- How many relevant results exist?
- How fast is matching supply growing?
- How many independent authors provide comparable products?
- Is supply concentrated among a few authors?
- Is the market crowded with near-duplicates?

Outputs:

```text
supplyLevel
supplyGrowth
supplyAcceleration
authorBreadth
authorConcentration
visualClusterDensity
competitionState
```

### C. Visibility / Discovery

Questions:

- Does the product appear across search queries?
- Does it appear on popular/featured/new/public surfaces?
- Is position improving or declining?
- Is visibility broad or dependent on one query/surface?

Outputs:

```text
exposure
crossQueryPresence
crossSurfacePresence
rankVelocity
peerRelativeRank
visibilityPersistence
```

This is where current MSL is already strongest.

### D. Adoption / Satisfaction

Where source data permits:

```text
searchToDownload
clickThrough
saveRate
favoriteRate
downloadRate
purchaseRate
repeatInteraction
```

These metrics should never be invented when unavailable.

### E. Visual Trend Fit

A product receives a visual fingerprint and is compared against the visual centroid(s) associated with a growing intent cluster.

Possible features:

```text
typography
font morphology
headline/body ratio
palette
contrast
layout topology
frame geometry
image ratio/crop
photography treatment
iconography
texture
grain
depth/shadow
whitespace
composition density
motion style
editorial motifs
retro/modern/organic/technical/etc. embeddings
```

Outputs should include similarity **and** differentiation:

```text
trendVisualFit
marketSimilarity
noveltyDistance
cloneRisk
visualDistinctiveness
```

High trend fit with zero differentiation can indicate a saturated clone cluster rather than a good product opportunity.

### F. Product Quality / Commercial Utility

Envato's official quality guidance repeatedly emphasizes:

- professional execution;
- coherence;
- contrast/repetition/alignment/proximity;
- legibility and scannability;
- editability;
- organized files/layers;
- usability;
- high technical image quality;
- accurate presentation;
- commercial utility;
- uniqueness when a style is common.

For presentations specifically, Envato also requires logical organization, editable/customizable structure, high-quality images/textures and technically correct layout.

References:
https://help.author.envato.com/hc/en-us/articles/360000471186-Trending-Items-and-Quality-Tips
https://help.author.envato.com/hc/en-us/articles/360000424523-Envato-s-Item-Quality-Expectations
https://help.author.envato.com/hc/en-us/articles/360000472123-PowerPoint-and-Keynote-Presentation-Template-Requirements
https://help.author.envato.com/hc/en-us/articles/360000424863-Item-Presentation-Requirements

MSL therefore needs a quality dimension separate from trend fit. A product can match a trend but still be commercially weak because it is hard to edit, visually generic, technically poor or badly presented.

---

## 7. How a design trend forms

A practical market lifecycle derived from the research:

### Stage 0 — Latent Need

A user problem exists but search terminology is fragmented and supply may not yet recognize it.

Signals:

- scattered related queries;
- low absolute demand;
- weak visual convergence;
- cultural/context signals begin appearing.

### Stage 1 — Intent Emergence

Several related search terms begin growing.

Signals:

- demand growth across a semantic cluster;
- related-query expansion;
- new geographic or language pockets;
- first visual motifs repeating.

### Stage 2 — Acceleration

Growth persists and accelerates across comparable periods.

Signals:

- demand acceleration;
- change-point/regime shift;
- broader external search/discovery confirmation;
- visual patterns become more coherent.

### Stage 3 — Supply Response

Creators react.

Signals:

- new item rate rises;
- more authors enter;
- visual cluster density increases;
- competition acceleration begins.

### Stage 4 — Adoption Validation

Users do more than search.

Signals:

- search-to-download improves;
- saves/clicks/downloads/purchases increase where observable;
- product-market fit becomes clearer.

### Stage 5 — Expansion / Mainstream Trend

The intent and visual language diffuse broadly.

Signals:

- persistent demand;
- multi-source agreement;
- high context/geography breadth;
- multiple independent products succeed;
- more stable terminology.

### Stage 6 — Saturation

Supply begins to outrun incremental demand.

Signals:

- demand still high but growth slows;
- result count/supply grows faster;
- increasing near-duplicate density;
- lower differentiation;
- conversion may flatten or fall.

### Stage 7 — Decline / Fragmentation / Revival

Demand declines, fragments into sub-trends or later returns.

An old product can re-enter relevance here if its visual/function DNA aligns with a revived intent.

---

## 8. Trend, fad, seasonal event and classic must be different states

MSL should not call every spike a trend.

### Fad

```text
fast demand rise
low persistence
high social amplification
sharp decline
```

### Seasonal

```text
predictable recurring peak
historical same-period evidence
calendar/event dependence
```

### Trend

```text
sustained growth
multi-window persistence
breadth expansion
adoption/supporting evidence
```

### Classic / Structural Demand

```text
high or stable demand
low growth
long persistence
broad use-case relevance
```

A high-demand classic is valuable but should not be mislabeled as an emerging trend.

---

## 9. Cross-source contradiction matrix

A major design goal for MSL must be to **preserve disagreement**, not average it away.

| Demand | Supply | Visibility | External confirmation | Market interpretation |
|---|---|---|---|---|
| Rising fast | Low | Low | Rising | Emerging unmet demand |
| Rising fast | Rising | Rising | Rising | Expansion trend |
| High/flat | High | High | Flat | Mature / established market |
| Falling | High | High | Falling | Legacy visibility / saturation risk |
| Rising | High | Falling | Rising | Demand exists but current marketplace products may be misaligned |
| Flat/low | Low | High | Low | Placement/exposure anomaly |
| Spike only | Any | Any | No support | Unconfirmed anomaly/fad candidate |

Contradiction records should be first-class data objects, not errors to hide.

---

## 10. Proposed epistemic hierarchy

Different signals answer different questions.

### Tier A — Direct platform demand

Examples:

- Envato Content Opportunities demand/search volume;
- demand growth;
- search-to-download;
- direct marketplace query data.

Use for: `what customers are looking for`.

### Tier B — Platform supply and visibility

Examples:

- Envato Market API search;
- results count;
- popular/featured/new;
- product positions;
- author/supply structure.

Use for: `what exists and what is exposed`.

### Tier C — Public platform context

Examples:

- visible Envato Elements/Market ranking snapshots;
- user-initiated browser captures.

Use for: `what a public experience currently exposes`.

### Tier D — External intent/discovery

Examples:

- Google Trends;
- Pinterest Trends;
- other authorized search/discovery data.

Use for: `whether the intent is broader than Envato`.

### Tier E — Cultural/visual validation

Examples:

- Canva/Adobe trend reports;
- visual corpus analysis;
- commercial campaign patterns;
- expert curation.

Use for: `what the emerging design language looks like and whether it has broader cultural relevance`.

No tier should impersonate another. Tier B cannot claim Tier A semantics.

---

## 11. Source synchronization principles

“Sync” should not mean forcing equal values. Sources have different populations and semantics.

Correct synchronization means:

1. align time windows;
2. align geography where possible;
3. align language/query semantics;
4. align intent cluster;
5. preserve source scale;
6. normalize within source;
7. record provenance;
8. calculate agreement/disagreement only after comparability checks;
9. never convert missing data to a fake neutral value;
10. never average non-comparable signals into one number.

---

## 12. Minimum evidence required before MSL may say “trend”

The exact numeric thresholds must ultimately be calibrated, but the structural gate can be defined now.

At minimum, a `TREND` claim must require:

```text
1. a canonical intent cluster;
2. direct or high-quality demand movement evidence;
3. >= 2 comparable time windows;
4. seasonality/noise checks;
5. persistent positive movement, not one isolated point;
6. sufficient evidence coverage;
7. at least one supporting independent context OR explicit “single-source” qualification;
8. no unresolved contradiction severe enough to invalidate the claim;
9. provenance for every contributing signal;
10. trend state classification separate from product ranking.
```

If direct demand evidence is absent, allowed wording should remain something like:

```text
OBSERVED_VISIBILITY_RISING
SUPPLY_ACCELERATING
PUBLIC_INTEREST_SIGNAL
UNCONFIRMED_DEMAND
```

not `MARKET_TREND_CONFIRMED`.

---

## 13. Product-level conclusion format

MSL should eventually explain a product like this:

```text
Product: A

Intent Cluster:
Social Media Reporting

Demand State:
ACCELERATING

Demand Evidence:
- Envato customer-search demand rising
- related terms growing in same cluster
- Google/Pinterest external interest supportive

Supply State:
MODERATE / RISING

Visibility State:
STRONG

Visual Trend Fit:
HIGH
- bold metric typography
- modular analytics layouts
- editorial photo treatment

Differentiation:
MEDIUM-HIGH

Quality / Utility:
HIGH

Cross-Source Agreement:
STRONG

Market State:
EXPANSION

Conclusion:
Product A is a strong product-level representative of the expanding
Social Media Reporting demand cluster. The trend claim belongs to the
intent cluster; Product A receives high trend-fit because its visual and
functional DNA matches the observed demand and design pattern.
```

This is materially more defensible than “Product A is trending because it ranks high.”

---

## 14. Research-derived permanent guardrails for MSL

1. **Never equate visibility with demand.**
2. **Never declare a trend from a single snapshot.**
3. **Never declare a trend from product age or newness.**
4. **Never average incompatible sources merely to produce one score.**
5. **Never fabricate missing demand, conversion or outcome data.**
6. **Never treat Google/Pinterest/social interest as proof of Envato demand; use it as external validation.**
7. **Never let one promotional/ranking surface override direct demand evidence.**
8. **Preserve contradictory signals and explain them.**
9. **Separate trend detection from opportunity detection.** A large trend may be a bad opportunity if supply is already saturated.
10. **Analyze visual design with actual visual features, not titles/tags only.**
11. **Keep quality/commercial utility separate from market trend fit.**
12. **Require temporal persistence and comparability.**
13. **Use human-readable reason codes for every market-state conclusion.**
14. **Backtest every future calibrated threshold against later-observed outcomes.**

---

## 15. Research conclusion for the MSL redesign

The recurring methodology across independent systems is not “find the item ranked highest.” It is:

```text
OBSERVE USER INTENT
        ↓
CLUSTER RELATED NEEDS
        ↓
MEASURE DEMAND LEVEL + GROWTH + ACCELERATION
        ↓
CONTROL FOR SEASONALITY / NOISE / COMPARABILITY
        ↓
MEASURE SUPPLY + COMPETITION RESPONSE
        ↓
ANALYZE VISUAL + FUNCTIONAL DESIGN PATTERNS
        ↓
VALIDATE WITH DOWNSTREAM ADOPTION WHEN AVAILABLE
        ↓
COMPARE INDEPENDENT SOURCES WITHOUT ERASING CONTRADICTIONS
        ↓
CLASSIFY MARKET LIFECYCLE STATE
        ↓
MATCH PRODUCTS TO THE TREND
```

This research therefore recommends that MSL evolve from an **API ranking/exposure analyzer** into a **Demand-Led Multi-Source Design Market Intelligence System**.

The existing Rust ranking, evidence, provenance, temporal and consensus machinery remains valuable. It should be repositioned as part of the supply/visibility/evidence substrate under a new demand-led architecture rather than discarded.

---

## 16. Sources reviewed

### Official / first-party marketplace and trend systems

1. Envato — Content Opportunities Feature
   https://help.author.envato.com/hc/en-us/articles/10710258805529-Content-Opportunities-Feature
2. Envato — API Documentation
   https://build.envato.com/api/
3. Envato — Trending Items and Quality Tips
   https://help.author.envato.com/hc/en-us/articles/360000471186-Trending-Items-and-Quality-Tips
4. Envato — Item Quality Expectations
   https://help.author.envato.com/hc/en-us/articles/360000424523-Envato-s-Item-Quality-Expectations
5. Envato — PowerPoint and Keynote Requirements
   https://help.author.envato.com/hc/en-us/articles/360000472123-PowerPoint-and-Keynote-Presentation-Template-Requirements
6. Envato — Item Presentation Requirements
   https://help.author.envato.com/hc/en-us/articles/360000424863-Item-Presentation-Requirements
7. Google Trends — FAQ / normalization / interpretation
   https://support.google.com/trends/answer/4365533
8. Google Trends — Search terms vs topics
   https://support.google.com/trends/answer/17309543
9. Google Trends API Alpha
   https://developers.google.com/search/apis/trends
10. Pinterest — How We Forecast Trends
    https://business.pinterest.com/blog/how-we-forecast-trends-pinterest-predicts/
11. Pinterest Predicts 2026 methodology
    https://business.pinterest.com/en-ca/blog/pinterest-predicts-2026-turn-trends-into-unlimited-possibilities/
12. Canva — Design Trends 2026 methodology
    https://www.canva.com/newsroom/news/design-trends-2026/
13. Adobe — 2026 Creative Trends methodology
    https://blog.adobe.com/en/publish/2026/01/08/how-creators-leveraging-adobe-2026-creative-trends
14. Etsy — Marketplace Insights
    https://help.etsy.com/hc/en-gb/articles/35122361353239-How-Do-I-Use-Etsy-s-Marketplace-Insights-Tool
15. Etsy — Creating Listings That Convert
    https://www.etsy.com/seller-handbook/article/creating-listings-that-convert/366469719354
16. Etsy — How Etsy Search Works
    https://www.etsy.com/seller-handbook/article/375461474487

### Academic / methodological research

17. Al-Halah, Stiefelhagen, Grauman — Fashion Forward: Forecasting Visual Style in Fashion
    https://arxiv.org/abs/1705.06394
18. Al-Halah, Grauman — Modeling Fashion Influence from Photos
    https://arxiv.org/abs/2011.09663
19. Phillips et al. — Using Social Media to Predict the Future: A Systematic Literature Review
    https://arxiv.org/abs/1706.06134
20. Langrené et al. — The Dynamics of Innovation Diffusion: A Survey of Bass-Type Models
    https://arxiv.org/abs/2602.19488
21. Bae et al. — Mathematical Modeling of Trend Cycle: Fad, Fashion and Classic
    https://arxiv.org/abs/2304.10225
22. Aminikhanghahi & Cook — A Survey of Methods for Time Series Change Point Detection
    https://pmc.ncbi.nlm.nih.gov/articles/PMC5464762/

---

## 17. Research status

```text
DIRECT DEMAND PRINCIPLE                SUPPORTED ACROSS SOURCES
DEMAND/SUPPLY SEPARATION               STRONGLY SUPPORTED
TEMPORAL GROWTH/PERSISTENCE             STRONGLY SUPPORTED
SEASONALITY/NORMALIZATION               STRONGLY SUPPORTED
CONVERSION/ADOPTION VALIDATION          SUPPORTED
VISUAL ANALYSIS FOR DESIGN TRENDS       SUPPORTED
MULTI-SOURCE VALIDATION                 SUPPORTED
SOURCE-BIAS/NOISE GUARDRAILS            STRONGLY SUPPORTED
TREND LIFECYCLE MODEL                   SUPPORTED
PRODUCT AGE AS TREND REQUIREMENT        REJECTED
RANKING AS DEMAND PROOF                 REJECTED
SINGLE-SOURCE TREND CLAIM               REJECTED
```

**Research foundation is sufficient to proceed to implementation planning.**
