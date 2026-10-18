#requires -Version 5.1
# One installation approval; later use validates and reuses the protected task.
[CmdletBinding()]
param([ValidateSet('Ensure','Startup','Status','Preview')][string]$Mode='Ensure')
# CMD can inherit PowerShell 7 module paths; use this Windows host's own modules.
if ($PSEdition -eq 'Desktop') { $env:PSModulePath=Join-Path $PSHOME 'Modules' }
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$sid=$identity.User.Value
$sha=[Security.Cryptography.SHA256]::Create()
try { $key=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sid)))).Replace('-','').Substring(0,16).ToLowerInvariant() }
finally { $sha.Dispose() }
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$client=Join-Path $PSScriptRoot 'Invoke-Agent-Core-Symlink-Fixture.ps1'
$installer=Join-Path $PSScriptRoot 'Install-Agent-Core-Symlink-Fixture.ps1'
$registry='HKCU:\Software\AgentCore\SymlinkFixture'
$lock=$null
$held=$false
function Invoke-Helper([string]$scriptPath,[string[]]$scriptArgs) {
    $savedPreference=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    try {
        $output=& $ps -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $scriptPath @scriptArgs 2>&1 | Out-String
        $code=$LASTEXITCODE
    } finally { $ErrorActionPreference=$savedPreference }
    return @{code=$code;text=$output.Trim()}
}
function Set-Attempt([string]$outcome) {
    if(-not (Test-Path -LiteralPath $registry)) { $null=New-Item -Path $registry -Force }
    Set-ItemProperty -LiteralPath $registry -Name StartupSetupAttempted -Value 1
    Set-ItemProperty -LiteralPath $registry -Name StartupSetupOutcome -Value $outcome
    Set-ItemProperty -LiteralPath $registry -Name StartupSetupAt -Value ([DateTimeOffset]::UtcNow.ToString('o'))
}
try {
    $status=Invoke-Helper $client @('-Operation','Status')
    if ($Mode -eq 'Preview') {
        $absent=$status.code -ne 0 -and $status.text.Contains('SYMLINK_SETUP_REQUIRED:Protected helper is absent.')
        @{status=$(if($status.code -eq 0){'installed'}elseif($absent){'setup-required'}else{'review-required'});mode='preview';wouldRequestInstall=$absent;uac='first installation only; existing valid task is reused';scope='fixed synthetic Workflows symlink fixture only'} | ConvertTo-Json -Compress
        exit 0
    }
    if ($Mode -eq 'Status') {
        if($status.code -ne 0){throw $status.text}
        $status.text
        exit 0
    }
    $lock=[Threading.Mutex]::new($false,'Local\AgentCoreSymlinkSetup-'+$key)
    try { $held=$lock.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $held=$true }
    if(-not $held){throw 'SYMLINK_SETUP_BUSY_NO_DUPLICATE_REQUEST'}
    # Re-read after serialization. Registry traces alone are not installation proof.
    $status=Invoke-Helper $client @('-Operation','Status')
    $installedNow=$false
    if($status.code -ne 0) {
        if(-not $status.text.Contains('SYMLINK_SETUP_REQUIRED:Protected helper is absent.')) {
            throw ('SYMLINK_EXISTING_INSTALL_REVIEW_REQUIRED:'+ $status.text)
        }
        $prior=Get-ItemProperty -LiteralPath $registry -ErrorAction SilentlyContinue
        $attempted=$null -ne $prior -and $null -ne $prior.PSObject.Properties['StartupSetupAttempted'] -and $prior.StartupSetupAttempted -eq 1
        if($Mode -eq 'Startup' -and $attempted) {
            throw 'SYMLINK_SETUP_PREVIOUS_ATTEMPT_NOT_REPEATED:Run Setup-Agent-Core-Symlink-Fixture.cmd explicitly to retry.'
        }
        Set-Attempt 'pending'
        # Installer performs one RunAs only when this token is not already elevated.
        $install=Invoke-Helper $installer @('-Mode','Install')
        if($install.code -ne 0){Set-Attempt 'failed-or-cancelled';throw ('SYMLINK_INSTALL_FAILED_NO_AUTO_RETRY:'+ $install.text)}
        $status=Invoke-Helper $client @('-Operation','Status')
        if($status.code -ne 0){Set-Attempt 'verification-failed';throw ('SYMLINK_INSTALL_NOT_VERIFIED:'+ $status.text)}
        $installedNow=$true
        Set-Attempt 'installed'
    }
    $fixture=Invoke-Helper $client @('-Operation','Workflows')
    if($fixture.code -ne 0){throw ('SYMLINK_WORKFLOWS_NOT_READY:'+ $fixture.text)}
    $value=$fixture.text | ConvertFrom-Json
    if($value.status -ne 'ok' -or $value.fixtureKind -ne 'workflows') {throw 'SYMLINK_WORKFLOWS_RECEIPT_INVALID'}
    Set-Attempt 'ready'
    @{status='ready';installedNow=$installedNow;reusedExisting=[bool]$value.reusedExisting;root=[string]$value.root;fixtureKind='workflows';uacRequestedByReuse=$false} | ConvertTo-Json -Compress
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 3
}
finally {
    if($held){$lock.ReleaseMutex()}
    if($null -ne $lock){$lock.Dispose()}
    $identity.Dispose()
}
