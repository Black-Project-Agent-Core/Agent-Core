import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';
import { BrowserExtensionBridge } from '../src/rdc/browser-control/extension-bridge.js';
import { browserControl } from '../src/mcp/rdc-schemas.js';
import { BrowserControlArgsSchema } from '../src/rdc/tools/schemas.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); for (const close of cleanup.splice(0)) await close(); });
const origin = 'chrome-extension://' + 'a'.repeat(32);

// Exercise the real owner using its actual extension command/reply boundary.
async function fixture() {
  const bridge = new BrowserExtensionBridge(1500), service = new BrowserControlService({ extensionBridge: bridge });
  const opened: any = await service.open('https://fixture.test', false, { transport: 'extension' });
  const grant: any = bridge.pair({ code: opened.pairingCode, tabId: 42, url: 'https://fixture.test' }, origin);
  const client = bridge.get(grant, origin);
  await client.poll(origin, grant.token, [], [], undefined, 0);
  const geometry = { documentKey: [123, 'https://fixture.test/'], width: 800, height: 600,
    devicePixelRatio: 1, scale: 1, offsetX: 0, offsetY: 0, pageX: 0, pageY: 0, zoom: 1 };
  const page = { url: 'https://fixture.test/', title: 'Fixture', text: 'READY', document_key: geometry.documentKey,
    actions: [{ id: 'e1', kind: 'click', node: 1, label: 'Start' }, { id: 'e2', kind: 'click', node: 2, label: 'End' }, { id: 'wait', kind: 'wait', label: 'Wait' }],
    marker: 'same', page_key: 'same', guards: { '1': 'safe', '2': 'safe' }, control_states: { items: [], total: 0 }, omitted_actions: 0 };
  const image = (await sharp({ create: { width: 800, height: 600, channels: 3, background: '#557799' } }).jpeg().toBuffer()).toString('base64');
  const commands: any[] = []; let stopped = false, failMouse = false;
  const pump = (async () => {
    let replies: any[] = [];
    while (!stopped && client.state !== 'closed') {
      const batch: any = await client.poll(origin, grant.token, replies, [], undefined, 5); replies = [];
      for (const command of batch.commands) {
        commands.push(command); let result: any = {};
        if (command.method === 'Runtime.evaluate') {
          const expression = String(command.params.expression);
          const value = expression.includes('const cache = window.__agentCoreBrowser') ? page
            : expression.includes('__agentCorePointerGeometry') ? geometry
            : expression.includes('c.pageKey(),c.guard') ? ['same', 'safe']
            : expression.includes('getBoundingClientRect') ? { x: expression.includes('"node":2') ? 300 : 100, y: 100 }
            : true;
          result = { result: { value } };
        }
        if (command.method === 'Page.getLayoutMetrics') result = { cssVisualViewport: { clientWidth: geometry.width, clientHeight: geometry.height,
          pageX: geometry.pageX, pageY: geometry.pageY, offsetX: 0, offsetY: 0, scale: 1, zoom: 1 } };
        if (command.method === 'Page.captureScreenshot') result = { data: image };
        if (command.method === 'AgentCore.detach') result = { detached: true };
        if (command.method === 'AgentCore.pause') result = { paused: true, released: true };
        if (command.method === 'AgentCore.resume') result = { paused: false };
        replies.push({ id: command.id, ...(failMouse && command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mouseMoved'
          ? { error: 'lost-input-ack' } : { result }) });
      }
    }
  })();
  cleanup.push(async () => { await service.close(opened.sessionId).catch(() => undefined); stopped = true; await pump.catch(() => undefined); });
  return { service, id: opened.sessionId, client, geometry, page, commands, failMouse: () => { failMouse = true; } };
}
function coordinate(observed: any, operation = 'CLICK') {
  const { captureId, targetId, documentId, geometryVersion } = observed.capture;
  return { operation, captureId, targetId, documentId, geometryVersion, x: 100, y: 100 };
}

describe('capture-bound browser pointer', () => {
  it.each([browserControl, BrowserControlArgsSchema])('accepts mutually exclusive DOM and capture coordinates in both tool schemas', schema => {
    const ids = { sessionId: '8de93c61-aed4-4eee-8eaa-4bfc5d38f488', observationId: '8de93c61-aed4-4eee-8eaa-4bfc5d38f499' };
    const pointer = { operation: 'DRAG', captureId: ids.observationId, targetId: 'tab', documentId: 'doc', geometryVersion: 'geo', x: 1, y: 2, path: [{ x: 3, y: 4 }], durationMs: 200 };
    expect(schema.safeParse({ action: 'act', ...ids, pointer }).success).toBe(true);
    expect(schema.safeParse({ action: 'act', ...ids, actionId: 'e1', pointer }).success).toBe(false);
    expect(schema.safeParse({ action: 'act', ...ids, pointer: { ...pointer, path: Array(120).fill({ x: 1, y: 2 }) } }).success).toBe(false);
    expect(schema.safeParse({ action: 'act', ...ids, pointer: { ...pointer, durationMs: 5001 } }).success).toBe(false);
    expect(schema.safeParse({ action: 'act', ...ids, actionId: 'e1', pointer: { operation: 'HOVER' } }).success).toBe(true);
    expect(schema.safeParse({ action: 'observe', sessionId: ids.sessionId, screenshot: { maxAgeMs: 120000 } }).success).toBe(true);
    expect(schema.safeParse({ action: 'pause', sessionId: ids.sessionId }).success).toBe(true);
    expect(schema.safeParse({ action: 'observe', sessionId: ids.sessionId, screenshot: { maxAgeMs: 120001 } }).success).toBe(false);
  });
  it('captures bounded pixels with explicit geometry then consumes a coordinate click only once', async () => {
    const f = await fixture(), observed: any = await f.service.observe(f.id, { screenshot: {} } as any);
    expect(observed.capture).toMatchObject({ coordinateSpace: 'css-viewport', oneMutation: true, image: { width: 800, height: 600 }, viewport: { width: 800, height: 600 } });
    expect(Date.parse(observed.capture.expiresAt) - Date.parse(observed.capture.capturedAt)).toBe(30000);
    expect(observed.image).toMatchObject({ type: 'image', mimeType: 'image/jpeg' });
    expect(Buffer.from(observed.image.data, 'base64').length).toBeLessThanOrEqual(128 * 1024);
    const result = await f.service.act(f.id, observed.observationId, undefined as any, undefined, { pointer: coordinate(observed) } as any);
    expect(result).toMatchObject({ dispatched: true, outcome: 'not-observed' });
    expect(f.commands.filter(c => c.method === 'Input.dispatchMouseEvent').map(c => c.params.type)).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased']);
    await expect(f.service.act(f.id, observed.observationId, undefined as any, undefined, { pointer: coordinate(observed) } as any)).rejects.toThrow('OBSERVATION_NOT_CURRENT');
    expect(f.commands.some(c => c.method === 'Page.bringToFront')).toBe(false);
  });
  it.each(['geometry', 'document', 'outside', 'target', 'expiry'])('rejects %s mismatch before dispatch', async reason => {
    const f = await fixture(), observed: any = await f.service.observe(f.id, { screenshot: {} } as any);
    const pointer = coordinate(observed);
    if (reason === 'geometry') f.geometry.width += 1;
    if (reason === 'document') f.geometry.documentKey[0] = 999;
    if (reason === 'outside') pointer.x = 800;
    if (reason === 'target') pointer.targetId = 'other';
    if (reason === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30001);
    await expect(f.service.act(f.id, observed.observationId, undefined as any, undefined, { pointer } as any)).rejects.toThrow(/CAPTURE|OUTSIDE/);
    vi.restoreAllMocks();
    expect(f.commands.some(c => c.method === 'Input.dispatchMouseEvent')).toBe(false);
  });
  it('uses observed element IDs for hover and complete bounded drag', async () => {
    const f = await fixture(); let observed: any = await f.service.observe(f.id);
    await f.service.act(f.id, observed.observationId, 'e1', undefined, { pointer: { operation: 'HOVER' } } as any);
    observed = await f.service.observe(f.id);
    await f.service.act(f.id, observed.observationId, 'e1', undefined, { pointer: { operation: 'DRAG', toActionId: 'e2', durationMs: 10 } } as any);
    const events = f.commands.filter(c => c.method === 'Input.dispatchMouseEvent').map(c => c.params);
    expect(events[0]).toMatchObject({ type: 'mouseMoved', x: 100, y: 100, buttons: 0 });
    expect(events.find(e => e.type === 'mouseMoved' && e.buttons === 1)).toMatchObject({ x: 300, y: 100 });
    expect(events.at(-1)).toMatchObject({ type: 'mouseReleased', button: 'left', buttons: 0 });
  });
  it('supports targeted two-axis scroll and invalidates old captures after pause/resume', async () => {
    const f = await fixture(); let observed: any = await f.service.observe(f.id, { screenshot: {} } as any);
    await f.service.act(f.id, observed.observationId, undefined as any, undefined, { pointer: { ...coordinate(observed, 'SCROLL'), deltaX: 140, deltaY: -200 } } as any);
    expect(f.commands.find(c => c.params.type === 'mouseWheel').params).toMatchObject({ x: 100, y: 100, deltaX: 140, deltaY: -200 });
    observed = await f.service.observe(f.id, { screenshot: {} } as any);
    await (f.service as any).pause(f.id);
    await expect(f.service.act(f.id, observed.observationId, undefined as any, undefined, { pointer: coordinate(observed) } as any)).rejects.toThrow('PAUSED');
    await (f.service as any).resume(f.id);
    await expect(f.service.act(f.id, observed.observationId, undefined as any, undefined, { pointer: coordinate(observed) } as any)).rejects.toThrow('OBSERVATION_NOT_CURRENT');
  });
  it('returns lean screenshot metadata on dense pages without accepting hidden action IDs', async () => {
    const f = await fixture();
    f.page.text = 'VISIBLE '.repeat(3000);
    f.page.actions = Array.from({ length: 100 }, (_, i) => ({ id: 'e' + i, kind: 'click', node: i, label: 'Label'.repeat(100) }));
    const observed: any = await f.service.observe(f.id, { screenshot: {} } as any);
    const { image, ...metadata } = observed;
    expect(image.type).toBe('image');
    expect(Buffer.byteLength(JSON.stringify(metadata))).toBeLessThanOrEqual(16 * 1024);
    expect(observed.metadataOmissions.actions).toBeGreaterThan(0);
    expect(observed.metadataOmissions.text).toBe(true);
    expect(observed.actions.every((a: any) => f.page.actions.some(p => p.id === a.id))).toBe(true);
    await expect(f.service.act(f.id, observed.observationId, 'e99')).rejects.toThrow('ACTION_NOT_OBSERVED');
  });
  it('cannot continue an old fill after pause and resume during click acknowledgement', async () => {
    const f = await fixture();
    f.page.actions[0].kind = 'fill';
    const observed: any = await f.service.observe(f.id);
    const session = (f.service as any).sessions.get(f.id), original = session.client;
    // Isolated transport does not enforce pause itself: owner generation must fence every trailing command.
    let paused = false;
    session.extension = undefined;
    session.client = { close() {}, async send(method: string, params: any) {
      const result = await original.send(method, params);
      if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased' && !paused) {
        paused = true; void f.service.pause(f.id); await f.service.resume(f.id);
      }
      return result;
    } };
    try {
      await expect(f.service.act(f.id, observed.observationId, 'e1', 'DO NOT TYPE')).rejects.toThrow(/INPUT_CANCELLED|PAUSED/);
      expect(f.commands.some(c => c.method === 'Input.insertText')).toBe(false);
    } finally { session.extension = original; session.client = original; }
  });
  it('stops held pointer input during pause and releases against the original target', async () => {
    const f = await fixture(), observed: any = await f.service.observe(f.id, { screenshot: {} } as any);
    const acting = f.service.act(f.id, observed.observationId, undefined, undefined, { pointer: {
      ...coordinate(observed, 'DRAG'), path: [{ x: 200, y: 100 }, { x: 300, y: 100 }], durationMs: 1000,
    } } as any);
    const result = expect(acting).rejects.toThrow(/INPUT_CANCELLED|PAUSED|MUTATION_UNCERTAIN/);
    while (!f.commands.some(c => c.params.type === 'mousePressed')) await new Promise(r => setTimeout(r, 1));
    await f.service.pause(f.id); await result;
    await f.service.resume(f.id);
    expect(f.commands.some(c => c.params.type === 'mouseMoved' && c.params.buttons === 1)).toBe(false);
    // The transport pause command also guarantees selected-tab release independently.
    expect(f.commands.some(c => c.params.type === 'mouseReleased' || c.method === 'AgentCore.pause')).toBe(true);
    const next: any = await f.service.observe(f.id, { screenshot: {} } as any);
    expect(next.capture.captureId).not.toBe(observed.capture.captureId);
  });
  it('invalidates capture immediately on navigation and resize events', async () => {
    const f = await fixture();
    for (const method of ['Page.frameResized', 'Page.frameNavigated', 'Page.navigatedWithinDocument']) {
      const observed: any = await f.service.observe(f.id, { screenshot: {} } as any);
      f.client.onEvent?.(method, { frame: { id: 'main' } });
      await expect(f.service.act(f.id, observed.observationId, undefined, undefined, { pointer: coordinate(observed) } as any)).rejects.toThrow('OBSERVATION_NOT_CURRENT');
    }
    expect(f.commands.some(c => c.method === 'Input.dispatchMouseEvent')).toBe(false);
  });
  it('handles a failed pause transport immediately while independent release is still pending', async () => {
    const f = await fixture(), session = (f.service as any).sessions.get(f.id);
    let finishRelease!: () => void;
    const release = vi.spyOn(session.pointer, 'close').mockImplementation(() => new Promise<void>(r => { finishRelease = r; }));
    const pause = vi.spyOn(f.client, 'pause').mockRejectedValue(new Error('pause transport lost'));
    let rejected = false;
    const pending = f.service.pause(f.id).catch(error => { rejected = true; expect(error.message).toBe('pause transport lost'); });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    try { expect(rejected).toBe(true); }
    finally { finishRelease(); await pending; release.mockRestore(); pause.mockRestore(); }
  });
  it('rejects concurrent observation before any duplicate capture can dispatch', async () => {
    const f = await fixture();
    const first = f.service.observe(f.id, { screenshot: {} } as any);
    await expect(f.service.observe(f.id, { screenshot: {} } as any)).rejects.toThrow('ACTION_IN_FLIGHT');
    await first;
    expect(f.commands.filter(c => c.method === 'Page.captureScreenshot')).toHaveLength(1);
  });
  it('releases a failed drag without retrying the mutation', async () => {
    const f = await fixture(), observed: any = await f.service.observe(f.id, { screenshot: {} } as any);
    const pointer = { ...coordinate(observed, 'DRAG'), path: [{ x: 200, y: 100 }], durationMs: 10 };
    // Initial move succeeds; fail the held movement after the press.
    const polling = setInterval(() => { if (f.commands.some(c => c.params.type === 'mousePressed')) f.failMouse(); }, 1);
    try { await expect(f.service.act(f.id, observed.observationId, undefined as any, undefined, { pointer } as any)).rejects.toThrow('MUTATION_UNCERTAIN'); }
    finally { clearInterval(polling); }
    expect(f.commands.filter(c => c.params.type === 'mousePressed')).toHaveLength(1);
    expect(f.commands.filter(c => c.params.type === 'mouseReleased')).toHaveLength(1);
  });
});
