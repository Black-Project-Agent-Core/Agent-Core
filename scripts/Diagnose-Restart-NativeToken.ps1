$ErrorActionPreference='Stop'
$src=@'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class RestartToken {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint a,bool b,int p);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr p,uint a,out IntPtr t);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr t,int k,IntPtr d,int s,out int n);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint i);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 public static string Read(int pid){
  IntPtr p=OpenProcess(0x1000,false,pid),t=IntPtr.Zero,b=IntPtr.Zero;
  if(p==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
  try{
   if(!OpenProcessToken(p,8,out t)) throw new Win32Exception(Marshal.GetLastWin32Error());
   int n;b=Marshal.AllocHGlobal(4);if(!GetTokenInformation(t,20,b,4,out n))throw new Win32Exception(Marshal.GetLastWin32Error());
   int e=Marshal.ReadInt32(b);Marshal.FreeHGlobal(b);b=IntPtr.Zero;
   GetTokenInformation(t,25,IntPtr.Zero,0,out n);b=Marshal.AllocHGlobal(n);if(!GetTokenInformation(t,25,b,n,out n))throw new Win32Exception(Marshal.GetLastWin32Error());
   IntPtr sid=Marshal.ReadIntPtr(b);byte c=Marshal.ReadByte(GetSidSubAuthorityCount(sid));int il=Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(c-1)));
   using(var w=new WindowsIdentity(t))return w.User.Value+"|"+e+"|"+il;
  }finally{if(b!=IntPtr.Zero)Marshal.FreeHGlobal(b);if(t!=IntPtr.Zero)CloseHandle(t);CloseHandle(p);}
 }
}
'@
Add-Type -TypeDefinition $src
function Probe($id){try{$p=Get-Process -Id $id -ErrorAction Stop;$r=Get-CimInstance Win32_Process -Filter "ProcessId=$id";$st=$r.CreationDate;[pscustomobject]@{pid=$id;start=$st;session=$r.SessionId;token=[RestartToken]::Read($id)}}catch{[pscustomobject]@{pid=$id;error=$_.Exception.GetType().Name;message=$_.Exception.Message;code=$_.Exception.HResult}}}
$ids=@($PID,4108,15628)
$before=@{};foreach($i in $ids){$before[$i]=(Get-CimInstance Win32_Process -Filter "ProcessId=$i").CreationDate}
$out=@($ids|ForEach-Object{Probe $_})
foreach($i in $ids){$after=(Get-CimInstance Win32_Process -Filter "ProcessId=$i").CreationDate;$out|Where-Object{$_.pid -eq $i}|Add-Member -NotePropertyName startUnchanged -NotePropertyValue ($before[$i]-eq $after)}
$out|ConvertTo-Json -Depth 4
