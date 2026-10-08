import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { CLIENT_CAPABILITIES_META_KEY, PROTOCOL_VERSION_META_KEY } from '@modelcontextprotocol/server';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { configManager } from '../src/rdc/config-manager.js';
import { toolHistory } from '../src/rdc/utils/toolHistory.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
beforeEach(() => {
  vi.spyOn(toolHistory, 'addCall').mockReturnValue(true);
  vi.spyOn(usageTracker, 'trackSuccess').mockResolvedValue(undefined);
  vi.spyOn(usageTracker, 'trackFailure').mockResolvedValue(undefined);
  vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation(() => undefined as any);
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(dropCredentialId = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-inspect-http-'));
  roots.push(root);
  const file = path.join(root, 'source.png');
  await sharp({ create: { width: 12, height: 10, channels: 3, background: 'red' } }).png().toFile(file);
  vi.spyOn(configManager, 'getConfig').mockResolvedValue({ allowedDirectories: [root] });
  const keyStore = new FileKeyStore(path.join(root, 'keys'));
  const keyOptions = { toolGrant: { version: 1 as const, allowedTools: ['image_inspect'] }, availableTools: ['image_inspect'] };
  const owner = await keyStore.create('test owner', keyOptions);
  const foreign = await keyStore.create('test foreign', keyOptions);
  const handler = createMcpHttpHandler();
  const http = createServer(createHttpHandler({ keyStore, mcpHandler: (request, response, key) =>
    handler(request, response, dropCredentialId ? { ...key, id: '' } : key) }));
  await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve); });
  closers.push(async () => { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); });
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('LISTENER_NOT_BOUND');
  const query = async (method: string, params: Record<string, unknown>, token = owner.key, session: string | null = 'controller-a', header = 'x-agent-core-session-id') => {
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: 'POST', headers: {
        'content-type': 'application/json', accept: 'application/json,text/event-stream', authorization: `Bearer ${token}`,
        ...(session === null ? {} : { [header]: session }),
        ...('_meta' in params ? { 'mcp-method': method, 'mcp-name': String(params.name), 'mcp-protocol-version': '2026-07-28' } : {}),
      }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = await response.text();
    const line = body.split('\n').find(value => value.startsWith('data:'));
    return { status: response.status, ...JSON.parse(line ? line.slice(5) : body) };
  };
  const inspect = (args: object, token = owner.key, session: string | null = 'controller-a', header = 'x-agent-core-session-id') =>
    query('tools/call', { name: 'image_inspect', arguments: { path: file, ...args } }, token, session, header);
  return { root, file, keyStore, owner, foreign, query, inspect };
}
function metadata(response: any) {
  expect(response.status).toBe(200);
  expect(response.error).toBeUndefined();
  expect(response.result?.isError, JSON.stringify(response.result)).not.toBe(true);
  expect(response.result?.content.some((part: any) => part.type === 'image')).toBe(true);
  return JSON.parse(response.result.content.find((part: any) => part.type === 'text').text);
}
function crop(viewId: string) { return { action: 'crop', viewId, rectangle: { x: 2, y: 3, width: 4, height: 5 } }; }
function unavailable(response: any) {
  expect(response.status).toBe(200);
  expect(JSON.stringify(response)).toContain('IMAGE_INSPECT_VIEW_NOT_FOUND');
  expect(response.result?.content?.some((part: any) => part.type === 'image')).not.toBe(true);
}

describe('image_inspect authenticated HTTP session ownership', () => {
  it.each(['x-agent-core-session-id', 'mcp-session-id'])('keeps an overview for a later HTTP crop using %s', async header => {
    const { inspect, owner } = await fixture();
    const view = metadata(await inspect({ action: 'overview' }, owner.key, 'controller-a', header));
    const result = metadata(await inspect(crop(view.viewId), owner.key, 'controller-a', header));
    expect(result.sourceRect).toEqual({ x: 2, y: 3, width: 4, height: 5 });
    expect(result.displayed).toEqual({ width: 4, height: 5 });
  });

  it('keeps views across modern per-request envelope transports', async () => {
    const { query, file, owner, foreign } = await fixture();
    const call = (args: object, token = owner.key, session = 'modern-controller') => query('tools/call', {
      name: 'image_inspect', arguments: { path: file, ...args },
      _meta: { [PROTOCOL_VERSION_META_KEY]: '2026-07-28', [CLIENT_CAPABILITIES_META_KEY]: {} },
    }, token, session);
    const overview = await call({ action: 'overview' });
    expect(overview.result?.resultType, JSON.stringify(overview)).toBe('complete');
    const view = metadata(overview);
    expect(metadata(await call(crop(view.viewId))).sourceRect.width).toBe(4);
    unavailable(await call(crop(view.viewId), foreign.key));
    unavailable(await call(crop(view.viewId), owner.key, 'other-modern-controller'));
  });

  it('delivers a PNG larger than the ordinary result budget over real HTTP', async () => {
    const { inspect, file } = await fixture();
    const pixels = randomBytes(384 * 384 * 3);
    await sharp(pixels, { raw: { width: 384, height: 384, channels: 3 } }).png().toFile(file);
    const response = await inspect({ action: 'overview' });
    const view = metadata(response);
    expect(view.encodedBytes).toBeGreaterThan(256 * 1024);
    const image = response.result.content.find((part: any) => part.type === 'image');
    const decoded = await sharp(Buffer.from(image.data, 'base64')).raw().toBuffer();
    expect(decoded).toEqual(pixels);
    metadata(await inspect(crop(view.viewId)));
  });

  it('revalidates source access after the path allowlist changes', async () => {
    const { inspect, root } = await fixture();
    const view = metadata(await inspect({ action: 'overview' }));
    vi.mocked(configManager.getConfig).mockResolvedValue({ allowedDirectories: [path.join(root, 'denied')] });
    const denied = await inspect(crop(view.viewId));
    expect(denied.result?.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain('Path not allowed');
    expect(denied.result?.content.some((part: any) => part.type === 'image')).toBe(false);
    vi.mocked(configManager.getConfig).mockResolvedValue({ allowedDirectories: [root] });
    metadata(await inspect(crop(view.viewId)));
  });

  it('rejects revoked credentials before they can reuse a retained view', async () => {
    const { inspect, owner, keyStore } = await fixture();
    const view = metadata(await inspect({ action: 'overview' }));
    expect(await keyStore.revoke(owner.metadata.id)).toBe(true);
    const denied = await inspect(crop(view.viewId));
    expect(denied.status).toBe(401);
    expect(denied.error).toBe('unauthorized');
  });

  it('rejects a view from another authenticated credential or controller session', async () => {
    const { inspect, owner, foreign } = await fixture();
    const view = metadata(await inspect({ action: 'overview' }));
    unavailable(await inspect(crop(view.viewId), foreign.key));
    unavailable(await inspect(crop(view.viewId), owner.key, 'controller-b'));
    unavailable(await inspect(crop(view.viewId), owner.key, null));
    expect((await inspect(crop(view.viewId), 'invalid-bearer-token')).status).toBe(401);
    expect(metadata(await inspect(crop(view.viewId))).sourceRect.width).toBe(4);
  });

  it('uses a credential-scoped legacy fallback across the hourly learning bucket', async () => {
    const { inspect, owner, foreign } = await fixture();
    const beforeHour = Math.floor(Date.now() / 3_600_000) * 3_600_000 + 59 * 60_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(beforeHour);
    const view = metadata(await inspect({ action: 'overview' }, owner.key, null));
    now.mockReturnValue(beforeHour + 2 * 60_000);
    expect(metadata(await inspect(crop(view.viewId), owner.key, null)).sourceRect.height).toBe(5);
    unavailable(await inspect(crop(view.viewId), foreign.key, null));
    unavailable(await inspect(crop(view.viewId), owner.key, 'controller-a'));
  });

  it('rechecks the current grant even when credential identity and session match a retained view', async () => {
    const { inspect, query, owner, keyStore } = await fixture();
    const view = metadata(await inspect({ action: 'overview' }));
    const state = JSON.parse(await readFile(keyStore.filePath, 'utf8'));
    const record = state.keys.find((key: any) => key.id === owner.metadata.id);
    record.toolGrant.allowedTools = ['read_file'];
    await writeFile(keyStore.filePath, JSON.stringify(state));
    const listed = await query('tools/list', {});
    expect(listed.result.tools.map((tool: any) => tool.name)).toEqual(['read_file']);
    const denied = await inspect(crop(view.viewId));
    expect(JSON.stringify(denied)).toMatch(/disabled|GRANT_DENIED/);
    expect(denied.result?.content?.some((part: any) => part.type === 'image')).not.toBe(true);
    record.toolGrant.allowedTools = ['image_inspect'];
    await writeFile(keyStore.filePath, JSON.stringify(state));
    expect(metadata(await inspect(crop(view.viewId))).sourceRect.width).toBe(4);
  });

  it('does not share anonymous inspectors when credential identity is absent', async () => {
    const { inspect } = await fixture(true);
    const view = metadata(await inspect({ action: 'overview' }));
    unavailable(await inspect(crop(view.viewId)));
  });

  it('evicts the least recently used inspector at the 32-session limit', async () => {
    const { inspect, owner } = await fixture();
    const views: string[] = [];
    for (let i = 0; i < 32; i++) {
      views.push(metadata(await inspect({ action: 'overview' }, owner.key, `controller-${i}`)).viewId);
    }
    metadata(await inspect(crop(views[0]!), owner.key, 'controller-0'));
    const newest = metadata(await inspect({ action: 'overview' }, owner.key, 'controller-32'));
    unavailable(await inspect(crop(views[1]!), owner.key, 'controller-1'));
    metadata(await inspect(crop(views[0]!), owner.key, 'controller-0'));
    metadata(await inspect(crop(newest.viewId), owner.key, 'controller-32'));
  });

  it('expires idle sessions after 15 minutes and accepts a fresh overview', async () => {
    const { inspect } = await fixture();
    const start = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const view = metadata(await inspect({ action: 'overview' }));
    now.mockReturnValue(start + 15 * 60_000);
    unavailable(await inspect(crop(view.viewId)));
    const fresh = metadata(await inspect({ action: 'overview' }));
    metadata(await inspect(crop(fresh.viewId)));
  });
});
