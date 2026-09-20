param(
    [string]$ProjectRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
$allowlistFile = Join-Path $ProjectRoot 'Desktop-Commander-Allowlist.txt'
$isolatedHome = Join-Path $ProjectRoot 'dist\.desktop-commander\agent-core-home'
$configPath = Join-Path $isolatedHome '.claude-server-commander\config.json'

function Write-JsonUtf8NoBom([object]$Value, [string]$Path) {
    $json = $Value | ConvertTo-Json -Depth 20
    $tmpPath = "$Path.tmp"
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($tmpPath, $json, $utf8)
    [IO.File]::Copy($tmpPath, $Path, $true)
    Remove-Item -LiteralPath $tmpPath -Force
}

function New-MinimalConfig {
    [pscustomobject]@{
        allowedDirectories = @()
        pendingWelcomeOnboarding = $false
        welcomeOnboardingEligible = $false
        telemetryEnabled = $false
    }
}

function Add-NormalizedPath([string]$Value, [System.Collections.Generic.List[string]]$Target) {
    if (-not $Value) { return }
    $expanded = [Environment]::ExpandEnvironmentVariables($Value.Trim())
    if (-not [IO.Path]::IsPathRooted($expanded)) {
        $expanded = Join-Path $ProjectRoot $expanded
    }
    $fullPath = [IO.Path]::GetFullPath($expanded)
    $rootPath = [IO.Path]::GetPathRoot($fullPath)
    $normalized = if ($fullPath -eq $rootPath) { $rootPath } else { $fullPath.TrimEnd('\') }
    if (-not (Test-Path -LiteralPath $normalized -PathType Container)) {
        throw "Folder allowlist tidak ditemukan: $normalized"
    }
    $Target.Add($normalized)
}

if (-not (Test-Path -LiteralPath $allowlistFile -PathType Leaf)) {
    throw "Allowlist file tidak ditemukan: $allowlistFile"
}

$paths = [System.Collections.Generic.List[string]]::new()
$formatErrors = [System.Collections.Generic.List[string]]::new()
foreach ($line in Get-Content -LiteralPath $allowlistFile) {
    $raw = $line.Trim()
    if (-not $raw -or $raw.StartsWith('#')) { continue }

    $startsQuote = $raw.StartsWith('"')
    $endsQuote = $raw.EndsWith('"')
    if ($startsQuote -xor $endsQuote) {
        $formatErrors.Add($raw)
        continue
    }
    $value = if ($startsQuote -and $endsQuote) {
        $raw.Substring(1, $raw.Length - 2).Trim()
    } else {
        $raw
    }
    if (-not $value) { continue }

    switch ($value.ToUpperInvariant()) {
        '@PROJECT_ROOT' { Add-NormalizedPath $ProjectRoot $paths; continue }
        '@PROJECT_DRIVE' { Add-NormalizedPath ([IO.Path]::GetPathRoot($ProjectRoot)) $paths; continue }
        '@SYSTEM_DRIVE' { Add-NormalizedPath ([IO.Path]::GetPathRoot($env:SystemRoot)) $paths; continue }
        '@FIXED_DRIVES' {
            [IO.DriveInfo]::GetDrives() |
                Where-Object { $_.DriveType -eq [IO.DriveType]::Fixed -and $_.IsReady } |
                ForEach-Object { Add-NormalizedPath $_.RootDirectory.FullName $paths }
            continue
        }
        default { Add-NormalizedPath $value $paths }
    }
}

if ($formatErrors.Count -gt 0) {
    Write-Host 'ERROR: Tanda kutip harus berpasangan:' -ForegroundColor Red
    $formatErrors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host 'Contoh benar: "@PROJECT_ROOT" atau "."' -ForegroundColor Yellow
    exit 2
}

$normalizedPaths = @($paths | Sort-Object -Unique)
if ($normalizedPaths.Count -eq 0) {
    Write-Host 'ERROR: Allowlist kosong. Tidak diterapkan karena [] berarti full filesystem access.' -ForegroundColor Red
    exit 4
}

$configDir = Split-Path -Parent $configPath
if (-not (Test-Path -LiteralPath $configDir -PathType Container)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$config = $null
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    try {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    } catch {
        $corruptBackup = Join-Path $configDir ("config.corrupt-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
        Copy-Item -LiteralPath $configPath -Destination $corruptBackup -Force
        Write-Host "WARN: Config rusak dibackup lokal: $corruptBackup" -ForegroundColor Yellow
    }
}

if ($null -eq $config) {
    $config = New-MinimalConfig
    Write-Host 'Creating clean project-local Desktop Commander config...'
}

$config | Add-Member -NotePropertyName allowedDirectories -NotePropertyValue $normalizedPaths -Force
$config | Add-Member -NotePropertyName pendingWelcomeOnboarding -NotePropertyValue $false -Force
$config | Add-Member -NotePropertyName welcomeOnboardingEligible -NotePropertyValue $false -Force
$config | Add-Member -NotePropertyName telemetryEnabled -NotePropertyValue $false -Force

$backupPath = "$configPath.bak"
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    Copy-Item -LiteralPath $configPath -Destination $backupPath -Force
}
Write-JsonUtf8NoBom -Value $config -Path $configPath

Write-Host 'Allowlist Desktop Commander berhasil diterapkan:' -ForegroundColor Green
$normalizedPaths | ForEach-Object { Write-Host "  + $_" }
Write-Host "Config: $configPath"
exit 0
