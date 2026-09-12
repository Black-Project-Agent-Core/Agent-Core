import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { executionRuntimeLeasePath } from '../src/execution/runtime-lease.js';
import { EXECUTION_STATE_VERSION } from '../src/execution/types.js';
import { startAgentCoreService, type AgentCoreService } from '../src/index.js';
import { printCommand, sleepCommand } from './helpers/platform-command.js';
import { isolatedMemoryDependencies, strictMemoryConfig } from './helpers/memory-fixture.js';
import { engineeringTransport, prepareExecutionPlan } from './helpers/engineering.js';

const roots: string[] = [];
const services: AgentCoreService[] = [];

async function fixture(label: string): Promise<{ root: string; work: string; config: AppConfig }> {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `agent-core-exec-unified-${label}-`));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  await writeFile(path.join(work,'fixture.mjs'),'export const diagnostic = true;\n');
  const config = loadConfig({}, root);
  config.memory = await strictMemoryConfig(root);
  config.host = '127.0.0.1';
  config.port = 0;
  config.dataDir = path.join(root, 'runtime', 'data');
  config.logDir = path.join(root, 'runtime', 'logs');
  config.capabilityDir = path.join(root, 'capabilities');
  config.allowedRoots = [root];
  config.execution.enabled = true;
  config.execution.stateRoot = path.join(root, 'runtime', 'execution', 'state');
  config.execution.logRoot = path.join(root, 'runtime', 'execution', 'runs');
  return { root, work, config };
}

async function start(config: AppConfig) {
  const service = await startAgentCoreService(config, { memory: isolatedMemoryDependencies(config.memory) });
  services.push(service);
  return service;
}

async function fileSizeOrZero(filePath: string) {
  try { return (await stat(filePath)).size; } catch { return 0; }
}

/** Uncommitted execution transactions: the file-native store reports these as an integrity fault. */
async function pendingTransactions(stateRoot: string) {
  return (await readdir(path.join(stateRoot, 'journal'))).filter((name) => name.endsWith('.json'));
}

async function mcpCall(service: AgentCoreService, key: string, name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(`http://${service.host}:${service.port}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 701, method: 'tools/call', params: { name, arguments: args } }),
  });
  return await response.json() as Record<string, any>;
}

afterEach(async () => {
  for (const service of services.splice(0)) {
    try { await service.close(); } catch {}
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('unified Agent Core continuity + execution lifecycle', () => {
  it('reports memory, continuity, and execution independently through /health and agent_core_status', async () => {
    const { root, config } = await fixture('healthy');
    const service = await start(config);
    expect(service.execution.currentState).toBe('healthy');

    const healthResponse = await fetch(`http://${service.host}:${service.port}/health`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toMatchObject({
      status: 'ok',
      memory: { enabled: true, healthy: true, state: 'healthy', integrity: expect.stringMatching(/^file-native:ok/) },
      continuity: { enabled: true, healthy: true, snapshotReady: true, counts: expect.any(Object) },
      execution: { enabled: true, healthy: true, state: 'healthy', integrity: 'ok', activeRuns: 0, queuedSync: 0 },
    });

    const keyStore = new FileKeyStore(config.dataDir);
    const principal = await keyStore.create('unified-health-principal');
    const status = await mcpCall(service, principal.key, 'agent_core_status');
    expect(status.result.structuredContent).toMatchObject({
      memory: { healthy: true, state: 'healthy' },
      continuity: { enabled: true, healthy: true, snapshotReady: true },
      execution: { enabled: true, healthy: true, state: 'healthy', activeRuns: 0, queuedSync: 0 },
    });
    expect(status.result.structuredContent.workspaceRoots).toEqual([root]);
  });

  it('marks the execution lifecycle degraded when an integrity probe fails after a healthy open', async () => {
    const { root, config } = await fixture('integrity-probe');
    const service = await start(config);
    const scope = { principalId: 'integrity-probe-principal', projectId: root };
    expect(service.execution.currentState).toBe('healthy');

    // A transaction file left behind by a crashed writer is the file-native integrity fault.
    await writeFile(path.join(config.execution.stateRoot, 'journal', 'crashed-writer.json'), '{"op":"unfinished"}', 'utf8');

    const health = await service.execution.health(scope);
    expect(health).toMatchObject({ enabled: true, healthy: false, state: 'degraded', integrity: 'pending_transactions:1' });
    expect(service.execution.currentState).toBe('degraded');
    await expect(service.execution.create(scope, {
      objective: 'must fail closed after integrity degradation',
      nodes: [{ id: 'A', purpose: 'A', command: printCommand('A\\n'), cwd: root }],
    })).rejects.toThrow(/not open|degraded/i);
  });

  it('keeps OAuth/MCP available when the execution state root is unreadable and exposes execution as degraded separately', async () => {
    const { config } = await fixture('execution-corrupt');
    await mkdir(config.execution.stateRoot, { recursive: true });
    await writeFile(
      path.join(config.execution.stateRoot, 'state.json'),
      JSON.stringify({ stateVersion: EXECUTION_STATE_VERSION + 1, createdAt: Date.now() }),
      'utf8',
    );

    const service = await start(config);
    expect(service.server.listening).toBe(true);
    expect(service.execution.currentState).toBe('degraded');
    const health = await (await fetch(`http://${service.host}:${service.port}/health`)).json() as any;
    expect(health.status).toBe('ok');
    expect(health.memory.healthy).toBe(true);
    expect(health.execution).toMatchObject({ enabled: true, healthy: false, state: 'degraded' });

    const oauth = await fetch(`http://${service.host}:${service.port}/.well-known/oauth-authorization-server`);
    expect(oauth.status).toBe(200);
    const keyStore = new FileKeyStore(config.dataDir);
    const principal = await keyStore.create('execution-degraded-principal');
    const status = await mcpCall(service, principal.key, 'agent_core_status');
    expect(status.result.structuredContent.execution).toMatchObject({ enabled: true, healthy: false, state: 'degraded' });
  });

  it('keeps execution health visible but refuses new unbound work when memory is degraded', async () => {
    const { root, work, config } = await fixture('memory-corrupt');
    await mkdir(config.memory.fileNative.vaultRoot, { recursive: true });
    await writeFile(path.join(config.memory.fileNative.vaultRoot, 'corrupt.md'), 'no vault frontmatter here', 'utf8');
    const service = await start(config);
    const scope = { principalId: 'principal-memory-degraded', projectId: root };

    await expect(service.execution.create(scope, {
      objective: 'failure must remain factual while memory is degraded',
      continuityTaskId: 'task-degraded-memory',
      nodes: [{ id: 'A', purpose: 'fail factually', command: printCommand('', 'failure\n', 9), cwd: work }],
    })).rejects.toMatchObject({ code: 'WORKFLOW_CONTEXT_REQUIRED' });
    expect(await service.execution.store.listRuns(scope, 10)).toEqual([]);

    const health = await service.execution.health(scope);
    expect(health).toMatchObject({ enabled: true, healthy: true, state: 'healthy' });
    expect(health.queuedSync).toBe(0);
    const httpHealth = await (await fetch(`http://${service.host}:${service.port}/health`)).json() as any;
    expect(httpHealth.memory.healthy).toBe(false);
    expect(httpHealth.execution.healthy).toBe(true);
    expect(httpHealth.execution.queuedSync).toBe(0);
  }, 10_000);

  it('bounds graceful close even while an MCP transport remains connected', async () => {
    const { config } = await fixture('graceful-mcp-drain');
    const first = await start(config);
    const keyStore = new FileKeyStore(config.dataDir);
    const principal = await keyStore.create('graceful-mcp-drain-principal');
    const client = new Client({ name: 'graceful-mcp-drain-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://${first.host}:${first.port}/mcp`), {
      authProvider: { token: async () => principal.key },
    });
    let closePromise: Promise<void> | undefined;
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
      closePromise = first.close();
      const outcome = await Promise.race([
        closePromise.then(() => 'closed' as const),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 2_500)),
      ]);
      expect(outcome).toBe('closed');
    } finally {
      await client.close().catch(() => undefined);
      await closePromise?.catch(() => undefined);
      const index = services.indexOf(first);
      if (index >= 0) services.splice(index, 1);
    }
  }, 10_000);
  it('graceful service close stops new runs, interrupts active nodes, and leaves no held lease or pending transaction', async () => {
    const { root, work, config } = await fixture('graceful-close');
    const first = await start(config);
    const principal = await new FileKeyStore(config.dataDir).create('principal-graceful-close');
    const routedResult = await mcpCall(first, principal.key, 'capability_route', { task: 'Print a delayed diagnostic message', projectRoot: root });
    expect(routedResult.result.isError).not.toBe(true);
    const routed = JSON.parse(routedResult.result.content[0].text);
    const transport=engineeringTransport(async(name,args)=>{
      const raw=await mcpCall(first,principal.key,name,args);
      const result=JSON.parse(raw.result?.content?.[0]?.text??'{}');
      if(raw.result?.isError)throw Object.assign(new Error(result.error?.message),{code:result.error?.code});
      return result;
    },routed.routeContextId);
    const workflow=(await transport.status({} as any))!;
    const scope = { principalId: principal.metadata.id, projectId: root };
    const run = await first.execution.create(scope, {
      objective: 'long run interrupted by graceful service close',
      originRouteContextId: routed.routeContextId,
      continuityTaskId: routed.continuity?.taskId ?? routed.workflowContext.taskId,
      nodes: await prepareExecutionPlan(transport,workflow,[{ id: 'A', purpose: 'sleep', command: sleepCommand(30_000, 'started\n'), cwd: work, inputs: [] }]),
    });
    await first.execution.start(scope, run.runId);
    expect((await first.execution.status(scope, run.runId))?.nodes[0]?.state).toBe('running');

    await first.close();
    services.splice(services.indexOf(first), 1);
    await expect(first.execution.create(scope, {
      objective: 'must reject after close',
      nodes: [{ id: 'B', purpose: 'B', command: printCommand('B\n'), cwd: work }],
    })).rejects.toThrow(/closed|not open/i);
    expect(await fileSizeOrZero(executionRuntimeLeasePath(config.execution.stateRoot))).toBe(0);
    expect(await pendingTransactions(config.execution.stateRoot)).toEqual([]);

    const second = await start(config);
    const recovered = await second.execution.status(scope, run.runId);
    expect(recovered?.state).toBe('interrupted');
    expect(recovered?.nodes[0]?.state).toBe('interrupted');
  }, 15_000);
});
