import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeStandaloneMemory, notePath, resolveMemoryPaths } from '../src/index.js';
import { serializeCanonicalNote } from '../src/memory/note-format.js';
import type { Budgeted } from '../src/index.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-controller-scope-')); roots.push(root);
  const memory = await initializeStandaloneMemory({ baseDir: root });
  return { root, memory };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive:true, force:true }))); });
function data<T>(result: Budgeted<T>): T { if (result.status === 'insufficient-budget') throw new Error('unexpected fixture overflow'); return result.data; }
const scope = { workspaceKey: 'workspace-a', taskId: 'task-a', controllerId: 'controller-a' };

describe('host-locked controller scope', () => {
  it('includes only bound workspace and canonical pinned foundation, even for arbitrary pinned notes', async () => {
    const { root, memory } = await fixture();
    const own = await memory.remember({ content: 'scope needle own', provenance: { workspace:'workspace-a', files:[] } });
    const other = await memory.remember({ content: 'scope needle other', provenance: { workspace:'workspace-b', files:[] } });
    const unscoped = await memory.remember({ content: 'scope needle no-workspace' });
    await writeFile(notePath(resolveMemoryPaths(root), other.id), serializeCanonicalNote({ ...other, pinned:true }));
    const controller = memory.controller(scope);
    const ids = data(await controller.recall()).hits.map(hit => hit.id);
    expect(ids).toContain(own.id);
    expect(ids).toContain('agent-core-foundational');
    expect(ids).not.toContain(other.id);
    expect(ids).not.toContain(unscoped.id);
    const queried = data(await controller.recall({ query:'scope needle', limit:20 })).hits.map(hit => hit.id);
    expect(queried).not.toContain(other.id);
  });

  it('rejects forged workspace/body fields and omitted host scope', async () => {
    const { memory } = await fixture();
    expect(() => memory.controller({ taskId:'task-a', controllerId:'controller-a' } as never)).toThrow('MEMORY_INPUT_INVALID');
    const controller = memory.controller(scope);
    await expect(controller.recall({ query:'needle', workspaceKey:'workspace-b' } as never)).rejects.toMatchObject({ code:'MEMORY_INPUT_INVALID' });
    await expect(controller.recall({ query:'needle', workspace:'workspace-b' } as never)).rejects.toMatchObject({ code:'MEMORY_INPUT_INVALID' });
  });

  it('does not allow caller mutation to change the bound scope', async () => {
    const { memory } = await fixture();
    const other = await memory.remember({ content:'foreign needle', provenance:{ workspace:'workspace-b', files:[] } });
    const supplied = { ...scope };
    const controller = memory.controller(supplied); supplied.workspaceKey = 'workspace-b';
    expect(data(await controller.recall({ query:'foreign needle' })).hits.some(hit => hit.id === other.id)).toBe(false);
  });

  it('rejects cross-workspace expansion even with a real revision and pinned record', async () => {
    const { root, memory } = await fixture();
    const other = await memory.remember({ content:'foreign expansion needle', provenance:{ workspace:'workspace-b', files:[] } });
    await writeFile(notePath(resolveMemoryPaths(root), other.id), serializeCanonicalNote({ ...other,pinned:true }));
    const hit = data(await memory.controller({ ...scope,workspaceKey:'workspace-b' }).recall({ query:'foreign expansion needle',limit:1 })).hits[0]!;
    await expect(memory.controller(scope).expand({ source:{ kind:'memory',id:hit.id,revision:hit.revision },view:'record' })).rejects.toMatchObject({ code:'MEMORY_SCOPE_MISMATCH' });
  });

  it('keeps maximum host identifiers out of the minimum public envelope', async () => {
    const { memory } = await fixture();
    const controller = memory.controller({ workspaceKey: 'w'.repeat(120), taskId: 't'.repeat(200), controllerId: 'c'.repeat(200), sessionId: 's'.repeat(200) });
    const result = await controller.recall({ budget: { maxBytes: 512 } });
    const json = JSON.stringify(result);
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(512);
    expect(result.status).toBe('insufficient-budget'); // mandatory foundation hit is preserved whole
    expect(json).not.toContain('t'.repeat(200));
    expect(json).not.toContain('w'.repeat(120));
    expect(result.metrics.payloadBytes).toBe(Buffer.byteLength(json));
  });

  it('binds cursors to root, workspace and task while allowing controller/session handoff', async () => {
    const { memory } = await fixture();
    await memory.batch([1,2].map(n => ({ op:'remember' as const,value:{ content:`scope paging needle ${n}`,provenance:{ workspace:'workspace-a',files:[] } } })));
    const first = data(await memory.controller(scope).recall({ query:'scope paging needle',limit:1 }));
    expect(first.nextCursor).toBeTruthy();
    for (const changed of [{ workspaceKey:'workspace-b' },{ taskId:'task-b' }]) {
      await expect(memory.controller({ ...scope,...changed }).recall({ query:'scope paging needle',limit:1,cursor:first.nextCursor })).rejects.toMatchObject({ code:'MEMORY_SCOPE_MISMATCH' });
    }
    const { memory: otherRoot } = await fixture();
    await expect(otherRoot.controller(scope).recall({ query:'scope paging needle',limit:1,cursor:first.nextCursor })).rejects.toMatchObject({ code:'MEMORY_SCOPE_MISMATCH' });
    const resumed = data(await memory.controller({ ...scope,controllerId:'controller-b',sessionId:'session-b' }).recall({ query:'scope paging needle',limit:1,cursor:first.nextCursor }));
    expect(resumed.hits).toHaveLength(1);
    expect(resumed.hits[0]!.id).not.toBe(first.hits[0]!.id);
  });
});
