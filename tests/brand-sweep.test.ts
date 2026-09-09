import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const script = path.resolve('scripts/check-agent-core-brand.mjs');

async function fixture(text: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-brand-'));
  roots.push(root);
  await writeFile(path.join(root, 'sample.txt'), text, 'utf8');
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Core brand scanner', () => {
  it('rejects legacy owned brand strings', async () => {
    const oldWord = ['Com', 'mander'].join('');
    const root = await fixture(`legacy Desktop ${oldWord} identity`);
    const run = spawnSync(process.execPath, [script, '--scan-path', root], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stdout + run.stderr).toContain('sample.txt');
  });

  it('accepts clean Agent Core text', async () => {
    const root = await fixture('Agent Core uses AGENT_CORE_PORT and agent_core_status.');
    const run = spawnSync(process.execPath, [script, '--scan-path', root], { encoding: 'utf8' });
    expect(run.status).toBe(0);
  });

  it('ignores third-party dependency lockfiles while still scanning owned source', async () => {
    const root = await fixture('Agent Core source remains clean.');
    const oldWord = ['com', 'mander'].join('');
    await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({
      packages: {
        [`node_modules/${oldWord}`]: {
          version: '1.0.0',
          resolved: `https://registry.npmjs.org/${oldWord}/-/${oldWord}-1.0.0.tgz`,
        },
      },
    }), 'utf8');
    const run = spawnSync(process.execPath, [script, '--scan-path', root], { encoding: 'utf8' });
    expect(run.status).toBe(0);
  });

  it('allows only the named independent vendor integration files', async () => {
    const root = await fixture('Agent Core source remains clean.');
    const vendor = ['Desktop', ['Com', 'mander'].join('')].join(' ');
    const stem = vendor.replace(' ', '-');
    for (const file of [`Start-${stem}.bat`, `Apply-${stem}-Allowlist.ps1`, `Edit-${stem}-Allowlist.bat`, `${stem}-Allowlist.txt`]) {
      await writeFile(path.join(root, file), `Launch ${vendor}`, 'utf8');
    }
    const accepted = spawnSync(process.execPath, [script, '--scan-path', root], { encoding: 'utf8' });
    expect(accepted.status).toBe(0);
    await writeFile(path.join(root, 'owned-launcher.bat'), `Agent Core identity is ${vendor}`, 'utf8');
    const rejected = spawnSync(process.execPath, [script, '--scan-path', root], { encoding: 'utf8' });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('owned-launcher.bat');
  });

  it('allows an external runtime packaging path without hiding adjacent owned branding', async () => {
    const root = await fixture('Agent Core source remains clean.');
    const word = ['Com', 'mander'].join('');
    const vendorPath = `dist/.desktop-${word.toLowerCase()}`;
    const directory = path.join(root, 'scripts', 'windows');
    await mkdir(directory, { recursive: true });
    const pack = path.join(directory, 'agent-core-pack.ps1');
    const metadata = path.join(root, '.portable-package.json');
    await writeFile(pack, `$exclusions = @('${vendorPath}')`, 'utf8');
    await writeFile(metadata, JSON.stringify({ packageType: 'agent-core-portable', exclusions: [vendorPath] }), 'utf8');
    const accepted = spawnSync(process.execPath, [script, '--scan-path', root], { encoding: 'utf8' });
    expect(accepted.status).toBe(0);
    await writeFile(pack, `$exclusions = @('${vendorPath}'); Write-Host 'Desktop ${word}'`, 'utf8');
    await writeFile(metadata, JSON.stringify({ packageType: `Desktop ${word}`, exclusions: [vendorPath] }), 'utf8');
    const rejected = spawnSync(process.execPath, [script, '--scan-path', root], { encoding: 'utf8' });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('scripts/windows/agent-core-pack.ps1');
    expect(rejected.stderr).toContain('.portable-package.json');
  });
});
