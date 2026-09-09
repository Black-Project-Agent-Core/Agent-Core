import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryService } from '../src/memory/service.js';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import { SupabaseDirectError, SupabaseDirectHttpTransport, type SupabaseDirectTransport } from '../src/memory/file-native/supabase-direct.js';
import { normalizeMemoryValue } from '../src/memory/record-types.js';
import { redactMemoryText } from '../src/memory/redaction.js';

const env = {
  AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE:'advisory',
  AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED:'true',
  AGENT_CORE_MEMORY_SUPABASE_URL:'https://fixture.supabase.co',
  AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:'sb_secret_fixture_only',
};
const roots:string[]=[];
const db = new PGlite();
beforeAll(async()=>{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const sql=await readFile('supabase/migrations/20260909_direct_memory.sql','utf8');
  await db.exec(sql); await db.exec(sql); // the migration is safe to apply again
},30_000);
afterAll(async()=>{
  await db.close();
  for(const root of roots){
    const resolved=path.resolve(root);
    if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('ac-direct-test-'))throw new Error('Fixture cleanup escaped temp');
    await rm(root,{recursive:true,force:true,maxRetries:3});
  }
});
function sqlTransport():SupabaseDirectTransport {
  return {async call(operation,payload){
    return db.transaction(async tx=>{
      await tx.exec('set local role service_role');
      const result=await tx.query<{value:unknown}>('select public.agent_core_memory_call($1, $2::jsonb) as value',[operation,JSON.stringify(payload)]);
      return result.rows[0].value;
    });
  }};
}
async function fixture(transport:SupabaseDirectTransport=sqlTransport()){
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-direct-test-'));roots.push(root);
  const config=loadConfig(env,root).memory;
  await mkdir(config.fileNative.ripgrepRoot,{recursive:true});
  const exe=process.platform==='win32'?'rg.exe':'rg';
  await copyFile(path.resolve('.tools','ripgrep',exe),path.join(config.fileNative.ripgrepRoot,exe));
  return{root,config,service:new MemoryService(config,undefined,{supabaseDirectTransport:transport})};
}
const newScope=()=>({principalId:randomUUID(),projectId:'project-supabase'});

describe('direct Supabase memory through PostgreSQL RPC',()=>{
  it('saves useful postflight knowledge and supports an explicitly global scope',async()=>{
    const scope={principalId:randomUUID()},writer=await fixture();
    const result=await writer.service.applyPostflight({scope,routeContextId:randomUUID(),
      candidate:{canonicalKey:'decision:daily-ledger',kind:'decision',value:'Daily ledger reconciliation detects missing entries.'},
      reasonCodes:['FRESH_DURABLE_CONTEXT'],evidenceRefs:['fixture:verified-ledger'],rootReason:'Reusable verified operating decision',
    });
    expect(result.semanticMutation).toBe(true);
    expect(result.supabaseSync).toMatchObject({state:'synced',pendingItems:0});
    const reader=await fixture();
    expect((await reader.service.search({scope,query:'daily ledger'})).hits.map(h=>h.memoryId)).toContain(result.memoryId);
  });
  it('recalls a remote guardrail into preflight decisions and reads revisions across sessions',async()=>{
    const scope=newScope(),writer=await fixture();
    const committed=await writer.service.commit({scope,canonicalKey:'guardrail:artifacts',kind:'guardrail',enforcement:'hard',value:'Keep build artifacts on drive F.'});
    expect(committed.supabaseSync).toEqual({state:'synced',pendingItems:0});
    const reader=await fixture();
    const pre=await reader.service.preflight({scope,routeContextId:randomUUID(),task:'Build artifacts',expiresAt:Date.now()+60000});
    expect(pre.recalled).toEqual(expect.arrayContaining([expect.objectContaining({memoryId:committed.memoryId,source:'supabase'})]));
    expect(pre.blocking.blocked).toBe(true);
    expect(pre.blocking.guardrailMemoryIds).toContain(committed.memoryId);
    const retrieved=await reader.service.getWithProvenance(scope,committed.memoryId);
    expect(retrieved?.memory.valueText).toContain('drive F');
    expect(retrieved?.revisions).toHaveLength(1);
    const context=await reader.service.getContext(scope,pre.contextId);
    expect(JSON.parse(context!.resultJson).blocking.blocked).toBe(true);
  });
  it('expands a vague brief with query even when initial recall is empty',async()=>{
    const scope=newScope(),writer=await fixture();
    const root=await writer.service.commit({scope,canonicalKey:'decision:billing',kind:'decision',value:'Billing reconciliation uses a ledger and weekly checkpoints.'});
    const reader=await fixture();
    const pre=await reader.service.preflight({scope,routeContextId:randomUUID(),task:'Continue the unspecified work',expiresAt:Date.now()+60000});
    expect(pre.recalled).toEqual([]);
    const more=await reader.service.rememberMore({scope,contextId:pre.contextId,seedMemoryIds:[],query:'billing ledger',reason:'user_requested'});
    expect(more.expansions.map(e=>e.memoryId)).toContain(root.memoryId);
    expect(await reader.service.listRecallExpansions(scope,pre.contextId)).toEqual(expect.arrayContaining([expect.objectContaining({targetMemoryId:root.memoryId,reasonCode:'query_context'})]));
    const aux=new FileNativeAuxStore(reader.config.fileNative),context=await reader.service.getContext(scope,pre.contextId);
    await aux.put('contexts',pre.contextId,{...context,expiresAt:Date.now()-1});
    await expect(reader.service.rememberMore({scope,contextId:pre.contextId,seedMemoryIds:[],query:'ledger',reason:'user_requested'})).rejects.toThrow('CONTEXT_NOT_FOUND');
  });
  it('expands remote revision history and relations within budgets',async()=>{
    const scope=newScope(),writer=await fixture();
    const cause=await writer.service.commit({scope,canonicalKey:'failure:billing',kind:'failure',value:'Ledger reconciliation failed without checkpoints.'});
    const fix=await writer.service.commit({scope,canonicalKey:'decision:billing',kind:'decision',value:'Reconcile the billing ledger weekly.',explicitRelations:[{targetMemoryId:cause.memoryId,relation:'resolved_by'}]});
    await writer.service.revise({scope,memoryId:fix.memoryId,value:'Reconcile the billing ledger daily.'});
    const reader=await fixture();
    const pre=await reader.service.preflight({scope,routeContextId:randomUUID(),task:'Billing ledger',expiresAt:Date.now()+60000});
    const more=await reader.service.rememberMore({scope,contextId:pre.contextId,seedMemoryIds:[fix.memoryId],reason:'causal_history',maxItems:4,characterBudget:200});
    expect(more.expansions.some(e=>e.historicalRevision&&e.valueText.includes('weekly'))).toBe(true);
    expect(more.expansions.some(e=>e.memoryId===cause.memoryId)).toBe(true);
    expect(more.characterBudgetConsumed).toBeLessThanOrEqual(200);
  });
  it('isolates principal and project for SQL search/get and rejects mismatched responses',async()=>{
    const scope=newScope(),writer=await fixture();
    const saved=await writer.service.commit({scope,canonicalKey:'decision:isolated',kind:'decision',value:'Private lunar ledger context.'});
    const reader=await fixture();
    for(const other of [{...scope,principalId:randomUUID()},{...scope,projectId:'other-project'}]){
      expect((await reader.service.search({scope:other,query:'lunar ledger'})).hits).toEqual([]);
      expect(await reader.service.getMemory(other,saved.memoryId)).toBeNull();
    }
    const rpc=sqlTransport();
    const doc=await rpc.call('get',{...scope,memoryId:saved.memoryId});
    const hostile=await fixture({call:async()=>doc});
    await expect(hostile.service.getMemory({...scope,principalId:randomUUID()},saved.memoryId)).rejects.toThrow('SCOPE_MISMATCH');
    await expect(reader.service.rememberMore({scope:{...scope,principalId:'other'},contextId:randomUUID(),seedMemoryIds:[saved.memoryId],reason:'user_requested'})).rejects.toThrow('CONTEXT_NOT_FOUND');
  });
  it('keeps failed writes pending and retries after restart without a new revision',async()=>{
    const scope=newScope(),rpc=sqlTransport();let offline=true;
    const transport:SupabaseDirectTransport={call:async(op,payload)=>{
      if(offline)throw new SupabaseDirectError('MEMORY_SUPABASE_NETWORK_ERROR');
      return rpc.call(op,payload);
    }};
    const writer=await fixture(transport);
    const saved=await writer.service.commit({scope,canonicalKey:'decision:retry',kind:'decision',value:'Retry ledger sync without repeating work.'});
    expect(saved.supabaseSync).toEqual({state:'pending',pendingItems:1,errorCode:'MEMORY_SUPABASE_NETWORK_ERROR'});
    expect((await writer.service.status(scope)).supabaseDirect).toMatchObject({healthy:false,pendingItems:1});
    await expect(writer.service.preflight({scope,routeContextId:randomUUID(),task:'ledger sync',expiresAt:Date.now()+60000})).rejects.toThrow('NETWORK_ERROR');
    await expect(writer.service.syncDurableBoundary(scope,'continuity_terminal')).rejects.toThrow('NETWORK_ERROR');
    await writer.service.close();offline=false;
    const restarted=new MemoryService(writer.config,undefined,{supabaseDirectTransport:transport});
    expect(await restarted.syncDirectMemory(scope)).toEqual({state:'synced',pendingItems:0});
    expect((await restarted.getMemory(scope,saved.memoryId))?.revisionNo).toBe(1);
    expect((await restarted.status(scope)).supabaseDirect).toMatchObject({healthy:true,pendingItems:0});
    expect((await restarted.syncDurableBoundary(scope,'continuity_terminal')).state).toBe('REMOTE_SYNCED');
  });
  it('propagates tombstones and refuses stale or duplicate canonical writes',async()=>{
    const scope=newScope(),writer=await fixture(),rpc=sqlTransport();
    const saved=await writer.service.commit({scope,canonicalKey:'decision:tombstone',kind:'decision',value:'Obsolete ledger strategy.'});
    const old=await rpc.call('get',{...scope,memoryId:saved.memoryId});
    await writer.service.revise({scope,memoryId:saved.memoryId,value:'Current ledger strategy.'});
    await expect(rpc.call('upsert',{...scope,document:old})).rejects.toThrow('MEMORY_WRITE_CONFLICT');
    await writer.service.forget(scope,saved.memoryId,'No longer useful');
    const reader=await fixture();
    expect((await reader.service.search({scope,query:'ledger strategy'})).hits).toEqual([]);
    expect((await reader.service.getMemory(scope,saved.memoryId))?.state).toBe('tombstoned');
    const duplicate=structuredClone(old) as any;duplicate.entry.memoryId=randomUUID();
    await expect(rpc.call('upsert',{...scope,document:duplicate})).rejects.toThrow();
  });
  it('allows healthy empty vaults and denies SQL access to public roles',async()=>{
    const empty=await fixture(),scope=newScope();
    expect((await empty.service.status(scope)).supabaseDirect).toMatchObject({healthy:true,pendingItems:0});
    expect((await empty.service.search({scope,query:'absent memory'})).hits).toEqual([]);
    for(const role of ['anon','authenticated']){
      await expect(db.transaction(async tx=>{
        await tx.exec(`set local role ${role}`);
        await tx.query("select public.agent_core_memory_call('health', '{}'::jsonb)");
      })).rejects.toThrow('permission denied');
      await expect(db.transaction(async tx=>{
        await tx.exec(`set local role ${role}`);await tx.query('select * from public.agent_core_memory_records');
      })).rejects.toThrow('permission denied');
    }
  });
});

describe('Supabase credentials and HTTP boundary',()=>{
  it('requires server credentials only when enabled and rejects public keys',()=>{
    expect(loadConfig({},os.tmpdir()).memory.supabaseDirect.enabled).toBe(false);
    expect(()=>loadConfig({...env,AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:''},os.tmpdir())).toThrow('SECRET_KEY');
    expect(()=>loadConfig({...env,AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:'sb_publishable_public'},os.tmpdir())).toThrow('server secret');
    expect(()=>loadConfig({...env,AGENT_CORE_MEMORY_SUPABASE_URL:'http://host'},os.tmpdir())).toThrow('https');
    const jwt=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`;
    expect(loadConfig({...env,AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:jwt},os.tmpdir()).memory.supabaseDirect.secretKey).toBe(jwt);
  });
  it('uses apikey without treating modern secrets as bearer JWTs',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({schemaVersion:1})));
    const config=loadConfig(env,os.tmpdir()).memory.supabaseDirect;
    await new SupabaseDirectHttpTransport(config,fetcher as typeof fetch).call('health',{});
    expect(fetcher.mock.calls[0]).toMatchObject([`${config.url}/rest/v1/rpc/agent_core_memory_call`,{
      method:'POST',headers:{apikey:env.AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY},redirect:'error',
    }]);
    expect((fetcher.mock.calls[0] as any)[1].headers.Authorization).toBeUndefined();
    const legacy=vi.fn(async()=>new Response(JSON.stringify({schemaVersion:1})));
    await new SupabaseDirectHttpTransport({...config,secretKey:'legacy.jwt.fixture'},legacy as typeof fetch).call('health',{});
    expect((legacy.mock.calls[0] as any)[1].headers.Authorization).toBe('Bearer legacy.jwt.fixture');
  });
  it('reports authorization, schema, malformed responses and timeouts without response-body secrets',async()=>{
    const config=loadConfig(env,os.tmpdir()).memory.supabaseDirect;
    for(const [status,code] of [[401,'AUTH_FAILED'],[403,'AUTH_FAILED'],[404,'SCHEMA_MISSING'],[409,'WRITE_CONFLICT'],[500,'HTTP_500']] as const){
      const transport=new SupabaseDirectHttpTransport(config,async()=>new Response('sb_secret_do_not_echo',{status}));
      await expect(transport.call('health',{})).rejects.toThrow(code);
    }
    await expect(new SupabaseDirectHttpTransport(config,async()=>new Response('not-json')).call('health',{})).rejects.toThrow('RESPONSE_INVALID');
    const stalled:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('sb_secret_do_not_echo'))));
    await expect(new SupabaseDirectHttpTransport({...config,timeoutMs:10},stalled).call('health',{})).rejects.toThrow('TIMEOUT');
  });
  it('redacts Supabase secrets before canonical storage and remote projection',()=>{
    expect(redactMemoryText('AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY=sb_secret_fixture_only').text).not.toContain('fixture_only');
    expect(normalizeMemoryValue({SUPABASE_SERVICE_ROLE_KEY:'legacy-private-value'}).valueText).not.toContain('legacy-private-value');
  });
});
