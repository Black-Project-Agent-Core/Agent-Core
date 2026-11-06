import { mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as contextSearch from '../src/code-intelligence/context-search.js';

// Two seams in node:fs/promises. Every other call passes through to the real module.
// readdir: throws `failures.code` for the folder named `failures.folder`, `failures.left` more times.
// race: swaps one file for a link between two of the reader's checks (see the race test). Once `armed`, the first
// realpath of the target moves the original aside and links the target to `outside`; the next lstat of the target
// moves the original back, so the reader's post-read stat check sees the original again.
const failures = vi.hoisted(() => ({ folder: '', left: 0, code: 'EBUSY' }));
// open: fails with EBUSY for the file named `openFailures.name`, `openFailures.left` more times.
const openFailures = vi.hoisted(() => ({ name: '', left: 0 }));
const race = vi.hoisted(() => ({
  phase: 'idle' as 'idle' | 'armed' | 'swapped' | 'restored',
  target: '',
  backup: '',
  outside: '',
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const { default: nodePath } = await import('node:path');
  const isRaceTarget = (target: unknown): boolean =>
    race.phase !== 'idle' && typeof target === 'string'
    && nodePath.resolve(target).toLowerCase() === nodePath.resolve(race.target).toLowerCase();
  return {
    ...actual,
    readdir: async (directory: string, options?: unknown) => {
      const name = String(directory).split(/[\\/]/).pop();
      if (failures.left > 0 && name === failures.folder) {
        failures.left -= 1;
        throw Object.assign(new Error(`${failures.code}: resource busy, scandir '${directory}'`), { code: failures.code });
      }
      return (actual.readdir as (dir: string, opts?: unknown) => Promise<unknown>)(directory, options);
    },
    realpath: async (target: string, options?: unknown) => {
      const real = await (actual.realpath as (p: string, o?: unknown) => Promise<string>)(target, options);
      if (race.phase === 'armed' && isRaceTarget(target)) {
        race.phase = 'swapped';
        await actual.rename(race.target, race.backup);
        await actual.symlink(race.outside, race.target, 'file');
      }
      return real;
    },
    open: async (target: string, flags?: unknown) => {
      const name = String(target).split(/[\\/]/).pop();
      if (openFailures.left > 0 && name === openFailures.name) {
        openFailures.left -= 1;
        throw Object.assign(new Error(`EBUSY: resource busy, open '${target}'`), { code: 'EBUSY' });
      }
      return (actual.open as (p: string, f?: unknown) => Promise<unknown>)(target, flags);
    },
    lstat: async (target: string, options?: unknown) => {
      if (race.phase === 'swapped' && isRaceTarget(target)) {
        race.phase = 'restored';
        await actual.unlink(race.target);
        await actual.rename(race.backup, race.target);
      }
      return (actual.lstat as (p: string, o?: unknown) => Promise<unknown>)(target, options);
    },
  };
});

let root: string;

beforeEach(async () => {
  // Only Date is faked: the retry pause is measured on it, and real timers keep settle() working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
  root = await mkdtemp(path.join(os.tmpdir(), 'code-context-retry-'));
  contextSearch.clearCodeContextIndexCache();
  failures.folder = '';
  failures.left = 0;
  failures.code = 'EBUSY';
  openFailures.name = '';
  openFailures.left = 0;
  race.phase = 'idle';
});

afterEach(async () => {
  contextSearch.clearCodeContextIndexCache();
  if (race.phase === 'swapped') {
    await unlink(race.target);
    await rename(race.backup, race.target);
  }
  race.phase = 'idle';
  failures.folder = '';
  failures.left = 0;
  openFailures.name = '';
  openFailures.left = 0;
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

async function write(relative: string, text: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
}

function query(text: string): Promise<contextSearch.CodeContextResult> {
  return contextSearch.searchCodeContext({ root, query: text });
}

// Moves the clock past the retry pause (a constant in context-search) and well under the 60 s catalog TTL.
function pause(): void {
  vi.setSystemTime(Date.now() + 2000);
}

// Directory mtimes can tie with the previous write inside one clock tick, so wait a tick before a write that must show.
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 25));
}

describe('code context: transient listing and read failures are paced, kept, and never reported complete', () => {
  it('retries a folder whose readdir failed once, and indexes its files on a later query', async () => {
    await write('src/a.ts', 'export const retryMarkerE5 = 1;\n');
    failures.folder = 'src';
    failures.left = 1;

    const first = await query('retryMarkerE5');
    expect(failures.left).toBe(0);
    expect(first.index.complete).toBe(false);

    pause();
    const second = await query('retryMarkerE5');
    expect(second.hits[0]?.path).toBe('src/a.ts');
    expect(second.index.complete).toBe(true);
  });

  it('re-lists the root after a transient readdir failure of the root', async () => {
    await write('src/a.ts', 'export const rootRetryMarkerE7 = 1;\n');
    failures.folder = path.basename(root);
    failures.left = 1;

    const first = await query('rootRetryMarkerE7');
    expect(failures.left).toBe(0);
    expect(first.index.complete).toBe(false);

    pause();
    const second = await query('rootRetryMarkerE7');
    expect(second.hits[0]?.path).toBe('src/a.ts');
    expect(second.index.complete).toBe(true);
  });

  it('does not spend a folder\'s listing attempts on three queries in a row', async () => {
    await write('src/a.ts', 'export const burstMarkerK3 = 1;\n');
    failures.folder = 'src';
    failures.left = 3;

    for (let i = 0; i < 3; i += 1) {
      expect((await query('burstMarkerK3')).index.complete).toBe(false);
    }
    // One attempt ran; the other two queries fell inside the pause and did not list src.
    expect(failures.left).toBe(2);
    expect((await query('burstMarkerK3')).index.skippedByReason.unreadable).toBeUndefined();

    pause();
    await query('burstMarkerK3');
    expect(failures.left).toBe(1);

    pause();
    const last = await query('burstMarkerK3');
    expect(failures.left).toBe(0);
    expect(last.index.skippedByReason.unreadable).toBe(1);
    expect(last.index.complete).toBe(false);

    pause();
    const builds = contextSearch.codeContextStats().indexBuilds;
    const recovered = await query('burstMarkerK3');
    expect(recovered.hits[0]?.path).toBe('src/a.ts');
    expect(recovered.index.complete).toBe(true);
    expect(recovered.index.skippedByReason.unreadable).toBeUndefined();
    // Found in the same catalog: the file came back through a retry, not through a rebuild.
    expect(contextSearch.codeContextStats().indexBuilds - builds).toBe(0);
  });

  it('keeps the files of a warm index whose root readdir keeps failing, and does not report it complete', async () => {
    await write('src/a.ts', 'export const warmRootMarkerK3 = 1;\n');
    expect((await query('warmRootMarkerK3')).index.complete).toBe(true);

    await settle();
    await write('top.ts', 'export const topLevelMarkerK3 = 1;\n');
    failures.folder = path.basename(root);
    failures.left = 3;

    for (let i = 0; i < 3; i += 1) {
      const result = await query('warmRootMarkerK3');
      expect(result.hits[0]?.path).toBe('src/a.ts');
      expect(result.index.complete).toBe(false);
    }
    expect(failures.left).toBe(2);

    pause();
    await query('warmRootMarkerK3');
    expect(failures.left).toBe(1);

    pause();
    const capped = await query('warmRootMarkerK3');
    expect(failures.left).toBe(0);
    expect(capped.index.skippedByReason.unreadable).toBe(1);
    expect(capped.hits[0]?.path).toBe('src/a.ts');
    expect(capped.index.complete).toBe(false);

    pause();
    const builds = contextSearch.codeContextStats().indexBuilds;
    const recovered = await query('topLevelMarkerK3');
    expect(recovered.hits[0]?.path).toBe('top.ts');
    expect(recovered.index.complete).toBe(true);
    expect(contextSearch.codeContextStats().indexBuilds - builds).toBe(0);
  });

  it('keeps a warm folder\'s entries when its last attempt fails, records it unreadable, and lists it again after recovery', async () => {
    await write('src/a.ts', 'export const retryMarkerE6 = 1;\n');
    expect((await query('retryMarkerE6')).index.complete).toBe(true);

    await settle();
    await write('src/b.ts', 'export const retryMarkerE6b = 1;\n');
    failures.folder = 'src';
    failures.left = 3;

    pause();
    expect((await query('retryMarkerE6')).hits[0]?.path).toBe('src/a.ts');
    pause();
    expect((await query('retryMarkerE6')).hits[0]?.path).toBe('src/a.ts');
    pause();
    const last = await query('retryMarkerE6');
    expect(failures.left).toBe(0);
    expect(last.hits[0]?.path).toBe('src/a.ts');
    expect(last.index.skippedByReason.unreadable).toBe(1);
    expect(last.index.complete).toBe(false);

    pause();
    const builds = contextSearch.codeContextStats().indexBuilds;
    const recovered = await query('retryMarkerE6b');
    expect(recovered.hits[0]?.path).toBe('src/b.ts');
    expect(recovered.index.complete).toBe(true);
    expect(recovered.index.skippedByReason.unreadable).toBeUndefined();
    expect(contextSearch.codeContextStats().indexBuilds - builds).toBe(0);
  });

  it('reads a file only through the handle it checked, so a path swapped to a link mid-read is never indexed', async (ctx) => {
    await write('src/x.ts', 'export const innocentRaceK4 = 1;\n');
    const outsideDir = await mkdtemp(path.join(os.tmpdir(), 'code-context-race-'));
    try {
      const outside = path.join(outsideDir, 'z.ts');
      // Its marker shares no token with the innocent file, so a hit can only come from the outside bytes.
      await writeFile(outside, 'export const zqvOutsideMarker = 1;\n');
      // Probe the platform first: a file link needs a privilege some Windows accounts lack.
      try {
        await symlink(outside, path.join(outsideDir, 'probe.ts'), 'file');
        await unlink(path.join(outsideDir, 'probe.ts'));
      } catch {
        ctx.skip();
      }

      // The race is simulated, not timed. Between the reader's realpath check and its open, src/x.ts becomes a link to
      // `outside`. The old reader then read through the link and compared only mtime and size after the read; the
      // restored original passes that comparison, so the outside bytes were indexed. The new reader opens the link, finds
      // another object (different device and inode), refuses it, and checks the path again.
      race.target = path.join(root, 'src', 'x.ts');
      race.backup = path.join(root, 'src', 'x.ts.race-moved');
      race.outside = outside;
      race.phase = 'armed';

      const result = await query('zqvOutsideMarker');
      expect(race.phase).toBe('restored');
      expect(result.hits).toEqual([]);
      expect(result.status).toBe('no-match');
      expect((await query('innocentRaceK4')).hits[0]?.path).toBe('src/x.ts');
    } finally {
      if (race.phase === 'swapped') {
        await unlink(race.target);
        await rename(race.backup, race.target);
      }
      race.phase = 'idle';
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('lets a folder that stays unreadable keep the catalog from being trusted: it expires on the normal clock', async () => {
    await write('src/a.ts', 'export const permanentMarkerK3 = 1;\n');
    await write('lib/b.ts', 'export const otherMarkerK3 = 1;\n');
    failures.folder = 'src';
    failures.left = 1000;

    let result = await query('otherMarkerK3');
    for (let i = 0; i < 12; i += 1) {
      pause();
      result = await query('otherMarkerK3');
    }
    // The readable folder is found; the view says it is not complete, and the unreadable folder is recorded as skipped.
    expect(result.hits[0]?.path).toBe('lib/b.ts');
    expect(result.index.complete).toBe(false);
    expect(result.index.skippedByReason.unreadable).toBe(1);
    expect(result.index.truncatedReason).toBeNull();

    // Once the folder has failed for good the catalog is trusted, so it expires and is built again on the normal clock.
    const builds = contextSearch.codeContextStats().indexBuilds;
    vi.setSystemTime(Date.now() + 61 * 1000);
    await query('otherMarkerK3');
    expect(contextSearch.codeContextStats().indexBuilds - builds).toBe(1);
  });

  it('retries a file whose open failed for a transient reason, and indexes it once the open succeeds', async () => {
    await write('src/c.ts', 'export const transientOpenMarkerK3 = 1;\n');
    openFailures.name = 'c.ts';
    openFailures.left = 2;

    const first = await query('transientOpenMarkerK3');
    expect(first.hits).toEqual([]);
    expect(first.index.complete).toBe(false);
    expect(first.index.skippedByReason.unreadable).toBe(1);

    pause();
    await query('transientOpenMarkerK3');
    expect(openFailures.left).toBe(0);

    pause();
    const recovered = await query('transientOpenMarkerK3');
    expect(recovered.hits[0]?.path).toBe('src/c.ts');
    expect(recovered.index.complete).toBe(true);
    expect(recovered.index.skippedByReason.unreadable).toBeUndefined();
  });

  it('settles a file whose transient read failure is followed by a permanent one, so the view can complete', async () => {
    await write('src/d.ts', 'export const settledMarkerK3 = 1;\n');
    openFailures.name = 'd.ts';
    openFailures.left = 1;
    expect((await query('settledMarkerK3')).index.complete).toBe(false);

    // The file now holds binary bytes: its next read fails for good.
    await writeFile(path.join(root, 'src/d.ts'), Buffer.from([0x00, 0x01, 0x02]));
    pause();
    const settled = await query('settledMarkerK3');
    expect(settled.index.skippedByReason.binary).toBe(1);
    expect(settled.index.skippedByReason.unreadable).toBeUndefined();
    expect(settled.index.complete).toBe(true);
  });

  it('lists no credential-named file, even one whose compound name ends in credentials or secrets', async () => {
    await write('src/gcp-credentials.json', 'export const quokkaPalm = 1;\n');
    await write('src/ok.ts', 'export const zebraMesa = 1;\n');
    expect((await query('zebraMesa')).hits[0]?.path).toBe('src/ok.ts');
    expect((await query('quokkaPalm')).hits).toEqual([]);
  });
});
