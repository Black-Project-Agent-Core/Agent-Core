# Market Signal Lab Polyglot Foundation v3 — Canonical Design

**Status:** APPROVED ARCHITECTURAL DIRECTION / IMPLEMENTATION GATED BY PHASE-SPECIFIC TDD PLANS
**Date:** 2026-08-22
**Supersedes for language ownership and frontend/tooling direction:** `docs/superpowers/specs/2026-08-17-msl-polyglot-runtime-v2-design.md`
**Preserves:** all verified C1 numerical, Rust protocol, credential/security, installer, persistence, and C2 semantic contracts unless a later reviewed phase explicitly changes them.

## 1. Purpose

This document is the canonical language-ownership and anti-duplication foundation for Market Signal Lab (MSL). It updates the earlier Go/Rust/Python/C++ polyglot architecture by adding **TypeScript** and **Bun** only where they provide a clear domain advantage.

The goal is not to maximize the number of languages. The goal is to assign each responsibility to one language/runtime owner, preserve verified behavior, and prevent parallel implementations of the same capability.

## 2. Current Codebase Reality

The 2026-08-22 audit found:

- Go is the Windows host/control plane, HTTP/API layer, persistence owner, installer-facing application runtime, security boundary, and sole credential owner.
- Rust is the mandatory production analytics plane for migrated deterministic numerical kernels through `msl-analytics/2`.
- Product web UI is currently vanilla HTML/CSS/JavaScript embedded into the Go binary via `internal/web/embed.go`.
- Product web JavaScript is split across `app.js`, `workspace.js`, `telemetry.js`, `consensus.js`, and `analytics_engine.js`; `app.js` is already a high-responsibility file at roughly 975 lines / 85 KB.
- Current Go UI tests inspect embedded JavaScript source strings and function names directly.
- The Windows installer build currently compiles Rust, compiles Go, copies the Browser Companion, writes hashes/version metadata, and invokes Inno Setup. It has no frontend compilation stage.
- Browser Companion JavaScript is small and stable; no TypeScript rewrite is justified now.
- The Windows relay is an existing Node `.mjs` subsystem and is not a candidate for opportunistic Bun migration.
- Existing Python files are developer/supervisor/check tooling, not the future product Quant Research Lab.
- Bun 1.4.0 already exists in the development/cognitive-tool environment, but it is not a product runtime.
- There is currently no production C++ source in the repository.

These facts constrain the design. The new foundation must evolve the existing system instead of creating a second frontend/backend/tooling stack beside it.

## 3. Canonical Language Ownership

```text
Go
= Windows application host / control plane
= HTTP/API and orchestration
= persistence and local state ownership
= security boundary
= sole credential ownership
= packaging/runtime integration

Rust
= mandatory production analytics plane
= deterministic numerical kernels
= ranking/signal/structural computation migrated to Rust
= normal production path even when an optional C++ accelerator is absent

TypeScript
= progressively typed product UI source where frontend complexity justifies it
= typed frontend integration contracts where needed
= new developer/agent integration tooling when TypeScript is the clearest fit
= never a second production backend, analytics engine, storage engine, or credential owner

Bun
= TypeScript/JavaScript development toolchain
= package manager, script runner, test runner, typecheck/build runner
= allowed for new developer/agent automation and code-generation tooling when justified
= NOT a required installed MSL runtime and NOT a server/process that must remain running for normal MSL use

Python
= future offline Quant Research / Calibration Lab
= backtesting, calibration, sensitivity/stability analysis, confidence-model research, seasonality validation
= existing Python developer scripts remain Python unless a concrete maintenance problem justifies replacement
= research results are promoted through reviewed/versioned Rust production implementation

C++20
= optional accelerator behind Rust only after profiling proves a material hotspot
= never a replacement application host or independent analytics authority
```

## 4. Anti-Duplication Law

**A language does not gain a responsibility merely because it can perform it. Responsibility moves only when the existing owner is a demonstrated technical limit or the new language is clearly superior for that bounded domain.**

Required consequences:

- Existing Go HTTP/API routes MUST NOT be duplicated by a Bun/TypeScript server.
- Go credential/security ownership MUST NOT be duplicated in TypeScript, Bun, Python, Rust, or C++.
- Rust production analytics MUST NOT be reimplemented in TypeScript/Bun/Python as a production fallback.
- Python research models MUST NOT silently become production models; validated changes require a versioned Rust implementation and regression gate.
- C++ MUST NOT implement an independent analytics model; it accelerates a Rust-owned contract only.
- Existing working PowerShell installer/lifecycle logic MUST NOT be rewritten to Bun merely because Bun is available.
- Existing working Python QA/check scripts MUST NOT be rewritten to Bun without a concrete problem and a reviewed migration benefit.
- Existing Node Windows relay MUST remain Node until an explicit defect, maintenance cost, or measured benefit justifies a migration.
- Browser Companion MUST remain JavaScript during the initial TypeScript foundation because its current size/complexity does not justify migration cost.

## 5. TypeScript Adoption Strategy

TypeScript adoption is **progressive and source-of-truth driven**, not a big-bang rewrite.

### 5.1 Generated-output policy

The approved policy is **Option A**:

- TypeScript source is the source of truth for every migrated frontend file.
- Compiled JavaScript remains committed under the existing `internal/web/assets/js/` paths so plain Go tests/builds and native installer workflows can operate without Bun.
- Generated JavaScript MUST carry a generated-file warning and MUST NOT be manually edited.
- CI/verification MUST rebuild frontend output and require `git diff --exit-code` on generated assets.
- A migrated feature MUST have exactly one manual implementation: the `.ts` source. The `.js` file is generated output, not a second implementation.

### 5.2 Why committed generated JavaScript is required initially

MSL is currently Go-first. `go:embed` reads the JavaScript assets directly, and many Go tests inspect those assets without a frontend build step. Requiring Bun before every ordinary Go test/native build would unnecessarily destabilize a verified build pipeline.

Keeping deterministic generated JS committed preserves:

- direct `go test ./...` from a clean checkout;
- Go `embed.FS` behavior;
- current Windows installer topology;
- offline/reproducible source inspection;
- gradual migration with immediate rollback boundaries.

## 6. Initial TypeScript Scope

The first implementation wave is intentionally small.

### TS0 — Toolchain and safety foundation

Introduce pinned Bun/TypeScript development configuration, strict rules for generated output, and verification commands. **No product JavaScript behavior changes.**

### TS1 — Isolated pilot

Migrate only `analytics_engine.js` to a TypeScript source-of-truth because it is small, responsibility-bounded, and has existing Go tests. The generated output stays at the same URL/path and the Go embed contract remains unchanged.

### TS2 — Telemetry candidate, separate future design gate

`telemetry.js` is the strongest next candidate because it owns asynchronous EventSource state, reconnect logic, run/ETA state, and multiple structured payloads. TS2 MUST receive its own reviewed design/plan after TS0/TS1 evidence exists.

### TS3 — Consensus/workspace candidates, separate future design gates

`consensus.js` and `workspace.js` may follow when their work is naturally touched. No migration solely for language consistency.

### TS4 — `app.js` responsibility extraction, not rewrite

`app.js` MUST NOT be rewritten wholesale. Future feature work may extract bounded domains such as API/i18n/formatting, ranking, explorer, autopilot, integrity, and evidence into focused TypeScript units. Each extraction requires behavior-preserving tests and generated-output parity.

### TS5 — Browser Companion optional

Browser Companion remains JavaScript until its complexity or feature requirements justify a separate migration. Its current small codebase is not sufficient justification.

## 7. TypeScript Module Boundary During Migration

The initial pilot MUST preserve existing browser/script loading behavior. It MUST NOT introduce a second frontend framework, SPA router, frontend dev server, or client-side state framework.

Initial constraints:

- no React/Vue/Svelte migration;
- no Vite requirement for normal Go builds;
- no replacement of Go-rendered/embedded asset serving;
- no duplicate HTTP client layer outside the existing browser `api()` behavior unless a bounded extraction is explicitly approved;
- existing script URLs remain stable for migrated outputs;
- existing Go source-contract tests remain authoritative until intentionally replaced with stronger behavior/compile tests.

## 8. Frontend Contract Typing Without Premature Schema Duplication

The initial TS0/TS1 foundation MUST NOT create a large hand-maintained mirror of Go DTOs.

Rules:

1. Type only the fields required by the migrated unit.
2. Do not duplicate full Go response structs "for completeness".
3. If TypeScript contract count/complexity grows enough that manual drift becomes a recurring risk, create one reviewed Go-source-of-truth → generated TypeScript contract pipeline.
4. That generator is **not** part of TS0/TS1 because the pilot does not justify the extra subsystem yet.
5. Runtime validation remains required for untrusted/external data when static TypeScript types alone cannot prove shape.

## 9. Bun Boundary

Bun is a build/developer tool, not part of the installed runtime architecture.

Allowed initial Bun responsibilities:

```text
bun install --frozen-lockfile
bun run typecheck
bun run build:frontend
bun run test:frontend
bun run verify:frontend-generated
```

Allowed later responsibilities when justified:

- frontend AST/code-generation helpers;
- developer/agent automation;
- deterministic JSON/schema transformation;
- frontend contract validation;
- lightweight repository tooling that does not duplicate existing stable Go/Python/PowerShell/Node subsystems.

Forbidden without a new architectural review:

- Bun production HTTP server;
- Bun credential broker;
- Bun persistence service;
- Bun analytics worker;
- required background Bun process in the installed Windows application.

## 10. Build and Packaging Contract

The initial TS0/TS1 implementation MUST preserve the runtime package topology:

```text
Development / CI verification
    Bun install + TypeScript checks/build
            ↓
    generated JS drift gate
            ↓
    Rust tests/build
            ↓
    Go tests/build + go:embed generated JS
            ↓
    Browser Companion copy
            ↓
    Inno Setup

Installed runtime
    Market Signal Lab.exe (Go)
            ↓
    embedded compiled JS/CSS/HTML
            ↓
    Rust production worker

No Bun runtime required.
```

The native installer script does not need an immediate Bun build dependency because generated JavaScript is committed and verified separately. A later design may add an optional preflight generated-output check if it can be done without destabilizing native/offline builds.

## 11. Existing System Preservation Map

| Existing subsystem | Owner now | v3 decision |
|---|---|---|
| Windows app host | Go | Keep Go |
| HTTP/API | Go | Keep Go |
| Credential/security | Go | Keep Go; no duplication |
| JSONL/history/local state | Go | Keep Go |
| Production analytics | Rust | Keep mandatory Rust |
| `msl-analytics/2` binary worker | Go ↔ Rust | Preserve |
| Product web UI | vanilla JS | Progressive TS source migration only where justified |
| Browser Companion | JS | Keep JS initially |
| Windows relay | Node `.mjs` | Keep Node |
| Installer/lifecycle scripts | PowerShell | Keep PowerShell |
| Existing responsive/check tooling | Python/shell | Keep existing owners |
| Future calibration/backtest lab | not implemented | Python when Phase G begins |
| Native accelerator | not implemented | C++20 only after profiling gate |

## 12. Relationship to Product Roadmap

The unambiguous recommended sequence is:

```text
C2 semantic correction formal closeout
→ TS0/TS1 selective TypeScript/Bun foundation + isolated pilot
→ release-candidate hardening / soak evidence
→ C3 evidence-calibrated model v0.2
→ D Market Flow & Cohort Engine
→ E Trend State Engine
→ F Market Memory & Historical Echo
→ G Python Quant Research / Calibration Lab
→ H profiling gate
→ optional C++20 accelerator if justified
```

TypeScript/Bun is a **cross-cutting engineering foundation**, not a new analytics phase. The default sequence places TS0/TS1 after C2 closeout and before RC hardening so the hardening baseline includes the new build/type-safety foundation. It MUST NOT reopen C1 numerical work or silently change C2/C3 market semantics.

### 12.1 Executed sequencing exception — 2026-08-22

The user explicitly authorized TS0/TS1 to start before C2 Task 10 formal documentation closeout ("silahkan mulai"). TS0/TS1 therefore executed from exact C2 implementation HEAD `48b50f05ed952fb008be1349e46091a553d3d281` and is now verified. This was an execution-order exception only and did not itself mark C2 complete. **Current-state update (2026-08-23):** C2 formal closeout is now COMPLETE / VERIFIED on `task/c2-semantic-correction-20260822`; TS0/TS1 is also COMPLETE / VERIFIED, and the active work is the isolated `integration/c2-ts01-rc-baseline-20260823` branch. RC/final sign-off must use the new integrated installer candidate, not either historical C2-only or TS0/TS1-only Setup.exe; the integrated Setup.exe must later be exercised from a pre-elevated Administrator session without UAC bypass and with successful uninstall/cleanup.

## 13. C++ Admission Gate

C++ remains intentionally absent until all of the following are true:

1. representative real-shaped workload is profiled;
2. an exact Rust hotspot is identified;
3. algorithmic/idiomatic Rust optimization is attempted first;
4. an isolated C++20 proof-of-concept is built;
5. latency, throughput, memory, and integration overhead are compared;
6. improvement is repeatable and materially useful;
7. the C++ implementation remains behind a Rust-owned contract with a normal Rust path available.

A small or ambiguous speedup is a rejection, not an adoption signal.

## 14. Python Promotion Contract

Python remains the offline scientific laboratory:

```text
experiment
→ documented backtest/calibration evidence
→ reviewed model/parameter revision
→ versioned Rust implementation
→ production regression/parity gate
→ production
```

Python must never silently mutate production model behavior.

## 15. Testing Requirements for TS0/TS1

The initial foundation is acceptable only if all of the following pass:

- Bun version/pinned lockfile is reproducible in the supported development environment;
- TypeScript strict typecheck passes for the pilot source;
- frontend unit/contract tests pass;
- `analytics_engine.ts` is the only manual implementation of the migrated pilot;
- generated `analytics_engine.js` is deterministic and drift-free after rebuild;
- existing JavaScript URLs and Go `embed.FS` paths remain unchanged;
- existing Go web/UI tests pass against the generated JS;
- full Go regression passes;
- Rust source/wire/numeric diff gate remains clean;
- full Rust regression passes when required by the integration branch gate;
- native Windows installer can still be produced without Bun being installed on the target end-user machine;
- installed application remains `healthy / rust-production / msl-analytics/2`;
- no credential/token/browser-session material enters TypeScript build artifacts or Bun caches committed to Git;
- no new production server/runtime process is introduced by Bun.

## 16. Non-Goals

This foundation does NOT authorize:

- frontend framework rewrite;
- replacement of Go HTTP/API/storage/security code;
- TypeScript analytics formulas;
- Bun production services;
- Python production runtime;
- C++ implementation before profiling;
- Browser Companion rewrite during TS0/TS1;
- Node Windows relay rewrite;
- PowerShell installer rewrite;
- large Go↔TypeScript DTO generator during the pilot;
- removal of existing generated JS paths required by Go embed/tests.

## 17. Canonical Direction

When future documentation conflicts about language ownership, this document wins unless a later explicitly approved foundation document says otherwise.

The rule is:

```text
one responsibility
→ one canonical owner
→ one source of truth
→ generated adapters/artifacts allowed
→ parallel hand-maintained implementations forbidden
```
