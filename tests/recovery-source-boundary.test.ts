import { readFile, mkdtemp, rm, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
it('refuses implicit remote recovery before invoking the network command',async()=>{
  const temp=await mkdtemp(path.join(root,'runtime/tmp/recovery-policy-'));
  const marker=path.join(temp,'network-attempt');const source=path.join(root,'scripts/windows/Recover-Agent-Core.ps1');
  const quote=(value:string)=>"'"+value.replaceAll("'","''")+"'";
  const script=`$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile(${quote(source)},[ref]$tokens,[ref]$errors)
$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-TrustedPackage'},$true)
Invoke-Expression $fn.Extent.Text
$SourceZip='';$ChecksumFile='';$CorrectiveEnvExample='';$ReleaseTag='v0.12.0';$ExpectedZipSha256='';$Repository='Black-Project-Agent-Core/Agent-Core';$AllowNetworkRecovery=$false
function Invoke-Gh { [IO.File]::WriteAllText(${quote(marker)},'attempt');throw 'NETWORK_WOULD_HAVE_BEEN_CALLED' }
try { Get-TrustedPackage '0.12.0' ${quote(temp)};exit 2 } catch { Write-Output $_.Exception.Message;exit 0 }
`;
  const file=path.join(temp,'probe.ps1');await writeFile(file,script);
  try {const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',windowsHide:true});
    expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('EXPLICIT_RECOVERY_SOURCE_REQUIRED');
    await expect(access(marker)).rejects.toThrow();
    expect(await readFile(source,'utf8')).toMatch(/\[string\]\$Repository\s*=\s*''/);
  } finally {await rm(temp,{recursive:true,force:true});}
});
