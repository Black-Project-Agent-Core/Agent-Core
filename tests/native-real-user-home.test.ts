import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catastrophicDeleteTarget } from '../src/rdc/command-guards.js';
import { buildMachineShellEnv, realUserHome } from '../src/security/environment.js';

// The launcher points HOME and USERPROFILE at runtime/home for Core's own caches. A shell that Native or the owner asks
// for is the owner's shell: it must see the account's real profile, and the delete guard must protect that profile.
const sandbox = path.join(os.tmpdir(), 'agent-core-sandbox-home');
afterEach(() => { vi.unstubAllEnvs(); });

describe('real user home', () => {
  it('is the account profile, not the redirected HOME', () => {
    vi.stubEnv('HOME', sandbox);
    vi.stubEnv('USERPROFILE', sandbox);
    expect(realUserHome()).toBe(os.userInfo().homedir);
    expect(realUserHome()).not.toBe(sandbox);
  });

  it('gives a machine shell the real profile instead of the redirected one', () => {
    vi.stubEnv('HOME', sandbox);
    vi.stubEnv('USERPROFILE', sandbox);
    vi.stubEnv('APPDATA', path.join(sandbox, 'AppData', 'Roaming'));
    vi.stubEnv('LOCALAPPDATA', path.join(sandbox, 'AppData', 'Local'));
    const home = os.userInfo().homedir;
    const shell = buildMachineShellEnv({ TERM: 'xterm-256color' });
    expect(shell.HOME).toBe(home);
    if (process.platform === 'win32') {
      expect(shell.USERPROFILE).toBe(home);
      expect(shell.APPDATA).toBe(path.join(home, 'AppData', 'Roaming'));
      expect(shell.LOCALAPPDATA).toBe(path.join(home, 'AppData', 'Local'));
    }
    expect(shell.TERM).toBe('xterm-256color');
    // Core's own process keeps the redirect.
    expect(process.env.USERPROFILE).toBe(sandbox);
  });

  it('leaves an explicit source environment alone', () => {
    const source = { HOME: 'X:\\custom', USERPROFILE: 'X:\\custom', PATH: 'p' };
    const shell = buildMachineShellEnv({}, source);
    expect(shell.HOME).toBe('X:\\custom');
    expect(shell.USERPROFILE).toBe('X:\\custom');
  });

  it('still refuses to delete the real profile and its Users folder when HOME is redirected', () => {
    vi.stubEnv('HOME', sandbox);
    vi.stubEnv('USERPROFILE', sandbox);
    const home = os.userInfo().homedir;
    expect(catastrophicDeleteTarget('rm -rf ~')?.label).toBe('the user profile');
    expect(catastrophicDeleteTarget(`rm -rf "${home}"`)?.label).toBe('the user profile');
    expect(catastrophicDeleteTarget('rm -rf $env:USERPROFILE')?.label).toBe('the user profile');
    expect(catastrophicDeleteTarget(`rm -rf "${path.dirname(home)}"`)?.label).toBe('the Users folder');
    expect(catastrophicDeleteTarget(`rm -rf "${path.join(home, 'Downloads', 'old.png')}"`)).toBeUndefined();
  });
});
