import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { SupabaseDirectMemory, type SupabaseDirectTransport } from '../src/memory/file-native/supabase-direct.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { workflowCanonicalJson, workflowHash } from '../src/memory/file-native/workflow-projection.js';
import { WorkflowStore } from '../src/workflow/store.js';
import type { WorkflowRecord } from '../src/workflow/types.js';
import { MemoryService } from '../src/memory/service.js';
import { TaskCheckpointService, type TaskCheckpointInput } from '../src/memory/task-checkpoint.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { memoryConfig } from './helpers/memory-fixture.js';
import { acquireMemoryRecoveryLease, assertNoMemoryRecoveryPending, restoreWorkflowBackup } from '../src/memory/file-native/recovery-coordinator.js';
import { isEngineeringSourceBlob } from '../src/memory/file-native/workflow-source-projection.js';

const db = new PGlite(), roots: string[] = [];
const services:MemoryService[]=[];
beforeAll(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(await readFile('supabase/migrations/20260909_direct_memory.sql', 'utf8'));
  const sql = await readFile('supabase/migrations/20260909_workflow_durability.sql', 'utf8');
  await db.exec(sql); await db.exec(sql);
}, 30_000);
afterAll(async () => {
  for(const service of services)await service.close();
  await db.close();
  for (const root of roots) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('ac-workflow-sync-')) throw new Error('Fixture cleanup escaped temp');
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
function transport(): SupabaseDirectTransport {
  return { async call(operation, payload) {
    return db.transaction(async tx => {
      await tx.exec('set local role service_role');
      const result = await tx.query<{ value: unknown }>('select public.agent_core_memory_call($1, $2::jsonb) as value', [operation, JSON.stringify(payload)]);
      return result.rows[0]!.value;
    });
  } };
}
async function fixture(rpc = transport()) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ac-workflow-sync-')); roots.push(root);
  const paths = resolveFileNativeMemoryPaths(root), aux = new FileNativeAuxStore(paths);
  const direct = new SupabaseDirectMemory(paths, new FileNativeMemoryRepository(paths), aux, rpc, 'https://workflow.fixture');
  const scope = { principalId: randomUUID(), projectId: 'workflow-project' };
  return { root, paths, aux, direct, scope, rpc };
}
async function task(f: Awaited<ReturnType<typeof fixture>>, status = 'running') {
  const taskId = randomUUID(), record = {
    ...f.scope, taskId, title: 'Integrate a proven parser mechanism', acceptanceCriteria: [], constraints: [],
    status, priority: 0, blockers: [], createdAt: 1000, updatedAt: 1000,
  };
  await f.aux.put('continuity-tasks', taskId, record);
  return record;
}
async function bindWorkflow(f:Awaited<ReturnType<typeof fixture>>,taskId:string){
  const store=new WorkflowStore(f.aux.root,path.join(f.root,'runtime','craft','locks'));
  const scope={...f.scope,taskId};
  return store.update(scope,undefined,()=>({schemaVersion:1,...scope,version:1,stateHash:'0'.repeat(64),targetRoot:f.root,
    brief:'Inspect the parser',briefHash:workflowHash('Inspect the parser'),phase:'DISCOVERY',planRequired:false,craftRequired:false,dagRequired:false,
    blockers:[],requirements:[],donors:[],snapshots:[],receipts:[],createdAt:1000,updatedAt:1000}));
}
async function bindEngineeringSources(f:Awaited<ReturnType<typeof fixture>>,content='export const original = () => 1;\n'){
  const saved=await task(f);await bindWorkflow(f,saved.taskId);
  const sourceHash=createHash('sha256').update(content).digest('hex'),bytes=Buffer.byteLength(content),source=path.join(f.root,'src','original.ts');
  const coverage={complete:true,truncated:false,exclusions:[],gaps:[],inventoryHash:workflowHash([source,sourceHash])};
  const facilities={nodeVersion:process.version,platform:process.platform,builtins:[],dependencies:[]};
  const inventory={root:f.root,entries:[{path:source,hash:sourceHash,bytes}],coverage,facilities};
  const store=new WorkflowStore(f.aux.root,path.join(f.root,'runtime','craft','locks'));
  const record=await store.update({...f.scope,taskId:saved.taskId},undefined,current=>{
    current!.engineering={policyVersion:'engineering-v1',required:true,reason:'Retain source evidence across recovery',activatedAt:1100,evidence:[
      {id:'discovery',kind:'discovery',issuedAt:1100,data:{inventory,query:'original',matches:[],coverage,facilities}},
      {id:'impact',kind:'impact',issuedAt:1101,data:{inventory,targets:[source],symbols:[],callers:[],coverage,analysisLevel:'semantic_tsjs',limitations:[]}},
      {id:'review',kind:'review',issuedAt:1102,data:{inventory,planHash:workflowHash('plan'),planRevision:1,impactReceiptId:'impact',changedPaths:[],impactPaths:[],findings:[],truncated:false}},
    ]};return current!;
  });
  const cache=path.join(f.root,'runtime','craft','sources','blobs',`${sourceHash}.txt`);
  await mkdir(path.dirname(cache),{recursive:true});await writeFile(cache,content);
  return{saved,record,content,sourceHash,cache};
}
async function lifecycleFixture(rpc=transport()){
  const f=await fixture(rpc);f.scope.projectId='agent-core://self';
  const config=await memoryConfig(f.root,{AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED:'true',AGENT_CORE_MEMORY_SUPABASE_URL:'https://workflow.fixture',AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:'sb_secret_fixture_only'});
  const healthy=async()=>({healthy:true,checkedAt:Date.now()});
  const dependencies={supabaseDirectTransport:rpc,graphify:{health:healthy,ensureFresh:healthy,update:async()=>({nodes:0,edges:0,graphPath:path.join(f.root,'graph.json')}),scoreRelated:async()=>new Map<string,number>()}};
  const memory=new MemoryService(config,undefined,dependencies);services.push(memory);
  const routeContextId=randomUUID(),expiresAt=Date.now()+60000;
  const pre=await memory.preflight({scope:f.scope,routeContextId,task:'Inspect parser behavior',expiresAt});
  const turn=await memory.beginContinuityTurn(f.scope,routeContextId,'Inspect parser behavior',undefined,{},expiresAt);
  await memory.bindLifecycleTask(f.scope,pre.contextId,turn.taskId);await bindWorkflow(f,turn.taskId);
  const input:TaskCheckpointInput={workspaceRoot:f.root,routeContextId,memoryContextId:pre.contextId,continuityTaskId:turn.taskId,continuityTurnId:turn.turnId,
    status:'completed',summary:'Inspection completed.',projectTerminal:true,memoryDecision:{reasonCode:'TRANSIENT_OPERATION',explanation:'Only tested temporary inspection behavior.'}};
  return{...f,memory,config,dependencies,input,checkpoint:new TaskCheckpointService(memory,new WorkspacePolicy([f.root]))};
}
const recordPayload = (record: Awaited<ReturnType<SupabaseDirectMemory['workflowSnapshot']>>['records'][number], expectedVersion: string | null = null) => ({
  ...record, serializedDocument: workflowCanonicalJson(record.document), expectedVersion,
});

describe('Supabase workflow generations', () => {
  it('adds versioned workflow health without breaking semantic memory calls or exposing public roles', async () => {
    const rpc = transport();
    expect(await rpc.call('health', {})).toEqual({ schemaVersion: 1, workflowSchemaVersion: 1 });
    expect(await rpc.call('search', { principalId: randomUUID(), projectId: '', query: 'empty', limit: 10 })).toEqual([]);
    for (const role of ['anon', 'authenticated']) {
      await expect(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`); await tx.query("select public.agent_core_memory_call('health','{}'::jsonb)");
      })).rejects.toThrow('permission denied');
      await expect(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`); await tx.query('select * from public.agent_core_workflow_records');
      })).rejects.toThrow('permission denied');
    }
  });
  it('requires workflow schema only on workflow operations', async () => {
    const f = await fixture({ call: async () => ({ schemaVersion: 1 }) });
    await expect(f.direct.health()).resolves.toBeUndefined();
    await expect(f.direct.syncWorkflow(f.scope)).rejects.toThrow('WORKFLOW_SUPABASE_SCHEMA_MISSING');
  });
  it('certifies a closure with no semantic memory mutation and preserves no-memory reasons', async () => {
    const f = await fixture(), saved = await task(f, 'completed'), checkpointId = randomUUID(), contextId = randomUUID(), routeContextId = randomUUID();
    const input = { routeContextId, status: 'completed', summary: 'Only inspected the parser; no code changed.', projectTerminal: true };
    await f.aux.put('continuity-checkpoints', checkpointId, { ...f.scope, checkpointId, taskId: saved.taskId, routeContextId,
      phase: 'completed', input, stateHash: workflowHash(input), createdAt: 1100,
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'Read-only inspection produced no new reusable knowledge.' } });
    await f.aux.put('continuity-tasks', saved.taskId, { ...saved, lastCheckpointId: checkpointId, updatedAt: 1100, completedAt: 1100 });
    const decisionId = randomUUID();
    await f.aux.put('write-decisions', decisionId, { ...f.scope, id: decisionId, routeContextId, continuityTaskId: saved.taskId, contextId,
      decisionType: 'NO_DURABLE_MEMORY', candidateHash: workflowHash(null), existingMemoryIds: [],
      reasonCodes: ['TRANSIENT_OPERATION'], evidenceRefs: [], relationPlan: [], rootReason: 'Read-only inspection.', createdAt: 1100, appliedAt: 1101 });
    const result = await f.direct.syncWorkflow(f.scope);
    expect(result).toMatchObject({ state: 'synced', recordCount: 3 });
    expect(await f.direct.pending(f.scope)).toBe(0);
    expect((await f.direct.readWorkflowBackup(f.scope))?.snapshot.records.find(r => r.category === 'write-decisions')?.document.decisionType).toBe('NO_DURABLE_MEMORY');
    await expect(f.direct.verifyWorkflowGeneration(f.scope)).resolves.toEqual(result);
  });
  it('excludes lease and receipt churn while preserving substantive lifecycle changes', async () => {
    const f = await fixture(), saved = await task(f), contextId = randomUUID();
    const lifecycle = { ...f.scope, contextId, routeContextId: randomUUID(), continuityTaskId: saved.taskId, objectiveHash: workflowHash('parser'),
      postflightState: 'CLOSED', meaningfulWorkCount: 1, createdAt: 1000, updatedAt: 1200, expiresAt: 8000, lastMeaningfulAt: 1100,
      postflightAppliedAt: 1150, closedAt: 1200 };
    await f.aux.put('lifecycles', contextId, lifecycle);
    await f.aux.put('contexts', contextId, { secret: 'excluded raw lease contents' });
    await f.aux.put('remote-state', 'remote', { logicalStateHash: 'ignored' });
    const first = await f.direct.syncWorkflow(f.scope);
    await f.aux.put('lifecycles', contextId, { ...lifecycle, updatedAt: 9999, expiresAt: 99999, localDurableGeneration: first.generationId, localDurableHash: first.logicalStateHash });
    expect((await f.direct.workflowSnapshot(f.scope)).logicalStateHash).toBe(first.logicalStateHash);
    expect((await f.direct.readWorkflowBackup(f.scope))?.snapshot.records.find(r => r.category === 'lifecycles')?.document).not.toHaveProperty('expiresAt');
    await f.aux.put('lifecycles', contextId, { ...lifecycle, meaningfulWorkCount: 2, lastMeaningfulAt: 1250 });
    await expect(f.direct.verifyWorkflowGeneration(f.scope)).rejects.toThrow('GENERATION_MISMATCH');
  });
  it('retains immutable prior generations and rejects stale compare-and-swap writes', async () => {
    const f = await fixture(), saved = await task(f);
    const first = await f.direct.syncWorkflow(f.scope), old = (await f.direct.workflowSnapshot(f.scope)).records[0]!;
    const remote = await f.direct.getWorkflowRecord(f.scope, old.category, old.recordId);
    await f.aux.put('continuity-tasks', saved.taskId, { ...saved, status: 'blocked', updatedAt: 2000 });
    const second = await f.direct.syncWorkflow(f.scope);
    expect(second.generationId).not.toBe(first.generationId);
    await expect(f.rpc.call('workflow_upsert', recordPayload(old, remote!.remoteVersion!))).rejects.toThrow('WORKFLOW_WRITE_CONFLICT');
    expect((await f.direct.readWorkflowBackup(f.scope, first.generationId))?.snapshot.records[0]?.document.status).toBe('running');
    expect((await f.direct.readWorkflowBackup(f.scope, second.generationId))?.snapshot.records[0]?.document.status).toBe('blocked');
  });
  it('fails closed on a malformed required record and dangling closure references', async () => {
    const f = await fixture(), saved = await task(f);
    await writeFile(path.join(f.aux.root, 'continuity-tasks', `${saved.taskId}.json`), '{broken');
    await expect(f.direct.syncWorkflow(f.scope)).rejects.toThrow('WORKFLOW_PROJECTION_RECORD_INVALID');
    await f.aux.put('continuity-tasks', saved.taskId, { ...saved, lastCheckpointId: randomUUID() });
    await expect(f.direct.syncWorkflow(f.scope)).rejects.toThrow('WORKFLOW_PROJECTION_CHECKPOINT_MISSING');
  });
  it('validates scoped source evidence metadata without copying source cache bytes', async () => {
    const f = await fixture(), saved = await task(f), store = new WorkflowStore(f.aux.root, path.join(f.root, 'runtime', 'craft', 'locks'));
    const workflowScope = { ...f.scope, taskId: saved.taskId };
    const record = {
      schemaVersion: 1, ...workflowScope, version: 1, stateHash: '0'.repeat(64), targetRoot: f.root, brief: 'Transplant parser', briefHash: workflowHash('brief'),
      phase: 'DISCOVERY', planRequired: true, craftRequired: true, dagRequired: true,
      blockers: [], requirements: [{ id: 'parser', description: 'Parse supported records.' }], donors: [{ id: 'donor', source: 'https://example.test/parser.git' }],
      snapshots: [], receipts: [], createdAt: 1000, updatedAt: 1000,
    };
    await store.update(workflowScope, undefined, () => record as WorkflowRecord);
    await mkdir(path.join(f.root, 'runtime', 'craft', 'sources'), { recursive: true });
    await writeFile(path.join(f.root, 'runtime', 'craft', 'sources', 'source.txt'), 'raw donor implementation must remain local');
    const sync = await f.direct.syncWorkflow(f.scope), backup = await f.direct.readWorkflowBackup(f.scope);
    expect(sync.recordCount).toBe(2);
    expect(backup?.snapshot.records.some(r => r.category === 'workflow-contracts')).toBe(true);
    expect(JSON.stringify(backup)).not.toContain('raw donor implementation');
  });
  it('persists referenced engineering baseline bytes once and restores their cache without changing contract hashes',async()=>{
    const f=await fixture(),source=await bindEngineeringSources(f);
    const before=await f.direct.workflowSnapshot(f.scope);
    const blobs=before.records.filter(record=>isEngineeringSourceBlob(record.document));
    expect(blobs).toHaveLength(1);expect(blobs[0]!.document.content).toBe(source.content);
    const contract=before.records.find(record=>record.category==='workflow-contracts'&&!isEngineeringSourceBlob(record.document))!;
    expect(contract.document.stateHash).toBe(source.record.stateHash);
    await f.direct.syncWorkflow(f.scope);const backup=(await f.direct.readWorkflowBackup(f.scope))!;
    const fresh=await fixture(f.rpc);fresh.scope=f.scope;
    const lease=await acquireMemoryRecoveryLease(fresh.paths,'recovery');
    try{await restoreWorkflowBackup(fresh.paths,backup);}finally{await lease.release();}
    expect(await readFile(path.join(fresh.root,'runtime','craft','sources','blobs',`${source.sourceHash}.txt`),'utf8')).toBe(source.content);
    const after=await fresh.direct.workflowSnapshot(f.scope);
    expect(after.logicalStateHash).toBe(before.logicalStateHash);
    expect(after.records.find(record=>record.recordId===contract.recordId)?.document).toEqual(contract.document);
    await expect(assertNoMemoryRecoveryPending(fresh.paths)).resolves.toBeUndefined();
  });
  it('fails closed for missing or corrupted referenced engineering source bytes',async()=>{
    const f=await fixture(),source=await bindEngineeringSources(f);
    await rm(source.cache);
    await expect(f.direct.workflowSnapshot(f.scope)).rejects.toThrow('WORKFLOW_SOURCE_PROJECTION_MISSING');
    await writeFile(source.cache,'different bytes');
    await expect(f.direct.workflowSnapshot(f.scope)).rejects.toThrow('WORKFLOW_SOURCE_PROJECTION_HASH_INVALID');
  });
  it('enforces the serialized two MiB projection limit instead of truncating captured source',async()=>{
    const f=await fixture();await bindEngineeringSources(f,'\t'.repeat(1_100_000));
    await expect(f.direct.workflowSnapshot(f.scope)).rejects.toThrow('WORKFLOW_PROJECTION_RECORD_TOO_LARGE');
  });
  it('leaves recovery pending when the immutable destination cache conflicts, then resumes without creating evidence',async()=>{
    const f=await fixture(),source=await bindEngineeringSources(f);await f.direct.syncWorkflow(f.scope);
    const backup=(await f.direct.readWorkflowBackup(f.scope))!,fresh=await fixture(f.rpc);fresh.scope=f.scope;
    const cache=path.join(fresh.root,'runtime','craft','sources','blobs',`${source.sourceHash}.txt`);
    await mkdir(path.dirname(cache),{recursive:true});await writeFile(cache,'corrupt pre-existing cache');
    const lease=await acquireMemoryRecoveryLease(fresh.paths,'recovery');
    try{
      await expect(restoreWorkflowBackup(fresh.paths,backup)).rejects.toThrow('MEMORY_RECOVERY_SOURCE_CONFLICT');
      await expect(assertNoMemoryRecoveryPending(fresh.paths)).rejects.toThrow('MEMORY_RECOVERY_PENDING');
      await rm(cache);await restoreWorkflowBackup(fresh.paths,backup);
    }finally{await lease.release();}
    expect(await readFile(cache,'utf8')).toBe(source.content);
    expect((await fresh.direct.workflowSnapshot(f.scope)).logicalStateHash).toBe(backup.generation.logicalStateHash);
    await expect(assertNoMemoryRecoveryPending(fresh.paths)).resolves.toBeUndefined();
  });
  it('rejects forged hashes, omitted records and cross-scope responses', async () => {
    const f = await fixture(); await task(f);
    const snapshot = await f.direct.workflowSnapshot(f.scope), record = snapshot.records[0]!;
    await expect(f.rpc.call('workflow_upsert', { ...recordPayload(record), contentHash: '0'.repeat(64) })).rejects.toThrow('WORKFLOW_RECORD_INVALID');
    await f.direct.syncWorkflow(f.scope);
    const omitted = { ...snapshot.manifest, records: [] };
    await expect(f.rpc.call('workflow_commit_generation', { ...f.scope, manifest: omitted, serializedManifest: workflowCanonicalJson(omitted), generationId: workflowHash(omitted) })).rejects.toThrow('WORKFLOW_GENERATION_CONFLICT');
    const other = { ...f.scope, principalId: randomUUID() };
    expect(await f.direct.listWorkflowRecords(other)).toBeNull();
    expect(await f.direct.getWorkflowRecord(other, record.category, record.recordId)).toBeNull();
    const raw = await f.rpc.call('workflow_get', { ...f.scope, category: record.category, recordId: record.recordId });
    const hostile = await fixture({ call: async () => raw });
    await expect(hostile.direct.getWorkflowRecord(other, record.category, record.recordId)).rejects.toThrow('SCOPE_MISMATCH');
  });
  it('recovers an uncertain commit reply idempotently without another task or version', async () => {
    const base = transport(); let interrupt = true;
    const f = await fixture({ async call(operation, payload) {
      const result = await base.call(operation, payload);
      if (operation === 'workflow_commit_generation' && interrupt) { interrupt = false; throw new Error('lost response'); }
      return result;
    } });
    await task(f);
    await expect(f.direct.syncWorkflow(f.scope)).rejects.toThrow('lost response');
    const committed = await f.direct.readWorkflowBackup(f.scope);
    expect(await f.direct.syncWorkflow(f.scope)).toEqual(committed?.generation);
  });
  it('refuses a commit when local records change during upload', async () => {
    const base = transport(); let mutate: (() => Promise<void>) | undefined;
    const f = await fixture({ async call(operation, payload) {
      const result = await base.call(operation, payload);
      if (operation === 'workflow_upsert' && mutate) { const update = mutate; mutate = undefined; await update(); }
      return result;
    } });
    const saved = await task(f);
    mutate = async () => { await f.aux.put('continuity-tasks', saved.taskId, { ...saved, updatedAt: 2000, status: 'blocked' }); };
    await expect(f.direct.syncWorkflow(f.scope)).rejects.toThrow('WORKFLOW_PROJECTION_CHANGED');
    expect(await f.direct.listWorkflowRecords(f.scope)).toBeNull();
    await expect(f.direct.syncWorkflow(f.scope)).resolves.toMatchObject({ state: 'synced', recordCount: 1 });
  });
  it('does not accept an incomplete generation even with a valid head CAS token', async () => {
    const f = await fixture(); await task(f);
    const initial = await f.direct.syncWorkflow(f.scope), snapshot = await f.direct.workflowSnapshot(f.scope);
    const manifest = { ...snapshot.manifest, records: [] };
    await expect(f.rpc.call('workflow_commit_generation', { ...f.scope, manifest, serializedManifest: workflowCanonicalJson(manifest),
      generationId: workflowHash(manifest), expectedVersion: initial.remoteVersion })).rejects.toThrow('WORKFLOW_GENERATION_INCOMPLETE');
  });
  it('rejects corrupted remote record bodies before returning restoration data', async () => {
    const base = transport(); let corrupt = false;
    const f = await fixture({ async call(operation, payload) {
      const result = await base.call(operation, payload);
      if (operation === 'workflow_get' && corrupt && result) {
        const copy = structuredClone(result) as { document: Record<string, unknown> };
        copy.document.title = 'A fabricated replacement'; return copy;
      }
      return result;
    } });
    await task(f); await f.direct.syncWorkflow(f.scope); corrupt = true;
    await expect(f.direct.readWorkflowBackup(f.scope)).rejects.toThrow('WORKFLOW_SUPABASE_RECORD_INVALID');
  });
  it('includes verified semantic document bytes in a workflow generation and retains older revisions',async()=>{
    const f=await fixture(),repo=new FileNativeMemoryRepository(f.paths);await task(f);
    const saved=await repo.commit({scope:f.scope,canonicalKey:'decision:parser',kind:'decision',value:'Parse delimiter records consistently.'});
    await expect(f.direct.syncWorkflow(f.scope)).rejects.toThrow('WORKFLOW_MEMORY_UNSYNCED');
    await f.direct.sync(f.scope);const first=await f.direct.syncWorkflow(f.scope);
    const backup=await f.direct.readWorkflowBackup(f.scope);
    expect(backup?.snapshot.manifest.memories).toHaveLength(1);expect(backup?.memoryDocuments[0]?.entry.memoryId).toBe(saved.memoryId);
    await repo.revise({scope:f.scope,memoryId:saved.memoryId,value:'Parse delimiter records and preserve empty fields.'});await f.direct.sync(f.scope);
    const second=await f.direct.syncWorkflow(f.scope);expect(second.generationId).not.toBe(first.generationId);
    expect((await f.direct.readWorkflowBackup(f.scope,first.generationId))?.memoryDocuments[0]?.entry.revisionNo).toBe(1);
    expect((await f.direct.readWorkflowBackup(f.scope,second.generationId))?.memoryDocuments[0]?.entry.revisionNo).toBe(2);
  });
  it('rejects current semantic remote drift even when its immutable generation remains intact',async()=>{
    const base=transport();let drift=false;
    const f=await fixture({async call(operation,payload){
      const result=await base.call(operation,payload);
      if(drift&&operation==='get'&&result){
        const changed=structuredClone(result) as {entry:{valueText:string}};
        changed.entry.valueText='Unrelated changed remote value';return changed;
      }
      return result;
    }});
    await task(f);await new FileNativeMemoryRepository(f.paths).commit({scope:f.scope,canonicalKey:'decision:remote-drift',kind:'decision',value:'Keep the verified parser behavior.'});
    await f.direct.sync(f.scope);const receipt=await f.direct.syncWorkflow(f.scope);drift=true;
    expect((await f.direct.readWorkflowBackup(f.scope))?.generation.generationId).toBe(receipt.generationId);
    await expect(f.direct.verifyWorkflowGeneration(f.scope)).rejects.toThrow('MEMORY_SUPABASE_DOCUMENT_MISMATCH');
  });
  it('keeps a failed closure pending and retries the same checkpoint after restart',async()=>{
    const base=transport();let fail=false;
    const rpc:SupabaseDirectTransport={async call(operation,payload){if(fail&&operation==='workflow_commit_generation')throw new Error('fixture unavailable');return base.call(operation,payload);}};
    const f=await lifecycleFixture(rpc);fail=true;
    await expect(f.checkpoint.checkpointForScope(f.scope,f.input)).rejects.toMatchObject({code:'MEMORY_POSTFLIGHT_REQUIRED'});
    expect(await f.memory.getLifecycleContext(f.scope,f.input.memoryContextId)).toMatchObject({postflightState:'POSTFLIGHT_PENDING'});
    expect(await f.aux.list('continuity-tasks')).toHaveLength(1);expect(await f.aux.list('continuity-checkpoints')).toHaveLength(1);expect(await f.aux.list('write-decisions')).toHaveLength(1);
    const pendingCheckpoint=(await f.aux.list<{checkpointId:string}>('continuity-checkpoints'))[0]!;
    expect(await f.memory.workflowClosureStatus(f.scope,f.input.continuityTaskId!,pendingCheckpoint.checkpointId)).toEqual({state:'pending'});
    await f.memory.close();fail=false;
    const restarted=new MemoryService(f.config,undefined,f.dependencies);services.push(restarted);
    const checkpoint=new TaskCheckpointService(restarted,new WorkspacePolicy([f.root]));
    const completed=await checkpoint.checkpointForScope(f.scope,f.input);
    expect(completed.memoryLifecycle).toMatchObject({durabilityState:'DURABLY_CLOSED',postflightState:'CLOSED'});
    expect(await restarted.workflowClosureStatus(f.scope,f.input.continuityTaskId!,completed.checkpointId)).toMatchObject({state:'synced',logicalStateHash:(completed.remoteDurability as any).logicalStateHash});
    expect(await restarted.workflowClosureStatus(f.scope,f.input.continuityTaskId!,randomUUID())).toEqual({state:'open'});
    expect(await f.aux.list('continuity-tasks')).toHaveLength(1);expect(await f.aux.list('continuity-checkpoints')).toHaveLength(1);expect(await f.aux.list('write-decisions')).toHaveLength(1);
    await expect(f.direct.verifyWorkflowGeneration(f.scope)).resolves.toMatchObject({logicalStateHash:(completed.remoteDurability as any).logicalStateHash});
  });
  it('refuses stale head certification after local durable markers were written',async()=>{
    const base=transport();let stale=false;
    const rpc:SupabaseDirectTransport={async call(operation,payload){const result=await base.call(operation,payload);
      if(stale&&operation==='workflow_generation_get'&&result){return{...(result as object),version:randomUUID()};}return result;}};
    const f=await lifecycleFixture(rpc);await f.checkpoint.checkpointForScope(f.scope,f.input);
    const boundary=await f.memory.syncDurableBoundary(f.scope,'continuity_terminal');if(!boundary.required)throw new Error('Boundary missing');stale=true;
    await expect(f.memory.markLifecycleDurableClosure({scope:f.scope,contextId:f.input.memoryContextId,generationId:boundary.generationId,logicalStateHash:boundary.logicalStateHash})).rejects.toMatchObject({code:'MEMORY_POSTFLIGHT_REQUIRED'});
    const lifecycle=await f.memory.getLifecycleContext(f.scope,f.input.memoryContextId);expect(lifecycle?.postflightState).toBe('POSTFLIGHT_PENDING');expect(lifecycle?.localDurableGeneration).toBeUndefined();
  });
  it('restores verified task and memory state with expired leases without creating new evidence',async()=>{
    const f=await lifecycleFixture();
    const saved=await f.memory.commit({scope:f.scope,canonicalKey:'decision:recover-parser',kind:'decision',value:'Preserve empty delimiter fields.'});
    await f.memory.revise({scope:f.scope,memoryId:saved.memoryId,value:'Preserve empty delimiter fields and escaped quotes.'});
    await f.checkpoint.checkpointForScope(f.scope,f.input);const backup=await f.direct.readWorkflowBackup(f.scope);expect(backup).not.toBeNull();
    const fresh=await fixture(f.rpc);fresh.scope=f.scope;
    const config=await memoryConfig(fresh.root,{AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED:'true',AGENT_CORE_MEMORY_SUPABASE_URL:'https://workflow.fixture',AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:'sb_secret_fixture_only'});
    const memory=new MemoryService(config,undefined,f.dependencies);services.push(memory);
    expect(await memory.hydrateRemote(f.scope)).toMatchObject({state:'WORKFLOW_MEMORY_HYDRATED',recordCount:backup!.snapshot.records.length,memoryCount:1});
    expect(await memory.getLifecycleContext(f.scope,f.input.memoryContextId)).toMatchObject({expiresAt:0,postflightState:'CLOSED',localDurableGeneration:'supabase-workflow-v1:'+backup!.generation.generationId,localDurableHash:backup!.generation.logicalStateHash});
    expect(await memory.getContext(f.scope,f.input.memoryContextId)).toBeNull();
    expect((await memory.getWithProvenance(f.scope,saved.memoryId))?.revisions).toHaveLength(2);
    const restored=await fresh.direct.workflowSnapshot(f.scope);expect(restored.logicalStateHash).toBe(backup!.generation.logicalStateHash);
    expect(restored.records.find(r=>r.category==='workflow-contracts')?.document).not.toHaveProperty('verification');
    expect(await fresh.direct.pending(f.scope)).toBe(0);
    const nextRoute=randomUUID(),nextExpiry=Date.now()+60000;
    const preflight=await memory.preflight({scope:f.scope,routeContextId:nextRoute,task:'Inspect recovered parser history',expiresAt:nextExpiry});
    const nextTurn=await memory.beginContinuityTurn(f.scope,nextRoute,'Inspect recovered parser history',undefined,{},nextExpiry);
    await memory.bindLifecycleTask(f.scope,preflight.contextId,nextTurn.taskId);
    await bindWorkflow({...fresh,scope:f.scope},nextTurn.taskId);
    await memory.revise({scope:f.scope,memoryId:saved.memoryId,value:'Preserve empty delimiter fields, escaped quotes, and the validated revision chain.'});
    const nextCheckpoint=new TaskCheckpointService(memory,new WorkspacePolicy([fresh.root]));
    const closed=await nextCheckpoint.checkpointForScope(f.scope,{...f.input,workspaceRoot:fresh.root,routeContextId:nextRoute,memoryContextId:preflight.contextId,continuityTaskId:nextTurn.taskId,continuityTurnId:nextTurn.turnId});
    expect(closed.memoryLifecycle).toMatchObject({durabilityState:'DURABLY_CLOSED'});
    expect((await fresh.direct.get(f.scope,saved.memoryId))?.entry.revisionNo).toBe(3);
    await expect(fresh.direct.verifyWorkflowGeneration(f.scope)).resolves.toMatchObject({state:'synced'});
    await expect(memory.hydrateRemote(f.scope)).rejects.toThrow('REQUIRES_IDLE_SERVICE');
  });
  it('prevents recovery beside a live backend and resumes interrupted atomic publication',async()=>{
    const f=await fixture();await task(f);await f.direct.syncWorkflow(f.scope);const backup=(await f.direct.readWorkflowBackup(f.scope))!;
    const fresh=await fixture();
    const reader=await acquireMemoryRecoveryLease(fresh.paths,'reader');
    await expect(acquireMemoryRecoveryLease(fresh.paths,'recovery')).rejects.toThrow('REQUIRES_STOPPED_RUNTIME');await reader.release();
    const exclusive=await acquireMemoryRecoveryLease(fresh.paths,'recovery');
    await expect(acquireMemoryRecoveryLease(fresh.paths,'reader')).rejects.toThrow('MEMORY_RECOVERY_ACTIVE');
    await expect(restoreWorkflowBackup(fresh.paths,backup,{afterOldMoved:async()=>{throw new Error('interrupted after rename');}})).rejects.toThrow('interrupted after rename');
    await expect(assertNoMemoryRecoveryPending(fresh.paths)).rejects.toThrow('MEMORY_RECOVERY_PENDING');await exclusive.release();
    const resumed=await acquireMemoryRecoveryLease(fresh.paths,'recovery');
    const result=await restoreWorkflowBackup(fresh.paths,backup);expect(result.recordCount).toBe(1);
    await expect(assertNoMemoryRecoveryPending(fresh.paths)).resolves.toBeUndefined();await resumed.release();
    expect((await fresh.direct.workflowSnapshot(f.scope)).logicalStateHash).toBe(backup.generation.logicalStateHash);
  });
  it('preserves local semantic records when an older generation omits them',async()=>{
    const f=await fixture();await task(f);await f.direct.syncWorkflow(f.scope);const backup=(await f.direct.readWorkflowBackup(f.scope))!;
    const fresh=await fixture(),repo=new FileNativeMemoryRepository(fresh.paths);
    const local=await repo.commit({scope:f.scope,canonicalKey:'decision:local-only',kind:'decision',value:'Keep this local decision intact.'});
    const lease=await acquireMemoryRecoveryLease(fresh.paths,'recovery');
    try{await expect(restoreWorkflowBackup(fresh.paths,backup)).rejects.toThrow('MEMORY_RECOVERY_LOCAL_CONFLICT');}finally{await lease.release();}
    expect((await repo.findEntry(f.scope,local.memoryId))?.entry.valueText).toBe('Keep this local decision intact.');
    expect(await fresh.aux.list('continuity-tasks')).toHaveLength(0);
    await expect(assertNoMemoryRecoveryPending(fresh.paths)).resolves.toBeUndefined();
  });
});
