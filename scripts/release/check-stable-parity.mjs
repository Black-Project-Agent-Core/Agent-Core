import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseAssetNames } from './release-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const presentationPkg = JSON.parse(readFileSync(path.join(root, 'SubProject', 'Presentation-Bridge', 'package.json'), 'utf8'));
const version = String(pkg.version ?? '').trim();
const tag = `v${version}`;
const expected = releaseAssetNames(version, String(presentationPkg.version ?? '').trim());
const requiredNames = [expected.freshZip, expected.runtimeZip, expected.pluginZip, expected.presentationBridgeZip, expected.npmTarball, expected.manifest, expected.checksums];

function run(executable, args) {
  return execFileSync(executable, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gh(args) {
  return run('gh', args);
}

function git(args) {
  return run('git', args);
}

let release;
try {
  release = JSON.parse(gh(['release', 'view', tag, '--json', 'tagName,name,isDraft,isPrerelease,targetCommitish,publishedAt,assets,url']));
} catch (error) {
  process.stderr.write(`stable parity failed: GitHub Release ${tag} is missing or unreadable.\n`);
  process.exit(1);
}
if (release.isDraft || release.isPrerelease) {
  process.stderr.write(`stable parity failed: ${tag} is not a published stable release.\n`);
  process.exit(1);
}
const names = new Set((release.assets ?? []).map((asset) => asset.name));
const missing = requiredNames.filter((name) => !names.has(name));
if (missing.length) {
  process.stderr.write(`stable parity failed: ${tag} is missing required version-matched assets: ${missing.join(', ')}\n`);
  process.exit(1);
}
const tagCommit = git(['rev-parse', `${tag}^{commit}`]);
const remoteTagLines = git(['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`])
  .split(/\r?\n/)
  .filter(Boolean);
const remoteTagCommit = (remoteTagLines.find((line) => line.endsWith(`refs/tags/${tag}^{}`))
  ?? remoteTagLines.find((line) => line.endsWith(`refs/tags/${tag}`))
  ?? '')
  .split(/\s+/)[0];
if (remoteTagCommit && remoteTagCommit !== tagCommit) {
  process.stderr.write(`stable parity failed: local/remote ${tag} commit mismatch.\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ ok: true, version, tag, tagCommit, requiredAssets: requiredNames, releaseUrl: release.url }, null, 2)}\n`);
