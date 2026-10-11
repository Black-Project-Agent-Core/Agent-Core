import { describe, expect, it } from 'vitest';
// Native extension module has no browser/global side effects and can be verified directly.
import { executeCommand, releaseInput } from '../extensions/agent-core-browser-bridge/protocol.js';

describe('extension debugger protocol', () => {
  it('binds every command to the explicitly granted tab and refuses credential APIs', async () => {
    const calls: any[] = [];
    const api = { sendCommand: async (...args: any[]) => { calls.push(args); return { ok: true }; } };
    const pressed = new Map();
    const result = await executeCommand(api, 42, { id: 1, method: 'Page.enable', params: {} }, pressed, async () => {});
    expect(result).toEqual({ id: 1, result: { ok: true } });
    expect(calls[0][0]).toEqual({ tabId: 42 });
    await expect(executeCommand(api, 42, { id: 2, method: 'Network.getAllCookies', params: {} }, pressed, async () => {})).rejects.toThrow('refused');
    expect(calls).toHaveLength(1);
  });
  it('releases a held key even if keyDown reply is lost, then detaches only debugger', async () => {
    const calls: any[] = [];
    const api = { sendCommand: async (...args: any[]) => { calls.push(args);
      if (args[2].type === 'keyDown') throw new Error('lost response'); return {}; } };
    const pressed = new Map();
    await expect(executeCommand(api, 42, { id: 1, method: 'Input.dispatchKeyEvent', params: {
      type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' } }, pressed, async () => {})).rejects.toThrow('lost response');
    expect(await releaseInput(api, 42, pressed)).toBe(true);
    expect(calls[1]).toEqual([{ tabId: 42 }, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', modifiers: 0 }]);
    let detached = false;
    expect(await executeCommand(api, 42, { id: 2, method: 'AgentCore.detach', params: {} }, pressed,
      async () => { detached = true; })).toEqual({ id: 2, result: { detached: true } });
    expect(detached).toBe(true);
  });
  it('allows bounded viewport JPEG capture and refuses full-page or extra CDP parameters', async () => {
    const calls: any[] = [];
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const api = { sendCommand: async (...args: any[]) => { calls.push(args); return { data }; } };
    const params = { format: 'jpeg', quality: 70, fromSurface: true, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1120, height: 780, scale: 1 } };
    expect(await executeCommand(api, 42, { id: 1, method: 'Page.captureScreenshot', params }, new Map(), async () => {}))
      .toEqual({ id: 1, result: { data } });
    for (const bad of [{ ...params, captureBeyondViewport: true }, { ...params, quality: 20 },
      { ...params, format: 'png' }, { ...params, optimizeForSpeed: true },
      { ...params, clip: { ...params.clip, width: Infinity } }]) {
      await expect(executeCommand(api, 42, { id: 2, method: 'Page.captureScreenshot', params: bad }, new Map(), async () => {}))
        .rejects.toThrow('CAPTURE_ARGUMENTS_REFUSED');
    }
    expect(calls).toHaveLength(1);
    await expect(executeCommand(api, 42, { id: 3, method: 'Page.getLayoutMetrics', params: {} }, new Map(), async () => {})).resolves.toBeDefined();
  });

  it('never returns oversized or invalid capture bytes from the extension', async () => {
    const params = { format: 'jpeg', quality: 70, fromSurface: true, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1120, height: 780, scale: 1 } };
    for (const data of [Buffer.alloc(128 * 1024 + 1).toString('base64'), 'not base64']) {
      const api = { sendCommand: async () => ({ data }) };
      await expect(executeCommand(api, 42, { id: 1, method: 'Page.captureScreenshot', params }, new Map(), async () => {}))
        .rejects.toThrow(/CAPTURE_(TOO_LARGE|INVALID)/);
    }
  });

  it('releases pointer at its last position with all buttons and modifiers clear', async () => {
    const calls: any[] = [];
    const api = { sendCommand: async (...args: any[]) => { calls.push(args); return {}; } };
    const pressed = new Map();
    await executeCommand(api, 42, { id: 1, method: 'Input.dispatchMouseEvent', params: {
      type: 'mousePressed', x: 10, y: 20, button: 'left', buttons: 1, modifiers: 8 } }, pressed, async () => {});
    await executeCommand(api, 42, { id: 2, method: 'Input.dispatchMouseEvent', params: {
      type: 'mouseMoved', x: 40, y: 50, buttons: 1, modifiers: 8 } }, pressed, async () => {});
    await releaseInput(api, 42, pressed);
    expect(calls[2][2]).toMatchObject({ type: 'mouseReleased', x: 40, y: 50, buttons: 0, modifiers: 0 });
    expect(pressed.size).toBe(0);
  });

  it('bounds layout metadata independently of image bytes', async () => {
    const api = { sendCommand: async () => ({ cssVisualViewport: { extra: 'x'.repeat(16 * 1024) } }) };
    await expect(executeCommand(api, 42, { id: 1, method: 'Page.getLayoutMetrics', params: {} }, new Map(), async () => {}))
      .rejects.toThrow('METADATA_TOO_LARGE');
  });

});
