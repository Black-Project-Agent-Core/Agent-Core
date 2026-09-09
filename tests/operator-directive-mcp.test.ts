import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const VERBATIM = 'instruksi verbatim : aku ingin kamu membantuku dengan men-install setiap kebutuhan alat bantu dalam pembangunan tanpa ragu untuk menunggu persetujuan, aku percaya dan mengizinkan sepenuhnya agar kamu bisa bantu aku install setiap alat kebutuhannya tanpa menunggu pertujuan lagi dan tidak perlu menundanya.';
const roots: string[] = [];
const servers: Server[] = [];
const loggers: FileAuditLogger[] = [];
const runtimes: RuntimeServices[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.operatorDirectives.close().catch(() => undefined);
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(persistentPrincipalId: string | null = 'persistent-operator') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-mcp-'));
  roots.push(root);
  const defaults = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory' }, root);
  const runtime = createRuntimeServices(
    [root],
    path.join(root, 'capabilities'),
    undefined,
    { ...defaults.memory, enabled: false, principalId: persistentPrincipalId },
    { ...defaults.execution, enabled: false },
    { ...defaults.github, enabled: false },
    undefined,
    defaults.observability,
    'test-version',
    defaults.maintenance,
    { ...defaults.langflow, enabled: false },
    defaults.operatorDirectives,
  );
  runtimes.push(runtime);

  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const keyA = await keyStore.create('operator-a');
  const keyB = await keyStore.create('operator-b');
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: logger,
    mcpHandler: createMcpHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { root, runtime, keyA, keyB, baseUrl };
}

async function mcp(baseUrl: string, key: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
  return await response.json() as any;
}

async function listTools(baseUrl: string, key: string) {
  const json = await mcp(baseUrl, key, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  return json.result.tools as Array<Record<string, any>>;
}

async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown> = {}) {
  return mcp(baseUrl, key, {
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args },
  });
}

function body(json: any): Record<string, any> {
  return JSON.parse(json.result.content[0].text) as Record<string, any>;
}

describe('operator directive MCP tools', () => {
  it('registers bounded status/set/revoke tools and expands the stable surface to 68', async () => {
    const { baseUrl, keyA } = await setup();
    const tools = await listTools(baseUrl, keyA.key);
    expect(tools).toHaveLength(72);
    const status = tools.find((tool) => tool.name === 'operator_directive_status');
    const set = tools.find((tool) => tool.name === 'operator_directive_set');
    const revoke = tools.find((tool) => tool.name === 'operator_directive_revoke');
    expect(status?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(set?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
    expect(revoke?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: false });
    expect(set?.inputSchema.properties.directiveKey).toMatchObject({ const: 'dev_tool_install_consent' });
  });

  it('sets standing consent only with explicitGrant=true and returns hashes without echoing verbatim text', async () => {
    const { baseUrl, keyA } = await setup();
    const set = await call(baseUrl, keyA.key, 'operator_directive_set', {
      directiveKey: 'dev_tool_install_consent',
      verbatimText: VERBATIM,
      explicitGrant: true,
    });
    expect(set.result.isError).not.toBe(true);
    const result = body(set);
    expect(result).toMatchObject({
      directiveKey: 'dev_tool_install_consent',
      active: true,
      revisionNo: 1,
      eventType: 'granted',
    });
    expect(result.verbatimSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain(VERBATIM);

    const denied = await call(baseUrl, keyA.key, 'operator_directive_set', {
      directiveKey: 'dev_tool_install_consent',
      verbatimText: VERBATIM,
      explicitGrant: false,
    });
    expect(denied.error ?? denied.result?.isError).toBeTruthy();
  });

  it('keeps directive status isolated when no persistent principal is configured', async () => {
    const { baseUrl, keyA, keyB } = await setup(null);
    await call(baseUrl, keyA.key, 'operator_directive_set', {
      directiveKey: 'dev_tool_install_consent', verbatimText: VERBATIM, explicitGrant: true,
    });
    const statusA = body(await call(baseUrl, keyA.key, 'operator_directive_status'));
    const statusB = body(await call(baseUrl, keyB.key, 'operator_directive_status'));
    expect(statusA.activeDirectiveCount).toBe(1);
    expect(statusB.activeDirectiveCount).toBe(0);
    expect(JSON.stringify(statusA)).not.toContain(VERBATIM);
  });

  it('shares authority across key rotation and invalidates prior captured routes on revision and revoke', async () => {
    const { root, runtime, keyA, keyB, baseUrl } = await setup('persistent-operator');
    await call(baseUrl, keyA.key, 'operator_directive_set', {
      directiveKey: 'dev_tool_install_consent', verbatimText: VERBATIM, explicitGrant: true,
    });
    const routedA = body(await call(baseUrl, keyA.key, 'capability_route', {
      task: 'Read a local project file.', projectRoot: root,
    }));
    expect(runtime.routes.get(routedA.routeContextId)).not.toBeNull();

    const revised = body(await call(baseUrl, keyB.key, 'operator_directive_set', {
      directiveKey: 'dev_tool_install_consent',
      verbatimText: `${VERBATIM} revised`,
      explicitGrant: true,
    }));
    expect(revised.revisionNo).toBe(2);
    expect(revised.invalidatedRoutes).toBeGreaterThanOrEqual(1);
    expect(runtime.routes.get(routedA.routeContextId)).toBeNull();

    const routedB = body(await call(baseUrl, keyB.key, 'capability_route', {
      task: 'Read another local project file.', projectRoot: root,
    }));
    expect(runtime.routes.get(routedB.routeContextId)).not.toBeNull();

    const revoked = body(await call(baseUrl, keyB.key, 'operator_directive_revoke', {
      directiveKey: 'dev_tool_install_consent', reason: 'user explicitly revoked standing consent',
    }));
    expect(revoked).toMatchObject({ active: false, revisionNo: 3, eventType: 'revoked' });
    expect(revoked.invalidatedRoutes).toBeGreaterThanOrEqual(1);
    expect(runtime.routes.get(routedB.routeContextId)).toBeNull();
    const status = body(await call(baseUrl, keyA.key, 'operator_directive_status'));
    expect(status.activeDirectiveCount).toBe(0);
  });
});

