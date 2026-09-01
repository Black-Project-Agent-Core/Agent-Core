import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { createMemoryObservatoryHttpHandler } from '../src/http/memory-observatory.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { MemoryService } from '../src/memory/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];
const servers: Server[] = [];
const memories: MemoryService[] = [];
const audits: FileAuditLogger[] = [];

async function makeFixture(options: { enabled?: boolean; maxFileBytes?: number; maxRotatedFiles?: number } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-http-observatory-'));
  roots.push(root);
  await mkdir(path.join(root, 'data'), { recursive: true });
  const config = loadConfig({
    AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite'),
    AGENT_CORE_MEMORY_PRINCIPAL_ID: 'observatory-stable-principal-SENTINEL',
    AGENT_CORE_MEMORY_OBSERVATORY_ENABLED: options.enabled === false ? 'false' : 'true',
    AGENT_CORE_MEMORY_OBSERVATORY_MODE: 'shadow',
    AGENT_CORE_MEMORY_OBSERVATORY_MAX_NODES: '50',
    AGENT_CORE_MEMORY_OBSERVATORY_MAX_EDGES: '100',
    AGENT_CORE_MEMORY_OBSERVATORY_RECENT_ACTIVITY_LIMIT: '25',
  }, root);
  const memory = new MemoryService(config.memory);
  memories.push(memory);
  const audit = new FileAuditLogger(root, {
    maxFileBytes: options.maxFileBytes ?? 16 * 1024 * 1024,
    maxRotatedFiles: options.maxRotatedFiles ?? 16,
    retentionMs: 365 * 24 * 60 * 60 * 1000,
  });
  audits.push(audit);
  const workspace = new WorkspacePolicy([root]);
  const security = new HttpSecurityPolicy({ publicBaseUrl: null, trustProxy: true, allowedOrigins: [] });
  const observatoryHandler = createMemoryObservatoryHttpHandler({
    memory,
    workspace,
    auditJournal: audit.journal,
    config: config.memoryObservatory,
  });
  const server = createServer(createHttpHandler({
    keyStore: new FileKeyStore(path.join(root, 'data')),
    auditLogger: audit,
    security,
    observatoryHandler,
    mcpHandler: async (_request, response) => { response.statusCode = 500; response.end(); },
  }));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { root, config, memory, audit, baseUrl };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(memories.splice(0).map(async (memory) => { try { await memory.close(); } catch {} }));
  await Promise.all(audits.splice(0).map(async (audit) => { try { await audit.close(); } catch {} }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function readSseUntil(response: Response, predicate: (text: string) => boolean, timeoutMs = 4_000): Promise<string> {
  if (!response.body) throw new Error('SSE body unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SSE_TIMEOUT')), remaining)),
      ]);
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      if (predicate(text)) return text;
    }
    throw new Error(`SSE predicate not reached: ${text}`);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

describe('exact-loopback memory observatory HTTP feed', () => {
  it('returns 404 observatory_unavailable while disabled', async () => {
    const { baseUrl } = await makeFixture({ enabled: false });
    const response = await fetch(`${baseUrl}/internal/memory-observatory/health`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'observatory_unavailable' });
  });

  it('rejects forwarded/public request identity before the observatory handler', async () => {
    const { baseUrl } = await makeFixture();
    const response = await fetch(`${baseUrl}/internal/memory-observatory/snapshot`, {
      headers: { 'x-forwarded-for': '203.0.113.8', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'public.example' },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'memory_observatory_local_only' });
  });

  it('rejects mutation methods and leaves authoritative memory unchanged', async () => {
    const { root, memory, baseUrl } = await makeFixture();
    const scope = { principalId: 'observatory-stable-principal-SENTINEL', projectId: root };
    await memory.commit({ scope, canonicalKey: 'decision.http.readonly', kind: 'decision', value: 'Read only.', sourceType: 'test' });
    const before = await memory.export(scope, 100);
    const response = await fetch(`${baseUrl}/internal/memory-observatory/snapshot`, { method: 'POST', body: '{}' });
    const after = await memory.export(scope, 100);
    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'observatory_read_only' });
    expect(after).toEqual(before);
  });

  it('returns bounded snapshot/node/activity data from server-owned memory scope without leaking principal or arbitrary audit data', async () => {
    const { root, memory, audit, baseUrl } = await makeFixture();
    const principalId = 'observatory-stable-principal-SENTINEL';
    const scope = { principalId, projectId: root };
    const committed = await memory.commit({ scope, canonicalKey: 'decision.http.snapshot', kind: 'decision', value: 'Observable value.', sourceType: 'test' });
    audit.logRuntime('memory', 'memory.node_created', {
      memoryIds: [committed.memoryId],
      state: 'completed',
      principalId,
      arbitrarySecret: 'SHOULD_NOT_REACH_BROWSER',
    });
    await audit.drain();

    const snapshotResponse = await fetch(`${baseUrl}/internal/memory-observatory/snapshot`);
    expect(snapshotResponse.status).toBe(200);
    const snapshot = await snapshotResponse.json() as any;
    expect(snapshot.auditSequence).toBeGreaterThanOrEqual(1);
    expect(snapshot.nodes.some((node: any) => node.memoryId === committed.memoryId)).toBe(true);

    const nodeResponse = await fetch(`${baseUrl}/internal/memory-observatory/node/${encodeURIComponent(committed.memoryId)}`);
    expect(nodeResponse.status).toBe(200);
    expect((await nodeResponse.json() as any).memoryId).toBe(committed.memoryId);

    const activityResponse = await fetch(`${baseUrl}/internal/memory-observatory/activity?after=0&limit=10`);
    expect(activityResponse.status).toBe(200);
    const activity = await activityResponse.json() as any;
    expect(activity.records).toContainEqual(expect.objectContaining({
      sequence: 1,
      category: 'memory',
      event: 'memory.node_created',
      memoryIds: [committed.memoryId],
      state: 'completed',
    }));
    const serialized = JSON.stringify({ snapshot, activity });
    expect(serialized).not.toContain(principalId);
    expect(serialized).not.toContain('SHOULD_NOT_REACH_BROWSER');
  });

  it('streams persisted records with SSE id equal to AuditJournal sequence', async () => {
    const { audit, baseUrl } = await makeFixture();
    const controller = new AbortController();
    const responsePromise = fetch(`${baseUrl}/internal/memory-observatory/stream`, { signal: controller.signal });
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    audit.logRuntime('memory', 'memory.preflight_started', { state: 'started' });
    audit.logRuntime('memory', 'memory.preflight_completed', { state: 'completed' });
    await audit.drain();

    const text = await readSseUntil(response, (value) => value.includes('id: 1') && value.includes('id: 2'));
    expect(text).toContain('id: 1');
    expect(text).toContain('id: 2');
    expect(text.indexOf('id: 1')).toBeLessThan(text.indexOf('id: 2'));
    controller.abort();
  });

  it('replays from Last-Event-ID then continues live without duplicate sequence ids', async () => {
    const { audit, baseUrl } = await makeFixture();
    audit.logRuntime('memory', 'memory.one', { state: 'completed' });
    audit.logRuntime('memory', 'memory.two', { state: 'completed' });
    await audit.drain();

    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/internal/memory-observatory/stream`, {
      headers: { 'Last-Event-ID': '1' },
      signal: controller.signal,
    });
    audit.logRuntime('memory', 'memory.three', { state: 'completed' });
    await audit.drain();
    const text = await readSseUntil(response, (value) => value.includes('id: 2') && value.includes('id: 3'));
    expect((text.match(/id: 2\n/g) ?? [])).toHaveLength(1);
    expect((text.match(/id: 3\n/g) ?? [])).toHaveLength(1);
    expect(text).not.toContain('id: 1\n');
    controller.abort();
  });

  it('emits stream.gap with snapshot resync requirement when retained history no longer reaches Last-Event-ID', async () => {
    const { audit, baseUrl } = await makeFixture({ maxFileBytes: 620, maxRotatedFiles: 1 });
    for (let index = 0; index < 14; index += 1) {
      audit.logRuntime('memory', `memory.retained.${index}`, { state: 'completed', payload: 'x'.repeat(220) });
    }
    await audit.drain();
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/internal/memory-observatory/stream`, {
      headers: { 'Last-Event-ID': '0' },
      signal: controller.signal,
    });
    const text = await readSseUntil(response, (value) => value.includes('event: stream.gap'));
    expect(text).toContain('event: stream.gap');
    expect(text).toContain('"requiresSnapshotResync":true');
    controller.abort();
  });
});
