import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerifiedKey } from '../src/auth/key-types.js';
import { CodespaceMemoryLeaseClient } from '../plugin/codespace/src/memory-lease.js';
import { CodespaceSharedMemoryClient } from '../plugin/codespace/src/shared-memory.js';
import { loadConfig } from '../src/config.js';
import { createCodespaceSharedMemoryHttpHandler } from '../src/http/codespace-memory.js';
import { createMemoryContextLeaseHttpHandler } from '../src/http/memory-context-lease.js';
import { resolvedMemoryProjectScope, resolvedProjectScope } from '../src/mcp/project-scope.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import { MemoryRemoteHydrator } from '../src/memory/remote-hydrator.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryService } from '../src/memory/service.js';
import type { MemoryScope } from '../src/memory/types.js';
import type { RuntimeServices } from '../src/runtime/services.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];
const memories: MemoryService[] = [];
const servers: Server[] = [];

class SnapshotRemoteTransport implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  private commitCounter = 0;

  async ensureCheckout() { return { cwd: '/shared-memory-cross-session-remote' }; }
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

function authKey(id: string): VerifiedKey {
  return {
    id,
    name: 'codespace-session',
    createdAt: '2026-09-01T00:00:00.000Z',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  };
}

async function tempRoot(label: string): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), `agent-core-shared-cross-session-${label}-`));
  roots.push(value);
  return value;
}

async function startAuthority(memory: MemoryService, workspaceRoot: string) {
  const runtime = { memory, workspace: new WorkspacePolicy([workspaceRoot]) } as RuntimeServices;
  const sharedHandler = createCodespaceSharedMemoryHttpHandler(runtime);
  const leaseHandler = createMemoryContextLeaseHttpHandler(runtime);
  const server = createServer((request, response) => {
    if (request.url === '/internal/codespace-memory') {
      void sharedHandler(request, response);
      return;
    }
    if (request.url === '/internal/memory-context-lease') {
      void leaseHandler(request, response);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return {
    shared: new CodespaceSharedMemoryClient({
      endpoint: `http://127.0.0.1:${port}/internal/codespace-memory`, timeoutMs: 2000,
    }),
    lease: new CodespaceMemoryLeaseClient({
      mode: 'enforce', endpoint: `http://127.0.0.1:${port}/internal/memory-context-lease`, timeoutMs: 2000,
    }),
    server,
  };
}

async function closeServer(server: Server): Promise<void> {
  const index = servers.indexOf(server);
  if (index >= 0) servers.splice(index, 1);
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(memories.splice(0).map((memory) => memory.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })));
});

describe('Codespace shared memory cross-session acceptance', () => {
  it('keeps one logical memory/continuity scope across key rotation and fresh Codespace hydration while invalidating old leases', async () => {
    const rootA = await tempRoot('a');
    const rootB = await tempRoot('b');
    const logicalWorkspaceRoot = '/workspaces/Agent-Core';
    const stablePrincipal = 'codespace-shared-principal-v1';
    const scope: MemoryScope = { principalId: stablePrincipal, projectId: logicalWorkspaceRoot };
    const keyFile = path.join(rootA, 'memory-remote.key');
    await writeFile(keyFile, Buffer.alloc(32, 0x6d), { mode: 0o600 });
    const remote = new SnapshotRemoteTransport();
    const baseMemoryConfig = loadConfig({
      AGENT_CORE_ALLOWED_ROOTS: logicalWorkspaceRoot,
      AGENT_CORE_MEMORY_PRINCIPAL_ID: stablePrincipal,
      AGENT_CORE_MEMORY_DB_PATH: path.join(rootA, 'memory.sqlite'),
      AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce',
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote-Shared-Acceptance',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: keyFile,
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(rootA, 'remote-work'),
    }, logicalWorkspaceRoot).memory;

    const runtimeScopeA = {
      memory: { config: baseMemoryConfig },
      workspace: { resolveProjectRoot: () => logicalWorkspaceRoot },
    } as unknown as RuntimeServices;
    const runtimeScopeB = runtimeScopeA;
    expect(resolvedMemoryProjectScope(runtimeScopeA, authKey('auth-key-a')).principalId).toBe(stablePrincipal);
    expect(resolvedMemoryProjectScope(runtimeScopeB, authKey('auth-key-b')).principalId).toBe(stablePrincipal);
    expect(resolvedProjectScope(runtimeScopeA, authKey('auth-key-a')).principalId).toBe('auth-key-a');
    expect(resolvedProjectScope(runtimeScopeB, authKey('auth-key-b')).principalId).toBe('auth-key-b');

    const crypto = await MemoryRemoteCrypto.fromKeyFile(keyFile);
    await expect(new MemoryRemoteHydrator(remote, crypto).hydrate(scope, baseMemoryConfig.dbPath))
      .resolves.toEqual({ state: 'REMOTE_EMPTY_CONFIRMED', remoteHead: null });

    const memoryA = new MemoryService(baseMemoryConfig, undefined, { remoteTransport: remote });
    memories.push(memoryA);
    const seed = await memoryA.commit({
      scope,
      canonicalKey: 'decision.shared.cross-session',
      kind: 'decision',
      value: 'Codespace and Agent Core use one durable memory authority across sessions.',
      sourceType: 'acceptance',
    });
    const authorityA = await startAuthority(memoryA, logicalWorkspaceRoot);
    const openedA = await authorityA.shared.openContext(logicalWorkspaceRoot, {
      task: 'Continue one durable memory authority across Codespace sessions',
      context: 'Recall the shared cross-session decision.',
    }) as any;
    expect(openedA.memorySummary.map((item: any) => item.memoryId)).toContain(seed.memoryId);
    expect(JSON.stringify(openedA)).not.toContain(stablePrincipal);

    await expect(authorityA.lease.before({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: openedA.memoryContextLease, input: {},
    })).resolves.toMatchObject({ required: true, valid: true });
    await expect(authorityA.lease.after({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: openedA.memoryContextLease, input: {},
    })).resolves.toMatchObject({ postflightState: 'POSTFLIGHT_PENDING' });

    const checkpointA = await authorityA.shared.checkpoint(logicalWorkspaceRoot, {
      routeContextId: openedA.routeContextId,
      memoryContextId: openedA.memoryContextId,
      continuityTaskId: openedA.continuityTaskId,
      continuityTurnId: openedA.continuityTurnId,
      status: 'completed',
      summary: 'Codespace A verified shared-memory mutation and durable closure.',
      evidence: [{ type: 'file', ref: 'cross-session-a.txt', result: 'verified' }],
      decisions: [{ key: 'shared-memory-cross-session', value: 'verified', reason: 'Cross-session memory is required.' }],
      projectTerminal: true,
    }) as any;
    expect(checkpointA.remoteDurability).toMatchObject({ required: true, state: 'REMOTE_SYNCED' });
    const generationA = checkpointA.remoteDurability.generationId as string;
    const hashA = checkpointA.remoteDurability.logicalStateHash as string;
    for (const bytes of remote.remoteFiles.values()) {
      expect(Buffer.from(bytes).includes(Buffer.from(openedA.memoryContextLease, 'utf8'))).toBe(false);
      expect(Buffer.from(bytes).includes(Buffer.from(stablePrincipal, 'utf8'))).toBe(false);
    }

    await closeServer(authorityA.server);
    await memoryA.close();
    memories.splice(memories.indexOf(memoryA), 1);
    await rm(baseMemoryConfig.dbPath, { force: true });

    const memoryConfigB = {
      ...baseMemoryConfig,
      dbPath: path.join(rootB, 'memory.sqlite'),
      remote: { ...baseMemoryConfig.remote, workRoot: path.join(rootB, 'remote-work') },
    };
    await expect(new MemoryRemoteHydrator(remote, crypto).hydrate(scope, memoryConfigB.dbPath)).resolves.toMatchObject({
      state: 'REMOTE_HYDRATED', generationId: generationA, logicalStateHash: hashA,
    });
    const memoryB = new MemoryService(memoryConfigB, undefined, { remoteTransport: remote });
    memories.push(memoryB);
    await expect(memoryB.reconcileLifecycleDurability(scope)).resolves.toMatchObject({
      reconciled: 1, generationId: generationA, logicalStateHash: hashA,
    });
    const authorityB = await startAuthority(memoryB, logicalWorkspaceRoot);

    const statusB = await authorityB.shared.status(logicalWorkspaceRoot) as any;
    expect(statusB.continuitySnapshot.recentCompleted.map((item: any) => item.taskId)).toContain(openedA.continuityTaskId);
    expect(JSON.stringify(statusB)).not.toContain(stablePrincipal);

    const proxySearchB = await authorityB.shared.search(logicalWorkspaceRoot, {
      query: 'one durable memory authority across sessions', includeHistory: true, limit: 24,
    }) as any;
    const directSearchB = await memoryB.search({
      scope, query: 'one durable memory authority across sessions', includeHistory: true, limit: 24,
    });
    expect(proxySearchB.hits.map((item: any) => [item.memoryId, item.revisionId]))
      .toEqual(directSearchB.hits.map((item) => [item.memoryId, item.revisionId]));
    expect(proxySearchB.hits.map((item: any) => item.memoryId)).toContain(seed.memoryId);
    expect(JSON.stringify(proxySearchB)).not.toContain(stablePrincipal);

    await expect(authorityB.lease.before({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: openedA.memoryContextLease, input: {},
    })).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });

    const openedB = await authorityB.shared.openContext(logicalWorkspaceRoot, {
      task: 'Continue from hydrated Codespace A memory in Codespace B',
      context: 'Use the same stable logical memory principal after auth-key rotation.',
    }) as any;
    expect(openedB.memoryContextLease).not.toBe(openedA.memoryContextLease);
    expect(openedB.memorySummary.map((item: any) => item.memoryId)).toContain(seed.memoryId);
    await authorityB.lease.before({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: openedB.memoryContextLease, input: {},
    });
    await authorityB.lease.after({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: openedB.memoryContextLease, input: {},
    });
    const checkpointB = await authorityB.shared.checkpoint(logicalWorkspaceRoot, {
      routeContextId: openedB.routeContextId,
      memoryContextId: openedB.memoryContextId,
      continuityTaskId: openedB.continuityTaskId,
      continuityTurnId: openedB.continuityTurnId,
      status: 'completed',
      summary: 'Codespace B recalled A, used a fresh lease, and durably closed its work.',
      evidence: [{ type: 'file', ref: 'cross-session-b.txt', result: 'verified' }],
      projectTerminal: true,
    }) as any;
    expect(checkpointB.remoteDurability).toMatchObject({ required: true, state: 'REMOTE_SYNCED' });
    expect(checkpointB.remoteDurability.generationId).not.toBe(generationA);
  });
});
