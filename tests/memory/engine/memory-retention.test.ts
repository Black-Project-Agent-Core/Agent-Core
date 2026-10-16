import {afterEach,expect,test} from 'vitest';
import {readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {MemoryService} from '../../../src/memory/facade.js';
import {memorySemanticRevision} from '../../../src/memory/disclosure.js';
import {MemoryFeedbackStore} from '../../../src/memory/feedback.js';
import {resolveMemoryPaths} from '../../../src/memory/paths.js';
import {readArchiveManifest,readMemoryAuditRefs} from '../../../src/memory/archive.js';
import {setup,cleanup,expandAll} from './helpers/memory-capsule.js';
afterEach(cleanup);
const ref=(record:any)=>({kind:'memory' as const,id:record.id,revision:memorySemanticRevision(record)});
const retain=(record:any,tier='archive',operationId='retain-one')=>({memoryId:record.id,expectedRevision:memorySemanticRevision(record),operationId,tier,reason:'Preserve the tested experience',sourceRefs:[ref(record)]});
test('E16 archive reduces active exposure and restore preserves exact history and idempotent audit',async()=>{
 const{A,B,service,dir,scope}=await setup();const original=await service.remember({content:'Successful synthetic reconstruction',provenance:{workspace:'agent-core',files:[]}});
 const input=retain(original),receipt:any=await A.setRetention(input);expect(receipt).toMatchObject({memoryId:original.id,tier:'archive',duplicate:false});
 expect((await service.search('Successful synthetic reconstruction')).map(row=>row.record.id)).not.toContain(original.id);
 expect((await A.recall() as any).data.hits.map((h:any)=>h.id)).not.toContain(original.id);
 for(const retention of ['archive','all']){const page:any=await A.recall({retention} as any);expect(page.data.archiveSearchAvailable).toBe(true);expect(page.data.hits.map((h:any)=>h.id)).toContain(original.id);expect(page.warnings).not.toContain('archive-not-enabled');}
 expect((await expandAll(A,ref(original),'record')).text).toContain(original.content);
 const audit=await readArchiveManifest(resolveMemoryPaths(dir,dir),receipt.auditRef);expect(audit.purpose).toBe('retention');expect(audit.sourceRefs).toContainEqual(ref(original));expect(audit.sourceRefs).toContainEqual({kind:'memory',id:original.id,revision:receipt.revision});
 expect((await expandAll(A,receipt.auditRef,'evidence')).text).toContain('Preserve the tested experience');
 expect(await B.setRetention(input)).toEqual({...receipt,duplicate:true});
 const restarted=await MemoryService.initialize(dir,dir);await restarted.reindex();expect(await restarted.controller(scope).setRetention(input)).toEqual({...receipt,duplicate:true});
 await expect(A.setRetention({...input,reason:'Different payload'})).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
 const archived=await service.read(original.id,false);const restored:any=await A.setRetention(retain(archived,'durable','restore-one'));expect(restored.tier).toBe('durable');expect((await A.recall() as any).data.hits.map((h:any)=>h.id)).toContain(original.id);
});
test('E16 restore never undoes expiry or explicit forgetting and missing visibility fails closed',async()=>{
 const{A,service,dir}=await setup();const original=await service.remember({content:'Expired retained success',expiresAt:'2020-01-01T00:00:00Z',provenance:{workspace:'agent-core',files:[]}});
 await A.setRetention(retain(original));const archived=await service.read(original.id,false);await A.setRetention(retain(archived,'active','restore-expired'));
 expect((await service.read(original.id,false))?.expiresAt).toBe(original.expiresAt);expect((await A.recall() as any).data.hits.map((h:any)=>h.id)).not.toContain(original.id);
 expect((await expandAll(A,ref(original),'record')).text).toContain(original.content);
 await service.lifecycle(original.id,'forget-expired','forget');await expect(A.setRetention(retain(await service.read(original.id,false),'archive','forgotten'))).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
 await rm(path.join(dir,'state/feedback.json'));await expect(A.recall({retention:'all'})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');await expect(A.setRetention(retain(original))).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
});
test('E28 feedback over 512 records, reset, and reconcile cannot reopen forgotten sources',async()=>{
 const{A,service,dir}=await setup();const record=await service.remember({content:'Must stay forgotten',provenance:{workspace:'agent-core',files:[]}});const paths=resolveMemoryPaths(dir,dir),feedback=new MemoryFeedbackStore(paths);
 await service.lifecycle(record.id,'forget-protected','forget');
 // Real owner writes cross the record limit; these IDs represent bounded telemetry only.
 for(let i=0;i<513;i++)await feedback.apply('synthetic-'+i,'event-'+i,'helpful');
 expect(await feedback.strictForgottenIds()).toContain(record.id);expect((await A.recall({retention:'all'}) as any).data.hits.map((h:any)=>h.id)).not.toContain(record.id);
 await feedback.reset(record.id);await feedback.reconcile(new Set());await service.reindex();
 expect(await new MemoryFeedbackStore(paths).strictForgottenIds()).toContain(record.id);
 const archived=(await readdir(paths.archiveManifests)).filter(n=>n.startsWith('feedback-'));expect(archived.length).toBeGreaterThan(0);
 const history=await Promise.all(archived.map(name=>readFile(path.join(paths.archiveManifests,name),'utf8')));
 expect(history.some(text=>text.includes('forget-protected'))).toBe(true);expect(history.some(text=>text.includes('event-0'))).toBe(true);
},30000);
test('audit enumeration translates malformed UTF-8 into the coded archive error',async()=>{
 const{service,dir}=await setup();const record=await service.remember({content:'Audit fixture'});
 await (service as any).store.mutate(record.id,(r:any)=>({...r,evolutionHistory:[...r.evolutionHistory,{kind:'updated',source:'user',timestamp:'2026-10-07T02:00:00Z',details:{note:'Audit fixture'}}]}));
 const paths=resolveMemoryPaths(dir,dir),[audit]=await readMemoryAuditRefs(paths,record.id);await writeFile(path.join(paths.archiveManifests,audit.id+'.json'),Buffer.from([0xc3,0x28]));
 await expect(readMemoryAuditRefs(paths,record.id)).rejects.toThrow('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE');
});
test('retention validates scope, exact CAS and required evidence before publishing, with controller-independent replay',async()=>{
 const{A,B,service}=await setup();const record=await service.remember({content:'Concurrent retention target',provenance:{workspace:'agent-core',files:[]}});
 const outcomes=await Promise.allSettled([A.setRetention(retain(record,'archive','race-archive')),B.setRetention(retain(record,'active','race-active'))]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.find(r=>r.status==='rejected')?.reason.message).toBe('MEMORY_REVISION_CONFLICT');
 const winner=outcomes[0].status==='fulfilled'?retain(record,'archive','race-archive'):retain(record,'active','race-active');
 expect((await A.setRetention({...winner,expectedRevision:'sha256:'+'f'.repeat(64)} as any)).duplicate).toBe(true);
 const other=service.controller({workspaceKey:'other',taskId:'task-race',controllerId:'other'});await expect(other.setRetention(retain(await service.read(record.id,false),'durable','cross-scope'))).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
 const unavailable=await A.captureEvidence({operationId:'unavailable-retention',source:{kind:'workspace-file',relativePath:'absent.txt'}});
 const next=await (service as any).store.mutate(record.id,(r:any)=>({...r,experience:{...r.experience,sourceRefs:[unavailable.source]}}));
 await expect(A.setRetention(retain(next,'archive','missing-evidence'))).rejects.toThrow('MEMORY_PRESERVATION_REQUIRED');expect(memorySemanticRevision((await service.read(record.id,false))!)).toBe(memorySemanticRevision(next));
});
test('missing or malformed visibility cannot be recreated through feedback writes',async()=>{
 const{A,service,dir}=await setup(),record=await service.remember({content:'Restricted visibility',provenance:{workspace:'agent-core',files:[]}});await service.lifecycle(record.id,'forget-restricted','forget');
 const file=path.join(dir,'state/feedback.json'),saved=JSON.parse(await readFile(file,'utf8'));await rm(file);
 const feedback=new MemoryFeedbackStore(resolveMemoryPaths(dir,dir));await expect(feedback.apply('unrelated','new-feedback','helpful')).rejects.toThrow('MEMORY_FEEDBACK_STATE_MISSING');await expect(A.recall()).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
 saved.records[0].forgotten='false';await writeFile(file,JSON.stringify(saved));await expect(A.recall()).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
});
test('E16 accepted success evidence and rationale survive archival, recent revision pruning, reset and restart',async()=>{
 const{A,service,dir,scope}=await setup();const{start,append,item}=await import('./helpers/memory-capsule.js');
 const artifact=await A.captureEvidence({operationId:'success-evidence',source:{kind:'controller-text',text:'Synthetic verifier result: recovery passed on local Linux. Ordered CAS prevented lost writes.'}});
 const header=await A.startEpisode(start),event=await A.appendEvent({...append(header,'record-success',[item('success-method','successful-strategy','Use ordered CAS only on local supported filesystems',true,[artifact.source])],[artifact.source]),event:{...append(header,'record-success',[item('success-method','successful-strategy','Use ordered CAS only on local supported filesystems',true,[artifact.source])],[artifact.source]).event,kind:'success'}} as any);
 const record=await service.remember({content:'Preserve recovery method and applicability',provenance:{workspace:'agent-core',files:[]}});
 const linked=await (service as any).store.mutate(record.id,(r:any)=>({...r,experience:{...r.experience,kind:'procedure',epistemic:'observation',sourceRefs:[event.eventRef,artifact.source]}}));const originalRef=ref(linked);
 const retained:any=await A.setRetention(retain(linked));
 for(let i=0;i<10;i++)await service.update(record.id,{title:'Later explanatory label '+i});
 const feedback=new MemoryFeedbackStore(resolveMemoryPaths(dir,dir));for(let i=0;i<66;i++)await feedback.apply(record.id,'feedback-history-'+i,'helpful');await feedback.reset(record.id);await feedback.reconcile(new Set());await service.reindex();
 const B=(await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'restart'});
 expect((await expandAll(B,artifact.source,'evidence')).text).toContain('Ordered CAS prevented lost writes');expect((await expandAll(B,event.eventRef)).text).toContain('only on local supported filesystems');expect((await expandAll(B,originalRef,'record')).text).toContain('Preserve recovery method');expect((await expandAll(B,retained.auditRef,'evidence')).text).toContain('Preserve the tested experience');
 expect((await service.revisions(record.id,8)).revisions).toHaveLength(8);
},30000);
test('retention semantic CAS preserves access-only writes made between preparation and commit',async()=>{
 const{A,service}=await setup(),record=await service.remember({content:'Concurrent access preservation',provenance:{workspace:'agent-core',files:[]}}),store=(service as any).store,original=store.transact.bind(store);let inject=true;
 store.transact=async(...args:any[])=>{if(inject){inject=false;await service.read(record.id);}return original(...args);};
 try {await A.setRetention(retain(record));}finally{store.transact=original;}
 expect((await service.read(record.id,false))?.retrievalCount).toBe(record.retrievalCount+1);
});
