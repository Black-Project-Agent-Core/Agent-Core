# MSL Phase C3.0 Evidence Constitution Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement C3.0 as an additive, deterministic evidence-qualification runtime that can state whether an existing MSL signal is justified, limited, or suppressed without changing C1 numerics or C2 semantics.

**Architecture:** Add `msl-evidence-contract/1` as a sibling contract to `msl-semantic-contract/2`. A pure Go `internal/evidence` layer evaluates versioned requirements, scope comparability, evidence stage, eligibility, reason codes, and uncalibrated confidence; storage persists append-only assessments; app orchestration assembles facts around already-approved signal values; web exposes additive APIs and a factual evidence-qualification table.

**Tech Stack:** Go 1.26.4, Rust/Cargo 1.97.1 production analytics worker, append-only JSONL storage, Go `net/http`, existing vanilla JS/i18n UI, PowerShell/Inno Setup for Windows packaging.

**Spec:** `docs/superpowers/specs/2026-08-24-msl-phase-c3-evidence-calibrated-signal-model-design.md`

## Global Constraints

- C1 numeric/wire/history behavior remains frozen; do not modify C1 formulas, weights, thresholds, clamps, rounding, fixtures, or legacy history schemas.
- C2 remains exactly `msl-semantic-contract/2`; evidence is a sibling contract and must not overload the C2 `semantics` object.
- Evidence contract = `msl-evidence-contract/1`.
- Requirements contract = `msl-evidence-requirements/1`.
- C3.0 stage policy = `msl-evidence-stage/c3.0-1`.
- Confidence = `score=null`, `band=UNCALIBRATED`, `modelVersion=msl-evidence-confidence/uncalibrated-1`.
- `TO_BE_CALIBRATED` is intentional; no guessed numeric production threshold may replace it.
- C3.0 stage ceiling is `MOVEMENT_INDICATION`; never promote `PRELIMINARY_TREND`, `ESTABLISHED_TREND`, or `SEASONALITY_CANDIDATE`.
- Missing deterministic prerequisites produce `SUPPRESSED` plus a null evidence-qualified value; never substitute neutral `50`.
- Confidence cannot create eligibility; PRR cannot feed ODMI; composition cannot authorize movement/trend narrative.
- Initial C3.0 registry is limited to the five approved existing signals. C3.1 math is outside this plan.
- Rust remains mandatory for migrated production analytics; no Go numerical fallback may return.
- Python remains offline C3.2 research only; C++ remains behind its profiling gate.
- New persistence is append-only at `history/signal_evidence_assessments.jsonl`; no legacy JSONL row is rewritten.
- Raw Envato credentials, local history datasets, installers, toolchains, and generated acceptance evidence remain outside tracked Git.
- Formal release remains `NOT RELEASED`; do not merge to `main` implicitly.
- The C2 deferred elevated install-and-uninstall replay remains required before RC/final sign-off and is not rewritten as passed by C3.0.

## Pinned Source Identities

```text
product.peer_relative_rank.v0.1
  signalModelVersion = product-snapshot-v0.2
  peerDefinitionVersion = c1-product-prr-peer/1
  peer universe = products within the same CatalogID

catalog.directional_breadth.v0.1
catalog.competition_momentum.v0.1
catalog.peer_relative_rank.v0.1
  signalModelVersion = catalog-snapshot-v0.2

catalog.peer_relative_rank.v0.1
  peerDefinitionVersion = c1-catalog-prr-peer/1
  peer universe = Platform|ContentType|CatalogLevel

structural.observed_segment_composition.v0.1
  signalModelVersion = volume-weighted-market-index-v0.1
```

## Planned File Boundaries

```text
internal/domain/evidence.go
internal/evidence/contracts.go
internal/evidence/requirements.go
internal/evidence/comparability.go
internal/evidence/stage.go
internal/evidence/facts.go
internal/evidence/evaluator.go
internal/evidence/representative.go
internal/storage/evidence_assessment_store.go
internal/app/evidence_service.go
internal/web/evidence_handlers.go
internal/web/templates/index.html
internal/web/assets/js/app.js
internal/i18n/locales/en.json
internal/i18n/locales/id.json
```

---

### Task 1: Add evidence contract types and version registry

**Files:**
- Create: `internal/domain/evidence.go`
- Create: `internal/evidence/contracts.go`
- Create: `internal/evidence/contracts_test.go`

**Interfaces:**
- Produce enums/types for `EvidenceStage`, `SignalEligibility`, `ClaimType`, `RuleClass`, `RequirementApplicability`, `FailureDisposition`, `ScopeComparabilityStatus`, `ThresholdState`, `RequirementThreshold`, `RequirementRule`, `SignalEvidenceRequirement`, `ScopeComparabilityResult`, `ConfidenceAssessment`, `EvidenceAssessment`, `SignalResult`, `SignalEvidenceAssessmentRecord`, `SignalEvidenceAssessmentFilter`, and `EvidenceBuildResult`.
- `ClaimType` serialized values: `composition`, `movement`, `peer_relative`.
- Produce constants `ContractVersion`, `RequirementsVersion`, `StagePolicyVersion`, `ConfidenceModelVersion` and validators.

- [ ] **Step 1: Re-run the frozen baseline before code changes**

```powershell
$env:CARGO_HOME='F:\Market-Signal-Lab\dist\.local-tools\rust\cargo'
$env:RUSTUP_HOME='F:\Market-Signal-Lab\dist\.local-tools\rust\rustup'
$env:CARGO_TARGET_DIR="$PWD\dist\c3-0-acceptance\rust-target"
& 'F:\Market-Signal-Lab\dist\.local-tools\rust\cargo\bin\cargo.exe' test --manifest-path .\engines\rust\Cargo.toml
& 'F:\Market-Signal-Lab\dist\.local-tools\rust\cargo\bin\cargo.exe' build --release --manifest-path .\engines\rust\Cargo.toml
$env:MSL_RUST_WORKER="$PWD\dist\c3-0-acceptance\rust-target\release\msl-analytics-rust.exe"
$env:GOFLAGS='-buildvcs=false'
& 'F:\Market-Signal-Lab\dist\.local-tools\go1.26.4\go\bin\go.exe' test ./... -count=1
```

Expected: all exit 0.

- [ ] **Step 2: Write RED contract/version/confidence tests**

```go
func TestUncalibratedConfidenceIsNull(t *testing.T) {
    got := UncalibratedConfidence()
    if got.Score != nil || got.Band != domain.ConfidenceBandUncalibrated || got.ModelVersion != ConfidenceModelVersion {
        t.Fatalf("confidence=%+v", got)
    }
}
```

Assert exact enum strings, rejection of unknown evidence/requirements versions, and exact initial reason-code registry.

Run: `go test ./internal/evidence -run 'Test(Contract|Requirements|Reason|Uncalibrated)' -count=1`
Expected: FAIL because package/contracts do not exist.

- [ ] **Step 3: Implement minimal additive domain contracts**

Use pointers for optional numerics so zero differs from missing.

```go
type SignalResult struct {
    SignalID string `json:"signalId"`
    SignalModelVersion string `json:"signalModelVersion"`
    Value *float64 `json:"value"`
    Evidence EvidenceAssessment `json:"evidence"`
}

type EvidenceBuildResult struct {
    RunID string `json:"runId"`
    AssessmentCount int `json:"assessmentCount"`
    Persisted bool `json:"persisted"`
    Assessments []SignalEvidenceAssessmentRecord `json:"assessments"`
}
```

`EvidenceAssessment` carries the complete spec field set; non-applicable dimensions remain nil/absent.

- [ ] **Step 4: Implement exact registries**

```go
const (
    ContractVersion = "msl-evidence-contract/1"
    RequirementsVersion = "msl-evidence-requirements/1"
    StagePolicyVersion = "msl-evidence-stage/c3.0-1"
    ConfidenceModelVersion = "msl-evidence-confidence/uncalibrated-1"
)
```

`UncalibratedConfidence()` returns nil score and `UNCALIBRATED`. Unknown versions error; no fallback.

- [ ] **Step 5: Verify and commit**

```bash
go test ./internal/evidence -count=1
git add internal/domain/evidence.go internal/evidence/contracts.go internal/evidence/contracts_test.go
git commit -m "feat: define C3 evidence contracts"
```

---

### Task 2: Register the five C3.0 signal requirements without invented thresholds

**Files:**
- Create: `internal/evidence/requirements.go`
- Create: `internal/evidence/requirements_test.go`

**Interfaces:**
- Produce exact five signal registrations and exact model identities from Pinned Source Identities.
- Produce `Requirements() []domain.SignalEvidenceRequirement`.
- Produce `Requirement(signalID, signalModelVersion string) (domain.SignalEvidenceRequirement, error)`.

- [ ] **Step 1: Write RED registry tests**

Assert exactly five registrations, exact model matches, exact requirements/stage/confidence versions, no duplicate `(signalId, signalModelVersion)`, and no concrete non-deterministic threshold.

```go
func TestInitialRequirementsContainNoGuessedCalibrationThresholds(t *testing.T) {
    for _, req := range Requirements() {
        for _, rule := range req.Rules {
            if rule.RuleClass != domain.RuleClassDeterministic && rule.Threshold.State == domain.ThresholdConcrete {
                t.Fatalf("%s guessed threshold: %+v", req.SignalID, rule)
            }
        }
    }
}
```

- [ ] **Step 2: Encode deterministic minima only**

```text
catalog.directional_breadth.v0.1
  claimType=movement
  comparableWindowCount >= 2
  comparableProducts >= 1
  scope status EXACT_MATCH or DECLARED_COMPATIBLE
  windowDurationComparable = true

catalog.competition_momentum.v0.1
  claimType=movement
  comparableWindowCount >= 2
  scope status EXACT_MATCH or DECLARED_COMPATIBLE
  windowDurationComparable = true
  stableMeasureDefinition = true

product.peer_relative_rank.v0.1
  claimType=peer_relative
  peerDefinitionVersion = c1-product-prr-peer/1
  peerGroupSize >= 2

catalog.peer_relative_rank.v0.1
  claimType=peer_relative
  peerDefinitionVersion = c1-catalog-prr-peer/1
  peerGroupSize >= 2
  minimumUnderlyingStage = MOVEMENT_INDICATION

structural.observed_segment_composition.v0.1
  claimType=composition
  valuePresent = true
  sampleSize >= 1
```

Every preferred sample/coverage/participation/reliability/peer-spread threshold named by the spec is explicitly `TO_BE_CALIBRATED`, never silently omitted or guessed.

- [ ] **Step 3: Validate fail-closed lookup**

Unknown signal/model combination returns error; no wildcard/nearest-version fallback.

Run: `go test ./internal/evidence -run 'Test(InitialRequirements|RequirementLookup)' -count=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/evidence/requirements.go internal/evidence/requirements_test.go
git commit -m "feat: register C3 evidence requirements"
```

---

### Task 3: Implement scope comparability as a factual truth table

**Files:**
- Create: `internal/evidence/comparability.go`
- Create: `internal/evidence/comparability_test.go`

**Interfaces:**
- Consume current/prior `MarketMapRun`, plans, window duration and optional query/surface universe fingerprints.
- Produce `ScopeDescriptor`, `ScopeCompatibilityDeclaration`, `CompareScope(...) ScopeComparabilityResult`.

- [ ] **Step 1: Write RED truth-table tests**

```text
no temporal comparison requested             -> NOT_APPLICABLE
same non-empty CompatibilityKey              -> EXACT_MATCH
explicit injected versioned declaration      -> DECLARED_COMPATIBLE
different key without declaration            -> INCOMPATIBLE
```

Unknown detail flags stay nil/unknown, never default true.

- [ ] **Step 2: Implement explicit comparison**

```go
func CompareScope(current, prior ScopeDescriptor, declarations []ScopeCompatibilityDeclaration) domain.ScopeComparabilityResult {
    out := compareFacts(current, prior)
    switch {
    case !current.TemporalComparison:
        out.Status = domain.ScopeComparabilityNotApplicable
    case current.Run.CompatibilityKey != "" && current.Run.CompatibilityKey == prior.Run.CompatibilityKey:
        out.Status = domain.ScopeComparabilityExactMatch
    case declaredCompatible(current.Run.CompatibilityKey, prior.Run.CompatibilityKey, declarations):
        out.Status = domain.ScopeComparabilityDeclaredCompatible
    default:
        out.Status = domain.ScopeComparabilityIncompatible
    }
    return out
}
```

Production declaration registry is empty in C3.0. Synthetic tests may inject one declaration only to prove mechanism.

- [ ] **Step 3: Prove window duration is independent**

Same CompatibilityKey + differing window duration may remain `EXACT_MATCH`, but `WindowDurationComparable=false`; temporal requirement later suppresses.

Run: `go test ./internal/evidence -run TestCompareScope -count=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/evidence/comparability.go internal/evidence/comparability_test.go
git commit -m "feat: evaluate C3 scope comparability"
```

---

### Task 4: Implement the C3.0 EvidenceStage ceiling

**Files:**
- Create: `internal/evidence/stage.go`
- Create: `internal/evidence/stage_test.go`

**Interfaces:**
- Produce `StageInput` using `domain.ClaimType` and optional inherited C3 stage for peer-relative claims.
- Produce `MaximumStage(StageInput) (EvidenceStage, []ReasonCode)`.

- [ ] **Step 1: Write RED ceiling tests**

```text
valid current composition                               -> COMPOSITION_ONLY
movement with only current window                       -> COMPOSITION_ONLY + LIMITED_TEMPORAL_DEPTH
movement with 2 comparable windows + compatible scope  -> MOVEMENT_INDICATION
movement with 6/20 comparable windows                   -> still MOVEMENT_INDICATION
legacy DirectionStage established/seasonality           -> ignored
peer-relative with inherited C3 stage                   -> capped inherited stage
```

- [ ] **Step 2: Implement explicit stage logic**

```go
func MaximumStage(in StageInput) (domain.EvidenceStage, []domain.ReasonCode) {
    if in.ClaimType == domain.ClaimTypePeerRelative && in.InheritedStage != nil {
        return capC30(*in.InheritedStage), nil
    }
    if in.ClaimType == domain.ClaimTypeMovement && in.ComparableWindowCount >= 2 && in.ScopeComparable && in.WindowDurationComparable {
        return domain.EvidenceStageMovementIndication, nil
    }
    if in.ClaimType == domain.ClaimTypeMovement {
        return domain.EvidenceStageCompositionOnly, []domain.ReasonCode{domain.ReasonLimitedTemporalDepth}
    }
    return domain.EvidenceStageCompositionOnly, nil
}
```

Never read legacy `DirectionStage` in this function.

- [ ] **Step 3: Verify and commit**

```bash
go test ./internal/evidence -run 'Test(MaximumStage|UncalibratedConfidence)' -count=1
git add internal/evidence/stage.go internal/evidence/stage_test.go
git commit -m "feat: enforce C3 evidence stage ceiling"
```

---

### Task 5: Build deterministic eligibility evaluator and factual reason provenance

**Files:**
- Create: `internal/evidence/facts.go`
- Create: `internal/evidence/evaluator.go`
- Create: `internal/evidence/evaluator_test.go`

**Interfaces:**
- Produce typed pointer-based `EvidenceFacts`.
- Produce `AssessmentContext`.
- Produce `Evaluate(req, ctx, facts, value) (SignalResult, error)`.

- [ ] **Step 1: Write RED evaluator truth table**

```text
movement + no comparable window -> SUPPRESSED, Value=nil, temporal reason
PRR + peerGroupSize=1           -> SUPPRESSED, Value=nil, SMALL_PEER_GROUP
valid composition               -> ELIGIBLE, COMPOSITION_ONLY, value retained
synthetic deterministic DEGRADE -> DEGRADED, value retained, factual reason
TO_BE_CALIBRATED rule           -> not numerically executed
unknown requirement/version     -> explicit error
legacy/C2 value=100             -> cannot override suppression
```

```go
func TestEvaluateSuppressesOneMemberPRRWithoutReturningLegacy50(t *testing.T) {
    legacy := 50.0
    result, err := Evaluate(prrRequirement(t), context(), EvidenceFacts{PeerDefinitionVersion: strp(ProductPRRPeerDefinitionVersion), PeerGroupSize: intp(1)}, &legacy)
    if err != nil { t.Fatal(err) }
    if result.Value != nil || result.Evidence.Eligibility != domain.SignalEligibilitySuppressed || !hasReason(result, domain.ReasonSmallPeerGroup) {
        t.Fatalf("result=%+v", result)
    }
}
```

- [ ] **Step 2: Implement typed deterministic rule evaluation**

Rules marked `TO_BE_CALIBRATED` are skipped numerically. Missing required deterministic fact emits `MISSING_REQUIRED_COMPONENT` and suppresses. Concrete zero is zero, not missing. Reasons are deduplicated and sorted deterministically.

- [ ] **Step 3: Apply stage and confidence downstream**

Evaluator invokes `MaximumStage`; confidence always uses `UncalibratedConfidence()` in C3.0; `SUPPRESSED` forces result value nil.

Run: `go test ./internal/evidence -count=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/evidence/facts.go internal/evidence/evaluator.go internal/evidence/evaluator_test.go
git commit -m "feat: evaluate C3 signal eligibility"
```

---

### Task 6: Adapt five frozen values into evidence candidates without recomputation

**Files:**
- Create: `internal/evidence/representative.go`
- Create: `internal/evidence/representative_test.go`

**Interfaces:**
- Produce `EvidenceCandidate{Requirement, Context, Facts, Value, EntityType, EntityID, ProvenanceID}`.
- Consume peer counts/definitions/scope facts passed by app layer; never read storage or invoke analytics.

- [ ] **Step 1: Write RED value-identity tests**

```text
catalog.directional_breadth.v0.1             <- CatalogSnapshot.ExposureBreadth
catalog.competition_momentum.v0.1            <- CatalogSnapshot.CompetitionAcceleration
product.peer_relative_rank.v0.1              <- ProductSnapshot.RelativeStrength
catalog.peer_relative_rank.v0.1              <- CatalogSnapshot.RelativeStrength
structural.observed_segment_composition.v0.1 <- MarketIndexSnapshot.CompositionIndex
```

Use distinctive non-round values and exact equality. No adapter imports `internal/analyticsengine` or calls Rust.

- [ ] **Step 2: Lock peer definitions and source stage**

Product PRR peer universe = same current run/window/model/CatalogID. `ComparableHistory=false` inherits `COMPOSITION_ONLY`; comparable rank-velocity evidence may inherit `MOVEMENT_INDICATION`.

Catalog PRR peer universe = same run/window/model and CatalogNode `Platform|ContentType|Level`. Its C1 peer score is movement-derived, so underlying C3 stage below `MOVEMENT_INDICATION` suppresses qualified catalog PRR even if legacy `RelativeStrength` is populated.

- [ ] **Step 3: Lock missing/zero behavior**

`ComparableProducts==0` causes qualified Directional Breadth suppression; legacy `ExposureBreadth=50` may remain in frozen output but is not returned as evidence-qualified value. Structural `SampleSize==0` suppresses. `ZERO_BASELINE_DELTA` is recorded only when upstream evidence proves a zero denominator; never infer it from displayed value 100 alone.

Run: `go test ./internal/evidence -run TestRepresentative -count=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/evidence/representative.go internal/evidence/representative_test.go
git commit -m "feat: adapt C1 signals to C3 evidence"
```

---

### Task 7: Persist assessments in a separate append-only ledger

**Files:**
- Create: `internal/storage/evidence_assessment_store.go`
- Create: `internal/storage/evidence_assessment_store_test.go`

**Interfaces:**
- Produce append/batch append/read/filter/latest methods for `SignalEvidenceAssessmentRecord`.
- Canonical file = `history/signal_evidence_assessments.jsonl`.

- [ ] **Step 1: Write RED round-trip/filter tests**

Persist eligible and suppressed rows. Suppressed rows preserve `ValuePresent=false`, reasons, contract/requirements versions and `UNCALIBRATED` confidence. Filters combine with AND and sort by `AssessedAt`, then assessment ID.

- [ ] **Step 2: Write RED legacy byte-immutability tests**

Capture bytes of `product_snapshots.jsonl`, `catalog_snapshots.jsonl`, `market_index_snapshots.jsonl`; append/read evidence; require all three byte-identical afterward.

```go
before := mustRead(t, filepath.Join(root, "history", "catalog_snapshots.jsonl"))
if err := st.AppendSignalEvidenceAssessment(record); err != nil { t.Fatal(err) }
after := mustRead(t, filepath.Join(root, "history", "catalog_snapshots.jsonl"))
if !bytes.Equal(before, after) { t.Fatal("C3 evidence append rewrote legacy catalog history") }
```

- [ ] **Step 3: Implement with existing Store JSONL conventions**

Use existing lock/unique JSONL helpers. Do not add a database and do not alter cleanup/migration semantics; cleanup already discovers history JSONL generically. Persistence failure propagates.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/storage -run 'TestSignalEvidence|TestC3EvidenceDoesNotRewrite' -count=1
go test ./internal/storage -count=1
git add internal/storage/evidence_assessment_store.go internal/storage/evidence_assessment_store_test.go
git commit -m "feat: persist C3 evidence assessments"
```

---

### Task 8: Orchestrate representative assessments in the app layer

**Files:**
- Create: `internal/app/evidence_service.go`
- Create: `internal/app/evidence_service_test.go`
- Modify: `internal/evidence/contracts.go`
- Modify: `internal/evidence/contracts_test.go`

**Interfaces:**
- Produce `BuildEvidenceAssessments(runID string) (domain.EvidenceBuildResult, error)`.
- Produce read helpers for requirements/assessments/singular assessment.
- Produce deterministic `AssessmentID(runID, entityType, entityID, signalID, modelVersion, requirementsVersion)`.

- [ ] **Step 1: Write RED orchestration tests**

Required cases:

```text
unknown run ID                    -> error
current run not completed         -> error
missing current plan              -> error
no prior compatible run           -> movement rows persisted SUPPRESSED/null
one-product catalog               -> product PRR SUPPRESSED/null
one-catalog catalog-peer universe -> catalog PRR SUPPRESSED/null
second identical build            -> same IDs; no duplicate ledger rows
```

- [ ] **Step 2: Build facts only from persisted source truth**

For requested run: load completed run+plan, latest completed prior run before it + prior plan, current C1 catalog/product snapshots by `MarketMapRunID`, index rows by RunID, and CatalogNodes. Do not invoke Rust or recompute five values.

Only semantically exact facts may populate C3 dimensions. Do not relabel legacy composite `Coverage` or `Confidence` as observation reliability, temporal comparability, or evidence confidence. Unknown dimensions stay nil.

Product PRR peer count = same run, window days/end, model, CatalogID. Catalog PRR peer count = same run, window days/end, model, identical Platform/ContentType/Level.

- [ ] **Step 3: Add deterministic assessment identity**

```go
func AssessmentID(runID, entityType, entityID, signalID, modelVersion, requirementsVersion string) string {
    raw := strings.Join([]string{runID, entityType, entityID, signalID, modelVersion, requirementsVersion}, "\x1f")
    sum := sha256.Sum256([]byte(raw))
    return "eva_" + hex.EncodeToString(sum[:12])
}
```

Same tuple -> same ID; changing any identity field -> different ID.

- [ ] **Step 4: Evaluate all candidates before batch persistence**

Return `Persisted=true` only after full batch persistence succeeds. A persistence failure returns error and no durable-success claim.

- [ ] **Step 5: Verify and commit**

```bash
go test ./internal/evidence ./internal/storage ./internal/app -count=1
git add internal/evidence/contracts.go internal/evidence/contracts_test.go internal/app/evidence_service.go internal/app/evidence_service_test.go
git commit -m "feat: orchestrate C3 evidence assessments"
```

---

### Task 9: Expose versioned evidence APIs without altering C2 responses

**Files:**
- Create: `internal/web/evidence_handlers.go`
- Create: `internal/web/evidence_handlers_test.go`
- Modify: `internal/web/server.go`

**Interfaces:**
- `GET /api/evidence/requirements`
- `GET /api/evidence/assessments`
- `POST /api/evidence/assessments` body `{"runId":"..."}` to explicitly build/persist.
- `GET /api/evidence/assessment?runId=...&entityType=...&entityId=...&signalId=...`

- [ ] **Step 1: Write RED route/method/version/filter tests**

Assert method restrictions, 400 unsupported contract/requirements versions, 404 absent singular assessment, 422 invalid/incomplete build run, deterministic filters, and contract wrapper version.

- [ ] **Step 2: Implement additive wrappers only**

```go
type evidenceAssessmentsResponse struct {
    ContractVersion string `json:"contractVersion"`
    Assessments []domain.SignalEvidenceAssessmentRecord `json:"assessments"`
}
```

GET filters: assessmentId, runId, entityType, entityId, signalId, signalModelVersion, requirementsVersion. Do not insert evidence into C2 `semantics`.

- [ ] **Step 3: Add C2 compatibility lock**

Existing ranking APIs must still expose legacy fields and `semantics.contract.version == "msl-semantic-contract/2"`; stage/eligibility/confidence must not appear inside `semantics`.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/web -run 'TestEvidenceAPI|TestC3EvidenceDoesNotAlterC2Semantics' -count=1
go test ./internal/web -count=1
git add internal/web/evidence_handlers.go internal/web/evidence_handlers_test.go internal/web/server.go
git commit -m "feat: expose C3 evidence API"
```

---

### Task 10: Add factual evidence-qualification UI and hard narrative gate

**Files:**
- Modify: `internal/web/templates/index.html`
- Modify: `internal/web/assets/js/app.js`
- Modify: `internal/i18n/locales/en.json`
- Modify: `internal/i18n/locales/id.json`
- Create: `internal/web/evidence_ui_test.go`

**Interfaces:**
- Add `#evidenceQualification` section with Run ID, explicit Build action, Refresh action, and columns Entity, Signal, Evidence Stage, Signal Eligibility, Confidence, Reasons.
- JS: `loadEvidenceAssessments`, `buildEvidenceAssessments`, `evidenceNarrative`, `renderEvidenceAssessmentRow`.

- [ ] **Step 1: Write RED UI/narrative tests**

```text
COMPOSITION_ONLY + non-suppressed -> Current observed composition only.
MOVEMENT_INDICATION + DEGRADED    -> Early observed movement indication; evidence limitations apply.
SUPPRESSED                        -> Directional signal withheld because required evidence is unavailable or incompatible.
```

Suppressed branch must be evaluated before any score/stage formatting; high legacy score cannot leak stronger prose.

- [ ] **Step 2: Add exact bilingual i18n keys**

```text
Evidence Qualification / Kualifikasi Evidence
Evidence Stage / Tahap Evidence
Signal Eligibility / Kelayakan Sinyal
Uncalibrated (no score) / Belum dikalibrasi (tanpa skor)
Current observed composition only. / Hanya komposisi teramati saat ini.
Early observed movement indication; evidence limitations apply. / Indikasi awal pergerakan teramati; terdapat keterbatasan evidence.
Directional signal withheld because required evidence is unavailable or incompatible. / Sinyal arah ditahan karena evidence wajib tidak tersedia atau tidak kompatibel.
```

Extend locale parity tests.

- [ ] **Step 3: Implement explicit build/refresh behavior**

Build requires non-empty run ID, POSTs, then reloads. Refresh is read-only. Confidence renders only evidence confidence; C3.0 always localized uncalibrated, never legacy confidence. Reasons render factual codes only.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/i18n ./internal/web -run 'Test.*(Locale|Evidence|C2)' -count=1
go test ./internal/i18n ./internal/web -count=1
git add internal/web/templates/index.html internal/web/assets/js/app.js internal/i18n/locales/en.json internal/i18n/locales/id.json internal/web/evidence_ui_test.go
git commit -m "feat: present C3 evidence qualification"
```

---

### Task 11: Run full automated C3.0 freeze/regression acceptance

**Generated evidence:** ignored `dist/c3-0-acceptance/**` only.

- [ ] **Step 1: Run focused C3.0 suites**

`go test ./internal/evidence ./internal/storage ./internal/app ./internal/web ./internal/i18n -count=1`
Expected: PASS.

- [ ] **Step 2: Recompute and lock C1 fixture fingerprints**

```text
product_v01_cases.json = 0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4
catalog_v01_cases.json = 95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3
structural_index_v01_cases.json = bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea
```

Any mismatch blocks C3.0.

- [ ] **Step 3: Run Rust/numeric source freeze**

```bash
git diff --exit-code bc5e49381df18516c4d296cbf164314ec5a35375 -- engines/rust internal/analyticsengine internal/ranking/rust_input_v01.go internal/ranking/rust_output_v01.go internal/indexing
```

Expected: exit 0.

- [ ] **Step 4: Lock C2 semantic source and identity**

```bash
git diff --exit-code 82abd6a227140fdc61dd01799069e524ca6ad39a -- internal/semantics
go test ./internal/semantics -count=1
go test ./internal/web -run TestC2 -count=1
```

Expected: semantics source unchanged and tests PASS.

- [ ] **Step 5: Run full Rust build/test and full Go**

Use repository-local Cargo, ignored target `dist/c3-0-acceptance/rust-target`, release worker as `MSL_RUST_WORKER`, then `go test ./... -count=1`.
Expected: all PASS.

- [ ] **Step 6: Run hygiene and write ignored automated evidence**

```bash
git diff --check
git grep -n -I -E 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,}' -- .
git ls-files dist .superpowers
```

Write `dist/c3-0-acceptance/automated.json` with source HEAD, commands/exits, fixture hashes, release worker SHA-256, C2 contract version, package statuses. No credentials/market payloads.

---

### Task 12: Build Windows candidate and run non-elevated staged native smoke

**Generated only:** `dist/c3-0-acceptance/windows-installer/**`.

- [ ] **Step 1: Build exact C3.0 candidate**

```powershell
$go='F:\Market-Signal-Lab\dist\.local-tools\go1.26.4\go\bin\go.exe'
$cargo='F:\Market-Signal-Lab\dist\.local-tools\rust\cargo\bin\cargo.exe'
$iscc='F:\Market-Signal-Lab\dist\.local-tools\inno-6.7.3\ISCC.exe'
$dist=Join-Path $PWD 'dist\c3-0-acceptance\windows-installer'
$env:GOFLAGS='-buildvcs=false'
.\scripts\build-windows-installer.ps1 -RepoRoot $PWD -GoExe $go -CargoExe $cargo -ISCCExe $iscc -DistRoot $dist
```

Expected: installer, staged app/Rust worker, `version.json`, `evidence/installer-build.json`, current sourceHead.

- [ ] **Step 2: Run staged host/Rust health with isolated local data**

Source `windows-installer-test-helpers.ps1`; set fresh ignored LOCALAPPDATA; choose a free localhost port; run staged app with `Start-InstalledMSL`; verify with `Wait-MSLHealth`; stop owned process.

Expected:

```text
applicationHost.status=healthy
productionAnalytics.status=healthy
productionAnalytics.engine=rust-production
productionAnalytics.protocol=msl-analytics/2
```

Never read/export saved Envato credential.

- [ ] **Step 3: Smoke shipped evidence contract/UI**

GET `/api/evidence/requirements`; require evidence/requirements versions and exact five signal IDs. GET `/`; require `id="evidenceQualification"` and evidence i18n/data keys. Real Envato data is not required for this packaging smoke.

- [ ] **Step 4: Record honest native evidence**

Write ignored `dist/c3-0-acceptance/native.json` with sourceHead, version, artifact SHA-256, health, contract IDs, UI smoke, port, and explicitly:

```json
{"currentSetupLiterallyInstalled":false,"currentSetupUninstallVerified":false,"formalReleaseStatus":"NOT RELEASED"}
```

Do not claim elevated install/uninstall; never bypass UAC.

---

### Task 13: Write QA/checkpoints from observed evidence, final-review, publish branch

**Files:**
- Create: `docs/qa/phase-c3-0-evidence-constitution-qa.md`
- Modify: `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
- Modify: `docs/checkpoints/CONTINUE_MSL.md`
- Create only if every C3.0 gate passes: `docs/checkpoints/2026-08-24-MSL-C3-0-COMPLETE-C3-1-NEXT.md`

- [ ] **Step 1: Write QA only from Task 11/12 evidence and reviewer reports**

Record source commit/branch, versions, five-signal registry, evaluator truth-table results, suppressed/null negatives, persistence immutability, C1 hashes, Rust freeze, C2 semantic freeze, full Rust/Go results, hashes, staged health, API/UI smoke, limitations, deferred elevated lifecycle gate. No credentials/payloads/binaries.

- [ ] **Step 2: Set status from real gate result**

Only if all required gates pass:

```text
Phase C1 Rust ranking parity                   COMPLETE / VERIFIED
Phase C2 semantic correction                   COMPLETE / VERIFIED
Phase C3 architecture/spec                     COMPLETE / APPROVED
Phase C3.0 Evidence Constitution Runtime       COMPLETE / VERIFIED
Phase C3.1 deterministic signal v0.2           DESIGN/PLAN NEXT / NOT IMPLEMENTED
Phase C3.2 Quant Calibration Lab               NOT IMPLEMENTED
Phase C3.3 calibrated production intelligence  NOT IMPLEMENTED
Formal release                                 NOT RELEASED
```

Otherwise C3.0 remains `PARTIAL / BLOCKED` with exact failed gate and no complete handoff.

- [ ] **Step 3: Final hygiene/focused regression**

```bash
git diff --check
git grep -n -I -E 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,}' -- .
go test ./internal/evidence ./internal/storage ./internal/app ./internal/web ./internal/semantics -count=1
```

Expected: PASS/no secret matches.

- [ ] **Step 4: Commit final QA/checkpoints**

Complete path commit: `docs: verify Phase C3.0 evidence constitution`. Blocked path: omit complete handoff and commit `docs: record Phase C3.0 verification blocker`.

- [ ] **Step 5: Require SDD final whole-branch review**

Review complete implementation range against approved spec + this plan. Required: `SPEC PASS / QUALITY PASS`, no open Critical/Important. Fix/re-review according to SDD if needed.

- [ ] **Step 6: Push working C3 branch only**

```bash
git push origin HEAD:task/c3-evidence-calibrated-model-v02-20260824
git ls-remote origin refs/heads/task/c3-evidence-calibrated-model-v02-20260824
```

Remote SHA must equal local HEAD. Do not merge main, rewrite C2, or start C3.1 automatically.

---

## C3.0 Completion Definition

```text
msl-evidence-contract/1 version validation PASS
msl-evidence-requirements/1 exact five-signal registry PASS
EvidenceStage and SignalEligibility remain independent
TO_BE_CALIBRATED thresholds have no guessed production values
confidence score=null and band=UNCALIBRATED
ScopeComparabilityResult evaluated for temporal claims
SUPPRESSED evidence-qualified values are null
one-member PRR suppressed rather than defensible 50
no-comparable Directional Breadth suppressed rather than neutral 50
reason codes factual/versioned/deterministic/persisted
signal_evidence_assessments.jsonl append/read/filter PASS
legacy product/catalog/index history byte-immutability PASS
C2 semantics remains msl-semantic-contract/2 and identity-preserving
five representative existing signals covered
C3.0 never promotes PRELIMINARY_TREND, ESTABLISHED_TREND, SEASONALITY_CANDIDATE
no Go fallback recomputes Rust-owned kernels
C1 golden fingerprints unchanged
Rust numeric/wire freeze clean
full cargo regression PASS
full go test ./... -count=1 PASS
Windows staged runtime healthy / rust-production / msl-analytics/2
evidence API/UI shipped in candidate
no raw credential/generated native artifact tracked
formal release NOT RELEASED
deferred elevated current-Setup install/uninstall remains open for RC/final
```

## Execution Boundary

Do not begin C3.1 automatically. C3.1 gets a separate design/plan gate for Competition Acceleration v0.2, ODMI, Momentum Magnitude, PRR evidence envelope, Author Concentration Change, and Movement Index/Signed Movement Divergence. C3.2 owns calibration research; C3.3 alone may introduce approved calibrated production thresholds/confidence models.
