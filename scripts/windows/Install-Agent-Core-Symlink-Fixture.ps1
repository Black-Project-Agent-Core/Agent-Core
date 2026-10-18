#requires -Version 5.1
# Preview by default. Installation/removal require explicit user-initiated UAC.
[CmdletBinding()]
param(
    [ValidateSet('Preview','Install','InstallElevated','Uninstall','UninstallElevated')]
    [string]$Mode = 'Preview',
    [string]$ExpectedSid = ''
)
if ($PSEdition -eq 'Desktop') { $env:PSModulePath=Join-Path $PSHOME 'Modules' }
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$admin = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $key = ([BitConverter]::ToString($sha.ComputeHash(
        [Text.Encoding]::UTF8.GetBytes($sid)))).Replace('-','').Substring(0,16).ToLowerInvariant()
} finally { $sha.Dispose() }
$root = Join-Path $env:ProgramData ('AgentCore-SymlinkFixture-' + $key)
$taskName = 'AgentCore-MemorySymlink-' + $key
$worker = Join-Path $root 'Worker.ps1'
$settingsPath = Join-Path $root 'settings.json'
$mailbox = Join-Path $root 'request.json'
$source = Join-Path $PSScriptRoot 'Agent-Core-Symlink-Fixture-Worker.ps1'
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskArguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '"'
$regKey = 'HKCU:\Software\AgentCore\SymlinkFixture'
function Preview-Changes {
    Write-Host '=== Agent Core isolated test symlink setup v1 ==='
    Write-Host ('Windows SID: ' + $sid)
    Write-Host ('Protected install directory (NTFS required): ' + $root)
    Write-Host ('Elevated fixed worker: ' + $worker)
    Write-Host ('Task Scheduler (on-demand, NO triggers): ' + $taskName)
    Write-Host 'Task principal: NT AUTHORITY\SYSTEM; no interactive login, no arbitrary arguments.'
    Write-Host 'Task ACL: SYSTEM/Admin Full; current SID Read/Execute only.'
    Write-Host ('Per-user setup trace: ' + $regKey)
    Write-Host ('Fixed request mailbox (current SID WriteData only): ' + $mailbox)
    Write-Host ('Synthetic-only output: ' + (Join-Path $root 'fixtures'))
    Write-Host 'Operations: prepare/cleanup (Memory GUID), workflows/cleanup-workflows (fixed synthetic layout).'
    Write-Host 'No changes to UAC, Developer Mode, global symlink policy, startup, or production Memory.'
    Write-Host 'Uninstall requires UAC and refuses nonempty/unknown fixtures.'
}
function Assert-FixedRoot {
    if (-not (Test-Path -LiteralPath $env:ProgramData -PathType Container)) {
        throw 'PROGRAMDATA_UNAVAILABLE'
    }
    $p = Get-Item -LiteralPath $env:ProgramData -Force
    if ($p.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'PROGRAMDATA_REPARSE_POINT_UNTRUSTED'
    }
    $drive = [IO.Path]::GetPathRoot($env:ProgramData)
    if ($drive -cnotmatch '^[a-zA-Z]:\\$') { throw 'PROGRAMDATA_NOT_LOCAL_VOLUME' }
    $filesystem = (Get-Volume -DriveLetter $drive.Substring(0,1) -ErrorAction Stop).FileSystem
    if ($filesystem -ne 'NTFS') { throw 'PROTECTED_INSTALL_REQUIRES_NTFS' }
}
function Task-FromScheduler {
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $folder = $scheduler.GetFolder('\')
    try { $existing = $folder.GetTask($taskName) }
    catch { $existing = $null }
    return @{ scheduler=$scheduler; folder=$folder; existing=$existing }
}
function Assert-Task($task) {
    if ($null -eq $task) { throw 'SYMLINK_SETUP_REQUIRED:Task missing.' }
    $d = $task.Definition
    if ($task.Name -cne $taskName -or $d.Actions.Count -ne 1 -or
        $d.Triggers.Count -ne 0 -or $d.Principal.UserId -notin @('SYSTEM','S-1-5-18') -or
        $d.Principal.LogonType -ne 5 -or $d.Principal.RunLevel -ne 1 -or
        $d.Settings.MultipleInstances -ne 2 -or -not $d.Settings.AllowDemandStart) {
        throw 'SYMLINK_TASK_CONFIG_CHANGED'
    }
    $action = $d.Actions.Item(1)
    if ($action.Path -ine $ps -or $action.Arguments -cne $taskArguments -or
        $action.WorkingDirectory -ine $root) { throw 'SYMLINK_TASK_ACTION_CHANGED' }
}
function Lock-Root {
    $icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
    & $icacls $root '/inheritance:r' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FIXTURE_ACL_INHERITANCE_LOCK_FAILED' }
    $grants = @('*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F',
        ('*' + $sid + ':(OI)(CI)RX'))
    & $icacls $root '/grant:r' $grants[0] $grants[1] $grants[2] | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FIXTURE_ACL_GRANT_FAILED' }
    & $icacls $root '/setowner' '*S-1-5-32-544' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FIXTURE_ACL_OWNER_FAILED' }
}
function Install-Now {
    if (-not $admin -or $ExpectedSid -ne $sid) {
        throw 'SAME_ACCOUNT_UAC_ADMIN_APPROVAL_REQUIRED'
    }
    Assert-FixedRoot
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw 'TRUSTED_WORKER_SOURCE_MISSING'
    }
    $taskApi = Task-FromScheduler
    if ($null -ne $taskApi.existing) {
        Assert-Task $taskApi.existing
        $meta = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        if ($meta.version -ne 1 -or $meta.userSid -cne $sid -or
            (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash.ToLowerInvariant() -cne
            [string]$meta.workerSha256 -or
            (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne
            [string]$meta.workerSha256 -or
            -not (Test-Path -LiteralPath $mailbox -PathType Leaf)) { throw 'INSTALLED_HELPER_REPAIR_REQUIRES_REVIEW' }
        Write-Host 'Installed matching task already exists. No changes made.'
        return
    }
    if (Test-Path -LiteralPath $root) { throw 'INSTALL_ROOT_EXISTS_WITHOUT_OWNED_TASK_REVIEW_REQUIRED' }
    $null = New-Item -ItemType Directory -Path $root -ErrorAction Stop
    Lock-Root
    $null = New-Item -ItemType Directory -Path (Join-Path $root 'fixtures')
    $null = New-Item -ItemType Directory -Path (Join-Path $root 'receipts')
    Copy-Item -LiteralPath $source -Destination $worker -ErrorAction Stop
    [IO.File]::WriteAllText($mailbox,'{}',[Text.UTF8Encoding]::new($false))
    $digest = (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash.ToLowerInvariant()
    $installId = [Guid]::NewGuid().ToString('N')
    @{version=1;installId=$installId;userSid=$sid;workerSha256=$digest} |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $settingsPath -Encoding UTF8
    # Ownership matters: the non-elevated user must not implicitly WRITE_DAC
    # their protected helper even when the ACL only gives Read/Execute.
    $icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
    & $icacls $root '/setowner' '*S-1-5-32-544' '/T' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FIXTURE_INSTALLED_CHILD_OWNER_INVALID' }
    # The user can change only the bytes of this pre-existing regular file.
    # Root RX plus Administrators ownership prevents deletion/replacement/ACL edits.
    & $icacls $mailbox '/grant' ('*' + $sid + ':(WD)') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FIXTURE_MAILBOX_WRITE_DATA_GRANT_FAILED' }
    $definition = $taskApi.scheduler.NewTask(0)
    $definition.RegistrationInfo.Description = 'Agent Core Memory fixed synthetic symlink v1 ' + $key
    $definition.Principal.UserId = 'SYSTEM'
    $definition.Principal.LogonType = 5 # ServiceAccount, no credentials.
    $definition.Principal.RunLevel = 1 # Highest; bounded fixed action only.
    $definition.Settings.Enabled = $true
    $definition.Settings.AllowDemandStart = $true
    $definition.Settings.MultipleInstances = 2 # Ignore overlapping new runs.
    $definition.Settings.StartWhenAvailable = $false
    $definition.Settings.RestartCount = 0
    $definition.Settings.DisallowStartIfOnBatteries = $false
    $definition.Settings.StopIfGoingOnBatteries = $false
    $definition.Settings.WakeToRun = $false
    $definition.Settings.ExecutionTimeLimit = 'PT2M'
    $action = $definition.Actions.Create(0)
    $action.Path = $ps
    $action.Arguments = $taskArguments
    $action.WorkingDirectory = $root
    $taskSecurity = 'O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGX;;;' + $sid + ')'
    $null = $taskApi.folder.RegisterTaskDefinition($taskName,$definition,18,
        'SYSTEM',$null,5,$taskSecurity)
    Assert-Task ($taskApi.folder.GetTask($taskName))
    if (-not (Test-Path -LiteralPath $regKey)) { $null = New-Item -Path $regKey -Force }
    Set-ItemProperty -LiteralPath $regKey -Name SetupVersion -Value 1
    Set-ItemProperty -LiteralPath $regKey -Name InstallId -Value $installId
    Set-ItemProperty -LiteralPath $regKey -Name TaskName -Value $taskName
    Set-ItemProperty -LiteralPath $regKey -Name HelperPath -Value $worker
    Write-Host 'Installed; future normal-user fixture operations do not request UAC.'
}
function Uninstall-Now {
    if (-not $admin -or $ExpectedSid -ne $sid) {
        throw 'SAME_ACCOUNT_UAC_ADMIN_APPROVAL_REQUIRED'
    }
    Assert-FixedRoot
    $taskApi = Task-FromScheduler
    if ($null -ne $taskApi.existing) {
        Assert-Task $taskApi.existing
        if ($taskApi.existing.State -eq 4) { throw 'FIXTURE_TASK_RUNNING_NO_UNINSTALL' }
    }
    if (Test-Path -LiteralPath $root) {
        $entry = Get-Item -LiteralPath $root -Force
        if (-not $entry.PSIsContainer -or
            ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'FIXTURE_INSTALL_ROOT_UNSAFE'
        }
        $fixtures = Join-Path $root 'fixtures'
        if (-not (Test-Path -LiteralPath $fixtures -PathType Container)) {
            throw 'FIXTURE_INSTALL_LAYOUT_UNKNOWN'
        }
        if ((Get-ChildItem -LiteralPath $fixtures -Force | Measure-Object).Count -ne 0) {
            throw 'FIXTURE_CLEANUP_REQUIRED_BEFORE_UNINSTALL'
        }
        $allowed = @('fixtures','receipts','Worker.ps1','settings.json','request.json')
        foreach ($item in Get-ChildItem -LiteralPath $root -Force) {
            if ($item.Name -cnotin $allowed -or
                ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'FIXTURE_FOREIGN_INSTALL_ENTRY'
            }
        }
        $receipts = Join-Path $root 'receipts'
        if (Test-Path -LiteralPath $receipts) {
            foreach ($item in Get-ChildItem -LiteralPath $receipts -Force) {
                if ($item.PSIsContainer -or
                    $item.Name -cnotmatch '^[0-9a-f]{32}\.(prepare|cleanup|workflows|cleanup-workflows|bootstrap-error)\.json$' -or
                    ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                    throw 'FIXTURE_FOREIGN_RECEIPT_ENTRY'
                }
            }
        }
    }
    if ($null -ne $taskApi.existing) {
        $taskApi.folder.DeleteTask($taskName,0)
    }
    if (Test-Path -LiteralPath $root) {
        foreach ($file in @($worker,$settingsPath,$mailbox)) {
            if (Test-Path -LiteralPath $file -PathType Leaf) {
                Remove-Item -LiteralPath $file -Force
            }
        }
        $receipts = Join-Path $root 'receipts'
        if (Test-Path -LiteralPath $receipts) {
            foreach ($item in Get-ChildItem -LiteralPath $receipts -Force) {
                Remove-Item -LiteralPath $item.FullName -Force
            }
            [IO.Directory]::Delete($receipts,$false)
        }
        [IO.Directory]::Delete((Join-Path $root 'fixtures'),$false)
        [IO.Directory]::Delete($root,$false)
    }
    if (Test-Path -LiteralPath $regKey) {
        Remove-Item -LiteralPath $regKey -Force
    }
    Write-Host 'Protected task, helper and per-user registry metadata removed.'
}
function Request-Uac([string]$elevatedMode) {
    $args = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath +
        '" -Mode ' + $elevatedMode + ' -ExpectedSid "' + $sid + '"'
    $process = Start-Process -FilePath $ps -ArgumentList $args -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    try {
        if ($process.ExitCode -ne 0) {
            throw ('ELEVATED_' + $elevatedMode + '_FAILED_CHECK_OUTPUT')
        }
    } finally { $process.Dispose() }
}
try {
    Preview-Changes
    switch ($Mode) {
        'Preview' { Write-Host 'Preview only: no registry, task, UAC or helper changes.' }
        'Install' {
            if ($admin) {
                $script:ExpectedSid = $sid
                Install-Now
            } else {
                Write-Host 'User-requested persistent installation. Windows will request UAC once.'
                Request-Uac 'InstallElevated'
            }
        }
        'InstallElevated' { Install-Now }
        'Uninstall' {
            if ($admin) {
                $script:ExpectedSid = $sid
                Uninstall-Now
            } else {
                Write-Host 'User-requested removal of trusted installation. UAC is required.'
                Request-Uac 'UninstallElevated'
            }
        }
        'UninstallElevated' { Uninstall-Now }
    }
}
catch {
    [Console]::Error.WriteLine('SETUP_FAILED: ' + $_.Exception.Message)
    exit 1
}
finally { $identity.Dispose() }
