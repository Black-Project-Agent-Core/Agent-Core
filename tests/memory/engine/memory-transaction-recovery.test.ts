import { symlinkOrSkip } from '../../helpers/optional-symlink.js';
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { MemoryTransactionCoordinator, fingerprintText } from '../../../src/memory/transaction.js';
const roots:string[]=[];
async function root(){ const dir=await mkdtemp(path.join(os.tmpdir(),'memory-t2-tx-')); roots.push(dir); return dir; }
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});

test('coordinator rejects duplicate targets before applying any mutation',async()=>{
 const dir=await root(); const tx=new MemoryTransactionCoordinator(path.join(dir,'state'));
 const target=path.join(dir,'notes/one.md');
 await expect(tx.commit([{targetPath:target,content:'one',expectedFingerprint:null},{targetPath:target,content:'two',expectedFingerprint:null}])).rejects.toThrow('MEMORY_TRANSACTION_DUPLICATE_TARGET');
 await expect(readFile(target)).rejects.toThrow();
});

test('coordinator refuses targets outside its root',async()=>{
 const dir=await root(); const outside=await root(); const target=path.join(outside,'other.md');
 const tx=new MemoryTransactionCoordinator(path.join(dir,'state'));
 await expect(tx.commit([{targetPath:target,content:'escape',expectedFingerprint:null}])).rejects.toThrow('MEMORY_PATH_ESCAPE');
 await expect(readFile(target)).rejects.toThrow();
});

test('invalid journal is preserved and blocks recovery without touching external files',async()=>{
 const dir=await root(); const outside=path.join(await root(),'victim'); await writeFile(outside,'unchanged');
 const tx=new MemoryTransactionCoordinator(path.join(dir,'state')); const evidence=path.join(tx.root,'invalid'); await mkdir(evidence,{recursive:true});
 await writeFile(path.join(evidence,'journal.json'),JSON.stringify({version:1,id:'invalid',phase:'applying',entries:[{targetPath:outside,stagedPath:null,backupPath:null,existed:false}]}));
 await expect(tx.recover()).rejects.toThrow('MEMORY_TRANSACTION_RECOVERY_BLOCKED');
 expect(await readFile(outside,'utf8')).toBe('unchanged'); expect(await readdir(evidence)).toContain('journal.json');
});

test('symlinked destinations fail closed',async context=>{
 const dir=await root(); const outside=await root();
 const tx=new MemoryTransactionCoordinator(path.join(dir,'state'));
 await symlinkOrSkip(context,outside,path.join(dir,'notes'),'dir');
 await expect(tx.commit([{targetPath:path.join(dir,'notes/escape.md'),content:'no',expectedFingerprint:null}])).rejects.toThrow('MEMORY_PATH_SYMLINK');
});
test('a corrupt journal fails closed and preserves its original bytes',async()=>{
 const dir=await root(),tx=new MemoryTransactionCoordinator(path.join(dir,'state'));
 const broken=path.join(tx.root,'broken'); await mkdir(broken,{recursive:true}); await writeFile(path.join(broken,'journal.json'),'{');
 await expect(tx.recover()).rejects.toThrow('MEMORY_TRANSACTION_RECOVERY_BLOCKED');
 expect(await readFile(path.join(broken,'journal.json'),'utf8')).toBe('{');
});

test('transact couples declared state and canonical data; immutable replay and read-set CAS',async()=>{
 const {initializeMemoryRoot}=await import('../../../src/memory/facade.js');
 const {FileMemoryStore}=await import('../../../src/memory/store.js'); const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const dir=await root(); const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Synthetic atomic input'}); const paths=resolveMemoryPaths(dir,dir); const store=new FileMemoryStore(paths);
 const key=`operations/${'a'.repeat(64)}.json`;
 const apply=()=>store.transact([key],snapshot=>{
   const previous=snapshot.state.get(key)!;
   if(previous.content) return {records:snapshot.records,touchedIds:[],stateWrites:[],result:JSON.parse(previous.content)};
   return {records:snapshot.records.map(r=>r.id===record.id?{...r,title:'Committed once'}:r),touchedIds:[record.id],stateWrites:[{key,content:JSON.stringify({ok:true})}],result:{ok:true}};
 });
 expect(await apply()).toMatchObject({result:{ok:true}}); expect(await apply()).toMatchObject({result:{ok:true}});
 await expect(store.transact([key],s=>({records:s.records,touchedIds:[],stateWrites:[{key,content:'different'}],result:null}))).rejects.toThrow('MEMORY_STATE_IMMUTABLE_CONFLICT');
 await expect(store.transact([],s=>({records:s.records,touchedIds:[],stateWrites:[{key,content:'new'}],result:null}))).rejects.toThrow('MEMORY_STATE_WRITE_UNDECLARED_OR_DUPLICATE');
 await expect(store.transact(['../../../outside'],s=>({records:s.records,touchedIds:[],stateWrites:[],result:null}))).rejects.toThrow('MEMORY_STATE_KEY_INVALID');
 const {writeFileSync}=await import('node:fs');
 await expect(store.transact([key],s=>{writeFileSync(path.join(dir,'state',key),'external drift');return {records:s.records,touchedIds:[],stateWrites:[],result:null};})).rejects.toThrow('MEMORY_REVISION_CONFLICT');
 expect((await service.read(record.id,false))?.title).toBe('Committed once');
});

test('same-process contending store transactions preserve all increments',async()=>{
 const {initializeMemoryRoot}=await import('../../../src/memory/facade.js');
 const {FileMemoryStore}=await import('../../../src/memory/store.js'); const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const dir=await root(); const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Synthetic contention counter',title:'0'});
 const store=new FileMemoryStore(resolveMemoryPaths(dir,dir));
 await Promise.all(Array.from({length:12},()=>store.mutate(record.id,current=>({...current,title:String(Number(current.title)+1)}))));
 expect((await service.read(record.id,false))?.title).toBe('12');
});

async function spawnFixture(rootDir:string,id:string,boundary:string,operation='fixture-operation',count=1) {
 const {spawn}=await import('node:child_process');
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/memory-transaction-child.mjs',import.meta.url)),rootDir,id,boundary,operation,String(count)],{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr=''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
 const exit=new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code));});
 const ready=new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`Child boundary timeout: ${stdout} ${stderr}`));},15000);
   child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('"boundary"')) {clearTimeout(timer);resolve();}});
   child.stderr.on('data',chunk=>{stderr+=chunk;});
   exit.then(code=>{clearTimeout(timer);if(code===0)resolve();else if(!stdout.includes('"boundary"'))reject(new Error(`Child failed ${code}: ${stdout} ${stderr}`));});
 });
 await ready;
 return {child,exit,output:()=>({stdout,stderr})};
}

for(const boundary of ['preparing','prepared','apply','committed','response']) test(`killed child at ${boundary} recovers one complete side and stable replay`,async()=>{
 const {initializeMemoryRoot,MemoryService}=await import('../../../src/memory/facade.js'); const {utimes}=await import('node:fs/promises');
 const dir=await root(); const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Synthetic crash source',title:'0'});
 const child=await spawnFixture(dir,record.id,boundary);
 child.child.kill('SIGKILL'); await child.exit;
 // Simulate expiration only on our killed process's synthetic lease, without deleting it.
 const expired=new Date(Date.now()-180000); await utimes(path.join(dir,'.memory.lock'),expired,expired).catch(error=>{if(error.code!=='ENOENT')throw error;});
 const recovered=await MemoryService.initialize(dir,dir);
 expect(recovered.health().canonicalStore).toBe('available');
 const committed=['committed','response'].includes(boundary);
 expect((await recovered.read(record.id,false))?.title).toBe(committed?'1':'0');
 expect(await readdir(path.join(dir,'notes'))).toHaveLength(1);
 expect(await readdir(path.join(dir,'archive/objects'))).toHaveLength(committed?3:2);
 expect(await readdir(path.join(dir,'archive/manifests'))).toHaveLength(committed?3:2);
 const {readArchivedMemory}=await import('../../../src/memory/archive.js');
 const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const {memorySemanticRevision}=await import('../../../src/memory/disclosure.js');
 expect(await readArchivedMemory(resolveMemoryPaths(dir,dir),{kind:'memory',id:record.id,revision:memorySemanticRevision(record)})).toEqual(record);
 const replay=await spawnFixture(dir,record.id,'none'); expect(await replay.exit).toBe(0); expect(replay.output().stderr).toBe('');
 expect((await recovered.read(record.id,false))?.title).toBe('1');
 const replayAgain=await spawnFixture(dir,record.id,'none'); expect(await replayAgain.exit).toBe(0);
 expect(replayAgain.output().stdout).toBe(replay.output().stdout);
 expect((await recovered.read(record.id,false))?.title).toBe('1');
 expect(await readdir(path.join(dir,'notes'))).toHaveLength(1);
 expect(await readdir(path.join(dir,'archive/objects'))).toHaveLength(3);
 expect(await readdir(path.join(dir,'state/operations'))).toHaveLength(1);
 expect(await readdir(path.join(dir,'state/transactions'))).toEqual([]);
},20000);

test('cleanup failure after committed marker returns success and replay remains identical',async()=>{
 const {initializeMemoryRoot,MemoryService}=await import('../../../src/memory/facade.js');
 const dir=await root(); const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Synthetic committed source',title:'0'});
 const child=await spawnFixture(dir,record.id,'cleanup'); expect(await child.exit).toBe(0);
 expect(JSON.parse(child.output().stdout)).toMatchObject({result:{committed:true,value:'1'},cleanupFailed:true});
 expect(await readdir(path.join(dir,'state/transactions'))).toHaveLength(1);
 const reopened=await MemoryService.initialize(dir,dir); expect((await reopened.read(record.id,false))?.title).toBe('1');
 const replay=await spawnFixture(dir,record.id,'none'); expect(await replay.exit).toBe(0);
 expect(JSON.parse(replay.output().stdout).result).toEqual(JSON.parse(child.output().stdout).result);
 expect((await reopened.read(record.id,false))?.title).toBe('1');
},20000);

test('two processes serialize independent transactions without lost increments',async()=>{
 const {initializeMemoryRoot}=await import('../../../src/memory/facade.js');
 const dir=await root(); const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Synthetic cross-process counter',title:'0'});
 const children=await Promise.all([spawnFixture(dir,record.id,'none','writer-a',4),spawnFixture(dir,record.id,'none','writer-b',4)]);
 for(const child of children){expect(await child.exit).toBe(0);expect(child.output().stderr).toBe('');}
 expect((await service.read(record.id,false))?.title).toBe('8');
 expect(await readdir(path.join(dir,'state/operations'))).toHaveLength(8);
},20000);

test('CAS fingerprints are captured with canonical bytes, before the planner sees them',async()=>{
 const {vi}=await import('vitest'); const {initializeMemoryRoot}=await import('../../../src/memory/facade.js');
 const {FileMemoryStore}=await import('../../../src/memory/store.js'); const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const {parseCanonicalNote,serializeCanonicalNote}=await import('../../../src/memory/note-format.js');
 const dir=await root(); const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Source before external edit'});const store=new FileMemoryStore(resolveMemoryPaths(dir,dir));
 const actualLoad=store.loadAll.bind(store);const target=path.join(dir,'notes',`${record.id}.md`);
 const spy=vi.spyOn(store,'loadAll').mockImplementationOnce(async()=>{
  const loaded=await actualLoad();const current=parseCanonicalNote(await readFile(target,'utf8'));
  await writeFile(target,serializeCanonicalNote({...current,content:'External edit must not be overwritten'}));return loaded;
 });
 try {await expect(store.mutate(record.id,current=>({...current,title:'Stale planned title'}))).rejects.toThrow('MEMORY_REVISION_CONFLICT');}
 finally {spy.mockRestore();}
 expect(parseCanonicalNote(await readFile(target,'utf8')).content).toBe('External edit must not be overwritten');
});

test('legacy in-flight journal is an explicit preserved blocker before activation',async()=>{
 const {initializeMemoryRoot,MemoryService}=await import('../../../src/memory/facade.js');
 const dir=await root();await initializeMemoryRoot({memoryRoot:dir});
 const journalDir=path.join(dir,'state/transactions/old-transaction');await mkdir(path.join(journalDir,'backup'),{recursive:true});
 const journal=JSON.stringify({version:1,id:'old-transaction',phase:'prepared',entries:[]});
 await writeFile(path.join(journalDir,'journal.json'),journal);await writeFile(path.join(journalDir,'backup/source.md'),'unchanged synthetic source');
 const requested=await MemoryService.initialize(dir,dir,undefined,{experience:{enabled:true}});
 expect(requested.health().canonicalStore).toBe('error');
 expect(requested.getIssues().map(x=>x.message).join()).toContain('MEMORY_TRANSACTION_JOURNAL_VERSION_UNSUPPORTED');
 expect(await readFile(path.join(journalDir,'journal.json'),'utf8')).toBe(journal);
 expect(await readFile(path.join(journalDir,'backup/source.md'),'utf8')).toBe('unchanged synthetic source');
 await expect(readFile(path.join(dir,'state/experience-manifest.json'))).rejects.toThrow();
 await expect(requested.remember({content:'Never written'})).rejects.toThrow();
});

test('content-addressed state objects reject an incorrect digest before publication',async()=>{
 const {initializeMemoryRoot}=await import('../../../src/memory/facade.js');const {FileMemoryStore}=await import('../../../src/memory/store.js');const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const dir=await root();await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});const store=new FileMemoryStore(resolveMemoryPaths(dir,dir));
 const key=`archive/objects/${'0'.repeat(64)}`;
 await expect(store.transact([key],s=>({records:s.records,touchedIds:[],stateWrites:[{key,content:'bytes with another hash'}],result:null}))).rejects.toThrow('MEMORY_ARCHIVE_DIGEST_MISMATCH');
 await expect(readFile(path.join(dir,key))).rejects.toThrow();
});

test('startup waits for a live writer and never recovers its in-flight journal',async()=>{
 const {initializeMemoryRoot,MemoryService}=await import('../../../src/memory/facade.js');const {utimes}=await import('node:fs/promises');
 const dir=await root();const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Synthetic startup exclusion',title:'0'});const writer=await spawnFixture(dir,record.id,'apply');
 let settled=false;const opening=MemoryService.initialize(dir,dir).then(value=>{settled=true;return value;});
 await new Promise(resolve=>setTimeout(resolve,80));expect(settled).toBe(false);
 const journals=await readdir(path.join(dir,'state/transactions'));expect(journals).toHaveLength(1);
 expect(JSON.parse(await readFile(path.join(dir,'state/transactions',journals[0],'journal.json'),'utf8')).phase).toBe('applying');
 writer.child.kill('SIGKILL');await writer.exit;const expired=new Date(Date.now()-180000);await utimes(path.join(dir,'.memory.lock'),expired,expired);
 const reopened=await opening;expect(reopened.health().canonicalStore).toBe('available');expect((await reopened.read(record.id,false))?.title).toBe('0');
},20000);

test('valid-version malicious journal targets and corrupted backups remain untouched blockers',async()=>{
 const {randomUUID}=await import('node:crypto');const dir=await root();const outside=path.join(await root(),'victim');await writeFile(outside,'untouched');
 const tx=new MemoryTransactionCoordinator(path.join(dir,'state'));const id=randomUUID();const location=path.join(tx.root,id);await mkdir(location,{recursive:true});
 await writeFile(path.join(location,'journal.json'),JSON.stringify({version:2,id,phase:'applying',entries:[{targetPath:outside,before:null,after:null}]}));
 await expect(tx.recover()).rejects.toThrow('MEMORY_TRANSACTION_RECOVERY_BLOCKED');expect(await readFile(outside,'utf8')).toBe('untouched');
 // A separate root verifies checksums independently of unsupported/malformed schemas.
 const other=await root();const tx2=new MemoryTransactionCoordinator(path.join(other,'state'));const id2=randomUUID();const pending=path.join(tx2.root,id2);const target=path.join(other,'canonical');
 await mkdir(path.join(pending,'stage'),{recursive:true});await mkdir(path.join(pending,'backup'));await writeFile(target,'new');
 await writeFile(path.join(pending,'stage/0.txt'),'new');await writeFile(path.join(pending,'backup/0.txt'),'corrupted source');
 const journal=JSON.stringify({version:2,id:id2,phase:'applying',entries:[{targetPath:target,before:fingerprintText('old'),after:fingerprintText('new')}]});await writeFile(path.join(pending,'journal.json'),journal);
 await expect(tx2.recover()).rejects.toThrow('MEMORY_TRANSACTION_RECOVERY_BLOCKED');
 expect(await readFile(target,'utf8')).toBe('new');expect(await readFile(path.join(pending,'journal.json'),'utf8')).toBe(journal);expect(await readFile(path.join(pending,'backup/0.txt'),'utf8')).toBe('corrupted source');
});

test('recovery rejects duplicate canonical destinations disguised by path aliases',async()=>{
 const {randomUUID}=await import('node:crypto');const dir=await root();const tx=new MemoryTransactionCoordinator(path.join(dir,'state'));const id=randomUUID();const pending=path.join(tx.root,id);await mkdir(pending,{recursive:true});
 const target=path.join(dir,'notes','not-created.md');const alias=path.join(dir,'notes')+'/./not-created.md';
 const bytes=JSON.stringify({version:2,id,phase:'applying',entries:[{targetPath:target,before:null,after:null},{targetPath:alias,before:null,after:null}]});await writeFile(path.join(pending,'journal.json'),bytes);
 await expect(tx.recover()).rejects.toThrow('MEMORY_TRANSACTION_RECOVERY_BLOCKED');expect(await readFile(path.join(pending,'journal.json'),'utf8')).toBe(bytes);
});

for (const drift of ['incomplete','missing','generation'] as const) test(`activation CAS rejects ${drift} drift after parsing and before canonical snapshot returns`,async()=>{
 const {vi}=await import('vitest');
 const {initializeMemoryRoot}=await import('../../../src/memory/facade.js');
 const {FileMemoryStore}=await import('../../../src/memory/store.js');
 const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const dir=await root();const service=await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});
 const record=await service.remember({content:'Synthetic activation CAS source',title:'Unchanged canonical'});
 const paths=resolveMemoryPaths(dir,dir), store=new FileMemoryStore(paths);
 const note=path.join(paths.notes,`${record.id}.md`), original=await readFile(note,'utf8');
 const manifest=JSON.parse(await readFile(paths.experienceManifest,'utf8'));
 const changed=JSON.stringify({...manifest,...(drift==='incomplete'?{status:'incomplete'}:{generation:manifest.generation+1})})+'\n';
 const load=store.loadAll.bind(store);
 const spy=vi.spyOn(store,'loadAll').mockImplementationOnce(async()=>{
   const snapshot=await load();
   if(drift==='missing')await rm(paths.experienceManifest);else await writeFile(paths.experienceManifest,changed);
   return snapshot;
 });
 try {await expect(store.mutate(record.id,r=>({...r,title:'Must not commit stale activation'}))).rejects.toThrow('MEMORY_REVISION_CONFLICT');}
 finally {spy.mockRestore();}
 expect(await readFile(note,'utf8')).toBe(original);
 expect(await readdir(paths.archiveObjects)).toHaveLength(2);
 if(drift==='missing')await expect(readFile(paths.experienceManifest)).rejects.toThrow();
 else expect(await readFile(paths.experienceManifest,'utf8')).toBe(changed);
 expect(await readdir(path.join(paths.state,'transactions'))).toEqual([]);
});

test('activation CAS also binds an originally absent manifest',async()=>{
 const {vi}=await import('vitest');const {initializeMemoryRoot}=await import('../../../src/memory/facade.js');
 const {FileMemoryStore}=await import('../../../src/memory/store.js');const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const dir=await root();const service=await initializeMemoryRoot({memoryRoot:dir});const record=await service.remember({content:'Synthetic legacy activation race'});
 const paths=resolveMemoryPaths(dir,dir),store=new FileMemoryStore(paths),note=path.join(paths.notes,`${record.id}.md`);
 const original=await readFile(note,'utf8');const appeared=JSON.stringify({schemaVersion:1,formatVersion:2,rootId:'synthetic-new-root',generation:1,status:'incomplete'});
 const load=store.loadAll.bind(store);const spy=vi.spyOn(store,'loadAll').mockImplementationOnce(async()=>{
   const snapshot=await load();await writeFile(paths.experienceManifest,appeared);return snapshot;
 });
 try {await expect(store.mutate(record.id,r=>({...r,title:'Blocked stale legacy decision'}))).rejects.toThrow('MEMORY_REVISION_CONFLICT');}
 finally {spy.mockRestore();}
 expect(await readFile(note,'utf8')).toBe(original);expect(await readFile(paths.experienceManifest,'utf8')).toBe(appeared);
});
