# Market Signal Lab — C3 Spec Approved / C3.0 Plan Ready — 2026-08-24

**Status:** C3 ARCHITECTURE + WRITTEN SPEC APPROVED — C3.0 TDD PLAN READY — PRODUCTION CODE NOT STARTED
**Date:** 2026-08-24 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Formal release:** NOT RELEASED

This checkpoint supersedes the earlier C3 “written spec awaiting review” continuation state. The user explicitly approved the written C3 spec on 2026-08-24. The design document itself was committed before that approval, so its original header remains historical; this checkpoint is the repository record that closes the approval gate.

## Current truth

```text
Phase P mapping performance                  COMPLETE / NATIVE VERIFIED
Phase I Windows installer lifecycle          COMPLETE / NATIVE VERIFIED
Secure Envato credential runtime             COMPLETE / NATIVE VERIFIED
Phase C0 Signal Truth Audit                  COMPLETE / APPROVED
Phase C1 Rust ranking parity                 COMPLETE / VERIFIED
Phase C2 semantic correction                 COMPLETE / VERIFIED
Phase C3 architecture/spec                   COMPLETE / APPROVED
Phase C3.0 Evidence Constitution Runtime     PLAN READY / NOT IMPLEMENTED
Phase C3.1 deterministic signal v0.2         NOT IMPLEMENTED
Phase C3.2 Quant Calibration Lab             NOT IMPLEMENTED
Phase C3.3 calibrated production intelligence NOT IMPLEMENTED
Formal release                               NOT RELEASED
```

## Approved C3 design

Canonical spec:

`docs/superpowers/specs/2026-08-24-msl-phase-c3-evidence-calibrated-signal-model-design.md`

C3 is an Evidence Operating System, decomposed as:

```text
C3.0 Evidence Constitution Runtime
→ C3.1 Deterministic Signal v0.2
→ C3.2 Python Quant Research / Calibration Lab
→ C3.3 Calibrated Production Intelligence
```

Only C3.0 is authorized for the next implementation cycle.

## Approved C3.0 implementation plan

`docs/superpowers/plans/2026-08-24-msl-phase-c3-0-evidence-constitution-runtime.md`

The plan is TDD-first and locks:

```text
msl-evidence-contract/1
msl-evidence-requirements/1
msl-evidence-stage/c3.0-1
msl-evidence-confidence/uncalibrated-1
C3.0 maximum production stage = MOVEMENT_INDICATION
SUPPRESSED => evidence-qualified value null
C2 msl-semantic-contract/2 unchanged
C1 numeric/wire/history unchanged
history/signal_evidence_assessments.jsonl append-only
```

Initial C3.0 evidence registry is exactly:

```text
catalog.directional_breadth.v0.1
catalog.competition_momentum.v0.1
product.peer_relative_rank.v0.1
catalog.peer_relative_rank.v0.1
structural.observed_segment_composition.v0.1
```

Pinned model identities:

```text
product PRR                    = product-snapshot-v0.2
catalog signals                = catalog-snapshot-v0.2
structural composition         = volume-weighted-market-index-v0.1
product PRR peer definition    = c1-product-prr-peer/1 (within CatalogID)
catalog PRR peer definition    = c1-catalog-prr-peer/1 (Platform|ContentType|CatalogLevel)
```

## Baseline evidence before implementation

The isolated C3 worktree was created from C2 verified HEAD `cfedc8c8fc8cf246bba679dae337e7a16a11f541`.

Before the C3 design was committed, the isolated worktree recorded:

```text
cargo test --manifest-path engines/rust/Cargo.toml     PASS
cargo build --release                                  PASS
full go test ./... -count=1 against C3 release worker PASS
```

The plan requires these gates to be re-run before the first production edit; the earlier pass is context, not a substitute for implementation-session baseline verification.

## Execution identity

C3 implementation remains assigned to Remote Desktop Commander **Instance 02**. Do not silently switch to another Desktop Commander instance. If Instance 02 is offline, repository/documentation work may continue through GitHub, but local/native implementation and verification resume only when Instance 02 is available again or the user explicitly changes the execution identity.

The C3 branch/worktree identity is:

```text
branch   = task/c3-evidence-calibrated-model-v02-20260824
worktree = F:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260824
```

## Next exact action

```text
resume Instance 02
→ use superpowers:executing-plans
→ execute docs/superpowers/plans/2026-08-24-msl-phase-c3-0-evidence-constitution-runtime.md
→ Task 1 re-verifies Rust + full Go baseline before first production edit
→ implement Tasks 1–13 with per-task review
→ final whole-branch review
→ mark C3.0 COMPLETE only from observed automated + native evidence
→ do not start C3.1 automatically
```

## Immutable boundaries

- Do not alter C1 formulas, golden fixtures, wire contracts, or historical JSONL semantics as part of C3.0.
- Do not alter the meaning or shape of `msl-semantic-contract/2`.
- Do not guess any `TO_BE_CALIBRATED` threshold.
- Do not emit neutral `50` for unavailable evidence-qualified values.
- Do not promote `PRELIMINARY_TREND`, `ESTABLISHED_TREND`, or `SEASONALITY_CANDIDATE` in C3.0.
- Do not make Python a production runtime dependency.
- Do not add a Go numerical fallback for Rust-owned kernels.
- Do not introduce market-entry timing, buy/sell/hold, or trading semantics.
- Do not merge to `main` implicitly.

## RC / final release gate remains open

The deferred C2 elevated install-and-uninstall replay of the exact current Setup.exe remains binding before RC/final product sign-off. C3.0 staged native smoke is not allowed to rewrite this as passed. Interactive UAC only; no bypass.

## Permanent development execution scope guardrail — verbatim


Canonical source: `docs/checkpoints/PERMANENT_DEVELOPMENT_EXECUTION_SCOPE_GUARDRAIL.md`.
