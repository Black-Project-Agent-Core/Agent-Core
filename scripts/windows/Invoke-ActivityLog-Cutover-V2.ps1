#requires -Version 5.1
<#
Approved narrow Activity Log redaction-v2 transaction. No scheduler registration, no generic process
termination, no journal restoration. Run Preflight in scope; Execute ONLY via
verified independent WMI-hosted, same-user session-1 process.
#>
[CmdletBinding()]
param(
 [ValidateSet('Preflight','Execute','Accept','RequestRollback','RestoreNow','Status')][string]$Mode='Status',
 [ValidatePattern('^[a-z0-9-]{8,48}$')][string]$Transaction='activitylog-b-20261021-8db01545'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$stage=Join-Path $root 'runtime\build\activity-log-inspector-20261021'
$manifestPath=Join-Path $stage 'candidate-manifest.REDACTION-v2.json'
$expectedManifest='430260d04baad06379250fe3df1a1f36badd6bf9b83786681c29cc95588ab907'
$transactionDir=Join-Path $stage ('transaction-'+$Transaction)
$statePath=Join-Path $transactionDir 'transaction-state.json'
$backupsPath=Join-Path $transactionDir 'backups'
$acceptPath=Join-Path $transactionDir 'accept.flag'
$rollbackPath=Join-Path $transactionDir 'rollback.flag'
$pendingDir=Join-Path $root 'runtime\launcher\pending'
$pendingExe=Join-Path $pendingDir 'Agent Core.exe'
$pendingHash=Join-Path $pendingDir 'sha256.txt'
$restart=Join-Path $root 'scripts\windows\Restart-Agent-Core.ps1'
$logPath=Join-Path $transactionDir 'worker.log'
function Sha([string]$p) {
 if(!(Test-Path -LiteralPath $p -PathType Leaf)){return $null}
 return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Exact([string]$got,[string]$expected,[string]$where){
 if(!$expected -or $got -cne $expected){throw ('HASH_DRIFT '+$where)}
}
function Read-Manifest {
 Exact (Sha $manifestPath) $expectedManifest 'manifest'
 $m=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
 if($m.schemaVersion -ne 2 -or @($m.requiredRuntimeReplacements).Count -ne 6){
  throw 'MANIFEST_UNEXPECTED_SCHEMA'
 }
 $allowed=@('Agent Core.exe','dist\ui\index.html',
   'dist\ui\assets\index-DJ6hRKFv.js','dist\ui\assets\index-CBeBCMxf.css',
   'dist\mcp\external-controller-tool-support.js','dist\tracker\tool-detail.js')
 $set=@($m.requiredRuntimeReplacements|ForEach-Object{$_.relativePath})
 if((@($set|Where-Object{$_ -notin $allowed}).Count -ne 0) -or (@($allowed|Where-Object{$_ -notin $set}).Count -ne 0)){
  throw 'MANIFEST_OUT_OF_SCOPE'
 }
 foreach($e in $m.requiredRuntimeReplacements){
  $target=Join-Path $root $e.relativePath
  if([IO.Path]::GetFullPath($target) -ine [IO.Path]::GetFullPath($e.expectedActivePath)){throw 'MANIFEST_ACTIVE_PATH_MISMATCH'}
  Exact (Sha $e.candidatePath) $e.candidateSha256 $e.relativePath
 }
 foreach($unchanged in $m.unchangedDependencyChecks){
  $path=Join-Path $root $unchanged.path
  Exact (Sha $path) $unchanged.sha256 $unchanged.path
 }
 return $m
}
function Check-Active($manifest){
 foreach($e in $manifest.requiredRuntimeReplacements){
  $exists=Test-Path -LiteralPath $e.expectedActivePath -PathType Leaf
  if($exists -ne [bool]$e.expectedActiveExists){throw ('ACTIVE_EXISTS_DRIFT '+$e.relativePath)}
  if($exists){Exact (Sha $e.expectedActivePath) $e.expectedActiveSha256 ('active:'+ $e.relativePath)}
 }
}
function Write-State([string]$status,[string]$detail){
 $me=Get-Process -Id $PID -ErrorAction Stop
 $record=[ordered]@{transaction=$Transaction;status=$status;detail=$detail;
  workerPid=$PID;workerStartedUtc=$me.StartTime.ToUniversalTime().ToString('o');
  updatedUtc=[DateTimeOffset]::UtcNow.ToString('o');approvedScope='exact-six-artifact-activity-log-B';
  replayAllowed=$false}
 $tmp=$statePath+'.next'
 [IO.File]::WriteAllText($tmp,($record|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $tmp -Destination $statePath -Force
}
function Note([string]$message){
 $line=[DateTimeOffset]::UtcNow.ToString('o')+' '+$message
 Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
 Write-Output $line
}
function Read-Baseline(){
 $p=Join-Path $transactionDir 'baseline.json'
 if(!(Test-Path -LiteralPath $p)){throw 'NO_VERIFIED_BACKUP'}
 $v=Get-Content -LiteralPath $p -Raw | ConvertFrom-Json
 if($v.transaction -cne $Transaction -or $v.manifestSha256 -cne $expectedManifest){throw 'BACKUP_IDENTITY_MISMATCH'}
 foreach($file in $v.backups){
  if($file.existed){Exact (Sha $file.backupPath) $file.expectedSha256 ('backup:'+ $file.relativePath)}
 }
 return $v
}
function Identity([int]$pid,[string]$name,[string]$expectedPath){
 $p=Get-CimInstance Win32_Process -Filter "ProcessId=$pid" -ErrorAction SilentlyContinue
 if(!$p -or $p.Name -ine $name -or $p.ExecutablePath -ine $expectedPath -or !$p.CreationDate){return $null}
 return $p
}
function Launcher-Identity(){
 $exe=Join-Path $root 'Agent Core.exe'
 $all=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -ieq 'Agent Core.exe' -and $_.ExecutablePath -ieq $exe})
 $main=@($all|Where-Object{$_.CommandLine -notmatch '--native-dump-helper|--browser-use-transport|chrome-extension://'})
 if($main.Count -ne 1){throw ('LAUNCHER_COUNT '+$main.Count)}
 $p=$main[0]
 $view=Get-Process -Id $p.ProcessId -ErrorAction Stop
 if($view.MainWindowHandle -eq [IntPtr]::Zero){throw 'LAUNCHER_MAIN_WINDOW_ABSENT'}
 return $p
}
function No-ActiveTerminalWork(){
 $ledgerPath=Join-Path $root 'runtime\rdc\process-ledger.json'
 if(!(Test-Path -LiteralPath $ledgerPath)){throw 'LEDGER_MISSING'}
 $ledger=Get-Content -LiteralPath $ledgerPath -Raw|ConvertFrom-Json
 foreach($rec in @($ledger.records|Where-Object{$_.status -in @('running','cancelling') -and $_.pid})){
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$rec.pid)" -ErrorAction SilentlyContinue
  if(!$p){continue}
  $raw=[ordered]@{image=$p.Name;created=$p.CreationDate}|ConvertTo-Json -Compress
  $stamp=[regex]::Match($raw,'"created"\s*:\s*"([^"]+)"').Groups[1].Value.Replace('\/','/')
  if($stamp -ceq [string]$rec.identity.created -and $p.Name -ieq [string]$rec.identity.image){
   throw ('ACTIVE_TERMINAL_WORK pid='+$p.ProcessId+' image='+$p.Name)
  }
 }
}
function Copy-Verified([string]$src,[string]$target,[string]$hash){
 Exact (Sha $src) $hash ('source:'+ $src)
 $dir=Split-Path -Parent $target
 if(!(Test-Path -LiteralPath $dir)){[void][IO.Directory]::CreateDirectory($dir)}
 $tmp=$target+'.activitylog-'+$Transaction+'.tmp'
 if(Test-Path -LiteralPath $tmp){throw ('RESIDUAL_TEMP '+$tmp)}
 Copy-Item -LiteralPath $src -Destination $tmp -ErrorAction Stop
 Exact (Sha $tmp) $hash ('temp:'+ $target)
 Move-Item -LiteralPath $tmp -Destination $target -Force -ErrorAction Stop
 Exact (Sha $target) $hash ('installed:'+ $target)
}
function Reconcile-Pending([string]$candidate,[string]$sha){
 if(Test-Path -LiteralPath $pendingHash){throw 'PENDING_ACTIVATION_ALREADY_ARMED'}
 Copy-Verified $candidate $pendingExe $sha
 [IO.File]::WriteAllText($pendingHash,$sha,[Text.UTF8Encoding]::new($false))
 Exact ((Get-Content -LiteralPath $pendingHash -Raw).Trim()) $sha 'pending-marker'
}
function Restore-PendingOriginal($baseline){
 $entry=@($baseline.backups|Where-Object{$_.relativePath -eq 'runtime\launcher\pending\Agent Core.exe'})[0]
 if(!$entry){throw 'ORIGINAL_PENDING_BACKUP_MISSING'}
 if(Test-Path -LiteralPath $pendingHash){throw 'PENDING_MARKER_NOT_CONSUMED'}
 if($entry.existed){Copy-Verified $entry.backupPath $pendingExe $entry.expectedSha256}
 elseif(Test-Path -LiteralPath $pendingExe){
  $current=Sha $pendingExe
  $new='66ac14be36fa64dc53df1db3b7f689fc3f056a57221db9f25ea0bb3d422469a8'
  $old='45fc4bcb64ec3700a65410ab8cc18522f542340baeabb7742992c21bc2221f8e'
  if($current -cne $new -and $current -cne $old){throw 'UNKNOWN_PENDING_FILE_DRIFT'}
  Remove-Item -LiteralPath $pendingExe -Force
 }
}
function Wait-Health([int]$seconds,[string]$launcherHash){
 $until=[DateTimeOffset]::UtcNow.AddSeconds($seconds)
 while([DateTimeOffset]::UtcNow -lt $until){
  try {
   $h=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 5
   $good=$h.status -eq 'ok' -and $h.version -eq '0.15.0' -and (Sha (Join-Path $root 'Agent Core.exe')) -eq $launcherHash
   $core=@(Get-NetTCPConnection -State Listen -LocalPort 8765 -ErrorAction SilentlyContinue)
   $tunnel=@(Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue)
   if($good -and $core.Count -gt 0 -and $tunnel.Count -gt 0){return $true}
  }catch{}
  Start-Sleep -Seconds 3
 }
 return $false
}
function Invoke-OfficialRestart(){
 if(!(Test-Path -LiteralPath $restart)){throw 'OFFICIAL_RESTART_SCRIPT_MISSING'}
 $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 & $powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $restart -StopTimeoutSeconds 120 -StartTimeoutSeconds 180 *>>$logPath
 if($LASTEXITCODE -ne 0){throw ('OFFICIAL_RESTART_EXIT '+$LASTEXITCODE)}
}
function Restore-Runtime($manifest,$baseline) {
 Note 'ROLLBACK_ENTER'
 Write-State 'ROLLBACK_RUNNING' 'Restoring only transaction-installed artifacts'
 foreach($e in $manifest.requiredRuntimeReplacements|Where-Object{$_.relativePath -ne 'Agent Core.exe'}){
  $b=@($baseline.backups|Where-Object{$_.relativePath -eq $e.relativePath})[0]
  if(!$b){throw ('BACKUP_MISSING '+$e.relativePath)}
  $active=Sha $e.expectedActivePath
  if($active -cne $e.candidateSha256 -and $active -cne $e.expectedActiveSha256){
   throw ('ROLLBACK_ACTIVE_HASH_DRIFT '+$e.relativePath)
  }
  if($b.existed){Copy-Verified $b.backupPath $e.expectedActivePath $b.expectedSha256}
 }
 $launcher=$manifest.requiredRuntimeReplacements[0]
 $launcherBackup=@($baseline.backups|Where-Object{$_.relativePath -eq 'Agent Core.exe'})[0]
 $installedRoot=Sha $launcher.expectedActivePath
 if($installedRoot -cne $launcher.candidateSha256 -and $installedRoot -cne $launcherBackup.expectedSha256){
  throw 'ROLLBACK_LAUNCHER_HASH_DRIFT'
 }
 if(Test-Path -LiteralPath $pendingHash){
  # Only our exact pending candidate marker can be replaced by rollback.
  $marker=(Get-Content -LiteralPath $pendingHash -Raw).Trim()
  if($marker -cne $launcher.candidateSha256 -or (Sha $pendingExe) -cne $launcher.candidateSha256){
   throw 'FOREIGN_PENDING_MARKER_BLOCKS_ROLLBACK'
  }
  Remove-Item -LiteralPath $pendingHash -Force
 }
 Reconcile-Pending $launcherBackup.backupPath $launcherBackup.expectedSha256
 Invoke-OfficialRestart
 if(!(Wait-Health 120 $launcherBackup.expectedSha256)){throw 'ROLLBACK_HEALTH_NOT_CONFIRMED'}
 Restore-PendingOriginal $baseline
 foreach($e in $manifest.requiredRuntimeReplacements|Where-Object{$_.relativePath -ne 'Agent Core.exe'}){
  $b=@($baseline.backups|Where-Object{$_.relativePath -eq $e.relativePath})[0]
  if(!$b.existed -and (Sha $e.expectedActivePath) -eq $e.candidateSha256){
   Remove-Item -LiteralPath $e.expectedActivePath -Force
  }
 }
 Note 'ROLLBACK_RESTORED_EXE_UI_NODE_WITH_JOURNAL_UNTOUCHED'
 Write-State 'ROLLED_BACK' 'Verified original six-artifact set; journal/cutoff preserved in place'
}
if($Mode -eq 'Status'){
 if(Test-Path -LiteralPath $statePath){Get-Content -LiteralPath $statePath -Raw}else{Write-Output 'NO_TRANSACTION'}
 return
}
$m=Read-Manifest
if($Mode -eq 'Preflight'){
 if(Test-Path -LiteralPath $transactionDir){throw 'TRANSACTION_ALREADY_EXISTS'}
 Check-Active $m
 $owner=Launcher-Identity
 # Backup is taken BEFORE stopping any approved terminal sessions.
 # Execute enforces a separate drain barrier immediately before install.
 [void][IO.Directory]::CreateDirectory($backupsPath)
 $backups=@()
 foreach($e in $m.requiredRuntimeReplacements){
  $destination=Join-Path $backupsPath $e.relativePath
  $had=Test-Path -LiteralPath $e.expectedActivePath -PathType Leaf
  if($had){
   [void][IO.Directory]::CreateDirectory((Split-Path -Parent $destination))
   Copy-Item -LiteralPath $e.expectedActivePath -Destination $destination -ErrorAction Stop
   Exact (Sha $destination) $e.expectedActiveSha256 ('backup:'+ $e.relativePath)
  }
  $backups+=[ordered]@{relativePath=$e.relativePath;existed=$had;
   backupPath=$destination;expectedSha256=$e.expectedActiveSha256}
 }
 foreach($rel in @('runtime\tracker\activity.clear','runtime\tracker\activity log.txt',
     'runtime\launcher\pending\Agent Core.exe')){
  $src=Join-Path $root $rel;$had=Test-Path -LiteralPath $src -PathType Leaf
  $b=Join-Path $backupsPath $rel
  $hash=Sha $src
  if($had){[void][IO.Directory]::CreateDirectory((Split-Path -Parent $b));Copy-Item -LiteralPath $src -Destination $b;Exact (Sha $b) $hash ('backup:'+ $rel)}
  $backups+=[ordered]@{relativePath=$rel;existed=$had;backupPath=$b;expectedSha256=$hash}
 }
 if(Test-Path -LiteralPath $pendingHash){throw 'PREEXISTING_PENDING_MARKER'}
 $journal=Join-Path $root 'runtime\tracker\activity.jsonl'
 $fi=Get-Item -LiteralPath $journal
 $receipt=[ordered]@{transaction=$Transaction;manifestSha256=$expectedManifest;
  launcherPid=$owner.ProcessId;launcherCreated=([string]$owner.CreationDate)
  backups=$backups;journalPath=$journal;journalBytesAtBackup=$fi.Length;
  journalModifiedAtBackup=$fi.LastWriteTimeUtc.ToString('o');historyMayResetOnRestart=$true}
 [IO.File]::WriteAllText((Join-Path $transactionDir 'baseline.json'),($receipt|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
 $null=Read-Baseline
 Write-State 'BACKUP_VERIFIED' 'No active files replaced; backup and independent worker ready'
 Note 'BACKUP_VERIFIED_NO_SHUTDOWN'
 return
}
$b=Read-Baseline
if($Mode -eq 'RestoreNow'){
 $state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
 if($state.status -eq 'ACCEPTED'){throw 'TRANSACTION_ALREADY_ACCEPTED'}
 if($state.workerPid -and $state.workerStartedUtc){
  $worker=Get-Process -Id ([int]$state.workerPid) -ErrorAction SilentlyContinue
  if($worker -and $worker.Id -ne $PID -and
     $worker.StartTime.ToUniversalTime().ToString('o') -ceq [string]$state.workerStartedUtc){
   throw 'AUTONOMOUS_WORKER_STILL_RUNNING_USE_ROLLBACK_REQUEST'
  }
 }
 Restore-Runtime $m $b
 return
}
if($Mode -eq 'Accept'){
 if(!(Test-Path -LiteralPath $statePath)){throw 'NO_EXECUTION_STATE'}
 $current=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
 if($current.status -cne 'AWAITING_UI_ACCEPTANCE'){throw 'NOT_AWAITING_ACCEPTANCE'}
 foreach($e in $m.requiredRuntimeReplacements){Exact (Sha $e.expectedActivePath) $e.candidateSha256 ('accept:'+ $e.relativePath)}
 [IO.File]::WriteAllText($acceptPath,([DateTimeOffset]::UtcNow.ToString('o')),[Text.UTF8Encoding]::new($false))
 Note 'OPERATOR_ACCEPT_RECEIVED'
 return
}
if($Mode -eq 'RequestRollback'){
 [IO.File]::WriteAllText($rollbackPath,([DateTimeOffset]::UtcNow.ToString('o')),[Text.UTF8Encoding]::new($false))
 Note 'OPERATOR_REQUESTED_ROLLBACK'
 return
}
if($Mode -eq 'Execute'){
 if(!(Test-Path -LiteralPath $statePath)){throw 'NO_PREFLIGHT_STATE'}
 $state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
 if($state.status -cne 'BACKUP_VERIFIED'){throw 'PREPARED_TRANSACTION_NOT_ONE_SHOT'}
 Check-Active $m
 No-ActiveTerminalWork | Out-Null
 $owner=Launcher-Identity
 if($owner.ProcessId -ne $b.launcherPid -or ([string]$owner.CreationDate) -cne ([string]$b.launcherCreated)){
  throw 'LAUNCHER_INSTANCE_CHANGED_SINCE_BACKUP'
 }
 if(Test-Path -LiteralPath $pendingHash){throw 'PENDING_ACTIVATION_MARKER_DRIFT'}
 Write-State 'INSTALLING' 'Six required items only; independent transaction'
 try{
  # Existing old index continues to point to old assets until final HTML copy.
  $ordered=@('dist\ui\assets\index-DJ6hRKFv.js','dist\ui\assets\index-CBeBCMxf.css',
    'dist\tracker\tool-detail.js','dist\mcp\external-controller-tool-support.js','dist\ui\index.html')
  foreach($rel in $ordered){
   $e=@($m.requiredRuntimeReplacements|Where-Object{$_.relativePath -ceq $rel})[0]
   Copy-Verified $e.candidatePath $e.expectedActivePath $e.candidateSha256
  }
  Reconcile-Pending $m.requiredRuntimeReplacements[0].candidatePath $m.requiredRuntimeReplacements[0].candidateSha256
  Write-State 'PENDING_RESTART' 'Official restart will install approved EXE'
  Invoke-OfficialRestart
  foreach($e in $m.requiredRuntimeReplacements){Exact (Sha $e.expectedActivePath) $e.candidateSha256 ('installed:'+ $e.relativePath)}
  if(!(Wait-Health 120 $m.requiredRuntimeReplacements[0].candidateSha256)){throw 'CANDIDATE_HEALTH_OR_TUNNEL_UNAVAILABLE'}
  Write-State 'AWAITING_UI_ACCEPTANCE' 'Auto rollback unless specific live acceptance committed within 900 seconds'
  Note 'HEALTH_READY_AWAITING_UI_ACCEPTANCE'
  $until=[DateTimeOffset]::UtcNow.AddSeconds(900)
  $accepted=$false
  while([DateTimeOffset]::UtcNow -lt $until){
   if(Test-Path -LiteralPath $rollbackPath){throw 'OPERATOR_REQUESTED_ROLLBACK'}
   if(Test-Path -LiteralPath $acceptPath){$accepted=$true;break}
   Start-Sleep -Seconds 3
  }
  if(!$accepted){throw 'LIVE_ACCEPTANCE_TIMEOUT_ROLLBACK'}
  foreach($e in $m.requiredRuntimeReplacements){Exact (Sha $e.expectedActivePath) $e.candidateSha256 ('final:'+ $e.relativePath)}
  Restore-PendingOriginal $b
  Write-State 'ACCEPTED' 'All six installed and host live acceptance signaled'
  Note 'TRANSACTION_ACCEPTED'
 }catch{
  $reason=$_.Exception.Message
  Note ('EXECUTE_ERROR '+$reason)
  try {Restore-Runtime $m $b}catch{
   Write-State 'ROLLBACK_BLOCKED' $_.Exception.Message
   Note ('ROLLBACK_BLOCKED '+$_.Exception.Message)
   throw
  }
  throw ('CANDIDATE_ROLLED_BACK_OR_FAILED '+$reason)
 }
}
