[CmdletBinding()]
param(
  [string]$Root = '',
  [string]$OutputDirectory = '',
  [switch]$ContractOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Root) { $Root = [IO.Path]::GetFullPath((Join-Path $scriptDir '..\..')) }
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$archiveRoot = 'Agent-Core'
$controllerRelative = 'SubProject\Agent-Code\Agent Code Native.exe'
$exclusions = @(
  'node_modules', '.worktrees', 'runtime/tray', 'runtime/launcher', 'runtime/tools',
  'runtime/transfer', 'runtime/logs', 'runtime/agent-code-controller',
  'runtime/bootstrap/install-state.json', '.git/worktrees', 'dist/.desktop-commander'
)
$transferRuntime = Join-Path $Root 'runtime\transfer'
$packLockPath = Join-Path $transferRuntime 'pack.lock'

function Write-JsonResult($Value) {
  Write-Output ($Value | ConvertTo-Json -Depth 8 -Compress)
}
function Get-RelativePathInsideRoot([string]$FullPath) {
  $full = [IO.Path]::GetFullPath($FullPath)
  $prefix = $Root + [IO.Path]::DirectorySeparatorChar
  if ([string]::Equals($full, $Root, [StringComparison]::OrdinalIgnoreCase)) { return '' }
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escaped Agent Core root: $full"
  }
  return $full.Substring($prefix.Length).Replace('\','/')
}

function Test-Excluded([string]$RelativePath) {
  $rel = $RelativePath.Replace('\','/').TrimStart('/')
  if (-not $rel) { return $false }
  $segments = @($rel.Split('/'))
  if ($segments -contains 'node_modules' -or $segments -contains '.worktrees') { return $true }
  foreach ($prefix in @('runtime/tray','runtime/launcher','runtime/tools','runtime/transfer','runtime/logs','runtime/agent-code-controller','.git/worktrees','dist/.desktop-commander')) {
    if ($rel -eq $prefix -or $rel.StartsWith($prefix + '/', [StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  if ($rel -eq 'runtime/bootstrap/install-state.json' -or $rel -eq '.git/index.lock') { return $true }
  return $false
}

function Get-PackFiles {
  $queue = New-Object 'Collections.Generic.Queue[string]'
  $queue.Enqueue($Root)
  while ($queue.Count -gt 0) {
    $dir = $queue.Dequeue()
    foreach ($item in @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop)) {
      $relative = Get-RelativePathInsideRoot $item.FullName
      if (Test-Excluded $relative) { continue }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
      if ($item.PSIsContainer) {
        $queue.Enqueue($item.FullName)
        continue
      }
      Write-Output $item.FullName
    }
  }
}

function Get-RootOwnedProcesses {
  $agentEntry = [IO.Path]::GetFullPath((Join-Path $Root 'dist\index.js'))
  $tunnelProfile = [IO.Path]::GetFullPath((Join-Path $Root 'tunnel-client\agent-core.yaml'))
  $controller = [IO.Path]::GetFullPath((Join-Path $Root $controllerRelative))
  $results = @()
  foreach ($process in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
    $cmd = [string]$process.CommandLine
    if (-not $cmd) { continue }
    $role = $null
    if ($cmd.IndexOf($controller, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      $role = 'agentCode'
    } elseif ($cmd.IndexOf($agentEntry, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      $role = 'agentCore'
    } elseif ($cmd.IndexOf($tunnelProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $cmd -match 'tunnel-client') {
      $role = 'tunnel'
    }
    if ($role) {
      $results += [pscustomobject]@{ pid = [int]$process.ProcessId; role = $role; name = [string]$process.Name }
    }
  }
  return @($results)
}

function Test-ExistingPackLock {
  if (-not (Test-Path -LiteralPath $packLockPath)) { return $false }
  try {
    $lock = Get-Content -LiteralPath $packLockPath -Raw | ConvertFrom-Json
    if ($lock.PSObject.Properties['pid'] -and $lock.PSObject.Properties['machine']) {
      if ([string]$lock.machine -eq [Environment]::MachineName -and (Get-Process -Id ([int]$lock.pid) -ErrorAction SilentlyContinue)) {
        return $true
      }
      Remove-Item -LiteralPath $packLockPath -Force -ErrorAction SilentlyContinue
      return $false
    }
  } catch {}
  return $true
}

if ($ContractOnly) {
  Write-JsonResult ([ordered]@{
    root = $Root; archiveRoot = $archiveRoot; checksumSidecar = $true
    controller = $controllerRelative; requiresStoppedRuntime = $true
    exclusions = $exclusions; packLockPath = $packLockPath
  })
  exit 0
}

if (-not (Test-Path -LiteralPath $Root)) { throw "Agent Core root not found: $Root" }
$controllerPath = Join-Path $Root $controllerRelative
if (-not (Test-Path -LiteralPath $controllerPath)) {
  throw "Agent Core lifecycle controller is missing, so the package would not be startable: $controllerPath"
}
if (Test-ExistingPackLock) { throw "Another Agent Core portable package operation is active: $packLockPath" }

$running = @(Get-RootOwnedProcesses)
if ($running.Count -gt 0) {
  $detail = ($running | ForEach-Object { "$($_.role):$($_.pid)" }) -join ', '
  throw "Agent Core is still running for this root ($detail). Stop it from Agent Code (Agent Core -> Exit Agent Core), close Agent Code, then pack again."
}

New-Item -ItemType Directory -Path $transferRuntime -Force | Out-Null
$lockBody = [ordered]@{ schemaVersion = 1; active = $true; pid = $PID; machine = [Environment]::MachineName; startedAt = [DateTime]::UtcNow.ToString('o') }
[IO.File]::WriteAllText($packLockPath, ($lockBody | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
$archivePath = $null
$checksumPath = $null
$transferDirectory = $null
$packSucceeded = $false
try {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  if ($OutputDirectory) {
    $transferDirectory = [IO.Path]::GetFullPath($OutputDirectory)
  } else {
    $parent = Split-Path -Parent $Root
    $transferDirectory = Join-Path $parent ("Agent-Core-Transfer-$stamp")
  }
  $rootPrefix = $Root + [IO.Path]::DirectorySeparatorChar
  if ($transferDirectory -eq $Root -or $transferDirectory.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputDirectory must be outside the Agent Core root so the archive cannot include itself.'
  }
  New-Item -ItemType Directory -Path $transferDirectory -Force | Out-Null
  $archivePath = Join-Path $transferDirectory ("Agent-Core-Portable-$stamp.zip")
  if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists: $archivePath" }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $stream = [IO.File]::Open($archivePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    $entryCount = 0
    foreach ($file in @(Get-PackFiles)) {
      $relative = Get-RelativePathInsideRoot $file
      $entryName = ($archiveRoot + '/' + $relative).Replace('\','/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
      $entryCount += 1
    }
    $manifestEntry = $zip.CreateEntry(($archiveRoot + '/.portable-package.json'), [IO.Compression.CompressionLevel]::Optimal)
    $writer = New-Object IO.StreamWriter($manifestEntry.Open(), (New-Object Text.UTF8Encoding($false)))
    try {
      $manifest = [ordered]@{
        schemaVersion = 1; packageType = 'agent-core-portable'; createdAt = [DateTime]::UtcNow.ToString('o')
        entryCount = $entryCount; controller = $controllerRelative; exclusions = $exclusions
      }
      $writer.Write(($manifest | ConvertTo-Json -Depth 5 -Compress))
    } finally { $writer.Dispose() }
  } finally {
    $zip.Dispose()
    $stream.Dispose()
  }

  $hashStream = [IO.File]::OpenRead($archivePath)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $hash = [BitConverter]::ToString($hasher.ComputeHash($hashStream)).Replace('-','').ToLowerInvariant() }
  finally { $hashStream.Dispose(); $hasher.Dispose() }
  $checksumPath = $archivePath + '.sha256'
  [IO.File]::WriteAllText($checksumPath, "$hash  $([IO.Path]::GetFileName($archivePath))`n", (New-Object Text.UTF8Encoding($false)))

  $extractBatSource = Join-Path $Root 'Extract-Agent-Core.bat'
  $extractPsSource = Join-Path $Root 'scripts\windows\agent-core-extract.ps1'
  if (-not (Test-Path -LiteralPath $extractBatSource) -or -not (Test-Path -LiteralPath $extractPsSource)) {
    throw 'Portable extractor files are missing from Agent Core.'
  }
  Copy-Item -LiteralPath $extractBatSource -Destination (Join-Path $transferDirectory 'Extract-Agent-Core.bat') -Force
  Copy-Item -LiteralPath $extractPsSource -Destination (Join-Path $transferDirectory 'agent-core-extract.ps1') -Force
  $packSucceeded = $true
} finally {
  Remove-Item -LiteralPath $packLockPath -Force -ErrorAction SilentlyContinue
}

if (-not $packSucceeded) { throw 'Agent Core portable package was not created.' }
Write-JsonResult ([ordered]@{
  status = 'packed'; archivePath = $archivePath; checksumPath = $checksumPath
  transferDirectory = $transferDirectory; controller = $controllerRelative
})
