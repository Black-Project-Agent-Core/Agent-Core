import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { createCodespaceSharedMemoryHttpHandler } from '../src/http/codespace-memory.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const runtimes: RuntimeServices[] = [];
const servers: Server[] = [];
const loggers: FileAuditLogger[] = [];

async function fixture(label: string, options: { principal?: boolean; trustProxy?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-http-shared-memory-${label}-`));
  roots.push(root);
  const config = loadConfig({
    AGENT_CORE_MEMORY_PRINCIPAL_ID: options.principal === false ? undefined : 'principal-stable',
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce',
    AGENT_CORE_TRUST_PROXY: options.trustProxy === false ? 'false' : 'true',
  }, root);
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), undefined,
    { ...config.memory, enabled: true, dbPath: path.join(root, 'memory.sqlite') },
    { ...config.execution, enabled: false },
    config.github,
  );
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: logger,
    security: new HttpSecurityPolicy(config.httpSecurity),
    mcpHandler: async (_request, response) => { response.writeHead(501).end(); },
    codespaceMemoryHandler: createCodespaceSharedMemoryHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { root, runtime, logger, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function post(baseUrl: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/internal/codespace-memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : {}, text };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })));
});

describe('loopback Codespace shared-memory endpoint', () => {
  it('rejects proxied/public identity before shared-memory body processing', async () => {
    const f = await fixture('proxy');
    const marker = 'must-not-reflect-principal-or-body';
    const result = await post(f.baseUrl, { action: 'open_context', workspaceRoot: f.root, task: marker }, {
      'x-forwarded-for': '203.0.113.70',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'agent-core.example.test',
    });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'codespace_memory_local_only' });
    expect(result.text).not.toContain(marker);
  });

  it('bounds request bodies and rejects unknown actions without reflecting input', async () => {
    const f = await fixture('bounds');
    const huge = JSON.stringify({ action: 'search', workspaceRoot: f.root, query: 'x'.repeat(300_000) });
    const oversized = await post(f.baseUrl, huge);
    expect(oversized.status).toBe(413);
    expect(oversized.body).toEqual({ error: 'CODESPACE_SHARED_MEMORY_BODY_TOO_LARGE' });

    const unknown = await post(f.baseUrl, { action: 'raw_memory_commit', workspaceRoot: f.root, value: 'secret' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe('CODESPACE_SHARED_MEMORY_ACTION_INVALID');
    expect(unknown.text).not.toContain('secret');
  });

  it('fails closed when no stable logical principal is configured and rejects another workspace root', async () => {
    const missing = await fixture('principal-missing', { principal: false });
    const principalResult = await post(missing.baseUrl, { action: 'status', workspaceRoot: missing.root });
    expect(principalResult.status).toBe(503);
    expect(principalResult.body.error).toBe('CODESPACE_SHARED_MEMORY_PRINCIPAL_REQUIRED');

    const f = await fixture('workspace');
    const outside = path.join(path.dirname(f.root), 'other-project');
    const mismatch = await post(f.baseUrl, { action: 'status', workspaceRoot: outside });
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error).toBe('CODESPACE_SHARED_MEMORY_WORKSPACE_REJECTED');
  });

  it('audits only bounded HTTP metadata and never persists the shared-memory request body or lease', async () => {
    const f = await fixture('audit');
    const marker = 'audit-body-marker-must-not-persist';
    const opened = await post(f.baseUrl, {
      action: 'open_context', workspaceRoot: f.root, task: marker,
    });
    expect(opened.status).toBe(200);
    const lease = String(opened.body.result.memoryContextLease);
    await f.logger.drain();
    const audit = await readFile(f.logger.filePath, 'utf8');
    expect(audit).toContain('/internal/codespace-memory');
    expect(audit).not.toContain(marker);
    expect(audit).not.toContain(lease);
    expect(audit).not.toContain('principal-stable');
  });

  it('opens/searches/gets the same Agent Core memory scope without exposing principal identity', async () => {
    const f = await fixture('roundtrip');
    const committed = await f.runtime.memory.commit({
      scope: { principalId: 'principal-stable', projectId: f.root },
      canonicalKey: 'decision.codespace.http.shared',
      kind: 'decision',
      value: 'Use one Agent Core memory authority through the Codespace bridge.',
      sourceType: 'test',
    });
    const opened = await post(f.baseUrl, {
      action: 'open_context', workspaceRoot: f.root, task: 'Continue Codespace shared memory authority',
    });
    expect(opened.status).toBe(200);
    expect(opened.body.ok).toBe(true);
    expect(opened.body.result.memoryContextLease).toMatch(/^mcl1\./);
    expect(opened.body.result.memorySummary.map((item: any) => item.memoryId)).toContain(committed.memoryId);

    const searched = await post(f.baseUrl, {
      action: 'search', workspaceRoot: f.root, query: 'Codespace shared memory authority', limit: 10,
    });
    expect(searched.status).toBe(200);
    expect(searched.body.result.hits.map((item: any) => item.memoryId)).toContain(committed.memoryId);

    const fetched = await post(f.baseUrl, { action: 'get', workspaceRoot: f.root, memoryId: committed.memoryId });
    expect(fetched.status).toBe(200);
    expect(fetched.body.result.memory.memoryId).toBe(committed.memoryId);
    for (const result of [opened, searched, fetched]) {
      expect(result.text).not.toContain('"principalId"');
      expect(result.text).not.toContain('principal-stable');
      expect(result.text).not.toContain('agent_core_live_');
    }
  });
});
