import * as fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
const gitOutcome = vi.hoisted(() => ({ files: undefined as string[] | undefined, warning: '' }));
vi.mock('node:fs/promises', async (load) => {
  const actual: any = await load();
  return { ...actual, readdir: vi.fn(actual.readdir), lstat: vi.fn(actual.lstat), realpath: vi.fn(actual.realpath) };
});
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  return { spawn: vi.fn(() => {
    const child: any = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    queueMicrotask(() => {
      if (gitOutcome.files) {
        child.stdout.end(gitOutcome.files.join('\0') + '\0'); child.emit('exit', 0);
        // Deliberately deliver stderr after exit, as a real child can do.
        queueMicrotask(() => { child.stderr.end(gitOutcome.warning); child.emit('close', 0); });
      } else { child.emit('exit', 128); child.emit('close', 128); }
    }); return child;
  }) };
});
import * as scanner from '../src/semantic-ide/workspace-policy.js';
import { WorkspaceFreshnessCoordinator } from '../src/semantic-ide/freshness.js';
const actual: any = await vi.importActual('node:fs/promises');
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); gitOutcome.files = undefined; gitOutcome.warning = '';
  vi.mocked(fs.readdir).mockImplementation(actual.readdir);
  vi.mocked(fs.lstat).mockImplementation(actual.lstat);
  vi.mocked(fs.realpath).mockImplementation(actual.realpath);
  await Promise.all(roots.splice(0).map(root => actual.rm(root, { recursive: true, force: true })));
});
async function disk() {
  const root = await fs.mkdtemp(path.join(process.cwd(), 'runtime/tmp/scan-complete-')); roots.push(root);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'a.ts'), 'export const a = 1;');
  await fs.writeFile(path.join(root, 'src/b.ts'), 'export const b = 1;');
  return root;
}
const definition = { id: 'typescript', extensions: ['.ts'], languageIds: { '.ts': 'typescript' }, command: process.execPath, args: [] };
function harness(maxEvents = 100) {
  const changes: any[] = []; const closed: string[] = [];
  const session = {
    notify: (_: string, p: any) => changes.push(...p.changes),
    bindCreatedFile: async () => undefined,
    closeDeletedFile: async (p: string) => { closed.push(p); }, noteFreshness: () => undefined,
  };
  const coordinator = new WorkspaceFreshnessCoordinator(100, maxEvents, 5000, -1);
  const root = path.resolve('runtime/tmp/virtual-scan');
  const scan = vi.spyOn(scanner, 'scanWorkspaceSources');
  function give(names: string[], options: any = {}) {
    scan.mockResolvedValue({ files: names.map(name => ({ absolutePath: path.join(root, name), relativePath: name, mtimeMs: options.mtime ?? 1, size: 10, identity: { dev: '1', ino: String(name.charCodeAt(0)), mtimeNs: String((options.mtime ?? 1) * 1000000), ctimeNs: '1', size: 10 }, evidence: 'metadata', cacheable: true })),
      complete: true, ioIssueCount: 0, issues: [], truncated: false, durationMs: 0, ignoredCount: 0, ...options } as any);
  }
  return { give, changes, closed, run: (r = root) => coordinator.reconcile(session, r, definition, []) };
}
describe('PY6 real scanner completeness', () => {
  it('Git listing with an I/O warning cannot authorize absence', async () => {
    const root = await disk(); gitOutcome.files = ['a.ts']; gitOutcome.warning = 'warning: private inaccessible subtree';
    const scan: any = await scanner.scanWorkspaceSources(root, ['.ts']);
    expect(scan.complete).toBe(false); expect(scan.ioIssueCount).toBe(1);
    expect(scan.issues).toEqual([{ relativePath: '.', code: 'EGIT_ENUMERATION_WARNING' }]);
    expect(JSON.stringify(scan.issues)).not.toContain('private');
  });
  it.each(['EACCES', 'EIO'])('directory %s cannot become empty success', async code => {
    const root = await disk();
    vi.mocked(fs.readdir).mockImplementation((async (p: any, ...args: any[]) => {
      if (String(p) === path.join(root, 'src')) throw Object.assign(new Error('private detail'), { code });
      return actual.readdir(p, ...args);
    }) as any);
    const scan: any = await scanner.scanWorkspaceSources(root, ['.ts']);
    expect(scan.complete).toBe(false); expect(scan.ioIssueCount).toBe(1);
    expect(scan.files.map((f: any) => f.relativePath)).toEqual(['a.ts']);
    expect(scan.issues).toEqual([{ relativePath: 'src', code }]);
    expect(JSON.stringify(scan.issues)).not.toContain('private detail');
  });
  it.each(['EACCES', 'EIO'])('leaf %s preserves uncertainty', async code => {
    const root = await disk();
    vi.mocked(fs.lstat).mockImplementation((async (p: any, ...args: any[]) => {
      if (String(p).endsWith('b.ts')) throw Object.assign(new Error('metadata failure'), { code });
      return actual.lstat(p, ...args);
    }) as any);
    const scan: any = await scanner.scanWorkspaceSources(root, ['.ts']);
    expect(scan.complete).toBe(false); expect(scan.ioIssueCount).toBe(1);
  });
  it('a genuinely vanished leaf is absence, not I/O failure', async () => {
    const root = await disk();
    vi.mocked(fs.lstat).mockImplementation((async (p: any, ...args: any[]) => {
      if (String(p).endsWith('b.ts')) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return actual.lstat(p, ...args);
    }) as any);
    const scan: any = await scanner.scanWorkspaceSources(root, ['.ts']);
    expect(scan.complete).toBe(true); expect(scan.ioIssueCount).toBe(0); expect(scan.files).toHaveLength(1);
  });
  it('missing root is an explicit degraded scan', async () => {
    const root = await disk(); await actual.rm(root, { recursive: true });
    const scan: any = await scanner.scanWorkspaceSources(root, ['.ts']);
    expect(scan.complete).toBe(false); expect(scan.issues).toEqual([{ relativePath: '.', code: 'ENOENT' }]);
  });
  it('file-limit truncation cannot claim complete coverage', async () => {
    const scan: any = await scanner.scanWorkspaceSources(await disk(), ['.ts'], [], 1);
    expect(scan.truncated).toBe(true); expect(scan.complete).toBe(false);
  });
  it('ordinary scan retains ignored directory policy', async () => {
    const root = await disk(); await fs.mkdir(path.join(root, 'node_modules'));
    await fs.writeFile(path.join(root, 'node_modules/no.ts'), 'ignored');
    const scan: any = await scanner.scanWorkspaceSources(root, ['.ts']);
    expect(scan.complete).toBe(true); expect(scan.files).toHaveLength(2); expect(scan.ignoredCount).toBe(1);
  });
});
describe('PY6 coverage-aware coordinator', () => {
  it.each([{ truncated: true }, { ioIssueCount: 1 }])('partial scan %j never deletes unseen b', async partial => {
    const h = harness(); h.give(['a.ts', 'b.ts']); await h.run();
    h.give(['a.ts'], { ...partial, complete: false }); const result = await h.run();
    expect(result.state).toBe('degraded'); expect(h.changes).toEqual([]); expect(h.closed).toEqual([]);
    h.give(['a.ts']); await h.run(); expect(h.changes.map(c => c.type)).toEqual([3]); expect(h.closed).toHaveLength(1);
    await h.run(); expect(h.closed).toHaveLength(1);
  });
  it('first incomplete scan is not an authoritative baseline', async () => {
    const h = harness(); h.give(['a.ts'], { complete: false, truncated: true }); expect((await h.run()).state).toBe('degraded');
    h.give(['a.ts', 'b.ts']); expect((await h.run()).state).toBe('baseline'); expect(h.changes).toEqual([]);
  });
  it('positive changes delivered during uncertainty are advanced exactly once', async () => {
    const h = harness(); h.give(['a.ts', 'b.ts']); await h.run();
    h.give(['a.ts'], { complete: false, ioIssueCount: 1, mtime: 2 }); await h.run(); await h.run();
    expect(h.changes.map(c => c.type)).toEqual([2]); expect(h.closed).toEqual([]);
  });
  it('event-limit overflow makes progress instead of redispatching the first event', async () => {
    const h = harness(1); h.give(['a.ts', 'b.ts']); await h.run();
    h.give(['a.ts', 'b.ts'], { mtime: 2 }); expect((await h.run()).state).toBe('degraded');
    await h.run(); await h.run(); expect(h.changes).toHaveLength(2);
    expect(new Set(h.changes.map(c => c.uri)).size).toBe(2);
  });
  it('failed root cannot replace another root baseline', async () => {
    const h = harness(); h.give(['a.ts', 'b.ts']); await h.run();
    h.give([], { complete: false, ioIssueCount: 1 }); await h.run(path.resolve('runtime/tmp/other-root'));
    h.give(['a.ts']); await h.run(); expect(h.closed).toHaveLength(1);
  });
});
