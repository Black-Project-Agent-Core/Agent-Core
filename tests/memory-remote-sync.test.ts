import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { SpawnResult } from '../src/github/process.js';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import {
  createMemoryRemoteEnvelope,
  createMemoryRemoteManifest,
  encodeMemoryRemoteEnvelope,
  encodeMemoryRemoteManifest,
  memoryRemoteGenerationPath,
  memoryRemoteHeadPath,
  memoryRemoteObjectPath,
  memoryRemoteScopeId,
} from '../src/memory/remote-journal.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import { MemoryRemoteSynchronizer } from '../src/memory/remote-sync.js';
import { GitHubMemoryRemoteTransport, type MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryStore } from '../src/memory/store.js';
import type { MemoryScope } from '../src/memory/types.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];
const stores: MemoryStore[] = [];

const ok = (stdout = ''): SpawnResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
  timedOut: false,
  outputTruncated: false,
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function rootFixture(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-memory-remote-transport-${label}-`));
  roots.push(root);
  return root;
}

class FakeNetworkGit {
  readonly calls: Array<{ method: string; input: Record<string, unknown> }> = [];

  async clone(input: { owner: string; repo: string; destination: string }): Promise<SpawnResult> {
    this.calls.push({ method: 'clone', input });
    await mkdir(input.destination, { recursive: true });
    git(input.destination, 'init');
    git(input.destination, 'remote', 'add', 'origin', `https://github.com/${input.owner}/${input.repo}.git`);
    return ok();
  }

  async fetch(input: { cwd: string; remote?: string; refspec?: string }): Promise<SpawnResult> {
    this.calls.push({ method: 'fetch', input });
    return ok();
  }

  async push(input: { cwd: string; remote?: string; refspec?: string; force?: boolean }): Promise<SpawnResult> {
    this.calls.push({ method: 'push', input });
    return ok();
  }

  async remoteGetUrl(input: { cwd: string; remote?: string }): Promise<SpawnResult> {
    this.calls.push({ method: 'remoteGetUrl', input });
    return ok(git(input.cwd, 'remote', 'get-url', input.remote ?? 'origin'));
  }
}

class FakeMemoryRemoteTransport implements MemoryRemoteTransport {
  readonly calls: string[] = [];
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  fetchError: (Error & { code?: string }) | undefined;
  pushError: (Error & { code?: string }) | undefined;
  afterPush: ((transport: FakeMemoryRemoteTransport) => void | Promise<void>) | undefined;
  beforePush: (() => void | Promise<void>) | undefined;
  private commitCounter = 0;

  async ensureCheckout(): Promise<{ cwd: string }> {
    this.calls.push('ensureCheckout');
    return { cwd: '/fake-memory-remote' };
  }

  async fetch(): Promise<void> {
    this.calls.push('fetch');
    if (this.fetchError) throw this.fetchError;
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }

  async currentRemoteHead(): Promise<string | null> {
    this.calls.push('currentRemoteHead');
    return this.fetchedGitHead;
  }

  async readFile(relativePath: string): Promise<Uint8Array | null> {
    this.calls.push(`read:${relativePath}`);
    const value = this.localFiles.get(relativePath);
    return value ? Uint8Array.from(value) : null;
  }

  async writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void> {
    this.calls.push(`write:${files.map((file) => file.relativePath).join(',')}`);
    for (const file of files) this.localFiles.set(file.relativePath, Uint8Array.from(file.bytes));
  }

  async commit(): Promise<string> {
    this.calls.push('commit');
    this.commitCounter += 1;
    this.localCommit = this.commitCounter.toString(16).padStart(40, '0');
    return this.localCommit;
  }

  async pushNonForce(): Promise<void> {
    this.calls.push('pushNonForce');
    await this.beforePush?.();
    if (this.pushError) throw this.pushError;
    this.remoteFiles.clear();
    for (const [key, value] of this.localFiles) this.remoteFiles.set(key, Uint8Array.from(value));
    this.remoteGitHead = this.localCommit;
    await this.afterPush?.(this);
  }

  async resetToRemoteHead(): Promise<void> {
    this.calls.push('resetToRemoteHead');
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
}

async function ledgerFixture(root: string, label: string) {
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  stores.push(store);
  await store.open({ dbPath: path.join(root, `${label}.sqlite`) });
  return { client, store, ledger: new MemoryCognitionLedger(client) };
}

async function generationFixture(
  root: string,
  scope: MemoryScope,
  previousGeneration: string | null = null,
  logicalStateHash = 'a'.repeat(64),
) {
  const keyPath = path.join(root, 'memory-remote-test.key');
  await writeFile(keyPath, Buffer.alloc(32, 0x42));
  const crypto = await MemoryRemoteCrypto.fromKeyFile(keyPath);
  const scopeId = memoryRemoteScopeId(scope);
  const object = createMemoryRemoteEnvelope({
    crypto,
    scopeId,
    kind: 'recovery-checkpoint',
    previousGeneration,
    logicalStateHash,
    plaintextPayload: Buffer.from('{"projection":"checkpoint"}\n'),
    createdAt: 1_788_210_000_000,
  });
  const manifest = createMemoryRemoteManifest({
    scopeId,
    previousGeneration,
    objectIds: [object.objectId],
    logicalStateHash,
    createdAt: 1_788_210_000_001,
  });
  return { object, manifest, scopeId, logicalStateHash };
}

function codedError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map(async (store) => {
    try { await store.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('private memory remote transport over Native GitHub Fabric', () => {
  it('clones by owner/repo, writes only inside the checkout, commits locally, and pushes without force', async () => {
    const root = await rootFixture('core');
    const config = loadConfig({
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: path.join(root, 'secrets', 'memory.key'),
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'runtime', 'memory-remote'),
    }, root).memory.remote;
    const fakeGit = new FakeNetworkGit();
    const transport = new GitHubMemoryRemoteTransport(
      fakeGit as never,
      new WorkspacePolicy([root]),
      config,
    );

    const checkout = await transport.ensureCheckout();
    expect(checkout.cwd).toBe(config.workRoot);
    expect(fakeGit.calls[0]).toEqual({
      method: 'clone',
      input: {
        owner: 'Black-Project-Agent-Core',
        repo: 'Agent-Core-Memory-Remote',
        destination: config.workRoot,
      },
    });
    expect(git(config.workRoot, 'remote', 'get-url', 'origin')).toBe(
      'https://github.com/Black-Project-Agent-Core/Agent-Core-Memory-Remote.git',
    );

    await transport.writeFiles([
      { relativePath: 'format.json', bytes: Buffer.from('{"formatVersion":1}\n') },
      { relativePath: 'scopes/abc/HEAD', bytes: Buffer.from('generation-1\n') },
    ]);
    const commit = await transport.commit('memory remote checkpoint');
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await readFile(path.join(config.workRoot, 'scopes', 'abc', 'HEAD'), 'utf8')).toBe('generation-1\n');

    await transport.pushNonForce();
    expect(fakeGit.calls.filter((call) => call.method === 'push')).toEqual([
      {
        method: 'push',
        input: {
          cwd: config.workRoot,
          remote: 'origin',
          refspec: 'HEAD:refs/heads/memory/main',
          force: false,
        },
      },
    ]);
    expect(JSON.stringify(fakeGit.calls)).not.toContain('memory.key');
    expect(JSON.stringify(fakeGit.calls)).not.toMatch(/token|authorization/i);
  });

  it('fetches through the Fabric, reads the fetched remote head, and resets only the isolated memory checkout', async () => {
    const root = await rootFixture('head');
    const config = loadConfig({
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'octo',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: path.join(root, 'memory.key'),
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
    }, root).memory.remote;
    const fakeGit = new FakeNetworkGit();
    const transport = new GitHubMemoryRemoteTransport(fakeGit as never, new WorkspacePolicy([root]), config);

    await transport.ensureCheckout();
    await transport.writeFiles([{ relativePath: 'format.json', bytes: Buffer.from('one\n') }]);
    const first = await transport.commit('first');
    git(config.workRoot, 'update-ref', 'refs/remotes/origin/main', first);

    await transport.fetch();
    expect(fakeGit.calls.some((call) => call.method === 'fetch' && call.input.refspec === 'refs/heads/main:refs/remotes/origin/main')).toBe(true);
    await expect(transport.currentRemoteHead()).resolves.toBe(first);

    await transport.writeFiles([{ relativePath: 'format.json', bytes: Buffer.from('two\n') }]);
    const second = await transport.commit('second');
    expect(second).not.toBe(first);
    await transport.resetToRemoteHead();
    expect(await readFile(path.join(config.workRoot, 'format.json'), 'utf8')).toBe('one\n');
    expect(git(config.workRoot, 'rev-parse', 'HEAD')).toBe(first);
  });

  it('rejects path traversal and a mismatched existing remote before mutating remote files', async () => {
    const root = await rootFixture('safety');
    const config = loadConfig({
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'octo',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: path.join(root, 'memory.key'),
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
    }, root).memory.remote;
    const fakeGit = new FakeNetworkGit();
    const transport = new GitHubMemoryRemoteTransport(fakeGit as never, new WorkspacePolicy([root]), config);

    await expect(transport.writeFiles([{ relativePath: '../escape.json', bytes: Buffer.from('bad') }]))
      .rejects.toThrow(/relative path/i);

    await mkdir(config.workRoot, { recursive: true });
    git(config.workRoot, 'init');
    git(config.workRoot, 'remote', 'add', 'origin', 'https://github.com/octo/other.git');
    await expect(transport.ensureCheckout()).rejects.toThrow(/remote identity/i);
    await expect(readFile(path.join(root, 'escape.json'), 'utf8')).rejects.toThrow();
  });

  it('runtime composition injects the transport only when Memory Remote is enabled', async () => {
    const root = await rootFixture('runtime');
    const disabled = loadConfig({}, root);
    const disabledRuntime = createRuntimeServices(
      [root], path.join(root, 'capabilities'), undefined,
      disabled.memory, disabled.execution, disabled.github, undefined,
      disabled.observability, 'test', disabled.maintenance,
    );
    expect(disabledRuntime.memory.remoteTransport).toBeUndefined();
    await disabledRuntime.memory.close();

    const enabled = loadConfig({
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'octo',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: path.join(root, 'memory.key'),
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
    }, root);
    const enabledRuntime = createRuntimeServices(
      [root], path.join(root, 'capabilities'), undefined,
      enabled.memory, enabled.execution, enabled.github, undefined,
      enabled.observability, 'test', enabled.maintenance,
    );
    expect(enabledRuntime.memory.remoteTransport).toBeInstanceOf(GitHubMemoryRemoteTransport);
    await enabledRuntime.memory.close();
  });
});


describe('private memory remote write-through synchronization', () => {
  it('marks REMOTE_SYNCED only after non-force push plus exact object/manifest/head readback', async () => {
    const root = await rootFixture('sync-success');
    const scope = { principalId: 'principal-sync', projectId: 'project-sync' };
    const { ledger } = await ledgerFixture(root, 'sync-success');
    const generation = await generationFixture(root, scope);
    const transport = new FakeMemoryRemoteTransport();
    const synchronizer = new MemoryRemoteSynchronizer(transport, ledger, { maxRetryAttempts: 2 });

    transport.beforePush = async () => {
      expect((await ledger.getRemoteState(scope))?.durabilityState).toBe('REMOTE_PENDING');
    };

    const result = await synchronizer.sync({
      scope,
      object: generation.object,
      manifest: generation.manifest,
    });

    expect(result).toEqual({
      state: 'REMOTE_SYNCED',
      generationId: generation.manifest.generationId,
      remoteHead: expect.stringMatching(/^[0-9a-f]{40}$/),
      logicalStateHash: generation.logicalStateHash,
    });
    expect(transport.calls.filter((call) => call === 'fetch')).toHaveLength(2);
    expect(transport.calls.filter((call) => call === 'pushNonForce')).toHaveLength(1);
    expect(Buffer.from(transport.remoteFiles.get(memoryRemoteHeadPath(generation.scopeId))!).toString('utf8'))
      .toBe(`${generation.manifest.generationId}\n`);
    expect(Buffer.from(transport.remoteFiles.get(memoryRemoteObjectPath(generation.scopeId, generation.object.objectId))!))
      .toEqual(encodeMemoryRemoteEnvelope(generation.object));
    expect(Buffer.from(transport.remoteFiles.get(memoryRemoteGenerationPath(generation.scopeId, generation.manifest.generationId))!))
      .toEqual(encodeMemoryRemoteManifest(generation.manifest));
    expect(await ledger.getRemoteState(scope)).toMatchObject({
      durabilityState: 'REMOTE_SYNCED',
      remoteGeneration: generation.manifest.generationId,
      remoteHead: result.remoteHead,
      logicalStateHash: generation.logicalStateHash,
    });
  });

  it('fails as REMOTE_CONFLICT when the remote logical generation already advanced before the write', async () => {
    const root = await rootFixture('sync-predecessor-conflict');
    const scope = { principalId: 'principal-sync', projectId: 'project-sync' };
    const { ledger } = await ledgerFixture(root, 'sync-predecessor-conflict');
    const generation = await generationFixture(root, scope, null, 'b'.repeat(64));
    const transport = new FakeMemoryRemoteTransport();
    transport.remoteGitHead = '1'.repeat(40);
    transport.remoteFiles.set(memoryRemoteHeadPath(generation.scopeId), Buffer.from(`${'c'.repeat(64)}\n`));
    const synchronizer = new MemoryRemoteSynchronizer(transport, ledger);

    await expect(synchronizer.sync({ scope, object: generation.object, manifest: generation.manifest }))
      .rejects.toMatchObject({ code: 'MEMORY_REMOTE_CONFLICT' });
    expect(transport.calls).not.toContain('pushNonForce');
    expect(await ledger.getRemoteState(scope)).toMatchObject({
      durabilityState: 'REMOTE_CONFLICT',
      logicalStateHash: generation.logicalStateHash,
    });
  });

  it('never reports synced when push fails or the remote is unavailable', async () => {
    const root = await rootFixture('sync-network-failure');
    const scope = { principalId: 'principal-sync', projectId: 'project-sync' };
    const { ledger } = await ledgerFixture(root, 'sync-network-failure');
    const generation = await generationFixture(root, scope, null, 'd'.repeat(64));
    const transport = new FakeMemoryRemoteTransport();
    transport.pushError = codedError('GITHUB_GIT_FAILED', 'synthetic push outage');
    const synchronizer = new MemoryRemoteSynchronizer(transport, ledger);

    await expect(synchronizer.sync({ scope, object: generation.object, manifest: generation.manifest }))
      .rejects.toMatchObject({ code: 'MEMORY_REMOTE_UNAVAILABLE' });
    expect((await ledger.getRemoteState(scope))?.durabilityState).toBe('REMOTE_UNAVAILABLE');
    expect((await ledger.getRemoteState(scope))?.durabilityState).not.toBe('REMOTE_SYNCED');

    transport.pushError = undefined;
    transport.fetchError = codedError('GITHUB_GIT_AUTH_FAILED', 'synthetic auth outage');
    await expect(synchronizer.sync({ scope, object: generation.object, manifest: generation.manifest }))
      .rejects.toMatchObject({ code: 'MEMORY_REMOTE_UNAVAILABLE' });
    expect((await ledger.getRemoteState(scope))?.durabilityState).toBe('REMOTE_UNAVAILABLE');
  });

  it('rejects a post-push logical HEAD mismatch and never upgrades the ledger to synced', async () => {
    const root = await rootFixture('sync-head-mismatch');
    const scope = { principalId: 'principal-sync', projectId: 'project-sync' };
    const { ledger } = await ledgerFixture(root, 'sync-head-mismatch');
    const generation = await generationFixture(root, scope, null, 'e'.repeat(64));
    const transport = new FakeMemoryRemoteTransport();
    transport.afterPush = (current) => {
      current.remoteFiles.set(memoryRemoteHeadPath(generation.scopeId), Buffer.from(`${'f'.repeat(64)}\n`));
    };
    const synchronizer = new MemoryRemoteSynchronizer(transport, ledger);

    await expect(synchronizer.sync({ scope, object: generation.object, manifest: generation.manifest }))
      .rejects.toMatchObject({ code: 'MEMORY_REMOTE_CONFLICT' });
    expect((await ledger.getRemoteState(scope))?.durabilityState).toBe('REMOTE_CONFLICT');
    expect((await ledger.getRemoteState(scope))?.durabilityState).not.toBe('REMOTE_SYNCED');
  });

  it('rejects missing or mutated readback objects after push and preserves unsynced truth', async () => {
    const root = await rootFixture('sync-object-missing');
    const scope = { principalId: 'principal-sync', projectId: 'project-sync' };
    const { ledger } = await ledgerFixture(root, 'sync-object-missing');
    const generation = await generationFixture(root, scope, null, '1'.repeat(64));
    const objectPath = memoryRemoteObjectPath(generation.scopeId, generation.object.objectId);
    const transport = new FakeMemoryRemoteTransport();
    transport.afterPush = (current) => { current.remoteFiles.delete(objectPath); };
    const synchronizer = new MemoryRemoteSynchronizer(transport, ledger);

    await expect(synchronizer.sync({ scope, object: generation.object, manifest: generation.manifest }))
      .rejects.toMatchObject({ code: 'MEMORY_REMOTE_READBACK_MISSING' });
    expect((await ledger.getRemoteState(scope))?.durabilityState).toBe('REMOTE_UNAVAILABLE');
    expect((await ledger.getRemoteState(scope))?.durabilityState).not.toBe('REMOTE_SYNCED');
  });
});
