# Market Signal Lab — Phase C Resume Marker

> **Historical checkpoint:** the status, pending actions, machine paths, branch names and verification below belong to the dated revision. For the imported monorepo source and continuation boundary, use [CONTINUE_MSL.md](CONTINUE_MSL.md). This record is preserved as evidence and does not authorize resuming old work or certify the current checkout.

**Date:** 2026-08-18 (UTC+7)
**Status:** ACTIVE / USER-AUTHORIZED
**Branch:** `feature/phase-c1-rust-ranking-parity-20260818`
**Base source:** `96976317b3cce68ec8f834cb3fc22902867aea3b`

## User authorization — verbatim

> ok, sekarang saat menyelesaikan phase C jika phase P sudah benar benar complete.

## Gate resolution

Phase P is already COMPLETE / native verified / repository-wide green, and Phase I Windows installer lifecycle is COMPLETE / native Windows lifecycle verified. The Phase C0 specification was previously reviewed and approved. Therefore the former Phase C production freeze is explicitly lifted by the user instruction above.

This marker supersedes older checkpoint wording that says `Phase C1 — PREPARED / FROZEN` or that Phase C remains frozen.

## C1 execution evidence

Linux build host baseline on branch head `841aa8df70293d4ee4d978e0275f9deff86c35c6`:

```text
go test ./... -count=1
PASS — all Go packages green

cargo test --manifest-path engines/rust/Cargo.toml
PASS — 22 Rust library tests / 0 failed
PASS — all existing V2 worker/batch integration suites

git status --short
clean
```

Task 1.1 TDD RED was then observed on test-only commit `6692adfb8b893ff3ad399bb17249815bd752faea`:

```text
--- FAIL: TestC1GoldenManifestContract
C1 golden manifest missing:
internal/ranking/testdata/c1/manifest.json: no such file or directory
```

This is the intended RED reason: the golden manifest/fixtures did not yet exist. No production code was changed to reach RED.

Task 1.2 is now generating deterministic Go-v0.1 oracle fixtures through test-only generators. Fixture outputs are not accepted as GREEN evidence until the generator compiles/runs and both targeted golden and ranking/index regression commands pass in build host.

## Execution order

Phase C must proceed sequentially and evidence-first:

```text
C0 — Signal Truth Audit                         COMPLETE / APPROVED
C1 — Behavior Freeze + Rust Ranking Parity      ACTIVE
C2 — Semantic Correction / Defensible Naming   NEXT AFTER VERIFIED C1
C3 — Evidence-Calibrated Signal Model v0.2      NEXT AFTER VERIFIED C2
```

C1 follows `docs/superpowers/plans/2026-08-18-msl-phase-c1-rust-ranking-parity-plan.md` exactly. C2/C3 must receive their own approved design/TDD plan before production implementation and may not be folded into C1.

## Purpose boundary

All Phase C work remains governed by `docs/checkpoints/PERMANENT_MSL_PURPOSE_GUARDRAIL.md`: MSL exists to infer Envato trend direction and produce product insight from defensible observed-market evidence. It is not a market-entry timing or trading system.

Legacy v0.1 names such as `Opportunity`, `OpportunityScore`, and old text such as `entry opportunity` are compatibility evidence during C1 only. They must not be expanded into market-entry timing semantics. Their semantic correction belongs to C2 after C1 parity is verified.

## Repository boundary

- do not merge to `main` implicitly;
- keep Phase I PR #18 Draft;
- keep Phase C1 PR #19 Draft;
- no production Go analytics fallback after Rust migration;
- no secret material enters Rust;
- no synthetic runtime market data;
- no C1 completion claim without full automated + native Windows positive/no-fallback evidence.
