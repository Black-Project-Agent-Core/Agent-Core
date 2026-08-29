[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$GatewayUrl,

    [Parameter(Mandatory = $true)]
    [string]$AllowedRoot,

    [string]$RelaySourceUrl = 'https://raw.githubusercontent.com/rendevouz999/Market-Signal-Lab/task/windows-desktop-commander-gateway-20260820/.devcontainer/windows-relay/windows-relay.mjs',

    [string]$RelaySourcePath,

    [string]$StateRoot,

    [switch]$RequireExistingNode,

    [switch]$DisableStartupFolderFallback,

    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Codespace Windows Relay'
if ([string]::IsNullOrWhiteSpace($StateRoot)) {
    $StateRoot = Join-Path $env:LOCALAPPDATA 'CodespaceWindowsRelay'
}
$StateRoot = [IO.Path]::GetFullPath($StateRoot)
$RelayPath = Join-Path $StateRoot 'windows-relay.mjs'
$LauncherPath = Join-Path $StateRoot 'start-relay.cmd'
$StartupFallback = Join-Path ([Environment]::GetFolderPath('Startup')) 'CodespaceWindowsRelay.cmd'

function Write-Step([string]$Message) {
    Write-Host "[windows-relay] $Message"
}

if ($Uninstall) {
    Write-Step 'Removing autostart entries. Device credentials are retained unless you remove the state directory manually.'
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item $StartupFallback -Force -ErrorAction SilentlyContinue
    exit 0
}

$AllowedRoot = [IO.Path]::GetFullPath($AllowedRoot)
if (-not (Test-Path -LiteralPath $AllowedRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $AllowedRoot -Force | Out-Null
}

New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null

# Preserve only the stable machine identity when migrating away from the legacy LOCALAPPDATA
# state. Credentials are intentionally not copied: the destination root must obtain a fresh
# device token through the one-time pairing flow.
$LegacyStateRoot = Join-Path $env:LOCALAPPDATA 'CodespaceWindowsRelay'
$LegacyDevicePath = Join-Path $LegacyStateRoot 'device.json'
$TargetDevicePath = Join-Path $StateRoot 'device.json'
if ($StateRoot -ne [IO.Path]::GetFullPath($LegacyStateRoot) -and
    -not (Test-Path -LiteralPath $TargetDevicePath -PathType Leaf) -and
    (Test-Path -LiteralPath $LegacyDevicePath -PathType Leaf)) {
    Copy-Item -LiteralPath $LegacyDevicePath -Destination $TargetDevicePath -Force
    Write-Step 'Migrated Windows Relay machine identity to the workspace-scoped state root; credentials were not copied.'
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodePath) {
    if ($RequireExistingNode) {
        throw 'Node.js 18+ is required. Automatic Node.js installation is disabled for this workspace-scoped relay install.'
    }
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw 'Node.js 18+ is required and winget is unavailable. Install Node.js LTS, then rerun this installer.'
    }
    Write-Step 'Node.js is missing; installing the current Node.js LTS with winget.'
    & $winget.Source install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) { throw "winget Node.js installation failed with exit code $LASTEXITCODE" }
    foreach ($candidate in @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )) {
        if (Test-Path -LiteralPath $candidate) { $nodePath = $candidate; break }
    }
    if (-not $nodePath) { throw 'Node.js installed but node.exe was not found. Open a new PowerShell window and rerun the installer.' }
}

$nodeVersionText = & $nodePath --version
$nodeMajor = [int](($nodeVersionText -replace '^v','').Split('.')[0])
if ($nodeMajor -lt 18) { throw "Node.js 18+ is required; found $nodeVersionText" }
$nodeDir = Split-Path -Parent $nodePath
$env:PATH = "$nodeDir;$env:PATH"
Write-Step "Using Node.js $nodeVersionText"

$DesktopCommanderRoot = Join-Path $StateRoot 'desktop-commander'
$DesktopCommanderEntry = Join-Path $DesktopCommanderRoot 'node_modules\@wonderwhy-er\desktop-commander\dist\index.js'
$NpmCache = Join-Path $StateRoot 'npm-cache'
New-Item -ItemType Directory -Force -Path $DesktopCommanderRoot, $NpmCache | Out-Null

# Invoke npm through node.exe + npm-cli.js instead of npm.cmd. Windows cmd.exe treats '&'
# as a command separator even when it appears in a workspace path, which breaks roots such
# as "Trends&Insights". Direct node invocation preserves the full path as one argument.
$NpmCli = $null
$npmCliCandidates = @(
    (Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js')
)
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
    $npmCliCandidates += (Join-Path (Split-Path -Parent $npmCommand.Source) 'node_modules\npm\bin\npm-cli.js')
}
foreach ($candidate in ($npmCliCandidates | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $NpmCli = $candidate
        break
    }
}
if (-not $NpmCli) { throw 'npm-cli.js is required after Node.js installation.' }
if (-not (Test-Path -LiteralPath $DesktopCommanderEntry -PathType Leaf)) {
    Write-Step 'Installing pinned Desktop Commander 0.2.47 into the relay-private runtime directory.'
    & $nodePath $NpmCli install --prefix $DesktopCommanderRoot --cache $NpmCache --no-audit --no-fund '@wonderwhy-er/desktop-commander@0.2.47'
    if ($LASTEXITCODE -ne 0) { throw "Desktop Commander npm install failed with exit code $LASTEXITCODE" }
}
if (-not (Test-Path -LiteralPath $DesktopCommanderEntry -PathType Leaf)) { throw 'Desktop Commander runtime entry is missing after installation.' }

if ($RelaySourcePath) {
    $resolvedRelaySource = [IO.Path]::GetFullPath($RelaySourcePath)
    if (-not (Test-Path -LiteralPath $resolvedRelaySource -PathType Leaf)) { throw 'RelaySourcePath does not exist.' }
    Write-Step 'Installing the reviewed Windows Relay source from the bootstrap payload.'
    Copy-Item -LiteralPath $resolvedRelaySource -Destination $RelayPath -Force
} else {
    Write-Step 'Downloading the reviewed Windows Relay source.'
    Invoke-WebRequest -UseBasicParsing -Uri $RelaySourceUrl -OutFile $RelayPath
}
if ((Get-Item $RelayPath).Length -lt 1000) { throw 'Windows Relay source is unexpectedly small.' }

$credentialsPath = Join-Path $StateRoot 'credentials.json'
$staleCredentialsPath = Join-Path $StateRoot 'credentials.stale-before-repair.json'

# Stop only previous relay instances owned by this installation before validating/upgrading.
# This avoids an older Scheduled Task instance continuing to poll with the same device identity.
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {}
try {
    $relayFullPath = [IO.Path]::GetFullPath($RelayPath)
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
        $cmd = [string]$_.CommandLine
        if ($cmd -and $cmd.IndexOf($relayFullPath, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Write-Step "Stopping previous Windows Relay process PID $($_.ProcessId)."
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
    Write-Step "Previous relay process cleanup warning: $($_.Exception.Message)"
}
Start-Sleep -Milliseconds 500

$env:CODESPACE_WINDOWS_GATEWAY_URL = $GatewayUrl.TrimEnd('/')
$env:WINDOWS_ALLOWED_ROOTS = $AllowedRoot
$env:CODESPACE_WINDOWS_STATE_ROOT = $StateRoot
$fallbackPairingCode = if ($env:WINDOWS_PAIRING_CODE) { $env:WINDOWS_PAIRING_CODE.Trim() } else { '' }
if (-not (Test-Path -LiteralPath $credentialsPath)) {
    $pairingCode = if ($fallbackPairingCode) { $fallbackPairingCode } else { Read-Host 'Enter the one-time Windows pairing code shown by GPT Builder' }
    if ([string]::IsNullOrWhiteSpace($pairingCode)) { throw 'Pairing code is required for first-time setup.' }
    Write-Step 'Pairing directly with the Codespace gateway. The long-term device token is not printed.'
    $env:WINDOWS_PAIRING_CODE = $pairingCode.Trim()
} else {
    Write-Step 'Existing paired device credential found; validating it.'
}

$pairOnlyExitCode = 0
try {
    & $nodePath $RelayPath --pair-only
    $pairOnlyExitCode = $LASTEXITCODE

    if ($pairOnlyExitCode -ne 0 -and (Test-Path -LiteralPath $credentialsPath) -and $fallbackPairingCode) {
        Write-Step "Existing device credential was rejected by the gateway (exit code $pairOnlyExitCode); retrying with the fresh one-time pairing code."
        Remove-Item -LiteralPath $staleCredentialsPath -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $credentialsPath -Destination $staleCredentialsPath -Force
        $env:WINDOWS_PAIRING_CODE = $fallbackPairingCode
        Start-Sleep -Milliseconds 500

        & $nodePath $RelayPath --pair-only
        $pairOnlyExitCode = $LASTEXITCODE
        if ($pairOnlyExitCode -eq 0) {
            Remove-Item -LiteralPath $staleCredentialsPath -Force -ErrorAction SilentlyContinue
            Write-Step 'Fresh Windows Relay pairing succeeded; stale credential backup removed.'
        }
    }

    if ($pairOnlyExitCode -ne 0) { throw "Relay pairing/connectivity self-test failed with exit code $pairOnlyExitCode" }
}
finally {
    Remove-Item Env:WINDOWS_PAIRING_CODE -ErrorAction SilentlyContinue
}

$gatewayEscaped = $GatewayUrl.TrimEnd('/').Replace('%','%%')
$rootEscaped = $AllowedRoot.Replace('%','%%')
$nodeDirEscaped = $nodeDir.Replace('%','%%')
$nodeEscaped = $nodePath.Replace('%','%%')
$relayEscaped = $RelayPath.Replace('%','%%')
@(
    '@echo off',
    'setlocal',
    "set `"CODESPACE_WINDOWS_GATEWAY_URL=$gatewayEscaped`"",
    "set `"WINDOWS_ALLOWED_ROOTS=$rootEscaped`"",
    "set `"CODESPACE_WINDOWS_STATE_ROOT=$StateRoot`"",
    "set `"PATH=$nodeDirEscaped;%PATH%`"",
    "`"$nodeEscaped`" `"$relayEscaped`" >> `"$StateRoot\startup.log`" 2>&1"
) | Set-Content -LiteralPath $LauncherPath -Encoding ASCII

$registered = $false
try {
    $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/d /c `"`"$LauncherPath`"`"" -WorkingDirectory $StateRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Outbound non-AI relay from GPT Action gateway to local Desktop Commander MCP.' -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    $registered = $true
    Write-Step 'Autostart registered as a per-user Scheduled Task.'
}
catch {
    Write-Step "Scheduled Task registration was unavailable: $($_.Exception.Message)"
}

if (-not $registered) {
    if ($DisableStartupFolderFallback) {
        # Remove an older Startup-folder fallback so a legacy C:-state relay cannot reappear
        # at the next logon. Start the workspace-scoped relay directly with node.exe; this
        # also avoids cmd.exe parsing '&' in the workspace path.
        Remove-Item $StartupFallback -Force -ErrorAction SilentlyContinue
        Start-Process -FilePath $nodePath -ArgumentList @($RelayPath) -WorkingDirectory $StateRoot -WindowStyle Hidden
        Write-Step 'Scheduled Task registration was unavailable. Relay started directly for this session; legacy Startup-folder fallback is disabled/removed.'
    } else {
        Copy-Item -LiteralPath $LauncherPath -Destination $StartupFallback -Force
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c',"`"$LauncherPath`"" -WindowStyle Hidden
        Write-Step 'Autostart installed in the current user Startup folder instead.'
    }
}

Start-Sleep -Seconds 3
Write-Step "Installed. State: $StateRoot"
Write-Step 'The relay is outbound-only; no Windows management port was opened.'
Write-Step 'Desktop Commander health is verified separately after relay startup; relay installation does not depend on MCP health.'
