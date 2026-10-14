$ErrorActionPreference='Stop'
$targetPid=4108
function Get-TokenSummary([int]$ProcessId){
  try {
    $p=Get-Process -Id $ProcessId -ErrorAction Stop
    $wi=[System.Security.Principal.WindowsIdentity]::GetCurrent()
    $proc=Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    $owner=$proc|Invoke-CimMethod -MethodName GetOwner -ErrorAction Stop
    [pscustomobject]@{pid=$ProcessId;name=$p.ProcessName;path=$proc.ExecutablePath;cmd=$proc.CommandLine;creation=$proc.CreationDate;session=$proc.SessionId;owner="$($owner.Domain)\$($owner.User)";selfSid=$wi.User.Value;selfName=$wi.Name;error=$null}
  } catch {
    [pscustomobject]@{pid=$ProcessId;error=$_.Exception.GetType().Name;message=$_.Exception.Message}
  }
}
$me=[Diagnostics.Process]::GetCurrentProcess()
@(
 [pscustomobject]@{kind='checker';pid=$me.Id;name=$me.ProcessName;session=$me.SessionId;user=[Security.Principal.WindowsIdentity]::GetCurrent().Name;sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value},
 (Get-TokenSummary $targetPid)
)|ConvertTo-Json -Depth 4
