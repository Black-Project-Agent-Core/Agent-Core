import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeStandaloneMemory} from '../src/standalone.js';
import {serializeCanonicalNote} from '../src/memory/note-format.js';
import {legacyExperience} from '../src/memory/experience-types.js';
import type {MemoryRecordV2,MemoryRecord} from '../src/memory/types.js';
const roots:string[]=[];
const T1='2025-01-01T00:00:00.000Z',T2='2025-02-01T00:00:00.000Z';
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
function record(id:string,workspace='agent-core'):MemoryRecordV2{return{version:2,id,title:id,content:'automobile',keywords:[],context:'General',tags:[],category:'state',links:[],createdAt:T1,updatedAt:T1,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,provenance:{workspace,files:[]},experience:{...legacyExperience(),epistemic:'fact',temporal:'dynamic',validity:{state:'known',from:{precision:'instant',value:T1},to:null}}};}
async function setup(extra:MemoryRecordV2[]=[]){
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-controller-subset-'));roots.push(root);
 const embedDocuments=vi.fn(async(texts:string[])=>texts.map(text=>text==='car'||text.includes('automobile')?[1,0,0]:[0,1,0]));
 const service=await initializeStandaloneMemory({baseDir:root,memoryRoot:root,embedder:{identity:{provider:'fixture',model:'subset-v1',dimensions:3},embedDocuments},experience:{enabled:true}});
 const allowed=record('allowed'),foreign={...record('foreign','workspace-b'),content:'car'};
 const internal=service as any;
 await internal.store.transact([],({records}:any)=>({records:[...records,allowed,foreign,...extra.map(r=>({...r,pinned:false}))],touchedIds:[allowed.id,foreign.id,...extra.map(r=>r.id)],stateWrites:[],result:null}));
 for(const record of extra.filter(r=>r.pinned))await writeFile(path.join(root,'notes',record.id+'.md'),serializeCanonicalNote(record));
 await internal.reload();await internal.refreshIndex();embedDocuments.mockClear();
 const contexts:any[]=[];const original=internal.index.semanticContext.bind(internal.index);
 vi.spyOn(internal.index,'semanticContext').mockImplementation(async(...args:any[])=>{const result=await original(...args);contexts.push(result);return result;});
 return{root,service,internal,allowed,foreign,embedDocuments,contexts,session:service.controller({workspaceKey:'agent-core',taskId:'subset-task',controllerId:'test'})};
}
test('controller_workspace_subset_gets_semantic_signal_without_foreign_vectors',async()=>{
 const{session,contexts}=await setup();const result:any=await session.recall({query:'car'});
 expect(contexts.at(-1)).not.toBeNull();expect([...contexts.at(-1).vectors.keys()]).toContain('allowed');expect([...contexts.at(-1).vectors.keys()]).not.toContain('foreign');
 expect(result.data.hits.map((h:any)=>h.id)).toContain('allowed');expect(result.data.hits.map((h:any)=>h.id)).not.toContain('foreign');
});
test('public_workspace_search_receives_filtered_vectors',async()=>{
 const{service,contexts}=await setup();const results=await service.search('car',{workspace:'agent-core'});
 expect(contexts.at(-1)).not.toBeNull();expect([...contexts.at(-1).vectors.keys()]).not.toContain('foreign');expect(results.find(r=>r.record.id==='allowed')?.components.semanticSimilarity).toBe(1);expect(results.map(r=>r.record.id)).not.toContain('foreign');
});
for(const change of ['content','workspace','deleted'] as const)test('canonical_change_between_snapshot_and_rank_is_stale_'+change,async()=>{
 const{session,internal,embedDocuments}=await setup();const snapshot=internal.store.snapshot.bind(internal.store);let calls=0;
 vi.spyOn(internal.store,'snapshot').mockImplementation(async(reader:any)=>{
  const result=await snapshot(reader);
  if(++calls===1){if(change==='deleted'){await rm(path.join(internal.store.paths.notes,'allowed.md'));}else await internal.store.transact([],({records}:any)=>({records:change==='deleted'?records.filter((r:any)=>r.id!=='allowed'):records.map((r:any)=>r.id==='allowed'?{...r,...(change==='content'?{content:'replacement'}:{provenance:{workspace:'workspace-b',files:[]}})}:r),touchedIds:['allowed'],stateWrites:[],result:null}));}
  return result;
 });
 await expect(session.recall({query:'car'})).rejects.toThrow('MEMORY_CURSOR_STALE');expect(embedDocuments).not.toHaveBeenCalled();
});
test('controller_temporal_visibility_retention_and_foundation_eligibility',async()=>{
 const prior=record('prior'),next=record('next'),expired=record('expired'),archived=record('archived'),forgotten=record('forgotten'),foreignPinned=record('foreign-pinned','workspace-b');
 prior.experience.validity={state:'known',from:{precision:'instant',value:T1},to:{precision:'instant',value:T2}};prior.expiresAt=T2;
 next.experience.validity={state:'known',from:{precision:'instant',value:T2},to:null};next.links=[{type:'supersedes',targetId:'prior',strength:1,createdAt:T2,validFrom:T2}];
 expired.expiresAt='2024-01-01T00:00:00.000Z';archived.experience.retention='archive';foreignPinned.pinned=true;
 const{session,service,contexts}=await setup([prior,next,expired,archived,forgotten,foreignPinned]);await service.lifecycle('forgotten','forget-fixture','forget');
 for(const [input,included,excluded] of [
  [{query:'car'},['allowed','next','agent-core-foundational'],['prior','expired','archived','forgotten','foreign-pinned','foreign']],
  [{query:'car',asOf:T1},['allowed','prior','agent-core-foundational'],['next','archived','forgotten','foreign-pinned','foreign']],
  [{query:'car',asOf:T2},['allowed','next','agent-core-foundational'],['prior','archived','forgotten','foreign-pinned','foreign']],
  [{query:'car',retention:'archive'},['archived'],['allowed','foreign-pinned','foreign']],
  [{query:'car',retention:'all'},['allowed','archived'],['foreign-pinned','foreign','forgotten']],
 ] as const){await session.recall(input);const keys=[...contexts.at(-1).vectors.keys()];for(const id of included)expect(keys).toContain(id);for(const id of excluded)expect(keys).not.toContain(id);}
});
test('public_pinned_compatibility_and_linked_foreign_exclusion',async()=>{
 const pinned=record('foreign-pinned','workspace-b');pinned.pinned=true;
 const {root,service,allowed,contexts}=await setup([pinned]);
 await writeFile(path.join(root,'notes','allowed.md'),serializeCanonicalNote({...allowed,links:[{type:'related',targetId:'foreign',strength:1,createdAt:T1}]}));
 const results=await service.search('car',{workspace:'agent-core',maxNeighbors:5});
 expect([...contexts.at(-1).vectors.keys()]).toContain('foreign-pinned');expect([...contexts.at(-1).vectors.keys()]).not.toContain('foreign');expect(results.map(r=>r.record.id)).toContain('foreign-pinned');expect(results.map(r=>r.record.id)).not.toContain('foreign');
});
test('public_filtered_visibility_preserves_semantics_and_raw_workspace_alias_fingerprint',async()=>{
 const expired=record('expired'),archived=record('archived'),forgotten=record('forgotten');expired.expiresAt='2024-01-01T00:00:00.000Z';archived.experience.retention='archive';
 const{root,service,internal,contexts}=await setup([expired,archived,forgotten]);
 await service.registerWorkspaceAliases([{name:'agent-core',repos:[{path:root}]}]);
 await internal.store.transact([],({records}:any)=>({records:records.map((r:any)=>r.id==='allowed'?{...r,provenance:{workspace:root,files:[]}}:r),touchedIds:['allowed'],stateWrites:[],result:null}));
 await service.lifecycle('forgotten','forget-fixture','forget');const result=await service.search('car',{workspace:root});
 expect(result.find(r=>r.record.id==='allowed')?.components.semanticSimilarity).toBe(1);const keys=[...contexts.at(-1).vectors.keys()];for(const id of ['expired','archived','forgotten','foreign'])expect(keys).not.toContain(id);
});
test('provider_failure_falls_back_only_with_eligible_records',async()=>{
 const{session,embedDocuments}=await setup();embedDocuments.mockRejectedValue(new Error('synthetic provider failure'));
 const result:any=await session.recall({query:'automobile'});expect(result.data.hits.map((h:any)=>h.id)).toContain('allowed');expect(result.data.hits.map((h:any)=>h.id)).not.toContain('foreign');expect(embedDocuments).toHaveBeenCalledTimes(1);
});
test('query_provider_runs_after_store_lock_release',async()=>{
 const{session,internal,embedDocuments}=await setup();let observed=false;
 embedDocuments.mockImplementation(async texts=>{await internal.store.snapshot();observed=true;return texts.map(()=>[1,0,0]);});
 await session.recall({query:'car'});expect(observed).toBe(true);
});
for(const mode of ['partial','corrupt'] as const)test('controller_unhealthy_index_has_no_false_semantic_success_'+mode,async()=>{
 const{root,session,contexts,embedDocuments}=await setup();const file=path.join(root,'index','index.json'),data=JSON.parse(await readFile(file,'utf8'));data.entries.pop();await writeFile(file,mode==='corrupt'?'{':JSON.stringify(data));
 const result:any=await session.recall({query:'automobile'});expect(contexts.some(c=>c!==null)).toBe(false);expect(embedDocuments).not.toHaveBeenCalled();expect(result.data.hits.map((h:any)=>h.id)).not.toContain('foreign');
});
for(const mode of ['incomplete','error'] as const)test('rank_canonical_snapshot_fails_closed_'+mode,async()=>{
 const{session,internal}=await setup();const snapshot=internal.store.snapshot.bind(internal.store);let calls=0;
 vi.spyOn(internal.store,'snapshot').mockImplementation(async(reader:any)=>snapshot(async(loaded:any,manifest:any)=>reader(++calls===2?{...loaded,...(mode==='incomplete'?{complete:false}:{issues:[{path:'synthetic',message:'synthetic',severity:'error'}]})}:loaded,manifest)));
 await expect(session.recall({query:'car'})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
});
