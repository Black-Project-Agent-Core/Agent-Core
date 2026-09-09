import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { assertReleaseSnapshot, captureReleaseSnapshot, collectFreshCompilerEntries, collectPresentationBridgeEntries, collectRuntimeEntries, collectTrackedRuntimeEntries, writeStoredZip } from '../scripts/release/build-release.mjs';
import { runGate } from '../scripts/release/certify-core.mjs';
import { RUNTIME_RELEASE_ITEMS } from '../scripts/release/release-contract.mjs';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'release-compiler-')); roots.push(root);
  await mkdir(path.join(root, 'src', 'runtime'), { recursive: true });
  await mkdir(path.join(root, 'dist', '.private-runtime'), { recursive: true });
  await mkdir(path.join(root, 'dist', 'runtime'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', rootDir: 'src', outDir: 'dist',
    strict: true, sourceMap: true, types: [],
  }, include: ['src/**/*.ts'] }));
  await writeFile(path.join(root, 'src', 'current.ts'), 'export const value: number = 42;\n');
  await writeFile(path.join(root, 'src', 'runtime', 'health.ts'), 'export const healthy = true;\n');
  const privateFiles = new Map([
    ['.private-runtime/state.json', '{"private":"runtime-state-sentinel"}'],
    ['runtime/credentials.txt', 'private-credential-sentinel'],
    ['stale.js', 'export const stale = true;'],
    ['current.js', 'export const value = -1;'],
  ]);
  for (const [name, content] of privateFiles) await writeFile(path.join(root, 'dist', name), content);
  return { root, privateFiles, staging: path.join(root, 'release-staging') };
}

function zipFiles(bytes: Buffer) {
  const files = new Map<string, Buffer>(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    files.set(bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'), bytes.subarray(start, start + size));
    offset = start + size;
  }
  return files;
}

function commitFixture(root: string, paths: string[]) {
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['-C', root, 'add', '--', ...paths]);
  execFileSync('git', ['-C', root, '-c', 'user.name=Release Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Capture fixture input']);
}

describe('release build isolation', () => {
  it('packages only fresh compiler output while preserving hidden and visible live runtime state', async () => {
    const f = await fixture();
    const entries = await collectFreshCompilerEntries(f.root, f.staging);
    const archive = path.join(f.root, 'runtime.zip');
    await writeStoredZip(archive, entries, new Date('2026-09-09T00:00:00Z'));
    const files = zipFiles(await readFile(archive));
    expect([...files.keys()].sort()).toEqual([
      'Agent-Core/dist/current.js', 'Agent-Core/dist/current.js.map',
      'Agent-Core/dist/runtime/health.js', 'Agent-Core/dist/runtime/health.js.map',
    ]);
    expect(files.get('Agent-Core/dist/current.js')!.toString('utf8')).toContain('value = 42');
    expect((await readFile(archive)).toString('utf8')).not.toContain('sentinel');
    for (const [name, content] of f.privateFiles) expect(await readFile(path.join(f.root, 'dist', name), 'utf8')).toBe(content);
    for (const [name, bytes] of files) if (name.endsWith('.map')) {
      const map = JSON.parse(bytes.toString('utf8'));
      const source = path.posix.normalize(path.posix.join(path.posix.dirname(name), map.sourceRoot, map.sources[0]));
      expect(source).toBe(name.replace('/dist/', '/src/').replace(/\.js\.map$/, '.ts'));
    }
    await writeFile(path.join(f.root, 'src', 'current.ts'), 'export const value: number = 84;\n');
    const next = await collectFreshCompilerEntries(f.root, f.staging);
    expect(next.find((e: { name: string }) => e.name === 'Agent-Core/dist/current.js').data.toString('utf8')).toContain('value = 84');
  });

  it('fails packaging on a compiler error instead of falling back to stale live output', async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, 'src', 'current.ts'), 'export const value: number = "invalid";\n');
    await expect(collectFreshCompilerEntries(f.root, f.staging)).rejects.toThrow();
    for (const [name, content] of f.privateFiles) expect(await readFile(path.join(f.root, 'dist', name), 'utf8')).toBe(content);
  });

  it('runs the actual npm certification invocation without relying on executable batch files', () => {
    expect(() => runGate({ id: 'npm-launch-regression', command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['--version'], json: false })).not.toThrow();
  });

  it('includes tracked nested source and migration bytes while excluding untracked private files', async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, 'supabase', 'migrations'), { recursive: true });
    const migration = 'create table example (id integer);\n';
    await writeFile(path.join(f.root, 'supabase', 'migrations', 'current.sql'), migration);
    execFileSync('git', ['init', '--quiet', f.root]);
    execFileSync('git', ['-C', f.root, 'add', '--', 'src', 'supabase/migrations/current.sql']);
    await writeFile(path.join(f.root, 'src', '.env'), 'private-source-sentinel');
    await writeFile(path.join(f.root, 'src', 'runtime', 'state.json'), '{"private":"runtime-state-sentinel"}');
    await writeFile(path.join(f.root, 'supabase', 'migrations', '.credentials'), 'private-migration-sentinel');
    const tracked = await collectTrackedRuntimeEntries(f.root, ['src', 'supabase/migrations']);
    expect(tracked.map((entry: { name: string }) => entry.name)).toEqual([
      'Agent-Core/src/current.ts', 'Agent-Core/src/runtime/health.ts', 'Agent-Core/supabase/migrations/current.sql',
    ]);
    expect(tracked.find((entry: { name: string }) => entry.name.endsWith('current.sql')).data.toString('utf8')).toBe(migration);
    const sources = new Set(tracked.map((entry: { name: string }) => entry.name.slice('Agent-Core/'.length)));
    await expect(collectFreshCompilerEntries(f.root, f.staging, sources)).resolves.toHaveLength(4);
    await writeFile(path.join(f.root, 'src', 'untracked.ts'), 'export const hidden = true;\n');
    await expect(collectFreshCompilerEntries(f.root, f.staging, sources)).rejects.toThrow('untracked project source');
    expect(await readFile(path.join(f.root, 'src', '.env'), 'utf8')).toBe('private-source-sentinel');
  });

  it('refuses a missing tracked file or a release root with no tracked content', async () => {
    const f = await fixture();
    execFileSync('git', ['init', '--quiet', f.root]);
    execFileSync('git', ['-C', f.root, 'add', '--', 'src/current.ts']);
    await expect(collectTrackedRuntimeEntries(f.root, ['supabase/migrations'])).rejects.toThrow('must be tracked');
    await rm(path.join(f.root, 'src', 'current.ts'));
    await expect(collectTrackedRuntimeEntries(f.root, ['src'])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an external untracked declaration that changes emitted const-enum values', async () => {
    const f = await fixture(), external = await mkdtemp(path.join(tmpdir(), 'release-external-')); roots.push(external);
    await writeFile(path.join(external, 'external.d.ts'), 'export declare const enum ExternalValue { marker = 731 }\n');
    const relative = path.relative(path.join(f.root, 'src'), path.join(external, 'external.js')).replaceAll('\\', '/');
    await writeFile(path.join(f.root, 'src', 'current.ts'), `import { ExternalValue } from ${JSON.stringify(relative)};\nexport const value = ExternalValue.marker;\n`);
    await expect(collectFreshCompilerEntries(f.root, f.staging)).rejects.toThrow('outside tracked project or locked dependency roots');
  });

  it('rejects source changes during compilation even when HEAD remains unchanged', async () => {
    const f = await fixture(), items = ['src', 'package.json', 'tsconfig.json']; commitFixture(f.root, items);
    const snapshot = await captureReleaseSnapshot(f.root, { runtimeItems: items, includePresentation: false });
    await mkdir(f.staging, { recursive: true });
    const child = spawn(process.execPath, ['-e', `const fs=require('node:fs');const timer=setTimeout(()=>process.exit(2),10000);timer.unref();const watcher=fs.watch(${JSON.stringify(f.staging)},(event,name)=>{if(String(name).startsWith('compiler-')){watcher.close();fs.writeFileSync(${JSON.stringify(path.join(f.root, 'src', 'current.ts'))},'export const value: number = 84;\\n');process.disconnect();}});process.send('ready');`], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
    const exited = new Promise<void>(resolve => child.once('close', () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => { child.once('message', () => resolve()); child.once('error', reject); });
      await expect(collectRuntimeEntries(f.staging, f.root, snapshot)).rejects.toThrow('source content or tracked input set changed');
      expect(execFileSync('git', ['-C', f.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(snapshot.sourceCommit);
    } finally { child.kill(); await exited; }
  });

  it('detects changed tracked input sets at the final packaging boundary', async () => {
    const f = await fixture(), items = ['src', 'package.json', 'tsconfig.json']; commitFixture(f.root, items);
    const snapshot = await captureReleaseSnapshot(f.root, { runtimeItems: items, includePresentation: false });
    await expect(assertReleaseSnapshot(f.root, snapshot)).resolves.toBeUndefined();
    await writeFile(path.join(f.root, 'src', 'new.ts'), 'export const added = 1;\n');
    execFileSync('git', ['-C', f.root, 'add', '--', 'src/new.ts']);
    await expect(assertReleaseSnapshot(f.root, snapshot)).rejects.toThrow('source content or tracked input set changed');
  });

  it('packages every local link from the runtime document index, including its four added dependencies', async () => {
    const f = await fixture(), repo = process.cwd();
    const items = RUNTIME_RELEASE_ITEMS.filter((item: string) => item.endsWith('.md'));
    for (const item of items) { await mkdir(path.dirname(path.join(f.root, item)), { recursive: true }); await writeFile(path.join(f.root, item), await readFile(path.join(repo, item))); }
    execFileSync('git', ['init', '--quiet', f.root]);execFileSync('git', ['-C', f.root, 'add', '--', ...items]);
    const entries = await collectTrackedRuntimeEntries(f.root, items), archive = path.join(f.root, 'docs.zip');
    await writeStoredZip(archive, entries, new Date('2026-09-09T00:00:00Z'));const files = zipFiles(await readFile(archive));
    const index = files.get('Agent-Core/docs/README.md')!.toString('utf8');
    const targets = [...index.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]!).filter(target => !/^(?:[a-z]+:|#)/i.test(target));
    for (const target of targets) expect(files.has(path.posix.normalize(path.posix.join('Agent-Core/docs', target))), target).toBe(true);
    expect(targets).toEqual(expect.arrayContaining(['stability-verification-2026-09-09.md','memory-lifecycle-audit-2026-09-09.md','memory-lifecycle-remediation-plan.md','agent-core-connection-troubleshooting.md']));
  });

  it('applies tracked mode checks to Presentation Bridge instead of following a tracked link', async () => {
    const f = await fixture(), base = 'SubProject/Presentation-Bridge';
    await mkdir(path.join(f.root, base, 'runtime'), { recursive: true });
    await writeFile(path.join(f.root, base, 'README.md'), 'Bridge source\n');
    await writeFile(path.join(f.root, base, 'runtime', 'private.json'), 'private-runtime-sentinel');
    execFileSync('git', ['init', '--quiet', f.root]);execFileSync('git', ['-C', f.root, 'add', '--', base]);
    expect((await collectPresentationBridgeEntries(f.root)).map((entry: { name: string }) => entry.name)).toEqual(['Presentation-Bridge/README.md']);
    const oid = execFileSync('git', ['-C', f.root, 'hash-object', '-w', '--stdin'], { input: 'outside.txt', encoding: 'utf8' }).trim();
    await writeFile(path.join(f.root, base, 'linked.md'), 'outside.txt');
    execFileSync('git', ['-C', f.root, 'update-index', '--add', '--cacheinfo', `120000,${oid},${base}/linked.md`]);
    await expect(collectPresentationBridgeEntries(f.root)).rejects.toThrow('tracked regular file');
  });
});
