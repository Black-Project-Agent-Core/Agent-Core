import type { IncomingMessage, ServerResponse } from 'node:http';
import { BrowserExtensionBridge, EXTENSION_ORIGIN } from '../rdc/browser-control/extension-bridge.js';

/** Physical loopback only. Reverse-proxy trust never grants access to this channel. */
export async function handleBrowserBridge(request: IncomingMessage, response: ServerResponse,
  bridge: BrowserExtensionBridge, route: string): Promise<void> {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  const address = request.socket.remoteAddress;
  const host = request.headers.host;
  const port = request.socket.localPort;
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')
    && [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host ?? '')
    && !Object.keys(request.headers).some(h => h === 'forwarded' || h.startsWith('x-forwarded-'));
  const extension = EXTENSION_ORIGIN.test(origin);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (local && extension) Object.assign(headers, {
    'access-control-allow-origin': origin, vary: 'Origin',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-Agent-Core-Extension',
  });
  const finish = (status: number, body: unknown) => {
    if (response.destroyed) return;
    response.writeHead(status, headers); response.end(JSON.stringify(body));
  };
  if (!local || !extension) { finish(403, { error: 'BROWSER_BRIDGE_LOCAL_EXTENSION_REQUIRED' }); return; }
  if (request.method === 'OPTIONS') { finish(204, null); return; }
  if (request.method !== 'POST') { finish(405, { error: 'method_not_allowed' }); return; }
  if (request.headers['x-agent-core-extension'] !== origin.slice('chrome-extension://'.length)) {
    finish(403, { error: 'BROWSER_BRIDGE_EXTENSION_ID_MISMATCH' }); return;
  }
  const abort = new AbortController();
  response.once('close', () => abort.abort());
  try {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 256 * 1024) throw new Error('BROWSER_BRIDGE_BODY_TOO_LARGE');
      chunks.push(buffer);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('BROWSER_BRIDGE_INVALID_BODY');
    if (route === '/browser-bridge/pair') { finish(200, bridge.pair(body, origin)); return; }
    const client = bridge.get(body, origin);
    if (route === '/browser-bridge/poll') {
      finish(200, await client.poll(origin, body.token, body.replies, body.events, abort.signal)); return;
    }
    if (route === '/browser-bridge/disconnect') { client.close(); finish(200, { closed: true }); return; }
    finish(404, { error: 'not_found' });
  } catch (error) {
    // Never echo request bodies, pairing codes or session tokens.
    const message = error instanceof Error && error.message.startsWith('BROWSER_BRIDGE_')
      ? error.message : 'BROWSER_BRIDGE_INVALID_REQUEST';
    finish(400, { error: message });
  }
}
