import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionStore } from '../src/execution/store.js';

const io = vi.hoisted(() => ({
  beforeOpen: undefined as undefined | ((file: string) => Promise<void>),
  afterSync: undefined as undefined | ((file: string) => void),
  afterRename: undefined as undefined | ((target: string) => void),
}));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const filename = String(args[0]);
      await io.beforeOpen?.(filename);
      const handle = await actual.open(...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { await sync(); io.afterSync?.(filename); };
      return handle;
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      await actual.rename(...args);
      io.afterRename?.(String(args[1]));
    },
  };
});

interface TestTransaction {
  writes: Array<{ path: string; content: string }>;
  appends?: Array<{ path: string; line: string; guardSequence?: number }>;
  removes?: string[];
}
type TransactionBoundary = {
  commit(transaction: TestTransaction): Promise<void>;
  withLock<T>(name: string, task: () => Promise<T>): Promise<T>;
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const roots: string[] = [];
const stores: ExecutionStore[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ac-execution-transactions-'));
  roots.push(root);
  const store = new ExecutionStore(); stores.push(store);
  await store.open({ stateRoot: root });
  return { root, store, boundary: store as unknown as TransactionBoundary };
}
async function journalFiles(root: string) {
  return (await readdir(path.join(root, 'journal'))).filter(name => name.endsWith('.json'));
}
afterEach(async () => {
  io.beforeOpen = undefined; io.afterSync = undefined; io.afterRename = undefined;
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root);
    if (!resolved.startsWith(path.join(os.tmpdir(), 'ac-execution-transactions-'))) throw new Error('Unsafe fixture cleanup');
    await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
});

describe('execution transaction write scheduling', () => {
  it('bounds distinct writes, starts them only after journal sync, and completes writes before append/remove', async () => {
    const f = await fixture(), entered = deferred(), release = deferred();
    const writes = Array.from({ length: 9 }, (_, index) => ({ path: path.join(f.root, `write-${index}.json`), content: `${index}` }));
    const appended = path.join(f.root, 'ordered.jsonl'), removed = path.join(f.root, 'remove-me');
    await writeFile(removed, 'preserve until all writes finish');
    let journalSynced = false, active = 0, maximum = 0, opened = 0;
    io.afterSync = file => { if (path.dirname(file) === path.join(f.root, 'journal')) journalSynced = true; };
    io.beforeOpen = async file => {
      if (!/^write-\d+\.json\.tmp-/.test(path.basename(file))) return;
      expect(journalSynced).toBe(true);
      active++; opened++; maximum = Math.max(maximum, active);
      if (opened === 4) entered.resolve();
      if (opened <= 4) await release.promise;
    };
    io.afterRename = target => { if (/^write-\d+\.json$/.test(path.basename(target))) active--; };
    const operation = f.boundary.commit({ writes, appends: [{ path: appended, line: 'after writes' }], removes: [removed] });
    try {
      await entered.promise;
      expect(opened).toBe(4); expect(active).toBe(4);
      expect(await journalFiles(f.root)).toHaveLength(1);
      await expect(readFile(appended, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(removed, 'utf8')).toBe('preserve until all writes finish');
    } finally { release.resolve(); }
    await operation;
    expect(maximum).toBe(4); expect(opened).toBe(9); expect(active).toBe(0);
    expect(await Promise.all(writes.map(write => readFile(write.path, 'utf8')))).toEqual(writes.map(write => write.content));
    expect(await readFile(appended, 'utf8')).toBe('after writes\n');
    await expect(readFile(removed)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await journalFiles(f.root)).toEqual([]);
  });

  it('drains a failed batch before releasing its lock and replays the retained journal after partial publication', async () => {
    const f = await fixture(), slowEntered = deferred(), failEntered = deferred(), releaseSlow = deferred();
    const names = ['good', 'fail', 'slow', 'peer', 'not-started'];
    const writes = names.map(name => ({ path: path.join(f.root, `${name}.json`), content: name }));
    const appended = path.join(f.root, 'replayed.jsonl'), removed = path.join(f.root, 'remove-after-replay');
    await writeFile(removed, 'still present');
    const opened: string[] = [];
    io.beforeOpen = async file => {
      const name = path.basename(file).split('.json.tmp-')[0]!;
      if (!names.includes(name)) return;
      opened.push(name);
      if (name === 'slow') { slowEntered.resolve(); await releaseSlow.promise; }
      if (name === 'fail') { await slowEntered.promise; failEntered.resolve(); throw new Error('INJECTED_WRITE_FAILURE'); }
    };
    let settled = false, followerEntered = false;
    const result = f.boundary.withLock('transaction-test', () => f.boundary.commit({ writes,
      appends: [{ path: appended, line: '{"sequence":1}', guardSequence: 1 }], removes: [removed] }))
      .then(() => ({ error: undefined }), error => ({ error })).finally(() => { settled = true; });
    const follower = f.boundary.withLock('transaction-test', async () => { followerEntered = true; });
    try {
      await failEntered.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(settled).toBe(false); expect(followerEntered).toBe(false);
      expect(opened).not.toContain('not-started');
      expect(await journalFiles(f.root)).toHaveLength(1);
      expect((await readdir(path.join(f.root, 'journal', 'locks'))).length).toBe(1);
    } finally { releaseSlow.resolve(); }
    expect((await result).error).toMatchObject({ message: 'INJECTED_WRITE_FAILURE' });
    await follower;
    expect(await readFile(writes[0]!.path, 'utf8')).toBe('good');
    expect(await readFile(writes[2]!.path, 'utf8')).toBe('slow');
    expect(await journalFiles(f.root)).toHaveLength(1);
    await expect(readFile(writes[4]!.path)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(appended)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(removed, 'utf8')).toBe('still present');

    io.beforeOpen = undefined;
    await f.store.close();
    const reopened = new ExecutionStore(); stores.push(reopened);
    await reopened.open({ stateRoot: f.root });
    expect(await Promise.all(writes.map(write => readFile(write.path, 'utf8')))).toEqual(names);
    expect(await readFile(appended, 'utf8')).toBe('{"sequence":1}\n');
    await expect(readFile(removed)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await journalFiles(f.root)).toEqual([]);
    await reopened.close();
    const again = new ExecutionStore(); stores.push(again);
    await again.open({ stateRoot: f.root });
    expect(await readFile(appended, 'utf8')).toBe('{"sequence":1}\n');
  });

  it('keeps the complete original write order when a normalized target occurs twice', async () => {
    const f = await fixture(), entered = deferred(), release = deferred();
    const repeated = path.join(f.root, 'repeated.json'), middle = path.join(f.root, 'middle.json');
    const alias = `${f.root}${path.sep}.${path.sep}repeated.json`;
    const opened: string[] = [];
    io.beforeOpen = async file => {
      if (!/^(?:repeated|middle)\.json\.tmp-/.test(path.basename(file))) return;
      opened.push(path.basename(file).split('.json.tmp-')[0]!);
      if (opened.length === 1) { entered.resolve(); await release.promise; }
    };
    const operation = f.boundary.commit({ writes: [
      { path: repeated, content: 'first' }, { path: middle, content: 'between' }, { path: alias, content: 'last' },
    ] });
    try { await entered.promise; expect(opened).toEqual(['repeated']); }
    finally { release.resolve(); }
    await operation;
    expect(opened).toEqual(['repeated', 'middle', 'repeated']);
    expect(await readFile(repeated, 'utf8')).toBe('last');
    expect(await readFile(middle, 'utf8')).toBe('between');
    expect(await journalFiles(f.root)).toEqual([]);
  });
});
