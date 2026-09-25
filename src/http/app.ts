import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { FileKeyStore } from '../auth/key-store.js';
import type { VerifiedKey } from '../auth/key-types.js';
import type { OAuthService } from '../oauth/service.js';
import { authenticateRequest } from './auth.js';
import { HttpSecurityPolicy } from './security-policy.js';
import { activityTracker } from '../tracker/activity-tracker.js';

export type McpHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  key: VerifiedKey,
) => Promise<void>;

export interface HttpHandlerOptions {
  keyStore: FileKeyStore;
  mcpHandler: McpHttpHandler;
  oauthService?: OAuthService;
  security?: HttpSecurityPolicy;
  healthProvider?: () => Promise<Record<string, unknown>>;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}
const DEFAULT_SECURITY = new HttpSecurityPolicy({
  publicBaseUrl: null,
  protectedResourceUrl: null,
  trustProxy: false,
  allowedOrigins: [],
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpHandlerOptions,
): Promise<void> {
  const route = new URL(request.url ?? '/', 'http://localhost').pathname;
  const security = options.security ?? DEFAULT_SECURITY;

  if (request.method === 'GET' && route === '/health') {
    const diagnostics = options.healthProvider ? await options.healthProvider() : {};
    sendJson(response, 200, { status: 'ok', service: 'agent-core-rdc-bridge', ...diagnostics });
    return;
  }

  if (options.oauthService && await options.oauthService.handle(request, response)) return;

  if (route !== '/mcp') {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }

  const origin = security.validateMcpOrigin(request);
  if (!origin.ok) {
    sendJson(response, 403, { error: 'forbidden_origin' });
    return;
  }
  const key = await authenticateRequest(request, options.keyStore, options.oauthService);
  if (!key) {
    const headers: Record<string, string> = {};
    if (options.oauthService) headers['www-authenticate'] = options.oauthService.challenge(request);
    sendJson(response, 401, { error: 'unauthorized' }, headers);
    return;
  }

  await options.mcpHandler(request, response, key);
}

export function createHttpHandler(options: HttpHandlerOptions): RequestListener {
  return (request, response) => {
    const started = Date.now();
    const route = new URL(request.url ?? '/', 'http://localhost').pathname;
    response.once('finish', () => {
      if (route === '/health' || response.statusCode < 400) return;
      if (route === '/favicon.ico' && response.statusCode === 404) return;

      if (response.statusCode >= 500) {
        activityTracker.record(
          'HTTP',
          'error',
          `${request.method ?? 'UNKNOWN'} ${route} returned ${response.statusCode}`,
          'server-response-error',
          { statusCode: response.statusCode, method: request.method ?? '', route, durationMs: Date.now() - started },
        );
        return;
      }

      const module = response.statusCode === 401 || response.statusCode === 403 ? 'AUTH' : 'REQUEST';
      activityTracker.record(
        module,
        'info',
        `${request.method ?? 'UNKNOWN'} ${route} returned ${response.statusCode}`,
        'client-response',
        { statusCode: response.statusCode, method: request.method ?? '', route, durationMs: Date.now() - started },
      );
    });
    void handleRequest(request, response, options).catch((error) => {
      activityTracker.captureFailure('HTTP', error, 'http-request-failure', { method: request.method ?? '', route: new URL(request.url ?? '/', 'http://localhost').pathname });
      if (!response.headersSent) sendJson(response, 500, { error: 'internal_error' });
      else if (!response.writableEnded) response.end();
    });
  };
}
