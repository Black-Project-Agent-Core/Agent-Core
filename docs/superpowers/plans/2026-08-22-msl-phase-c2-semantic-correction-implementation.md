# MSL Phase C2 Semantic Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned, additive C2 semantic projection so public API/UI names match the frozen C1 mathematics without changing C1 numeric behavior, persistence, Rust wire contracts, or legacy compatibility fields.

**Architecture:** Keep v0.1 domain/persistence and Rust `msl-analytics/2` untouched. Add a pure Go `internal/semantics` projector, then apply it only in HTTP read-model adapters and UI presentation. Existing filters, model IDs, snapshot JSON fields, history, and ranking order remain compatibility contracts.

**Tech Stack:** Go 1.26.4, Rust 1.97.1 GNU toolchain, existing net/http server, embedded HTML/JavaScript UI, JSON locale dictionaries, Inno Setup 6.7.3 for native acceptance.

**Spec:** `docs/superpowers/specs/2026-08-22-msl-phase-c2-semantic-correction-design.md`

## Global Constraints

- Semantic contract version is exactly `msl-semantic-contract/2`.
- C1 product/catalog/structural numeric formulas, weights, thresholds, rounding, clamping, ranking order, Rust operation IDs, schema `1`, and binary framing must not change.
- Legacy v0.1 JSON fields and JSONL history remain readable and are never rewritten in place.
- Rust stays mandatory for migrated production analytics; no Go numerical fallback may return.
- Do not rename compatibility query parameters such as `minOpportunity` or sort value `opportunity`.
- `OpportunityScore` is presented as Product/Catalog Insight Score only when it is the C1 ranking score; the separate Market Opportunity subsystem is out of scope.
- C3 concepts such as EvidenceStage, SignalEligibility, calibrated confidence, true acceleration, ODMI, movement-index v0.2, and seasonality are out of scope.
- All task-local tools, caches, build output, native installs, and test evidence stay under `F:\Market-Signal-Lab`.
- Do not merge to `main` implicitly.

---
### Task 1: Pure semantic contract and identity projectors

**Files:**
- Create: `internal/semantics/registry.go`
- Create: `internal/semantics/ranking_v2.go`
- Create: `internal/semantics/structural_v2.go`
- Create: `internal/semantics/ranking_v2_test.go`
- Create: `internal/semantics/structural_v2_test.go`

**Interfaces:**
- Produces: `const ContractVersionV2 = "msl-semantic-contract/2"`
- Produces: `func ProjectProduct(version string, snapshot domain.ProductSnapshot) (ProductV2, error)`
- Produces: `func ProjectCatalog(version string, snapshot domain.CatalogSnapshot) (CatalogV2, error)`
- Produces: `func ProjectStructural(version string, snapshot domain.MarketIndexSnapshot) (StructuralV2, error)`
- Depends only on: `internal/domain`

- [ ] **Step 1: Write failing projection identity tests**

```go
func TestProjectProductV2CopiesLegacyValuesExactly(t *testing.T) {
    legacy := domain.ProductSnapshot{RelativeStrength: 73.4, OpportunityScore: 68.2}
    got, err := ProjectProduct(ContractVersionV2, legacy)
    if err != nil { t.Fatal(err) }
    if got.Contract.Version != ContractVersionV2 || got.PeerRelativeRank != 73.4 || got.ProductInsightScore != 68.2 {
        t.Fatalf("projection=%+v", got)
    }
}
```
```go
func TestProjectCatalogV2CopiesAllLegacyValuesExactly(t *testing.T) {
    legacy := domain.CatalogSnapshot{
        ExposureBreadth: 61.5, NewSupplyVelocityPercent: 22.2,
        NewSupplyVelocityIndex: 64.3, CompetitionAcceleration: -11.4,
        RelativeStrength: 81.1, OpportunityScore: 70.7,
    }
    got, err := ProjectCatalog(ContractVersionV2, legacy)
    if err != nil { t.Fatal(err) }
    if got.DirectionalBreadth != 61.5 || got.ObservedNewSupplyGrowthPercent != 22.2 ||
        got.ObservedNewSupplyMomentumIndex != 64.3 || got.CompetitionMomentumPercent != -11.4 ||
        got.PeerRelativeRank != 81.1 || got.CatalogInsightScore != 70.7 {
        t.Fatalf("projection=%+v", got)
    }
}

func TestProjectorsRejectUnknownSemanticContract(t *testing.T) {
    if _, err := ProjectProduct("msl-semantic-contract/999", domain.ProductSnapshot{}); err == nil {
        t.Fatal("expected unsupported semantic contract error")
    }
}
```

- [ ] **Step 2: Run the new tests and confirm RED**

Run: `go test ./internal/semantics -count=1`
Expected: FAIL because `internal/semantics` and the projector symbols do not exist.
- [ ] **Step 3: Implement the contract registry and ranking types**

```go
const ContractVersionV2 = "msl-semantic-contract/2"

type Contract struct { Version string `json:"version"` }

func contract(version string) (Contract, error) {
    if version != ContractVersionV2 {
        return Contract{}, fmt.Errorf("unsupported semantic contract %q", version)
    }
    return Contract{Version: ContractVersionV2}, nil
}

type ProductV2 struct {
    Contract            Contract `json:"contract"`
    PeerRelativeRank    float64  `json:"peerRelativeRank"`
    ProductInsightScore float64  `json:"productInsightScore"`
}
```

`ProjectProduct` and `ProjectCatalog` must only copy the legacy source fields specified by the approved design; they must not call ranking helpers or recompute values.

- [ ] **Step 4: Implement structural projection**

```go
type StructuralV2 struct {
    Contract                       Contract `json:"contract"`
    ObservedSegmentComposition     float64  `json:"observedSegmentComposition"`
    CappedCompositionConcentration float64  `json:"cappedCompositionConcentration"`
    MeanEligibleSegmentComposition float64  `json:"meanEligibleSegmentComposition"`
    CompositionWeightingGap        float64  `json:"compositionWeightingGap"`
}
```
`ProjectStructural` maps `CompositionIndex`, `VolumeWeightedValue`, `EqualSectorValue`, and `DivergenceValue` directly to the four C2 semantic fields.

- [ ] **Step 5: Run semantic unit tests and confirm GREEN**

Run: `go test ./internal/semantics -count=1`
Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add internal/semantics
git commit -m "feat: add C2 semantic projection contract"
```

---

### Task 2: Additive semantic adapters for ranking and structural API reads

**Files:**
- Create: `internal/web/semantic_views.go`
- Modify: `internal/web/ranking_handlers.go`
- Modify: `internal/web/signal_integrity_handlers.go`
- Modify: `internal/web/ranking_handlers_test.go`
- Modify: `internal/web/integrity_handlers_test.go`

**Interfaces:**
- Consumes: `semantics.ProjectProduct`, `semantics.ProjectCatalog`, `semantics.ProjectStructural`
- Produces HTTP JSON with all legacy fields unchanged plus `semantics`.
- Projection errors return HTTP 500; no numeric recomputation or fallback occurs.
- [ ] **Step 1: Write RED HTTP compatibility assertions**

Extend `TestRankingBuildAndListEndpoints` after catalog/product reads:

```go
if catalogs[0].Semantics.Contract.Version != semantics.ContractVersionV2 {
    t.Fatalf("catalog semantics=%+v", catalogs[0].Semantics)
}
if catalogs[0].Semantics.CatalogInsightScore != catalogs[0].Snapshot.OpportunityScore {
    t.Fatal("catalog semantic alias changed numeric value")
}
if products[0].Semantics.ProductInsightScore != products[0].Snapshot.OpportunityScore {
    t.Fatal("product semantic alias changed numeric value")
}
```

Add an integrity endpoint test that seeds non-zero structural values and asserts legacy top-level keys plus `semantics.compositionWeightingGap` are both present in raw JSON.

- [ ] **Step 2: Run focused web tests and confirm RED**

Run: `go test ./internal/web -run 'RankingBuildAndListEndpoints|IntegrityEndpointsReturnReadModelsWithoutSecrets' -count=1`
Expected: FAIL because response types do not expose semantics.

- [ ] **Step 3: Add explicit response adapters**

```go
type catalogRankingSemanticRow struct {
    app.CatalogRankingRow
    Semantics semantics.CatalogV2 `json:"semantics"`
}

type productRankingSemanticRow struct {
    app.ProductRankingRow
    Semantics semantics.ProductV2 `json:"semantics"`
}

type integrityIndexSemanticRow struct {
    domain.MarketIndexSnapshot
    Semantics semantics.StructuralV2 `json:"semantics"`
}
```
Conversion helpers must iterate rows, call the projector with `semantics.ContractVersionV2`, and return an error immediately if projection fails. The embedded legacy row/snapshot preserves existing JSON keys and shape.

- [ ] **Step 4: Wire ranking handlers through the adapters**

Change only the GET read handlers:

```go
rows, err := s.svc.CatalogRankings(filter)
if err != nil { errOut(w, http.StatusInternalServerError, err); return }
projected, err := projectCatalogRankingRows(rows)
if err != nil { errOut(w, http.StatusInternalServerError, err); return }
jsonOut(w, http.StatusOK, projected)
```

Apply the equivalent product conversion. Leave `rankingBuild` and its persisted `RankingBuildResult` unchanged.

- [ ] **Step 5: Wire integrity index reads through structural adapters**

Apply structural projection to both `/api/integrity/indices` and `/api/integrity/index-history`. Keep sample audit, quality, surfaces, provenance, and legacy-review endpoints unchanged.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `go test ./internal/web -run 'Ranking|Integrity' -count=1`
Expected: PASS, with legacy and additive semantic JSON both present.

- [ ] **Step 7: Commit Task 2**

```bash
git add internal/web/semantic_views.go internal/web/ranking_handlers.go internal/web/signal_integrity_handlers.go internal/web/ranking_handlers_test.go internal/web/integrity_handlers_test.go
git commit -m "feat: expose C2 semantic API views"
```

---
### Task 3: Preserve explorer/watchlist/comparison compatibility while adding semantics

**Files:**
- Modify: `internal/web/semantic_views.go`
- Modify: `internal/web/explorer_handlers.go`
- Modify: `internal/web/explorer_handlers_test.go`

**Interfaces:**
- Existing service filters and domain explorer structs remain unchanged.
- `minOpportunity`, `maxOpportunity`, and `sortBy=opportunity` continue to operate on legacy `OpportunityScore` values.
- Public explorer/watchlist/comparison rows gain `semantics` only when the resolved row contains a product or catalog snapshot.

- [ ] **Step 1: Write RED explorer semantic assertions**

Extend `TestExplorerListEndpoints` and `TestComparisonEndpointsAndValidation` to decode response view types and assert:

```go
if products.Items[0].Semantics == nil || products.Items[0].Semantics.ProductInsightScore != products.Items[0].Snapshot.OpportunityScore {
    t.Fatalf("product semantics=%+v", products.Items[0].Semantics)
}
if catalogs.Items[0].Semantics == nil || catalogs.Items[0].Semantics.CatalogInsightScore != catalogs.Items[0].Snapshot.OpportunityScore {
    t.Fatalf("catalog semantics=%+v", catalogs.Items[0].Semantics)
}
```

Also retain the existing request `/api/explorer/products?...&minOpportunity=1`; that exact compatibility parameter is part of the acceptance test.

- [ ] **Step 2: Run explorer tests and confirm RED**

Run: `go test ./internal/web -run 'Explorer|SavedViewsAndWatchlist|Comparison' -count=1`
Expected: FAIL on missing semantic fields while existing compatibility-filter assertions still pass.
- [ ] **Step 3: Add web-only explorer response types**

```go
type catalogExplorerSemanticRow struct {
    domain.CatalogExplorerRow
    Semantics *semantics.CatalogV2 `json:"semantics,omitempty"`
}

type productExplorerSemanticRow struct {
    domain.ProductExplorerRow
    Semantics *semantics.ProductV2 `json:"semantics,omitempty"`
}

type watchlistSemanticRow struct {
    domain.WatchlistResolvedRow
    Semantics any `json:"semantics,omitempty"`
}
```

Add paged response structs preserving exactly `items`, `total`, `limit`, and `offset`. For watchlist, set `Semantics` to `CatalogV2` for catalog entries, `ProductV2` for product entries, and `nil` for author entries.

- [ ] **Step 4: Adapt explorer, watchlist, and compare GET handlers**

Project only immediately before `jsonOut`; do not change `ExploreCatalogs`, `ExploreProducts`, `Watchlist`, `CompareCatalogs`, or `CompareProducts` filtering/sorting logic.

- [ ] **Step 5: Prove compatibility filters still behave identically**

Add an assertion that `minOpportunity=101` returns zero products while `minOpportunity=1` still returns the known fixture product. This proves the legacy query contract was not silently renamed or reinterpreted.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `go test ./internal/web -run 'Explorer|SavedViewsAndWatchlist|Comparison' -count=1`
Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add internal/web/semantic_views.go internal/web/explorer_handlers.go internal/web/explorer_handlers_test.go
git commit -m "feat: project C2 semantics across explorer reads"
```

---
### Task 4: Correct human-readable model notes without changing model identity

**Files:**
- Modify: `internal/ranking/models.go`
- Modify: `internal/ranking/models_test.go`

**Interfaces:**
- `ModelDefinition.Name`, `Version`, `Kind`, `MissingPolicy`, and `Weights` remain byte-for-byte equivalent as Go values.
- Only `Notes` for `product-opportunity` and `catalog-opportunity` change to C2-safe language.

- [ ] **Step 1: Write a RED frozen-contract test**

```go
func TestC2ModelPresentationPreservesLegacyNumericContracts(t *testing.T) {
    product, _ := ModelByName("product-opportunity")
    if product.Version != "product-opportunity-v0.1" || product.Kind != "opportunity_index" || product.MissingPolicy != "renormalize" {
        t.Fatalf("product contract changed: %+v", product)
    }
    want := map[string]float64{"exposure": .40, "relative_strength": .25, "freshness": .15, "cross_query": .10, "rank_velocity": .10}
    if !reflect.DeepEqual(product.Weights, want) { t.Fatalf("weights=%v", product.Weights) }
    if strings.Contains(strings.ToLower(product.Notes), "entry-opportunity") || strings.Contains(strings.ToLower(product.Notes), "entry timing") {
        t.Fatalf("unsafe C2 note: %q", product.Notes)
    }
}
```

Add the same identity/weight protection for `catalog-opportunity-v0.1`.

- [ ] **Step 2: Run model tests and confirm RED**

Run: `go test ./internal/ranking -run 'ModelRegistry|C2ModelPresentation' -count=1`
Expected: FAIL because current notes still describe entry opportunity.
- [ ] **Step 3: Replace only the human-readable Notes strings**

Use these exact notes:

```go
Notes: "Legacy numeric model presented as Product Insight Score under msl-semantic-contract/2; not market-entry timing, success probability, revenue, or competitor earnings.",
```

```go
Notes: "Legacy numeric model presented as Catalog Insight Score under msl-semantic-contract/2; not market-entry timing, success probability, revenue, or certainty of future demand.",
```

Do not rename model `Name`, `Version`, `Kind`, or weight-map keys.

- [ ] **Step 4: Run model tests and confirm GREEN**

Run: `go test ./internal/ranking -run 'ModelRegistry|C2ModelPresentation' -count=1`
Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add internal/ranking/models.go internal/ranking/models_test.go
git commit -m "fix: correct C2 model presentation semantics"
```

---

### Task 5: Move ranking/explorer/watchlist/comparison UI to C2 terminology

**Files:**
- Modify: `internal/web/assets/js/app.js`
- Modify: `internal/web/templates/index.html`
- Modify: `internal/i18n/locales/en.json`
- Modify: `internal/i18n/locales/id.json`
- Create: `internal/web/semantic_ui_test.go`

**Interfaces:**
- UI consumes `row.semantics` when present and falls back to legacy numeric fields only for compatibility.
- Machine filter IDs/values such as `productExplorerMinOpportunity`, `catalogExplorerMinOpportunity`, and `sortBy=opportunity` remain unchanged.
- The separate `#opportunity` Market Opportunity subsystem remains untouched.
- [ ] **Step 1: Add RED semantic UI contract tests**

```go
func TestC2RankingAndExplorerUseDefensibleSemanticLabels(t *testing.T) {
    required := []string{
        "semantic.product_insight_score", "semantic.catalog_insight_score",
        "semantic.peer_relative_rank", "semantic.directional_breadth",
        "semantic.observed_new_supply_momentum", "semantic.competition_momentum",
    }
    for _, key := range required {
        if !strings.Contains(uiSource, key) { t.Fatalf("missing C2 UI key %q", key) }
    }
    for _, forbidden := range []string{
        "percent(row.snapshot.opportunityScore)",
        "percent(row.snapshot.relativeStrength)",
        "percent(row.snapshot.exposureBreadth)",
    } {
        if strings.Contains(appJS, forbidden) { t.Fatalf("legacy ranking presentation remains: %s", forbidden) }
    }
}
```

Add a separate assertion that `id="productExplorerMinOpportunity"` and `id="catalogExplorerMinOpportunity"` still exist, proving only visible semantics changed.
- [ ] **Step 2: Run semantic UI tests and confirm RED**

Run: `go test ./internal/web -run 'C2RankingAndExplorer|ExplorerStaticCopy|i18n' -count=1`
Expected: FAIL because the C2 translation keys and semantic JS access do not exist.

- [ ] **Step 3: Add C2 locale keys in both languages**

English values:

```text
semantic.product_insight_score = Product Insight Score
semantic.catalog_insight_score = Catalog Insight Score
semantic.peer_relative_rank = Peer Relative Rank
semantic.directional_breadth = Directional Breadth
semantic.observed_new_supply_growth = Observed New-Supply Growth
semantic.observed_new_supply_momentum = Observed New-Supply Momentum
semantic.competition_momentum = Competition Momentum
```

Indonesian values:

```text
semantic.product_insight_score = Skor Insight Produk
semantic.catalog_insight_score = Skor Insight Katalog
semantic.peer_relative_rank = Peringkat Relatif Kelompok Pembanding
semantic.directional_breadth = Keluasan Arah Produk
semantic.observed_new_supply_growth = Pertumbuhan Pasokan Baru Teramati
semantic.observed_new_supply_momentum = Momentum Pasokan Baru Teramati
semantic.competition_momentum = Momentum Persaingan Teramati
```
- [ ] **Step 4: Add a deterministic semantic-value helper in `app.js`**

```js
const SEMANTIC_CONTRACT_V2='msl-semantic-contract/2';
function semanticValue(row,key,legacyValue){
  const s=row&&row.semantics;
  if(s&&s.contract&&s.contract.version===SEMANTIC_CONTRACT_V2&&Number.isFinite(Number(s[key]))) return Number(s[key]);
  return legacyValue;
}
```

Use it in ranking rows, explorer rows, watchlist metrics, and comparison cards. Labels must be the new C2 locale keys even when numeric fallback uses a legacy field.

- [ ] **Step 5: Replace visible ranking/explorer copy only**

Change ranking table headings from Opportunity/Breadth/Relative Strength/New Supply/Competition to the C2 semantic labels. Change explorer filter labels to `Minimum Product Insight Score` / `Minimum Catalog Insight Score` while preserving their existing element IDs and query parameters.

Replace ranking-panel explanatory copy that currently says “high Opportunity Score means the observed entry conditions remain comparatively attractive” with copy stating that Product/Catalog Insight Score is a composite observed-market ranking signal and not entry timing or success probability.

Do not change navigation or copy inside the separate `#opportunity` section.

- [ ] **Step 6: Update watchlist and comparison dynamic metrics**

`dynamic.catalog_watch_metrics` must present Trend + Catalog Insight Score. `dynamic.product_watch_metrics` must present Exposure + Product Insight Score. Comparison cards must read the semantic score and use the new label.

- [ ] **Step 7: Run UI/localization tests and confirm GREEN**

Run: `go test ./internal/web -run 'C2RankingAndExplorer|Explorer|Localization|i18n' -count=1`
Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add internal/web/assets/js/app.js internal/web/templates/index.html internal/i18n/locales/en.json internal/i18n/locales/id.json internal/web/semantic_ui_test.go
git commit -m "feat: present C2 ranking semantics in UI"
```

---
### Task 6: Reframe structural integrity UI as composition/concentration

**Files:**
- Modify: `internal/web/assets/js/app.js`
- Modify: `internal/web/templates/index.html`
- Modify: `internal/i18n/locales/en.json`
- Modify: `internal/i18n/locales/id.json`
- Modify: `internal/web/integrity_ui_test.go`

**Interfaces:**
- `/api/integrity/indices` and `/api/integrity/index-history` retain legacy top-level fields and add `semantics` from Task 2.
- Visible structural UI uses `ObservedSegmentComposition`, `CappedCompositionConcentration`, `MeanEligibleSegmentComposition`, and `CompositionWeightingGap` terminology.
- Existing DOM IDs may remain for CSS/test compatibility; visible labels must change.

- [ ] **Step 1: Add RED structural semantic UI assertions**

```go
func TestC2IntegrityUIUsesCompositionSemantics(t *testing.T) {
    for _, key := range []string{
        "semantic.observed_segment_composition",
        "semantic.capped_composition_concentration",
        "semantic.mean_eligible_segment_composition",
        "semantic.composition_weighting_gap",
    } {
        if !strings.Contains(uiSource, key) { t.Fatalf("missing structural semantic key %q", key) }
    }
    if strings.Contains(appJS, "formatPercent(row.opportunityScore||0)") {
        t.Fatal("structural UI still promotes legacy OpportunityScore")
    }
}
```

- [ ] **Step 2: Run integrity UI tests and confirm RED**

Run: `go test ./internal/web -run 'C2IntegrityUI|Alpha65SignalIntegrity' -count=1`
Expected: FAIL on missing C2 structural labels.
- [ ] **Step 3: Add structural C2 locale keys**

English:

```text
semantic.observed_segment_composition = Observed Segment Composition
semantic.capped_composition_concentration = Capped Composition Concentration
semantic.mean_eligible_segment_composition = Mean Eligible Segment Composition
semantic.composition_weighting_gap = Composition Weighting Gap
semantic.legacy_no_comparable_direction = Legacy v0.1 value; no comparable products are available for directional interpretation.
```

Indonesian:

```text
semantic.observed_segment_composition = Komposisi Segmen Teramati
semantic.capped_composition_concentration = Konsentrasi Komposisi Berbatas
semantic.mean_eligible_segment_composition = Rata-rata Komposisi Segmen Layak
semantic.composition_weighting_gap = Selisih Pembobotan Komposisi
semantic.legacy_no_comparable_direction = Nilai kompatibilitas v0.1; belum ada produk pembanding untuk interpretasi arah.
```

- [ ] **Step 4: Update structural rendering**

Read `row.semantics.observedSegmentComposition`, `cappedCompositionConcentration`, `meanEligibleSegmentComposition`, and `compositionWeightingGap` through `semanticValue`. Remove generic structural Opportunity presentation from new C2 tables/cards. Preserve legacy values in provenance/audit views only when clearly labeled as legacy compatibility data.

When a catalog ranking row has `snapshot.comparableProducts===0`, render the `semantic.legacy_no_comparable_direction` note instead of describing `directionalBreadth===50` as balanced or neutral evidence.

- [ ] **Step 5: Run integrity and locale tests and confirm GREEN**

Run: `go test ./internal/web -run 'Integrity|C2IntegrityUI|i18n' -count=1`
Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add internal/web/assets/js/app.js internal/web/templates/index.html internal/i18n/locales/en.json internal/i18n/locales/id.json internal/web/integrity_ui_test.go
git commit -m "fix: reframe structural UI as composition semantics"
```

---
### Task 7: Lock C1 fixture fingerprints and prove history immutability

**Files:**
- Create: `internal/ranking/c2_golden_immutability_test.go`
- Create: `internal/semantics/persistence_test.go`

**Interfaces:**
- C1 fixture content is canonical after CRLF→LF normalization so Windows checkout policy cannot create false failures.
- Semantic projection must not write to ranking/history storage.

- [ ] **Step 1: Write the cross-platform C1 fingerprint guard**

```go
func normalizedFileSHA256(t *testing.T, path string) string {
    t.Helper()
    raw, err := os.ReadFile(path)
    if err != nil { t.Fatal(err) }
    raw = bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))
    sum := sha256.Sum256(raw)
    return hex.EncodeToString(sum[:])
}
```

Assert these exact canonical fingerprints:

```text
internal/ranking/testdata/c1/product_v01_cases.json = 0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4
internal/ranking/testdata/c1/catalog_v01_cases.json = 95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3
internal/indexing/testdata/c1/structural_index_v01_cases.json = bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea
```

- [ ] **Step 2: Write a persistence immutability test**

Use `storage.Open(t.TempDir())`, append one legacy product snapshot and one catalog snapshot, read the JSONL bytes, call the corresponding semantic projectors on rows read back from storage, then re-read the JSONL files and assert `bytes.Equal(before, after)`.
- [ ] **Step 3: Run immutability tests and confirm GREEN**

Run: `go test ./internal/ranking ./internal/semantics -run 'C2|Golden|Persistence' -count=1`
Expected: PASS.

- [ ] **Step 4: Verify no C1 fixture diff exists**

Run:

```powershell
$paths=@(
  'internal/ranking/testdata/c1/product_v01_cases.json',
  'internal/ranking/testdata/c1/catalog_v01_cases.json',
  'internal/indexing/testdata/c1/structural_index_v01_cases.json'
)
git diff --exit-code bc5e49381df18516c4d296cbf164314ec5a35375 -- $paths
```

Expected: exit code `0`, no diff.

- [ ] **Step 5: Commit Task 7**

```bash
git add internal/ranking/c2_golden_immutability_test.go internal/semantics/persistence_test.go
git commit -m "test: lock C1 data through C2 semantics"
```

---

### Task 8: Full automated regression and Rust contract freeze

**Files:**
- No production file changes expected.
- Evidence output stays under ignored `dist/c2-semantic-acceptance/`.

**Interfaces:**
- Full Go regression runs with the native Rust worker.
- Rust source/wire contract must remain unchanged from the approved C2 spec baseline.
- [ ] **Step 1: Configure repository-local Windows toolchains**

```powershell
$workspace='F:\Market-Signal-Lab\dist\.git-write-clone'
$tools='F:\Market-Signal-Lab\dist\.local-tools'
$env:GOROOT="$tools\go1.26.4\go"
$go="$env:GOROOT\bin\go.exe"
$env:CARGO_HOME="$tools\rust\cargo"
$env:RUSTUP_HOME="$tools\rust\rustup"
$env:RUSTUP_TOOLCHAIN='1.97.1-x86_64-pc-windows-gnu'
$cargo="$env:CARGO_HOME\bin\cargo.exe"
$linker="$env:RUSTUP_HOME\toolchains\1.97.1-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\rust-lld.exe"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=$linker
Set-Location -LiteralPath $workspace
```

- [ ] **Step 2: Prove Rust/numeric production source was not changed by C2**

Run:

```powershell
git diff --exit-code bc5e49381df18516c4d296cbf164314ec5a35375 -- engines/rust internal/analyticsengine internal/ranking/rust_input_v01.go internal/ranking/rust_output_v01.go internal/indexing
```

Expected: exit code `0`, no diff.

- [ ] **Step 3: Run full Rust regression**

Run: `& $cargo test --manifest-path .\engines\rust\Cargo.toml`
Expected: PASS, exit code `0`.

- [ ] **Step 4: Build the release Rust worker**

Run: `& $cargo build --release --manifest-path .\engines\rust\Cargo.toml`
Expected: `engines\rust\target\release\msl-analytics-rust.exe` exists.
- [ ] **Step 5: Run full Go regression against the release Rust worker**

```powershell
$env:MSL_RUST_WORKER=(Resolve-Path '.\engines\rust\target\release\msl-analytics-rust.exe').Path
& $go test ./... -count=1
if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }
```

Expected: all repository Go packages PASS.

- [ ] **Step 6: Run focused C2 contract suite once more**

Run:

```powershell
& $go test ./internal/semantics ./internal/ranking ./internal/web ./internal/storage -count=1
```

Expected: PASS.

- [ ] **Step 7: Record automated evidence under ignored dist**

Create `dist/c2-semantic-acceptance/automated.json` with source commit, Go version, Rust version, release-worker SHA-256, full Go result, full Rust result, and the three canonical C1 fixture fingerprints. Do not store credentials, tokens, raw HTTP authorization headers, or market payloads.

---

### Task 9: Build and verify a native Windows C2 installer

**Files:**
- Use: `scripts/build-windows-installer.ps1`
- Use: `scripts/verify-windows-installer.ps1`
- Evidence only: ignored `dist/c2-semantic-acceptance/`

**Interfaces:**
- Native installer is built from the exact C2 source commit.
- Installed app must remain `healthy / rust-production / msl-analytics/2`.
- Native UI/API smoke must expose C2 semantics while retaining legacy numeric fields.
- [ ] **Step 1: Build the installer with explicit repository-local tools**

```powershell
$accept=Join-Path $workspace 'dist\c2-semantic-acceptance'
$iscc='F:\Market-Signal-Lab\dist\.local-tools\inno-6.7.3\ISCC.exe'
$distRoot=Join-Path $accept 'windows-installer'
& .\scripts\build-windows-installer.ps1 -GoExe $go -CargoExe $cargo -ISCCExe $iscc -DistRoot $distRoot
if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }
```

Expected installer: `dist/c2-semantic-acceptance/windows-installer/output/Market-Signal-Lab-Setup-0.3.0-alpha.6.5.3-preview.1.exe`.

- [ ] **Step 2: Run installed health verification inside F:\Market-Signal-Lab**

```powershell
$installer=Join-Path $distRoot 'output\Market-Signal-Lab-Setup-0.3.0-alpha.6.5.3-preview.1.exe'
$installDir=Join-Path $accept 'installed-app'
$env:LOCALAPPDATA=Join-Path $accept 'localappdata'
New-Item -ItemType Directory -Force -Path $env:LOCALAPPDATA | Out-Null
& .\scripts\verify-windows-installer.ps1 -InstallerPath $installer -ExpectedVersion '0.3.0-alpha.6.5.3-preview.1' -InstallDir $installDir -Port 17782 -KeepInstalled
if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }
```

Expected: installed hashes match `version.json`; analytics health is `healthy / rust-production / msl-analytics/2`.

- [ ] **Step 3: Start the installed candidate for semantic smoke**

```powershell
$app=Join-Path $installDir 'Market Signal Lab.exe'
$p=Start-Process -FilePath $app -ArgumentList @('serve','--port','17783','--no-open') -PassThru
```

Poll `/api/system/analytics-engine` until healthy before continuing.
- [ ] **Step 4: Require the stored Envato credential without exposing it**

```powershell
$conn=Invoke-RestMethod -Uri 'http://127.0.0.1:17783/api/connections/envato' -Method Get -TimeoutSec 5
if(-not [bool]$conn.configured -or [string]$conn.status -ne 'connected'){
    throw 'native C2 semantic smoke requires the existing Windows Credential Manager Envato connection'
}
```

Do not print, export, or read the raw token. Recording `effectiveSource=credential_manager` and the non-secret fingerprint is allowed.

- [ ] **Step 5: Run one real installed Quick scan and wait for completion**

```powershell
$start=Invoke-RestMethod -Uri 'http://127.0.0.1:17783/api/autopilot/run' -Method Post -ContentType 'application/json' -Body '{"mode":"quick"}'
$runId=[string]$start.runId
$deadline=[DateTime]::UtcNow.AddMinutes(30)
do {
    Start-Sleep -Seconds 1
    $live=Invoke-RestMethod -Uri ("http://127.0.0.1:17783/api/autopilot/live?runId="+[Uri]::EscapeDataString($runId)) -Method Get -TimeoutSec 10
} while([DateTime]::UtcNow -lt $deadline -and @('completed','partial','failed','cancelled') -notcontains [string]$live.status)
if([string]$live.status -ne 'completed'){ throw "native C2 Quick status=$($live.status)" }
```

Expected: completed without fabricated progress or synthetic market data.

- [ ] **Step 6: Prove installed API semantic aliases equal legacy numbers**

```powershell
$catalogs=@(Invoke-RestMethod -Uri 'http://127.0.0.1:17783/api/ranking/catalogs?windowDays=30' -Method Get -TimeoutSec 15)
$products=@(Invoke-RestMethod -Uri 'http://127.0.0.1:17783/api/ranking/products?windowDays=30' -Method Get -TimeoutSec 15)
if($catalogs.Count -eq 0 -or $products.Count -eq 0){ throw 'native C2 ranking rows are empty after Quick' }
if($catalogs[0].semantics.contract.version -ne 'msl-semantic-contract/2'){ throw 'catalog semantic contract missing' }
if([double]$catalogs[0].semantics.catalogInsightScore -ne [double]$catalogs[0].snapshot.opportunityScore){ throw 'catalog semantic identity mismatch' }
if([double]$products[0].semantics.productInsightScore -ne [double]$products[0].snapshot.opportunityScore){ throw 'product semantic identity mismatch' }
```
- [ ] **Step 7: Prove installed UI assets carry C2 semantics**

```powershell
$js=(Invoke-WebRequest -Uri 'http://127.0.0.1:17783/assets/js/app.js' -UseBasicParsing -TimeoutSec 10).Content
$en=Invoke-RestMethod -Uri 'http://127.0.0.1:17783/api/locales/en' -Method Get -TimeoutSec 10
if($js -notmatch 'SEMANTIC_CONTRACT_V2'){ throw 'installed JS lacks C2 semantic contract' }
if([string]$en.'semantic.product_insight_score' -ne 'Product Insight Score'){ throw 'installed locale lacks Product Insight Score' }
if([string]$en.'semantic.catalog_insight_score' -ne 'Catalog Insight Score'){ throw 'installed locale lacks Catalog Insight Score' }
```

- [ ] **Step 8: Record native evidence and stop the app**

Write `dist/c2-semantic-acceptance/native.json` containing source commit, installer/app/worker hashes, Rust health, semantic contract version, Quick run ID/status, row counts, semantic-identity assertions, credential source/fingerprint only, and timestamp. Then stop only the process owned by this smoke run.

- [ ] **Step 9: Commit no generated native artifacts**

Run: `git status --short`
Expected: only planned source/docs changes are tracked; `dist/c2-semantic-acceptance/` is ignored.

---

### Task 10: Final C2 QA, checkpoint, and branch publication

**Files:**
- Create: `docs/qa/phase-c2-semantic-correction-qa.md`
- Modify: `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
- Modify: `docs/checkpoints/CONTINUE_MSL.md`
- Create only if every required gate passes: `docs/checkpoints/2026-08-22-MSL-C2-COMPLETE-C3-NEXT.md`

**Interfaces:**
- C2 may be marked COMPLETE only from actual recorded test/native evidence.
- Formal product release stays `NOT RELEASED`.
- C3 remains separate and requires its own design/review/calibration work.
- [ ] **Step 1: Write QA only from observed evidence**

`phase-c2-semantic-correction-qa.md` must record:

```text
source commit and branch
semantic contract version
projection identity test result
legacy API compatibility result
minOpportunity compatibility result
C1 canonical fixture fingerprints
Rust source/wire diff gate result
full cargo test result
full go test result
installer/app/worker SHA-256
native rust-production/msl-analytics/2 health
native Quick run ID/status
native catalog/product semantic identity result
locale/UI smoke result
credential source/fingerprint only
known limitations
formal release status
```

Do not include the raw Envato credential or copied market payloads.

- [ ] **Step 2: Update checkpoint status based on the real gate result**

If every C2 acceptance criterion passes, set:

```text
Phase C1 Rust ranking parity               COMPLETE / VERIFIED
Phase C2 semantic correction               COMPLETE / VERIFIED
Phase C3 evidence-calibrated model v0.2    DESIGN NEXT / NOT IMPLEMENTED
Formal release                             NOT RELEASED
```

If any required gate fails, keep C2 `PARTIAL / BLOCKED` and name the exact failed gate instead of creating the C2-complete handoff.

- [ ] **Step 3: Run final documentation and secret hygiene checks**

```powershell
git diff --check
git grep -n -I -E 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,}' -- .
```

Expected: `git diff --check` exit `0`; secret scan returns no matches.

- [ ] **Step 4: Run one final focused regression after docs**

Run: `& $go test ./internal/semantics ./internal/ranking ./internal/web ./internal/storage -count=1`
Expected: PASS.
- [ ] **Step 5: Commit final C2 evidence/checkpoint**

```bash
git add docs/qa/phase-c2-semantic-correction-qa.md docs/checkpoints/CURRENT_MSL_CHECKPOINT.md docs/checkpoints/CONTINUE_MSL.md docs/checkpoints/2026-08-22-MSL-C2-COMPLETE-C3-NEXT.md
git commit -m "docs: verify Phase C2 semantic correction"
```

If C2 is blocked, omit the complete handoff file and use commit message `docs: record Phase C2 verification blocker`.

- [ ] **Step 6: Push the working branch, not main**

```bash
git push origin HEAD:task/windows-relay-ampersand-path-fix-20260821
```

Verify the remote branch SHA equals local `HEAD`. Do not merge to `main` without a separate user instruction.

---

## Completion Definition

Phase C2 is complete only if all of these are simultaneously true:

```text
C2 semantic contract = msl-semantic-contract/2
legacy v0.1 persistence/history unchanged
legacy query/filter contracts unchanged
C1 canonical fixture fingerprints unchanged
C1 Rust source/wire/numeric contracts unchanged
semantic aliases are numerically identity-preserving
ranking/explorer/watchlist/comparison APIs expose additive semantics
structural API exposes additive composition semantics
ranking/explorer/watchlist/comparison UI uses defensible C2 labels
structural UI uses composition/concentration labels
separate Market Opportunity subsystem remains outside automatic relabeling
model IDs/versions/weights remain frozen
full Go regression PASS
full Rust regression PASS
native installer health = healthy / rust-production / msl-analytics/2
native API semantic aliases equal legacy values
native UI/locales carry C2 terminology
no credential or generated native artifact committed
formal release remains NOT RELEASED
```

After C2 completes, C3 begins with design/calibration work rather than by altering C2 aliases or reopening C1 parity.
