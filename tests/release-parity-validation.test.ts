import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertReleaseIdentity, verifyReleaseArtifacts, assertRegistryPackage } from '../scripts/release/release-parity-validation.mjs';
import { RELEASE_FORMAT, releaseAssetNames } from '../scripts/release/release-contract.mjs';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const sourceCommit = 'a'.repeat(40);
const hash = (content: Buffer) => createHash('sha256').update(content).digest('hex');
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-parity-test-')); roots.push(directory);
  const names = releaseAssetNames('0.7.0', '0.2.0');
  const assets = [];
  for (const name of [names.freshZip, names.runtimeZip, names.pluginZip, names.presentationBridgeZip, names.npmTarball]) {
    const bytes = Buffer.from(`isolated artifact ${name}`); await writeFile(path.join(directory, name), bytes);
    assets.push({ name, bytes: bytes.length, sha256: hash(bytes) });
  }
  const manifest = { format: RELEASE_FORMAT, channel: 'stable', version: '0.7.0', tag: 'v0.7.0', sourceCommit,
    presentationBridgeVersion: '0.2.0', freshPackage: names.freshZip, runtimePackage: names.runtimeZip,
    pluginPackage: names.pluginZip, presentationBridgeSourcePackage: names.presentationBridgeZip, assets };
  const saveManifest = async () => {
    const bytes = Buffer.from(JSON.stringify(manifest)); await writeFile(path.join(directory, names.manifest), bytes);
    await writeFile(path.join(directory, names.checksums), [...assets, { name: names.manifest, sha256: hash(bytes) }]
      .map(asset => `${asset.sha256}  ${asset.name}`).join('\n') + '\n');
  };
  await saveManifest();
  return { directory, names, manifest, saveManifest, trustedAssets: structuredClone(assets), version: '0.7.0', presentationBridgeVersion: '0.2.0', sourceCommit };
}

describe('release identity and downloaded artifact verification', () => {
  it('requires current source and both tag references, even when asset names match', () => {
    const value = { tag: 'v0.7.0', headCommit: sourceCommit, tagCommit: sourceCommit, remoteTagCommit: sourceCommit,
      requiredNames: ['runtime.zip'], release: { tagName: 'v0.7.0', isDraft: false, isPrerelease: false,
        publishedAt: '2026-09-09T00:00:00Z', assets: [{ name: 'runtime.zip' }] } };
    expect(() => assertReleaseIdentity(value)).not.toThrow();
    for (const changed of [{ remoteTagCommit: '' }, { headCommit: 'b'.repeat(40) }, { tagCommit: 'c'.repeat(40) },
      { release: { ...value.release, isDraft: true } }, { release: { ...value.release, assets: [] } }]) {
      expect(() => assertReleaseIdentity({ ...value, ...changed })).toThrow();
    }
  });
  it('verifies all downloaded asset bytes and the manifest against source identity', async () => {
    const f = await fixture(); expect(await verifyReleaseArtifacts(f)).toHaveLength(6);
    await writeFile(path.join(f.directory, f.names.runtimeZip), 'changed content with unchanged name');
    await expect(verifyReleaseArtifacts(f)).rejects.toThrow('checksum mismatch');
  });
  it('rejects a consistently checksummed manifest pointing to an older commit', async () => {
    const f = await fixture(); f.manifest.sourceCommit = 'b'.repeat(40); await f.saveManifest();
    await expect(verifyReleaseArtifacts(f)).rejects.toThrow('identity mismatch');
  });
  it('rejects altered manifest sizes and incomplete or unsafe checksum entries', async () => {
    const f = await fixture(); f.manifest.assets[0].bytes++; await f.saveManifest();
    await expect(verifyReleaseArtifacts(f)).rejects.toThrow('manifest asset mismatch');
    const checksumFile = path.join(f.directory, f.names.checksums);
    const original = await readFile(checksumFile, 'utf8');
    await writeFile(checksumFile, original.split('\n').slice(1).join('\n'));
    await expect(verifyReleaseArtifacts(f)).rejects.toThrow('Incomplete');
    await writeFile(checksumFile, original + `${'0'.repeat(64)}  ../outside\n`);
    await expect(verifyReleaseArtifacts(f)).rejects.toThrow('unexpected checksum');
  });
  it('rejects replaced payloads even if the remote manifest and checksums consistently claim the current commit', async () => {
    const f = await fixture(), bytes = Buffer.from('renamed older artifact');
    await writeFile(path.join(f.directory, f.names.runtimeZip), bytes);
    const asset = f.manifest.assets.find(asset => asset.name === f.names.runtimeZip)!;
    asset.bytes = bytes.length; asset.sha256 = hash(bytes); await f.saveManifest();
    await expect(verifyReleaseArtifacts(f)).rejects.toThrow('differs from fresh source build');
  });
  it('binds the registry stable version and integrity to the verified release tarball', async () => {
    const f = await fixture(), tarballPath = path.join(f.directory, f.names.npmTarball);
    const integrity = `sha512-${createHash('sha512').update(await readFile(tarballPath)).digest('base64')}`;
    await expect(assertRegistryPackage({ metadata: { version: f.version, 'dist.integrity': integrity }, version: f.version, tarballPath })).resolves.toBeUndefined();
    await expect(assertRegistryPackage({ metadata: { version: '0.6.0', 'dist.integrity': integrity }, version: f.version, tarballPath })).rejects.toThrow('version mismatch');
    await expect(assertRegistryPackage({ metadata: { version: f.version, 'dist.integrity': 'sha512-wrong' }, version: f.version, tarballPath })).rejects.toThrow('differs from verified');
  });
});
