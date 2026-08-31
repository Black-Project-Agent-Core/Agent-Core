import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  ExecutionRecoveryBundleError,
  createExecutionRecoveryBundle,
  restoreExecutionRecoveryBundle,
  verifyExecutionRecoveryBundle,
} from '../src/execution/backup.js';
import { ExecutionService } from '../src/execution/service.js';
import type { ExecutionScope } from '../src/execution/types.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { printCommand } from './helpers/platform-command.js';

const roots: string[] = [];

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

async function sha256(target: string): Promise<string> {
  return createHash('sha256').update(await readFile(target)).digest('hex');
}

async function fixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-execution-backup-${label}-`));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  const config = {
    ...loadConfig({}, root).execution,
    dbPath: path.join(root, 'runtime', 'execution', 'execution.sqlite'),
    logRoot: path.join(root, 'runtime', 'execution', 'runs'),
  };
  const workspace = new WorkspacePolicy([root]);
  const scope = { principalId: 'principal-backup', projectId: root } satisfies ExecutionScope;
  return { root, work, config, workspace, scope, bundleRoot: path.join(root, 'recovery-bundles') };
}

async function seedCompletedRun(f: Awaited<ReturnType<typeof fixture>>, objective: string) {
  const service = new ExecutionService(f.config, f.workspace);
  await service.open();
  const created = await service.create(f.scope, {
    objective,
    nodes: [{ id: 'A', purpose: objective, command: printCommand(`${objective}\n`), cwd: f.work }],
  });
  await service.start(f.scope, created.runId);
  const deadline = Date.now() + 5_000;
  let status = await service.status(f.scope, created.runId);
  while (status && status.state === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    status = await service.status(f.scope, created.runId);
  }
  expect(status?.state).toBe('completed');
  await service.close();
  return created.runId;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Execution Recovery Bundle', () => {
  it('creates and verifies a consistent DB + complete execution-evidence bundle with hashes', async () => {
    const f = await fixture('create');
    const runId = await seedCompletedRun(f, 'bundle-source');
    const created = await createExecutionRecoveryBundle({
      dbPath: f.config.dbPath,
      logRoot: f.config.logRoot,
      destinationRoot: f.bundleRoot,
      sourceVersion: '0.5.4',
      reason: 'test-backup',
    });

    expect(created.manifest).toMatchObject({
      format: 'agent-core-execution-recovery-bundle',
      version: 1,
      sourceVersion: '0.5.4',
      executionSchemaVersion: 4,
      reason: 'test-backup',
      database: { path: 'execution.sqlite', integrity: 'ok', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      evidence: { root: 'evidence', files: expect.any(Array) },
    });
    expect(created.manifest.evidence.files.some((file) => file.path.includes(runId) && file.path.endsWith('.result.json'))).toBe(true);
    await expect(verifyExecutionRecoveryBundle(created.bundlePath)).resolves.toMatchObject({ ok: true });
  });

  it('rejects a bundle when a hashed evidence file changes after creation', async () => {
    const f = await fixture('hash-corrupt');
    await seedCompletedRun(f, 'hash-source');
    const created = await createExecutionRecoveryBundle({
      dbPath: f.config.dbPath, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const evidence = created.manifest.evidence.files[0]!;
    await writeFile(path.join(created.bundlePath, 'evidence', ...evidence.path.split('/')), 'tampered');
    await expect(verifyExecutionRecoveryBundle(created.bundlePath)).rejects.toMatchObject<Partial<ExecutionRecoveryBundleError>>({
      code: 'EXECUTION_BACKUP_HASH_MISMATCH',
    });
  });

  it('rejects corrupt SQLite even when the manifest hash is updated to match the corrupt bytes', async () => {
    const f = await fixture('sqlite-corrupt');
    await seedCompletedRun(f, 'sqlite-source');
    const created = await createExecutionRecoveryBundle({
      dbPath: f.config.dbPath, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const dbFile = path.join(created.bundlePath, 'execution.sqlite');
    await writeFile(dbFile, 'not a sqlite database');
    const manifestPath = path.join(created.bundlePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as any;
    manifest.database.sha256 = await sha256(dbFile);
    manifest.database.size = (await stat(dbFile)).size;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await expect(verifyExecutionRecoveryBundle(created.bundlePath)).rejects.toMatchObject({
      code: 'EXECUTION_BACKUP_SQLITE_INTEGRITY_FAILED',
    });
  });

  it('refuses restore while a live ExecutionService owns the destination database', async () => {
    const f = await fixture('active-restore');
    await seedCompletedRun(f, 'source');
    const created = await createExecutionRecoveryBundle({
      dbPath: f.config.dbPath, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const live = new ExecutionService(f.config, f.workspace);
    await live.open();
    await expect(restoreExecutionRecoveryBundle({
      bundlePath: created.bundlePath, dbPath: f.config.dbPath, logRoot: f.config.logRoot,
      rollbackRoot: path.join(f.root, 'rollback'),
    })).rejects.toMatchObject({ code: 'EXECUTION_RUNTIME_ACTIVE' });
    await live.close();
  });

  it('restores a verified bundle, keeps a pre-restore rollback snapshot, and removes later run truth', async () => {
    const f = await fixture('restore');
    const originalRunId = await seedCompletedRun(f, 'original');
    const created = await createExecutionRecoveryBundle({
      dbPath: f.config.dbPath, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const laterRunId = await seedCompletedRun(f, 'later');

    const restored = await restoreExecutionRecoveryBundle({
      bundlePath: created.bundlePath,
      dbPath: f.config.dbPath,
      logRoot: f.config.logRoot,
      rollbackRoot: path.join(f.root, 'rollback'),
    });
    expect(await exists(restored.rollbackPath)).toBe(true);
    expect(await exists(path.join(restored.rollbackPath, 'execution.sqlite'))).toBe(true);
    expect(await exists(path.join(restored.rollbackPath, 'evidence'))).toBe(true);

    const reopened = new ExecutionService(f.config, f.workspace);
    await reopened.open();
    expect((await reopened.status(f.scope, originalRunId))?.state).toBe('completed');
    expect(await reopened.status(f.scope, laterRunId)).toBeNull();
    await reopened.close();
  });

  it('rolls the live DB and evidence back if a restore fails after database replacement', async () => {
    const f = await fixture('rollback-on-failure');
    const originalRunId = await seedCompletedRun(f, 'bundle-original');
    const created = await createExecutionRecoveryBundle({
      dbPath: f.config.dbPath, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const liveRunId = await seedCompletedRun(f, 'live-before-failed-restore');

    await expect(restoreExecutionRecoveryBundle({
      bundlePath: created.bundlePath,
      dbPath: f.config.dbPath,
      logRoot: f.config.logRoot,
      rollbackRoot: path.join(f.root, 'rollback'),
      hooks: { afterDatabaseReplace: async () => { throw new Error('synthetic swap failure'); } },
    })).rejects.toThrow('synthetic swap failure');

    const reopened = new ExecutionService(f.config, f.workspace);
    await reopened.open();
    expect((await reopened.status(f.scope, liveRunId))?.state).toBe('completed');
    expect((await reopened.status(f.scope, originalRunId))?.state).toBe('completed');
    await reopened.close();
  });
});
