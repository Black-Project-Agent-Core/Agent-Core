import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
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
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
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

function parsed(json: Record<string, any>): any {
  return JSON.parse(json.result.content[0].text);
}

const chatInputComponent = {
  name: 'ChatInput',
  display_name: 'Chat Input',
  minimized: false,
  outputs: [{ name: 'message', types: ['Message'], selected: 'Message' }],
  template: {
    input_value: { name: 'input_value', type: 'str', input_types: [], value: '' },
  },
};

const chatOutputComponent = {
  name: 'ChatOutput',
  display_name: 'Chat Output',
  minimized: false,
  outputs: [{ name: 'message', types: ['Message'], selected: 'Message' }],
  template: {
    input_value: { name: 'input_value', type: 'str', input_types: ['Message'], value: '' },
  },
};

function emptyFlow(id = '11111111-1111-4111-8111-111111111111') {
  return { id, name: 'Agent Core Test Flow', data: { nodes: [], edges: [] } };
}

async function setupMcpMutationRuntime() {
  const root = await tempRoot('agent-core-langflow-mutation-mcp-');
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const created = await keyStore.create('langflow-mutation-client');
  const defaults = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory' }, root);
  const runtime = createRuntimeServices(
    [root],
    path.join(root, 'capabilities'),
    undefined,
    { ...defaults.memory, enabled: false },
    { ...defaults.execution, enabled: false },
    defaults.github,
  );
  runtimes.push(runtime);

  const calls: Array<{ operation: string; input?: any }> = [];
  (runtime as any).langflow = {
    status: async () => ({ enabled: true, reachable: true, baseUrl: 'http://127.0.0.1:7860', status: 'ok' }),
    listProjects: async () => [{ id: 'project-1', name: 'Default' }],
    listFlows: async () => [emptyFlow()],
    getFlow: async () => emptyFlow(),
    runFlow: async () => ({ outputs: [] }),
    listComponents: async () => ({ input_output: { ChatInput: chatInputComponent, ChatOutput: chatOutputComponent } }),
    createFlow: async (input: any) => {
      calls.push({ operation: 'createFlow', input });
      return { ...emptyFlow(), name: input.name, folder_id: input.projectId ?? null };
    },
    updateFlow: async (flowId: string, patch: any) => {
      calls.push({ operation: 'updateFlow', input: { flowId, patch } });
      return { ...emptyFlow(flowId), ...patch };
    },
    addComponentNode: async (input: any) => {
      calls.push({ operation: 'addComponentNode', input });
      return { flowId: input.flowId, nodeId: 'ChatInput-abc12', nodeCount: 1, edgeCount: 0 };
    },
    connectNodes: async (input: any) => {
      calls.push({ operation: 'connectNodes', input });
      return { flowId: input.flowId, edgeId: 'edge-1', nodeCount: 2, edgeCount: 1 };
    },
  };

  const auditLogger = new FileAuditLogger(path.join(root, 'logs'));
  auditLoggers.push(auditLogger);
  const app = createHttpHandler({ keyStore, auditLogger, mcpHandler: createMcpHttpHandler(runtime) });
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

describe('Langflow graph helpers', () => {
  it('creates a frontend-compatible genericNode from a catalog component', async () => {
    const graph = await import('../src/langflow/graph.js').catch(() => null) as any;
    expect(graph?.createComponentNode).toBeTypeOf('function');
    if (!graph?.createComponentNode) return;

    const node = graph.createComponentNode('ChatInput', chatInputComponent, { x: 120, y: 240 }, 'ChatInput-abc12');
    expect(node).toEqual({
      id: 'ChatInput-abc12',
      type: 'genericNode',
      position: { x: 120, y: 240 },
      data: {
        node: chatInputComponent,
        showNode: true,
        type: 'ChatInput',
        id: 'ChatInput-abc12',
      },
    });
  });

  it('adds a node without mutating the original graph and rejects duplicate IDs', async () => {
    const graph = await import('../src/langflow/graph.js').catch(() => null) as any;
    expect(graph?.addNodeToGraph).toBeTypeOf('function');
    if (!graph?.addNodeToGraph) return;

    const original = { nodes: [], edges: [] };
    const node = { id: 'ChatInput-abc12', type: 'genericNode', position: { x: 0, y: 0 }, data: { id: 'ChatInput-abc12', type: 'ChatInput', node: chatInputComponent } };
    const next = graph.addNodeToGraph(original, node);
    expect(original.nodes).toHaveLength(0);
    expect(next.nodes).toHaveLength(1);
    expect(() => graph.addNodeToGraph(next, node)).toThrow('already exists');
  });

  it('connects named output/input handles using Langflow ReactFlow edge shape', async () => {
    const graph = await import('../src/langflow/graph.js').catch(() => null) as any;
    expect(graph?.connectGraphNodes).toBeTypeOf('function');
    if (!graph?.connectGraphNodes) return;

    const source = graph.createComponentNode('ChatInput', chatInputComponent, { x: 0, y: 0 }, 'ChatInput-abc12');
    const target = graph.createComponentNode('ChatOutput', chatOutputComponent, { x: 400, y: 0 }, 'ChatOutput-def34');
    const original = { nodes: [source, target], edges: [] };
    const next = graph.connectGraphNodes(original, {
      sourceNodeId: source.id,
      sourceOutputName: 'message',
      targetNodeId: target.id,
      targetInputName: 'input_value',
    });
    expect(original.edges).toHaveLength(0);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({ source: source.id, target: target.id, selected: false });
    expect(next.edges[0].data.sourceHandle).toEqual({
      dataType: 'ChatInput', id: source.id, name: 'message', output_types: ['Message'],
    });
    expect(next.edges[0].data.targetHandle).toEqual({
      fieldName: 'input_value', id: target.id, inputTypes: ['Message'], type: 'str',
    });
    expect(next.edges[0].sourceHandle).toContain('œ');
    expect(next.edges[0].targetHandle).toContain('œ');
    expect(() => graph.connectGraphNodes(next, {
      sourceNodeId: source.id,
      sourceOutputName: 'missing',
      targetNodeId: target.id,
      targetInputName: 'input_value',
    })).toThrow('output');
  });
});

describe('Langflow mutation HTTP service', () => {
  it('uses official component/create/update contracts and saves graph mutations through PATCH', async () => {
    const flowId = '11111111-1111-4111-8111-111111111111';
    let state: any = emptyFlow(flowId);
    const requests: Array<{ method: string; url: string; body?: Record<string, any> }> = [];
    const { baseUrl } = await listen(async (req, res) => {
      const record: { method: string; url: string; body?: Record<string, any> } = { method: req.method ?? '', url: req.url ?? '' };
      if (req.method === 'POST' || req.method === 'PATCH') record.body = await readJsonBody(req);
      requests.push(record);
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/v1/auto_login') return res.end(JSON.stringify({ access_token: 'mutation-session-token' }));
      if (req.headers.authorization !== 'Bearer mutation-session-token') {
        res.statusCode = 403;
        return res.end(JSON.stringify({ detail: 'auth required' }));
      }
      if (req.url === '/api/v1/all' && req.method === 'GET') {
        return res.end(JSON.stringify({ input_output: { ChatInput: chatInputComponent, ChatOutput: chatOutputComponent }, component_display_names: {} }));
      }
      if (req.url === '/api/v1/flows/' && req.method === 'POST') {
        state = { id: flowId, ...record.body };
        res.statusCode = 201;
        return res.end(JSON.stringify(state));
      }
      if (req.url === `/api/v1/flows/${flowId}` && req.method === 'GET') return res.end(JSON.stringify(state));
      if (req.url === `/api/v1/flows/${flowId}` && req.method === 'PATCH') {
        state = { ...state, ...record.body };
        return res.end(JSON.stringify(state));
      }
      res.statusCode = 404;
      return res.end(JSON.stringify({ detail: 'not found' }));
    });

    const module = await import('../src/langflow/service.js') as any;
    const service = new module.LangflowService({ enabled: true, baseUrl, apiKeyFile: null, requestTimeoutMs: 2_000 });

    const catalog = await service.listComponents();
    expect(catalog.input_output.ChatInput.display_name).toBe('Chat Input');

    const created = await service.createFlow({ name: 'Agent Core Test Flow', projectId: 'project-1' });
    expect(created).toMatchObject({ id: flowId, name: 'Agent Core Test Flow', folder_id: 'project-1', data: { nodes: [], edges: [] } });

    const updated = await service.updateFlow(flowId, { description: 'Controlled by Agent Core' });
    expect(updated).toMatchObject({ description: 'Controlled by Agent Core' });

    const added = await service.addComponentNode({
      flowId,
      componentName: 'ChatInput',
      category: 'input_output',
      position: { x: 100, y: 200 },
      nodeId: 'ChatInput-abc12',
    });
    expect(added).toMatchObject({ flowId, nodeId: 'ChatInput-abc12', nodeCount: 1, edgeCount: 0 });
    expect(state.data.nodes[0]).toMatchObject({ id: 'ChatInput-abc12', type: 'genericNode' });

    await service.addComponentNode({
      flowId,
      componentName: 'ChatOutput',
      category: 'input_output',
      position: { x: 500, y: 200 },
      nodeId: 'ChatOutput-def34',
    });
    const connected = await service.connectNodes({
      flowId,
      sourceNodeId: 'ChatInput-abc12',
      sourceOutputName: 'message',
      targetNodeId: 'ChatOutput-def34',
      targetInputName: 'input_value',
    });
    expect(connected).toMatchObject({ flowId, nodeCount: 2, edgeCount: 1 });
    expect(state.data.edges[0]).toMatchObject({ source: 'ChatInput-abc12', target: 'ChatOutput-def34' });

    expect(requests.map((r) => `${r.method} ${r.url}`)).toContain('GET /api/v1/all');
    expect(requests.map((r) => `${r.method} ${r.url}`)).toContain('POST /api/v1/flows/');
    expect(requests.filter((r) => r.method === 'PATCH' && r.url === `/api/v1/flows/${flowId}`).length).toBeGreaterThanOrEqual(4);
    const createBody = requests.find((r) => r.method === 'POST' && r.url === '/api/v1/flows/')?.body;
    expect(createBody).toEqual({
      name: 'Agent Core Test Flow',
      folder_id: 'project-1',
      data: { nodes: [], edges: [] },
    });
  });
});

describe('Native Langflow mutation MCP tools', () => {
  it('routes Langflow mutation intent to write tools and forwards sanitized create/add/connect requests', async () => {
    const { baseUrl, created, calls } = await setupMcpMutationRuntime();
    const routed = parsed(await callMcp(baseUrl, created.key, 'capability_route', {
      task: 'Create a Langflow flow, add ChatInput and ChatOutput nodes, then connect them',
    }));
    expect(routed.allowedTools).toContain('langflow_flow_create');
    expect(routed.allowedTools).toContain('langflow_graph_add_node');
    expect(routed.allowedTools).toContain('langflow_graph_connect');

    const flow = parsed(await callMcp(baseUrl, created.key, 'langflow_flow_create', {
      name: 'Agent Core Test Flow', projectId: 'project-1', routeContextId: routed.routeContextId,
    }));
    expect(flow.name).toBe('Agent Core Test Flow');

    const added = parsed(await callMcp(baseUrl, created.key, 'langflow_graph_add_node', {
      flowId: flow.id,
      componentName: 'ChatInput',
      category: 'input_output',
      x: 100,
      y: 200,
      routeContextId: routed.routeContextId,
    }));
    expect(added.nodeId).toBe('ChatInput-abc12');

    const connected = parsed(await callMcp(baseUrl, created.key, 'langflow_graph_connect', {
      flowId: flow.id,
      sourceNodeId: 'ChatInput-abc12',
      sourceOutputName: 'message',
      targetNodeId: 'ChatOutput-def34',
      targetInputName: 'input_value',
      routeContextId: routed.routeContextId,
    }));
    expect(connected.edgeCount).toBe(1);
    expect(calls.map((entry) => entry.operation)).toEqual(['createFlow', 'addComponentNode', 'connectNodes']);
  });

  it('keeps component discovery read-only and excludes mutation tools from read-only routes', async () => {
    const { baseUrl, created } = await setupMcpMutationRuntime();
    const routed = parsed(await callMcp(baseUrl, created.key, 'capability_route', {
      task: 'List Langflow components without modifying anything',
    }));
    expect(routed.allowedTools).toContain('langflow_components');
    expect(routed.allowedTools).not.toContain('langflow_flow_create');
    expect(routed.allowedTools).not.toContain('langflow_graph_add_node');
    expect(parsed(await callMcp(baseUrl, created.key, 'langflow_components', {
      routeContextId: routed.routeContextId,
    }))).toHaveProperty('input_output.ChatInput');
  });
});
