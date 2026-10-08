import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { executeCommand, releaseInput } from '../extensions/agent-core-browser-bridge/protocol.js';

const source = readFileSync(new URL('../extensions/agent-core-browser-bridge/worker.js', import.meta.url), 'utf8');
const ID = 'a'.repeat(32), POPUP = 'chrome-extension://' + ID + '/popup.html';

function worker(fetcher: (route: string, body: any) => Promise<any>, attachFails = false) {
  let message: any, detachEvent: any;
  const commands: any[] = [], attached: any[] = [], detached: any[] = [];
  const chrome = {
    runtime: { id: ID, getURL: (path: string) => 'chrome-extension://' + ID + '/' + path,
      onMessage: { addListener: (callback: any) => { message = callback; } } },
    tabs: { query: async () => [{ id: 42, url: 'https://example.test/work' }] },
    debugger: {
      attach: async (target: any) => { attached.push(target); if (attachFails) throw new Error('Another debugger owns this tab'); },
      detach: async (target: any) => { detached.push(target); detachEvent?.(target); },
      sendCommand: async (...args: any[]) => { commands.push(args); return {}; },
      onEvent: { addListener: () => {} }, onDetach: { addListener: (callback: any) => { detachEvent = callback; } },
    },
  };
  runInNewContext(source.replace(/^import .*\n/, ''), {
    chrome, executeCommand, releaseInput, AbortSignal, setTimeout, clearTimeout,
    fetch: async (url: string, options: any) => {
      expect(url.startsWith('http://127.0.0.1:8765/browser-bridge/')).toBe(true);
      expect(options.headers['X-Agent-Core-Extension']).toBe(ID);
      const data = await fetcher(url.split('/').pop()!, JSON.parse(options.body));
      return { ok: true, json: async () => data };
    },
  });
  const send = (action: string, code = '0'.repeat(32), sender = { id: ID, url: POPUP }) =>
    new Promise<any>(resolve => { if (!message({ action, code }, sender, resolve)) resolve({ refused: true }); });
  return { send, commands, attached, detached };
}

describe('actual extension service worker', () => {
  it('keeps an explicit single-tab grant, detaches on lost acknowledgement and never replays', async () => {
    const bodies: any[] = []; let polls = 0;
    const current = worker(async (route, body) => {
      bodies.push({ route, body });
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'poll') {
        if (++polls === 1) return { state: 'attached', tabId: 42, commands: [{ id: 1,
          method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' } }] };
        throw new Error('Acknowledgement lost');
      }
      return { closed: true };
    });
    expect(await current.send('connect')).toMatchObject({ connected: true });
    await vi.waitFor(() => expect(current.detached).toHaveLength(1));
    expect(current.attached).toEqual([{ tabId: 42 }]);
    expect(current.commands.filter(c => c[2].type === 'keyDown')).toHaveLength(1);
    expect(current.commands.filter(c => c[2].type === 'keyUp')).toHaveLength(1);
    expect(polls).toBe(2);
    expect(bodies.filter(b => b.route === 'pair')).toHaveLength(1);
    expect(await current.send('status')).toMatchObject({ connected: false });
    expect(await current.send('status', '', { id: ID, url: 'https://untrusted.test' })).toEqual({ refused: true });
  });

  it('refuses duplicate command IDs before sending them to the browser', async () => {
    let polls = 0;
    const current = worker(async route => {
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'poll') {
        polls++;
        return { state: 'attached', tabId: 42, commands: [{ id: 1, method: 'Page.enable', params: {} }] };
      }
      return { closed: true };
    });
    await current.send('connect');
    await vi.waitFor(() => expect(current.detached).toHaveLength(1));
    expect(polls).toBe(2); expect(current.commands).toHaveLength(1);
  });

  it('invalidates a grant when the existing browser refuses debugger attachment', async () => {
    const routes: string[] = [];
    const current = worker(async route => { routes.push(route);
      return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 }; }, true);
    expect(await current.send('connect')).toMatchObject({ error: 'Another debugger owns this tab' });
    expect(routes).toEqual(['pair', 'disconnect']); expect(current.commands).toEqual([]);
    expect(await current.send('status')).toMatchObject({ connected: false });
  });
});
