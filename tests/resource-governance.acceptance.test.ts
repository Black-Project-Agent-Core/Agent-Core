import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { ValidatedExecutionNode } from '../src/execution/dag.js';
import { ResourceGovernor } from '../src/execution/resource-governor.js';
import type { ExecutionResultMarker } from '../src/execution/log-store.js';
import type { ExecutionRunHandle } from '../src/execution/runner.js';
import { ExecutionService } from '../src/execution/service.js';
import type { ExecutionRunnerLike } from '../src/execution/scheduler.js';
import type { ExecutionScope } from '../src/execution/types.js';
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';
import type { ResourceSnapshot, ResourceSnapshotProvider } from '../src/runtime/resource-snapshot.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { createRuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];

function snapshot(kind: 'normal' | 'warning' | 'critical', capturedAt: number): ResourceSnapshot {
  return {
    capturedAt,
    cpu: { normalizedLoad: kind === 'critical' ? 1.30 : 0.2, available: true },
    memory: { usedRatio: kind === 'warning' ? 0.90 : 0.4, available: true },
    storage: { freeRatio: 0.5, available: true },
    backlog: { auditQueueRatio: 0.1, telemetryQueueRatio: 0.1, queuedMemorySync: 0, queuedMemorySyncAvailable: true },
    worker: { healthy: true, available: true },
  };
}

class SequenceProvider implements ResourceSnapshotProvider {
  readonly calls: ResourceSnapshot[] = [];
  private index = 0;
  constructor(private readonly values: ResourceSnapshot[]) {}
  async snapshot(): Promise<ResourceSnapshot> {
    const value = this.values[Math.min(this.index, this.values.length - 1)]!;
    this.index += 1;
    this.calls.push(value);
    return structuredClone(value);
  }
}

function marker(runId: string, nodeId: string, attemptId: string, attemptNo: number): ExecutionResultMarker {
  const now = Date.now();
  return {
    version: 1,
    runId,
    nodeId,
    attemptId,
    attemptNo,
    state: 'succeeded',
    startedAt: now - 1,
    finishedAt: now,
    exitCode: 0,
    signal: null,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutSha256: '0'.repeat(64),
    stderrSha256: '0'.repeat(64),
  };
}

class ControlledRunner implements ExecutionRunnerLike {
  readonly starts: Array<{ runId: string; nodeId: string; attemptId: string; attemptNo: number }> = [];
  terminateCalls = 0;
  active = 0;
  maxActive = 0;
  private pending = new Map<string, { resolve(value: ExecutionResultMarker): void }>();

  async start(runId: string, node: ValidatedExecutionNode, attemptId: string, attemptNo: number): Promise<ExecutionRunHandle> {
    this.starts.push({ runId, nodeId: node.id, attemptId, attemptNo });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    let settled = false;
    let resolve!: (value: ExecutionResultMarker) => void;
    const completion = new Promise<ExecutionResultMarker>((res) => { resolve = res; });
    const key = `${runId}/${node.id}/${attemptNo}`;
    const settle = (value: ExecutionResultMarker) => {
      if (settled) return;
      settled = true;
      this.active = Math.max(0, this.active - 1);
      this.pending.delete(key);
      resolve(value);
    };
    this.pending.set(key, { resolve: settle });
    return {
      pid: 20_000 + this.starts.length,
      completion,
      terminate: () => { this.terminateCalls += 1; settle(marker(runId, node.id, attemptId, attemptNo)); },
    };
  }

  complete(runId: string, nodeId: string, attemptNo = 1): void {
    const key = `${runId}/${nodeId}/${attemptNo}`;
    const pending = this.pending.get(key);
    if (!pending) throw new Error(`missing pending ${key}`);
    const started = this.starts.find((item) => item.runId === runId && item.nodeId === nodeId && item.attemptNo === attemptNo)!;
    pending.resolve(marker(runId, nodeId, started.attemptId, attemptNo));
  }

  nodeIds(): string[] { return this.starts.map((item) => item.nodeId); }
}

async function eventually(assertion: () => void | Promise<void>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try { await assertion(); return; }
    catch (error) { last = error; await new Promise((resolve) => setImmediate(resolve)); }
  }
  throw last;
}

async function fixture(sequence?: ResourceSnapshot[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-wave-f-governance-'));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  const config = {
    ...loadConfig({}, root).execution,
    enabled: true,
    maxConcurrency: 4,
    stateRoot: path.join(root, 'runtime', 'execution'),
    logRoot: path.join(root, 'runtime', 'runs'),
  };
  const runner = new ControlledRunner();
  const metrics = new RuntimeMetricRegistry();
  const provider = new SequenceProvider(sequence ?? [
    snapshot('warning', 1),
    snapshot('critical', 2),
    snapshot('critical', 2),
    snapshot('normal', 3),
    snapshot('normal', 3),
  ]);
  const resourceGovernor = new ResourceGovernor({
    operatorMaxConcurrency: config.maxConcurrency,
    config: config.resourceGovernance,
    provider,
    metrics,
  });
  const service = new ExecutionService(config, new WorkspacePolicy([root]), {
    runner,
    metrics,
    resourceGovernor,
  } as any);
  await service.open();
  return { root, work, config, runner, metrics, provider, service, scope: { principalId: 'principal-wave-f', projectId: root } satisfies ExecutionScope };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Wave F scheduler resource governance', () => {
  it('wires one shared production governor into RuntimeServices while preserving the configured operator hard maximum', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-wave-f-runtime-wiring-'));
    roots.push(root);
    const defaults = loadConfig({}, root);
    const runtime = createRuntimeServices(
      [root],
      path.join(root, 'capabilities'),
      undefined,
      { ...defaults.memory, enabled: false },
      {
        ...defaults.execution,
        enabled: true,
        maxConcurrency: 3,
        stateRoot: path.join(root, 'runtime', 'execution'),
        logRoot: path.join(root, 'runtime', 'runs'),
      },
      { ...defaults.github, enabled: false },
    );
    try {
      await runtime.execution.open();
      const decision = await runtime.resourceGovernor.decide(99);
      expect(decision.requestedMaxConcurrency).toBe(3);
      expect(decision.safeConcurrency).toBeGreaterThanOrEqual(1);
      expect(decision.safeConcurrency).toBeLessThanOrEqual(3);
    } finally {
      await runtime.execution.close().catch(() => undefined);
      await runtime.memory.close().catch(() => undefined);
      await runtime.telemetry.close().catch(() => undefined);
    }
  });

  it('stress-transitions pressure across a 20-node run without exceeding operator max or terminating running nodes', async () => {
    const sequence = [
      snapshot('warning', 10),
      snapshot('critical', 11),
      snapshot('critical', 12),
      snapshot('warning', 13),
      ...Array.from({ length: 40 }, (_, index) => snapshot('normal', 20 + index)),
    ];
    const f = await fixture(sequence);
    try {
      const ids = Array.from({ length: 20 }, (_, index) => String.fromCharCode(65 + index));
      const created = await f.service.create(f.scope, {
        objective: 'resource pressure stress transition',
        maxConcurrency: 4,
        nodes: ids.map((id) => ({ id, purpose: id, command: `echo ${id}`, cwd: f.work, resources: { reads: [f.work] } })),
      });
      await f.service.start(f.scope, created.runId);
      expect(f.runner.active).toBe(2);
      expect(f.runner.maxActive).toBeLessThanOrEqual(4);

      for (let iteration = 0; iteration < 60; iteration += 1) {
        let state = await f.service.status(f.scope, created.runId);
        await eventually(async () => {
          state = await f.service.status(f.scope, created.runId);
          const runningNow = state?.nodes.filter((node) => node.state === 'running') ?? [];
          expect(state?.state === 'completed' || runningNow.length > 0).toBe(true);
        });
        if (state?.state === 'completed') break;
        const running = state?.nodes.filter((node) => node.state === 'running').map((node) => node.nodeId) ?? [];
        expect(running.length).toBeLessThanOrEqual(4);
        f.runner.complete(created.runId, running[0]!);
        await eventually(async () => {
          const next = await f.service.status(f.scope, created.runId);
          expect(next?.nodes.find((node) => node.nodeId === running[0])?.state).toBe('succeeded');
        });
        expect(f.runner.active).toBeLessThanOrEqual(4);
        expect(f.runner.maxActive).toBeLessThanOrEqual(4);
        expect(f.runner.terminateCalls).toBe(0);
      }
      expect((await f.service.status(f.scope, created.runId))?.state).toBe('completed');
      expect(f.runner.starts).toHaveLength(20);
      expect(f.runner.maxActive).toBe(4);
      expect(f.runner.terminateCalls).toBe(0);
    } finally {
      await f.service.close();
    }
  });

  it('throttles only new dispatch, preserves running work, persists bounded transitions, and recovers without event spam', async () => {
    const f = await fixture();
    try {
      const created = await f.service.create(f.scope, {
        objective: 'resource transition acceptance',
        maxConcurrency: 4,
        nodes: ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id, purpose: id, command: `echo ${id}`, cwd: f.work, resources: { reads: [f.work] } })),
      });

      await f.service.start(f.scope, created.runId);
      expect(f.runner.nodeIds()).toEqual(['A', 'B']);
      expect(f.runner.terminateCalls).toBe(0);

      f.runner.complete(created.runId, 'A');
      await eventually(async () => {
        const status = await f.service.status(f.scope, created.runId);
        expect(status?.nodes.find((node) => node.nodeId === 'A')?.state).toBe('succeeded');
        expect(status?.nodes.find((node) => node.nodeId === 'B')?.state).toBe('running');
      });
      expect(f.runner.nodeIds()).toEqual(['A', 'B']);
      expect(f.runner.terminateCalls).toBe(0);

      // Repeat the same critical signature. It must not append another throttle transition.
      await f.service.start(f.scope, created.runId);
      expect(f.runner.nodeIds()).toEqual(['A', 'B']);

      f.runner.complete(created.runId, 'B');
      await eventually(() => expect(f.runner.nodeIds()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']));
      expect(f.runner.terminateCalls).toBe(0);

      const events = await f.service.events(f.scope, created.runId, 0, undefined, 1000);
      const throttles = events.filter((event) => event.eventType === ('run.resource_throttled' as any));
      const recoveries = events.filter((event) => event.eventType === ('run.resource_recovered' as any));
      expect(throttles).toHaveLength(2);
      expect(throttles.map((event) => event.payload)).toEqual([
        { requestedMaxConcurrency: 4, safeConcurrency: 2, severity: 'warning', reasonCodes: ['local_memory_pressure'] },
        { requestedMaxConcurrency: 4, safeConcurrency: 1, severity: 'critical', reasonCodes: ['local_cpu_pressure'] },
      ]);
      expect(recoveries).toHaveLength(1);
      expect(recoveries[0]?.payload).toEqual({ requestedMaxConcurrency: 4, safeConcurrency: 4, severity: 'none', reasonCodes: [] });

      expect(f.metrics.metric('execution.resource.safe_concurrency').count).toBeGreaterThanOrEqual(4);
      expect(f.metrics.counter('execution.resource_throttle.count')).toBe(2);
      expect(f.metrics.counter('execution.resource_recovery.count')).toBe(1);

      for (const id of ['C', 'D', 'E', 'F']) f.runner.complete(created.runId, id);
      await eventually(async () => expect((await f.service.status(f.scope, created.runId))?.state).toBe('completed'));
    } finally {
      await f.service.close();
    }
  });
});
