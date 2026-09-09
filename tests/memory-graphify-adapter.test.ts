import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { stat, utimes, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { GraphifyAdapter } from '../src/memory/file-native/graphify-adapter.js';
import { FileNativeMemoryRetriever } from '../src/memory/file-native/retriever.js';

const scope={principalId:'p',projectId:'project'};
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'ac-graphify-'));const paths=resolveFileNativeMemoryPaths(root);await mkdir(paths.ripgrepRoot,{recursive:true});await copyFile(path.resolve('.tools','ripgrep','rg.exe'),path.join(paths.ripgrepRoot,'rg.exe'));const repo=new FileNativeMemoryRepository(paths);const a=await repo.commit({scope,canonicalKey:'failure:corruption',kind:'failure',value:'Corrupt state blocked memory.',metadata:{contextFamily:'failure',topicKey:'memory'}});const b=await repo.commit({scope,canonicalKey:'procedure:file-native',kind:'procedure',value:'File-native memory resolves the corruption.',metadata:{contextFamily:'procedure',topicKey:'memory'},explicitRelations:[{targetMemoryId:a.memoryId,relation:'resolved_by'}]});await repo.addExplicitRelation({scope,fromMemoryId:b.memoryId,toMemoryId:a.memoryId,relation:'same_anchor',reasonCode:'fixture'});await repo.addExplicitRelation({scope,fromMemoryId:b.memoryId,toMemoryId:a.memoryId,relation:'token_overlap',reasonCode:'fixture'});const adapter=new GraphifyAdapter(paths,{pythonPath:path.resolve('.tools','python','python.exe'),bridgePath:path.resolve('scripts','memory','graphify-bridge.py')});return{paths,repo,a,b,adapter};}

describe('deterministic Graphify derived index',()=>{
 it('turns explicit vault relations into EXTRACTED Graphify edges without a cloud semantic pass',async()=>{const f=await fixture();await f.adapter.update([]);const graph=JSON.parse(await readFile(path.join(f.paths.graphRoot,'graph.json'),'utf8'));const edge=(graph.edges??graph.links??[]).find((e:any)=>e.source===f.b.memoryId&&e.target===f.a.memoryId);expect(edge).toBeTruthy();expect(edge.confidence).toBe('EXTRACTED');expect(edge.agent_core_relation_types).toEqual(expect.arrayContaining(['resolved_by','same_anchor','token_overlap']));expect(edge.agent_core_relation_count).toBe(3);expect(JSON.stringify(graph)).toContain(f.a.memoryId);expect(JSON.stringify(graph)).toContain(f.b.memoryId);});
 it('rebuilds graph.json from canonical Markdown after derived graph deletion',async()=>{const f=await fixture();await f.adapter.update([]);await rm(f.paths.graphRoot,{recursive:true,force:true});const related=await f.adapter.queryRelated([f.b.memoryId],16);expect(related.get(f.a.memoryId)?.score).toBeGreaterThan(0);expect(await readFile(path.join(f.paths.graphRoot,'graph.json'),'utf8')).toContain(f.a.memoryId);});
 it('does not disguise a failed graph recall as successful empty graph context',async()=>{const f=await fixture();const retriever=new FileNativeMemoryRetriever(f.paths,{itemBudget:4,characterBudget:2000,graphProvider:{async scoreRelated(){throw new Error('graph down');}}});await expect(retriever.search({scope,query:'File-native memory corruption'})).rejects.toThrow('graph down');});
 it('detects a stale graph after another repository adds a relation and repairs it before recall',async()=>{const f=await fixture();await f.adapter.update([]);const c=await f.repo.commit({scope,canonicalKey:'decision:repair',kind:'decision',value:'Repair the derived index before recall.',explicitRelations:[{targetMemoryId:f.a.memoryId,relation:'validated_by'}]});expect(await f.adapter.health()).toMatchObject({healthy:false,errorCode:'MEMORY_GRAPH_STALE'});const related=await f.adapter.queryRelated([f.a.memoryId],16);expect(related.has(c.memoryId)).toBe(true);expect(await f.adapter.health()).toMatchObject({healthy:true});});
 it('proves the Graphify module can execute instead of treating an existing executable as ready',async()=>{const f=await fixture();const unavailable=new GraphifyAdapter(f.paths,{pythonPath:process.execPath,bridgePath:path.resolve('scripts','memory','graphify-bridge.py')});expect(await unavailable.health()).toMatchObject({healthy:false,errorCode:'MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE'});await expect(unavailable.queryRelated([f.a.memoryId],16)).rejects.toThrow('MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE');});
 it('detects canonical content changes when size and modification time are preserved',async()=>{
   const f=await fixture(),found=await f.repo.findEntry(scope,f.b.memoryId),file=path.join(f.paths.vaultRoot,found!.segment.relativePath);
   const stamp=new Date('2020-01-01T00:00:00.000Z');await utimes(file,stamp,stamp);await f.adapter.update([]);
   const before=await stat(file),oldReceipt=JSON.parse(await readFile(path.join(f.paths.graphRoot,'projection.json'),'utf8'));
   const original=await readFile(file,'utf8'),edited=original.replace('File-native memory resolves','File-native memory confirms');
   expect(edited).not.toBe(original);expect(Buffer.byteLength(edited)).toBe(Buffer.byteLength(original));
   await writeFile(file,edited);await utimes(file,stamp,stamp);
   const after=await stat(file);expect(after.size).toBe(before.size);expect(after.mtimeMs).toBe(before.mtimeMs);
   expect(await f.adapter.health({verifyContent:true})).toMatchObject({healthy:false,errorCode:'MEMORY_GRAPH_STALE'});
   await f.adapter.ensureFresh({verifyContent:true});
   expect(JSON.parse(await readFile(path.join(f.paths.graphRoot,'projection.json'),'utf8')).snapshotHash).not.toBe(oldReceipt.snapshotHash);
 });
});
