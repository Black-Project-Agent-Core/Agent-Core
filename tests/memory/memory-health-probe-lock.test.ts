import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { withMemoryProcessLock } from '../../src/memory/lock.js';
import { resolveMemoryPaths } from '../../src/memory/paths.js';
import { MemoryService } from '../../src/memory/service.js';

const roots: string[] = [];
const owners: Array<{ dispose?: () => void }> = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) owner.dispose?.();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

/** Live finding 2026-11-06: the /health memory probe (cacheMs 0) took a full snapshot under the memory lock, so
 * it queued behind writers and answered HEALTH_PROBE_TIMEOUT, and its own queue entry lengthened the queue. */
it('answers the health probe from the last known state, marked stale, while a writer holds the memory lock', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-health-probe-lock-'));
  roots.push(root);
  const service = await MemoryService.initialize(root, root);
  owners.push(service);
  const fresh = await service.probeHealth();
  expect(fresh.stale).toBeUndefined();

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const holder = withMemoryProcessLock(resolveMemoryPaths(root, root).lock, () => gate);
  await new Promise(resolve => setTimeout(resolve, 150));
  try {
    const startedAt = Date.now();
    const health = await Promise.race([
      service.probeHealth(),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 2000)),
    ]);
    expect(health).not.toBe('timeout');
    expect(Date.now() - startedAt).toBeLessThan(2000);
    const answered = health as Awaited<ReturnType<typeof service.probeHealth>>;
    expect(answered.status).toBe(fresh.status);
    expect(answered.noteCount).toBe(fresh.noteCount);
    expect(answered.stale).toBe(true);
    expect(answered.staleReason).toBe('memory-lock-busy');
    expect(typeof answered.refreshedAt).toBe('string');
  } finally {
    release();
    await holder;
  }

  const after = await service.probeHealth();
  expect(after.stale).toBeUndefined();
}, 30_000);
