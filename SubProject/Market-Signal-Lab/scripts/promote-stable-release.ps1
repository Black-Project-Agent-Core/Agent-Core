param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,

    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),

    [string]$ExpectedSetupSha256 = '',
    [string]$ExpectedAppSha256 = '',
    [string]$ExpectedRustSha256 = ''
)

$ErrorActionPreference = 'Stop'

$source = (Resolve-Path -LiteralPath $SourceDir).Path
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$destination = Join-Path $root 'release-stable'
$staging = Join-Path $root ('release-stable.promoting.' + [guid]::NewGuid().ToString('N'))

$releaseFiles = @(
    'Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Setup.exe',
    'Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Windows_x64.zip',
    'Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Source.zip',
    'Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Browser_Companion.zip',
    'SHA256SUMS.txt',
    'RELEASE_NOTES.md'
)

$portableSource = Join-Path $source 'Market Signal Lab'
if (-not (Test-Path -LiteralPath $portableSource -PathType Container)) {
    throw "Portable source folder not found: $portableSource"
}

foreach ($name in $releaseFiles) {
    $path = Join-Path $source $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required release file not found: $path"
    }
}

function Normalize-Sha([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return '' }
    return $value.Trim().ToUpperInvariant()
}

function Assert-Hash([string]$path, [string]$expected, [string]$label) {
    $expected = Normalize-Sha $expected
    if (-not $expected) { return }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToUpperInvariant()
    if ($actual -ne $expected) {
        throw "$label SHA-256 mismatch. expected=$expected actual=$actual path=$path"
    }
}

$setupSource = Join-Path $source $releaseFiles[0]
$appSource = Join-Path $portableSource 'Market Signal Lab.exe'
$rustSource = Join-Path $portableSource 'engines\rust\msl-analytics-rust.exe'

if (-not (Test-Path -LiteralPath $appSource -PathType Leaf)) { throw "Portable app missing: $appSource" }
if (-not (Test-Path -LiteralPath $rustSource -PathType Leaf)) { throw "Portable Rust worker missing: $rustSource" }

Assert-Hash $setupSource $ExpectedSetupSha256 'Setup'
Assert-Hash $appSource $ExpectedAppSha256 'Portable app'
Assert-Hash $rustSource $ExpectedRustSha256 'Portable Rust worker'

New-Item -ItemType Directory -Path $staging -Force | Out-Null
try {
    foreach ($name in $releaseFiles) {
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $staging $name) -Force
    }

    $portableDestination = Join-Path $staging 'Portable'
    Copy-Item -LiteralPath $portableSource -Destination $portableDestination -Recurse -Force

    Assert-Hash (Join-Path $staging $releaseFiles[0]) $ExpectedSetupSha256 'Promoted Setup'
    Assert-Hash (Join-Path $portableDestination 'Market Signal Lab.exe') $ExpectedAppSha256 'Promoted portable app'
    Assert-Hash (Join-Path $portableDestination 'engines\rust\msl-analytics-rust.exe') $ExpectedRustSha256 'Promoted portable Rust worker'

    $manifestLines = Get-Content -LiteralPath (Join-Path $staging 'SHA256SUMS.txt')
    foreach ($line in $manifestLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^([A-Fa-f0-9]{64})\s+(.+)$') { throw "Invalid SHA256SUMS line: $line" }
        $expected = $matches[1].ToUpperInvariant()
        $name = $matches[2].Trim()
        $file = Join-Path $staging $name
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Manifest file missing after promotion: $name" }
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToUpperInvariant()
        if ($actual -ne $expected) { throw "Manifest SHA-256 mismatch after promotion: $name" }
    }

    $info = @(
        'Market Signal Lab stable local promotion',
        ('promotedAt=' + [DateTimeOffset]::Now.ToString('o')),
        ('source=' + $source),
        ('setupSha256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $staging $releaseFiles[0])).Hash),
        ('appSha256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $portableDestination 'Market Signal Lab.exe')).Hash),
        ('rustSha256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $portableDestination 'engines\rust\msl-analytics-rust.exe')).Hash),
        'canonicalRootRule=release-stable must not depend on a worktree path after promotion'
    )
    Set-Content -LiteralPath (Join-Path $staging 'PROMOTION_INFO.txt') -Value $info -Encoding UTF8

    if (Test-Path -LiteralPath $destination) {
        $backup = Join-Path $root ('release-stable.previous.' + [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss'))
        Move-Item -LiteralPath $destination -Destination $backup
        Write-Output "PREVIOUS_RELEASE_STABLE=$backup"
    }

    Move-Item -LiteralPath $staging -Destination $destination
    Write-Output 'PROMOTE_STABLE_RELEASE=PASS'
    Write-Output "DESTINATION=$destination"
    Write-Output "SETUP=$(Join-Path $destination $releaseFiles[0])"
    Write-Output "PORTABLE_APP=$(Join-Path $destination 'Portable\Market Signal Lab.exe')"
}
catch {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
    throw
}
