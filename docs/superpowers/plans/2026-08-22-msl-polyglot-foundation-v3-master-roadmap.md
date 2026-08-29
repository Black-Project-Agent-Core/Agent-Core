# Market Signal Lab Polyglot Foundation v3 — Master Roadmap

**Canonical design:** `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md`
**Initial TypeScript/Bun plan:** `docs/superpowers/plans/2026-08-22-msl-typescript-bun-foundation-ts0-ts1.md`
**Status:** CANONICAL ROADMAP / C2 VERIFIED / TS0–TS1 VERIFIED / RC BASELINE INTEGRATION IN PROGRESS / FUTURE PHASES STILL REQUIRE THEIR OWN APPROVED TDD PLANS

## Architecture Spine

```text
Go          = host / API / storage / security / credentials
Rust        = mandatory production analytics
TypeScript  = selectively typed product UI + bounded integration tooling
Bun         = development/build/test/tooling runtime only
Python      = future offline Quant Research / Calibration Lab
C++20       = optional Rust-behind accelerator after profiling
```

The anti-duplication law is mandatory: one responsibility has one canonical owner. Generated artifacts/adapters are acceptable; parallel hand-maintained implementations are not.

## Execution Order

```text
A/B verified runtime foundation
        ↓
C0 signal truth audit                 COMPLETE
        ↓
C1 Rust ranking/structural parity     COMPLETE / VERIFIED
        ↓
C2 semantic correction               COMPLETE / VERIFIED
        ↓  user-authorized sequencing exception already executed
T0 Bun/TypeScript tooling foundation COMPLETE / VERIFIED
        ↓
T1 analytics-engine TS pilot          COMPLETE / VERIFIED
        ↓
C2 formal documentation/QA closeout  COMPLETE / VERIFIED
        ↓
C2 + TS0/TS1 RC baseline integration  IN PROGRESS
        ↓
integrated Setup.exe replay           REQUIRED BEFORE RC / FINAL SIGN-OFF
        ↓
RC hardening / soak / failure tests
        ↓
C3 evidence-calibrated model v0.2
        ↓
D Market Flow & Cohort Engine
        ↓
E Trend State Engine
        ↓
F Market Memory & Historical Echo
        ↓
G Python Quant Research Lab
        ↓
H profiling gate
        ↓
optional C++20 accelerator only if justified
```

## Cross-Cutting TypeScript/Bun Lane

T0/T1 is the only TypeScript/Bun implementation currently completed and verified. It preserves Go embed paths and generates committed JavaScript from TypeScript source. Bun is never required by the installed application. The 2026-08-22 user-authorized sequencing exception allowed T0/T1 to execute before C2 formal documentation closeout. C2 closeout is now complete. That historical exception still does not authorize T2+; the active gate is verification and eventual elevated install/uninstall of the **integrated** C2 + TS0/TS1 RC candidate.

Future gates:

```text
T2 telemetry.ts candidate             separate design required
T3 consensus/workspace candidates     separate design required
T4 bounded app.js domain extraction   separate design required
T5 Browser Companion migration        not justified now
```

No future T-stage is authorized merely because T0/T1 succeeds.

## Product Intelligence Phases

**C3 — Evidence-calibrated model v0.2:** EvidenceStage, SignalEligibility, calibrated confidence, true acceleration, ODMI/momentum magnitude/PRR expansion, movement-index family, and research-backed thresholds.

**D — Market Flow & Cohort:** transition flow, exposure velocity, survival/persistence/decay/re-entry, Rust-owned production computation.

**E — Trend State Engine:** Emerging, Accelerating, Mainstream, Saturated, Cooling, Declining, Re-emerging with robust Rust time-series computation.

**F — Market Memory & Historical Echo:** market fingerprints, regime similarity, historical consensus, forward observed outcomes, Rust production scoring.

**G — Python Quant Research / Calibration Lab:** backtesting, calibration, sensitivity/stability, model comparison, confidence fitting. Python findings enter production only through reviewed/versioned Rust changes.

**H — Profiling / C++ Gate:** profile representative workloads, optimize Rust first, then test isolated C++20 only for materially useful hotspots such as large similarity matrices, dense cohort aggregation, or specialized SIMD distance kernels.

## Explicit Non-Duplication Decisions

- Do not create a Bun/TypeScript backend beside Go.
- Do not move credentials or storage out of Go.
- Do not create TypeScript/Python production analytics beside Rust.
- Do not rewrite the Node Windows relay, Python QA scripts, PowerShell installer, or Browser Companion merely for consistency.
- Do not create C++ until profiling passes its admission gate.
- Do not replace the current frontend with a framework during T0/T1.

## Completion Philosophy

Each migration must improve a bounded technical weakness and leave one source of truth. Language adoption is evidence-driven, gradual, and reversible at clear boundaries; it is never a rewrite objective by itself.
