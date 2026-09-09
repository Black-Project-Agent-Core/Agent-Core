import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import type { AppConfig } from '../src/config.js';
import { startAgentCoreService, type AgentCoreService } from '../src/index.js';
import { SERVER_VERSION } from '../src/mcp/server.js';
import {
  databaseFilesUnder, memoryAppConfig, memoryRoot, memoryRuntimeFiles, strictMemoryConfig, isolatedMemoryDependencies,
} from './helpers/memory-fixture.js';

const roots: string[] = [];
const services: AgentCoreService[] = [];
const memoryDependencies=new WeakMap<AppConfig,ReturnType<typeof isolatedMemoryDependencies>>();

async function fixtureConfig(): Promise<{ root: string; config: AppConfig }> {
  const root = await memoryRoot('memory-unified');
  roots.push(root);
  const config = await memoryAppConfig(root);
  config.memory=await strictMemoryConfig(root);
  config.host = '127.0.0.1';
  config.port = 0;
  config.dataDir = path.join(root, 'runtime', 'data');
  config.logDir = path.join(root, 'runtime', 'logs');
  config.capabilityDir = path.join(root, 'capabilities');
  config.allowedRoots = [root];
  return { root, config };
}

async function start(config: AppConfig): Promise<AgentCoreService> {
  const memory=memoryDependencies.get(config)??isolatedMemoryDependencies(config.memory);
  memoryDependencies.set(config,memory);
  const service = await startAgentCoreService(config,{memory});
  services.push(service);
  return service;
}

async function mcpCall(service: AgentCoreService, key: string, name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(`http://${service.host}:${service.port}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 170, method: 'tools/call', params: { name, arguments: args } }),
  });
  return await response.json() as Record<string, any>;
}

function textBody(result: Record<string, any>) {
  return JSON.parse(result.result.content[0].text) as Record<string, any>;
}

afterEach(async () => {
  for (const service of services.splice(0)) {
    try { await service.close(); } catch {}
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('unified Agent Core deterministic memory lifecycle', () => {
  it('warms configured memory, reports health, checkpoints cleanly, and rehydrates the same vault after restart', async () => {
    const { root, config } = await fixtureConfig();
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.fileNative.vaultRoot).toBe(path.join(root, 'runtime', 'memory', 'vault'));

    const first = await start(config);
    expect(first.memory.currentState).toBe('healthy');
    // Checked before anything else can throw: booting a file-native runtime creates no database file.
    expect(await databaseFilesUnder(root)).toEqual([]);

    const health = await fetch(`http://${first.host}:${first.port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      status: 'ok',
      service: 'agent-core',
      version: SERVER_VERSION,
      memory: { enabled: true, healthy: true, state: 'healthy', integrity: expect.stringMatching(/^file-native:ok/) },
    });

    const keyStore = new FileKeyStore(config.dataDir);
    const principal = await keyStore.create('lifecycle-principal');
    const status = await mcpCall(first, principal.key, 'agent_core_status');
    expect(status.result.structuredContent.memory).toMatchObject({
      enabled: true,
      healthy: true,
      state: 'healthy',
      integrity: expect.stringMatching(/^file-native:ok/),
    });

    const scope = { principalId: principal.metadata.id, projectId: root };
    const committed = await first.memory.commit({
      scope,
      canonicalKey: 'decision.lifecycle.rehydrate',
      kind: 'decision',
      value: 'The unified launcher must rehydrate the same deterministic memory vault.',
      sourceType: 'test',
    });

    await first.close();
    services.splice(services.indexOf(first), 1);
    // A clean close leaves the vault fully applied: no atomic-replace temporaries, no journal residue.
    expect((await memoryRuntimeFiles(root)).filter((file) => file.endsWith('.tmp'))).toEqual([]);

    const second = await start(config);
    expect(second.memory.currentState).toBe('healthy');
    const recall = await second.memory.search({ scope, query: 'unified launcher rehydrate deterministic memory vault', limit: 10 });
    expect(recall.hits.map((hit) => hit.memoryId)).toContain(committed.memoryId);
    expect((await memoryRuntimeFiles(root)).filter((file) => file.endsWith('.md')).length).toBeGreaterThan(0);
    await second.close();
    services.splice(services.indexOf(second), 1);
    // A file-native runtime never creates an embedded database file anywhere under the root.
    expect(await databaseFilesUnder(root)).toEqual([]);
  });

  it('keeps OAuth and MCP alive when the memory vault is unreadable and exposes degraded memory instead of invented context', async () => {
    const { root, config } = await fixtureConfig();
    // The vault root is a directory; a plain file in its place is the file-native unreadable-store case.
    await mkdir(path.dirname(config.memory.fileNative.vaultRoot), { recursive: true });
    await writeFile(config.memory.fileNative.vaultRoot, 'this is not an Obsidian vault', 'utf8');

    const service = await start(config);
    expect(service.server.listening).toBe(true);
    expect(service.memory.currentState).toBe('degraded');
    // A degraded vault must not tempt the runtime into an embedded database fallback either.
    expect(await databaseFilesUnder(root)).toEqual([]);

    const health = await fetch(`http://${service.host}:${service.port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      status: 'ok',
      service: 'agent-core',
      memory: { enabled: true, healthy: false, state: 'degraded' },
    });

    const oauth = await fetch(`http://${service.host}:${service.port}/.well-known/oauth-authorization-server`);
    expect(oauth.status).toBe(200);
    expect(await oauth.json()).toMatchObject({ grant_types_supported: ['authorization_code', 'refresh_token'] });

    const keyStore = new FileKeyStore(config.dataDir);
    const principal = await keyStore.create('degraded-memory-principal');
    const routed = textBody(await mcpCall(service, principal.key, 'capability_route', { task: 'Create a small proof file' }));
    expect(routed).toMatchObject({error:{code:'MEMORY_PREFLIGHT_REQUIRED'}});
    expect(routed.memoryContextId).toBeUndefined();
    const status = await mcpCall(service, principal.key, 'agent_core_status');
    expect(status.result.structuredContent.memory).toMatchObject({ enabled: true, healthy: false, state: 'degraded' });
    // Drain asynchronous audit writes before inspecting the final persistence layout.
    await service.close();
    services.splice(services.indexOf(service), 1);
    const unexpectedFiles = await databaseFilesUnder(root);
    expect(unexpectedFiles, JSON.stringify(unexpectedFiles)).toEqual([]);
  });
});
