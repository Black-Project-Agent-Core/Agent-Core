import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http, { type IncomingMessage, type RequestOptions, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ObservatoryServerConfig {
  host: '127.0.0.1';
  port: number;
  agentCoreUrl: string;
  workspaceRoot: string;
  staticRoot: string;
}

const API_ROUTES = new Set(['/api/health', '/api/snapshot', '/api/activity', '/api/stream']);
const EXACT_LOOPBACK = '127.0.0.1';

function parsePort(value: string | undefined): number {
  const raw = value?.trim() || '3697';
  if (!/^\d+$/.test(raw)) throw new Error('MEMORY_OBSERVATORY_PORT_INVALID');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error('MEMORY_OBSERVATORY_PORT_INVALID');
  return parsed;
}

function normalizedLoopbackUpstream(raw: string | undefined): string {
  const input = raw?.trim() || 'http://127.0.0.1:8765';
  let parsed: URL;
  try { parsed = new URL(input); }
  catch { throw new Error('MEMORY_OBSERVATORY_AGENT_CORE_URL_INVALID'); }
  if (parsed.protocol !== 'http:' || parsed.hostname !== EXACT_LOOPBACK || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('MEMORY_OBSERVATORY_AGENT_CORE_URL_MUST_BE_LOOPBACK');
  }
  return parsed.origin;
}

function resolveWorkspaceRoot(value: string | undefined): string {
  const raw = value?.trim() || process.cwd();
  if (!path.isAbsolute(raw)) throw new Error('MEMORY_OBSERVATORY_WORKSPACE_ROOT_MUST_BE_ABSOLUTE');
  return path.resolve(raw);
}

export function resolveObservatoryServerConfig(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): ObservatoryServerConfig {
  const host = env.MEMORY_OBSERVATORY_HOST?.trim() || EXACT_LOOPBACK;
  if (host !== EXACT_LOOPBACK) throw new Error('MEMORY_OBSERVATORY_HOST_MUST_BE_LOOPBACK');
  const staticRoot = path.resolve(cwd, 'dist');
  return {
    host: EXACT_LOOPBACK,
    port: parsePort(env.MEMORY_OBSERVATORY_PORT),
    agentCoreUrl: normalizedLoopbackUpstream(env.MEMORY_OBSERVATORY_AGENT_CORE_URL),
    workspaceRoot: resolveWorkspaceRoot(env.MEMORY_OBSERVATORY_WORKSPACE_ROOT),
    staticRoot,
  };
}

export function resolveObservatoryProxyTarget(method: string | undefined, requestUrl: string): string | null {
  if ((method ?? 'GET').toUpperCase() !== 'GET') return null;
  let parsed: URL;
  try { parsed = new URL(requestUrl, 'http://127.0.0.1'); }
  catch { return null; }
  if (API_ROUTES.has(parsed.pathname)) {
    const suffix = parsed.pathname === '/api/health'
      ? '/health'
      : parsed.pathname === '/api/snapshot'
        ? '/snapshot'
        : parsed.pathname === '/api/activity'
          ? '/activity'
          : '/stream';
    const search = parsed.pathname === '/api/activity' ? parsed.search : '';
    return `/internal/memory-observatory${suffix}${search}`;
  }
  if (parsed.pathname.startsWith('/api/node/')) {
    const id = parsed.pathname.slice('/api/node/'.length);
    if (!id || id.length > 512 || parsed.search) return null;
    return `/internal/memory-observatory/node/${id}`;
  }
  return null;
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function safeStaticPath(staticRoot: string, pathname: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); }
  catch { return null; }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(staticRoot, relative);
  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${path.sep}`)) return null;
  return candidate;
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, config: ObservatoryServerConfig): Promise<void> {
  if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
    sendJson(response, 405, { error: 'observatory_read_only' });
    return;
  }
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  let filePath = safeStaticPath(config.staticRoot, url.pathname);
  if (!filePath) {
    sendJson(response, 400, { error: 'observatory_path_invalid' });
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('NOT_FILE');
  } catch {
    // SPA fallback only for navigation-like paths, never /api/*.
    if (path.extname(url.pathname)) {
      sendJson(response, 404, { error: 'observatory_asset_not_found' });
      return;
    }
    filePath = path.join(config.staticRoot, 'index.html');
    try { await access(filePath); }
    catch { sendJson(response, 503, { error: 'observatory_ui_not_built' }); return; }
  }
  response.writeHead(200, {
    'content-type': contentType(filePath),
    'cache-control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(filePath).pipe(response);
}

function proxyHeaders(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {
    accept: request.headers.accept ?? '*/*',
  };
  const lastEventId = request.headers['last-event-id'];
  if (typeof lastEventId === 'string' && /^\d+$/.test(lastEventId)) headers['last-event-id'] = lastEventId;
  return headers;
}

async function proxyReadOnly(
  request: IncomingMessage,
  response: ServerResponse,
  config: ObservatoryServerConfig,
  targetPath: string,
): Promise<void> {
  const upstream = new URL(targetPath, `${config.agentCoreUrl}/`);
  const options: RequestOptions = {
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: 'GET',
    path: `${upstream.pathname}${upstream.search}`,
    headers: proxyHeaders(request),
  };
  const upstreamRequest = http.request(options, (upstreamResponse) => {
    if (response.destroyed || response.writableEnded) {
      upstreamResponse.destroy();
      return;
    }
    response.writeHead(upstreamResponse.statusCode ?? 502, {
      ...(upstreamResponse.headers['content-type'] ? { 'content-type': upstreamResponse.headers['content-type'] } : {}),
      ...(upstreamResponse.headers['cache-control'] ? { 'cache-control': upstreamResponse.headers['cache-control'] } : { 'cache-control': 'no-store' }),
      ...(upstreamResponse.headers.connection ? { connection: upstreamResponse.headers.connection } : {}),
      'x-content-type-options': 'nosniff',
    });
    upstreamResponse.pipe(response);
  });
  upstreamRequest.setTimeout(30_000, () => upstreamRequest.destroy(new Error('OBSERVATORY_UPSTREAM_TIMEOUT')));
  upstreamRequest.on('error', () => {
    if (!response.headersSent) sendJson(response, 502, { error: 'observatory_upstream_unavailable' });
    else if (!response.writableEnded) response.end();
  });
  request.once('aborted', () => upstreamRequest.destroy());
  response.once('close', () => upstreamRequest.destroy());
  upstreamRequest.end();
}

export function createObservatorySidecarServer(config: ObservatoryServerConfig): Server {
  return http.createServer((request, response) => {
    void (async () => {
      const target = resolveObservatoryProxyTarget(request.method, request.url ?? '/');
      const isApi = (request.url ?? '').startsWith('/api/');
      if (isApi) {
        if (!target) {
          const status = (request.method ?? 'GET').toUpperCase() === 'GET' ? 404 : 405;
          sendJson(response, status, { error: status === 405 ? 'observatory_read_only' : 'observatory_api_not_found' });
          return;
        }
        await proxyReadOnly(request, response, config, target);
        return;
      }
      await serveStatic(request, response, config);
    })().catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: 'observatory_sidecar_internal_error' });
      else if (!response.writableEnded) response.end();
    });
  });
}

export async function startObservatorySidecar(config = resolveObservatoryServerConfig()): Promise<Server> {
  const server = createObservatorySidecarServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });
  return server;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    const config = resolveObservatoryServerConfig();
    await access(config.staticRoot).catch(async () => {
      throw new Error(`MEMORY_OBSERVATORY_BUILD_MISSING:${config.staticRoot}`);
    });
    const server = await startObservatorySidecar(config);
    const address = server.address();
    process.stdout.write(`Memory Observatory listening on http://${config.host}:${typeof address === 'object' && address ? address.port : config.port}\n`);
    const close = () => server.close(() => process.exit(0));
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
