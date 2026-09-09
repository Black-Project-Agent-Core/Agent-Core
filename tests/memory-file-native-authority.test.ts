import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryFixture, memoryRuntimeFiles } from './helpers/memory-fixture.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

async function fixture() {
  const f = await memoryFixture('authority');
  roots.push(f.root);
  return { ...f, scope: { principalId: 'p1', projectId: f.root } };
}

describe('the Obsidian-compatible vault is the only memory authority', () => {
  it('serves provenance, explain, export, compact, backup and recovery straight from files', async () => {
    const f = await fixture();
    const committed = await f.service.commit({
      scope: f.scope, canonicalKey: 'project.file.native', kind: 'project_state',
      value: 'file native only', sourceType: 'test',
      explicitAnchors: [{ type: 'subject_alias', value: 'vault-authority-anchor' }],
    });
    expect((await f.service.getWithProvenance(f.scope, committed.memoryId))?.memory.memoryId).toBe(committed.memoryId);
    expect((await f.service.explain(f.scope, committed.memoryId, 'vault-authority-anchor'))?.anchors.some((a) => a.value === 'vault-authority-anchor')).toBe(true);
    expect((await f.service.export(f.scope, 10)).items.some((x) => x.memoryId === committed.memoryId)).toBe(true);
    expect(await f.service.compact(f.scope)).toMatchObject({ integrity: 'file-native:ok' });
    expect((await f.service.backup('test')).backupPath).toContain('runtime');
    // Recovery is a full-vault Supabase Second Memory restore; there is no database to rehydrate.
    await expect(f.service.hydrateRemote(f.scope)).rejects.toThrow('MEMORY_REMOTE_HYDRATION_REQUIRES_IDLE_SERVICE');

    const status = await f.service.status(f.scope);
    expect(status.vaultRoot).toBe(f.config.fileNative.vaultRoot);
    expect(status.integrity.startsWith('file-native:')).toBe(true);
    await f.service.close();
  });

  it('writes only Markdown vault and JSON state files under runtime/memory', async () => {
    const f = await fixture();
    await f.service.commit({ scope: f.scope, canonicalKey: 'project.artifact.shape', kind: 'fact', value: 'vault segments only', sourceType: 'test' });
    await f.service.preflight({ scope: f.scope, routeContextId: 'route-authority', task: 'inspect the vault artifact shape', expiresAt: Date.now() + 60_000 });
    await f.service.close();

    const files = await memoryRuntimeFiles(f.root);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.endsWith('.md'))).toBe(true);
    expect(files.every((file) => /\.(md|json|jsonl|tmp)$/.test(file))).toBe(true);
  });
});
