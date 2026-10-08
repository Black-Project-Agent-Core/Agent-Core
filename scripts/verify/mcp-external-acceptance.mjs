import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { redactSensitiveValue } from '../../dist/security/redaction.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_EVIDENCE_ROOT = path.join(ROOT, 'runtime', 'tmp', 'mcp-client-acceptance');
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_CLEANUP_TIMEOUT_MS = 2_500;

export const MCP_ACCEPTANCE_ERRORS = Object.freeze({
  TIMEOUT: 'verification-timeout',
  UNAUTHORIZED: 'http-unauthorized',
  NETWORK: 'network-unreachable',
  SERVER_REJECTED: 'server-rejected-handshake',
  HTTP: 'http-error',
  INVALID_RESPONSE: 'invalid-response',
  FAILED: 'verification-failed',
});

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function args(name) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}
function safeEndpoint(raw) {
  const url = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('MCP_ACCEPTANCE_INSECURE_ENDPOINT');
  }
  if (url.username || url.password) throw new Error('MCP_ACCEPTANCE_CREDENTIAL_URL_REFUSED');
  return url;
}

function inside(candidate, root) {
  const child = path.resolve(candidate);
  const parent = path.resolve(root);
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const c = normalize(child);
  const p = normalize(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
}
function manifestView(tools) {
  return tools
    .map(tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function manifestFingerprint(tools) {
  const json = JSON.stringify(canonical(manifestView(tools)));
  return crypto.createHash('sha256').update(json).digest('hex');
}

function schemaHasParam(tool, param) {
  const properties = tool?.inputSchema?.properties;
  return Boolean(properties && typeof properties === 'object' && Object.prototype.hasOwnProperty.call(properties, param));
}

function classifyAcceptanceError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === MCP_ACCEPTANCE_ERRORS.TIMEOUT || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return MCP_ACCEPTANCE_ERRORS.TIMEOUT;
  }
  if (/\b(?:401|403|unauthori[sz]ed|insufficient scope)\b/i.test(message)) return MCP_ACCEPTANCE_ERRORS.UNAUTHORIZED;
  if (/\b(?:fetch failed|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ECONNRESET|network)\b/i.test(message)) {
    return MCP_ACCEPTANCE_ERRORS.NETWORK;
  }
  if (/\bHTTP\s+[45]\d\d\b/i.test(message)) return MCP_ACCEPTANCE_ERRORS.HTTP;
  if (/\b(?:schema|parse|invalid response|validation)\b/i.test(message)) return MCP_ACCEPTANCE_ERRORS.INVALID_RESPONSE;
  if (/\b(?:initialize|handshake|server rejected)\b/i.test(message)) return MCP_ACCEPTANCE_ERRORS.SERVER_REJECTED;
  return MCP_ACCEPTANCE_ERRORS.FAILED;
}

async function withDeadline(promise, timeoutMs, lifecycle) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          lifecycle.abort();
          reject(new Error(MCP_ACCEPTANCE_ERRORS.TIMEOUT));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupWithin(promise, timeoutMs, lifecycle) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve(promise).catch(() => undefined),
      new Promise(resolve => {
        timer = setTimeout(() => {
          lifecycle.abort();
          resolve(undefined);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function writePrivateJson(filePath, value, maxBytes = 2 * 1024 * 1024) {
  const content = JSON.stringify(redactSensitiveValue(value), null, 2) + '\n';
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    throw new Error(`MCP_ACCEPTANCE_EVIDENCE_TOO_LARGE: max=${maxBytes}`);
  }
  const handle = await fs.open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function runExternalMcpAcceptance(options = {}) {
  const url = safeEndpoint(options.url ?? 'http://127.0.0.1:8765/mcp');
  const bearerEnv = options.bearerEnv ?? 'AGENT_CORE_ACCEPTANCE_BEARER_TOKEN';
  const bearer = process.env[bearerEnv]?.trim();
  const evidenceBase = path.resolve(options.evidenceRoot ?? DEFAULT_EVIDENCE_ROOT);
  if (!inside(evidenceBase, DEFAULT_EVIDENCE_ROOT)) {
    throw new Error('MCP_ACCEPTANCE_EVIDENCE_OUTSIDE_RUNTIME_TMP');
  }
  const runDir = path.join(evidenceBase, new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(runDir, { recursive: true, mode: 0o700 });

  const requestTimeoutMs = Math.max(50, Math.min(120_000, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS));
  const cleanupTimeoutMs = Math.max(50, Math.min(30_000, options.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS));
  const lifecycle = new AbortController();
  const absoluteDeadline = setTimeout(
    () => lifecycle.abort(),
    Math.max(requestTimeoutMs * 4 + cleanupTimeoutMs * 2, 1_000),
  );
  const boundedFetch = (input, init = {}) => fetch(input, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, lifecycle.signal])
      : lifecycle.signal,
  });
  const transport = new StreamableHTTPClientTransport(url, {
    ...(bearer ? { authProvider: { token: async () => bearer } } : {}),
    onInsufficientScope: 'throw',
    maxStepUpRetries: 0,
    fetch: boundedFetch,
    reconnectionOptions: { initialReconnectionDelay: 200, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1.5, maxRetries: 0 },
  });
  const client = new Client({ name: 'agent-core-external-acceptance', version: '1.0.0' }, {
    listMaxPages: 8,
  });
  try {
    await withDeadline(client.connect(transport), requestTimeoutMs, lifecycle);
    const listed = await withDeadline(
      client.listTools(undefined, { cacheMode: 'refresh' }),
      requestTimeoutMs,
      lifecycle,
    );
    const tools = listed.tools ?? [];
    const fingerprint = manifestFingerprint(tools);
    const requiredTools = options.requiredTools ?? [];
    const requiredParams = options.requiredParams ?? [];
    const missingTools = requiredTools.filter(name => !tools.some(tool => tool.name === name));
    const missingParams = requiredParams.filter(spec => {
      const [toolName, param] = String(spec).split(':', 2);
      return !toolName || !param || !schemaHasParam(tools.find(tool => tool.name === toolName), param);
    });
    const expectedCount = options.expectedToolCount;
    if (expectedCount !== undefined && tools.length !== expectedCount) {
      throw new Error(`MCP_ACCEPTANCE_TOOL_COUNT_MISMATCH: expected=${expectedCount} actual=${tools.length}`);
    }
    if (missingTools.length) throw new Error('MCP_ACCEPTANCE_MISSING_TOOLS');
    if (missingParams.length) throw new Error('MCP_ACCEPTANCE_MISSING_PARAMS');

    const probeTool = options.probeTool ?? 'memory_status';
    const probe = tools.find(tool => tool.name === probeTool);
    if (!probe) throw new Error('MCP_ACCEPTANCE_PROBE_TOOL_MISSING');
    const probeResult = await withDeadline(
      client.callTool({ name: probeTool, arguments: {} }),
      requestTimeoutMs,
      lifecycle,
    );
    if (probeResult.isError === true) throw new Error('MCP_ACCEPTANCE_PROBE_FAILED');
    const report = {
      ok: true,
      endpoint: `${url.protocol}//${url.host}${url.pathname}`,
      authenticated: Boolean(bearer),
      toolCount: tools.length,
      manifestFingerprint: fingerprint,
      requiredTools,
      requiredParams,
      probeTool,
      probeOk: true,
      requestTimeoutMs,
      cleanupTimeoutMs,
      generatedAt: new Date().toISOString(),
    };
    await writePrivateJson(path.join(runDir, 'manifest.json'), { tools: manifestView(tools) });
    await writePrivateJson(path.join(runDir, 'probe.json'), {
      tool: probeTool,
      isError: probeResult.isError === true,
      content: probeResult.content,
      structuredContent: probeResult.structuredContent,
    });
    await writePrivateJson(path.join(runDir, 'report.json'), report);
    return { ...report, evidenceDir: runDir };
  } catch (error) {
    const category = lifecycle.signal.aborted
      ? MCP_ACCEPTANCE_ERRORS.TIMEOUT
      : classifyAcceptanceError(error);
    await writePrivateJson(path.join(runDir, 'report.json'), {
      ok: false,
      endpoint: `${url.protocol}//${url.host}${url.pathname}`,
      authenticated: Boolean(bearer),
      error: category,
      generatedAt: new Date().toISOString(),
    }).catch(() => undefined);
    throw new Error(category);
  } finally {
    clearTimeout(absoluteDeadline);
    if (typeof transport.terminateSession === 'function') {
      await cleanupWithin(transport.terminateSession(), cleanupTimeoutMs, lifecycle);
    }
    await cleanupWithin(client.close(), cleanupTimeoutMs, lifecycle);
    lifecycle.abort();
  }
}

function integer(value, label) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label}_INVALID`);
  return parsed;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {
    url: arg('--url') ?? 'http://127.0.0.1:8765/mcp',
    bearerEnv: arg('--bearer-env') ?? 'AGENT_CORE_ACCEPTANCE_BEARER_TOKEN',
    expectedToolCount: integer(arg('--expected-tool-count'), 'MCP_ACCEPTANCE_TOOL_COUNT'),
    requiredTools: args('--require-tool'),
    requiredParams: args('--require-param'),
    probeTool: arg('--probe-tool') ?? 'memory_status',
    evidenceRoot: arg('--evidence-root'),
    requestTimeoutMs: integer(arg('--request-timeout-ms'), 'MCP_ACCEPTANCE_REQUEST_TIMEOUT'),
    cleanupTimeoutMs: integer(arg('--cleanup-timeout-ms'), 'MCP_ACCEPTANCE_CLEANUP_TIMEOUT'),
  };
  runExternalMcpAcceptance(options)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }, null, 2));
      process.exitCode = 1;
    });
}
