param(
    [Parameter(Mandatory=$true)][string]$PreviousInstallerPath,
    [Parameter(Mandatory=$true)][string]$CurrentInstallerPath,
    [string]$InstallDir = "$env:ProgramFiles\Market Signal Lab",
    [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'MarketSignalLab'),
    [int]$Port = 17771,
    [int]$QuickTimeoutSec = 1800,
    [string]$EvidencePath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'windows-installer-test-helpers.ps1')

# Safe connection-status API used indirectly by Get-ConnectionSnapshot: /api/connections/envato

function Assert-RustV2Health {
    param($Health)
    if ($Health.diagnostics.applicationHost.status -ne 'healthy') {
        throw "applicationHost.status=$($Health.diagnostics.applicationHost.status)"
    }
    if ($Health.diagnostics.productionAnalytics.status -ne 'healthy') {
        throw "productionAnalytics.status=$($Health.diagnostics.productionAnalytics.status)"
    }
    if ($Health.diagnostics.productionAnalytics.engine -ne 'rust-production') {
        throw "productionAnalytics.engine=$($Health.diagnostics.productionAnalytics.engine)"
    }
    if ($Health.diagnostics.productionAnalytics.protocol -ne 'msl-analytics/2') {
        throw "productionAnalytics.protocol=$($Health.diagnostics.productionAnalytics.protocol)"
    }
}

function Assert-ConfiguredConnection {
    param($Connection, [string]$Label)
    if (-not [bool]$Connection.configured) {
        throw "$Label credential state is not configured"
    }
    if ([string]::IsNullOrWhiteSpace([string]$Connection.credentialFingerprint)) {
        throw "$Label credential fingerprint is empty"
    }
}

function Compare-ConnectionSnapshot {
    param($Expected, $Actual, [string]$Label)
    Assert-ConfiguredConnection -Connection $Expected -Label "$Label baseline"
    Assert-ConfiguredConnection -Connection $Actual -Label $Label
    if ([string]$Expected.credentialFingerprint -ne [string]$Actual.credentialFingerprint) {
        throw "$Label credentialFingerprint changed"
    }
}

function Assert-InstalledBinaryHashes {
    param(
        [string]$InstallDir,
        [string]$ExpectedSourceHead
    )
    $manifest = Get-InstalledVersionManifest -InstallDir $InstallDir
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceHead) -and [string]$manifest.sourceHead -ne $ExpectedSourceHead) {
        throw "Installed sourceHead '$($manifest.sourceHead)' does not match expected '$ExpectedSourceHead'"
    }
    $appPath = Join-Path $InstallDir 'Market Signal Lab.exe'
    $rustPath = Join-Path $InstallDir 'engines\rust\msl-analytics-rust.exe'
    $appHash = (Get-FileHash -LiteralPath $appPath -Algorithm SHA256).Hash
    $rustHash = (Get-FileHash -LiteralPath $rustPath -Algorithm SHA256).Hash
    if (-not [string]::Equals($appHash, [string]$manifest.appSha256, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Installed Go host hash does not match version.json'
    }
    if (-not [string]::Equals($rustHash, [string]$manifest.rustWorkerSha256, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Installed Rust worker hash does not match version.json'
    }
    return $manifest
}

function Get-HistoryManifestDigest {
    param($Manifest)
    $json = @($Manifest) | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '')
    }
    finally {
        $sha.Dispose()
    }
}

function Get-LatestRunID {
    param($Latest)
    if ($null -eq $Latest) { return '' }
    if (-not [bool]$Latest.available) { return '' }
    return [string]$Latest.view.run.id
}

function Get-PreUpgradeBaseline {
    param(
        [string]$InstallerPath,
        [string]$InstallDir,
        [string]$DataRoot,
        [int]$Port
    )

    Install-MSL -Installer $InstallerPath -InstallDir $InstallDir
    $manifest = Assert-InstallLayout -InstallDir $InstallDir -ExpectedVersion ''
    $manifest = Assert-InstalledBinaryHashes -InstallDir $InstallDir -ExpectedSourceHead ''

    $ownedProcess = $null
    $gateFailure = $null
    try {
        $ownedProcess = Start-InstalledMSL -InstallDir $InstallDir -Port $Port
        $health = Wait-MSLHealth -Port $Port
        Assert-RustV2Health -Health $health
        $connection = Get-ConnectionSnapshot -Port $Port
        Assert-ConfiguredConnection -Connection $connection -Label 'pre-upgrade'
        $history = Get-HistoryManifest -DataRoot $DataRoot
        if (@($history).Count -eq 0) {
            throw 'Pre-upgrade history is empty; lifecycle preservation cannot be proven'
        }
        $latest = Get-LatestAutopilotSnapshot -Port $Port
        return [pscustomobject]@{
            manifest = $manifest
            connection = $connection
            history = $history
            latestRunId = (Get-LatestRunID -Latest $latest)
        }
    }
    catch {
        $gateFailure = $_
        throw
    }
    finally {
        Complete-OwnedProcessCleanup -Process $ownedProcess -Port $Port -PrimaryFailure $gateFailure
    }
}

function Invoke-UpgradeGate {
    param(
        [string]$CurrentInstallerPath,
        [string]$InstallDir,
        [string]$DataRoot,
        [int]$Port,
        [string]$ExpectedSourceHead,
        $Baseline
    )

    Install-MSL -Installer $CurrentInstallerPath -InstallDir $InstallDir
    $manifest = Assert-InstallLayout -InstallDir $InstallDir -ExpectedVersion ''
    $manifest = Assert-InstalledBinaryHashes -InstallDir $InstallDir -ExpectedSourceHead $ExpectedSourceHead

    $ownedProcess = $null
    $gateFailure = $null
    try {
        $ownedProcess = Start-InstalledMSL -InstallDir $InstallDir -Port $Port
        $health = Wait-MSLHealth -Port $Port
        Assert-RustV2Health -Health $health
        $connection = Get-ConnectionSnapshot -Port $Port
        Compare-ConnectionSnapshot -Expected $Baseline.connection -Actual $connection -Label 'upgrade'
        $history = Get-HistoryManifest -DataRoot $DataRoot
        Compare-HistoryManifest -Before $Baseline.history -After $history -Label 'upgrade'
        $latest = Get-LatestAutopilotSnapshot -Port $Port
        return [pscustomobject]@{
            manifest = $manifest
            connection = $connection
            history = $history
            latestRunId = (Get-LatestRunID -Latest $latest)
        }
    }
    catch {
        $gateFailure = $_
        throw
    }
    finally {
        Complete-OwnedProcessCleanup -Process $ownedProcess -Port $Port -PrimaryFailure $gateFailure
    }
}

function Invoke-InstalledQuickGate {
    param(
        [string]$InstallDir,
        [string]$DataRoot,
        [int]$Port,
        [int]$QuickTimeoutSec,
        $BaselineConnection,
        $PreQuickHistory
    )

    $ownedProcess = $null
    $gateFailure = $null
    try {
        $ownedProcess = Start-InstalledMSL -InstallDir $InstallDir -Port $Port
        $health = Wait-MSLHealth -Port $Port
        Assert-RustV2Health -Health $health

        $connection = Get-ConnectionSnapshot -Port $Port
        Compare-ConnectionSnapshot -Expected $BaselineConnection -Actual $connection -Label 'installed Quick preflight'
        $historyBefore = Get-HistoryManifest -DataRoot $DataRoot
        Compare-HistoryManifest -Before $PreQuickHistory -After $historyBefore -Label 'installed Quick preflight'

        $start = Invoke-MSLJson -Port $Port -Method 'POST' -Path '/api/autopilot/run' -Body ([ordered]@{ mode = 'quick' })
        $runId = [string]$start.runId
        if ([string]::IsNullOrWhiteSpace($runId)) {
            throw 'Installed Quick did not return a runId'
        }

        $encodedRunId = [Uri]::EscapeDataString($runId)
        $livePath = "/api/autopilot/live?runId=$encodedRunId"
        $terminalStatuses = @('completed', 'partial', 'failed', 'cancelled')
        $deadline = [DateTime]::UtcNow.AddSeconds($QuickTimeoutSec)
        $snapshot = $start

        while ([DateTime]::UtcNow -lt $deadline) {
            $snapshot = Invoke-MSLJson -Port $Port -Method 'GET' -Path $livePath
            if ($terminalStatuses -contains [string]$snapshot.status) { break }
            Start-Sleep -Seconds 1
        }

        if ($terminalStatuses -notcontains [string]$snapshot.status) {
            throw "Installed Quick timed out after $QuickTimeoutSec seconds"
        }
        if ([string]$snapshot.status -ne 'completed') {
            throw "Installed Quick terminal status is '$($snapshot.status)' instead of 'completed'"
        }

        $runtime = [ordered]@{
            runId = [string]$snapshot.runId
            status = [string]$snapshot.status
            progressPercent = [double]$snapshot.progressPercent
            plannedWorkUnits = [int]$snapshot.plannedWorkUnits
            completedWorkUnits = [int]$snapshot.completedWorkUnits
            productsDiscovered = [int]$snapshot.productsDiscovered
            requestsCompleted = [int]$snapshot.requestsCompleted
            warningCount = [int]$snapshot.warningCount
            errorCount = [int]$snapshot.errorCount
            elapsedMs = [int64]$snapshot.elapsedMs
        }

        $historyAfter = Get-HistoryManifest -DataRoot $DataRoot
        $latest = Get-LatestAutopilotSnapshot -Port $Port
        $latestRunId = Get-LatestRunID -Latest $latest
        if ($latestRunId -ne $runId) {
            throw "Latest Autopilot run '$latestRunId' does not match installed Quick '$runId'"
        }

        return [pscustomobject]@{
            runtime = $runtime
            history = $historyAfter
            latestRunId = $latestRunId
        }
    }
    catch {
        $gateFailure = $_
        throw
    }
    finally {
        Complete-OwnedProcessCleanup -Process $ownedProcess -Port $Port -PrimaryFailure $gateFailure
    }
}

function Invoke-UninstallPreservationGate {
    param(
        [string]$InstallDir,
        [string]$DataRoot,
        $PostQuickHistory
    )

    Uninstall-MSL -InstallDir $InstallDir
    Wait-PathRemoved -Path $InstallDir
    $historyAfter = Get-HistoryManifest -DataRoot $DataRoot
    Compare-HistoryManifest -Before $PostQuickHistory -After $historyAfter -Label 'default uninstall'
    return $historyAfter
}

function Invoke-ReinstallGate {
    param(
        [string]$CurrentInstallerPath,
        [string]$InstallDir,
        [string]$DataRoot,
        [int]$Port,
        [string]$ExpectedSourceHead,
        $BaselineConnection,
        $PostQuickHistory,
        [string]$ExpectedLatestRunId
    )

    Install-MSL -Installer $CurrentInstallerPath -InstallDir $InstallDir
    $manifest = Assert-InstallLayout -InstallDir $InstallDir -ExpectedVersion ''
    $manifest = Assert-InstalledBinaryHashes -InstallDir $InstallDir -ExpectedSourceHead $ExpectedSourceHead

    $ownedProcess = $null
    $gateFailure = $null
    try {
        $ownedProcess = Start-InstalledMSL -InstallDir $InstallDir -Port $Port
        $health = Wait-MSLHealth -Port $Port
        Assert-RustV2Health -Health $health
        $connection = Get-ConnectionSnapshot -Port $Port
        Compare-ConnectionSnapshot -Expected $BaselineConnection -Actual $connection -Label 'reinstall'
        $history = Get-HistoryManifest -DataRoot $DataRoot
        Compare-HistoryManifest -Before $PostQuickHistory -After $history -Label 'reinstall'
        $latest = Get-LatestAutopilotSnapshot -Port $Port
        $latestRunId = Get-LatestRunID -Latest $latest
        if ($latestRunId -ne $ExpectedLatestRunId) {
            throw "Reinstall latest run '$latestRunId' does not match expected '$ExpectedLatestRunId'"
        }
        return [pscustomobject]@{
            manifest = $manifest
            connection = $connection
            history = $history
            latestRunId = $latestRunId
        }
    }
    catch {
        $gateFailure = $_
        throw
    }
    finally {
        Complete-OwnedProcessCleanup -Process $ownedProcess -Port $Port -PrimaryFailure $gateFailure
    }
}

function Invoke-RestartGate {
    param(
        [string]$InstallDir,
        [string]$DataRoot,
        [int]$Port,
        $BaselineConnection,
        $ExpectedHistory,
        [string]$ExpectedLatestRunId
    )

    $ownedProcess = $null
    $gateFailure = $null
    try {
        $ownedProcess = Start-InstalledMSL -InstallDir $InstallDir -Port $Port
        $health = Wait-MSLHealth -Port $Port
        Assert-RustV2Health -Health $health
        $connection = Get-ConnectionSnapshot -Port $Port
        Compare-ConnectionSnapshot -Expected $BaselineConnection -Actual $connection -Label 'restart'
        $history = Get-HistoryManifest -DataRoot $DataRoot
        Compare-HistoryManifest -Before $ExpectedHistory -After $history -Label 'restart'
        $latest = Get-LatestAutopilotSnapshot -Port $Port
        $latestRunId = Get-LatestRunID -Latest $latest
        if ($latestRunId -ne $ExpectedLatestRunId) {
            throw "Restart latest run '$latestRunId' does not match expected '$ExpectedLatestRunId'"
        }
        return [pscustomobject]@{
            connection = $connection
            history = $history
            latestRunId = $latestRunId
        }
    }
    catch {
        $gateFailure = $_
        throw
    }
    finally {
        Complete-OwnedProcessCleanup -Process $ownedProcess -Port $Port -PrimaryFailure $gateFailure
    }
}

function Write-LifecycleEvidence {
    param(
        [string]$EvidencePath,
        $Evidence
    )
    $directory = Split-Path -Parent $EvidencePath
    if ([string]::IsNullOrWhiteSpace($directory)) {
        throw 'EvidencePath must include a directory'
    }
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $temporaryPath = "$EvidencePath.tmp-$([Guid]::NewGuid().ToString('N'))"
    try {
        $Evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
        Move-Item -LiteralPath $temporaryPath -Destination $EvidencePath -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        }
    }
}

$PreviousInstallerPath = (Resolve-Path -LiteralPath $PreviousInstallerPath).Path
$CurrentInstallerPath = (Resolve-Path -LiteralPath $CurrentInstallerPath).Path
if ($PreviousInstallerPath -eq $CurrentInstallerPath) {
    throw 'PreviousInstallerPath and CurrentInstallerPath must identify different installer artifacts'
}
if ($QuickTimeoutSec -le 0) {
    throw 'QuickTimeoutSec must be greater than zero'
}
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $RepoRoot 'dist\windows-installer\evidence\installer-lifecycle.json'
}

$gitHeadLines = @(& git -C $RepoRoot rev-parse HEAD 2>&1)
if ($LASTEXITCODE -ne 0) {
    throw "git rev-parse HEAD failed: $($gitHeadLines -join "`n")"
}
$ExpectedCurrentSourceHead = ($gitHeadLines | Select-Object -Last 1).ToString().Trim()
if ($ExpectedCurrentSourceHead -notmatch '^[0-9a-f]{40}$') {
    throw "Unexpected current source head '$ExpectedCurrentSourceHead'"
}

Assert-NoPortOwner -Port $Port

$baseline = Get-PreUpgradeBaseline -InstallerPath $PreviousInstallerPath -InstallDir $InstallDir -DataRoot $DataRoot -Port $Port
$upgrade = Invoke-UpgradeGate -CurrentInstallerPath $CurrentInstallerPath -InstallDir $InstallDir -DataRoot $DataRoot -Port $Port -ExpectedSourceHead $ExpectedCurrentSourceHead -Baseline $baseline
$quick = Invoke-InstalledQuickGate -InstallDir $InstallDir -DataRoot $DataRoot -Port $Port -QuickTimeoutSec $QuickTimeoutSec -BaselineConnection $baseline.connection -PreQuickHistory $upgrade.history
$uninstallHistory = Invoke-UninstallPreservationGate -InstallDir $InstallDir -DataRoot $DataRoot -PostQuickHistory $quick.history
$reinstall = Invoke-ReinstallGate -CurrentInstallerPath $CurrentInstallerPath -InstallDir $InstallDir -DataRoot $DataRoot -Port $Port -ExpectedSourceHead $ExpectedCurrentSourceHead -BaselineConnection $baseline.connection -PostQuickHistory $quick.history -ExpectedLatestRunId $quick.runtime.runId
$restart = Invoke-RestartGate -InstallDir $InstallDir -DataRoot $DataRoot -Port $Port -BaselineConnection $baseline.connection -ExpectedHistory $quick.history -ExpectedLatestRunId $quick.runtime.runId

$evidence = [ordered]@{
    schemaVersion = 'phase-i-installer-lifecycle/1'
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    currentSourceHead = $ExpectedCurrentSourceHead
    previous = [ordered]@{
        version = [string]$baseline.manifest.version
        sourceHead = [string]$baseline.manifest.sourceHead
        appSha256 = [string]$baseline.manifest.appSha256
        rustWorkerSha256 = [string]$baseline.manifest.rustWorkerSha256
        configured = [bool]$baseline.connection.configured
        status = [string]$baseline.connection.status
        credentialFingerprint = [string]$baseline.connection.credentialFingerprint
        historyFileCount = @($baseline.history).Count
        historySha256 = Get-HistoryManifestDigest -Manifest $baseline.history
        latestRunId = [string]$baseline.latestRunId
    }
    upgrade = [ordered]@{
        version = [string]$upgrade.manifest.version
        sourceHead = [string]$upgrade.manifest.sourceHead
        appSha256 = [string]$upgrade.manifest.appSha256
        rustWorkerSha256 = [string]$upgrade.manifest.rustWorkerSha256
        configured = [bool]$upgrade.connection.configured
        status = [string]$upgrade.connection.status
        credentialFingerprint = [string]$upgrade.connection.credentialFingerprint
        historyFileCount = @($upgrade.history).Count
        historySha256 = Get-HistoryManifestDigest -Manifest $upgrade.history
    }
    installedQuick = [ordered]@{
        runId = [string]$quick.runtime.runId
        status = [string]$quick.runtime.status
        progressPercent = [double]$quick.runtime.progressPercent
        plannedWorkUnits = [int]$quick.runtime.plannedWorkUnits
        completedWorkUnits = [int]$quick.runtime.completedWorkUnits
        productsDiscovered = [int]$quick.runtime.productsDiscovered
        requestsCompleted = [int]$quick.runtime.requestsCompleted
        warningCount = [int]$quick.runtime.warningCount
        errorCount = [int]$quick.runtime.errorCount
        elapsedMs = [int64]$quick.runtime.elapsedMs
        historyFileCount = @($quick.history).Count
        historySha256 = Get-HistoryManifestDigest -Manifest $quick.history
    }
    defaultUninstall = [ordered]@{
        applicationRemoved = $true
        historyFileCount = @($uninstallHistory).Count
        historySha256 = Get-HistoryManifestDigest -Manifest $uninstallHistory
    }
    reinstall = [ordered]@{
        sourceHead = [string]$reinstall.manifest.sourceHead
        configured = [bool]$reinstall.connection.configured
        credentialFingerprint = [string]$reinstall.connection.credentialFingerprint
        historyFileCount = @($reinstall.history).Count
        historySha256 = Get-HistoryManifestDigest -Manifest $reinstall.history
        latestRunId = [string]$reinstall.latestRunId
    }
    restart = [ordered]@{
        configured = [bool]$restart.connection.configured
        credentialFingerprint = [string]$restart.connection.credentialFingerprint
        historyFileCount = @($restart.history).Count
        historySha256 = Get-HistoryManifestDigest -Manifest $restart.history
        latestRunId = [string]$restart.latestRunId
    }
}

Write-LifecycleEvidence -EvidencePath $EvidencePath -Evidence $evidence
Write-Host 'PASS: Phase I Windows installer lifecycle acceptance'
Write-Host "EvidencePath=$EvidencePath"
Write-Host "CurrentSourceHead=$ExpectedCurrentSourceHead"
Write-Host "QuickRunId=$($quick.runtime.runId)"
Write-Host "QuickStatus=$($quick.runtime.status)"
Write-Host "CredentialFingerprint=$($restart.connection.credentialFingerprint)"
