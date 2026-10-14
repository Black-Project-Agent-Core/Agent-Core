import { createServer } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';
import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from '@modelcontextprotocol/node';
import { afterEach, describe, expect, it } from 'vitest';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function fixtureMcpServer(): McpServer {
  const server = new McpServer({ name: 'external-acceptance-fixture', version: '1.0.0' });
  server.registerTool('memory_status', {
    title: 'Memory Status',
    description: 'Harmless fixture status.',
    inputSchema: z.object({}).shape,
  }, async () => ({
    content: [{ type: 'text', text: '{"status":"available"}' }],
    structuredContent: { status: 'available' },
  }));

  server.registerTool('get_recent_tool_calls', {
    title: 'Recent Calls',
    description: 'Fixture schema probe.',
    inputSchema: z.object({
      compact: z.boolean().optional(),
      failuresOnly: z.boolean().optional(),
    }).shape,
  }, async () => ({
    content: [{ type: 'text', text: '[]' }],
    structuredContent: { calls: [] },
  }));
  return server;
}
describe('external MCP acceptance harness', () => {
  it('creates a fresh HTTP client, verifies manifest/schema, and performs a read-only probe', async () => {
    const validateHost = localhostHostValidation();
    const validateOrigin = localhostOriginValidation();
    const http = createServer(async (req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = fixtureMcpServer();
      await server.connect(transport);
      try {
        await transport.handleRequest(req, res);
      } finally {
        await server.close().catch(() => undefined);
      }
    });
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(0, '127.0.0.1', () => resolve());
    });
    cleanups.push(() => new Promise<void>(resolve => http.close(() => resolve())));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('fixture listen failed');
    const root = path.resolve('runtime', 'tmp', 'mcp-client-acceptance', `test-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    cleanups.push(() => rm(root, { recursive: true, force: true }));

    const { runExternalMcpAcceptance } = await import('../scripts/verify/mcp-external-acceptance.mjs');
    const result = await runExternalMcpAcceptance({
      url: `http://127.0.0.1:${address.port}/mcp`,
      evidenceRoot: root,
      expectedToolCount: 2,
      requiredTools: ['memory_status', 'get_recent_tool_calls'],
      requiredParams: ['get_recent_tool_calls:compact', 'get_recent_tool_calls:failuresOnly'],
      probeTool: 'memory_status',
    });

    expect(result.ok).toBe(true);
    expect(result.toolCount).toBe(2);
    expect(result.probeOk).toBe(true);
    expect(result.manifestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.evidenceDir).toContain(root);
  });

  it('bounds a non-responsive MCP endpoint and classifies the timeout without hanging cleanup', async () => {
    const http = createServer(() => {
      // Intentionally leave the request open until the client lifecycle aborts it.
    });
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(0, '127.0.0.1', () => resolve());
    });
    cleanups.push(async () => {
      http.closeAllConnections();
      await new Promise<void>(resolve => http.close(() => resolve()));
    });
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('fixture listen failed');
    const root = path.resolve('runtime', 'tmp', 'mcp-client-acceptance', `timeout-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    cleanups.push(() => rm(root, { recursive: true, force: true }));

    const { runExternalMcpAcceptance } = await import('../scripts/verify/mcp-external-acceptance.mjs');
    const started = Date.now();
    await expect(runExternalMcpAcceptance({
      url: `http://127.0.0.1:${address.port}/mcp`,
      evidenceRoot: root,
      requestTimeoutMs: 100,
      cleanupTimeoutMs: 50,
    })).rejects.toThrow('verification-timeout');
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
