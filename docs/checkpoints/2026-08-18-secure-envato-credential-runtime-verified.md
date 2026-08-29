# Market Signal Lab — Secure Envato Credential Runtime VERIFIED

**Date:** 2026-08-18 (UTC+7)  
**Status:** COMPLETE / VERIFIED  
**Implementation branch:** `feature/secure-envato-credential-runtime-resume-20260818`  
**Exact native-tested source:** `ce9d1557a6f0504f195a351576d0961ea3e3a8b1`

## Native build identity

The user supplied the local `MSL-Credential-Test/BUILD-INFO.txt` values from the successful Windows acceptance build:

```text
MSL SECURE CREDENTIAL NATIVE TEST
SourceHead=ce9d1557a6f0504f195a351576d0961ea3e3a8b1
BuiltAt=2026-08-18T06:26:20.0016246+07:00
AppSHA256=C430B8812FE050EED56716BE6583C529D5975BEA184F8455765688815F08ED1C
RustWorkerSHA256=91709DB35028B133C6941A0B5D303E6441EF0100A3CE6F1011CECA0D3C6D488A
```

These hashes identify the locally tested binaries. The binaries themselves remain local/release artifacts and are not committed to Git source history.

## Native Windows verification evidence

The prescribed Windows workflow was reported green with zero errors, covering:

1. native Windows Credential Manager write/read/delete round trip;
2. focused Go credential/app/web tests;
3. Go vet;
4. Rust release worker build;
5. Go Windows application build;
6. first-run real Envato credential setup;
7. real Quick Market Autopilot success;
8. full MSL process shutdown;
9. restart without API-key re-entry;
10. credential reuse from Windows Credential Manager;
11. second real Quick Market Autopilot success;
12. existing history preservation.

## Concrete restart/reuse evidence

Before and after full process restart, the connection endpoint reported:

```text
provider              = envato
configured            = true
effectiveSource       = credential_manager
credentialFingerprint = 106B-8C76
status                = connected
lastVerifiedAt        = 2026-08-17T23:30:41Z
```

The explicit plaintext contract check returned:

```text
"token" field present = False
```

Production analytics before and after restart reported:

```text
status   = healthy
engine   = rust-production
version  = 0.1.0
protocol = msl-analytics/2
```

The diagnostics payload also exposed a separate top-level `protocol = msl-analytics/1`. This is the already-known deferred Analytics Task 8 diagnostics mismatch and is not the production Rust worker protocol.

## Security result

The verified runtime behavior is:

```text
first setup
    ↓
real Envato token validated
    ↓
Windows Credential Manager
Target: MarketSignalLab/Envato
    ↓
Go resolves credential on later runs
    ↓
Envato HTTPS requests
    ↓
normalized market data only
    ↓
Rust analytics v2
```

Verified constraints:

- API key entered once on the tested Windows user profile;
- no API-key re-entry after restart;
- no plaintext token in connection-status response;
- browser session-token transport removed;
- no credential ownership moved into Rust;
- no app/installer machine-ID binding introduced;
- local history survived the credential lifecycle test;
- no real token or Authorization header was committed to the repository.

## Milestone conclusion

```text
SECURE CREDENTIAL RUNTIME COMPLETE / VERIFIED
```

The next approved gate is the Windows Installer Lifecycle plan:

`docs/superpowers/plans/2026-08-18-msl-windows-installer-lifecycle-plan.md`

Phase C — Rust Ranking & Signal Expansion remains after the installer/distribution baseline is accepted.