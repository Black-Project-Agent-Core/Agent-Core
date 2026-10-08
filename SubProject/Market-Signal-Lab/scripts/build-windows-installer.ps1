param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$GoExe = '',
    [string]$CargoExe = '',
    [string]$ISCCExe = '',
    [string]$DistRoot = '',
    [switch]$SkipInstallerCompile
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-NativeTool {
    param(
        [string]$ExplicitPath,
        [Parameter(Mandatory=$true)][string]$CommandName
    )
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        if (Test-Path -LiteralPath $ExplicitPath) {
            return (Resolve-Path -LiteralPath $ExplicitPath).Path
        }
        $explicitCommand = Get-Command $ExplicitPath -ErrorAction SilentlyContinue
        if ($explicitCommand) { return $explicitCommand.Source }
        throw "Native tool '$ExplicitPath' was not found"
    }
    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (-not $command) { throw "Required native tool '$CommandName' was not found" }
    return $command.Source
}

function Run-Native {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$CaptureOutput
    )
    if ($CaptureOutput) {
        $output = & $FilePath @Arguments 2>&1
        $code = $LASTEXITCODE
        if ($code -ne 0) { throw "$FilePath failed with exit code $code`n$($output -join "`n")" }
        return @($output)
    }
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
}

function Run-GuiCommandCapture {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [string[]]$Arguments = @()
    )
    $stdoutPath = [IO.Path]::GetTempFileName()
    $stderrPath = [IO.Path]::GetTempFileName()
    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Wait -PassThru
        $stdout = @(Get-Content -LiteralPath $stdoutPath -ErrorAction SilentlyContinue)
        $stderr = @(Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue)
        if ($process.ExitCode -ne 0) { throw "$FilePath failed with exit code $($process.ExitCode)`n$($stderr -join "`n")" }
        return $stdout
    } finally {
        Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-SourceVersion {
    param([string]$Go)
    $lines = Run-Native -FilePath $Go -Arguments @('run', '.\cmd\market-signal-lab', 'version') -CaptureOutput
    $version = ($lines | Select-Object -Last 1).ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($version)) { throw 'Source version command returned an empty value' }
    return $version
}

function Build-RustWorker {
    param([string]$Cargo, [string]$Stage)
    Run-Native -FilePath $Cargo -Arguments @('build', '--release', '--manifest-path', '.\engines\rust\Cargo.toml')
    $source = Join-Path $RepoRoot 'engines\rust\target\release\msl-analytics-rust.exe'
    if (-not (Test-Path -LiteralPath $source)) { throw "Rust worker was not produced at $source" }
    $destination = Join-Path $Stage 'engines\rust\msl-analytics-rust.exe'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
    return $destination
}

function Build-GoHost {
    param([string]$Go, [string]$Stage)
    $destination = Join-Path $Stage 'Market Signal Lab.exe'
    Run-Native -FilePath $Go -Arguments @('build', '-trimpath', '-ldflags', '-s -w -H=windowsgui', '-o', $destination, '.\cmd\market-signal-lab')
    if (-not (Test-Path -LiteralPath $destination)) { throw "Go host was not produced at $destination" }
    return $destination
}

function Stage-BrowserCompanion {
    param([string]$Stage)
    $source = Join-Path $RepoRoot 'companion\browser-extension'
    if (-not (Test-Path -LiteralPath (Join-Path $source 'manifest.json'))) {
        throw "Browser companion source is missing manifest.json at $source"
    }
    $destination = Join-Path $Stage 'browser-companion'
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
    return $destination
}

function Write-VersionManifest {
    param(
        [string]$Stage,
        [string]$Version,
        [string]$SourceHead,
        [string]$AppPath,
        [string]$RustPath
    )
    $appHash = (Get-FileHash -LiteralPath $AppPath -Algorithm SHA256).Hash
    $rustHash = (Get-FileHash -LiteralPath $RustPath -Algorithm SHA256).Hash
    $manifest = [ordered]@{
        app = 'Market Signal Lab'
        version = $Version
        sourceHead = $SourceHead
        builtAtUtc = [DateTime]::UtcNow.ToString('o')
        appSha256 = $appHash
        rustWorkerSha256 = $rustHash
    }
    $path = Join-Path $Stage 'version.json'
    $manifest | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Assert-PackagedCaptureHelperPath {
    param([string]$AppPath, [string]$BrowserCompanion)
    $output = Run-GuiCommandCapture -FilePath $AppPath -Arguments @('capture-helper-path')
    $reported = ($output | Select-Object -Last 1).ToString().Trim()
    $expected = (Resolve-Path -LiteralPath $BrowserCompanion).Path.TrimEnd('\')
    if ([string]::IsNullOrWhiteSpace($reported)) { throw 'Packaged capture-helper-path returned no path' }
    if ($reported.TrimEnd('\') -ne $expected) {
        throw "Packaged capture-helper-path mismatch: reported '$reported' expected '$expected'"
    }
}

Push-Location $RepoRoot
try {
    $GoExe = Resolve-NativeTool -ExplicitPath $GoExe -CommandName 'go.exe'
    $CargoExe = Resolve-NativeTool -ExplicitPath $CargoExe -CommandName 'cargo.exe'
    $GitExe = Resolve-NativeTool -ExplicitPath '' -CommandName 'git.exe'
    if (-not $SkipInstallerCompile) {
        $ISCCExe = Resolve-NativeTool -ExplicitPath $ISCCExe -CommandName 'ISCC.exe'
    }

    if ([string]::IsNullOrWhiteSpace($DistRoot)) {
        $DistRoot = Join-Path $RepoRoot 'dist\windows-installer'
    }
    $Stage = Join-Path $DistRoot 'stage'
    $Output = Join-Path $DistRoot 'output'
    $Evidence = Join-Path $DistRoot 'evidence'
    foreach ($path in @($Stage, $Output)) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
    New-Item -ItemType Directory -Force -Path $Evidence | Out-Null

    $Version = Get-SourceVersion -Go $GoExe
    if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)') { throw "Source version '$Version' does not start with major.minor.patch" }
    $VersionInfoVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3]).0"
    $SourceHead = ((Run-Native -FilePath $GitExe -Arguments @('rev-parse', 'HEAD') -CaptureOutput) | Select-Object -Last 1).ToString().Trim()
    if ($SourceHead -notmatch '^[0-9a-f]{40}$') { throw "Unexpected git rev-parse HEAD result '$SourceHead'" }

    $RustStage = Build-RustWorker -Cargo $CargoExe -Stage $Stage
    $AppStage = Build-GoHost -Go $GoExe -Stage $Stage
    $BrowserCompanion = Stage-BrowserCompanion -Stage $Stage
    $VersionManifest = Write-VersionManifest -Stage $Stage -Version $Version -SourceHead $SourceHead -AppPath $AppStage -RustPath $RustStage

    Assert-PackagedCaptureHelperPath -AppPath $AppStage -BrowserCompanion $BrowserCompanion # capture-helper-path

    $manifest = Get-Content -Raw -LiteralPath $VersionManifest | ConvertFrom-Json
    if ((Get-FileHash -LiteralPath $AppStage -Algorithm SHA256).Hash -ne $manifest.appSha256) { throw 'Staged app hash does not match version.json' }
    if ((Get-FileHash -LiteralPath $RustStage -Algorithm SHA256).Hash -ne $manifest.rustWorkerSha256) { throw 'Staged Rust worker hash does not match version.json' }

    if ($SkipInstallerCompile) {
        Write-Host "Staging complete: $Stage"
        exit 0
    }

    $Iss = Join-Path $RepoRoot 'installer\MarketSignalLab.iss'
    if (-not (Test-Path -LiteralPath $Iss)) { throw "Installer definition is missing at $Iss" }
    Run-Native -FilePath $ISCCExe -Arguments @("/DStageDir=$Stage", "/DOutputDir=$Output", "/DAppVersion=$Version", "/DVersionInfoVersion=$VersionInfoVersion", "/DSourceHead=$SourceHead", $Iss)

    $InstallerPath = Join-Path $Output "Market-Signal-Lab-Setup-$Version.exe"
    if (-not (Test-Path -LiteralPath $InstallerPath)) { throw "Installer was not produced at $InstallerPath" }
    $InstallerHash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash
    [ordered]@{
        version = $Version
        sourceHead = $SourceHead
        installerSha256 = $InstallerHash
        appSha256 = $manifest.appSha256
        rustWorkerSha256 = $manifest.rustWorkerSha256
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Evidence 'installer-build.json') -Encoding UTF8

    Write-Host "Installer: $InstallerPath"
    Write-Host "Version: $Version"
    Write-Host "SourceHead: $SourceHead"
    Write-Host "InstallerSHA256: $InstallerHash"
}
finally {
    Pop-Location
}
