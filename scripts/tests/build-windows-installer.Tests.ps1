$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BuildScript = Join-Path $RepoRoot 'scripts\build-windows-installer.ps1'
$IssFile = Join-Path $RepoRoot 'installer\MarketSignalLab.iss'
$Workflow = Join-Path $RepoRoot '.github\workflows\windows-installer-candidate.yml'

function Assert-Contains([string]$Text, [string]$Pattern, [string]$Message) {
    if ($Text -notmatch $Pattern) { throw $Message }
}
function Assert-NotContains([string]$Text, [string]$Pattern, [string]$Message) {
    if ($Text -match $Pattern) { throw $Message }
}

if (-not (Test-Path $BuildScript)) { throw 'RED: scripts/build-windows-installer.ps1 is missing' }
$build = Get-Content -Raw -LiteralPath $BuildScript
Assert-Contains $build 'SkipInstallerCompile' 'build script must expose SkipInstallerCompile'
Assert-Contains $build 'capture-helper-path' 'build script must verify the packaged browser-companion contract'
Assert-Contains $build 'browser-companion' 'build script must stage browser-companion'
Assert-Contains $build 'engines[\\/]+rust[\\/]+msl-analytics-rust\.exe' 'build script must stage the Rust worker at the locked path'
Assert-Contains $build '-H=windowsgui' 'build script must produce a Windows GUI host'
Assert-Contains $build 'cmd[\\/]+market-signal-lab.+version' 'build script must read the source version from the application command'
Assert-Contains $build 'git.+rev-parse.+HEAD' 'build script must record exact source head'
Assert-Contains $build 'Get-FileHash' 'build script must hash staged binaries'
Assert-Contains $build 'VersionInfoVersion' 'build script must derive and pass a numeric Windows version-info value'
Assert-Contains $build 'Start-Process' 'GUI command verification must launch the staged Windows GUI executable with Start-Process'
Assert-Contains $build 'RedirectStandardOutput' 'GUI command verification must capture stdout from the staged Windows GUI executable explicitly'
Assert-Contains $build 'RedirectStandardError' 'GUI command verification must capture stderr from the staged Windows GUI executable explicitly'
Assert-NotContains $build 'F:\\Chrome-Isolated' 'developer-specific paths are forbidden'
Assert-NotContains $build 'ENVATO_TOKEN\s*=' 'build script must not embed ENVATO_TOKEN values'

if (-not (Test-Path $IssFile)) { throw 'RED: installer/MarketSignalLab.iss is missing' }
$iss = Get-Content -Raw -LiteralPath $IssFile
Assert-Contains $iss 'AppId=\{\{3A8A0C2E-6F29-4D62-B6E7-3177732B55DD\}' 'stable AppId is required'
Assert-Contains $iss 'DefaultDirName=\{autopf\}\\Market Signal Lab' 'installer must target Program Files'
Assert-Contains $iss 'DefaultGroupName=Market Signal Lab' 'Start Menu group is required'
Assert-Contains $iss 'Name:\s*"desktopicon".*Flags:\s*unchecked' 'desktop shortcut task must default off'
Assert-Contains $iss 'Source:\s*"\{#StageDir\}\\\*".*recursesubdirs.*createallsubdirs' 'staged recursive copy is required'
Assert-Contains $iss 'postinstall' 'post-install launch entry is required'
Assert-Contains $iss 'VersionInfoProductVersion=\{#VersionInfoVersion\}' 'PE product version must use the numeric version-info define'
Assert-Contains $iss 'VersionInfoVersion=\{#VersionInfoVersion\}' 'PE file version must use the numeric version-info define'
Assert-NotContains $iss 'VersionInfoProductVersion=\{#AppVersion\}' 'prerelease AppVersion must not be used as PE product version'
Assert-NotContains $iss '\[Registry\][\s\S]*ENVATO_TOKEN' 'installer must not persist ENVATO_TOKEN'
Assert-NotContains $iss 'Cred(Delete|Write|Read)' 'installer must not own Credential Manager operations'
Assert-NotContains $iss 'LOCALAPPDATA.*MarketSignalLab.*(del|delete|remove)' 'installer must not delete researcher data'

if (-not (Test-Path $Workflow)) { throw 'RED: Phase I workflow is missing' }
$workflowText = Get-Content -Raw -LiteralPath $Workflow
Assert-Contains $workflowText 'feature/phase-p-windows-installer-promotion-20260818' 'workflow must trigger on the Phase I branch'
Assert-Contains $workflowText 'feature/market-mapping-performance-phase-p-20260818' 'workflow PR target must be Phase P'
Assert-NotContains $workflowText 'feature/windows-installer-lifecycle-20260818' 'historical installer branch must not remain canonical'

$trackedDist = (& git -C $RepoRoot ls-files dist) -join "`n"
if ($trackedDist.Trim()) { throw "generated dist artifacts are tracked:`n$trackedDist" }

Write-Host 'PASS: Windows installer build contracts'
