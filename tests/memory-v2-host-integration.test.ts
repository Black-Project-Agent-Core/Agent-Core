import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile,access} from 'node:fs/promises';
import {describe,it,expect,afterEach} from 'vitest';
import {initializeAgentCoreMemory} from '../src/memory/host-runtime.js';
import {registerMemoryExperienceTools} from '../src/mcp/memory-experience-tools.js';
import {registerMemoryTools} from '../src/mcp/memory-tools.js';
import {initializeStandaloneMemory} from '../SubProject/agent-core-memory/src/standalone.js';
import {ExternalControllerLearningService} from '../src/learning/external-controller.js';
import {LearningService} from '../src/learning/service.js';
import {MemoryLearningSink} from '../src/learning/memory-sink.js';

const base=path.resolve(process.cwd(),'runtime','tmp');
const dirs:string[]=[];
async function fixture(){await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'memory-v2-host-'));dirs.push(root);return root;}
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function activeRoot(root:string){
 const target=path.join(root,'runtime','memory-v2');
 const service=await initializeStandaloneMemory({baseDir:root,memoryRoot:target,experience:{enabled:true}});
 const backup=path.join(root,'runtime','backups','memory-v1-final-before-v2-20261008');
 await mkdir(backup,{recursive:true});
 await writeFile(path.join(backup,'manifest.json'),JSON.stringify({snapshotDigest:'a'.repeat(64),fileCount:2}));
 await writeFile(path.join(root,'runtime','memory-v2-activation.json'),JSON.stringify({
  schemaVersion:1,mode:'experience-v2',root:'runtime/memory-v2',
  backup:'runtime/backups/memory-v1-final-before-v2-20261008/manifest.json',legacyDigest:'a'.repeat(64),
 }));
 return service;
}
function serverMock(){
 const tools=new Map<string,(args:unknown)=>Promise<any>>();
 return {tools,server:{registerTool:(name:string,_meta:unknown,callback:(args:unknown)=>Promise<any>)=>{tools.set(name,callback)}} as any};
}
describe('Agent Core Memory experience-v2 host selection',()=>{
 it('opens a root-identity-bound canonical activation without a second Memory directory',async()=>{
  const root=await fixture(),canonical=path.join(root,'runtime','memory');
  await initializeStandaloneMemory({baseDir:root,memoryRoot:canonical,experience:{enabled:true}});
  const manifest=JSON.parse(await readFile(path.join(canonical,'state','experience-manifest.json'),'utf8'));
  await writeFile(path.join(root,'runtime','memory-v2-activation.json'),JSON.stringify({
   schemaVersion:2,mode:'experience-v2',root:'runtime/memory',status:'complete',origin:'fresh',rootId:manifest.rootId,
  }));
  const runtime=await initializeAgentCoreMemory(root,canonical);
  expect(runtime.root).toBe(canonical);expect(runtime.mode).toBe('experience-v2');
  expect(new MemoryLearningSink(runtime.service).supportsCorrections()).toBe(true);
  const record=await runtime.service.remember({title:'Canonical ownership',content:'One root survives reopen',provenance:{workspace:'agent-core',files:[]}});
  await expect((await initializeAgentCoreMemory(root,canonical)).service.read(record.id,false)).resolves.toMatchObject({id:record.id,version:2});
  await expect(access(path.join(root,'runtime','memory-v2'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('never falls back to a legacy writer when experience activation is missing',async()=>{
  const root=await fixture(),canonical=path.join(root,'runtime','memory');
  await initializeStandaloneMemory({baseDir:root,memoryRoot:canonical,experience:{enabled:true}});
  await expect(initializeAgentCoreMemory(root,canonical)).rejects.toThrow('ACTIVATION_REQUIRED');
 });
 it('does not ignore an unmarked historical root or initialize a new canonical root',async()=>{
  const root=await fixture(),canonical=path.join(root,'runtime','memory');
  await mkdir(path.join(root,'runtime','memory-v2'),{recursive:true});
  await writeFile(path.join(root,'runtime','memory-v2','unknown.txt'),'Preserve this data');
  await expect(initializeAgentCoreMemory(root,canonical)).rejects.toThrow('HISTORICAL_ROOT_REQUIRES_REVIEW');
  await expect(access(canonical)).rejects.toMatchObject({code:'ENOENT'});
 });
 it('does not recreate a missing historical experience root from activation metadata',async()=>{
  const root=await fixture();await activeRoot(root);
  await rm(path.join(root,'runtime','memory-v2'),{recursive:true});
  await expect(initializeAgentCoreMemory(root,path.join(root,'runtime','memory'))).rejects.toThrow('EXPERIENCE_MANIFEST_REQUIRED');
  await expect(access(path.join(root,'runtime','memory-v2'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('preserves legacy selection without activation marker',async()=>{
  const root=await fixture(),legacy=path.join(root,'runtime','memory');
  await mkdir(legacy,{recursive:true});
  await writeFile(path.join(legacy,'00-agent-core-memory.md'),'# Test Foundation\n');
  const runtime=await initializeAgentCoreMemory(root,legacy);
  expect(runtime.mode).toBe('legacy');expect(runtime.experience).toBeUndefined();
  expect(runtime.service).toBeDefined();
  expect('controller' in runtime.service).toBe(false);
 });
 it('activates a host-marked v2 root, retains legacy API and registers scoped controller methods',async()=>{
  const root=await fixture();await activeRoot(root);
  const runtime=await initializeAgentCoreMemory(root,path.join(root,'runtime','memory'));
  expect(runtime.mode).toBe('experience-v2');expect(runtime.experience).toBeDefined();
  const oldRecord=await runtime.service.remember({title:'Verified architecture',content:'Retain important project history',provenance:{workspace:'agent-core',files:[]}});
  expect(oldRecord.version).toBe(2);
  const legacy=serverMock();registerMemoryTools(legacy.server,runtime.service);
  const legacyRead=await legacy.tools.get('memory_read')!({id:oldRecord.id});
  expect(legacyRead.isError).not.toBe(true);
  const legacyList=await legacy.tools.get('memory_list')!({workspace:'agent-core'});
  expect(JSON.stringify(legacyList)).toContain(oldRecord.id);
  const legacySearch=await legacy.tools.get('memory_search')!({query:'Verified architecture',workspace:'agent-core',limit:5});
  expect(JSON.stringify(legacySearch)).toContain(oldRecord.id);
  const status=await legacy.tools.get('memory_status')!({});
  expect(status.isError).not.toBe(true);
  const external=await ExternalControllerLearningService.initialize({stateDir:path.join(root,'external'),memory:runtime.service,learning:{} as any});
  const episode=await external.startEpisode('host-session-1',{taskKey:'host-task',workspace:'agent-core'},{ownerId:'synthetic-owner',workspaceIdentityKey:'agent-core'});
  const scope={taskId:episode.id};
  const own=serverMock();registerMemoryExperienceTools(own.server,runtime.experience!,async selector=>({...await external.resolveMemoryTask('synthetic-owner',selector?.taskId??''),controllerId:'agent-core-external'}));
  const read=own.tools.get('memory_v2_read')!,write=own.tools.get('memory_v2_write')!;
  const caps=JSON.parse((await read({scope,action:'capabilities',payload:{}})).content[0].text);
  expect(caps.result.writeMode).toBe('experience-v2');
  const recalled=JSON.parse((await read({scope,action:'recall',payload:{query:'Verified architecture',view:'abstract'}})).content[0].text);
  expect(recalled.result.data.hits.some((x:any)=>x.id===oldRecord.id)).toBe(true);
  const started=JSON.parse((await write({scope,action:'task_start',payload:{startKey:'start-a',goal:'Retain a cross-session engineering goal',sourceRefs:[]}})).content[0].text);
  expect(started.result.id).toBeTruthy();
  const resumed=JSON.parse((await read({scope,action:'task_context',payload:{}})).content[0].text);
  expect(resumed.result.data.episodeRef.id).toBe(started.result.id);
  const spoof=await write({scope,action:'task_start',payload:{startKey:'wrong',goal:'Spoof scope',sourceRefs:[],workspaceKey:'other'}});
  expect(spoof.isError).toBe(true);
 });
 it('refuses unbound controller identity even for read methods',async()=>{
  const root=await fixture();const v2=await activeRoot(root);
  const bound=serverMock();registerMemoryExperienceTools(bound.server,v2,async()=>{throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');});
  const result=await bound.tools.get('memory_v2_read')!({action:'capabilities',payload:{}});
  expect(result.isError).toBe(true);
 });
 it('fails closed on an unsupported activation marker',async()=>{
  const root=await fixture();await mkdir(path.join(root,'runtime'),{recursive:true});
  await writeFile(path.join(root,'runtime','memory-v2-activation.json'),'{"schemaVersion":1,"mode":"unsafe"}');
  await expect(initializeAgentCoreMemory(root,path.join(root,'runtime','memory'))).rejects.toThrow('MEMORY_V2_ACTIVATION_INVALID');
 });
});

it('never allows migration state or private Memory roots into packaged archives',async()=>{
 const {isPackagePathAllowed}=await import('../scripts/release/packaging-policy.mjs');
 for(const rel of [
  'runtime/memory/notes/example.md',
  'runtime/memory-v2/notes/example.md',
  'runtime/memory-v2-candidate-20261008/state/experience-manifest.json',
  'runtime/memory-v2-activation.json',
  'runtime/backups/memory-v1-pre-v2-20261008/manifest.json',
  'runtime/tmp/agent-core-memory-cookbook-audit-20261008/README.md',
 ])expect(isPackagePathAllowed(rel),rel).toBe(false);
 expect(isPackagePathAllowed('SubProject/agent-core-memory/dist/index.js')).toBe(true);
 expect(isPackagePathAllowed('docs/history-agent-core/branch-consolidation-20261010/feature.patch')).toBe(false);
 expect(isPackagePathAllowed('docs/history-agent-core/branch-consolidation-20261010/manifest.json')).toBe(false);
 expect(isPackagePathAllowed('SubProject/agent-core-memory/src/memory/service.ts')).toBe(true);
});

it('exposes v2 tools through the real external HTTP MCP handler',async()=>{
 const {createServer}=await import('node:http');
 const {createMcpHttpHandler}=await import('../src/mcp/handler.js');
 const root=await fixture();
 const memory=await activeRoot(root);
 const learning=await LearningService.initialize({enabled:true,stateDir:path.join(root,'learning'),reviewInterval:10,curatorIntervalHours:168},memory as any);
 const external=await ExternalControllerLearningService.initialize({stateDir:path.join(root,'external'),memory:memory as any,learning});
 const handler=createMcpHttpHandler({memoryExperience:memory,memoryService:memory as any,externalControllerLearning:external});
 const http=createServer((req,res)=>{void handler(req,res,{id:'synthetic-scoped-key'} as any);});
 await new Promise<void>((resolve,reject)=>{http.once('error',reject);http.listen(0,'127.0.0.1',resolve);});
 try {
  const address=http.address();if(!address||typeof address==='string')throw Error('LISTENER_NOT_BOUND');
  const url='http://127.0.0.1:'+address.port+'/mcp';
  const query=async(method:string,params:unknown)=>{
   const response=await fetch(url,{method:'POST',headers:{
    'content-type':'application/json','accept':'application/json,text/event-stream',
   },body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
   expect(response.ok).toBe(true);
   const body=await response.text();
   const line=body.split('\n').find(x=>x.startsWith('data:'));
   return JSON.parse(line?line.slice(5):body);
  };
  const list=await query('tools/list',{});
  const names=(list.result?.tools??[]).map((x:any)=>x.name);
  expect(names).toContain('memory_v2_read');
  expect(names).toContain('memory_v2_write');
  const oldClient=await query('tools/call',{name:'memory_v2_read',arguments:{action:'capabilities',payload:{}}});
  expect(oldClient.result?.isError).toBe(true);expect(JSON.stringify(oldClient.result)).toContain('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');expect(JSON.stringify(oldClient.result)).toContain('taskKey');
  const start=await query('tools/call',{name:'controller_learning',arguments:{action:'episode',episodeOperation:'start',taskKey:'http-bound-task',workspace:'agent-core'}});
  expect(start.result?.isError).not.toBe(true);
  const episode=JSON.parse(start.result.content[0].text);
  const caps=await query('tools/call',{name:'memory_v2_read',arguments:{action:'capabilities',scope:{taskId:episode.id},payload:{}}});
  expect(caps.result?.isError).not.toBe(true);
  expect(JSON.stringify(caps.result)).toContain('experience-v2');
 } finally {
  http.closeAllConnections();
  await new Promise<void>(resolve=>http.close(()=>resolve()));
 }
});

it('accepts versioned final-freeze backup and rejects path-traversal markers',async()=>{
 const root=await fixture();await activeRoot(root);
 const runtime=path.join(root,'runtime');
 const old=path.join(runtime,'backups','memory-v1-final-before-v2-20261008','manifest.json');
 const retryName='memory-v1-final-before-v2-20261008-retry-20261008235900-acde1234';
 const retryDir=path.join(runtime,'backups',retryName);
 await mkdir(retryDir,{recursive:true});
 await writeFile(path.join(retryDir,'manifest.json'),await readFile(old));
 const markerPath=path.join(runtime,'memory-v2-activation.json');
 const marker=JSON.parse(await readFile(markerPath,'utf8'));
 marker.backup='runtime/backups/'+retryName+'/manifest.json';
 await writeFile(markerPath,JSON.stringify(marker));
 const selected=await initializeAgentCoreMemory(root,path.join(runtime,'memory'));
 expect(selected.mode).toBe('experience-v2');
 marker.backup='runtime/backups/'+retryName+'/../../memory-v2/manifest.json';
 await writeFile(markerPath,JSON.stringify(marker));
 await expect(initializeAgentCoreMemory(root,path.join(runtime,'memory')))
  .rejects.toThrow('MEMORY_V2_ACTIVATION_INVALID');
});
