import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { initializeMemoryRoot, MemoryService } from '../../../src/memory/facade.js';
const roots:string[]=[];
async function root(){ const dir=await mkdtemp(path.join(os.tmpdir(),'memory-t2-migrate-')); roots.push(dir); return dir; }
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});

test('experience activation never upgrades a populated legacy root in place',async()=>{
 const dir=await root(); const old=await initializeMemoryRoot({memoryRoot:dir});
 const record=await old.remember({content:'Synthetic old store'});
 const before=await readFile(path.join(dir,'notes',`${record.id}.md`),'utf8');
 const requested=await MemoryService.initialize(dir,dir,undefined,{experience:{enabled:true}});
 expect(requested.health().canonicalStore).toBe('error');
 expect(requested.getIssues().map(x=>x.message).join()).toContain('MEMORY_EXPERIENCE_REQUIRES_EMPTY_ROOT');
 expect(await readFile(path.join(dir,'notes',`${record.id}.md`),'utf8')).toBe(before);
});

test('incomplete activation is fail-closed and never becomes legacy after restart',async()=>{
 const dir=await root(); await initializeMemoryRoot({memoryRoot:dir});
 await writeFile(path.join(dir,'state/experience-manifest.json'),JSON.stringify({schemaVersion:1,formatVersion:2,rootId:'synthetic-root',generation:1,status:'incomplete'}));
 const resumed=await MemoryService.initialize(dir,dir);
 expect(resumed.health().canonicalStore).toBe('error');
 await expect(resumed.remember({content:'Must remain blocked'})).rejects.toThrow();
});

test('pure legacy upgrade preserves available fields and never invents classification',async()=>{
 const {upgradeLegacySnapshot}=await import('../../../src/memory/migration.js');
 const dir=await root(); const service=await initializeMemoryRoot({memoryRoot:dir});
 const original=await service.remember({title:'Synthetic mixed historical note',content:'One result and an unresolved hypothesis',provenance:{workspace:'synthetic',files:[]}});
 const before=JSON.stringify(original); const [upgraded]=upgradeLegacySnapshot([original]);
 expect(original.version).toBe(1); expect(JSON.stringify(original)).toBe(before);
 expect(upgraded).toMatchObject({...original,version:2,experience:{kind:'note',epistemic:'unknown',temporal:'unknown',retention:'durable',verification:{status:'unverified',evidence:[]},validity:{state:'unknown'},sourceRefs:[]}});
 upgraded.tags.push('different'); expect(original.tags).not.toContain('different');
 expect(()=>upgradeLegacySnapshot([upgraded])).toThrow('MEMORY_MIGRATION_SOURCE_NOT_V1');
});

for(const stop of ['incomplete','copied'] as const)test(`synthetic copy-upgrade interrupted at ${stop} keeps source, blocks target, verifies replay and rollback`,async()=>{
 const {syntheticCopyUpgrade}=await import('./helpers/memory-copy-upgrade.js');
 const {readArchivedMemory,readArchiveManifest,readArchiveObject}=await import('../../../src/memory/archive.js');
 const {resolveMemoryPaths}=await import('../../../src/memory/paths.js');
 const source=await root(),target=await root();
 const old=await initializeMemoryRoot({memoryRoot:source}); await initializeMemoryRoot({memoryRoot:target});
 const record=await old.remember({content:'Synthetic original source',title:'Original',provenance:{workspace:'synthetic',files:[]}});
 for(let i=0;i<11;i++)await old.update(record.id,{content:`Synthetic available revision ${i}`});
 await old.feedback(record.id,'known-helpful','helpful');
 await old.search('Synthetic available',{limit:1,maxNeighbors:0});
 const originalBytes=await readFile(path.join(source,'notes',`${record.id}.md`),'utf8');
 const interrupted=await syntheticCopyUpgrade(source,target,stop);expect(interrupted.complete).toBe(false);
 expect((await MemoryService.initialize(target,target)).health().canonicalStore).toBe('error');
 expect(await readFile(path.join(source,'notes',`${record.id}.md`),'utf8')).toBe(originalBytes);
 const complete=await syntheticCopyUpgrade(source,target);expect(complete.complete).toBe(true);
 expect(await syntheticCopyUpgrade(source,target)).toEqual(complete);
 const upgraded=await MemoryService.initialize(target,target);expect(upgraded.health().canonicalStore).toBe('available');
 expect((await upgraded.read(record.id,false))?.version).toBe(2);
 const paths=resolveMemoryPaths(target,target);
 for(const ref of complete.refs)expect((await readArchivedMemory(paths,ref)).id).toBe(ref.id);
 const audit=await readArchiveManifest(paths,complete.auditRef);expect(audit.details.historyCompleteness).toBe('available-only');
 expect(audit.details.availableHistoricalSnapshots).toBe(8);
 for(const file of audit.details.files)expect(await readArchiveObject(paths,file.digest)).toBe(await readFile(path.join(source,file.name),'utf8'));
 const rollback=await MemoryService.initialize(source,source);expect((await rollback.read(record.id,false))?.version).toBe(1);
 expect(await readFile(path.join(source,'notes',`${record.id}.md`),'utf8')).toBe(originalBytes);
});

test('synthetic copy replay refuses altered destination immutable evidence',async()=>{
 const {syntheticCopyUpgrade}=await import('./helpers/memory-copy-upgrade.js');
 const source=await root(),target=await root();const service=await initializeMemoryRoot({memoryRoot:source});await initializeMemoryRoot({memoryRoot:target});
 await service.remember({content:'Synthetic replay evidence'});
 await syntheticCopyUpgrade(source,target,'copied');
 const auditPath=path.join(target,'archive/manifests/synthetic-upgrade-source.json');await writeFile(auditPath,'altered evidence');
 await expect(syntheticCopyUpgrade(source,target)).rejects.toThrow('SYNTHETIC_IMMUTABLE_CONFLICT');
 expect(await readFile(auditPath,'utf8')).toBe('altered evidence');
 expect(JSON.parse(await readFile(path.join(target,'state/experience-manifest.json'),'utf8')).status).toBe('incomplete');
});

test('activation rejects a note-empty legacy root that still contains auxiliary evidence',async()=>{
 const dir=await root();const service=await initializeMemoryRoot({memoryRoot:dir});const record=await service.remember({content:'Synthetic evidence from a retired note'});
 await service.search('Synthetic evidence',{limit:1,maxNeighbors:0});await service.delete(record.id);
 const bytes=await readFile(path.join(dir,'state/retrieval-ledger.jsonl'),'utf8');
 const requested=await MemoryService.initialize(dir,dir,undefined,{experience:{enabled:true}});
 expect(requested.health().canonicalStore).toBe('error');expect(requested.getIssues().map(x=>x.message).join()).toContain('MEMORY_EXPERIENCE_REQUIRES_EMPTY_ROOT');
 expect(await readFile(path.join(dir,'state/retrieval-ledger.jsonl'),'utf8')).toBe(bytes);
});

test('loss of the activation manifest on a foundation-only evolved root never silently becomes legacy',async()=>{
 const dir=await root();await initializeMemoryRoot({memoryRoot:dir,experience:{enabled:true}});await rm(path.join(dir,'state/experience-manifest.json'));
 const reopened=await MemoryService.initialize(dir,dir);expect(reopened.health().canonicalStore).toBe('error');
 expect(reopened.getIssues().map(x=>x.message).join()).toContain('MEMORY_EXPERIENCE_MANIFEST_REQUIRED');
});
