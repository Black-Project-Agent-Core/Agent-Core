import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  access, lstat, mkdir, open, readFile, readdir, rename, rm,
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { gunzipSync } from 'node:zlib';
import { unpackTar } from 'modern-tar';
import yauzl from 'yauzl';
import { fetchWithPolicy } from '../net/outbound-request.js';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';

export type ProvisionProviderId = 'python' | 'csharp' | 'powershell';

type ArtifactFormat = 'zip' | 'tgz';
export interface ProviderArtifactRecipe {
  id: string;
  version: string;
  url: string;
  sha256: string;
  allowedHosts: string[];
  format: ArtifactFormat;
  targetSubdir: string;
  prefix?: string;
  maxBytes: number;
  maxExpandedBytes: number;
  maxEntries: number;
}
export interface ProviderRecipe {
  id: ProvisionProviderId;
  recipeVersion: number;
  artifacts: ProviderArtifactRecipe[];
  requiredPaths: string[];
  mutablePaths?: string[];
}

export interface ProvisionProviderOptions {
  repair?: boolean;
}

export interface ProvisionProviderResult {
  providerId: ProvisionProviderId;
  changed: boolean;
  repaired: boolean;
  alreadyValid: boolean;
  recipeVersion: number;
  treeSha256: string;
  installedRoot: string;
}

interface InstalledProviderManifest {
  schemaVersion: 1;
  providerId: ProvisionProviderId;
  recipeVersion: number;
  installedAt: string;
  treeSha256: string;
  artifacts: Array<{ id: string; version: string; url: string; sha256: string }>;
}
const RECIPES: Record<ProvisionProviderId, ProviderRecipe> = {
  python: {
    id: 'python',
    recipeVersion: 1,
    artifacts: [{
      id: 'pyright',
      version: '1.1.403',
      url: 'https://registry.npmjs.org/pyright/-/pyright-1.1.403.tgz',
      sha256: 'd62b36fcff0a5f67b8cfc25b5618bc232a8e0b714593e25a83cdbba3d47eec9d',
      allowedHosts: ['registry.npmjs.org'],
      format: 'tgz',
      targetSubdir: 'node_modules/pyright',
      prefix: 'package/',
      maxBytes: 10 * 1024 * 1024,
      maxExpandedBytes: 80 * 1024 * 1024,
      maxEntries: 20_000,
    }],
    requiredPaths: ['node_modules/pyright/langserver.index.js', 'node_modules/pyright/index.js'],
  },
  csharp: {
    id: 'csharp',
    recipeVersion: 1,
    artifacts: [
      {
        id: 'dotnet-runtime',
        version: '10.0.12',
        url: 'https://builds.dotnet.microsoft.com/dotnet/Runtime/10.0.12/dotnet-runtime-10.0.12-win-x64.zip',
        sha256: 'da3947e6acbb5228e4e987c7585aa40ce2d7000856e3da0804e6ee3771e806dc',
        allowedHosts: ['builds.dotnet.microsoft.com'],
        format: 'zip',
        targetSubdir: 'dotnet',
        maxBytes: 64 * 1024 * 1024,
        maxExpandedBytes: 220 * 1024 * 1024,
        maxEntries: 10_000,
      },
      {
        id: 'roslyn-language-server',
        version: '5.5.0-2.26078.4',
        url: 'https://www.nuget.org/api/v2/package/roslyn-language-server.win-x64/5.5.0-2.26078.4',
        sha256: '7f3d4119e75305399e6faa81a68240b33c48b94ad523a904594abd00db95572a',
        allowedHosts: ['www.nuget.org', 'globalcdn.nuget.org', 'api.nuget.org'],
        format: 'zip',
        targetSubdir: 'roslyn',
        prefix: 'tools/net10.0/win-x64/',
        maxBytes: 80 * 1024 * 1024,
        maxExpandedBytes: 700 * 1024 * 1024,
        maxEntries: 30_000,
      },
    ],
    requiredPaths: [
      'dotnet/dotnet.exe',
      'roslyn/Microsoft.CodeAnalysis.LanguageServer.dll',
    ],
    mutablePaths: ['roslyn/cache'],
  },
  powershell: {
    id: 'powershell',
    recipeVersion: 1,
    artifacts: [
      {
        id: 'powershell-runtime',
        version: '7.6.6',
        url: 'https://github.com/PowerShell/PowerShell/releases/download/v7.6.6/PowerShell-7.6.6-win-x64.zip',
        sha256: '02fe458be20493fbdf43f61ea20610b811ee6c738ab1676c61b9cfcd1a33c860',
        allowedHosts: ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'],
        format: 'zip',
        targetSubdir: 'pwsh',
        maxBytes: 140 * 1024 * 1024,
        maxExpandedBytes: 650 * 1024 * 1024,
        maxEntries: 30_000,
      },
      {
        id: 'powershell-editor-services',
        version: '4.4.0',
        url: 'https://github.com/PowerShell/PowerShellEditorServices/releases/download/v4.4.0/PowerShellEditorServices.zip',
        sha256: '690b91092989a0f66e6f43986166aaef69d64b559a9fda51feed882e1103fbcc',
        allowedHosts: ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'],
        format: 'zip',
        targetSubdir: 'PowerShellEditorServices',
        prefix: 'PowerShellEditorServices/',
        maxBytes: 32 * 1024 * 1024,
        maxExpandedBytes: 400 * 1024 * 1024,
        maxEntries: 20_000,
      },
    ],
    requiredPaths: [
      'pwsh/pwsh.exe',
      'PowerShellEditorServices/Start-EditorServices.ps1',
    ],
  },
};

const MANIFEST_NAME = '.agent-core-provider.json';
const USER_AGENT = 'Agent-Core-Semantic-Provider';
const REDIRECT_LIMIT = 5;

function comparable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function inside(candidate: string, root: string): boolean {
  const child = comparable(candidate);
  const parent = comparable(root);
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}
function assertArtifactUrl(value: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('SEMANTIC_PROVIDER_ARTIFACT_URL_INVALID'); }
  const host = url.hostname.toLowerCase();
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('SEMANTIC_PROVIDER_ARTIFACT_URL_INSECURE');
  }
  const allowed = new Set(allowedHosts.map(item => item.toLowerCase()));
  if (!allowed.has(host)) throw new Error(`SEMANTIC_PROVIDER_ARTIFACT_HOST_REFUSED: ${host}`);
  if (url.username || url.password) throw new Error('SEMANTIC_PROVIDER_ARTIFACT_CREDENTIAL_URL_REFUSED');
  return url;
}

function sanitizeArchiveName(raw: string): string[] {
  if (!raw || raw.includes('\0')) throw new Error('SEMANTIC_PROVIDER_ARCHIVE_PATH_INVALID');
  const normalized = raw.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.startsWith('//') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_PATH_ESCAPE: ${raw}`);
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..' || part.includes(':'))) {
    throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_PATH_ESCAPE: ${raw}`);
  }
  return parts;
}
function selectedArchivePath(raw: string, prefix?: string): string | undefined {
  const normalized = sanitizeArchiveName(raw).join('/');
  if (!prefix) return normalized || undefined;
  const normalizedPrefix = sanitizeArchiveName(prefix).join('/');
  const withSlash = normalizedPrefix + '/';
  if (!normalized.startsWith(withSlash)) return undefined;
  const selected = normalized.slice(withSlash.length);
  return selected ? sanitizeArchiveName(selected).join('/') : undefined;
}

function mappedArchivePath(
  raw: string,
  destinationRoot: string,
  prefix?: string,
): string | undefined {
  const selected = selectedArchivePath(raw, prefix);
  if (!selected) return undefined;
  const target = path.resolve(destinationRoot, ...sanitizeArchiveName(selected));
  if (!inside(target, destinationRoot)) {
    throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_PATH_ESCAPE: ${raw}`);
  }
  return target;
}

function registerArchiveDestination(
  seen: Map<string, 'file' | 'directory'>,
  relativePath: string,
  type: 'file' | 'directory',
): void {
  const normalized = relativePath.replaceAll('\\', '/').replace(/\/$/, '');
  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  if (!key) return;
  if (seen.has(key)) throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_COLLISION: ${relativePath}`);
  const parts = key.split('/');
  for (let i = 1; i < parts.length; i += 1) {
    const parent = parts.slice(0, i).join('/');
    if (seen.get(parent) === 'file') {
      throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_COLLISION: ${relativePath}`);
    }
  }
  if (type === 'file') {
    for (const existing of seen.keys()) {
      if (existing.startsWith(key + '/')) {
        throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_COLLISION: ${relativePath}`);
      }
    }
  }
  seen.set(key, type);
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function safeRm(value: string): Promise<void> {
  await rm(value, { recursive: true, force: true }).catch(() => undefined);
}
async function streamResponseToFile(
  response: Response,
  destination: string,
  maxBytes: number,
): Promise<{ bytes: number; sha256: string }> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`SEMANTIC_PROVIDER_ARTIFACT_TOO_LARGE: declared=${declared} max=${maxBytes}`);
  }
  if (!response.body) throw new Error('SEMANTIC_PROVIDER_ARTIFACT_BODY_MISSING');

  const handle = await open(destination, 'wx');
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (!item.value) continue;
      total += item.value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel('artifact size limit exceeded'); } catch {}
        throw new Error(`SEMANTIC_PROVIDER_ARTIFACT_TOO_LARGE: received=${total} max=${maxBytes}`);
      }
      const chunk = Buffer.from(item.value);
      hash.update(chunk);
      await handle.write(chunk);
    }
    await handle.sync();
  } finally {
    await handle.close().catch(() => undefined);
  }
  return { bytes: total, sha256: hash.digest('hex') };
}

async function downloadVerified(
  recipe: ProviderArtifactRecipe,
  destination: string,
): Promise<{ bytes: number; sha256: string; finalUrl: string }> {
  let current = assertArtifactUrl(recipe.url, recipe.allowedHosts);
  for (let redirect = 0; redirect <= REDIRECT_LIMIT; redirect += 1) {
    const response = await fetchWithPolicy(current, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: 'application/octet-stream,*/*;q=0.8' },
    }, {
      safety: 'safe',
      maxAttempts: 3,
      maxTotalDelayMs: 10_000,
      timeoutMs: 300_000,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      try { await response.body?.cancel(); } catch {}
      if (!location) throw new Error('SEMANTIC_PROVIDER_ARTIFACT_REDIRECT_MISSING_LOCATION');
      current = assertArtifactUrl(new URL(location, current).toString(), recipe.allowedHosts);
      continue;
    }

    if (response.status !== 200) {
      try { await response.body?.cancel(); } catch {}
      throw new Error(`SEMANTIC_PROVIDER_ARTIFACT_HTTP_${response.status}`);
    }
    const written = await streamResponseToFile(response, destination, recipe.maxBytes);
    if (written.sha256.toLowerCase() !== recipe.sha256.toLowerCase()) {
      throw new Error(`SEMANTIC_PROVIDER_ARTIFACT_SHA256_MISMATCH: ${recipe.id}`);
    }
    return { ...written, finalUrl: current.toString() };
  }
  throw new Error('SEMANTIC_PROVIDER_ARTIFACT_REDIRECT_LIMIT');
}

function zipOpen(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, decodeStrings: true }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error('SEMANTIC_PROVIDER_ZIP_OPEN_FAILED'));
      else resolve(zipFile);
    });
  });
}

function zipSymlink(entry: yauzl.Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return unixMode === 0o120000;
}

interface ZipEntryMeta {
  name: string;
  directory: boolean;
  size: number;
}
async function scanZip(
  archivePath: string,
  recipe: ProviderArtifactRecipe,
): Promise<ZipEntryMeta[]> {
  const zip = await zipOpen(archivePath);
  return new Promise((resolve, reject) => {
    const entries: ZipEntryMeta[] = [];
    const destinations = new Map<string, 'file' | 'directory'>();
    let expanded = 0;
    const fail = (error: unknown) => {
      try { zip.close(); } catch {}
      reject(error);
    };
    zip.on('error', fail);
    zip.on('entry', entry => {
      try {
        sanitizeArchiveName(entry.fileName);
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
          throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_ENCRYPTED: ${entry.fileName}`);
        }
        if (zipSymlink(entry)) throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_SYMLINK: ${entry.fileName}`);
        const directory = entry.fileName.endsWith('/');
        const selected = selectedArchivePath(entry.fileName, recipe.prefix);
        if (selected) registerArchiveDestination(destinations, selected, directory ? 'directory' : 'file');
        if (!directory) expanded += entry.uncompressedSize;
        if (expanded > recipe.maxExpandedBytes) {
          throw new Error('SEMANTIC_PROVIDER_ARCHIVE_EXPANDED_LIMIT');
        }
        entries.push({ name: entry.fileName, directory, size: entry.uncompressedSize });
        if (entries.length > recipe.maxEntries) throw new Error('SEMANTIC_PROVIDER_ARCHIVE_ENTRY_LIMIT');
        zip.readEntry();
      } catch (error) { fail(error); }
    });
    zip.on('end', () => resolve(entries));
    zip.readEntry();
  });
}

function zipReadStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error('SEMANTIC_PROVIDER_ZIP_ENTRY_OPEN_FAILED'));
      else resolve(stream);
    });
  });
}

async function extractZip(
  archivePath: string,
  destinationRoot: string,
  recipe: ProviderArtifactRecipe,
): Promise<void> {
  await scanZip(archivePath, recipe);
  await mkdir(destinationRoot, { recursive: true });
  const zip = await zipOpen(archivePath);
  await new Promise<void>((resolve, reject) => {
    let failed = false;
    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      try { zip.close(); } catch {}
      reject(error);
    };
    zip.on('error', fail);
    zip.on('entry', entry => {
      void (async () => {
        try {
          const mapped = mappedArchivePath(entry.fileName, destinationRoot, recipe.prefix);
          if (!mapped) return zip.readEntry();
          if (entry.fileName.endsWith('/')) {
            await mkdir(mapped, { recursive: true });
            return zip.readEntry();
          }
          await mkdir(path.dirname(mapped), { recursive: true });
          const source = await zipReadStream(zip, entry);
          await pipeline(source, createWriteStream(mapped, { flags: 'wx' }));
          zip.readEntry();
        } catch (error) { fail(error); }
      })();
    });
    zip.on('end', () => { if (!failed) resolve(); });
    zip.readEntry();
  });
}

async function extractTgz(
  archivePath: string,
  destinationRoot: string,
  recipe: ProviderArtifactRecipe,
): Promise<void> {
  const compressed = await readFile(archivePath);
  const tarBytes = gunzipSync(compressed, { maxOutputLength: recipe.maxExpandedBytes });
  const entries = await unpackTar(tarBytes);
  if (entries.length > recipe.maxEntries) throw new Error('SEMANTIC_PROVIDER_ARCHIVE_ENTRY_LIMIT');
  let expanded = 0;
  const destinations = new Map<string, 'file' | 'directory'>();
  for (const entry of entries) {
    sanitizeArchiveName(entry.header.name);
    const type = String(entry.header.type ?? 'file');
    if (!['file', 'directory'].includes(type)) {
      throw new Error(`SEMANTIC_PROVIDER_ARCHIVE_LINK_REFUSED: ${entry.header.name}`);
    }
    const selected = selectedArchivePath(entry.header.name, recipe.prefix);
    if (selected) registerArchiveDestination(destinations, selected, type === 'directory' ? 'directory' : 'file');
    expanded += entry.data?.byteLength ?? 0;
    if (expanded > recipe.maxExpandedBytes) throw new Error('SEMANTIC_PROVIDER_ARCHIVE_EXPANDED_LIMIT');
  }

  await mkdir(destinationRoot, { recursive: true });
  for (const entry of entries) {
    const mapped = mappedArchivePath(entry.header.name, destinationRoot, recipe.prefix);
    if (!mapped) continue;
    if (String(entry.header.type) === 'directory' || !entry.data) {
      await mkdir(mapped, { recursive: true });
      continue;
    }
    await mkdir(path.dirname(mapped), { recursive: true });
    const handle = await open(mapped, 'wx');
    try {
      await handle.writeFile(entry.data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = (await import('node:fs')).createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function treeDigest(root: string, mutablePaths: readonly string[] = []): Promise<string> {
  const hash = createHash('sha256');
  const mutable = new Set(mutablePaths.map(item => item.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '').toLowerCase()).filter(Boolean));
  async function walk(current: string): Promise<void> {
    const names = (await readdir(current)).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      if (name === MANIFEST_NAME) continue;
      const full = path.join(current, name);
      const info = await lstat(full);
      const relative = path.relative(root, full).replaceAll('\\', '/');
      const relativeKey = relative.toLowerCase();
      if ([...mutable].some(item => relativeKey === item || relativeKey.startsWith(item + '/'))) continue;
      if (info.isSymbolicLink()) throw new Error(`SEMANTIC_PROVIDER_INSTALLED_SYMLINK_REFUSED: ${relative}`);
      if (info.isDirectory()) {
        hash.update(`D\0${relative}\0`);
        await walk(full);
      } else if (info.isFile()) {
        hash.update(`F\0${relative}\0${info.size}\0`);
        hash.update(await hashFile(full));
      } else {
        throw new Error(`SEMANTIC_PROVIDER_INSTALLED_TYPE_REFUSED: ${relative}`);
      }
    }
  }
  await walk(root);
  return hash.digest('hex');
}
async function readInstalledManifest(root: string): Promise<InstalledProviderManifest | undefined> {
  const filePath = path.join(root, MANIFEST_NAME);
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8')) as InstalledProviderManifest;
    if (value.schemaVersion !== 1 || !value.providerId || !value.treeSha256) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

async function requiredPathsExist(root: string, recipe: ProviderRecipe): Promise<boolean> {
  for (const relative of recipe.requiredPaths) {
    const full = path.resolve(root, relative);
    if (!inside(full, root) || !(await exists(full))) return false;
    const info = await lstat(full);
    if (!info.isFile() || info.isSymbolicLink()) return false;
  }
  return true;
}

async function installationValid(root: string, recipe: ProviderRecipe): Promise<{ valid: boolean; digest?: string }> {
  const manifest = await readInstalledManifest(root);
  if (!manifest) return { valid: false };
  if (manifest.providerId !== recipe.id || manifest.recipeVersion !== recipe.recipeVersion) return { valid: false };
  if (!(await requiredPathsExist(root, recipe))) return { valid: false };
  const digest = await treeDigest(root, recipe.mutablePaths ?? []);
  return { valid: digest === manifest.treeSha256, digest };
}
async function extractArtifact(
  archivePath: string,
  stageRoot: string,
  recipe: ProviderArtifactRecipe,
): Promise<void> {
  const destination = path.resolve(stageRoot, recipe.targetSubdir);
  if (!inside(destination, stageRoot)) throw new Error('SEMANTIC_PROVIDER_TARGET_OUTSIDE_STAGE');
  if (recipe.format === 'zip') return extractZip(archivePath, destination, recipe);
  if (recipe.format === 'tgz') return extractTgz(archivePath, destination, recipe);
  throw new Error('SEMANTIC_PROVIDER_ARCHIVE_FORMAT_UNSUPPORTED');
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  const retryable = new Set(['EPERM', 'EACCES', 'EBUSY']);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !retryable.has(code) || attempt === 9) throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

async function promoteDirectory(
  stage: string,
  destination: string,
): Promise<{ backup?: string }> {
  const backup = `${destination}.backup-${randomUUID()}`;
  const hadDestination = await exists(destination);
  if (hadDestination) await renameWithRetry(destination, backup);
  try {
    await renameWithRetry(stage, destination);
  } catch (error) {
    if (hadDestination && await exists(backup)) {
      await renameWithRetry(backup, destination).catch(() => undefined);
    }
    throw error;
  }
  return hadDestination ? { backup } : {};
}

function installedManifest(recipe: ProviderRecipe, digest: string): InstalledProviderManifest {
  return {
    schemaVersion: 1,
    providerId: recipe.id,
    recipeVersion: recipe.recipeVersion,
    installedAt: new Date().toISOString(),
    treeSha256: digest,
    artifacts: recipe.artifacts.map(item => ({
      id: item.id,
      version: item.version,
      url: item.url,
      sha256: item.sha256,
    })),
  };
}

export function provisionableProviderIds(): ProvisionProviderId[] {
  return Object.keys(RECIPES) as ProvisionProviderId[];
}
export class SemanticProviderProvisioner {
  private readonly providersRoot: string;

  constructor(
    runtimeDir: string,
    private readonly recipes: Partial<Record<ProvisionProviderId, ProviderRecipe>> = RECIPES,
  ) {
    this.providersRoot = path.join(runtimeDir, 'providers');
  }

  async provision(
    providerId: ProvisionProviderId,
    options: ProvisionProviderOptions = {},
  ): Promise<ProvisionProviderResult> {
    const recipe = this.recipes[providerId];
    if (!recipe) throw new Error(`SEMANTIC_PROVIDER_PROVISION_UNSUPPORTED: ${providerId}`);
    await mkdir(this.providersRoot, { recursive: true });

    const destination = path.join(this.providersRoot, providerId);
    const current = await installationValid(destination, recipe).catch(() => ({ valid: false as const }));
    if (current.valid && current.digest) {
      return {
        providerId,
        changed: false,
        repaired: false,
        alreadyValid: true,
        recipeVersion: recipe.recipeVersion,
        treeSha256: current.digest,
        installedRoot: destination,
      };
    }
    if (await exists(destination) && options.repair !== true) {
      throw new Error(`SEMANTIC_PROVIDER_REPAIR_REQUIRED: ${providerId}`);
    }

    const runId = randomUUID();
    const stage = path.join(this.providersRoot, `.stage-${providerId}-${runId}`);
    const work = path.join(this.providersRoot, `.download-${providerId}-${runId}`);
    await safeRm(stage);
    await safeRm(work);
    await mkdir(stage, { recursive: true });
    await mkdir(work, { recursive: true });

    try {
      for (const artifact of recipe.artifacts) {
        const extension = artifact.format === 'tgz' ? '.tgz' : '.zip';
        const archivePath = path.join(work, `${artifact.id}${extension}`);
        await downloadVerified(artifact, archivePath);
        await extractArtifact(archivePath, stage, artifact);
      }

      if (!(await requiredPathsExist(stage, recipe))) {
        throw new Error(`SEMANTIC_PROVIDER_ENTRYPOINT_MISSING: ${providerId}`);
      }
      const digest = await treeDigest(stage, recipe.mutablePaths ?? []);
      await writeOwnedFileAtomic(
        path.join(stage, MANIFEST_NAME),
        JSON.stringify(installedManifest(recipe, digest), null, 2) + '\n',
      );
      const promotion = await promoteDirectory(stage, destination);
      let verified: { valid: boolean; digest?: string };
      try {
        verified = await installationValid(destination, recipe);
        if (!verified.valid || !verified.digest) {
          throw new Error(`SEMANTIC_PROVIDER_POST_INSTALL_VERIFY_FAILED: ${providerId}`);
        }
      } catch (error) {
        await safeRm(destination);
        if (promotion.backup && await exists(promotion.backup)) {
          await renameWithRetry(promotion.backup, destination).catch(() => undefined);
        }
        throw error;
      }
      if (promotion.backup) await safeRm(promotion.backup);
      return {
        providerId,
        changed: true,
        repaired: options.repair === true,
        alreadyValid: false,
        recipeVersion: recipe.recipeVersion,
        treeSha256: verified.digest,
        installedRoot: destination,
      };
    } finally {
      await safeRm(stage);
      await safeRm(work);
    }
  }
}

export function providerRecipeSummary(providerId: ProvisionProviderId) {
  const recipe = RECIPES[providerId];
  return {
    providerId,
    recipeVersion: recipe.recipeVersion,
    artifacts: recipe.artifacts.map(item => ({
      id: item.id,
      version: item.version,
      sha256: item.sha256,
      url: item.url,
    })),
  };
}
export interface ManagedProviderIssue {
  providerId: ProvisionProviderId;
  code: 'SEMANTIC_MANAGED_PROVIDER_MANIFEST_INVALID' | 'SEMANTIC_MANAGED_PROVIDER_CORRUPT';
  message: string;
}

export async function managedProviderHealthIssues(runtimeDir: string): Promise<ManagedProviderIssue[]> {
  const issues: ManagedProviderIssue[] = [];
  for (const providerId of provisionableProviderIds()) {
    const recipe = RECIPES[providerId];
    const root = path.join(runtimeDir, 'providers', providerId);
    const manifestPath = path.join(root, MANIFEST_NAME);
    if (!(await exists(manifestPath))) continue;
    const manifest = await readInstalledManifest(root);
    if (!manifest || manifest.providerId !== providerId || manifest.recipeVersion !== recipe.recipeVersion) {
      issues.push({
        providerId,
        code: 'SEMANTIC_MANAGED_PROVIDER_MANIFEST_INVALID',
        message: `Managed provider ${providerId} has an invalid provisioning manifest.`,
      });
      continue;
    }
    if (!(await requiredPathsExist(root, recipe))) {
      issues.push({
        providerId,
        code: 'SEMANTIC_MANAGED_PROVIDER_CORRUPT',
        message: `Managed provider ${providerId} is missing one or more required entrypoints; explicit repair is required.`,
      });
    }
  }
  return issues;
}
