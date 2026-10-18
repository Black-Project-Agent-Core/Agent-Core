import { mkdir, mkdtemp, readFile, rm, writeFile, cp, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
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
  const memoryIntent=path.join(fixture,'docs/memory/release-intents');await mkdir(memoryIntent,{recursive:true});
  await writeFile(path.join(memoryIntent,'memory-fixture.md'),'---\n"agent-core": patch\n---\n\nMemory fixture change.\n');
  const r=spawnSync(process.execPath,[command],{cwd:fixture,encoding:'utf8',windowsHide:true});
  expect(r.status,r.stderr).toBe(0);expect(JSON.parse(await readFile(path.join(fixture,'package.json'),'utf8')).version).toBe('0.1.1');
  await expect(access(path.join(fixture,'.changeset/fixture.md'))).rejects.toThrow();
  expect(await readFile(path.join(fixture,'CHANGELOG.md'),'utf8')).toContain('Fixture change.');
  const archives=await readdir(path.join(fixture,'.changeset/applied'));
  expect(archives).toHaveLength(1);
  expect(await readFile(path.join(fixture,'.changeset/applied',archives[0],'fixture.md'),'utf8')).toContain('Fixture change.');
  expect(await readFile(path.join(memoryIntent,'applied',archives[0],'memory-fixture.md'),'utf8')).toContain('Memory fixture change.');
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
  // Give the fixture its own repository; Windows Git can otherwise discover the
  // outer checkout despite a backslash-containing ceiling environment value.
  const initialized=spawnSync('git',['init','--quiet'],{cwd:fixture,encoding:'utf8',windowsHide:true});
  expect(initialized.status,initialized.stderr).toBe(0);
  const r=spawnSync(process.execPath,[command,'--json'],{cwd:fixture,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_CEILING_DIRECTORIES:fixture}});
  expect(r.status).not.toBe(0);const result=JSON.parse(r.stdout);expect(result.ok).toBe(false);
  expect(result.baselineRef).toBe('refs/agent-core/current-line-baseline');
});
it('retains archived intent evidence when an archival failure is followed by failed rollback',async()=>{
  const fixture=await commandFixture(),memoryIntent=path.join(fixture,'docs/memory/release-intents');
  await mkdir(memoryIntent,{recursive:true});await writeFile(path.join(memoryIntent,'z-memory.md'),'---\n"agent-core": patch\n---\n\nRetained memory intent.\n');
  const preload=path.join(fixture,'inject-release-failure.mjs');
  await writeFile(preload,`import fs from 'node:fs/promises';
const original=fs.rename.bind(fs);
fs.rename=async(from,to)=>{
 const a=String(from).replaceAll('\\\\','/'),b=String(to).replaceAll('\\\\','/');
 if(a.endsWith('/z-memory.md')&&b.includes('/applied/'))throw Object.assign(new Error('fixture archival failure'),{code:'EIO'});
 if(a.includes('/.changeset/applied/')&&b.endsWith('/.changeset/fixture.md'))throw Object.assign(new Error('fixture restore failure'),{code:'EACCES'});
 return original(from,to);
};`);
  const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,path.join(fixture,'scripts/release/apply-release.mjs')],{cwd:fixture,encoding:'utf8',windowsHide:true});
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('RELEASE_ROLLBACK_INCOMPLETE');
  const archives=await readdir(path.join(fixture,'.changeset/applied'));expect(archives).toHaveLength(1);
  expect(await readFile(path.join(fixture,'.changeset/applied',archives[0],'fixture.md'),'utf8')).toContain('Fixture change.');
  expect(result.stderr).toContain('RELEASE_ROLLBACK_INCOMPLETE');
  expect(JSON.parse(await readFile(path.join(fixture,'package.json'),'utf8')).version).toBe('0.1.0');
});

async function skillRecoveryFixture(withMutableManifest = false) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'release-skill-recovery-')); roots.push(fixture);
  const candidate = path.join(fixture, 'trusted'), local = path.join(fixture, 'installed'), zip = path.join(fixture, 'trusted.zip');
  const put = async (base: string, relative: string, content: string) => {
    const file = path.join(base, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content);
  };
  for (const base of [candidate, local]) await put(base, 'package.json', JSON.stringify({ name: 'agent-core', version: '0.15.0' }));
  await mkdir(path.join(local, 'scripts/windows'), { recursive: true });
  await put(local, 'source/README.md', 'Packaged fixture marker.');
  for (const [relative, pristine, existing] of [
    ['bin/app.txt', 'trusted app', 'damaged app'],
    ['bundled-skills/review/SKILL.md', 'immutable seed', 'damaged seed'],
    ['runtime/skills/catalog/review/SKILL.md', 'archive active seed', 'approved local revision'],
    ['runtime/skills/history/review/r1.md', 'archive history', 'retained local history'],
  ]) { await put(candidate, relative, pristine); await put(local, relative, existing); }
  if (withMutableManifest) {
    const content = 'archive active seed', relative = 'runtime/skills/catalog/review/SKILL.md';
    await put(candidate, 'INTEGRITY-MANIFEST.json', JSON.stringify({ schemaVersion: 1, product: 'Agent Core', version: '0.15.0',
      hashAlgorithm: 'sha256', files: [{ path: relative, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') }] }));
  }
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  // Use the Windows PowerShell built-ins, independent of a parent pwsh module path.
  const childEnv = { ...process.env, PSModulePath: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/Modules') };
  const compressed = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Compress-Archive -LiteralPath ${quote(candidate)} -DestinationPath ${quote(zip)} -Force`],
  { encoding: 'utf8', windowsHide: true, timeout: 30_000, env: childEnv });
  expect(compressed.status, compressed.stderr).toBe(0);
  const sha256 = createHash('sha256').update(await readFile(zip)).digest('hex');
  const wrapper = path.join(fixture, 'invoke-recovery.ps1');
  await writeFile(wrapper, `param([string]$Script,[string]$Project,[string]$Zip,[string]$Digest)
Import-Module -Name (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1') -Force -ErrorAction Stop
& $Script -Mode Repair -ProjectRoot $Project -SourceZip $Zip -ExpectedZipSha256 $Digest -SkipRuntimeRepair -Json
`);
  const repair = () => spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', wrapper, '-Script', path.join(root, 'scripts/windows/Recover-Agent-Core.ps1'), '-Project', local, '-Zip', zip, '-Digest', sha256],
  { encoding: 'utf8', windowsHide: true, timeout: 30_000, env: childEnv });
  return { local, repair };
}

it.skipIf(process.platform !== 'win32')('derived recovery preserves active Skills and history while repairing immutable seeds', async () => {
  const f = await skillRecoveryFixture(), repaired = f.repair();
  expect(repaired.status, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).manifestSource).toBe('trusted-archive-derived');
  expect(await readFile(path.join(f.local, 'bin/app.txt'), 'utf8')).toBe('trusted app');
  expect(await readFile(path.join(f.local, 'bundled-skills/review/SKILL.md'), 'utf8')).toBe('immutable seed');
  expect(await readFile(path.join(f.local, 'runtime/skills/catalog/review/SKILL.md'), 'utf8')).toBe('approved local revision');
  expect(await readFile(path.join(f.local, 'runtime/skills/history/review/r1.md'), 'utf8')).toBe('retained local history');
  const manifest = JSON.parse(await readFile(path.join(f.local, 'INTEGRITY-MANIFEST.json'), 'utf8'));
  expect(manifest.files.some((entry: any) => entry.path.startsWith('runtime/skills/'))).toBe(false);
  expect(manifest.policy.mutableExclusions).toContain('runtime/skills/');
}, 60_000);

it.skipIf(process.platform !== 'win32')('recovery rejects a trusted manifest that tries to govern mutable Skill revisions', async () => {
  const f = await skillRecoveryFixture(true), repaired = f.repair();
  expect(repaired.status).not.toBe(0);
  expect(repaired.stdout + repaired.stderr).toContain('protected/mutable');
  expect(await readFile(path.join(f.local, 'runtime/skills/catalog/review/SKILL.md'), 'utf8')).toBe('approved local revision');
}, 60_000);
