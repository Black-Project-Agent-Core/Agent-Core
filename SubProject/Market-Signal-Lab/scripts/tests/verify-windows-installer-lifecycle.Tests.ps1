$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Lifecycle = Join-Path $RepoRoot 'scripts\verify-windows-installer-lifecycle.ps1'
$Helpers = Join-Path $RepoRoot 'scripts\windows-installer-test-helpers.ps1'

if (-not (Test-Path $Helpers)) { throw 'RED: shared Windows installer helpers are missing' }
$helperText = Get-Content -Raw -LiteralPath $Helpers

# Task 4 contract: only non-secret lifecycle snapshots are allowed.
if ($helperText -notmatch 'function\s+Invoke-MSLJson') { throw 'missing Invoke-MSLJson helper' }
if ($helperText -notmatch 'function\s+Get-ConnectionSnapshot') { throw 'missing connection snapshot helper' }
if ($helperText -notmatch '/api/connections/envato') { throw 'connection snapshot must use the safe Envato status endpoint' }
if ($helperText -notmatch 'credentialFingerprint') { throw 'fingerprint comparison is required' }
if ($helperText -match '\.token|\["token"\]|Authorization|Bearer\s+') { throw 'helper must never process raw credential material' }
if ($helperText -notmatch 'function\s+Get-HistoryManifest') { throw 'history manifest helper is required' }
if ($helperText -notmatch 'function\s+Compare-HistoryManifest') { throw 'history manifest comparison helper is required' }
if ($helperText -notmatch 'Get-FileHash') { throw 'history preservation must be hash-verifiable' }
if ($helperText -notmatch 'function\s+Get-LatestAutopilotSnapshot') { throw 'latest Autopilot snapshot helper is required' }
if ($helperText -notmatch '/api/autopilot/latest') { throw 'latest Autopilot helper must use the factual API' }
if ($helperText -match 'Get-Process.+Market Signal Lab.+Stop-Process') { throw 'broad product-name process killing is forbidden' }

# Task 5 contract: full installed lifecycle acceptance.
if (-not (Test-Path $Lifecycle)) { throw 'RED: lifecycle verifier is missing' }
$lifecycleText = Get-Content -Raw -LiteralPath $Lifecycle

foreach ($required in @(
    'PreviousInstallerPath',
    'CurrentInstallerPath',
    'QuickTimeoutSec',
    'EvidencePath',
    'Invoke-UpgradeGate',
    'Invoke-InstalledQuickGate',
    'Invoke-UninstallPreservationGate',
    'Invoke-ReinstallGate',
    'Invoke-RestartGate',
    'Get-ConnectionSnapshot',
    'credentialFingerprint',
    'Get-HistoryManifest',
    'Compare-HistoryManifest',
    'Get-LatestAutopilotSnapshot',
    '/api/autopilot/run',
    '/api/autopilot/live',
    'EscapeDataString',
    'progressPercent',
    'plannedWorkUnits',
    'completedWorkUnits',
    'productsDiscovered',
    'requestsCompleted',
    'warningCount',
    'errorCount',
    'elapsedMs',
    'completed',
    'partial',
    'failed',
    'cancelled',
    'Uninstall-MSL',
    'Move-Item'
)) {
    if ($lifecycleText -notmatch [regex]::Escape($required)) { throw "lifecycle contract missing: $required" }
}

if ($lifecycleText -notmatch "mode\s*=\s*'quick'") { throw 'lifecycle must start Quick mode explicitly' }
if ($lifecycleText -notmatch 'configured') { throw 'lifecycle must verify configured credential state' }
if ($lifecycleText -notmatch 'Uninstall-MSL[\s\S]{0,500}Wait-PathRemoved\s+-Path\s+\$InstallDir') { throw 'lifecycle uninstall must bounded-poll install directory removal' }
if ($lifecycleText -notmatch 'rust-production') { throw 'lifecycle must retain Rust production runtime health checks' }
if ($lifecycleText -notmatch 'msl-analytics/2') { throw 'lifecycle must retain analytics v2 protocol checks' }
if ($lifecycleText -match 'CredDelete|CredWrite|cmdkey\s+/delete|ENVATO_TOKEN|Authorization|Bearer\s+|\.token|\["token"\]') { throw 'lifecycle must never handle raw credential material or credential-store mutation' }
if ($lifecycleText -match 'Remove-Item[^\r\n]*LOCALAPPDATA[^\r\n]*MarketSignalLab[^\r\n]*-Recurse') { throw 'lifecycle must never delete researcher data' }
if ($lifecycleText -match 'Get-Process\s+[^\r\n]*Market Signal Lab[^\r\n]*\|[^\r\n]*Stop-Process') { throw 'lifecycle must never kill by broad product name' }

if ($helperText -notmatch 'function\s+Wait-PortReleased') { throw 'shared helpers must expose bounded Wait-PortReleased' }
if ($helperText -notmatch 'function\s+Wait-PortReleased[\s\S]{0,600}for\s*\(\s*\$i\s*=\s*0;\s*\$i\s*-lt\s*\$Attempts') { throw 'Wait-PortReleased polling must be bounded by attempts' }
if ($helperText -notmatch 'function\s+Complete-OwnedProcessCleanup') { throw 'shared helpers must expose owned-process cleanup that preserves the primary failure' }
if ($helperText -notmatch 'function\s+Complete-OwnedProcessCleanup[\s\S]{0,800}Stop-OwnedProcess\s+-Process\s+\$Process\r?\n\s*Wait-PortReleased\s+-Port\s+\$Port') { throw 'owned-process cleanup must stop the owned process then bounded-poll port release' }
if ($helperText -notmatch 'function\s+Complete-OwnedProcessCleanup[\s\S]{0,900}if\s*\(\s*\$null\s+-eq\s+\$PrimaryFailure\s*\)\s*\{\s*throw\s*\}') { throw 'owned-process cleanup must rethrow cleanup-only failures so cleanup stays fail-closed' }
if ($helperText -notmatch 'function\s+Complete-OwnedProcessCleanup[\s\S]{0,900}Write-Warning') { throw 'owned-process cleanup must warn instead of replacing an in-flight primary failure' }
if ($helperText -match 'function\s+Complete-OwnedProcessCleanup[\s\S]{0,1000}Write-Warning[^\r\n]*\r?\n\s*throw(?:\s|$)') { throw 'owned-process cleanup must not rethrow after warning about a secondary cleanup failure' }

$lifecycleLaunchCount = [regex]::Matches($lifecycleText, 'Start-InstalledMSL\s+-InstallDir\s+\$InstallDir\s+-Port\s+\$Port').Count
$lifecycleCleanupCount = [regex]::Matches($lifecycleText, 'Complete-OwnedProcessCleanup\s+-Process\s+\$ownedProcess\s+-Port\s+\$Port\s+-PrimaryFailure\s+\$gateFailure').Count
$lifecycleCaptureCount = [regex]::Matches($lifecycleText, '\$gateFailure\s*=\s*\$_').Count
if ($lifecycleLaunchCount -lt 5) { throw 'lifecycle must still launch the test-owned installed host in every gate' }
if ($lifecycleCleanupCount -ne $lifecycleLaunchCount) { throw 'every lifecycle owned-process launch must route cleanup through Complete-OwnedProcessCleanup with that gate failure' }
if ($lifecycleCaptureCount -ne $lifecycleLaunchCount) { throw 'every lifecycle gate must capture its primary failure before cleanup runs' }
if ($lifecycleText -match 'finally\s*\{\s*\r?\n\s*Stop-OwnedProcess') { throw 'lifecycle finally blocks must not stop the owned process directly; cleanup failure would mask the primary gate failure' }
if ($lifecycleText -match 'finally\s*\{\s*\r?\n\s*Wait-PortReleased') { throw 'lifecycle finally blocks must not poll port release directly; cleanup failure would mask the primary gate failure' }
if ($lifecycleText -match 'Wait-PathRemoved\s+-Path\s+\$InstallDir[\s\S]{0,300}Test-Path\s+-LiteralPath\s+\$appPath') { throw 'dead binary check after successful Wait-PathRemoved must be removed' }

Write-Host 'PASS: Phase I lifecycle static contracts'
