param(
    [string]$ProjectRoot = '',
    [switch]$ForceRepair
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Resolve-AgentCoreRoot([string]$Candidate) {
    if ($Candidate) {
        $current = [IO.Path]::GetFullPath($Candidate)
    } else {
        $current = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    }
    while ($current) {
        $package = Join-Path $current 'package.json'
        $tunnel = Join-Path $current 'tunnel-client\agent-core.yaml'
        $ui = Join-Path $current 'dist\ui'
        if ((Test-Path -LiteralPath $package -PathType Leaf) -and
            (Test-Path -LiteralPath $tunnel -PathType Leaf) -and
            (Test-Path -LiteralPath $ui -PathType Container)) {
            return $current.TrimEnd('\')
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
    throw 'Agent Core project root could not be located.'
}
function Assert-ProjectPath([string]$Root, [string]$Path) {
    $rootPrefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing write outside Agent Core project root: $fullPath"
    }
    return $fullPath
}

function Get-NodeVersion([string]$NodeExe) {
    if (-not (Test-Path -LiteralPath $NodeExe -PathType Leaf)) { return $null }
    try {
        $raw = (& $NodeExe --version 2>$null).Trim().TrimStart('v')
        return [Version]$raw
    } catch {
        return $null
    }
}

$ProjectRoot = Resolve-AgentCoreRoot $ProjectRoot
$packageJson = Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
$engine = [string]$packageJson.engines.node
if ($engine -notmatch '^\s*>=\s*(\d+\.\d+\.\d+)\s*$') {
    throw "Unsupported package.json engines.node contract: $engine"
}
$minimumVersion = [Version]$Matches[1]

$runtimeRoot = Assert-ProjectPath $ProjectRoot (Join-Path $ProjectRoot 'runtime')
$nodeRoot = Assert-ProjectPath $ProjectRoot (Join-Path $runtimeRoot 'node')
$downloadRoot = Assert-ProjectPath $ProjectRoot (Join-Path $runtimeRoot 'downloads')
$tempRoot = Assert-ProjectPath $ProjectRoot (Join-Path $runtimeRoot 'tmp')
$npmCache = Assert-ProjectPath $ProjectRoot (Join-Path $runtimeRoot 'npm-cache')
$npmPrefix = Assert-ProjectPath $ProjectRoot (Join-Path $runtimeRoot 'npm-prefix')
$playwrightCache = Assert-ProjectPath $ProjectRoot (Join-Path $runtimeRoot 'playwright')
foreach ($dir in @($runtimeRoot, $downloadRoot, $tempRoot, $npmCache, $npmPrefix, $playwrightCache)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$env:TEMP = $tempRoot
$env:TMP = $tempRoot
$env:npm_config_cache = $npmCache
$env:npm_config_prefix = $npmPrefix
$env:PLAYWRIGHT_BROWSERS_PATH = $playwrightCache

$nodeExe = Join-Path $nodeRoot 'node.exe'
$npmCmd = Join-Path $nodeRoot 'npm.cmd'
$npxCmd = Join-Path $nodeRoot 'npx.cmd'
$currentVersion = Get-NodeVersion $nodeExe
$runtimeHealthy = $currentVersion -and
    $currentVersion -ge $minimumVersion -and
    (Test-Path -LiteralPath $npmCmd -PathType Leaf) -and
    (Test-Path -LiteralPath $npxCmd -PathType Leaf)

if ($runtimeHealthy -and -not $ForceRepair) {
    Write-Host "LOCAL RUNTIME HEALTHY: Node v$currentVersion" -ForegroundColor Green
    Write-Host "Node: $nodeExe"
    exit 0
}
$architecture = switch ($env:PROCESSOR_ARCHITECTURE.ToUpperInvariant()) {
    'AMD64' { 'x64' }
    'ARM64' { 'arm64' }
    default { throw "Unsupported Windows architecture: $env:PROCESSOR_ARCHITECTURE" }
}

Write-Host "Repairing project-local Node runtime (minimum v$minimumVersion, arch $architecture)..." -ForegroundColor Yellow
$releaseIndex = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
$release = $releaseIndex |
    Where-Object {
        $candidate = [Version]($_.version.TrimStart('v'))
        $candidate.Major -eq $minimumVersion.Major -and
        $candidate -ge $minimumVersion -and
        $_.files -contains "win-$architecture-zip"
    } |
    Sort-Object { [Version]($_.version.TrimStart('v')) } -Descending |
    Select-Object -First 1
if (-not $release) {
    throw "No official Node.js Windows $architecture release satisfies $engine within major $($minimumVersion.Major)."
}

$versionText = [string]$release.version
$archiveName = "node-$versionText-win-$architecture.zip"
$baseUri = "https://nodejs.org/dist/$versionText"
$archivePath = Assert-ProjectPath $ProjectRoot (Join-Path $downloadRoot $archiveName)
$checksumsPath = Assert-ProjectPath $ProjectRoot (Join-Path $downloadRoot "SHASUMS256-$versionText.txt")

Invoke-WebRequest -Uri "$baseUri/$archiveName" -OutFile $archivePath -UseBasicParsing
Invoke-WebRequest -Uri "$baseUri/SHASUMS256.txt" -OutFile $checksumsPath -UseBasicParsing
$checksumLine = Get-Content -LiteralPath $checksumsPath |
    Where-Object { $_ -match "\s+$([regex]::Escape($archiveName))$" } |
    Select-Object -First 1
if (-not $checksumLine) {
    throw "Official checksum entry not found for $archiveName"
}
$expectedHash = ($checksumLine -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    throw "Node.js archive checksum mismatch for $archiveName"
}

$staging = Assert-ProjectPath $ProjectRoot (Join-Path $tempRoot ("node-install-" + [guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
try {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $staging -Force
    $expanded = Get-ChildItem -LiteralPath $staging -Directory | Select-Object -First 1
    if (-not $expanded) { throw 'Node.js archive did not contain an install directory.' }

    $candidateNode = Join-Path $expanded.FullName 'node.exe'
    $candidateNpm = Join-Path $expanded.FullName 'npm.cmd'
    $candidateNpx = Join-Path $expanded.FullName 'npx.cmd'
    $candidateVersion = Get-NodeVersion $candidateNode
    if (-not $candidateVersion -or $candidateVersion -lt $minimumVersion -or
        -not (Test-Path -LiteralPath $candidateNpm -PathType Leaf) -or
        -not (Test-Path -LiteralPath $candidateNpx -PathType Leaf)) {
        throw 'Downloaded Node.js runtime failed health validation.'
    }
    $backup = $null
    if (Test-Path -LiteralPath $nodeRoot) {
        $backup = Assert-ProjectPath $ProjectRoot (Join-Path $runtimeRoot ("node.previous-" + (Get-Date -Format 'yyyyMMdd-HHmmss')))
        Move-Item -LiteralPath $nodeRoot -Destination $backup -Force
    }
    try {
        Move-Item -LiteralPath $expanded.FullName -Destination $nodeRoot -Force
        $installedVersion = Get-NodeVersion (Join-Path $nodeRoot 'node.exe')
        if (-not $installedVersion -or $installedVersion -lt $minimumVersion) {
            throw 'Installed project-local Node.js runtime failed final validation.'
        }
        if ($backup -and (Test-Path -LiteralPath $backup)) {
            Remove-Item -LiteralPath $backup -Recurse -Force
        }
    } catch {
        if (Test-Path -LiteralPath $nodeRoot) {
            Remove-Item -LiteralPath $nodeRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
        if ($backup -and (Test-Path -LiteralPath $backup)) {
            Move-Item -LiteralPath $backup -Destination $nodeRoot -Force
        }
        throw
    }
} finally {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
$finalVersion = Get-NodeVersion (Join-Path $nodeRoot 'node.exe')
Write-Host "LOCAL RUNTIME REPAIRED: Node v$finalVersion" -ForegroundColor Green
Write-Host "Project root: $ProjectRoot"
Write-Host "Project drive: $([IO.Path]::GetPathRoot($ProjectRoot))"
Write-Host "Node: $(Join-Path $nodeRoot 'node.exe')"
Write-Host "npm cache: $npmCache"
Write-Host "temp: $tempRoot"
exit 0
