import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { requestPrereleaseExit, readPrereleaseState } from '../scripts/release/prerelease-lib.mjs';
import * as packaging from '../scripts/release/packaging-policy.mjs';

const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'stable-release-'));roots.push(root);return root;}
async function put(root:string,name:string,body:string){const file=path.join(root,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body);}

it('tracks bundled product Skill changes in release relevance, scans and baselines',async()=>{
 const root=await fixture();await put(root,'.changeset/config.json',JSON.stringify({changedFilePatterns:['src/**','bundled-skills/**']}));
 const {loadReleasePolicy,isReleaseRelevantPath,releaseChangeScanPathspecs,releaseBaselinePathspecs}=await import('../scripts/release/release-policy.mjs');
 const policy=await loadReleasePolicy(root);
 expect(isReleaseRelevantPath('bundled-skills/example/SKILL.md',policy)).toBe(true);
 expect(isReleaseRelevantPath('bundled-skills/example/tooling/rea/node_modules/rea-agents/index.js',policy)).toBe(false);
 expect(releaseChangeScanPathspecs()).toContain('bundled-skills');expect(releaseBaselinePathspecs()).toContain('bundled-skills');
});

it('seals bundled Skill seeds while leaving the active revision catalog mutable',async()=>{
 const root=await fixture();await put(root,'bundled-skills/review/SKILL.md','immutable seed');
 await put(root,'runtime/skills/catalog/review/SKILL.md','active revision');
 const {buildIntegrityManifest}=await import('../scripts/release/integrity-manifest.mjs');
 const manifest=await buildIntegrityManifest(root,{product:'fixture',version:'0.15.0'});
 expect(manifest.files.map((file:any)=>file.path)).toEqual(['bundled-skills/review/SKILL.md']);
 expect(manifest.policy.mutableExclusions).toContain('runtime/skills/');
});

it('leaves fresh portable Memory absent until explicit activation by its existing owner',async()=>{
  const root=await fixture();
  expect(packaging.writePackagedSetup).toBeTypeOf('function');
  await packaging.writePackagedSetup(root);
  expect(await readFile(path.join(root,'MEMORY-BOOTSTRAP.md'),'utf8')).toContain('canonical local memory');
  await expect(access(path.join(root,'runtime/memory'))).rejects.toThrow();
  const {activateCanonicalMemory}=await import('../src/memory/host-activation.js');
  await activateCanonicalMemory(root,{operation:'fresh'});
  expect(JSON.parse(await readFile(path.join(root,'runtime/memory/state/host/activation.json'),'utf8'))).toMatchObject({schemaVersion:2});
});

it('records an explicit source-only beta exit without inventing a prior artifact sequence',async()=>{
  const root=await fixture(),file=path.join(root,'.changeset/pre.json');
  const state=await requestPrereleaseExit({file,sourceVersion:'0.15.0-beta.4',now:'2026-10-19T00:00:00Z'});
  expect(state).toEqual({version:1,mode:'exit',sourceVersion:'0.15.0-beta.4',exitRequestedAt:'2026-10-19T00:00:00.000Z'});
  expect(await readPrereleaseState({file})).toEqual(state);
  await expect(requestPrereleaseExit({file,sourceVersion:'0.15.0-beta.4'})).rejects.toThrow();
});
it('refuses source-only stable or malformed exits without creating state',async()=>{
  const root=await fixture(),file=path.join(root,'pre.json');
  for(const sourceVersion of ['0.15.0','../beta','0.15.0-beta.04'])await expect(requestPrereleaseExit({file,sourceVersion})).rejects.toThrow();
  await expect(access(file)).rejects.toThrow();
});
it('rejects mixed source-only and artifact-channel exit metadata',async()=>{
  const root=await fixture(),file=path.join(root,'pre.json');
  await put(root,'pre.json',JSON.stringify({version:1,mode:'exit',sourceVersion:'0.15.0-beta.4',tag:'beta',sequence:0,exitRequestedAt:'2026-10-19T00:00:00Z'}));
  await expect(readPrereleaseState({file})).rejects.toThrow();
});
it('preserves a competing channel state created after the source-only absence check',async()=>{
  const root=await fixture(),file=path.join(root,'pre.json');
  const competing={version:1,mode:'pre',tag:'beta',sequence:2,enteredAt:'2026-10-19T00:00:00Z'};
  const copy=fs.copyFile.bind(fs);
  vi.spyOn(fs,'copyFile').mockImplementationOnce(async(...args)=>{await writeFile(file,JSON.stringify(competing));return copy(...args);});
  await expect(requestPrereleaseExit({file,sourceVersion:'0.15.0-beta.4'})).rejects.toMatchObject({code:'EEXIST'});
  expect(await readPrereleaseState({file})).toEqual(competing);
});
it('binds stable package provenance to committed source and refuses dirty, untracked or changed HEAD inputs',async()=>{
  const root=await fixture();
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
  git('init','--quiet');await put(root,'package.json','{"name":"fixture","version":"0.15.0"}\n');
  await put(root,'tunnel-client/agent-core.example.yaml','placeholder profile');
  await put(root,'Restart-Agent-Core.cmd','fixture restart entry');
  git('add','package.json','tunnel-client/agent-core.example.yaml','Restart-Agent-Core.cmd');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','fixture');
  expect(packaging.assertReleaseSource).toBeTypeOf('function');
  const commit=await packaging.assertReleaseSource(root);expect(commit).toMatch(/^[0-9a-f]{40}$/);
  await put(root,'package.json','changed');await expect(packaging.assertReleaseSource(root,commit)).rejects.toThrow(/SOURCE/);
  git('restore','package.json');await put(root,'tunnel-client/agent-core.example.yaml','uncommitted profile');
  await expect(packaging.assertReleaseSource(root,commit)).rejects.toThrow(/SOURCE/);
  git('restore','tunnel-client/agent-core.example.yaml');await put(root,'Restart-Agent-Core.cmd','uncommitted restart entry');
  await expect(packaging.assertReleaseSource(root,commit)).rejects.toThrow(/SOURCE/);
  git('restore','Restart-Agent-Core.cmd');await put(root,'src/untracked.ts','export {};');
  await expect(packaging.assertReleaseSource(root,commit)).rejects.toThrow(/SOURCE/);
  git('add','src/untracked.ts');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','changed');
  await expect(packaging.assertReleaseSource(root,commit)).rejects.toThrow(/HEAD/);
});
it('stages readable guides and only the hash-bound browser transport, excluding operational debris',async()=>{
  const root=await fixture(),destination=path.join(root,'package');
  for(const name of ['README.md','Restart-Agent-Core.cmd','THIRD_PARTY_NOTICES.md','docs/proposals/REVIEW-GUIDE.md','docs/proposals/README.md','docs/history-agent-core/Panduan-Arsip-Proposal-Selesai.md','subagents/README.md'])await put(root,name,'fixture '+name);
  const transport='runtime/browser-control/open-browser-use/win32-x64',binary='transport-0123456789abcdef.exe';
  await put(root,'src/rdc/browser-control/open-browser-use-stdio.go','fixture-go-source');
  await put(root,transport+'/'+binary,'fixture-transport');
  await put(root,transport+'/build.json',JSON.stringify({version:1,target:'win32-x64',binary,binarySha256:hash('fixture-transport'),sourceSha256:hash('fixture-go-source')}));
  await put(root,transport+'/private-state.json','must not copy');
  await put(root,'runtime/rdc/browser-control/profile/History','must not copy');
  expect(packaging.stageExternalReleaseSupport).toBeTypeOf('function');
  await packaging.stageExternalReleaseSupport(root,destination);
  expect(await readFile(path.join(destination,'docs/proposals/REVIEW-GUIDE.md'),'utf8')).toContain('fixture');
  expect(await readFile(path.join(destination,'README.md'),'utf8')).toContain('fixture');
  expect(await readFile(path.join(destination,'Restart-Agent-Core.cmd'),'utf8')).toBe('fixture Restart-Agent-Core.cmd');
  expect(await readFile(path.join(destination,'src/rdc/browser-control/open-browser-use-stdio.go'),'utf8')).toBe('fixture-go-source');
  expect((await readdir(path.join(destination,transport))).sort()).toEqual(['build.json',binary].sort());
  await expect(access(path.join(destination,'runtime/rdc'))).rejects.toThrow();
  await put(root,transport+'/'+binary,'modified transport');
  await expect(packaging.stageExternalReleaseSupport(root,path.join(root,'invalid-package'))).rejects.toThrow(/integrity/);
});
