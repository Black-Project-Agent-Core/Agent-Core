import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig, type MemoryHardLifecycleMode } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const loggers: FileAuditLogger[] = [];

async function fixture(
  label: string,
  mode: MemoryHardLifecycleMode = 'enforce',
  remoteRequired = false,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-hard-lifecycle-recovery-${label}-`));
  roots.push(root);
  const dbPath = path.join(root, 'memory.sqlite');
  const keyPath = path.join(root, 'memory-remote.key');
  if (remoteRequired) await writeFile(keyPath, Buffer.alloc(32, 0x6b), { mode: 0o600 });
  const defaults = loadConfig({
    AGENT_CORE_MEMORY_DB_PATH: dbPath,
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: mode,
    ...(remoteRequired ? {
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote-Fixture',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: keyPath,
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
    } : {}),
  }, root);
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), undefined,
    { ...defaults.memory, enabled: true, dbPath },
    { ...defaults.execution, enabled: false },
    defaults.github,
  );
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principal = await keyStore.create(`hard-lifecycle-recovery-${label}`);
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: logger,
    mcpHandler: createMcpHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return {
    root, dbPath, runtime, principal,
    scope: { principalId: principal.metadata.id, projectId: root },
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

async function call(
  baseUrl: string,
  key: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } }),
  });
  const raw = await response.json() as Record<string, any>;
  return { raw, result: JSON.parse(String(raw.result.content[0].text)) as Record<string, any> };
}

async function route(
  f: Awaited<ReturnType<typeof fixture>>,
  task: string,
  continuity: Record<string, unknown> = { objective: task },
) {
  return call(f.baseUrl, f.principal.key, 'capability_route', { task, continuity });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

describe('Phase 6 hard-lifecycle reconciliation', () => {
  it('binds preflight lifecycle to Continuity and blocks a new same-objective context while prior postflight is pending', async () => {
    const f = await fixture('same-objective');
    const first = await route(f, 'Implement the same durable objective');
    expect(first.raw.result.isError).not.toBe(true);
    const lifecycle = await f.runtime.memory.getLifecycleContext(f.scope, first.result.memoryContextId);
    expect(lifecycle).toMatchObject({
      postflightState: 'OPEN',
      continuityTaskId: first.result.continuityTaskId,
    });

    await f.runtime.memory.markLifecycleMeaningfulWork({
      scope: f.scope,
      contextId: first.result.memoryContextId,
      routeContextId: first.result.routeContextId,
      toolName: 'write_file',
      reasonCode: 'explicit_mutation_tool',
    });

    const blocked = await route(f, 'Implement the same durable objective');
    expect(blocked.raw.result.isError).toBe(true);
    expect(blocked.result.error.code).toBe('MEMORY_POSTFLIGHT_REQUIRED');

    const db = new DatabaseSync(f.dbPath, { readOnly: true });
    try {
      expect(Number(db.prepare('SELECT count(*) AS count FROM memory_context_lifecycle').get()!.count)).toBe(1);
    } finally {
      db.close();
    }
  });

  it('blocks an explicit resume of the same pending Continuity task even when the new task wording changes', async () => {
    const f = await fixture('same-task');
    const first = await route(f, 'Build durable feature A');
    await f.runtime.memory.markLifecycleMeaningfulWork({
      scope: f.scope,
      contextId: first.result.memoryContextId,
      routeContextId: first.result.routeContextId,
      toolName: 'edit_file',
      reasonCode: 'explicit_mutation_tool',
    });

    const blocked = await route(f, 'Continue with a differently worded instruction', {
      objective: 'Build durable feature A',
      resumeTaskId: first.result.continuityTaskId,
    });
    expect(blocked.raw.result.isError).toBe(true);
    expect(blocked.result.error.code).toBe('MEMORY_POSTFLIGHT_REQUIRED');
  });

  it('does not globally block unrelated work and advisory mode reports rather than enforces prior pending postflight', async () => {
    const enforced = await fixture('unrelated');
    const first = await route(enforced, 'Objective A');
    await enforced.runtime.memory.markLifecycleMeaningfulWork({
      scope: enforced.scope,
      contextId: first.result.memoryContextId,
      routeContextId: first.result.routeContextId,
      toolName: 'write_file',
      reasonCode: 'explicit_mutation_tool',
    });
    const unrelated = await route(enforced, 'Objective B');
    expect(unrelated.raw.result.isError).not.toBe(true);
    expect(unrelated.result.memoryLifecycle).toMatchObject({ mode: 'enforce', priorPending: false, postflightState: 'OPEN' });

    const advisory = await fixture('advisory', 'advisory');
    const advisoryFirst = await route(advisory, 'Advisory objective');
    await advisory.runtime.memory.markLifecycleMeaningfulWork({
      scope: advisory.scope,
      contextId: advisoryFirst.result.memoryContextId,
      routeContextId: advisoryFirst.result.routeContextId,
      toolName: 'write_file',
      reasonCode: 'explicit_mutation_tool',
    });
    const advisoryNext = await route(advisory, 'Advisory objective');
    expect(advisoryNext.raw.result.isError).not.toBe(true);
    expect(advisoryNext.result.memoryLifecycle).toMatchObject({
      mode: 'advisory', priorPending: true, priorPendingCount: 1,
      advisoryCode: 'MEMORY_POSTFLIGHT_REQUIRED', postflightState: 'OPEN',
    });
  });

  it('keeps local checkpoint truth after remote failure and retries only durability without duplicating postflight decisions', async () => {
    const f = await fixture('remote-retry', 'enforce', true);
    const first = await route(f, 'Remote lifecycle retry objective');
    expect(first.raw.result.isError).not.toBe(true);
    await f.runtime.memory.markLifecycleMeaningfulWork({
      scope: f.scope,
      contextId: first.result.memoryContextId,
      routeContextId: first.result.routeContextId,
      toolName: 'write_file',
      reasonCode: 'explicit_mutation_tool',
    });

    const original = f.runtime.memory.syncDurableBoundary.bind(f.runtime.memory);
    f.runtime.memory.syncDurableBoundary = (async () => {
      throw new Error('MEMORY_REMOTE_UNAVAILABLE: fixture outage');
    }) as any;
    const checkpointArgs = {
      routeContextId: first.result.routeContextId,
      status: 'completed',
      summary: 'Local postflight is factual before remote receipt.',
      projectTerminal: true,
    };
    try {
      const failed = await call(f.baseUrl, f.principal.key, 'task_checkpoint', checkpointArgs);
      expect(failed.raw.result.isError).toBe(true);
      expect(String(failed.result.error.message)).toContain('MEMORY_REMOTE_UNAVAILABLE');
      const failedLifecycle = await f.runtime.memory.getLifecycleContext(f.scope, first.result.memoryContextId);
      expect(failedLifecycle).toMatchObject({ postflightState: 'CLOSED' });
      expect(failedLifecycle).not.toHaveProperty('localDurableGeneration');
      expect(failedLifecycle).not.toHaveProperty('localDurableHash');

      const db = new DatabaseSync(f.dbPath, { readOnly: true });
      let decisionsBeforeRetry: number;
      try {
        decisionsBeforeRetry = Number(db.prepare('SELECT count(*) AS count FROM memory_write_decisions').get()!.count);
        expect(decisionsBeforeRetry).toBe(1);
      } finally {
        db.close();
      }

      f.runtime.memory.syncDurableBoundary = (async (_scope: any, reason: any) => ({
        required: true,
        state: 'REMOTE_SYNCED',
        reason,
        generationId: 'a'.repeat(64),
        remoteHead: 'b'.repeat(40),
        logicalStateHash: 'c'.repeat(64),
      })) as any;
      const retried = await call(f.baseUrl, f.principal.key, 'task_checkpoint', checkpointArgs);
      expect(retried.raw.result.isError).not.toBe(true);
      expect(retried.result.reconciled).toBe(true);
      expect(retried.result.memoryLifecycle).toMatchObject({
        postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED',
      });
      expect(await f.runtime.memory.getLifecycleContext(f.scope, first.result.memoryContextId)).toMatchObject({
        localDurableGeneration: 'a'.repeat(64), localDurableHash: 'c'.repeat(64),
      });

      const verify = new DatabaseSync(f.dbPath, { readOnly: true });
      try {
        expect(Number(verify.prepare('SELECT count(*) AS count FROM memory_write_decisions').get()!.count)).toBe(decisionsBeforeRetry);
        expect(Number(verify.prepare('SELECT count(*) AS count FROM continuity_checkpoints').get()!.count)).toBe(1);
      } finally {
        verify.close();
      }
    } finally {
      f.runtime.memory.syncDurableBoundary = original as any;
    }
  });
});
