# Market Signal Lab — Phase I Windows Installer Lifecycle QA

**Date:** 2026-08-18 (UTC+7)
**Status:** COMPLETE / NATIVE WINDOWS LIFECYCLE VERIFIED
**Repository:** `rendevouz999/Market-Signal-Lab`
**Phase I branch:** `feature/phase-p-windows-installer-promotion-20260818`
**Native-tested Phase I source:** `0b9c770309b7eff0180bf4ef02d30d65cf71ef22`
**Historical upgrade source:** `c20cc55fb243c63b405e27a819c54a3fa5dcb860`

## Scope

This QA verifies the Phase P runtime as a normal Windows-installed application across clean install, real installer-over-installer upgrade, saved-credential reuse, real Quick Market Autopilot, default uninstall, reinstall, normal restart, and Start Menu launch.

The verifier never reads, prints, exports, migrates, duplicates, or deletes the raw Envato token. Credential evidence is limited to configured/connected state and the non-secret fingerprint.

Phase C remained frozen. No production Go/Rust market formula or ranking semantic was changed for this acceptance.

## Native toolchain

```text
Go:    go1.26.4 windows/amd64
Rust:  1.97.1 x86_64-pc-windows-gnu
Cargo: 1.97.1
Inno:  6.7.3, fresh test-local compiler
```

## Installer identities

Historical candidate rebuilt from exact source:

```text
version=0.3.0-alpha.6.5.3-preview.1
sourceHead=c20cc55fb243c63b405e27a819c54a3fa5dcb860
installerSha256=EDA912D59887F0C3C9F8B81093E942A9FACB4225BDC8126CD86180E546ECDD2B
appSha256=37DB0212B2F5493A4D290B51C05FDC9996DA55390FC8227FF9EB8BC1AE23BCDE
rustWorkerSha256=F2ED3A7086AAE0CAB80ACE788BBA494258F16B8DE02A1CBC7443E7C271273B51
```

Current Phase I candidate and installed manifest:

```text
version=0.3.0-alpha.6.5.3-preview.1
sourceHead=0b9c770309b7eff0180bf4ef02d30d65cf71ef22
builtAtUtc=2026-08-18T10:49:28.5778360Z
installerSha256=DB48A3B7586D8CAC84B53C1E5E7B0C3397A8162D678BB62239AB1261D76F5F90
appSha256=59ED8E7E1A8C596450EA7BC4C0ABA1738D22F66B3AD7D2E397773E2421754226
rustWorkerSha256=087E5AC3C60E8087D3C3C895C7CD4C46F7A8A802AAFDB14B6FAED2BBC4D3D044
```

Installed path: `C:\Program Files\Market Signal Lab`.

## Preflight and repository gates

Native static contracts:

```text
build-windows-installer.Tests.ps1=PASS
verify-windows-installer.Tests.ps1=PASS
verify-windows-installer-lifecycle.Tests.ps1=PASS
```

Final reproduced Go regression states were green: focused queue test 20/20 PASS, `internal/analyticsengine -count=5` PASS, full repository serial PASS, and exact full repository normal PASS. One earlier full-suite run produced a non-reproducible one-second fake-worker watchdog timeout; systematic reproduction did not reproduce it and no production/test source was changed to mask it.

```text
go build ./internal/app ./cmd/market-signal-lab=PASS
cargo test --manifest-path engines/rust/Cargo.toml=PASS
Rust library tests=22 passed / 0 failed
existing V2 worker/batch integration tests=PASS
```

## Clean-install smoke

Current Phase I installer was installed and exercised on isolated port `17775`.

```text
applicationHost=healthy / go-control-plane / msl-app/1
productionAnalytics=healthy / rust-production / msl-analytics/2
installedSourceHead=0b9c770309b7eff0180bf4ef02d30d65cf71ef22
result=PASS
```

## Credential-preserving installed lifecycle

Automated lifecycle evidence was produced by `scripts/verify-windows-installer-lifecycle.ps1` on port `17771`.

```text
preUpgrade.configured=true
preUpgrade.status=connected
preUpgrade.credentialFingerprint=106B-8C76
preUpgrade.historyCount=26

upgrade.sourceHead=0b9c770309b7eff0180bf4ef02d30d65cf71ef22
upgrade.credentialFingerprint=106B-8C76
upgrade.productionAnalytics=healthy / rust-production / msl-analytics/2
upgrade.historyAdded=0
upgrade.historyRemoved=0
upgrade.historyChanged=0

uninstall.appRemoved=true
uninstall.historyAdded=0
uninstall.historyRemoved=0
uninstall.historyChanged=0

reinstall.credentialFingerprint=106B-8C76
reinstall.productionAnalytics=healthy / rust-production / msl-analytics/2
reinstall.historyAdded=0
reinstall.historyRemoved=0
reinstall.historyChanged=0

restart.credentialFingerprint=106B-8C76
restart.productionAnalytics=healthy / rust-production / msl-analytics/2
restart.historyAdded=0
restart.historyRemoved=0
restart.historyChanged=0
```

## Real installed Quick Market Autopilot

The upgraded installed application reused the saved Envato credential and completed a real Quick mapping run.

```text
runId=bdb46be21f317202a972c581084ca51c
status=completed
startedAt=2026-08-18T10:51:00.4580206Z
completedAt=2026-08-18T10:56:32.2896942Z
elapsedMs=331166
plannedWorkUnits=21
completedWorkUnits=21
targets=14/14
productsDiscovered=489
authorsObserved=384
requestsCompleted=28
coverage=100
warningCount=0
errorCount=0
```

The same run remained readable after uninstall/reinstall and normal restart.

## Start Menu and normal restart

Shortcut acceptance:

```text
shortcut=C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Market Signal Lab\Market Signal Lab.lnk
target=C:\Program Files\Market Signal Lab\Market Signal Lab.exe
arguments=<empty>
```
Two consecutive Start Menu launches both proved:

```text
healthOk=true
productionAnalytics=healthy / rust-production / msl-analytics/2
credentialFingerprint=106B-8C76
latestRunId=bdb46be21f317202a972c581084ca51c
```

No developer-only launch arguments were used.

## Generated-evidence secret audit

Files audited:

```text
dist/windows-installer/evidence/installer-build.json
dist/windows-installer/evidence/installer-lifecycle.json
dist/windows-installer/stage/version.json
```

Results for every audited file:

```text
Authorization=0
Bearer=0
Cookie=0
RawTokenField=0
GenericToken=0
```

Only the non-secret credential fingerprint is recorded in lifecycle evidence.

## Acceptance conclusion

Phase I completion chain is verified on native Windows:

```text
Phase P runtime
→ deterministic historical/current installer builds
→ clean install
→ real installer-over-installer upgrade
→ saved credential reuse
→ real Quick completed
→ default uninstall preserved researcher history
→ reinstall rediscovered credential/history
→ normal restart preserved state
→ Start Menu launch passed twice
→ Rust V2 production analytics healthy throughout
→ generated evidence secret audit passed
```

**Phase I status: COMPLETE / NATIVE WINDOWS LIFECYCLE VERIFIED.**

This is not a formal product release. PR #18 remains Draft pending an explicit integration decision; Phase C remains frozen and `main` is not authorized for merge by this QA.
