import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  OPERATOR_DIRECTIVE_CATALOG,
  OPERATOR_DIRECTIVE_KEYS,
} from '../src/operator-directives/catalog.js';
import { OperatorDirectiveService } from '../src/operator-directives/service.js';

const VERBATIM = 'instruksi verbatim : aku ingin kamu membantuku dengan men-install setiap kebutuhan alat bantu dalam pembangunan tanpa ragu untuk menunggu persetujuan, aku percaya dan mengizinkan sepenuhnya agar kamu bisa bantu aku install setiap alat kebutuhannya tanpa menunggu pertujuan lagi dan tidak perlu menundanya.';
const roots: string[] = [];
const services: OperatorDirectiveService[] = [];

async function serviceFixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-operator-service-${label}-`));
  roots.push(root);
  const config = loadConfig({}, root).operatorDirectives;
  const service = new OperatorDirectiveService(config);
  services.push(service);
  return { root, config, service };
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

  it('defaults to a dedicated local file-native state root', () => {
    const baseDir = path.resolve('C:\\fixture\\agent-core');
    const config = loadConfig({}, baseDir);
    expect(config.operatorDirectives).toMatchObject({
      enabled: true,
      lockTimeoutMs: 5_000,
      stateVersion: 1,
    });
    expect(config.operatorDirectives.stateRoot.replaceAll('\\', '/'))
      .toMatch(/\/runtime\/operator-directives\/state$/);
    expect(JSON.stringify(config.operatorDirectives).toLowerCase()).not.toContain('.db');
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

  it('survives a restart against the same state root', async () => {
    const { root, config, service } = await serviceFixture('restart');
    await service.set(setInput());
    const before = await service.snapshot('stable-principal');
    await service.close();

    const restarted = new OperatorDirectiveService(config);
    services.push(restarted);
    const after = await restarted.snapshot('stable-principal');
    expect(after.status).toBe('healthy');
    expect(after.snapshotHash).toBe(before.snapshotHash);
    expect(after.directives).toHaveLength(1);
    expect(await readdir(path.join(config.stateRoot, 'events'))).toHaveLength(1);
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

  it('fails conservatively with degraded/no trusted directives when the state root is unusable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-service-degraded-'));
    roots.push(root);
    const fileInsteadOfStateRoot = path.join(root, 'state-is-a-file');
    await writeFile(fileInsteadOfStateRoot, 'not a directory', 'utf8');
    const service = new OperatorDirectiveService({
      enabled: true,
      stateRoot: fileInsteadOfStateRoot,
      lockTimeoutMs: 5_000,
      stateVersion: 1,
    });
    services.push(service);
    const snapshot = await service.snapshot('stable-principal');
    expect(snapshot).toMatchObject({ status: 'degraded', directives: [], promptContext: '' });
    expect(snapshot.snapshotHash).toBeNull();
    expect((await service.status('stable-principal')).integrity).toContain('degraded:');
  });

  it('reports degraded instead of trusted directives when the event stream is corrupt', async () => {
    const { config, service } = await serviceFixture('corrupt');
    await service.set(setInput());
    await service.close();

    const events = path.join(config.stateRoot, 'events');
    const [name] = await readdir(events);
    await writeFile(path.join(events, name!), `${JSON.stringify({ seq: 1, hash: 'not-a-real-hash', prevHash: '' })}\n`, 'utf8');

    const restarted = new OperatorDirectiveService(config);
    services.push(restarted);
    const snapshot = await restarted.snapshot('stable-principal');
    expect(snapshot).toMatchObject({ status: 'degraded', snapshotHash: null, directives: [] });
    expect((await restarted.status('stable-principal')).integrity).toContain('OPERATOR_DIRECTIVE_EVENT_STREAM_CORRUPT');
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

  it('stays disabled without touching the state root when the feature is off', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-service-disabled-'));
    roots.push(root);
    const stateRoot = path.join(root, 'must-not-be-created');
    const service = new OperatorDirectiveService({ enabled: false, stateRoot, lockTimeoutMs: 5_000, stateVersion: 1 });
    services.push(service);
    expect(await service.status('stable-principal')).toMatchObject({
      enabled: false,
      healthy: false,
      state: 'disabled',
      activeDirectiveCount: 0,
      integrity: 'disabled',
    });
    expect(await service.snapshot('stable-principal')).toMatchObject({ status: 'disabled', snapshotHash: null, directives: [] });
    await expect(service.set(setInput())).rejects.toThrow('OPERATOR_DIRECTIVES_DISABLED');
    expect(await readdir(root)).toEqual([]);
  });
});
