import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,test} from 'vitest';
import {initializeStandaloneMemory,MemoryService,exportMemoryTransferV2,previewMemoryTransferV2,importMemoryTransferV2} from '../src/index.js';
import {setup,cleanup,start,append,item,checkpoint,expandAll} from './helpers/memory-capsule.js';
const roots:string[]=[];
async function target(){const dir=await mkdtemp(path.join(os.tmpdir(),'memory-t9-target-'));roots.push(dir);return dir;}
afterEach(async()=>{await cleanup();await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
const policy={allowedWorkspaces:['agent-core'],allowUnscoped:true};
test('complete transfer retains exact evidence, root identity, receipts, capsule and replay across isolated restore',async()=>{
 const {A,dir,scope}=await setup();const evidence=await A.captureEvidence({operationId:'capture-original',source:{kind:'controller-text',text:'\uFEFFwhy/how\r\n🧠 e\u0301'}});
 let header=await A.startEpisode(start);header={...header,revision:(await A.appendEvent(append(header,'next',[item('next-step','next-action','Run ERR_CASE check',true,[evidence.source])]))).revision};await A.checkpoint(checkpoint(header));
 const bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'complete',chunkBytes:1024});const preview=previewMemoryTransferV2(bundle,policy);
 expect(preview.completeness).toBe('complete');expect(preview.unresolvedRefs).toEqual([]);expect(bundle.chunks.length).toBeGreaterThan(1);
 const destination=await target(),receipt=await importMemoryTransferV2(bundle,destination,policy);expect(receipt.status).toBe('complete');
 expect((await importMemoryTransferV2(bundle,destination,policy)).duplicate).toBe(true);
 const B=(await MemoryService.initialize(destination,destination)).controller({...scope,controllerId:'fresh-controller'});
 expect((await B.getTaskContext() as any).data.capsule.criticalItems.some((x:any)=>x.text==='Run ERR_CASE check')).toBe(true);
 expect((await expandAll(B,evidence.source,'evidence')).text).toBe('\uFEFFwhy/how\r\n🧠 e\u0301');
 expect((await B.captureEvidence({operationId:'capture-original',source:{kind:'controller-text',text:'\uFEFFwhy/how\r\n🧠 e\u0301'}})).duplicate).toBe(true);
 expect(JSON.parse(await readFile(path.join(destination,'state/experience-manifest.json'),'utf8')).rootId).toBe(preview.sourceRootId);
});
test('preview refuses checksum damage and unauthorized scope before any destination mutation',async()=>{
 const {dir,service}=await setup();await service.remember({content:'Scoped record',provenance:{workspace:'agent-core',files:[]}});
 const bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'});const broken=structuredClone(bundle);broken.chunks[0].data='dGFtcGVy';
 expect(()=>previewMemoryTransferV2(broken,policy)).toThrow('MEMORY_TRANSFER_CHECKSUM');
 expect(()=>previewMemoryTransferV2(bundle,{allowedWorkspaces:['other']})).toThrow('MEMORY_SCOPE_MISMATCH');
 const destination=await target();await expect(importMemoryTransferV2(broken,destination,policy)).rejects.toThrow('MEMORY_TRANSFER_CHECKSUM');await expect(readFile(path.join(destination,'state/experience-manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
});
test('knowledge-only is explicitly incomplete for restoration and refuses complete import',async()=>{
 const {dir,service}=await setup();await service.remember({content:'Knowledge only',provenance:{workspace:'agent-core',files:[]}});
 const bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'knowledge-only'});expect(previewMemoryTransferV2(bundle,policy).completeness).toBe('knowledge-only');
 await expect(importMemoryTransferV2(bundle,await target(),policy)).rejects.toThrow('MEMORY_TRANSFER_COMPLETE_REQUIRED');
});
test('interruption leaves unreadable activation; exact replay finishes without overwriting changed destination',async()=>{
 const {dir,service}=await setup();await service.remember({content:'Replay source',provenance:{workspace:'agent-core',files:[]}});const bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'});
 const destination=await target();await expect(importMemoryTransferV2(bundle,destination,{...policy,signal:AbortSignal.abort()})).rejects.toThrow('MEMORY_TRANSFER_INTERRUPTED');
 expect((await MemoryService.initialize(destination,destination)).health().canonicalStore).toBe('error');
 expect((await importMemoryTransferV2(bundle,destination,policy)).status).toBe('complete');
 await writeFile(path.join(destination,'00-agent-core-memory.md'),'changed');await expect(importMemoryTransferV2(bundle,destination,policy)).rejects.toThrow('MEMORY_TRANSFER_DESTINATION_DRIFT');
 const active=await target();await initializeStandaloneMemory({memoryRoot:active,experience:{enabled:true}});await expect(importMemoryTransferV2(bundle,active,policy)).rejects.toThrow('MEMORY_TRANSFER_DESTINATION_NOT_EMPTY');
});

test('more than 500 records, historical revisions and all authorized workspaces survive exact-byte restore',async()=>{
 const {dir,service,A,scope}=await setup();
 for(let offset=0;offset<501;offset+=100)await service.batch(Array.from({length:Math.min(100,501-offset)},(_,i)=>({op:'remember' as const,id:`transfer-record-${offset+i}`,value:{content:`Synthetic paged retained record ${offset+i}`,provenance:{workspace:'agent-core',files:[]}}})));
 const other=await service.remember({content:'Second workspace preserved',provenance:{workspace:'workspace-b',files:[]}});
 const first=(await service.read('transfer-record-0',false))!;
 for(let i=0;i<10;i++)await service.update(first.id,{title:`Retained old revision ${i}`});
 const {memorySemanticRevision}=await import('../src/memory/disclosure.js');
 const current=(await service.read(first.id,false))!;
 const retention={memoryId:first.id,expectedRevision:memorySemanticRevision(current),operationId:'archive-many',tier:'archive' as const,reason:'Retain old success',sourceRefs:[]};
 const retained=await A.setRetention(retention);
 await expect(exportMemoryTransferV2(dir,{...policy,completeness:'complete'})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
 const all={...policy,allowedWorkspaces:['agent-core','workspace-b']},bundle=await exportMemoryTransferV2(dir,{...all,completeness:'complete',chunkBytes:1024});
 expect(bundle.manifest.recordCount).toBe(502);expect(bundle.manifest.retainedRefs.filter(r=>r.kind==='memory'&&r.id===first.id).length).toBeGreaterThan(8);
 const destination=await target();await importMemoryTransferV2(bundle,destination,all);
 for(const entry of bundle.manifest.entries){expect(await readFile(path.join(destination,entry.path))).toEqual(await readFile(path.join(dir,entry.path)));}
 const restored=await MemoryService.initialize(destination,destination),B=restored.controller(scope);
 expect(await restored.read(other.id,false)).toEqual(other);expect((await B.setRetention(retention))).toEqual({...retained,duplicate:true});
 const old=await expandAll(B,{kind:'memory',id:first.id,revision:memorySemanticRevision(first)},'record');expect(old.text).toContain(first.content);
 const originalPage:any=await A.recall({retention:'all',limit:1});expect(originalPage.data.nextCursor).toBeTruthy();
 await expect(B.recall({retention:'all',limit:1,cursor:originalPage.data.nextCursor})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
 await expect(B.expand({source:{kind:'memory',id:other.id,revision:memorySemanticRevision(other)},view:'record'})).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
},60000);

test('partial copy remains inactive, replays only its bundle and rejects unexpected retained data',async()=>{
 const {dir,A}=await setup();await A.startEpisode(start);const bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),destination=await target();
 let checks=0;const signal={get aborted(){return ++checks>3;}} as AbortSignal;
 await expect(importMemoryTransferV2(bundle,destination,{...policy,signal})).rejects.toThrow('MEMORY_TRANSFER_INTERRUPTED');
 expect((await MemoryService.initialize(destination,destination)).health().canonicalStore).toBe('error');
 const other=structuredClone(bundle);other.manifest.exportedAt='2026-10-01T00:00:00.000Z';const {disclosureDigest}=await import('../src/memory/disclosure.js');other.manifestDigest=disclosureDigest(other.manifest);
 await expect(importMemoryTransferV2(other,destination,policy)).rejects.toThrow('MEMORY_TRANSFER_DESTINATION_CONFLICT');
 await writeFile(path.join(destination,'.00-agent-core-memory.md.tmp-999-12345678-1234-1234-1234-123456789abc'),'interrupted unpublished bytes');
 await importMemoryTransferV2(bundle,destination,policy);
 await expect(readFile(path.join(destination,'.00-agent-core-memory.md.tmp-999-12345678-1234-1234-1234-123456789abc'))).rejects.toMatchObject({code:'ENOENT'});
 const {mkdir}=await import('node:fs/promises');await mkdir(path.join(destination,'notes'),{recursive:true});await writeFile(path.join(destination,'notes','unexpected-note.md'),'extra retained bytes');
 await expect(importMemoryTransferV2(bundle,destination,policy)).rejects.toThrow('MEMORY_TRANSFER_DESTINATION_DRIFT');
});

test('structurally corrupt live metadata is rejected even when every transport checksum is correct',async()=>{
 const {dir,A}=await setup();const episode=await A.startEpisode(start);
 await writeFile(path.join(dir,'state','episodes',episode.id,'manifest.json'),JSON.stringify({schemaVersion:1,owner:{rootId:JSON.parse(await readFile(path.join(dir,'state/experience-manifest.json'),'utf8')).rootId,workspaceKey:'agent-core',taskId:'task-race'},header:{id:episode.id}}));
 await expect(exportMemoryTransferV2(dir,{...policy,completeness:'complete'})).rejects.toThrow('MEMORY_TRANSFER_SCHEMA_INVALID');
});

test('typed validity, uncertainty and links remain exact through transfer',async()=>{
 const {dir,service}=await setup();const targetNote=await service.remember({content:'Typed related source',provenance:{workspace:'agent-core',files:[]}});
 const saved=await service.remember({content:'Prediction with partial date',provenance:{workspace:'agent-core',files:[]},experience:{schemaVersion:1,kind:'observation',retention:'durable',epistemic:'prediction',temporal:'dynamic',observedAt:{precision:'month',value:'2026-09'},validity:{state:'known',from:{precision:'day',value:'2026-09-01'},to:null},verification:{status:'unverified',evidence:[]},sourceRefs:[]},links:[{type:'related',targetId:targetNote.id,strength:0.5,validFrom:'2026-09-01T00:00:00Z'}]});
 const destination=await target();await importMemoryTransferV2(await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),destination,policy);
 expect(await (await MemoryService.initialize(destination,destination)).read(saved.id,false)).toEqual(saved);
});

test('rechecks every digest, manifest path, and retained reference before creating destination files',async()=>{
 const {dir,A,service}=await setup();await service.batch([{op:'remember',id:'case-sensitive-note',value:{content:'Collision control',provenance:{workspace:'agent-core',files:[]}}}]);const captured=await A.captureEvidence({operationId:'reachability',source:{kind:'controller-text',text:'Original retained body'}});await A.startEpisode({...start,sourceRefs:[captured.source]});
 const original=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),{disclosureDigest}=await import('../src/memory/disclosure.js');
 const variants=[structuredClone(original),structuredClone(original),structuredClone(original)];
 variants[0].manifest.entries=variants[0].manifest.entries.filter(e=>!e.path.startsWith('archive/objects/'));
 variants[1].manifest.entries[0].path='../outside.json';
 const note=variants[2].manifest.entries.find(entry=>entry.path.startsWith('notes/'))!;variants[2].manifest.entries.push({...note,path:'notes/'+path.basename(note.path).toUpperCase().replace('.MD','.md')});
 variants[2].manifestDigest=disclosureDigest(variants[2].manifest);expect(()=>previewMemoryTransferV2(variants[2],policy)).toThrow('MEMORY_TRANSFER_PATH_COLLISION');
 for(const bundle of variants){const used=new Set(bundle.manifest.entries.flatMap(e=>e.chunks));bundle.chunks=bundle.chunks.filter(c=>used.has(c.digest));bundle.manifestDigest=disclosureDigest(bundle.manifest);const destination=await target();await expect(importMemoryTransferV2(bundle,destination,policy)).rejects.toThrow();await expect(readFile(path.join(destination,'state/experience-manifest.json'))).rejects.toMatchObject({code:'ENOENT'});}
});
