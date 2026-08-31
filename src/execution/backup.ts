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
import { DatabaseSync } from 'node:sqlite';
import { EXECUTION_SCHEMA_VERSION } from './schema.js';
import { ExecutionRuntimeLease } from './runtime-lease.js';
import { ExecutionWorkerClient } from './worker-client.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';

const FORMAT = 'agent-core-execution-recovery-bundle' as const;
const VERSION = 1 as const;

export interface ExecutionRecoveryBundleFile {
  path: string;
  size: number;
  sha256: string;
}

export interface ExecutionRecoveryBundleManifest {
  format: typeof FORMAT;
  version: typeof VERSION;
  sourceVersion: string;
  executionSchemaVersion: number;
  createdAt: string;
  reason: string | null;
  database: {
    path: 'execution.sqlite';
    size: number;
    sha256: string;
    integrity: 'ok';
  };
  evidence: {
    root: 'evidence';
    totalBytes: number;
    files: ExecutionRecoveryBundleFile[];
  };
}

export class ExecutionRecoveryBundleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutionRecoveryBundleError';
  }
}

export interface CreateExecutionRecoveryBundleOptions {
  dbPath: string;
  logRoot: string;
  destinationRoot: string;
  sourceVersion: string;
  reason?: string;
  busyTimeoutMs?: number;
  metrics?: RuntimeMetricRegistry;
}

export interface RestoreExecutionRecoveryBundleOptions {
  bundlePath: string;
  dbPath: string;
  logRoot: string;
  rollbackRoot: string;
  metrics?: RuntimeMetricRegistry;
  hooks?: {
    afterDatabaseReplace?: () => void | Promise<void>;
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

async function listRegularFiles(root: string): Promise<string[]> {
  if (!await pathExists(root)) return [];
  const output: string[] = [];
  async function walk(current: string, relative: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(absolute, childRelative);
        continue;
      }
      if (!entry.isFile()) {
        fail('EXECUTION_BACKUP_EVIDENCE_UNSAFE', `Execution evidence contains a non-regular entry: ${portableRelative(childRelative)}`);
      }
      const info = await lstat(absolute);
      if (!info.isFile()) {
        fail('EXECUTION_BACKUP_EVIDENCE_UNSAFE', `Execution evidence contains a non-regular entry: ${portableRelative(childRelative)}`);
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

async function copyEvidenceTree(sourceRoot: string, destinationRoot: string): Promise<ExecutionRecoveryBundleFile[]> {
  const files = await listRegularFiles(sourceRoot);
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

function readSQLiteFacts(dbPath: string): { integrity: 'ok'; schemaVersion: number } {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(dbPath, { readOnly: true });
    const integrityRow = database.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    const integrity = String(integrityRow?.integrity_check ?? 'unknown');
    if (integrity !== 'ok') fail('EXECUTION_BACKUP_SQLITE_INTEGRITY_FAILED', `Execution backup SQLite integrity failed: ${integrity}`);
    const versionRow = database.prepare('PRAGMA user_version').get() as Record<string, unknown> | undefined;
    const schemaVersion = Number(versionRow?.user_version ?? -1);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 0 || schemaVersion > EXECUTION_SCHEMA_VERSION) {
      fail('EXECUTION_BACKUP_SCHEMA_UNSUPPORTED', `Execution backup schema ${schemaVersion} is not supported by runtime schema ${EXECUTION_SCHEMA_VERSION}`);
    }
    return { integrity: 'ok', schemaVersion };
  } catch (error) {
    if (error instanceof ExecutionRecoveryBundleError) throw error;
    throw new ExecutionRecoveryBundleError(
      'EXECUTION_BACKUP_SQLITE_INTEGRITY_FAILED',
      `Execution backup SQLite could not be verified: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    try { database?.close(); } catch { /* no-op */ }
  }
}

function validManifest(value: unknown): value is ExecutionRecoveryBundleManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Partial<ExecutionRecoveryBundleManifest>;
  return manifest.format === FORMAT
    && manifest.version === VERSION
    && typeof manifest.sourceVersion === 'string' && manifest.sourceVersion.length > 0
    && Number.isInteger(manifest.executionSchemaVersion)
    && typeof manifest.createdAt === 'string' && Number.isFinite(Date.parse(manifest.createdAt))
    && (manifest.reason === null || typeof manifest.reason === 'string')
    && Boolean(manifest.database && manifest.database.path === 'execution.sqlite'
      && Number.isSafeInteger(manifest.database.size) && manifest.database.size >= 0
      && typeof manifest.database.sha256 === 'string' && /^[a-f0-9]{64}$/.test(manifest.database.sha256)
      && manifest.database.integrity === 'ok')
    && Boolean(manifest.evidence && manifest.evidence.root === 'evidence'
      && Number.isSafeInteger(manifest.evidence.totalBytes) && manifest.evidence.totalBytes >= 0
      && Array.isArray(manifest.evidence.files));
}

function bundleName(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
}

async function createExecutionRecoveryBundleImpl(
  options: CreateExecutionRecoveryBundleOptions,
): Promise<{ bundlePath: string; manifest: ExecutionRecoveryBundleManifest }> {
  const dbPath = path.resolve(options.dbPath);
  const logRoot = path.resolve(options.logRoot);
  const destinationRoot = path.resolve(options.destinationRoot);
  if (!await pathExists(dbPath)) fail('EXECUTION_BACKUP_DB_NOT_FOUND', `Execution database does not exist: ${dbPath}`);

  const lease = await ExecutionRuntimeLease.acquire(dbPath);
  const temporary = path.join(destinationRoot, `.${bundleName('execution-recovery')}.tmp`);
  const finalPath = path.join(destinationRoot, bundleName('execution-recovery'));
  const backupDb = path.join(temporary, 'execution.sqlite');
  const evidenceRoot = path.join(temporary, 'evidence');
  let worker: ExecutionWorkerClient | undefined;
  try {
    await mkdir(temporary, { recursive: true });
    worker = new ExecutionWorkerClient();
    await worker.open({ dbPath, busyTimeoutMs: options.busyTimeoutMs });
    const integrity = await worker.integrity();
    if (!integrity.ok) fail('EXECUTION_BACKUP_SQLITE_INTEGRITY_FAILED', `Execution SQLite integrity failed before backup: ${integrity.result}`);
    const versionRows = await worker.query<{ user_version: number }>('PRAGMA user_version');
    const executionSchemaVersion = Number(versionRows[0]?.user_version ?? -1);
    if (!Number.isInteger(executionSchemaVersion) || executionSchemaVersion < 0 || executionSchemaVersion > EXECUTION_SCHEMA_VERSION) {
      fail('EXECUTION_BACKUP_SCHEMA_UNSUPPORTED', `Execution schema ${executionSchemaVersion} is not supported`);
    }
    await worker.checkpoint();
    await worker.backup(backupDb);
    await worker.close();
    worker = undefined;

    const databaseFacts = readSQLiteFacts(backupDb);
    if (databaseFacts.schemaVersion !== executionSchemaVersion) {
      fail('EXECUTION_BACKUP_SCHEMA_MISMATCH', 'Execution backup schema changed during snapshot');
    }
    const evidenceFiles = await copyEvidenceTree(logRoot, evidenceRoot);
    const dbInfo = await stat(backupDb);
    const manifest: ExecutionRecoveryBundleManifest = {
      format: FORMAT,
      version: VERSION,
      sourceVersion: options.sourceVersion,
      executionSchemaVersion,
      createdAt: new Date().toISOString(),
      reason: options.reason?.normalize('NFKC').trim().slice(0, 500) || null,
      database: {
        path: 'execution.sqlite',
        size: dbInfo.size,
        sha256: await sha256File(backupDb),
        integrity: 'ok',
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
    await worker?.close().catch(() => undefined);
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

  safeManifestRelative(manifest.database.path);
  const dbFile = localFromPortable(resolved, manifest.database.path);
  const dbInfo = await stat(dbFile).catch(() => null);
  if (!dbInfo?.isFile() || dbInfo.size !== manifest.database.size || await sha256File(dbFile) !== manifest.database.sha256) {
    fail('EXECUTION_BACKUP_HASH_MISMATCH', 'Execution recovery database hash/size does not match its manifest');
  }

  const evidenceRoot = localFromPortable(resolved, manifest.evidence.root);
  const expectedPaths = manifest.evidence.files.map((file) => safeManifestRelative(file.path));
  if (new Set(expectedPaths).size !== expectedPaths.length) fail('EXECUTION_BACKUP_MANIFEST_INVALID', 'Execution recovery evidence manifest contains duplicate paths');
  const actualPaths = await listRegularFiles(evidenceRoot);
  if (JSON.stringify(actualPaths) !== JSON.stringify([...expectedPaths].sort((a, b) => a.localeCompare(b)))) {
    fail('EXECUTION_BACKUP_EVIDENCE_MISMATCH', 'Execution recovery evidence file set does not match its manifest');
  }
  let totalBytes = 0;
  for (const file of manifest.evidence.files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      fail('EXECUTION_BACKUP_MANIFEST_INVALID', 'Execution recovery evidence file manifest is invalid');
    }
    const target = localFromPortable(evidenceRoot, file.path);
    const info = await stat(target).catch(() => null);
    if (!info?.isFile() || info.size !== file.size || await sha256File(target) !== file.sha256) {
      fail('EXECUTION_BACKUP_HASH_MISMATCH', `Execution recovery evidence hash/size mismatch: ${file.path}`);
    }
    totalBytes += file.size;
  }
  if (totalBytes !== manifest.evidence.totalBytes) fail('EXECUTION_BACKUP_MANIFEST_INVALID', 'Execution recovery evidence byte total does not match its manifest');

  const facts = readSQLiteFacts(dbFile);
  if (facts.schemaVersion !== manifest.executionSchemaVersion) {
    fail('EXECUTION_BACKUP_SCHEMA_MISMATCH', 'Execution recovery database schema does not match its manifest');
  }
  return { ok: true, bundlePath: resolved, manifest };
}

async function copyRawFileIfPresent(source: string, destination: string): Promise<boolean> {
  if (!await pathExists(source)) return false;
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return true;
}

async function createRawRollbackSnapshot(dbPath: string, logRoot: string, rollbackRoot: string): Promise<string> {
  const rollbackPath = path.join(path.resolve(rollbackRoot), bundleName('pre-restore-rollback'));
  await mkdir(rollbackPath, { recursive: true });
  const files: string[] = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${dbPath}${suffix}`;
    const name = `execution.sqlite${suffix}`;
    if (await copyRawFileIfPresent(source, path.join(rollbackPath, name))) files.push(name);
  }
  await copyEvidenceTree(logRoot, path.join(rollbackPath, 'evidence'));
  await writeFile(path.join(rollbackPath, 'rollback.json'), `${JSON.stringify({
    format: 'agent-core-execution-pre-restore-rollback',
    version: 1,
    createdAt: new Date().toISOString(),
    files,
  }, null, 2)}\n`, 'utf8');
  return rollbackPath;
}

async function restoreRawRollbackSnapshot(rollbackPath: string, dbPath: string, logRoot: string): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) await rm(`${dbPath}${suffix}`, { force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const source = path.join(rollbackPath, `execution.sqlite${suffix}`);
    if (await pathExists(source)) await copyRawFileIfPresent(source, `${dbPath}${suffix}`);
  }
  await rm(logRoot, { recursive: true, force: true });
  await copyEvidenceTree(path.join(rollbackPath, 'evidence'), logRoot);
}

async function stageVerifiedEvidence(bundlePath: string, manifest: ExecutionRecoveryBundleManifest, stageRoot: string): Promise<void> {
  await mkdir(stageRoot, { recursive: true });
  const sourceRoot = path.join(bundlePath, manifest.evidence.root);
  for (const file of manifest.evidence.files) {
    const source = localFromPortable(sourceRoot, file.path);
    const destination = localFromPortable(stageRoot, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function restoreExecutionRecoveryBundleImpl(
  options: RestoreExecutionRecoveryBundleOptions,
): Promise<{ restored: true; rollbackPath: string; manifest: ExecutionRecoveryBundleManifest }> {
  const dbPath = path.resolve(options.dbPath);
  const logRoot = path.resolve(options.logRoot);
  const lease = await ExecutionRuntimeLease.acquire(dbPath);
  const stageToken = randomUUID();
  const stagedDb = `${dbPath}.restore-${stageToken}`;
  const stagedEvidence = `${logRoot}.restore-${stageToken}`;
  let rollbackPath = '';
  try {
    const verified = await verifyExecutionRecoveryBundle(options.bundlePath);
    rollbackPath = await createRawRollbackSnapshot(dbPath, logRoot, options.rollbackRoot);
    await mkdir(path.dirname(stagedDb), { recursive: true });
    await copyFile(path.join(verified.bundlePath, verified.manifest.database.path), stagedDb);
    await stageVerifiedEvidence(verified.bundlePath, verified.manifest, stagedEvidence);
    readSQLiteFacts(stagedDb);

    try {
      await rm(dbPath, { force: true });
      await rename(stagedDb, dbPath);
      await rm(`${dbPath}-wal`, { force: true });
      await rm(`${dbPath}-shm`, { force: true });
      await options.hooks?.afterDatabaseReplace?.();
      await rm(logRoot, { recursive: true, force: true });
      await rename(stagedEvidence, logRoot);
      readSQLiteFacts(dbPath);
    } catch (error) {
      await restoreRawRollbackSnapshot(rollbackPath, dbPath, logRoot);
      throw error;
    }
    return { restored: true, rollbackPath, manifest: verified.manifest };
  } finally {
    await rm(stagedDb, { force: true }).catch(() => undefined);
    await rm(stagedEvidence, { recursive: true, force: true }).catch(() => undefined);
    await lease.release().catch(() => undefined);
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
