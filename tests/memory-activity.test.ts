import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { MemoryActivityEvent, MemoryActivitySink } from '../src/memory/activity.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryService } from '../src/memory/service.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import type { MemoryScope } from '../src/memory/types.js';

const roots: string[] = [];
const services: MemoryService[] = [];

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-memory-activity-${label}-`));
  roots.push(root);
  return root;
}

class RecordingSink implements MemoryActivitySink {
  readonly events: MemoryActivityEvent[] = [];

  emit(event: MemoryActivityEvent): void {
    this.events.push(structuredClone(event));
  }
}

class ThrowingSink implements MemoryActivitySink {
  emit(): void {
    throw new Error('observer unavailable');
  }
}

class FakeMemoryRemoteTransport implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  failFetch = false;
  private commitCounter = 0;

  async ensureCheckout(): Promise<{ cwd: string }> {
    return { cwd: '/fake-memory-activity-remote' };
  }

  async fetch(): Promise<void> {
    if (this.failFetch) throw new Error('NETWORK_UNAVAILABLE');
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }

  async currentRemoteHead(): Promise<string | null> {
    return this.fetchedGitHead;
  }

  async readFile(relativePath: string): Promise<Uint8Array | null> {
    const value = this.localFiles.get(relativePath);
    return value ? Uint8Array.from(value) : null;
  }

  async writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void> {
    for (const file of files) this.localFiles.set(file.relativePath, Uint8Array.from(file.bytes));
  }

  async commit(): Promise<string> {
    this.commitCounter += 1;
    this.localCommit = this.commitCounter.toString(16).padStart(40, '0');
    return this.localCommit;
  }

  async pushNonForce(): Promise<void> {
    this.remoteFiles.clear();
    for (const [key, value] of this.localFiles) this.remoteFiles.set(key, Uint8Array.from(value));
    this.remoteGitHead = this.localCommit;
  }

  async resetToRemoteHead(): Promise<void> {
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
}

const scope: MemoryScope = {
  principalId: 'activity-principal-secret',
  projectId: 'activity-project',
  threadId: 'activity-thread',
  resourceId: 'activity-resource',
};

afterEach(async () => {
  await Promise.all(services.splice(0).map(async (service) => {
    try { await service.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('memory observatory activity sink', () => {
  it('emits bounded safe events for preflight, recall expansion, write decisions, revisions, and conflicts', async () => {
    const root = await tempRoot('lifecycle');
    const config = loadConfig({
      AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite'),
    }, root).memory;
    const sink = new RecordingSink();
    const service = new MemoryService(config, undefined, { activitySink: sink });
    services.push(service);

    const first = await service.commit({
      scope,
      canonicalKey: 'decision.geometry.activity',
      kind: 'decision',
      value: 'Legacy geometry strategy text that must never enter an activity event.',
      sourceType: 'test',
    });
    await service.revise({
      scope,
      memoryId: first.memoryId,
      value: 'Preserve source-native geometry.',
      sourceType: 'test',
    });

    const routeContextId = 'route-memory-activity';
    const preflight = await service.preflight({
      scope,
      routeContextId,
      task: 'Preserve source-native geometry for this task but never leak this task text into activity.',
      expiresAt: Date.now() + 60_000,
    });
    expect(preflight.recalled.some((hit) => hit.memoryId === first.memoryId)).toBe(true);

    await service.rememberMore({
      scope,
      contextId: preflight.contextId,
      seedMemoryIds: [first.memoryId],
      reason: 'revision_history',
    });

    const applied = await service.applyPostflight({
      scope,
      routeContextId,
      contextId: preflight.contextId,
      candidate: {
        canonicalKey: 'decision.observatory.fresh-root',
        kind: 'decision',
        value: 'Durable root value that must never be copied into observer metadata.',
        title: 'Observatory fresh root',
      },
      reasonCodes: ['FRESH_DURABLE_CONTEXT'],
      evidenceRefs: ['test:memory-activity'],
      rootReason: 'Fresh observatory test context',
    });
    expect(applied.decision).toBe('WRITE_NEW_ROOT');
    expect(applied.memoryId).toBeTruthy();

    const conflict = await service.openConflict(
      scope,
      first.memoryId,
      applied.memoryId!,
      'test-conflict',
      { evidence: 'must stay out of activity payload' },
    );
    expect(conflict.conflictId).toBeTruthy();

    const types = sink.events.map((event) => event.type);
    expect(types).toContain('memory.node_created');
    expect(types).toContain('memory.revision_created');
    expect(types).toContain('memory.preflight_started');
    expect(types).toContain('memory.preflight_completed');
    expect(types).toContain('memory.recalled');
    expect(types).toContain('memory.remember_more_started');
    expect(types).toContain('memory.remember_more_expanded');
    expect(types).toContain('memory.write_decision');
    expect(types).toContain('memory.conflict_opened');

    const recalled = sink.events.find((event) => event.type === 'memory.recalled');
    expect(recalled?.memoryIds).toContain(first.memoryId);
    expect(recalled?.contextId).toBe(preflight.contextId);

    const serialized = JSON.stringify(sink.events);
    expect(serialized).not.toContain(scope.principalId);
    expect(serialized).not.toContain('Legacy geometry strategy text');
    expect(serialized).not.toContain('Preserve source-native geometry for this task');
    expect(serialized).not.toContain('Durable root value');
    expect(serialized).not.toContain('must stay out of activity payload');
  });


  it('does not report a node creation when an authoritative commit is deduplicated', async () => {
    const root = await tempRoot('deduplicated-node');
    const config = loadConfig({ AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite') }, root).memory;
    const sink = new RecordingSink();
    const service = new MemoryService(config, undefined, { activitySink: sink });
    services.push(service);

    await service.commit({
      scope,
      canonicalKey: 'decision.activity.deduplicated',
      kind: 'decision',
      value: 'Same durable value.',
      sourceType: 'test',
    });
    sink.events.length = 0;

    const second = await service.commit({
      scope,
      canonicalKey: 'decision.activity.deduplicated',
      kind: 'decision',
      value: 'Same durable value.',
      sourceType: 'test',
    });

    expect(second.deduplicated).toBe(true);
    expect(sink.events.some((event) => event.type === 'memory.node_created')).toBe(false);
  });

  it('isolates observer failures from authoritative memory results', async () => {
    const root = await tempRoot('failure-isolation');
    const config = loadConfig({ AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite') }, root).memory;
    const service = new MemoryService(config, undefined, { activitySink: new ThrowingSink() });
    services.push(service);

    const committed = await service.commit({
      scope,
      canonicalKey: 'decision.observer.failure-isolation',
      kind: 'decision',
      value: 'Observer failure must not fail authoritative memory.',
      sourceType: 'test',
    });
    const preflight = await service.preflight({
      scope,
      routeContextId: 'route-observer-failure',
      task: 'observer failure isolation',
      expiresAt: Date.now() + 60_000,
    });

    expect(committed.memoryId).toBeTruthy();
    expect(preflight.contextId).toBeTruthy();
    expect(await service.getMemory(scope, committed.memoryId)).toMatchObject({ memoryId: committed.memoryId });
  });

  it('emits remote pending/synced and hydration started/failed transitions without leaking remote credentials', async () => {
    const root = await tempRoot('remote');
    const keyPath = path.join(root, 'memory-remote.key');
    await writeFile(keyPath, Buffer.alloc(32, 0x33), { mode: 0o600 });
    const config = loadConfig({
      AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite'),
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: keyPath,
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
    }, root).memory;
    const transport = new FakeMemoryRemoteTransport();
    const sink = new RecordingSink();
    const service = new MemoryService(config, undefined, { remoteTransport: transport, activitySink: sink });
    services.push(service);

    await service.commit({
      scope,
      canonicalKey: 'artifact.remote.activity',
      kind: 'artifact',
      value: 'Remote durable state.',
      sourceType: 'test',
    });
    await expect(service.syncDurableBoundary(scope, 'continuity_checkpoint'))
      .resolves.toMatchObject({ required: true, state: 'REMOTE_SYNCED' });

    expect(sink.events.some((event) => event.type === 'memory.remote_pending' && event.state === 'pending')).toBe(true);
    expect(sink.events.some((event) => event.type === 'memory.remote_synced' && event.state === 'completed')).toBe(true);

    await service.close();
    services.splice(services.indexOf(service), 1);

    const hydrationSink = new RecordingSink();
    const failedTransport = new FakeMemoryRemoteTransport();
    failedTransport.failFetch = true;
    const freshService = new MemoryService(
      { ...config, dbPath: path.join(root, 'fresh.sqlite') },
      undefined,
      { remoteTransport: failedTransport, activitySink: hydrationSink },
    );
    services.push(freshService);

    await expect(freshService.hydrateRemote(scope)).rejects.toThrow();
    expect(hydrationSink.events.map((event) => event.type)).toEqual([
      'memory.hydration_started',
      'memory.hydration_failed',
    ]);
    expect(hydrationSink.events[1]).toMatchObject({ state: 'failed' });

    const serialized = JSON.stringify([...sink.events, ...hydrationSink.events]);
    expect(serialized).not.toContain('Agent-Core-Memory-Remote');
    expect(serialized).not.toContain(keyPath);
    expect(serialized).not.toContain(scope.principalId);
  });

  it('routes safe memory activity through the existing runtime audit logger', async () => {
    const root = await tempRoot('runtime-audit');
    const capabilityDir = path.join(root, 'capabilities');
    await mkdir(capabilityDir, { recursive: true });
    const auditEvents: Array<{ category: string; event: string; data: Record<string, unknown> }> = [];
    const audit = {
      logRouting() {},
      logRuntime(category: string, event: string, data: Record<string, unknown> = {}) {
        auditEvents.push({ category, event, data: structuredClone(data) });
      },
    };
    const baseMemory = loadConfig({}, root).memory;
    const runtime = createRuntimeServices(
      [root],
      capabilityDir,
      audit,
      { ...baseMemory, enabled: true, dbPath: path.join(root, 'runtime-audit.sqlite') },
    );
    services.push(runtime.memory);

    const committed = await runtime.memory.commit({
      scope,
      canonicalKey: 'decision.audit.activity',
      kind: 'decision',
      value: 'Runtime audit must not receive this raw value.',
      sourceType: 'test',
    });
    await runtime.memory.preflight({
      scope,
      routeContextId: 'route-runtime-audit',
      task: 'Runtime audit sentinel task text must not be logged.',
      expiresAt: Date.now() + 60_000,
    });

    expect(auditEvents).toContainEqual(expect.objectContaining({
      category: 'memory',
      event: 'memory.node_created',
      data: expect.objectContaining({ memoryIds: [committed.memoryId], state: 'completed' }),
    }));
    expect(auditEvents.some((entry) => entry.category === 'memory' && entry.event === 'memory.preflight_completed')).toBe(true);
    const serialized = JSON.stringify(auditEvents);
    expect(serialized).not.toContain(scope.principalId);
    expect(serialized).not.toContain('Runtime audit must not receive this raw value');
    expect(serialized).not.toContain('Runtime audit sentinel task text');
  });

});
