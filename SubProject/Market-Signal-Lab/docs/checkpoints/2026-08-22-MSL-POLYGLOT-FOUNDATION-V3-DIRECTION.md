# MSL Polyglot Foundation v3 — Direction Checkpoint

**Status:** ARCHITECTURE DIRECTION APPROVED / C2 COMPLETE / VERIFIED / TS0–TS1 COMPLETE / VERIFIED / RC BASELINE INTEGRATION IN PROGRESS
**Date:** 2026-08-22

## Canonical documents

- Design: `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md`
- Initial implementation plan: `docs/superpowers/plans/2026-08-22-msl-typescript-bun-foundation-ts0-ts1.md`

These documents supersede the 2026-08-17 polyglot documents only where language ownership, frontend migration, Bun/TypeScript tooling, or current transport reality conflicts. Historical phase evidence remains historical evidence.

## Current verified ownership

```text
Go         Windows host/control plane, HTTP/API, persistence, security, credentials
Rust       mandatory production analytics / msl-analytics/2
JavaScript generated/remaining embedded product UI plus Browser Companion source
TypeScript TS1 analytics-engine diagnostics source-of-truth; selective migration only
Node       existing Windows relay
Python     existing developer/check tooling; future Quant Lab not yet implemented
C++        not implemented; profiling-gated only
```

## Newly approved ownership

```text
TypeScript progressive source-of-truth for complex product UI slices only
Bun        development/build/test/agent-tooling runtime only; never required by installed MSL
Python     future offline Quant Research / Calibration Lab
C++20      optional accelerator behind Rust after measured profiling evidence
```

## Anti-duplication rule

One responsibility has one canonical owner. A new language does not receive a responsibility merely because it can perform it. Generated artifacts/adapters are allowed; parallel hand-maintained implementations are forbidden.

Therefore TS0–TS1 does not authorize a Bun API server, credential layer, storage layer, analytics engine, frontend framework rewrite, Browser Companion rewrite, Windows relay rewrite, PowerShell installer rewrite, Python-tool rewrite, or C++ implementation.

## Initial TypeScript/Bun sequence

The original default sequence was C2 formal closeout → TS0 → TS1. On 2026-08-22 the user explicitly authorized an execution-order exception ("silahkan mulai"), so the executed state is:

```text
C2 semantic correction + formal closeout      COMPLETE / VERIFIED
→ TS0 toolchain + generated-output foundation COMPLETE / VERIFIED
→ TS1 analytics_engine TypeScript pilot       COMPLETE / VERIFIED
→ C2 formal documentation/QA closeout         COMPLETE / VERIFIED
→ C2 + TS0/TS1 RC baseline integration        IN PROGRESS
→ integrated Setup.exe elevated replay         REQUIRED BEFORE RC / FINAL SIGN-OFF
→ RC hardening / soak
→ return to C3 product roadmap
```

The historical exception did not itself mark C2 complete. C2 is now independently COMPLETE / VERIFIED. TS2+ remains unauthorized.

Future TS2 telemetry migration, TS3 consensus/workspace migration, TS4 bounded `app.js` extraction, and TS5 Browser Companion migration each require a separate design gate. They are not implicitly authorized by the TS0–TS1 plan.

## Generated output policy

Approved Option A:

- TypeScript source is the only manual implementation for migrated files.
- Compiled JavaScript remains committed at existing Go-embedded paths.
- Rebuild + `git diff --exit-code` is mandatory to detect drift.
- Normal Go tests/native builds remain possible without Bun.
- The installed Windows application does not ship or require Bun.

## Product roadmap remains

```text
C2 semantic correction COMPLETE / VERIFIED
→ TS0/TS1 selective TypeScript/Bun foundation COMPLETE / VERIFIED by approved exception
→ C2 formal documentation/QA closeout COMPLETE
→ C2 + TS0/TS1 RC baseline integration
→ integrated Setup.exe elevated replay
→ RC hardening/soak
→ C3 evidence-calibrated model v0.2
→ D Market Flow & Cohort
→ E Trend State
→ F Market Memory & Historical Echo
→ G Python Quant Research / Calibration Lab
→ H profiling gate
→ optional C++20 accelerator only if materially justified
```

TypeScript/Bun is an engineering foundation lane, not a replacement analytics phase.
