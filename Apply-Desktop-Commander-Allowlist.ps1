param(
    [string]$ProjectRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path),
    [string]$SeedConfigPath = ''
)
$ErrorActionPreference = 'Stop'

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

if (-not (Test-Path -LiteralPath $allowlistFile)) {
    throw "Allowlist file tidak ditemukan: $allowlistFile"
}

$paths = @()
$invalid = @()
$formatErrors = @()
foreach ($line in Get-Content -LiteralPath $allowlistFile) {
    $raw = $line.Trim()
    if (-not $raw -or $raw.StartsWith('#')) { continue }

    $startsQuote = $raw.StartsWith('"')
    $endsQuote = $raw.EndsWith('"')
    if ($startsQuote -xor $endsQuote) {
        $formatErrors += $raw
        continue
    }
    if ($startsQuote -and $endsQuote) {
        if ($raw.Length -lt 2) { continue }
        $value = $raw.Substring(1, $raw.Length - 2).Trim()
    } else {
        $value = $raw
    }
    if (-not $value) { continue }
    $value = [Environment]::ExpandEnvironmentVariables($value)
    if (-not [IO.Path]::IsPathRooted($value)) {
        $value = Join-Path $ProjectRoot $value
    }

    $fullPath = [IO.Path]::GetFullPath($value)
    $rootPath = [IO.Path]::GetPathRoot($fullPath)
    if ($fullPath -eq $rootPath) {
        $value = $rootPath
    } else {
        $value = $fullPath.TrimEnd('\')
    }

    if (-not (Test-Path -LiteralPath $value -PathType Container)) {
        $invalid += $value
        continue
    }
    $paths += $value
}

if ($formatErrors.Count -gt 0) {
    Write-Host 'ERROR: Tanda kutip harus berpasangan:' -ForegroundColor Red
    $formatErrors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host 'Contoh benar: "E:\Projects\Agent-Core"' -ForegroundColor Yellow
    exit 2
}

$paths = @($paths | Sort-Object -Unique)
if ($invalid.Count -gt 0) {
    Write-Host 'ERROR: Folder berikut tidak ditemukan:' -ForegroundColor Red
    $invalid | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 3
}
if ($paths.Count -eq 0) {
    Write-Host 'ERROR: Allowlist kosong. Tidak diterapkan karena [] berarti full filesystem access.' -ForegroundColor Red
    exit 4
}

if (-not (Test-Path -LiteralPath $configPath)) {
    if (-not $SeedConfigPath -or -not (Test-Path -LiteralPath $SeedConfigPath -PathType Leaf)) {
        Write-Host "ERROR: Config Desktop Commander Agent Core belum ada: $configPath" -ForegroundColor Red
        Write-Host "Seed config juga tidak ditemukan: $SeedConfigPath" -ForegroundColor Red
        exit 5
    }

    Write-Host 'Creating isolated Desktop Commander profile from active local config...'
    $configDir = Split-Path -Parent $configPath
    if (-not (Test-Path -LiteralPath $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }

    try {
        $seed = Get-Content -LiteralPath $SeedConfigPath -Raw | ConvertFrom-Json
        foreach ($field in @('clientId','usageStats','version','abTest_OnboardingPreTool','abTest_McpUiPreviews')) {
            $seed.PSObject.Properties.Remove($field)
        }
        $seed | Add-Member -NotePropertyName allowedDirectories -NotePropertyValue @() -Force
        $seed | Add-Member -NotePropertyName pendingWelcomeOnboarding -NotePropertyValue $false -Force
        $seed | Add-Member -NotePropertyName welcomeOnboardingEligible -NotePropertyValue $false -Force
        Write-JsonUtf8NoBom -Value $seed -Path $configPath
        Write-Host "Isolated profile created: $configPath" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR: Gagal membuat isolated config: $($_.Exception.Message)" -ForegroundColor Red
        exit 6
    }
}

try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
}
catch {
    Write-Host "ERROR: Config Desktop Commander tidak valid: $configPath" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 7
}

$config | Add-Member -NotePropertyName allowedDirectories -NotePropertyValue @($paths) -Force
$backupPath = "$configPath.bak"
Copy-Item -LiteralPath $configPath -Destination $backupPath -Force
Write-JsonUtf8NoBom -Value $config -Path $configPath

Write-Host 'Allowlist Desktop Commander berhasil diterapkan:' -ForegroundColor Green
$paths | ForEach-Object { Write-Host "  + $_" }
Write-Host "Config: $configPath"
exit 0
