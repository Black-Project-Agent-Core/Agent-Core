import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';
import { printCommand } from './helpers/platform-command.js';

const roots: string[] = [];

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

async function fixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-execution-backup-${label}-`));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  const config = {
    ...loadConfig({}, root).execution,
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
  it('creates and verifies a consistent state + complete execution-evidence bundle with hashes', async () => {
    const f = await fixture('create');
    const runId = await seedCompletedRun(f, 'bundle-source');
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot,
      logRoot: f.config.logRoot,
      destinationRoot: f.bundleRoot,
      sourceVersion: '0.5.4',
      reason: 'test-backup',
    });

    expect(created.manifest).toMatchObject({
      format: 'agent-core-execution-recovery-bundle',
      version: 2,
      sourceVersion: '0.5.4',
      executionStateVersion: 1,
      reason: 'test-backup',
      state: { root: 'state', files: expect.any(Array) },
      evidence: { root: 'evidence', files: expect.any(Array) },
    });
    const statePaths = created.manifest.state.files.map((file) => file.path);
    expect(statePaths).toContain('state.json');
    expect(statePaths).toContain(`state/runs/${runId}/run.json`);
    expect(statePaths).toContain(`events/${runId}.jsonl`);
    // A recovered bundle must never carry the live runtime lease of the process that wrote it.
    expect(statePaths.some((entry) => entry.startsWith('leases/'))).toBe(false);
    expect(created.manifest.state.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(created.manifest.evidence.files.some((file) => file.path.includes(runId) && file.path.endsWith('.result.json'))).toBe(true);
    await expect(verifyExecutionRecoveryBundle(created.bundlePath)).resolves.toMatchObject({ ok: true });
  });

  it('records bounded backup and restore operation durations when a metric sink is supplied', async () => {
    const f = await fixture('metrics');
    await seedCompletedRun(f, 'metrics-source');
    const metrics = new RuntimeMetricRegistry();
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4', metrics,
    });
    expect(metrics.metric('execution.backup.duration_ms').count).toBe(1);
    await restoreExecutionRecoveryBundle({
      bundlePath: created.bundlePath, stateRoot: f.config.stateRoot, logRoot: f.config.logRoot,
      rollbackRoot: path.join(f.root, 'rollback-metrics'), metrics,
    });
    expect(metrics.metric('execution.restore.duration_ms').count).toBe(1);
  });

  it('rejects a bundle when a hashed evidence file changes after creation', async () => {
    const f = await fixture('hash-corrupt');
    await seedCompletedRun(f, 'hash-source');
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const evidence = created.manifest.evidence.files[0]!;
    await writeFile(path.join(created.bundlePath, 'evidence', ...evidence.path.split('/')), 'tampered');
    await expect(verifyExecutionRecoveryBundle(created.bundlePath)).rejects.toMatchObject<Partial<ExecutionRecoveryBundleError>>({
      code: 'EXECUTION_BACKUP_HASH_MISMATCH',
    });
  });

  it('rejects a state tree that gained an untracked file even though every manifested hash still matches', async () => {
    const f = await fixture('state-drift');
    await seedCompletedRun(f, 'state-source');
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    await writeFile(path.join(created.bundlePath, 'state', 'index', 'smuggled.jsonl'), '{"runId":"smuggled"}\n');
    await expect(verifyExecutionRecoveryBundle(created.bundlePath)).rejects.toMatchObject<Partial<ExecutionRecoveryBundleError>>({
      code: 'EXECUTION_BACKUP_STATE_MISMATCH',
    });
  });

  it('rejects a bundle whose layout marker no longer describes recoverable execution state', async () => {
    const f = await fixture('state-marker');
    await seedCompletedRun(f, 'marker-source');
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const body = `${JSON.stringify({ stateVersion: 99 })}\n`;
    await writeFile(path.join(created.bundlePath, 'state', 'state.json'), body);
    const manifestPath = path.join(created.bundlePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      state: { totalBytes: number; files: Array<{ path: string; size: number; sha256: string }> };
    };
    const marker = manifest.state.files.find((file) => file.path === 'state.json')!;
    manifest.state.totalBytes += Buffer.byteLength(body) - marker.size;
    marker.size = Buffer.byteLength(body);
    marker.sha256 = createHash('sha256').update(body).digest('hex');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await expect(verifyExecutionRecoveryBundle(created.bundlePath)).rejects.toMatchObject<Partial<ExecutionRecoveryBundleError>>({
      code: 'EXECUTION_BACKUP_STATE_UNSUPPORTED',
    });
  });

  it('refuses restore while a live ExecutionService owns the destination state root', async () => {
    const f = await fixture('active-restore');
    await seedCompletedRun(f, 'source');
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const live = new ExecutionService(f.config, f.workspace);
    await live.open();
    await expect(restoreExecutionRecoveryBundle({
      bundlePath: created.bundlePath, stateRoot: f.config.stateRoot, logRoot: f.config.logRoot,
      rollbackRoot: path.join(f.root, 'rollback'),
    })).rejects.toMatchObject({ code: 'EXECUTION_RUNTIME_ACTIVE' });
    await live.close();
  });

  it('restores a verified bundle, keeps a pre-restore rollback snapshot, and removes later run truth', async () => {
    const f = await fixture('restore');
    const originalRunId = await seedCompletedRun(f, 'original');
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const laterRunId = await seedCompletedRun(f, 'later');

    const restored = await restoreExecutionRecoveryBundle({
      bundlePath: created.bundlePath,
      stateRoot: f.config.stateRoot,
      logRoot: f.config.logRoot,
      rollbackRoot: path.join(f.root, 'rollback'),
    });
    expect(await exists(restored.rollbackPath)).toBe(true);
    expect(await exists(path.join(restored.rollbackPath, 'state', 'state.json'))).toBe(true);
    expect(await exists(path.join(restored.rollbackPath, 'evidence'))).toBe(true);

    const reopened = new ExecutionService(f.config, f.workspace);
    await reopened.open();
    expect((await reopened.status(f.scope, originalRunId))?.state).toBe('completed');
    expect(await reopened.status(f.scope, laterRunId)).toBeNull();
    await reopened.close();
  });

  it('rolls the live state and evidence back if a restore fails after the state tree is replaced', async () => {
    const f = await fixture('rollback-on-failure');
    const originalRunId = await seedCompletedRun(f, 'bundle-original');
    const created = await createExecutionRecoveryBundle({
      stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4',
    });
    const liveRunId = await seedCompletedRun(f, 'live-before-failed-restore');

    await expect(restoreExecutionRecoveryBundle({
      bundlePath: created.bundlePath,
      stateRoot: f.config.stateRoot,
      logRoot: f.config.logRoot,
      rollbackRoot: path.join(f.root, 'rollback'),
      hooks: { afterStateReplace: async () => { throw new Error('synthetic swap failure'); } },
    })).rejects.toThrow('synthetic swap failure');

    const reopened = new ExecutionService(f.config, f.workspace);
    await reopened.open();
    expect((await reopened.status(f.scope, liveRunId))?.state).toBe('completed');
    expect((await reopened.status(f.scope, originalRunId))?.state).toBe('completed');
    await reopened.close();
  });
});
