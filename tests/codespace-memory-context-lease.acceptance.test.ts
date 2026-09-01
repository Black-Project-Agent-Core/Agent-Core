import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodespaceMemoryLeaseClient } from '../plugin/codespace/src/memory-lease.js';
import { loadConfig } from '../src/config.js';
import { createMemoryContextLeaseHttpHandler } from '../src/http/memory-context-lease.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import { MemoryRemoteHydrator } from '../src/memory/remote-hydrator.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryService } from '../src/memory/service.js';
import type { MemoryScope } from '../src/memory/types.js';
import type { RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const services: MemoryService[] = [];
const servers: Server[] = [];

class SnapshotRemoteTransport implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  fetchError: (Error & { code?: string }) | undefined;
  private commitCounter = 0;

  async ensureCheckout(): Promise<{ cwd: string }> { return { cwd: '/phase7-snapshot-memory-remote' }; }
  async fetch(): Promise<void> {
    if (this.fetchError) throw this.fetchError;
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
  async currentRemoteHead(): Promise<string | null> { return this.fetchedGitHead; }
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

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-phase7-cross-codespace-${label}-`));
  roots.push(root);
  return root;
}

async function startLeaseEndpoint(service: MemoryService): Promise<string> {
  const runtime = { memory: service } as RuntimeServices;
  const handler = createMemoryContextLeaseHttpHandler(runtime);
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/memory-context-lease`;
}

function client(endpoint: string): CodespaceMemoryLeaseClient {
  return new CodespaceMemoryLeaseClient({ mode: 'enforce', endpoint, timeoutMs: 2000 });
}

async function expectPreflightRequired(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(services.splice(0).map((service) => service.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })));
});

describe('Phase 7 cross-Codespace Memory Context Lease acceptance', () => {
  it('survives remote closure/hydration while deliberately invalidating old service-lifetime leases', async () => {
    const rootA = await tempRoot('a');
    const rootB = await tempRoot('b');
    const logicalWorkspaceRoot = '/workspaces/Agent-Core';
    const dbA = path.join(rootA, 'memory.sqlite');
    const dbB = path.join(rootB, 'memory.sqlite');
    const keyPath = path.join(rootA, 'memory-remote.key');
    await writeFile(keyPath, Buffer.alloc(32, 0x71), { mode: 0o600 });
    const transport = new SnapshotRemoteTransport();
    const memoryConfigA = loadConfig({
      AGENT_CORE_MEMORY_DB_PATH: dbA,
      AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce',
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote-Phase7-Fixture',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: keyPath,
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(rootA, 'remote-work'),
    }, rootA).memory;
    const scope: MemoryScope = {
      principalId: 'phase7-cross-codespace-principal',
      projectId: logicalWorkspaceRoot,
    };

    // Codespace A: the same Phase-2 hydrator first confirms that the configured remote has no prior scope state.
    const crypto = await MemoryRemoteCrypto.fromKeyFile(keyPath);
    await expect(new MemoryRemoteHydrator(transport, crypto).hydrate(scope, dbA)).resolves.toEqual({
      state: 'REMOTE_EMPTY_CONFIRMED', remoteHead: null,
    });

    // Then create the same persisted preflight + Continuity binding that capability_route orchestrates,
    // issue an opaque bridge lease, and complete one meaningful bridge mutation.
    const serviceA = new MemoryService(memoryConfigA, undefined, { remoteTransport: transport });
    services.push(serviceA);
    const routeA = 'phase7-route-codespace-a';
    const taskA = 'Cross-Codespace durable mutation objective';
    const contextA = 'Codespace A must close remotely before Codespace B starts.';
    const preflightA = await serviceA.preflight({
      scope,
      routeContextId: routeA,
      task: taskA,
      context: contextA,
      expiresAt: Date.now() + 10 * 60_000,
    });
    const continuityA = await serviceA.beginContinuityTurn(
      scope, routeA, taskA, contextA, { objective: taskA }, Date.now() + 10 * 60_000,
    );
    await serviceA.bindLifecycleTask(scope, preflightA.contextId, continuityA.taskId);
    const leaseA = await serviceA.issueContextLease({ scope, contextId: preflightA.contextId, routeContextId: routeA });
    const endpointA = await startLeaseEndpoint(serviceA);
    const bridgeA = client(endpointA);

    await expect(bridgeA.before({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: leaseA.token, input: {},
    })).resolves.toMatchObject({ required: true, valid: true, mutationClass: 'agent_core_mutation' });
    await expect(bridgeA.after({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: leaseA.token, input: {},
    })).resolves.toMatchObject({ postflightState: 'POSTFLIGHT_PENDING' });
    expect(await serviceA.getLifecycleContext(scope, preflightA.contextId)).toMatchObject({
      postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1,
    });

    // Persist a real terminal Continuity checkpoint before local lifecycle closure and grouped remote durability.
    const checkpointA = await serviceA.checkpointContinuity(scope, continuityA.taskId, continuityA.turnId, {
      routeContextId: routeA,
      status: 'completed',
      summary: 'Codespace A meaningful mutation completed with bounded evidence.',
      evidence: [{ type: 'file', ref: 'phase7-cross-codespace-artifact', result: 'verified' }],
      projectTerminal: true,
    });
    await serviceA.promoteContinuityCheckpoint(scope, continuityA.taskId, checkpointA.checkpointId, {
      routeContextId: routeA,
      status: 'completed',
      summary: 'Codespace A meaningful mutation completed with bounded evidence.',
      evidence: [{ type: 'file', ref: 'phase7-cross-codespace-artifact', result: 'verified' }],
      projectTerminal: true,
    });
    await serviceA.closeContinuityTurn(scope, continuityA.turnId, 'closed');

    // Phase-6 terminal postflight semantics: local CLOSED is inside the encrypted logical projection,
    // and only verified remote readback earns the local durability receipt.
    await serviceA.prepareLifecycleClosure({ scope, contextId: preflightA.contextId, routeContextId: routeA });
    const remote = await serviceA.syncDurableBoundary(scope, 'continuity_terminal');
    expect(remote).toMatchObject({ required: true, state: 'REMOTE_SYNCED', reason: 'continuity_terminal' });
    if (!remote.required) throw new Error('fixture requires remote durability');
    await serviceA.markLifecycleDurableClosure({
      scope,
      contextId: preflightA.contextId,
      generationId: remote.generationId,
      logicalStateHash: remote.logicalStateHash,
    });
    expect(await serviceA.getLifecycleContext(scope, preflightA.contextId)).toMatchObject({
      continuityTaskId: continuityA.taskId,
      postflightState: 'CLOSED',
      localDurableGeneration: remote.generationId,
      localDurableHash: remote.logicalStateHash,
    });
    for (const bytes of transport.remoteFiles.values()) {
      expect(Buffer.from(bytes).includes(Buffer.from(leaseA.token, 'utf8'))).toBe(false);
    }

    // Destroy Codespace A's local service-lifetime lease authority and local memory DB.
    await serviceA.close();
    services.splice(services.indexOf(serviceA), 1);
    await new Promise<void>((resolve) => servers.shift()!.close(() => resolve()));
    await rm(dbA, { force: true });

    // Codespace B: hydrate the exact encrypted lifecycle + Continuity state into a fresh local DB.
    await expect(new MemoryRemoteHydrator(transport, crypto).hydrate(scope, dbB)).resolves.toMatchObject({
      state: 'REMOTE_HYDRATED',
      generationId: remote.generationId,
      logicalStateHash: remote.logicalStateHash,
    });
    const memoryConfigB = {
      ...memoryConfigA,
      dbPath: dbB,
      remote: { ...memoryConfigA.remote, workRoot: path.join(rootB, 'remote-work') },
    };
    const serviceB = new MemoryService(memoryConfigB, undefined, { remoteTransport: transport });
    services.push(serviceB);
    expect(await serviceB.getLifecycleContext(scope, preflightA.contextId)).toMatchObject({
      continuityTaskId: continuityA.taskId, postflightState: 'CLOSED',
    });
    expect(await serviceB.getContinuityTask(scope, continuityA.taskId)).toMatchObject({
      taskId: continuityA.taskId, status: 'completed', lastCheckpointId: checkpointA.checkpointId,
    });
    expect(await serviceB.reconcileLifecycleDurability(scope)).toMatchObject({
      reconciled: 1,
      generationId: remote.generationId,
      logicalStateHash: remote.logicalStateHash,
    });

    const endpointB = await startLeaseEndpoint(serviceB);
    const bridgeB = client(endpointB);

    // The encrypted remote state survives; the old process-local lease authority deliberately does not.
    await expectPreflightRequired(bridgeB.before({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: leaseA.token, input: {},
    }));
    await expectPreflightRequired(bridgeB.before({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, input: {},
    }));

    // A fresh actionable preflight creates a fresh process-local lease and resumes enforce-mode mutation truthfully.
    const routeB = 'phase7-route-codespace-b';
    const preflightB = await serviceB.preflight({
      scope,
      routeContextId: routeB,
      task: 'Fresh Codespace B mutation objective',
      context: 'New service lifetime requires a new opaque lease.',
      expiresAt: Date.now() + 10 * 60_000,
    });
    const leaseB = await serviceB.issueContextLease({ scope, contextId: preflightB.contextId, routeContextId: routeB });
    expect(leaseB.token).not.toBe(leaseA.token);
    await expect(bridgeB.before({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: leaseB.token, input: {},
    })).resolves.toMatchObject({ required: true, valid: true });
    await expect(bridgeB.after({
      toolName: 'write_file', workspaceRoot: logicalWorkspaceRoot, lease: leaseB.token, input: {},
    })).resolves.toMatchObject({ postflightState: 'POSTFLIGHT_PENDING' });
    expect(await serviceB.getLifecycleContext(scope, preflightB.contextId)).toMatchObject({
      postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1,
    });
  });

  it('leaves an existing fresh-Codespace destination unchanged when required remote hydration fails', async () => {
    const root = await tempRoot('hydrate-failure');
    const destination = path.join(root, 'existing.sqlite');
    const original = Buffer.from('EXISTING_UNCERTIFIED_LOCAL_BYTES');
    await writeFile(destination, original);
    const keyPath = path.join(root, 'memory-remote.key');
    await writeFile(keyPath, Buffer.alloc(32, 0x45), { mode: 0o600 });
    const transport = new SnapshotRemoteTransport();
    transport.fetchError = codedError('GITHUB_GIT_AUTH_FAILED');
    const crypto = await MemoryRemoteCrypto.fromKeyFile(keyPath);

    await expect(new MemoryRemoteHydrator(transport, crypto).hydrate({
      principalId: 'phase7-hydration-failure-principal', projectId: '/workspaces/Agent-Core',
    }, destination)).rejects.toMatchObject({ hydrationState: 'REMOTE_AUTH_FAILED' });
    expect(await readFile(destination)).toEqual(original);
  });
});
