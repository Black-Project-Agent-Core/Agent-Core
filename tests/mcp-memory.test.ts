import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { MEMORY_TOOL_NAMES } from '../src/mcp/memory-tools.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import { MEMORY_REMEMBER_MORE_DEFAULTS, MEMORY_REMEMBER_MORE_LIMITS } from '../src/memory/types.js';

const auditLoggers: FileAuditLogger[] = [];
function createAuditLogger(logDir: string): FileAuditLogger {
  const logger = new FileAuditLogger(logDir);
  auditLoggers.push(logger);
  return logger;
}

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const MEMORY_TOOLS = [
  'memory_status', 'memory_search', 'memory_get', 'memory_commit',
  'memory_revise', 'memory_forget', 'memory_explain', 'memory_export', 'memory_remember_more',
] as const;

async function fixture() {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-mcp-memory-'));
  roots.push(root);
  const baseMemory = loadConfig({}, root).memory;
  const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
    ...baseMemory,
    enabled: true,
    dbPath: path.join(root, 'runtime', 'memory', 'mcp-memory.sqlite'),
  });
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principalA = await keyStore.create('memory-principal-a');
  const principalB = await keyStore.create('memory-principal-b');
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: createAuditLogger(path.join(root, 'logs')),
    mcpHandler: createMcpHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return {
    root,
    runtime,
    principalA,
    principalB,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

async function request(baseUrl: string, key: string, body: unknown) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
  return await response.json() as Record<string, any>;
}

async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown> = {}) {
  return request(baseUrl, key, {
    jsonrpc: '2.0', id: 83, method: 'tools/call', params: { name, arguments: args },
  });
}

function body(result: Record<string, any>): Record<string, any> {
  return JSON.parse(result.result.content[0].text) as Record<string, any>;
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

describe('deterministic memory MCP surface', () => {
  it('registers exactly nine focused memory tools with bounded schemas and correct annotations', async () => {
    const f = await fixture();
    const listed = await request(f.baseUrl, f.principalA.key, {
      jsonrpc: '2.0', id: 84, method: 'tools/list', params: {},
    });
    const tools = listed.result.tools as Array<Record<string, any>>;
    const names = tools.map((tool) => tool.name);
    expect(names).toHaveLength(56);
    for (const name of MEMORY_TOOLS) expect(names).toContain(name);

    expect(MEMORY_TOOL_NAMES).toHaveLength(9);
    expect(MEMORY_TOOL_NAMES).toContain('memory_remember_more');

    for (const name of ['memory_status', 'memory_search', 'memory_get', 'memory_explain', 'memory_export', 'memory_remember_more']) {
      expect(tools.find((tool) => tool.name === name)?.annotations).toMatchObject({
        readOnlyHint: true, destructiveHint: false, openWorldHint: false,
      });
    }
    for (const name of ['memory_commit', 'memory_revise']) {
      expect(tools.find((tool) => tool.name === name)?.annotations).toMatchObject({
        readOnlyHint: false, destructiveHint: false, openWorldHint: false,
      });
    }
    expect(tools.find((tool) => tool.name === 'memory_forget')?.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: true, openWorldHint: false,
    });
    expect(tools.find((tool) => tool.name === 'memory_forget')?.inputSchema?.properties).not.toHaveProperty('purge');
    expect(tools.find((tool) => tool.name === 'memory_export')?.inputSchema?.properties?.limit?.maximum).toBeLessThanOrEqual(1000);
    expect(tools.find((tool) => tool.name === 'memory_search')?.inputSchema?.properties?.limit?.maximum).toBeLessThanOrEqual(100);
    const rememberMore = tools.find((tool) => tool.name === 'memory_remember_more');
    expect(rememberMore?.inputSchema?.properties?.seedMemoryIds?.maxItems).toBe(MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds);
    expect(rememberMore?.inputSchema?.properties?.maxHops).toMatchObject({
      maximum: MEMORY_REMEMBER_MORE_LIMITS.maxHops, default: MEMORY_REMEMBER_MORE_DEFAULTS.maxHops,
    });
    expect(rememberMore?.inputSchema?.properties?.maxItems).toMatchObject({
      maximum: MEMORY_REMEMBER_MORE_LIMITS.maxItems, default: MEMORY_REMEMBER_MORE_DEFAULTS.maxItems,
    });
    expect(rememberMore?.inputSchema?.properties?.characterBudget).toMatchObject({
      maximum: MEMORY_REMEMBER_MORE_LIMITS.characterBudget, default: MEMORY_REMEMBER_MORE_DEFAULTS.characterBudget,
    });
  });

  it('expands an authenticated recalled solution into its prior failure through memory_remember_more', async () => {
    const f = await fixture();
    const scope = { principalId: f.principalA.metadata.id, projectId: f.root };
    const solution = await f.runtime.memory.commit({
      scope,
      canonicalKey: 'solution.renderer.authenticated',
      kind: 'solution',
      value: 'Use source-native renderer geometry for the authenticated workflow.',
      sourceType: 'test',
    });
    const failure = await f.runtime.memory.commit({
      scope,
      canonicalKey: 'failure.renderer.authenticated',
      kind: 'failure',
      value: 'Legacy post-render scaling distorted the authenticated workflow.',
      sourceType: 'test',
      explicitRelations: [{ targetMemoryId: solution.memoryId, relation: 'resolved_by' }],
    });
    const preflight = await f.runtime.memory.preflight({
      scope,
      routeContextId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      task: 'source-native renderer geometry authenticated workflow solution',
      expiresAt: Date.now() + 60_000,
    });
    expect(preflight.recalled.map((hit) => hit.memoryId)).toContain(solution.memoryId);

    const expanded = body(await call(f.baseUrl, f.principalA.key, 'memory_remember_more', {
      contextId: preflight.contextId,
      seedMemoryIds: [solution.memoryId],
      reason: 'failure_history',
    }));
    expect(expanded.seedMemoryIds).toEqual([solution.memoryId]);
    expect(expanded.expansions).toEqual(expect.arrayContaining([expect.objectContaining({
      memoryId: failure.memoryId,
      sourceSeedMemoryId: solution.memoryId,
      depth: 1,
      relationPath: ['resolved_by'],
      reasonCode: 'resolved_by',
      historicalRevision: false,
    })]));
  });

  it('binds writes/reads to the authenticated principal and preserves provenance, revision history, explainability, export, and soft tombstone behavior', async () => {
    const f = await fixture();
    const committed = body(await call(f.baseUrl, f.principalA.key, 'memory_commit', {
      canonicalKey: 'project.memory.policy',
      kind: 'guardrail',
      value: 'Keep generated output on drive F.',
      importance: 1,
      pinned: true,
      enforcement: 'hard',
      sourceType: 'test',
      sourceRef: 'task13-commit',
    }));
    expect(committed).toMatchObject({ revisionNo: 1, deduplicated: false, state: 'active' });
    const memoryId = committed.memoryId as string;

    const searched = body(await call(f.baseUrl, f.principalA.key, 'memory_search', {
      query: 'generated output drive F', limit: 10,
    }));
    expect(searched.hits.map((hit: any) => hit.memoryId)).toContain(memoryId);
    expect(searched.hits[0].whyMatched).toHaveProperty('finalScore');

    const got = body(await call(f.baseUrl, f.principalA.key, 'memory_get', { memoryId }));
    expect(got.memory).toMatchObject({ memoryId, canonicalKey: 'project.memory.policy', state: 'active' });
    expect(got.revisions).toHaveLength(1);
    expect(got.provenance.events).toHaveLength(1);
    expect(got.provenance.events[0]).toMatchObject({ eventType: 'memory.committed', sourceType: 'test', sourceRef: 'task13-commit' });
    expect(got.provenance.events[0]).not.toHaveProperty('rawText');

    const revised = body(await call(f.baseUrl, f.principalA.key, 'memory_revise', {
      memoryId,
      value: 'Keep all generated output on drive F only.',
      sourceType: 'user_correction',
      sourceRef: 'task13-revise',
    }));
    expect(revised).toMatchObject({ memoryId, revisionNo: 2, deduplicated: false });

    const explained = body(await call(f.baseUrl, f.principalA.key, 'memory_explain', {
      memoryId,
      query: 'generated output drive F',
    }));
    expect(explained.memoryId).toBe(memoryId);
    expect(explained.revisions.map((item: any) => item.revisionNo)).toEqual([1, 2]);
    expect(explained.anchors.length).toBeGreaterThan(0);
    expect(explained.sourceEvents.length).toBeGreaterThanOrEqual(2);
    expect(explained.queryExplanation).toMatchObject({ memoryId });
    expect(explained.queryExplanation.whyMatched.finalScore).toBeGreaterThan(0);
    expect(
      explained.queryExplanation.whyMatched.matchedAnchors.length > 0
      || explained.queryExplanation.whyMatched.lexicalTerms.length > 0
      || explained.queryExplanation.whyMatched.exact > 0,
    ).toBe(true);

    const exported = body(await call(f.baseUrl, f.principalA.key, 'memory_export', { limit: 100 }));
    expect(exported.items.some((item: any) => item.memoryId === memoryId)).toBe(true);
    expect(exported.revisions.filter((item: any) => item.memoryId === memoryId)).toHaveLength(2);
    expect(exported.events.some((item: any) => item.sourceRef === 'task13-commit')).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('raw_text');
    expect(exported.truncated).toBe(false);

    const otherGet = await call(f.baseUrl, f.principalB.key, 'memory_get', { memoryId });
    expect(otherGet.result.isError).toBe(true);
    const otherSearch = body(await call(f.baseUrl, f.principalB.key, 'memory_search', {
      query: 'generated output drive F', limit: 10,
    }));
    expect(otherSearch.hits).toEqual([]);
    const otherForget = await call(f.baseUrl, f.principalB.key, 'memory_forget', { memoryId, reason: 'not owner' });
    expect(otherForget.result.isError).toBe(true);

    const forgotten = body(await call(f.baseUrl, f.principalA.key, 'memory_forget', {
      memoryId, reason: 'remove from active recall',
    }));
    expect(forgotten).toMatchObject({ memoryId, state: 'tombstoned', physicalDeletion: false });
    const after = body(await call(f.baseUrl, f.principalA.key, 'memory_get', { memoryId }));
    expect(after.memory.state).toBe('tombstoned');
    expect(after.revisions).toHaveLength(2);
    const searchAfter = body(await call(f.baseUrl, f.principalA.key, 'memory_search', {
      query: 'generated output drive F', limit: 10,
    }));
    expect(searchAfter.hits.map((hit: any) => hit.memoryId)).not.toContain(memoryId);
  });

  it('rejects malformed structured writes before persistence', async () => {
    const f = await fixture();
    const malformedCommit = await call(f.baseUrl, f.principalA.key, 'memory_commit', {
      canonicalKey: '', kind: 'fact', value: 'invalid',
    });
    expect(Boolean(malformedCommit.error) || malformedCommit.result?.isError === true).toBe(true);

    const malformedRevise = await call(f.baseUrl, f.principalA.key, 'memory_revise', {
      memoryId: 'not-a-uuid', value: 'invalid',
    });
    expect(Boolean(malformedRevise.error) || malformedRevise.result?.isError === true).toBe(true);

    const status = body(await call(f.baseUrl, f.principalA.key, 'memory_status'));
    expect(status.counts.active_items ?? 0).toBe(0);
  });
});
