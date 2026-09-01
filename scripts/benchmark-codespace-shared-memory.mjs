import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadConfig } from '../dist/config.js';
import { createCodespaceSharedMemoryHttpHandler } from '../dist/http/codespace-memory.js';
import { MemoryService } from '../dist/memory/service.js';
import { WorkspacePolicy } from '../dist/runtime/workspace.js';
import { CodespaceSharedMemoryClient } from '../plugin/codespace/dist/shared-memory.js';

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

const samples = integerArg('samples', 100);
const warmup = integerArg('warmup', 10);
const targetP95Ms = numberArg('target-p95-ms', 50);
const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-codespace-shared-memory-benchmark-'));
let memory;
let server;

try {
  const config = loadConfig({
    AGENT_CORE_ALLOWED_ROOTS: root,
    AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite'),
    AGENT_CORE_MEMORY_PRINCIPAL_ID: 'benchmark-shared-principal',
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce',
    AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false',
  }, root).memory;
  memory = new MemoryService(config);
  const scope = { principalId: config.principalId, projectId: root };
  await memory.commit({
    scope,
    canonicalKey: 'benchmark.codespace.shared-memory',
    kind: 'decision',
    value: 'needle shared memory loopback benchmark authority',
    sourceType: 'benchmark',
  });

  const handler = createCodespaceSharedMemoryHttpHandler({
    memory,
    workspace: new WorkspacePolicy([root]),
  });
  server = createServer((request, response) => void handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Shared-memory benchmark server did not bind a TCP port');
  const client = new CodespaceSharedMemoryClient({
    endpoint: `http://127.0.0.1:${address.port}/internal/codespace-memory`,
    timeoutMs: 2000,
  });
  const operation = async () => {
    const result = await client.search(root, {
      query: 'needle shared memory loopback benchmark authority',
      includeHistory: true,
      limit: 8,
    });
    if (!Array.isArray(result?.hits) || result.hits.length < 1) {
      throw new Error('Shared-memory benchmark did not recall the seeded memory');
    }
  };

  for (let index = 0; index < warmup; index += 1) await operation();
  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await operation();
    durations.push(performance.now() - started);
  }
  durations.sort((left, right) => left - right);
  const p95 = percentile(durations, 0.95);
  const result = {
    samples,
    warmup,
    operation: 'Codespace thin client -> loopback Agent Core shared-memory search -> SQLite authority',
    p50Ms: Number(percentile(durations, 0.50).toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    maxMs: Number(durations.at(-1).toFixed(3)),
    targetP95Ms,
    passed: p95 < targetP95Ms,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(() => resolve()));
  if (memory) await memory.close().catch(() => undefined);
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
}
