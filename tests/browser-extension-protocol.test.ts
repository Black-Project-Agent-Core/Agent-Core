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
});
