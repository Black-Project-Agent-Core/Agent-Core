import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { requestPrereleaseExit, readPrereleaseState } from '../scripts/release/prerelease-lib.mjs';
import * as packaging from '../scripts/release/packaging-policy.mjs';
import { compareMcpContracts } from '../scripts/release/mcp-contract.mjs';

const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'stable-release-'));roots.push(root);return root;}
async function put(root:string,name:string,body:string){const file=path.join(root,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body);}

it('tracks canonical runtime Skill source changes in release relevance, scans and baselines',async()=>{
 const root=await fixture();await put(root,'.changeset/config.json',JSON.stringify({changedFilePatterns:['src/**','runtime/skills/capability-packs/**','runtime/skills/README.md']}));
 const {loadReleasePolicy,isReleaseRelevantPath,releaseChangeScanPathspecs,releaseBaselinePathspecs}=await import('../scripts/release/release-policy.mjs');
 const policy=await loadReleasePolicy(root);
 expect(isReleaseRelevantPath('runtime/skills/capability-packs/example/SKILL.md',policy)).toBe(true);
 expect(isReleaseRelevantPath('runtime/skills/README.md',policy)).toBe(true);
 expect(isReleaseRelevantPath('runtime/skills/capability-packs/example/references/guide.md',policy)).toBe(true);
 expect(isReleaseRelevantPath('runtime/skills/capability-packs/example/tooling/rea/node_modules/rea-agents/index.js',policy)).toBe(false);
 for(const file of ['runtime/skills/catalog/example/SKILL.md','runtime/skills/revisions/example/history/a/SKILL.md',
   'runtime/skills/tooling/local.json','runtime/skills/capability-packs-copy/example/SKILL.md','runtime/memory/state.json'])
   expect(isReleaseRelevantPath(file,policy),file).toBe(false);
 for(const paths of [releaseChangeScanPathspecs(),releaseBaselinePathspecs()]) {
   expect(paths).toContain('runtime/skills/capability-packs');
   expect(paths).toContain('runtime/skills/README.md');
   expect(paths).not.toContain('runtime/skills');expect(paths).not.toContain('runtime');expect(paths).not.toContain('bundled-skills');
 }
 expect(releaseBaselinePathspecs()).toContain(':(exclude)runtime/skills/capability-packs/**/node_modules/**');
});

it('seals only the canonical Skill source subtree while leaving runtime state mutable',async()=>{
 const root=await fixture();await put(root,'runtime/skills/capability-packs/review/SKILL.md','immutable seed');
 await put(root,'runtime/skills/README.md','immutable home guide');
 await put(root,'runtime/skills/capability-packs/README.md','source guide');
 for(const relative of ['catalog/review/SKILL.md','revisions/review/history/a/SKILL.md','.staging/temporary.md',
   'packages/review.skill','exports/codex/example.md','proposals/agent-core/review.md','tooling/local.json',
   'future-role/state.json','capability-packs-copy/review/SKILL.md']) await put(root,'runtime/skills/'+relative,'mutable fixture');
 await put(root,'runtime/memory/private.json','private fixture');
 await put(root,'tunnel-client/agent-core.yaml','local config fixture');
 const {buildIntegrityManifest}=await import('../scripts/release/integrity-manifest.mjs');
 const manifest=await buildIntegrityManifest(root,{product:'fixture',version:'0.15.0'});
 expect(manifest.files.map((file:any)=>file.path)).toEqual(['runtime/skills/capability-packs/README.md','runtime/skills/capability-packs/review/SKILL.md','runtime/skills/README.md']);
 expect(manifest.files.find((file:any)=>file.path.endsWith('/review/SKILL.md'))?.sha256).toBe(hash('immutable seed'));
 expect(manifest.policy.mutableExclusions).toContain('runtime/skills/');
 expect(manifest.policy.immutableInclusions).toEqual(['runtime/skills/capability-packs/','runtime/skills/README.md']);
});

it('refuses release patterns that admit mutable runtime Skill state or an alternate source home',async()=>{
 const {loadReleasePolicy}=await import('../scripts/release/release-policy.mjs');
 const root=await fixture();
 for(const pattern of ['runtime/**','runtime/skills/**','runtime/skills/catalog/**','runtime/skills/README.md.bak','runtime/skills/capability-packs-copy/**','bundled-skills/**']) {
   await put(root,'.changeset/config.json',JSON.stringify({changedFilePatterns:[pattern]}));
   await expect(loadReleasePolicy(root),pattern).rejects.toThrow(/product\/source paths/);
 }
});

it('refuses new integrity manifests containing the legacy bundled-skills home',async()=>{
 const {buildIntegrityManifest}=await import('../scripts/release/integrity-manifest.mjs');
 for(const relative of ['bundled-skills','bundled-skills/review/SKILL.md']) {
   const root=await fixture();await put(root,relative,'legacy source');
   await expect(buildIntegrityManifest(root,{product:'fixture',version:'0.15.0'})).rejects.toThrow(/legacy.*bundled-skills.*targeted migration/i);
 }
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
  await put(root,'scripts/external/native-chat-bridge.mjs','fixture native chat adapter');
  await put(root,'scripts/external/private.log','must not copy');
  expect(packaging.stageExternalReleaseSupport).toBeTypeOf('function');
  await packaging.stageExternalReleaseSupport(root,destination);
  expect(await readFile(path.join(destination,'scripts/external/native-chat-bridge.mjs'),'utf8')).toBe('fixture native chat adapter');
  await expect(access(path.join(destination,'scripts/external/private.log'))).rejects.toThrow();
  expect(await readFile(path.join(destination,'docs/proposals/REVIEW-GUIDE.md'),'utf8')).toContain('fixture');
  expect(await readFile(path.join(destination,'README.md'),'utf8')).toContain('fixture');
  expect(await readFile(path.join(destination,'Restart-Agent-Core.cmd'),'utf8')).toBe('fixture Restart-Agent-Core.cmd');
  expect(await readFile(path.join(destination,'src/rdc/browser-control/open-browser-use-stdio.go'),'utf8')).toBe('fixture-go-source');
  expect((await readdir(path.join(destination,transport))).sort()).toEqual(['build.json',binary].sort());
  await expect(access(path.join(destination,'runtime/rdc'))).rejects.toThrow();
  await put(root,transport+'/'+binary,'modified transport');
  await expect(packaging.stageExternalReleaseSupport(root,path.join(root,'invalid-package'))).rejects.toThrow(/integrity/);
});

const browserBase = `export const browserControl = z.object({
  action: z.enum(['open','observe']), url: z.string().optional(), sessionId: z.string().optional()
});`;
function contractSource(schema: string, selector = 'schemas.browserControl') {
  const files: Record<string,string> = {
    'src/mcp/server.ts': `import * as schemas from './rdc-schemas.js';
      tool(server, 'browser_control', 'Browser Control', ${selector}, handler);`,
    'src/mcp/rdc-schemas.ts': schema,
  };
  return async (file:string) => files[file] ?? null;
}
function externalBrowserSource(base = browserBase, actions = "['open','observe','conversation_read']") {
  return `${base}
    export const externalBrowserControl = z.object({ ...browserControl.shape,
      action: z.enum(${actions}), read: z.string().optional() }).strict();`;
}
const externalBrowserSelector = 'runtime.nativeTaskId ? schemas.browserControl : schemas.externalBrowserControl';

it('compares the explicit external browser cohort without losing inherited parameters',async()=>{
  const result = await compareMcpContracts(contractSource(externalBrowserSource(),externalBrowserSelector),contractSource(browserBase));
  expect(result.removedTools).toEqual([]);
  expect(result.currentCount).toBe(1);
  expect(result.breakingEvidence).toBe(false);
  expect(result.toolChanges).toEqual([expect.objectContaining({name:'browser_control',removedParams:[],addedParams:['read'],newlyRequired:[],
    changedParams:[{param:'action',typeChanged:false,enumNarrowed:false}]})]);
});
it('still detects a removed inherited browser parameter after conditional schema selection',async()=>{
  const after = externalBrowserSource(browserBase.replace('url: z.string().optional(), ',''));
  const result = await compareMcpContracts(contractSource(after,externalBrowserSelector),contractSource(browserBase));
  expect(result.removedTools).toEqual([]);
  expect(result.toolChanges.find((item:any)=>item.name==='browser_control')?.removedParams).toEqual(['url']);
  expect(result.breakingEvidence).toBe(true);
});
it('still detects an inherited parameter becoming required in the external cohort',async()=>{
  const after = externalBrowserSource(browserBase.replace('sessionId: z.string().optional()','sessionId: z.string()'));
  const result = await compareMcpContracts(contractSource(after,externalBrowserSelector),contractSource(browserBase));
  expect(result.toolChanges.find((item:any)=>item.name==='browser_control')?.newlyRequired).toEqual(['sessionId']);
  expect(result.breakingEvidence).toBe(true);
});
it('still detects narrowed action enums instead of accepting any external schema override',async()=>{
  const result = await compareMcpContracts(contractSource(externalBrowserSource(browserBase,"['open']"),externalBrowserSelector),contractSource(browserBase));
  expect(result.toolChanges.find((item:any)=>item.name==='browser_control')?.changedParams ?? [])
    .toContainEqual({param:'action',typeChanged:false,enumNarrowed:true});
  expect(result.breakingEvidence).toBe(true);
});
it('refuses an unknown conditional rather than silently dropping the tool from both cohorts',async()=>{
  const source = contractSource(externalBrowserSource(),'runtime.featureFlag ? schemas.browserControl : schemas.externalBrowserControl');
  await expect(compareMcpContracts(source,source)).rejects.toThrow(/MCP_CONTRACT_UNSUPPORTED_CONDITION/);
});
it('refuses cyclic or unresolved shape spreads rather than claiming a complete safe contract',async()=>{
  for (const schema of [
    `export const externalBrowserControl = z.object({ ...unknown.shape, read:z.string().optional() });`,
    `export const browserControl = z.object({ ...externalBrowserControl.shape });
     export const externalBrowserControl = z.object({ ...browserControl.shape });`,
  ]) await expect(compareMcpContracts(contractSource(schema,externalBrowserSelector),contractSource(browserBase)))
    .rejects.toThrow(/MCP_CONTRACT_UNSUPPORTED_SPREAD/);
});
it('compares same-file object-field spreads used by existing phone registrations',async()=>{
  const before = `const screenshotOptions = { format:z.enum(['jpeg','png']).optional(), quality:z.number().optional() };
    export const browserControl = z.object({ ...screenshotOptions, action:z.enum(['open','observe']) });`;
  const after = before.replace('quality:z.number().optional()','quality:z.number()');
  const result = await compareMcpContracts(contractSource(after),contractSource(before));
  expect(result.toolChanges).toEqual([expect.objectContaining({name:'browser_control',removedParams:[],newlyRequired:['quality']})]);
  expect(result.breakingEvidence).toBe(true);
});
