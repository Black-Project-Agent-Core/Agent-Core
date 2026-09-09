import { randomUUID } from 'node:crypto';
import { SupabaseDirectError, type SupabaseDirectTransport } from '../../src/memory/file-native/supabase-direct.js';
import { workflowCanonicalJson, workflowHash, type WorkflowProjectionManifest, type WorkflowProjectionRecord } from '../../src/memory/file-native/workflow-projection.js';

/** In-memory workflow RPC side of a memory fixture; SQL/RLS behavior is tested separately in PGlite. */
export class WorkflowRpcFixture {
  constructor(private readonly memoryLookup?:(principalId:string,projectId:string,memoryId:string)=>unknown){}
  readonly memoryVersions=new Map<string,unknown>();
  readonly records = new Map<string, WorkflowProjectionRecord & { version: string }>();
  readonly versions = new Map<string, WorkflowProjectionRecord>();
  readonly generations = new Map<string, WorkflowProjectionManifest>();
  readonly heads = new Map<string, { generationId: string; version: string }>();
  private fail(code: string): never { throw new SupabaseDirectError(code); }
  async call(operation: Parameters<SupabaseDirectTransport['call']>[0], payload: Record<string, unknown>): Promise<unknown> {
    const scope = JSON.stringify([payload.principalId, payload.projectId]);
    const key = `${scope}/${payload.category}/${payload.recordId}`;
    if(operation==='workflow_memory_upsert'){
      const document=structuredClone(payload.document),contentHash=String(payload.contentHash);
      if(workflowHash(document)!==contentHash||workflowCanonicalJson(document)!==payload.serializedDocument)return this.fail('WORKFLOW_MEMORY_INVALID');
      const current=this.memoryLookup?.(String(payload.principalId),String(payload.projectId),String(payload.memoryId));
      if(!current||workflowHash(current)!==contentHash)return this.fail('WORKFLOW_MEMORY_UNSYNCED');
      this.memoryVersions.set(`${scope}/${payload.memoryId}/${contentHash}`,document);return{applied:true,contentHash};
    }
    if(operation==='workflow_memory_get')return structuredClone(this.memoryVersions.get(`${scope}/${payload.memoryId}/${payload.contentHash}`)??null);
    if (operation === 'workflow_upsert') {
      const record: WorkflowProjectionRecord = {
        principalId: String(payload.principalId), projectId: String(payload.projectId),
        category: payload.category as WorkflowProjectionRecord['category'], recordId: String(payload.recordId),
        recordVersion: Number(payload.recordVersion), contentHash: String(payload.contentHash),
        document: structuredClone(payload.document) as Record<string, unknown>,
      };
      if (record.document.principalId !== payload.principalId || String(record.document.projectId ?? '') !== payload.projectId
        || workflowHash(record.document) !== record.contentHash || workflowCanonicalJson(record.document) !== payload.serializedDocument) return this.fail('WORKFLOW_RECORD_INVALID');
      const prior = this.records.get(key);
      if (prior?.contentHash === record.contentHash && prior.recordVersion === record.recordVersion) return { applied: true, version: prior.version, contentHash: record.contentHash };
      if ((prior?.version ?? null) !== (payload.expectedVersion ?? null) || prior && (prior.recordVersion > record.recordVersion
        || record.category === 'workflow-contracts' && prior.recordVersion === record.recordVersion)) return this.fail('WORKFLOW_WRITE_CONFLICT');
      const version = randomUUID();
      this.records.set(key, { ...record, version }); this.versions.set(`${key}/${record.contentHash}`, record);
      return { applied: true, version, contentHash: record.contentHash };
    }
    if (operation === 'workflow_get') return structuredClone((payload.contentHash
      ? this.versions.get(`${key}/${payload.contentHash}`) : this.records.get(key)) ?? null);
    if (operation === 'workflow_commit_generation') {
      const manifest = structuredClone(payload.manifest) as WorkflowProjectionManifest, generationId = String(payload.generationId), prior = this.heads.get(scope);
      if (manifest.principalId !== payload.principalId || manifest.projectId !== payload.projectId
        || workflowHash(manifest) !== generationId || workflowCanonicalJson(manifest) !== payload.serializedManifest) return this.fail('WORKFLOW_GENERATION_INVALID');
      if (prior?.generationId !== generationId && (prior?.version ?? null) !== (payload.expectedVersion ?? null)) return this.fail('WORKFLOW_GENERATION_CONFLICT');
      if (new Set(manifest.records.map(r => `${r.category}/${r.recordId}`)).size !== manifest.records.length) return this.fail('WORKFLOW_GENERATION_DUPLICATE');
      if (manifest.records.some(ref => {
        const record = this.records.get(`${scope}/${ref.category}/${ref.recordId}`);
        return !record || record.contentHash !== ref.contentHash || record.recordVersion !== ref.recordVersion;
      }) || [...this.records.keys()].filter(k => k.startsWith(`${scope}/`)).length !== manifest.records.length) return this.fail('WORKFLOW_GENERATION_INCOMPLETE');
      for(const memory of manifest.memories??[]){
        const current=this.memoryLookup?.(String(payload.principalId),String(payload.projectId),memory.memoryId);
        if(!current||workflowHash(current)!==memory.contentHash||!this.memoryVersions.has(`${scope}/${memory.memoryId}/${memory.contentHash}`))return this.fail('WORKFLOW_GENERATION_MEMORY_MISMATCH');
      }
      const version = prior?.generationId === generationId ? prior.version : randomUUID();
      this.generations.set(`${scope}/${generationId}`, manifest); this.heads.set(scope, { generationId, version });
      return { applied: true, generationId, logicalStateHash: generationId, version, recordCount: manifest.records.length };
    }
    if (operation === 'workflow_generation_get' || operation === 'workflow_list') {
      const head = this.heads.get(scope), generationId = String(payload.generationId ?? head?.generationId ?? '');
      const manifest = this.generations.get(`${scope}/${generationId}`);
      return manifest && head ? { generationId, logicalStateHash: generationId, manifest: structuredClone(manifest), version: head.version } : null;
    }
    return this.fail('MEMORY_OPERATION_INVALID');
  }
}
