import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  OPERATOR_DIRECTIVE_CATALOG,
  OPERATOR_DIRECTIVE_KEYS,
} from '../src/operator-directives/catalog.js';
import { OperatorDirectiveService } from '../src/operator-directives/service.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import { startAgentCoreService } from '../src/index.js';

const VERBATIM = 'instruksi verbatim : aku ingin kamu membantuku dengan men-install setiap kebutuhan alat bantu dalam pembangunan tanpa ragu untuk menunggu persetujuan, aku percaya dan mengizinkan sepenuhnya agar kamu bisa bantu aku install setiap alat kebutuhannya tanpa menunggu pertujuan lagi dan tidak perlu menundanya.';
const roots: string[] = [];
const services: OperatorDirectiveService[] = [];

async function serviceFixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-operator-service-${label}-`));
  roots.push(root);
  const config = loadConfig({}, root).operatorDirectives;
  const service = new OperatorDirectiveService(config);
  services.push(service);
  return { root, service };
}

function setInput(principalId = 'stable-principal', verbatimText = VERBATIM) {
  return {
    principalId,
    directiveKey: 'dev_tool_install_consent' as const,
    verbatimText,
    explicitGrant: true as const,
    actorKeyId: 'key-a',
    authenticationMode: 'bearer-api-key' as const,
  };
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('operator directive catalog and config', () => {
  it('ships only the bounded development-tool consent semantic in v1', () => {
    expect(OPERATOR_DIRECTIVE_KEYS).toEqual(['dev_tool_install_consent']);
    expect(OPERATOR_DIRECTIVE_CATALOG.dev_tool_install_consent).toMatchObject({
      directiveKey: 'dev_tool_install_consent',
      category: 'standing_consent',
      scope: 'principal_global',
      trustClass: 'authenticated_user_explicit',
      effect: 'allow_benign_development_dependency_install_without_chat_reconfirmation',
      effectVersion: 1,
      expandsAgentCoreToolPermissions: false,
      bypassesSafetyPolicy: false,
      bypassesOsAuthorization: false,
    });
    expect(OPERATOR_DIRECTIVE_CATALOG.dev_tool_install_consent.promptContext)
      .toContain('without asking for another chat-level confirmation');
  });

  it('defaults to a dedicated local sqlite database', () => {
    const baseDir = path.resolve('C:\\fixture\\agent-core');
    const config = loadConfig({}, baseDir);
    expect(config.operatorDirectives).toMatchObject({
      enabled: true,
      busyTimeoutMs: 5_000,
      schemaVersion: 1,
    });
    expect(config.operatorDirectives.dbPath.replaceAll('\\', '/'))
      .toMatch(/\/runtime\/operator-directives\/operator-directives\.sqlite$/);
  });
});

describe('OperatorDirectiveService', () => {
  it('builds the same authority snapshot hash across reopen/time differences', async () => {
    const first = await serviceFixture('first');
    const second = await serviceFixture('second');
    await first.service.set({ ...setInput(), now: 1000 });
    await second.service.set({ ...setInput(), now: 9000 });

    const left = await first.service.snapshot('stable-principal');
    const right = await second.service.snapshot('stable-principal');
    expect(left.status).toBe('healthy');
    expect(left.snapshotHash).toBe(right.snapshotHash);
    expect(left.directives).toHaveLength(1);
    expect(left.directives[0]).toMatchObject({
      directiveKey: 'dev_tool_install_consent',
      trust: 'authenticated_user_explicit',
      scope: 'principal_global',
      effect: 'allow_benign_development_dependency_install_without_chat_reconfirmation',
      effectVersion: 1,
      active: true,
      verbatimText: VERBATIM,
    });
  });

  it('derives semantics from catalog and ignores arbitrary effect-like caller fields', async () => {
    const { service } = await serviceFixture('catalog-authority');
    await service.set({
      ...setInput(),
      effect: 'allow_everything',
      bypassesSafetyPolicy: true,
      expandsAgentCoreToolPermissions: true,
    } as any);
    const snapshot = await service.snapshot('stable-principal');
    expect(snapshot.directives[0]).toMatchObject({
      effect: 'allow_benign_development_dependency_install_without_chat_reconfirmation',
      expandsAgentCoreToolPermissions: false,
      bypassesSafetyPolicy: false,
      bypassesOsAuthorization: false,
    });
    expect(snapshot.promptContext).not.toContain('allow_everything');
  });

  it('excludes revoked directives from trusted snapshots', async () => {
    const { service } = await serviceFixture('revoke');
    await service.set(setInput());
    await service.revoke({
      principalId: 'stable-principal',
      directiveKey: 'dev_tool_install_consent',
      actorKeyId: 'key-a',
      authenticationMode: 'bearer-api-key',
      reason: 'user revoked standing consent',
    });
    const snapshot = await service.snapshot('stable-principal');
    expect(snapshot.status).toBe('healthy');
    expect(snapshot.directives).toEqual([]);
    expect(snapshot.promptContext).toBe('');
  });

  it('keeps directive ownership scoped to the stable principal supplied by the caller', async () => {
    const { service } = await serviceFixture('principal');
    await service.set(setInput('persistent-principal'));
    expect((await service.snapshot('persistent-principal')).directives).toHaveLength(1);
    expect((await service.snapshot('rotated-key-id')).directives).toEqual([]);
  });

  it('fails conservatively with degraded/no trusted directives when the database cannot open', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-service-degraded-'));
    roots.push(root);
    const directoryInsteadOfDb = path.join(root, 'db-is-directory');
    await mkdir(directoryInsteadOfDb);
    const service = new OperatorDirectiveService({
      enabled: true,
      dbPath: directoryInsteadOfDb,
      busyTimeoutMs: 5_000,
      schemaVersion: 1,
    });
    services.push(service);
    const snapshot = await service.snapshot('stable-principal');
    expect(snapshot).toMatchObject({ status: 'degraded', directives: [], promptContext: '' });
    expect(snapshot.snapshotHash).toBeNull();
  });

  it('returns bounded status without verbatim or secret-like fields', async () => {
    const { service } = await serviceFixture('status');
    await service.set(setInput());
    const status = await service.status('stable-principal');
    expect(status).toMatchObject({
      enabled: true,
      healthy: true,
      state: 'healthy',
      schemaVersion: 1,
      activeDirectiveCount: 1,
      integrity: 'ok',
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(VERBATIM);
    expect(serialized.toLowerCase()).not.toContain('api_key');
    expect(serialized.toLowerCase()).not.toContain('bearer');
  });
});


describe('operator directive runtime lifecycle', () => {
  it('wires the directive service into runtime and exposes only bounded health', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-runtime-'));
    roots.push(root);
    const defaults = loadConfig({}, root);
    const runtime = createRuntimeServices(
      [root],
      path.join(root, 'capabilities'),
      undefined,
      { ...defaults.memory, enabled: false },
      { ...defaults.execution, enabled: true, dbPath: path.join(root, 'runtime', 'execution.sqlite'), logRoot: path.join(root, 'runtime', 'runs') },
      { ...defaults.github, enabled: false },
      undefined,
      defaults.observability,
      'test-version',
      defaults.maintenance,
      { ...defaults.langflow, enabled: false },
      defaults.operatorDirectives,
    ) as ReturnType<typeof createRuntimeServices> & { operatorDirectives?: OperatorDirectiveService };
    try {
      expect(runtime.operatorDirectives).toBeDefined();
      await runtime.execution.open();
      await runtime.operatorDirectives!.set(setInput('stable-principal'));
      const health = await runtime.healthMetrics.getMetrics({ principalId: 'stable-principal', projectId: root }) as any;
      expect(health.operatorDirectives).toMatchObject({
        enabled: true,
        healthy: true,
        schemaVersion: 1,
        activeDirectiveCount: 1,
        integrity: 'ok',
      });
      const serialized = JSON.stringify(health.operatorDirectives);
      expect(serialized).not.toContain(VERBATIM);
      expect(serialized).not.toContain('key-a');
    } finally {
      await runtime.operatorDirectives?.close().catch(() => undefined);
      await runtime.execution.close().catch(() => undefined);
      await runtime.memory.close().catch(() => undefined);
    }
  });
});


describe('operator directive service startup integration', () => {
  it('honors the configured operator-directive lifecycle in startAgentCoreService', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-startup-'));
    roots.push(root);
    const config = loadConfig({}, root);
    config.port = 0;
    config.allowedRoots = [root];
    config.dataDir = path.join(root, 'data');
    config.logDir = path.join(root, 'logs');
    config.capabilityDir = path.join(root, 'capabilities');
    config.memory = { ...config.memory, enabled: false };
    config.execution = {
      ...config.execution,
      enabled: true,
      dbPath: path.join(root, 'runtime', 'execution.sqlite'),
      logRoot: path.join(root, 'runtime', 'runs'),
    };
    config.github = { ...config.github, enabled: false };
    config.langflow = { ...config.langflow, enabled: false };
    config.operatorDirectives = {
      ...config.operatorDirectives,
      enabled: false,
      dbPath: path.join(root, 'custom', 'must-not-open.sqlite'),
    };

    const running = await startAgentCoreService(config);
    try {
      const metrics = await fetch(`http://${running.host}:${running.port}/health/metrics`).then((response) => response.json()) as any;
      expect(metrics.operatorDirectives).toMatchObject({
        enabled: false,
        healthy: false,
        state: 'disabled',
        activeDirectiveCount: 0,
        integrity: 'disabled',
      });
    } finally {
      await running.close();
    }
  });
});
