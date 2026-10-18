#requires -Version 5.1
<#
.SYNOPSIS
Restarts this checkout's desktop launcher once, after its old runtime has exited.
.DESCRIPTION
Run manually from Windows Explorer or an independent PowerShell window, never
from an Agent Core-owned terminal: launcher shutdown can terminate its children.
Use -WhatIf to inspect the target without closing or launching anything.
The script requests normal window close. The launcher's existing shutdown code
owns graceful shutdown and its own bounded forced-cleanup fallback.
No force-kill, scheduler changes, automatic elevation, or launch retries here.
Success means one launcher window is open; Core/tunnel readiness is not tested.
Serialization covers this script. The app mutex covers one Windows session;
do not manually launch another copy in a different session during the restart.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [ValidateRange(30, 600)]
    [int]$StopTimeoutSeconds = 120,
    [ValidateRange(10, 600)]
    [int]$StartTimeoutSeconds = 180
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$exePath = Join-Path $root 'Agent Core.exe'
$nodePath = Join-Path $root 'runtime\node\node.exe'
$coreEntry = Join-Path $root 'dist\index.js'
$tunnelPath = Join-Path $root 'tunnel-client\tunnel-client.exe'
$sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
$runtimePrefixes = @(
    (Join-Path $root 'runtime\grafel\'),
    (Join-Path $root 'runtime\semantic-ide\')
)
$profilePaths = @(
    (Join-Path $root 'runtime\rdc\browser-control'),
    (Join-Path $root 'runtime\webview2')
)
$knownOwned = @{}

function Install-PendingLauncher {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    $hashFile = {
        param([string]$File)
        $stream = [IO.File]::OpenRead($File)
        $sha = [Security.Cryptography.SHA256]::Create()
        try { ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose(); $stream.Dispose() }
    }
    $project = [IO.Path]::GetFullPath($ProjectRoot)
    $pending = Join-Path $project 'runtime\launcher\pending'
    $marker = Join-Path $pending 'sha256.txt'
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { return }
    $candidate = Join-Path $pending 'Agent Core.exe'
    $destination = Join-Path $project 'Agent Core.exe'
    foreach ($path in @($pending, $marker, $candidate)) {
        if ((Get-Item -LiteralPath $path -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Pending launcher activation refuses reparse points.'
        }
    }
    if ((Get-Item -LiteralPath $marker).Length -gt 128) { throw 'Pending launcher checksum is invalid.' }
    $expected = (Get-Content -LiteralPath $marker -Raw).Trim()
    if ($expected -cnotmatch '^[0-9a-f]{64}$' -or
        (& $hashFile $candidate) -cne $expected) {
        throw 'Pending launcher checksum mismatch; original launcher preserved.'
    }
    $backupDirectory = Join-Path $project 'runtime\launcher\backups'
    [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
    $backup = Join-Path $backupDirectory ('launcher-' + [Guid]::NewGuid().ToString('N') + '.exe')
    Copy-Item -LiteralPath $destination -Destination $backup -ErrorAction Stop
    try {
        Copy-Item -LiteralPath $candidate -Destination $destination -Force -ErrorAction Stop
        if ((& $hashFile $destination) -cne $expected) {
            throw 'Activated launcher checksum mismatch.'
        }
        Remove-Item -LiteralPath $marker -ErrorAction Stop
    }
    catch {
        Copy-Item -LiteralPath $backup -Destination $destination -Force -ErrorAction Stop
        throw
    }
    Write-Host "Verified launcher build activated; original retained at $backup"
}

function Test-ProjectProcess($Process) {
    $path = [string]$Process.ExecutablePath
    $command = [string]$Process.CommandLine
    if ($path -ieq $exePath -or $path -ieq $tunnelPath -or $path -ieq $nodePath) { return $true }
    foreach ($prefix in $runtimePrefixes) {
        if ($path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    foreach ($profilePath in $profilePaths) {
        if ($command.IndexOf($profilePath, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    # Also detect a Core started with another Node executable.
    return ($Process.Name -ieq 'node.exe' -and
        $command.Replace('/', '\').IndexOf($coreEntry, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Get-RestartState {
    $all = @(Get-CimInstance -ClassName Win32_Process -OperationTimeoutSec 10)
    $owned = @()
    $launchers = @()
    $unresolved = @()
    $nextKnownOwned = @{}
    foreach ($item in $all) {
        $processId = [int]$item.ProcessId
        $previous = $script:knownOwned[$processId]
        $sameKnownProcess = $null -ne $previous -and
            (-not $item.CreationDate -or $item.CreationDate -eq $previous.CreationDate)
        $candidate = $item.Name -in @('Agent Core.exe', 'node.exe', 'tunnel-client.exe') -or
            $sameKnownProcess -or (Test-ProjectProcess $item)
        if (-not $candidate) { continue }

        if (-not $item.ExecutablePath -or -not $item.CommandLine -or -not $item.CreationDate) {
            # A terminating process can disappear between the inventory and this
            # query. Never interpret missing metadata as proof of access denial.
            $fresh = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$processId" -OperationTimeoutSec 10)
            if ($fresh.Count -eq 0) { continue }
            if ($fresh.Count -ne 1) { throw "Query identitas PID $processId tidak tunggal. Restart dibatalkan." }
            $item = $fresh[0]
            # Reclassify the fresh row: a reused PID must not inherit ownership.
            $sameKnownProcess = $null -ne $previous -and
                (-not $item.CreationDate -or $item.CreationDate -eq $previous.CreationDate)
            $candidate = $item.Name -in @('Agent Core.exe', 'node.exe', 'tunnel-client.exe') -or
                $sameKnownProcess -or (Test-ProjectProcess $item)
            if (-not $candidate) { continue }
        }

        $path = [string]$item.ExecutablePath
        $command = [string]$item.CommandLine
        if (-not $path -or -not $command -or -not $item.CreationDate) {
            $missing = @()
            if (-not $path) { $missing += 'ExecutablePath' }
            if (-not $command) { $missing += 'CommandLine' }
            if (-not $item.CreationDate) { $missing += 'CreationDate' }
            $unresolved += [pscustomobject]@{
                ProcessId = $processId
                Detail = "PID $processId ($($item.Name)): $($missing -join ', ') belum terbaca"
            }
            # Retain previously owned browser/LSP helpers while metadata is
            # incomplete. Unknown creation time is a blocker, never proof of exit.
            if ($sameKnownProcess) { $nextKnownOwned[$processId] = $previous }
            continue
        }
        if ($item.Name -ieq 'Agent Core.exe' -and $path -ine $exePath -and
            [int]$item.SessionId -eq $sessionId) {
            throw "Agent Core lain ada di sesi Windows ini (PID $($item.ProcessId)). Tutup sendiri instance tersebut sebelum restart."
        }
        if (-not $sameKnownProcess -and -not (Test-ProjectProcess $item)) { continue }
        if ([int]$item.SessionId -ne $sessionId) {
            throw "Proses proyek ini berjalan di sesi Windows lain (PID $($item.ProcessId)). Restart dibatalkan."
        }
        $owned += $item
        $nextKnownOwned[$processId] = $item
        $browserUseHelper = $command -match '(?:^|\s)"?chrome-extension://bgjoihaepiejlfjinojjfgokghnodnhd/"?(?:\s|$)' -or
            $command -match '^(?:"[^"]+"|\S+)\s+--browser-use-transport\s+(?:"[^"]+"|\S+)\s*$'
        if ($path -ieq $exePath -and -not $browserUseHelper -and
            $command -cnotmatch '^(?:"[^"]+"|\S+)\s+--native-dump-helper\s+\d+\s+(?:"[^"]+"|\S+)\s+\S+\s*$') {
            $launchers += $item
        }
    }
    $script:knownOwned = $nextKnownOwned
    [pscustomobject]@{ All = $all; Owned = $owned; Launchers = $launchers; Unresolved = $unresolved }
}

function Assert-ResolvedState($State) {
    if ($State.Unresolved.Count -gt 0) {
        throw "Identitas proses belum dapat dipastikan: $($State.Unresolved.Detail -join '; '). Proses mungkin sedang keluar atau akses metadata terbatas. Tidak melanjutkan restart."
    }
}

function Assert-IndependentTerminal($State) {
    $ancestorId = $PID
    $seen = @{}
    while ($ancestorId -gt 0 -and -not $seen.ContainsKey($ancestorId)) {
        $seen[$ancestorId] = $true
        $ancestor = @($State.All | Where-Object { [int]$_.ProcessId -eq $ancestorId })
        if ($ancestor.Count -ne 1) { break }
        if (@($State.Owned | Where-Object { [int]$_.ProcessId -eq $ancestorId }).Count -gt 0) {
            throw 'Terminal ini milik Agent Core. Jalankan file CMD dari Windows Explorer atau PowerShell yang dibuka sendiri.'
        }
        $parentId = [int]$ancestor[0].ParentProcessId
        $parent = @($State.All | Where-Object { [int]$_.ProcessId -eq $parentId })
        if ($parent.Count -ne 1 -or $parent[0].CreationDate -gt $ancestor[0].CreationDate) { break }
        $ancestorId = $parentId
    }
}

$restartMutex = $null
$lockTaken = $false
$started = $null
$exitCode = 0
try {
    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) { throw "EXE tidak ditemukan: $exePath" }
    if (-not (Test-Path -LiteralPath $coreEntry -PathType Leaf)) { throw "Core build tidak ditemukan: $coreEntry" }

    # Separate from Local\AgentCoreDesktop. Holding the app mutex would prevent
    # Program.Main from launching. Global serializes this script across sessions.
    $restartMutex = [Threading.Mutex]::new($false, 'Global\AgentCoreManualRestart')
    try { $lockTaken = $restartMutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] {
        $lockTaken = $true
        throw 'Restart sebelumnya terputus. Periksa kondisi Agent Core sebelum menjalankan ulang.'
    }
    if (-not $lockTaken) { throw 'Skrip restart lain masih berjalan. Tidak ada tindakan tambahan.' }

    $state = Get-RestartState
    Assert-ResolvedState $state
    Assert-IndependentTerminal $state
    if ($state.Launchers.Count -gt 1) { throw 'Lebih dari satu launcher utama ditemukan. Selesaikan duplikasi yang ada secara manual.' }
    if ($state.Launchers.Count -eq 0 -and $state.Owned.Count -gt 0) {
        throw 'Launcher tidak ada tetapi proses runtime lama masih hidup. Peluncuran dibatalkan agar tidak terjadi duplikasi.'
    }
    Write-Host "Target: $exePath"
    Write-Host "Launcher utama: $($state.Launchers.Count); proses proyek termasuk helper: $($state.Owned.Count)."
    if (-not $PSCmdlet.ShouldProcess($exePath, 'Tutup launcher lama, tunggu runtime berhenti, lalu buka satu launcher')) { return }

    if ($state.Launchers.Count -eq 1) {
        $old = $state.Launchers[0]
        $oldProcess = [Diagnostics.Process]::GetProcessById([int]$old.ProcessId)
        try {
            # Retain a handle before rechecking identity, preventing PID reuse.
            # Compare CIM timestamps with CIM, not lower/higher-precision clocks.
            $null = $oldProcess.Handle
            $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($old.ProcessId)" -OperationTimeoutSec 10
            if ($null -eq $current -or $current.CreationDate -ne $old.CreationDate -or
                $current.ExecutablePath -ine $exePath -or $current.CommandLine -cne $old.CommandLine -or
                [int]$current.SessionId -ne $sessionId -or $oldProcess.HasExited -or
                $oldProcess.MainModule.FileName -ine $exePath) {
                throw 'Identitas launcher berubah. Restart dibatalkan; periksa kondisi aplikasi.'
            }
            if ($oldProcess.MainWindowHandle -eq [IntPtr]::Zero) {
                throw 'Jendela launcher tidak tersedia atau sedang ditutup. Tidak melakukan force-kill.'
            }
            Write-Host "Meminta shutdown normal PID $($old.ProcessId)..."
            if ($oldProcess.HasExited) { throw 'Launcher sudah keluar sebelum permintaan tutup. Periksa kondisi aplikasi.' }
            if (-not $oldProcess.CloseMainWindow()) { throw 'Permintaan tutup ditolak. Tidak meluncurkan proses baru.' }
        }
        finally { $oldProcess.Dispose() }

        $timer = [Diagnostics.Stopwatch]::StartNew()
        $reportedUnresolved = $false
        do {
            $state = Get-RestartState
            if ($state.Owned.Count -eq 0 -and $state.Unresolved.Count -eq 0) { break }
            if ($state.Unresolved.Count -gt 0 -and -not $reportedUnresolved) {
                Write-Host "Menunggu proses keluar/metadata terbaca: $($state.Unresolved.Detail -join '; ')..."
                $reportedUnresolved = $true
            }
            if ($timer.Elapsed.TotalSeconds -ge $StopTimeoutSeconds) {
                $remaining = @($state.Owned | ForEach-Object { "PID $($_.ProcessId) ($($_.Name))" }) +
                    @($state.Unresolved | ForEach-Object { $_.Detail })
                throw "Batas tunggu shutdown habis. Proses tersisa/belum pasti: $($remaining -join '; '). Tidak meluncurkan proses baru."
            }
            Start-Sleep -Milliseconds 500
        } while ($true)
    }

    # Recheck immediately before the single launch. The app's own mutex covers
    # a concurrent manual start in this Windows session after this snapshot.
    $state = Get-RestartState
    Assert-ResolvedState $state
    if ($state.Owned.Count -ne 0) { throw 'Proses proyek muncul sebelum peluncuran. Restart dibatalkan.' }
    $appMutex = $null
    try { $appMutex = [Threading.Mutex]::OpenExisting('Local\AgentCoreDesktop') }
    catch [Threading.WaitHandleCannotBeOpenedException] { }
    if ($null -ne $appMutex) {
        $appMutex.Dispose()
        throw 'Mutex launcher masih ada. Tidak meluncurkan instance tambahan.'
    }
    Install-PendingLauncher -ProjectRoot $root
    Write-Host 'Membuka Agent Core satu kali...'
    $started = Start-Process -FilePath $exePath -WorkingDirectory $root -PassThru
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        $started.Refresh()
        if ($started.HasExited) { throw 'Proses yang diluncurkan sudah keluar. Tidak mencoba peluncuran ulang otomatis.' }
        $state = Get-RestartState
        if ($state.Launchers.Count -gt 1) { throw 'Terdeteksi beberapa launcher utama. Periksa manual; tidak ada peluncuran ulang.' }
        if ($state.Unresolved.Count -eq 0 -and $state.Launchers.Count -eq 1 -and [int]$state.Launchers[0].ProcessId -eq $started.Id -and
            $started.MainWindowHandle -ne [IntPtr]::Zero) {
            Write-Host "Satu jendela Agent Core terbuka (PID $($started.Id))." -ForegroundColor Green
            Write-Host 'Proses native-dump-helper tambahan adalah normal. Kesiapan Core/tunnel belum diuji; lihat status aplikasi.'
            break
        }
        if ($timer.Elapsed.TotalSeconds -ge $StartTimeoutSeconds) {
            Assert-ResolvedState $state
            throw 'Batas tunggu jendela habis. Proses yang sudah diluncurkan dibiarkan; periksa manual sebelum mencoba lagi.'
        }
        Start-Sleep -Milliseconds 500
    } while ($true)
}
catch {
    $exitCode = 1
    Write-Host "GAGAL: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($null -ne $started) { $started.Dispose() }
    if ($lockTaken) { $restartMutex.ReleaseMutex() }
    if ($null -ne $restartMutex) { $restartMutex.Dispose() }
}
exit $exitCode
