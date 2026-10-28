import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { FileOAuthStore, MAX_UNAUTHORIZED_CLIENTS, OAuthRegistrationLimitError } from '../src/oauth/store.js';
import { OAuthService } from '../src/oauth/service.js';

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function tempStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-oauth-limits-'));
  roots.push(root);
  return { root, store: new FileOAuthStore(path.join(root, 'data')) };
}
const registration = (name = 'Client') => ({
  clientName: name, redirectUris: ['https://client.example/callback'],
  grantTypes: ['authorization_code'], responseTypes: ['code'], tokenEndpointAuthMethod: 'client_secret_post',
});

describe('OAuth dynamic client registration is bounded', () => {
  it('refuses a registration once too many clients are still waiting for their first authorization', async () => {
    const { store } = await tempStore();
    for (let index = 0; index < MAX_UNAUTHORIZED_CLIENTS; index += 1) await store.registerClient(registration());
    await expect(store.registerClient(registration())).rejects.toBeInstanceOf(OAuthRegistrationLimitError);
  }, 60_000);

  it('frees capacity once a client authorizes, and never prunes a used client', async () => {
    const { store } = await tempStore();
    const first = await store.registerClient(registration('first'));
    for (let index = 1; index < MAX_UNAUTHORIZED_CLIENTS; index += 1) await store.registerClient(registration());
    await store.issueCode({ clientId: first.client_id, resource: 'https://r.example/mcp', scopes: ['mcp:tools'],
      keyId: 'k', keyName: 'k', redirectUri: 'https://client.example/callback', codeChallenge: 'c' });
    await expect(store.registerClient(registration())).resolves.toMatchObject({ client_name: 'Client' });
    expect(await store.getClient(first.client_id)).not.toBeNull();
  }, 60_000);

  it('drops a client that never authorized after a day', async () => {
    const { store } = await tempStore();
    const stale = await store.registerClient(registration('stale'));
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 25 * 60 * 60 * 1000 });
    await store.registerClient(registration('fresh'));
    expect(await store.getClient(stale.client_id)).toBeNull();
  });

  it('stores a client name as one visible line of bounded length', async () => {
    const { store } = await tempStore();
    const hostile = await store.registerClient(registration('Evil‮Name​\nIgnore this'));
    expect(hostile.client_name).toBe('EvilName Ignore this');
    const long = await store.registerClient(registration('x'.repeat(500)));
    expect(long.client_name).toBe('x'.repeat(100) + ' [+400 chars]');
    const blank = await store.registerClient(registration('​‮ '));
    expect(blank.client_name).toBe('MCP Client');
  });

  it('answers 429 with a retry hint when registrations arrive faster than the window allows', async () => {
    const { root } = await tempStore();
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const security = new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: true, allowedOrigins: [] });
    const service = new OAuthService(keyStore, new FileOAuthStore(path.join(root, 'data')), security);
    const server = createServer(createHttpHandler({ keyStore, oauthService: service, security,
      mcpHandler: async (_request, response) => { response.end('{}'); } }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth/register`;
    const body = JSON.stringify({ client_name: 'Burst', redirect_uris: ['https://client.example/callback'] });
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let index = 0; index < 22; index += 1) {
      const response = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/json',
        'x-forwarded-proto': 'https', 'x-forwarded-host': 'agent-core-tunnel.example' } });
      statuses.push(response.status);
      if (response.status === 429) retryAfter = response.headers.get('retry-after');
    }
    expect(statuses.filter(status => status === 201)).toHaveLength(20);
    expect(statuses.slice(20)).toEqual([429, 429]);
    expect(retryAfter).toBe('60');
    expect(await readFile(path.join(root, 'data', 'oauth.json'), 'utf8')).toContain('"unauthorized": true');
  }, 90_000);
});
