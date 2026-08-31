import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

type ProtocolMode = 'dual' | 'legacy';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];

async function setup(protocolMode: ProtocolMode = 'dual') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-dual-era-'));
  roots.push(root);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const created = await keyStore.create(`dual-era-${protocolMode}`);
  const memory = loadConfig({}, root).memory;
  const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
    ...memory,
    enabled: false,
  });
  runtimes.push(runtime);
  const app = createHttpHandler({
    keyStore,
    auditLogger: new FileAuditLogger(path.join(root, 'logs')),
    mcpHandler: createMcpHttpHandler(runtime, { protocolMode }),
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { root, created, baseUrl: `http://127.0.0.1:${port}` };
}

async function postMcp(
  baseUrl: string,
  key: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: Record<string, any> | null = null;
  try {
    json = JSON.parse(text) as Record<string, any>;
  } catch {}
  return { response, text, json };
}

function modernMeta() {
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'agent-core-wave-b-test', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

function modernHeaders(method: string, name?: string) {
  return {
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': method,
    ...(name ? { 'Mcp-Name': name } : {}),
  };
}

function sdkTransport(baseUrl: string, key: string) {
  return new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    authProvider: { token: async () => key },
  });
}

async function legacyList(baseUrl: string, key: string) {
  const init = await postMcp(baseUrl, key, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'agent-core-legacy-test', version: '1.0.0' },
    },
  });
  expect(init.response.status).toBe(200);

  return postMcp(baseUrl, key, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Core MCP dual-era transport', () => {
  it('keeps the official v2 Client on the legacy 2025-era path by default', async () => {
    const { baseUrl, created } = await setup('dual');
    const client = new Client({ name: 'agent-core-wave-b-legacy-client', version: '1.0.0' });
    try {
      await client.connect(sdkTransport(baseUrl, created.key));
      expect(client.getProtocolEra()).toBe('legacy');
      expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
      expect((await client.listTools()).tools).toHaveLength(55);
    } finally {
      await client.close().catch(() => undefined);
    }
  });

  it('lets the official v2 Client negotiate modern 2026-07-28 and call the same Agent Core tools', async () => {
    const { baseUrl, created } = await setup('dual');
    const client = new Client(
      { name: 'agent-core-wave-b-modern-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    try {
      await client.connect(sdkTransport(baseUrl, created.key));
      expect(client.getProtocolEra()).toBe('modern');
      expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
      expect(client.getDiscoverResult()?.supportedVersions).toContain('2026-07-28');
      expect((await client.listTools()).tools).toHaveLength(55);

      const status = await client.callTool({ name: 'agent_core_status', arguments: {} });
      expect(status.structuredContent).toMatchObject({
        service: 'agent-core',
        serverName: 'agent-core',
        version: '0.5.4',
        authentication: 'bearer-api-key',
        key: { id: created.metadata.id, name: 'dual-era-dual' },
      });
    } finally {
      await client.close().catch(() => undefined);
    }
  });

  it('preserves the legacy 2025-era initialize and 55-tool surface in default dual mode', async () => {
    const { baseUrl, created } = await setup('dual');
    const listed = await legacyList(baseUrl, created.key);
    expect(listed.response.status).toBe(200);
    expect(listed.json?.result?.tools).toHaveLength(55);
  });

  it('serves modern server/discover and advertises the 2026-07-28 protocol in dual mode', async () => {
    const { baseUrl, created } = await setup('dual');
    const discover = await postMcp(baseUrl, created.key, {
      jsonrpc: '2.0',
      id: 'discover-1',
      method: 'server/discover',
      params: { _meta: modernMeta() },
    }, modernHeaders('server/discover'));

    expect(discover.response.status).toBe(200);
    expect(discover.json?.result?.supportedVersions).toContain('2026-07-28');
    expect(discover.json?.result?.capabilities?.tools).toBeDefined();
    expect(discover.json?.result?._meta?.['io.modelcontextprotocol/serverInfo']).toMatchObject({
      name: 'agent-core',
      version: '0.5.4',
    });
  });

  it('serves the same 55 tools to a modern tools/list request', async () => {
    const { baseUrl, created } = await setup('dual');
    const listed = await postMcp(baseUrl, created.key, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: { _meta: modernMeta() },
    }, modernHeaders('tools/list'));

    expect(listed.response.status).toBe(200);
    expect(listed.json?.result?.tools).toHaveLength(55);
    const names = (listed.json?.result?.tools as Array<{ name: string }>).map((tool) => tool.name);
    expect(names).toContain('agent_core_status');
    expect(names).toContain('capability_route');
    expect(names).toContain('github_status');
  });

  it('rejects modern-era header/body disagreement instead of silently routing it as legacy', async () => {
    const { baseUrl, created } = await setup('dual');
    const mismatch = await postMcp(baseUrl, created.key, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: { _meta: modernMeta() },
    }, modernHeaders('tools/call'));

    expect(mismatch.response.status).toBe(400);
    expect(mismatch.json?.error).toBeDefined();
    expect(mismatch.json?.result).toBeUndefined();
  });

  it('rejects a modern protocol header when the required per-request envelope is missing', async () => {
    const { baseUrl, created } = await setup('dual');
    const missingEnvelope = await postMcp(baseUrl, created.key, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/list',
      params: {},
    }, modernHeaders('tools/list'));

    expect(missingEnvelope.response.status).toBe(400);
    expect(missingEnvelope.json?.error?.code).toBe(-32602);
    expect(missingEnvelope.json?.result).toBeUndefined();
  });

  it('rejects an unsupported modern protocol version without falling through to legacy serving', async () => {
    const { baseUrl, created } = await setup('dual');
    const unsupported = await postMcp(baseUrl, created.key, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/list',
      params: {
        _meta: {
          ...modernMeta(),
          'io.modelcontextprotocol/protocolVersion': '2099-01-01',
        },
      },
    }, {
      'MCP-Protocol-Version': '2099-01-01',
      'Mcp-Method': 'tools/list',
    });

    expect(unsupported.response.status).toBe(400);
    expect(unsupported.json?.error?.code).toBe(-32022);
    expect(unsupported.json?.result).toBeUndefined();
  });

  it('rejects Mcp-Name disagreement for a modern tools/call request', async () => {
    const { baseUrl, created } = await setup('dual');
    const mismatch = await postMcp(baseUrl, created.key, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'agent_core_status',
        arguments: {},
        _meta: modernMeta(),
      },
    }, modernHeaders('tools/call', 'github_status'));

    expect(mismatch.response.status).toBe(400);
    expect(mismatch.json?.error?.code).toBe(-32020);
    expect(mismatch.json?.result).toBeUndefined();
  });

  it('keeps Wave A authentication and Origin gates ahead of modern protocol dispatch', async () => {
    const { baseUrl, created } = await setup('dual');
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 'discover-auth-order',
      method: 'server/discover',
      params: { _meta: modernMeta() },
    });
    const protocolHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...modernHeaders('server/discover'),
    };

    const unauthenticated = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: protocolHeaders,
      body,
    });
    expect(unauthenticated.status).toBe(401);

    const evilOrigin = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        ...protocolHeaders,
        Authorization: `Bearer ${created.key}`,
        Origin: 'https://evil.example',
      },
      body,
    });
    expect(evilOrigin.status).toBe(403);
    expect(await evilOrigin.json()).toEqual({ error: 'forbidden_origin' });
  });

  it('lets an auto-negotiating official v2 Client fall back to legacy in rollback mode', async () => {
    const { baseUrl, created } = await setup('legacy');
    const client = new Client(
      { name: 'agent-core-wave-b-rollback-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    try {
      await client.connect(sdkTransport(baseUrl, created.key));
      expect(client.getProtocolEra()).toBe('legacy');
      expect((await client.listTools()).tools).toHaveLength(55);
    } finally {
      await client.close().catch(() => undefined);
    }
  });

  it('provides a legacy-only rollback mode that preserves legacy tools and rejects modern discovery', async () => {
    const { baseUrl, created } = await setup('legacy');
    const legacy = await legacyList(baseUrl, created.key);
    expect(legacy.response.status).toBe(200);
    expect(legacy.json?.result?.tools).toHaveLength(55);

    const modern = await postMcp(baseUrl, created.key, {
      jsonrpc: '2.0',
      id: 'discover-rollback',
      method: 'server/discover',
      params: { _meta: modernMeta() },
    }, modernHeaders('server/discover'));

    expect(modern.response.status).toBe(400);
    expect(modern.json?.error?.message).toContain('legacy-only');
    expect(modern.json?.result).toBeUndefined();
  });
});
