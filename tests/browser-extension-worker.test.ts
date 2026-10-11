import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { executeCommand, releaseInput } from '../extensions/agent-core-browser-bridge/protocol.js';

const source = readFileSync(new URL('../extensions/agent-core-browser-bridge/worker.js', import.meta.url), 'utf8');
const ID = 'a'.repeat(32), POPUP = 'chrome-extension://' + ID + '/popup.html';

function worker(fetcher: (route: string, body: any) => Promise<any>, attachFails = false, commandHook?: (...args: any[]) => Promise<any>, attachHook?: () => Promise<void>) {
  let message: any, detachEvent: any, debuggerEvent: any;
  const commands: any[] = [], attached: any[] = [], detached: any[] = [];
  const chrome = {
    runtime: { id: ID, getURL: (path: string) => 'chrome-extension://' + ID + '/' + path,
      onMessage: { addListener: (callback: any) => { message = callback; } } },
    tabs: { query: async () => [{ id: 42, url: 'https://example.test/work' }] },
    debugger: {
      attach: async (target: any) => { attached.push(target); if (attachFails) throw new Error('Another debugger owns this tab'); if (attachHook) await attachHook(); },
      detach: async (target: any) => { detached.push(target); detachEvent?.(target); },
      sendCommand: async (...args: any[]) => { commands.push(args); return commandHook ? await commandHook(...args) : {}; },
      onEvent: { addListener: (callback: any) => { debuggerEvent = callback; } }, onDetach: { addListener: (callback: any) => { detachEvent = callback; } },
    },
  };
  runInNewContext(source.replace(/^import .*\n/, ''), {
    chrome, executeCommand, releaseInput, AbortSignal, TextEncoder, setTimeout, clearTimeout,
    fetch: async (url: string, options: any) => {
      expect(url.startsWith('http://127.0.0.1:8765/browser-bridge/')).toBe(true);
      expect(options.headers['X-Agent-Core-Extension']).toBe(ID);
      const data = await fetcher(url.split('/').pop()!, JSON.parse(options.body));
      return { ok: true, json: async () => data };
    },
  });
  const send = (action: string, code = '0'.repeat(32), sender = { id: ID, url: POPUP }) =>
    new Promise<any>(resolve => { if (!message({ action, code }, sender, resolve)) resolve({ refused: true }); });
  return { send, commands, attached, detached, emit: (...args: any[]) => debuggerEvent(...args), detachEvent: (...args: any[]) => detachEvent(...args) };
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

  it('cancels commands returned after user disconnect without reattaching', async () => {
    let deliver: (batch: any) => void = () => {};
    const current = worker(async route => {
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'poll') return await new Promise(resolve => { deliver = resolve; });
      return { closed: true };
    });
    await current.send('connect');
    await current.send('disconnect');
    deliver({ state: 'attached', tabId: 42, commands: [{ id: 1, method: 'Input.insertText', params: { text: 'stale' } }] });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(current.commands).toEqual([]);
    expect(current.attached).toHaveLength(1);
    expect(current.detached).toHaveLength(1);
  });

  it('pause waits for active input, releases it and refuses later commands from the same batch', async () => {
    let settleInput: () => void = () => {};
    let polls = 0;
    const bodies: any[] = [];
    const current = worker(async (route, body) => {
      bodies.push({ route, body });
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'control') return { state: body.paused ? 'paused' : 'attached' };
      if (route === 'poll' && ++polls === 1) return { state: 'attached', tabId: 42, commands: [
        { id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 10, y: 20, button: 'left', buttons: 1 } },
        { id: 2, method: 'Input.insertText', params: { text: 'must not type' } },
      ] };
      if (route === 'poll') return await new Promise(() => {});
      return { closed: true };
    }, false, async (_target, method, params) => {
      if (method === 'Input.dispatchMouseEvent' && params.type === 'mousePressed') await new Promise<void>(resolve => { settleInput = resolve; });
      return {};
    });
    await current.send('connect');
    await vi.waitFor(() => expect(current.commands).toHaveLength(1));
    const pausing = current.send('pause');
    await vi.waitFor(() => expect(bodies.some(b => b.route === 'control')).toBe(true));
    settleInput();
    expect(await pausing).toMatchObject({ connected: true, paused: true });
    expect(current.commands.map(c => c[2].type)).toEqual(['mousePressed', 'mouseReleased']);
    expect(current.commands[1][2]).toMatchObject({ buttons: 0, modifiers: 0 });
    expect(await current.send('resume')).toMatchObject({ connected: true, paused: false });
    expect(current.attached).toHaveLength(1);
    await current.send('disconnect');
  });


  it('forwards bounded main-frame invalidation even with a very long navigation URL', async () => {
    let deliver: (batch: any) => void = () => {};
    let polls = 0;
    const bodies: any[] = [];
    const current = worker(async (route, body) => {
      bodies.push({ route, body });
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'poll' && ++polls === 1) return await new Promise(resolve => { deliver = resolve; });
      if (route === 'poll') return await new Promise(() => {});
      return { closed: true };
    });
    await current.send('connect');
    current.emit({ tabId: 42 }, 'Page.frameNavigated', { frame: { id: 'main', url: 'https://example.test/' + 'x'.repeat(5000) } });
    current.emit({ tabId: 42 }, 'Page.frameNavigated', { frame: { id: 'child', parentId: 'main' } });
    deliver({ state: 'attached', tabId: 42, commands: [] });
    await vi.waitFor(() => expect(polls).toBe(2));
    expect(bodies.filter(b => b.route === 'poll')[1].body.events).toEqual([
      { method: 'Page.frameNavigated', params: { frame: { id: 'main' } } },
    ]);
    await current.send('disconnect');
  });

  it('does not send any remaining command after explicit debugger detach', async () => {
    let polls = 0;
    const current = worker(async route => {
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'poll' && ++polls === 1) return { state: 'attached', tabId: 42, commands: [
        { id: 1, method: 'AgentCore.detach', params: {} },
        { id: 2, method: 'Input.insertText', params: { text: 'stale' } },
      ] };
      if (route === 'poll') return await new Promise(() => {});
      return { closed: true };
    });
    await current.send('connect');
    await vi.waitFor(() => expect(current.detached).toHaveLength(1));
    expect(current.commands).toEqual([]);
    await current.send('disconnect');
  });


  it('cancels a connection while pairing is still pending and never attaches it', async () => {
    let pair: (value: any) => void = () => {};
    const current = worker(async route => {
      if (route === 'pair') return await new Promise(resolve => { pair = resolve; });
      return { closed: true };
    });
    const connecting = current.send('connect');
    await vi.waitFor(async () => expect(await current.send('status')).toMatchObject({ connecting: true }));
    await current.send('disconnect');
    pair({ sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 });
    expect(await connecting).toMatchObject({ connected: false, error: 'Connection cancelled' });
    expect(current.attached).toEqual([]);
  });

  it('resumes a pending paused poll without rejecting fresh commands or attaching again', async () => {
    let deliver: (batch: any) => void = () => {};
    let polls = 0;
    const current = worker(async (route, body) => {
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'control' && body.paused) {
        deliver({ state: 'paused', tabId: 42, commands: [] });
        return { state: 'paused' };
      }
      if (route === 'control') {
        deliver({ state: 'attached', tabId: 42, commands: [{ id: 1, method: 'Page.getLayoutMetrics', params: {} }] });
        await new Promise(resolve => setTimeout(resolve, 5));
        return { state: 'attached' };
      }
      if (route === 'poll') { polls++; return await new Promise(resolve => { deliver = resolve; }); }
      return { closed: true };
    });
    await current.send('connect');
    expect(await current.send('pause')).toMatchObject({ paused: true });
    await vi.waitFor(() => expect(polls).toBe(2));
    expect(await current.send('resume')).toMatchObject({ paused: false });
    expect(current.commands.map(c => c[1])).toEqual(['Page.getLayoutMetrics']);
    expect(current.attached).toHaveLength(1);
    await current.send('disconnect');
  });


  it('locally cancels a navigation-stale pending poll even when event metadata is full', async () => {
    let deliver: (batch: any) => void = () => {};
    const current = worker(async route => {
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'poll') return await new Promise(resolve => { deliver = resolve; });
      return { closed: true };
    });
    await current.send('connect');
    for (let i = 0; i < 16; i++) current.emit({ tabId: 42 }, 'Page.javascriptDialogClosed', {});
    current.emit({ tabId: 42 }, 'Page.frameNavigated', { frame: { id: 'new-document' } });
    deliver({ state: 'attached', tabId: 42, commands: [{ id: 1, method: 'Input.insertText', params: { text: 'stale' } }] });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(current.commands).toEqual([]);
    await current.send('disconnect');
  });

  it('navigation releases held input locally before awaiting another host reply', async () => {
    let polls = 0;
    const current = worker(async route => {
      if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
      if (route === 'poll' && ++polls === 1) return { state: 'attached', tabId: 42, commands: [{ id: 1,
        method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 10, y: 20, button: 'left', buttons: 1 } }] };
      if (route === 'poll') return await new Promise(() => {});
      return { closed: true };
    });
    await current.send('connect');
    await vi.waitFor(() => expect(current.commands).toHaveLength(1));
    current.emit({ tabId: 42 }, 'Page.frameNavigated', { frame: { id: 'new-document' } });
    await vi.waitFor(() => expect(current.commands).toHaveLength(2));
    expect(current.commands[1][2]).toMatchObject({ type: 'mouseReleased', buttons: 0, modifiers: 0 });
    await current.send('disconnect');
  });

  it('detaches an attachment that finishes after its timeout without restarting the grant', async () => {
    vi.useFakeTimers();
    try {
      let finishAttach: () => void = () => {};
      const current = worker(async route => {
        if (route === 'pair') return { sessionId: 'fixture', token: 'ephemeral-test-token', tabId: 42 };
        return { closed: true };
      }, false, undefined, async () => { await new Promise<void>(resolve => { finishAttach = resolve; }); });
      const connecting = current.send('connect');
      await vi.advanceTimersByTimeAsync(8001);
      expect(await connecting).toMatchObject({ connected: false, error: 'Debugger timeout; result unknown' });
      finishAttach();
      await vi.advanceTimersByTimeAsync(1);
      expect(current.detached).toEqual([{ tabId: 42 }]);
      expect(current.attached).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

});
