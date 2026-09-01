// @vitest-environment node
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createObservatorySidecarServer, resolveObservatoryServerConfig } from './server.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return (server.address() as AddressInfo).port;
}

describe('Memory Observatory sidecar server', () => {
  it('rejects non-loopback binding before startup', () => {
    expect(() => resolveObservatoryServerConfig({ MEMORY_OBSERVATORY_HOST: '0.0.0.0' }, process.cwd()))
      .toThrow('MEMORY_OBSERVATORY_HOST_MUST_BE_LOOPBACK');
  });

  it('serves the shell and never proxies mutation methods', async () => {
    let upstreamCalls = 0;
    const upstream = createServer((request, response) => {
      upstreamCalls += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ path: request.url, method: request.method }));
    });
    const upstreamPort = await listen(upstream);
    const root = await mkdtemp(path.join(os.tmpdir(), 'memory-observatory-sidecar-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const staticRoot = path.join(root, 'dist');
    await mkdir(staticRoot, { recursive: true });
    await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><title>Memory Observatory</title>', 'utf8');
    const sidecar = createObservatorySidecarServer({
      host: '127.0.0.1', port: 0, agentCoreUrl: `http://127.0.0.1:${upstreamPort}`,
      workspaceRoot: root, staticRoot,
    });
    const port = await listen(sidecar);
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    expect(rootResponse.status).toBe(200);
    expect(await rootResponse.text()).toContain('Memory Observatory');
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(await health.json()).toEqual({ path: '/internal/memory-observatory/health', method: 'GET' });
    const before = upstreamCalls;
    const mutation = await fetch(`http://127.0.0.1:${port}/api/snapshot`, { method: 'POST', body: '{}' });
    expect(mutation.status).toBe(405);
    expect(upstreamCalls).toBe(before);
  });
});
