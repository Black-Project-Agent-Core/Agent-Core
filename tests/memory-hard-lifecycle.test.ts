import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { memoryObjectiveHash } from '../src/memory/hard-lifecycle.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const runtimes: RuntimeServices[] = [];

function fixture(label: string, mode: 'disabled' | 'advisory' | 'enforce' = 'advisory') {
  const root = mkdtempSync(path.join(os.tmpdir(), `agent-core-hard-lifecycle-${label}-`));
  const config = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: mode }, root);
  const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
    ...config.memory,
    enabled: true,
    dbPath: path.join(root, 'memory.sqlite'),
  });
  runtimes.push(runtime);
  return { root, runtime, config };
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
});

describe('Phase 6 hard memory lifecycle', () => {
  it('parses a staged hard-lifecycle mode with advisory default and rejects unknown values', () => {
    const root = path.join(os.tmpdir(), 'agent-core-hard-lifecycle-config');
    expect(loadConfig({}, root).memory.hardLifecycleMode).toBe('advisory');
    expect(loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'disabled' }, root).memory.hardLifecycleMode).toBe('disabled');
    expect(loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce' }, root).memory.hardLifecycleMode).toBe('enforce');
    expect(() => loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'sometimes' }, root))
      .toThrow(/AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE/);
  });

  it('persists one exact OPEN lifecycle row atomically with enabled preflight', async () => {
    const { runtime } = fixture('open');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const task = 'Implement Phase 6 lifecycle';
    const context = 'Preserve exact route and project authority';
    const expiresAt = Date.now() + 60_000;
    const preflight = await runtime.memory.preflight({
      scope,
      routeContextId: 'route-hard-lifecycle-a',
      task,
      context,
      expiresAt,
    });

    const lifecycle = await runtime.memory.getLifecycleContext(scope, preflight.contextId);
    expect(lifecycle).toMatchObject({
      contextId: preflight.contextId,
      principalId: scope.principalId,
      projectId: scope.projectId,
      routeContextId: 'route-hard-lifecycle-a',
      objectiveHash: memoryObjectiveHash(task, context),
      postflightState: 'OPEN',
      meaningfulWorkCount: 0,
      expiresAt,
    });
    expect(lifecycle?.continuityTaskId).toBeUndefined();
    expect(lifecycle?.localDurableGeneration).toBeUndefined();
    expect(lifecycle?.localDurableHash).toBeUndefined();

    await expect(runtime.memory.getLifecycleContext(
      { principalId: 'principal-b', projectId: scope.projectId }, preflight.contextId,
    )).resolves.toBeNull();
    await expect(runtime.memory.getLifecycleContext(
      { principalId: scope.principalId, projectId: 'project-b' }, preflight.contextId,
    )).resolves.toBeNull();
  });

  it('binds the authoritative continuity task and validates exact principal/project/context/route/expiry', async () => {
    const { runtime } = fixture('validate', 'enforce');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const preflight = await runtime.memory.preflight({
      scope,
      routeContextId: 'route-hard-lifecycle-b',
      task: 'Execute selected mutation',
      expiresAt: Date.now() + 60_000,
    });

    await runtime.memory.bindLifecycleTask(scope, preflight.contextId, 'continuity-task-a');
    await expect(runtime.memory.validateLifecycleContext({
      scope,
      contextId: preflight.contextId,
      routeContextId: 'route-hard-lifecycle-b',
    })).resolves.toMatchObject({ postflightState: 'OPEN', continuityTaskId: 'continuity-task-a' });

    await expect(runtime.memory.validateLifecycleContext({
      scope,
      contextId: preflight.contextId,
      routeContextId: 'route-wrong',
    })).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(runtime.memory.validateLifecycleContext({
      scope: { principalId: scope.principalId, projectId: 'project-b' },
      contextId: preflight.contextId,
      routeContextId: 'route-hard-lifecycle-b',
    })).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(runtime.memory.validateLifecycleContext({
      scope,
      contextId: preflight.contextId,
      routeContextId: 'route-hard-lifecycle-b',
      now: Date.now() + 120_000,
    })).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
  });

  it('does not let a disabled memory facade fabricate a persisted preflight lifecycle', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-core-hard-lifecycle-disabled-memory-'));
    const config = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce' }, root);
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
      ...config.memory,
      enabled: false,
    });
    runtimes.push(runtime);
    const scope = { principalId: 'principal-disabled', projectId: root };
    const preflight = await runtime.memory.preflight({
      scope,
      routeContextId: 'route-disabled-memory',
      task: 'must not fabricate compliance',
      expiresAt: Date.now() + 60_000,
    });

    await expect(runtime.memory.getLifecycleContext(scope, preflight.contextId)).resolves.toBeNull();
    await expect(runtime.memory.validateLifecycleContext({
      scope,
      contextId: preflight.contextId,
      routeContextId: 'route-disabled-memory',
    })).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
  });
});
