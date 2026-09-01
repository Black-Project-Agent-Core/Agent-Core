import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CodespaceError } from '../src/errors.js';
import { CodespaceSharedMemoryClient, parseSharedMemoryRuntimeConfig } from '../src/shared-memory.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('Codespace shared-memory thin client', () => {
  it('accepts only the exact Agent Core loopback shared-memory endpoint', () => {
    expect(parseSharedMemoryRuntimeConfig({
      CODESPACE_AGENT_CORE_SHARED_MEMORY_URL: 'http://127.0.0.1:8765/internal/codespace-memory',
    })).toMatchObject({ endpoint: 'http://127.0.0.1:8765/internal/codespace-memory', timeoutMs: 2000 });

    for (const endpoint of [
      'https://127.0.0.1:8765/internal/codespace-memory',
      'http://localhost:8765/internal/codespace-memory',
      'http://127.0.0.1:8765/mcp',
      'http://127.0.0.1:8765/internal/codespace-memory?x=1',
      'http://user@127.0.0.1:8765/internal/codespace-memory',
    ]) {
      expect(() => parseSharedMemoryRuntimeConfig({ CODESPACE_AGENT_CORE_SHARED_MEMORY_URL: endpoint }))
        .toThrowError(CodespaceError);
    }
  });

  it('posts only bounded action payload and returns the bounded Agent Core result', async () => {
    const calls: unknown[] = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      calls.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true, result: { memorySnapshotHash: 'abc', hits: [] } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/codespace-memory`;
    const client = new CodespaceSharedMemoryClient({ endpoint, timeoutMs: 2000 });

    await expect(client.search('/workspaces/Agent-Core', { query: 'shared memory', limit: 5 }))
      .resolves.toEqual({ memorySnapshotHash: 'abc', hits: [] });
    expect(calls).toEqual([{ action: 'search', workspaceRoot: '/workspaces/Agent-Core', query: 'shared memory', limit: 5 }]);
  });

  it('fails with bounded local errors when authority is unavailable, malformed, or oversized', async () => {
    const missing = new CodespaceSharedMemoryClient({ endpoint: null, timeoutMs: 100 });
    await expect(missing.status('/workspaces/Agent-Core')).rejects.toMatchObject({ code: 'SHARED_MEMORY_UNAVAILABLE' });

    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true, result: { payload: 'x'.repeat(600_000) } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/codespace-memory`;
    const client = new CodespaceSharedMemoryClient({ endpoint, timeoutMs: 2000 });
    await expect(client.status('/workspaces/Agent-Core')).rejects.toMatchObject({ code: 'SHARED_MEMORY_RESPONSE_INVALID' });
  });
});
