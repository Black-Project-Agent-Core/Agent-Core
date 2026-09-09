import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VerifiedKey } from '../src/auth/key-types.js';
import { loadConfig } from '../src/config.js';
import { resolvedMemoryProjectScope, resolvedProjectScope } from '../src/mcp/project-scope.js';
import type { RuntimeServices } from '../src/runtime/services.js';

function key(id: string): VerifiedKey {
  return {
    id,
    name: 'chatgpt',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  };
}

function runtimeFor(memoryConfig: ReturnType<typeof loadConfig>['memory'], projectRoot: string): RuntimeServices {
  return {
    memory: { config: memoryConfig },
    workspace: {
      resolveProjectRoot: () => projectRoot,
    },
  } as unknown as RuntimeServices;
}

describe('stable logical principal for persistent Agent Core state', () => {
  it('uses the configured Memory Remote principal even when authenticated key IDs rotate', () => {
    const projectRoot = path.resolve('/tmp/agent-core-shared-principal');
    const config = loadConfig({
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'owner',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: '/tmp/memory.key',
      AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID: 'principal-stable',
    }, projectRoot);

    expect(config.memory.principalId).toBe('principal-stable');
    expect(resolvedMemoryProjectScope(runtimeFor(config.memory, projectRoot), key('key-a')).principalId)
      .toBe('principal-stable');
    expect(resolvedMemoryProjectScope(runtimeFor(config.memory, projectRoot), key('key-b')).principalId)
      .toBe('principal-stable');
    expect(resolvedProjectScope(runtimeFor(config.memory, projectRoot), key('key-a')).principalId)
      .toBe('key-a');
    expect(resolvedProjectScope(runtimeFor(config.memory, projectRoot), key('key-b')).principalId)
      .toBe('key-b');
  });

  it('prefers an explicit memory principal and keeps legacy key identity when no override exists', () => {
    const projectRoot = path.resolve('/tmp/agent-core-principal-explicit');
    const explicit = loadConfig({
      AGENT_CORE_MEMORY_PRINCIPAL_ID: 'principal-explicit',
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'owner',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: '/tmp/memory.key',
      AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID: 'principal-remote',
    }, projectRoot);
    expect(explicit.memory.principalId).toBe('principal-explicit');
    expect(resolvedMemoryProjectScope(runtimeFor(explicit.memory, projectRoot), key('key-a')).principalId)
      .toBe('principal-explicit');
    expect(resolvedProjectScope(runtimeFor(explicit.memory, projectRoot), key('key-a')).principalId)
      .toBe('key-a');

    const legacy = loadConfig({}, projectRoot);
    expect(legacy.memory.principalId).toBeNull();
    expect(resolvedMemoryProjectScope(runtimeFor(legacy.memory, projectRoot), key('key-legacy')).principalId)
      .toBe('key-legacy');
    expect(resolvedProjectScope(runtimeFor(legacy.memory, projectRoot), key('key-legacy')).principalId)
      .toBe('key-legacy');
  });

  it('rejects empty-control or unbounded principal identifiers', () => {
    expect(() => loadConfig({ AGENT_CORE_MEMORY_PRINCIPAL_ID: 'principal\ninvalid' }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_PRINCIPAL_ID');
    expect(() => loadConfig({ AGENT_CORE_MEMORY_PRINCIPAL_ID: 'x'.repeat(513) }, '/tmp/root'))
      .toThrow('AGENT_CORE_MEMORY_PRINCIPAL_ID');
  });
});
