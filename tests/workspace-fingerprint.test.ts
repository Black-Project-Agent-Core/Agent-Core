import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const roots:string[]=[];
async function api(){return import('../scripts/inspect/workspace-fingerprint.mjs');}
async function tempRoot(){const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-workspace-fingerprint-'));roots.push(root);return root;}
function git(root:string,...args:string[]){
  const safe='safe.directory='+root.replace(/\\/g,'/');
  const result=spawnSync('git',['-c',safe,'-C',root,...args],{encoding:'utf8'});
  if(result.status!==0)throw new Error('git '+args.join(' ')+': '+result.stderr);
  return result.stdout;
}
async function initRepo(withCommit=true){
  const root=await tempRoot();git(root,'init');git(root,'config','user.email','fixture@example.invalid');git(root,'config','user.name','Fixture');
  await writeFile(path.join(root,'tracked.txt'),'one\n','utf8');
  if(withCommit){git(root,'add','tracked.txt');git(root,'commit','-m','initial');}
  return root;
}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
it('fingerprints clean, staged and untracked state without reading untracked contents',async()=>{
  const {fingerprintWorkspace,compareWorkspaceFingerprints}=await api(),root=await initRepo();
  const clean=await fingerprintWorkspace(root);
  expect(clean.head).toMatch(/^[a-f0-9]{40}$/);expect(clean.statusEntryCount).toBe(0);expect(clean.trackedDiffBytes).toBe(0);
  await writeFile(path.join(root,'untracked.txt'),'secret-content-a\n','utf8');
  const untracked=await fingerprintWorkspace(root);
  expect(untracked.untrackedPathEvidence).toEqual(['untracked.txt']);
  await writeFile(path.join(root,'untracked.txt'),'secret-content-b\n','utf8');
  const samePathChangedContent=await fingerprintWorkspace(root);
  expect(samePathChangedContent.statusDigest).toBe(untracked.statusDigest);
  expect(samePathChangedContent.fingerprint).toBe(untracked.fingerprint);
  expect(samePathChangedContent.limitations).toContain('untracked-file-contents-not-read');
  await writeFile(path.join(root,'tracked.txt'),'two\n','utf8');git(root,'add','tracked.txt');
  const staged=await fingerprintWorkspace(root);
  expect(staged.trackedDiffBytes).toBeGreaterThan(0);
  expect(compareWorkspaceFingerprints(clean,staged).status).toBe('changed');
  expect(git(root,'status','--porcelain=v1')).toContain('M  tracked.txt');
});
it('supports no-HEAD and deterministic multi-repo aggregation',async()=>{
  const {fingerprintWorkspace,fingerprintWorkspaces}=await api(),a=await initRepo(false),b=await initRepo();
  const noHead=await fingerprintWorkspace(a);
  expect(noHead.head).toBeNull();expect(noHead.sourceMutated).toBe(false);
  const first=await fingerprintWorkspaces([a,b]),second=await fingerprintWorkspaces([a,b]);
  expect(first.aggregateFingerprint).toBe(second.aggregateFingerprint);
  expect(first.reports).toHaveLength(2);
});
it('refuses subdirectories and protected paths and reports different roots as not comparable',async()=>{
  const {fingerprintWorkspace,compareWorkspaceFingerprints}=await api(),a=await initRepo(),b=await initRepo();
  const sub=path.join(a,'sub');await mkdir(sub);
  await expect(fingerprintWorkspace(sub)).rejects.toThrow(/REPO_ROOT_REQUIRED/);
  const protectedRoot=path.join(await tempRoot(),'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT');
  await mkdir(protectedRoot,{recursive:true});git(protectedRoot,'init');
  await expect(fingerprintWorkspace(protectedRoot)).rejects.toThrow(/PROTECTED_PATH/);
  const [fa,fb]=await Promise.all([fingerprintWorkspace(a),fingerprintWorkspace(b)]);
  expect(compareWorkspaceFingerprints(fa,fb)).toMatchObject({status:'not-comparable',reason:'different-repo-root'});
});
