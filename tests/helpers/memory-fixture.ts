import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type AppConfig, type MemoryConfig, type MemoryFileNativeConfig } from '../../src/config.js';
import { canonicalFileNativeProjectId } from '../../src/memory/file-native/paths.js';
import { parseVaultSegment, serializeVaultSegment } from '../../src/memory/file-native/vault-codec.js';
import { MemoryService } from '../../src/memory/service.js';
import { createRuntimeServices } from '../../src/runtime/services.js';
import { WorkflowRpcFixture } from './supabase-workflow-fixture.js';

/** Real routing/runtime with isolated healthy memory transports for lifecycle contract tests. */
export function createIsolatedRuntimeServices(...args: Parameters<typeof createRuntimeServices>) {
  const memory = args[3];
  if (!memory) throw new Error('Isolated runtime requires an explicit fixture memory configuration');
  args[12] ??= isolatedMemoryDependencies(memory);
  return createRuntimeServices(...args);
}
import type { MemoryServiceDependencies } from '../../src/memory/service.js';
import type { DirectMemoryDocument, SupabaseDirectTransport } from '../../src/memory/file-native/supabase-direct.js';
import { SupabaseDirectError } from '../../src/memory/file-native/supabase-direct.js';
import type {
  AppendFileVersionInput, FileSecondMemoryHead, FileSecondMemoryTransport, FileSecondMemoryVersion, TombstoneFileInput,
} from '../../src/memory/file-native/supabase-second-memory.js';

const RG = process.platform === 'win32' ? 'rg.exe' : 'rg';

/** Temporary Agent Core root with its own runtime/memory/vault and project-local ripgrep. */
export async function memoryRoot(label = 'memory'): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `ac-${label}-`));
}

/** Vault search only certifies a project-local ripgrep, so every temp root needs its own copy. */
export async function installMemoryTools(config: MemoryConfig): Promise<MemoryConfig> {
  await mkdir(config.fileNative.ripgrepRoot, { recursive: true });
  await copyFile(path.resolve('.tools', 'ripgrep', RG), path.join(config.fileNative.ripgrepRoot, RG));
  return config;
}

export async function memoryConfig(root: string, env: Record<string, string | undefined> = {}): Promise<MemoryConfig> {
  return installMemoryTools(loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory', ...env }, root).memory);
}

/** Full application config rooted at a temp Agent Core root, with the vault tools in place. */
export async function memoryAppConfig(root: string, env: Record<string, string | undefined> = {}): Promise<AppConfig> {
  const config = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory', ...env }, root);
  await installMemoryTools(config.memory);
  return config;
}

/** Explicit component configuration for lifecycle tests. The injected transport never uses the network. */
export async function strictMemoryConfig(root:string,env:Record<string,string|undefined>={}):Promise<MemoryConfig>{
  return memoryConfig(root,{
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE:'enforce',
    AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED:'true',
    AGENT_CORE_MEMORY_SUPABASE_URL:'https://fixture.supabase.co',
    AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:'sb_secret_fixture_only',
    ...env,
  });
}

/** Scoped direct-memory RPC fixture; failures are controllable without touching live credentials. */
export class FakeDirectMemoryTransport implements SupabaseDirectTransport {
  readonly workflow=new WorkflowRpcFixture((principalId,projectId,memoryId)=>this.documents.get(`${JSON.stringify([principalId,projectId])}:${memoryId}`)?.document);
  offline=false;
  healthCalls=0;
  readonly documents=new Map<string,{document:DirectMemoryDocument;version:string}>();
  async call(operation:Parameters<SupabaseDirectTransport['call']>[0],payload:Record<string,unknown>):Promise<unknown>{
    if(this.offline)throw new SupabaseDirectError('MEMORY_SUPABASE_NETWORK_ERROR');
    if(operation==='health'){this.healthCalls++;return{schemaVersion:1,workflowSchemaVersion:1};}
    if(operation.startsWith('workflow_'))return this.workflow.call(operation,payload);
    const prefix=JSON.stringify([payload.principalId,payload.projectId]);
    if(operation==='get')return this.documents.get(`${prefix}:${payload.memoryId}`)?.document??null;
    if(operation==='search'){
      const terms=String(payload.query).split(' OR ').map(term=>term.replaceAll('"','').toLowerCase());
      return [...this.documents.entries()].filter(([key,value])=>key.startsWith(prefix+':')&&terms.some(term=>`${value.document.entry.canonicalKey} ${value.document.entry.valueText}`.toLowerCase().includes(term))).slice(0,Number(payload.limit)).map(([,value])=>structuredClone(value.document));
    }
    const document=structuredClone(payload.document) as DirectMemoryDocument,key=`${prefix}:${document.entry.memoryId}`,prior=this.documents.get(key);
    if((prior?.version??null)!==(payload.expectedVersion??null))throw new SupabaseDirectError('MEMORY_SUPABASE_WRITE_CONFLICT');
    const version=randomUUID();this.documents.set(key,{document,version});return{applied:true,version};
  }
}

/** Non-Graphify integration tests inject a healthy projection; real index behavior has its own suite. */
export function isolatedMemoryDependencies(config:MemoryConfig):MemoryServiceDependencies & {supabaseDirectTransport:FakeDirectMemoryTransport}{
  const status=()=>({healthy:true,checkedAt:Date.now()});
  return{
    supabaseDirectTransport:new FakeDirectMemoryTransport(),
    graphify:{
      async health(){return status();},async ensureFresh(){return status();},
      async update(){return{nodes:0,edges:0,graphPath:path.join(config.fileNative.graphRoot,'graph.json')};},
      async scoreRelated(){return new Map();},
    },
  };
}

export interface MemoryFixture {
  root: string;
  config: MemoryConfig;
  service: MemoryService;
}

export async function memoryFixture(label = 'memory', env: Record<string, string | undefined> = {}): Promise<MemoryFixture> {
  const root = await memoryRoot(label);
  const config = await memoryConfig(root, env);
  return { root, config, service: new MemoryService(config,undefined,isolatedMemoryDependencies(config)) };
}

/** Rewrite a committed memory's canonical vault segment; the files are the only authority. */
export async function backdateVaultEntry(vaultRoot: string, memoryId: string, updatedAt: number): Promise<void> {
  for (const file of await readdir(vaultRoot, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.md')) continue;
    const absolute = path.join(file.parentPath, file.name);
    let segment;
    try {
      segment = parseVaultSegment(await readFile(absolute, 'utf8'), path.relative(vaultRoot, absolute).split(path.sep).join('/'));
    } catch { continue; }
    const entry = segment.entries.find((candidate) => candidate.memoryId === memoryId);
    if (!entry) continue;
    entry.updatedAt = updatedAt;
    await writeFile(absolute, serializeVaultSegment(segment), 'utf8');
    return;
  }
  throw new Error(`MEMORY_FIXTURE_ENTRY_MISSING:${memoryId}`);
}

/** The JSON state categories the vault keeps beside its Markdown segments. */
export const MEMORY_STATE = {
  contexts: 'contexts',
  lifecycles: 'lifecycles',
  writeDecisions: 'write-decisions',
  nodeMetadata: 'node-metadata',
  conflicts: 'conflicts',
  events: 'events',
  tasks: 'continuity-tasks',
  turns: 'continuity-turns',
  checkpoints: 'continuity-checkpoints',
  frontier: 'continuity-frontier',
} as const;

function stateDir(vaultRoot: string, category: string): string {
  return path.join(vaultRoot, '.agent-core', 'state', category);
}

/** Every persisted record of one state category, in the vault's own oldest-first order. */
export async function memoryStateRecords<T extends { createdAt?: number }>(vaultRoot: string, category: string): Promise<T[]> {
  const dir = stateDir(vaultRoot, category);
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) => name.endsWith('.json')).sort();
  const records: T[] = [];
  for (const name of names) records.push(JSON.parse(await readFile(path.join(dir, name), 'utf8')) as T);
  return records.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** One state category, narrowed to the records the vault filed under a scope. */
export async function scopedMemoryStateRecords<T>(
  fileNative: MemoryFileNativeConfig, category: string, scope: { principalId: string; projectId?: string },
): Promise<T[]> {
  const projectId = canonicalFileNativeProjectId(fileNative, scope.projectId);
  type Scoped = T & { principalId?: string; projectId?: string; createdAt?: number };
  return (await memoryStateRecords<Scoped>(fileNative.vaultRoot, category))
    .filter((record) => record.principalId === scope.principalId && (record.projectId ?? '') === projectId);
}

/** Rewrite one persisted state record in place; the files are the only authority. */
export async function patchMemoryStateRecord<T extends object>(
  vaultRoot: string, category: string, id: string, patch: Partial<T>,
): Promise<void> {
  const file = path.join(stateDir(vaultRoot, category), `${id.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
  const record = JSON.parse(await readFile(file, 'utf8')) as T;
  await writeFile(file, `${JSON.stringify({ ...record, ...patch }, null, 2)}\n`, 'utf8');
}

// Everything a file-native runtime is allowed to write. Anything else - an embedded
// database of any name, or one of its side-car journals - is a cutover regression.
const FILE_NATIVE_EXTENSIONS = new Set(['.md', '.json', '.jsonl', '.lock', '.tmp', '.log', '.txt', '']);

// `.tools/` holds the certified binaries the operator (here: installMemoryTools) provisions
// before the runtime starts - ripgrep and friends. They are inputs, never runtime output, so
// the scan covers everything the runtime itself can write and nothing it cannot.
const PROVISIONED_TOOL_PREFIX = '.tools/';

/** Files under a root that a file-native runtime has no business producing. */
export async function databaseFilesUnder(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || FILE_NATIVE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const relative = path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!relative.startsWith(PROVISIONED_TOOL_PREFIX)) found.push(relative);
  }
  return found.sort();
}

/** Every file the vault produced, relative to the Agent Core root. */
export async function memoryRuntimeFiles(root: string): Promise<string[]> {
  const base = path.join(root, 'runtime', 'memory');
  const found: string[] = [];
  for (const entry of await readdir(base, { recursive: true, withFileTypes: true }).catch(() => [])) {
    if (entry.isFile()) found.push(path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
  }
  return found.sort();
}

/** In-process stand-in for the Supabase Second Memory tables. */
export class FakeSecondMemoryTransport implements FileSecondMemoryTransport {
  readonly versions = new Map<string, FileSecondMemoryVersion>();
  readonly heads = new Map<string, FileSecondMemoryHead>();
  readonly syncStates: Array<{ logicalRootHash: string | null }> = [];
  appendCalls = 0;
  /** Set to make every remote read fail, the way an unreachable or unauthorised mirror does. */
  readError: (Error & { code?: string }) | undefined;

  async appendVersion(input: AppendFileVersionInput) {
    this.appendCalls += 1;
    this.versions.set(input.version.versionId, input.version);
    const prior = this.heads.get(input.fileId);
    this.heads.set(input.fileId, {
      principalId: input.principalId, projectId: input.projectId, mirrorId: input.mirrorId,
      fileId: input.fileId, relativePath: input.relativePath, currentVersionId: input.version.versionId,
      state: 'active', contentHash: input.version.contentHash, updatedAt: input.version.createdAt,
      ...(prior ? { priorVersionId: prior.currentVersionId } : {}),
    });
    return { applied: true, currentVersionId: input.version.versionId };
  }
  async tombstone(input: TombstoneFileInput) {
    const head = this.heads.get(input.fileId);
    if (head) this.heads.set(input.fileId, { ...head, state: 'tombstoned', priorVersionId: head.currentVersionId, updatedAt: input.deletedAt });
  }
  async getHead(input: { fileId: string }) { if (this.readError) throw this.readError; return this.heads.get(input.fileId) ?? null; }
  async getVersion(input: { versionId: string }) { if (this.readError) throw this.readError; return this.versions.get(input.versionId) ?? null; }
  async upsertSyncState(input: { logicalRootHash: string | null }) { this.syncStates.push(input); }
}

/** Env that turns on Supabase Second Memory against a fake transport. */
export async function secondMemoryEnv(root: string): Promise<Record<string, string>> {
  await mkdir(path.join(root, 'runtime', 'secrets'), { recursive: true });
  await writeFile(path.join(root, 'runtime', 'secrets', 'signing.pem'), 'unused-with-fake-transport');
  await writeFile(path.join(root, 'runtime', 'secrets', 'enc.key'), Buffer.alloc(32, 7));
  return {
    AGENT_CORE_MEMORY_SUPABASE_SECOND_ENABLED: 'true',
    AGENT_CORE_MEMORY_SUPABASE_URL: 'https://example.supabase.co',
    AGENT_CORE_MEMORY_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE: 'runtime/secrets/signing.pem',
    AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE: 'runtime/secrets/enc.key',
  };
}

/** Content hash of every durable memory file, for asserting an operation changed nothing. */
export async function memoryStateHash(root: string): Promise<string> {
  const base = path.join(root, 'runtime', 'memory');
  const digest = createHash('sha256');
  for (const file of await memoryRuntimeFiles(root)) {
    if(file.startsWith('runtime/memory/recovery/leases/'))continue;
    digest.update(file).update(await readFile(path.join(root, ...file.split('/'))).catch(() => Buffer.alloc(0)));
  }
  void base;
  return digest.digest('hex');
}
