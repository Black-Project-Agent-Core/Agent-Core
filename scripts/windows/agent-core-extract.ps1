[CmdletBinding()]
param(
  [string]$ArchivePath = '',
  [string]$Destination = '',
  [string]$SearchDirectory = '',
  [switch]$ContractOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SearchDirectory) { $SearchDirectory = $scriptDir }
$SearchDirectory = [IO.Path]::GetFullPath($SearchDirectory)
$controllerRelative = 'SubProject\Agent-Code\Agent Code Native.exe'
$controllerEntry = 'Agent-Core/SubProject/Agent-Code/Agent Code Native.exe'

function Write-JsonResult($Value) {
  Write-Output ($Value | ConvertTo-Json -Depth 8 -Compress)
}

if ($ContractOnly) {
  Write-JsonResult ([ordered]@{
    archivePattern = 'Agent-Core-Portable-*.zip'; checksumRequired = $true
    archiveRoot = 'Agent-Core'; controller = $controllerRelative
    startsController = $false; refusesExistingNonEmptyDestination = $true
  })
  exit 0
}
if (-not $ArchivePath) {
  $matches = @(Get-ChildItem -LiteralPath $SearchDirectory -Filter 'Agent-Core-Portable-*.zip' -File -ErrorAction SilentlyContinue)
  if ($matches.Count -ne 1) {
    throw "Expected exactly one Agent-Core-Portable-*.zip in $SearchDirectory, found $($matches.Count)."
  }
  $ArchivePath = $matches[0].FullName
}
$ArchivePath = [IO.Path]::GetFullPath($ArchivePath)
if (-not (Test-Path -LiteralPath $ArchivePath)) { throw "Archive not found: $ArchivePath" }
$checksumPath = $ArchivePath + '.sha256'
if (-not (Test-Path -LiteralPath $checksumPath)) { throw "Checksum sidecar not found: $checksumPath" }

$checksumLine = (Get-Content -LiteralPath $checksumPath -TotalCount 1).Trim()
$match = [regex]::Match($checksumLine, '^(?<hash>[0-9a-fA-F]{64})\s+')
if (-not $match.Success) { throw "Invalid checksum file: $checksumPath" }
$expectedHash = $match.Groups['hash'].Value.ToLowerInvariant()
$hashStream = [IO.File]::OpenRead($ArchivePath)
$hasher = [Security.Cryptography.SHA256]::Create()
try { $actualHash = [BitConverter]::ToString($hasher.ComputeHash($hashStream)).Replace('-','').ToLowerInvariant() }
finally { $hashStream.Dispose(); $hasher.Dispose() }
if ($expectedHash -ne $actualHash) { throw 'Archive SHA-256 verification failed. Extraction was aborted.' }

if (-not $Destination) {
  $Destination = Join-Path (Split-Path -Parent $ArchivePath) 'Agent-Core'
}
$Destination = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
if (Test-Path -LiteralPath $Destination) {
  if (@(Get-ChildItem -LiteralPath $Destination -Force -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "Destination already exists and is not empty: $Destination"
  }
}
$parent = Split-Path -Parent $Destination
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$tempRoot = $null
$packageRoot = $null

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::OpenRead($ArchivePath)
$zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read, $false)
try {
  $hasController = $false
  foreach ($entry in $zip.Entries) {
    $name = ([string]$entry.FullName).Replace('\','/')
    if (-not $name.StartsWith('Agent-Core/', [StringComparison]::OrdinalIgnoreCase)) {
      throw "Unsafe package entry outside Agent-Core root: $name"
    }
    if ($name.StartsWith('/') -or $name.Contains(':')) { throw "Unsafe absolute package entry: $name" }
    $segments = @($name.Split('/') | Where-Object { $_ -ne '' })
    if ($segments -contains '..' -or $segments -contains '.') { throw "Unsafe traversal package entry: $name" }
    if ($name -eq $controllerEntry) { $hasController = $true }
  }
  if (-not $hasController) { throw 'Archive is not a valid portable Agent Core package.' }
} finally {
  $zip.Dispose()
  $stream.Dispose()
}
$tempRoot = Join-Path $parent ('.agent-core-extract-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$packageRoot = Join-Path $tempRoot 'Agent-Core'
$stream = [IO.File]::OpenRead($ArchivePath)
$zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read, $false)
try {
  $tempPrefix = [IO.Path]::GetFullPath($tempRoot).TrimEnd('\') + '\'
  foreach ($entry in $zip.Entries) {
    $name = ([string]$entry.FullName).Replace('\','/')
    $target = [IO.Path]::GetFullPath((Join-Path $tempRoot $name.Replace('/','\')))
    if (-not $target.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Package entry escaped extraction root: $name"
    }
    if (-not $entry.Name) {
      New-Item -ItemType Directory -Path $target -Force | Out-Null
      continue
    }
    $targetDir = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
    $source = $entry.Open()
    $output = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $source.CopyTo($output) } finally { $output.Dispose(); $source.Dispose() }
  }
} finally {
  $zip.Dispose()
  $stream.Dispose()
}

if (-not (Test-Path -LiteralPath $packageRoot)) { throw 'Extracted package root is missing.' }
foreach ($rel in @('runtime\tray','runtime\launcher','runtime\tools','runtime\transfer','runtime\agent-code-controller')) {
  Remove-Item -LiteralPath (Join-Path $packageRoot $rel) -Recurse -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath (Join-Path $packageRoot 'runtime\bootstrap\install-state.json') -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
Move-Item -LiteralPath $packageRoot -Destination $Destination
Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue

$controllerPath = Join-Path $Destination $controllerRelative
if (-not (Test-Path -LiteralPath $controllerPath)) {
  throw "Extracted Agent Core lifecycle controller is missing: $controllerPath"
}

Write-JsonResult ([ordered]@{
  status = 'extracted'; archivePath = $ArchivePath; checksumVerified = $true
  destination = $Destination; controller = $controllerPath; started = $false
})
