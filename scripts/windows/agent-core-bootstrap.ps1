[CmdletBinding()]
param(
  [switch]$ContractOnly,
  [switch]$PrepareOnly,
  [switch]$NoDownload,
  [string]$Root = '',
  [string]$LocalAppDataRoot = '',
  [string]$NodeExeOverride = '',
  [string]$NpmExeOverride = '',
  [string]$TunnelExeOverride = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolvedRoot = if ($Root) { [IO.Path]::GetFullPath($Root) } else { [IO.Path]::GetFullPath((Join-Path $scriptDir '..\..')) }
$minimumNodeVersion = [Version]'24.15.0'
$preferredNodeVersion = '24.16.0'
$tunnelClientVersion = '0.0.13'
$nodeBaseUrl = 'https://nodejs.org/dist'
$tunnelReleaseBaseUrl = "https://github.com/openai/tunnel-client/releases/download/v$tunnelClientVersion"
$bootstrapSchemaVersion = 1

function Get-PortableArchitecture {
  $raw = [string]$env:PROCESSOR_ARCHITECTURE
  if ($raw -match 'ARM64') { return [pscustomobject]@{ node = 'arm64'; tunnel = 'arm64'; identity = 'arm64' } }
  if ([Environment]::Is64BitOperatingSystem) { return [pscustomobject]@{ node = 'x64'; tunnel = 'amd64'; identity = 'x64' } }
  throw 'UNSUPPORTED_ARCHITECTURE: Agent Core requires 64-bit Windows.'
}
function Get-CurrentUserSid {
  try { return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value } catch { return [Environment]::UserName }
}

function Test-VersionAtLeast {
  param([string]$Actual, [Version]$Minimum)
  try { return ([Version]$Actual.Trim().TrimStart('v')) -ge $Minimum } catch { return $false }
}

function Get-NodeVersion {
  param([string]$Executable)
  if (-not $Executable -or -not (Test-Path -LiteralPath $Executable)) { return $null }
  try {
    $output = @(& $Executable --version 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -lt 1) { return $null }
    return ([string]$output[0]).Trim().TrimStart('v')
  } catch { return $null }
}

function Resolve-ExistingExecutable {
  param([string[]]$Candidates)
  foreach ($candidate in $Candidates) {
    if (-not $candidate) { continue }
    try {
      if (Test-Path -LiteralPath $candidate) { return [IO.Path]::GetFullPath($candidate) }
    } catch {}
  }
  return $null
}
function Get-CommandPath {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $command) { return $null }
  $path = if ($command.Source) { $command.Source } else { $command.Path }
  if ($path -and (Test-Path -LiteralPath $path)) { return [IO.Path]::GetFullPath($path) }
  return $null
}

function Get-NpmForNode {
  param([string]$NodeExe, [string]$Override)
  if ($Override -and (Test-Path -LiteralPath $Override)) { return [IO.Path]::GetFullPath($Override) }
  $environmentNpm = [Environment]::GetEnvironmentVariable('AGENT_CORE_NPM_EXE','Process')
  if ($environmentNpm -and (Test-Path -LiteralPath $environmentNpm)) { return [IO.Path]::GetFullPath($environmentNpm) }
  if ($NodeExe) {
    $sibling = Join-Path (Split-Path -Parent $NodeExe) 'npm.cmd'
    if (Test-Path -LiteralPath $sibling) { return [IO.Path]::GetFullPath($sibling) }
  }
  return Get-CommandPath 'npm.cmd'
}

function Get-ChecksumForFile {
  param([string]$ManifestPath, [string]$FileName)
  foreach ($line in @(Get-Content -LiteralPath $ManifestPath -ErrorAction Stop)) {
    if ($line -match ('^([A-Fa-f0-9]{64})\s+\*?' + [regex]::Escape($FileName) + '$')) { return $Matches[1].ToLowerInvariant() }
  }
  throw "CHECKSUM_ENTRY_MISSING: $FileName"
}
function Invoke-VerifiedArchiveInstall {
  param(
    [string]$ArchiveUrl,
    [string]$ChecksumUrl,
    [string]$ArchiveName,
    [string]$Destination,
    [string]$ExpectedExecutableRelativePath
  )
  $downloadRoot = Join-Path $resolvedRoot 'runtime\bootstrap\downloads'
  $stagingRoot = Join-Path $resolvedRoot ('runtime\bootstrap\staging-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
  $archivePath = Join-Path $downloadRoot $ArchiveName
  $checksumPath = Join-Path $downloadRoot ($ArchiveName + '.checksums.txt')
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $ChecksumUrl -OutFile $checksumPath -TimeoutSec 60
    Invoke-WebRequest -UseBasicParsing -Uri $ArchiveUrl -OutFile $archivePath -TimeoutSec 180
    $expected = Get-ChecksumForFile $checksumPath $ArchiveName
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "CHECKSUM_MISMATCH: $ArchiveName" }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $stagingRoot -Force
    $candidate = Join-Path $stagingRoot $ExpectedExecutableRelativePath
    if (-not (Test-Path -LiteralPath $candidate)) { throw "ARCHIVE_LAYOUT_INVALID: $ExpectedExecutableRelativePath" }
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    Move-Item -LiteralPath (Split-Path -Parent $candidate) -Destination $Destination -Force
  } finally {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
function Install-PortableNode {
  param($Architecture)
  $folder = "node-v$preferredNodeVersion-win-$($Architecture.node)"
  $destination = Join-Path $resolvedRoot ("runtime\tools\$folder")
  $nodeExe = Join-Path $destination 'node.exe'
  if (Test-VersionAtLeast (Get-NodeVersion $nodeExe) $minimumNodeVersion) { return $nodeExe }
  if ($NoDownload) { throw 'NODE_RUNTIME_UNAVAILABLE: compatible Node.js not found and downloads are disabled.' }
  $archive = "$folder.zip"
  Invoke-VerifiedArchiveInstall `
    -ArchiveUrl "$nodeBaseUrl/v$preferredNodeVersion/$archive" `
    -ChecksumUrl "$nodeBaseUrl/v$preferredNodeVersion/SHASUMS256.txt" `
    -ArchiveName $archive -Destination $destination `
    -ExpectedExecutableRelativePath "$folder\node.exe"
  if (-not (Test-VersionAtLeast (Get-NodeVersion $nodeExe) $minimumNodeVersion)) {
    throw 'NODE_RUNTIME_INVALID: downloaded Node.js does not satisfy Agent Core requirements.'
  }
  return $nodeExe
}

function Resolve-NodeRuntime {
  param($Architecture)
  $localNode = Join-Path $resolvedRoot ("runtime\tools\node-v$preferredNodeVersion-win-$($Architecture.node)\node.exe")
  $candidates = @($NodeExeOverride, [Environment]::GetEnvironmentVariable('AGENT_CORE_NODE_EXE','Process'), (Get-CommandPath 'node.exe'), $localNode)
  foreach ($candidate in $candidates) {
    if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) { continue }
    $version = Get-NodeVersion $candidate
    if (-not (Test-VersionAtLeast $version $minimumNodeVersion)) { continue }
    $npm = Get-NpmForNode $candidate $NpmExeOverride
    if ($npm) { return [pscustomobject]@{ nodeExe=[IO.Path]::GetFullPath($candidate); npmExe=$npm; version=$version } }
  }
  $installedNode = Install-PortableNode $Architecture
  $installedNpm = Get-NpmForNode $installedNode ''
  if (-not $installedNpm) { throw 'NPM_RUNTIME_UNAVAILABLE: portable Node.js installation did not provide npm.cmd.' }
  return [pscustomobject]@{ nodeExe=$installedNode; npmExe=$installedNpm; version=(Get-NodeVersion $installedNode) }
}

function Install-PortableTunnelClient {
  param($Architecture)
  $assetBase = "tunnel-client-v$tunnelClientVersion-windows-$($Architecture.tunnel)"
  $destination = Join-Path $resolvedRoot ("runtime\tools\$assetBase")
  $exe = Join-Path $destination 'tunnel-client.exe'
  if (Test-Path -LiteralPath $exe) { return $exe }
  if ($NoDownload) { throw 'TUNNEL_RUNTIME_UNAVAILABLE: tunnel-client not found and downloads are disabled.' }
  $archive = "$assetBase.zip"
  Invoke-VerifiedArchiveInstall `
    -ArchiveUrl "$tunnelReleaseBaseUrl/$archive" `
    -ChecksumUrl "$tunnelReleaseBaseUrl/SHA256SUMS.txt" `
    -ArchiveName $archive -Destination $destination `
    -ExpectedExecutableRelativePath 'tunnel-client.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw 'TUNNEL_RUNTIME_INVALID: downloaded tunnel-client archive is unusable.' }
  return $exe
}

function Resolve-TunnelClient {
  param($Architecture)
  $local = Join-Path $resolvedRoot ("runtime\tools\tunnel-client-v$tunnelClientVersion-windows-$($Architecture.tunnel)\tunnel-client.exe")
  $bundled = Join-Path $resolvedRoot 'tunnel-client\tunnel-client.exe'
  $candidate = Resolve-ExistingExecutable @($TunnelExeOverride, [Environment]::GetEnvironmentVariable('AGENT_CORE_TUNNEL_EXE','Process'), $bundled, $local, (Get-CommandPath 'tunnel-client.exe'))
  if ($candidate) { return $candidate }
  return Install-PortableTunnelClient $Architecture
}
function Test-SamePath {
  param([string]$Left, [string]$Right)
  if (-not $Left -or -not $Right) { return $false }
  try {
    return [string]::Equals([IO.Path]::GetFullPath($Left).TrimEnd('\'), [IO.Path]::GetFullPath($Right).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
  } catch { return $false }
}

$architecture = Get-PortableArchitecture
if (-not $LocalAppDataRoot) {
  $LocalAppDataRoot = [Environment]::GetEnvironmentVariable('LOCALAPPDATA','Process')
  if (-not $LocalAppDataRoot) { $LocalAppDataRoot = [Environment]::GetFolderPath('LocalApplicationData') }
}
$locatorDir = Join-Path ([IO.Path]::GetFullPath($LocalAppDataRoot)) 'AgentCore'
$locatorRootFile = Join-Path $locatorDir 'root.txt'
$locatorScript = Join-Path $locatorDir 'launch-current.ps1'
$bootstrapDir = Join-Path $resolvedRoot 'runtime\bootstrap'
$installStatePath = Join-Path $bootstrapDir 'install-state.json'

$contract = [ordered]@{
  schemaVersion = $bootstrapSchemaVersion
  root = $resolvedRoot
  minimumNodeVersion = $minimumNodeVersion.ToString()
  preferredNodeVersion = $preferredNodeVersion
  tunnelClientVersion = $tunnelClientVersion
  architecture = $architecture.identity
  nodeBaseUrl = $nodeBaseUrl
  tunnelReleaseBaseUrl = $tunnelReleaseBaseUrl
  locatorRootFile = $locatorRootFile
  installStatePath = $installStatePath
}
if ($ContractOnly) { Write-Output ($contract | ConvertTo-Json -Compress); exit 0 }
$machine = [Environment]::MachineName
$userSid = Get-CurrentUserSid
$previous = $null
if (Test-Path -LiteralPath $installStatePath) {
  try { $previous = Get-Content -LiteralPath $installStatePath -Raw | ConvertFrom-Json } catch { $previous = $null }
}
$firstInstall = (-not $previous)
$relocated = $false
if ($previous) {
  $sameSchema = ($previous.PSObject.Properties['schemaVersion'] -and [int]$previous.schemaVersion -eq $bootstrapSchemaVersion)
  $sameRoot = ($previous.PSObject.Properties['root'] -and (Test-SamePath ([string]$previous.root) $resolvedRoot))
  $sameMachine = ($previous.PSObject.Properties['machine'] -and [string]$previous.machine -eq $machine)
  $sameUser = ($previous.PSObject.Properties['userSid'] -and [string]$previous.userSid -eq $userSid)
  $sameArch = ($previous.PSObject.Properties['architecture'] -and [string]$previous.architecture -eq $architecture.identity)
  $relocated = -not ($sameSchema -and $sameRoot -and $sameMachine -and $sameUser -and $sameArch)
}

if ($relocated) {
  $ephemeral = @(
    (Join-Path $resolvedRoot 'runtime\tray\state.json'),
    (Join-Path $resolvedRoot 'runtime\tray\exit.request'),
    (Join-Path $resolvedRoot 'runtime\tray\agent-core.shutdown.request'),
    (Join-Path $resolvedRoot 'runtime\tray\multiroot-restart-result.json')
  )
  foreach ($path in $ephemeral) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
  $tempDir = Join-Path $resolvedRoot 'runtime\launcher\tmp'
  if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
New-Item -ItemType Directory -Path $locatorDir -Force | Out-Null
[IO.File]::WriteAllText($locatorRootFile, $resolvedRoot, (New-Object Text.UTF8Encoding($false)))
$shimLines = @(
  'Set-StrictMode -Version Latest',
  '$ErrorActionPreference = ''Stop''',
  '$stateDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
  '$rootFile = Join-Path $stateDir ''root.txt''',
  'if (-not (Test-Path -LiteralPath $rootFile)) { exit 2 }',
  '$root = [IO.File]::ReadAllText($rootFile).Trim()',
  '$launcher = Join-Path $root ''scripts\windows\agent-core-launcher.ps1''',
  'if (-not (Test-Path -LiteralPath $launcher)) { exit 3 }',
  '& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $launcher -Autostart',
  'exit $LASTEXITCODE'
)
[IO.File]::WriteAllText($locatorScript, ($shimLines -join [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))

$nodeRuntime = Resolve-NodeRuntime $architecture
$tunnelExe = Resolve-TunnelClient $architecture
New-Item -ItemType Directory -Path $bootstrapDir -Force | Out-Null
$installState = [ordered]@{
  schemaVersion = $bootstrapSchemaVersion
  root = $resolvedRoot
  machine = $machine
  userSid = $userSid
  architecture = $architecture.identity
  nodeVersion = $nodeRuntime.version
  updatedAt = [DateTime]::UtcNow.ToString('o')
}
[IO.File]::WriteAllText($installStatePath, (($installState | ConvertTo-Json -Depth 4) + [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
$result = [ordered]@{
  status = 'ready'
  root = $resolvedRoot
  firstInstall = $firstInstall
  relocated = $relocated
  architecture = $architecture.identity
  nodeExe = $nodeRuntime.nodeExe
  npmExe = $nodeRuntime.npmExe
  nodeVersion = $nodeRuntime.version
  tunnelExe = $tunnelExe
  locatorRootFile = $locatorRootFile
  installStatePath = $installStatePath
}
Write-Output ($result | ConvertTo-Json -Compress)
