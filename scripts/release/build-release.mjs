import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_EXCLUSIONS,
  RUNTIME_RELEASE_ITEMS,
  isPresentationBridgeSourcePath,
  normalizeArchivePath,
  releaseAssetNames,
  releaseChannelMetadata,
} from './release-contract.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..', '..');
async function main() {
const args = parseArgs(process.argv.slice(2));
const releaseChannel = releaseChannelMetadata(args.channel);
assertCleanTrackedTree(root);
const sourceSnapshot = await captureReleaseSnapshot(root);
const pkg = JSON.parse(sourceSnapshot.runtimeEntries.find(entry => entry.name === 'Agent-Core/package.json').data.toString('utf8'));
const presentationPkg = JSON.parse(sourceSnapshot.presentationEntries.find(entry => entry.name === 'Presentation-Bridge/package.json').data.toString('utf8'));
const version = stableVersion(pkg.version, 'Agent Core');
const presentationBridgeVersion = stableVersion(presentationPkg.version, 'Presentation Bridge');
const tag = `v${version}`;
const names = releaseAssetNames(version, presentationBridgeVersion, releaseChannel.channel);
const outputRoot = path.resolve(args.outputRoot || path.join(root, 'release'));
const releaseRoot = path.join(outputRoot, tag);
const assetsDir = path.join(releaseRoot, 'assets');
const stagingDir = path.join(releaseRoot, 'staging');
const pluginStage = path.join(stagingDir, 'agent-core-plugin');
const sourceCommit = sourceSnapshot.sourceCommit;
const commitTimestamp = Number(git(['show', '-s', '--format=%ct', 'HEAD']));
const archiveDate = Number.isFinite(commitTimestamp) ? new Date(commitTimestamp * 1000) : new Date();

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

const runtimeEntries = await collectRuntimeEntries(stagingDir, root, sourceSnapshot);
await writeStoredZip(path.join(assetsDir, names.freshZip), runtimeEntries, archiveDate);
await writeStoredZip(path.join(assetsDir, names.runtimeZip), runtimeEntries, archiveDate);

await buildPluginStage(pluginStage, version, sourceSnapshot.runtimeEntries, releaseChannel.channel);
const pluginEntries = await collectDirectoryEntries(pluginStage, 'agent-core-plugin');
await writeStoredZip(path.join(assetsDir, names.pluginZip), pluginEntries, archiveDate);

const presentationEntries = sourceSnapshot.presentationEntries;
await writeStoredZip(path.join(assetsDir, names.presentationBridgeZip), presentationEntries, archiveDate);

const npm = npmInvocation();
const npmOutput = execFileSync(npm.executable, [...npm.prefix, 'pack', '--pack-destination', assetsDir], {
  cwd: pluginStage,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
}).trim().split(/\r?\n/).filter(Boolean).at(-1);
if (npmOutput !== names.npmTarball) {
  throw new Error(`Unexpected npm package filename: ${npmOutput || '<empty>'}; expected ${names.npmTarball}`);
}

const primaryAssets = [
  names.freshZip,
  names.runtimeZip,
  names.pluginZip,
  names.presentationBridgeZip,
  names.npmTarball,
];
const manifestAssets = [];
for (const name of primaryAssets) {
  const file = path.join(assetsDir, name);
  const bytes = (await lstat(file)).size;
  manifestAssets.push({ name, bytes, sha256: await sha256File(file) });
}

const manifest = {
  format: releaseChannel.format,
  version,
  tag,
  channel: releaseChannel.channel,
  sourceCommit,
  generatedAt: new Date().toISOString(),
  freshPackage: names.freshZip,
  runtimePackage: names.runtimeZip,
  pluginPackage: names.pluginZip,
  presentationBridgeVersion,
  presentationBridgeSourcePackage: names.presentationBridgeZip,
  githubPackage: '@black-project-agent-core/agent-core-plugin',
  packageDistTag: releaseChannel.packageDistTag,
  exclusions: RELEASE_EXCLUSIONS,
  assets: manifestAssets,
};
await assertReleaseSnapshot(root, sourceSnapshot);
const manifestPath = path.join(assetsDir, names.manifest);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

const checksumAssets = [...primaryAssets, names.manifest];
const checksumLines = [];
for (const name of checksumAssets) {
  checksumLines.push(`${await sha256File(path.join(assetsDir, name))}  ${name}`);
}
const checksumPath = path.join(assetsDir, names.checksums);
await writeFile(checksumPath, `${checksumLines.join('\n')}\n`, { encoding: 'ascii', mode: 0o600 });
await chmod(manifestPath, 0o600).catch(() => undefined);
await chmod(checksumPath, 0o600).catch(() => undefined);
await assertReleaseSnapshot(root, sourceSnapshot);

process.stdout.write(`${JSON.stringify({
  ok: true,
  version,
  tag,
  channel: releaseChannel.channel,
  packageDistTag: releaseChannel.packageDistTag,
  sourceCommit,
  presentationBridgeVersion,
  releaseRoot,
  assetsDir,
  pluginPublishDir: pluginStage,
  assets: [...primaryAssets, names.manifest, names.checksums],
  entryCounts: {
    runtime: runtimeEntries.length,
    plugin: pluginEntries.length,
    presentationBridge: presentationEntries.length,
  },
}, null, 2)}\n`);
}

export function parseArgs(values) {
  const result = { outputRoot: '', channel: 'stable' };
  let channelProvided = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--output-root') {
      result.outputRoot = values[index + 1] || '';
      index += 1;
      continue;
    }
    if (value === '--channel') {
      if (channelProvided) throw new Error('Release channel may only be specified once');
      channelProvided = true;
      const channel = values[index + 1];
      if (channel === undefined) throw new Error('--channel requires stable or prerelease');
      result.channel = releaseChannelMetadata(channel).channel;
      index += 1;
      continue;
    }
    throw new Error(`Unknown release builder argument: ${value}`);
  }
  return result;
}

function stableVersion(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
    throw new Error(`${label} version is not stable semver: ${normalized || '<empty>'}`);
  }
  return normalized;
}

function git(arguments_) {
  return execFileSync('git', ['-C', root, ...arguments_], { encoding: 'utf8' }).trim();
}

function assertCleanTrackedTree(projectRoot) {
  const status = execFileSync('git', ['-C', projectRoot, 'status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (status) throw new Error(`Release packaging requires a clean tracked tree:\n${status}`);
}

export function npmInvocation() {
  const npmExecPath = process.env.npm_execpath?.trim();
  if (npmExecPath && /npm-cli\.(?:c?js|mjs)$/i.test(npmExecPath)) {
    return { executable: process.execPath, prefix: [npmExecPath] };
  }
  if (process.platform === 'win32') {
    return {
      executable: process.execPath,
      prefix: [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')],
    };
  }
  return { executable: 'npm', prefix: [] };
}

export async function collectRuntimeEntries(stagingDir, projectRoot = root, snapshot) {
  const sourceSnapshot = snapshot ?? await captureReleaseSnapshot(projectRoot, { includePresentation: false });
  const entries = [...sourceSnapshot.runtimeEntries];
  const trackedSources = new Set(entries.map(entry => entry.name.slice('Agent-Core/'.length)));
  entries.push(...await collectFreshCompilerEntries(projectRoot, stagingDir, trackedSources));
  await assertReleaseSnapshot(projectRoot, sourceSnapshot);
  return uniqueSortedEntries(entries);
}

function sourceEntriesHash(entries) {
  return createHash('sha256').update(JSON.stringify(entries.map(entry => [entry.name, createHash('sha256').update(entry.data).digest('hex')]).sort((a, b) => a[0].localeCompare(b[0])))).digest('hex');
}

export async function captureReleaseSnapshot(projectRoot, options = {}) {
  const runtimeItems = options.runtimeItems ?? RUNTIME_RELEASE_ITEMS.filter(item => item !== 'dist');
  const includePresentation = options.includePresentation ?? true;
  const sourceCommit = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runtimeEntries = await collectTrackedRuntimeEntries(projectRoot, runtimeItems);
  const presentationEntries = includePresentation ? await collectPresentationBridgeEntries(projectRoot) : [];
  return { sourceCommit, runtimeItems, includePresentation, runtimeEntries, presentationEntries,
    sourceHash: sourceEntriesHash([...runtimeEntries, ...presentationEntries]) };
}

export async function assertReleaseSnapshot(projectRoot, snapshot) {
  const current = await captureReleaseSnapshot(projectRoot, snapshot);
  if (current.sourceCommit !== snapshot.sourceCommit || current.sourceHash !== snapshot.sourceHash) {
    throw new Error('Release source content or tracked input set changed during packaging');
  }
  assertCleanTrackedTree(projectRoot);
}

/** Only regular tracked source files are eligible. Untracked nested files are never read or archived. */
export async function collectTrackedRuntimeEntries(projectRoot, items = RUNTIME_RELEASE_ITEMS.filter(item => item !== 'dist'), select = () => true) {
  const raw = execFileSync('git', ['-C', projectRoot, 'ls-files', '--stage', '-z', '--', ...items], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
  const tracked = raw.split('\0').filter(Boolean).map(line => {
    const match = /^(\d+) [a-f0-9]+ (\d)\t([\s\S]+)$/.exec(line);
    if (match && !select(match[3])) return null;
    if (!match || match[2] !== '0') throw new Error('Release source has unresolved index entries');
    if (!['100644', '100755'].includes(match[1])) throw new Error('Release source must be a tracked regular file');
    return safeArchiveEntryName(match[3]);
  }).filter(Boolean);
  for (const item of items) {
    if (!tracked.some(file => file === item || file.startsWith(`${item}/`))) throw new Error(`Release source must be tracked: ${item}`);
  }
  const actualRoot = await realpath(projectRoot), entries = [];
  const comparable = file => process.platform === 'win32' ? file.toLowerCase() : file;
  for (const relative of tracked) {
    const source = path.join(actualRoot, relative);
    if (!(await lstat(source)).isFile() || comparable(await realpath(source)) !== comparable(source)) {
      throw new Error(`Release packaging refuses nonregular or redirected source: ${relative}`);
    }
    entries.push({ name: normalizeArchivePath(path.join('Agent-Core', relative)), data: await readFile(source) });
  }
  return uniqueSortedEntries(entries);
}

/** Build output is acquired from a fresh compiler invocation, never from a live runtime directory. */
export async function collectFreshCompilerEntries(projectRoot, stagingDir, trackedSources) {
  await mkdir(stagingDir, { recursive: true });
  const outputRoot = await realpath(await mkdtemp(path.join(stagingDir, 'compiler-')));
  const compilerPackage = createRequire(import.meta.url).resolve('typescript/package.json');
  const compilerMetadata = JSON.parse(await readFile(compilerPackage, 'utf8'));
  const compiler = path.resolve(path.dirname(compilerPackage), compilerMetadata.bin.tsc);
  const allowedDependencyRoots = [await realpath(path.dirname(compilerPackage))];
  const compilerResolver = createRequire(compilerPackage);
  for (const dependency of Object.keys(compilerMetadata.optionalDependencies ?? {})) {
    try { allowedDependencyRoots.push(await realpath(path.dirname(compilerResolver.resolve(`${dependency}/package.json`)))); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  let lock;
  try { lock = JSON.parse(await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const dependencyRoot = path.join(await realpath(projectRoot), 'node_modules');
  for (const packagePath of Object.keys(lock?.packages ?? {})) {
    if (!packagePath.startsWith('node_modules/') || packagePath.split('/').some(part => part === '..')) continue;
    const location = path.resolve(projectRoot, packagePath);
    try {
      const resolved = await realpath(location);
      if (!containedPath(dependencyRoot, resolved)) throw new Error('Release dependency redirects outside its installed dependency root');
      allowedDependencyRoots.push(resolved);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const output = execFileSync(process.execPath, [compiler, '--project', path.join(projectRoot, 'tsconfig.json'),
    '--outDir', outputRoot, '--incremental', 'false', '--noEmitOnError', 'true', '--listFiles', '--listEmittedFiles', '--pretty', 'false'], {
    cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  const actualProject = await realpath(projectRoot);
  for (const line of output.split(/\r?\n/)) {
    if (!path.isAbsolute(line)) continue;
    const actual = await realpath(line);
    if (allowedDependencyRoots.some(dependency => containedPath(dependency, actual))) continue;
    const relative = normalizeArchivePath(path.relative(actualProject, actual));
    if (!containedPath(actualProject, actual) || containedPath(dependencyRoot, actual)) {
      throw new Error('Release compiler consumed source outside tracked project or locked dependency roots');
    }
    if (trackedSources && !trackedSources.has(relative)) {
      throw new Error(`Release compiler consumed untracked project source: ${relative}`);
    }
  }
  const emitted = output.split(/\r?\n/).filter(line => line.startsWith('TSFILE: ')).map(line => line.slice('TSFILE: '.length).trim());
  if (!emitted.length) throw new Error('Release compiler did not report any emitted files');
  const entries = [];
  for (const file of emitted) {
    const resolved = await realpath(file), relative = path.relative(outputRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !(await lstat(file)).isFile()) {
      throw new Error('Release compiler emitted outside its isolated output directory');
    }
    let data = await readFile(resolved);
    if (relative.endsWith('.map')) {
      const map = JSON.parse(data.toString('utf8'));
      // Relocation changes relative paths from the staging directory to packaged src/.
      // Preserve explicitly remote source roots; normalize local roots to the final dist location.
      if (!map.sourceRoot || !/^[a-z][a-z\d+.-]*:\/\//i.test(map.sourceRoot)) {
        map.sources = map.sources.map(source => normalizeArchivePath(path.relative(
          path.dirname(path.join(projectRoot, 'dist', relative)), path.resolve(path.dirname(resolved), map.sourceRoot ?? '', source))));
        map.sourceRoot = '';
        data = Buffer.from(JSON.stringify(map), 'utf8');
      }
    }
    entries.push({ name: normalizeArchivePath(path.join('Agent-Core', 'dist', relative)), data });
  }
  return uniqueSortedEntries(entries);
}

function containedPath(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function collectPresentationBridgeEntries(projectRoot = root) {
  const entries = await collectTrackedRuntimeEntries(projectRoot, ['SubProject/Presentation-Bridge'], isPresentationBridgeSourcePath);
  return entries.map(entry => ({ ...entry, name: entry.name.replace('Agent-Core/SubProject/Presentation-Bridge/', 'Presentation-Bridge/') }));
}

export async function buildPluginStage(pluginStage, version, sourceEntries, channel = 'stable') {
  const releaseChannel = releaseChannelMetadata(channel);
  await rm(pluginStage, { recursive: true, force: true });
  await mkdir(path.join(pluginStage, 'skills', 'agent-core-capability-router'), { recursive: true });
  await mkdir(path.join(pluginStage, 'skills', 'agent-core-github'), { recursive: true });
  for (const [source, destination] of [
    ['plugin/agent-core/README.md', 'README.md'], ['CHANGELOG.md', 'CHANGELOG.md'],
    ['plugin/agent-core/skills/agent-core-capability-router/SKILL.md', 'skills/agent-core-capability-router/SKILL.md'],
    ['plugin/agent-core/skills/agent-core-github/SKILL.md', 'skills/agent-core-github/SKILL.md'],
  ]) {
    const entry = sourceEntries.find(item => item.name === `Agent-Core/${source}`);
    if (!entry) throw new Error(`Required plugin source was not captured: ${source}`);
    await writeFile(path.join(pluginStage, destination), entry.data);
  }
  const pluginMetadata = {
    format: 'agent-core-plugin-source-v1',
    name: 'Agent Core',
    version,
    channel: releaseChannel.channel,
    description: 'Tracked Agent Core Capability Router and Native GitHub Fabric skills plus the existing Agent Core MCP app binding.',
    app: {
      name: 'Agent Core',
      protocol: 'mcp',
      endpoint: '/mcp',
      binding: 'existing-connected-chatgpt-app',
      discovery: 'tools/list',
    },
    skills: ['agent-core-capability-router', 'agent-core-github'],
    generatedFrom: {
      source: 'tracked-release-core',
      localAuditedRegistryVendored: false,
    },
  };
  const npmPackage = {
    name: '@black-project-agent-core/agent-core-plugin',
    version,
    description: `${channel === 'stable' ? 'Stable' : 'Prerelease'} Agent Core routing and Native GitHub Fabric plugin source for the Agent Core MCP app.`,
    private: false,
    license: 'UNLICENSED',
    files: ['README.md', 'CHANGELOG.md', 'agent-core-package.json', 'skills/**'],
    repository: {
      type: 'git',
      url: 'git+https://github.com/Black-Project-Agent-Core/Agent-Core.git',
    },
    publishConfig: {
      registry: 'https://npm.pkg.github.com',
      ...(releaseChannel.channel === 'prerelease' ? { tag: releaseChannel.packageDistTag } : {}),
    },
  };
  await Promise.all([
    writeFile(path.join(pluginStage, 'agent-core-package.json'), `${JSON.stringify(pluginMetadata, null, 2)}\n`, 'utf8'),
    writeFile(path.join(pluginStage, 'package.json'), `${JSON.stringify(npmPackage, null, 2)}\n`, 'utf8'),
  ]);
}

async function collectDirectoryEntries(directory, archiveRoot) {
  return uniqueSortedEntries(await collectPathEntries(directory, archiveRoot));
}

async function collectPathEntries(source, archivePath) {
  const details = await lstat(source);
  if (details.isSymbolicLink()) throw new Error(`Release packaging refuses symbolic links: ${source}`);
  if (details.isFile()) return [{ name: normalizeArchivePath(archivePath), data: await readFile(source) }];
  if (!details.isDirectory()) return [];
  const entries = [];
  for (const child of (await readdir(source)).sort()) {
    entries.push(...await collectPathEntries(path.join(source, child), path.join(archivePath, child)));
  }
  return entries;
}

function uniqueSortedEntries(entries) {
  const seen = new Set();
  return [...entries]
    .map((entry) => ({ ...entry, name: safeArchiveEntryName(entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .filter((entry) => {
      if (seen.has(entry.name)) throw new Error(`Duplicate release archive path: ${entry.name}`);
      seen.add(entry.name);
      return true;
    });
}

function safeArchiveEntryName(value) {
  const normalized = normalizeArchivePath(value);
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe release archive path: ${value}`);
  }
  return normalized;
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(input) {
  const date = new Date(input);
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  const month = Math.min(12, Math.max(1, date.getUTCMonth() + 1));
  const day = Math.min(31, Math.max(1, date.getUTCDate()));
  const hours = Math.min(23, Math.max(0, date.getUTCHours()));
  const minutes = Math.min(59, Math.max(0, date.getUTCMinutes()));
  const seconds = Math.min(59, Math.max(0, date.getUTCSeconds()));
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | Math.floor(seconds / 2),
  };
}

export async function writeStoredZip(file, entries, timestamp) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const dt = dosDateTime(timestamp);
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dt.time, 10);
    local.writeUInt16LE(dt.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dt.time, 12);
    central.writeUInt16LE(dt.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  await writeFile(file, Buffer.concat([...locals, ...centrals, eocd]));
}

const entry = process.argv[1];
const comparable = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
if (entry && comparable(entry) === comparable(fileURLToPath(import.meta.url))) await main();
