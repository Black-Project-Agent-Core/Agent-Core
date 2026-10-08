import {afterEach,expect,test,vi} from 'vitest';
import {legacyExperience} from '../src/memory/experience-types.js';
import {memorySemanticRevision} from '../src/memory/disclosure.js';
import {selectTemporalCandidates} from '../src/memory/temporal.js';
import type {MemoryRecord,MemoryRecordV2} from '../src/memory/types.js';

const T1='2025-01-01T00:00:00.000Z',T2='2025-02-01T00:00:00.000Z',T3='2025-03-01T00:00:00.000Z';
function record(id:string):MemoryRecordV2{return{version:2,id,title:id,content:'state '+id,keywords:[],context:'General',tags:[],category:'state',links:[],createdAt:T3,updatedAt:T3,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,provenance:{workspace:'agent-core',files:[]},experience:{...legacyExperience(),epistemic:'fact'}};}
const ref=(r:MemoryRecord)=>({kind:'memory',id:r.id,revision:memorySemanticRevision(r)});
afterEach(()=>vi.restoreAllMocks());

// Reintroducing per-pair recordExperience calls must fail without timing/JIT noise.
for(const temporal of ['unknown','dynamic'] as const)test(`selection clones experience at most once per ${temporal} record, including linked owners`,()=>{
 const records=Array.from({length:64},(_,i)=>record('record-'+i));
 for(const r of records)r.experience.temporal=temporal;
 records.at(-1)!.links=[{type:'supersedes',targetId:records[0].id,strength:1,createdAt:T1,validFrom:T3}];
 const clone=vi.spyOn(globalThis,'structuredClone');
 const result=selectTemporalCandidates(records,T2);
 expect(result).toHaveLength(records.length);
 expect(result.every(c=>c.certainty==='unknown'&&!c.conflicted)).toBe(true);
 expect(clone.mock.calls.length).toBeLessThanOrEqual(records.length);
 expect(result.find(c=>c.record.id===records[0].id)!.invalidatedBy).toEqual(temporal==='dynamic'?[ref(records.at(-1)!)]:[]);
});

// Reintroducing a scan of every unlinked owner for each candidate must fail.
test('selection scans unlinked owners only a bounded number of times per record',()=>{
 const records=Array.from({length:64},(_,i)=>record('unlinked-'+i));
 const scans=records.map(r=>vi.spyOn(r.links,'some'));
 expect(selectTemporalCandidates(records,T2)).toHaveLength(records.length);
 expect(scans.reduce((n,spy)=>n+spy.mock.calls.length,0)).toBeLessThanOrEqual(4*records.length);
});

test('sparse mixed candidates retain dated invalidators, bidirectional conflicts, scope and certainty',()=>{
 const old=record('old'),next=record('next'),peer=record('peer'),opinion=record('opinion'),foreign=record('foreign'),staticClaim=record('static'),partial=record('partial'),timeless=record('timeless');
 for(const r of [old,next,peer,opinion,foreign]){r.experience.temporal='dynamic';r.experience.validity={state:'known',from:{precision:'instant',value:T1},to:null};}
 next.experience.validity={state:'known',from:{precision:'instant',value:T2},to:null};
 next.links=[{type:'supersedes',targetId:old.id,strength:1,createdAt:T3,validFrom:T2,validTo:T3},{type:'contradicts',targetId:peer.id,strength:1,createdAt:T3,validFrom:T2,validTo:T3}];
 opinion.experience.epistemic='opinion';foreign.provenance!.workspace='elsewhere';staticClaim.experience.temporal='static';
 for(const r of [opinion,foreign,staticClaim])r.links=[{type:'supersedes',targetId:old.id,strength:1,createdAt:T1}];
 opinion.links.push({type:'contradicts',targetId:old.id,strength:1,createdAt:T1});
 partial.experience.temporal='dynamic';partial.experience.validity={state:'known',from:{precision:'day',value:'2025-01-01'},to:{precision:'instant',value:T3}};
 timeless.experience.temporal='atemporal';
 const legacy={...record('legacy'),version:1} as MemoryRecord;delete (legacy as any).experience;
 const records:MemoryRecord[]=[old,next,peer,opinion,foreign,staticClaim,partial,timeless,legacy],before=structuredClone(records);
 const at1=selectTemporalCandidates(records,T1),at2=selectTemporalCandidates(records,T2),at3=selectTemporalCandidates(records,T3);
 expect(at1.find(c=>c.record===old)).toMatchObject({certainty:'known',conflicted:false,invalidatedBy:[ref(next)]});
 expect(at1.some(c=>c.record===next)).toBe(false);
 expect(at2.some(c=>c.record===old)).toBe(false);
 expect(at2.filter(c=>c.conflicted).map(c=>c.record.id)).toEqual(['next','peer']);
 expect(at3.find(c=>c.record===old)).toMatchObject({conflicted:false,invalidatedBy:[ref(next)]});
 expect(at3.some(c=>c.conflicted||c.record===partial)).toBe(false);
 expect(at2.filter(c=>c.certainty==='unknown').map(c=>c.record.id)).toEqual(['legacy','partial','static']);
 expect(at2.find(c=>c.record===timeless)?.certainty).toBe('known');
 expect(records).toEqual(before);
});
