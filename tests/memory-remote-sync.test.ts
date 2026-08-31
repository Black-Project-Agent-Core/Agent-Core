import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { SpawnResult } from '../src/github/process.js';
import { GitHubMemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];

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

afterEach(async () => {
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
