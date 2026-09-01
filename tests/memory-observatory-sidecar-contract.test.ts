import { describe, expect, it } from 'vitest';
import { resolveObservatoryServerConfig, resolveObservatoryProxyTarget } from '../SubProject/Memory-Observatory/server/server.js';

describe('Memory Observatory sidecar safety contract', () => {
  it('accepts only exact 127.0.0.1 binding and a loopback Agent Core upstream', () => {
    expect(resolveObservatoryServerConfig({
      MEMORY_OBSERVATORY_HOST: '127.0.0.1',
      MEMORY_OBSERVATORY_PORT: '3697',
      MEMORY_OBSERVATORY_AGENT_CORE_URL: 'http://127.0.0.1:8765',
      MEMORY_OBSERVATORY_WORKSPACE_ROOT: '/workspaces/Agent-Core',
    })).toMatchObject({
      host: '127.0.0.1',
      port: 3697,
      agentCoreUrl: 'http://127.0.0.1:8765',
      workspaceRoot: '/workspaces/Agent-Core',
    });

    expect(() => resolveObservatoryServerConfig({
      MEMORY_OBSERVATORY_HOST: '0.0.0.0',
      MEMORY_OBSERVATORY_PORT: '3697',
      MEMORY_OBSERVATORY_AGENT_CORE_URL: 'http://127.0.0.1:8765',
      MEMORY_OBSERVATORY_WORKSPACE_ROOT: '/workspaces/Agent-Core',
    })).toThrow('MEMORY_OBSERVATORY_HOST_MUST_BE_LOOPBACK');

    expect(() => resolveObservatoryServerConfig({
      MEMORY_OBSERVATORY_HOST: '127.0.0.1',
      MEMORY_OBSERVATORY_PORT: '3697',
      MEMORY_OBSERVATORY_AGENT_CORE_URL: 'https://public.example',
      MEMORY_OBSERVATORY_WORKSPACE_ROOT: '/workspaces/Agent-Core',
    })).toThrow('MEMORY_OBSERVATORY_AGENT_CORE_URL_MUST_BE_LOOPBACK');
  });

  it('maps only five GET API surfaces and rejects browser mutation methods', () => {
    expect(resolveObservatoryProxyTarget('GET', '/api/health')).toBe('/internal/memory-observatory/health');
    expect(resolveObservatoryProxyTarget('GET', '/api/snapshot')).toBe('/internal/memory-observatory/snapshot');
    expect(resolveObservatoryProxyTarget('GET', '/api/node/memory-1')).toBe('/internal/memory-observatory/node/memory-1');
    expect(resolveObservatoryProxyTarget('GET', '/api/activity?after=12&limit=25')).toBe('/internal/memory-observatory/activity?after=12&limit=25');
    expect(resolveObservatoryProxyTarget('GET', '/api/stream')).toBe('/internal/memory-observatory/stream');
    expect(resolveObservatoryProxyTarget('POST', '/api/snapshot')).toBeNull();
    expect(resolveObservatoryProxyTarget('DELETE', '/api/node/memory-1')).toBeNull();
    expect(resolveObservatoryProxyTarget('GET', '/api/not-real')).toBeNull();
  });
});
