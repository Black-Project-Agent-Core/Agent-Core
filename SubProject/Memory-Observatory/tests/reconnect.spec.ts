import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createObservatorySidecarServer } from '../server/server.js';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return (server.address() as AddressInfo).port;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

function snapshot(version: 1 | 2) {
  const baseNode = {
    memoryId: 'a1', title: 'A1 Current', canonicalKey: 'a1', kind: 'decision', state: 'active',
    revisionNo: 1, valuePreview: 'A1 current.', importance: 1, pinned: false, createdAt: 1, updatedAt: 1,
  };
  const nodes = version === 1 ? [baseNode] : [baseNode, {
    ...baseNode, memoryId: 'a2', title: 'A2 Recovered', canonicalKey: 'a2', valuePreview: 'Recovered after gap.', createdAt: 2, updatedAt: 2,
  }];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    auditSequence: version === 1 ? 3 : 4,
    project: { projectId: '/tmp/reconnect', workspaceLabel: 'reconnect' },
    status: { memoryHealthy: true, lifecycleMode: 'advisory', remoteEnabled: false, remoteDurabilityState: 'LOCAL_COMMITTED' },
    nodes,
    edges: [], conflicts: [], timeline: [],
    continuity: { active: [], completed: [], blocked: [], deferred: [], unfinished: [], frontier: [], interruptedTurnIds: [] },
    truncated: { nodes: false, edges: false, timeline: false },
  };
}

function activity(sequence: number, event: string) {
  return { sequence, timestamp: new Date().toISOString(), category: 'memory', event, state: 'completed', memoryIds: ['a1'] };
}

test('browser recovers retained activity after SSE drop and resyncs the authoritative graph on an explicit history gap', async ({ page }) => {
  test.setTimeout(20_000);
  let snapshotVersion: 1 | 2 = 1;
  let streamConnections = 0;
  const activityRequests: string[] = [];
  const upstream = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/internal/memory-observatory/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', mode: 'shadow', auditSequence: 3 }));
      return;
    }
    if (url.pathname === '/internal/memory-observatory/snapshot') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(snapshot(snapshotVersion)));
      return;
    }
    if (url.pathname === '/internal/memory-observatory/activity') {
      activityRequests.push(url.search);
      const after = Number(url.searchParams.get('after') ?? '0');
      const records = after < 1
        ? [activity(1, 'memory.recalled')]
        : after < 3
          ? [activity(3, 'memory.revision_created')]
          : [];
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ records, earliestSequence: 1, latestSequence: Math.max(after, ...records.map((record) => record.sequence), 3) }));
      return;
    }
    if (url.pathname === '/internal/memory-observatory/stream') {
      streamConnections += 1;
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      if (streamConnections === 1) {
        response.write('retry: 100\n');
        response.write('id: 2\n');
        response.write('event: activity\n');
        response.write(`data: ${JSON.stringify(activity(2, 'memory.remember_more_expanded'))}\n\n`);
        setTimeout(() => response.end(), 30);
        return;
      }
      snapshotVersion = 2;
      response.write('event: stream.gap\n');
      response.write('data: {"code":"AUDIT_HISTORY_GAP","requiresSnapshotResync":true}\n\n');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const upstreamPort = await listen(upstream);
  const sidecar = createObservatorySidecarServer({
    host: '127.0.0.1',
    port: 0,
    agentCoreUrl: `http://127.0.0.1:${upstreamPort}`,
    workspaceRoot: '/tmp/reconnect',
    staticRoot,
  });
  const sidecarPort = await listen(sidecar);

  try {
    await page.goto(`http://127.0.0.1:${sidecarPort}/`);
    await expect(page.getByText('A1 Current', { exact: true })).toBeVisible();
    await expect(page.getByText('memory.recalled', { exact: true })).toBeVisible();
    await expect(page.getByText('memory.remember_more_expanded', { exact: true })).toBeVisible();
    await expect(page.getByText('memory.revision_created', { exact: true })).toBeVisible();
    await expect(page.getByText('HISTORY GAP — GRAPH RESYNCED', { exact: true })).toBeVisible();
    await expect(page.getByText('A2 Recovered', { exact: true })).toBeVisible();
    expect(streamConnections).toBeGreaterThanOrEqual(2);
    expect(activityRequests.length).toBeGreaterThanOrEqual(2);
    expect(await page.getByLabel('Activity records').locator('[data-sequence="2"]').count()).toBe(1);
    expect(await page.getByLabel('Activity records').locator('[data-sequence="3"]').count()).toBe(1);
  } finally {
    await page.goto('about:blank').catch(() => undefined);
    await closeServer(sidecar).catch(() => undefined);
    await closeServer(upstream).catch(() => undefined);
  }
});
