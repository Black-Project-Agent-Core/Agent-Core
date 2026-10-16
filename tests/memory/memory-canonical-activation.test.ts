import path from 'node:path';
import {createHash} from 'node:crypto';
import {access,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {afterEach,expect,it} from 'vitest';
import {initializeMemoryRoot} from '../../src/memory/initialize.js';
import {initializeAgentCoreMemory} from '../../src/memory/host-runtime.js';

const dirs:string[]=[];
async function fixture(){const base=path.resolve('runtime/tmp');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'canonical-activation-'));dirs.push(root);return root;}
afterEach(async()=>{for(const root of dirs.splice(0))await rm(root,{recursive:true,force:true});});
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const activate=async(root:string,operation:'fresh'|'relocate'|'metadata',dryRun=false)=>(await import('../../src/memory/host-activation.js')).activateCanonicalMemory(root,{operation,dryRun});

it('preflights without writing and explicitly activates one fresh canonical root',async()=>{
 const root=await fixture();
 await expect(activate(root,'fresh',true)).resolves.toMatchObject({operation:'fresh',dryRun:true,root:path.join(root,'runtime/memory')});
 expect(await readdir(root)).toEqual([]);
 const result=await activate(root,'fresh');
 expect(result).toMatchObject({operation:'fresh',dryRun:false,root:path.join(root,'runtime/memory')});
 const runtime=await initializeAgentCoreMemory(root,path.join(root,'runtime/memory'));
 expect(runtime.mode).toBe('experience-v2');
 expect(runtime.experience!.health().canonicalComplete).toBe(true);
 const note=await runtime.service.remember({title:'Fresh host',content:'Retain one authoritative root',provenance:{workspace:'agent-core',files:[]}});
 expect(await (await initializeAgentCoreMemory(root,runtime.root)).service.read(note.id,false)).toMatchObject({id:note.id,version:2});
 await expect(access(path.join(root,'runtime/memory-v2'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(activate(root,'fresh')).rejects.toThrow('ACTIVATION_ALREADY_EXISTS');
});
it.each(['memory','memory-v2'])('fresh activation refuses existing %s without changing it',async(name)=>{
 const root=await fixture(),folder=path.join(root,'runtime',name);
 await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'unknown.txt'),'Do not replace');
 await expect(activate(root,'fresh')).rejects.toThrow('FRESH_ROOT_REQUIRED');
 expect(await readFile(path.join(folder,'unknown.txt'),'utf8')).toBe('Do not replace');
 await expect(access(path.join(root,'runtime/memory/state/host/activation.json'))).rejects.toMatchObject({code:'ENOENT'});
});
it.each(['identity','incomplete','missing-manifest','config','historical-conflict','relocated-no-backup'])('canonical activation fails closed for %s',async(kind)=>{
 const root=await fixture();await activate(root,'fresh');
 const markerPath=path.join(root,'runtime/memory/state/host/activation.json');
 const marker=JSON.parse(await readFile(markerPath,'utf8'));
 if(kind==='identity')marker.rootId='foreign-root-identity';
 if(kind==='incomplete')marker.status='preparing';
 if(kind==='relocated-no-backup'){marker.origin='relocated';delete marker.backup;delete marker.legacyDigest;}
 await writeFile(markerPath,JSON.stringify(marker));
 if(kind==='missing-manifest')await rm(path.join(root,'runtime/memory/state/experience-manifest.json'));
 if(kind==='historical-conflict'){await mkdir(path.join(root,'runtime/memory-v2'));await writeFile(path.join(root,'runtime/memory-v2/unknown.txt'),'Preserve');}
 const expected={identity:'ROOT_IDENTITY_MISMATCH',incomplete:'INCOMPLETE_MARKER','missing-manifest':'EXPERIENCE_MANIFEST_REQUIRED',config:'CONFIGURED_ROOT_CONFLICT','historical-conflict':'HISTORICAL_ROOT_REQUIRES_REVIEW','relocated-no-backup':'UNAUTHORIZED_MARKER'}[kind]!;
 await expect(initializeAgentCoreMemory(root,path.join(root,kind==='config'?'custom-memory':'runtime/memory'))).rejects.toThrow(expected);
});
it('fresh activation refuses a symlinked runtime before writing through it',async()=>{
 const root=await fixture(),external=await fixture();await symlink(external,path.join(root,'runtime'),'dir');
 await expect(activate(root,'fresh')).rejects.toThrow('SYMLINK_PATH');
 expect(await readdir(external)).toEqual([]);
});
it('never opens the legacy writer after both experience manifests are lost',async()=>{
 const root=await fixture();await activate(root,'fresh');
 await rm(path.join(root,'runtime/memory/state/host/activation.json'));
 await rm(path.join(root,'runtime/memory/state/experience-manifest.json'));
 await expect(initializeAgentCoreMemory(root,path.join(root,'runtime/memory'))).rejects.toThrow('ACTIVATION_REQUIRED');
});
it('serializes simultaneous fresh activations and leaves one owner',async()=>{
 const root=await fixture();
 const results=await Promise.allSettled([activate(root,'fresh'),activate(root,'fresh')]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect(results.find(result=>result.status==='rejected')).toBeDefined();
 expect((await initializeAgentCoreMemory(root,path.join(root,'runtime/memory'))).mode).toBe('experience-v2');
});
it('preserves a historical activation until explicit relocation and retains note identity/history',async()=>{
 const root=await fixture(),old=path.join(root,'runtime/memory'),source=path.join(root,'runtime/memory-v2');
 const service=await initializeMemoryRoot({baseDir:root,memoryRoot:source,experience:{enabled:true}});
 const note=await service.remember({title:'Retained note',content:'Original source evidence',provenance:{workspace:'agent-core',files:[]}});
 await service.update(note.id,{content:'Corrected source evidence'});
 const manifest=JSON.parse(await readFile(path.join(source,'state/experience-manifest.json'),'utf8'));
 const files=[{path:'00-agent-core-memory.md',text:'# Historical legacy foundation\n'},{path:'notes/old.md',text:'Archived legacy data\n'}];
 const backup='runtime/backups/memory-v1-final-before-v2-20261008/manifest.json';
 for(const row of files){for(const base of [old,path.join(root,path.dirname(backup),'memory')]){await mkdir(path.dirname(path.join(base,row.path)),{recursive:true});await writeFile(path.join(base,row.path),row.text);}}
 const inventory=files.map(row=>({path:row.path,bytes:Buffer.byteLength(row.text),sha256:sha(row.text)}));
 const digest=sha(JSON.stringify(inventory));
 await writeFile(path.join(root,backup),JSON.stringify({snapshotDigest:digest,fileCount:inventory.length,files:inventory}));
 const marker={schemaVersion:1,mode:'experience-v2',root:'runtime/memory-v2',backup,legacyDigest:digest,sourceRootId:manifest.rootId};
 await writeFile(path.join(root,'runtime/memory-v2-activation.json'),JSON.stringify(marker));
 await expect(initializeAgentCoreMemory(root,old)).rejects.toThrow('OFFLINE_LAYOUT_MIGRATION_REQUIRED');
 const before=await readFile(path.join(source,'notes',note.id+'.md'),'utf8');
 const revisions=await readdir(path.join(source,'state/revisions'));
 await expect(activate(root,'relocate',true)).resolves.toMatchObject({operation:'relocate',dryRun:true,rootId:manifest.rootId});
 expect(JSON.parse(await readFile(path.join(root,'runtime/memory-v2-activation.json'),'utf8'))).toEqual(marker);
 // Neither drifted live legacy data nor a corrupt rollback copy may be hidden
 // by selecting the new canonical path.
 await writeFile(path.join(old,'notes/old.md'),'Unreviewed legacy change');
 await expect(activate(root,'relocate')).rejects.toThrow('LEGACY_ROOT_CHANGED_REVIEW_REQUIRED');
 await writeFile(path.join(old,'notes/old.md'),files[1]!.text);
 const backupNote=path.join(root,path.dirname(backup),'memory/notes/old.md');
 await writeFile(backupNote,'Corrupt backup');
 await expect(activate(root,'relocate')).rejects.toThrow('LEGACY_BACKUP_CONTENT_MISMATCH');
 await writeFile(backupNote,files[1]!.text);
 expect(JSON.parse(await readFile(path.join(root,'runtime/memory-v2-activation.json'),'utf8'))).toEqual(marker);
 const result=await activate(root,'relocate');
 const selected=await initializeAgentCoreMemory(root,old);
 expect(selected.root).toBe(old);expect(selected.mode).toBe('experience-v2');
 expect(await readFile(path.join(old,'notes',note.id+'.md'),'utf8')).toBe(before);
 expect(await readdir(path.join(old,'state/revisions'))).toEqual(revisions);
 expect(await readFile(path.join(root,result.preservedLegacy!,'notes/old.md'),'utf8')).toBe('Archived legacy data\n');
 expect(await selected.service.read(note.id,false)).toMatchObject({id:note.id,content:'Corrected source evidence'});
 await expect(access(source)).rejects.toMatchObject({code:'ENOENT'});
});

it('migrates old canonical control metadata explicitly without rewriting a note',async()=>{
 const root=await fixture();await activate(root,'fresh');
 const current=path.join(root,'runtime/memory/state/host/activation.json');
 const previous=path.join(root,'runtime/memory-v2-activation.json');
 const {rename}=await import('node:fs/promises');await rename(current,previous);
 const note=path.join(root,'runtime/memory/00-agent-core-memory.md'),before=await readFile(note);
 await expect(initializeAgentCoreMemory(root,path.join(root,'runtime/memory'))).rejects.toThrow('OFFLINE_LAYOUT_MIGRATION_REQUIRED');
 const preview=await activate(root,'metadata',true);expect(preview.dryRun).toBe(true);await access(previous);
 await activate(root,'metadata');expect(await readFile(note)).toEqual(before);
 await expect(access(previous)).rejects.toMatchObject({code:'ENOENT'});
 expect((await initializeAgentCoreMemory(root,path.join(root,'runtime/memory'))).service).toBeDefined();
});
it('never silently starts a legacy writer or resets unactivated canonical data',async()=>{
 const root=await fixture(),notes=path.join(root,'runtime/memory/notes');await mkdir(notes,{recursive:true});
 await writeFile(path.join(notes,'keep.md'),'retained old bytes');
 await expect(initializeAgentCoreMemory(root,path.join(root,'runtime/memory'))).rejects.toThrow('ACTIVATION_REQUIRED');
 expect(await readFile(path.join(notes,'keep.md'),'utf8')).toBe('retained old bytes');
});
