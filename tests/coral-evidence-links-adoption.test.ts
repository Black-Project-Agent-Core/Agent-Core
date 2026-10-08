import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, rename } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as regular from '../src/rdc/utils/files/safe-regular-file.js';
vi.mock('node:fs/promises',async(importOriginal)=>({...await importOriginal<any>()}));
const roots:string[]=[];
const hash=(v:Uint8Array|string)=>'sha256:'+createHash('sha256').update(v).digest('hex');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function fixture(base=os.tmpdir()){
  const root=await mkdtemp(path.join(base,'coral-evidence-'));roots.push(root);
  await mkdir(path.join(root,'docs'));await mkdir(path.join(root,'sources'));
  const a='Claim [local](../sources/Ω source.txt)\r\nSecond line\r\n',b='Alpha 日本語\nBeta\n';
  await writeFile(path.join(root,'docs/note.md'),a);await writeFile(path.join(root,'sources/Ω source.txt'),b);
  const manifest:any={schemaVersion:1,documents:[{id:'note',path:'docs/note.md',digest:hash(a)},{id:'source',path:'sources/Ω source.txt',digest:hash(b)}],
    links:[{id:'ref-1',from:'note',to:'source',sourceLine:1,literal:'../sources/Ω source.txt',basis:'source-directory',targetLines:{start:1,end:2}}]};
  return {root,manifest,a,b};
}
async function module(){const sources=import.meta.glob('../src/verification/evidence-links.ts'),f=sources['../src/verification/evidence-links.ts'];expect(f).toBeTypeOf('function');return await f() as any;}
async function check(f:any){return (await module()).verifyEvidenceLinks(f.root,f.manifest);}
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
it('verifies exact byte-bound literal/range with Unicode spaces and CRLF, not semantic truth',async()=>{
  const f=await fixture(),before=JSON.stringify(f.manifest),r=await check(f);
  expect(r.status).toBe('pass');expect(r.links[0].status).toBe('pass');expect(r.checkedLinks).toBe(1);
  expect(r.documents[1].actualDigest).toBe(hash(f.b));expect(r.semanticSupport).toBe('not-established');
  expect(JSON.stringify(r)).not.toContain('Alpha 日本語');expect(r).toMatchObject({automaticApproval:false,memoryPersisted:false,mutatesSources:false});
  expect(JSON.stringify(f.manifest)).toBe(before);expect(await readFile(path.join(f.root,'docs/note.md'),'utf8')).toBe(f.a);
});
it('supports explicit root-relative literals',async()=>{
  const f=await fixture();f.a='sources/Ω source.txt';await writeFile(path.join(f.root,'docs/note.md'),f.a);f.manifest.documents[0].digest=hash(f.a);
  f.manifest.links[0].literal='sources/Ω source.txt';f.manifest.links[0].basis='root';expect((await check(f)).status).toBe('pass');
});
for(const mode of ['missing','same-size-tamper','absent-literal','target-line','source-line','wrong-target'])it(`fails declared expectation ${mode}`,async()=>{
  const f=await fixture(),target=path.join(f.root,'sources/Ω source.txt');
  if(mode==='missing')await rm(target);if(mode==='same-size-tamper')await writeFile(target,f.b.replace('Alpha','Omega'));
  if(mode==='absent-literal')f.manifest.links[0].literal='missing.txt';if(mode==='target-line')f.manifest.links[0].targetLines.end=3;
  if(mode==='source-line')f.manifest.links[0].sourceLine=99;if(mode==='wrong-target')f.manifest.links[0].to='note';
  const r=await check(f);expect(r.status).toBe('fail');expect(r.links[0].status).toBe('fail');
});
for(const mode of ['empty-documents','empty-links','duplicate-document','duplicate-link','unknown-endpoint','bad-digest','reversed-range','unknown-field'])it(`does not pass invalid manifest ${mode}`,async()=>{
  const f=await fixture();if(mode==='empty-documents')f.manifest.documents=[];if(mode==='empty-links')f.manifest.links=[];
  if(mode==='duplicate-document')f.manifest.documents.push(f.manifest.documents[0]);if(mode==='duplicate-link')f.manifest.links.push(f.manifest.links[0]);
  if(mode==='unknown-endpoint')f.manifest.links[0].to='absent';if(mode==='bad-digest')f.manifest.documents[0].digest='sha256:BAD';
  if(mode==='reversed-range')f.manifest.links[0].targetLines={start:3,end:1};if(mode==='unknown-field')f.manifest.unknown=true;
  expect((await check(f)).status).toBe('unavailable');
});
for(const literal of ['https://example.invalid/a','../sources/Ω source.txt#L1','../sources/Ω source.txt?q=x','%2e%2e/secret','../../outside','C:/Windows/file','\\\\server\\share','NUL','../sources/file.'])it(`refuses ambiguous or escaping literal ${literal}`,async()=>{
  const f=await fixture();f.manifest.links[0].literal=literal;expect((await check(f)).status).toBe('unavailable');
});
it('refuses missing root, invalid UTF8 and nonregular document without returning a clean result',async()=>{
  const f=await fixture();expect((await (await module()).verifyEvidenceLinks(path.join(f.root,'absent-root'),f.manifest)).status).toBe('unavailable');
  const target=path.join(f.root,'sources/Ω source.txt');await writeFile(target,Buffer.from([0xff,0xfe]));expect((await check(f)).status).toBe('unavailable');
  await rm(target);await mkdir(target);expect((await check(f)).status).toBe('unavailable');
});
it('refuses a junction ancestor instead of reading outside the selected root',async()=>{
  const base=process.platform==='win32'?path.join(process.env.SystemRoot!,'Temp'):os.tmpdir();
  const f=await fixture(base),outside=await mkdtemp(path.join(base,'coral-outside-'));roots.push(outside);
  await writeFile(path.join(outside,'Ω source.txt'),f.b);await rm(path.join(f.root,'sources'),{recursive:true});
  await symlink(outside,path.join(f.root,'sources'),process.platform==='win32'?'junction':'dir');
  expect((await check(f)).status).toBe('unavailable');
});
it('preserves unreadable input as unavailable rather than missing or empty',async()=>{
  const f=await fixture(),original=regular.openRegularFile;
  vi.spyOn(regular,'openRegularFile').mockImplementation(async(file,options)=>{
    if(file.endsWith('Ω source.txt'))throw Object.assign(new Error('fixture denied'),{code:'EACCES'});return original(file,options);
  });
  const r=await check(f);expect(r.status).toBe('unavailable');expect(r.links[0].status).toBe('unavailable');
});
it('detects a same-size write during a descriptor read',async()=>{
  const f=await fixture(),original=regular.openRegularFile;
  vi.spyOn(regular,'openRegularFile').mockImplementation(async(file,options)=>{
    const opened=await original(file,options);
    if(file.endsWith('Ω source.txt')){const read=opened.handle.read.bind(opened.handle);let first=true;
      opened.handle.read=(async(...args:any[])=>{const result=await (read as any)(...args);if(first){first=false;await writeFile(file,f.b.replace('Alpha','Omega'));}return result;}) as any;}
    return opened;
  });
  const r=await check(f);expect(r.status).toBe('unavailable');expect(r.links[0].status).toBe('unavailable');
});
it('revalidates prior document identities after later snapshot acquisition',async()=>{
  const f=await fixture(),original=regular.openRegularFile;
  vi.spyOn(regular,'openRegularFile').mockImplementation(async(file,options)=>{
    const opened=await original(file,options);if(file.endsWith('Ω source.txt'))await writeFile(path.join(f.root,'docs/note.md'),f.a.replace('Claim','Other'));return opened;
  });
  expect((await check(f)).status).toBe('unavailable');
});
it('enforces per-document and combined snapshot byte caps',async()=>{
  const f=await fixture();await writeFile(path.join(f.root,'sources/Ω source.txt'),Buffer.alloc(2*1024*1024+1,65));expect((await check(f)).status).toBe('unavailable');
  f.manifest.documents=[];const bytes=Buffer.alloc(2*1024*1024,65);
  for(let i=0;i<17;i++){const p='large-'+i+'.txt';await writeFile(path.join(f.root,p),bytes);f.manifest.documents.push({id:'d'+i,path:p,digest:hash(bytes)});}
  f.manifest.links=[{id:'l',from:'d0',to:'d1',sourceLine:1,literal:'large-1.txt',basis:'root'}];
  expect((await check(f)).status).toBe('unavailable');
});
it('enforces document/link count and literal bounds',async()=>{
  const f=await fixture();f.manifest.links=Array.from({length:513},(_,i)=>({...f.manifest.links[0],id:'l'+i}));expect((await check(f)).status).toBe('unavailable');
  const g=await fixture();g.manifest.documents=Array.from({length:129},(_,i)=>({...g.manifest.documents[0],id:'d'+i}));expect((await check(g)).status).toBe('unavailable');
  const h=await fixture();h.manifest.links[0].literal='x'.repeat(2001);expect((await check(h)).status).toBe('unavailable');
});
it('CLI writes and reads back an exclusive report; maps pass/fail/unavailable to 0/1/2',async()=>{
  const f=await fixture(),cli=path.join(project,'scripts/verify/verify-evidence-links.mjs'),spec=path.join(f.root,'spec.json'),out=path.join(f.root,'report.json');
  const invoke=(extra:string[]=[])=>spawnSync(process.execPath,[cli,'--root',f.root,'--manifest',spec,'--output',out,...extra],{cwd:project,encoding:'utf8',timeout:20000});
  await writeFile(spec,JSON.stringify(f.manifest));let r=invoke();expect(r.status,r.stderr).toBe(0);
  const reportBytes=await readFile(out);expect(JSON.parse(reportBytes.toString()).status).toBe('pass');expect(JSON.parse(r.stdout).digest).toBe(hash(reportBytes));
  expect(invoke().status).toBe(2);expect(await readFile(out)).toEqual(reportBytes);
  await rm(out);await rm(path.join(f.root,'sources/Ω source.txt'));expect(invoke().status).toBe(1);
  await rm(out);f.manifest.links=[];await writeFile(spec,JSON.stringify(f.manifest));expect(invoke().status).toBe(2);
});
it('CLI refuses output/input alias and oversized specifications without source mutation',async()=>{
  const f=await fixture(),cli=path.join(project,'scripts/verify/verify-evidence-links.mjs'),spec=path.join(f.root,'spec.json');await writeFile(spec,JSON.stringify(f.manifest));
  const before=await readFile(spec);
  const r=spawnSync(process.execPath,[cli,'--root',f.root,'--manifest',spec,'--output',spec],{encoding:'utf8',timeout:20000});expect(r.status).toBe(2);expect(await readFile(spec)).toEqual(before);
  await writeFile(spec,' '.repeat(2*1024*1024+1));const out=path.join(f.root,'too-big.json');
  expect(spawnSync(process.execPath,[cli,'--root',f.root,'--manifest',spec,'--output',out],{encoding:'utf8',timeout:20000}).status).toBe(2);
  await expect(readFile(out)).rejects.toMatchObject({code:'ENOENT'});
});

it('a document removed during descriptor read is unavailable rather than a declared missing expectation',async()=>{
  const f=await fixture(),original=regular.openRegularFile;
  vi.spyOn(regular,'openRegularFile').mockImplementation(async(file,options)=>{
    const opened=await original(file,options);
    if(file.endsWith('Ω source.txt')){const read=opened.handle.read.bind(opened.handle);let first=true;
      opened.handle.read=(async(...args:any[])=>{const result=await (read as any)(...args);if(first){first=false;await rm(file);}return result;}) as any;}
    return opened;
  });
  const r=await check(f);expect(r.status).toBe('unavailable');expect(r.links[0].status).toBe('unavailable');
});
it('refuses oversized reports before creating output and cleans owned output on failed final input check',async()=>{
  const f=await fixture(),{writeEvidenceReport,EVIDENCE_REPORT_MAX}=await import('../src/verification/evidence-snapshot.js');
  const out=path.join(f.root,'size-report.json');
  await expect(writeEvidenceReport(out,Buffer.alloc(EVIDENCE_REPORT_MAX+1),async()=>{})).rejects.toThrow('EVIDENCE_REPORT_LIMIT');
  await expect(readFile(out)).rejects.toMatchObject({code:'ENOENT'});
  let calls=0;
  await expect(writeEvidenceReport(out,Buffer.from('{}'),async()=>{if(++calls===2)throw new Error('fixture input changed');})).rejects.toThrow('fixture input changed');
  await expect(readFile(out)).rejects.toMatchObject({code:'ENOENT'});
});
it('rejects unsafe document paths and duplicate normalized input paths',async()=>{
  const f=await fixture();f.manifest.documents[1].path='../outside.txt';expect((await check(f)).status).toBe('unavailable');
  f.manifest.documents[1].path=f.manifest.documents[0].path;expect((await check(f)).status).toBe('unavailable');
});

it('simulated path disappearance after open is unavailable, not an initial missing-file mismatch',async()=>{
  const f=await fixture(),original=regular.openRegularFile,originalStat=fs.lstat;let disappeared=false;
  vi.spyOn(regular,'openRegularFile').mockImplementation(async(file,options)=>{
    const opened=await original(file,options);
    if(file.endsWith('Ω source.txt')){const read=opened.handle.read.bind(opened.handle);
      opened.handle.read=(async(...args:any[])=>{const result=await (read as any)(...args);disappeared=true;return result;}) as any;}
    return opened;
  });
  vi.spyOn(fs,'lstat').mockImplementation((async(file:any,options:any)=>{
    if(disappeared&&String(file).endsWith('Ω source.txt'))throw Object.assign(new Error('fixture disappeared'),{code:'ENOENT'});
    return (originalStat as any)(file,options);
  }) as any);
  const r=await check(f);expect(disappeared).toBe(true);expect(r.status).toBe('unavailable');
});
