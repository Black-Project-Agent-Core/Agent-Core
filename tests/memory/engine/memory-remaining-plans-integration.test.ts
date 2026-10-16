import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {initializeMemoryRoot} from '../../../src/memory/initialize.js';
import {createControllerMemoryDispatcher} from '../../../src/memory/controller-protocol.js';
import {verifyMemoryExcerpt} from '../../../src/memory/evidence-excerpt.js';
import {DEFAULT_QUERY_CACHE_LIMITS} from '../../../src/memory/query-embedding-cache.js';
import {resolveMemoryPaths} from '../../../src/memory/paths.js';
import type {RelevancePolicy} from '../../../src/memory/relevance.js';
const roots:string[]=[];
const policy:RelevancePolicy={version:'relevance/v1',calibrationDigest:'synthetic-cross-plan/v1',minLexicalCoverage:1,minSemanticSimilarity:0.9};
const scope={workspaceKey:'agent-core',taskId:'cross-plan-functional',controllerId:'synthetic'};
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function setup(semantic=true){
 const root=await mkdtemp(path.join(os.tmpdir(),'memory-cross-plans-'));roots.push(root);
 const calls:string[][]=[];
 const embedder={identity:{provider:'synthetic',model:'cross-plans/v1',dimensions:2},embedDocuments:async(texts:string[])=>{calls.push([...texts]);return texts.map(text=>text==='controller session'||text.includes('ControllerSession')?[1,0]:[0,1]);}};
 const memory=await initializeMemoryRoot({baseDir:root,indexGranularity:'passage',queryCache:{...DEFAULT_QUERY_CACHE_LIMITS},controllerRelevancePolicy:policy,...(semantic?{embedder}:{})});
 return {root,memory,calls};
}
test('excerpt_relevance_and_cache_share_whole_response_budget_without_false_exposure',async()=>{
 const {memory,calls}=await setup();
 const record=await memory.remember({content:'padding '.repeat(180)+'ControllerSession selects exact evidence '+'tail '.repeat(100),provenance:{workspace:'agent-core',files:[]}});
 calls.length=0;
 const controller=memory.controller(scope),dispatch=createControllerMemoryDispatcher(controller);
 const exposures=vi.spyOn((memory as any).retrievalLedger,'record');
 for(const maxBytes of [512,896,1024,8192,65536]){
  const direct=await controller.recall({query:'controller session',budget:{maxBytes}});
  expect(Buffer.byteLength(JSON.stringify(direct))).toBeLessThanOrEqual(maxBytes);
  const last:any=exposures.mock.calls.at(-1)![0];
  expect(last.selectedCount).toBe(direct.status==='insufficient-budget'?0:direct.data.hits.length);
  if(direct.status!=='insufficient-budget'){
   expect(direct.data.relevance?.status).toBe('supported');
   for(const hit of direct.data.hits){expect(hit.abstract).toBe(hit.excerpt?.text);expect(verifyMemoryExcerpt(record,hit.excerpt!)).toBe(true);}
  }
  const previous=exposures.mock.calls.length;
  const wrapped=await dispatch({method:'memory_recall',input:{query:'controller session',budget:{maxBytes}}});
  expect(Buffer.byteLength(JSON.stringify(wrapped))).toBeLessThanOrEqual(maxBytes);
  if(maxBytes<896)expect(exposures.mock.calls.length).toBe(previous);
 }
 expect(calls.filter(batch=>batch.length===1&&batch[0]==='controller session')).toHaveLength(1);
});
test('identifier_content_coverage_supports_camel_case_but_metadata_cannot_bypass_abstention',async()=>{
 const {memory}=await setup(false);
 const own=await memory.remember({content:'ControllerSession owns recall',provenance:{workspace:'agent-core',files:[]}});
 const metadata=await memory.remember({title:'ControllerSession',content:'Unrelated orchids bloom',keywords:['controller','session'],context:'controller session',provenance:{workspace:'agent-core',files:[]}});
 const page=await memory.controller(scope,'fusion-feedback-v1').recall({query:'controller session',limit:20});
 expect(page.status).not.toBe('insufficient-budget');if(page.status==='insufficient-budget')throw new Error('fixture budget');
 expect(page.data.relevance).toMatchObject({status:'supported',semanticStatus:'disabled'});
 expect(page.data.hits.map(hit=>hit.id)).toContain(own.id);expect(page.data.hits.map(hit=>hit.id)).not.toContain(metadata.id);
 const empty=await memory.controller(scope).recall({query:'unseen nebula',limit:20});
 expect(empty.status).not.toBe('insufficient-budget');if(empty.status==='insufficient-budget')throw new Error('fixture budget');
 expect(empty.data.relevance?.status).toBe('insufficient-relevant-evidence');expect(empty.data.hits).toEqual([]);expect(empty.data.nextCursor).toBeUndefined();
});
test('warm_query_cache_cannot_hide_passage_repair_from_cursor_binding_or_scope',async()=>{
 const {root,memory,calls}=await setup();
 const own=await memory.remember({content:'padding '.repeat(160)+'ControllerSession exact evidence '+'tail '.repeat(120),provenance:{workspace:'agent-core',files:[]}});
 await memory.remember({content:'ControllerSession second evidence',provenance:{workspace:'agent-core',files:[]}});
 const foreign=await memory.remember({content:'ControllerSession foreign evidence',provenance:{workspace:'foreign',files:[]}});
 const internal=memory as any,canonical=(await internal.store.loadAll()).records;
 const indexPath=path.join(resolveMemoryPaths(root).index,'index.json'),stored=JSON.parse(await readFile(indexPath,'utf8'));
 expect(stored.granularity).toBe('passage');
 const child=stored.entries.find((entry:any)=>entry.id===own.id).passages[0];delete child.embedding;
 await writeFile(indexPath,JSON.stringify(stored));calls.length=0;
 const controller=memory.controller(scope);const first=await controller.recall({query:'controller session',limit:1});
 if(first.status==='insufficient-budget')throw new Error('fixture budget');expect(first.data.nextCursor).toBeDefined();
 await internal.index.ensure(canonical);
 await expect(controller.recall({query:'controller session',limit:1,cursor:first.data.nextCursor})).rejects.toMatchObject({code:'MEMORY_CURSOR_STALE'});
 const current=await controller.recall({query:'controller session',limit:20});if(current.status==='insufficient-budget')throw new Error('fixture budget');
 expect(current.data.hits.map(hit=>hit.id)).not.toContain(foreign.id);
 expect(calls.filter(batch=>batch.length===1&&batch[0]==='controller session')).toHaveLength(1);
 await memory.lifecycle(own.id,'cross-plan-forget','forget');
 const forgotten=await controller.recall({query:'controller session',limit:20});if(forgotten.status==='insufficient-budget')throw new Error('fixture budget');
 expect(forgotten.data.hits.map(hit=>hit.id)).not.toContain(own.id);
});
