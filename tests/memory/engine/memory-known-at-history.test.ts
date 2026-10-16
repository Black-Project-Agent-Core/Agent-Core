import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot,MemoryService} from '../../../src/memory/facade.js';
import {memorySemanticRevision} from '../../../src/memory/disclosure.js';
import {legacyExperience} from '../../../src/memory/experience-types.js';
import {selectTemporalCandidates} from '../../../src/memory/temporal.js';
import * as revisions from '../../../src/memory/revisions.js';
import * as atomic from '../../../src/persistence/atomic-file.js';
const roots:string[]=[];const MON='2026-10-05T00:00:00.000Z',TUE='2026-10-06T00:00:00.000Z',WED='2026-10-07T00:00:00.000Z',THU='2026-10-08T00:00:00.000Z',FRI='2026-10-09T00:00:00.000Z';
afterEach(async()=>{vi.restoreAllMocks();vi.useRealTimers();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function setup(){const root=await mkdtemp(path.join(os.tmpdir(),'memory-known-'));roots.push(root);const service=await initializeMemoryRoot({baseDir:root,memoryRoot:root,experience:{enabled:true}});return{root,service,store:(service as any).store};}
function clock(time:string){vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(time));}
async function add(store:any,id='fact-one'){const record={version:2,id,content:'Original Monday fact',keywords:[],context:'',tags:[],category:'fact',links:[],createdAt:MON,updatedAt:MON,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,provenance:{workspace:'agent-core',files:[]},experience:{...legacyExperience(),epistemic:'fact',temporal:'dynamic',validity:{state:'known',from:{precision:'instant',value:MON},to:null}}};await store.create(record);return store.read(id);}
const history=(store:any,knownAt:string,maxRecords=500)=>store.historicalSnapshot('agent-core',{knownAt,maxRecords});
test('P14 host publication distinguishes valid time from known time and hides future correction',async()=>{
 const{store,root}=await setup();clock(WED);const first=await add(store);const persisted=JSON.parse(await readFile(path.join(root,'state/revisions/fact-one.json'),'utf8'));
 expect(persisted.version).toBe(2);expect(persisted.current).toMatchObject({knownFrom:WED,publicationOrder:1,source:{revision:memorySemanticRevision(first)}});
 expect((await history(store,TUE)).records).toEqual([]);expect((await history(store,TUE)).coverage.complete).toBe(true);
 clock(FRI);await store.mutate(first.id,(r:any)=>({...r,content:'Retroactive correction',updatedAt:MON}));
 const old=await history(store,THU);expect(old.records.map((r:any)=>r.content)).toEqual(['Original Monday fact']);expect(old.revisionRefs[0].revision).toBe(memorySemanticRevision(first));expect(selectTemporalCandidates(old.records,MON)).toHaveLength(1);
 const next=JSON.parse(await readFile(path.join(root,'state/revisions/fact-one.json'),'utf8'));expect(next.revisions[0].knowledge.knownTo).toBe(FRI);expect((await history(store,FRI)).records[0].content).toBe('Retroactive correction');
});
test('P14 equal timestamps order publications and clock regression is explicit unknown',async()=>{
 const{store}=await setup();clock(WED);const first=await add(store);await store.mutate(first.id,(r:any)=>({...r,content:'Same-time revision'}));expect((await history(store,WED)).records[0].content).toBe('Same-time revision');
 clock(TUE);await store.mutate(first.id,(r:any)=>({...r,content:'Backwards clock revision'}));const result=await history(store,FRI);expect(result.records).toEqual([]);expect(result.coverage).toMatchObject({complete:false,reason:'clock-regression'});
});
test('P14 v1 history remains exact-readable but cannot acquire publication time from capturedAt',async()=>{
 const{store,root}=await setup();clock(WED);const first=await add(store);await writeFile(path.join(root,'state/revisions/fact-one.json'),JSON.stringify({version:1,id:first.id,revisions:[{capturedAt:MON,record:first}]}));
 expect((await store.revisions(first.id)).revisions[0].record.content).toBe(first.content);const result=await history(store,THU);expect(result.records).toEqual([]);expect(result.coverage).toMatchObject({complete:false,reason:'legacy-unproven'});
});
test('P14 retention gap and bounded scan never substitute current content for lost history',async()=>{
 const{store}=await setup();clock(WED);const first=await add(store);for(let i=1;i<=10;i++){clock(new Date(Date.parse(WED)+i*1000).toISOString());await store.mutate(first.id,(r:any)=>({...r,content:`Revision ${i}`}));}
 const lost=await history(store,WED);expect(lost.records).toEqual([]);expect(lost.coverage).toMatchObject({complete:false,reason:'retained-history-gap'});expect((await store.revisions(first.id,99)).revisions).toHaveLength(8);
 await add(store,'fact-two');expect((await history(store,FRI,1)).coverage).toMatchObject({complete:false,reason:'bounded-scan'});
});
test('P14 current scope and corrupt publication metadata fail closed without current fallback',async()=>{
 const{store,root}=await setup();clock(WED);const first=await add(store);clock(FRI);await store.mutate(first.id,(r:any)=>({...r,provenance:{workspace:'foreign',files:[]}}));expect((await history(store,THU)).records).toEqual([]);
 await add(store,'fact-two');const file=path.join(root,'state/revisions/fact-two.json'),raw=JSON.parse(await readFile(file,'utf8'));raw.current.source.revision='sha256:'+'0'.repeat(64);await writeFile(file,JSON.stringify(raw));const result=await history(store,FRI);expect(result.records).toEqual([]);expect(result.coverage.complete).toBe(false);
});
test('P14 failed canonical transaction rolls publication metadata back and restart preserves history',async()=>{
 const{store,root}=await setup();clock(WED);const first=await add(store),file=path.join(root,'state/revisions/fact-one.json'),before=await readFile(file,'utf8'),original=atomic.writeOwnedFileAtomic;
 let failed=false;vi.spyOn(atomic,'writeOwnedFileAtomic').mockImplementation(async(fileName,...args)=>{if(!failed&&fileName===path.join(root,'notes/fact-one.md')){failed=true;throw new Error('synthetic publication fault');}return original(fileName,...args);});clock(FRI);
 await expect(store.mutate(first.id,(r:any)=>({...r,content:'Must roll back'}))).rejects.toThrow('synthetic publication fault');expect(await readFile(file,'utf8')).toBe(before);vi.restoreAllMocks();const restarted=await MemoryService.initialize(root,root);expect((await history((restarted as any).store,FRI)).records[0].content).toBe(first.content);
});
test('P14 parser rejects forged metadata fields and semantic revision mismatches',()=>{
 expect(()=>revisions.parseRevisionFile(JSON.stringify({version:2,id:'fact-one',revisions:[],current:{source:{kind:'memory',id:'fact-one',revision:'sha256:'+'a'.repeat(64)},knownFrom:WED,publicationOrder:1,callerApproved:true},coverage:{complete:true}}),'fact-one')).toThrow();
});
test('P14 a rollback of the host clock between different record IDs cannot publish false earlier knowledge',async()=>{
 const{store}=await setup();clock(FRI);await add(store,'clock-first');clock(WED);await add(store,'clock-second');const result=await history(store,THU);expect(result.records).toEqual([]);expect(result.coverage).toMatchObject({complete:false,reason:'clock-regression'});
});
test('P14 future contradiction links cannot change conflicts in a prior knowledge snapshot',async()=>{
 const{store}=await setup();clock(WED);await add(store,'claim-one');await add(store,'claim-two');clock(FRI);await store.mutate('claim-two',(r:any)=>({...r,links:[{type:'contradicts',targetId:'claim-one',strength:1,createdAt:FRI,validFrom:MON}]}));
 const prior=selectTemporalCandidates((await history(store,THU)).records,MON);expect(prior).toHaveLength(2);expect(prior.every(item=>!item.conflicted)).toBe(true);const later=selectTemporalCandidates((await history(store,FRI)).records,MON);expect(later.every(item=>item.conflicted)).toBe(true);
});
test('P14 metadata is emitted only by semantic mutation, survives restart, and old strict readers reject it',async()=>{
 const{root,store}=await setup(),manifestPath=path.join(root,'state/experience-manifest.json'),initial=await readFile(manifestPath,'utf8');expect(JSON.parse(initial).knowledgeClock).toBeUndefined();
 await history(store,THU);await MemoryService.initialize(root,root);expect(await readFile(manifestPath,'utf8')).toBe(initial);clock(WED);await add(store);const emitted=await readFile(manifestPath,'utf8');expect(JSON.parse(emitted).knowledgeClock).toMatchObject({lastPublishedAt:WED,publicationOrder:1,regressed:false});
 const {z}=await import('zod');const old=z.strictObject({schemaVersion:z.literal(1),formatVersion:z.literal(2),rootId:z.string(),generation:z.number(),status:z.literal('complete')});expect(old.safeParse(JSON.parse(initial)).success).toBe(true);expect(old.safeParse(JSON.parse(emitted)).success).toBe(false);
 const restarted=await MemoryService.initialize(root,root);expect((await history((restarted as any).store,THU)).records).toHaveLength(1);expect(await readFile(manifestPath,'utf8')).toBe(emitted);
});
test('P14 simultaneous same-millisecond publications have distinct durable owner order',async()=>{
 const{store,root}=await setup();clock(WED);await Promise.all([add(store,'parallel-one'),add(store,'parallel-two')]);const files=await Promise.all(['parallel-one','parallel-two'].map(async id=>JSON.parse(await readFile(path.join(root,`state/revisions/${id}.json`),'utf8'))));expect(files.map(file=>file.current.publicationOrder).sort()).toEqual([1,2]);expect((await history(store,WED)).records).toHaveLength(2);
});
test('P14 corrupted publication order beyond the canonical watermark is unavailable to queries',async()=>{
 const{store,root}=await setup();clock(WED);await add(store);const file=path.join(root,'state/revisions/fact-one.json'),raw=JSON.parse(await readFile(file,'utf8'));raw.current.publicationOrder=999;await writeFile(file,JSON.stringify(raw));const result=await history(store,THU);expect(result.records).toEqual([]);expect(result.coverage.complete).toBe(false);
});
test('P14 missing publication watermark with v2 history blocks writes without resetting retained state',async()=>{
 const{store,root}=await setup();clock(WED);await add(store);const manifestPath=path.join(root,'state/experience-manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));delete manifest.knowledgeClock;await writeFile(manifestPath,JSON.stringify(manifest));const before=await readFile(path.join(root,'state/revisions/fact-one.json'),'utf8'),corruptManifest=await readFile(manifestPath,'utf8');
 const restarted=await MemoryService.initialize(root,root);await expect(add((restarted as any).store,'other-record')).rejects.toThrow('MEMORY_PUBLICATION_CLOCK_REQUIRED');expect(await readFile(path.join(root,'state/revisions/fact-one.json'),'utf8')).toBe(before);expect(await readFile(manifestPath,'utf8')).toBe(corruptManifest);
});
