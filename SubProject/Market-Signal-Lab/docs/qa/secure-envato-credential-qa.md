# Market Signal Lab — Secure Envato Credential QA

**Date:** 2026-08-18 (UTC+7)  
**Implementation branch:** `feature/secure-envato-credential-runtime-resume-20260818`  
**Exact native-tested source:** `ce9d1557a6f0504f195a351576d0961ea3e3a8b1`  
**Draft verification PR:** #12, base `feature/analytics-v2-ipc`  
**Status:** SECURE CREDENTIAL RUNTIME COMPLETE / VERIFIED

## Final native build identity

```text
BuiltAt=2026-08-18T06:26:20.0016246+07:00
SourceHead=ce9d1557a6f0504f195a351576d0961ea3e3a8b1
AppSHA256=C430B8812FE050EED56716BE6583C529D5975BEA184F8455765688815F08ED1C
RustWorkerSHA256=91709DB35028B133C6941A0B5D303E6441EF0100A3CE6F1011CECA0D3C6D488A
```

Immutable final evidence:

`docs/checkpoints/2026-08-18-secure-envato-credential-runtime-verified.md`

Earlier acceptance evidence:

- `docs/checkpoints/2026-08-18-secure-envato-credential-native-pass.md`
- `docs/checkpoints/2026-08-18-secure-envato-credential-restart-evidence.md`

## Approved security boundary

```text
Explicit ENVATO_TOKEN process override
        ↓ when absent
Windows Credential Manager
Target: MarketSignalLab/Envato
        ↓
Go application/control plane
        ↓ authenticated HTTPS
Envato API
        ↓ normalized market data only
Rust analytics v2
```

The application itself is not machine-bound. Each researcher Windows profile performs one-time credential setup on its PC.

## Verified behavior

The prescribed native Windows workflow was reported green with zero errors and proved:

- Windows Credential Manager native write/read/delete round trip;
- focused Go credential/app/web tests and Go vet;
- Rust release worker build;
- Windows MSL application build;
- valid real Envato token verifies before persistent storage;
- real Quick Market Autopilot succeeds;
- full MSL shutdown and restart requires no API-key re-entry;
- credential resolves from `credential_manager` after restart;
- second real Quick Market Autopilot succeeds;
- existing history remains intact;
- connection/status contracts expose no plaintext token.

Concrete connection evidence before and after restart:

```text
provider              = envato
configured            = true
effectiveSource       = credential_manager
credentialFingerprint = 106B-8C76
status                = connected
lastVerifiedAt        = 2026-08-17T23:30:41Z
```

Explicit plaintext-field test:

```text
"token" field present = False
```

Production analytics before and after restart:

```text
status   = healthy
engine   = rust-production
version  = 0.1.0
protocol = msl-analytics/2
```

The separate top-level diagnostics `protocol = msl-analytics/1` remains the known deferred Analytics Task 8 mismatch; it is not the worker protocol.

## Source boundary verified by implementation/diff audit

- Windows Generic Credential storage through Win32 Credential Manager APIs;
- environment-over-vault resolver with SHA-256-derived display fingerprint;
- validation-before-save and transactional replacement rollback;
- non-secret connection metadata only;
- explicit configure/test/remove HTTP routes;
- browser `sessionEnvatoToken` removed;
- token fields removed from Autopilot/scanner/observed-query/direct-research runtime payloads;
- telemetry secret cache removed;
- headless `market-map` uses the same resolver;
- `.env` and `.env.*` protected by `.gitignore`, with safe `.env.example`;
- canary leakage/provider-error redaction regressions added;
- English and Indonesian secure-credential copy added;
- no Rust source changed for credential handling.

## Repository safety

- PR #12 targets `feature/analytics-v2-ipc`, not `main`;
- `main` remains untouched;
- no real Envato token or Authorization header is stored in Git history;
- binary artifacts remain local/release artifacts, not source-history files.

## Gate conclusion

```text
SECURE CREDENTIAL RUNTIME COMPLETE / VERIFIED
```

The next approved gate is Windows Installer Lifecycle:

`docs/superpowers/plans/2026-08-18-msl-windows-installer-lifecycle-plan.md`

Only after the installer/distribution baseline is accepted should the project return to Phase C — Rust Ranking & Signal Expansion.