import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve('.');

async function loadContract(): Promise<any> {
  return import('../scripts/release/release-contract.mjs');
}

describe('stable release package contract', () => {
  it('names the Agent Core, plugin, Presentation Bridge, manifest, and checksum assets deterministically', async () => {
    const { releaseAssetNames } = await loadContract();
    expect(releaseAssetNames('0.7.0', '0.2.0')).toEqual({
      freshZip: 'agent-core-fresh-v0.7.0-stable.zip',
      runtimeZip: 'agent-core-windows-v0.7.0-stable.zip',
      pluginZip: 'agent-core-plugin-v0.7.0-stable.zip',
      presentationBridgeZip: 'presentation-bridge-v0.2.0-source.zip',
      npmTarball: 'black-project-agent-core-agent-core-plugin-0.7.0.tgz',
      manifest: 'release-manifest.json',
      checksums: 'SHA256SUMS.txt',
    });
  });

  it('packages only tracked Presentation Bridge source and excludes runtime, credentials, generated output, and caches', async () => {
    const { isPresentationBridgeSourcePath } = await loadContract();
    const included = [
      'SubProject/Presentation-Bridge/README.md',
      'SubProject/Presentation-Bridge/package.json',
      'SubProject/Presentation-Bridge/src/index.ts',
      'SubProject/Presentation-Bridge/ui/src/App.tsx',
      'SubProject/Presentation-Bridge/tests/unit/simple-ui-contract.test.ts',
    ];
    const excluded = [
      'SubProject/Presentation-Bridge/runtime/.gitkeep',
      'SubProject/Presentation-Bridge/runtime/jobs/job.json',
      'SubProject/Presentation-Bridge/secrets/.gitkeep',
      'SubProject/Presentation-Bridge/secrets/google/client.json',
      'SubProject/Presentation-Bridge/node_modules/pkg/index.js',
      'SubProject/Presentation-Bridge/dist/index.js',
      'SubProject/Presentation-Bridge/release/app.exe',
      'SubProject/Presentation-Bridge/corpus/generated/sample.pptx',
      'SubProject/Other/file.txt',
    ];
    for (const candidate of included) expect(isPresentationBridgeSourcePath(candidate)).toBe(true);
    for (const candidate of excluded) expect(isPresentationBridgeSourcePath(candidate)).toBe(false);
  });

  it('keeps canonical Windows cutover documentation in the runtime package without secret-bearing roots', async () => {
    const { RUNTIME_RELEASE_ITEMS, GENERATED_RUNTIME_RELEASE_ITEMS } = await loadContract();
    expect(RUNTIME_RELEASE_ITEMS).toContain('docs/windows-installation-cutover.md');
    expect(RUNTIME_RELEASE_ITEMS).not.toContain('secrets');
    expect(RUNTIME_RELEASE_ITEMS).not.toContain('runtime');
    expect(RUNTIME_RELEASE_ITEMS).not.toContain('capabilities');
    expect(RUNTIME_RELEASE_ITEMS).not.toContain('node_modules');
    expect(GENERATED_RUNTIME_RELEASE_ITEMS).toEqual(['dist']);
    const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
    for (const item of RUNTIME_RELEASE_ITEMS) {
      if (GENERATED_RUNTIME_RELEASE_ITEMS.includes(item)) continue;
      const normalized = item.replace(/\/$/, '');
      expect(
        [...tracked].some((file) => file === normalized || file.startsWith(`${normalized}/`)),
        `release source must be tracked: ${item}`,
      ).toBe(true);
    }
  });

  it('uses the cross-platform Node release builder and keeps the PowerShell entry point as a wrapper', async () => {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const nodeBuilder = await readFile(path.join(root, 'scripts', 'release', 'build-release.mjs'), 'utf8');
    const powershellWrapper = await readFile(path.join(root, 'scripts', 'release', 'build-release.ps1'), 'utf8');
    expect(pkg.scripts?.['package:release']).toBe('node scripts/release/build-release.mjs');
    expect(pkg.scripts?.verify).toContain('npm run build');
    expect(pkg.scripts?.verify?.indexOf('npm run build')).toBeLessThan(pkg.scripts?.verify?.indexOf('npm test') ?? -1);
    expect(nodeBuilder).toContain('presentationBridgeSourcePackage');
    expect(nodeBuilder).toContain('freshPackage');
    expect(nodeBuilder).toContain('releaseAssetNames');
    expect(nodeBuilder).not.toContain('gh-token.txt');
    expect(nodeBuilder).not.toContain('packages-token.txt');
    expect(powershellWrapper).toContain('build-release.mjs');
  });

  it('keeps stable package and GitHub Release ZIP publication under a mandatory remote parity gate', async () => {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const parity = await readFile(path.join(root, 'scripts', 'release', 'check-stable-parity.mjs'), 'utf8');
    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(pkg.scripts?.['verify:stable-parity']).toBe('node scripts/release/check-stable-parity.mjs');
    expect(parity).toContain('expected.freshZip');
    expect(parity).toContain('expected.runtimeZip');
    expect(parity).toContain('expected.pluginZip');
    expect(parity).toContain('expected.npmTarball');
    expect(parity).toContain('gh([\'release\', \'view\', tag');
    expect(parity).toContain("git(['rev-parse', `${tag}^{commit}`])");
    expect(parity).toContain("git(['ls-remote', 'origin'");
    expect(readme).toContain('npm run verify:stable-parity');
    expect(readme).toContain('Never update only GitHub Packages/TGZ while leaving the Stable Release ZIP on an older version.');
  });

  it('documents clone, Windows setup, Presentation Bridge, Releases, and authenticated GitHub Packages usage', async () => {
    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(readme).toContain('git clone https://github.com/Black-Project-Agent-Core/Agent-Core.git');
    expect(readme).toContain('## Windows quick start');
    expect(readme).toContain('## Presentation Bridge');
    expect(readme).toContain('presentation-bridge-v0.2.0-source.zip');
    expect(readme).toContain('@black-project-agent-core/agent-core-plugin');
    expect(readme).toContain('https://npm.pkg.github.com');
    expect(readme).toContain('## Releases and packages');
  });
});

describe('release channel selection', () => {
  const fixtureRoots: string[] = [];
  afterEach(async () => {
    for (const fixtureRoot of fixtureRoots.splice(0)) await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('preserves stable defaults and separates prerelease format, ZIP names, and package tag', async () => {
    const { RELEASE_FORMAT, PRERELEASE_FORMAT, releaseAssetNames, releaseChannelMetadata } = await loadContract();
    expect(releaseChannelMetadata()).toEqual({ channel: 'stable', format: RELEASE_FORMAT, packageDistTag: 'stable' });
    expect(RELEASE_FORMAT).toBe('agent-core-stable-release-v3');
    expect(releaseAssetNames('0.7.0', '0.2.0', 'stable')).toEqual(releaseAssetNames('0.7.0', '0.2.0'));
    expect(releaseChannelMetadata('prerelease')).toEqual({ channel: 'prerelease', format: PRERELEASE_FORMAT, packageDistTag: 'next' });
    expect(PRERELEASE_FORMAT).toBe('agent-core-prerelease-v1');
    expect(releaseAssetNames('0.7.0', '0.2.0', 'prerelease')).toEqual({
      freshZip: 'agent-core-fresh-v0.7.0-prerelease.zip',
      runtimeZip: 'agent-core-windows-v0.7.0-prerelease.zip',
      pluginZip: 'agent-core-plugin-v0.7.0-prerelease.zip',
      presentationBridgeZip: 'presentation-bridge-v0.2.0-source.zip',
      npmTarball: 'black-project-agent-core-agent-core-plugin-0.7.0.tgz',
      manifest: 'release-manifest.json',
      checksums: 'SHA256SUMS.txt',
    });
  });

  it('requires an explicit valid CLI channel and rejects ambiguous or missing values', async () => {
    const { parseArgs } = await import('../scripts/release/build-release.mjs');
    const { releaseAssetNames, releaseChannelMetadata } = await loadContract();
    expect(parseArgs([])).toEqual({ outputRoot: '', channel: 'stable' });
    expect(parseArgs(['--output-root', 'candidate', '--channel', 'prerelease'])).toEqual({ outputRoot: 'candidate', channel: 'prerelease' });
    expect(parseArgs(['--channel', 'stable'])).toEqual({ outputRoot: '', channel: 'stable' });
    for (const channel of ['next', 'preview', '', '../stable', 'Stable']) {
      expect(() => parseArgs(['--channel', channel])).toThrow('Unknown release channel');
      expect(() => releaseChannelMetadata(channel)).toThrow('Unknown release channel');
      expect(() => releaseAssetNames('0.7.0', '0.2.0', channel)).toThrow('Unknown release channel');
    }
    expect(() => parseArgs(['--channel'])).toThrow('--channel requires');
    expect(() => parseArgs(['--channel', 'prerelease', '--channel', 'stable'])).toThrow('only be specified once');
  });

  it('writes the selected channel into staged plugin metadata and protects prerelease npm publication', async () => {
    const { buildPluginStage } = await import('../scripts/release/build-release.mjs');
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'release-channel-'));
    fixtureRoots.push(fixtureRoot);
    const sources = [
      'plugin/agent-core/README.md', 'CHANGELOG.md',
      'plugin/agent-core/skills/agent-core-capability-router/SKILL.md',
      'plugin/agent-core/skills/agent-core-github/SKILL.md',
    ].map(name => ({ name: `Agent-Core/${name}`, data: Buffer.from(`Captured ${name}\n`) }));
    for (const channel of ['stable', 'prerelease']) {
      const stage = path.join(fixtureRoot, channel);
      await buildPluginStage(stage, '0.7.0', sources, channel);
      const metadata = JSON.parse(await readFile(path.join(stage, 'agent-core-package.json'), 'utf8'));
      const npm = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'));
      expect(metadata.channel).toBe(channel);
      expect(metadata.version).toBe('0.7.0');
      expect(npm.name).toBe('@black-project-agent-core/agent-core-plugin');
      expect(npm.version).toBe('0.7.0');
      expect(npm.description.startsWith(channel === 'stable' ? 'Stable ' : 'Prerelease ')).toBe(true);
      expect(npm.publishConfig).toEqual(channel === 'stable'
        ? { registry: 'https://npm.pkg.github.com' }
        : { registry: 'https://npm.pkg.github.com', tag: 'next' });
      expect(await readFile(path.join(stage, 'README.md'), 'utf8')).toBe('Captured plugin/agent-core/README.md\n');
    }
    const sentinel = path.join(fixtureRoot, 'preserve.txt');
    await writeFile(sentinel, 'untouched');
    await expect(buildPluginStage(fixtureRoot, '0.7.0', sources, 'invalid')).rejects.toThrow('Unknown release channel');
    expect(await readFile(sentinel, 'utf8')).toBe('untouched');
  });
});
