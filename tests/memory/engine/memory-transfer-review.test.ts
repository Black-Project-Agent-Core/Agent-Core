import {afterEach,expect,test} from 'vitest';
import {readFile,writeFile,mkdir,rm,mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {MemoryService,exportMemoryTransferV2,previewMemoryTransferV2,importMemoryTransferV2,type MemoryTransferV2Bundle} from '../../../src/memory/facade.js';
import {setup,cleanup,start,append,item} from './helpers/memory-capsule.js';
import {MemoryRetrievalLedger} from '../../../src/memory/retrieval-ledger.js';
import {resolveMemoryPaths} from '../../../src/memory/paths.js';
import {disclosureDigest} from '../../../src/memory/disclosure.js';
const roots:string[]=[];afterEach(async()=>{await cleanup();await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
const policy={allowedWorkspaces:['agent-core'],allowUnscoped:true};
const digest=(b:Uint8Array|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
async function target(){const p=await mkdtemp(path.join(os.tmpdir(),'t9-review-'));roots.push(p);return p;}
function files(bundle:MemoryTransferV2Bundle){const chunks=new Map(bundle.chunks.map(c=>[c.digest,Buffer.from(c.data,'base64')]));return new Map(bundle.manifest.entries.map(e=>[e.path,Buffer.concat(e.chunks.map(c=>chunks.get(c)!))]));}
function repack(bundle:MemoryTransferV2Bundle,objects:Map<string,Buffer>){const chunks=new Map<string,string>();bundle.manifest.entries=[...objects].map(([path,b])=>{const d=digest(b);chunks.set(d,b.toString('base64'));return {path,bytes:b.length,digest:d,chunks:[d]};});bundle.chunks=[...chunks].map(([digest,data])=>({digest,data}));bundle.manifestDigest=disclosureDigest(bundle.manifest);return bundle;}

for(const rotated of [false,true])for(const receipt of [false,true])for(const workspace of ['private-b',undefined])test(`G9-1 ${rotated?'rotated':'recent'} ${receipt?'use receipt':'attempt'} ${workspace??'unscoped'} is authorized and reported exactly`,async()=>{
 const {dir}=await setup();const ledger=new MemoryRetrievalLedger(resolveMemoryPaths(dir,dir)),sha='sha256:'+'a'.repeat(64);
 const attempt={version:1 as const,attemptId:'historical-attempt',taskId:'private-task',surface:'memory_search' as const,trigger:'explicit' as const,startedAt:'2026-10-07T00:00:00Z',completedAt:'2026-10-07T00:00:00Z',retrievalStatus:'succeeded' as const,deliveryStatus:'returned-to-controller' as const,candidateCount:1,selectedCount:1,...(workspace?{workspace}:{}),exposures:[{memoryId:'agent-core-foundational',rank:1,disposition:'selected' as const,handoffStatus:'returned-to-controller' as const,recordFingerprint:sha,contentDigest:sha}]};
 await ledger.record(attempt);
 if(receipt)await ledger.recordUseReceipt({useId:'historical-receipt',retrievalAttemptId:attempt.attemptId,taskId:attempt.taskId,memoryId:'agent-core-foundational',contentDigest:sha,...(workspace?{workspace}:{}),applicability:'applied',result:'unavailable',reasonCode:'synthetic-test'},sha);
 if(rotated){await rm(path.join(dir,'state/retrieval-ledger.jsonl'));if(receipt)await rm(path.join(dir,'state/retrieval-use-receipts.jsonl'));}
 const allowed={allowedWorkspaces:workspace?[workspace]:[],allowUnscoped:!workspace};
 const bundle=await exportMemoryTransferV2(dir,{...allowed,completeness:'complete'});
 expect(bundle.manifest.workspaces).toEqual(workspace?[workspace]:[]);expect(bundle.manifest.unscoped).toBe(!workspace);
 if(workspace)await expect(exportMemoryTransferV2(dir,{allowedWorkspaces:[workspace.toUpperCase()],allowUnscoped:false,completeness:'complete'})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
 const denied={allowedWorkspaces:['agent-core'],allowUnscoped:false};
 await expect(exportMemoryTransferV2(dir,{...denied,completeness:'complete'})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
 expect(()=>previewMemoryTransferV2(bundle,denied)).toThrow('MEMORY_SCOPE_MISMATCH');
 const destination=await target();await expect(importMemoryTransferV2(bundle,destination,denied)).rejects.toThrow('MEMORY_SCOPE_MISMATCH');await expect(readFile(path.join(destination,'state/experience-manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
 expect((await importMemoryTransferV2(bundle,destination,allowed)).status).toBe('complete');
 for(const entry of bundle.manifest.entries)expect(await readFile(path.join(destination,entry.path))).toEqual(await readFile(path.join(dir,entry.path)));
});

for(const corruption of ['working-state','event-order','event-count','header-task','header-workspace'])test(`G9-2 checksum-valid ${corruption} corruption is rejected before staging and cannot damage an interrupted restore`,async()=>{
 const {dir,A,scope}=await setup();const header=await A.startEpisode(start);await A.appendEvent(append(header,'next-action',[item('next-action','next-action','Inspect the retained history')]));
 const original=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),bundle=structuredClone(original),objects=files(bundle),liveKey=`state/episodes/${header.id}/manifest.json`,live=JSON.parse(objects.get(liveKey)!.toString());
 const oldRef=live.snapshotRef,oldKey=`archive/manifests/episode-${oldRef.id}-${oldRef.revision.slice(7)}.json`,snapshot=JSON.parse(objects.get(oldKey)!.toString());
 if(corruption==='working-state')snapshot.workingState[0].text='Invented state with valid checksums';
 if(corruption==='event-order')snapshot.eventRefs.reverse();
 if(corruption==='event-count')snapshot.header.eventCount++;
 if(corruption==='header-task')snapshot.header.taskId='wrong-task';
 if(corruption==='header-workspace')snapshot.header.workspaceKey='private-b';
 const bytes=Buffer.from(JSON.stringify(snapshot)+'\n'),revision=digest(bytes),newKey=`archive/manifests/episode-${oldRef.id}-${revision.slice(7)}.json`;
 objects.delete(oldKey);objects.set(newKey,bytes);live.snapshotRef={...oldRef,revision};live.header=snapshot.header;objects.set(liveKey,Buffer.from(JSON.stringify(live)+'\n'));
 bundle.manifest.retainedRefs=bundle.manifest.retainedRefs.map(ref=>ref.kind==='episode'&&ref.id===oldRef.id&&ref.revision===oldRef.revision?{...ref,revision}:ref);repack(bundle,objects);
 expect(()=>previewMemoryTransferV2(bundle,policy)).toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');
 const destination=await target();await expect(importMemoryTransferV2(bundle,destination,policy)).rejects.toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');await expect(readFile(path.join(destination,'state/experience-manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(importMemoryTransferV2(original,destination,{...policy,signal:AbortSignal.abort()})).rejects.toThrow('MEMORY_TRANSFER_INTERRUPTED');const incomplete=await readFile(path.join(destination,'state/experience-manifest.json'));
 await expect(importMemoryTransferV2(bundle,destination,policy)).rejects.toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');expect(await readFile(path.join(destination,'state/experience-manifest.json'))).toEqual(incomplete);
 await importMemoryTransferV2(original,destination,policy);expect((await (await MemoryService.initialize(destination,destination)).controller(scope).getTaskContext()).status).not.toBe('insufficient-budget');
 // The same invalid state in a source root must also fail export. Every retained
 // historical snapshot is inspected, not only the currently selected capsule.
 await rm(path.join(dir,oldKey));for(const key of [newKey,liveKey]){await mkdir(path.dirname(path.join(dir,key)),{recursive:true});await writeFile(path.join(dir,key),objects.get(key)!);}
 await expect(exportMemoryTransferV2(dir,{...policy,completeness:'complete'})).rejects.toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');
});

test('G9-2 every retained historical snapshot is checked even when current public context is healthy',async()=>{
 const {dir,A,scope}=await setup();let header=await A.startEpisode(start);const initial=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'});
 for(let i=0;i<10;i++)header={...header,revision:(await A.appendEvent(append(header,`history-${i}`,[item(`history-item-${i}`,'current-state',`Historical step ${i}`,false)]))).revision};
 const good=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),destination=await target();await importMemoryTransferV2(good,destination,policy);
 for(const entry of good.manifest.entries)expect(await readFile(path.join(destination,entry.path))).toEqual(await readFile(path.join(dir,entry.path)));
 expect((await (await MemoryService.initialize(destination,destination)).controller(scope).getTaskContext()).status).not.toBe('insufficient-budget');
 const historical=JSON.parse([...files(initial)].find(([key])=>key.startsWith('archive/manifests/episode-'))![1].toString());historical.workingState[0].text='Corrupt orphan old state';const bytes=Buffer.from(JSON.stringify(historical)+'\n'),revision=digest(bytes),key=`archive/manifests/episode-${historical.header.id}-${revision.slice(7)}.json`;
 const bundle=structuredClone(good),objects=files(bundle);objects.set(key,bytes);bundle.manifest.retainedRefs.push({kind:'episode',id:historical.header.id,revision});repack(bundle,objects);
 expect(()=>previewMemoryTransferV2(bundle,policy)).toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');await writeFile(path.join(dir,key),bytes);
 expect((await A.getTaskContext()).status).not.toBe('insufficient-budget');await expect(exportMemoryTransferV2(dir,{...policy,completeness:'complete'})).rejects.toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');
});

test('G9-1 retained receipt workspace is inspected independently of an authorized attempt',async()=>{
 const {dir,A,service}=await setup();const page:any=await A.recall({budget:{maxBytes:65536}}),hit=page.data.hits.find((h:any)=>h.id==='agent-core-foundational');expect(hit).toBeTruthy();
 await service.recordUseReceipt({useId:'independent-scope-receipt',retrievalAttemptId:hit.retrievalEvidence.attemptId,memoryId:hit.id,contentDigest:hit.retrievalEvidence.contentDigest,workspace:'agent-core',taskId:'task-race',applicability:'applied',result:'unavailable',reasonCode:'synthetic-test'});
 const good=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),bundle=structuredClone(good),objects=files(bundle);const [key,bytes]=[...objects].find(([key])=>key.startsWith('archive/manifests/use-receipt-'))!,manifest=JSON.parse(bytes.toString());
 manifest.details.value.workspace='private-b';manifest.details.digest=disclosureDigest(manifest.details.value);const replacement=Buffer.from(JSON.stringify(manifest)+'\n');objects.set(key,replacement);objects.delete('state/retrieval-use-receipts.jsonl');
 const old=digest(bytes);bundle.manifest.retainedRefs=bundle.manifest.retainedRefs.map(ref=>ref.kind==='manifest'&&ref.id===manifest.id&&ref.revision===old?{...ref,revision:digest(replacement)}:ref);repack(bundle,objects);
 expect(()=>previewMemoryTransferV2(bundle,policy)).toThrow('MEMORY_SCOPE_MISMATCH');
});

test('G9-1 scope comes from domain metadata, never JSON-shaped evidence text',async()=>{
 const {dir,A}=await setup();await A.captureEvidence({operationId:'opaque-workspace-text',source:{kind:'controller-text',text:'{"workspace":"private-b","taskId":"secret-task"}'}});
 const bundle=await exportMemoryTransferV2(dir,{allowedWorkspaces:['agent-core'],allowUnscoped:false,completeness:'complete'});expect(bundle.manifest.workspaces).toEqual(['agent-core']);expect(bundle.manifest.unscoped).toBe(false);
});

test('G9-1 retained telemetry envelope checksum is verified through its archive owner',async()=>{
 const {dir,A}=await setup();await A.recall();const bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),objects=files(bundle);
 const [key,bytes]=[...objects].find(([key])=>key.startsWith('archive/manifests/retrieval-attempt-'))!,value=JSON.parse(bytes.toString());value.details.digest='sha256:'+'0'.repeat(64);await writeFile(path.join(dir,key),JSON.stringify(value)+'\n');
 await expect(exportMemoryTransferV2(dir,{...policy,completeness:'complete'})).rejects.toThrow('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE');
});

test('G9-1 a known retained telemetry file cannot evade validation by changing its purpose',async()=>{
 const {dir,A}=await setup();await A.recall();const bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),objects=files(bundle);
 const [key,bytes]=[...objects].find(([key])=>key.startsWith('archive/manifests/retrieval-attempt-'))!,value=JSON.parse(bytes.toString());value.purpose='opaque-evidence';value.details.value.workspace='private-b';value.details.digest=disclosureDigest(value.details.value);await writeFile(path.join(dir,key),JSON.stringify(value)+'\n');
 await expect(exportMemoryTransferV2(dir,{...policy,completeness:'complete'})).rejects.toThrow('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE');
});
