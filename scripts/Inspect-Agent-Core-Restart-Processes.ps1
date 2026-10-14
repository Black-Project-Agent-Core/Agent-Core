$ErrorActionPreference='Stop'
$pids=@(4108,15628)
foreach($targetPid in $pids){
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid"
  if($null -eq $p){ Write-Output "PID=$targetPid NOT_FOUND"; continue }
  $owner=$null
  try { $owner=$p | Invoke-CimMethod -MethodName GetOwner } catch { $owner="OWNER_ERROR:$($_.Exception.Message)" }
  $proc=Get-Process -Id $targetPid -ErrorAction SilentlyContinue
  [pscustomobject]@{
    PID=$targetPid
    Name=$p.Name
    ExecutablePath=$p.ExecutablePath
    CommandLine=$p.CommandLine
    CreationDate=$p.CreationDate
    ParentProcessId=$p.ParentProcessId
    Owner=$owner
    SessionId=if($proc){$proc.SessionId}else{'UNKNOWN'}
    MainWindowHandle=if($proc){$proc.MainWindowHandle}else{'UNKNOWN'}
    StartTime=try{$proc.StartTime}catch{'UNKNOWN'}
  } | ConvertTo-Json -Depth 5
}
