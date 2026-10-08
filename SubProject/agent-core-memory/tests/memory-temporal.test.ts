import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeStandaloneMemory} from '../src/index.js';
import {memorySemanticRevision} from '../src/memory/disclosure.js';
import {legacyExperience} from '../src/memory/experience-types.js';
import * as temporal from '../src/memory/temporal.js';
import type {MemoryRecordV2} from '../src/memory/types.js';
const T1='2025-01-01T00:00:00.000Z',T2='2025-02-01T00:00:00.000Z',NOW='2026-10-07T00:00:00.000Z';
const roots:string[]=[];
afterEach(async()=>{vi.useRealTimers();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
export function record(id:string,from:string|null=T1,to:string|null=null):MemoryRecordV2{return{version:2,id,title:id,content:'project state '+id,keywords:[],context:'General',tags:[],category:'state',links:[],createdAt:NOW,updatedAt:NOW,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,provenance:{workspace:'agent-core',files:[]},experience:{...legacyExperience(),epistemic:'fact',temporal:'dynamic',validity:{state:'known',from:from?{precision:'instant',value:from}:null,to:to?{precision:'instant',value:to}:null}}};}
const ref=(r:MemoryRecordV2)=>({kind:'memory' as const,id:r.id,revision:memorySemanticRevision(r)});
const evidence={kind:'event' as const,id:'correction-event',revision:'sha256:'+'a'.repeat(64)};
function transition(a=record('predecessor'),b=record('successor',T2),effectiveAt=T2,kind='correction'){
 const input={predecessor:ref(a),successor:ref(b),effectiveAt,evidence:[evidence],reason:'Explicit state correction'};
 return {input,context:{records:[a,b],referenceTime:NOW,evidence:[{source:evidence,kind,observedAt:{precision:'instant',value:NOW},sourceRefs:[ref(a),ref(b)],...(kind==='correction'?{temporalAssertion:{kind:'correction',predecessor:ref(a),successor:ref(b),effectiveAt,evidence:[{kind:'artifact',id:'support-artifact',revision:'sha256:'+'b'.repeat(64)}]}}:{})}]}};
}
test('E21 exact timezone parsing normalizes UTC; partial/unknown never becomes a guessed instant',()=>{
 expect(temporal.parseTimeValue('2025-02-01T01:00:00+01:00')).toEqual({precision:'instant',value:T2});
 expect(temporal.parseTimeValue('2025-01-31T16:00:00-08:00')).toEqual({precision:'instant',value:T2});
 for(const [value,precision] of [['2025-02-01','day'],['2025-02','month'],['2025','year'],['2025-02-01T01:00:00','unknown'],['2025-02-30T00:00:00Z','unknown']])expect(temporal.parseTimeValue(value).precision).toBe(precision);
 expect(temporal.parseTimeValue('2025-02-01','Unrecognized/Zone')).toEqual({precision:'day',value:'2025-02-01',timezone:'Unrecognized/Zone'});
});
test('E18 valid-time is half-open and unknowns follow known results independently of import timestamp',()=>{
 const a=record('prior',T1,T2),b=record('next',T2),u=record('uncertain');u.experience.validity={state:'unknown'};
 expect(temporal.selectTemporalCandidates([u,b,a],T1).map(x=>[x.record.id,x.certainty])).toEqual([['prior','known'],['uncertain','unknown']]);
 expect(temporal.selectTemporalCandidates([u,a,b],T2).map(x=>x.record.id)).toEqual(['next','uncertain']);
 expect(temporal.selectTemporalCandidates([a,b], '2024-01-01T00:00:00Z')).toEqual([]);
 expect(()=>temporal.selectTemporalCandidates([a],'2025-01-01')).toThrow('MEMORY_INPUT_INVALID');
});
test('E18 transition is planned, evidence-backed, preserves originals and emits before/after audit',()=>{
 const {input,context}=transition(),before=structuredClone(context.records),plan=temporal.applyTemporalTransition(input,context as any);
 expect(context.records).toEqual(before);expect(plan.outcome).toBe('superseded');
 expect(plan.records[0].experience.validity).toEqual({state:'known',from:{precision:'instant',value:T1},to:{precision:'instant',value:T2}});
 expect(plan.records[1].links).toContainEqual(expect.objectContaining({type:'supersedes',targetId:'predecessor',validFrom:T2}));
 expect(plan.audit.before).toEqual([input.predecessor,input.successor]);expect(plan.audit.after).toHaveLength(2);expect(plan.audit.evidence).toEqual([evidence]);
});
test('E22 equal-time and weak evidence remain conflicted without closing validity',()=>{
 for(const fixture of [transition(record('aaa'),record('bbb',T1),T1),transition(record('aaa'),record('bbb',T2),T2,'observation')]){
  const plan=temporal.applyTemporalTransition(fixture.input,fixture.context as any);expect(plan.outcome).toBe('conflicted');expect(plan.records[0].experience.validity).toEqual(fixture.context.records[0].experience.validity);expect(plan.records[1].links[0].type).toBe('contradicts');
 }
});
for(const mode of ['self','cycle','scope','opinion','prediction','hypothesis','backdated','wrong-evidence-time','static'] as const)test('E20/E21 transition rejects '+mode,()=>{
 const f=transition(),a=f.context.records[0],b=f.context.records[1];
 if(mode==='self')f.input.successor=f.input.predecessor;
 if(mode==='cycle')a.links=[{type:'supersedes',targetId:b.id,createdAt:NOW,strength:1}];
 if(mode==='scope')b.provenance!.workspace='other';
 if(['opinion','prediction','hypothesis'].includes(mode))b.experience.epistemic=mode as any;
 if(mode==='backdated')f.input.effectiveAt='2024-01-01T00:00:00Z';
 if(mode==='wrong-evidence-time')f.context.evidence[0].temporalAssertion!.effectiveAt=T1;
 if(mode==='static')a.experience.temporal='static';
 if(mode!=='self'){f.input.predecessor=ref(a);f.input.successor=ref(b);f.context.evidence[0].sourceRefs=[ref(a),ref(b)];if(f.context.evidence[0].temporalAssertion){f.context.evidence[0].temporalAssertion.predecessor=ref(a);f.context.evidence[0].temporalAssertion.successor=ref(b);}}
 expect(()=>temporal.applyTemporalTransition(f.input,f.context as any)).toThrow();
});
async function setup(){const root=await mkdtemp(path.join(os.tmpdir(),'memory-t6-'));roots.push(root);const service=await initializeStandaloneMemory({baseDir:root,memoryRoot:root,experience:{enabled:true}});return{root,service,session:service.controller({workspaceKey:'agent-core',taskId:'temporal-task',controllerId:'test'})};}
test('E18 historical recall precedes current expiry/supersession filtering and exact expansion remains available',async()=>{
 const {service,session}=await setup(),a=record('prior',T1,T2),b=record('next',T2);a.expiresAt=T2;b.links=[{type:'supersedes',targetId:a.id,strength:1,createdAt:NOW,validFrom:T2}];
 await (service as any).store.transact([],({records}:any)=>({records:[...records,a,b],touchedIds:[a.id,b.id],stateWrites:[],result:null}));
 expect(session.capabilities().temporalAsOf).toBe(true);
 const old:any=await session.recall({query:'project state',asOf:T1});expect(old.data.hits.map((h:any)=>h.id)).toContain('prior');expect(old.data.hits.map((h:any)=>h.id)).not.toContain('next');expect(old.data.hits.find((h:any)=>h.id==='prior').applicability).toBe('historical');
 const at:any=await session.recall({query:'project state',asOf:T2});expect(at.data.hits.map((h:any)=>h.id)).toContain('next');expect(at.data.hits.map((h:any)=>h.id)).not.toContain('prior');
 expect((await session.expand({source:ref(a),view:'record'}) as any).data.text).toContain(a.content);
 await service.lifecycle(a.id,'forget-prior','forget');expect((await session.recall({query:'project state',asOf:T1}) as any).data.hits.map((h:any)=>h.id)).not.toContain(a.id);await expect(session.expand({source:ref(a),view:'record'})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
});
test('E18 current evidence correction governs asOf while exact old revision remains retained',async()=>{
 const {service,session}=await setup(),a=record('corrected',T1,T2),old=ref(a);
 await (service as any).store.transact([],({records}:any)=>({records:[...records,a],touchedIds:[a.id],stateWrites:[],result:null}));
 await (service as any).store.transact([],({records}:any)=>({records:records.map((r:any)=>r.id===a.id?{...r,content:'Corrected historical statement',experience:{...r.experience,validity:{state:'known',from:{precision:'instant',value:T2},to:null}}}:r),touchedIds:[a.id],stateWrites:[],result:null}));
 expect((await session.recall({asOf:T1}) as any).data.hits.map((h:any)=>h.id)).not.toContain(a.id);expect((await session.recall({query:'Corrected historical statement',asOf:T2}) as any).data.hits.find((h:any)=>h.id===a.id).abstract).toContain('Corrected historical');
 expect((await session.expand({source:old,view:'record'}) as any).data.text).toContain(a.content);
});
test('E21 unknown and partial validity remain uncertain while exact cutoff still excludes',()=>{
 const a=record('partial');a.experience.validity={state:'known',from:{precision:'day',value:'2025-01-01',timezone:'Unknown/Zone'},to:{precision:'instant',value:T2}};
 expect(temporal.selectTemporalCandidates([a],T1)[0].certainty).toBe('unknown');expect(temporal.selectTemporalCandidates([a],T2)).toEqual([]);
 const u=record('unknown');u.experience.validity={state:'unknown'};const b=record('later',T2),f=transition(u,b);const plan=temporal.applyTemporalTransition(f.input,f.context as any);expect(plan.records[0].experience.validity).toEqual({state:'known',from:{precision:'unknown'},to:{precision:'instant',value:T2}});
});
test('E21 atemporal and static statements do not acquire dynamic truth authority',()=>{
 const a=record('timeless');a.experience.temporal='atemporal';a.experience.verification={status:'unverified',evidence:[]};a.experience.validity={state:'unknown'};
 const b=record('historical-event',T1,T2);b.experience.temporal='static';expect(temporal.selectTemporalCandidates([a,b],T1).map(x=>x.record.id)).toEqual(['historical-event','timeless']);expect(temporal.selectTemporalCandidates([a],NOW)[0].record.experience.verification.status).toBe('unverified');
});
test('E18 known candidates rank before unknown candidates and distinct epistemic states are not deduplicated',async()=>{
 const{service,session}=await setup(),known=record('zzz-known'),unknown=record('aaa-unknown');unknown.experience.validity={state:'unknown'};unknown.content=known.content;unknown.title=known.title;
 await (service as any).store.transact([],({records}:any)=>({records:[...records,known,unknown],touchedIds:[known.id,unknown.id],stateWrites:[],result:null}));
 const hits=(await session.recall({query:known.content,asOf:T1,limit:20}) as any).data.hits.filter((h:any)=>!h.id.includes('foundational'));expect(hits.map((h:any)=>h.id)).toEqual(['zzz-known','aaa-unknown']);expect(hits.map((h:any)=>h.applicability)).toEqual(['historical','unknown']);
});
test('E18 temporal cursors bind the query instant, and retained history never expands across scope',async()=>{
 const{service,session}=await setup(),a=record('item-one'),b=record('item-two');await (service as any).store.transact([],({records}:any)=>({records:[...records,a,b],touchedIds:[a.id,b.id],stateWrites:[],result:null}));
 const page:any=await session.recall({asOf:T1,limit:1});expect(page.data.nextCursor).toBeTruthy();await expect(session.recall({asOf:T2,limit:1,cursor:page.data.nextCursor})).rejects.toThrow('MEMORY_CURSOR_STALE');
 const old=ref(a);await (service as any).store.transact([],({records}:any)=>({records:records.map((r:any)=>r.id===a.id?{...r,provenance:{workspace:'another',files:[]}}:r),touchedIds:[a.id],stateWrites:[],result:null}));await expect(session.expand({source:old,view:'record'})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
});
test('E20 opinion and cross-scope supersedes links cannot hide a fact during typed query',async()=>{
 const {service,session}=await setup(),fact=record('fact-state'),opinion=record('opinion-state');opinion.experience.epistemic='opinion';opinion.links=[{type:'supersedes',targetId:fact.id,strength:1,createdAt:NOW,validFrom:T1}];
 expect(temporal.selectTemporalCandidates([fact,opinion],T2).map(x=>x.record.id)).toContain(fact.id);
 await (service as any).store.transact([],({records}:any)=>({records:[...records,fact,opinion],touchedIds:[fact.id,opinion.id],stateWrites:[],result:null}));expect((await session.recall({query:'project state'}) as any).data.hits.map((h:any)=>h.id)).toContain(fact.id);
 opinion.experience.epistemic='fact';opinion.provenance!.workspace='other';expect(temporal.selectTemporalCandidates([fact,opinion],T2).map(x=>x.record.id)).toContain(fact.id);
});
test('E18 historical hit exposes validity and derived successor reference without replacing the original statement',async()=>{
 const{service,session}=await setup(),a=record('older',T1,T2),b=record('newer',T2);b.links=[{type:'supersedes',targetId:a.id,strength:1,createdAt:NOW,validFrom:T2}];
 await (service as any).store.transact([],({records}:any)=>({records:[...records,a,b],touchedIds:[a.id,b.id],stateWrites:[],result:null}));const hit=(await session.recall({query:a.content,asOf:T1}) as any).data.hits.find((h:any)=>h.id===a.id);expect(hit.validity).toEqual(a.experience.validity);expect(hit.invalidatedBy).toEqual([ref(b)]);
});
test('E18 historical recall does not expose an existing archive-tier record through default retention',async()=>{
 const{service,session}=await setup(),a=record('archived-state');a.experience.retention='archive';await (service as any).store.transact([],({records}:any)=>({records:[...records,a],touchedIds:[a.id],stateWrites:[],result:null}));
 for(const retention of ['active-durable','archive','all'] as const){const result:any=await session.recall({query:a.content,asOf:T1,retention});expect(result.data.hits.some((h:any)=>h.id===a.id)).toBe(retention!=='active-durable');expect(result.data.archiveSearchAvailable).toBe(true);}
 expect((await session.expand({source:ref(a),view:'record'})).status).toBe('ok');
});
test('E20 an opinion contradiction does not downgrade the applicability of a typed fact',async()=>{
 const{service,session}=await setup(),a=record('fact-claim'),b=record('opinion-claim');b.experience.epistemic='opinion';b.links=[{type:'contradicts',targetId:a.id,strength:1,createdAt:NOW,validFrom:T1}];await (service as any).store.transact([],({records}:any)=>({records:[...records,a,b],touchedIds:[a.id,b.id],stateWrites:[],result:null}));expect((await session.recall({asOf:T1}) as any).data.hits.find((h:any)=>h.id===a.id).applicability).toBe('historical');
});
test('E21 unresolved cycle paths fail closed rather than assume an absent intermediary has no outgoing links',()=>{
 const f=transition();f.context.records[0].links=[{type:'supersedes',targetId:'unavailable-intermediary',strength:1,createdAt:NOW}];f.input.predecessor=ref(f.context.records[0]);f.context.evidence[0].temporalAssertion!.predecessor=f.input.predecessor;expect(()=>temporal.applyTemporalTransition(f.input,f.context as any)).toThrow();
});
