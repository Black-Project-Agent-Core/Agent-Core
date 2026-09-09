import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { RELEASE_FORMAT } from './release-contract.mjs';

export function assertReleaseIdentity({ release, tag, headCommit, tagCommit, remoteTagCommit, requiredNames }) {
  if (release.tagName !== tag || release.isDraft || release.isPrerelease || !release.publishedAt) {
    throw new Error('Release must be published, stable, and match the requested tag');
  }
  if (!/^[a-f0-9]{40}$/.test(headCommit) || tagCommit !== headCommit || remoteTagCommit !== headCommit) {
    throw new Error('Current HEAD, local tag, and remote tag must identify the same commit');
  }
  const names = (release.assets ?? []).map(asset => asset.name);
  for (const name of requiredNames) {
    if (names.filter(candidate => candidate === name).length !== 1) throw new Error(`Missing or duplicate release asset: ${name}`);
  }
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Validate downloaded bytes, including the manifest itself, against the exact release identity. */
export async function verifyReleaseArtifacts({ directory, names, version, presentationBridgeVersion, sourceCommit, trustedAssets }) {
  const primary = [names.freshZip, names.runtimeZip, names.pluginZip, names.presentationBridgeZip, names.npmTarball];
  const expectedChecksums = new Set([...primary, names.manifest]);
  if (!Array.isArray(trustedAssets) || trustedAssets.length !== primary.length ||
      new Set(trustedAssets.map(asset => asset.name)).size !== primary.length ||
      trustedAssets.some(asset => !primary.includes(asset.name))) throw new Error('Fresh local build evidence is required');
  const checksums = new Map();
  for (const line of (await readFile(path.join(directory, names.checksums), 'utf8')).split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([a-fA-F0-9]{64})  (.+)$/);
    if (!match || !expectedChecksums.has(match[2]) || checksums.has(match[2])) throw new Error('Invalid, duplicate, or unexpected checksum entry');
    checksums.set(match[2], match[1].toLowerCase());
  }
  if (checksums.size !== expectedChecksums.size) throw new Error('Incomplete release checksums');
  const verified = new Map();
  for (const name of expectedChecksums) {
    const file = path.join(directory, name);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Release asset must be a regular file: ${name}`);
    const sha256 = await digest(file);
    if (sha256 !== checksums.get(name)) throw new Error(`Release asset checksum mismatch: ${name}`);
    verified.set(name, { name, bytes: info.size, sha256 });
  }
  for (const trusted of trustedAssets) {
    const actual = verified.get(trusted.name);
    if (actual.bytes !== trusted.bytes || actual.sha256 !== trusted.sha256) throw new Error(`Release differs from fresh source build: ${trusted.name}`);
  }
  const manifest = JSON.parse(await readFile(path.join(directory, names.manifest), 'utf8'));
  if (manifest.format !== RELEASE_FORMAT || manifest.channel !== 'stable' || manifest.version !== version ||
      manifest.tag !== `v${version}` || manifest.sourceCommit !== sourceCommit ||
      manifest.presentationBridgeVersion !== presentationBridgeVersion || manifest.freshPackage !== names.freshZip ||
      manifest.runtimePackage !== names.runtimeZip || manifest.pluginPackage !== names.pluginZip ||
      manifest.presentationBridgeSourcePackage !== names.presentationBridgeZip) throw new Error('Release manifest identity mismatch');
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== primary.length ||
      new Set(manifest.assets.map(asset => asset.name)).size !== primary.length) throw new Error('Invalid manifest asset list');
  for (const asset of manifest.assets) {
    const actual = verified.get(asset.name);
    if (!primary.includes(asset.name) || !actual || asset.sha256 !== actual.sha256 || asset.bytes !== actual.bytes) {
      throw new Error(`Release manifest asset mismatch: ${asset.name}`);
    }
  }
  return [...verified.values()];
}

export async function hashBuiltAssets(directory, assetNames) {
  return Promise.all(assetNames.map(async name => {
    const file = path.join(directory, name), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Fresh build asset must be a regular file');
    return { name, bytes: info.size, sha256: await digest(file) };
  }));
}

export async function assertRegistryPackage({ metadata, version, tarballPath }) {
  if (metadata.version !== version) throw new Error('Registry stable dist-tag version mismatch');
  const integrity = metadata['dist.integrity'] ?? metadata.dist?.integrity;
  if (typeof integrity !== 'string') throw new Error('Registry package integrity is unavailable');
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(tarballPath)) hash.update(chunk);
  if (!integrity.split(/\s+/).includes(`sha512-${hash.digest('base64')}`)) throw new Error('Registry package differs from verified release tarball');
}
