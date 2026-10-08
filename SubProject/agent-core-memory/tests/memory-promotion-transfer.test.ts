import {afterEach,expect,test} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {initializeStandaloneMemory,MemoryService,exportMemoryTransferV2,previewMemoryTransferV2,importMemoryTransferV2,type MemoryTransferV2Bundle,type RecordExperience,type ConsolidationPlan} from '../src/index.js';
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function root(){const p=await mkdtemp(path.join(os.tmpdir(),'memory-fi1-'));roots.push(p);return p;}
const transferPolicy={allowedWorkspaces:['agent-core'],allowUnscoped:true};
const review=async(plan:ConsolidationPlan)=>({digest:plan.digest,reviewer:'synthetic-host',reason:'Public integration fixture reviewed'});
const scope={workspaceKey:'agent-core',taskId:'integration-task',controllerId:'A'};
const experience=(from?:string):RecordExperience=>({schemaVersion:1,kind:'observation',retention:'durable',epistemic:from?'fact':'observation',temporal:from?'dynamic':'unknown',validity:from?{state:'known',from:{precision:'instant',value:from},to:null}:{state:'unknown'},verification:{status:'unverified',evidence:[]},sourceRefs:[]});
const T1='2025-01-01T00:00:00.000Z',T2='2025-02-01T00:00:00.000Z';
async function fixture(kind:'retain'|'create'|'transition'){
 const dir=await root(),service=await initializeStandaloneMemory({baseDir:dir,memoryRoot:dir,experience:{enabled:true},consolidation:{review}}),A=service.controller(scope);
 let header=await A.startEpisode({startKey:'integration-start',goal:'Preserve cross-phase state',sourceRefs:[]});
 const evidence=(await A.captureEvidence({operationId:'integration-evidence',source:{kind:'controller-text',text:'Synthetic reviewed observation; an old success remains useful'}})).source;
 let actions:any[];
 if(kind==='transition'){
  // Typed records enter through the public reviewed promotion API; legacy
  // remember() intentionally does not accept experience classification.
  const bootstrap=await A.prepareConsolidation({episodeId:header.id,expectedRevision:header.revision,operationId:'bootstrap-states',proposal:{actions:[['Old state','alpha',T1],['New state','beta',T2]].map(([title,state,from],i)=>({actionId:`seed-state-${i}`,kind:'create',inputRefs:[evidence],reason:'Reviewed synthetic historical state',value:{title,content:`Deployment state: ${state}`,experience:{...experience(from),sourceRefs:[evidence]}}}))}});
  const created=await A.applyConsolidation({planId:bootstrap.id,expectedPlanDigest:bootstrap.digest,operationId:'apply-bootstrap-states'});header={...header,revision:created.episodeRevision};const old=(await service.read(created.canonicalRefs[0].id,false))!,next=(await service.read(created.canonicalRefs[1].id,false))!;
  const page=await A.recall({limit:20,budget:{maxBytes:65536}});if(page.status==='insufficient-budget')throw new Error('fixture budget');
  const reference=(id:string)=>({kind:'memory' as const,id,revision:page.data.hits.find(hit=>hit.id===id)!.revision});const predecessor=reference(old.id),successor=reference(next.id);
  const event=await A.appendEvent({episodeId:header.id,expectedRevision:header.revision,operationId:'transition-observed',event:{kind:'correction',summary:'State changed from alpha to beta',sourceRefs:[predecessor,successor,evidence],stateChanges:[],temporalAssertion:{kind:'state-transition',predecessor,successor,effectiveAt:T2,evidence:[evidence]}}});header={...header,revision:event.revision};
  actions=[{actionId:'transition-state',kind:'supersede',inputRefs:[event.eventRef],reason:'Reviewed state transition',predecessor,successor,effectiveAt:T2,evidence:[event.eventRef]}];
 }else actions=[{actionId:'promote-observation',kind,inputRefs:[evidence],reason:'Retain reviewed experience',...(kind==='create'?{value:{content:'Synthetic useful recovered strategy',experience:{...experience(),sourceRefs:[evidence]}}}:{})}];
 const input={episodeId:header.id,expectedRevision:header.revision,operationId:'prepare-integration',proposal:{actions}},plan=await A.prepareConsolidation(input);
 return {dir,service,A,header,evidence,input,plan,apply:{planId:plan.id,expectedPlanDigest:plan.digest,operationId:'apply-integration'}};
}
async function clone(dir:string){const bundle=await exportMemoryTransferV2(dir,{...transferPolicy,completeness:'complete'});expect(previewMemoryTransferV2(bundle,transferPolicy).unresolvedRefs).toEqual([]);const destination=await root();await importMemoryTransferV2(bundle,destination,transferPolicy);for(const entry of bundle.manifest.entries)expect(await readFile(path.join(destination,entry.path))).toEqual(await readFile(path.join(dir,entry.path)));const service=await MemoryService.initialize(destination,destination,undefined,{consolidation:{review}});return{dir:destination,service,bundle,B:service.controller({...scope,controllerId:'B'})};}
for(const kind of ['retain','create','transition'] as const)for(const phase of ['pending','applied'] as const)test(`FI-1 ${phase} ${kind} public roundtrip preserves apply, replay and continuation`,async()=>{
 const f=await fixture(kind);const prior=phase==='applied'?await f.A.applyConsolidation(f.apply):undefined;
 const restored=await clone(f.dir);
 if(kind==='transition')for(const ref of f.plan.actions[0].transition!.audit.after){if(phase==='pending')expect(restored.bundle.manifest.retainedRefs).not.toContainEqual(ref);else expect(restored.bundle.manifest.retainedRefs).toContainEqual(ref);}
 if(phase==='pending')expect(await restored.B.prepareConsolidation(f.input)).toEqual(f.plan);
 const receipt=await restored.B.applyConsolidation(f.apply);expect(receipt.duplicate).toBe(phase==='applied');if(prior)expect(receipt).toEqual({...prior,duplicate:true});
 expect(await restored.B.applyConsolidation(f.apply)).toEqual({...receipt,duplicate:true});expect(receipt.canonicalRefs).toHaveLength(kind==='retain'?0:kind==='create'?1:2);
 const context=await restored.B.getTaskContext();if(context.status==='insufficient-budget')throw new Error('context budget');expect(context.data.episode?.revision).toBe(f.header.revision+1);
 let cursor:string|undefined,text='';do{const page=await restored.B.expand({source:context.data.episodeRef,view:'episode',budget:{maxBytes:8192},...(cursor?{cursor}:{})});if(page.status==='insufficient-budget')throw new Error('expansion budget');text+=page.data.text;cursor=page.data.nextCursor;}while(cursor);
 expect(JSON.parse(text).workingState.some((x:any)=>x.kind==='goal'&&x.text==='Preserve cross-phase state')).toBe(true);
 if(kind==='create')expect((await restored.service.read(receipt.canonicalRefs[0].id,false))?.content).toBe('Synthetic useful recovered strategy');
 if(kind==='transition'){
  const before=await restored.B.recall({asOf:T1,limit:20,budget:{maxBytes:65536}}),after=await restored.B.recall({asOf:T2,limit:20,budget:{maxBytes:65536}});if(before.status==='insufficient-budget'||after.status==='insufficient-budget')throw new Error('temporal budget');
  expect(before.data.hits.filter(h=>receipt.canonicalRefs.some(ref=>ref.id===h.id)).map(h=>h.title)).toEqual(['Old state']);expect(after.data.hits.filter(h=>receipt.canonicalRefs.some(ref=>ref.id===h.id)).map(h=>h.title)).toEqual(['New state']);
 }
 const second=await clone(restored.dir);for(const ref of receipt.canonicalRefs)expect(second.bundle.manifest.retainedRefs).toContainEqual(ref);expect(await second.B.applyConsolidation(f.apply)).toEqual({...receipt,duplicate:true});
});
const hash=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
function stable(value:any):string{return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
function corrupt(bundle:MemoryTransferV2Bundle,key:string,value:any){const original=new Map(bundle.chunks.map(c=>[c.digest,Buffer.from(c.data,'base64')])),chunks=new Map<string,string>();bundle.manifest.entries=bundle.manifest.entries.map(entry=>{const bytes=entry.path===key?Buffer.from(JSON.stringify(value)+'\n'):Buffer.concat(entry.chunks.map(d=>original.get(d)!)),digest=hash(bytes);chunks.set(digest,bytes.toString('base64'));return{...entry,bytes:bytes.length,digest,chunks:[digest]};});bundle.chunks=[...chunks].map(([digest,data])=>({digest,data}));bundle.manifestDigest=hash(stable(bundle.manifest));return bundle;}
for(const invalid of ['missing','null','string','unsafe-id','unknown-field'])test(`FI-1 strict saved-plan schema rejects ${invalid} eligibleIds before activation`,async()=>{
 const f=await fixture('retain'),bundle=await exportMemoryTransferV2(f.dir,{...transferPolicy,completeness:'complete'}),key=`state/consolidation/${f.plan.id}.json`,saved=JSON.parse(await readFile(path.join(f.dir,key),'utf8'));
 if(invalid==='missing')delete saved.eligibleIds;else if(invalid==='null')saved.eligibleIds=null;else if(invalid==='string')saved.eligibleIds='not-an-array';else if(invalid==='unsafe-id')saved.eligibleIds=['../escape'];else saved.unexpectedField=true;
 corrupt(bundle,key,saved);expect(()=>previewMemoryTransferV2(bundle,transferPolicy)).toThrow('MEMORY_TRANSFER_SCHEMA_INVALID');const destination=await root();await expect(importMemoryTransferV2(bundle,destination,transferPolicy)).rejects.toThrow('MEMORY_TRANSFER_SCHEMA_INVALID');await expect(readFile(path.join(destination,'state/experience-manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
 await writeFile(path.join(f.dir,key),JSON.stringify(saved)+'\n');await expect(exportMemoryTransferV2(f.dir,{...transferPolicy,completeness:'complete'})).rejects.toThrow('MEMORY_TRANSFER_SCHEMA_INVALID');await expect(f.A.applyConsolidation(f.apply)).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
});

for(const corruption of ['projected-hash','actual-input','applied-output'])test(`FI-2 pending/applied transfer rejects malformed ${corruption} references`,async()=>{
 const f=await fixture('transition');const receipt=corruption==='applied-output'?await f.A.applyConsolidation(f.apply):undefined;
 const bundle=await exportMemoryTransferV2(f.dir,{...transferPolicy,completeness:'complete'});
 let key:string,saved:any;
 if(receipt){
  const ref=receipt.canonicalRefs[0];key=`archive/manifests/memory-${ref.id}-${ref.revision.slice(7)}.json`;
  bundle.manifest.entries=bundle.manifest.entries.filter(entry=>entry.path!==key);corrupt(bundle,'',null);
 }else {
  key=`state/consolidation/${f.plan.id}.json`;saved=JSON.parse(await readFile(path.join(f.dir,key),'utf8'));
  saved.plan.actions[0].transition.audit[corruption==='projected-hash'?'after':'before'][0].revision='sha256:'+'0'.repeat(64);
  const {digest:_,status:__,...body}=saved.plan;saved.plan.digest=hash(stable(['consolidation-plan/v1',body]));corrupt(bundle,key,saved);
 }
 const code=corruption==='projected-hash'?'MEMORY_SOURCE_UNAVAILABLE':'MEMORY_TRANSFER_UNRESOLVED_REF';
 expect(()=>previewMemoryTransferV2(bundle,transferPolicy)).toThrow(code);const destination=await root();await expect(importMemoryTransferV2(bundle,destination,transferPolicy)).rejects.toThrow(code);await expect(readFile(path.join(destination,'state/experience-manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
 if(receipt)await rm(path.join(f.dir,key));else await writeFile(path.join(f.dir,key),JSON.stringify(saved)+'\n');
 await expect(exportMemoryTransferV2(f.dir,{...transferPolicy,completeness:'complete'})).rejects.toThrow(code);
});
