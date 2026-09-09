# MSL TS0/TS1 Polyglot Foundation — Verified Checkpoint

**Date:** 2026-08-22 (UTC+7)
**Branch:** `feature/typescript-bun-foundation-ts0-ts1-20260822`
**Feature verification HEAD:** `af4993af9c29c136acb70b8b8fc74d20717a1438` ("ci: verify TypeScript source and generated frontend")
**Canonical design:** `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md`
**Plan:** `docs/superpowers/plans/2026-08-22-msl-typescript-bun-foundation-ts0-ts1.md`
**QA evidence:** `docs/qa/polyglot-foundation-v3-ts0-ts1-qa.md`

## Status table

```text
TS0 Bun/TypeScript toolchain foundation          VERIFIED
TS1 analytics-engine TypeScript pilot           VERIFIED
TS2 telemetry TypeScript migration              DESIGN REQUIRED / NOT AUTHORIZED
TS3 consensus/workspace migration               DESIGN REQUIRED / NOT AUTHORIZED
TS4 app.js bounded domain extraction            DESIGN REQUIRED / NOT AUTHORIZED
TS5 Browser Companion migration                 NOT JUSTIFIED / NOT AUTHORIZED
Python Quant Lab                                FUTURE PHASE G
C++ accelerator                                 FUTURE PHASE H / PROFILING REQUIRED
```

**Gate result for this checkpoint: all TS0/TS1 gates pass.** TS0 and TS1 are therefore VERIFIED as of feature HEAD `af4993af9c29c136acb70b8b8fc74d20717a1438`.

## What TS0/TS1 verified

- Bun 1.4.0 / TypeScript 5.9.3 pinned development toolchain; `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:frontend`, `bun run verify:frontend-generated` all pass with zero generated-output drift.
- `frontend/src/analytics_engine.ts` is the single manual implementation of the migrated pilot; `internal/web/assets/js/analytics_engine.js` is deterministic generated output carrying the required generated-file notice, at the same URL/path Go `embed.FS` already served.
- Full Go regression (`go test ./... -count=1`, real Rust worker attached) and full Rust regression (`cargo test --manifest-path engines/rust/Cargo.toml`) both pass with zero changes to Rust/numeric production source versus the C2 baseline `48b50f05ed952fb008be1349e46091a553d3d281`.
- The native Windows installer still builds without any Bun dependency; the hash-identical staged runtime is `healthy / rust-production / msl-analytics/2` with a two-process tree (Go host + Rust worker only) and no Bun binary, Bun process, or `node_modules` anywhere in the staged runtime.
- No credential/token/session material entered any TypeScript build artifact or Bun cache; no new production server/runtime process was introduced by Bun.

## What TS0/TS1 does NOT verify (explicit, deferred)

**Deferred Important gate before RC/final sign-off:** the current TS0/TS1 Setup.exe was not literally replayed through the elevated `/VERYSILENT` path of `scripts\verify-windows-installer.ps1` — this session's shell token is non-elevated and `installer\MarketSignalLab.iss` requires `PrivilegesRequired=admin`. The Task 4 independent reviewer ruled this **ACCEPTED_BY_COMPOSITION** for the TS0/TS1 delta only: real C2 Setup.exe lifecycle evidence (install/uninstall/registry/Start-Menu checks) is inherited because the installer/lifecycle source is byte-identical to the C2 baseline, while the current exact TS0/TS1 installer build plus a hash-identical staged runtime prove the current generated-frontend/no-Bun delta. This does not substitute for a literal elevated replay. **Before RC/final sign-off, replay the current Setup.exe through `scripts\verify-windows-installer.ps1` from a pre-elevated administrator context. Never bypass UAC to close this gate.**

TS2, TS3, TS4, and TS5 remain unauthorized. Do not migrate `telemetry.js`, `consensus.js`, `workspace.js`, or any part of `app.js`, and do not migrate the Browser Companion, without a separate reviewed design/plan for that specific migration. Python Phase G (Quant Research/Calibration Lab) and C++ Phase H (profiling-gated accelerator) remain future phases untouched by this checkpoint.

## Execution-order note

TS0/TS1 proceeded from exact C2 implementation HEAD `48b50f05ed952fb008be1349e46091a553d3d281` under an explicit user-authorized execution-order exception granted 2026-08-22 ("silahkan mulai"). This exception applies only to TS0/TS1 foundation work. **It does not mark C2 formally complete, does not alter C2 semantics, and C2 formal closeout remains required before RC hardening.**

## Product status (unchanged by this checkpoint)

```text
Phase P mapping performance                COMPLETE / NATIVE VERIFIED
Phase I Windows installer lifecycle        COMPLETE / NATIVE VERIFIED
Secure Envato credential runtime           COMPLETE / NATIVE VERIFIED
Phase C0 Signal Truth Audit                COMPLETE / APPROVED
Phase C1 Rust ranking parity               COMPLETE / VERIFIED
Phase C1 native Windows acceptance         COMPLETE / VERIFIED
Phase C2 semantic correction               IMPLEMENTED / NATIVE VERIFIED / FORMAL CLOSEOUT PENDING
Phase C3 evidence-calibrated model v0.2    NOT STARTED
TS0 Bun/TypeScript toolchain foundation    VERIFIED
TS1 analytics-engine TypeScript pilot      VERIFIED
Formal release                             NOT RELEASED
```

This checkpoint does not change C2/C3 product semantics and does not change formal release status. Formal release remains **NOT RELEASED**.

## Next steps

1. Complete C2 formal documentation closeout (independent of TS0/TS1; not superseded by the execution-order exception above).
2. Close the deferred Important elevated-installer-replay gate before RC hardening.
3. Any TS2+ migration requires its own reviewed design/plan per `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md` — do not begin TS2 from this checkpoint alone.
