import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ManagedBrowserUseRuntime, selectObuConnection } from '../src/rdc/browser-control/open-browser-use-runtime.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const connection = (id: string, managed = false) => ({ info: { metadata: { extensionInstanceId: id,
  nativeHostName: managed ? 'com.agent_core.browser_use' : 'com.ifuryst.open_browser_use.extension' } } });

describe('automatic supported-extension selection', () => {
  it('prefers the sole external connection over the dedicated fallback', () => {
    const external = connection('external'), fallback = connection('fallback', true);
    expect(selectObuConnection([fallback, external])).toBe(external);
  });
  it('uses the dedicated fallback instead of guessing between user profiles', () => {
    const fallback = connection('fallback', true);
    expect(selectObuConnection([connection('one'), connection('two'), fallback])).toBe(fallback);
    expect(selectObuConnection([connection('one'), connection('two')])).toBeUndefined();
  });
  it('does not guess between multiple dedicated endpoints or duplicate profile instances', () => {
    expect(selectObuConnection([connection('same'), connection('same')])).toBeUndefined();
    expect(selectObuConnection([connection('one', true), connection('two', true)])).toBeUndefined();
    expect(selectObuConnection([])).toBeUndefined();
  });
});

describe('owned browser fallback lifecycle', () => {
  it('shares concurrent startup and closes only the process it created', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-core-browser-')); roots.push(root);
    let releases: (() => void) | undefined;
    let launches = 0, stops = 0;
    const runtime = new ManagedBrowserUseRuntime(root, {
      prepare: async () => {},
      launch: async () => { launches++; await new Promise<void>(resolve => { releases = resolve; });
        return { alive: () => stops === 0, stop: async () => { stops++; } }; },
    });
    const first = runtime.start(), second = runtime.start();
    await new Promise(resolve => setTimeout(resolve, 0)); releases!();
    await Promise.all([first, second]);
    expect(runtime.status()).toEqual({ state: 'running', owned: true });
    expect(launches).toBe(1);
    await runtime.close(); await runtime.close();
    expect(stops).toBe(1); expect(runtime.status()).toEqual({ state: 'stopped', owned: false });
  });
  it('permits a corrected explicit startup after a failed launch', async () => {
    let attempts = 0, stopped = false;
    const runtime = new ManagedBrowserUseRuntime('unused', { prepare: async () => {}, launch: async () => {
      if (++attempts === 1) throw new Error('missing browser');
      return { alive: () => !stopped, stop: async () => { stopped = true; } };
    } });
    await expect(runtime.start()).rejects.toThrow('missing browser');
    expect(runtime.status()).toEqual({ state: 'unavailable', owned: false });
    await runtime.start(); expect(runtime.status().state).toBe('running'); await runtime.close();
  });
  it('still stops its owned browser when lifecycle marker cleanup fails', async () => {
    let stopped = false;
    const runtime = new ManagedBrowserUseRuntime('unused', {
      prepare: async () => {}, cleanup: async () => { throw new Error('marker locked'); },
      launch: async () => ({ alive: () => !stopped, stop: async () => { stopped = true; } }),
    });
    await runtime.start(); await expect(runtime.close()).rejects.toThrow();
    expect(stopped).toBe(true); expect(runtime.status().owned).toBe(false);
  });
  it('stops a browser whose pending launch completes during shutdown', async () => {
    let release!: () => void, stopped = false;
    const runtime = new ManagedBrowserUseRuntime('unused', { prepare: async () => {}, launch: async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return { alive: () => !stopped, stop: async () => { stopped = true; } };
    } });
    const opening = runtime.start(); await new Promise(resolve => setTimeout(resolve, 0));
    const closing = runtime.close(); release();
    await Promise.allSettled([opening, closing]);
    expect(stopped).toBe(true); expect(runtime.status().owned).toBe(false);
    await expect(runtime.start()).rejects.toThrow('BROWSER_OBU_RUNTIME_CLOSED');
  });
});
