import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('private memory remote configuration', () => {
  it('is disabled by default and requires neither a remote identity nor an encryption key', () => {
    const baseDir = path.resolve('/tmp/agent-core-memory-remote-default');
    const config = loadConfig({}, baseDir);

    expect(config.memory.remote).toEqual({
      enabled: false,
      owner: null,
      repo: null,
      branch: 'main',
      keyFile: null,
      workRoot: path.join(baseDir, 'runtime', 'memory', 'remote'),
      syncTimeoutMs: 120_000,
      maxRetryAttempts: 3,
    });
  });

  it('requires an explicit owner, repo, and local key file when enabled', () => {
    const base = {
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: '/tmp/memory-remote.key',
    };

    expect(() => loadConfig({ ...base, AGENT_CORE_MEMORY_REMOTE_OWNER: '' }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_REMOTE_OWNER is required when memory remote is enabled');
    expect(() => loadConfig({ ...base, AGENT_CORE_MEMORY_REMOTE_REPO: '' }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_REMOTE_REPO is required when memory remote is enabled');
    expect(() => loadConfig({ ...base, AGENT_CORE_MEMORY_REMOTE_KEY_FILE: '' }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_REMOTE_KEY_FILE is required when memory remote is enabled');
  });

  it('resolves explicit local paths and bounded synchronization controls without reading the key', () => {
    const baseDir = path.resolve('/tmp/agent-core-memory-remote-explicit');
    const config = loadConfig({
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote',
      AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: './secrets/memory.key',
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: './runtime/private-memory-remote',
      AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS: '45000',
      AGENT_CORE_MEMORY_REMOTE_MAX_RETRIES: '5',
    }, baseDir);

    expect(config.memory.remote).toEqual({
      enabled: true,
      owner: 'Black-Project-Agent-Core',
      repo: 'Agent-Core-Memory-Remote',
      branch: 'memory/main',
      keyFile: path.resolve('./secrets/memory.key'),
      workRoot: path.resolve('./runtime/private-memory-remote'),
      syncTimeoutMs: 45_000,
      maxRetryAttempts: 5,
    });
  });

  it('rejects repository identifiers that could become paths, URLs, or control sequences', () => {
    const valid = {
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'owner',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: '/tmp/memory.key',
    };

    for (const owner of ['../owner', 'owner/name', 'owner\\name', 'owner\nname', '.owner', 'owner.']) {
      expect(() => loadConfig({ ...valid, AGENT_CORE_MEMORY_REMOTE_OWNER: owner }, '/tmp/root'))
        .toThrow('AGENT_CORE_MEMORY_REMOTE_OWNER must be a safe GitHub owner identifier');
    }
    for (const repo of ['../repo', 'org/repo', 'repo\\name', 'repo\nname', '.', '..', 'https://example.test/repo']) {
      expect(() => loadConfig({ ...valid, AGENT_CORE_MEMORY_REMOTE_REPO: repo }, '/tmp/root'))
        .toThrow('AGENT_CORE_MEMORY_REMOTE_REPO must be a safe GitHub repository identifier');
    }
  });

  it('rejects unsafe or unbounded branch names and synchronization controls', () => {
    const valid = {
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'owner',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: '/tmp/memory.key',
    };

    for (const branch of ['../main', 'refs/heads/main', 'main..next', 'main@{1}', 'main//next', 'main.lock', `x${'a'.repeat(200)}`]) {
      expect(() => loadConfig({ ...valid, AGENT_CORE_MEMORY_REMOTE_BRANCH: branch }, '/tmp/root'))
        .toThrow('AGENT_CORE_MEMORY_REMOTE_BRANCH must be a bounded safe branch name');
    }

    expect(() => loadConfig({ ...valid, AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS: '0' }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS must be a positive integer');
    expect(() => loadConfig({ ...valid, AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS: '600001' }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS must be between 1 and 600000');
    expect(() => loadConfig({ ...valid, AGENT_CORE_MEMORY_REMOTE_MAX_RETRIES: '17' }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_REMOTE_MAX_RETRIES must be between 1 and 16');
  });
});
