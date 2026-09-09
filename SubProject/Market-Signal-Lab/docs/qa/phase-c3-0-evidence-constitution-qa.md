# Phase C3.0 Evidence Constitution Runtime — QA Evidence

**Date:** 2026-08-26 (Asia/Jakarta)
**Status recorded here:** derived only from observed repository, automated, and staged-native evidence below.
**Final whole-branch review:** SPEC PASS / QUALITY PASS — no open Critical/Important findings.
**Formal release status:** NOT RELEASED

## Source identity

```text
branch = task/c3-evidence-calibrated-model-v02-20260824
C3.0 product-source commit = c15a57da6becdf5072e1a75eb42a6bd4427ede58
Task 11 automated source HEAD = 0c93becddc33878ded98d8967174f87a3a7cc478
Task 12 native candidate source HEAD = 681bafb20676ebcc6cf625b0df6dd25cddd2a7af
```

`c15a57d` is the final C3.0 product-source commit. The later Task 10/11/12 checkpoint commits are documentation-only, so candidate/evidence source heads may correctly be newer while product code remains identical.

The project/worktree moved from F: to E: during Task 10. Agent Core was reconfigured and verified to expose `E:\Market-Signal-Lab`. The active healthy worktree is:

```text
E:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260826-repaired
```

The stale copied worktree with an F: `.git` pointer was not force-deleted; only the interrupted Task 10 RED test was recovered into the healthy worktree.

## Contract versions

```text
Evidence contract     = msl-evidence-contract/1
Requirements contract = msl-evidence-requirements/1
Stage policy          = msl-evidence-stage/c3.0-1
Confidence model      = msl-evidence-confidence/uncalibrated-1
C2 semantic contract  = msl-semantic-contract/2
```

Unknown evidence/requirements/model combinations fail closed; no nearest-version fallback is implemented.

## Initial C3.0 production evidence registry

Exactly five approved existing signals are registered:

```text
catalog.directional_breadth.v0.1
catalog.competition_momentum.v0.1
product.peer_relative_rank.v0.1
catalog.peer_relative_rank.v0.1
structural.observed_segment_composition.v0.1
```

C3.0 wraps frozen approved values. It does not implement C3.1 numerical models.

## Requirements and calibration boundary

Deterministic minima are explicitly versioned per signal. Preferred sample/coverage/participation/reliability/peer-spread thresholds remain declared as `TO_BE_CALIBRATED` and are not numerically executed.

Observed tests prove:
- exactly five requirement identities;
- exact model/version lookup;
- no duplicate identities;
- no guessed concrete value on non-deterministic calibration rules;
- unknown signal/model lookup returns error.

## Scope comparability

C3.0 implements the factual truth table:

```text
no temporal comparison                 -> NOT_APPLICABLE
same non-empty CompatibilityKey         -> EXACT_MATCH
explicit versioned declaration          -> DECLARED_COMPATIBLE
otherwise                               -> INCOMPATIBLE
```

Unknown detail flags remain nil. Window duration comparability is evaluated independently from scope status. Production compatibility declarations remain empty in C3.0.

## EvidenceStage ceiling

C3.0 production promotion is capped at `MOVEMENT_INDICATION`.

```text
valid current composition -> COMPOSITION_ONLY
movement with deterministic comparable prerequisites -> MOVEMENT_INDICATION
6/20 comparable windows -> still MOVEMENT_INDICATION
PRELIMINARY_TREND / ESTABLISHED_TREND / SEASONALITY_CANDIDATE -> never promoted by C3.0
```

`internal/evidence/stage.go` does not read legacy `DirectionStage`. Peer-relative inherited upper stages are capped to `MOVEMENT_INDICATION`.

## Eligibility and negative evidence behavior

The deterministic evaluator separates `EvidenceStage` from `SignalEligibility`.

Observed tests prove:
- missing movement prerequisites -> `SUPPRESSED`, `Value=nil`;
- one-member PRR -> `SUPPRESSED`, `Value=nil`, `SMALL_PEER_GROUP`;
- frozen legacy `50` cannot become a defensible PRR value;
- frozen high legacy/C2 values cannot override suppression;
- valid composition -> `ELIGIBLE`, `COMPOSITION_ONLY`, original value retained;
- deterministic non-blocking shortfall may produce `DEGRADED` with factual reason;
- reasons are deduplicated and deterministically sorted;
- C3.0 confidence is always score `null`, band `UNCALIBRATED`.

## Frozen-value representative adapters

The five representative adapters copy exact existing values only:

```text
Directional Breadth  <- CatalogSnapshot.ExposureBreadth
Competition Momentum <- CatalogSnapshot.CompetitionAcceleration
Product PRR          <- ProductSnapshot.RelativeStrength
Catalog PRR          <- CatalogSnapshot.RelativeStrength
Observed Composition <- MarketIndexSnapshot.CompositionIndex
```

`internal/evidence/representative.go` imports domain truth only. It does not invoke analytics, Rust, or storage and does not recompute C1 values.

Product PRR peer definition is pinned to `c1-product-prr-peer/1`. Catalog PRR peer definition is pinned to `c1-catalog-prr-peer/1`. `ZERO_BASELINE_DELTA` is emitted only from explicit upstream zero-denominator facts, not inferred from a displayed value of 100.

## Append-only evidence persistence

Canonical ledger:

```text
history/signal_evidence_assessments.jsonl
```

Storage tests prove:
- single and batch append/read;
- idempotence by `assessmentId`, including after Store reopen;
- AND-combined filters;
- deterministic `AssessedAt`, then assessment-ID ordering;
- latest lookup;
- suppressed rows retain `ValuePresent=false`, reasons and uncalibrated confidence;
- append/read/latest evidence operations leave `product_snapshots.jsonl`, `catalog_snapshots.jsonl`, and `market_index_snapshots.jsonl` byte-identical.

No database or legacy-history rewrite was introduced.

## App-layer orchestration

`BuildEvidenceAssessments(runID)` reads persisted source truth only.

Observed tests cover:
- unknown/incomplete run rejection;
- missing plan rejection;
- no prior compatible run -> movement evidence suppressed/null;
- one-product Product PRR -> suppressed/null;
- one-catalog Catalog PRR universe -> suppressed/null;
- deterministic assessment IDs;
- second identical build produces the same IDs without duplicate ledger rows.

The service does not invoke analytics/Rust and does not relabel legacy `Coverage` or `Confidence` as C3 evidence facts. All candidate evaluations complete before the single batch-persistence call; `Persisted=true` is returned only after persistence succeeds.

## Additive evidence API

C3.0 exposes sibling endpoints:

```text
GET  /api/evidence/requirements
GET  /api/evidence/assessments
POST /api/evidence/assessments
GET  /api/evidence/assessment
```

API tests verify method restrictions, version rejection, deterministic AND filters, singular latest/404 behavior, 422 invalid build runs, and versioned response wrappers.

C2 compatibility lock verifies ranking responses still use `semantics.contract.version == msl-semantic-contract/2`, retain C2 semantic identity, and contain no C3 EvidenceStage/eligibility/confidence/reason fields inside `semantics`.

## Evidence qualification UI

The shipped UI includes `#evidenceQualification` with Run ID, explicit Build, read-only Refresh, and six factual columns: Entity, Signal, Evidence Stage, Signal Eligibility, Confidence, Reasons.

Narrative gate:

```text
SUPPRESSED
-> Directional signal withheld because required evidence is unavailable or incompatible.

MOVEMENT_INDICATION + DEGRADED
-> Early observed movement indication; evidence limitations apply.

COMPOSITION_ONLY + non-suppressed
-> Current observed composition only.
```

Suppression is evaluated before EvidenceStage. Narrative code does not read opportunity, PRR, breadth, acceleration, trend, legacy value, coverage, or confidence. Evidence confidence reads only `assessment.confidence`; C3.0 displays localized `Uncalibrated (no score)` / `Belum dikalibrasi (tanpa skor)`.

English/Indonesian `evidence.*` locale key parity passed. Frontend Bun tests passed 2/2, TypeScript typecheck passed, and generated analytics JS remained unchanged.

## C1 canonical fixture fingerprints

Task 11 observed exact matches:

```text
product_v01_cases.json
0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4

catalog_v01_cases.json
95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3

structural_index_v01_cases.json
bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea
```

## Rust/numeric freeze

```text
git diff --exit-code bc5e49381df18516c4d296cbf164314ec5a35375 -- engines/rust internal/analyticsengine internal/ranking/rust_input_v01.go internal/ranking/rust_output_v01.go internal/indexing
exit=0
```

No C3.0 commit changed frozen Rust/numeric source.

## C2 semantic source freeze

```text
git diff --exit-code 82abd6a227140fdc61dd01799069e524ca6ad39a -- internal/semantics
exit=0

go test ./internal/semantics -count=1
PASS

go test ./internal/web -run TestC2 -count=1
PASS
```

## Full automated acceptance

Ignored evidence:

```text
dist/c3-0-acceptance/automated.json
```

Observed gates:

```text
go test ./internal/evidence ./internal/storage ./internal/app ./internal/web ./internal/i18n -count=1
PASS

cargo test --manifest-path ./engines/rust/Cargo.toml
PASS

cargo build --release --manifest-path ./engines/rust/Cargo.toml
PASS

go test -p 1 ./... -count=1 with fresh acceptance Rust worker
PASS

git diff --check
PASS

tracked credential-pattern scan
0 matches

git ls-files dist .superpowers
NONE
```

Acceptance release worker SHA-256:

```text
38894005173cf6debb363f3d086cb875edcea1b680b507be032a760f65463c87
```

## Windows candidate and staged native smoke

Task 12 candidate:

```text
version          = 0.3.0-alpha.6.5.3-preview.1
sourceHead       = 681bafb20676ebcc6cf625b0df6dd25cddd2a7af
installerSha256  = 058497EF7445B274CA389EB20B6A41FCAD63CB70355F5A6625005ABCDD6DA583
appSha256        = D20722759FF5D0AF3D859EE04D40DA5164BAB1725EED9BAB67A90CF283555B32
rustWorkerSha256 = 05C3720BCFA8D1F7C6032D13EEE648EEE5C943EE5523AD269100A3F2A30B875B
```

Ignored native evidence:

```text
dist/c3-0-acceptance/native.json
```

Staged runtime was launched directly from the installer payload stage with isolated `LOCALAPPDATA` and a free localhost port.

```text
applicationHost.status       = healthy
productionAnalytics.status   = healthy
productionAnalytics.engine   = rust-production
productionAnalytics.protocol = msl-analytics/2
```

Native API/UI smoke verified exact five evidence signal IDs, `msl-evidence-contract/1`, `msl-evidence-requirements/1`, `id="evidenceQualification"`, and the evidence locale marker.

## Native lifecycle limitation — binding RC/final gate

Task 12 explicitly records:

```text
currentSetupLiterallyInstalled = false
currentSetupUninstallVerified  = false
formalReleaseStatus            = NOT RELEASED
```

The staged-runtime evidence is sufficient for C3.0 code/contract closure but does not replace the deferred elevated install/uninstall replay. Before RC/final-product sign-off, run the exact current Setup.exe from a normally elevated Administrator context obtained through interactive Windows UAC, verify installed health/layout, then verify uninstall cleanup. Never bypass UAC.

## Final focused re-gate before publication

Observed on the final Task 12 branch state:

```text
go test ./internal/evidence ./internal/storage ./internal/app ./internal/web ./internal/semantics -count=1
PASS

git diff --check
PASS

credential-pattern scan
0 matches
```

Static final invariants:

```text
stage reads legacy DirectionStage        = false
representative imports analytics/storage = false
app evidence relabels Coverage/Confidence = false
canonical evidence ledger present        = true
separate evidence API routes present     = true
UI suppression-first gate present        = true
```

## Final whole-branch review

Result:

```text
SPEC PASS
QUALITY PASS
open Critical findings = 0
open Important findings = 0
```

The committed whole-branch state was reviewed against the approved C3 design and C3.0 implementation plan. Observed review gates:

```text
gofmt over all C3-changed Go files = PASS
go vet ./internal/evidence ./internal/storage ./internal/app ./internal/web ./internal/i18n = PASS
focused evidence/storage/app/web/semantics tests = PASS
Rust/numeric source freeze = PASS
C2 semantic source freeze = PASS
stage reads legacy DirectionStage = false
representative crosses analytics/storage boundary = false
app evidence relabels legacy Coverage/Confidence = false
canonical evidence ledger present = true
separate evidence API routes present = true
UI suppression-first gate present = true
TODO/FIXME/HACK markers in C3 source boundary = none
git diff --check = PASS
credential-pattern scan = 0 matches
```

The review was run against provisional committed QA state `e284ffa`; the subsequent amendment changes only the final review status and completion/handoff documentation. Product code remains pinned to `c15a57d` and was not modified after the passing automated/native gates.

## Final C3.0 status

```text
Phase C3.0 Evidence Constitution Runtime = COMPLETE / VERIFIED
Phase C3.1 deterministic signal v0.2      = DESIGN/PLAN NEXT / NOT IMPLEMENTED
Formal release                            = NOT RELEASED
```

C3.1 must not start automatically. It requires its own explicit design/plan gate. The deferred elevated install/uninstall replay remains binding for RC/final-product sign-off and is not represented as passed by C3.0.
