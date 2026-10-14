import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(), readdir: vi.fn(), mkdir: vi.fn(),
  spawn: vi.fn(), execFileSync: vi.fn(),
}));
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  access: mocks.access, readdir: mocks.readdir, mkdir: mocks.mkdir,
}));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: mocks.spawn, execFileSync: mocks.execFileSync,
}));
import { BrowserControlService } from '../src/rdc/browser-control/service.js';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

function installedBrowsers() {
  const full = path.join(process.cwd(), 'test-installed', 'Google', 'Chrome', 'Application', 'chrome.exe');
  vi.stubEnv('PROGRAMFILES', path.join(process.cwd(), 'test-installed'));
  vi.stubEnv('PROGRAMFILES(X86)', '');
  vi.stubEnv('LOCALAPPDATA', '');
  vi.stubEnv('AGENT_CORE_BROWSER_EXECUTABLE', '');
  mocks.execFileSync.mockImplementation(() => { throw new Error('no registry/PATH match'); });
  mocks.readdir.mockImplementation(async dir => String(dir).includes('headless-shell')
    ? [{ name: 'win64-1', isDirectory: () => true }] : []);
  mocks.access.mockImplementation(async file => {
    if (String(file).endsWith('chrome-headless-shell.exe') || file === full) return;
    throw new Error('ENOENT');
  });
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.spawn.mockImplementation(executable => { throw new Error('selected:' + executable); });
  return full;
}

describe('browser executable selection', () => {
  it('searches full browsers when headed mode has a cached headless shell', async () => {
    const full = installedBrowsers();
    await expect(new BrowserControlService().open('http://localhost/', false)).rejects.toThrow('selected:' + full);
    expect(mocks.spawn.mock.calls[0]?.[0]).toBe(full);
  });
  it('keeps cached headless preference for headless requests', async () => {
    installedBrowsers();
    await expect(new BrowserControlService().open('http://localhost/', true)).rejects.toThrow(/selected:.*chrome-headless-shell.exe/);
  });
  it('refuses an explicit headless-only operator override for headed mode before creating a profile', async () => {
    installedBrowsers();
    vi.stubEnv('AGENT_CORE_BROWSER_EXECUTABLE', path.join(process.cwd(), 'test-headless', 'chrome-headless-shell.exe'));
    await expect(new BrowserControlService().open('http://localhost/', false)).rejects.toThrow('BROWSER_CONTROL_HEADED_BROWSER_UNAVAILABLE');
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
