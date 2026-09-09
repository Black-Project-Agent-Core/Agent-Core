import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadConfig } from '../dist/config.js';
import { createMemoryContextLeaseHttpHandler } from '../dist/http/memory-context-lease.js';
import { MemoryService } from '../dist/memory/service.js';

function integerArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid --${name}`);
  return value;
}

function numberArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --${name}`);
  return value;
}

function percentile(sorted, ratio) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(2000),
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`Lease benchmark request failed: HTTP ${response.status}`);
  }
  return payload;
}

const samples = integerArg('samples', 100);
const warmup = integerArg('warmup', 10);
const targetP95Ms = numberArg('target-p95-ms', 50);
const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-context-lease-benchmark-'));
let service;
let server;

try {
  const config = loadConfig({
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce',
    AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false',
  }, root).memory;
  service = new MemoryService(config);
  const scope = { principalId: 'benchmark-principal', projectId: root };
  const routeContextId = 'benchmark-route';
  const preflight = await service.preflight({
    scope,
    routeContextId,
    task: 'Benchmark local opaque Memory Context Lease before/after validation',
    expiresAt: Date.now() + 30 * 60_000,
  });
  const lease = await service.issueContextLease({ scope, contextId: preflight.contextId, routeContextId });
  const handler = createMemoryContextLeaseHttpHandler({ memory: service });
  server = createServer((request, response) => void handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Benchmark server did not bind a TCP port');
  const url = `http://127.0.0.1:${address.port}/internal/memory-context-lease`;
  const beforeBody = {
    action: 'before',
    toolName: 'write_file',
    workspaceRoot: root,
    lease: lease.token,
    input: {},
  };
  const afterBody = { ...beforeBody, action: 'after' };

  for (let index = 0; index < warmup; index += 1) {
    await post(url, beforeBody);
    await post(url, afterBody);
  }

  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    const before = await post(url, beforeBody);
    const after = await post(url, afterBody);
    if (before.required !== true || before.valid !== true || after.postflightState !== 'POSTFLIGHT_PENDING') {
      throw new Error('Benchmark authority returned an invalid lifecycle decision');
    }
    durations.push(performance.now() - started);
  }

  durations.sort((a, b) => a - b);
  const result = {
    samples,
    warmup,
    operation: 'loopback before+after meaningful lease validation',
    p50Ms: Number(percentile(durations, 0.50).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    maxMs: Number(durations.at(-1).toFixed(3)),
    targetP95Ms,
    passed: percentile(durations, 0.95) < targetP95Ms,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(() => resolve()));
  if (service) await service.close().catch(() => undefined);
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
}
