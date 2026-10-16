import {afterEach,expect,test} from 'vitest';
import {readFile,readdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {isEpisodeManifestPath} from './helpers/memory-ingestion-paths.mjs';
import {MemoryService,exportMemoryTransferV2,importMemoryTransferV2} from '../../../src/memory/facade.js';
import {disclosureDigest} from '../../../src/memory/disclosure.js';
import {setup,cleanup,start,append} from './helpers/memory-capsule.js';
afterEach(cleanup);
const streamId='controller-explicit-input';
async function capture(A:any,text='Synthetic available source',operationId='capture-batch-one'){return A.captureEvidence({operationId,source:{kind:'controller-text',text}});}
function input(h:any,source:any,options:any={}){return {...append(h,'append-batch-one',[],[source]),ingestion:{streamId,batchId:'batch-one',sequence:1,sourceDigest:disclosureDigest(['Synthetic available source']),...options}};}
test('capture is not a committed cursor; durable append alone emits receipt and replay is exact',async()=>{
 const {A,dir,scope}=await setup();const h=await A.startEpisode(start);expect(await A.getIngestionCursor({streamId})).toEqual({sequence:0});const captured=await capture(A);expect(await A.getIngestionCursor({streamId})).toEqual({sequence:0});expect((await capture(A)).duplicate).toBe(true);
 const request=input(h,captured.source);const accepted=await A.appendEvent(request);expect(accepted.ingestionReceipt).toEqual({streamId,sequence:1,eventRef:accepted.eventRef});expect(await A.getIngestionCursor({streamId})).toEqual({sequence:1,receipt:accepted.eventRef});
 const B=(await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'restart'});expect(await B.appendEvent(request)).toEqual({...accepted,duplicate:true});expect(await readdir(path.join(dir,'state/episodes',h.id,'events'))).toHaveLength(2);
 await expect(B.appendEvent({...request,ingestion:{...request.ingestion,batchId:'changed'}})).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
 const changed=await capture(B,'Changed source','capture-changed');await expect(B.appendEvent({...input({...h,revision:2},changed.source,{sourceDigest:disclosureDigest(['Changed source'])}),operationId:'different-operation'})).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
});
test('requires available captured source, matching canonical source digest and valid identities',async()=>{
 const {A}=await setup();const h=await A.startEpisode(start);const unavailable=await A.captureEvidence({operationId:'missing-evidence',source:{kind:'workspace-file',relativePath:'missing-source.md'}});
 await expect(A.appendEvent(input(h,unavailable.source))).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');const captured=await capture(A);
 await expect(A.appendEvent(input(h,captured.source,{sourceDigest:disclosureDigest(['different'])}))).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
 for(const invalid of [{streamId:'bad\nstream'},{batchId:'bad\0batch'},{sequence:0},{sequence:2},{previousReceipt:captured.source}])await expect(A.appendEvent(input(h,captured.source,invalid))).rejects.toThrow(/MEMORY_(INPUT_INVALID|OPERATION_CONFLICT)/);
 expect(await A.getIngestionCursor({streamId})).toEqual({sequence:0});const legacy=await A.appendEvent(append(h,'legacy-event'));expect(legacy).not.toHaveProperty('ingestionReceipt');
});
test('ordered exact predecessor and concurrent CAS never advance over a missing batch',async()=>{
 const {A,B}=await setup();const h=await A.startEpisode(start),source=(await capture(A)).source;
 const raced=await Promise.allSettled([A.appendEvent(input(h,source)),B.appendEvent({...input(h,source,{batchId:'batch-other'}),operationId:'competing-producer'})]);expect(raced.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(raced.filter(x=>x.status==='rejected')).toHaveLength(1);
 const first=(raced.find(x=>x.status==='fulfilled') as any).value;const next={...input({...h,revision:2},source,{batchId:'batch-two',sequence:2,previousReceipt:first.eventRef}),operationId:'append-batch-two'};
 await expect(A.appendEvent({...next,ingestion:{...next.ingestion,previousReceipt:{...first.eventRef,revision:'sha256:'+'0'.repeat(64)}}})).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
 const second=await A.appendEvent(next);expect(await B.getIngestionCursor({streamId})).toEqual({sequence:2,receipt:second.eventRef});expect(await B.getIngestionCursor({streamId:'unseen-stream'})).toEqual({sequence:0});
});
test('before capture, after capture and failed append leave no accepted input; lost response replay preserves one event',async()=>{
 const {A,service,dir,scope}=await setup();const h=await A.startEpisode(start),store=(service as any).store,original=store.transact.bind(store);store.transact=async()=>{throw Error('synthetic before capture commit');};
 await expect(capture(A)).rejects.toThrow('synthetic');store.transact=original;expect(await A.getIngestionCursor({streamId})).toEqual({sequence:0});
 const source=(await capture(A)).source;const B=(await MemoryService.initialize(dir,dir)).controller(scope);expect(await B.getIngestionCursor({streamId})).toEqual({sequence:0});const request=input(h,source);
 store.transact=async()=>{throw Error('synthetic before append commit');};await expect(A.appendEvent(request)).rejects.toThrow('synthetic');store.transact=original;expect(await B.getIngestionCursor({streamId})).toEqual({sequence:0});
 store.transact=async(...args:any[])=>{await original(...args);throw Error('synthetic lost acknowledgment');};await expect(A.appendEvent(request)).rejects.toThrow('synthetic lost acknowledgment');store.transact=original;
 const C=(await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'after-response-loss'});expect((await C.getIngestionCursor({streamId})).sequence).toBe(1);expect((await C.appendEvent(request)).duplicate).toBe(true);expect(await readdir(path.join(dir,'state/episodes',h.id,'events'))).toHaveLength(2);
});
test('missing accepted receipt fails closed and never masquerades as empty cursor',async()=>{
 const {A,dir}=await setup();const h=await A.startEpisode(start),source=(await capture(A)).source;await A.appendEvent(input(h,source));
 for(const name of await readdir(path.join(dir,'state/operations'))){const file=path.join(dir,'state/operations',name),value=JSON.parse(await readFile(file,'utf8'));if(value.method==='appendEvent')await writeFile(file,'{}');}
 await expect(A.getIngestionCursor({streamId})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
});
test('complete transfer preserves ingestion chain and idempotent retry without secondary state',async()=>{
 const {A,dir,scope}=await setup();const h=await A.startEpisode(start),source=(await capture(A)).source,request=input(h,source),accepted=await A.appendEvent(request);
 const policy={allowedWorkspaces:['agent-core'],allowUnscoped:true},bundle=await exportMemoryTransferV2(dir,{...policy,completeness:'complete'});const destination=await mkdtemp(path.join(os.tmpdir(),'memory-ingestion-transfer-'));
 try{await importMemoryTransferV2(bundle,destination,policy);const B=(await MemoryService.initialize(destination,destination)).controller(scope);expect(await B.getIngestionCursor({streamId})).toEqual({sequence:1,receipt:accepted.eventRef});expect(await B.appendEvent(request)).toEqual({...accepted,duplicate:true});}finally{await rm(destination,{recursive:true,force:true});}
});

for(const boundary of ['preparing','prepared','episode','committed','response'])test(`process interruption at ${boundary} restores cursor from committed transaction only`,async()=>{
 const {spawn}=await import('node:child_process');const {utimes}=await import('node:fs/promises');const {A,dir,scope}=await setup();const h=await A.startEpisode(start),source=(await capture(A)).source,request=input(h,source);
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/memory-ingestion-child.mjs',import.meta.url)),dir,boundary,Buffer.from(JSON.stringify(request)).toString('base64url'),Buffer.from(JSON.stringify(scope)).toString('base64url')],{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);const exited=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing crash boundary '+stdout+stderr)),15000);child.stdout.on('data',()=>{if(stdout.includes('"boundary"')){clearTimeout(timer);resolve();}});exited.then(code=>{clearTimeout(timer);reject(Error('Early exit '+code+stdout+stderr));});});}finally{child.kill('SIGKILL');await exited;}
 const expired=new Date(Date.now()-180000);await utimes(path.join(dir,'.memory.lock'),expired,expired).catch(e=>{if(e.code!=='ENOENT')throw e;});
 const B=(await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'after-kill'});const committed=['committed','response'].includes(boundary);expect((await B.getIngestionCursor({streamId})).sequence).toBe(committed?1:0);
 const replay=await B.appendEvent(request);expect(replay.duplicate).toBe(committed);expect((await B.getIngestionCursor({streamId})).sequence).toBe(1);expect((await B.appendEvent(request)).duplicate).toBe(true);expect(await readdir(path.join(dir,'state/episodes',h.id,'events'))).toHaveLength(2);
},30000);

test('transfer rejects shape-valid receipt disagreement rather than accepting broken retry identity',async()=>{
 const {A,dir}=await setup();const h=await A.startEpisode(start),source=(await capture(A)).source;await A.appendEvent(input(h,source));
 for(const name of await readdir(path.join(dir,'state/operations'))){const file=path.join(dir,'state/operations',name),value=JSON.parse(await readFile(file,'utf8'));if(value.method==='appendEvent'){value.result.ingestionReceipt.sequence=2;await writeFile(file,JSON.stringify(value));}}
 await expect(exportMemoryTransferV2(dir,{allowedWorkspaces:['agent-core'],allowUnscoped:true,completeness:'complete'})).rejects.toThrow('MEMORY_TRANSFER_LINKAGE_INVALID');
});

test('reference-only capture and foreign task evidence cannot advance the accepted stream',async()=>{
 const {A,dir,service,scope}=await setup();const h=await A.startEpisode(start);
 await writeFile(path.join(dir,'source.md'),'Synthetic restricted evidence');await writeFile(path.join(dir,'.agent-core-evidence.json'),JSON.stringify({version:1,default:'metadata-only'}));
 const restricted=await A.captureEvidence({operationId:'reference-only-capture',source:{kind:'workspace-file',relativePath:'source.md'}});expect(restricted.availability).toBe('reference-only');await expect(A.appendEvent(input(h,restricted.source))).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');
 const foreign=service.controller({...scope,taskId:'foreign-task'});const source=(await capture(foreign)).source;await expect(A.appendEvent(input(h,source))).rejects.toThrow('MEMORY_SCOPE_MISMATCH');expect(await A.getIngestionCursor({streamId})).toEqual({sequence:0});
});


test('crash-helper URL conversion preserves decoded spaces and Windows drive paths',()=>{
 const spaced=new URL('file:///E:/Agent%20Core/tests/helpers/memory-ingestion-child.mjs');
 expect(fileURLToPath(spaced,{windows:true})).toBe('E:\\Agent Core\\tests\\helpers\\memory-ingestion-child.mjs');
 expect(fileURLToPath(new URL('file:///tmp/Agent%20Core/helper.mjs'),{windows:false})).toBe('/tmp/Agent Core/helper.mjs');
 const local=fileURLToPath(new URL('./helpers/memory-ingestion-child.mjs',import.meta.url));expect(path.isAbsolute(local)).toBe(true);expect(path.basename(local)).toBe('memory-ingestion-child.mjs');
});


test('episode crash boundary recognizes Linux and Windows path separators only for episode manifests',()=>{
 for(const target of ['/tmp/root/state/episodes/episode-one/manifest.json','E:\\Agent Core\\state\\episodes\\episode-one\\manifest.json'])expect(isEpisodeManifestPath(target)).toBe(true);
 for(const target of ['/tmp/root/state/operations/manifest.json','E:\\Agent Core\\state\\episodes\\episode-one\\events\\1-event.json'])expect(isEpisodeManifestPath(target)).toBe(false);
});
