param(
    [Parameter(Mandatory=$true)][string]$InstallerPath,
    [string]$ExpectedVersion = '',
    [string]$ExpectedSourceHead = '',
    [string]$ExpectedInstallerSha256 = '',
    [string]$ExpectedAppSha256 = '',
    [string]$ExpectedRustWorkerSha256 = '',
    [string]$InstallDir = "$env:ProgramFiles\Market Signal Lab",
    [int]$Port = 17771,
    [switch]$KeepInstalled
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'windows-installer-test-helpers.ps1')

function Assert-RCUIContract {
    param([int]$Port)
    $base = "http://127.0.0.1:$Port"
    $html = (Invoke-WebRequest -UseBasicParsing -Uri "$base/" -TimeoutSec 15).Content
    $appJS = (Invoke-WebRequest -UseBasicParsing -Uri "$base/assets/js/app.js" -TimeoutSec 15).Content
    $analyticsJS = (Invoke-WebRequest -UseBasicParsing -Uri "$base/assets/js/analytics_engine.js" -TimeoutSec 15).Content
    $en = Invoke-RestMethod -Uri "$base/api/locales/en" -Method Get -TimeoutSec 15
    $id = Invoke-RestMethod -Uri "$base/api/locales/id" -Method Get -TimeoutSec 15
    if ($appJS -notmatch 'SEMANTIC_CONTRACT_V2') { throw 'Installed app.js is missing SEMANTIC_CONTRACT_V2' }
    if ($analyticsJS -notmatch 'GENERATED FILE NOTICE') { throw 'Installed analytics_engine.js is missing generated-file notice' }
    if ($analyticsJS -notmatch 'loadAnalyticsEngineDiagnostics') { throw 'Installed analytics_engine.js is missing diagnostics loader' }
    if ($html -notlike '*Catalog Insight Score*') { throw 'Installed UI is missing Catalog Insight Score' }
    if ($html -notlike '*Product Insight Score*') { throw 'Installed UI is missing Product Insight Score' }
    if ($en.messages.'semantic.catalog_insight_score' -ne 'Catalog Insight Score') { throw 'EN Catalog Insight Score locale mismatch' }
    if ($en.messages.'semantic.product_insight_score' -ne 'Product Insight Score') { throw 'EN Product Insight Score locale mismatch' }
    if ($id.messages.'semantic.catalog_insight_score' -ne 'Skor Insight Katalog') { throw 'ID Catalog Insight Score locale mismatch' }
    if ($id.messages.'semantic.product_insight_score' -ne 'Skor Insight Produk') { throw 'ID Product Insight Score locale mismatch' }
}

$ownedProcess = $null
Assert-NoPortOwner -Port $Port
$installerHash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash
if (-not [string]::IsNullOrWhiteSpace($ExpectedInstallerSha256) -and -not [string]::Equals($installerHash, $ExpectedInstallerSha256, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Installer SHA256 '$installerHash' does not match expected '$ExpectedInstallerSha256'"
}
$primaryFailure = $null
try {
    Install-MSL -Installer $InstallerPath -InstallDir $InstallDir
    $manifest = Assert-InstallLayout -InstallDir $InstallDir -ExpectedVersion $ExpectedVersion
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceHead) -and $manifest.sourceHead -ne $ExpectedSourceHead) {
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
    if (-not [string]::IsNullOrWhiteSpace($ExpectedAppSha256) -and -not [string]::Equals($appHash, $ExpectedAppSha256, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Installed app SHA256 '$appHash' does not match expected '$ExpectedAppSha256'"
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedRustWorkerSha256) -and -not [string]::Equals($rustHash, $ExpectedRustWorkerSha256, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Installed Rust worker SHA256 '$rustHash' does not match expected '$ExpectedRustWorkerSha256'"
    }

    $ownedProcess = Start-InstalledMSL -InstallDir $InstallDir -Port $Port
    $result = Wait-MSLHealth -Port $Port
    Assert-RCUIContract -Port $Port
    if ($result.diagnostics.productionAnalytics.engine -ne 'rust-production') { throw "Unexpected analytics engine '$($result.diagnostics.productionAnalytics.engine)'" }
    if ($result.diagnostics.productionAnalytics.protocol -ne 'msl-analytics/2') { throw "Unexpected analytics protocol '$($result.diagnostics.productionAnalytics.protocol)'" }
    Write-Host "applicationHost.status=$($result.diagnostics.applicationHost.status)"
    Write-Host "productionAnalytics.status=$($result.diagnostics.productionAnalytics.status)"
    Write-Host "productionAnalytics.engine=$($result.diagnostics.productionAnalytics.engine)"
    Write-Host "productionAnalytics.protocol=$($result.diagnostics.productionAnalytics.protocol)"
    Write-Host "installedVersion=$($manifest.version)"
    Write-Host "installedSourceHead=$($manifest.sourceHead)"
    Write-Host "installerSha256=$installerHash"
    Write-Host "installedAppSha256=$appHash"
    Write-Host "installedRustWorkerSha256=$rustHash"
    Write-Host 'uiLocaleSmoke=pass'
}
catch {
    $primaryFailure = $_
}
finally {
    $cleanupFailure = $null
    try {
        Stop-OwnedProcess -Process $ownedProcess
        Wait-PortReleased -Port $Port
        if (-not $KeepInstalled) {
            Uninstall-MSL -InstallDir $InstallDir
            Wait-PathRemoved -Path $InstallDir
            Wait-PortReleased -Port $Port
            Write-Host 'uninstallCleanup=pass'
        }
    }
    catch {
        $cleanupFailure = $_
    }
    if ($null -ne $primaryFailure -and $null -ne $cleanupFailure) {
        Write-Warning "Cleanup also failed after primary verification failure: $($cleanupFailure.Exception.Message)"
    }
    elseif ($null -eq $primaryFailure -and $null -ne $cleanupFailure) {
        $primaryFailure = $cleanupFailure
    }
}
if ($null -ne $primaryFailure) { throw $primaryFailure }
