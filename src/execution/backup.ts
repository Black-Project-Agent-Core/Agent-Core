import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { ExecutionRuntimeLease } from './runtime-lease.js';
import { EXECUTION_STATE_VERSION } from './types.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';

const FORMAT = 'agent-core-execution-recovery-bundle' as const;
const VERSION = 2 as const;
/** Owner-token locks and the runtime lease describe the live process, never the recovered state. */
const VOLATILE_ROOTS = ['leases', path.join('journal', 'locks')];

export interface ExecutionRecoveryBundleFile {
  path: string;
  size: number;
  sha256: string;
}

export interface ExecutionRecoveryBundleTree {
  root: string;
  totalBytes: number;
  files: ExecutionRecoveryBundleFile[];
}

export interface ExecutionRecoveryBundleManifest {
  format: typeof FORMAT;
  version: typeof VERSION;
  sourceVersion: string;
  executionStateVersion: number;
  createdAt: string;
  reason: string | null;
  state: ExecutionRecoveryBundleTree & { root: 'state' };
  evidence: ExecutionRecoveryBundleTree & { root: 'evidence' };
}

export class ExecutionRecoveryBundleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutionRecoveryBundleError';
  }
}

export interface CreateExecutionRecoveryBundleOptions {
  stateRoot: string;
  logRoot: string;
  destinationRoot: string;
  sourceVersion: string;
  reason?: string;
  metrics?: RuntimeMetricRegistry;
}

export interface RestoreExecutionRecoveryBundleOptions {
  bundlePath: string;
  stateRoot: string;
  logRoot: string;
  rollbackRoot: string;
  metrics?: RuntimeMetricRegistry;
  hooks?: {
    afterStateReplace?: () => void | Promise<void>;
  };
}

function fail(code: string, message: string): never {
  throw new ExecutionRecoveryBundleError(code, message);
}

async function pathExists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

function portableRelative(value: string): string {
  return value.split(path.sep).join('/');
}

function safeManifestRelative(value: string): string {
  if (!value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)) {
    fail('EXECUTION_BACKUP_MANIFEST_INVALID', 'Recovery bundle contains an unsafe relative path');
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../') || normalized !== value) {
    fail('EXECUTION_BACKUP_MANIFEST_INVALID', 'Recovery bundle contains an unsafe relative path');
  }
  return normalized;
}

async function sha256File(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(target);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

async function listRegularFiles(root: string, skip: readonly string[] = []): Promise<string[]> {
  if (!await pathExists(root)) return [];
  const output: string[] = [];
  async function walk(current: string, relative: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      if (skip.includes(childRelative)) continue;
      if (entry.isDirectory()) {
        await walk(absolute, childRelative);
        continue;
      }
      if (!entry.isFile()) {
        fail('EXECUTION_BACKUP_TREE_UNSAFE', `Execution recovery tree contains a non-regular entry: ${portableRelative(childRelative)}`);
      }
      const info = await lstat(absolute);
      if (!info.isFile()) {
        fail('EXECUTION_BACKUP_TREE_UNSAFE', `Execution recovery tree contains a non-regular entry: ${portableRelative(childRelative)}`);
      }
      output.push(portableRelative(childRelative));
    }
  }
  await walk(root, '');
  return output.sort((left, right) => left.localeCompare(right));
}

function localFromPortable(root: string, relative: string): string {
  safeManifestRelative(relative);
  return path.join(root, ...relative.split('/'));
}

async function copyTree(
  sourceRoot: string,
  destinationRoot: string,
  skip: readonly string[] = [],
): Promise<ExecutionRecoveryBundleFile[]> {
  const files = await listRegularFiles(sourceRoot, skip);
  const manifest: ExecutionRecoveryBundleFile[] = [];
  await mkdir(destinationRoot, { recursive: true });
  for (const relative of files) {
    const source = localFromPortable(sourceRoot, relative);
    const destination = localFromPortable(destinationRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    const info = await stat(destination);
    manifest.push({ path: relative, size: info.size, sha256: await sha256File(destination) });
  }
  return manifest;
}

/**
 * A state tree only counts as recoverable execution state when its layout marker is present and
 * readable at a version this runtime understands, and its run manifest still parses.
 */
async function readStateFacts(stateRoot: string): Promise<{ executionStateVersion: number }> {
  const marker = path.join(stateRoot, 'state.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(marker, 'utf8')) as unknown;
  } catch (error) {
    fail('EXECUTION_BACKUP_STATE_INTEGRITY_FAILED', `Execution state marker could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const version = Number((parsed as { stateVersion?: unknown } | null)?.stateVersion);
  if (!Number.isInteger(version) || version < 1 || version > EXECUTION_STATE_VERSION) {
    fail('EXECUTION_BACKUP_STATE_UNSUPPORTED', `Execution state version ${version} is not supported by runtime version ${EXECUTION_STATE_VERSION}`);
  }
  const manifestPath = path.join(stateRoot, 'index', 'runs.jsonl');
  if (await pathExists(manifestPath)) {
    const body = await readFile(manifestPath, 'utf8');
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      try { JSON.parse(line); } catch {
        fail('EXECUTION_BACKUP_STATE_INTEGRITY_FAILED', 'Execution run manifest is corrupt');
      }
    }
  }
  return { executionStateVersion: version };
}

function validTree(value: unknown, root: string): value is ExecutionRecoveryBundleTree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const tree = value as Partial<ExecutionRecoveryBundleTree>;
  return tree.root === root
    && Number.isSafeInteger(tree.totalBytes) && Number(tree.totalBytes) >= 0
    && Array.isArray(tree.files);
}

function validManifest(value: unknown): value is ExecutionRecoveryBundleManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Partial<ExecutionRecoveryBundleManifest>;
  return manifest.format === FORMAT
    && manifest.version === VERSION
    && typeof manifest.sourceVersion === 'string' && manifest.sourceVersion.length > 0
    && Number.isInteger(manifest.executionStateVersion)
    && typeof manifest.createdAt === 'string' && Number.isFinite(Date.parse(manifest.createdAt))
    && (manifest.reason === null || typeof manifest.reason === 'string')
    && validTree(manifest.state, 'state')
    && validTree(manifest.evidence, 'evidence');
}

function bundleName(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
}

async function createExecutionRecoveryBundleImpl(
  options: CreateExecutionRecoveryBundleOptions,
): Promise<{ bundlePath: string; manifest: ExecutionRecoveryBundleManifest }> {
  const stateRoot = path.resolve(options.stateRoot);
  const logRoot = path.resolve(options.logRoot);
  const destinationRoot = path.resolve(options.destinationRoot);
  if (!await pathExists(stateRoot)) fail('EXECUTION_BACKUP_STATE_NOT_FOUND', `Execution state root does not exist: ${stateRoot}`);

  const lease = await ExecutionRuntimeLease.acquire(stateRoot);
  const temporary = path.join(destinationRoot, `.${bundleName('execution-recovery')}.tmp`);
  const finalPath = path.join(destinationRoot, bundleName('execution-recovery'));
  try {
    await mkdir(temporary, { recursive: true });
    const { executionStateVersion } = await readStateFacts(stateRoot);
    const stateFiles = await copyTree(stateRoot, path.join(temporary, 'state'), VOLATILE_ROOTS);
    const evidenceFiles = await copyTree(logRoot, path.join(temporary, 'evidence'));
    const staged = await readStateFacts(path.join(temporary, 'state'));
    if (staged.executionStateVersion !== executionStateVersion) {
      fail('EXECUTION_BACKUP_STATE_MISMATCH', 'Execution state version changed during snapshot');
    }
    const manifest: ExecutionRecoveryBundleManifest = {
      format: FORMAT,
      version: VERSION,
      sourceVersion: options.sourceVersion,
      executionStateVersion,
      createdAt: new Date().toISOString(),
      reason: options.reason?.normalize('NFKC').trim().slice(0, 500) || null,
      state: {
        root: 'state',
        totalBytes: stateFiles.reduce((sum, file) => sum + file.size, 0),
        files: stateFiles,
      },
      evidence: {
        root: 'evidence',
        totalBytes: evidenceFiles.reduce((sum, file) => sum + file.size, 0),
        files: evidenceFiles,
      },
    };
    await writeFile(path.join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await mkdir(destinationRoot, { recursive: true });
    await rename(temporary, finalPath);
    return { bundlePath: finalPath, manifest };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await lease.release().catch(() => undefined);
  }
}

export async function createExecutionRecoveryBundle(
  options: CreateExecutionRecoveryBundleOptions,
): Promise<{ bundlePath: string; manifest: ExecutionRecoveryBundleManifest }> {
  const startedAt = performance.now();
  try {
    return await createExecutionRecoveryBundleImpl(options);
  } catch (error) {
    options.metrics?.failure('execution.backup.duration_ms', error instanceof ExecutionRecoveryBundleError ? error.code : error instanceof Error ? error.name : 'EXECUTION_BACKUP_ERROR');
    throw error;
  } finally {
    options.metrics?.observe('execution.backup.duration_ms', Math.max(0, performance.now() - startedAt));
  }
}

async function verifyTree(bundlePath: string, tree: ExecutionRecoveryBundleTree, mismatchCode: string): Promise<void> {
  const root = localFromPortable(bundlePath, tree.root);
  const expected = tree.files.map((file) => safeManifestRelative(file.path));
  if (new Set(expected).size !== expected.length) fail('EXECUTION_BACKUP_MANIFEST_INVALID', `Recovery bundle ${tree.root} manifest contains duplicate paths`);
  const actual = await listRegularFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort((left, right) => left.localeCompare(right)))) {
    fail(mismatchCode, `Execution recovery ${tree.root} file set does not match its manifest`);
  }
  let totalBytes = 0;
  for (const file of tree.files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      fail('EXECUTION_BACKUP_MANIFEST_INVALID', `Execution recovery ${tree.root} file manifest is invalid`);
    }
    const target = localFromPortable(root, file.path);
    const info = await stat(target).catch(() => null);
    if (!info?.isFile() || info.size !== file.size || await sha256File(target) !== file.sha256) {
      fail('EXECUTION_BACKUP_HASH_MISMATCH', `Execution recovery ${tree.root} hash/size mismatch: ${file.path}`);
    }
    totalBytes += file.size;
  }
  if (totalBytes !== tree.totalBytes) fail('EXECUTION_BACKUP_MANIFEST_INVALID', `Execution recovery ${tree.root} byte total does not match its manifest`);
}

export async function verifyExecutionRecoveryBundle(
  bundlePath: string,
): Promise<{ ok: true; bundlePath: string; manifest: ExecutionRecoveryBundleManifest }> {
  const resolved = path.resolve(bundlePath);
  let manifest: ExecutionRecoveryBundleManifest;
  try {
    const parsed = JSON.parse(await readFile(path.join(resolved, 'manifest.json'), 'utf8')) as unknown;
    if (!validManifest(parsed)) fail('EXECUTION_BACKUP_MANIFEST_INVALID', 'Execution recovery bundle manifest is invalid');
    manifest = parsed;
  } catch (error) {
    if (error instanceof ExecutionRecoveryBundleError) throw error;
    fail('EXECUTION_BACKUP_MANIFEST_INVALID', `Execution recovery bundle manifest could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }

  await verifyTree(resolved, manifest.state, 'EXECUTION_BACKUP_STATE_MISMATCH');
  await verifyTree(resolved, manifest.evidence, 'EXECUTION_BACKUP_EVIDENCE_MISMATCH');

  const facts = await readStateFacts(path.join(resolved, manifest.state.root));
  if (facts.executionStateVersion !== manifest.executionStateVersion) {
    fail('EXECUTION_BACKUP_STATE_MISMATCH', 'Execution recovery state version does not match its manifest');
  }
  return { ok: true, bundlePath: resolved, manifest };
}

async function createRawRollbackSnapshot(stateRoot: string, logRoot: string, rollbackRoot: string): Promise<string> {
  const rollbackPath = path.join(path.resolve(rollbackRoot), bundleName('pre-restore-rollback'));
  await mkdir(rollbackPath, { recursive: true });
  const state = await copyTree(stateRoot, path.join(rollbackPath, 'state'), VOLATILE_ROOTS);
  await copyTree(logRoot, path.join(rollbackPath, 'evidence'));
  await writeFile(path.join(rollbackPath, 'rollback.json'), `${JSON.stringify({
    format: 'agent-core-execution-pre-restore-rollback',
    version: 2,
    createdAt: new Date().toISOString(),
    stateFiles: state.length,
  }, null, 2)}\n`, 'utf8');
  return rollbackPath;
}

async function restoreRawRollbackSnapshot(rollbackPath: string, stateRoot: string, logRoot: string): Promise<void> {
  await rm(stateRoot, { recursive: true, force: true });
  await copyTree(path.join(rollbackPath, 'state'), stateRoot);
  await rm(logRoot, { recursive: true, force: true });
  await copyTree(path.join(rollbackPath, 'evidence'), logRoot);
}

async function stageVerifiedTree(bundlePath: string, tree: ExecutionRecoveryBundleTree, stageRoot: string): Promise<void> {
  await mkdir(stageRoot, { recursive: true });
  const sourceRoot = path.join(bundlePath, tree.root);
  for (const file of tree.files) {
    const source = localFromPortable(sourceRoot, file.path);
    const destination = localFromPortable(stageRoot, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function restoreExecutionRecoveryBundleImpl(
  options: RestoreExecutionRecoveryBundleOptions,
): Promise<{ restored: true; rollbackPath: string; manifest: ExecutionRecoveryBundleManifest }> {
  const stateRoot = path.resolve(options.stateRoot);
  const logRoot = path.resolve(options.logRoot);
  const lease = await ExecutionRuntimeLease.acquire(stateRoot);
  const stageToken = randomUUID();
  const stagedState = `${stateRoot}.restore-${stageToken}`;
  const stagedEvidence = `${logRoot}.restore-${stageToken}`;
  let rollbackPath = '';
  let leaseReleased = false;
  try {
    const verified = await verifyExecutionRecoveryBundle(options.bundlePath);
    rollbackPath = await createRawRollbackSnapshot(stateRoot, logRoot, options.rollbackRoot);
    await stageVerifiedTree(verified.bundlePath, verified.manifest.state, stagedState);
    await stageVerifiedTree(verified.bundlePath, verified.manifest.evidence, stagedEvidence);
    await readStateFacts(stagedState);

    try {
      // The runtime lease lives inside the state root, so it is released before the swap and the
      // restored tree never inherits a lease record belonging to this process.
      await lease.release();
      leaseReleased = true;
      await rm(stateRoot, { recursive: true, force: true });
      await rename(stagedState, stateRoot);
      await options.hooks?.afterStateReplace?.();
      await rm(logRoot, { recursive: true, force: true });
      await rename(stagedEvidence, logRoot);
      await readStateFacts(stateRoot);
    } catch (error) {
      await restoreRawRollbackSnapshot(rollbackPath, stateRoot, logRoot);
      throw error;
    }
    return { restored: true, rollbackPath, manifest: verified.manifest };
  } finally {
    await rm(stagedState, { recursive: true, force: true }).catch(() => undefined);
    await rm(stagedEvidence, { recursive: true, force: true }).catch(() => undefined);
    if (!leaseReleased) await lease.release().catch(() => undefined);
  }
}

export async function restoreExecutionRecoveryBundle(
  options: RestoreExecutionRecoveryBundleOptions,
): Promise<{ restored: true; rollbackPath: string; manifest: ExecutionRecoveryBundleManifest }> {
  const startedAt = performance.now();
  try {
    return await restoreExecutionRecoveryBundleImpl(options);
  } catch (error) {
    options.metrics?.failure('execution.restore.duration_ms', error instanceof ExecutionRecoveryBundleError ? error.code : error instanceof Error ? error.name : 'EXECUTION_RESTORE_ERROR');
    throw error;
  } finally {
    options.metrics?.observe('execution.restore.duration_ms', Math.max(0, performance.now() - startedAt));
  }
}
