#requires -Version 5.1
<#
.SYNOPSIS
Copies the built Source checkout into the Platform install. Dry-run unless -Apply is given.
.DESCRIPTION
Source is the git tree where code is edited, built and tested. Platform is the install that Agent Core.exe runs.
Run the build in Source first. This script copies; it never builds, restarts, commits or pushes.
After -Apply, run the Platform's Restart-Agent-Core.cmd once (see docs/instructions/release-and-refresh.md).

Mirrored (Platform copy is made identical, extra Platform files are removed):
  dist (except dist\ui), src (except node_modules, bin, obj), scripts, docs (except docs\proposals),
  subagents, extensions, vendor, assets.
Copied by name (no deletion): AGENTS.md, package.json, package-lock.json, CHANGELOG.md, README.md,
  THIRD_PARTY_NOTICES.md, Restart-Agent-Core.cmd, .env.example, .env.duanyan.example, .grafelignore.
Copied only when newer, never deleted: docs\proposals. Platform-only or newer proposals are listed so they
  can be copied back to Source by hand.
Never touched: runtime, secrets, .env, tunnel-client, node_modules, Agent Core.exe, .git, tests, release.

Every step is first listed with robocopy /L. Nothing is written if any step fails, if a mirrored Platform folder
contains a junction or symlink (robocopy /MIR deletes through them), or if the mirror would delete a node_modules,
bin or obj folder inside Platform (the /XD names protect those only while their parent folder exists in Source).
.PARAMETER PlatformRoot
Install to update. Default: the sibling folder named "Agent Core" next to the Source folder.
.PARAMETER Apply
Perform the copy after the listing passes. Without it nothing is written.
#>
[CmdletBinding()]
param([string]$PlatformRoot, [switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$source = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path.TrimEnd('\')
if (-not $PlatformRoot) { $PlatformRoot = Join-Path (Split-Path $source -Parent) 'Agent Core' }
$platform = (Resolve-Path -LiteralPath $PlatformRoot).Path.TrimEnd('\')
if ($platform -eq $source) { throw 'Source and Platform are the same folder.' }
foreach ($marker in 'package.json', 'tunnel-client\agent-core.yaml', 'dist\ui', 'Agent Core.exe') {
    if (-not (Test-Path -LiteralPath (Join-Path $platform $marker))) { throw "Not a Platform install (missing $marker): $platform" }
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'dist\index.js'))) { throw 'Source has no dist\index.js. Build Source first.' }

$mirrored = 'dist', 'src', 'docs', 'scripts', 'subagents', 'extensions', 'vendor', 'assets'
$links = foreach ($dir in $mirrored) {
    Get-ChildItem -LiteralPath (Join-Path $platform $dir) -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue
}
if ($links) { throw "Platform has a junction/symlink inside a mirrored folder; handle it first:`n$($links.FullName -join "`n")" }

$head = (git -C $source rev-parse --short HEAD) + $(if (git -C $source status --porcelain) { ' (uncommitted changes)' } else { '' })
$built = (Get-Item -LiteralPath (Join-Path $source 'dist\index.js')).LastWriteTime
Write-Host "$(if ($Apply) { 'APPLY' } else { 'DRY-RUN' })  Source $source  HEAD $head  dist built $built"
Write-Host "        Platform $platform"

function Join-S([string]$p) { Join-Path $source $p }
function Join-P([string]$p) { Join-Path $platform $p }
$steps = @(
    @{ Label = 'dist'; Args = @((Join-S 'dist'), (Join-P 'dist'), '/MIR', '/XD', (Join-S 'dist\ui'), (Join-P 'dist\ui')) }
    @{ Label = 'src'; Args = @((Join-S 'src'), (Join-P 'src'), '/MIR', '/XD', 'node_modules', 'bin', 'obj') }
    @{ Label = 'docs'; Args = @((Join-S 'docs'), (Join-P 'docs'), '/MIR', '/XD', (Join-S 'docs\proposals'), (Join-P 'docs\proposals')) }
)
foreach ($dir in 'scripts', 'subagents', 'extensions', 'vendor', 'assets') { $steps += @{ Label = $dir; Args = @((Join-S $dir), (Join-P $dir), '/MIR') } }
$steps += @{ Label = 'root files'; Args = @($source, $platform, 'AGENTS.md', 'package.json', 'package-lock.json', 'CHANGELOG.md', 'README.md',
    'THIRD_PARTY_NOTICES.md', 'Restart-Agent-Core.cmd', '.env.example', '.env.duanyan.example', '.grafelignore') }
$steps += @{ Label = 'docs\proposals (newer only)'; Args = @((Join-S 'docs\proposals'), (Join-P 'docs\proposals'), '*.md', '/XO') }

$common = '/R:0', '/W:0', '/NP', '/NJH', '/NJS'
$problems = 0
foreach ($step in $steps) {
    Write-Host "== $($step.Label)"
    $out = @(robocopy @($step.Args) @common /L)
    $code = $LASTEXITCODE
    $extra = @($out | Where-Object { $_ -match 'EXTRA (File|Dir)' })
    $copy = @($out | Where-Object { $_ -match '\b(New File|Newer|Older|Changed|Modified|Tweaked|Mismatch)\b' })
    Write-Host ("   {0} file(s) to copy, {1} extra item(s) to delete" -f $copy.Count, $extra.Count)
    $extra | Select-Object -First 15 | ForEach-Object { Write-Host "   $($_.Trim())" }
    if ($extra.Count -gt 15) { Write-Host "   ... $($extra.Count - 15) more extra item(s)" }
    $keep = @($extra | Where-Object { $_ -match '\\(node_modules|bin|obj)(\\|\s*$)' })
    if ($keep.Count) { $problems++; Write-Warning "would delete dependency/build folders in Platform; compare by hand:`n$($keep -join "`n")" }
    $out | Where-Object { $_ -cmatch '^\s*\d{4}/\d\d/\d\d.*ERROR|^ERROR ' } | ForEach-Object { Write-Warning $_.Trim() }
    if ($code -ge 8) { $problems++; Write-Warning "robocopy exit $code" }
}

Write-Host '== Platform proposals newer than or missing from Source (copy back to Source by hand)'
robocopy (Join-P 'docs\proposals') (Join-S 'docs\proposals') '*.md' /XO /L /R:0 /W:0 /NP /NDL /NJH /NJS

if ($problems) { throw "$problems problem(s) found; nothing was written." }
if ($Apply) {
    $lockBefore = (Get-FileHash -LiteralPath (Join-P 'package-lock.json') -Algorithm SHA256).Hash
    foreach ($step in $steps) {
        robocopy @($step.Args) @common /NDL /NFL | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "$($step.Label) failed (robocopy exit $LASTEXITCODE); Platform may be partly updated." }
    }
    if ((Get-FileHash -LiteralPath (Join-P 'package-lock.json') -Algorithm SHA256).Hash -ne $lockBefore) {
        Write-Warning 'package-lock.json changed: run npm ci in Platform with its runtime\node before restarting.'
    }
    Write-Host 'Done. Next: run Restart-Agent-Core.cmd in Platform once; wait for runtime\restart\<runId>.json. This script does not restart.'
}
