# Market Signal Lab — Secure Envato Credential Native Windows Acceptance

> **Historical checkpoint:** the status, pending actions, machine paths, branch names and verification below belong to the dated revision. For the imported monorepo source and continuation boundary, use [CONTINUE_MSL.md](CONTINUE_MSL.md). This record is preserved as evidence and does not authorize resuming old work or certify the current checkout.

**Date:** 2026-08-18 (UTC+7)  
**Repository:** `rendevouz999/Market-Signal-Lab`  
**Tested source branch:** `feature/secure-envato-credential-runtime-resume-20260818`  
**Exact tested source head:** `ce9d1557a6f0504f195a351576d0961ea3e3a8b1`  
**Status:** NATIVE WINDOWS FUNCTIONAL ACCEPTANCE PASS / BUILD HASH RECORD PENDING

## User-reported native acceptance evidence

The user executed the prescribed native Windows verification workflow on the exact tested source head above and reported that **all requested checks were green with zero errors**.

The prescribed workflow covered:

- native Windows Credential Manager round-trip test;
- focused Go credential/connector/app/web tests;
- `go vet` focused gate;
- release Rust worker build;
- Windows Go application build;
- first-run Envato credential setup using the real token only in the local MSL UI;
- successful Quick Market Autopilot against real Envato data;
- full application stop and restart;
- restart without API-key re-entry;
- credential reuse from Windows Credential Manager;
- second successful Quick Market Autopilot after restart;
- existing/history data preservation;
- production Rust analytics remaining on the `msl-analytics/2` path.

No token, Authorization header, browser session, or secret-bearing payload was supplied to chat or committed to the repository.

## What this acceptance proves

The native workflow gives functional acceptance for the intended runtime behavior:

```text
first launch
  -> enter shared company Envato token once
  -> verify against Envato
  -> persist local credential instance in Windows Credential Manager
  -> use Go as the only credential-owning runtime boundary
  -> send normalized market data, not credentials, to Rust analytics

restart
  -> no API-key re-entry
  -> resolve saved credential
  -> continue real Envato market mapping
```

This is application portability, not developer-machine binding. A different researcher Windows account performs its own one-time credential setup.

## Evidence boundary

The native build script generated SHA-256 values for the application and packaged Rust worker, but those literal hash values were not provided back to the assistant in the acceptance message. They are therefore **not invented or reconstructed here**.

To convert this milestone from functional acceptance to the plan's strict `COMPLETE / VERIFIED` evidence label, copy the non-secret `BUILD-INFO.txt` values into the QA record later:

```text
SourceHead=ce9d1557a6f0504f195a351576d0961ea3e3a8b1
AppSHA256=<locally generated value>
RustWorkerSHA256=<locally generated value>
```

The missing artifact-hash transcription is an evidence-record gap only; the user reported the prescribed native execution itself as fully green.

## Repository safety

- credential work remains on its feature branch;
- draft PR #12 targets `feature/analytics-v2-ipc`;
- `main` is not modified by this milestone;
- large EXE/worker binaries remain local artifacts, not Git source history;
- no Rust credential handling was introduced.

## Next gate

The already-approved Windows installer lifecycle gate is next. It must prove Program Files installation plus `%LOCALAPPDATA%\MarketSignalLab` mutable state and preservation of credential/history through update, default uninstall, and reinstall.

Do not begin Phase C formula/ranking production changes until the project follows the current checkpoint decision on the installer distribution baseline.
