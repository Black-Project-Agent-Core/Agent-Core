import { access, appendFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createExecutionRecoveryBundle } from '../src/execution/backup.js';
import { ExecutionService } from '../src/execution/service.js';
import {
  ExecutionRetentionError,
  applyExecutionRetention,
  planExecutionRetention,
} from '../src/execution/retention.js';
import type { ExecutionScope } from '../src/execution/types.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';
import { printCommand, sleepCommand } from './helpers/platform-command.js';

const roots: string[] = [];

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

async function fixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-execution-retention-${label}-`));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  const config = {
    ...loadConfig({}, root).execution,
    logRoot: path.join(root, 'runtime', 'execution', 'runs'),
  };
  return {
    root,
    work,
    config,
    workspace: new WorkspacePolicy([root]),
    scope: { principalId: 'principal-retention', projectId: root } satisfies ExecutionScope,
    planRoot: path.join(root, 'retention-plans'),
    bundleRoot: path.join(root, 'bundles'),
  };
}

async function completedRun(f: Awaited<ReturnType<typeof fixture>>, label: string) {
  const service = new ExecutionService(f.config, f.workspace);
  await service.open();
  const created = await service.create(f.scope, {
    objective: label,
    nodes: [{ id: 'A', purpose: label, command: printCommand(`${label}-stdout\n`, `${label}-stderr\n`), cwd: f.work }],
  });
  await service.start(f.scope, created.runId);
  const deadline = Date.now() + 5_000;
  let status = await service.status(f.scope, created.runId);
  while (status?.state === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    status = await service.status(f.scope, created.runId);
  }
  expect(status?.state).toBe('completed');
  await service.close();
  return { runId: created.runId, paths: service.logs.paths(created.runId, 'A', 1) };
}

async function bundle(f: Awaited<ReturnType<typeof fixture>>) {
  return createExecutionRecoveryBundle({
    stateRoot: f.config.stateRoot,
    logRoot: f.config.logRoot,
    destinationRoot: f.bundleRoot,
    sourceVersion: '0.5.4',
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('backup-gated execution raw-log retention', () => {
  it('plans only raw logs backed by a terminal result marker and excludes an active attempt', async () => {
    const f = await fixture('terminal-only');
    const done = await completedRun(f, 'done');

    const live = new ExecutionService(f.config, f.workspace);
    await live.open();
    const active = await live.create(f.scope, {
      objective: 'active',
      nodes: [{ id: 'A', purpose: 'active', command: sleepCommand(30_000, 'active-output\n'), cwd: f.work }],
    });
    await live.start(f.scope, active.runId);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const planned = await planExecutionRetention({
      logRoot: f.config.logRoot,
      planRoot: f.planRoot,
      olderThanMs: 0,
      now: Date.now() + 1000,
    });
    expect(planned.plan.dryRun).toBe(true);
    expect(planned.plan.candidates.map((item) => item.path)).toEqual(expect.arrayContaining([
      path.relative(f.config.logRoot, done.paths.stdoutPath).split(path.sep).join('/'),
      path.relative(f.config.logRoot, done.paths.stderrPath).split(path.sep).join('/'),
    ]));
    expect(planned.plan.candidates.some((item) => item.path.includes(active.runId))).toBe(false);
    expect(await exists(done.paths.resultPath)).toBe(true);
    await live.close();
  });

  it('records bounded retention duration for plan and apply when a metric sink is supplied', async () => {
    const f = await fixture('metrics');
    await completedRun(f, 'metrics');
    const metrics = new RuntimeMetricRegistry();
    const planned = await planExecutionRetention({ logRoot: f.config.logRoot, planRoot: f.planRoot, olderThanMs: 0, now: Date.now() + 1000, metrics });
    const verifiedBundle = await createExecutionRecoveryBundle({ stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, destinationRoot: f.bundleRoot, sourceVersion: '0.5.4' });
    await applyExecutionRetention({ planPath: planned.planPath, bundlePath: verifiedBundle.bundlePath, stateRoot: f.config.stateRoot, logRoot: f.config.logRoot, metrics });
    expect(metrics.metric('execution.retention.duration_ms').count).toBe(2);
  });

  it('rejects apply when the recovery bundle predates the immutable retention plan', async () => {
    const f = await fixture('old-backup');
    await completedRun(f, 'old-backup');
    const oldBundle = await bundle(f);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const planned = await planExecutionRetention({ logRoot: f.config.logRoot, planRoot: f.planRoot, olderThanMs: 0, now: Date.now() + 1000 });
    await expect(applyExecutionRetention({
      planPath: planned.planPath,
      bundlePath: oldBundle.bundlePath,
      stateRoot: f.config.stateRoot,
      logRoot: f.config.logRoot,
    })).rejects.toMatchObject<Partial<ExecutionRetentionError>>({ code: 'EXECUTION_RETENTION_BACKUP_TOO_OLD' });
  });

  it('deletes exactly the unchanged dry-run candidates, preserves result markers, and writes one audit record per candidate', async () => {
    const f = await fixture('apply');
    const done = await completedRun(f, 'apply');
    const planned = await planExecutionRetention({ logRoot: f.config.logRoot, planRoot: f.planRoot, olderThanMs: 0, now: Date.now() + 1000 });
    const verifiedBundle = await bundle(f);
    const applied = await applyExecutionRetention({
      planPath: planned.planPath,
      bundlePath: verifiedBundle.bundlePath,
      stateRoot: f.config.stateRoot,
      logRoot: f.config.logRoot,
    });

    expect(applied.deleted.map((item) => item.path).sort()).toEqual(planned.plan.candidates.map((item) => item.path).sort());
    expect(applied.skipped).toEqual([]);
    expect(await exists(done.paths.stdoutPath)).toBe(false);
    expect(await exists(done.paths.stderrPath)).toBe(false);
    expect(await exists(done.paths.resultPath)).toBe(true);
    const auditLines = (await readFile(applied.auditPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(auditLines).toHaveLength(planned.plan.candidates.length);
    expect(auditLines.every((line) => line.planId === planned.plan.planId && line.action === 'deleted')).toBe(true);
  });

  it('skips a candidate that changed after planning instead of expanding/replacing the deletion set', async () => {
    const f = await fixture('changed');
    const done = await completedRun(f, 'changed');
    const planned = await planExecutionRetention({ logRoot: f.config.logRoot, planRoot: f.planRoot, olderThanMs: 0, now: Date.now() + 1000 });
    await appendFile(done.paths.stdoutPath, 'changed-after-plan');
    const verifiedBundle = await bundle(f);
    const applied = await applyExecutionRetention({
      planPath: planned.planPath,
      bundlePath: verifiedBundle.bundlePath,
      stateRoot: f.config.stateRoot,
      logRoot: f.config.logRoot,
    });

    const stdoutRelative = path.relative(f.config.logRoot, done.paths.stdoutPath).split(path.sep).join('/');
    expect(applied.skipped).toContainEqual({ path: stdoutRelative, reason: 'candidate_changed' });
    expect(await exists(done.paths.stdoutPath)).toBe(true);
    expect(applied.deleted.some((item) => item.path === stdoutRelative)).toBe(false);
    expect([...applied.deleted, ...applied.skipped].map((item) => item.path).sort()).toEqual(planned.plan.candidates.map((item) => item.path).sort());
  });
});
