import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {initializeStandaloneMemory,MemoryService} from '../SubProject/agent-core-memory/src/index.js';
import {ControllerMemorySession} from '../SubProject/agent-core-memory/src/memory/controller-session.js';
import {recallInputSchema,memorySemanticRevision} from '../SubProject/agent-core-memory/src/memory/disclosure.js';
import {legacyExperience} from '../SubProject/agent-core-memory/src/memory/experience-types.js';
import {exportMemoryTransferV2,importMemoryTransferV2} from '../SubProject/agent-core-memory/src/memory/transfer-v2.js';
import {registerMemoryExperienceTools} from '../src/mcp/memory-experience-tools.js';
vi.mock('../SubProject/agent-core-memory/dist/index.js',async()=>import('../SubProject/agent-core-memory/src/index.js'));
const MON='2026-10-05T00:00:00.000Z',WED='2026-10-07T00:00:00.000Z',THU='2026-10-08T00:00:00.000Z',FRI='2026-10-09T00:00:00.000Z';
const roots:string[]=[];afterEach(async()=>{vi.useRealTimers();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function setup(){const root=await mkdtemp(path.join(os.tmpdir(),'memory-known-scope-'));roots.push(root);const service=await initializeStandaloneMemory({baseDir:root,memoryRoot:root,experience:{enabled:true}}),store=(service as any).store;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(WED));for(const id of ['fact-one','fact-two'])await store.create({version:2,id,title:id,content:'Original oldstate project value',keywords:[],context:'',tags:[],category:'state',links:[],createdAt:MON,updatedAt:MON,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,provenance:{workspace:'agent-core',files:[]},experience:{...legacyExperience(),temporal:'dynamic',epistemic:'fact',validity:{state:'known',from:{precision:'instant',value:MON},to:null}}});const session=service.controller({workspaceKey:'agent-core',taskId:'known-task',controllerId:'test'});return{root,service,store,session};}
const query={validAt:MON,knownAt:THU};
test('P14 zoned query schema rejects mixed clocks and absent knownAt capability',async()=>{
 expect(recallInputSchema.safeParse(query).success).toBe(true);for(const bad of [{knownAt:THU},{validAt:'2026-10-05',knownAt:THU},{validAt:MON,knownAt:'2026-10-08T00:00:00'},{asOf:MON,...query}])expect(recallInputSchema.safeParse(bad).success).toBe(false);
 const backend:any={root:'/synthetic',experienceEnabled:true,resolveWorkspace:(x:string)=>x};const session=new ControllerMemorySession(backend,{workspaceKey:'agent-core',taskId:'test-task',controllerId:'test'});await expect(session.recall(query as any)).rejects.toThrow('MEMORY_TEMPORAL_UNSUPPORTED');
});
test('P14 recall ranks and expands exact historical revision without future content or metadata',async()=>{
 const{service,store,session}=await setup(),old=await store.read('fact-one');vi.setSystemTime(new Date(FRI));await service.update('fact-one',{content:'Future replacement newstate value'});
 const result:any=await session.recall({...query,query:'oldstate',budget:{maxBytes:65536}} as any);expect(result.data.knowledgeCoverage.complete).toBe(true);expect(result.metrics.payloadBytes).toBeLessThanOrEqual(65536);const hit=result.data.hits.find((hit:any)=>hit.id==='fact-one');expect(hit.revision).toBe(memorySemanticRevision(old));expect(hit.abstract).toContain('oldstate');expect(JSON.stringify(result)).not.toContain('newstate');
 const expanded:any=await session.expand({source:{kind:'memory',id:hit.id,revision:hit.revision},view:'record'});expect(expanded.data.text).toContain('oldstate');expect(expanded.data.text).not.toContain('newstate');
});
test('P14 cursor binds both clocks and coverage snapshot',async()=>{
 const{root,session}=await setup(),first:any=await session.recall({...query,limit:1} as any);expect(first.data.nextCursor).toBeTruthy();for(const changed of [{...query,validAt:WED},{...query,knownAt:FRI}])await expect(session.recall({...changed,limit:1,cursor:first.data.nextCursor} as any)).rejects.toThrow('MEMORY_CURSOR_STALE');
 const file=path.join(root,'state/revisions/fact-one.json'),raw=JSON.parse(await readFile(file,'utf8'));raw.coverage={complete:false,reason:'clock-regression'};await writeFile(file,JSON.stringify(raw));await expect(session.recall({...query,limit:1,cursor:first.data.nextCursor} as any)).rejects.toThrow('MEMORY_CURSOR_STALE');
});
test('P14 current forgotten and foreign scope gates remain stronger than history',async()=>{
 const{service,session}=await setup();await service.lifecycle('fact-one','forget-one','forget');await service.update('fact-two',{provenance:{workspace:'foreign',files:[]}});const result:any=await session.recall(query as any);expect(result.data.hits).toEqual([]);
});
test('P14 retention is evaluated from the selected revision and legacy asOf remains explicitly not-known-at',async()=>{
 const{store,session}=await setup();vi.setSystemTime(new Date(FRI));await store.mutate('fact-one',(r:any)=>({...r,experience:{...r.experience,retention:'archive'}}));const past:any=await session.recall(query as any);expect(past.data.hits.map((h:any)=>h.id)).toContain('fact-one');const later:any=await session.recall({...query,knownAt:FRI} as any);expect(later.data.hits.map((h:any)=>h.id)).not.toContain('fact-one');const archive:any=await session.recall({...query,knownAt:FRI,retention:'archive'} as any);expect(archive.data.hits.map((h:any)=>h.id)).toEqual(['fact-one']);expect((await session.recall({asOf:MON})).warnings).toContain('not-known-at');
});
test('P14 transfer preserves publication intervals and exact knownAt behavior',async()=>{
 const{root,service,session}=await setup();vi.setSystemTime(new Date(FRI));await service.update('fact-one',{content:'Correction after known time'});const before:any=await session.recall(query as any),bundle=await exportMemoryTransferV2(root,{allowedWorkspaces:['agent-core'],completeness:'complete'}),destination=await mkdtemp(path.join(os.tmpdir(),'memory-known-import-'));roots.push(destination);await importMemoryTransferV2(bundle,destination,{allowedWorkspaces:['agent-core']});const restored=(await MemoryService.initialize(destination,destination)).controller({workspaceKey:'agent-core',taskId:'known-task',controllerId:'restored'}),after:any=await restored.recall(query as any);expect(after.data.hits.map((hit:any)=>[hit.id,hit.revision])).toEqual(before.data.hits.map((hit:any)=>[hit.id,hit.revision]));expect(after.data.knowledgeCoverage).toEqual(before.data.knowledgeCoverage);
});
test('P14 MCP keeps host task/workspace identity and validates temporal payload',async()=>{
 const{service}=await setup(),handlers=new Map<string,any>();registerMemoryExperienceTools({registerTool:(name:string,_meta:any,handler:any)=>handlers.set(name,handler)} as any,service as any,async selector=>{if(selector?.taskId!=='known-task')throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');return{workspaceKey:'agent-core',taskId:'known-task',controllerId:'host'};});const read=handlers.get('memory_v2_read');const result=await read({action:'recall',scope:{taskId:'known-task'},payload:query});expect(result.isError).not.toBe(true);expect(JSON.parse(result.content[0].text).result.data.knowledgeCoverage.complete).toBe(true);for(const input of [{action:'recall',scope:{taskId:'foreign'},payload:query},{action:'recall',scope:{taskId:'known-task'},payload:{...query,workspaceKey:'foreign'}}])expect((await read(input)).isError).toBe(true);
});
for(const mode of ['revision','clock-order'] as const)test(`P14 transfer rejects forged publication ${mode} before creating a destination`,async()=>{
 const{root,store,service}=await setup(),old=await store.read('fact-one');vi.setSystemTime(new Date(FRI));await service.update('fact-one',{content:'Later canonical version'});const file=path.join(root,'state/revisions/fact-one.json'),raw=JSON.parse(await readFile(file,'utf8'));
 if(mode==='revision')raw.current.source.revision=memorySemanticRevision(old);else raw.current.publicationOrder=99999;await writeFile(file,JSON.stringify(raw));await expect(exportMemoryTransferV2(root,{allowedWorkspaces:['agent-core'],completeness:'complete'})).rejects.toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');
});
