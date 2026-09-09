$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-NoPortOwner {
    param([int]$Port)
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        $owners = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ','
        throw "Port $Port is already owned by PID(s) $owners"
    }
}

function Wait-PathRemoved {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [int]$Attempts = 40,
        [int]$DelayMilliseconds = 250
    )
    for ($i = 0; $i -lt $Attempts; $i++) {
        if (-not (Test-Path -LiteralPath $Path)) { return }
        Start-Sleep -Milliseconds $DelayMilliseconds
    }
    if (Test-Path -LiteralPath $Path) {
        throw "Path was not removed within the bounded wait: $Path"
    }
}

function Wait-PortReleased {
    param(
        [Parameter(Mandatory=$true)][int]$Port,
        [int]$Attempts = 40,
        [int]$DelayMs = 250
    )
    for ($i = 0; $i -lt $Attempts; $i++) {
        $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        if ($listeners.Count -eq 0) { return }
        Start-Sleep -Milliseconds $DelayMs
    }
    Assert-NoPortOwner -Port $Port
}

function Install-MSL {
    param([string]$Installer, [string]$InstallDir)
    if (-not (Test-Path -LiteralPath $Installer)) { throw "Installer does not exist: $Installer" }
    $args = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$InstallDir`"")
    $process = Start-Process -FilePath $Installer -ArgumentList $args -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)" }
}

function Get-InstalledVersionManifest {
    param([string]$InstallDir)
    $path = Join-Path $InstallDir 'version.json'
    if (-not (Test-Path -LiteralPath $path)) { throw "Installed version manifest is missing: $path" }
    return Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
}

function Assert-InstallLayout {
    param([string]$InstallDir, [string]$ExpectedVersion)
    $required = @(
        (Join-Path $InstallDir 'Market Signal Lab.exe'),
        (Join-Path $InstallDir 'engines\rust\msl-analytics-rust.exe'),
        (Join-Path $InstallDir 'browser-companion\manifest.json'),
        (Join-Path $InstallDir 'version.json')
    )
    foreach ($path in $required) {
        if (-not (Test-Path -LiteralPath $path)) { throw "Required installed file is missing: $path" }
    }

    foreach ($name in @('history', 'cache', 'exports', 'logs')) {
        $path = Join-Path $InstallDir $name
        if (Test-Path -LiteralPath $path) { throw "Mutable data directory must not exist under Program Files: $path" }
    }
    foreach ($name in @('connection.json', '.env')) {
        $path = Join-Path $InstallDir $name
        if (Test-Path -LiteralPath $path) { throw "Mutable/secret-bearing file must not exist under Program Files: $path" }
    }
    $envFiles = @(Get-ChildItem -LiteralPath $InstallDir -Filter '.env.*' -File -Recurse -ErrorAction SilentlyContinue)
    if ($envFiles.Count -gt 0) { throw 'Installer staged one or more .env.* files under Program Files' }
    $credentialDumpFiles = @(Get-ChildItem -LiteralPath $InstallDir -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)(token|credential).*(dump|export)' })
    if ($credentialDumpFiles.Count -gt 0) { throw 'Installer staged credential dump-like files under Program Files' }

    $manifest = Get-InstalledVersionManifest -InstallDir $InstallDir
    if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion) -and $manifest.version -ne $ExpectedVersion) {
        throw "Installed version '$($manifest.version)' does not match expected '$ExpectedVersion'"
    }
    return $manifest
}

function Start-InstalledMSL {
    param([string]$InstallDir, [int]$Port)
    $app = Join-Path $InstallDir 'Market Signal Lab.exe'
    return Start-Process -FilePath $app -ArgumentList @('serve', '--port', "$Port", '--no-open') -PassThru
}

function Wait-MSLHealth {
    param([int]$Port, [int]$Attempts = 80)
    $base = "http://127.0.0.1:$Port"
    $last = ''
    for ($i = 0; $i -lt $Attempts; $i++) {
        try {
            $health = Invoke-RestMethod -Uri "$base/api/health" -Method Get -TimeoutSec 2
            $diag = Invoke-RestMethod -Uri "$base/api/system/analytics-engine" -Method Get -TimeoutSec 2
            if ($health -and $diag) {
                if ($diag.applicationHost.status -ne 'healthy') { throw "applicationHost.status=$($diag.applicationHost.status)" }
                if ($diag.productionAnalytics.status -ne 'healthy') { throw "productionAnalytics.status=$($diag.productionAnalytics.status)" }
                if ($diag.productionAnalytics.engine -ne 'rust-production') { throw "productionAnalytics.engine=$($diag.productionAnalytics.engine)" }
                if ($diag.productionAnalytics.protocol -ne 'msl-analytics/2') { throw "productionAnalytics.protocol=$($diag.productionAnalytics.protocol)" }
                return [ordered]@{ health = $health; diagnostics = $diag }
            }
        }
        catch {
            $last = $_.Exception.Message
        }
        Start-Sleep -Milliseconds 500
    }
    throw "MSL did not become healthy on 127.0.0.1:$Port. Last error: $last"
}

function Stop-OwnedProcess {
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process) { return }
    try {
        if (-not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction Stop
            $Process.WaitForExit(5000) | Out-Null
        }
    }
    catch {
        Write-Warning "Unable to stop test-owned PID $($Process.Id): $($_.Exception.Message)"
    }
}

function Complete-OwnedProcessCleanup {
    param(
        [System.Diagnostics.Process]$Process,
        [Parameter(Mandatory=$true)][int]$Port,
        $PrimaryFailure = $null
    )
    try {
        Stop-OwnedProcess -Process $Process
        Wait-PortReleased -Port $Port
    }
    catch {
        if ($null -eq $PrimaryFailure) { throw }
        Write-Warning "Cleanup also failed after primary verification failure: $($_.Exception.Message)"
    }
}

function Uninstall-MSL {
    param([string]$InstallDir)
    $uninstaller = Join-Path $InstallDir 'unins000.exe'
    if (-not (Test-Path -LiteralPath $uninstaller)) { return }
    $process = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Uninstaller exited with code $($process.ExitCode)" }
}

function Invoke-MSLJson {
    param(
        [int]$Port,
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    if ([string]::IsNullOrWhiteSpace($Path) -or -not $Path.StartsWith('/')) {
        throw "MSL API path must begin with '/': $Path"
    }
    $uri = "http://127.0.0.1:$Port$Path"
    $parameters = @{
        Uri = $uri
        Method = $Method
        TimeoutSec = 15
    }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body | ConvertTo-Json -Depth 8 -Compress
    }
    return Invoke-RestMethod @parameters
}

function Get-ConnectionSnapshot {
    param([int]$Port)
    $payload = Invoke-MSLJson -Port $Port -Method 'GET' -Path '/api/connections/envato'
    return [ordered]@{
        configured = [bool]$payload.configured
        status = [string]$payload.status
        credentialFingerprint = [string]$payload.credentialFingerprint
    }
}

function Get-HistoryManifest {
    param([string]$DataRoot)
    $historyRoot = Join-Path $DataRoot 'history'
    if (-not (Test-Path -LiteralPath $historyRoot)) { return @() }
    return @(Get-ChildItem -LiteralPath $historyRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
        [ordered]@{
            path = $_.FullName.Substring($historyRoot.Length).TrimStart('\')
            length = [int64]$_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
}

function Compare-HistoryManifest {
    param(
        $Before,
        $After,
        [string]$Label
    )
    $beforeJson = @($Before) | ConvertTo-Json -Depth 5 -Compress
    $afterJson = @($After) | ConvertTo-Json -Depth 5 -Compress
    if ($beforeJson -ne $afterJson) {
        throw "History manifest changed unexpectedly during $Label"
    }
}

function Get-LatestAutopilotSnapshot {
    param([int]$Port)
    return Invoke-MSLJson -Port $Port -Method 'GET' -Path '/api/autopilot/latest'
}
