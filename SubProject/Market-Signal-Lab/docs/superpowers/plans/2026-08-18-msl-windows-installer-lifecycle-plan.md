# MSL Windows Installer Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the verified MSL Windows application pair into normal company software with a reproducible installer, clean Program Files layout, preserved researcher data/credential across upgrades and default uninstall/reinstall, and factual native Windows verification before Phase C.

**Architecture:** A PowerShell packaging pipeline builds the Go Windows GUI host and Rust production worker from source, stages the existing browser companion under the runtime path expected by MSL, and invokes an Inno Setup source definition to create one x64-compatible installer. Installed application files live under `C:\Program Files\Market Signal Lab`; mutable research data continues to live under `%LOCALAPPDATA%\MarketSignalLab`; Envato credentials remain owned by the already-verified secure credential runtime in Windows Credential Manager. Installer/update/uninstall code never reads, writes, embeds, exports, migrates, or deletes the company token by default.

**Tech Stack:** Go 1.22+ / current verified Windows Go toolchain; Rust stable / Cargo; PowerShell 5.1-compatible build and verification scripts; Inno Setup 6 compiler (`ISCC.exe`) supplied externally through PATH or an explicit script argument; existing vanilla browser UI and browser companion; Windows Credential Manager behavior supplied by the preceding secure-credential runtime gate.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-18-msl-secure-credential-and-installation-design.md`.
- This plan MUST NOT be executed until `docs/superpowers/plans/2026-08-18-msl-secure-envato-credential-runtime-plan.md` is COMPLETE / VERIFIED.
- Baseline branch is `feature/analytics-v2-ipc`; do not write to `main`.
- Go remains application/control plane; Rust remains sole production analytics implementation for migrated kernels.
- Packaged Rust worker path remains relative to the application: `engines\rust\msl-analytics-rust.exe`.
- Browser companion install path must remain `<app>\browser-companion\`, matching the current `capture-helper-path` runtime contract.
- Production default dashboard remains `127.0.0.1:17771`; researcher does not manage it manually.
- Application binaries/assets belong under Program Files; mutable data, history, cache, exports, logs, and configuration must not be stored there.
- Existing mutable data root remains `%LOCALAPPDATA%\MarketSignalLab`.
- Installer never contains the Envato token, a universal secret, a decryption master key, or a machine-ID binding.
- Installer never writes `ENVATO_TOKEN` into process/user/system environment variables.
- Credential Manager remains authoritative for the stored Envato secret and is intentionally outside installer ownership.
- Upgrade must preserve LocalAppData and Credential Manager state.
- Default uninstall must preserve LocalAppData and Credential Manager state.
- Reinstall on the same Windows user must rediscover existing history and credential automatically.
- Cleanup of user data/credential is not part of default uninstallation. If a safe explicit cleanup UX cannot be implemented without secret-store ownership ambiguity, omit it from the installer and rely on MSL Settings for credential removal.
- Do not execute the old full `scripts/verify-alpha653-final.ps1` as this gate; it contains deferred parity/performance/release steps. Reuse only its proven packaging conventions.
- Do not commit generated EXE, Rust target artifacts, installer EXE, ZIP, or other large build outputs.
- No release-readiness or performance claim is implied by installer success; analytics IPC Tasks 8–12 remain separately scheduled.
- Each task follows RED -> minimal GREEN -> regression -> commit.

## Canonical File Structure

### Installer source and scripts
- `installer/MarketSignalLab.iss` — Inno Setup source; no secret material.
- `scripts/build-windows-installer.ps1` — deterministic build/staging/compiler orchestration.
- `scripts/verify-windows-installer.ps1` — install/upgrade/uninstall/reinstall/package-health gate.
- `scripts/tests/build-windows-installer.Tests.ps1` — lightweight static/script contract tests where practical without requiring an installed compiler.
- `scripts/tests/verify-windows-installer.Tests.ps1` — installer verification-script safety/static contract tests.

### Generated, untracked artifacts

```text
dist\windows-installer\
├── stage\
│   ├── Market Signal Lab.exe
│   ├── engines\
│   │   └── rust\
│   │       └── msl-analytics-rust.exe
│   ├── browser-companion\
│   └── version.json
├── output\
│   └── Market-Signal-Lab-Setup-<version>.exe
└── evidence\
    └── installer-verification.json
```

`dist/` remains generated output and must not be committed.

### Verification documentation
- `docs/qa/windows-installer-lifecycle-qa.md` — factual native Windows installer evidence after PASS.
- `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md` — update only after verification.
- `docs/checkpoints/CONTINUE_MSL.md` — update only after verification.

## Locked Installer Identity

Use one stable installer identity for all subsequent upgrades:

```text
AppId GUID: {3A8A0C2E-6F29-4D62-B6E7-3177732B55DD}
AppName: Market Signal Lab
Default install: {autopf}\Market Signal Lab
Start Menu group: Market Signal Lab
```

In Inno Setup source the GUID is escaped as:

```ini
AppId={{3A8A0C2E-6F29-4D62-B6E7-3177732B55DD}
```

Changing this AppId later is a migration decision because it would cause Windows to treat a build as a separate product rather than an upgrade.

---

### Task 1: Add Deterministic Windows Application Staging

**Files:**
- Create: `scripts/build-windows-installer.ps1`
- Create: `scripts/tests/build-windows-installer.Tests.ps1`
- Modify only if missing: `.gitignore`

**Script parameters:**

```powershell
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$GoExe = '',
    [string]$CargoExe = '',
    [string]$ISCCExe = '',
    [string]$DistRoot = '',
    [switch]$SkipInstallerCompile
)
```

Rules:
- Never hardcode a developer drive such as `F:\...`.
- Resolve explicit tool path first; otherwise use `Get-Command go`, `cargo`, and `ISCC.exe`.
- `-SkipInstallerCompile` permits application staging tests on Windows hosts without Inno Setup installed.
- Read source version factually by executing the current source command:

```powershell
$Version = (& $GoExe run .\cmd\market-signal-lab version).Trim()
```

- Read source SHA with `git rev-parse HEAD`.
- Build Rust first:

```powershell
& $CargoExe build --release --manifest-path .\engines\rust\Cargo.toml
```

- Build Windows GUI Go host using the established production convention:

```powershell
& $GoExe build -trimpath -ldflags '-s -w -H=windowsgui' `
    -o "$Stage\Market Signal Lab.exe" .\cmd\market-signal-lab
```

- Copy exact Rust worker to `stage\engines\rust\msl-analytics-rust.exe`.
- Copy source `companion\browser-extension\` to `stage\browser-companion\`, matching current runtime `capture-helper-path`.
- Generate `stage\version.json` containing only:

```json
{
  "app": "Market Signal Lab",
  "version": "<source version>",
  "sourceHead": "<git sha>",
  "builtAtUtc": "<RFC3339 UTC>",
  "appSha256": "<sha256>",
  "rustWorkerSha256": "<sha256>"
}
```

No environment variables or secret values are serialized into the manifest.

- [ ] Write PowerShell static tests first. Assert the script contains no hardcoded `F:\Chrome-Isolated`, stages `browser-companion`, stages `engines\rust\msl-analytics-rust.exe`, uses `-H=windowsgui`, uses source `version`, and has `SkipInstallerCompile`.
- [ ] Run the static tests with the available PowerShell test harness or direct assertions; verify RED before the build script exists.
- [ ] Implement staging functions: `Resolve-NativeTool`, `Run-Native`, `Get-SourceVersion`, `Build-RustWorker`, `Build-GoHost`, `Stage-BrowserCompanion`, `Write-VersionManifest`.
- [ ] On Windows run `powershell -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1 -SkipInstallerCompile`; verify stage tree exists exactly as specified.
- [ ] Verify `Get-FileHash` values equal the values in generated `version.json`.
- [ ] Run packaged executable `capture-helper-path`; expected path terminates in `\browser-companion` and that directory exists.
- [ ] Run `git status --short`; generated `dist` artifacts must not appear as tracked candidates.
- [ ] Run `git diff --check`.
- [ ] Commit: `build: add deterministic Windows application staging`.

---

### Task 2: Add Stable Inno Setup Installer Definition

**Files:**
- Create: `installer/MarketSignalLab.iss`
- Modify: `scripts/build-windows-installer.ps1`
- Modify: `scripts/tests/build-windows-installer.Tests.ps1`

**Compiler invocation:**

```powershell
& $ISCCExe `
  "/DStageDir=$Stage" `
  "/DOutputDir=$Output" `
  "/DAppVersion=$Version" `
  "/DSourceHead=$SourceHead" `
  .\installer\MarketSignalLab.iss
```

`MarketSignalLab.iss` must require those defines; it must not silently invent a version.

Minimum setup contract:

```ini
[Setup]
AppId={{3A8A0C2E-6F29-4D62-B6E7-3177732B55DD}
AppName=Market Signal Lab
AppVersion={#AppVersion}
DefaultDirName={autopf}\Market Signal Lab
DefaultGroupName=Market Signal Lab
OutputDir={#OutputDir}
OutputBaseFilename=Market-Signal-Lab-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\Market Signal Lab.exe
```

Files and shortcuts:

```ini
[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Icons]
Name: "{group}\Market Signal Lab"; Filename: "{app}\Market Signal Lab.exe"
Name: "{autodesktop}\Market Signal Lab"; Filename: "{app}\Market Signal Lab.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Market Signal Lab.exe"; Description: "Launch Market Signal Lab"; Flags: nowait postinstall skipifsilent
```

Forbidden installer behavior:
- no `[Registry]` or `[Code]` entry storing API token;
- no `ENVATO_TOKEN` environment mutation;
- no deletion of `%LOCALAPPDATA%\MarketSignalLab`;
- no Credential Manager read/write/delete;
- no broad recursive delete outside `{app}`.

- [ ] Extend static tests to assert stable AppId, Program Files destination, Start Menu shortcut, optional desktop task default-off, staged recursive copy, postinstall launch, and absence of credential/token/data deletion strings.
- [ ] Run tests; verify RED before `.iss` exists.
- [ ] Implement `MarketSignalLab.iss` and ISCC invocation.
- [ ] Run `build-windows-installer.ps1` with a real Inno Setup 6 compiler supplied via PATH or `-ISCCExe`; verify one setup EXE is generated.
- [ ] Confirm setup EXE filename contains the exact source version and no source secret.
- [ ] Run `git diff --check`.
- [ ] Commit: `build: add stable Market Signal Lab installer`.

---

### Task 3: Verify Clean Install Layout and Packaged Runtime Health

**Files:**
- Create: `scripts/verify-windows-installer.ps1`
- Create: `scripts/tests/verify-windows-installer.Tests.ps1`

**Verification-script parameters:**

```powershell
param(
    [Parameter(Mandatory=$true)][string]$InstallerPath,
    [string]$ExpectedVersion = '',
    [string]$InstallDir = "$env:ProgramFiles\Market Signal Lab",
    [int]$Port = 17771,
    [switch]$KeepInstalled
)
```

Clean-install gate:
1. Verify no MSL process owns the target port; fail with actionable PID/version instead of killing unrelated processes blindly.
2. Silent install for automated gate using Inno `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART`.
3. Assert files exist:
   - `{InstallDir}\Market Signal Lab.exe`
   - `{InstallDir}\engines\rust\msl-analytics-rust.exe`
   - `{InstallDir}\browser-companion\manifest.json`
   - `{InstallDir}\version.json`
4. Assert no `history`, `cache`, `exports`, `logs`, `connection.json`, `.env`, or token-like generated file exists under Program Files.
5. Launch installed EXE with default data behavior and `--no-open` only for the automated health portion.
6. Poll `http://127.0.0.1:17771/api/health` and `/api/system/analytics-engine`.
7. Require:

```text
applicationHost.status        = healthy
productionAnalytics.status    = healthy
productionAnalytics.engine    = rust-production
productionAnalytics.protocol  = msl-analytics/2
```

The known top-level diagnostics `protocol=msl-analytics/1` is not used as the runtime authority in this gate; its migration remains deferred Task 8.

- [ ] Write static verification-script tests first: installer path mandatory, exact runtime files checked, Rust authoritative health fields asserted, no unconditional `Stop-Process -Force` by product-name wildcard, and cleanup targets restricted to test-owned process IDs.
- [ ] Run tests; verify RED before verification script exists.
- [ ] Implement helpers: `Install-MSL`, `Assert-InstallLayout`, `Start-InstalledMSL`, `Wait-MSLHealth`, `Stop-OwnedProcess`.
- [ ] Run clean-install verification on Windows; verify installed Rust V2 health PASS.
- [ ] Launch installed MSL once without `--no-open`; verify browser opens at default `http://127.0.0.1:17771/` without PowerShell parameters from the researcher.
- [ ] Verify Start Menu shortcut works; if desktop task was not selected, no desktop shortcut is required.
- [ ] Run `git diff --check`.
- [ ] Commit: `test: verify Windows installer clean install`.

---

### Task 4: Gate Upgrade Preservation of History, Config Metadata, and Credential

**Files:**
- Modify: `scripts/verify-windows-installer.ps1`
- Modify: `scripts/tests/verify-windows-installer.Tests.ps1`

**Upgrade fixture:**
- Use one isolated Windows test user/profile or clearly named test-only data root where possible.
- Seed a pre-upgrade MSL data sentinel under `%LOCALAPPDATA%\MarketSignalLab\history\installer-upgrade-sentinel.json` only in a disposable test environment.
- Also seed/read a real MSL-compatible history fixture or copy of a known-good pre-feature data root.
- Use the verified secure credential runtime to create a test Credential Manager entry through MSL APIs, not by embedding a secret in installer scripts.
- Record only its non-secret fingerprint.

Upgrade test requires **two installer builds with the same AppId**. The test may use consecutive local source versions or a fixture first-build package plus current build; it must not fake an upgrade by manually replacing files.

Expected after installing build B over build A:
- install path remains one product installation, not side-by-side duplicate;
- application/worker hashes match build B;
- LocalAppData sentinel and real history remain unchanged/readable;
- Credential Manager fingerprint is unchanged;
- MSL starts without first-run credential prompt;
- authenticated connection status is available without token re-entry;
- Rust V2 health remains healthy.

- [ ] Add static/script tests proving upgrade checks stable AppId/product registration and checks LocalAppData/credential preservation rather than deleting/recreating them.
- [ ] Run tests; verify RED.
- [ ] Implement `Invoke-UpgradeGate` and test-owned fixture helpers.
- [ ] Run native upgrade gate on Windows.
- [ ] Query MSL connection status after upgrade and assert `configured=true` with the pre-upgrade fingerprint; do not print or query the raw token.
- [ ] Open existing history/Autopilot latest endpoint and prove previous data remains readable.
- [ ] Run one non-secret health check and `git diff --check`.
- [ ] Commit: `test: gate MSL installer upgrade preservation`.

---

### Task 5: Gate Default Uninstall and Reinstall Preservation

**Files:**
- Modify: `scripts/verify-windows-installer.ps1`
- Modify: `scripts/tests/verify-windows-installer.Tests.ps1`

Default uninstall contract:
- Uninstall removes Program Files application tree and product shortcuts/registration.
- It does **not** delete `%LOCALAPPDATA%\MarketSignalLab`.
- It does **not** delete `MarketSignalLab/Envato` from Credential Manager.
- Installer source must not implement secret cleanup.

Reinstall contract:
1. Install and configure disposable test credential/history.
2. Uninstall using product uninstaller.
3. Assert application directory is removed or contains no product files.
4. Assert LocalAppData sentinel/history still exists.
5. Reinstall same/current setup EXE.
6. Launch MSL.
7. Assert connection status remains configured with same fingerprint and first-run prompt is not required.
8. Assert previous history remains visible/readable.
9. Assert Rust V2 health remains healthy.

Researcher who intentionally wants credential removal uses MSL Settings **before** uninstall or after reinstall. This avoids teaching the installer to own secret deletion.

- [ ] Write uninstall/reinstall preservation assertions first; verify RED against incomplete script.
- [ ] Implement test-owned uninstall discovery and execution using the registered Inno uninstaller for the fixed AppId/product; do not delete Program Files manually as a substitute for the uninstall test.
- [ ] Run native uninstall -> reinstall gate and verify credential/history preservation.
- [ ] Confirm installer still contains no `CredDelete`, `Credential Manager`, `ENVATO_TOKEN`, or LocalAppData recursive-delete behavior.
- [ ] Commit: `test: gate MSL uninstall reinstall preservation`.

---

### Task 6: Add Installer Secret-Hygiene, Artifact Integrity, and Source-Tree Gates

**Files:**
- Modify: `scripts/build-windows-installer.ps1`
- Modify: `scripts/verify-windows-installer.ps1`
- Modify tests under `scripts/tests/`

Artifact hygiene gate:
- Compute SHA-256 for staged Go host, staged Rust worker, and final installer.
- Verify staged app/worker checksums still match `version.json`.
- Verify no generated file under `stage/` contains:
  - `ENVATO_TOKEN=` followed by a non-empty value;
  - the locally supplied real-token canary when a private test value is provided;
  - `.env` files;
  - Credential Manager exports/dumps.
- The private real-token scan command may output only numeric match count/path count; never matching lines or secret content.
- Scan repository tracked files for forbidden committed installer artifacts/extensions under `dist/` and any accidentally staged secret file.
- Run `git ls-files dist` and require no generated build artifacts.
- Run `git diff --check`.

Generated evidence JSON may include only:

```json
{
  "version": "...",
  "sourceHead": "...",
  "installerSha256": "...",
  "appSha256": "...",
  "rustWorkerSha256": "...",
  "installedPath": "C:\\Program Files\\Market Signal Lab",
  "rustProtocol": "msl-analytics/2",
  "credentialFingerprint": "A91F-27C4",
  "historyPreserved": true,
  "credentialPreserved": true
}
```

- [ ] Write tests that fail if build/verification scripts print a provided secret or include it in evidence fields.
- [ ] Implement bounded byte/text scanning that reports counts only for private canary checks.
- [ ] Run the package/installer secret scan with a generated fake canary; expected zero staged/repository hits.
- [ ] Run full source `go test ./... -count=1`, `go vet ./...`, installer script tests, and `git diff --check`.
- [ ] Commit: `test: harden Windows installer artifact hygiene`.

---

### Task 7: Final Real Researcher Lifecycle Validation and Evidence

**Files:**
- Create after PASS: `docs/qa/windows-installer-lifecycle-qa.md`
- Modify after PASS: `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
- Modify after PASS: `docs/checkpoints/CONTINUE_MSL.md`

Prerequisite evidence before this task starts:

```text
Secure Envato credential runtime = COMPLETE / VERIFIED
Real token entered once and restart/no-reentry credential gate = PASS
```

Final lifecycle test on Windows:

```text
1. Build installer from exact source head.
2. Install using normal interactive setup.
3. Launch from Start Menu, not PowerShell.
4. Existing secure Envato credential is discovered OR, on a fresh user, enter the shared company token once.
5. Run Quick Map Market Now with real Envato API; terminal success.
6. Close MSL completely.
7. Relaunch from Start Menu; no token re-entry; Quick scan succeeds again.
8. Install the next/current test installer over the same AppId installation; no token re-entry; existing history remains readable.
9. Default uninstall.
10. Reinstall from the same installer.
11. Launch from Start Menu; credential/history remain available; no token re-entry.
12. Run Quick Map Market Now again; real Envato success.
13. Confirm productionAnalytics = healthy / rust-production / msl-analytics/2.
```

Evidence must record facts only:
- exact source commit;
- installer/app/worker SHA-256;
- installer version;
- installed path;
- connection source and non-secret fingerprint only;
- pre/post upgrade history counts or run IDs;
- pre/post reinstall history counts or run IDs;
- real Quick run status/counts without raw API payload/secret;
- Rust V2 health result;
- test timestamps.

- [ ] Execute all automated clean-install, upgrade, uninstall/reinstall, artifact-hygiene, Go regression, and Rust packaged-health gates.
- [ ] Execute the final real researcher lifecycle manually where interactive token entry/Start Menu behavior is required.
- [ ] Confirm no real token appears in tracked files, staging files, LocalAppData data files, QA evidence, or checkpoint text.
- [ ] Write `docs/qa/windows-installer-lifecycle-qa.md` only from actual observed PASS evidence.
- [ ] Update `CURRENT_MSL_CHECKPOINT.md` and `CONTINUE_MSL.md` to mark secure credential + Windows distribution lifecycle accepted.
- [ ] State clearly that deferred analytics IPC Tasks 8–12 remain deferred unless separately resumed; installer verification does not silently complete them.
- [ ] Set next product-development action to the dedicated **Phase C Rust Ranking & Signal Expansion design/spec**, not immediate formula coding.
- [ ] Run final `go test ./... -count=1`, `go vet ./...`, `git diff --check`, and repository status review.
- [ ] Commit: `docs: verify MSL Windows installer lifecycle`.

## Completion Gate

This plan is COMPLETE / VERIFIED only when all are true:

```text
[ ] one installer installs the same MSL build on any supported researcher Windows PC
[ ] application files install under Program Files in the locked layout
[ ] mutable research data remains under LocalAppData
[ ] browser companion is present at the runtime-expected browser-companion path
[ ] packaged Rust worker is healthy on msl-analytics/2
[ ] normal researcher launch works from Start Menu without PowerShell
[ ] installer contains no company token, universal decryption key, or machine-ID binding
[ ] clean install works
[ ] in-place upgrade preserves history and secure credential
[ ] default uninstall preserves history and secure credential
[ ] reinstall rediscovers history and secure credential without token re-entry
[ ] real Envato Quick scan works after restart, upgrade, and reinstall without repeated token entry
[ ] application/worker/installer SHA-256 evidence is recorded
[ ] generated artifacts remain untracked
[ ] full Go/vet/diff/script gates pass
[ ] QA/checkpoint evidence contains no secret material
```

After this gate passes, MSL has a verified secure-distribution baseline suitable for company researchers. Only then return to the Phase C Rust Ranking & Signal Expansion design cycle.
