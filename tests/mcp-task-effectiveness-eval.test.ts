import { createServer } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { afterEach, describe, expect, it } from 'vitest';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

function fixtureServer(): McpServer {
  const server = new McpServer({ name: 'effectiveness-fixture', version: '1.0.0' });
  server.registerTool('memory_status', {
    title: 'Memory Status', description: 'Read-only status.', inputSchema: z.object({}).shape,
    annotations: { readOnlyHint: true },
  }, async () => ({ content: [{ type: 'text', text: '{"status":"available"}' }] }));
  server.registerTool('memory_update', {
    title: 'Memory Update', description: 'Mutation fixture.', inputSchema: z.object({ id: z.string() }).shape,
    annotations: { readOnlyHint: false },
  }, async () => ({ content: [{ type: 'text', text: 'mutated' }] }));
  return server;
}

async function startFixture() {
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const http = createServer(async (req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = fixtureServer();
    await server.connect(transport);
    try { await transport.handleRequest(req, res); }
    finally { await server.close().catch(() => undefined); }
  });
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', () => resolve());
  });
  cleanups.push(() => new Promise<void>((resolve) => http.close(() => resolve())));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('fixture listen failed');
  return `http://127.0.0.1:${address.port}/mcp`;
}

async function fixtureFiles(mode: 'status' | 'mutation') {
  const root = path.resolve('runtime', 'tmp', 'mcp-task-effectiveness', `test-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const fixture = path.join(root, 'fixture.json');
  const controller = path.join(root, 'controller.mjs');
  await writeFile(fixture, JSON.stringify({
    schemaVersion: 1,
    tasks: [{ id: mode, question: mode, expected: 'OK', readOnly: true, maxSteps: 2 }],
  }), 'utf8');
  const controllerSource = `
let input='';
for await (const chunk of process.stdin) input+=chunk;
const request=JSON.parse(input);
if(!request.transcript.length){
  const name=request.task.question==='mutation'?'memory_update':'memory_status';
  process.stdout.write(JSON.stringify({toolCalls:[{name,arguments:name==='memory_update'?{id:'x'}:{}}]}));
}else{
  process.stdout.write(JSON.stringify({answer:'OK',feedback:'fixture'}));
}
`;
  await writeFile(controller, controllerSource, 'utf8');
  return { root, fixture, controller };
}

describe('SK-P3 MCP task-effectiveness evaluator', () => {
  it('measures correctness and real read-only MCP tool cost without mutating guards', async () => {
    const url = await startFixture();
    const files = await fixtureFiles('status');
    const { runMcpTaskEffectiveness } = await import('../scripts/verify/mcp-task-effectiveness-eval.mjs');
    const result = await runMcpTaskEffectiveness({
      fixture: files.fixture,
      controllerCommand: [process.execPath, files.controller],
      url,
      evidenceRoot: files.root,
      guardFiles: [files.fixture],
      controllerTimeoutMs: 10_000,
    });
    expect(result.complete).toBe(true);
    expect(result.accuracy).toBe(1);
    expect(result.totalToolCalls).toBe(1);
    expect(result.changedGuards).toEqual([]);
    expect(result.results[0].toolMetrics.memory_status.count).toBe(1);
  });

  it('marks a read-only task incomplete when the controller selects a mutation tool', async () => {
    const url = await startFixture();
    const files = await fixtureFiles('mutation');
    const { runMcpTaskEffectiveness } = await import('../scripts/verify/mcp-task-effectiveness-eval.mjs');
    const result = await runMcpTaskEffectiveness({
      fixture: files.fixture,
      controllerCommand: [process.execPath, files.controller],
      url,
      evidenceRoot: files.root,
      guardFiles: [files.fixture],
      controllerTimeoutMs: 10_000,
    });
    expect(result.complete).toBe(false);
    expect(result.accuracy).toBe(0);
    expect(result.results[0].error).toBe('MCP_EFFECTIVENESS_NON_READ_ONLY_TOOL_REFUSED:memory_update');
    expect(result.changedGuards).toEqual([]);
  });
});
