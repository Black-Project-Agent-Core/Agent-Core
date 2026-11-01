<#
Agent Core as the only Node.js / npm on this PC.
Docs: docs\Node-Npm-Single-Owner.md

  -Action Verify      Check that every `node`, `npm` and `npx` the machine resolves is the one in runtime\node, that the npm cache and
                      global prefix live under runtime\, and that no other Node.js installation, version manager or old npm folder exists.
  -Action Register    Point this PC at the Agent Core Node: set NPM_CONFIG_CACHE / NPM_CONFIG_PREFIX (user), put runtime\node and
                      runtime\npm-prefix first in PATH and remove other Node/npm folders from PATH. Run it again after the project folder
                      moves or its drive letter changes. From an elevated window it edits the machine PATH too (machine PATH is read before
                      the user PATH, so a stray machine entry wins until it is removed).
  -Action Unregister  Remove the registration (env vars and the two PATH entries). Installs nothing and deletes no folders.

Installing Node.js again from anywhere else is not supported: repair the project runtime with scripts\windows\Ensure-Agent-Core-LocalRuntime.ps1.
#>
[CmdletBinding()]
param(
    [ValidateSet('Verify', 'Register', 'Unregister')][string]$Action = 'Verify'
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$NodeDir = Join-Path $Root 'runtime\node'
$Prefix = Join-Path $Root 'runtime\npm-prefix'
$Cache = Join-Path $Root 'runtime\npm-cache'
$UserNpmrc = Join-Path $Root 'secrets\npm-user.npmrc'
$MachineKeyPath = 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment'

function Test-Elevated {
    ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Open-EnvKey([string]$Scope, [bool]$Writable) {
    if ($Scope -eq 'Machine') { [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($MachineKeyPath, $Writable) }
    else { [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $Writable) }
}

function Get-RawValue([string]$Scope, [string]$Name) {
    $key = Open-EnvKey $Scope $false
    try { [string]$key.GetValue($Name, '', 'DoNotExpandEnvironmentNames') } finally { $key.Close() }
}

function Set-RawValue([string]$Scope, [string]$Name, [string]$Value) {
    $key = Open-EnvKey $Scope $true
    try {
        $kind = [Microsoft.Win32.RegistryValueKind]::String
        if ($key.GetValueNames() -contains $Name) { $kind = $key.GetValueKind($Name) }
        $key.SetValue($Name, $Value, $kind)
    } finally { $key.Close() }
}

function Remove-RawValue([string]$Scope, [string]$Name) {
    $key = Open-EnvKey $Scope $true
    try { if ($key.GetValueNames() -contains $Name) { $key.DeleteValue($Name) } } finally { $key.Close() }
}

function ConvertTo-Comparable([string]$Entry) {
    ([Environment]::ExpandEnvironmentVariables($Entry.Trim().Trim('"'))).TrimEnd('\', '/').ToLowerInvariant()
}

function Get-Entries([string]$Raw) { $Raw -split ';' | Where-Object { $_.Trim() } }

# An entry is foreign when it is not one of ours and it holds a node/npm launcher, is a known stray npm folder,
# or is a dead folder that still looks like a Node folder.
function Test-ForeignNodeEntry([string]$Entry) {
    $path = ConvertTo-Comparable $Entry
    if ($path -in @((ConvertTo-Comparable $NodeDir), (ConvertTo-Comparable $Prefix))) { return $false }
    if ($path -match '\\roaming\\npm$' -or $path -match '\\npm-global$') { return $true }
    $real = [Environment]::ExpandEnvironmentVariables($Entry.Trim().Trim('"'))
    if (Test-Path -LiteralPath $real) {
        foreach ($name in 'node.exe', 'npm.cmd', 'npx.cmd') { if (Test-Path -LiteralPath (Join-Path $real $name)) { return $true } }
    }
    # A folder named like a Node folder is foreign even when it is dead or has lost its launchers.
    return [bool]($path -match '\\(node|nodejs)$')
}

function Update-Path([string]$Scope, [string[]]$Front) {
    $old = Get-RawValue $Scope 'Path'
    $kept = New-Object System.Collections.Generic.List[string]
    $removed = New-Object System.Collections.Generic.List[string]
    $frontKeys = $Front | ForEach-Object { ConvertTo-Comparable $_ }
    foreach ($entry in (Get-Entries $old)) {
        if ($frontKeys -contains (ConvertTo-Comparable $entry)) { continue }
        if (Test-ForeignNodeEntry $entry) { $removed.Add($entry); continue }
        $kept.Add($entry)
    }
    $new = (@($Front) + $kept.ToArray()) -join ';'
    if ($new -ne $old) { Set-RawValue $Scope 'Path' $new }
    foreach ($r in $removed) { Write-Output "  removed from $Scope PATH: $r" }
    Write-Output "  $Scope PATH: front = $($Front -join ', ')"
}

function Remove-CanonicalFromPath([string]$Scope) {
    $old = Get-RawValue $Scope 'Path'
    $drop = @((ConvertTo-Comparable $NodeDir), (ConvertTo-Comparable $Prefix))
    $new = (Get-Entries $old | Where-Object { $drop -notcontains (ConvertTo-Comparable $_) }) -join ';'
    if ($new -ne $old) { Set-RawValue $Scope 'Path' $new }
}

function Send-EnvironmentChange {
    if (-not ('AgentCore.NpmWin32' -as [type])) {
        Add-Type -Namespace AgentCore -Name NpmWin32 -MemberDefinition '[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);'
    }
    $result = [UIntPtr]::Zero
    [void][AgentCore.NpmWin32]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
}

function Get-EffectivePath {
    $machine = [Environment]::ExpandEnvironmentVariables((Get-RawValue 'Machine' 'Path'))
    $user = [Environment]::ExpandEnvironmentVariables((Get-RawValue 'User' 'Path'))
    (($machine + ';' + $user) -split ';' | Where-Object { $_.Trim() })
}

function Find-OnPath([string[]]$Directories, [string]$FileName) {
    $Directories | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_.Trim('"') $FileName)) } | ForEach-Object { Join-Path $_.Trim('"') $FileName }
}

switch ($Action) {
    'Register' {
        if (-not (Test-Path -LiteralPath (Join-Path $NodeDir 'node.exe')) -or -not (Test-Path -LiteralPath (Join-Path $NodeDir 'npm.cmd'))) {
            throw "The project Node runtime is missing. Run: scripts\windows\Ensure-Agent-Core-LocalRuntime.ps1"
        }
        foreach ($dir in $Prefix, $Cache) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Set-RawValue 'User' 'NPM_CONFIG_CACHE' $Cache
        Set-RawValue 'User' 'NPM_CONFIG_PREFIX' $Prefix
        if (Test-Path -LiteralPath $UserNpmrc) { Set-RawValue 'User' 'NPM_CONFIG_USERCONFIG' $UserNpmrc }
        Write-Output "User env: NPM_CONFIG_CACHE=$Cache"
        Write-Output "User env: NPM_CONFIG_PREFIX=$Prefix"
        if (Test-Elevated) {
            Update-Path 'Machine' @($NodeDir, $Prefix)
            Remove-CanonicalFromPath 'User'
            Update-Path 'User' @()
        } else {
            Update-Path 'User' @($NodeDir, $Prefix)
            Write-Warning 'Not elevated: the machine PATH was not touched. A Node folder in the machine PATH is read before the user PATH and wins; run this again from an elevated window.'
        }
        Send-EnvironmentChange
        Write-Output 'Registered. Open a new terminal (and restart Claude Desktop / Codex) to pick it up, then run -Action Verify.'
    }
    'Unregister' {
        Remove-RawValue 'User' 'NPM_CONFIG_CACHE'
        Remove-RawValue 'User' 'NPM_CONFIG_PREFIX'
        Remove-CanonicalFromPath 'User'
        if (Test-Elevated) { Remove-CanonicalFromPath 'Machine' } else { Write-Warning 'Not elevated: machine PATH entries were left in place.' }
        Send-EnvironmentChange
        Write-Output 'Unregistered. No Node.js was installed and no folder was deleted.'
    }
    'Verify' {
        $failures = 0
        function Check([bool]$Ok, [string]$Text) { if ($Ok) { Write-Output "PASS  $Text" } else { Write-Output "FAIL  $Text"; $script:failures++ } }

        $nodeExe = Join-Path $NodeDir 'node.exe'
        $version = if (Test-Path -LiteralPath $nodeExe) { (& $nodeExe --version) } else { '' }
        Check ([bool]$version) "project Node runtime present ($NodeDir $version)"

        $effective = Get-EffectivePath
        foreach ($name in 'node.exe', 'npm.cmd', 'npx.cmd') {
            $hits = @(Find-OnPath $effective $name)
            $first = if ($hits.Count) { $hits[0] } else { '' }
            Check ($first -and (ConvertTo-Comparable $first) -eq (ConvertTo-Comparable (Join-Path $NodeDir $name))) "first $name on the machine PATH is the project one (found: $($hits -join ' ; '))"
            Check ($hits.Count -le 1) "no second $name on the machine PATH"
        }
        Check (($effective | ForEach-Object { ConvertTo-Comparable $_ }) -contains (ConvertTo-Comparable $Prefix)) 'runtime\npm-prefix is on the machine PATH (global npm commands)'

        foreach ($pair in @(@('NPM_CONFIG_CACHE', $Cache), @('NPM_CONFIG_PREFIX', $Prefix))) {
            $value = Get-RawValue 'User' $pair[0]
            if (-not $value) { $value = Get-RawValue 'Machine' $pair[0] }
            Check ($value -and (ConvertTo-Comparable $value) -eq (ConvertTo-Comparable $pair[1])) "$($pair[0]) = $($pair[1]) (found: $value)"
        }

        $nodeInstalls = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^Node\.js' })
        Check ($nodeInstalls.Count -eq 0) 'no installed Node.js (Add/Remove Programs)'
        $strays = @('C:\Program Files\nodejs', 'C:\Program Files (x86)\nodejs', (Join-Path $env:APPDATA 'npm'), (Join-Path $env:APPDATA 'nvm'), (Join-Path $env:LOCALAPPDATA 'nvm'), (Join-Path $env:LOCALAPPDATA 'fnm'), (Join-Path $env:USERPROFILE '.volta'), (Join-Path $env:LOCALAPPDATA 'npm-cache'), (Join-Path $env:APPDATA 'npm-cache')) | Where-Object { Test-Path -LiteralPath $_ }
        Check ($strays.Count -eq 0) "no other Node/npm folder or version manager ($($strays -join ' ; '))"
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            $wg = (winget list --id OpenJS.NodeJS 2>&1 | Out-String)
            Check ($wg -notmatch 'OpenJS\.NodeJS') 'winget does not manage a Node.js package'
        }
        if ($failures) { Write-Output "$failures check(s) failed. Fix with: -Action Register (elevated), and uninstall other Node.js installs."; exit 1 }
        Write-Output 'All checks passed.'
    }
}
