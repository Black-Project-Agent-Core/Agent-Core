param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstanceFile = Join-Path $Root 'RDC-INSTANCE.txt'
if (Test-Path -LiteralPath $InstanceFile) {
    $InstanceName = (Get-Content -Raw -LiteralPath $InstanceFile).Trim()
} else {
    $InstanceName = Split-Path $Root -Leaf
}
if ([string]::IsNullOrWhiteSpace($InstanceName)) { throw 'Nama instance RDC kosong.' }

$State       = Join-Path $Root '.rdc-standalone'
$NodeHome    = Join-Path $State 'runtime\node'
$NodeExe     = Join-Path $NodeHome 'node.exe'
$NpmCmd      = Join-Path $NodeHome 'npm.cmd'
$App         = Join-Path $State 'app'
$HomeDir     = Join-Path $State 'home'
$Cache       = Join-Path $State 'npm-cache'
$Prefix      = Join-Path $State 'npm-prefix'
$TempDir     = Join-Path $State 'tmp'
$Logs        = Join-Path $State 'logs'
$AppData     = Join-Path $HomeDir 'AppData\Roaming'
$LocalData   = Join-Path $HomeDir 'AppData\Local'
$DeviceFile  = Join-Path $HomeDir '.desktop-commander-device\device.json'
$DeviceLabel = Join-Path $State 'DEVICE-ID.txt'
$Version     = '0.2.51'
@($State,$App,$HomeDir,$Cache,$Prefix,$TempDir,$Logs,$AppData,$LocalData) |
    ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

if (!(Test-Path -LiteralPath $NodeExe)) {
    Write-Host "[ERROR] Node portable instance tidak ditemukan: $NodeExe" -ForegroundColor Red
    exit 10
}
if (!(Test-Path -LiteralPath $NpmCmd)) {
    Write-Host "[ERROR] npm portable instance tidak ditemukan: $NpmCmd" -ForegroundColor Red
    exit 11
}

$env:USERPROFILE = $HomeDir
$env:HOME = $HomeDir
$env:APPDATA = $AppData
$env:LOCALAPPDATA = $LocalData
$env:TEMP = $TempDir
$env:TMP = $TempDir
$env:NPM_CONFIG_CACHE = $Cache
$env:NPM_CONFIG_PREFIX = $Prefix
$env:NPM_CONFIG_USERCONFIG = Join-Path $State '.npmrc'
$env:NPM_CONFIG_UPDATE_NOTIFIER = 'false'
$env:NPM_CONFIG_FUND = 'false'
$env:NPM_CONFIG_AUDIT = 'false'
$env:PUPPETEER_CACHE_DIR = Join-Path $State 'puppeteer-cache'
$env:PATH = "$NodeHome;$env:PATH"

$Entry = Join-Path $App 'node_modules\@wonderwhy-er\desktop-commander\dist\index.js'
$PackageJson = Join-Path $App 'node_modules\@wonderwhy-er\desktop-commander\package.json'
$needInstall = !(Test-Path -LiteralPath $Entry)
if (!$needInstall -and (Test-Path -LiteralPath $PackageJson)) {
    try {
        $installedVersion = (Get-Content -Raw -LiteralPath $PackageJson | ConvertFrom-Json).version
        if ($installedVersion -ne $Version) { $needInstall = $true }
    } catch { $needInstall = $true }
}

if ($needInstall) {
    Write-Host "[INSTALL] $InstanceName -> Desktop Commander $Version" -ForegroundColor Cyan
    $localPackage = Join-Path $App 'package.json'
    if (!(Test-Path -LiteralPath $localPackage)) {
        '{"private":true}' | Set-Content -Encoding ASCII -LiteralPath $localPackage
    }
    & $NpmCmd install --prefix $App --no-package-lock --no-audit --no-fund --save-exact "@wonderwhy-er/desktop-commander@$Version"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Instalasi RDC gagal untuk $InstanceName." -ForegroundColor Red
        exit 20
    }
}

if (!(Test-Path -LiteralPath $Entry)) {
    Write-Host "[ERROR] Entry point RDC tidak ditemukan setelah install: $Entry" -ForegroundColor Red
    exit 21
}

$mutexSeed = $Root.ToLowerInvariant()
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $hashBytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($mutexSeed))
    $hash = ([BitConverter]::ToString($hashBytes)).Replace('-', '')
} finally {
    $sha.Dispose()
}
$mutexName = 'Global\RDC_' + $hash.Substring(0,24)
$createdNew = $false
$mutex = [Threading.Mutex]::new($true, $mutexName, [ref]$createdNew)
if (!$createdNew) {
    Write-Host "[ERROR] RDC $InstanceName sudah sedang berjalan." -ForegroundColor Yellow
    $mutex.Dispose()
    exit 30
}

$deviceId = $null
if (Test-Path -LiteralPath $DeviceFile) {
    try {
        $deviceId = (Get-Content -Raw -LiteralPath $DeviceFile | ConvertFrom-Json).deviceId
        if ($deviceId) { $deviceId | Set-Content -Encoding ASCII -NoNewline -LiteralPath $DeviceLabel }
    } catch {}
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor DarkGray
Write-Host "RDC STANDALONE : $InstanceName" -ForegroundColor Green
Write-Host "ROOT           : $Root"
Write-Host "NODE           : $NodeExe"
Write-Host "STATE          : $State"
if ($deviceId) { Write-Host "DEVICE ID      : $deviceId" -ForegroundColor Green }
else { Write-Host 'DEVICE ID      : belum ada - dibuat saat pairing pertama' -ForegroundColor Yellow }
Write-Host '============================================================' -ForegroundColor DarkGray
Write-Host ''

if ($PrepareOnly) {
    Write-Host '[OK] Prepare-only selesai. RDC tidak dijalankan.' -ForegroundColor Green
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
    exit 0
}

Push-Location $Root
try {
    & $NodeExe $Entry remote
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
    try { $mutex.ReleaseMutex() | Out-Null } catch {}
    $mutex.Dispose()
}

if (Test-Path -LiteralPath $DeviceFile) {
    try {
        $finalId = (Get-Content -Raw -LiteralPath $DeviceFile | ConvertFrom-Json).deviceId
        if ($finalId) { $finalId | Set-Content -Encoding ASCII -NoNewline -LiteralPath $DeviceLabel }
    } catch {}
}

exit $exitCode
