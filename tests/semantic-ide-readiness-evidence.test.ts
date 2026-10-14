import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { LanguageServerSession } from '../src/semantic-ide/language-server.js';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=path.join(repoRoot,'tests','fixtures','semantic-second-wave-lsp.mjs');
const roots:string[]=[];
async function rootFixture(){const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-readiness-'));roots.push(root);return root;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
function session(root:string,mode:string,aux?:string,provider:'powershell'|'typescript'='powershell'){
  const typescript=provider==='typescript';
  return new LanguageServerSession({id:provider,adapter:provider,extensions:[typescript?'.ts':'.ps1'],languageIds:{[typescript?'.ts':'.ps1']:provider},command:process.execPath,args:[fixture,mode,...(aux?[aux]:[])],readinessTimeoutMs:120},root,1000);
}

it('retains a valid readiness signal received before initialize resolves',async()=>{
  const root=await rootFixture(), s=session(root,'early-powershell-ready');
  try{await s.start();expect(s.readiness).toBe('ready');expect(s.readinessMessage).toMatch(/powershell-ready-log/);}finally{await s.close();}
});

it('still degrades when no readiness evidence is observed',async()=>{
  const root=await rootFixture(), s=session(root,'basic');
  try{await s.start();expect(s.readiness).toBe('degraded');expect(s.readinessMessage).toBe('SEMANTIC_PROVIDER_READINESS_TIMEOUT');}finally{await s.close();}
});
it('does not let early ready override initialize failure',async()=>{
  const root=await rootFixture(), s=session(root,'early-ready-init-error');
  await expect(s.start()).rejects.toThrow(/fixture initialize failure/);
  expect(s.readiness).toBe('degraded');
  await s.close().catch(()=>undefined);
});

it('allows a later real indexing transition after early ready',async()=>{
  const root=await rootFixture(), s=session(root,'early-typescript-ready-then-progress',undefined,'typescript');
  try{
    await s.start();
    const deadline=Date.now()+500;while(s.readiness!=='indexing'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
    expect(s.readiness).toBe('indexing');
    await expect(s.request('finish-progress')).resolves.toEqual({ended:true});
    const readyDeadline=Date.now()+500;while(s.readiness!=='ready'&&Date.now()<readyDeadline)await new Promise(r=>setTimeout(r,10));
    expect(s.readiness).toBe('ready');
  }finally{await s.close();}
});

it('clears readiness evidence between starts of the same session',async()=>{
  const root=await rootFixture(), marker=path.join(root,'launches'),s=session(root,'early-ready-once',marker);
  try {
    await s.start();expect(s.readiness).toBe('ready');await s.close();
    await s.start();expect(s.readiness).toBe('degraded');expect(s.readinessMessage).toBe('SEMANTIC_PROVIDER_READINESS_TIMEOUT');
  } finally { await s.close().catch(()=>undefined); }
});