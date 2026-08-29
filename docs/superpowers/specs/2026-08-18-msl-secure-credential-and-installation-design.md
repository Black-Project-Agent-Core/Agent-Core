# Market Signal Lab — Secure Credential & Windows Installation Design

**Date:** 2026-08-18 (UTC+7)  
**Repository:** `rendevouz999/Market-Signal-Lab`  
**Baseline branch:** `feature/analytics-v2-ipc`  
**Baseline source commit:** `3f6f4a4c2a72262657c5bb637789e701c2bc0679`  
**Status:** **READY FOR USER WRITTEN-SPEC REVIEW**  
**Implementation timing:** Complete this gate before Phase C ranking/signal expansion.

This document is the durable design contract for persistent Envato credentials and a proper Windows installation lifecycle in Market Signal Lab (MSL). It captures the three user-approved design sections from the 2026-08-18 design session and is intended to be sufficient for a future implementation plan without reconstructing chat history.

## Permanent project guardrail — verbatim

> hal yang perlu di luruskan untuk alat yang kita bangun bukan untuk melakukan hal ilegal atau hacking web, melainkan hanya menganalisa arah market, membaca algoritma market, untuk mengetahui katalog, produk, dan nama pemilik produknya bukan berarti meng-hack orang tersebut melainkan melihat insight baru dan mengikuti alur trends, setiap katalog yang sedang hype di masukan ke daftar ranking Trends Katalog, dan produk apa yang bagus menjadi Insight agar aku tidak salah membuat produk, bukan bermaksud mencuri ide produk melainkan untuk bersaing tentang kualitas dan mengukur kualitas antara produkku dan orang lain.

Current scope remains **Market Trends & Insights**. The credential work in this document only improves secure access and researcher usability; it does not expand data collection scope or weaken any existing legal/data-handling guardrail.

---

## 1. Context and why this gate exists

The Windows live build has already demonstrated the new production analytics path successfully:

```text
Go application host
    -> Rust production analytics
    -> msl-analytics/2
```

A real Envato API smoke test was subsequently completed successfully by the user with the current preview build. The next usability/security problem is credential persistence: today the researcher can supply a token for a runtime session, but a company research tool should not require repeated token entry for every scan or launch.

The desired operating model is:

```text
same company MSL installer
    -> install on any researcher Windows PC
    -> researcher enters the shared company Envato token once on first setup
    -> MSL validates and stores it securely for that Windows user
    -> future launches reuse it automatically
```

The application, installer, repository, and company token must **not** be hard-bound to the developer's PC. MSL must be distributable as normal Windows software.

Important distinction:

- the **application/installer is portable across machines**;
- the **credential instance created after first setup is intentionally local to the researcher Windows user** and is protected by the OS credential store;
- moving the installer to another PC never requires rebuilding or re-binding MSL, but that PC performs first credential setup once.

Operational assumption for this design: one researcher workstation uses one primary Windows user profile. Technically, Windows Credential Manager is user-scoped; if multiple Windows accounts use the same installed MSL on one PC, each account configures its own credential once. Machine-wide shared-secret provisioning is a separate future enterprise design and is not required here.

---

## 2. Goals

This gate must provide all of the following:

1. researcher enters the Envato token once during first setup;
2. subsequent MSL launches require no token re-entry while the stored credential remains valid;
3. one MSL installer can be used on any supported Windows PC;
4. no company Envato token is hardcoded into Go, Rust, installer scripts, assets, repository files, or packaged configuration;
5. the persistent production credential is stored through Windows Credential Manager as a Generic Credential;
6. Go remains the credential/security owner and Envato request owner;
7. Rust analytics never receives the API token;
8. the existing `ENVATO_TOKEN` environment-variable path remains available as an explicit runtime/developer override;
9. mutable researcher data remains outside `Program Files` and follows the existing `%LOCALAPPDATA%\MarketSignalLab` layout;
10. application upgrades preserve history, configuration metadata, and the saved credential;
11. token rotation is safe and atomic;
12. authentication failures, rate limits, network failures, and provider failures are distinguishable;
13. secrets are absent from logs, history, exports, cache, analytics IPC, and UI responses;
14. Windows installation behaves like normal company software rather than an experimental portable folder;
15. the feature is verified by automated leakage tests plus a real post-restart Envato smoke test.

---

## 3. Non-goals

This gate does **not** introduce:

- a central company secret server;
- automatic fleet-wide token rotation;
- machine-ID licensing or hardware fingerprint licensing;
- a token embedded in the installer;
- a universal decryption key inside MSL;
- machine-wide credential sharing between unrelated Windows accounts;
- a plaintext persistent `.env` token store for researchers;
- automatic searching of disks/directories for `.env` files;
- a secret-reveal button in the UI;
- a fallback to anonymous, synthetic, or fake market data when credentials are missing;
- any change to Rust numerical formulas;
- Phase C ranking/signal expansion;
- Python runtime analytics;
- C++ acceleration.

The specific installer implementation technology (for example Inno Setup, WiX, or another Windows installer tool) is intentionally not a security contract. The implementation plan may select the simplest maintainable technology that satisfies every installation behavior in this specification.

---

## 4. Locked design decisions

| Area | Decision |
|---|---|
| Researcher credential model | One shared company Envato token; entered once per researcher Windows user on first setup |
| Persistent production store | Windows Credential Manager, Generic Credential |
| Credential target name | Stable application-owned target such as `MarketSignalLab/Envato` |
| Application portability | Installer and binaries are not bound to a specific PC |
| Credential scope | Local Windows user profile after setup |
| Secret owner | Go application/control plane only |
| Rust access | Forbidden; Rust receives normalized market data only |
| Hashing | SHA-256 may be used only for a non-secret fingerprint; hash is not the stored authentication credential |
| Runtime override | Existing `ENVATO_TOKEN` environment variable has higher runtime precedence, but never silently overwrites persistent credential |
| `.env` | Not a production vault and not automatically discovered; developer tooling may explicitly load `.env` into process environment |
| First-run save | Validate token before saving |
| Replacement | Validate new token first; replace old credential atomically only on success |
| Removal | Explicit action; removes credential/metadata but preserves history and exports |
| Missing credential | Fail closed; no scan starts |
| Invalid auth | Mark connection as needing attention; do not automatically delete credential |
| Application data root | Existing `%LOCALAPPDATA%\MarketSignalLab` model |
| Production app files | Read-only-style install under `Program Files` |
| Production port | Default local UI port remains `127.0.0.1:17771`; researcher does not need to manage it |
| Developer controls | Preserve CLI flags such as custom port/data directory/no-open |

---

## 5. Credential architecture

### 5.1 Production path

```text
Windows Credential Manager
        |
        v
CredentialResolver (Go)
        |
        v
Envato Client (Go)
        |
        | HTTPS authenticated request
        v
Envato
        |
        | normalized observations
        v
Go application/control plane
        |
        | secret-free analytical payload
        v
Rust production analytics / msl-analytics/2
```

The Rust worker must have no API for reading, receiving, storing, logging, or returning the Envato token.

### 5.2 Resolver precedence

Credential resolution is deterministic:

```text
1. explicit process ENVATO_TOKEN
       |
       | absent
       v
2. Windows Credential Manager
       |
       | absent
       v
3. first-setup / connection-required UI
```

Rules:

- environment override applies only to the current process/runtime;
- an override does not silently persist or replace the Credential Manager entry;
- persistent replacement requires an explicit `Replace API Key` operation;
- the resolver returns a typed source/status so diagnostics can distinguish `environment`, `credential_manager`, and `not_configured` without returning the token value.

### 5.3 Hash/fingerprint role

The API token must remain recoverable for authenticated requests, therefore hashing cannot replace encrypted/OS-protected credential storage.

MSL may compute:

```text
fingerprint = short_display_form(SHA-256(token))
```

Example display:

```text
A91F-27C4
```

The fingerprint exists only to identify which credential is configured. It is not authentication material and must never be presented as reversible encryption.

---

## 6. Persistent metadata and storage boundaries

The existing data root remains:

```text
%LOCALAPPDATA%\MarketSignalLab\
```

The store already establishes mutable areas such as `history`, `cache`, `config`, `exports`, and `logs`. This design retains those boundaries and permits a small `runtime` directory for ephemeral process/session metadata if implementation needs it.

Target structure:

```text
%LOCALAPPDATA%\MarketSignalLab\
├── config\
│   ├── app.json
│   └── connection.json
├── history\
├── cache\
├── exports\
├── logs\
└── runtime\                optional ephemeral state
```

The plaintext API token must not exist in any of these files/directories.

`config\connection.json` may contain non-secret connection metadata such as:

```json
{
  "provider": "envato",
  "configured": true,
  "credentialFingerprint": "A91F-27C4",
  "lastVerifiedAt": "2026-08-18T03:40:00+07:00",
  "lastStatus": "healthy"
}
```

The metadata file is never authoritative for credential existence. Credential Manager is authoritative; metadata is display/diagnostic state only.

---

## 7. First-run researcher experience

First application run performs a connection readiness check after application/runtime health initialization.

```text
Start MSL
  -> application files healthy?
  -> Rust worker healthy?
  -> data directory ready?
  -> Envato credential resolvable?
```

If no credential is resolvable, the main market scan action remains unavailable and the researcher receives a first-setup connection flow:

```text
Welcome to Market Signal Lab

Connect Envato
API Key: [ hidden input ]

[ Verify & Continue ]
```

Flow:

```text
researcher enters token
    -> hold temporarily in Go process memory
    -> perform narrow Envato authentication/connection validation
    -> success?
         no  -> show actionable failure; do not store token
         yes -> write Generic Credential
              -> compute/store non-secret fingerprint/status metadata
              -> mark setup complete
              -> continue to dashboard
```

MSL must never persist an unverified token during normal first setup.

---

## 8. Normal launch and scan UX

After first setup:

```text
Start MSL
  -> Go host
  -> Rust worker
  -> CredentialResolver
  -> stored credential found
  -> dashboard ready
```

The researcher no longer pastes a token into every Autopilot run.

Autopilot connection presentation becomes configuration/status oriented:

```text
ENVATO
● Connected · A91F-27C4

SCAN MODE
[ Quick ]

[ Map Market Now ]
```

If no credential is available:

```text
ENVATO
○ Not configured

[ Connect Envato ]

[ Map Market Now ]  disabled
```

No UI endpoint may return the plaintext credential. No `Reveal API Key` capability is included.

Connection management surface provides only:

```text
Test Connection
Replace API Key
Remove Credential
```

---

## 9. Token replacement and removal

### 9.1 Replace API Key

Replacement is transactional from the user's perspective:

```text
enter new token
  -> validate new token
  -> failure: keep old credential unchanged
  -> success: atomically replace Credential Manager entry
             -> update fingerprint/status metadata
```

An invalid replacement must never destroy a working stored credential.

### 9.2 Remove Credential

Removal is explicit and isolated:

```text
Remove Envato Credential?
  -> confirm
  -> delete Credential Manager entry
  -> clear non-secret connection metadata
  -> keep history
  -> keep exports
  -> keep analytics data
  -> return UI to connection-required state
```

Removal is not a full MSL reset.

---

## 10. Error and failure model

Credential state must not collapse all provider errors into `invalid token`.

Minimum categories:

| Failure | MSL classification | Credential action |
|---|---|---|
| Credential missing | `not_configured` | none; require setup |
| Auth rejection (provider-auth 401/403 semantics) | `needs_attention` / authentication failure | preserve credential |
| Rate limit (429 semantics) | `rate_limited` | preserve credential |
| DNS/offline/timeout | `network_unavailable` | preserve credential |
| Provider 5xx | `provider_error` | preserve credential |
| Malformed/unexpected provider response | `provider_response_error` | preserve credential |
| Local credential-store read failure | `credential_store_error` | fail closed; do not scan |

The exact mapping of provider responses must follow the Envato client behavior and tests. Authentication-specific status must only be used when the response actually supports that conclusion.

A failed request never causes silent fallback to synthetic/anonymous data and never reports a successful scan.

---

## 11. Memory handling and secret lifetime

MSL cannot truthfully claim that the token is never present in RAM; authenticated requests require plaintext authentication material at some point.

The correct security contract is:

- load plaintext only when required;
- avoid unnecessary copies;
- do not place the token in global UI/session state when a narrower lifetime is possible;
- do not serialize it into application-domain models;
- do not log it;
- do not include it in errors;
- do not include it in panic/error diagnostic payloads intentionally;
- do not send it through analytics IPC;
- release references as soon as practical after request construction/use.

Implementation should prefer a small credential abstraction over scattering raw `string` token handling across unrelated services.

---

## 12. Environment and `.env` compatibility

The existing `ENVATO_TOKEN` environment-variable workflow remains supported for developer, QA, automation, and headless use.

Normative behavior:

```text
ENVATO_TOKEN set for process
    -> use as runtime override
    -> do NOT persist automatically
    -> do NOT replace stored Generic Credential

ENVATO_TOKEN absent
    -> use stored Generic Credential
```

MSL production does not recursively search for `.env` files and does not treat a plaintext `.env` as its credential vault.

Developer tooling may explicitly load a project-local `.env` into the process environment, but repository protection must include:

```gitignore
.env
.env.*
!.env.example
```

A committed `.env.example` may contain only empty/non-secret placeholders such as:

```text
ENVATO_TOKEN=
```

This preserves convenient development configuration without normalizing plaintext researcher credential storage.

---

## 13. Windows installation layout

MSL moves from an experimental folder launch model toward a proper Windows application install.

### 13.1 Application files

Default install target:

```text
C:\Program Files\Market Signal Lab\
├── Market Signal Lab.exe
├── engines\
│   └── rust\
│       └── msl-analytics-rust.exe
├── companion\
│   └── browser-extension\
├── assets\                 if required by packaging
└── version.json             if required by packaging
```

Application files are treated as installed/read-only program assets. Mutable research data and secrets are forbidden from this directory.

The existing relative Rust worker layout is preserved:

```text
Market Signal Lab.exe
  -> engines\rust\msl-analytics-rust.exe
```

### 13.2 Mutable data

Research data remains under the Windows user data root:

```text
C:\Users\<Researcher>\AppData\Local\MarketSignalLab\
```

This preserves the current storage resolver behavior and keeps upgrades separate from research history.

### 13.3 Shortcuts and startup

Installer creates a normal Start Menu shortcut and may offer a Desktop shortcut. Researcher launches MSL without PowerShell.

Production default:

```text
Market Signal Lab.exe
    -> local server 127.0.0.1:17771
    -> browser opens automatically
```

The port remains an implementation detail for researchers.

Developer/QA execution retains custom CLI controls such as `--port`, `--data-dir`, and `--no-open` so isolated test instances remain possible.

---

## 14. Installer, upgrade, reinstall, and uninstall lifecycle

### 14.1 Install

```text
MSL-Setup.exe
  -> choose/default install location
  -> install Go app
  -> install Rust production worker
  -> install companion/support assets
  -> create shortcuts
  -> optionally launch MSL
```

The installer never asks for, stores, or embeds the Envato token. Credential setup belongs to the running MSL application.

### 14.2 Upgrade

An upgrade must:

```text
detect existing install
  -> stop/replace application binaries safely
  -> replace Rust worker/support assets
  -> preserve %LOCALAPPDATA%\MarketSignalLab
  -> preserve Windows Credential Manager entry
  -> allow storage migrations if the application requires them
  -> launch upgraded MSL
```

A normal upgrade must not ask for the Envato token again.

### 14.3 Reinstall on same Windows user

Default reinstall behavior preserves:

- local research data;
- history;
- exports;
- non-secret configuration;
- saved Envato credential.

### 14.4 Uninstall

Default uninstall removes application files but preserves researcher data and credential so accidental uninstall/reinstall does not destroy research continuity.

If the installer technology supports explicit cleanup options, they should default **OFF**:

```text
[ ] Also remove Market Signal Lab user data
[ ] Also remove saved Envato credential
```

Permanent cleanup must be deliberate.

---

## 15. Deployment across researcher PCs

The same installer can be transferred by the developer/company to any researcher PC:

```text
PC A: install -> enter shared token once -> work
PC B: same installer -> enter shared token once -> work
PC C: same installer -> enter shared token once -> work
```

There is no:

- developer-PC binding;
- machine-specific build;
- hardware fingerprint requirement;
- universal embedded credential;
- portable decryption master key shipped with the application.

If the company later has enough workstations that manual token rotation becomes operationally expensive, that is the trigger for a separate enterprise provisioning/secret-distribution design. It is explicitly deferred here.

---

## 16. Security boundary matrix

| Data / capability | Go host | Windows Credential Manager | Rust analytics | Local history/logs/exports | UI browser |
|---|---:|---:|---:|---:|---:|
| Plaintext Envato token during request | Yes, transient | OS-managed stored secret | No | No | Input only during setup/replace |
| Persistent token storage | No | Yes | No | No | No |
| Credential fingerprint | Yes | Not required | No | Config metadata allowed | Display allowed |
| Normalized market observations | Yes | No | Yes | Yes where domain requires | Yes where UI requires |
| Analytics results | Yes | No | Yes | Yes | Yes |

A code change that sends the Envato token to Rust or writes it to ordinary MSL data files violates this design.

---

## 17. Testing strategy

This feature uses TDD and is not accepted based on UI demonstration alone.

### 17.1 Credential resolver tests

Required scenarios:

| Scenario | Expected result |
|---|---|
| No environment + no stored credential | `not_configured` |
| Stored credential exists | returned from secure-store abstraction |
| `ENVATO_TOKEN` exists | runtime environment source wins |
| Runtime override removed | stored credential becomes active again |
| Secure-store read failure | typed failure; fail closed |

Tests must use an interface/fake credential store and must not depend on a developer's real Windows credential entry.

### 17.2 First setup tests

- valid token: validation succeeds, credential written, metadata updated;
- invalid token: credential not written;
- network failure during validation: credential not incorrectly labeled invalid/auth-failed;
- token never returned by setup HTTP response;
- empty/whitespace token rejected.

### 17.3 Replacement/removal tests

- valid replacement updates credential and fingerprint;
- invalid replacement preserves old credential exactly;
- credential-store write failure preserves prior usable state where possible and returns explicit failure;
- remove deletes only credential + connection metadata;
- remove does not delete research history/exports.

### 17.4 Provider error classification tests

Cover at minimum authentication rejection, rate limit, timeout/offline, 5xx, malformed provider response, and success.

### 17.5 Secret-leakage regression test

Use a canary value such as:

```text
MSL_TEST_SECRET_DO_NOT_LEAK_7F83...
```

After representative setup/scan/error flows, scan generated test artifacts and captured interfaces for the exact canary.

Required zero-occurrence surfaces:

```text
history/
logs/
cache/
exports/
config metadata
captured analytics IPC
HTTP response fixtures
formatted error messages
```

Expected:

```text
secretLeakOccurrences = 0
```

### 17.6 Rust boundary test

At least one integration test must capture/inspect the analytics worker request boundary and prove the canary token is absent from the v2 payload.

### 17.7 Windows persistence smoke

On Windows:

```text
fresh credential state
  -> launch MSL
  -> enter real Envato token once
  -> verify and save
  -> close MSL completely
  -> restart MSL
  -> do not re-enter token
  -> run Quick Map Market Now
  -> real Envato scan succeeds
```

Then repeat after an application upgrade/reinstall test to prove credential/history preservation.

No real token may be copied into test logs, screenshots committed to GitHub, fixtures, checkpoints, or build manifests.

---

## 18. Definition of Done

This gate is **VERIFIED** only when all of the following are true:

```text
[ ] researcher enters API token only once on first setup
[ ] saved credential survives MSL restart
[ ] saved credential survives normal upgrade/reinstall
[ ] installer/binaries remain usable on another researcher PC without rebuild/binding
[ ] company token is not hardcoded or packaged
[ ] no plaintext researcher .env persistence is required
[ ] explicit ENVATO_TOKEN override remains functional and non-persistent
[ ] token never appears in ordinary config/history/log/cache/export files
[ ] token never appears in analytics IPC or Rust process input
[ ] no UI/API endpoint reveals stored plaintext token
[ ] fingerprint is non-secret and derived independently of token display characters
[ ] invalid replacement cannot destroy the working credential
[ ] missing credential fails closed
[ ] auth/network/rate-limit/provider failures are differentiated
[ ] application data layout remains clean under LocalAppData
[ ] proper Windows installer/shortcut lifecycle works
[ ] automated canary leakage suite reports zero leaks
[ ] real post-restart Envato Quick smoke succeeds without token re-entry
```

Only after this gate is implemented and verified should MSL resume Phase C ranking/signal expansion.

---

## 19. Implementation boundary guidance

The implementation plan should keep the work in focused components rather than embedding credential logic directly into Autopilot handlers.

Expected conceptual units:

```text
internal/credential/       secure store interface + Windows implementation + resolver
internal/envato/           validation/request integration using resolved credentials
internal/app or web layer  setup/status/replace/remove orchestration
internal/storage/          non-secret connection metadata only
web UI                     connection setup/status UX
installer/ or scripts/     Windows installation lifecycle
```

Exact package/file names may follow existing repository conventions, but responsibilities must remain separated:

- credential store knows how to persist/retrieve a secret;
- resolver knows source precedence;
- Envato client knows provider requests/error semantics;
- application service knows setup/replace/remove workflow;
- storage knows only non-secret metadata;
- UI knows status and actions, not stored plaintext;
- Rust knows analytics only.

Unrelated refactoring is out of scope.

---

## 20. Written-spec review gate

This specification contains no unresolved design placeholders. The next step is user review of this committed document. Implementation planning must not begin until the user explicitly approves the written spec.
