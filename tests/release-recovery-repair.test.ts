import { mkdir, mkdtemp, readFile, rm, writeFile, cp, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { createDevelopmentArtifact } from '../scripts/release/development-artifact.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots: string[] = [];
afterEach(async () => { for (const p of roots.splice(0)) await rm(p, { recursive:true, force:true }); });
for (const name of ['release-plan.mjs','check-release-intent.mjs','apply-release.mjs','pre-package.mjs']) {
  it(`${name} provides read-only help without applying or building`, async () => {
    const before = await readFile(path.join(root,'package.json'),'utf8');
    const r = spawnSync(process.execPath,[path.join(root,'scripts/release',name),'--help'],{cwd:root,encoding:'utf8',windowsHide:true});
    expect(r.status, r.stderr).toBe(0); expect(r.stdout.toLowerCase()).toContain('usage');
    expect(await readFile(path.join(root,'package.json'),'utf8')).toBe(before);
  });
}
function zipEntries(file: string): Promise<string[]> { return new Promise((resolve,reject) => {
  yauzl.open(file,{lazyEntries:true},(err,zip) => { if(err||!zip) return reject(err);
    const entries: string[]=[]; zip.on('error',reject); zip.on('entry',e=>{entries.push(e.fileName);zip.readEntry();});
    zip.on('end',()=>resolve(entries));zip.readEntry();
  });
}); }
it('packages only a fresh product foundation and excludes browser/runtime-private debris', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(),'release-private-fixture-')); roots.push(fixture);
  for(const [rel,body] of Object.entries({
    'package.json':JSON.stringify({name:'agent-core',version:'0.12.0'}),
    'package-lock.json':JSON.stringify({name:'agent-core',version:'0.12.0'}),
    'dist/index.js':'export {};',
    'dist/.desktop-commander/profile/History':'PRIVATE_FIXTURE',
    'dist/.env':'PRIVATE_FIXTURE',
    'runtime/memory/00-agent-core-memory.md':'# Private user-specific memory\nPRIVATE_FIXTURE',
  })) { const p=path.join(fixture,rel);await mkdir(path.dirname(p),{recursive:true});await writeFile(p,body); }
  const result=await createDevelopmentArtifact({root:fixture,kind:'snapshot',artifactVersion:'0.12.1-dev.fixture',stableProductVersion:'0.12.0'});
  const names=await zipEntries(result.zipPath);
  expect(names.some(name=>name.includes('.desktop-commander')||name.endsWith('/.env'))).toBe(false);
  const foundation=await new Promise<string>((resolve,reject)=>yauzl.open(result.zipPath,{lazyEntries:true},(err,zip)=>{
    if(err||!zip)return reject(err);zip.on('error',reject);zip.on('entry',entry=>{
      if(!entry.fileName.endsWith('/runtime/memory/00-agent-core-memory.md')){zip.readEntry();return;}
      zip.openReadStream(entry,(error,stream)=>{if(error||!stream)return reject(error);const chunks:Buffer[]=[];
        stream.on('data',data=>chunks.push(data));stream.on('end',()=>{zip.close();resolve(Buffer.concat(chunks).toString());});stream.on('error',reject);
      });
    });zip.readEntry();
  }));
  expect(foundation).toContain('Agent Core');expect(foundation).not.toContain('PRIVATE_FIXTURE');
});
async function commandFixture() {
  const fixture=await mkdtemp(path.join(root,'runtime/tmp/release-command-'));roots.push(fixture);
  await cp(path.join(root,'scripts/release'),path.join(fixture,'scripts/release'),{recursive:true});
  for(const [rel,body] of Object.entries({
    'package.json':JSON.stringify({name:'agent-core',version:'0.1.0',type:'module'}),
    'package-lock.json':JSON.stringify({version:'0.1.0',packages:{'':{version:'0.1.0'}}}),
    'src/ui/package.json':JSON.stringify({version:'0.1.0'}),
    'src/ui/package-lock.json':JSON.stringify({version:'0.1.0',packages:{'':{version:'0.1.0'}}}),
    'src/launcher/AgentCore.Launcher.csproj':'<Project>\n<PropertyGroup>\n</PropertyGroup>\n</Project>',
    'src/version.ts':"export const AGENT_CORE_VERSION='0.1.0';",
    '.changeset/config.json':JSON.stringify({changedFilePatterns:['src/**','package.json','package-lock.json']}),
    '.changeset/fixture.md':'---\n"agent-core": patch\n---\n\nFixture change.\n',
  })) { const p=path.join(fixture,rel);await mkdir(path.dirname(p),{recursive:true});await writeFile(p,body); }
  return fixture;
}
it('applies only in the explicit fixture and consumes its intents transactionally',async()=>{
  const fixture=await commandFixture();const command=path.join(fixture,'scripts/release/apply-release.mjs');
  const r=spawnSync(process.execPath,[command],{cwd:fixture,encoding:'utf8',windowsHide:true});
  expect(r.status,r.stderr).toBe(0);expect(JSON.parse(await readFile(path.join(fixture,'package.json'),'utf8')).version).toBe('0.1.1');
  await expect(access(path.join(fixture,'.changeset/fixture.md'))).rejects.toThrow();
  expect(await readFile(path.join(fixture,'CHANGELOG.md'),'utf8')).toContain('Fixture change.');
});
it('refuses stable apply in an active prerelease channel without changing fixture bytes',async()=>{
  const fixture=await commandFixture(),p=path.join(fixture,'.changeset/pre.json');
  await writeFile(p,JSON.stringify({version:1,mode:'pre',tag:'beta',sequence:0,enteredAt:'2026-09-23T00:00:00Z'}));
  const before=await readFile(path.join(fixture,'package.json'),'utf8');
  const r=spawnSync(process.execPath,[path.join(fixture,'scripts/release/apply-release.mjs')],{cwd:fixture,encoding:'utf8',windowsHide:true});
  expect(r.status).not.toBe(0);expect(r.stderr).toContain('prerelease');
  expect(await readFile(path.join(fixture,'package.json'),'utf8')).toBe(before);await expect(access(p)).resolves.toBeUndefined();
});
it('does not package or overwrite archives when asking help or passing --replace',async()=>{
  const fixture=await commandFixture();const command=path.join(fixture,'scripts/release/package-release.mjs');
  const help=spawnSync(process.execPath,[command,'--help'],{cwd:fixture,encoding:'utf8',windowsHide:true});
  expect(help.status,help.stderr).toBe(0);expect(help.stdout).toContain('Usage');
  const replace=spawnSync(process.execPath,[command,'--replace'],{cwd:fixture,encoding:'utf8',windowsHide:true});
  expect(replace.status).not.toBe(0);await expect(access(path.join(fixture,'release'))).rejects.toThrow();
});
it('reports unavailable current-line baseline rather than fabricating a successful intent check',async()=>{
  const fixture=await commandFixture();const command=path.join(fixture,'scripts/release/check-release-intent.mjs');
  const r=spawnSync(process.execPath,[command,'--json'],{cwd:fixture,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_CEILING_DIRECTORIES:fixture}});
  expect(r.status).not.toBe(0);const result=JSON.parse(r.stdout);expect(result.ok).toBe(false);
  expect(result.baselineRef).toBe('refs/agent-core/current-line-baseline');
});
