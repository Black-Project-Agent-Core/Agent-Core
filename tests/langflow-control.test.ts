import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const auditLoggers: FileAuditLogger[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  const server = createServer((req, res) => void Promise.resolve(handler(req, res)).catch((error) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function callMcp(baseUrl: string, key: string, name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } }),
  });
  return await response.json() as Record<string, any>;
}

function parsed(json: Record<string, any>): Record<string, any> {
  return JSON.parse(json.result.content[0].text) as Record<string, any>;
}

async function setupAgentCoreWithFakeLangflow() {
  const root = await tempRoot('agent-core-langflow-mcp-');
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const created = await keyStore.create('langflow-mcp-client');
  const defaults = loadConfig({}, root);
  const runtime = createRuntimeServices(
    [root],
    path.join(root, 'capabilities'),
    undefined,
    { ...defaults.memory, enabled: false },
    { ...defaults.execution, enabled: false },
    defaults.github,
  );
  runtimes.push(runtime);

  const calls: Array<{ operation: string; input?: unknown }> = [];
  (runtime as any).langflow = {
    status: async () => ({ enabled: true, reachable: true, baseUrl: 'http://127.0.0.1:7860', status: 'ok' }),
    listProjects: async () => {
      calls.push({ operation: 'listProjects' });
      return [{ id: 'project-1', name: 'Default' }];
    },
    listFlows: async () => {
      calls.push({ operation: 'listFlows' });
      return [{ id: 'flow-1', name: 'Demo Flow' }];
    },
    getFlow: async (flowId: string) => {
      calls.push({ operation: 'getFlow', input: flowId });
      return { id: flowId, name: 'Demo Flow', data: { nodes: [], edges: [] } };
    },
    runFlow: async (input: unknown) => {
      calls.push({ operation: 'runFlow', input });
      return { outputs: [{ result: 'ok' }] };
    },
  };

  const auditLogger = new FileAuditLogger(path.join(root, 'logs'));
  auditLoggers.push(auditLogger);
  const app = createHttpHandler({
    keyStore,
    auditLogger,
    mcpHandler: createMcpHttpHandler(runtime),
  });
  const { baseUrl } = await listen((req, res) => app(req, res));
  return { baseUrl, created, calls };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(auditLoggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Langflow configuration', () => {
  it('defaults to an enabled credential-free loopback Langflow endpoint', () => {
    const root = path.resolve('F:\\Projects\\Agent-Core');
    const config = loadConfig({}, root) as any;
    expect(config.langflow).toEqual({
      enabled: true,
      baseUrl: 'http://127.0.0.1:7860',
      apiKeyFile: null,
      requestTimeoutMs: 30_000,
    });
  });

  it('allows loopback overrides but rejects remote or credential-bearing Langflow URLs', () => {
    const root = path.resolve('F:\\Projects\\Agent-Core');
    const configured = loadConfig({
      AGENT_CORE_LANGFLOW_BASE_URL: 'http://localhost:9000/',
      AGENT_CORE_LANGFLOW_API_KEY_FILE: 'F:\\Secrets\\langflow-key.txt',
      AGENT_CORE_LANGFLOW_REQUEST_TIMEOUT_MS: '5000',
    }, root) as any;
    expect(configured.langflow).toEqual({
      enabled: true,
      baseUrl: 'http://localhost:9000',
      apiKeyFile: path.resolve('F:\\Secrets\\langflow-key.txt'),
      requestTimeoutMs: 5000,
    });

    expect(() => loadConfig({ AGENT_CORE_LANGFLOW_BASE_URL: 'https://langflow.example.test' }, root))
      .toThrow('AGENT_CORE_LANGFLOW_BASE_URL must use a loopback hostname');
    expect(() => loadConfig({ AGENT_CORE_LANGFLOW_BASE_URL: 'http://user:pass@127.0.0.1:7860' }, root))
      .toThrow('AGENT_CORE_LANGFLOW_BASE_URL must not include credentials');
    expect(() => loadConfig({ AGENT_CORE_LANGFLOW_BASE_URL: 'file:///tmp/langflow' }, root))
      .toThrow('AGENT_CORE_LANGFLOW_BASE_URL must use http or https');
  });
});

describe('Langflow local HTTP service', () => {
  it('uses the verified Langflow v1 project/flow/run contracts and keeps the API key in a header', async () => {
    const requests: Array<{ method: string; url: string; apiKey: string | undefined; body?: Record<string, unknown> }> = [];
    const { baseUrl } = await listen(async (req, res) => {
      const record: { method: string; url: string; apiKey: string | undefined; body?: Record<string, unknown> } = {
        method: req.method ?? '',
        url: req.url ?? '',
        apiKey: Array.isArray(req.headers['x-api-key']) ? req.headers['x-api-key'][0] : req.headers['x-api-key'],
      };
      if (req.method === 'POST') record.body = await readJsonBody(req);
      requests.push(record);
      res.setHeader('content-type', 'application/json');
      if (req.url === '/health') return res.end(JSON.stringify({ status: 'ok' }));
      if (req.url === '/api/v1/projects/') return res.end(JSON.stringify([{ id: 'project-1', name: 'Default' }]));
      if (req.url === '/api/v1/flows/?get_all=true&header_flows=true') return res.end(JSON.stringify([{ id: 'flow-1', name: 'Demo Flow' }]));
      if (req.url === '/api/v1/flows/flow-1') return res.end(JSON.stringify({ id: 'flow-1', name: 'Demo Flow', data: { nodes: [], edges: [] } }));
      if (req.url === '/api/v2/workflows') return res.end(JSON.stringify({ outputs: [{ result: 'ok' }] }));
      res.statusCode = 404;
      return res.end(JSON.stringify({ detail: 'not found' }));
    });
    const root = await tempRoot('agent-core-langflow-service-');
    const keyFile = path.join(root, 'langflow-api-key.txt');
    await writeFile(keyFile, 'local-test-key\n', 'utf8');

    const module = await import('../src/langflow/service.js').catch(() => null) as any;
    expect(module?.LangflowService).toBeTypeOf('function');
    if (!module?.LangflowService) return;

    const service = new module.LangflowService({
      enabled: true,
      baseUrl,
      apiKeyFile: keyFile,
      requestTimeoutMs: 2_000,
    });
    expect(await service.status()).toMatchObject({ enabled: true, reachable: true, status: 'ok', baseUrl });
    expect(await service.listProjects()).toEqual([{ id: 'project-1', name: 'Default' }]);
    expect(await service.listFlows()).toEqual([{ id: 'flow-1', name: 'Demo Flow' }]);
    expect(await service.getFlow('flow-1')).toMatchObject({ id: 'flow-1', name: 'Demo Flow' });
    expect(await service.runFlow({
      flowIdOrName: '11111111-1111-4111-8111-111111111111',
      inputValue: 'hello',
      sessionId: 'session-1',
    })).toEqual({ outputs: [{ result: 'ok' }] });

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'GET /health',
      'GET /api/v1/projects/',
      'GET /api/v1/flows/?get_all=true&header_flows=true',
      'GET /api/v1/flows/flow-1',
      'POST /api/v2/workflows',
    ]);
    expect(requests[0]?.apiKey).toBeUndefined();
    expect(requests.slice(1).every((request) => request.apiKey === 'local-test-key')).toBe(true);
    expect(requests[4]?.body).toEqual({
      flow_id: '11111111-1111-4111-8111-111111111111',
      input_value: 'hello',
      tweaks: {},
      session_id: 'session-1',
      mode: 'sync',
    });
    expect(requests[4]?.url).not.toContain('local-test-key');
  });

  it('falls back to the full flow list when a starter flow is listed but the owner-scoped detail route returns 404', async () => {
    const flowId = '33333333-3333-4333-8333-333333333333';
    const requests: string[] = [];
    const { baseUrl } = await listen(async (req, res) => {
      requests.push(`${req.method ?? ''} ${req.url ?? ''}`);
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/v1/auto_login') {
        return res.end(JSON.stringify({ access_token: 'starter-session-token' }));
      }
      if (req.headers.authorization !== 'Bearer starter-session-token') {
        res.statusCode = 403;
        return res.end(JSON.stringify({ detail: 'authentication required' }));
      }
      if (req.url === `/api/v1/flows/${flowId}`) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ detail: 'Flow not found' }));
      }
      if (req.url === '/api/v1/flows/?get_all=true&header_flows=false') {
        return res.end(JSON.stringify([{ id: flowId, name: 'Starter Flow', data: { nodes: [{ id: 'node-1' }], edges: [] } }]));
      }
      res.statusCode = 404;
      return res.end(JSON.stringify({ detail: 'not found' }));
    });

    const module = await import('../src/langflow/service.js') as any;
    const service = new module.LangflowService({ enabled: true, baseUrl, apiKeyFile: null, requestTimeoutMs: 2_000 });
    expect(await service.getFlow(flowId)).toMatchObject({ id: flowId, name: 'Starter Flow' });
    expect(requests).toEqual([
      'GET /api/v1/auto_login',
      `GET /api/v1/flows/${flowId}`,
      'GET /api/v1/flows/?get_all=true&header_flows=false',
    ]);
  });

  it('uses an in-memory auto-login bearer session when no API key file is configured', async () => {
    const flowId = '22222222-2222-4222-8222-222222222222';
    const requests: Array<{ method: string; url: string; authorization: string | undefined; body?: Record<string, unknown> }> = [];
    const { baseUrl } = await listen(async (req, res) => {
      const record: { method: string; url: string; authorization: string | undefined; body?: Record<string, unknown> } = {
        method: req.method ?? '',
        url: req.url ?? '',
        authorization: req.headers.authorization,
      };
      if (req.method === 'POST') record.body = await readJsonBody(req);
      requests.push(record);
      res.setHeader('content-type', 'application/json');
      if (req.url === '/health') return res.end(JSON.stringify({ status: 'ok' }));
      if (req.url === '/api/v1/auto_login') {
        return res.end(JSON.stringify({ access_token: 'local-session-token', refresh_token: 'unused-refresh-token' }));
      }
      if (req.headers.authorization !== 'Bearer local-session-token') {
        res.statusCode = 403;
        return res.end(JSON.stringify({ detail: 'authentication required' }));
      }
      if (req.url === '/api/v1/projects/') return res.end(JSON.stringify([{ id: 'project-1', name: 'Default' }]));
      if (req.url === '/api/v1/flows/?get_all=true&header_flows=true') {
        return res.end(JSON.stringify([{ id: flowId, name: 'Demo Flow', endpoint_name: 'demo-flow' }]));
      }
      if (req.url === '/api/v2/workflows') return res.end(JSON.stringify({ outputs: [{ result: 'session-ok' }] }));
      res.statusCode = 404;
      return res.end(JSON.stringify({ detail: 'not found' }));
    });

    const module = await import('../src/langflow/service.js') as any;
    const service = new module.LangflowService({
      enabled: true,
      baseUrl,
      apiKeyFile: null,
      requestTimeoutMs: 2_000,
    });

    expect(await service.status()).toMatchObject({ reachable: true, status: 'ok' });
    expect(await service.listProjects()).toEqual([{ id: 'project-1', name: 'Default' }]);
    expect(await service.listFlows()).toEqual([{ id: flowId, name: 'Demo Flow', endpoint_name: 'demo-flow' }]);
    expect(await service.runFlow({ flowIdOrName: flowId, inputValue: 'hello' }))
      .toEqual({ outputs: [{ result: 'session-ok' }] });

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'GET /health',
      'GET /api/v1/auto_login',
      'GET /api/v1/projects/',
      'GET /api/v1/flows/?get_all=true&header_flows=true',
      'POST /api/v2/workflows',
    ]);
    expect(requests[0]?.authorization).toBeUndefined();
    expect(requests[1]?.authorization).toBeUndefined();
    expect(requests.slice(2).every((request) => request.authorization === 'Bearer local-session-token')).toBe(true);
    expect(requests[4]?.body).toEqual({
      flow_id: flowId,
      input_value: 'hello',
      tweaks: {},
      mode: 'sync',
    });
  });
});

describe('Native Langflow MCP tools', () => {
  it('reports Langflow status without requiring an operational route', async () => {
    const { baseUrl, created } = await setupAgentCoreWithFakeLangflow();
    const json = await callMcp(baseUrl, created.key, 'langflow_status');
    expect(parsed(json)).toMatchObject({
      enabled: true,
      reachable: true,
      baseUrl: 'http://127.0.0.1:7860',
      status: 'ok',
    });
  });

  it('routes read-only Langflow tasks to project and flow tools and can list/get state', async () => {
    const { baseUrl, created, calls } = await setupAgentCoreWithFakeLangflow();
    const routed = parsed(await callMcp(baseUrl, created.key, 'capability_route', {
      task: 'List Langflow projects and flows without modifying files',
    }));
    expect(routed.allowedTools).toContain('langflow_projects');
    expect(routed.allowedTools).toContain('langflow_flows');
    expect(routed.allowedTools).not.toContain('langflow_run');

    expect(parsed(await callMcp(baseUrl, created.key, 'langflow_projects', {
      routeContextId: routed.routeContextId,
    }))).toEqual([{ id: 'project-1', name: 'Default' }]);
    expect(parsed(await callMcp(baseUrl, created.key, 'langflow_flows', {
      operation: 'list', routeContextId: routed.routeContextId,
    }))).toEqual([{ id: 'flow-1', name: 'Demo Flow' }]);
    expect(parsed(await callMcp(baseUrl, created.key, 'langflow_flows', {
      operation: 'get', flowId: 'flow-1', routeContextId: routed.routeContextId,
    }))).toMatchObject({ id: 'flow-1', name: 'Demo Flow' });
    expect(calls.map((entry) => entry.operation)).toEqual(['listProjects', 'listFlows', 'getFlow']);
  });

  it('routes execution intent to langflow_run and forwards only the requested run parameters', async () => {
    const { baseUrl, created, calls } = await setupAgentCoreWithFakeLangflow();
    const routed = parsed(await callMcp(baseUrl, created.key, 'capability_route', {
      task: 'Run Langflow flow flow-1 with input hello',
    }));
    expect(routed.allowedTools).toContain('langflow_run');

    const result = parsed(await callMcp(baseUrl, created.key, 'langflow_run', {
      flowIdOrName: 'flow-1',
      inputValue: 'hello',
      sessionId: 'session-1',
      routeContextId: routed.routeContextId,
    }));
    expect(result).toEqual({ outputs: [{ result: 'ok' }] });
    expect(calls.at(-1)).toEqual({
      operation: 'runFlow',
      input: { flowIdOrName: 'flow-1', inputValue: 'hello', sessionId: 'session-1' },
    });
  });
});
