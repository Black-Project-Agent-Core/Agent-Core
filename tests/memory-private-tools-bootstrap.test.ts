import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script=path.resolve('scripts','memory','bootstrap-private-tools.ps1');
function run(root:string,pathEnv?:string){return spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Root',root,'-VerifyOnly'],{encoding:'utf8',env:{...process.env,...(pathEnv?{PATH:pathEnv}:{})}});}

describe('portable private-tool bootstrap',()=>{
  it('does not accept an external-only rg as certified readiness',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'ac-bootstrap-external-'));const bin=path.join(root,'external');await mkdir(bin,{recursive:true});await writeFile(path.join(bin,'rg.exe'),'fake');
    const r=run(root,`${bin};${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`);expect(r.status).not.toBe(0);expect(`${r.stdout}${r.stderr}`).toContain('PRIVATE_MISSING');
  });
  it('verify-only detects already-present private tools and performs no acquisition',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'ac-bootstrap-private-'));for(const rel of ['.tools/ripgrep/rg.exe','.tools/uv/uv.exe','.tools/python/python.exe','.tools/graphify/graphify.cmd']){const f=path.join(root,...rel.split('/'));await mkdir(path.dirname(f),{recursive:true});await writeFile(f,'fixture');}
    const r=run(root);expect(r.status).toBe(0);expect(r.stdout).toContain('PRIVATE_READY');expect(r.stdout).not.toContain('Downloading');
  });
});
