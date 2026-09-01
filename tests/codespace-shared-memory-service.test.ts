import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { CodespaceSharedMemoryService } from '../src/memory/codespace-shared-memory.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryService } from '../src/memory/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];
const memories: MemoryService[] = [];

class FakeRemoteTransport implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  private commitCounter = 0;
  async ensureCheckout() { return { cwd: '/fake-shared-memory-remote' }; }
  async fetch() {
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
  async currentRemoteHead() { return this.fetchedGitHead; }
  async readFile(relativePath: string) {
    const value = this.localFiles.get(relativePath);
    return value ? Uint8Array.from(value) : null;
  }
  async writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]) {
    for (const file of files) this.localFiles.set(file.relativePath, Uint8Array.from(file.bytes));
  }
  async commit() {
    this.commitCounter += 1;
    this.localCommit = this.commitCounter.toString(16).padStart(40, '0');
    return this.localCommit;
  }
  async pushNonForce() {
    this.remoteFiles.clear();
    for (const [key, value] of this.localFiles) this.remoteFiles.set(key, Uint8Array.from(value));
    this.remoteGitHead = this.localCommit;
  }
  async resetToRemoteHead() {
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
}

async function fixture(label: string, options: { mode?: 'disabled' | 'advisory' | 'enforce'; remote?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-shared-memory-${label}-`));
  roots.push(root);
  const remote = options.remote ?? false;
  const keyFile = path.join(root, 'memory.key');
  if (remote) await writeFile(keyFile, Buffer.alloc(32, 0x62), { mode: 0o600 });
  const config = loadConfig({
    AGENT_CORE_ALLOWED_ROOTS: root,
    AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite'),
    AGENT_CORE_MEMORY_PRINCIPAL_ID: 'principal-stable',
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: options.mode ?? 'enforce',
    ...(remote ? {
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'owner',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: keyFile,
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
    } : {}),
  }, root).memory;
  const transport = new FakeRemoteTransport();
  const memory = new MemoryService(config, undefined, remote ? { remoteTransport: transport } : {});
  memories.push(memory);
  const service = new CodespaceSharedMemoryService(memory, new WorkspacePolicy([root]));
  return { root, memory, service, transport };
}

afterEach(async () => {
  await Promise.all(memories.splice(0).map((memory) => memory.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Codespace shared memory service', () => {
  it('opens a real recalled context, issues an opaque lease, and reaches CLOSED + NOT_REQUIRED after terminal checkpoint', async () => {
    const f = await fixture('local');
    const seed = await f.memory.commit({
      scope: { principalId: 'principal-stable', projectId: f.root },
      canonicalKey: 'decision.shared.memory.seed',
      kind: 'decision',
      value: 'Use the verified shared memory workflow for Codespace work.',
      sourceType: 'test',
    });

    const opened = await f.service.openContext({
      workspaceRoot: f.root,
      task: 'Continue the verified shared memory workflow',
      context: 'Recall the prior Codespace decision.',
    });
    expect(opened.memorySummary.map((item) => item.memoryId)).toContain(seed.memoryId);
    expect(opened.memoryContextLease).toMatch(/^mcl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(opened.memoryContextLease).not.toContain('principal-stable');
    expect(opened.continuityTaskId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(opened.continuityTurnId).toMatch(/^[0-9a-f-]{36}$/i);

    await f.memory.completeContextLeaseMeaningfulWork({
      lease: opened.memoryContextLease!,
      workspaceRoot: f.root,
      toolName: 'write_file',
      reasonCode: 'explicit_mutation_tool',
    });
    expect(await f.memory.getLifecycleContext({ principalId: 'principal-stable', projectId: f.root }, opened.memoryContextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1 });

    const checkpoint = await f.service.checkpoint({
      workspaceRoot: f.root,
      routeContextId: opened.routeContextId,
      memoryContextId: opened.memoryContextId,
      continuityTaskId: opened.continuityTaskId,
      continuityTurnId: opened.continuityTurnId,
      status: 'completed',
      summary: 'Shared-memory mutation verified and complete.',
      evidence: [{ type: 'file', ref: 'artifact/shared-memory.txt', result: 'verified' }],
      decisions: [{ key: 'shared-memory-mode', value: 'verified', reason: 'The mutation and checkpoint were verified.' }],
      projectTerminal: true,
    });
    expect(checkpoint.remoteDurability).toEqual({ required: false, state: 'NOT_REQUIRED', reason: 'continuity_terminal' });
    expect(checkpoint.memoryLifecycle).toMatchObject({ postflightState: 'CLOSED', durabilityState: 'NOT_REQUIRED' });
    expect((await f.memory.getContinuityTask({ principalId: 'principal-stable', projectId: f.root }, opened.continuityTaskId))?.status)
      .toBe('completed');
  });

  it('crosses verified remote durability and records the exact local receipt', async () => {
    const f = await fixture('remote', { remote: true });
    const opened = await f.service.openContext({ workspaceRoot: f.root, task: 'Durably close shared memory' });
    await f.memory.completeContextLeaseMeaningfulWork({
      lease: opened.memoryContextLease!, workspaceRoot: f.root, toolName: 'write_file', reasonCode: 'explicit_mutation_tool',
    });
    const checkpoint = await f.service.checkpoint({
      workspaceRoot: f.root,
      routeContextId: opened.routeContextId,
      memoryContextId: opened.memoryContextId,
      continuityTaskId: opened.continuityTaskId,
      continuityTurnId: opened.continuityTurnId,
      status: 'completed',
      summary: 'Remote shared-memory closure verified.',
      evidence: [{ type: 'hash', ref: 'sha256:shared-memory', result: 'verified' }],
      projectTerminal: true,
    });
    expect(checkpoint.remoteDurability).toMatchObject({ required: true, state: 'REMOTE_SYNCED' });
    const lifecycle = await f.memory.getLifecycleContext(
      { principalId: 'principal-stable', projectId: f.root }, opened.memoryContextId,
    );
    expect(lifecycle).toMatchObject({
      postflightState: 'CLOSED',
      localDurableGeneration: (checkpoint.remoteDurability as any).generationId,
      localDurableHash: (checkpoint.remoteDurability as any).logicalStateHash,
    });
    for (const bytes of f.transport.remoteFiles.values()) {
      expect(Buffer.from(bytes).includes(Buffer.from(opened.memoryContextLease!, 'utf8'))).toBe(false);
    }
  });

  it('blocks a second same-objective context in enforce mode while prior meaningful work is pending', async () => {
    const f = await fixture('pending', { mode: 'enforce' });
    const first = await f.service.openContext({ workspaceRoot: f.root, task: 'One pending objective' });
    await f.memory.completeContextLeaseMeaningfulWork({
      lease: first.memoryContextLease!, workspaceRoot: f.root, toolName: 'write_file', reasonCode: 'explicit_mutation_tool',
    });
    await expect(f.service.openContext({ workspaceRoot: f.root, task: 'One pending objective' }))
      .rejects.toMatchObject({ code: 'MEMORY_POSTFLIGHT_REQUIRED' });
  });

  it('surfaces prior pending work as advisory without blocking when lifecycle mode is advisory', async () => {
    const f = await fixture('pending-advisory', { mode: 'advisory' });
    const first = await f.service.openContext({ workspaceRoot: f.root, task: 'Advisory pending objective' });
    await f.memory.completeContextLeaseMeaningfulWork({
      lease: first.memoryContextLease!, workspaceRoot: f.root, toolName: 'write_file', reasonCode: 'explicit_mutation_tool',
    });
    const second = await f.service.openContext({ workspaceRoot: f.root, task: 'Advisory pending objective' });
    expect(second.memoryLifecycle).toMatchObject({
      mode: 'advisory', priorPending: true, priorPendingCount: 1, advisoryCode: 'MEMORY_POSTFLIGHT_REQUIRED',
    });
  });

  it('requires an explicit stable logical principal for the shared Codespace authority', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-shared-memory-no-principal-'));
    roots.push(root);
    const config = loadConfig({ AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite') }, root).memory;
    const memory = new MemoryService(config);
    memories.push(memory);
    const service = new CodespaceSharedMemoryService(memory, new WorkspacePolicy([root]));
    await expect(service.status(root)).rejects.toMatchObject({ code: 'CODESPACE_SHARED_MEMORY_PRINCIPAL_REQUIRED' });
  });
});
