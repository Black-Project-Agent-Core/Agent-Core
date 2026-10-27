import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

const registry = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: registry,
  }) };
});
import { ManagedBrowserUseRuntime } from '../src/rdc/browser-control/open-browser-use-runtime.js';

it.skipIf(process.platform !== 'win32')('refreshes the Core owner despite registry failure and preserves its identity on retry', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-core-owner-'));
  const directory = path.join(root, 'runtime/rdc/browser-control/managed');
  const marker = path.join(directory, 'core-owner.json');
  const runtime = new ManagedBrowserUseRuntime(root);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(root, 'Agent Core.exe'), 'fixture only');
    await writeFile(marker, JSON.stringify({ pid: 99999999, startedAt: 1 }));
    registry.mockResolvedValue({ stdout: '', stderr: '' });
    await expect(runtime.prepare()).rejects.toThrow('BROWSER_OBU_HOST_REGISTRY_UNREADABLE');
    const first = JSON.parse(await readFile(marker, 'utf8'));
    expect(first.pid).toBe(process.pid);
    expect(first.startedAt).toBeGreaterThan(1);
    registry.mockImplementation(async (_file, args) => ({
      stdout: '    (Default)    REG_SZ    ' + path.join(directory, args[1].split('\\').at(-1) + '.json') + '\r\n', stderr: '',
    }));
    await new Promise(resolve => setTimeout(resolve, 5));
    await runtime.prepare();
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual(first);
    expect(registry.mock.calls.every(([file, args]) => file === 'reg.exe' && args[0] === 'query')).toBe(true);
    await runtime.close();
    await expect(access(marker)).rejects.toThrow();
  } finally {
    registry.mockReset();
    // mkdtemp owns this exact disposable directory; no user or production root is removed.
    await rm(root, { recursive: true, force: true });
  }
});
