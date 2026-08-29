# MSL Phase C1 Rust Ranking Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PREPARED / EXECUTION BLOCKED  
**Date:** 2026-08-18 (UTC+7)  
**Goal:** Freeze the exact current Go ranking/index behavior as deterministic evidence, reproduce that behavior exactly in the existing Rust `msl-analytics/2` production worker, switch the production ranking path to Rust without a Go analytics fallback, and remove duplicate production Go numerical formulas only after parity is proven.  
**Architecture:** Go remains the Windows/control/security/storage/ID/timestamp/provenance plane. Go resolves catalog identity, segmentation, hierarchy, source scope, timestamp-to-window membership, and local opaque numeric keys. Rust receives normalized secret-free analytical rows and owns migrated deterministic numeric kernels: medians, deltas, percentiles, HHI, weighted scoring, confidence v0.1, product/catalog ranking v0.1 behavior, and structural-index weighting/direction behavior. Existing Analytics v2 framing/batching remains the transport; no second IPC protocol is introduced.  
**Tech Stack:** Go, Rust, existing binary `msl-analytics/2` protocol, JSON golden fixtures, Go `testing`, Rust `cargo test`, native Windows worker/runtime acceptance.  
**Spec:** `docs/superpowers/specs/2026-08-18-msl-phase-c0-signal-truth-audit.md`

## Hard Execution Preconditions

**Do not execute Task 1 or modify production code until both conditions are true:**

```text
1. Windows Installer Lifecycle = COMPLETE / VERIFIED
2. User has explicitly approved the final Phase C0 specification
```

If either condition is false, stop at this document. Do not create a temporary Go fallback, user-selectable engine mode, or shadow production mode to bypass the gate.

## C1 Non-Negotiable Constraints

```text
C1 = behavior freeze + exact parity migration
C1 != semantic correction
C1 != confidence redesign
C1 != evidence-threshold calibration
C1 != benchmark/speedup phase
```

C1 must preserve exact legacy behavior including awkward behavior already identified by C0:

- `SignedDeltaPercent(0, positive) == 100`;
- current `ExposureBreadth` returns `50` when there are zero comparable products;
- current single-peer percentile returns `50`;
- current HHI is scaled `0–100`;
- current product/catalog confidence formulas and hard caps remain unchanged;
- current fixed `direction-stage-v0.1` comparable-run boundaries remain unchanged;
- current structural composition index naming/fields remain unchanged during C1;
- current segmentation fallback/missing metadata remains unchanged;
- current deterministic snapshot IDs/model refs/persistence remain Go-owned and unchanged.

The final C0 constitution governs future C2/C3 semantics, but C1 must not retrofit `SUPPRESSED/null`, new reason codes, renamed metrics, calibrated EvidenceStage, or new confidence into v0.1 outputs.

## Production / Test Boundary

A side-by-side Go reference is allowed **only inside tests and fixture generation before cutover**. There must never be:

```text
production Go fallback after migration
runtime Go-vs-Rust shadow computation
user-selectable Go/Rust mode
silent fallback when Rust is unhealthy
```

After the production cutover, a Rust failure must surface as a ranking/runtime failure and must not append fresh ranking snapshots as though computation succeeded.

---

## Task 1 — Freeze the Go v0.1 Oracle as Deterministic Golden Fixtures

**Purpose:** Create immutable behavioral evidence before changing any formula ownership.

**Files:**

- Create: `internal/ranking/testdata/c1/product_v01_cases.json`
- Create: `internal/ranking/testdata/c1/catalog_v01_cases.json`
- Create: `internal/indexing/testdata/c1/structural_index_v01_cases.json`
- Create: `internal/ranking/c1_golden_test.go`
- Create: `internal/indexing/c1_golden_test.go`
- Create: `internal/ranking/testdata/c1/manifest.json`
- Modify only if needed for deterministic test helpers: `internal/ranking/product_test.go`
- Modify only if needed for deterministic test helpers: `internal/ranking/catalog_test.go`

### Step 1.1 — RED: define fixture-manifest contract before generating fixtures

- [ ] Add `internal/ranking/c1_golden_test.go` with a test that requires a manifest containing:

```go
type c1FixtureManifest struct {
    SchemaVersion string   `json:"schemaVersion"`
    ReferenceSHA  string   `json:"referenceSha"`
    ModelVersions []string `json:"modelVersions"`
    FixtureFiles  []string `json:"fixtureFiles"`
}
```

Required deterministic value:

```text
schemaVersion = msl-c1-ranking-golden/1
```

- [ ] Make the test require exactly the three fixture files listed above and all current ranking/index model versions exercised by those fixtures.
- [ ] Run:

```powershell
go test ./internal/ranking ./internal/indexing -run C1Golden -count=1
```

- [ ] Confirm RED because the manifest/fixtures do not exist yet. Record the actual failure text in the task notes before proceeding.

### Step 1.2 — Minimal GREEN: generate fixtures from unchanged Go behavior

- [ ] Capture the execution-time source commit with:

```powershell
git rev-parse HEAD
```

Store that exact SHA in `manifest.json`. Do not copy an older checkpoint SHA if the source tree has advanced legitimately before C1 starts.

- [ ] Build fixture cases that cover at minimum:

```text
SignedDeltaPercent:
  0 → 0
  0 → positive
  positive increase
  positive decrease
  +200 clamp
  -200 clamp
  Round1 boundary

PercentileRanks:
  empty
  single peer = 50
  weakest = 0
  strongest = 100
  two peers
  tied peers with average position
  deterministic key tie ordering

HHI:
  empty/zero counts
  one author = 100
  equal multiple authors
  uneven shares

OptionalWeightedScore:
  all features present
  one optional feature missing
  multiple optional features missing
  normalized present-weight behavior

DirectionFromIndex:
  exact boundaries 25, 40, 60, 75
```

- [ ] Product fixtures must cover:

```text
current-only product
current + previous product
median with odd/even observation count
invalid positions filtered out
rank velocity positive / zero / negative
cross-query denominator based on applicable queries
surface-strength denominator = 3
freshness current / previous / older
session coverage averaging
observation reliability clamp behavior
no-history confidence cap
coverage <25 confidence cap
coverage 25–<50 confidence cap
single-peer relative strength = 50
multi-peer percentile and tie behavior
missing rank_velocity reweighting
segmentation_fallback missing marker
```

- [ ] Catalog fixtures must cover:

```text
current/previous unique observed product counts
FirstSeenAt-driven new supply
zero-baseline demand/new-supply/competition delta
zero comparable products => ExposureBreadth 50
rising/neutral/falling breadth
median rank velocity
query completion fallback rules
query diversity
attributed unique-product author HHI
partial author attribution
catalog confidence caps
peer group = Platform + ContentType + CatalogLevel
pre-rank peer momentum
percentile RelativeStrength
SupplyGap = 100 - supply percentile
final DirectionIndex recomputation order
trend/opportunity missing external_trend reweighting
```

- [ ] Structural-index fixtures must cover:

```text
Global/Site configured cap 45%
lower-hierarchy configured cap 50%
feasible cap
cap relaxation for a too-small eligible peer set
zero/invalid child mass filtering
volume-weighted structural composition
mean eligible composition
current divergence calculation
legacy direction-stage current fixed boundaries
legacy index-direction confidence caps
DataQuality Grade-D exclusion behavior currently used by orchestration
```

- [ ] Golden output must exclude nondeterministic fields such as fresh wall-clock timestamps and random IDs. Compare only deterministic value/model/missing/ordering fields. Go-owned IDs are verified separately by existing snapshot tests.
- [ ] Re-run the targeted command until GREEN.

### Step 1.3 — Regression

- [ ] Run:

```powershell
go test ./internal/ranking ./internal/indexing -count=1
```

- [ ] Confirm all pre-existing ranking/index tests remain green.

### Step 1.4 — Review + commit

- [ ] Review fixtures to ensure no credentials, cookies, authorization headers, or raw browser-session data are present.
- [ ] Commit:

```powershell
git add internal/ranking/testdata/c1 internal/ranking/c1_golden_test.go internal/indexing/testdata/c1 internal/indexing/c1_golden_test.go
git commit -m "test: freeze C1 ranking v0.1 golden behavior"
```

---

## Task 2 — Extend Analytics v2 with Versioned Ranking Operations

**Purpose:** Reuse the verified `msl-analytics/2` binary transport rather than introducing new IPC.

**Files:**

- Modify: `internal/analyticsengine/protocol_v2.go`
- Modify: `internal/analyticsengine/batch.go`
- Create: `internal/analyticsengine/ranking_v01_schema.go`
- Create: `internal/analyticsengine/ranking_v01_schema_test.go`
- Modify: `engines/rust/src/protocol_v2.rs`
- Modify: `engines/rust/src/batch_v2.rs`
- Create: `engines/rust/src/ranking_v01_schema.rs`
- Modify: `engines/rust/src/lib.rs`
- Create: `engines/rust/tests/ranking_v01_schema.rs`

### Step 2.1 — Lock operation IDs

Use the next unused v2 operation IDs:

```go
const (
    V2OpProductRankingV01   V2OperationID = 5
    V2OpCatalogRankingV01   V2OperationID = 6
    V2OpStructuralIndexV01  V2OperationID = 7
)
```

Schema ID for all three initial C1 operations:

```text
1
```

Do not renumber existing operations `1–4`.

### Step 2.2 — RED: protocol/schema tests

- [ ] Add Go tests requiring operation IDs `5/6/7` to round-trip through batch encode/decode.
- [ ] Add Rust tests requiring the same IDs and rejecting an unsupported schema ID.
- [ ] Add a boundary test that serializes each ranking request and asserts it contains no fields named or semantically equivalent to:

```text
apiKey
token
cookie
authorization
browserSession
credential
```

- [ ] Run:

```powershell
go test ./internal/analyticsengine -run RankingV01 -count=1
Push-Location engines/rust
cargo test ranking_v01_schema -- --nocapture
Pop-Location
```

- [ ] Confirm RED because the new operation IDs/schema do not exist.

### Step 2.3 — Minimal GREEN: normalized secret-free DTOs

Use local numeric keys, never generated IDs, to correlate Rust rows with Go entities. Go owns the key map for each request and maps results back after Rust returns.

Canonical product request shape:

```go
type RankingWindowBucket uint8

const (
    RankingWindowOutside  RankingWindowBucket = 0
    RankingWindowCurrent  RankingWindowBucket = 1
    RankingWindowPrevious RankingWindowBucket = 2
)

type ProductRankingEntityV01 struct {
    ProductKey          uint32
    CatalogKey          uint32
    FirstSeenBucket     RankingWindowBucket
    ApplicableQueryKeys []uint32
    SessionCoverages    []float64
    SegmentationFallback bool
}

type ProductRankingObservationV01 struct {
    ProductKey   uint32
    WindowBucket RankingWindowBucket
    QueryKey     uint32
    SurfaceCode  uint8
    Position     int32
    Reliability  float64
}

type ProductRankingV01Input struct {
    Products     []ProductRankingEntityV01
    Observations []ProductRankingObservationV01
}
```

Canonical product result shape contains only deterministic analytical values plus local keys:

```go
type ProductRankingV01ResultRow struct {
    ProductKey                uint32
    CurrentObservationCount   uint32
    PreviousObservationCount  uint32
    QueryAppearances          uint32
    ApplicableQueries         uint32
    SurfaceAppearances        uint32
    MedianPosition            float64
    PreviousMedianPosition    *float64
    RankVelocity              float64
    RankVelocityScore         *float64
    ExposureScore             float64
    FreshnessScore            float64
    CrossQueryStrength        float64
    RelativeStrength          float64
    DirectionCode             uint8
    ComparableHistory         bool
    Confidence                float64
    Coverage                  float64
    OpportunityScore          float64
    MissingMask               uint64
}
```

Canonical catalog request is assembled from Go-resolved catalog hierarchy/identity facts and Rust product results:

```go
type CatalogRankingEntityV01 struct {
    CatalogKey              uint32
    PeerGroupKey            uint32
    ApplicableQueryCount    uint32
    CurrentCompletedQueries uint32
    PreviousCompletedQueries uint32
    CurrentSessionCoverages []float64
}

type CatalogRankingObservationV01 struct {
    CatalogKey   uint32
    ProductKey   uint32
    AuthorKey    uint32
    HasAuthor    bool
    QueryKey     uint32
    WindowBucket RankingWindowBucket
    Reliability  float64
}

type CatalogProductMembershipV01 struct {
    CatalogKey uint32
    ProductKey uint32
}

type CatalogProductFirstSeenV01 struct {
    ProductKey      uint32
    FirstSeenBucket RankingWindowBucket
}
```

The catalog result carries the deterministic numerical/missing fields currently written into `domain.CatalogSnapshot`, keyed by `CatalogKey`.

Canonical structural-index request carries Go-observed/quality facts, not precomputed weighted outputs:

```go
type StructuralSegmentEvidenceV01 struct {
    SegmentKey        uint32
    ParentKey         uint32
    LevelCode         uint8
    ObservedProducts  uint32
    DataQualityScore  float64
    DataQualityGrade  uint8
}
```

Rust computes eligibility behavior currently defined by the v0.1 structural-index path, composition, weight capping/relaxation, aggregate structural values, legacy direction stage, and legacy direction confidence.

- [ ] Implement exact binary encode/decode with explicit field order and length-prefix bounds in Go and Rust.
- [ ] Keep v2 hard frame/operation limits unchanged unless a real fixture exceeds them; if a real fixture exceeds them, split the request deterministically into stable batches rather than silently raising safety limits.
- [ ] Re-run targeted Go/Rust tests to GREEN.

### Step 2.4 — Regression + commit

- [ ] Run:

```powershell
go test ./internal/analyticsengine -count=1
Push-Location engines/rust
cargo test
Pop-Location
```

- [ ] Commit:

```powershell
git add internal/analyticsengine engines/rust/src engines/rust/tests
git commit -m "feat: add analytics v2 ranking parity schemas"
```

---

## Task 3 — Port the Shared v0.1 Numeric Primitives to Rust Exactly

**Purpose:** Establish exact common behavior before porting product/catalog kernels.

**Files:**

- Create: `engines/rust/src/ranking_v01.rs`
- Create: `engines/rust/tests/ranking_v01_primitives.rs`
- Modify: `engines/rust/src/lib.rs`
- Read-only oracle: `internal/ranking/stats.go`
- Read-only oracle: `internal/ranking/models.go`

### Step 3.1 — RED

- [ ] Load primitive vectors from the Task 1 golden fixtures.
- [ ] Add Rust tests for exact parity of:

```text
clamp_100
round_1
median
signed_delta_percent
delta_index
percentile_ranks
HHI_MSL
optional_weighted_score
direction_from_index
```

- [ ] For percentile output, require deterministic ordering/tie behavior matching Go's value-then-key ordering.
- [ ] Run:

```powershell
Push-Location engines/rust
cargo test ranking_v01_primitives -- --nocapture
Pop-Location
```

- [ ] Confirm RED because the primitives do not exist.

### Step 3.2 — Minimal GREEN

- [ ] Implement exact Go semantics, including floating-point rounding order. Do not substitute a more statistically elegant implementation.
- [ ] Keep model weights in a versioned Rust constant registry corresponding exactly to current Go model definitions. Include a test that compares the expected model names/weights encoded in Task 1 fixture metadata.
- [ ] Re-run to GREEN.

### Step 3.3 — Regression + commit

- [ ] Run full Rust tests.
- [ ] Commit:

```powershell
git add engines/rust/src/ranking_v01.rs engines/rust/tests/ranking_v01_primitives.rs engines/rust/src/lib.rs
git commit -m "feat: port ranking v0.1 numeric primitives to Rust"
```

---

## Task 4 — Port Product Ranking v0.1 Behavior to Rust

**Purpose:** Reproduce `BuildProductSnapshots` numerical behavior without moving Go-owned IDs/timestamps/provenance/storage into Rust.

**Files:**

- Modify: `engines/rust/src/ranking_v01.rs`
- Create: `engines/rust/tests/product_ranking_v01_golden.rs`
- Modify: `engines/rust/src/batch_v2.rs`
- Create: `internal/analyticsengine/ranking_v01_client.go`
- Create: `internal/analyticsengine/ranking_v01_client_test.go`
- Read-only oracle during this task: `internal/ranking/product.go`

### Step 4.1 — RED: Rust golden parity

- [ ] Load `product_v01_cases.json` in Rust tests.
- [ ] Require exact deterministic parity for every output field listed in the Task 2 result shape.
- [ ] Include a test proving a single-peer catalog still returns legacy `RelativeStrength = 50`.
- [ ] Include a test proving no previous history still triggers legacy confidence cap behavior.
- [ ] Run targeted Rust tests and confirm RED.

### Step 4.2 — Minimal GREEN: Rust product kernel

- [ ] Implement in Rust:

```text
filter valid current/previous positions from already bucketed rows
current/previous median
query appearances
cross-query matched/applicable share
surface count and fixed /3 strength
position score
FirstSeen bucket freshness 100/60/25
rank velocity and rank-velocity score
product-exposure OptionalWeightedScore
session coverage average with Clamp100 + Round1
observation reliability average with 0..1 clamp
legacy product confidence + caps
peer momentum and PercentileRanks by CatalogKey
product-opportunity OptionalWeightedScore
legacy direction classification
missing-mask generation
```

- [ ] Rust must not create snapshot IDs, model refs, observed timestamps, market-map run IDs, or persistence records.

### Step 4.3 — RED/GREEN: Go client adapter

- [ ] Add a Go client method equivalent to:

```go
func ExecuteProductRankingV01(
    ctx context.Context,
    executor BatchExecutor,
    input ProductRankingV01Input,
) (ProductRankingV01Result, error)
```

- [ ] First write a fake `BatchExecutor` test that returns a malformed result and require the adapter to reject wrong slot/status/schema/payload.
- [ ] Then implement minimal encoding/decoding and make the test GREEN.

### Step 4.4 — Regression + commit

- [ ] Run:

```powershell
go test ./internal/analyticsengine -count=1
Push-Location engines/rust
cargo test
Pop-Location
```

- [ ] Commit:

```powershell
git add internal/analyticsengine engines/rust
git commit -m "feat: implement Rust product ranking v0.1 parity kernel"
```

---

## Task 5 — Port Catalog Ranking v0.1 Behavior to Rust

**Purpose:** Reproduce supply/competition/breadth/author/peer/trend/opportunity behavior exactly before any C2 renaming.

**Files:**

- Modify: `engines/rust/src/ranking_v01.rs`
- Create: `engines/rust/tests/catalog_ranking_v01_golden.rs`
- Modify: `engines/rust/src/batch_v2.rs`
- Modify: `internal/analyticsengine/ranking_v01_client.go`
- Modify: `internal/analyticsengine/ranking_v01_client_test.go`
- Read-only oracle during this task: `internal/ranking/catalog.go`

### Step 5.1 — RED

- [ ] Load `catalog_v01_cases.json`.
- [ ] Assert exact legacy behavior for every deterministic catalog field.
- [ ] Explicitly assert:

```text
CompetitionAcceleration field still contains the two-window percentage delta
ExposureBreadth is 50 when comparable == 0
FirstSeenAt bucket drives new-supply counting
HHI scale is 0–100
single peer percentile is 50
DirectionIndex is recomputed after RelativeStrength assignment
external_trend remains missing and weights renormalize
```

- [ ] Run targeted Rust tests and confirm RED.

### Step 5.2 — Minimal GREEN

- [ ] Implement in Rust:

```text
unique current/previous product sets
unique product/query pairs
current/previous product-query rates
new-product counts from FirstSeen bucket
rising/neutral/falling counts from product result rows
legacy directional breadth
median rank velocity
freshness index
attributed unique product→author mapping
AuthorConcentration HHI_MSL
AuthorAttributionCoverage
DemandMomentum percent/index
NewSupplyVelocity percent/index
CompetitionAcceleration percent + CompetitionMomentumIndex
coverage/query diversity/reliability
legacy catalog confidence + caps
peer grouping by Go-provided PeerGroupKey
pre-rank momentum
RelativeStrength percentile
SupplyGap percentile inverse
final DirectionIndex recomputation
TrendScore
OpportunityScore
missing-mask generation
```

### Step 5.3 — Go adapter

- [ ] Add `ExecuteCatalogRankingV01(...)` beside the product adapter.
- [ ] Require malformed worker payload/status to return an error; never synthesize a Go value.
- [ ] Make adapter tests GREEN.

### Step 5.4 — Regression + commit

- [ ] Run Go analyticsengine tests and full Rust tests.
- [ ] Commit:

```powershell
git add internal/analyticsengine engines/rust
git commit -m "feat: implement Rust catalog ranking v0.1 parity kernel"
```

---

## Task 6 — Port Structural Composition Index v0.1 to Rust

**Purpose:** Migrate current structural-index arithmetic exactly while retaining its v0.1 semantics.

**Files:**

- Create: `engines/rust/src/structural_index_v01.rs`
- Create: `engines/rust/tests/structural_index_v01_golden.rs`
- Modify: `engines/rust/src/lib.rs`
- Modify: `engines/rust/src/batch_v2.rs`
- Modify: `internal/analyticsengine/ranking_v01_client.go`
- Modify: `internal/analyticsengine/ranking_v01_client_test.go`
- Read-only oracle during this task: `internal/indexing/index.go`
- Read-only oracle during this task: `internal/indexing/weights.go`
- Read-only oracle during this task: `internal/indexing/direction.go`

### Step 6.1 — RED

- [ ] Load `structural_index_v01_cases.json` in Rust.
- [ ] Assert exact configured/effective cap behavior, cap relaxation, eligible-child ordering, structural values, current divergence, legacy direction stage, and legacy confidence.
- [ ] Confirm RED.

### Step 6.2 — Minimal GREEN

- [ ] Implement current structural behavior only. Do not introduce the future Movement Index family or signed movement semantics in C1.
- [ ] Preserve current global/site `45%` and lower-hierarchy `50%` configured caps exactly.
- [ ] Preserve deterministic cap relaxation when mathematically necessary for the current peer count.
- [ ] Preserve current Grade-D eligibility behavior because it is part of the v0.1 oracle; do not reinterpret it as the future signal constitution.
- [ ] Implement legacy index direction stage/confidence exactly.

### Step 6.3 — Go adapter + regression

- [ ] Add `ExecuteStructuralIndexV01(...)`.
- [ ] Run targeted and full Go/Rust tests to GREEN.
- [ ] Commit:

```powershell
git add internal/analyticsengine engines/rust
git commit -m "feat: implement Rust structural index v0.1 parity kernel"
```

---

## Task 7 — Expose Ranking Batch Execution Through the Existing ProductionRuntime

**Purpose:** Let application code call ranking operations without changing the broad legacy `Engine` interface or breaking existing test fakes.

**Files:**

- Modify: `internal/analyticsengine/runtime.go`
- Modify: `internal/analyticsengine/rust_engine.go` only if forwarding requires it
- Create: `internal/analyticsengine/runtime_batch_test.go`
- Modify: `internal/analyticsengine/production_contract_test.go`

### Step 7.1 — RED

- [ ] Add a test requiring `ProductionRuntime` to expose:

```go
func (r *ProductionRuntime) ExecuteAnalyticsBatch(
    ctx context.Context,
    batch AnalyticsBatch,
) (AnalyticsBatchResult, error)
```

- [ ] Require unavailable/non-batch engines to return `ErrRuntimeUnavailable` or an explicit batch-executor error, not a Go computation.
- [ ] Require production `RustEngine` to satisfy `BatchExecutor`.
- [ ] Run:

```powershell
go test ./internal/analyticsengine -run "RuntimeBatch|ProductionContract" -count=1
```

- [ ] Confirm RED.

### Step 7.2 — Minimal GREEN

- [ ] Forward through the existing `BatchExecutor` capability. Keep the legacy `Engine` interface stable if possible so old fake engines do not need unrelated methods.
- [ ] Do not add a fallback executor.
- [ ] Re-run to GREEN.

### Step 7.3 — Regression + commit

- [ ] Run full `internal/analyticsengine` tests.
- [ ] Commit:

```powershell
git add internal/analyticsengine
git commit -m "feat: expose production analytics batch execution"
```

---

## Task 8 — Build Go Normalization/Assembly Without Duplicating Numeric Formulas

**Purpose:** Move control-plane transformations out of the legacy ranking functions while leaving numerical ownership in Rust.

**Files:**

- Create: `internal/ranking/rust_input_v01.go`
- Create: `internal/ranking/rust_input_v01_test.go`
- Create: `internal/ranking/rust_output_v01.go`
- Create: `internal/ranking/rust_output_v01_test.go`
- Modify later in this task: `internal/app/ranking_service.go`
- Modify: `internal/app/ranking_service_test.go`

### Step 8.1 — Define what Go may normalize

Allowed Go responsibilities:

```text
validate requested catalog scope
resolve latest observation segmentation
resolve canonical catalog identity
resolve hierarchy membership
map string IDs to deterministic local uint32 request keys
map SurfaceType enum to a stable numeric code
map ObservedAt / FirstSeenAt into current / previous / outside window bucket
select relevant sessions/queries by identity/scope/time intersection
map catalog Platform+ContentType+Level to opaque PeerGroupKey
carry segmentation-fallback fact
map Rust local keys back to domain IDs
assemble domain snapshots using Rust numerical results
create deterministic snapshot IDs/model refs/provenance
persist in Go
```

Forbidden Go responsibilities after cutover:

```text
median position
rank velocity arithmetic
weighted score
confidence score/caps
percentile rank
HHI
breadth arithmetic
delta/index arithmetic
trend/opportunity arithmetic
structural index weighting/cap arithmetic
```

### Step 8.2 — RED: normalization tests

- [ ] Add tests proving timestamp bucket boundaries exactly match current `InCurrentWindow` / `InPreviousWindow` behavior.
- [ ] Add tests proving segmentation precedence exactly matches current behavior.
- [ ] Add tests proving local key assignment is deterministic for the same sorted ID universe.
- [ ] Add tests proving no credentials/sessions secrets appear in normalized DTOs.
- [ ] Run and confirm RED.

### Step 8.3 — Minimal GREEN

- [ ] Implement only the allowed normalization/assembly behavior.
- [ ] Snapshot assembly must preserve current:

```text
ModelVersion
ModelRefs
IntegrityStatus
MarketMapRunID
ObservedAt
SnapshotID derivation
Missing field names/order
sort order by ProductID / CatalogID
```

- [ ] Do not call `BuildProductSnapshots` / `BuildCatalogSnapshots` from these new production helpers.
- [ ] Re-run tests to GREEN.

### Step 8.4 — Commit

```powershell
git add internal/ranking internal/app/ranking_service_test.go
git commit -m "refactor: add Go control-plane adapters for Rust ranking"
```

---

## Task 9 — Go↔Rust Test-Only Parity Harness

**Purpose:** Prove real transport parity before production cutover without creating a runtime shadow feature.

**Files:**

- Create: `internal/app/ranking_rust_parity_integration_test.go`
- Modify: `internal/app/analytics_runtime_integration_test.go`
- Read-only oracle: legacy `internal/ranking/product.go`, `catalog.go`, `stats.go` and current indexing files

### Step 9.1 — RED

- [ ] Build deterministic test datasets from Task 1 fixture inputs.
- [ ] In test code only:

```text
Go legacy reference
vs
normalized DTO → real packaged/local Rust worker → decoded Rust result
```

- [ ] Compare every deterministic ProductSnapshot/CatalogSnapshot/StructuralIndex value after Go assembly.
- [ ] Compare `Missing` sets and deterministic ordering.
- [ ] Do not compare nondeterministic wall-clock values.
- [ ] Require Rust worker health protocol `msl-analytics/2` before parity assertions.
- [ ] Run:

```powershell
go test ./internal/app -run RustRankingParity -count=1
```

- [ ] Confirm RED before wiring the new Rust ranking operations end-to-end.

### Step 9.2 — Minimal GREEN

- [ ] Wire test-only parity through the actual `ProductionRuntime`/v2 binary worker.
- [ ] No in-process fake Rust implementation may be used for the final parity test.
- [ ] Re-run until all fixture cases are exact GREEN.

### Step 9.3 — Regression + commit

- [ ] Run:

```powershell
go test ./internal/ranking ./internal/indexing ./internal/analyticsengine ./internal/app -count=1
Push-Location engines/rust
cargo test
Pop-Location
```

- [ ] Commit:

```powershell
git add internal/app
git commit -m "test: prove Go to Rust ranking parity"
```

---

## Task 10 — Production Cutover: BuildRankings Must Require Rust

**Purpose:** Change production ownership only after Tasks 1–9 are green.

**Files:**

- Modify: `internal/app/ranking_service.go`
- Modify: `internal/app/ranking_service_test.go`
- Modify: `internal/app/service.go` only if required for batch-runtime access
- Modify: `internal/app/alpha65_orchestration.go` for structural-index cutover points
- Modify: `internal/app/integrity_integration_test.go` as needed
- Modify: `internal/analyticsengine/production_contract_test.go`

### Step 10.1 — RED: no-fallback production contract

- [ ] Add an application test where the Rust production runtime is unavailable.
- [ ] Call the production ranking path.
- [ ] Require:

```text
ranking returns an explicit error
no product snapshots appended
no catalog snapshots appended
no structural index appended as a newly computed success
legacy Go BuildProductSnapshots/BuildCatalogSnapshots are not invoked
```

- [ ] Add a production-contract test rejecting any user-facing engine mode/config such as `go`, `rust`, `shadow`, or `fallback`.
- [ ] Run targeted tests and confirm RED while production still calls Go directly.

### Step 10.2 — Minimal GREEN: Rust-only production path

- [ ] Change `buildRankings` flow from:

```text
Go dataset → BuildProductSnapshots → BuildCatalogSnapshots → persist
```

into:

```text
Go dataset/control-plane resolution
→ normalized ProductRankingV01 request
→ Rust ProductRankingV01
→ normalized CatalogRankingV01 request
→ Rust CatalogRankingV01
→ Go snapshot assembly
→ Go persistence
```

- [ ] Change current structural-index execution points in Alpha6.5 orchestration to call `V2OpStructuralIndexV01` after Go has produced the allowed observed/control-plane inputs.
- [ ] Call `RequireAnalyticsRuntime(ctx)` before new ranking computation begins.
- [ ] On any worker/protocol/operation error, return failure without invoking legacy numerical formulas.
- [ ] Preserve all current HTTP/domain response and persistence contracts.

### Step 10.3 — Regression

- [ ] Run all targeted ranking/autopilot/integrity/analytics tests.
- [ ] Confirm existing history remains readable.
- [ ] Confirm existing secure Envato credential tests remain green and no secret material enters Rust requests.

### Step 10.4 — Commit

```powershell
git add internal/app internal/analyticsengine
git commit -m "feat: make Rust mandatory for production ranking"
```

---

## Task 11 — Remove Duplicate Production Go Numerical Formulas Only After Cutover Proof

**Purpose:** Enforce permanent architecture without losing historical evidence.

**Files:**

- Refactor/remove production numerical paths from: `internal/ranking/product.go`
- Refactor/remove production numerical paths from: `internal/ranking/catalog.go`
- Refactor/remove migrated primitives from: `internal/ranking/stats.go`
- Refactor/remove migrated structural arithmetic from: `internal/indexing/index.go`
- Refactor/remove migrated weighting arithmetic from: `internal/indexing/weights.go`
- Refactor/remove migrated direction arithmetic from: `internal/indexing/direction.go`
- Preserve needed control-plane/window helpers in appropriately named Go files
- Preserve Task 1 golden fixtures
- Modify: `internal/analyticsengine/production_contract_test.go`

### Step 11.1 — RED: source ownership contract

- [ ] Add a source-level test that fails if production application code still references migrated legacy numerical entry points.
- [ ] Require production ranking service to depend on `ProductionRuntime`/Rust ranking adapters, not `BuildProductSnapshots`/`BuildCatalogSnapshots`.
- [ ] Run and confirm RED before deletion/refactor.

### Step 11.2 — Minimal GREEN

- [ ] Remove migrated formula bodies from production Go after all parity tests are green.
- [ ] Retain only Go helpers that belong to the control plane: identity/hierarchy/segmentation/timestamp bucketing/snapshot assembly/persistence.
- [ ] If a legacy Go function is still needed solely to read historical data, isolate it from the production compute path and name/document it as historical compatibility rather than a fallback.
- [ ] Do not keep executable duplicate Go formulas merely for runtime reassurance; golden fixtures are the long-term parity oracle.

### Step 11.3 — Regression + commit

- [ ] Run:

```powershell
go test ./... -count=1
Push-Location engines/rust
cargo test
Pop-Location
```

- [ ] Commit:

```powershell
git add internal/ranking internal/indexing internal/app internal/analyticsengine
git commit -m "refactor: remove duplicate production Go ranking formulas"
```

---

## Task 12 — Full Regression, Native Windows Acceptance, and QA Evidence

**Purpose:** Do not call C1 complete until actual source, worker, persistence, and native runtime evidence exists.

**Files:**

- Create only after real verification: `docs/qa/phase-c1-rust-ranking-parity-qa.md`
- Update only after real verification: `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
- Update only after real verification: `docs/checkpoints/CONTINUE_MSL.md`

### Step 12.1 — Full automated regression

- [ ] Run from repository root:

```powershell
go test ./... -count=1
```

- [ ] Run:

```powershell
Push-Location engines/rust
cargo test
Pop-Location
```

- [ ] Record actual commands, exit codes, and relevant test counts/output. Never write `PASS` from expectation alone.

### Step 12.2 — Build native production artifacts

- [ ] Build the Rust release worker using the repository's existing release build path.
- [ ] Build/package the Windows application using the installer/distribution baseline proven before C1.
- [ ] Record exact source commit and SHA-256 of the native app and Rust worker that are tested.

### Step 12.3 — Native Rust-mandatory ranking acceptance

Using lawful observed market evidence and the secure credential runtime already approved:

- [ ] Start the installed/native Windows app.
- [ ] Confirm analytics health reports:

```text
engine = rust-production
status = healthy
protocol = msl-analytics/2
```

- [ ] Run a real observed Quick Market Autopilot / ranking flow appropriate to the existing QA procedure.
- [ ] Confirm new product/catalog ranking snapshots are produced and persisted.
- [ ] Confirm full stop/restart preserves history.
- [ ] Confirm Windows Credential Manager reuse still works and API key re-entry is not required when the credential remains stored.
- [ ] Confirm status/API/logs contain no plaintext credential.

### Step 12.4 — Native no-fallback negative test

- [ ] On a controlled test installation, make the Rust worker unavailable or invalid **without altering user credentials**.
- [ ] Start a ranking operation.
- [ ] Confirm the ranking operation fails/degrades explicitly according to runtime health semantics.
- [ ] Confirm no Go ranking result is generated as fallback and no fresh successful ranking snapshot is appended.
- [ ] Restore the worker and confirm normal Rust production operation resumes.

### Step 12.5 — Write QA evidence only from actual results

`docs/qa/phase-c1-rust-ranking-parity-qa.md` must include:

```text
source commit
branch
native build timestamp
app SHA-256
Rust worker SHA-256
protocol
Go test command/result
cargo test command/result
golden fixture fingerprint/reference SHA
native positive acceptance result
native no-fallback negative result
credential regression result
history/persistence result
known limitations
```

No benchmark/speedup claim belongs in this QA unless a separate approved benchmark was actually executed.

### Step 12.6 — Checkpoint + commit

Only if all required evidence actually passes:

- [ ] Mark Phase C1 `COMPLETE / VERIFIED` in checkpoint docs.
- [ ] Keep PR Draft unless the user explicitly authorizes otherwise.
- [ ] Do not merge to `main`.
- [ ] Commit:

```powershell
git add docs/qa/phase-c1-rust-ranking-parity-qa.md docs/checkpoints/CURRENT_MSL_CHECKPOINT.md docs/checkpoints/CONTINUE_MSL.md
git commit -m "docs: record verified Phase C1 Rust ranking parity"
```

---

## Completion Definition

Phase C1 is complete only when all of the following are proven by actual test/QA evidence:

```text
Go v0.1 behavior frozen in deterministic golden fixtures
Rust product ranking exactly matches the frozen fixtures
Rust catalog ranking exactly matches the frozen fixtures
Rust structural index exactly matches the frozen fixtures
Go↔Rust integration uses the existing msl-analytics/2 worker
production ranking requires Rust
no production Go analytics fallback exists for migrated kernels
no migrated duplicate production Go formulas remain
IDs/timestamps/provenance/storage remain Go-owned
credential/session secrets never enter Rust
existing history remains readable
native Windows positive acceptance passes
native no-fallback negative acceptance passes
```

C1 completion does **not** authorize C2/C3 model corrections automatically. C2 semantic renaming and C3 evidence-calibrated models remain separate versioned phases under the final Phase C0 constitution.
