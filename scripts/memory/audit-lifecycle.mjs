import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
// Diagnostic observations of current behavior; passing probes do not certify the strict policy.
// All writes are confined to synthetic fixtures under the chosen output directory.
const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputArg = process.argv.find((arg) => arg.startsWith('--output-dir='))?.slice('--output-dir='.length);
const output = outputArg ? path.resolve(outputArg) : await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-audit-'));
const outputRelative = path.relative(product, output);
if (outputRelative === '' || (!outputRelative.startsWith(`..${path.sep}`) && outputRelative !== '..' && !path.isAbsolute(outputRelative))) {
  throw new Error('Audit fixtures must stay outside the project and its production state');
}
await mkdir(output, { recursive: true });
const rgExecutable = process.platform === 'win32' ? 'rg.exe' : 'rg';
const pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'bin/python3';
const module = async (name) => import(pathToFileURL(path.join(product, 'dist', name)).href);
const { loadConfig } = await module('config.js');
const { createRuntimeServices } = await module('runtime/services.js');
const { MemoryService } = await module('memory/service.js');
const { registerCapabilityTools } = await module('mcp/capability-tools.js');
const { registerMemoryTurnTools } = await module('mcp/memory-turn-tools.js');
const { validateMemoryLifecycleBeforeOperation, completeMemoryLifecycleOperation } = await module('mcp/memory-lifecycle-guard.js');
const { GraphifyAdapter } = await module('memory/file-native/graphify-adapter.js');
const { FileNativeMemoryRepository } = await module('memory/file-native/vault-repository.js');
const { parseVaultSegment, serializeVaultSegment } = await module('memory/file-native/vault-codec.js');
const fixtures = [], results = [];
class Transport {
  down = true; attempts = 0; heads = new Map(); versions = new Map(); syncStates = [];
  check() { this.attempts++; if (this.down) throw new Error('SIMULATED_REMOTE_UNAVAILABLE'); }
  async getHead({fileId}) { this.check(); return this.heads.get(fileId) ?? null; }
  async getVersion({versionId}) { this.check(); return this.versions.get(versionId) ?? null; }
  async appendVersion(i) { this.check(); this.versions.set(i.version.versionId,i.version); this.heads.set(i.fileId,{...i,currentVersionId:i.version.versionId,state:'active',contentHash:i.version.contentHash}); return {applied:true,currentVersionId:i.version.versionId}; }
  async tombstone(i) { this.check(); const h=this.heads.get(i.fileId); if(h)h.state='tombstoned'; }
  async upsertSyncState(i) { this.check(); this.syncStates.push(i); }
}
async function fixture(mode='enforce',transport=null) {
  const root=await mkdtemp(path.join(output,'fixture-'));
  const env={AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE:mode,AGENT_CORE_EXECUTION_ENABLED:'false'};
  if(transport){
    await mkdir(path.join(root,'runtime/secrets'),{recursive:true});
    await writeFile(path.join(root,'runtime/secrets/signing.pem'),'fixture-injected-transport');
    await writeFile(path.join(root,'runtime/secrets/encryption.key'),Buffer.alloc(32,7));
    Object.assign(env,{AGENT_CORE_MEMORY_SUPABASE_SECOND_ENABLED:'true',AGENT_CORE_MEMORY_SUPABASE_URL:'https://fixture.invalid',AGENT_CORE_MEMORY_SUPABASE_PUBLISHABLE_KEY:'fixture',AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE:'runtime/secrets/signing.pem',AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE:'runtime/secrets/encryption.key'});
  }
  const config=loadConfig(env,root);
  await mkdir(config.memory.fileNative.ripgrepRoot,{recursive:true});
  await copyFile(path.join(product,'.tools/ripgrep',rgExecutable),path.join(config.memory.fileNative.ripgrepRoot,rgExecutable));
  const runtime=createRuntimeServices([root],path.join(root,'capabilities'),undefined,config.memory,config.execution);
  if(transport)runtime.memory=new MemoryService(config.memory,undefined,{fileSecondTransport:transport});
  const key={id:randomUUID(),name:'memory-audit-fixture'};
  const handlers=new Map(); const registry={registerTool(name,_spec,handler){handlers.set(name,handler);}};
  registerCapabilityTools(registry,runtime,key); registerMemoryTurnTools(registry,runtime,key);
  const scope={principalId:key.id,projectId:root};
  const call=async(name,input)=>{const r=await handlers.get(name)(input);return JSON.parse(r.content[0].text);};
  const route=async(task)=>call('capability_route',{task,projectRoot:root});
  const f={root,config,runtime,key,scope,call,route};fixtures.push(f);return f;
}
async function probe(id,run){const start=Date.now();try{const evidence=await run();results.push({id,passed:true,durationMs:Date.now()-start,evidence});}catch(e){results.push({id,passed:false,error:e.stack});}console.log(JSON.stringify(results.at(-1)));}
await probe('empty_vault_success',async()=>{const f=await fixture();const r=await f.route('Inspect a new project');assert.ok(r.memoryContextId);assert.equal(r.memorySummary.length,0);return{contextCreated:true,recallCount:0,status:r.memoryStatus};});
await probe('recall_enters_router_context',async()=>{
  const f=await fixture();const seed=await f.runtime.memory.commit({scope:f.scope,canonicalKey:'decision:orbit-layout',kind:'decision',value:'Orbit layout requires frontend dashboard spacing and visual hierarchy.',sourceType:'audit_fixture'});
  let context='';const original=f.runtime.router.route.bind(f.runtime.router);f.runtime.router.route=(task,c)=>{context=c;return original(task,c);};
  const r=await f.route('Inspect Orbit layout');assert.ok(r.memorySummary.some(x=>x.memoryId===seed.memoryId));assert.ok(r.memoryInjection.applied);assert.ok(context.includes('visual hierarchy'));
  return{recalled:1,injectionApplied:true,routerReceivedSavedConstraint:true,domain:r.domain};
});
await probe('graph_unavailable_does_not_block_enforce',async()=>{
  const f=await fixture();const r=await f.route('Create a project directory');const route=f.runtime.routes.getOwned(r.routeContextId,f.key.id);
  const decision=await validateMemoryLifecycleBeforeOperation(f.runtime,f.key,route,'write_file',{});const health=await f.runtime.memory.status(f.scope);assert.equal(decision.valid,true);assert.equal(health.healthy,true);assert.equal(health.counts.graph_degraded,1);
  return{mode:decision.mode,operationAuthorized:decision.valid,healthy:health.healthy,graphDegraded:health.counts.graph_degraded};
});
await probe('read_operations_exempt_without_preflight',async()=>{
  const f=await fixture();const route={routeContextId:randomUUID(),projectId:f.root};
  const read=await validateMemoryLifecycleBeforeOperation(f.runtime,f.key,route,'read_file',{});let code=null;
  try{await validateMemoryLifecycleBeforeOperation(f.runtime,f.key,route,'write_file',{});}catch(e){code=e.code;}
  assert.equal(read.required,false);assert.equal(code,'MEMORY_PREFLIGHT_REQUIRED');return{readRequiresMemory:read.required,writeFailureCode:code};
});
await probe('different_objective_bypasses_pending_closure',async()=>{
  const f=await fixture();const r=await f.route('Create orbit alpha directory');const route=f.runtime.routes.getOwned(r.routeContextId,f.key.id);
  const d=await validateMemoryLifecycleBeforeOperation(f.runtime,f.key,route,'write_file',{});await completeMemoryLifecycleOperation(f.runtime,f.key,route,'write_file',d);
  const other=await f.route('Inspect unrelated lunar beta report');const same=await f.route('Create orbit alpha directory');
  assert.ok(other.routeContextId);assert.equal(same.error.code,'MEMORY_POSTFLIGHT_REQUIRED');const old=await f.runtime.memory.getLifecycleContext(f.scope,r.memoryContextId);assert.equal(old.postflightState,'POSTFLIGHT_PENDING');
  return{oldState:old.postflightState,differentObjectiveAllowed:true,sameObjectiveBlocked:same.error.code};
});
await probe('fresh_candidate_without_root_reason_is_dropped',async()=>{
  const f=await fixture();const r=await f.route('Record orbit decision');const final=await f.call('memory_turn_finalize',{routeContextId:r.routeContextId,candidate:{canonicalKey:'decision:orbit-proof',kind:'decision',value:'Verified important constraint.',sourceType:'audit_fixture'},reasonCodes:['FRESH_DURABLE_CONTEXT'],evidenceRefs:['fixture:verified']});
  assert.equal(final.finalized,true);assert.equal(final.decision,'NO_DURABLE_MEMORY');assert.equal(final.semanticMutation,false);
  return{finalized:final.finalized,decision:final.decision,semanticMutation:final.semanticMutation,state:final.memoryLifecycle.postflightState};
});
await probe('remote_failure_does_not_prevent_finalization',async()=>{
  const remote=new Transport();const f=await fixture('enforce',remote);const r=await f.route('Record a verified remote decision');
  const final=await f.call('memory_turn_finalize',{routeContextId:r.routeContextId,candidate:{canonicalKey:'decision:remote-proof',kind:'decision',value:'Verified release constraint.',sourceType:'audit_fixture'},reasonCodes:['FRESH_DURABLE_CONTEXT'],evidenceRefs:['fixture:verified'],rootReason:'New durable project constraint'});
  const health=await f.runtime.memory.status(f.scope);assert.equal(final.finalized,true);assert.equal(final.memoryLifecycle.postflightState,'CLOSED');assert.equal(health.healthy,true);assert.ok(remote.attempts>0);assert.equal(remote.syncStates.length,0);
  const failedAttempts=remote.attempts;remote.down=false;const synced=await f.runtime.memory.syncDurableBoundary(f.scope,'continuity_terminal');assert.equal(synced.state,'REMOTE_SYNCED');
  return{finalizedDuringOutage:true,closedDuringOutage:true,healthDuringOutage:health.healthy,failedRemoteAttempts:failedAttempts,explicitRecovery:synced.state,remoteReceipts:remote.syncStates.length};
});
await probe('python_presence_is_not_graph_health',async()=>{
  const f=await fixture();await mkdir(path.dirname(path.join(f.config.memory.fileNative.pythonRoot,pythonExecutable)),{recursive:true});await writeFile(path.join(f.config.memory.fileNative.pythonRoot,pythonExecutable),'not an executable');
  const health=await f.runtime.memory.status(f.scope);assert.equal(health.healthy,true);assert.equal(health.counts.graph_degraded,undefined);return{healthy:health.healthy,graphDegradedFlagPresent:false,pythonExecutableUsable:false};
});
await probe('real_graphify_build_and_stale_graph',async()=>{
  const f=await fixture();const paths=f.config.memory.fileNative;const repo=new FileNativeMemoryRepository(paths);
  const a=await repo.commit({scope:f.scope,canonicalKey:'decision:linked',kind:'decision',value:'Linked project decision.'});
  const b=await repo.commit({scope:f.scope,canonicalKey:'procedure:entry',kind:'procedure',value:'Orbit entry procedure.',explicitRelations:[{targetMemoryId:a.memoryId,relation:'resolved_by'}]});
  const adapter=new GraphifyAdapter(paths,{pythonPath:path.join(product,'.tools/python',pythonExecutable),bridgePath:path.join(product,'scripts/memory/graphify-bridge.py')});
  const build=await adapter.update([]);const before=await adapter.queryRelated([b.memoryId],16);assert.ok(before.has(a.memoryId));
  await writeFile(path.join(paths.graphRoot,'graph.json'),JSON.stringify({nodes:[],links:[]}));const stale=await adapter.queryRelated([b.memoryId],16);assert.equal(stale.size,0);
  return{realGraphifyBuild:true,nodes:build.nodes,edges:build.edges,relatedBefore:before.size,relatedAfterStaleReplacement:stale.size,staleGraphAccepted:true};
});
await probe('unassigned_vault_owner_is_invisible_to_authenticated_scope',async()=>{
  const f=await fixture();await f.runtime.memory.commit({scope:f.scope,canonicalKey:'decision:owner-proof',kind:'decision',value:'Owner-bound project memory.'});
  const files=await readdir(f.config.memory.fileNative.vaultRoot,{recursive:true,withFileTypes:true});
  for(const item of files){if(!item.isFile()||!item.name.endsWith('.md'))continue;const file=path.join(item.parentPath,item.name);const relative=path.relative(f.config.memory.fileNative.vaultRoot,file);if(relative.startsWith('.agent-core'))continue;const segment=parseVaultSegment(await readFile(file,'utf8'),relative);segment.principalId='';await writeFile(file,serializeVaultSegment(segment));}
  const all=await f.runtime.memory.status();const scoped=await f.runtime.memory.status(f.scope);assert.equal(all.counts.active_items,1);assert.equal(scoped.counts.active_items,0);assert.equal(scoped.healthy,true);return{globalItems:1,authenticatedItems:0,authenticatedHealth:scoped.healthy};
});
for(const f of fixtures){await Promise.allSettled([f.runtime.memory.close(),f.runtime.execution.close(),f.runtime.operatorDirectives.close(),f.runtime.telemetry.close()]);}
await writeFile(path.join(output,'memory-probes.json'),JSON.stringify({createdAt:new Date().toISOString(),passed:results.filter(x=>x.passed).length,total:results.length,network:'No remote network; in-memory transport for outage/recovery cases',results},null,2));
console.log(JSON.stringify({reportPath:path.join(output,'memory-probes.json'),passed:results.filter(x=>x.passed).length,total:results.length}));
process.exitCode=results.some(x=>!x.passed)?1:0;
