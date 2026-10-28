import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchWithPolicy } from '../src/net/outbound-request.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('outbound requests keep credentials on the host they were meant for', () => {
  it('does not send the authorization header to a different origin after a redirect', async () => {
    const seenByTarget: IncomingHttpHeaders[] = [];
    const target = await listen((request, response) => { seenByTarget.push(request.headers); response.end('target'); });
    const origin = await listen((request, response) => {
      expect(request.headers.authorization).toBe('Bearer fixture-credential');
      response.writeHead(302, { location: `${target}/landing` });
      response.end();
    });
    const response = await fetchWithPolicy(`${origin}/start`, { headers: { authorization: 'Bearer fixture-credential' } },
      { safety: 'idempotent', maxAttempts: 1 });
    expect(await response.text()).toBe('target');
    expect(seenByTarget).toHaveLength(1);
    expect(seenByTarget[0]!.authorization).toBeUndefined();
  });
});
