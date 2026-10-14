import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const roots:string[]=[];
async function api(){return import('../scripts/release/candidate-cutover.mjs');}
async function temp(){const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-cutover-'));roots.push(root);return root;}
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(){
  const root=await temp(),active=path.join(root,'active'),candidate=path.join(root,'candidate'),backup=path.join(root,'backup');
  await mkdir(path.join(active,'dist'),{recursive:true});await mkdir(path.join(candidate,'dist'),{recursive:true});
  await writeFile(path.join(active,'dist','a.js'),'old-a\n');await writeFile(path.join(active,'dist','b.js'),'old-b\n');
  await writeFile(path.join(active,'untouched.txt'),'keep\n');
  await writeFile(path.join(candidate,'dist','a.js'),'new-a\n');await writeFile(path.join(candidate,'dist','b.js'),'new-b\n');
  const manifest={schemaVersion:1,qualificationId:'fixture',artifacts:[
    {path:'dist/a.js',candidateSha256:sha('new-a\n'),expectedActive:{kind:'sha256',sha256:sha('old-a\n')}},
    {path:'dist/b.js',candidateSha256:sha('new-b\n'),expectedActive:{kind:'sha256',sha256:sha('old-b\n')}},
  ]};
  return {root,active,candidate,backup,manifest};
}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
it('installs only declared artifacts after expected-active CAS verification',async()=>{
  const {cutoverCandidate}=await api(),f=await fixture();
  const result=await cutoverCandidate(f.manifest,{activeRoot:f.active,candidateRoot:f.candidate,backupRoot:f.backup});
  expect(result).toMatchObject({artifactCount:2,expectedActiveVerified:true,restartPerformed:false,releaseApplied:false});
  expect(await readFile(path.join(f.active,'dist','a.js'),'utf8')).toBe('new-a\n');
  expect(await readFile(path.join(f.active,'dist','b.js'),'utf8')).toBe('new-b\n');
  expect(await readFile(path.join(f.active,'untouched.txt'),'utf8')).toBe('keep\n');
  expect(await readFile(path.join(f.backup,'dist','a.js'),'utf8')).toBe('old-a\n');
});
it('refuses stale active and candidate hash mismatches before writing',async()=>{
  const {cutoverCandidate}=await api(),f=await fixture();
  const stale=structuredClone(f.manifest);stale.artifacts[0].expectedActive.sha256=sha('someone-else\n');
  await expect(cutoverCandidate(stale,{activeRoot:f.active,candidateRoot:f.candidate,backupRoot:f.backup}))
    .rejects.toThrow(/CUTOVER_STALE_ACTIVE/);
  const bad=structuredClone(f.manifest);bad.artifacts[0].candidateSha256=sha('wrong\n');
  await expect(cutoverCandidate(bad,{activeRoot:f.active,candidateRoot:f.candidate,backupRoot:f.backup+'-2'}))
    .rejects.toThrow(/CUTOVER_CANDIDATE_HASH_MISMATCH/);
  expect(await readFile(path.join(f.active,'dist','a.js'),'utf8')).toBe('old-a\n');
});
it('refuses expected-absent collisions and a mid-preflight active replacement',async()=>{
  const {cutoverCandidate}=await api(),f=await fixture();
  const absent=structuredClone(f.manifest);absent.artifacts[0].expectedActive={kind:'absent'};
  await expect(cutoverCandidate(absent,{activeRoot:f.active,candidateRoot:f.candidate,backupRoot:f.backup}))
    .rejects.toThrow(/EXPECTED_ABSENT_COLLISION/);
  await expect(cutoverCandidate(f.manifest,{activeRoot:f.active,candidateRoot:f.candidate,backupRoot:f.backup+'-2',
    beforeCommit:async()=>{await writeFile(path.join(f.active,'dist','a.js'),'raced\n');}}))
    .rejects.toThrow(/CUTOVER_STALE_ACTIVE|ACTIVE_CHANGED/);
  expect(await readFile(path.join(f.active,'dist','a.js'),'utf8')).toBe('raced\n');
});
it('rolls back exactly the changed artifacts when an installation step fails',async()=>{
  const {cutoverCandidate}=await api(),f=await fixture();
  await expect(cutoverCandidate(f.manifest,{activeRoot:f.active,candidateRoot:f.candidate,backupRoot:f.backup,
    afterWrite:async(_path:string,count:number)=>{if(count===1)throw new Error('fixture-install-failure');}}))
    .rejects.toThrow(/fixture-install-failure; rollbackVerified=true/);
  expect(await readFile(path.join(f.active,'dist','a.js'),'utf8')).toBe('old-a\n');
  expect(await readFile(path.join(f.active,'dist','b.js'),'utf8')).toBe('old-b\n');
  expect(await readFile(path.join(f.active,'untouched.txt'),'utf8')).toBe('keep\n');
});
