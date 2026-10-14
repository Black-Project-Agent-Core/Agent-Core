import {mkdtemp,mkdir,writeFile,rename,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,test} from 'vitest';
import {MemoryService,exportMemoryTransferV2,importMemoryTransferV2} from '../src/index.js';
import {setup,cleanup,expandAll} from './helpers/memory-capsule.js';
import {withMemoryProcessLock} from '../src/memory/lock.js';
import {writeOwnedFileAtomic} from '../src/persistence/atomic-file.js';
const roots:string[]=[];afterEach(async()=>{await cleanup();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
test('Linux case-sensitive Unicode evidence paths, CRLF bytes, rename and retained evidence',async()=>{
 const {dir,A,scope}=await setup();await mkdir(path.join(dir,'Src'));const upper='Src/Case-🧠-é.txt',lower='Src/case-🧠-é.txt';
 const content='\uFEFFOriginal\r\nSecond line 漢🧠é\r\n';await writeFile(path.join(dir,upper),content);await writeFile(path.join(dir,lower),'different casing');
 const captured=await A.captureEvidence({operationId:'capture-unicode',source:{kind:'workspace-file',relativePath:upper}});
 const separate=await A.captureEvidence({operationId:'capture-case',source:{kind:'workspace-file',relativePath:lower}});
 expect((await expandAll(A,captured.source,'evidence')).text).toBe(content);expect((await expandAll(A,separate.source,'evidence')).text).toBe('different casing');
 await rename(path.join(dir,upper),path.join(dir,'Src','Renamed.txt'));await writeOwnedFileAtomic(path.join(dir,'Src','Renamed.txt'),'replacement\r\n');expect(await readFile(path.join(dir,'Src','Renamed.txt'),'utf8')).toBe('replacement\r\n');
 const destination=await mkdtemp(path.join(os.tmpdir(),'memory-t9-ユニコード-'));roots.push(destination);
 const policy={allowedWorkspaces:['agent-core'],allowUnscoped:true};await importMemoryTransferV2(await exportMemoryTransferV2(dir,{...policy,completeness:'complete'}),destination,policy);
 const B=(await MemoryService.initialize(destination,destination)).controller(scope);expect((await expandAll(B,captured.source,'evidence')).text).toBe(content);
});
test('concurrent export waits for the root lock and captures the committed canonical bytes',async()=>{
 const {dir,service}=await setup();await service.remember({content:'Locked source',provenance:{workspace:'agent-core',files:[]}});
 let entered!:()=>void,release!:()=>void;const held=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const lock=withMemoryProcessLock(path.join(dir,'.memory.lock'),async()=>{entered();await gate;});await held;
 let finished=false;const exported=exportMemoryTransferV2(dir,{allowedWorkspaces:['agent-core'],allowUnscoped:true,completeness:'complete'}).then(bundle=>{finished=true;return bundle;});
 await new Promise(r=>setTimeout(r,40));expect(finished).toBe(false);release();await lock;expect((await exported).manifest.recordCount).toBe(1);
});
