import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {initializeMemoryRoot,MemoryService} from '../../../src/memory/facade.js';
import {memorySemanticRevision} from '../../../src/memory/disclosure.js';
import {legacyExperience} from '../../../src/memory/experience-types.js';
import {parseCanonicalNote,serializeCanonicalNote} from '../../../src/memory/note-format.js';
const T1='2025-01-01T00:00:00.000Z',T2='2025-02-01T00:00:00.000Z',LATE='2025-06-01T00:00:00.000Z';
const roots:string[]=[];afterEach(async()=>{vi.useRealTimers();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
const ref=(r:any)=>({kind:'memory' as const,id:r.id,revision:memorySemanticRevision(r)});
const scope={workspaceKey:'agent-core',taskId:'temporal-task',controllerId:'test'};
const review=async(p:any)=>({digest:p.digest,reviewer:'synthetic-host',reason:'Reviewed explicit effective-time evidence'});
async function fixture(order='normal',policy:any={review},typed=true,equalTime=false){
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-t6-order-'));roots.push(root);const service=await initializeMemoryRoot({baseDir:root,memoryRoot:root,experience:{enabled:true},consolidation:policy} as any),session=service.controller(scope);
 const header=await session.startEpisode({startKey:'start',goal:'Track project state',sourceRefs:[]});
 const artifact=(await session.captureEvidence({operationId:'source',observedAt:{precision:'instant',value:LATE},source:{kind:'controller-text',text:'Report received in June: project changed from old to new on February 1.'}})).source;
 const make=(id:string,from:string)=>({version:2,id,content:'project state '+id,title:id,keywords:['project'],context:'General',tags:[],category:'state',links:[],createdAt:LATE,updatedAt:LATE,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,provenance:{workspace:'agent-core',files:[]},experience:{...legacyExperience(),kind:'observation',epistemic:'fact',temporal:'dynamic',validity:{state:'known',from:{precision:'instant',value:from},to:null},verification:{status:'supported',evidence:[artifact]},sourceRefs:[artifact]}});
 const a=make('old-state',T1),b=make('new-state',equalTime?T1:T2),groups=order==='batch'?[[a,b]]:order==='reverse'?[[b],[a]]:[[a],[b]];
 for(const group of groups)await (service as any).store.transact([],({records}:any)=>({records:[...records,...group],touchedIds:group.map(r=>r.id),stateWrites:[],result:null}));
 const predecessor=ref((await service.read(a.id,false))!),successor=ref((await service.read(b.id,false))!);
 const event=await session.appendEvent({episodeId:header.id,expectedRevision:1,operationId:'correction',event:{kind:'correction',summary:'Late report of February state transition',observedAt:{precision:'instant',value:LATE},sourceRefs:[predecessor,successor,artifact],stateChanges:[],...(typed?{temporalAssertion:{kind:'state-transition',predecessor,successor,effectiveAt:equalTime?T1:T2,evidence:[artifact]}}:{})}} as any);
 const action={actionId:'transition',kind:'supersede',inputRefs:[event.eventRef],reason:'Reviewed February transition',predecessor,successor,effectiveAt:equalTime?T1:T2,evidence:[event.eventRef]};
 const input={episodeId:header.id,expectedRevision:event.revision,operationId:'preview',proposal:{actions:[action]}};
 return{root,service,session,header,event,artifact,action,input,predecessor,successor};
}
const apply=(plan:any)=>({planId:plan.id,expectedPlanDigest:plan.digest,operationId:'apply'});
async function answer(session:any,asOf:string){const p=await session.recall({query:'project state',asOf,limit:20});return p.data.hits.filter((h:any)=>h.id!=='agent-core-foundational').map((h:any)=>[h.id,h.abstract,h.applicability,h.verification]);}
test('E18/E19 late evidence produces equal normal, reverse and intra-batch answers at both half-open boundaries',async()=>{
 const answers=[];
 for(const order of ['normal','reverse','batch']){const f=await fixture(order),plan:any=await f.session.prepareConsolidation(f.input);expect(plan.reviewRequired).toBe(true);const receipt=await f.session.applyConsolidation(apply(plan));expect(receipt.canonicalRefs).toHaveLength(2);
  answers.push([await answer(f.session,T1),await answer(f.session,T2)]);expect(answers.at(-1)).toEqual([[['old-state','project state old-state','historical','supported']],[['new-state','project state new-state','historical','supported']]]);
  const old:any=await f.service.read('old-state',false);expect(old.experience.validity.to.value).toBe(T2);expect(old.createdAt).toBe(LATE);
  const audit:any=await f.session.expand({source:receipt.auditRef,view:'evidence',budget:{maxBytes:65536}});expect(audit.data.text).toContain('superseded');expect(audit.data.text).toContain(f.predecessor.revision);
  expect((await f.session.expand({source:f.predecessor,view:'record'})).status).toBe('ok');
  const again=await f.session.applyConsolidation(apply(plan));expect(again).toEqual({...receipt,duplicate:true});
  const restarted=(await MemoryService.initialize(f.root,f.root)).controller({...scope,controllerId:'restarted'});expect(await answer(restarted,T1)).toEqual(answers.at(-1)![0]);
 }
 expect(answers[1]).toEqual(answers[0]);expect(answers[2]).toEqual(answers[0]);
});
test('E20 weak untyped temporal evidence creates a reviewed conflict, never closes either interval',async()=>{
 const f=await fixture('normal',{review},false),plan:any=await f.session.prepareConsolidation(f.input);await f.session.applyConsolidation(apply(plan));
 expect((await f.service.read('old-state',false) as any).experience.validity.to).toBe(null);expect((await answer(f.session,T2)).map((h:any)=>h[2])).toEqual(['conflicted','conflicted']);
});
test('E18 supersede still requires host review and source CAS, with no write on denial or stale input',async()=>{
 const f=await fixture('normal',{}),plan:any=await f.session.prepareConsolidation(f.input);await expect(f.session.applyConsolidation(apply(plan))).rejects.toThrow('MEMORY_CONSOLIDATION_REVIEW_REQUIRED');expect(ref(await f.service.read('old-state',false))).toEqual(f.predecessor);
 await f.service.lifecycle('old-state','forget-source','forget');await expect(f.session.applyConsolidation(apply(plan))).rejects.toThrow();
});
test('E23 typed canonical roundtrip retains uncertain time and exact intervals without import-time inference',async()=>{
 const f=await fixture(),r:any=await f.service.read('old-state',false);r.experience.observedAt={precision:'month',value:'2025-06',timezone:'Unknown/Zone'};r.experience.validity={state:'unknown'};
 const round=parseCanonicalNote(serializeCanonicalNote(r));expect((round as any).experience).toEqual(r.experience);
});
test('E23 v2 canonical links retain distinct intervals for the same target/type',async()=>{
 const f=await fixture(),r:any=await f.service.read('new-state',false);r.links=[{type:'contradicts',targetId:'old-state',strength:1,createdAt:LATE,validFrom:T1,validTo:T2},{type:'contradicts',targetId:'old-state',strength:1,createdAt:LATE,validFrom:LATE}];
 expect(parseCanonicalNote(serializeCanonicalNote(r)).links).toEqual(r.links);
});
test('E21 backward wall clock preserves event sequence and observed time with a skew diagnostic',async()=>{
 const f=await fixture();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime('2020-01-01T00:00:00Z');
 const appended=await f.session.appendEvent({episodeId:f.header.id,expectedRevision:f.event.revision,operationId:'backwards',event:{kind:'observation',summary:'Clock moved backwards',sourceRefs:[],stateChanges:[]}});
 const expanded:any=await f.session.expand({source:appended.eventRef,view:'episode'}),event=JSON.parse(expanded.data.text);expect(event.sequence).toBe(3);expect(event.recordedAt).toBe('2020-01-01T00:00:00.000Z');expect(event.clockSkewMs).toBeGreaterThan(0);
});
test('E18 preview replay preserves transition evidence and current canonical provenance after commit',async()=>{
 const f=await fixture(),plan:any=await f.session.prepareConsolidation(f.input);await f.session.applyConsolidation(apply(plan));expect(await f.session.prepareConsolidation(f.input)).toEqual(plan);
 for(const id of ['old-state','new-state'])expect((await f.service.read(id,false) as any).experience.sourceRefs).toContainEqual(f.event.eventRef);
});
test('E18 transition apply tolerates read counters but preserves their current values',async()=>{
 const f=await fixture(),plan:any=await f.session.prepareConsolidation(f.input);await f.service.read('new-state');const before=await f.service.read('new-state',false);await f.session.applyConsolidation(apply(plan));const after=await f.service.read('new-state',false);expect(after!.retrievalCount).toBe(before!.retrievalCount);expect(after!.lastAccessedAt).toBe(before!.lastAccessedAt);
});
test('E18 temporal source mutation during host review aborts the entire pair atomically',async()=>{
 let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>entered=r),held=new Promise<void>(r=>release=r);const f=await fixture('normal',{review:async(p:any)=>{entered();await held;return review(p);}}),plan:any=await f.session.prepareConsolidation(f.input),saving=f.session.applyConsolidation(apply(plan));await Promise.race([ready,saving]);await f.service.lifecycle('old-state','forget-during-review','forget');release();await expect(saving).rejects.toThrow('MEMORY_REVISION_CONFLICT');expect(ref(await f.service.read('old-state',false))).toEqual(f.predecessor);expect(ref(await f.service.read('new-state',false))).toEqual(f.successor);
});
test('E23 legacy transfer preserves link dates and import timestamps never imply valid-from',async()=>{
 const {buildMemoryTransferPayload,planMemoryImport}=await import('../../../src/memory/transfer.js');const f=await fixture(),old:any=await f.service.read('old-state',false),next:any=await f.service.read('new-state',false);delete old.experience;delete next.experience;old.version=next.version=1;next.links=[{type:'supersedes',targetId:old.id,strength:1,createdAt:LATE,validFrom:T2}];
 const payload=buildMemoryTransferPayload([old,next],'agent-core'),imported=planMemoryImport(payload,[]).recordsToCreate;expect(imported.find(r=>r.id===next.id)!.links[0].validFrom).toBe(T2);expect(imported.every(r=>r.version===1)).toBe(true);
 const {recordExperience}=await import('../../../src/memory/experience-types.js');expect(imported.map(r=>recordExperience(r).validity)).toEqual([{state:'unknown'},{state:'unknown'}]);
 expect(()=>buildMemoryTransferPayload([{...old,version:2,experience:legacyExperience()}])).toThrow('MEMORY_TRANSFER_V2_UNSUPPORTED');
});
test('E23 v2 normalizer retains temporal segments while legacy normalization remains compatible',async()=>{
 const{normalizeLinks}=await import('../../../src/memory/relations.js');const segments:any=[{type:'contradicts',targetId:'old-state',strength:1,createdAt:LATE,validFrom:T1,validTo:T2},{type:'contradicts',targetId:'old-state',strength:1,createdAt:LATE,validFrom:LATE}];expect(normalizeLinks('new-state',segments,new Set(['old-state']),true)).toHaveLength(2);expect(normalizeLinks('new-state',segments,new Set(['old-state']))).toHaveLength(1);
});
test('E21 retrieval clock reversal remains observable after legacy ledger interval normalization',async()=>{
 const{ControllerMemorySession}=await import('../../../src/memory/controller-session.js');const f=await fixture();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime('2025-06-01T00:00:00Z');let saved:any;
 const session=new ControllerMemorySession({root:f.root,experienceEnabled:true,resolveWorkspace:x=>x,inScope:()=>true,snapshot:async()=>{vi.setSystemTime('2025-05-01T00:00:00Z');return[];},rank:async()=>({results:[],rankingRevision:'synthetic-empty/v1'}),read:async()=>null,freshness:async()=>'unknown',recordExposure:async attempt=>{saved=(await (f.service as any).retrievalLedger.record(attempt)).attempt;}},scope);
 await session.recall();expect(saved.completedAt).toBe(saved.startedAt);expect(saved.observedCompletedAt).toBe('2025-05-01T00:00:00.000Z');expect(saved.clockSkewMs).toBe(31*86400000);
});
test('E22 equal-time contradictory facts yield the same conflicted answer set in every ingestion order',async()=>{
 const answers=[];for(const order of ['normal','reverse','batch']){const f=await fixture(order,{review},true,true),plan:any=await f.session.prepareConsolidation(f.input);expect(plan.actions[0].transition.outcome).toBe('conflicted');await f.session.applyConsolidation(apply(plan));answers.push(await answer(f.session,T1));expect(answers.at(-1)!.map((x:any)=>x[2])).toEqual(['conflicted','conflicted']);}expect(answers[1]).toEqual(answers[0]);expect(answers[2]).toEqual(answers[0]);
});
test('E23 public v2 batch link writes preserve disjoint intervals',async()=>{
 const f=await fixture(),one={type:'contradicts' as const,targetId:'old-state',strength:1,validFrom:T1,validTo:T2},two={...one,validFrom:LATE,validTo:undefined};await f.service.batch([{op:'link',id:'new-state',link:one},{op:'link',id:'new-state',link:two}]);expect((await f.service.read('new-state',false))!.links).toHaveLength(2);
});
test('E18 a digest-consistent pending plan cannot disguise a temporal mutation as retain',async()=>{
 const{writeFile}=await import('node:fs/promises'),{disclosureDigest}=await import('../../../src/memory/disclosure.js');const f=await fixture(),plan:any=await f.session.prepareConsolidation(f.input),file=path.join(f.root,'state/consolidation',plan.id+'.json'),saved=JSON.parse(await readFile(file,'utf8'));saved.plan.actions[0].kind='retain';const{digest:_,status:__,...body}=saved.plan;saved.plan.digest=disclosureDigest(['consolidation-plan/v1',body]);await writeFile(file,JSON.stringify(saved)+'\n');await expect(f.session.applyConsolidation(apply(saved.plan))).rejects.toThrow();expect(ref(await f.service.read('old-state',false))).toEqual(f.predecessor);
});
for(const kind of ['memory','manifest'] as const)test('E18 later promotion can reuse '+kind+' with exact historical transition ancestry, while forgotten ancestry still blocks',async()=>{
 const f=await fixture(),plan:any=await f.session.prepareConsolidation(f.input),receipt=await f.session.applyConsolidation(apply(plan)),source=kind==='memory'?receipt.canonicalRefs.find(r=>r.id==='new-state')!:receipt.auditRef;
 const input={episodeId:f.header.id,expectedRevision:receipt.episodeRevision,operationId:'reuse-transition',proposal:{actions:[{actionId:'reuse',kind:'create',inputRefs:[source],reason:'Preserve transition lesson',value:{content:'The transition was observed retrospectively',experience:{...legacyExperience(),epistemic:'fact',sourceRefs:[source]}}}]}};
 const next:any=await f.session.prepareConsolidation(input);expect(next.reviewRequired).toBe(true);await f.service.lifecycle('old-state','forget-history','forget');await expect(f.session.applyConsolidation({...apply(next),operationId:'apply-reuse'})).rejects.toThrow();
});
test('E18 historical evidence is allowed without widening ordinary amendment targets',async()=>{
 const f=await fixture(),plan:any=await f.session.prepareConsolidation(f.input),receipt=await f.session.applyConsolidation(apply(plan)),old=(await f.service.read('old-state',false))!;
 const value={content:'Do not silently rewrite a closed state',experience:{...legacyExperience(),epistemic:'fact',sourceRefs:[f.artifact]}};
 await expect(f.session.prepareConsolidation({episodeId:f.header.id,expectedRevision:receipt.episodeRevision,operationId:'ordinary-amend-closed',proposal:{actions:[{kind:'amend',actionId:'amend-closed',target:ref(old),inputRefs:[f.artifact],reason:'Old target',value}]}})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
 const historical=await f.session.prepareConsolidation({episodeId:f.header.id,expectedRevision:receipt.episodeRevision,operationId:'historical-retain',proposal:{actions:[{kind:'retain',actionId:'retain-old',inputRefs:[f.predecessor],reason:'Preserve exact historical evidence'}]}});expect(historical.reviewRequired).toBe(false);
 await (f.service as any).store.transact([],({records}:any)=>({records:records.map((r:any)=>r.id==='old-state'?{...r,provenance:{workspace:'other',files:[]}}:r),touchedIds:['old-state'],stateWrites:[],result:null}));
 await expect(f.session.prepareConsolidation({episodeId:f.header.id,expectedRevision:receipt.episodeRevision,operationId:'cross-scope-history',proposal:{actions:[{kind:'retain',actionId:'retain-other',inputRefs:[f.predecessor],reason:'Unavailable scope'}]}})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
});
test('E18 a mixed plan cannot use temporal privileges to amend an expired ordinary target',async()=>{
 const f=await fixture(),expired=await f.service.remember({content:'Expired ordinary target',expiresAt:'2001-01-01T00:00:00Z',provenance:{workspace:'agent-core',files:[]}});
 const ordinary={kind:'amend',actionId:'amend-expired',target:ref(expired),inputRefs:[f.artifact],reason:'Must remain gated',value:{content:'Unauthorized current amendment',experience:legacyExperience()}};
 await expect(f.session.prepareConsolidation({...f.input,proposal:{actions:[f.action,ordinary]}})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
});
test('E18 temporal audit evidence selector validates outcomes, exact outputs and payload exclusivity',async()=>{
 const{promotionEpistemicRefs}=await import('../../../src/memory/promotion.js');const f=await fixture(),plan:any=await f.session.prepareConsolidation(f.input),transition=plan.actions[0].transition,canonicalRefs=transition.audit.after;
 const manifest:any={schemaVersion:1,id:'synthetic-audit',purpose:'promotion',sourceRefs:[...plan.readSet.map((e:any)=>e.source),...canonicalRefs],details:{owner:plan.scope,planId:plan.id,planDigest:plan.digest,actions:plan.actions,canonicalRefs}};
 expect(promotionEpistemicRefs(manifest)).toEqual(expect.arrayContaining([f.predecessor,f.successor,f.event.eventRef,...canonicalRefs]));
 for(const mutate of [(m:any)=>{m.details.actions[0].transition.outcome=m.details.actions[0].transition.audit.outcome='conflicted';},(m:any)=>{m.details.actions[0].transition.records[0].content=undefined;},(m:any)=>{m.details.actions[0].target=f.predecessor;},(m:any)=>{m.details.actions[0].automatic=true;},(m:any)=>{m.details.actions[0].transition.audit.after=[];},(m:any)=>{m.sourceRefs=m.sourceRefs.filter((r:any)=>r.id!==f.event.eventRef.id);}] ){
  const invalid=structuredClone(manifest);mutate(invalid);expect(()=>promotionEpistemicRefs(invalid)).toThrow('MEMORY_SOURCE_UNAVAILABLE');
 }
});
test('E18 normalized transition output hashes match canonical revisions even when a reason has padding',async()=>{
 const f=await fixture();f.action.reason='  Reviewed transition with padded reason  ';const plan:any=await f.session.prepareConsolidation(f.input),receipt=await f.session.applyConsolidation(apply(plan));for(const source of receipt.canonicalRefs)expect(ref(await f.service.read(source.id,false))).toEqual(source);
});

// G6-01: raw link strings must be validated before legacy Date.parse can erase ambiguity.
for(const field of ['createdAt','validFrom','validTo','referenceTime'] as const)for(const value of ['2025-02-01T00:00:00','2025-02-01','2025-02-30T00:00:00Z',''] )test(`G6-01 v2 ${field} rejects ${JSON.stringify(value)} at normalizer and canonical boundaries`,async()=>{
 const{normalizeLinks}=await import('../../../src/memory/relations.js'),{normalizeRecord}=await import('../../../src/memory/note-format.js');const f=await fixture(),record:any=await f.service.read('new-state',false),link:any={type:'supersedes',targetId:'old-state',strength:1,createdAt:LATE,[field]:value};record.links=[link];
 expect(()=>normalizeLinks(record.id,[link],new Set(['old-state']),true)).toThrow();expect(()=>normalizeRecord(record,record.content)).toThrow();
 const{content,...metadata}=record;expect(()=>parseCanonicalNote('<!-- agent-core-memory\n'+JSON.stringify(metadata)+'\n-->\n\n'+content+'\n')).toThrow();expect(()=>serializeCanonicalNote(record)).toThrow();
});
for(const route of ['remember','update','batch-remember','batch-update','batch-link','batch-existing-link'] as const)test(`G6-01 public v2 ${route} rejects ambiguous link input before normalization`,async()=>{
 const f=await fixture(),link={type:'supersedes' as const,targetId:'old-state',strength:1,validFrom:'2025-02-01T00:00:00',referenceTime:'2025-02-01T00:00:00'},value={content:'New v2 link metadata',provenance:{workspace:'agent-core',files:[]},links:[link]};
 if(route==='batch-existing-link'){link.validFrom='2025-02-01T00:00:00.000Z';await f.service.batch([{op:'link',id:'new-state',link:{...link,referenceTime:'2025-02-01T00:00:00Z'}}]);}
 const before=JSON.stringify((await f.service.list()).map(ref));
 const action=()=>route==='remember'?f.service.remember(value):route==='update'?f.service.update('new-state',{links:[link]}):route==='batch-remember'?f.service.batch([{op:'remember',value}]):route==='batch-update'?f.service.batch([{op:'update',id:'new-state',patch:{links:[link]}}]):f.service.batch([{op:'link',id:'new-state',link}]);
 await expect(action()).rejects.toThrow();expect(JSON.stringify((await f.service.list()).map(ref))).toBe(before);
});
test('G6-01 v2 empty link fields are rejected rather than silently dropped by public materialization',async()=>{
 const f=await fixture();for(const field of ['createdAt','validFrom','validTo','referenceTime'])for(const value of ['',null])await expect(f.service.batch([{op:'link',id:'new-state',link:{type:'supersedes',targetId:'old-state',strength:1,[field]:value}}])).rejects.toThrow();
});
for(const tz of ['UTC','America/New_York'])test(`G6-01 process TZ=${tz} rejects ambiguous v2 links and returns the same explicit-offset answer`,async()=>{
 const{spawnSync}=await import('node:child_process'),root=await mkdtemp(path.join(os.tmpdir(),'memory-g6-zone-'));roots.push(root);
 const child=spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  const {initializeMemoryRoot}=await import(process.argv[1]);
  const {normalizeLinks}=await import(new URL('./relations.js',process.argv[1]));
  const {parseCanonicalNote}=await import(new URL('./note-format.js',process.argv[1]));
  const service=await initializeMemoryRoot({baseDir:process.argv[2],memoryRoot:process.argv[2],experience:{enabled:true}});
  const a=await service.remember({content:'timezone state old',provenance:{workspace:'agent-core',files:[]}}),b=await service.remember({content:'timezone state new',provenance:{workspace:'agent-core',files:[]}});
  await service.store.transact([],({records})=>({records:records.map(r=>r.pinned?r:{...r,experience:{...r.experience,epistemic:'fact',temporal:'dynamic',validity:{state:'known',from:{precision:'instant',value:'2025-01-01T00:00:00.000Z'},to:null}}}),touchedIds:[a.id,b.id],stateWrites:[],result:null}));
  const base={type:'supersedes',targetId:a.id,strength:1,createdAt:'2025-06-01T00:00:00Z'};
  for(const field of ['createdAt','validFrom','validTo','referenceTime'])for(const value of ['2025-02-01T00:00:00','2025-02-01','2025-02-30T00:00:00Z']){
   const link={...base,[field]:value};
   await assert.rejects(()=>service.batch([{op:'link',id:b.id,link}]));
   const r=await service.read(b.id,false),{content,...metadata}={...r,links:[link]};
   assert.throws(()=>parseCanonicalNote('<!-- agent-core-memory\\n'+JSON.stringify(metadata)+'\\n-->\\n\\n'+content+'\\n'));
   assert.doesNotThrow(()=>normalizeLinks(b.id,[link],new Set([a.id])));
   const legacy={...metadata,version:1};delete legacy.experience;assert.doesNotThrow(()=>parseCanonicalNote('<!-- agent-core-memory\\n'+JSON.stringify(legacy)+'\\n-->\\n\\n'+content+'\\n'));
  }
  await service.batch([{op:'link',id:b.id,link:{...base,validFrom:'2025-01-31T19:00:00-05:00',referenceTime:'2025-02-01T01:00:00+01:00'}}]);
  const stored=await service.read(b.id,false);assert.equal(stored.links[0].validFrom,'2025-02-01T00:00:00.000Z');assert.equal(stored.links[0].referenceTime,'2025-02-01T00:00:00.000Z');
  const session=service.controller({workspaceKey:'agent-core',taskId:'timezone-test',controllerId:'child'});
  const page=await session.recall({query:'timezone state',asOf:'2025-02-01T04:00:00Z',limit:20});
  assert.deepEqual(page.data.hits.filter(h=>h.id!== 'agent-core-foundational').map(h=>h.abstract),['timezone state new']);
  const before=await session.recall({query:'timezone state',asOf:'2025-01-31T23:59:59Z',limit:20});assert.equal(before.data.hits.filter(h=>h.id!=='agent-core-foundational').length,2);
  const legacyService=await initializeMemoryRoot({baseDir:process.argv[2]+'/legacy',memoryRoot:process.argv[2]+'/legacy'});
  const la=await legacyService.remember({content:'Legacy time target'}),lb=await legacyService.remember({content:'Legacy time owner'});await legacyService.batch([{op:'link',id:lb.id,link:{type:'supersedes',targetId:la.id,strength:1,validFrom:'2025-02-01T00:00:00'}}]);assert.equal((await legacyService.read(lb.id,false)).links[0].validFrom,new Date('2025-02-01T00:00:00').toISOString());
  console.log(JSON.stringify({boundary:stored.links[0].validFrom,answer:['timezone state new']}));
 `,new URL('../../../dist/memory/facade.js',import.meta.url).href,root],{encoding:'utf8',timeout:15000,env:{...process.env,TZ:tz}});
 expect(child.error).toBeUndefined();expect(child.status,child.stdout+child.stderr).toBe(0);expect(JSON.parse(child.stdout.trim())).toEqual({boundary:T2,answer:['timezone state new']});
});
test('G6-01 all four v2 link time fields normalize equivalent explicit offsets and remain optional where allowed',async()=>{
 const{normalizeLinks}=await import('../../../src/memory/relations.js');const f=await fixture(),r:any=await f.service.read('new-state',false),base={type:'related' as const,targetId:'old-state',strength:1,createdAt:LATE};
 for(const field of ['createdAt','validFrom','validTo','referenceTime'] as const)for(const value of ['2025-02-01T01:00:00+01:00','2025-01-31T19:00:00-05:00']){
  const link={...base,[field]:value};expect(normalizeLinks(r.id,[link],new Set(['old-state']),true)[0][field]).toBe(T2);r.links=[link];expect(parseCanonicalNote(serializeCanonicalNote(r)).links[0][field]).toBe(T2);
 }
 expect(normalizeLinks(r.id,[base],new Set(['old-state']),true)[0]).toEqual(base);
});
