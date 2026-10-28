import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FileKeyStore } from '../auth/key-store.js';
import type { VerifiedKey } from '../auth/key-types.js';
import type { HttpSecurityPolicy } from '../http/security-policy.js';
import { ACCESS_TOKEN_PREFIX, FileOAuthStore, OAuthRegistrationLimitError, type OAuthTokens } from './store.js';
type MetricSink = { increment(name:string, amount?:number): unknown; failure(name:string, code:string): void; observe(name:string, value:number): void };
type OAuthAuditSink = (context: Record<string, unknown>) => void;

const MCP_SCOPE = 'mcp:tools';
const OFFLINE_SCOPE = 'offline_access';

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}
async function readBody(request: IncomingMessage, maxBytes = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('request_body_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseScope(scope: string | null): string[] {
  const requested = (scope ?? MCP_SCOPE).split(/\s+/).filter(Boolean);
  const allowed = new Set([MCP_SCOPE, OFFLINE_SCOPE]);
  return [...new Set(requested.filter((item) => allowed.has(item)))];
}

function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function recoverableChatGptClient(clientId: string, redirectUri: string): boolean {
  if (!clientId.startsWith('agent_core_client_')) return false;
  try {
    const url = new URL(redirectUri);
    return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && url.pathname.startsWith('/connector/oauth/');
  } catch {
    return false;
  }
}

function authorizationError(response: ServerResponse, status: number, message: string): void {
  sendHtml(response, status, `<!doctype html><html><body><h1>Agent Core OAuth</h1><p>${escapeHtml(message)}</p></body></html>`);
}

/** `/oauth/register` runs before any authentication and rewrites the whole store, so it gets one shared window. */
const REGISTRATION_WINDOW_MS = 60_000;
const REGISTRATIONS_PER_WINDOW = 20;

export class OAuthService {
  private registrationWindow = { startedAt: 0, count: 0 };

  private registrationAllowed(now = Date.now()): boolean {
    if (now - this.registrationWindow.startedAt >= REGISTRATION_WINDOW_MS) this.registrationWindow = { startedAt: now, count: 0 };
    this.registrationWindow.count += 1;
    return this.registrationWindow.count <= REGISTRATIONS_PER_WINDOW;
  }

  constructor(
    private readonly keyStore: FileKeyStore,
    readonly store: FileOAuthStore,
    private readonly security: HttpSecurityPolicy,
    private readonly metrics?: MetricSink,
    private readonly auditAuthorizationRejection?: OAuthAuditSink,
  ) {}

  challenge(request: IncomingMessage): string {
    const metadata = `${this.security.externalBaseUrl(request)}/.well-known/oauth-protected-resource/mcp`;
    return `Bearer resource_metadata="${metadata}", scope="${MCP_SCOPE}"`;
  }
  async authenticateAccessToken(token: string, request: IncomingMessage): Promise<VerifiedKey | null> {
    if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return null;
    const principal = await this.store.verifyAccessToken(token);
    if (!principal || !principal.scopes.includes(MCP_SCOPE)) return null;
    if (principal.resource !== this.security.protectedResource(request)) return null;
    const metadata = (await this.keyStore.list()).find((item) => item.id === principal.keyId);
    if (!metadata || metadata.revokedAt) return null;
    if (metadata.expiresAt && Date.parse(metadata.expiresAt) <= Date.now()) return null;
    return { ...metadata, authentication: 'oauth2' };
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const route = url.pathname;
    const observable = route.startsWith('/oauth/') || route.startsWith('/.well-known/oauth');
    if (!observable) return false;
    const startedAt = performance.now();
    let failureRecorded = false;
    try {

    if (request.method === 'GET' && (
      route === '/.well-known/oauth-protected-resource' ||
      route === '/.well-known/oauth-protected-resource/mcp'
    )) {
      const base = this.security.externalBaseUrl(request);
      sendJson(response, 200, {
        resource: this.security.protectedResource(request),
        authorization_servers: [base],
        scopes_supported: [MCP_SCOPE],
        bearer_methods_supported: ['header'],
      });
      return true;
    }

    if (request.method === 'GET' && route === '/.well-known/oauth-authorization-server') {
      const base = this.security.externalBaseUrl(request);
      sendJson(response, 200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        registration_endpoint: `${base}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: [MCP_SCOPE, OFFLINE_SCOPE],
      });
      return true;
    }
    if (request.method === 'POST' && route === '/oauth/register') {
      if (!this.registrationAllowed()) {
        response.setHeader('retry-after', String(REGISTRATION_WINDOW_MS / 1000));
        sendJson(response, 429, { error: 'rate_limited' });
        return true;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(await readBody(request)) as Record<string, unknown>;
      } catch {
        sendJson(response, 400, { error: 'invalid_client_metadata' });
        return true;
      }
      const redirectUris = Array.isArray(body.redirect_uris)
        ? body.redirect_uris.filter((item): item is string => typeof item === 'string')
        : [];
      if (!redirectUris.length || !redirectUris.every(validRedirectUri)) {
        sendJson(response, 400, { error: 'invalid_redirect_uri' });
        return true;
      }
      try {
        const registered = await this.store.registerClient({
          clientName: typeof body.client_name === 'string' ? body.client_name : 'MCP Client',
          redirectUris,
          grantTypes: ['authorization_code', 'refresh_token'],
          responseTypes: ['code'],
          tokenEndpointAuthMethod: 'client_secret_post',
        });
        sendJson(response, 201, registered);
      } catch (error) {
        if (!(error instanceof OAuthRegistrationLimitError)) throw error;
        response.setHeader('retry-after', '3600');
        sendJson(response, 429, { error: 'rate_limited' });
      }
      return true;
    }

    if (request.method === 'GET' && route === '/oauth/authorize') {
      await this.renderAuthorizationForm(request, url, response);
      return true;
    }

    if (request.method === 'POST' && route === '/oauth/authorize') {
      await this.approveAuthorization(request, response);
      return true;
    }

    if (request.method === 'POST' && route === '/oauth/token') {
      await this.exchangeToken(request, response);
      return true;
    }

    return false;
    } catch (error) {
      failureRecorded = true;
      this.metrics?.increment('oauth.failures.count');
      this.metrics?.failure('oauth.handle.duration_ms', error instanceof Error ? error.name : 'OAUTH_ERROR');
      throw error;
    } finally {
      this.metrics?.observe('oauth.handle.duration_ms', Math.max(0, performance.now() - startedAt));
      if (!failureRecorded && response.statusCode >= 400) this.metrics?.increment('oauth.failures.count');
    }
  }

  private async validateAuthorization(params: URLSearchParams, request: IncomingMessage): Promise<{
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    resource: string;
    scopes: string[];
  } | null> {
    const clientId = params.get('client_id') ?? '';
    const redirectUri = params.get('redirect_uri') ?? '';
    const responseType = params.get('response_type');
    const challengeMethod = params.get('code_challenge_method');
    const codeChallenge = params.get('code_challenge') ?? '';
    const resource = params.get('resource') ?? '';
    const expectedResource = this.security.protectedResource(request);
    const scopes = parseScope(params.get('scope'));
    const reject = (reason: string): null => {
      let redirectHost: string | null = null;
      try { redirectHost = redirectUri ? new URL(redirectUri).host : null; } catch { /* diagnostic only */ }
      this.auditAuthorizationRejection?.({
        reason,
        clientId: clientId || null,
        responseType: responseType ?? null,
        challengeMethod: challengeMethod ?? null,
        hasCodeChallenge: Boolean(codeChallenge),
        redirectHost,
        resource: resource || null,
        expectedResource,
        scopes,
      });
      return null;
    };
    if (responseType !== 'code') return reject('response_type');
    if (challengeMethod !== 'S256') return reject('code_challenge_method');
    if (!codeChallenge) return reject('code_challenge_missing');
    if (!resource) return reject('resource_missing');
    if (resource !== expectedResource) return reject('resource_mismatch');
    if (!scopes.includes(MCP_SCOPE)) return reject('scope_missing_mcp_tools');
    let client = await this.store.getClient(clientId);
    if (!client && recoverableChatGptClient(clientId, redirectUri)) {
      client = await this.store.recoverClientRegistration(clientId, redirectUri);
    }
    if (!client) return reject('client_unknown');
    if (!client.redirectUris.includes(redirectUri)) return reject('redirect_uri_mismatch');
    return {
      clientId,
      redirectUri,
      state: params.get('state') ?? '',
      codeChallenge,
      resource,
      scopes,
    };
  }

  private async renderAuthorizationForm(request: IncomingMessage, url: URL, response: ServerResponse): Promise<void> {
    const validated = await this.validateAuthorization(url.searchParams, request);
    if (!validated) {
      authorizationError(response, 400, 'Invalid OAuth authorization request.');
      return;
    }
    const hidden = (name: string, value: string) =>
      `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Agent Core OAuth</title></head>
<body><main><h1>Authorize Agent Core</h1>
<p>Paste a valid Agent Core API key to authorize ChatGPT for this MCP server.</p>
<form method="post" action="/oauth/authorize">
${hidden('response_type', 'code')}
${hidden('client_id', validated.clientId)}
${hidden('redirect_uri', validated.redirectUri)}
${hidden('state', validated.state)}
${hidden('code_challenge', validated.codeChallenge)}
${hidden('code_challenge_method', 'S256')}
${hidden('resource', validated.resource)}
${hidden('scope', validated.scopes.join(' '))}
<label>Agent Core API key <input name="api_key" type="password" autocomplete="off" required></label>
<button type="submit">Authorize</button>
</form></main></body></html>`;
    sendHtml(response, 200, html);
  }

  private async approveAuthorization(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const params = new URLSearchParams(await readBody(request));
    const validated = await this.validateAuthorization(params, request);
    if (!validated) {
      authorizationError(response, 400, 'Invalid OAuth authorization request.');
      return;
    }
    const apiKey = params.get('api_key') ?? '';
    const verified = await this.keyStore.verify(apiKey);
    if (!verified) {
      authorizationError(response, 401, 'Agent Core API key is invalid or revoked.');
      return;
    }
    const code = await this.store.issueCode({
      clientId: validated.clientId,
      redirectUri: validated.redirectUri,
      codeChallenge: validated.codeChallenge,
      resource: validated.resource,
      scopes: validated.scopes,
      keyId: verified.id,
      keyName: verified.name,
    });
    const redirect = new URL(validated.redirectUri);
    redirect.searchParams.set('code', code);
    if (validated.state) redirect.searchParams.set('state', validated.state);
    redirect.searchParams.set('iss', this.security.externalBaseUrl(request));
    response.writeHead(302, {
      location: redirect.toString(),
      'cache-control': 'no-store',
    });
    response.end();
  }

  private async exchangeToken(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const params = new URLSearchParams(await readBody(request));
    const clientId = params.get('client_id') ?? '';
    const clientSecret = params.get('client_secret') ?? '';
    const client = await this.store.getClient(clientId);
    if (!client) {
      sendJson(response, 401, { error: 'invalid_client' });
      return;
    }
    const grantType = params.get('grant_type');
    const resource = params.get('resource') ?? '';
    if (!resource) {
      sendJson(response, 400, { error: 'invalid_target' });
      return;
    }

    if (grantType === 'authorization_code') {
      if (client.recoveryPending) {
        const exchange = await this.store.exchangeRecoveredAuthorizationCode(params.get('code') ?? '', {
          clientId, redirectUri: params.get('redirect_uri') ?? '', codeVerifier: params.get('code_verifier') ?? '', resource,
        }, clientSecret);
        if (!exchange) { sendJson(response, 400, { error: 'invalid_grant' }); return; }
        await this.sendTokens(response, exchange.principal, exchange.tokens);
      } else {
        if (!await this.store.verifyClient(clientId, clientSecret)) { sendJson(response, 401, { error: 'invalid_client' }); return; }
        await this.exchangeAuthorizationCode(params, response, clientId, resource);
      }
      return;
    }
    if (!await this.store.verifyClient(clientId, clientSecret)) {
      sendJson(response, 401, { error: 'invalid_client' });
      return;
    }
    if (grantType === 'refresh_token') {
      const exchange = await this.store.exchangeRefreshToken(
        params.get('refresh_token') ?? '',
        { clientId, resource },
      );
      if (!exchange) {
        sendJson(response, 400, { error: 'invalid_grant' });
        return;
      }
      await this.sendTokens(response, exchange.principal, exchange.tokens);
      return;
    }

    sendJson(response, 400, { error: 'unsupported_grant_type' });
  }

  private async exchangeAuthorizationCode(
    params: URLSearchParams,
    response: ServerResponse,
    clientId: string,
    resource: string,
  ): Promise<void> {
    const exchange = await this.store.exchangeAuthorizationCode(params.get('code') ?? '', {
      clientId,
      redirectUri: params.get('redirect_uri') ?? '',
      codeVerifier: params.get('code_verifier') ?? '',
      resource,
    });
    if (!exchange) {
      sendJson(response, 400, { error: 'invalid_grant' });
      return;
    }
    await this.sendTokens(response, exchange.principal, exchange.tokens);
  }

  private async sendTokens(response: ServerResponse, principal: {
    clientId: string;
    resource: string;
    scopes: string[];
    keyId: string;
    keyName: string;
  }, tokens: OAuthTokens): Promise<void> {
    sendJson(response, 200, {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: principal.scopes.join(' '),
    });
  }
}
