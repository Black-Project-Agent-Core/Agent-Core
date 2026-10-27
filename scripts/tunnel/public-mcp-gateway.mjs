// Minimal loopback ingress for Cloudflare Tunnel: publish only authenticated Agent Core MCP/OAuth routes.
import http from 'node:http';

const port = Number(process.env.AGENT_CORE_PUBLIC_GATEWAY_PORT ?? 8788);
const backendPort = Number(process.env.AGENT_CORE_HTTP_PORT ?? 8765);
const allow = [
  /^\/mcp(?:\?.*)?$/,
  /^\/oauth\/(?:register|authorize|token)(?:\?.*)?$/,
  /^\/\.well-known\/oauth-(?:protected-resource(?:\/mcp)?|authorization-server)(?:\?.*)?$/,
];
const methods = new Set(['GET', 'POST', 'DELETE', 'OPTIONS']);
const dropRequestHeaders = new Set([
  'connection', 'proxy-connection', 'keep-alive', 'upgrade', 'te', 'trailer',
  'transfer-encoding', 'x-forwarded-for', 'x-forwarded-host',
  'x-real-ip', 'forwarded', 'cf-connecting-ip', 'true-client-ip',
]);
const dropResponseHeaders = new Set([
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade',
]);
const server = http.createServer((request, response) => {
  if (!methods.has(request.method) || !allow.some((pattern) => pattern.test(request.url ?? ''))) {
    response.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    response.end('Not Found');
    request.resume();
    return;
  }
  const headers = { ...request.headers };
  for (const name of dropRequestHeaders) delete headers[name];
  // Cloudflare Worker is the public OAuth identity; never trust client-supplied forwarded hosts.
  headers.host = "agent-core-mcp.joefreccejunior50.workers.dev";
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: backendPort,
    path: request.url,
    method: request.method,
    headers,
    timeout: 120_000,
  }, (incoming) => {
    const outgoing = { ...incoming.headers, 'cache-control': 'no-store' };
    for (const name of dropResponseHeaders) delete outgoing[name];
    response.writeHead(incoming.statusCode ?? 502, outgoing);
    incoming.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Agent Core response timeout')));
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      response.end('Agent Core unavailable');
    } else response.destroy();
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.headersTimeout = 90_000;
server.requestTimeout = 300_000;
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Agent Core public MCP gateway ready on 127.0.0.1:${port}\n`);
});
