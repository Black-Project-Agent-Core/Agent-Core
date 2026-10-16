import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../../../src/memory/facade.js';
import {legacyExperience} from '../../../src/memory/experience-types.js';
import {memorySemanticRevision} from '../../../src/memory/disclosure.js';
import * as provenance from '../../../src/memory/provenance.js';

const roots:string[]=[];
const EVENT='2026-02-03T00:00:00.000Z',RECORDED='2026-02-13T00:00:00.000Z',AUDIT='2026-03-07T00:00:00.000Z';
afterEach(async()=>{vi.restoreAllMocks();vi.useRealTimers();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
function clock(value:string){vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(value));}
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'memory-known-disclosure-'));roots.push(root);
  const service=await initializeMemoryRoot({baseDir:root,memoryRoot:root,experience:{enabled:true}});
  clock(RECORDED);
  const store=(service as any).store;
  await store.create({version:2,id:'scoped-observation',title:'Historical compiler observation',content:'Compiler reported FAIL on the observed v5 fixture.',
    keywords:[],context:'',tags:[],category:'observation',links:[],createdAt:EVENT,updatedAt:EVENT,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,
    provenance:{workspace:'agent-core',files:[]},experience:{...legacyExperience(),epistemic:'observation',temporal:'dynamic',
      observedAt:{precision:'instant',value:EVENT},validity:{state:'known',from:{precision:'instant',value:EVENT},to:null}}});
  const original=await store.read('scoped-observation');
  const session=service.controller({workspaceKey:'agent-core',taskId:'historical-disclosure',controllerId:'test'});
  return {store,session,original};
}

for(const view of ['map','abstract'] as const)test(`knownAt ${view} never reads present-day source freshness`,async()=>{
  const {session,original}=await fixture();
  const freshness=vi.spyOn(provenance,'assessMemoryStaleness').mockRejectedValue(new Error('Present-day file must not be inspected'));
  const page=await session.recall({query:'compiler fixture',view,validAt:EVENT,knownAt:RECORDED});
  expect(freshness).not.toHaveBeenCalled();
  expect(page.status).toBe('ok');
  if(page.status==='insufficient-budget')throw Error('Unexpected fixture budget');
  expect(page.data.hits).toHaveLength(1);
  expect(page.data.hits[0]).toMatchObject({id:original.id,revision:memorySemanticRevision(original),freshness:'unknown',applicability:'historical'});
  expect(page.warnings).toContain('historical-source-freshness-unknown');
});

test('ordinary valid-time recall continues to assess present-day source freshness',async()=>{
  const {session}=await fixture();
  const freshness=vi.spyOn(provenance,'assessMemoryStaleness').mockResolvedValue({status:'changed',anchoredFiles:['source.ts'],changedFiles:['source.ts']});
  const page=await session.recall({query:'compiler fixture',validAt:EVENT});
  expect(freshness).toHaveBeenCalled();
  if(page.status==='insufficient-budget')throw Error('Unexpected fixture budget');
  expect(page.data.hits[0]?.freshness).toBe('stale');
  expect(page.warnings).toContain('valid-time-with-current-evidence');
  expect(page.warnings).not.toContain('historical-source-freshness-unknown');
  freshness.mockRejectedValue(new Error('Current source inspection failed'));
  await expect(session.recall({query:'compiler fixture',validAt:EVENT})).rejects.toThrow('Current source inspection failed');
});

test('public knownAt recall keeps late evidence and later audit out of earlier controller snapshots',async()=>{
  const {store,session,original}=await fixture();
  clock(AUDIT);
  await store.mutate(original.id,(record:any)=>({...record,content:'Compiler reported FAIL on a misconfigured fixture; normal configuration remains unverified.'}));
  const before=await session.recall({query:'compiler fixture',validAt:EVENT,knownAt:'2026-02-05T00:00:00.000Z'});
  const prior=await session.recall({query:'compiler fixture',validAt:EVENT,knownAt:'2026-03-05T00:00:00.000Z'});
  const after=await session.recall({query:'compiler fixture',validAt:EVENT,knownAt:'2026-03-08T00:00:00.000Z'});
  if(before.status==='insufficient-budget'||prior.status==='insufficient-budget'||after.status==='insufficient-budget')throw Error('Unexpected fixture budget');
  expect(before.data.hits).toEqual([]);
  expect(prior.data.hits[0]?.abstract).toContain(original.content);
  expect(prior.data.hits[0]?.abstract).not.toContain('misconfigured');
  expect(after.data.hits[0]?.abstract).toContain('misconfigured');
  const exact=await session.expand({source:{kind:'memory',id:original.id,revision:memorySemanticRevision(original)},view:'record'});
  if(exact.status==='insufficient-budget')throw Error('Unexpected fixture budget');
  expect(exact.data.text).toContain(original.content);
  expect(exact.data.text).not.toContain('misconfigured');
});
