# Market Signal Lab — C3.0 Task 6 Complete / Task 7 Next

> **Historical checkpoint:** the status, pending actions, machine paths, branch names and verification below belong to the dated revision. For the imported monorepo source and continuation boundary, use [CONTINUE_MSL.md](CONTINUE_MSL.md). This record is preserved as evidence and does not authorize resuming old work or certify the current checkout.

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824`
**Executor:** Agent Core
**Current implementation HEAD:** `71a7298` — `feat: adapt C1 signals to C3 evidence`
**Status:** C3.0 Tasks 1–6 COMPLETE / VERIFIED — Task 7 NEXT

## Task 6 completed

Added:
- `internal/evidence/representative.go`
- `internal/evidence/representative_test.go`

Extended the Task 5 evidence-fact/evaluator boundary only to carry explicitly observed factual reason codes such as `ZERO_BASELINE_DELTA`; these reasons are validated against the versioned registry and do not alter eligibility by themselves.

The representative adapter now wraps the five approved frozen values without recomputation:

```text
catalog.directional_breadth.v0.1             <- CatalogSnapshot.ExposureBreadth
catalog.competition_momentum.v0.1            <- CatalogSnapshot.CompetitionAcceleration
product.peer_relative_rank.v0.1              <- ProductSnapshot.RelativeStrength
catalog.peer_relative_rank.v0.1              <- CatalogSnapshot.RelativeStrength
structural.observed_segment_composition.v0.1 <- MarketIndexSnapshot.CompositionIndex
```

Production `representative.go` imports only `internal/domain`; it does not import `internal/analyticsengine`, storage, repository, or invoke Rust/Cargo.

Peer/source rules now remain explicit:
- Product PRR peer definition is `c1-product-prr-peer/1` and peer universe is the source `CatalogID`.
- Product PRR without comparable rank-velocity evidence inherits `COMPOSITION_ONLY`; comparable history plus an explicit `RankVelocityScore` may inherit `MOVEMENT_INDICATION`.
- Catalog PRR peer definition is `c1-catalog-prr-peer/1`; the peer-universe descriptor is exact `Platform|ContentType|CatalogLevel` from the matched `CatalogNode`.
- Catalog snapshot/node identity mismatch fails closed.
- Source model mismatch fails exact requirement lookup rather than falling back.
- Source run/provenance identity is preserved and contradictory supplied facts fail closed.

Edge-case evidence behavior is verified:
- `ComparableProducts==0` suppresses evidence-qualified Directional Breadth even when frozen legacy `ExposureBreadth=50` is retained in C1/C2.
- structural `SampleSize==0` suppresses the evidence-qualified composition value.
- `ZERO_BASELINE_DELTA` is added only when upstream source facts explicitly prove `PreviousNewProducts==0 && NewProducts>0`; a displayed `100` with non-zero prior count does not invent the reason.

## TDD evidence

RED was observed before representative implementation existed:

```text
go test ./internal/evidence -run TestRepresentative -count=1
TASK6_RED_EXITCODE=1
undefined: EvidenceCandidate
undefined: NewCatalogDirectionalBreadthCandidate
undefined: NewCatalogCompetitionMomentumCandidate
undefined: NewProductPRRCandidate
undefined: NewCatalogPRRCandidate
```

GREEN targeted/package verification:

```text
go test ./internal/evidence -run TestRepresentative -count=1
TASK6_GREEN_TARGETED_EXITCODE=0

go test ./internal/evidence -count=1
EVIDENCE_PACKAGE_EXITCODE=0
```

Static no-recompute gate:

```text
representative.go forbidden analytics/storage/Rust dependency scan = NONE
exact value-map scan = PASS
ZERO_BASELINE_DELTA source gate = PreviousNewProducts == 0 && NewProducts > 0
```

## Whole-project regression evidence

Fresh Task 6 Rust target:

```text
cargo test --manifest-path ./engines/rust/Cargo.toml
PASS
cargo build --release --manifest-path ./engines/rust/Cargo.toml
PASS
```

Full Go regression was run against the freshly built Task 6 release worker:

```text
MSL_RUST_WORKER=.../dist/c3-0-task6/rust-target/release/msl-analytics-rust.exe
go test -p 1 ./... -count=1
EXITCODE=0
```

Frontend/tooling regression:

```text
bun test frontend/tests
2 pass / 0 fail
bun run typecheck
PASS
bun run verify:frontend-generated
PASS
```

`git diff --check` was clean before source commit.

## Git evidence

Task 6 source commit:

```text
71a7298 feat: adapt C1 signals to C3 evidence
```

Remote branch verification:

```text
71a7298ca15c95816e2109bcd36452271392cf7e refs/heads/task/c3-evidence-calibrated-model-v02-20260824
```

`main` was not merged. The dirty root checkout was not used.

## Next exact action

Execute C3.0 Task 7: persist evidence assessments in a separate append-only ledger.

1. create `internal/storage/evidence_assessment_store_test.go` first and observe RED;
2. create `internal/storage/evidence_assessment_store.go` only after RED;
3. canonical ledger = `history/signal_evidence_assessments.jsonl`;
4. support append, batch append, read/filter, and latest assessment operations using existing Store conventions;
5. persist both eligible and suppressed rows, preserving `ValuePresent=false`, reasons, requirement/model versions, provenance, and uncalibrated confidence;
6. combine filters with AND and sort deterministically by `AssessedAt`, then assessment ID;
7. prove byte-for-byte that legacy `product_snapshots.jsonl`, `catalog_snapshots.jsonl`, and `market_index_snapshots.jsonl` are unchanged by evidence-ledger operations;
8. verify, commit, and push Task 7 before Task 8.

Do not modify legacy C1/C2 history rows. Do not start C3.1 automatically. Do not merge to `main`.
