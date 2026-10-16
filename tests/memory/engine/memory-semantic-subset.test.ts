import {afterEach, expect, test, vi} from 'vitest';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {legacyExperience} from '../../../src/memory/experience-types.js';
import {MemoryIndex} from '../../../src/memory/index.js';
import {cosineSimilarity} from '../../../src/memory/embedder.js';
import {resolveMemoryPaths} from '../../../src/memory/paths.js';
import type {MemoryRecord} from '../../../src/memory/types.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true}))); });
function record(id: string): MemoryRecord { return {version:1,id,title:id,content:id==='allowed'?'automobile':'unrelated',keywords:[],context:'General',tags:[],category:'general',links:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false}; }
async function fixture() {
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-semantic-subset-'));roots.push(root);
 const embedDocuments=vi.fn(async(texts:string[])=>texts.map(text=>text.includes('automobile')||text==='car'?[1,0,0]:[0,1,0]));
 const embedder={identity:{provider:'fixture',model:'subset-v1',dimensions:3},embedDocuments};
 const records=[record('allowed'),record('foreign'),{...record('expired'),expiresAt:'2025-01-01T00:00:00.000Z'}];
 const paths=resolveMemoryPaths(root,root),index=new MemoryIndex(paths,embedder);await index.rebuild(records);embedDocuments.mockClear();
 return {root,paths,index,records,embedder,embedDocuments};
}
test('eligible_subset_keeps_semantic_vectors',async()=>{
 const {index,records}=await fixture();
 const context=await index.semanticContext('car',records,[records[0]!]);
 expect(context).not.toBeNull();expect([...context!.vectors.keys()]).toEqual(['allowed']);expect(cosineSimilarity(context!.queryVector,context!.vectors.get('allowed')!)).toBe(1);
});
test('full_corpus_two_argument_call_remains_compatible',async()=>{
 const {index,records,embedDocuments}=await fixture();const context=await index.semanticContext('car',records);
 expect([...context!.vectors.keys()].sort()).toEqual(records.map(r=>r.id).sort());expect(embedDocuments).toHaveBeenCalledTimes(1);
});
for(const mode of ['empty','missing','changed','duplicate'] as const)test('invalid_or_empty_subset_skips_query_'+mode,async()=>{
 const {index,records,embedDocuments}=await fixture();const r=records[0]!;
 const subset=mode==='empty'?[]:mode==='missing'?[{...r,id:'absent'}]:mode==='changed'?[{...r,content:'changed'}]:[r,r];
 expect(await index.semanticContext('car',records,subset)).toBeNull();expect(embedDocuments).not.toHaveBeenCalled();
});
for(const mode of ['partial','changed','provider','model','dimensions'] as const)test('invalid_canonical_or_identity_skips_query_'+mode,async()=>{
 const {index,records,embedder,embedDocuments}=await fixture();let canonical=records;
 if(mode==='partial')canonical=records.slice(0,1);if(mode==='changed')canonical=[{...records[0]!,content:'changed'},...records.slice(1)];
 if(mode==='provider')embedder.identity.provider='different';if(mode==='model')embedder.identity.model='different';if(mode==='dimensions')embedder.identity.dimensions=2;
 expect(await index.semanticContext('car',canonical,[records[0]!])).toBeNull();expect(embedDocuments).not.toHaveBeenCalled();
});
for(const vector of [[NaN,0,0],[1,0]])test('invalid_query_vector_rejected_'+vector.length,async()=>{
 const {index,records,embedDocuments}=await fixture();embedDocuments.mockResolvedValue([vector]);await expect(index.semanticContext('car',records,[records[0]!])).rejects.toThrow('invalid dimensions or values');
});
for(const mode of ['partial','corrupt','dimension','nonfinite','no-vectors'] as const)test('invalid_or_unavailable_index_'+mode,async()=>{
 const {index,records,paths,embedDocuments}=await fixture();const file=path.join(paths.index,'index.json'),data=JSON.parse(await readFile(file,'utf8'));
 if(mode==='partial')data.entries.pop();if(mode==='dimension')data.entries[0].embedding=[1];if(mode==='nonfinite')data.entries[0].embedding=[null,0,0];if(mode==='no-vectors')for(const entry of data.entries)delete entry.embedding;
 await writeFile(file,mode==='corrupt'?'{':JSON.stringify(data));
 if(['corrupt','dimension','nonfinite'].includes(mode))await expect(index.semanticContext('car',records,[records[0]!])).rejects.toThrow();else expect(await index.semanticContext('car',records,[records[0]!])).toBeNull();
 expect(embedDocuments).not.toHaveBeenCalled();
});

test('experience_only_revision_mismatch_skips_query_embedding',async()=>{
 const {index,records,embedDocuments}=await fixture();
 const canonical:MemoryRecord[]=[{...records[0]!,version:2,experience:legacyExperience()},...records.slice(1)];
 await index.rebuild(canonical);embedDocuments.mockClear();
 const original=canonical[0]!;if(original.version!==2)throw new Error('fixture requires v2');
 const changed={...original,experience:{...original.experience,retention:'archive' as const}};
 expect(await index.semanticContext('car',canonical,[changed])).toBeNull();expect(embedDocuments).not.toHaveBeenCalled();
});

test('semantic revision binds eligible fingerprints and embedder identity, excluding builtAt and access telemetry',async()=>{
 const {index,records,paths,embedder}=await fixture();const original=await index.semanticContext('car',records,[records[0]!]);
 expect(original!.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
 const file=path.join(paths.index,'index.json'),stored=JSON.parse(await readFile(file,'utf8'));stored.builtAt='2030-01-01T00:00:00.000Z';await writeFile(file,JSON.stringify(stored));
 const accessed=records.map(record=>({...record,retrievalCount:99,lastAccessedAt:'2026-10-09T00:00:00.000Z'}));
 expect((await index.semanticContext('car',accessed,[accessed[0]!]))!.revision).toBe(original!.revision);
 for(const key of ['provider','model'] as const){const previous=embedder.identity[key];embedder.identity[key]=previous+'-changed';await index.rebuild(records);const changed=await index.semanticContext('car',records,[records[0]!]);expect(changed!.revision).not.toBe(original!.revision);embedder.identity[key]=previous;}
 await index.rebuild(records);expect((await index.semanticContext('car',records))!.revision).not.toBe(original!.revision);
});
