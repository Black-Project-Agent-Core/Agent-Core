#requires -Version 5.1
<#
.SYNOPSIS
Installs once, then requests an elevated Agent Core restart on demand.
.DESCRIPTION
Run from Restart-Agent-Core.cmd in Windows Explorer. First use requests UAC
consent to register one persistent task for the same interactive Windows user.
Subsequent clicks reuse it. There are no time, login, or startup triggers.
Install mode registers only; Run mode requests one restart. WhatIf does neither.
Task mode is an internal fixed action, not a general privileged command runner.
Results and worker output are saved under runtime/restart. A failed run's receipt
carries the reason in `error`: the worker log's last GAGAL line, or a note that the
worker ended without a final line. The receipt's `readiness` is the worker's last
'Kesiapan:' line (whether Core answered /health after the window opened), or null. The worker
fails if Core is not ready. A timeout is unknown outcome, not permission to retry or terminate a
running task.
#>
[CmdletBinding()]
param(
    [ValidateSet('Run', 'Install', 'Task')]
    [string]$Mode = 'Run',
    [string]$ExpectedUserSid = '',
    [int]$RequestedSessionId = -1,
    [Guid]$RunId = [Guid]::Empty,
    [ValidateRange(30, 600)]
    [int]$StopTimeoutSeconds = 120,
    [ValidateRange(10, 600)]
    [int]$StartTimeoutSeconds = 180,
    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$workerPath = Join-Path $PSScriptRoot 'Restart-Agent-Core.ps1'
$windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$userSid = $identity.User.Value
$sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
$isAdmin = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $taskKey = ([BitConverter]::ToString($sha.ComputeHash(
        [Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant() + '|' + $userSid)))).Replace('-', '').Substring(0, 16)
}
finally { $sha.Dispose() }
$taskName = 'AgentCore-Restart-Manual-' + $taskKey
$description = 'Agent Core on-demand restart v1 | ' + $root + ' | ' + $userSid
# ArgN substitutions are performed by Task Scheduler, not by PowerShell here.
$taskArguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
    $PSCommandPath + '" -Mode Task -ExpectedUserSid "' + $userSid +
    '" -RunId "$(Arg0)" -RequestedSessionId "$(Arg1)" -StopTimeoutSeconds "$(Arg2)" -StartTimeoutSeconds "$(Arg3)"'
$resultDirectory = Join-Path $root 'runtime\restart'

function Find-RestartTask {
    try { return $taskFolder.GetTask($taskName) }
    catch {
        if ($_.Exception.GetBaseException().HResult -eq -2147024894) { return $null }
        throw
    }
}

function Assert-RestartTask($Task) {
    if ($null -eq $Task) { throw 'Task restart belum terpasang.' }
    $definition = $Task.Definition
    $principalSid = [string]$definition.Principal.UserId
    if ($principalSid -notlike 'S-1-*') {
        $principalSid = ([Security.Principal.NTAccount]::new($principalSid)).Translate(
            [Security.Principal.SecurityIdentifier]).Value
    }
    $settings = $definition.Settings
    if ($Task.Name -cne $taskName -or $Task.Path -cne ('\' + $taskName) -or
        $definition.RegistrationInfo.Description -cne $description -or
        $principalSid -ne $userSid -or $definition.Principal.LogonType -ne 3 -or
        $definition.Principal.RunLevel -ne 1 -or $definition.Triggers.Count -ne 0 -or
        $definition.Actions.Count -ne 1 -or -not $Task.Enabled -or -not $settings.Enabled -or
        -not $settings.AllowDemandStart -or $settings.StartWhenAvailable -or
        $settings.AllowHardTerminate -or $settings.ExecutionTimeLimit -ne 'PT0S' -or
        $settings.MultipleInstances -ne 0 -or $settings.RestartCount -ne 0 -or
        $settings.DisallowStartIfOnBatteries -or $settings.StopIfGoingOnBatteries -or
        $settings.RunOnlyIfIdle -or $settings.IdleSettings.StopOnIdleEnd -or
        $settings.RunOnlyIfNetworkAvailable -or $settings.WakeToRun) {
        throw "Task $taskName berbeda dari konfigurasi yang diharapkan. Tidak menimpa atau menjalankannya."
    }
    $action = $definition.Actions.Item(1)
    if ($action.Type -ne 0 -or $action.Path -ine $windowsPowerShell -or
        $action.WorkingDirectory -ine $root -or $action.Arguments -cne $taskArguments) {
        throw 'Aksi task tidak cocok dengan skrip proyek ini. Tidak menjalankannya.'
    }
}

# The reason a worker run failed, read from its own log. The worker (Restart-Agent-Core.ps1) prints
# 'GAGAL: <reason>' for a failure it understood and always ends with 'Selesai: ok' or 'Selesai: gagal'.
# A failed run with no 'Selesai:' line ended abruptly (killed, or died before its final block), and the
# receipt says so rather than leaving `error` empty. Returns $null for a successful run.
function Get-WorkerFailureReason {
    param([string]$LogPath, [int]$ExitCode)
    if ($ExitCode -eq 0) { return $null }
    $lines = @()
    if ($LogPath -and (Test-Path -LiteralPath $LogPath -PathType Leaf)) {
        # Windows PowerShell writes `*>` redirects as UTF-16 with a BOM; Get-Content reads either.
        try { $lines = @(Get-Content -LiteralPath $LogPath -ErrorAction Stop) } catch { $lines = @() }
    }
    $failure = @($lines | Where-Object { ([string]$_).StartsWith('GAGAL:', [StringComparison]::Ordinal) })
    if ($failure.Count -gt 0) {
        $reason = ([string]$failure[$failure.Count - 1]).Substring(6).Trim()
        if ($reason) { return $reason }
        return "worker melaporkan GAGAL tanpa pesan (exit $ExitCode)"
    }
    $ended = @($lines | Where-Object { ([string]$_).StartsWith('Selesai:', [StringComparison]::Ordinal) })
    if ($ended.Count -gt 0) { return "worker melaporkan gagal tanpa baris GAGAL (exit $ExitCode)" }
    return "worker berakhir tanpa baris akhir (exit $ExitCode)"
}

# The worker's last 'Kesiapan: <state> (<detail>)' line, without the prefix, or $null when it printed none
# (a run that failed before the window opened, or an older worker). It is the worker's report of whether
# Core answered /health after the window opened; the receipt carries it beside the exit code and never
# lets it change that code.
function Get-WorkerReadiness {
    param([string]$LogPath)
    if (-not $LogPath -or -not (Test-Path -LiteralPath $LogPath -PathType Leaf)) { return $null }
    try { $lines = @(Get-Content -LiteralPath $LogPath -ErrorAction Stop) } catch { return $null }
    $found = @($lines | Where-Object { ([string]$_).StartsWith('Kesiapan:', [StringComparison]::Ordinal) })
    if ($found.Count -eq 0) { return $null }
    $text = ([string]$found[$found.Count - 1]).Substring(9).Trim()
    if ($text) { return $text }
    return $null
}

function Install-RestartTask {
    if (-not $isAdmin) { throw 'Pemasangan membutuhkan persetujuan UAC administrator.' }
    $existing = Find-RestartTask
    if ($null -ne $existing) { Assert-RestartTask $existing; return }
    $definition = $scheduler.NewTask(0)
    $definition.RegistrationInfo.Description = $description
    $definition.Principal.UserId = $userSid
    $definition.Principal.LogonType = 3 # InteractiveToken: no stored password.
    $definition.Principal.RunLevel = 1 # Highest; never SYSTEM or another user.
    $settings = $definition.Settings
    $settings.Enabled = $true
    $settings.AllowDemandStart = $true
    $settings.StartWhenAvailable = $false
    $settings.AllowHardTerminate = $false
    $settings.ExecutionTimeLimit = 'PT0S'
    # A GUI descendant can keep a task instance alive. Let new click requests
    # reach the existing restart mutex instead of discarding or killing them.
    $settings.MultipleInstances = 0 # Parallel; worker serializes actual restarts.
    $settings.RestartCount = 0
    $settings.DisallowStartIfOnBatteries = $false
    $settings.StopIfGoingOnBatteries = $false
    $settings.RunOnlyIfIdle = $false
    $settings.IdleSettings.StopOnIdleEnd = $false
    $settings.RunOnlyIfNetworkAvailable = $false
    $settings.WakeToRun = $false
    $settings.Priority = 5
    $action = $definition.Actions.Create(0)
    $action.Path = $windowsPowerShell
    $action.Arguments = $taskArguments
    $action.WorkingDirectory = $root
    # Administrators own the task. Grant the current SID read/run without UAC;
    # suppress Scheduler's implicit principal ACE so it cannot broaden this ACL.
    $security = 'O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGX;;;' + $userSid + ')'
    $null = $taskFolder.RegisterTaskDefinition($taskName, $definition, 18, $userSid, $null, 3, $security)
    $registered = Find-RestartTask
    Assert-RestartTask $registered
    $descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($registered.GetSecurityDescriptor(7))
    if ($descriptor.Owner.Value -ne 'S-1-5-32-544') {
        throw 'Pemilik task tidak sesuai. Pemasangan belum terverifikasi; tidak menjalankan restart.'
    }
    Write-Host "Task terpasang tanpa jadwal: $taskName"
}

$requestMutex = $null
$lockTaken = $false
$exitCode = 0
try {
    if ($sessionId -le 0) { throw 'Jalankan dari sesi desktop Windows yang aktif.' }
    if ($ExpectedUserSid -and $ExpectedUserSid -ne $userSid) {
        throw 'Akun saat elevasi berbeda. Gunakan administrator dengan akun Windows yang sama.'
    }
    if ($RequestedSessionId -ge 0 -and $RequestedSessionId -ne $sessionId) {
        throw 'Sesi Windows berubah. Tidak melakukan restart.'
    }
    if (-not (Test-Path -LiteralPath $workerPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $root 'Agent Core.exe') -PathType Leaf)) {
        throw 'EXE atau skrip restart proyek tidak ditemukan.'
    }
    if ($WhatIf) {
        Write-Host "WhatIf: $Mode; task $taskName; pengguna $userSid; sesi $sessionId."
        Write-Host 'Tidak membuat task, meminta UAC, atau menjalankan restart.'
        return
    }
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $taskFolder = $scheduler.GetFolder('\')

    if ($Mode -eq 'Install') {
        Install-RestartTask
    }
    elseif ($Mode -eq 'Task') {
        if (-not $isAdmin -or -not $ExpectedUserSid -or $RequestedSessionId -le 0 -or $RunId -eq [Guid]::Empty) {
            throw 'Permintaan task tidak memiliki identitas, sesi, atau hak administrator yang valid.'
        }
        $null = New-Item -ItemType Directory -Path $resultDirectory -Force
        $runKey = $RunId.ToString('N')
        $receiptPath = Join-Path $resultDirectory ($runKey + '.json')
        $logPath = Join-Path $resultDirectory ($runKey + '.log')
        # A request ID can be consumed only once, including after interruption.
        $claim = [IO.File]::Open((Join-Path $resultDirectory ($runKey + '.claimed')),
            [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $claim.Dispose()
        $workerExit = 1
        $workerError = $null
        try {
            Assert-RestartTask (Find-RestartTask)
            # Wait for the PowerShell worker only, not the GUI's entire tree.
            & $windowsPowerShell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $workerPath `
                -StopTimeoutSeconds $StopTimeoutSeconds -StartTimeoutSeconds $StartTimeoutSeconds *> $logPath
            $workerExit = $LASTEXITCODE
        }
        catch { $workerError = $_.Exception.Message }
        finally {
            if ($null -eq $workerError) {
                # Never let reading the log stop the receipt from being written.
                try { $workerError = Get-WorkerFailureReason -LogPath $logPath -ExitCode ([int]$workerExit) }
                catch { if ([int]$workerExit -ne 0) { $workerError = "alasan kegagalan tidak dapat dibaca dari log (exit $workerExit)" } }
            }
            $workerReadiness = $null
            try { $workerReadiness = Get-WorkerReadiness -LogPath $logPath } catch { $workerReadiness = $null }
            $receipt = [ordered]@{
                runId = $runKey; userSid = $userSid; sessionId = $sessionId
                completedAt = [DateTimeOffset]::UtcNow.ToString('o')
                exitCode = $workerExit; error = $workerError; readiness = $workerReadiness; logPath = $logPath
            }
            $temporaryReceipt = $receiptPath + '.tmp'
            $receipt | ConvertTo-Json | Set-Content -LiteralPath $temporaryReceipt -Encoding UTF8
            Move-Item -LiteralPath $temporaryReceipt -Destination $receiptPath -Force
        }
        $exitCode = $workerExit
    }
    else {
        $requestMutex = [Threading.Mutex]::new($false, ('Local\AgentCoreRestartRequest-' + $taskKey))
        try { $lockTaken = $requestMutex.WaitOne(0) }
        catch [Threading.AbandonedMutexException] {
            $lockTaken = $true
            throw 'Permintaan sebelumnya terputus. Periksa aplikasi dan runtime\restart sebelum mencoba lagi.'
        }
        if (-not $lockTaken) { throw 'Permintaan restart lain masih berjalan. Tidak mengirim ulang.' }
        $task = Find-RestartTask
        if ($null -eq $task) {
            if ($isAdmin) { Install-RestartTask }
            else {
                Write-Host 'Pemasangan pertama: setujui UAC untuk task restart akun ini.'
                $installArguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath +
                    '" -Mode Install -ExpectedUserSid "' + $userSid + '" -RequestedSessionId ' + $sessionId
                $installer = Start-Process -FilePath $windowsPowerShell -ArgumentList $installArguments `
                    -WorkingDirectory $root -Verb RunAs -WindowStyle Hidden -PassThru
                try {
                    $installer.WaitForExit()
                    if ($installer.ExitCode -ne 0) { throw 'Pemasangan task gagal. Tidak mengirim permintaan restart.' }
                }
                finally { $installer.Dispose() }
            }
            $task = Find-RestartTask
        }
        Assert-RestartTask $task
        $runKey = [Guid]::NewGuid().ToString('N')
        $receiptPath = Join-Path $resultDirectory ($runKey + '.json')
        Write-Host "Meminta restart melalui task $taskName..."
        # Pin execution to the calling desktop session; no retries after RunEx.
        $null = $task.RunEx([string[]]@($runKey, $sessionId.ToString(),
            $StopTimeoutSeconds.ToString(), $StartTimeoutSeconds.ToString()), 4, $sessionId, $null)
        $timer = [Diagnostics.Stopwatch]::StartNew()
        # Stop and start budgets, the worker's readiness poll (its 300 s default plus one 3 s request and
        # one 1 s sleep, rounded up), and 90 s for the rest of the worker's own work.
        $readinessBudgetSeconds = 305
        while (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
            if ($timer.Elapsed.TotalSeconds -ge ($StopTimeoutSeconds + $StartTimeoutSeconds + $readinessBudgetSeconds + 90)) {
                throw "Hasil restart belum diketahui. Tidak mengulang atau menghentikan task. Periksa $resultDirectory; ID $runKey."
            }
            Start-Sleep -Milliseconds 500
        }
        $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        if ($receipt.runId -cne $runKey -or $receipt.userSid -ne $userSid -or $receipt.sessionId -ne $sessionId) {
            throw 'Identitas hasil restart tidak cocok. Tidak mengirim ulang.'
        }
        $logPath = Join-Path $resultDirectory ($runKey + '.log')
        if (Test-Path -LiteralPath $logPath -PathType Leaf) { Get-Content -LiteralPath $logPath }
        $exitCode = [int]$receipt.exitCode
        if ($receipt.error) { Write-Host $receipt.error -ForegroundColor Red }
        Write-Host "Catatan hasil: $receiptPath"
    }
}
catch {
    $exitCode = 1
    Write-Host "GAGAL: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($lockTaken) { $requestMutex.ReleaseMutex() }
    if ($null -ne $requestMutex) { $requestMutex.Dispose() }
    $identity.Dispose()
}
exit $exitCode
