# Market Signal Lab — Secure Envato Credential Restart Evidence

**Date:** 2026-08-18 (UTC+7)  
**Repository:** `rendevouz999/Market-Signal-Lab`  
**Tested source branch:** `feature/secure-envato-credential-runtime-resume-20260818`  
**Exact native-tested source:** `ce9d1557a6f0504f195a351576d0961ea3e3a8b1`  
**Evidence status:** NATIVE RESTART / CREDENTIAL-REUSE PASS

## Native Windows evidence supplied by the user

Before the restart, the local connection status endpoint returned:

```json
{
  "provider": "envato",
  "configured": true,
  "effectiveSource": "credential_manager",
  "credentialFingerprint": "106B-8C76",
  "status": "connected",
  "lastVerifiedAt": "2026-08-17T23:30:41Z"
}
```

The user explicitly checked whether a plaintext `token` field existed in the response:

```text
False
```

The production analytics health before restart was:

```text
status   : healthy
engine   : rust-production
version  : 0.1.0
protocol : msl-analytics/2
```

The running MSL process listening on port `17771` was then stopped completely. After the same application was started again without API-key re-entry, the connection endpoint again returned:

```json
{
  "provider": "envato",
  "configured": true,
  "effectiveSource": "credential_manager",
  "credentialFingerprint": "106B-8C76",
  "status": "connected",
  "lastVerifiedAt": "2026-08-17T23:30:41Z"
}
```

The post-restart analytics diagnostics reported:

```json
{
  "applicationHost": {
    "component": "application_host",
    "language": "Go",
    "status": "healthy"
  },
  "productionAnalytics": {
    "status": "healthy",
    "engine": "rust-production",
    "version": "0.1.0",
    "protocol": "msl-analytics/2"
  },
  "protocol": "msl-analytics/1",
  "workerVersion": "0.1.0",
  "quantResearchLab": {
    "component": "quant_research_lab",
    "language": "Python",
    "status": "unavailable",
    "message": "not configured"
  },
  "nativeAccelerator": {
    "component": "native_accelerator",
    "language": "C++",
    "status": "unavailable",
    "message": "not required"
  },
  "checkedAt": "2026-08-17T23:33:17.1789709Z"
}
```

## Interpretation

This proves the intended restart boundary on the tested Windows environment:

```text
credential configured once
        ↓
credential stored by Windows Credential Manager
        ↓
MSL process fully stopped
        ↓
MSL restarted
        ↓
no API-key re-entry
        ↓
effectiveSource = credential_manager
        ↓
connection = connected
        ↓
production Rust analytics = healthy / msl-analytics/2
```

No plaintext Envato token is present in the connection-status JSON.

The top-level diagnostics field `"protocol": "msl-analytics/1"` is the already-known stale diagnostics label scheduled under deferred Analytics Task 8. The authoritative production worker field in the same response is `productionAnalytics.protocol = "msl-analytics/2"`; therefore this evidence does not indicate a production analytics downgrade.

## History preservation evidence

Before the restart acceptance test, the user created a backup of the existing MSL local data at:

```text
F:\Chrome-Isolated\Downloads\Trends&Insights\MSL-Credential-Test\History-Before-Credential-Test-20260818-062934
```

The user subsequently reported the complete prescribed workflow green with zero errors, including history preservation and successful real Quick Market Autopilot before and after restart.

## Secret-safety note

This evidence intentionally records only the non-secret connection fingerprint. The real Envato API token and Authorization header were not provided to chat and are not committed here.

## Remaining strict evidence item

The local build process generated application and Rust worker SHA-256 hashes, but those literal values have not yet been supplied to the repository record. Do not invent them. Transcribe the non-secret `BUILD-INFO.txt` values when available to close the strict artifact-hash evidence requirement.
