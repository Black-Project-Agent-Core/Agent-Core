import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {afterEach,expect,test} from 'vitest';
import {initializeStandaloneMemory,MemoryService} from '../src/index.js';
import {memorySemanticRevision} from '../src/memory/disclosure.js';
import {legacyExperience} from '../src/memory/experience-types.js';
import {buildProjectSynthesisAction,encodeProjectSynthesis} from '../src/memory/project-synthesis.js';
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function setup(){const root=await mkdtemp(path.join(os.tmpdir(),'memory-synthesis-'));roots.push(root);const service=await initializeStandaloneMemory({baseDir:root,memoryRoot:root,experience:{enabled:true},consolidation:{review:async plan=>({digest:plan.digest,reviewer:'synthetic-host',reason:'Review fixture'})}});const scope={workspaceKey:'agent-core',taskId:'task-synthesis',controllerId:'synthetic'},session=service.controller(scope),header=await session.startEpisode({startKey:'start-synthesis',goal:'Summarize bounded project evidence',sourceRefs:[]});const source=await service.remember({content:'Source observation',provenance:{workspace:'agent-core',files:[]}}),ref={kind:'memory' as const,id:source.id,revision:memorySemanticRevision(source)};return{root,service,scope,session,header,ref};}
const proposal=(ref:any,target?:any)=>buildProjectSynthesisAction({actionId:'synthesis-action',value:{schemaVersion:1,projectKey:'agent-core',claims:[{text:'Project uses ordered CAS',refs:[ref]}],gaps:['Benefits unmeasured']},experience:legacyExperience(),target});
const prepare=(header:any,action:any,operationId='prepare-synthesis')=>({episodeId:header.id,expectedRevision:header.revision,operationId,proposal:{actions:[action]}});
const apply=(plan:any)=>({planId:plan.id,expectedPlanDigest:plan.digest,operationId:'apply-synthesis'});
async function notes(root:string){return Promise.all((await readdir(path.join(root,'notes'))).sort().map(async file=>[file,await readFile(path.join(root,'notes',file),'utf8')]));}
test('P15 promotion rejects envelope citations outside input and evidence refs',async()=>{
 const{session,header,ref}=await setup();const action:any=proposal(ref);action.value.content=encodeProjectSynthesis({schemaVersion:1,projectKey:'agent-core',claims:[{text:'Unbacked claim',refs:[{...ref,id:'fabricated-source'}]}],gaps:[]});await expect(session.prepareConsolidation(prepare(header,action))).rejects.toThrow('MEMORY_CONSOLIDATION_INVALID');
});
test('P15 direct malformed synthesis and empty refresh cannot replace last good synthesis',async()=>{
 const{session,header,ref,root,service}=await setup(),first=await session.prepareConsolidation(prepare(header,proposal(ref))),receipt=await session.applyConsolidation(apply(first)),target=receipt.canonicalRefs[0],before=await notes(root);
 for(const content of ['ordinary note',JSON.stringify({schemaVersion:1,projectKey:'agent-core',claims:[],gaps:[]})]){const action:any=proposal(ref,target);action.value.content=content;await expect(session.prepareConsolidation(prepare({...header,revision:2},action,'refresh-'+content.length))).rejects.toThrow('MEMORY_CONSOLIDATION_INVALID');}
 expect(await notes(root)).toEqual(before);expect((await service.read(target.id,false))!.category).toBe('project-synthesis');
});
for(const mode of ['amend','forget','scope'] as const)test(`P15 ${mode} of dependency between preview and apply leaves last synthesis and unrelated bytes intact`,async()=>{
 const{session,header,ref,root,service}=await setup(),plan=await session.prepareConsolidation(prepare(header,proposal(ref)));
 if(mode==='amend')await service.update(ref.id,{content:'Changed evidence'});if(mode==='forget')await service.lifecycle(ref.id,'forget-source','forget');if(mode==='scope')await service.update(ref.id,{provenance:{workspace:'foreign',files:[]}});
 const before=await notes(root);await expect(session.applyConsolidation(apply(plan))).rejects.toThrow();expect(await notes(root)).toEqual(before);
});
test('P15 historical memory input cannot masquerade as current synthesis dependency',async()=>{
 const{session,header,ref,service}=await setup();await service.update(ref.id,{content:'Later corrected observation'});await expect(session.prepareConsolidation(prepare(header,proposal(ref)))).rejects.toThrow('MEMORY_REVISION_CONFLICT');
});
test('P15 host review mutation rechecks current dependency and cannot publish stale synthesis',async()=>{
 const{session,header,ref,root,scope}=await setup(),plan=await session.prepareConsolidation(prepare(header,proposal(ref))),service=await MemoryService.initialize(root,root,undefined,{consolidation:{review:async plan=>{await service.update(ref.id,{content:'Changed during review'});return{digest:plan.digest,reviewer:'synthetic-host',reason:'Review fixture'};}}});await expect(service.controller(scope).applyConsolidation(apply(plan))).rejects.toThrow('MEMORY_REVISION_CONFLICT');expect((await notes(root)).length).toBe(1);
});
test('P15 scoped artifact dependency and operation replay preserve exact receipt across restart',async()=>{
 const{session,header,root,scope}=await setup(),source=(await session.captureEvidence({operationId:'capture-evidence',source:{kind:'controller-text',text:'Original bounded evidence'}})).source,plan=await session.prepareConsolidation(prepare(header,proposal(source))),receipt=await session.applyConsolidation(apply(plan));
 const restarted=(await MemoryService.initialize(root,root)).controller(scope);expect(await restarted.applyConsolidation(apply(plan))).toEqual({...receipt,duplicate:true});expect((await notes(root))).toHaveLength(2);
});
test('P15 indirect synthesis self-reference is rejected through exact dependency lineage',async()=>{
 const{session,header,ref,service}=await setup(),first=await session.prepareConsolidation(prepare(header,proposal(ref))),receipt=await session.applyConsolidation(apply(first)),target=receipt.canonicalRefs[0];
 const link=await service.remember({content:'Derived observation',provenance:{workspace:'agent-core',files:[]}});await (service as any).store.mutate(link.id,(r:any)=>({...r,experience:{...r.experience,sourceRefs:[target]}}));const linked=(await service.read(link.id,false))!,source={kind:'memory' as const,id:linked.id,revision:memorySemanticRevision(linked)};
 await expect(session.prepareConsolidation(prepare({...header,revision:2},proposal(source,target),'cycle-preview'))).rejects.toThrow('MEMORY_CONSOLIDATION_INVALID');
});
