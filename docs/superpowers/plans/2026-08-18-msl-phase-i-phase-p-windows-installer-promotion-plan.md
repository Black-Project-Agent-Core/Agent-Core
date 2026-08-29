# MSL Phase I — Phase-P Windows Installer Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the fully verified Phase P runtime into one auditable Windows-installed baseline that preserves researcher history and the existing secure Envato credential across upgrade, default uninstall, reinstall, and normal application restart.

**Architecture:** Phase I starts from the Phase P branch and transplants only the six bounded installer files from historical Draft PR #14; it never broad-merges the historical installer branch. Clean-install smoke stays separate from the full lifecycle verifier, while shared Windows install/runtime helpers live in one focused helper script. Native Windows lifecycle evidence is authoritative; hosted CI is supplementary.

**Tech Stack:** Go 1.26.4; Rust 1.97.1 / Cargo; PowerShell 5.1-compatible scripts; Inno Setup 6; GitHub; Windows Credential Manager; MSL HTTP APIs on `127.0.0.1`.

**Spec:** `docs/superpowers/specs/2026-08-18-msl-phase-i-phase-p-windows-installer-promotion-design.md`

## Global Constraints

- Working branch: `feature/phase-p-windows-installer-promotion-20260818`.
- Parent branch: `feature/market-mapping-performance-phase-p-20260818`.
- Historical installer source commit: `c20cc55fb243c63b405e27a819c54a3fa5dcb860`.
- Do not merge the historical installer branch wholesale.
- Eligible historical transplant is limited to the six files changed by Draft PR #14.
- Stable installer AppId remains `{3A8A0C2E-6F29-4D62-B6E7-3177732B55DD}`.
- Installed application files belong under `{autopf}\Market Signal Lab`.
- Mutable researcher data remains under `%LOCALAPPDATA%\MarketSignalLab`.
- Windows Credential Manager remains authoritative for the Envato credential.
- Installer/lifecycle scripts never read, print, export, migrate, duplicate, or delete the raw Envato token.
- Production analytics remains `rust-production / msl-analytics/2`.
- No production Go analytics fallback is introduced.
- No market formula, ranking semantic, threshold, confidence rule, signal name, or Phase C behavior is changed.
- Phase C remains frozen for the whole plan.
- No GPU work.
- No generated EXE, installer, `engines/rust/target/`, local history, credential dump, or browser session is committed.
- PR #15 remains Draft; `main` remains untouched.
- Each implementation task follows RED → minimal GREEN → regression → commit.

## File Structure

### Reused / transplanted installer layer

- `.github/workflows/windows-installer-candidate.yml` — supplementary hosted Windows candidate workflow; Phase I branch/base triggers only.
- `installer/MarketSignalLab.iss` — stable Inno Setup product definition; no credential ownership.
- `scripts/build-windows-installer.ps1` — deterministic stage/build/provenance pipeline.
- `scripts/verify-windows-installer.ps1` — clean-install package/runtime smoke only.
- `scripts/tests/build-windows-installer.Tests.ps1` — static build/installer safety contracts.
- `scripts/tests/verify-windows-installer.Tests.ps1` — static clean-smoke safety contracts.

### New Phase I lifecycle layer

- `scripts/windows-installer-test-helpers.ps1` — shared install/uninstall/process/HTTP/manifest helpers; no top-level execution.
- `scripts/verify-windows-installer-lifecycle.ps1` — upgrade → installed Quick → uninstall preservation → reinstall → restart acceptance orchestration.
- `scripts/tests/verify-windows-installer-lifecycle.Tests.ps1` — static lifecycle safety/contract tests.

### Evidence / handoff

- `docs/qa/windows-installer-lifecycle-qa.md` — factual native lifecycle evidence only after execution.
- `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md` — update only after native lifecycle verification.
- `docs/checkpoints/CONTINUE_MSL.md` — update only after native lifecycle verification.

---

### Task 1: Transplant Test Contracts First and Lock Phase I Topology

**Files:**
- Create from PR #14: `scripts/tests/build-windows-installer.Tests.ps1`
- Create from PR #14: `scripts/tests/verify-windows-installer.Tests.ps1`
- Create: `scripts/tests/verify-windows-installer-lifecycle.Tests.ps1`

**Interfaces:**
- Consumes: approved Phase I spec and historical PR #14 patches.
- Produces: three static contract suites that define the installer/lifecycle safety boundary before implementation files exist.

- [ ] **Step 1: Create the historical build/clean-smoke static tests from PR #14 and extend build tests with Phase I topology assertions**

Add:

```powershell
$Workflow = Join-Path $RepoRoot '.github\workflows\windows-installer-candidate.yml'
if (-not (Test-Path $Workflow)) { throw 'RED: Phase I workflow is missing' }
$workflowText = Get-Content -Raw -LiteralPath $Workflow
Assert-Contains $workflowText 'feature/phase-p-windows-installer-promotion-20260818' 'workflow must trigger on the Phase I branch'
Assert-Contains $workflowText 'feature/market-mapping-performance-phase-p-20260818' 'workflow PR target must be Phase P'
Assert-NotContains $workflowText 'feature/windows-installer-lifecycle-20260818' 'historical installer branch must not remain canonical'
```

- [ ] **Step 2: Create lifecycle RED contract test**

```powershell
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Lifecycle = Join-Path $RepoRoot 'scripts\verify-windows-installer-lifecycle.ps1'
$Helpers = Join-Path $RepoRoot 'scripts\windows-installer-test-helpers.ps1'
if (-not (Test-Path $Lifecycle)) { throw 'RED: lifecycle verifier is missing' }
if (-not (Test-Path $Helpers)) { throw 'RED: shared Windows installer helpers are missing' }
$lifecycleText = Get-Content -Raw -LiteralPath $Lifecycle
$helperText = Get-Content -Raw -LiteralPath $Helpers
if ($lifecycleText -notmatch 'PreviousInstallerPath') { throw 'previous installer path must be explicit' }
if ($lifecycleText -notmatch 'CurrentInstallerPath') { throw 'current installer path must be explicit' }
if ($lifecycleText -notmatch '/api/connections/envato') { throw 'lifecycle must snapshot non-secret connection status' }
if ($lifecycleText -notmatch '/api/autopilot/run') { throw 'lifecycle must start a real installed Quick run' }
if ($lifecycleText -notmatch '/api/autopilot/live') { throw 'lifecycle must poll the installed Quick run' }
if ($lifecycleText -notmatch 'credentialFingerprint') { throw 'lifecycle must compare the non-secret fingerprint' }
if ($lifecycleText -notmatch 'Get-HistoryManifest') { throw 'lifecycle must compare history preservation' }
if ($lifecycleText -match 'CredDelete|cmdkey\s+/delete') { throw 'lifecycle must never delete Credential Manager entries' }
if ($lifecycleText -match 'Authorization|Bearer\s+') { throw 'lifecycle must never handle raw auth headers' }
if ($helperText -match 'Get-Process.+Market Signal Lab.+Stop-Process') { throw 'broad product-name process killing is forbidden' }
Write-Host 'PASS: Phase I lifecycle static contracts'
```

- [ ] **Step 3: Run the tests and verify RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\build-windows-installer.Tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer.Tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer-lifecycle.Tests.ps1
```

Expected: FAIL because implementation files are absent.

- [ ] **Step 4: Commit RED contracts**

```bash
git add scripts/tests
git commit -m "test: lock Phase I installer lifecycle contracts"
```

---

### Task 2: Transplant Deterministic Build + Inno Setup and Adapt Workflow Topology

**Files:**
- Create from PR #14: `scripts/build-windows-installer.ps1`
- Create from PR #14: `installer/MarketSignalLab.iss`
- Create from PR #14 then adapt: `.github/workflows/windows-installer-candidate.yml`
- Test: `scripts/tests/build-windows-installer.Tests.ps1`

**Interfaces:**
- Consumes: Task 1 static contracts.
- Produces: deterministic stage, installer EXE, `version.json`, and non-secret `installer-build.json`.

- [ ] **Step 1: Transplant build script and `.iss` from PR #14 without merging its branch**

Preserve:

```powershell
& $CargoExe build --release --manifest-path .\engines\rust\Cargo.toml
& $GoExe build -trimpath -ldflags '-s -w -H=windowsgui' -o $AppStage .\cmd\market-signal-lab
```

Staged paths:

```text
Market Signal Lab.exe
engines\rust\msl-analytics-rust.exe
browser-companion\...
version.json
```

- [ ] **Step 2: Preserve provenance generation with runtime values, not hard-coded identity**

The implementation constructs:

```powershell
$manifest = [ordered]@{
    app = 'Market Signal Lab'
    version = $Version
    sourceHead = $SourceHead
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    appSha256 = $appHash
    rustWorkerSha256 = $rustHash
}
```

No environment variables or credential values are serialized.

- [ ] **Step 3: Adapt workflow topology**

```yaml
on:
  push:
    branches:
      - feature/phase-p-windows-installer-promotion-20260818
  pull_request:
    branches:
      - feature/market-mapping-performance-phase-p-20260818
  workflow_dispatch:
```

- [ ] **Step 4: Run build static test and verify GREEN**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\build-windows-installer.Tests.ps1
```

Expected: `PASS: Windows installer build contracts`.

- [ ] **Step 5: Run repository regression**

```bash
go test ./... -count=1
go build ./internal/app ./cmd/market-signal-lab
cargo test --manifest-path engines/rust/Cargo.toml
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/windows-installer-candidate.yml installer/MarketSignalLab.iss scripts/build-windows-installer.ps1 scripts/tests/build-windows-installer.Tests.ps1
git commit -m "build: transplant installer layer onto Phase P"
```

---

### Task 3: Extract Shared Windows Test Helpers and Restore Clean-Install Smoke

**Files:**
- Create: `scripts/windows-installer-test-helpers.ps1`
- Create/adapt from PR #14: `scripts/verify-windows-installer.ps1`
- Modify: `scripts/tests/verify-windows-installer.Tests.ps1`

**Interfaces:**
- `Assert-NoPortOwner([int]$Port)`
- `Install-MSL([string]$Installer,[string]$InstallDir)`
- `Get-InstalledVersionManifest([string]$InstallDir)`
- `Assert-InstallLayout([string]$InstallDir,[string]$ExpectedVersion)`
- `Start-InstalledMSL([string]$InstallDir,[int]$Port)` returning `System.Diagnostics.Process`
- `Wait-MSLHealth([int]$Port,[int]$Attempts=80)` returning health + analytics diagnostics
- `Stop-OwnedProcess([System.Diagnostics.Process]$Process)`
- `Uninstall-MSL([string]$InstallDir)`

- [ ] **Step 1: Extend static test before implementation**

```powershell
Assert-Contains $verify 'windows-installer-test-helpers\.ps1' 'clean verifier must use shared helpers'
Assert-NotContains $verify 'Get-Process\s+[^\r\n]*Market Signal Lab[^\r\n]*Stop-Process' 'broad process-name cleanup is forbidden'
```

- [ ] **Step 2: Run clean static test and verify RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer.Tests.ps1
```

- [ ] **Step 3: Implement helper file using proven PR #14 behavior**

The helper file contains function definitions only and performs no top-level install/start/stop/uninstall action when dot-sourced.

- [ ] **Step 4: Implement clean smoke as small orchestrator**

```powershell
. (Join-Path $PSScriptRoot 'windows-installer-test-helpers.ps1')
Assert-NoPortOwner -Port $Port
try {
    Install-MSL -Installer $InstallerPath -InstallDir $InstallDir
    $manifest = Assert-InstallLayout -InstallDir $InstallDir -ExpectedVersion $ExpectedVersion
    $ownedProcess = Start-InstalledMSL -InstallDir $InstallDir -Port $Port
    $result = Wait-MSLHealth -Port $Port
    if ($result.diagnostics.productionAnalytics.engine -ne 'rust-production') { throw 'unexpected analytics engine' }
    if ($result.diagnostics.productionAnalytics.protocol -ne 'msl-analytics/2') { throw 'unexpected analytics protocol' }
}
finally {
    Stop-OwnedProcess -Process $ownedProcess
    if (-not $KeepInstalled) { Uninstall-MSL -InstallDir $InstallDir }
}
```

- [ ] **Step 5: Verify GREEN**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer.Tests.ps1
```

- [ ] **Step 6: Commit**

```bash
git add scripts/windows-installer-test-helpers.ps1 scripts/verify-windows-installer.ps1 scripts/tests/verify-windows-installer.Tests.ps1
git commit -m "test: restore clean installer smoke on shared helpers"
```

---

### Task 4: Add Non-Secret Lifecycle Snapshot Primitives

**Files:**
- Modify: `scripts/windows-installer-test-helpers.ps1`
- Modify: `scripts/tests/verify-windows-installer-lifecycle.Tests.ps1`

**Interfaces:**
- `Invoke-MSLJson([int]$Port,[string]$Method,[string]$Path,[object]$Body=$null)`
- `Get-ConnectionSnapshot([int]$Port)` returns `{configured,status,credentialFingerprint}` only
- `Get-HistoryManifest([string]$DataRoot)` returns sorted `{path,length,sha256}` rows under `history`
- `Compare-HistoryManifest($Before,$After,[string]$Label)` throws on unexpected change
- `Get-LatestAutopilotSnapshot([int]$Port)` reads `/api/autopilot/latest`

- [ ] **Step 1: Extend lifecycle tests before implementation**

```powershell
if ($helperText -notmatch 'Get-ConnectionSnapshot') { throw 'missing connection snapshot helper' }
if ($helperText -notmatch 'credentialFingerprint') { throw 'fingerprint comparison is required' }
if ($helperText -match '\.token|\["token"\]|Authorization|Bearer') { throw 'helper must never process raw credential material' }
if ($helperText -notmatch 'Get-HistoryManifest') { throw 'history manifest helper is required' }
if ($helperText -notmatch 'Get-FileHash') { throw 'history preservation must be hash-verifiable' }
```

- [ ] **Step 2: Verify RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer-lifecycle.Tests.ps1
```

- [ ] **Step 3: Implement safe connection snapshot using current runtime API**

```powershell
function Get-ConnectionSnapshot {
    param([int]$Port)
    $payload = Invoke-MSLJson -Port $Port -Method 'GET' -Path '/api/connections/envato'
    return [ordered]@{
        configured = [bool]$payload.configured
        status = [string]$payload.status
        credentialFingerprint = [string]$payload.credentialFingerprint
    }
}
```

- [ ] **Step 4: Implement read-only history hashing**

```powershell
function Get-HistoryManifest {
    param([string]$DataRoot)
    $historyRoot = Join-Path $DataRoot 'history'
    if (-not (Test-Path -LiteralPath $historyRoot)) { return @() }
    return @(Get-ChildItem -LiteralPath $historyRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
        [ordered]@{
            path = $_.FullName.Substring($historyRoot.Length).TrimStart('\\')
            length = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
}
```

- [ ] **Step 5: Verify GREEN**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer-lifecycle.Tests.ps1
```

- [ ] **Step 6: Commit**

```bash
git add scripts/windows-installer-test-helpers.ps1 scripts/tests/verify-windows-installer-lifecycle.Tests.ps1
git commit -m "test: add non-secret installer lifecycle snapshots"
```

---

### Task 5: Implement Upgrade → Installed Quick → Uninstall → Reinstall Lifecycle Orchestrator

**Files:**
- Create: `scripts/verify-windows-installer-lifecycle.ps1`
- Modify: `scripts/tests/verify-windows-installer-lifecycle.Tests.ps1`

**Interfaces:**

```powershell
param(
    [Parameter(Mandatory=$true)][string]$PreviousInstallerPath,
    [Parameter(Mandatory=$true)][string]$CurrentInstallerPath,
    [string]$InstallDir = "$env:ProgramFiles\Market Signal Lab",
    [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'MarketSignalLab'),
    [int]$Port = 17771,
    [int]$QuickTimeoutSec = 1800,
    [string]$EvidencePath = ''
)
```

Evidence may contain only source heads/hashes, connection configured/status/fingerprint, history manifest counts/hashes, Quick run ID/status/progress/request counts/warnings/errors, and lifecycle outcomes.

- [ ] **Step 1: Extend RED tests**

Require:

```text
Invoke-UpgradeGate
Invoke-InstalledQuickGate
Invoke-UninstallPreservationGate
Invoke-ReinstallGate
Invoke-RestartGate
QuickTimeoutSec
PreviousInstallerPath
CurrentInstallerPath
EvidencePath
```

- [ ] **Step 2: Verify RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer-lifecycle.Tests.ps1
```

- [ ] **Step 3: Implement pre-upgrade baseline**

Install `PreviousInstallerPath`, start the installed app, wait healthy, read `/api/connections/envato`, capture `{configured,status,credentialFingerprint}`, hash `DataRoot\history`, capture `/api/autopilot/latest` when available, then stop only the owned process.

Require `configured=true`; if not configured, fail without provisioning a token inside the verifier.

- [ ] **Step 4: Implement actual installer-over-installer upgrade**

Install `CurrentInstallerPath` to the same `InstallDir`. Before any new Quick run, require:

```text
current version.json sourceHead is installed
Go/Rust hashes match version.json
configured state unchanged
credentialFingerprint unchanged
history manifest exactly unchanged
rust-production / msl-analytics/2 healthy
```

- [ ] **Step 5: Implement real installed Quick**

POST exactly:

```json
{"mode":"quick"}
```

to `/api/autopilot/run`, read `runId`, and poll `/api/autopilot/live?runId=` plus the URL-encoded run ID until terminal or `QuickTimeoutSec`.

Script recognizes `completed`, `partial`, `failed`, and `cancelled`; Phase I automated acceptance requires `completed`. Record only:

```text
runId
status
progress
plannedWorkUnits
completedWorkUnits
productsDiscovered
requestsCompleted
warningCount
errorCount
elapsedMs
```

Capture `postQuickHistory` after completion.

- [ ] **Step 6: Implement default uninstall preservation**

Stop owned process, execute installed `unins000.exe` silently, require app binary removal, and require `DataRoot\history` manifest to equal `postQuickHistory`. Do not access Credential Manager directly.

- [ ] **Step 7: Implement reinstall**

Install `CurrentInstallerPath` again, start app, and require:

```text
configured=true
credentialFingerprint equals pre-upgrade fingerprint
history manifest equals postQuickHistory
/api/autopilot/latest exposes prior history
rust-production / msl-analytics/2 healthy
```

- [ ] **Step 8: Implement application restart**

Stop owned process, start installed EXE again, wait healthy, and re-check fingerprint/history. No developer-only environment override is allowed.

- [ ] **Step 9: Write non-secret evidence atomically after automated stages pass**

```powershell
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'dist\windows-installer\evidence\installer-lifecycle.json'
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidencePath) | Out-Null
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
```

- [ ] **Step 10: Verify GREEN**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer-lifecycle.Tests.ps1
```

- [ ] **Step 11: Commit**

```bash
git add scripts/verify-windows-installer-lifecycle.ps1 scripts/tests/verify-windows-installer-lifecycle.Tests.ps1
git commit -m "test: add Phase I Windows lifecycle acceptance"
```

---

### Task 6: Repository Regression, Draft Phase I PR, and Historical PR Cleanup

**Files:**
- GitHub metadata only after Tasks 1–5.

**Interfaces:**
- Produces one Draft Phase I PR targeting Phase P.

- [ ] **Step 1: Compare Phase I branch to Phase P**

Expected implementation scope before QA docs:

```text
.github/workflows/windows-installer-candidate.yml
installer/MarketSignalLab.iss
scripts/build-windows-installer.ps1
scripts/windows-installer-test-helpers.ps1
scripts/verify-windows-installer.ps1
scripts/verify-windows-installer-lifecycle.ps1
scripts/tests/build-windows-installer.Tests.ps1
scripts/tests/verify-windows-installer.Tests.ps1
scripts/tests/verify-windows-installer-lifecycle.Tests.ps1
docs/superpowers/specs/2026-08-18-msl-phase-i-phase-p-windows-installer-promotion-design.md
docs/superpowers/plans/2026-08-18-msl-phase-i-phase-p-windows-installer-promotion-plan.md
```

No market/runtime production Go/Rust files are changed unless a concrete native packaging defect later proves a narrowly required TDD fix.

- [ ] **Step 2: Run full repository regression**

```bash
go test ./... -count=1
go build ./internal/app ./cmd/market-signal-lab
cargo test --manifest-path engines/rust/Cargo.toml
git status --short
```

Expected: PASS and clean tree after commits.

- [ ] **Step 3: Create Draft PR**

```text
head = feature/phase-p-windows-installer-promotion-20260818
base = feature/market-mapping-performance-phase-p-20260818
draft = true
```

Body states native Windows package/lifecycle verification is pending and no release/main merge is authorized.

- [ ] **Step 4: Verify Draft PR contains the historical six installer capabilities plus new lifecycle layer**

Inspect changed filenames and patches.

- [ ] **Step 5: Close PR #13 as superseded / wrong direct-to-main topology**

Do not merge it.

- [ ] **Step 6: Close Draft PR #14 as superseded by Phase I**

Do not delete its branch or history.

- [ ] **Step 7: Confirm PR #15 remains Draft and Phase C remains frozen**

---

### Task 7: Native Windows Preflight and Reproducible Previous-Candidate Build

**Files:**
- Generated only under temporary worktree/dist locations.

**Interfaces:**
- Produces two installer paths: historical candidate at commit `c20cc55...` and current Phase I candidate.

- [ ] **Step 1: Resolve native tools factually**

```powershell
$go = (Get-Command go.exe -ErrorAction Stop).Source
$cargo = (Get-Command cargo.exe -ErrorAction Stop).Source
$git = (Get-Command git.exe -ErrorAction Stop).Source
$iscc = @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 ISCC.exe is required for Phase I native packaging' }
```

- [ ] **Step 2: Verify current Phase I worktree identity**

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
```

- [ ] **Step 3: Run native static contracts**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\build-windows-installer.Tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer.Tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\verify-windows-installer-lifecycle.Tests.ps1
```

- [ ] **Step 4: Run native repository regression before packaging**

```powershell
go test ./... -count=1
go build ./internal/app ./cmd/market-signal-lab
cargo test --manifest-path .\engines\rust\Cargo.toml
```

- [ ] **Step 5: Build historical candidate reproducibly in a detached temporary worktree**

From the main repository:

```powershell
git fetch origin feature/windows-installer-lifecycle-20260818
$previousWorktree = Join-Path $env:TEMP 'MSL-PhaseI-PreviousInstaller'
if (Test-Path -LiteralPath $previousWorktree) { throw "Remove or choose another test-only worktree path first: $previousWorktree" }
git worktree add --detach $previousWorktree c20cc55fb243c63b405e27a819c54a3fa5dcb860
Push-Location $previousWorktree
try {
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1 -GoExe $go -CargoExe $cargo -ISCCExe $iscc
    $previousInstaller = (Get-ChildItem .\dist\windows-installer\output\Market-Signal-Lab-Setup-*.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
    if (-not $previousInstaller) { throw 'Historical installer was not produced' }
} finally {
    Pop-Location
}
```

Keep this detached worktree until native lifecycle acceptance finishes so the previous installer remains available.

- [ ] **Step 6: Stop immediately on any preflight failure**

Use systematic-debugging before continuing; do not downgrade actual failures to warnings.

---

### Task 8: Native Windows Build + Complete Installed Lifecycle Acceptance

**Files:**
- Generated only: `dist/windows-installer/**`.
- After PASS create/update: `docs/qa/windows-installer-lifecycle-qa.md`.
- After PASS modify: `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md` and `docs/checkpoints/CONTINUE_MSL.md`.

**Interfaces:**
- Consumes: `$previousInstaller` from Task 7 and current Phase I source.
- Produces: factual installed lifecycle evidence.

- [ ] **Step 1: Build current Phase I installer**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1 -GoExe $go -CargoExe $cargo -ISCCExe $iscc
$currentInstaller = (Get-ChildItem .\dist\windows-installer\output\Market-Signal-Lab-Setup-*.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
if (-not $currentInstaller) { throw 'Current Phase I installer was not produced' }
$currentManifest = Get-Content -Raw -LiteralPath .\dist\windows-installer\stage\version.json | ConvertFrom-Json
```

- [ ] **Step 2: Run clean-install smoke on isolated port**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-windows-installer.ps1 -InstallerPath $currentInstaller -ExpectedVersion $currentManifest.version -Port 17775
```

Require healthy Go host and `rust-production / msl-analytics/2`.

- [ ] **Step 3: Run real-user lifecycle verifier**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-windows-installer-lifecycle.ps1 -PreviousInstallerPath $previousInstaller -CurrentInstallerPath $currentInstaller -Port 17771
```

Before running, verify ownership of port 17771; the verifier must never kill an unrelated process automatically.

- [ ] **Step 4: Verify Start Menu launch through Desktop Commander/manual Windows shell**

The installed Start Menu shortcut must launch MSL without developer PowerShell arguments and expose the normal dashboard.

- [ ] **Step 5: Verify one additional normal application stop/restart**

Require:

```text
configured=true
same credentialFingerprint
history visible
rust-production / msl-analytics/2 healthy
```

- [ ] **Step 6: Inspect evidence for secret safety**

Search generated evidence files for `Authorization`, `Bearer `, `cookie`, and secret-bearing token fields. A descriptive occurrence of the word `token` is not accepted blindly; review it before closeout.

- [ ] **Step 7: Write factual QA only after all lifecycle gates pass**

Record:

```text
Phase I source head
installer SHA256
Go host SHA256
Rust worker SHA256
installed sourceHead
clean-install result
pre/post-upgrade credential fingerprint
pre/post-upgrade history manifest result
installed Quick run ID/status/elapsed/warnings/errors
uninstall preservation result
reinstall preservation result
restart/Start Menu result
remaining release-only blockers
```

- [ ] **Step 8: Update checkpoint and handoff only after QA exists**

State `COMPLETE / NATIVE WINDOWS LIFECYCLE VERIFIED` only if every spec completion criterion passed. Otherwise record the exact blocking stage and keep Phase I active.

- [ ] **Step 9: Final verification after any native fix**

If production source changed during native debugging, rerun:

```text
go test ./... -count=1
go build ./internal/app ./cmd/market-signal-lab
cargo test --manifest-path engines/rust/Cargo.toml
```

If only documentation changed after the tested head, use commit comparison to prove docs-only closeout.

- [ ] **Step 10: Commit closeout docs and update Phase I Draft PR**

```bash
git add docs/qa/windows-installer-lifecycle-qa.md docs/checkpoints/CURRENT_MSL_CHECKPOINT.md docs/checkpoints/CONTINUE_MSL.md
git commit -m "docs: record Phase I native installer lifecycle verification"
```

Keep Phase I PR Draft until the next integration decision. Do not merge to `main` and do not resume Phase C implicitly.

---

## Plan Completion Gate

The plan is implemented only when the full chain is evidenced:

```text
Phase P runtime base
→ bounded installer transplant
→ static safety contracts
→ full Go/build/Rust regression
→ reproducible historical installer build
→ current Windows package build
→ clean install
→ real installer-over-installer upgrade
→ installed Quick using saved credential
→ default uninstall preservation
→ reinstall rediscovery
→ normal restart + Start Menu acceptance
→ factual QA/checkpoint/handoff
```

A successful installer compile or clean-install smoke alone is not Phase I completion.
