import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryIndex } from '../src/memory/index.js';
import { buildMemoryPassages } from '../src/memory/passages.js';
import { resolveMemoryPaths } from '../src/memory/paths.js';
import { serializeCanonicalNote } from '../src/memory/note-format.js';
import { buildSemanticDocument } from '../src/memory/semantic-document.js';
import type { MemoryEmbedder } from '../src/memory/embedder.js';
import { record } from './fixtures/memory-passage/fixture.js';

const fault=vi.hoisted(()=>({destination:''}));
vi.mock('node:fs/promises',async original=>{const real=await original<typeof import('node:fs/promises')>();return {...real,rename:async (...args:Parameters<typeof real.rename>)=>{if(String(args[1])===fault.destination)throw new Error('synthetic interrupted rename');return real.rename(...args);}};});
const roots:string[]=[];
class Embedder implements MemoryEmbedder {
  identity={provider:'synthetic',model:'passage-v1',dimensions:2};calls:string[][]=[];
  mode:'good'|'fail'|'partial'|'invalid'='good';
  async embedDocuments(texts:string[]):Promise<number[][]>{this.calls.push([...texts]);if(this.mode==='fail')throw new Error('synthetic unavailable');if(this.mode==='partial')return [];
    return texts.map((text,i)=>this.mode==='invalid'&&i===texts.length-1?[NaN,0]:text.includes('oracle')?[1,0]:[0,1]);}
}
async function fixture(records=[record('first',{content:'a'.repeat(1800)}),record('second',{content:'b'.repeat(900)})]) {
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-passage-index-'));roots.push(root);const paths=resolveMemoryPaths(root,root);
 await mkdir(paths.notes,{recursive:true});await mkdir(paths.index,{recursive:true});await writeFile(paths.bootstrap,'# Synthetic Agent Core foundational memory\n');
 for(const r of records)await writeFile(path.join(paths.notes,`${r.id}.md`),serializeCanonicalNote(r));
 const embedder=new Embedder();return{root,paths,records,embedder,index:new MemoryIndex(paths,embedder,{granularity:'passage'}),file:path.join(paths.index,'index.json')};
}
async function stored(file:string){return JSON.parse(await readFile(file,'utf8'));}
async function canonical(root:string){return Promise.all(['00-agent-core-memory.md',...(await readdir(path.join(root,'notes'))).map(f=>`notes/${f}`)].sort().map(async f=>[f,createHash('sha256').update(await readFile(path.join(root,f))).digest('hex')]));}
afterEach(async()=>{fault.destination='';vi.restoreAllMocks();await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});

describe('passage index persistence and repair',()=>{
 it('embeds one eligible-size input per child, persists format4, and reuses unchanged restart vectors',async()=>{
  const {index,records,embedder,file,paths,root}=await fixture();const before=await canonical(root);
  expect(await index.ensure(records)).toMatchObject({index:'available',embedding:'available'});
  const expected=records.flatMap(r=>buildMemoryPassages(r).passages.map(p=>buildSemanticDocument({...r,content:p.text})));
  expect(embedder.calls.flat()).toEqual(expected);expect(expected.every(t=>t.length<=1600)).toBe(true);
  expect(await stored(file)).toMatchObject({version:4,granularity:'passage',passageVersion:1,semanticDocumentVersion:2});
  embedder.calls=[];expect(await new MemoryIndex(paths,embedder,{granularity:'passage'}).ensure(records)).toMatchObject({embedding:'available'});
  expect(embedder.calls).toEqual([]);expect(await canonical(root)).toEqual(before);
 });
 it('reuses compatible format3 default record indexes with zero embeddings',async()=>{
  const {records,embedder,file,paths}=await fixture();const index=new MemoryIndex(paths,embedder);await index.ensure(records);
  expect((await stored(file)).version).toBe(3);embedder.calls=[];
  expect(await new MemoryIndex(paths,embedder).ensure(records)).toMatchObject({embedding:'available'});expect(embedder.calls).toEqual([]);
 });
 it('never trusts format3 record vectors as passage vectors',async()=>{
  const {index,records,embedder,file,paths}=await fixture();await new MemoryIndex(paths,embedder).ensure(records);embedder.calls=[];
  expect(await index.inspect(records)).toMatchObject({index:'degraded'});await index.ensure(records);
  expect((await stored(file)).version).toBe(4);expect(embedder.calls.flat()).toHaveLength(records.flatMap(r=>buildMemoryPassages(r).passages).length);
 });
 it('invalidates all children of changed parents, reuses unchanged parents, deletes old revisions on shrink/deletion',async()=>{
  const {index,records,embedder,file}=await fixture();await index.ensure(records);const old=await stored(file);embedder.calls=[];
  const changed=[{...records[0],content:'short replacement'},records[1]];await index.ensure(changed);
  expect(embedder.calls.flat()).toEqual([buildSemanticDocument(changed[0])]);const next=await stored(file);
  const first=next.entries.find((e:any)=>e.id===records[0].id);expect(first.passages).toHaveLength(1);
  expect(first.passages[0].id).not.toBe(old.entries[0].passages[0].id);
  embedder.calls=[];await index.ensure(changed.slice(0,1));expect((await stored(file)).entries).toHaveLength(1);expect(embedder.calls).toEqual([]);
 });
 it('invalidates metadata, representation/chunker versions and embedder identity without fallback vectors',async()=>{
  const {index,records,embedder,file,paths}=await fixture();await index.ensure(records);embedder.calls=[];
  const changed=[{...records[0],title:'updated'},records[1]];await index.ensure(changed);expect(embedder.calls.flat()).toHaveLength(buildMemoryPassages(changed[0]).passages.length);
  for(const field of ['semanticDocumentVersion','passageVersion']){const raw=await stored(file);raw[field]=999;await writeFile(file,JSON.stringify(raw));embedder.calls=[];await index.ensure(changed);expect(embedder.calls.flat()).toHaveLength(changed.flatMap(r=>buildMemoryPassages(r).passages).length);}
  embedder.identity={...embedder.identity,model:'passage-v2'};embedder.calls=[];await new MemoryIndex(paths,embedder,{granularity:'passage'}).ensure(changed);
  expect(embedder.calls.flat()).toHaveLength(changed.flatMap(r=>buildMemoryPassages(r).passages).length);
 });
 it('checks missing children even when the parent mean is present and changes semantic snapshot after repair',async()=>{
  const {index,records,embedder,file}=await fixture();await index.ensure(records);const raw=await stored(file);delete raw.entries[0].passages[0].embedding;await writeFile(file,JSON.stringify(raw));
  expect(await index.inspect(records)).toMatchObject({embedding:'degraded'});const before=await index.semanticContext('query',records);expect(before).toBeTruthy();
  embedder.calls=[];await index.ensure(records);expect(embedder.calls.flat()).toHaveLength(1);expect(await index.inspect(records)).toMatchObject({embedding:'available'});
  expect((await index.semanticContext('query',records))?.revision).not.toBe(before?.revision);
 });
 it('derives compatibility means from currently valid children instead of trusting a stale parent aggregate',async()=>{
  const {index,records,file}=await fixture();await index.ensure(records);const raw=await stored(file);
  raw.entries[0].passages[0].embedding=[1,0];raw.entries[0].embedding=[0,1];await writeFile(file,JSON.stringify(raw));
  const context=await index.semanticContext('query',records);const vector=context!.vectors.get(records[0].id)!;
  expect(vector[0]).toBeGreaterThan(0);expect(vector[1]).toBeGreaterThan(vector[0]);
  expect(Math.hypot(...vector)).toBeCloseTo(1);
 });
 it.each(['partial','invalid'] as const)('does not expose partially assigned vectors on a %s batch',async mode=>{
  const {index,records,embedder,file}=await fixture();embedder.mode=mode;expect(await index.ensure(records)).toMatchObject({embedding:'degraded'});
  const raw=await stored(file);expect(raw.entries.every((e:any)=>!e.embedding&&e.passages.every((p:any)=>!p.embedding))).toBe(true);
  expect(await index.semanticContext('query',records)).toBeNull();
 });
 it('marks metadata-overlength passages unavailable without hidden chunking or diagnostic content',async()=>{
  const marker='PRIVATE_METADATA_';const {index,records,embedder,file}=await fixture([record('oversize',{title:marker+'m'.repeat(1700),content:'😀'.repeat(600),provenance:{workspace:'private',files:['PRIVATE_PROVENANCE']}})]);
  const result=await index.ensure(records);expect(result.embedding).toBe('degraded');expect(embedder.calls).toEqual([]);
  expect((await stored(file)).entries[0].passages[0].unavailableReason).toBe('passage-input-too-large');
  expect(JSON.stringify(result)).not.toContain(marker);expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVENANCE');
 });
 it('keeps the cap visibly partial and exposes only the covered children',async()=>{
  const {index,records,embedder,file}=await fixture([record('capped',{content:'a'.repeat(80000)})]);
  expect(await index.ensure(records)).toMatchObject({embedding:'degraded'});const raw=await stored(file);
  expect(raw.entries[0].passageCoverage).toMatchObject({coverage:'partial',coveredThrough:66640,totalCodePoints:80000});expect(embedder.calls.flat()).toHaveLength(128);
 });
 it('retains missing diagnostic entries during incomplete scans but rejects their semantic corpus',async()=>{
  const {index,records,file}=await fixture();await index.ensure(records);expect(await index.ensure(records.slice(0,1),{retainMissing:true})).toMatchObject({index:'degraded'});
  expect((await stored(file)).entries).toHaveLength(2);expect(await index.semanticContext('query',records.slice(0,1))).toBeNull();
 });
 it('rejects corrupt child vectors and interrupted atomic replacement without modifying canonical bytes',async()=>{
  const {index,records,file,root}=await fixture();await index.ensure(records);const before=await canonical(root);const raw=await stored(file);raw.entries[0].passages[0].embedding=[1];await writeFile(file,JSON.stringify(raw));
  expect(await index.inspect(records)).toMatchObject({index:'degraded'});await index.ensure(records);const bytes=await readFile(file,'utf8');fault.destination=file;
  await expect(index.ensure([{...records[0],content:'changed'},records[1]])).rejects.toThrow('synthetic interrupted rename');
  expect(await readFile(file,'utf8')).toBe(bytes);expect((await readdir(path.dirname(file))).some(f=>f.endsWith('.tmp'))).toBe(false);expect(await canonical(root)).toEqual(before);
 });
 it('removes failed child repair jobs when their canonical parent is deleted',async()=>{
  const {index,records,embedder}=await fixture();embedder.mode='fail';await index.ensure(records);expect((await index.repairSummary()).pending).toBeGreaterThan(0);
  await index.ensure([]);expect(await index.repairSummary()).toMatchObject({pending:0,failed:0});
 });
 it('preserves failed repair ownership for retained parents during incomplete scans',async()=>{
  const {index,records,embedder,paths}=await fixture();embedder.mode='fail';await index.ensure(records);
  const file=path.join(paths.state,'embedding-repair.json');const before=JSON.parse(await readFile(file,'utf8'));
  await index.ensure(records.slice(0,1),{retainMissing:true});const after=JSON.parse(await readFile(file,'utf8'));
  expect(after.jobs.map((j:any)=>[j.id,j.attempts])).toEqual(before.jobs.map((j:any)=>[j.id,j.attempts]));
 });
 it('bounds admission above 512 child failures without evicting exhausted retry jobs or restarting fresh',async()=>{
  const parents=Array.from({length:5},(_,i)=>record(`large-${i}`,{content:'a'.repeat(66640)}));const {index,records,embedder,paths}=await fixture(parents);
  let now=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>now);embedder.mode='fail';
  for(let attempt=0;attempt<8;attempt++){await index.ensure(records);now+=4*60*60*1000;}
  expect(embedder.calls.length).toBe(6);expect(embedder.calls.every(call=>call.length<=512)).toBe(true);
  const repair=JSON.parse(await readFile(path.join(paths.state,'embedding-repair.json'),'utf8'));expect(repair.jobs).toHaveLength(512);expect(repair.jobs.every((j:any)=>j.status==='failed'&&j.attempts===6)).toBe(true);
  expect(await index.repairSummary()).toMatchObject({pending:0,failed:512});expect(await index.inspect(records)).toMatchObject({embedding:'degraded'});
 });
});
