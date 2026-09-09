import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../dist/config.js';
import { resolveFileNativeMemoryPaths } from '../dist/memory/file-native/paths.js';
import { resolvePrivateMemoryTool } from '../dist/memory/file-native/tool-resolver.js';
import { SupabaseDirectError, validateDirectMemoryDocument } from '../dist/memory/file-native/supabase-direct.js';

export const MEMORY_BENCHMARK_SCOPE = Object.freeze({
  measurement: 'local strict preflight with real vault, private Graphify, and private ripgrep',
  supabase: 'isolated in-process RPC fixture; no network, production credentials, or remote latency',
  remoteCertification: false,
});

/** This transport exercises the production sync caller, without claiming remote durability. */
export class BenchmarkMemoryTransport {
  documents = new Map();
  calls = { health: 0, upsert: 0, get: 0, search: 0 };
  offline = false;
  async call(operation, payload) {
    if (this.offline) throw new SupabaseDirectError('MEMORY_SUPABASE_NETWORK_ERROR');
    if (!(operation in this.calls)) throw new Error(`Benchmark transport does not implement ${operation}`);
    this.calls[operation]++;
    if (operation === 'health') return { schemaVersion: 1 };
    const scope = { principalId: payload.principalId, projectId: payload.projectId };
    const prefix = JSON.stringify([scope.principalId, scope.projectId]) + ':';
    if (operation === 'get') return structuredClone(this.documents.get(prefix + payload.memoryId)?.document ?? null);
    if (operation === 'search') {
      const terms = String(payload.query).split(' OR ').map(term => term.replaceAll('"', '').toLowerCase());
      const found = [];
      for (const [key, value] of this.documents) {
        if (key.startsWith(prefix) && terms.some(term => `${value.document.entry.canonicalKey} ${value.document.entry.valueText}`.toLowerCase().includes(term))) {
          found.push(structuredClone(value.document));
          if (found.length >= Number(payload.limit)) break;
        }
      }
      return found;
    }
    const document = validateDirectMemoryDocument(payload.document, scope);
    const key = prefix + document.entry.memoryId;
    if ((this.documents.get(key)?.version ?? null) !== (payload.expectedVersion ?? null)) throw new SupabaseDirectError('MEMORY_SUPABASE_WRITE_CONFLICT');
    const version = randomUUID();
    this.documents.set(key, { document: structuredClone(document), version });
    return { applied: true, version };
  }
}

export async function benchmarkMemoryConfig(root, projectRoot = fileURLToPath(new URL('..', import.meta.url))) {
  // Never load .env or inherit memory configuration from process.env. All writable paths are new.
  const config = loadConfig({
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce',
    AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED: 'true',
    AGENT_CORE_MEMORY_SUPABASE_URL: 'https://benchmark.invalid',
    AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY: 'sb_secret_isolated_benchmark_fixture',
  }, projectRoot).memory;
  const isolated = resolveFileNativeMemoryPaths(root);
  config.fileNative = {
    ...config.fileNative,
    memoryRoot: isolated.memoryRoot, vaultRoot: isolated.vaultRoot, graphRoot: isolated.graphRoot,
    transactionRoot: isolated.transactionRoot, syncRoot: isolated.syncRoot,
  };
  if (!path.relative(path.resolve(root), config.fileNative.memoryRoot).startsWith(`runtime${path.sep}`)) throw new Error('Benchmark memory root must be isolated');
  config.fileNative.rgPath = await resolvePrivateMemoryTool(config.fileNative, 'rg');
  config.fileNative.pythonPath = await resolvePrivateMemoryTool(config.fileNative, 'python');
  return config;
}
