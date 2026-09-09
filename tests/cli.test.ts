import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { ExecutionService } from '../src/execution/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { printCommand } from './helpers/platform-command.js';
import { runCli, type CliOptions } from '../src/cli.js';
import type { MemoryScope } from '../src/memory/types.js';

const roots: string[] = [];

async function cliHarness(env: Record<string, string> = {}, extra: Partial<CliOptions> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-cli-'));
  roots.push(root);
  const dataDir = path.join(root, 'data');
  const config = loadConfig(env, root);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const execute = (args: string[]) => runCli(args, {
    dataDir,
    config,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    ...extra,
  });
  return { root, dataDir, config, stdout, stderr, execute };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Core key CLI', () => {
  it('creates a key and lists only non-secret metadata', async () => {
    const harness = await cliHarness();
    expect(await harness.execute(['create-key', 'chatgpt'])).toBe(0);

    const created = JSON.parse(harness.stdout.at(-1)!) as { key: string; metadata: { id: string } };
    expect(created.key).toMatch(/^agent_core_live_/);

    harness.stdout.length = 0;
    expect(await harness.execute(['list-keys'])).toBe(0);
    const listedText = harness.stdout.join('\n');
    const listed = JSON.parse(listedText) as Array<{ id: string; name: string }>;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: created.metadata.id, name: 'chatgpt' });
    expect(listedText).not.toContain(created.key);
  });

  it('revokes an existing key and reports revoked metadata on list', async () => {
    const harness = await cliHarness();
    await harness.execute(['create-key', 'revoke-cli']);
    const created = JSON.parse(harness.stdout.at(-1)!) as { metadata: { id: string } };

    harness.stdout.length = 0;
    expect(await harness.execute(['revoke-key', created.metadata.id])).toBe(0);
    expect(JSON.parse(harness.stdout.at(-1)!)).toMatchObject({
      id: created.metadata.id,
      revoked: true,
    });

    harness.stdout.length = 0;
    await harness.execute(['list-keys']);
    const listed = JSON.parse(harness.stdout.at(-1)!) as Array<{ revokedAt: string | null }>;
    expect(listed[0]?.revokedAt).toBeTruthy();
  });

  it('rotates through the CLI and invalidates the prior key', async () => {
    const harness = await cliHarness();
    await harness.execute(['create-key', 'rotate-cli']);
    const original = JSON.parse(harness.stdout.at(-1)!) as { key: string; metadata: { id: string } };

    harness.stdout.length = 0;
    expect(await harness.execute(['rotate-key', original.metadata.id])).toBe(0);
    const rotated = JSON.parse(harness.stdout.at(-1)!) as { key: string; metadata: { id: string } };
    expect(rotated.key).toMatch(/^agent_core_live_/);
    expect(rotated.key).not.toBe(original.key);

    const store = new FileKeyStore(harness.dataDir);
    expect(await store.verify(original.key)).toBeNull();
    expect((await store.verify(rotated.key))?.id).toBe(rotated.metadata.id);
  });

  it('returns a nonzero code for incomplete or unknown commands', async () => {
    const harness = await cliHarness();
    expect(await harness.execute(['create-key'])).not.toBe(0);
    expect(await harness.execute(['unknown-command'])).not.toBe(0);
    expect(harness.stderr.join('\n')).toContain('Usage:');
  });
});

describe('Agent Core OAuth reset CLI', () => {
  it('resets grants from the canonical data directory and imports legacy clients', async () => {
    const harness = await cliHarness();
    const { FileOAuthStore } = await import('../src/oauth/store.js');
    const keyStore = new FileKeyStore(harness.dataDir);
    const key = await keyStore.create('custom-local-cli');
    const activeStore = new FileOAuthStore(harness.dataDir);
    const activeClient = await activeStore.registerClient({
      clientName: 'Existing', redirectUris: ['https://chatgpt.com/connector/oauth/existing'],
      grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'],
      tokenEndpointAuthMethod: 'client_secret_post',
    });
    const tokens = await activeStore.issueTokens({
      clientId: activeClient.client_id, resource: 'https://example.test/mcp', scopes: ['mcp:tools'],
      keyId: key.metadata.id, keyName: key.metadata.name,
    });
    const legacyDir = path.join(path.dirname(harness.dataDir), 'data-current');
    const legacyStore = new FileOAuthStore(legacyDir);
    const legacyClient = await legacyStore.registerClient({
      clientName: 'ChatGPT', redirectUris: ['https://chatgpt.com/connector/oauth/QTOb4VcHdCsW'],
      grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'],
      tokenEndpointAuthMethod: 'client_secret_post',
    });

    harness.stdout.length = 0;
    expect(await harness.execute(['reset-oauth', legacyDir])).toBe(0);
    const result = JSON.parse(harness.stdout.at(-1)!);
    expect(result).toMatchObject({ clientsImported: 1, grantsCleared: true });
    expect(await activeStore.getClient(legacyClient.client_id)).not.toBeNull();
    expect(await activeStore.verifyAccessToken(tokens.accessToken)).toBeNull();
    expect((await keyStore.verify(key.key))?.id).toBe(key.metadata.id);
  });

  it('repairs identity without demanding a loadable runtime config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-cli-repair-'));
    roots.push(root);
    const dataDir = path.join(root, 'data');
    const stdout: string[] = [];
    const stderr: string[] = [];
    // No `config`: a broken runtime config must not block rebuilding the credential snapshot.
    const execute = (args: string[]) => runCli(args, {
      dataDir,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(await execute(['reset-oauth'])).toBe(0);
    expect(JSON.parse(stdout.at(-1)!)).toMatchObject({ clientsPreserved: 0, grantsCleared: true });

    stdout.length = 0;
    expect(await execute(['create-key', 'recovered'])).toBe(0);
    const created = JSON.parse(stdout.at(-1)!) as { key: string };
    expect((await new FileKeyStore(dataDir).verify(created.key))?.name).toBe('recovered');
    expect(stderr).toEqual([]);
  });
});


describe('Agent Core execution recovery CLI', () => {
  async function seedExecution(harness: Awaited<ReturnType<typeof cliHarness>>) {
    const work = path.join(harness.root, 'work');
    await mkdir(work, { recursive: true });
    const service = new ExecutionService(harness.config.execution, new WorkspacePolicy([harness.root]));
    const scope = { principalId: 'principal-cli-execution', projectId: harness.root };
    await service.open();
    const run = await service.create(scope, {
      objective: 'cli recovery fixture',
      nodes: [{ id: 'A', purpose: 'cli', command: printCommand('cli-output\n'), cwd: work }],
    });
    await service.start(scope, run.runId);
    const deadline = Date.now() + 5_000;
    let status = await service.status(scope, run.runId);
    while (status?.state === 'running' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      status = await service.status(scope, run.runId);
    }
    expect(status?.state).toBe('completed');
    await service.close();
    return { work, scope, runId: run.runId };
  }

  it('creates a verified execution recovery bundle from the stopped runtime', async () => {
    const harness = await cliHarness();
    await seedExecution(harness);
    expect(await harness.execute(['execution-backup', 'cli-test'])).toBe(0);
    const output = JSON.parse(harness.stdout.at(-1)!) as any;
    expect(output.manifest).toMatchObject({
      format: 'agent-core-execution-recovery-bundle',
      version: 2,
      reason: 'cli-test',
    });
    expect(output.bundlePath).toContain('recovery-bundles');
  });

  it('refuses execution restore through CLI while the runtime lease is live', async () => {
    const harness = await cliHarness();
    await seedExecution(harness);
    expect(await harness.execute(['execution-backup', 'restore-source'])).toBe(0);
    const backup = JSON.parse(harness.stdout.at(-1)!) as { bundlePath: string };

    const live = new ExecutionService(harness.config.execution, new WorkspacePolicy([harness.root]));
    await live.open();
    harness.stdout.length = 0;
    expect(await harness.execute(['execution-restore', backup.bundlePath])).toBe(1);
    expect(harness.stderr.at(-1)).toContain('Execution runtime is active');
    await live.close();
  });

  it('writes a dry-run retention plan and validates apply arguments before mutation', async () => {
    const harness = await cliHarness();
    await seedExecution(harness);
    expect(await harness.execute(['execution-retention-plan', '0'])).toBe(0);
    const planned = JSON.parse(harness.stdout.at(-1)!) as any;
    expect(planned.plan).toMatchObject({ format: 'agent-core-execution-retention-plan', version: 1, dryRun: true });
    expect(planned.plan.candidates.length).toBeGreaterThan(0);

    harness.stderr.length = 0;
    expect(await harness.execute(['execution-retention-apply', planned.planPath])).toBe(2);
    expect(harness.stderr.at(-1)).toContain('Usage:');
  });
});

describe('Agent Core memory hydrate CLI', () => {
  const remoteEnv = {
    AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
    AGENT_CORE_MEMORY_REMOTE_OWNER: 'agent-core',
    AGENT_CORE_MEMORY_REMOTE_REPO: 'agent-core-memory',
    AGENT_CORE_MEMORY_REMOTE_KEY_FILE: 'runtime/memory/remote-key.pem',
  };

  it('hydrates the file-native vault root and refuses when no memory remote is configured', async () => {
    const hydrateCalls: Array<[MemoryScope, string]> = [];
    const remote = await cliHarness(remoteEnv, {
      memoryHydrate: async (scope, vaultRoot) => {
        hydrateCalls.push([scope, vaultRoot]);
        return { state: 'REMOTE_EMPTY_CONFIRMED', remoteHead: null };
      },
    });
    expect(await remote.execute(['memory-hydrate', 'principal-hydrate', remote.root])).toBe(0);
    expect(hydrateCalls).toEqual([[
      { principalId: 'principal-hydrate', projectId: remote.root },
      remote.config.memory.fileNative.vaultRoot,
    ]]);
    expect(JSON.parse(remote.stdout.at(-1)!)).toMatchObject({ state: 'REMOTE_EMPTY_CONFIRMED' });

    const offline = await cliHarness({}, {
      memoryHydrate: async () => { throw new Error('hydration must not run without a configured remote'); },
    });
    expect(await offline.execute(['memory-hydrate', 'principal-hydrate', offline.root])).toBe(1);
    expect(offline.stderr.at(-1)).toBe('MEMORY_REMOTE_DISABLED');
  });
});

describe('Agent Core audit verification CLI', () => {
  it('verifies a local audit chain read-only and reports tamper failure nonzero', async () => {
    const harness = await cliHarness();
    const { AuditJournal } = await import('../src/observability/audit-journal.js');
    const journal = new AuditJournal(path.join(harness.root, 'logs'));
    journal.enqueue({ category: 'fixture', event: 'cli-verify', data: { ok: true } });
    await journal.drain();

    harness.stdout.length = 0;
    expect(await harness.execute(['audit-verify', journal.auditRoot])).toBe(0);
    expect(JSON.parse(harness.stdout.at(-1)!)).toMatchObject({ ok: true, records: 1 });

    const { readFile, writeFile } = await import('node:fs/promises');
    const text = await readFile(journal.filePath, 'utf8');
    await writeFile(journal.filePath, text.replace('"ok":true', '"ok":false'), 'utf8');
    harness.stdout.length = 0;
    expect(await harness.execute(['audit-verify', journal.auditRoot])).toBe(1);
    expect(JSON.parse(harness.stdout.at(-1)!)).toMatchObject({ ok: false, code: 'AUDIT_RECORD_HASH_MISMATCH' });
  });
});
