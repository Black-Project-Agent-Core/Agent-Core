import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { bytes, hash, input, readJSON, report, run, temp } from './memory/evaluation/helpers/retrieval-report-fixtures.js';
const inspect=(dir:string)=>run('verify-report-bundle.mjs',['--report',dir]);
it('seals a complete passing bundle last and replays it without approving capture',async()=>{
  const f=await report();expect(f.result.status,f.result.stderr).toBe(0);
  expect(await readdir(f.output)).toContain('report-manifest.json');
  const m=await readJSON(path.join(f.output,'report-manifest.json'));
  expect(m.members).toHaveLength(6);expect(m.outcome.eligible).toBe(true);
  expect(m.reportId).toMatch(/^retrieval-[a-f0-9]{64}$/);
  const checked=inspect(f.output);expect(checked.status,checked.stderr).toBe(0);
  expect(JSON.parse(checked.stdout)).toMatchObject({complete:true,eligible:true,status:'complete'});
  expect((await readJSON(path.join(f.output,'review-candidate.json'))).verified).toBe(false);
});
it('distinguishes a complete failed evaluation from an infrastructure failure',async()=>{
  const f=await report(input(undefined,undefined,{testsPassed:false}));expect(f.result.status).toBe(1);
  expect(await readdir(f.output)).toContain('report-manifest.json');
  expect(await readdir(f.output)).not.toContain('review-candidate.json');
  const checked=inspect(f.output);expect(checked.status,checked.stderr).toBe(1);
  expect(JSON.parse(checked.stdout)).toMatchObject({complete:true,eligible:false,status:'complete'});
});
it('labels an unsealed historical or incomplete directory without upgrading it',async()=>{
  const dir=await temp();await writeFile(path.join(dir,'score.json'),'{}');
  const before=await readdir(dir),checked=inspect(dir);expect(checked.status).toBe(1);
  expect(JSON.parse(checked.stdout)).toMatchObject({complete:false,eligible:false,status:'legacy-unsealed'});
  expect(await readdir(dir)).toEqual(before);
});
for(const mode of ['truncated-marker','altered-score','missing-verification','wrong-binding','traversal','unexpected-member','nonregular-member','extra-manifest-field'])
  it(`refuses ${mode} on explicit replay`,async()=>{
    const f=await report();expect(f.result.status,f.result.stderr).toBe(0);
    const marker=path.join(f.output,'report-manifest.json');
    expect(await readdir(f.output)).toContain('report-manifest.json');
    const m=await readJSON(marker);
    if(mode==='truncated-marker')await writeFile(marker,'{"schemaVersion":');
    if(mode==='altered-score')await writeFile(path.join(f.output,'score.json'),'{}');
    if(mode==='missing-verification')await unlink(path.join(f.output,'verification.json'));
    if(mode==='wrong-binding'){m.inputsDigest='sha256:'+'0'.repeat(64);await writeFile(marker,bytes(m));}
    if(mode==='traversal'){m.members[0].name='../outside.json';await writeFile(marker,bytes(m));}
    if(mode==='unexpected-member')await writeFile(path.join(f.output,'extra.json'),'{}');
    if(mode==='nonregular-member'){await unlink(path.join(f.output,'score.json'));await mkdir(path.join(f.output,'score.json'));}
    if(mode==='extra-manifest-field'){m.untrusted=true;await writeFile(marker,bytes(m));}
    const checked=inspect(f.output);expect(checked.status).toBe(2);expect(checked.stderr).toContain('"ok":false');
  });
it('does not overwrite any member of an existing report',async()=>{
  const f=await report();expect(f.result.status).toBe(0);
  const names=await readdir(f.output),before=await Promise.all(names.map(n=>readFile(path.join(f.output,n)).then(hash)));
  expect(run('evaluate-retrieval.mjs',f.args).status).toBe(2);
  expect(await Promise.all(names.map(n=>readFile(path.join(f.output,n)).then(hash)))).toEqual(before);
});
it('rehashing a forged score does not bypass independent recomputation',async()=>{
  const f=await report();expect(f.result.status).toBe(0);expect(await readdir(f.output)).toContain('report-manifest.json');
  const p=path.join(f.output,'score.json'),s=await readJSON(p);s.objective=0.99;const b=bytes(s);await writeFile(p,b);
  const marker=path.join(f.output,'report-manifest.json'),m=await readJSON(marker),member=m.members.find((x:any)=>x.name==='score.json');
  member.bytes=b.length;member.digest=hash(b);await writeFile(marker,bytes(m));expect(inspect(f.output).status).toBe(2);
});
for(const member of ['provenance.json','report-manifest.json'])it(`injected ENOSPC at ${member} cannot publish a replayable bundle`,async()=>{
  const dir=await temp(),preload=path.join(dir,'fault.mjs');
  await writeFile(preload,`import fs from 'node:fs/promises';
const original=fs.open;
fs.open=async function(file,...args){
  if(String(file).endsWith(${JSON.stringify(member)})&&args[0]==='wx'){
    const h=await original.call(this,file,...args);await h.writeFile('{"schemaVersion":');await h.close();
    throw Object.assign(new Error('simulated report write failure'),{code:'ENOSPC'});
  }
  return original.call(this,file,...args);
};`);
  const f=await report(input(),{NODE_OPTIONS:'--import='+pathToFileURL(preload).href});
  expect(f.result.status).toBe(2);expect(f.result.stderr).toContain('ENOSPC');
  expect(await readdir(f.output)).toContain('score.json');
  const checked=inspect(f.output);expect(checked.status).not.toBe(0);
  if(checked.stdout)expect(JSON.parse(checked.stdout).complete).toBe(false);
});
it('new verification CLI offers read-only help',()=>{
  const r=run('verify-report-bundle.mjs',['--help']);expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('Usage');
});
it('rejects a symlink identity reported by the filesystem without needing host symlink privileges',async()=>{
  const f=await report(),dir=await temp(),preload=path.join(dir,'symlink-identity.mjs');
  await writeFile(preload,`import fs from 'node:fs/promises';
const original=fs.lstat;
fs.lstat=async function(file,...args){const stats=await original.call(this,file,...args);
  if(String(file).endsWith('score.json'))stats.isSymbolicLink=()=>true;return stats;};`);
  const r=run('verify-report-bundle.mjs',['--report',f.output],{NODE_OPTIONS:'--import='+pathToFileURL(preload).href});
  expect(r.status).toBe(2);expect(r.stderr).toContain('INVALID_ARTIFACT_FILE');
});
it('rejects a manifest beyond the explicit 32 KiB bound before JSON parsing',async()=>{
  const f=await report();await writeFile(path.join(f.output,'report-manifest.json'),' '.repeat(32769));
  const r=inspect(f.output);expect(r.status).toBe(2);expect(r.stderr).toContain('INVALID_ARTIFACT_FILE');
});
