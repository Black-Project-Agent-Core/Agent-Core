import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { boundedHealthProbe } from '../src/http/health.js';

const roots: string[] = [];
const servers: Server[] = [];
async function root() { const value = await mkdtemp(path.join(os.tmpdir(), 'agent-core-http-')); roots.push(value); return value; }
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(value => rm(value, { recursive: true, force: true })));
});

describe('bridge HTTP authentication', () => {
  it('keeps liveness and execution available during idle polling when a diagnostic owner stalls', async () => {
    const dir = await root();
    const collect = vi.fn(async () => new Promise<Record<string, unknown>>(() => {}));
    const memory = boundedHealthProbe(collect, { timeoutMs: 30 });
    const base = await listen(createServer(createHttpHandler({
      keyStore: new FileKeyStore(path.join(dir, 'data')),
      mcpHandler: async () => { throw new Error('must not dispatch'); },
      healthProvider: async () => ({ memory: await memory(), execution: { status: 'available', mode: 'rdc-direct' } }),
    })));
    for (let i = 0; i < 4; i++) {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1_000) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: 'ok', execution: { status: 'available' },
        memory: { status: 'unavailable', issue: 'HEALTH_PROBE_TIMEOUT' } });
    }
    expect(collect).toHaveBeenCalledTimes(1);
  });
  it('serves health without authentication', async () => {
    const dir = await root();
    const base = await listen(createServer(createHttpHandler({
      keyStore: new FileKeyStore(path.join(dir, 'data')),
      mcpHandler: async () => { throw new Error('must not dispatch'); },
    })));
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', service: 'agent-core-rdc-bridge' });
  });

  it('requires a valid bearer key before MCP dispatch', async () => {
    const dir = await root();
    const keyStore = new FileKeyStore(path.join(dir, 'data'));
    const base = await listen(createServer(createHttpHandler({
      keyStore,
      mcpHandler: async () => { throw new Error('must not dispatch'); },
    })));
    const missing = await fetch(`${base}/mcp`, { method: 'POST' });
    expect(missing.status).toBe(401);
    const invalid = await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer agent_core_live_invalid' } });
    expect(invalid.status).toBe(401);
  });
  it('passes the verified principal to MCP dispatch', async () => {
    const dir = await root();
    const keyStore = new FileKeyStore(path.join(dir, 'data'));
    const created = await keyStore.create('chatgpt');
    let received: string | null = null;
    const base = await listen(createServer(createHttpHandler({
      keyStore,
      mcpHandler: async (_request, response, key) => {
        received = key.id;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"ok":true}');
      },
    })));
    const response = await fetch(`${base}/mcp`, {
      method: 'POST', headers: { Authorization: `Bearer ${created.key}` },
    });
    expect(response.status).toBe(200);
    expect(received).toBe(created.metadata.id);
  });

  it('rejects an untrusted browser Origin before dispatch', async () => {
    const dir = await root();
    let dispatched = false;
    const security = new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: false, allowedOrigins: [] });
    const base = await listen(createServer(createHttpHandler({
      keyStore: new FileKeyStore(path.join(dir, 'data')),
      security,
      mcpHandler: async () => { dispatched = true; },
    })));
    const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
    expect(response.status).toBe(403);
    expect(dispatched).toBe(false);
  });
});
