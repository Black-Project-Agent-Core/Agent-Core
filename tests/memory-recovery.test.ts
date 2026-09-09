import { cp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryService } from '../src/memory/service.js';
import { memoryFixture } from './helpers/memory-fixture.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

async function fixture(label: string) {
  const f = await memoryFixture(`recovery-${label}`);
  roots.push(f.root);
  return { ...f, scope: { principalId: 'p-recovery', projectId: f.root } };
}

describe('file-native memory recovery', () => {
  it('copies the whole vault into a timestamped backup that restores byte-for-byte while stopped', async () => {
    const f = await fixture('backup');
    const committed = await f.service.commit({
      scope: f.scope, canonicalKey: 'decision.backup.subject', kind: 'decision',
      value: 'Backups copy the canonical Markdown vault, not a database file.', sourceType: 'test',
    });
    const backup = await f.service.backup('scheduled check');
    expect(backup.reason).toBe('scheduled check');
    expect(backup.backupPath).toContain(path.join('runtime', 'memory', 'backups'));
    expect((await readdir(backup.backupPath)).length).toBeGreaterThan(0);

    await f.service.commit({
      scope: f.scope, canonicalKey: 'decision.backup.subject', kind: 'decision',
      value: 'Backups still copy the canonical Markdown vault after a later revision.',
      sourceType: 'test', revisionAuthority: 'structured_state',
    });
    await f.service.close();

    await rm(f.config.fileNative.vaultRoot, { recursive: true, force: true });
    await cp(backup.backupPath, f.config.fileNative.vaultRoot, { recursive: true });

    const restored = new MemoryService(f.config);
    expect((await restored.getMemory(f.scope, committed.memoryId))?.valueText).toContain('not a database file');
    expect((await restored.status(f.scope)).healthy).toBe(true);
    await restored.close();
  });

  it('refuses to overwrite an existing backup target instead of silently replacing durable history', async () => {
    const f = await fixture('collision');
    await f.service.commit({ scope: f.scope, canonicalKey: 'fact.backup.collision', kind: 'fact', value: 'one', sourceType: 'test' });
    const first = await f.service.backup('manual');
    await expect(cp(f.config.fileNative.vaultRoot, first.backupPath, { recursive: true, errorOnExist: true, force: false })).rejects.toThrow();
    await f.service.close();
  });

  it('reports a degraded, recovery-required vault instead of inventing healthy context', async () => {
    const f = await fixture('degraded');
    await f.service.commit({ scope: f.scope, canonicalKey: 'fact.degraded.subject', kind: 'fact', value: 'healthy before corruption', sourceType: 'test' });
    expect((await f.service.status(f.scope)).healthy).toBe(true);

    const [family] = (await readdir(f.config.fileNative.vaultRoot)).filter((name) => !name.startsWith('.'));
    await writeFile(path.join(f.config.fileNative.vaultRoot, family!, 'broken.md'), '---\nschema_version: 1\nfile_id: broken\n---\nnot a canonical memory segment\n');

    const status = await f.service.status(f.scope);
    expect(status.healthy).toBe(false);
    expect(status.integrity).toContain('recovery_required');
    expect(f.service.currentState).toBe('degraded');
    await f.service.close();
  });
});
