$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$VerifyScript = Join-Path $RepoRoot 'scripts\verify-windows-installer.ps1'
$HelpersScript = Join-Path $RepoRoot 'scripts\windows-installer-test-helpers.ps1'

function Assert-Contains([string]$Text, [string]$Pattern, [string]$Message) {
    if ($Text -notmatch $Pattern) { throw $Message }
}
function Assert-NotContains([string]$Text, [string]$Pattern, [string]$Message) {
    if ($Text -match $Pattern) { throw $Message }
}

if (-not (Test-Path $VerifyScript)) { throw 'RED: scripts/verify-windows-installer.ps1 is missing' }
$verify = Get-Content -Raw -LiteralPath $VerifyScript

Assert-Contains $verify 'Parameter\(Mandatory\s*=\s*\$true\).*InstallerPath|Mandatory\s*=\s*\$true[^\r\n]*\]\s*\[string\]\$InstallerPath' 'InstallerPath must be mandatory'
Assert-Contains $verify 'windows-installer-test-helpers\.ps1' 'clean verifier must use shared helpers'
if (-not (Test-Path $HelpersScript)) { throw 'RED: scripts/windows-installer-test-helpers.ps1 is missing' }
$helpers = Get-Content -Raw -LiteralPath $HelpersScript
Assert-Contains $helpers 'Market Signal Lab\.exe' 'verification helpers must assert installed Go host'
Assert-Contains $helpers 'engines[\\/]+rust[\\/]+msl-analytics-rust\.exe' 'verification helpers must assert installed Rust worker'
Assert-Contains $helpers 'browser-companion[\\/]+manifest\.json' 'verification helpers must assert browser companion manifest'
Assert-Contains $helpers 'version\.json' 'verification helpers must assert version manifest'
Assert-Contains $helpers 'productionAnalytics' 'verification helpers must inspect production analytics health'
Assert-Contains $helpers 'applicationHost' 'verification helpers must inspect application host health'
Assert-Contains $helpers 'rust-production' 'verification helpers must require rust-production identity'
Assert-Contains $helpers 'msl-analytics/2' 'verification helpers must require analytics v2 protocol'
Assert-Contains $helpers '127\.0\.0\.1' 'verification helpers must target the local dashboard only'
Assert-Contains $helpers '/DIR=`"\$InstallDir`"' 'installer /DIR argument must preserve spaces with embedded quotes'
Assert-Contains $helpers 'Stop-OwnedProcess' 'verification helpers must clean up only a test-owned process'
Assert-Contains $helpers 'Uninstall-MSL' 'shared helpers must expose the uninstall contract'
Assert-NotContains $verify 'Get-Process\s+[^\r\n]*Market Signal Lab[^\r\n]*\|[^\r\n]*Stop-Process\s+-Force' 'broad process-name cleanup is forbidden in verifier'
Assert-NotContains $helpers 'Get-Process\s+[^\r\n]*Market Signal Lab[^\r\n]*\|[^\r\n]*Stop-Process\s+-Force' 'broad process-name cleanup is forbidden in helpers'
Assert-NotContains $helpers 'Remove-Item[^\r\n]*LOCALAPPDATA[^\r\n]*MarketSignalLab[^\r\n]*-Recurse' 'verification helpers must not delete researcher data'
Assert-NotContains $helpers 'CredDelete|cmdkey\s+/delete' 'verification helpers must not delete saved credentials'

Assert-Contains $verify '\$ExpectedSourceHead' 'RC verifier must accept an expected sourceHead'
Assert-Contains $verify '\$ExpectedInstallerSha256' 'RC verifier must accept an expected installer SHA256'
Assert-Contains $verify '\$ExpectedAppSha256' 'RC verifier must accept an expected installed app SHA256'
Assert-Contains $verify '\$ExpectedRustWorkerSha256' 'RC verifier must accept an expected installed Rust worker SHA256'
Assert-Contains $verify 'Get-FileHash[^\r\n]*InstallerPath' 'RC verifier must hash the exact Setup.exe before install'
Assert-Contains $verify 'manifest\.sourceHead' 'RC verifier must assert installed sourceHead'
Assert-Contains $verify '/api/locales/en' 'RC verifier must smoke the EN locale API'
Assert-Contains $verify '/api/locales/id' 'RC verifier must smoke the ID locale API'
Assert-Contains $verify 'SEMANTIC_CONTRACT_V2' 'RC verifier must smoke C2 semantic UI assets'
Assert-Contains $verify 'GENERATED FILE NOTICE' 'RC verifier must smoke the TS-generated analytics asset'
Assert-Contains $verify 'Product Insight Score' 'RC verifier must require final Product Insight Score UI copy'
Assert-Contains $verify 'Catalog Insight Score' 'RC verifier must require final Catalog Insight Score UI copy'
Assert-Contains $verify 'Assert-NoPortOwner\s+-Port\s+\$Port' 'RC verifier must assert the target port is unowned before launching the installed host'
Assert-Contains $helpers 'function\s+Wait-PathRemoved' 'shared helpers must provide bounded path-removal polling'
Assert-Contains $helpers '\$Attempts' 'path-removal polling must be bounded by attempts'
Assert-Contains $verify 'Uninstall-MSL[\s\S]{0,500}Wait-PathRemoved\s+-Path\s+\$InstallDir' 'RC verifier must bounded-poll install directory removal after uninstall'
Assert-Contains $verify '\$primaryFailure' 'RC verifier must preserve the primary verification failure across cleanup'
Assert-Contains $verify 'Cleanup also failed' 'RC verifier must report secondary cleanup failure without replacing the primary failure'
$portCheckCount = [regex]::Matches($verify, 'Assert-NoPortOwner\s+-Port\s+\$Port').Count
if ($portCheckCount -ne 1) { throw 'RC verifier must assert port ownership exactly once before launch and rely on bounded Wait-PortReleased for cleanup' }
$preLaunchIndex = $verify.IndexOf('Assert-NoPortOwner -Port $Port')
$launchIndex = $verify.IndexOf('Start-InstalledMSL')
if ($preLaunchIndex -lt 0 -or $launchIndex -lt 0 -or $preLaunchIndex -gt $launchIndex) { throw 'RC verifier must assert port ownership before launching the installed host' }

Assert-Contains $helpers 'function\s+Wait-PortReleased' 'shared helpers must provide bounded port-release polling'
Assert-Contains $helpers 'function\s+Wait-PortReleased[\s\S]{0,400}\[int\]\$Attempts\s*=\s*40' 'Wait-PortReleased must default to 40 bounded attempts'
Assert-Contains $helpers 'function\s+Wait-PortReleased[\s\S]{0,400}\[int\]\$DelayMs\s*=\s*250' 'Wait-PortReleased must default to a 250ms delay'
Assert-Contains $helpers 'function\s+Wait-PortReleased[\s\S]{0,600}for\s*\(\s*\$i\s*=\s*0;\s*\$i\s*-lt\s*\$Attempts' 'port-release polling must be bounded by attempts'
Assert-NotContains $helpers 'function\s+Wait-PortReleased[\s\S]{0,600}while\s*\(\s*\$true\s*\)' 'port-release polling must never wait unbounded'
Assert-Contains $helpers 'function\s+Wait-PortReleased[\s\S]{0,600}Assert-NoPortOwner\s+-Port\s+\$Port' 'Wait-PortReleased must stay fail-closed once the bound is exhausted'
Assert-Contains $helpers 'function\s+Wait-PortReleased[\s\S]{0,600}if\s*\(\s*\$listeners\.Count\s+-eq\s+0\s*\)\s*\{\s*return\s*\}' 'Wait-PortReleased must return immediately once no listener remains'
Assert-Contains $verify 'Stop-OwnedProcess\s+-Process\s+\$ownedProcess\r?\n\s*Wait-PortReleased\s+-Port\s+\$Port' 'RC verifier must bounded-poll port release on the line immediately after stopping the owned process'
Assert-Contains $verify 'Wait-PathRemoved\s+-Path\s+\$InstallDir\r?\n\s*Wait-PortReleased\s+-Port\s+\$Port' 'RC verifier must bounded-poll port release on the line immediately after uninstall path removal'
$portReleaseCount = [regex]::Matches($verify, 'Wait-PortReleased\s+-Port\s+\$Port').Count
if ($portReleaseCount -ne 2) { throw 'RC verifier must bounded-poll port release exactly twice: after owned-process stop and after uninstall' }

Write-Host 'PASS: Windows installer verification contracts'
