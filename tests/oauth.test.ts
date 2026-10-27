import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { FileOAuthStore } from '../src/oauth/store.js';
import { OAuthService } from '../src/oauth/service.js';

const roots: string[] = [];
const servers: Server[] = [];
const forwarded = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'agent-core-tunnel.example' };
const pkce = (value: string) => createHash('sha256').update(value).digest('base64url');

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function setup(audit?: (context: Record<string, unknown>) => void) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-oauth-'));
  roots.push(root);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const oauthStore = new FileOAuthStore(path.join(root, 'data'));
  const security = new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: true, allowedOrigins: [] });
  const oauthService = new OAuthService(keyStore, oauthStore, security, undefined, audit);
  let dispatchedPrincipal: string | null = null;
  const app = createHttpHandler({
    keyStore, oauthService, security,
    mcpHandler: async (_request, response, key) => {
      dispatchedPrincipal = key.id;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    },
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { baseUrl, keyStore, oauthStore, dispatched: () => dispatchedPrincipal };
}

async function register(baseUrl: string) {
  const response = await fetch(`${baseUrl}/oauth/register`, {
    method: 'POST', headers: { ...forwarded, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'ChatGPT',
      redirect_uris: ['https://chatgpt.com/connector/oauth/test'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'client_secret_post',
    }),
  });
  expect(response.status).toBe(201);
  return await response.json() as Record<string, any>;
}

describe('OAuth bridge', () => {
  it('publishes OAuth discovery metadata for the tunnel bridge', async () => {
    const { baseUrl } = await setup();
    const protectedResource = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`, { headers: forwarded });
    expect(await protectedResource.json()).toMatchObject({
      resource: 'https://agent-core-tunnel.example/mcp',
      authorization_servers: ['https://agent-core-tunnel.example'],
      scopes_supported: ['mcp:tools'],
    });
    const metadata = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`, { headers: forwarded });
    expect(await metadata.json()).toMatchObject({
      issuer: 'https://agent-core-tunnel.example',
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    });
  });

  it('accepts an explicitly configured OpenAI tunnel protected resource', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-oauth-tunnel-'));
    roots.push(root);
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const oauthStore = new FileOAuthStore(path.join(root, 'data'));
    const tunnelResource = 'https://tunnel-service.gateway.unified-0.internal.api.openai.org/v1/mcp/tunnel_test123';
    const security = new HttpSecurityPolicy({
      publicBaseUrl: null,
      protectedResourceUrl: tunnelResource,
      trustProxy: false,
      allowedOrigins: [],
    });
    const oauthService = new OAuthService(keyStore, oauthStore, security);
    const app = createHttpHandler({ keyStore, oauthService, security, mcpHandler: async () => undefined });
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const client = await register(baseUrl);
    const params = new URLSearchParams({
      response_type: 'code', client_id: client.client_id,
      redirect_uri: client.redirect_uris[0], code_challenge: 'challenge',
      code_challenge_method: 'S256', resource: tunnelResource, scope: 'mcp:tools',
    });
    const response = await fetch(`${baseUrl}/oauth/authorize?${params}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Agent Core API key');
  });

  it('records a safe reason when an authorization request is rejected', async () => {
    const events: Record<string, unknown>[] = [];
    const { baseUrl } = await setup(context => events.push(context));
    const client = await register(baseUrl);
    const params = new URLSearchParams({
      response_type: 'code', client_id: client.client_id,
      redirect_uri: client.redirect_uris[0], code_challenge: 'challenge',
      code_challenge_method: 'S256', resource: 'https://wrong-resource.example/mcp',
      scope: 'mcp:tools',
    });
    const response = await fetch(`${baseUrl}/oauth/authorize?${params}`, { headers: forwarded });
    expect(response.status).toBe(400);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      reason: 'resource_mismatch',
      resource: 'https://wrong-resource.example/mcp',
      expectedResource: 'https://agent-core-tunnel.example/mcp',
      hasCodeChallenge: true,
    });
    expect(events[0]).not.toHaveProperty('codeChallenge');
    expect(events[0]).not.toHaveProperty('state');
  });

  it('stores only a hash of the dynamically registered client secret', async () => {
    const { baseUrl, oauthStore } = await setup();
    const client = await register(baseUrl);
    expect(client.client_id).toMatch(/^agent_core_client_/);
    expect(client.client_secret).toMatch(/^agent_core_secret_/);
    const stored = await readFile(oauthStore.filePath, 'utf8');
    expect(stored).toContain(client.client_id);
    expect(stored).not.toContain(client.client_secret);
  });
  it('exchanges an API-key-approved PKCE code and accepts the OAuth token on /mcp', async () => {
    const { baseUrl, keyStore, dispatched } = await setup();
    const key = await keyStore.create('chatgpt-oauth');
    const client = await register(baseUrl);
    const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~pkce';
    const redirectUri = client.redirect_uris[0] as string;
    const resource = 'https://agent-core-tunnel.example/mcp';
    const params = new URLSearchParams({
      response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri,
      state: 'state-123', code_challenge: pkce(verifier), code_challenge_method: 'S256',
      resource, scope: 'mcp:tools offline_access',
    });
    const approved = await fetch(`${baseUrl}/oauth/authorize`, {
      method: 'POST', redirect: 'manual',
      headers: { ...forwarded, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...Object.fromEntries(params), api_key: key.key }),
    });
    expect(approved.status).toBe(302);
    const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST', headers: { ...forwarded, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: client.client_id,
        client_secret: client.client_secret, code, redirect_uri: redirectUri,
        code_verifier: verifier, resource,
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json() as Record<string, string>;
    expect(tokens.access_token).toMatch(/^agent_core_oauth_/);
    const mcp = await fetch(`${baseUrl}/mcp`, {
      method: 'POST', headers: { ...forwarded, Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(mcp.status).toBe(200);
    expect(dispatched()).toBe(key.metadata.id);
  });

  it('serves a Cloudflare resource beside the existing tunnel resource and binds tokens to their own host', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-oauth-multi-'));
    roots.push(root);
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const oauthStore = new FileOAuthStore(path.join(root, 'data'));
    const openai = 'https://tunnel-service.gateway.example/v1/mcp/tunnel_test';
    const cloudflare = 'https://agent-core.example.test/mcp';
    const security = new HttpSecurityPolicy({
      publicBaseUrl: null, protectedResourceUrl: openai,
      additionalProtectedResourceUrls: [cloudflare], trustProxy: true, allowedOrigins: [],
    });
    const oauthService = new OAuthService(keyStore, oauthStore, security);
    const app = createHttpHandler({ keyStore, oauthService, security, mcpHandler: async (_request, response) => { response.writeHead(200); response.end('{}'); } });
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const viaCloudflare = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'agent-core.example.test' };
    const viaOpenAi = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'tunnel-service.gateway.example' };

    const discovery = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`, { headers: viaCloudflare });
    expect(await discovery.json()).toMatchObject({ resource: cloudflare, authorization_servers: ['https://agent-core.example.test'] });
    const legacy = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`, { headers: viaOpenAi });
    expect(await legacy.json()).toMatchObject({ resource: openai });

    const key = await keyStore.create('cloudflare-oauth');
    const client = await register(baseUrl);
    const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~pkce';
    const redirectUri = client.redirect_uris[0] as string;
    const authorize = (headers: Record<string, string>, resource: string) => fetch(`${baseUrl}/oauth/authorize`, {
      method: 'POST', redirect: 'manual',
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri, code_challenge: pkce(verifier),
        code_challenge_method: 'S256', resource, scope: 'mcp:tools', api_key: key.key,
      }),
    });
    expect((await authorize(viaOpenAi, cloudflare)).status).toBe(400);
    const approved = await authorize(viaCloudflare, cloudflare);
    expect(approved.status).toBe(302);
    const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST', headers: { ...viaCloudflare, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: client.client_id, client_secret: client.client_secret,
        code, redirect_uri: redirectUri, code_verifier: verifier, resource: cloudflare,
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const { access_token: token } = await tokenResponse.json() as Record<string, string>;
    const call = (headers: Record<string, string>) => fetch(`${baseUrl}/mcp`, {
      method: 'POST', headers: { ...headers, Authorization: `Bearer ${token}` },
    });
    expect((await call(viaCloudflare)).status).toBe(200);
    expect((await call(viaOpenAi)).status).toBe(401);
  });
});
