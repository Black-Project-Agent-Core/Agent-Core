import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionStore } from '../src/execution/store.js';

const io = vi.hoisted(() => ({
  events: [] as Array<{ op: string; path: string }>,
  beforeOpen: undefined as undefined | ((file: string) => void),
  beforeMkdir: undefined as undefined | ((file: string) => void),
  beforeRename: undefined as undefined | ((target: string) => void),
}));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      const target = String(args[0]); io.events.push({ op: 'mkdir', path: target });
      io.beforeMkdir?.(target);
      return actual.mkdir(...args);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const target = String(args[0]); io.events.push({ op: 'open', path: target });
      io.beforeOpen?.(target);
      const handle = await actual.open(...args), sync = handle.sync.bind(handle);
      handle.sync = async () => { await sync(); io.events.push({ op: 'sync', path: target }); };
      return handle;
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      io.beforeRename?.(String(args[1]));
      await actual.rename(...args); io.events.push({ op: 'rename', path: String(args[1]) });
    },
  };
});

interface TransactionBoundary {
  commit(transaction: { writes?: Array<{ path: string; content: string }>; appends?: Array<{ path: string; line: string }> }): Promise<void>;
}
const roots: string[] = [], stores: ExecutionStore[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ac-execution-open-first-'));
  roots.push(root);
  const store = new ExecutionStore(); stores.push(store); await store.open({ stateRoot: root });
  io.events.length = 0;
  return { root, boundary: store as unknown as TransactionBoundary };
}
function errno(code: string) { return Object.assign(new Error('Synthetic filesystem failure'), { code }); }
afterEach(async () => {
  io.beforeOpen = undefined; io.beforeMkdir = undefined; io.beforeRename = undefined;
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ac-execution-open-first-')) throw new Error('Unsafe fixture cleanup');
    await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
  io.events.length = 0;
});

describe('execution store creates parent directories only when needed', () => {
  it('keeps the journal flush and atomic publication while avoiding mkdir for existing parents', async () => {
    const f = await fixture(), left = path.join(f.root, 'left.json'), right = path.join(f.root, 'right.json');
    const log = path.join(f.root, 'events.jsonl');
    await writeFile(left, 'old');
    io.beforeRename = target => {
      if (target === left || target === right) expect(io.events.some(event => event.op === 'sync' && path.dirname(event.path) === path.join(f.root, 'journal'))).toBe(true);
    };
    await f.boundary.commit({ writes: [{ path: left, content: 'new' }, { path: right, content: 'second' }], appends: [{ path: log, line: 'after publication' }] });
    expect(io.events.filter(event => event.op === 'mkdir')).toEqual([]);
    expect(io.events.filter(event => event.op === 'sync')).toHaveLength(1);
    expect(await readFile(left, 'utf8')).toBe('new');
    expect(await readFile(right, 'utf8')).toBe('second');
    expect(await readFile(log, 'utf8')).toBe('after publication\n');
    expect((await readdir(path.join(f.root, 'journal'))).filter(name => name.endsWith('.json'))).toEqual([]);
  });

  it.each(['write', 'append'] as const)('creates a missing parent after the first %s open fails and retries once', async kind => {
    const f = await fixture(), parent = path.join(f.root, 'new', 'nested'), target = path.join(parent, 'data');
    await f.boundary.commit(kind === 'write' ? { writes: [{ path: target, content: 'value' }] } : { appends: [{ path: target, line: 'value' }] });
    expect(io.events.filter(event => event.path === parent || path.dirname(event.path) === parent).map(event => event.op)).toEqual(kind === 'write' ? ['open', 'mkdir', 'open', 'rename'] : ['open', 'mkdir', 'open']);
    expect(await readFile(target, 'utf8')).toBe(kind === 'write' ? 'value' : 'value\n');
  });

  it.each(['EACCES', 'EIO', 'EEXIST'])('propagates %s from open without attempting mkdir or changing the destination', async code => {
    const f = await fixture(), target = path.join(f.root, 'existing.json'), failure = errno(code);
    await writeFile(target, 'old');
    io.beforeOpen = file => { if (file.startsWith(`${target}.tmp-`)) throw failure; };
    await expect(f.boundary.commit({ writes: [{ path: target, content: 'new' }] })).rejects.toBe(failure);
    expect(io.events.filter(event => event.op === 'mkdir')).toEqual([]);
    expect(await readFile(target, 'utf8')).toBe('old');
  });

  it('propagates parent-creation errors and does not retry the failed open again', async () => {
    const f = await fixture(), parent = path.join(f.root, 'missing'), target = path.join(parent, 'data'), failure = errno('EACCES');
    io.beforeMkdir = file => { if (file === parent) throw failure; };
    await expect(f.boundary.commit({ writes: [{ path: target, content: 'new' }] })).rejects.toBe(failure);
    expect(io.events.map(event => event.op)).toEqual(['open', 'mkdir']);
  });

  it('propagates the second open failure without a retry loop or partial publication', async () => {
    const f = await fixture(), target = path.join(f.root, 'existing.json'), failure = errno('EIO');
    await writeFile(target, 'old');
    let opens = 0;
    io.beforeOpen = file => { if (file.startsWith(`${target}.tmp-`)) throw ++opens === 1 ? errno('ENOENT') : failure; };
    await expect(f.boundary.commit({ writes: [{ path: target, content: 'new' }] })).rejects.toBe(failure);
    expect(opens).toBe(2); expect(io.events.map(event => event.op)).toEqual(['open', 'mkdir', 'open']);
    expect(await readFile(target, 'utf8')).toBe('old');
  });
});
