import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../../src/memory/initialize.js';
import {registerMemoryExperienceTools} from '../../src/memory/mcp/experience-tools.js';
import {memorySemanticRevision} from '../../src/memory/disclosure.js';
import {MemoryService,exportMemoryTransferV2,previewMemoryTransferV2,importMemoryTransferV2} from '../../src/memory/facade.js';
import {FileMemoryStore} from '../../src/memory/store.js';
const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const r of roots.splice(0)){if(!r.startsWith(path.join(os.tmpdir(),'memory-claim-review-')))throw new Error('Unexpected fixture');await rm(r,{recursive:true,force:true});}});
async function fixture(kind='reality'){
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-claim-review-'));roots.push(root);
 const memory=await initializeMemoryRoot({baseDir:root,memoryRoot:path.join(root,'runtime/memory'),experience:{enabled:true}});
 const record=await memory.remember({title:'Operational claim',content:'Preserve the existing safeguard until its replacement is checked.',provenance:{workspace:'agent-core',files:[]}});
 const scope={taskId:'claim-task',workspaceKey:'agent-core',controllerId:'agent-core-external'};
 const session=memory.controller(scope),source=(await session.captureEvidence({operationId:'source',source:{kind:'controller-text',text:'Synthetic observed source and representative outcome.'}})).source;
 const callbacks=new Map<string,(a:any)=>Promise<any>>();
 registerMemoryExperienceTools({registerTool:(name:string,_:any,cb:any)=>callbacks.set(name,cb)} as any,memory,async()=>scope,undefined,async()=>{},async()=>{});
 const call=async(mode:'read'|'write',action:string,payload:any)=>{
  const raw=await callbacks.get('memory_v2_'+mode)!({scope:{taskId:scope.taskId},action,payload});
  if(raw.isError)throw new Error(JSON.parse(raw.content[0].text).code);
  return JSON.parse(raw.content[0].text).result;
 };
 const contract={validationKind:kind,claim:'Existing safeguard remains applicable',scope:'This registered workspace',authority:{basis:'source',sourceRefs:[source]},
  method:{instructions:'Inspect current source and the applicable condition',lookups:[{source,field:'status'}]},triggers:['dependency-changed','decision-changed'],cadence:{kind:'durable'}};
 const base={memoryId:record.id,expectedRevision:memorySemanticRevision(record)};
 const define=()=>call('write','claim_review',{...base,operation:'define',operationId:'define-review',expectedReviewRevision:null,contract});
 const inspect=()=>call('read','claim_review',{memoryId:record.id});
 return{root,memory,record,source,scope,call,base,define,inspect};
}
it('records a cause-specific contract and a supported attempt without rewriting the Memory claim',async()=>{
 const f=await fixture(),defined=await f.define();
 const input={...f.base,operation:'attempt',operationId:'attempt-one',expectedReviewRevision:defined.revision,outcome:'supported',disposition:'retain',observation:'Current source inspected',evidenceRefs:[f.source],checks:{sourceAccess:'available',method:'pass'}};
 const written=await f.call('write','claim_review',input);expect(written.outcome).toBe('supported');
 const duplicate=await f.call('write','claim_review',input);expect(duplicate.duplicate).toBe(true);
 const view=await f.inspect();expect(view.data.contract.validationKind).toBe('reality');expect(view.data.lastSuccessfulValidation.semanticSupport).toBe('controller-assessed');
 expect(memorySemanticRevision((await f.memory.read(f.record.id,false))!)).toBe(f.base.expectedRevision);
});
it.each(['reality','decision','dependency','relevance'])('keeps unavailable %s checks unresolved without advancing successful validation',async kind=>{
 const f=await fixture(kind),d=await f.define();
 const written=await f.call('write','claim_review',{...f.base,operation:'attempt',operationId:'unavailable-check',expectedReviewRevision:d.revision,outcome:'supported',disposition:'retire',observation:'Source could not be checked',evidenceRefs:[],checks:{sourceAccess:'unavailable',method:'unavailable'}});
 expect(written.outcome).toBe('unresolved');
 const v=(await f.inspect()).data;expect(v.lastAttempt.outcome).toBe('unresolved');expect(v.lastSuccessfulValidation).toBeUndefined();expect(v.guidanceDisposition).toBe('retain');
});
it.each([
 ['decision',{sourceAccess:'available',method:'pass',authority:'supported',effectiveAt:'2999-01-01T00:00:00.000Z'},'retain'],
 ['dependency',{sourceAccess:'available',method:'pass',dependencyBehavior:'unavailable'},'retain'],
 ['reality',{sourceAccess:'available',method:'pass',externalization:{status:'pending'}},'externalize'],
] as const)('does not falsely validate incomplete %s checks',async(kind,checks,disposition)=>{
 const f=await fixture(kind),d=await f.define();
 const result=await f.call('write','claim_review',{...f.base,operation:'attempt',operationId:'incomplete-check',expectedReviewRevision:d.revision,outcome:'supported',disposition,observation:'Partial evidence only',evidenceRefs:[f.source],checks});
 expect(result.outcome).toBe('unresolved');expect((await f.inspect()).data.lastSuccessfulValidation).toBeUndefined();
});
it('keeps a rare safeguard due only on its declared trigger and marks task irrelevance without falsifying the claim',async()=>{
 const f=await fixture('relevance'),d=await f.define();
 const first=await f.inspect();expect(first.data.reviewDue.reasons).not.toContain('age');
 const due=await f.call('read','claim_review',{memoryId:f.record.id,events:['dependency-changed']});expect(due.data.reviewDue.reasons).toContain('event:dependency-changed');
 const result=await f.call('write','claim_review',{...f.base,operation:'attempt',operationId:'different-task',expectedReviewRevision:d.revision,outcome:'supported',disposition:'retire',observation:'No current task need',evidenceRefs:[f.source],checks:{sourceAccess:'available',method:'pass',applicable:'no'}});
 expect(result.outcome).toBe('not-applicable');expect((await f.inspect()).data.guidanceDisposition).toBe('retain');
});
it('rejects stale record revisions and conflicting operation reuse',async()=>{
 const f=await fixture(),d=await f.define();
 await expect(f.call('write','claim_review',{...f.base,operation:'define',operationId:'define-review',expectedReviewRevision:null,contract:{...(await f.inspect()).data.contract,claim:'Conflicting replacement'}})).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
 await f.memory.update(f.record.id,{content:'A newer claim revision with an exception.'});
 await expect(f.call('write','claim_review',{...f.base,operation:'attempt',operationId:'stale-check',expectedReviewRevision:d.revision,outcome:'supported',disposition:'retain',observation:'Old claim',evidenceRefs:[f.source],checks:{sourceAccess:'available',method:'pass'}})).rejects.toThrow('MEMORY_REVISION_CONFLICT');
});
it('preserves the last successful check when later evidence is unavailable or contradicts unchanged source bytes',async()=>{
 const f=await fixture(),d=await f.define();
 const common={...f.base,operation:'attempt',outcome:'supported',disposition:'retain',observation:'Current representative check',evidenceRefs:[f.source],checks:{sourceAccess:'available',method:'pass'}};
 const first=await f.call('write','claim_review',{...common,operationId:'first-pass',expectedReviewRevision:d.revision});
 const good=(await f.inspect()).data.lastSuccessfulValidation;
 const missing=await f.call('write','claim_review',{...common,operationId:'source-offline',expectedReviewRevision:first.revision,checks:{sourceAccess:'unavailable',method:'unavailable'}});
 const unresolved=(await f.inspect()).data;
 expect(unresolved.lastSuccessfulValidation).toEqual(good);expect(unresolved.currentValidation.status).toBe('unresolved');expect(unresolved.reviewDue.reasons).toContain('latest-check:unresolved');
 await f.call('write','claim_review',{...common,operationId:'new-counterexample',expectedReviewRevision:missing.revision,outcome:'contradicted',disposition:'revise',checks:{sourceAccess:'available',method:'fail'}});
 const contradicted=(await f.inspect()).data;
 expect(contradicted.lastSuccessfulValidation).toEqual(good);expect(contradicted.currentValidation.status).toBe('contradicted');expect(contradicted.guidanceDisposition).toBe('revise');
 expect(memorySemanticRevision((await f.memory.read(f.record.id,false))!)).toBe(f.base.expectedRevision);
});
it('keeps review metadata through complete backup and explicitly omits it from knowledge-only export',async()=>{
 const f=await fixture(),d=await f.define();
 await f.call('write','claim_review',{...f.base,operation:'attempt',operationId:'check-before-backup',expectedReviewRevision:d.revision,outcome:'supported',disposition:'retain',observation:'Checked before backup',evidenceRefs:[f.source],checks:{sourceAccess:'available',method:'pass'}});
 const policy={allowedWorkspaces:['agent-core'],allowUnscoped:true},memoryRoot=path.join(f.root,'runtime/memory');
 const bundle=await exportMemoryTransferV2(memoryRoot,{...policy,completeness:'complete'});
 expect(bundle.manifest.entries.some(e=>e.path.startsWith('state/claim-reviews/'))).toBe(true);
 expect(previewMemoryTransferV2(bundle,policy).unresolvedRefs).toEqual([]);
 const target=await mkdtemp(path.join(os.tmpdir(),'memory-claim-review-'));roots.push(target);
 await importMemoryTransferV2(bundle,target,policy);
 const restored=await MemoryService.initialize(target,target);
 const view:any=await restored.controller(f.scope).readClaimReview({memoryId:f.record.id});
 expect(view.data.lastSuccessfulValidation.operationId).toBe('check-before-backup');expect(view.data.history).toEqual({contracts:1,attempts:1});
 const knowledge=await exportMemoryTransferV2(memoryRoot,{...policy,completeness:'knowledge-only'});
 expect(knowledge.manifest.omitted).toContain('claim-reviews');expect(knowledge.manifest.entries.some(e=>e.path.startsWith('state/claim-reviews/'))).toBe(false);
});
it('refuses foreign task evidence, preserves Native actions and returns a bounded read without partial approval metadata',async()=>{
 const f=await fixture();
 const foreign=await f.memory.controller({...f.scope,taskId:'other-task'}).captureEvidence({operationId:'foreign',source:{kind:'controller-text',text:'Other task private evidence'}});
 const contract={...(await f.inspect()).data.contract,validationKind:'reality',claim:'Scoped claim',scope:'agent-core',authority:{basis:'source',sourceRefs:[foreign.source]},method:{instructions:'Read source',lookups:[]},triggers:[],cadence:{kind:'durable'}};
 await expect(f.call('write','claim_review',{...f.base,operation:'define',operationId:'foreign-review',expectedReviewRevision:null,contract})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
 await f.define();
 expect((await f.call('read','claim_review',{memoryId:f.record.id,budget:{maxBytes:512}})).status).toBe('insufficient-budget');
 const native=new Map<string,(a:any)=>Promise<any>>();
 registerMemoryExperienceTools({registerTool:(name:string,_:any,cb:any)=>native.set(name,cb)} as any,f.memory,async()=>({...f.scope,controllerId:'native'}));
 const denied=await native.get('memory_v2_read')!({action:'claim_review',payload:{memoryId:f.record.id}});
 expect(denied.isError).toBe(true);expect(JSON.parse(denied.content[0].text).code).toBe('MEMORY_INPUT_INVALID');
});
it('requires rebinding the contract after the underlying Memory revision changes',async()=>{
 const f=await fixture(),d=await f.define(),contract=(await f.inspect()).data.contract;
 await f.memory.update(f.record.id,{content:'A changed claim requiring a newly scoped review.'});
 const revised=memorySemanticRevision((await f.memory.read(f.record.id,false))!);
 const attempt={...f.base,expectedRevision:revised,operation:'attempt',operationId:'check-new-revision',expectedReviewRevision:d.revision,outcome:'supported',disposition:'retain',observation:'Current claim checked',evidenceRefs:[f.source],checks:{sourceAccess:'available',method:'pass'}};
 await expect(f.call('write','claim_review',attempt)).rejects.toThrow('MEMORY_REVISION_CONFLICT');
 const rebound=await f.call('write','claim_review',{...f.base,expectedRevision:revised,operation:'define',operationId:'rebind-contract',expectedReviewRevision:d.revision,contract});
 await f.call('write','claim_review',{...attempt,expectedReviewRevision:rebound.revision});
 expect((await f.inspect()).data.reviewDue.reasons).not.toContain('record-revision-changed');
});
it('rechecks host admission after waiting to commit and writes no review for a replaced task',async()=>{
 const f=await fixture();let current=true,entered!:()=>void,release!:()=>void;
 const queued=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
 const original=FileMemoryStore.prototype.transact;
 vi.spyOn(FileMemoryStore.prototype,'transact').mockImplementation(function(keys,planner){
  if(keys.some(key=>key.startsWith('claim-reviews/'))){entered();return gate.then(()=>original.call(this,keys,planner));}
  return original.call(this,keys,planner);
 });
 const controller=f.memory.controller(f.scope,'baseline-v1',{scope:f.scope,deadlineMs:Date.now()+15000,assertScopeCurrent:()=>{if(!current)throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');}});
 const pending=controller.writeClaimReview({...f.base,operation:'define',operationId:'queued-review',expectedReviewRevision:null,contract:{validationKind:'reality',claim:'Scoped claim',scope:'agent-core',authority:{basis:'source',sourceRefs:[f.source]},method:{instructions:'Check current evidence',lookups:[]},triggers:[],cadence:{kind:'durable'}}});
 const result=pending.then(()=>null,error=>error);
 await queued;current=false;release();
 expect((await result)?.message).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');expect((await f.inspect()).data.status).toBe('unknown');
});
