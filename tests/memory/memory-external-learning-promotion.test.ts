import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../../src/memory/initialize.js';
import {registerMemoryExperienceTools} from '../../src/memory/mcp/experience-tools.js';
import {disclosureDigest,memorySemanticRevision} from '../../src/memory/disclosure.js';
import {exportMemoryTransferV2,importMemoryTransferV2,MemoryService} from '../../src/memory/facade.js';
import {FileMemoryStore} from '../../src/memory/store.js';
import {fingerprintText} from '../../src/memory/transaction.js';
import {MemoryRetrievalLedger} from '../../src/memory/retrieval-ledger.js';
import {resolveMemoryPaths} from '../../src/memory/paths.js';
const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0)){if(!root.startsWith(path.join(os.tmpdir(),'memory-external-promotion-')))throw Error('Unexpected fixture');await rm(root,{recursive:true,force:true});}});
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-external-promotion-'));roots.push(root);
 const memory=await initializeMemoryRoot({baseDir:root,memoryRoot:path.join(root,'runtime/memory'),experience:{enabled:true}});
 const record=await memory.remember({title:'Vault snapshot safeguard',content:'Keep the original safeguard and do not delete snapshots.',provenance:{workspace:'agent-core',files:[]}});
 const neighbor=await memory.remember({title:'Garden water schedule',content:'Water the garden on the selected day.',provenance:{workspace:'agent-core',files:[]}});
 const scope={taskId:'promotion-task',workspaceKey:'agent-core',controllerId:'agent-core-external'};
 const session=memory.controller(scope);
 const callbacks=new Map<string,(a:any)=>Promise<any>>();
 registerMemoryExperienceTools({registerTool:(name:string,_:any,cb:any)=>callbacks.set(name,cb)} as any,memory,async()=>scope,undefined,async()=>{},async()=>{});
 const call=async(mode:'read'|'write',action:string,payload:any)=>{
  const raw=await callbacks.get('memory_v2_'+mode)!({action,scope:{taskId:scope.taskId},payload});
  if(raw.isError)throw Error(JSON.parse(raw.content[0].text).code);
  return JSON.parse(raw.content[0].text).result;
 };
 const recall=async(query:string)=>{
  const result=await call('read','recall',{query,limit:1,budget:{maxBytes:16000}});
  const rows=(await readFile(path.join(root,'runtime/memory/state/retrieval-ledger.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  return {id:rows.at(-1).attemptId,result};
 };
 const inspect=()=>call('read','recall_repair',{memoryId:record.id});
 const prepare=async()=>{
  const miss=await recall('safekeepalias'),found=await recall('Vault snapshot safeguard');
  expect(miss.result.data.hits.some((h:any)=>h.id===record.id)).toBe(false);
  expect(found.result.data.hits.some((h:any)=>h.id===record.id)).toBe(true);
  const input={operation:'preview',operationId:'preview-alias',memoryId:record.id,expectedRevision:memorySemanticRevision(record),expectedRepairRevision:null,
   retrievalAttemptId:miss.id,foundAttemptId:found.id,keywords:['safekeepalias','restorealias'],observedCause:'keyword-gap'};
  return {input,preview:await call('write','recall_repair',input)};
 };
 return{root,memory,record,neighbor,scope,session,call,recall,inspect,prepare};
}
it('repairs only target keywords atomically, replays idempotently and verifies original/paraphrase/negative ledger attempts',async()=>{
 const f=await fixture(),p=await f.prepare();
 const before=await f.memory.read(f.neighbor.id,false);
 const input={operation:'apply',operationId:'apply-alias',memoryId:f.record.id,expectedRevision:p.preview.recordRevision,expectedRepairRevision:p.preview.revision,repairId:p.input.operationId};
 const applied=await f.call('write','recall_repair',input);
 expect(applied.indexStatus).toBe('current');expect((await f.call('write','recall_repair',input)).duplicate).toBe(true);
 const record=(await f.memory.read(f.record.id,false))!;
 expect(record.content).toBe(f.record.content);expect(record.keywords).toContain('safekeepalias');expect(await f.memory.read(f.neighbor.id,false)).toEqual(before);
 const original=await f.recall('safekeepalias'),paraphrase=await f.recall('restorealias'),negative=await f.recall('garden water schedule');
 const verified=await f.call('write','recall_repair',{operation:'verify',operationId:'verify-alias',memoryId:f.record.id,expectedRevision:applied.recordRevision,expectedRepairRevision:applied.revision,repairId:p.input.operationId,
  originalAttemptId:original.id,paraphraseAttemptId:paraphrase.id,negativeAttemptId:negative.id});
 expect(verified.entries[0].status).toBe('verified');expect(verified.semanticBenefit).toBe('unknown');
 expect(JSON.stringify((await f.inspect()).state)).not.toContain('queryText');
},60000);
it('preserves rejected keyword hashes across complete backup and cannot re-propose them',async()=>{
 const f=await fixture(),p=await f.prepare();
 const rejected=await f.call('write','recall_repair',{operation:'reject',operationId:'reject-alias',memoryId:f.record.id,expectedRevision:p.preview.recordRevision,expectedRepairRevision:p.preview.revision,repairId:p.input.operationId});
 await expect(f.call('write','recall_repair',{...p.input,operationId:'try-rejected-again',expectedRepairRevision:rejected.revision})).rejects.toThrow('MEMORY_PRESERVATION_REQUIRED');
 const bundle=await exportMemoryTransferV2(path.join(f.root,'runtime/memory'),{completeness:'complete',allowedWorkspaces:['agent-core'],allowUnscoped:true});
 expect(bundle.manifest.entries.some(e=>e.path.startsWith('state/recall-repairs/'))).toBe(true);
 const target=await mkdtemp(path.join(os.tmpdir(),'memory-external-promotion-'));roots.push(target);await importMemoryTransferV2(bundle,target,{allowedWorkspaces:['agent-core'],allowUnscoped:true});
 const restored=await MemoryService.initialize(target,target);
 expect((await restored.controller(f.scope).readRecallRepair({memoryId:f.record.id})).state.blockedKeywords).toHaveLength(2);
 const knowledge=await exportMemoryTransferV2(path.join(f.root,'runtime/memory'),{completeness:'knowledge-only',allowedWorkspaces:['agent-core'],allowUnscoped:true});
 expect(knowledge.manifest.entries.some(e=>e.path.startsWith('state/recall-repairs/'))).toBe(false);
},60000);
it('refuses stale Memory, conflicting operations, foreign task attempts and Native use',async()=>{
 const f=await fixture(),p=await f.prepare();
 await expect(f.call('write','recall_repair',{...p.input,keywords:['different']})).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
 await f.memory.update(f.record.id,{content:'Changed safeguard with a newer exception.'});
 await expect(f.call('write','recall_repair',{operation:'apply',operationId:'stale-apply',memoryId:f.record.id,expectedRevision:p.preview.recordRevision,expectedRepairRevision:p.preview.revision,repairId:p.input.operationId})).rejects.toThrow('MEMORY_REVISION_CONFLICT');
 const foreign=f.memory.controller({...f.scope,taskId:'foreign-task'});
 await expect(foreign.writeRecallRepair({...p.input,operationId:'foreign-preview',expectedRevision:memorySemanticRevision((await f.memory.read(f.record.id,false))!),expectedRepairRevision:p.preview.revision})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
 const native=f.memory.controller({...f.scope,controllerId:'native'});
 expect(native.capabilities().recallRepair).toBeUndefined();await expect(native.readRecallRepair({memoryId:f.record.id})).rejects.toMatchObject({code:'MEMORY_SCOPE_MISMATCH'});
},60000);
it('rechecks task admission after waiting for a repair commit and leaves the target untouched',async()=>{
 const f=await fixture(),p=await f.prepare();let current=true,entered!:()=>void,release!:()=>void;
 const queued=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;}),original=FileMemoryStore.prototype.transact;
 vi.spyOn(FileMemoryStore.prototype,'transact').mockImplementation(function(keys,planner){if(keys.some(key=>key.startsWith('recall-repairs/'))){entered();return gate.then(()=>original.call(this,keys,planner));}return original.call(this,keys,planner);});
 const controller=f.memory.controller(f.scope,'baseline-v1',{scope:f.scope,deadlineMs:Date.now()+15000,assertScopeCurrent:()=>{if(!current)throw Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');}});
 const pending=controller.writeRecallRepair({operation:'apply',operationId:'queued-apply',memoryId:f.record.id,expectedRevision:p.preview.recordRevision,expectedRepairRevision:p.preview.revision,repairId:p.input.operationId});
 const result=pending.then(()=>null,error=>error);await queued;current=false;release();
 expect((await result)?.message).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
 expect(memorySemanticRevision((await f.memory.read(f.record.id,false))!)).toBe(p.preview.recordRevision);
},60000);
async function derivationFixture(){
 const f=await fixture(),text='Assistant proposal: do not delete retained evidence. 🚀';
 const source=await f.session.captureEvidence({operationId:'derivation-source',source:{kind:'controller-text',text}});
 const input={schemaVersion:1,operationId:'derive-original',source:source.source,sourceTextDigest:'sha256:'+fingerprintText(text),range:{start:0,end:Array.from(text).length},
  parserRevision:'literal/v1',normalizerRevision:'preserve-negation/v1',policyDigest:disclosureDigest('test-policy'),promptDigest:disclosureDigest('test-extraction'),referenceTime:'2026-10-22T00:00:00.000Z',
  declaredRole:'assistant',claims:[{text:'Do not delete evidence',range:{start:0,end:51}}],excludedRanges:[],lostRanges:[],corrections:[]};
 return{...f,text,input};
}
it('retains exact source/ranges, unknown model and separate immutable interpretation receipts',async()=>{
 const f=await derivationFixture(),first=await f.call('write','derivation',f.input);
 const read=await f.call('read','derivation',{source:first.artifact.source});
 expect(read.sourceValidation).toBe('available');expect(read.observedModel).toBeNull();expect(read.instructionAuthority).toBe(false);expect(read.declaredRole).toBe('assistant');
 expect(read.observedRole).toBe('unknown');expect(read.sourceTextDigest).toBe('sha256:'+fingerprintText(f.text));
 const next=await f.call('write','derivation',{...f.input,operationId:'derive-revised',normalizerRevision:'preserve-negation/v2',previous:first.artifact.source});
 expect(next.interpretationDigest).not.toBe(first.interpretationDigest);
 expect(await f.call('read','derivation',{source:first.artifact.source})).toEqual(read);
 expect((await f.call('write','derivation',f.input)).artifact.duplicate).toBe(true);
},60000);
it('does not convert an unavailable retrieval into a repairable knowledge miss',async()=>{
 const f=await fixture(),p=await f.prepare();
 const ledger=new MemoryRetrievalLedger(resolveMemoryPaths(f.root,path.join(f.root,'runtime/memory'))),miss=await ledger.readAttempt(p.input.retrievalAttemptId);
 await ledger.record({...miss!,attemptId:'failed-retrieval',retrievalStatus:'failed',deliveryStatus:'failed',failureCode:'provider-outage',exposures:[],selectedCount:0});
 await expect(f.call('write','recall_repair',{...p.input,operationId:'outage-preview',expectedRepairRevision:p.preview.revision,retrievalAttemptId:'failed-retrieval'})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
},60000);
it('does not commit a derivation receipt when its external task changes while queued',async()=>{
 const f=await derivationFixture();let current=true,entered!:()=>void,release!:()=>void;
 const queued=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;}),original=FileMemoryStore.prototype.transact;
 vi.spyOn(FileMemoryStore.prototype,'transact').mockImplementation(function(keys,planner){if(keys.some(key=>key.startsWith('operations/'))){entered();return gate.then(()=>original.call(this,keys,planner));}return original.call(this,keys,planner);});
 const controller=f.memory.controller(f.scope,'baseline-v1',{scope:f.scope,deadlineMs:Date.now()+15000,assertScopeCurrent:()=>{if(!current)throw Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');}});
 const pending=controller.writeDerivation(f.input),result=pending.then(()=>null,error=>error);
 await queued;current=false;release();expect((await result)?.message).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
 vi.restoreAllMocks();const recovered=await f.call('write','derivation',f.input);expect(recovered.artifact.duplicate).toBe(false);
},60000);
it('rejects mismatched source bytes, out-of-range claims, unknown fields and foreign evidence',async()=>{
 const f=await derivationFixture();
 await expect(f.call('write','derivation',{...f.input,sourceTextDigest:disclosureDigest('different')})).rejects.toThrow('MEMORY_REVISION_CONFLICT');
 await expect(f.call('write','derivation',{...f.input,claims:[{text:'wrong range',range:{start:0,end:999}}]})).rejects.toThrow('MEMORY_REVISION_CONFLICT');
 await expect(f.call('write','derivation',{...f.input,verified:true})).rejects.toThrow('MEMORY_INPUT_INVALID');
 const foreign=await f.memory.controller({...f.scope,taskId:'foreign-task'}).captureEvidence({operationId:'foreign-source',source:{kind:'controller-text',text:f.text}});
 await expect(f.call('write','derivation',{...f.input,source:foreign.source})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
},60000);
it('keeps unavailable evidence unresolved without claiming semantic equivalence',async()=>{
 const f=await derivationFixture();
 const manifest=JSON.parse(await readFile(path.join(f.root,'runtime/memory/archive/manifests','artifact-'+f.input.source.id+'.json'),'utf8'));
 const archive=path.join(f.root,'runtime/memory/archive/objects',manifest.bodyDigest.slice(7));
 await rm(archive,{force:true});
 const written=await f.call('write','derivation',f.input);expect(written.sourceValidation).toBe('unavailable');
 expect((await f.call('read','derivation',{source:written.artifact.source})).semanticEquivalence).toBe('unknown');
},60000);
