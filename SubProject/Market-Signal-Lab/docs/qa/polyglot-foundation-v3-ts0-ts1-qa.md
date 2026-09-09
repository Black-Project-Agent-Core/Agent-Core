# Market Signal Lab — Polyglot Foundation v3, TS0/TS1 QA

**Date:** 2026-08-22 (UTC+7)
**Status:** VERIFIED for the TS0/TS1 delta only (see explicit future gates below)
**Repository:** `rendevouz999/Market-Signal-Lab`
**Branch:** `feature/typescript-bun-foundation-ts0-ts1-20260822`
**Feature verification HEAD:** `af4993af9c29c136acb70b8b8fc74d20717a1438` ("ci: verify TypeScript source and generated frontend")
**Canonical design:** `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md`
**Plan:** `docs/superpowers/plans/2026-08-22-msl-typescript-bun-foundation-ts0-ts1.md`

## Scope

This QA records only observed TS0/TS1 evidence: the pinned Bun/TypeScript toolchain foundation (TS0) and the isolated `analytics_engine.ts` pilot (TS1). It does not certify TS2 (telemetry), TS3 (consensus/workspace), TS4 (`app.js` extraction), or TS5 (Browser Companion) — those remain separate, not-yet-authorized future design gates. It does not change C2/C3 product semantics or formal release status.

## Execution-order note

TS0/TS1 proceeded from exact C2 implementation HEAD `48b50f05ed952fb008be1349e46091a553d3d281` under an explicit user-authorized execution-order exception granted 2026-08-22 ("silahkan mulai"). This exception applies only to TS0/TS1 foundation work. It does not mark C2 formally complete, does not alter C2 semantics, and C2 formal closeout remains required before RC hardening. See `.superpowers/sdd/2026-08-22-msl-typescript-bun-foundation-ts0-ts1/progress.md` for the full ruling.

## Toolchain versions

```text
Bun:        1.4.0 (portable exe, F:\Market-Signal-Lab\dist\.local-tools\bun-1.4.0\bun-windows-x64\bun.exe)
TypeScript: 5.9.3
Go:         go1.26.4 windows/amd64 (F:\Market-Signal-Lab\dist\.local-tools\go1.26.4\go\bin\go.exe)
```

## Source/output paths

```text
TypeScript source of truth: frontend/src/analytics_engine.ts, frontend/src/globals.d.ts
Frontend tests:             frontend/tests/analytics_engine.test.ts
tsconfig:                   frontend/tsconfig.json (rootDir=src, outDir=../internal/web/assets/js)
Generated output:           internal/web/assets/js/analytics_engine.js (go:embed asset, URL/path unchanged)
```

`analytics_engine.js` carries the generated-file notice `// GENERATED FILE NOTICE: internal/web/assets/js/analytics_engine.js is generated from frontend/src/analytics_engine.ts; edit only the TypeScript source.` and is the single generated artifact for the pilot's single manual `.ts` implementation.

## Final gate results (this session, HEAD `af4993a`)

Working tree was clean and HEAD unchanged (`af4993af9c29c136acb70b8b8fc74d20717a1438`) before and after all gates below. Bun cache/temp redirected under `F:\Market-Signal-Lab\dist\.local-temp\ts0-ts1\{bun-cache,tmp}`; Go cache/tmp redirected under `F:\Market-Signal-Lab\dist\.local-temp\ts0-ts1\{gocache,gotmp}`.

| Gate | Command | Result |
|---|---|---|
| Documentation whitespace/conflict hygiene | `git diff --check` | exit 0 — clean |
| Secret scan | `git grep -n -I -E 'ghp_[A-Za-z0-9]{20,}\|github_pat_[A-Za-z0-9_]{20,}\|sk-[A-Za-z0-9_-]{20,}\|Bearer [A-Za-z0-9._-]{20,}' -- .` | no matches (grep exit 1 = no matches found) |
| Frontend dependency install | `bun install --frozen-lockfile` | `+ typescript@5.9.3`, 1 package installed, exit 0 |
| TypeScript strict typecheck | `bun run typecheck` (`tsc -p frontend/tsconfig.json --noEmit`) | exit 0, no errors |
| Frontend unit/contract tests | `bun run test:frontend` (`bun test frontend/tests`) | `2 pass, 0 fail, 5 expect() calls` — exit 0 |
| Generated-output drift gate | `bun run verify:frontend-generated` (rebuild + `git diff --exit-code` on generated JS) | rebuild produced only a benign CRLF-normalization warning; `git diff --exit-code` exit 0 — zero drift |
| Focused Go regression | `go test ./internal/web -count=1` | `ok marketsignallab/internal/web 5.923s` — exit 0 |
| Full Go regression | `go test ./... -count=1` (`MSL_RUST_WORKER` set to the real Rust worker binary, `GOFLAGS=-buildvcs=false`) | 24 packages `ok` (1 no-test-files: `internal/repository`), exit 0 |

`git status --short` was empty (clean) both before and after every gate above.

### Transient regression note

One interim `go test ./... -count=1` run hit timing-sensitive Rust-worker restart failures under `TestRustV2ClientHardFailureRestartsBeforeNextBatch` (`rust analytics v2 handshake timeout` / watchdog timeout). The targeted test rerun passed, followed by a fresh full repository rerun with all packages green. No source or threshold was changed to hide the transient failure; the final passing run above is the closeout result.

## Native installer / installed-runtime evidence (inherited from Task 4, this branch, HEAD `af4993a`)

Recorded exactly as produced by `scripts\build-windows-installer.ps1` against this HEAD (`dist/ts-foundation-acceptance/windows-installer/evidence/installer-build.json`):

```text
version:          0.3.0-alpha.6.5.3-preview.1
sourceHead:        af4993af9c29c136acb70b8b8fc74d20717a1438
installerSha256:   A2A320F2CF70D0EFED6A76EB2C5EBEA99BC08114C122F21F2E66E64568B8D953
appSha256:         0E213B688885410FC6493A47E3A7846548F916592D2279DD54C5A4D8FA41B25C
rustWorkerSha256:  F04B6DB29316B00655341352BD5A433696B5E9435F417CF2F43CD56F08A6F1F1
```

Rust/numeric diff gate against the C2 baseline `48b50f05ed952fb008be1349e46091a553d3d281` (`engines/rust`, `internal/analyticsengine`, `internal/ranking/rust_input_v01.go`, `internal/ranking/rust_output_v01.go`, `internal/indexing`): exit 0, no diff. Full Rust regression (`cargo test --manifest-path engines/rust/Cargo.toml`): all suites passed, 0 failed.

Native health from the hash-identical staged runtime (independently rehashed after copy, matching the manifest above):

```text
applicationHost.status:       healthy
productionAnalytics.status:   healthy
productionAnalytics.engine:   rust-production
productionAnalytics.protocol: msl-analytics/2
```

Installed frontend marker: `GET /assets/js/analytics_engine.js` served 1498 bytes, byte-identical to the committed `internal/web/assets/js/analytics_engine.js` (also 1498 bytes), containing both the generated-file notice and the `loadAnalyticsEngineDiagnostics().catch(error => console.error(error));` marker.

Bun-absence proof: the running process tree was exactly `Market Signal Lab.exe` (Go host) → `msl-analytics-rust.exe` (Rust worker), no other children. No `bun.exe` or Bun-named process anywhere on the system; no `*bun*` files or `node_modules` anywhere under the installed/staged runtime directory.

**Documented limitation (inherited, not re-attempted this session):** this evidence used the hash-identical installer *stage* directory rather than a literal elevated `/VERYSILENT` replay of the current Setup.exe, because this session's shell token is non-elevated and `installer\MarketSignalLab.iss` requires `PrivilegesRequired=admin`. The Task 4 independent reviewer adjudicated this **ACCEPTED_BY_COMPOSITION** for the TS0/TS1 delta specifically: the real C2 Setup.exe install/uninstall/registry/shortcut lifecycle evidence is inherited because the installer/lifecycle *source* (`installer/MarketSignalLab.iss`, `scripts/build-windows-installer.ps1`, `scripts/verify-windows-installer.ps1`, `scripts/windows-installer-test-helpers.ps1`, `scripts/verify-windows-installer-lifecycle.ps1`, `scripts/tests/*.Tests.ps1`) is byte-identical to the C2 baseline (`git diff --exit-code 48b50f0... -- installer scripts/...` → exit 0 / `INSTALLER_SOURCE_DIFF=NONE`), while the current exact TS0/TS1 installer build plus the hash-identical staged runtime prove the current generated-frontend/no-Bun delta. **The current TS0/TS1 Setup.exe was not literally replayed through the elevated verifier.** This is a deferred **Important** gate, not a defect: before RC/final sign-off, replay the current Setup.exe through `scripts\verify-windows-installer.ps1` from a pre-elevated administrator context. Do not bypass UAC to close this gate.

## Result

All TS0/TS1 gates observed this session are PASS with zero generated drift, an unmodified working tree, and the working HEAD unchanged. TS2/TS3/TS4/TS5 remain out of scope and unauthorized by this QA; see `docs/checkpoints/2026-08-22-MSL-TS0-TS1-FOUNDATION-VERIFIED.md` for the explicit future-gate status table.
