import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import type { MemorySupabaseDirectConfig } from '../../config.js';
import { sanitizeStructured, type StoredMemoryRevision } from '../record-types.js';
import { MEMORY_ENFORCEMENTS, MEMORY_KINDS, MEMORY_RELATIONS, MEMORY_STATES, type MemoryDirectSyncReceipt, type MemoryScope } from '../types.js';
import { FileNativeAuxStore } from './aux-store.js';
import { canonicalFileNativeProjectId, type FileNativeMemoryPaths } from './paths.js';
import { buildRecallProbes } from './ripgrep.js';
import type { VaultMemoryEntry } from './types.js';
import { FileNativeMemoryRepository } from './vault-repository.js';
import {
  makeWorkflowProjectionRecord, makeWorkflowProjectionSnapshot, readWorkflowProjection, hasWorkflowProjectionContract,
  WORKFLOW_PROJECTION_CATEGORIES, WorkflowProjectionError, workflowCanonicalJson, workflowHash, workflowManifestSchema,
  type WorkflowProjectionCategory, type WorkflowProjectionManifest, type WorkflowProjectionRecord, type WorkflowProjectionSnapshot,
} from './workflow-projection.js';

export interface DirectMemoryDocument {
  principalId: string;
  projectId: string;
  entry: VaultMemoryEntry;
  revisions: StoredMemoryRevision[];
}
export interface SupabaseDirectTransport {
  call(operation: 'health' | 'upsert' | 'get' | 'search' | 'workflow_upsert' | 'workflow_get' | 'workflow_list'
    | 'workflow_commit_generation' | 'workflow_generation_get' | 'workflow_memory_upsert' | 'workflow_memory_get', payload: Record<string, unknown>): Promise<unknown>;
}
export interface WorkflowGenerationReceipt {
  state: 'synced';
  generationId: string;
  logicalStateHash: string;
  remoteVersion: string;
  recordCount: number;
}
export interface WorkflowBackup {
  snapshot: WorkflowProjectionSnapshot;
  generation: WorkflowGenerationReceipt;
  memoryDocuments: DirectMemoryDocument[];
}
export class SupabaseDirectError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'SupabaseDirectError'; }
}
const fail = (code: string): never => { throw new SupabaseDirectError(code); };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const RECEIPT_READ_BATCH_SIZE = 8;
const uuid = z.string().uuid();
const revisionSchema = z.object({
  revisionId: uuid, memoryId: uuid, revisionNo: z.number().int().positive(),
  valueText: z.string().max(500_000), valueJson: z.string().optional(), valueHash: z.string(),
  sourceEventId: z.string().optional(), validFrom: z.number(), validTo: z.number().optional(),
  supersedesRevisionId: uuid.optional(), createdAt: z.number(),
});
const documentSchema = z.object({
  principalId: z.string().min(1), projectId: z.string().max(4096),
  entry: z.object({
    memoryId: uuid, revisionId: uuid, revisionNo: z.number().int().positive(),
    canonicalKey: z.string().min(1).max(1000), kind: z.enum(MEMORY_KINDS), state: z.enum(MEMORY_STATES),
    importance: z.number().min(0).max(1), pinned: z.boolean(), enforcement: z.enum(MEMORY_ENFORCEMENTS),
    valueText: z.string().max(500_000), valueJson: z.string().optional(), valueHash: z.string(),
    sourceEventId: z.string().optional(), createdAt: z.number(), updatedAt: z.number(), title: z.string().optional(),
    anchors: z.array(z.object({ type: z.string(), value: z.string() })).max(128).optional(),
    relations: z.array(z.object({ targetMemoryId: uuid, relation: z.enum(MEMORY_RELATIONS), weight: z.number() })).max(1000),
  }),
  revisions: z.array(revisionSchema).max(10_000),
});
export function validateDirectMemoryDocument(raw:unknown,scope:{principalId:string;projectId:string}):DirectMemoryDocument{
  const parsed=documentSchema.safeParse(raw);if(!parsed.success)return fail('MEMORY_SUPABASE_RESPONSE_INVALID');
  const doc=parsed.data;
  if(doc.principalId!==scope.principalId||doc.projectId!==scope.projectId)return fail('MEMORY_SUPABASE_SCOPE_MISMATCH');
  if(doc.revisions.some(r=>r.memoryId!==doc.entry.memoryId))return fail('MEMORY_SUPABASE_RESPONSE_INVALID');
  return doc;
}

/** Credentials stay on the Agent-Core server. Never forward response bodies into tool errors. */
export class SupabaseDirectHttpTransport implements SupabaseDirectTransport {
  constructor(private readonly config: MemorySupabaseDirectConfig, private readonly fetcher: typeof fetch = fetch) {}
  async call(operation: Parameters<SupabaseDirectTransport['call']>[0], payload: Record<string, unknown>): Promise<unknown> {
    if (!this.config.url || !this.config.secretKey) return fail('MEMORY_SUPABASE_NOT_CONFIGURED');
    const headers: Record<string, string> = { apikey: this.config.secretKey, 'Content-Type': 'application/json' };
    // Opaque secret keys are not JWTs. Legacy service_role JWTs need the bearer header too.
    if (!this.config.secretKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${this.config.secretKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(`${this.config.url}/rest/v1/rpc/agent_core_memory_call`, {
        method: 'POST', headers, body: JSON.stringify({ operation, payload }), signal: controller.signal, redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        return fail(response.status === 401 || response.status === 403 ? 'MEMORY_SUPABASE_AUTH_FAILED'
          : response.status === 404 ? 'MEMORY_SUPABASE_SCHEMA_MISSING'
          : response.status === 409 ? 'MEMORY_SUPABASE_WRITE_CONFLICT' : `MEMORY_SUPABASE_HTTP_${response.status}`);
      }
      // Bound the response while reading, including chunked bodies and slow streams.
      const reader = response.body?.getReader();
      if (!reader) return fail('MEMORY_SUPABASE_RESPONSE_INVALID');
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); return fail('MEMORY_SUPABASE_RESPONSE_TOO_LARGE'); }
        chunks.push(chunk.value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return fail('MEMORY_SUPABASE_RESPONSE_INVALID'); }
    } catch (error) {
      if (error instanceof SupabaseDirectError) throw error;
      return fail(controller.signal.aborted ? 'MEMORY_SUPABASE_TIMEOUT' : 'MEMORY_SUPABASE_NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
}

interface Receipt { contentHash: string; syncedAt: number; remoteVersion: string }
/** Local canonical records are the durable retry queue; receipts certify individual remote writes. */
export class SupabaseDirectMemory {
  private readonly locks = new Map<string, Promise<MemoryDirectSyncReceipt>>();
  private readonly workflowLocks = new Map<string, Promise<WorkflowGenerationReceipt>>();
  private readonly targetId: string;
  constructor(
    private readonly paths: FileNativeMemoryPaths,
    private readonly repo: FileNativeMemoryRepository,
    private readonly aux: FileNativeAuxStore,
    private readonly transport: SupabaseDirectTransport,
    url: string,
  ) { this.targetId = hash(url); }
  private scope(scope: MemoryScope) {
    if (!scope.principalId?.trim()) return fail('MEMORY_SCOPE_REQUIRED');
    return { principalId: scope.principalId, projectId: canonicalFileNativeProjectId(this.paths, scope.projectId) };
  }
  private receiptId(doc: DirectMemoryDocument) { return hash([this.targetId, doc.principalId, doc.projectId, doc.entry.memoryId]); }
  private parse(raw: unknown, scope: MemoryScope): DirectMemoryDocument {
    return validateDirectMemoryDocument(raw,this.scope(scope));
  }
  async health() {
    const result = await this.transport.call('health', {});
    if (!result || typeof result !== 'object' || (result as { schemaVersion?: unknown }).schemaVersion !== 1) return fail('MEMORY_SUPABASE_SCHEMA_INVALID');
  }
  async requireWorkflowHealth(): Promise<void> {
    const result = await this.transport.call('health', {});
    if (!result || typeof result !== 'object' || (result as { schemaVersion?: unknown }).schemaVersion !== 1
      || (result as { workflowSchemaVersion?: unknown }).workflowSchemaVersion !== 1) return fail('WORKFLOW_SUPABASE_SCHEMA_MISSING');
  }
  async workflowSnapshot(scope: MemoryScope): Promise<WorkflowProjectionSnapshot> {
    const snapshot=await readWorkflowProjection(this.paths,scope),documents=await this.documents(scope);
    return makeWorkflowProjectionSnapshot(this.scope(scope),snapshot.records,documents.map(doc=>({memoryId:doc.entry.memoryId,contentHash:workflowHash(doc)})));
  }
  hasWorkflowContracts(scope:MemoryScope):Promise<boolean>{return hasWorkflowProjectionContract(this.paths,scope);}
  /** Semantic-only boundaries also require remote bytes, never merely a local write receipt. */
  async verifyMemoryDocuments(scope:MemoryScope):Promise<string>{
    const documents=await this.documents(scope),refs=documents.map(doc=>({memoryId:doc.entry.memoryId,contentHash:workflowHash(doc)})).sort((a,b)=>a.memoryId.localeCompare(b.memoryId));
    for(const doc of documents){const remote=await this.get(scope,doc.entry.memoryId);if(!remote||workflowHash(remote)!==workflowHash(doc))return fail('MEMORY_SUPABASE_DOCUMENT_MISMATCH');}
    const current=(await this.documents(scope)).map(doc=>({memoryId:doc.entry.memoryId,contentHash:workflowHash(doc)})).sort((a,b)=>a.memoryId.localeCompare(b.memoryId));
    if(workflowHash(current)!==workflowHash(refs))return fail('MEMORY_SUPABASE_DOCUMENT_CHANGED');
    return workflowHash(refs);
  }

  private workflowReceiptId(scope: MemoryScope, category?: string, recordId?: string) {
    return workflowHash([this.targetId, this.scope(scope), category ?? null, recordId ?? null]);
  }
  private async remoteWorkflowGeneration(scope: MemoryScope, generationId?: string) {
    const raw = await this.transport.call('workflow_generation_get', { ...this.scope(scope), ...(generationId ? { generationId } : {}) });
    if (raw === null) return null;
    const parsed = z.strictObject({
      generationId: z.string().regex(/^[a-f0-9]{64}$/), logicalStateHash: z.string().regex(/^[a-f0-9]{64}$/),
      manifest: workflowManifestSchema, version: uuid,
    }).safeParse(raw);
    if (!parsed.success) return fail('WORKFLOW_SUPABASE_GENERATION_INVALID');
    const result = parsed.data, expected = this.scope(scope);
    if (result.manifest.principalId !== expected.principalId || result.manifest.projectId !== expected.projectId) return fail('MEMORY_SUPABASE_SCOPE_MISMATCH');
    if (result.generationId !== result.logicalStateHash || workflowHash(result.manifest) !== result.logicalStateHash
      || generationId && generationId !== result.generationId) return fail('WORKFLOW_SUPABASE_GENERATION_INVALID');
    if (new Set(result.manifest.records.map(r => `${r.category}/${r.recordId}`)).size !== result.manifest.records.length) return fail('WORKFLOW_SUPABASE_GENERATION_INVALID');
    return result;
  }
  async getWorkflowRecord(scope: MemoryScope, category: WorkflowProjectionCategory, recordId: string, contentHash?: string): Promise<(WorkflowProjectionRecord & { remoteVersion?: string }) | null> {
    const raw = await this.transport.call('workflow_get', { ...this.scope(scope), category, recordId, ...(contentHash ? { contentHash } : {}) });
    if (raw === null) return null;
    const parsed = z.strictObject({
      principalId: z.string(), projectId: z.string(), category: z.enum(WORKFLOW_PROJECTION_CATEGORIES), recordId: z.string(),
      recordVersion: z.number().int().nonnegative(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      document: z.record(z.string(), z.unknown()), version: uuid.optional(),
    }).safeParse(raw);
    if (!parsed.success || parsed.data.category !== category || parsed.data.recordId !== recordId) return fail('WORKFLOW_SUPABASE_RECORD_INVALID');
    const expected = this.scope(scope), result = parsed.data;
    if (result.principalId !== expected.principalId || result.projectId !== expected.projectId) return fail('MEMORY_SUPABASE_SCOPE_MISMATCH');
    let record: WorkflowProjectionRecord;
    try { record = makeWorkflowProjectionRecord(category, recordId, result.document, expected); }
    catch (error) { return fail(error instanceof WorkflowProjectionError ? error.code : 'WORKFLOW_SUPABASE_RECORD_INVALID'); }
    if (record.contentHash !== result.contentHash || record.recordVersion !== result.recordVersion || contentHash && contentHash !== record.contentHash) return fail('WORKFLOW_SUPABASE_RECORD_INVALID');
    return { ...record, ...(result.version ? { remoteVersion: result.version } : {}) };
  }
  async listWorkflowRecords(scope: MemoryScope, generationId?: string): Promise<WorkflowProjectionManifest | null> {
    return (await this.remoteWorkflowGeneration(scope, generationId))?.manifest ?? null;
  }

  /** An immutable generation is verified in full before any caller can use it for restoration. */
  async readWorkflowBackup(scope: MemoryScope, generationId?: string): Promise<WorkflowBackup | null> {
    await this.requireWorkflowHealth();
    const generation = await this.remoteWorkflowGeneration(scope, generationId);
    if (!generation) return null;
    const records: WorkflowProjectionRecord[] = [];
    // Bounded batches avoid unbounded network and memory pressure for a long task history.
    for (let offset = 0; offset < generation.manifest.records.length; offset += 8) {
      const batch = await Promise.all(generation.manifest.records.slice(offset, offset + 8).map(async ref => {
        const record = await this.getWorkflowRecord(scope, ref.category, ref.recordId, ref.contentHash);
        if (!record || record.recordVersion !== ref.recordVersion) return fail('WORKFLOW_SUPABASE_GENERATION_INCOMPLETE');
        return record;
      }));
      records.push(...batch);
    }
    const memoryDocuments:DirectMemoryDocument[]=[];
    for(const ref of generation.manifest.memories??[]){
      const raw=await this.transport.call('workflow_memory_get',{...this.scope(scope),memoryId:ref.memoryId,contentHash:ref.contentHash});
      if(!raw)return fail('WORKFLOW_SUPABASE_MEMORY_MISSING');
      const doc=this.parse(raw,scope);
      if(doc.entry.memoryId!==ref.memoryId||workflowHash(doc)!==ref.contentHash)return fail('WORKFLOW_SUPABASE_MEMORY_INVALID');
      memoryDocuments.push(doc);
    }
    const snapshot = makeWorkflowProjectionSnapshot(this.scope(scope), records,generation.manifest.memories);
    if (snapshot.logicalStateHash !== generation.logicalStateHash) return fail('WORKFLOW_SUPABASE_GENERATION_INVALID');
    return { snapshot, memoryDocuments, generation: { state: 'synced', generationId: generation.generationId,
      logicalStateHash: generation.logicalStateHash, remoteVersion: generation.version, recordCount: records.length } };
  }
  /** Verify both immutable remote bytes and current local state; a local receipt alone is insufficient. */
  async verifyWorkflowGeneration(scope: MemoryScope, snapshot?: WorkflowProjectionSnapshot): Promise<WorkflowGenerationReceipt> {
    const wanted = snapshot ?? await this.workflowSnapshot(scope), backup = await this.readWorkflowBackup(scope);
    if (!backup || backup.snapshot.logicalStateHash !== wanted.logicalStateHash) return fail('WORKFLOW_SUPABASE_GENERATION_MISMATCH');
    await this.verifyMemoryDocuments(scope);
    if ((await this.workflowSnapshot(scope)).logicalStateHash !== wanted.logicalStateHash) return fail('WORKFLOW_PROJECTION_CHANGED');
    const head = await this.remoteWorkflowGeneration(scope);
    if (!head || head.generationId !== backup.generation.generationId || head.version !== backup.generation.remoteVersion) return fail('WORKFLOW_SUPABASE_GENERATION_CHANGED');
    return backup.generation;
  }
  async syncWorkflow(scope: MemoryScope): Promise<WorkflowGenerationReceipt> {
    const key = this.workflowReceiptId(scope), prior = this.workflowLocks.get(key) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(async (): Promise<WorkflowGenerationReceipt> => {
      await this.requireWorkflowHealth();
      const snapshot = await this.workflowSnapshot(scope);
      for(const doc of await this.documents(scope)){
        const contentHash=workflowHash(doc);
        const result=await this.transport.call('workflow_memory_upsert',{...this.scope(scope),memoryId:doc.entry.memoryId,contentHash,
          document:doc,serializedDocument:workflowCanonicalJson(doc)});
        const parsed=z.strictObject({applied:z.literal(true),contentHash:z.literal(contentHash)}).safeParse(result);
        if(!parsed.success)return fail('WORKFLOW_SUPABASE_MEMORY_INVALID');
      }
      for (const record of snapshot.records) {
        const receiptKey = this.workflowReceiptId(scope, record.category, record.recordId);
        const receipt = await this.aux.get<Receipt>('supabase-workflow-receipts', receiptKey);
        // Revalidate even matching writes remotely: deleted or changed remote records cannot be certified by a cache.
        const result = await this.transport.call('workflow_upsert', {
          ...this.scope(scope), category: record.category, recordId: record.recordId,
          recordVersion: record.recordVersion, contentHash: record.contentHash, document: record.document,
          serializedDocument: workflowCanonicalJson(record.document), expectedVersion: receipt?.remoteVersion ?? null,
        });
        const parsed = z.strictObject({ applied: z.literal(true), version: uuid, contentHash: z.literal(record.contentHash) }).safeParse(result);
        if (!parsed.success) return fail('WORKFLOW_SUPABASE_WRITE_CONFLICT');
        await this.aux.put('supabase-workflow-receipts', receiptKey, { contentHash: record.contentHash, remoteVersion: parsed.data.version, syncedAt: Date.now() });
      }
      if ((await this.workflowSnapshot(scope)).logicalStateHash !== snapshot.logicalStateHash) return fail('WORKFLOW_PROJECTION_CHANGED');
      const receipt = await this.aux.get<WorkflowGenerationReceipt>('supabase-workflow-generations', key);
      const result = await this.transport.call('workflow_commit_generation', {
        ...this.scope(scope), generationId: snapshot.logicalStateHash, manifest: snapshot.manifest,
        serializedManifest: workflowCanonicalJson(snapshot.manifest), expectedVersion: receipt?.remoteVersion ?? null,
      });
      const parsed = z.strictObject({
        applied: z.literal(true), version: uuid, generationId: z.literal(snapshot.logicalStateHash),
        logicalStateHash: z.literal(snapshot.logicalStateHash), recordCount: z.literal(snapshot.records.length),
      }).safeParse(result);
      if (!parsed.success) return fail('WORKFLOW_SUPABASE_GENERATION_INVALID');
      const verified = await this.verifyWorkflowGeneration(scope, snapshot);
      if (verified.remoteVersion !== parsed.data.version) return fail('WORKFLOW_SUPABASE_GENERATION_CHANGED');
      await this.aux.put('supabase-workflow-generations', key, verified);
      return verified;
    });
    this.workflowLocks.set(key, next);
    try { return await next; } finally { if (this.workflowLocks.get(key) === next) this.workflowLocks.delete(key); }
  }
  async get(scope: MemoryScope, memoryId: string) {
    const raw = await this.transport.call('get', { ...this.scope(scope), memoryId });
    if (raw === null) return null;
    const doc = this.parse(raw, scope);
    if (doc.entry.memoryId !== memoryId) return fail('MEMORY_SUPABASE_RESPONSE_INVALID');
    return doc;
  }
  async search(scope: MemoryScope, query: string, limit: number) {
    const probes = buildRecallProbes(query).slice(0,32).map(p => `"${p.term.replaceAll('"', '')}"`);
    // OR probes keep long briefs from requiring every word in one saved memory.
    const raw = await this.transport.call('search', { ...this.scope(scope), query: probes.join(' OR ') || query, limit: Math.min(100, limit) });
    if (!Array.isArray(raw) || raw.length > Math.min(100, limit)) return fail('MEMORY_SUPABASE_RESPONSE_INVALID');
    return raw.map(r => this.parse(r, scope)).filter(r => r.entry.state !== 'tombstoned');
  }
  private async documents(scope: MemoryScope): Promise<DirectMemoryDocument[]> {
    const snapshot = await this.repo.readSnapshot({verifyContent:true});
    if (snapshot.malformedFiles.length) return fail('MEMORY_SUPABASE_VAULT_INVALID');
    const out: DirectMemoryDocument[] = [];
    for (const {entry,revisions} of await this.repo.readScopedRevisionBatch(scope,snapshot)) {
      const doc = this.parse(sanitizeStructured({ ...this.scope(scope), entry, revisions }), scope);
      if (Buffer.byteLength(JSON.stringify(doc)) > 2 * 1024 * 1024) return fail('MEMORY_SUPABASE_DOCUMENT_TOO_LARGE');
      out.push(doc);
    }
    return out;
  }
  private async *readReceipts(documents: DirectMemoryDocument[]) {
    for (let offset = 0; offset < documents.length; offset += RECEIPT_READ_BATCH_SIZE) {
      const batch = documents.slice(offset, offset + RECEIPT_READ_BATCH_SIZE).map(doc => ({ doc, key: this.receiptId(doc) }));
      if (new Set(batch.map(item => item.key)).size !== batch.length) {
        // A preceding write may replace this same receipt. Read the duplicate only
        // after the consumer has completed that write and asks for the next item.
        for (const item of batch) yield { ...item, receipt: await this.aux.get<Receipt>('supabase-direct-receipts', item.key) };
        continue;
      }
      // Drain every read before yielding, including failures. Ordered consumption
      // preserves the successful write prefix and keeps all CAS/upserts serial.
      const results = await Promise.allSettled(batch.map(async item => ({ ...item,
        receipt: await this.aux.get<Receipt>('supabase-direct-receipts', item.key),
      })));
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
        yield result.value;
      }
    }
  }
  async pending(scope?: MemoryScope) {
    const scopes = scope ? [scope] : [...new Map((await this.repo.listSegments())
      .filter(s => s.principalId.trim()).map(s => [hash([s.principalId, s.projectId]), { principalId:s.principalId, projectId:s.projectId }])).values()];
    let count = 0;
    for (const s of scopes) for await (const {doc, receipt} of this.readReceipts(await this.documents(s))) {
      if (receipt?.contentHash !== hash(doc)) count++;
    }
    return count;
  }
  async sync(scope: MemoryScope): Promise<MemoryDirectSyncReceipt> {
    const id = hash(this.scope(scope)), prior = this.locks.get(id) ?? Promise.resolve({ state:'synced' as const, pendingItems:0 });
    const next = prior.catch(() => undefined).then(async (): Promise<MemoryDirectSyncReceipt> => {
      try {
        for await (const {doc, key, receipt} of this.readReceipts(await this.documents(scope))) {
          const contentHash = hash(doc);
          if (receipt?.contentHash === contentHash) continue;
          const result = await this.transport.call('upsert', { ...this.scope(scope), document:doc, expectedVersion:receipt?.remoteVersion??null });
          const parsed = z.object({ applied:z.literal(true), version:uuid }).safeParse(result);
          if (!parsed.success) return fail('MEMORY_SUPABASE_WRITE_CONFLICT');
          await this.aux.put('supabase-direct-receipts', key, { contentHash, syncedAt:Date.now(), remoteVersion:parsed.data.version });
        }
        return { state:'synced', pendingItems:0 };
      } catch (error) {
        const errorCode = error instanceof SupabaseDirectError ? error.code : 'MEMORY_SUPABASE_SYNC_FAILED';
        return { state:'pending', pendingItems:await this.pending(scope).catch(() => -1), errorCode };
      }
    });
    this.locks.set(id, next);
    try { return await next; } finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }
}
