[CmdletBinding()]
param(
  [string]$Root = '',
  [string]$OutputDirectory = '',
  [switch]$NoRestart,
  [switch]$SkipProcessStop,
  [switch]$ContractOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Root) { $Root = [IO.Path]::GetFullPath((Join-Path $scriptDir '..\..')) }
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$archiveRoot = 'Agent-Core'
$exclusions = @(
  'node_modules', '.worktrees', 'runtime/tray', 'runtime/launcher', 'runtime/tools',
  'runtime/transfer', 'runtime/logs', 'runtime/bootstrap/install-state.json',
  '.git/worktrees', 'dist/.desktop-commander'
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
  foreach ($prefix in @('runtime/tray','runtime/launcher','runtime/tools','runtime/transfer','runtime/logs','.git/worktrees','dist/.desktop-commander')) {
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
      if ($item.PSIsContainer) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
        $queue.Enqueue($item.FullName)
        continue
      }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
      Write-Output $item.FullName
    }
  }
}

function Get-RootOwnedProcesses {
  $trayPath = [IO.Path]::GetFullPath((Join-Path $Root 'scripts\windows\agent-core-tray.ps1'))
  $agentEntry = [IO.Path]::GetFullPath((Join-Path $Root 'dist\index.js'))
  $tunnelProfile = [IO.Path]::GetFullPath((Join-Path $Root 'tunnel-client\agent-core.yaml'))
  $results = @()
  foreach ($process in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
    $cmd = [string]$process.CommandLine
    if (-not $cmd) { continue }
    $role = $null
    if ($cmd.IndexOf($trayPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $cmd -match 'agent-core-tray\.ps1') {
      $role = 'tray'
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

function Stop-AgentCoreForPack {
  $owned = @(Get-RootOwnedProcesses)
  if ($owned.Count -eq 0) { return [pscustomobject]@{ detected = 0; forced = 0 } }
  $trayRuntime = Join-Path $Root 'runtime\tray'
  New-Item -ItemType Directory -Path $trayRuntime -Force | Out-Null
  $exitRequest = Join-Path $trayRuntime 'exit.request'
  $trayCount = @($owned | Where-Object role -eq 'tray').Count
  $graceSeconds = 25
  if ($trayCount -gt 0) {
    [IO.File]::WriteAllText($exitRequest, "exit`n", (New-Object Text.UTF8Encoding($false)))
  } else {
    $trayScript = Join-Path $Root 'scripts\windows\agent-core-tray.ps1'
    if (Test-Path -LiteralPath $trayScript) {
      try {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $trayScript -Mode StopBundle *> $null
      } catch {}
      $graceSeconds = 8
    } else {
      $graceSeconds = 1
    }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds($graceSeconds)
  do {
    Start-Sleep -Milliseconds 250
    $remaining = @(Get-RootOwnedProcesses)
    if ($remaining.Count -eq 0) { break }
  } while ([DateTime]::UtcNow -lt $deadline)

  $forced = 0
  $remaining = @(Get-RootOwnedProcesses)
  foreach ($process in $remaining) {
    Stop-Process -Id ([int]$process.pid) -ErrorAction SilentlyContinue
  }
  if ($remaining.Count -gt 0) { Start-Sleep -Seconds 2 }
  foreach ($process in @(Get-RootOwnedProcesses)) {
    Stop-Process -Id ([int]$process.pid) -Force -ErrorAction SilentlyContinue
    $forced += 1
  }
  Start-Sleep -Milliseconds 300
  $stillRunning = @(Get-RootOwnedProcesses)
  if ($stillRunning.Count -gt 0) {
    throw ('Agent Core processes could not be stopped safely: ' + (($stillRunning | ForEach-Object { "$($_.role):$($_.pid)" }) -join ', '))
  }
  Remove-Item -LiteralPath $exitRequest -Force -ErrorAction SilentlyContinue
  return [pscustomobject]@{ detected = $owned.Count; forced = $forced }
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
    root = $Root; archiveRoot = $archiveRoot; restartAfterPack = $true; checksumSidecar = $true
    exclusions = $exclusions; packLockPath = $packLockPath
  })
  exit 0
}

if (-not (Test-Path -LiteralPath $Root)) { throw "Agent Core root not found: $Root" }
if (Test-ExistingPackLock) { throw "Another Agent Core portable package operation is active: $packLockPath" }
New-Item -ItemType Directory -Path $transferRuntime -Force | Out-Null
$lockBody = [ordered]@{ schemaVersion = 1; active = $true; pid = $PID; machine = [Environment]::MachineName; startedAt = [DateTime]::UtcNow.ToString('o') }
[IO.File]::WriteAllText($packLockPath, ($lockBody | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
$restartRequested = -not $NoRestart
$archivePath = $null
$checksumPath = $null
$transferDirectory = $null
$stopResult = [pscustomobject]@{ detected = 0; forced = 0 }
$packSucceeded = $false
$restartStatus = 'not_requested'
try {
  if (-not $SkipProcessStop) { $stopResult = Stop-AgentCoreForPack }

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
        entryCount = $entryCount; exclusions = $exclusions
      }
      $writer.Write(($manifest | ConvertTo-Json -Depth 5 -Compress))
    } finally { $writer.Dispose() }
  } finally {
    $zip.Dispose()
    $stream.Dispose()
  }

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
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
  if ($restartRequested) {
    $launcher = Join-Path $Root 'scripts\windows\agent-core-launcher.ps1'
    if (Test-Path -LiteralPath $launcher) {
      try {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $launcher -SkipBuild
        $restartExit = $LASTEXITCODE
        $restartStatus = if ($restartExit -eq 0) { 'started' } else { "failed:$restartExit" }
      } catch {
        $restartStatus = 'failed:exception'
      }
    } else {
      $restartStatus = 'failed:launcher_missing'
    }
  }
}

if (-not $packSucceeded) { throw 'Agent Core portable package was not created.' }
if ($restartRequested -and $restartStatus -ne 'started') {
  Write-Warning "Archive is valid, but Agent Core restart did not complete: $restartStatus"
}
Write-JsonResult ([ordered]@{
  status = 'packed'; archivePath = $archivePath; checksumPath = $checksumPath
  transferDirectory = $transferDirectory; stoppedProcesses = $stopResult.detected
  forcedProcesses = $stopResult.forced; restarted = $restartStatus
})
