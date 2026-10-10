import {expect,test} from 'vitest';
import {searchMemories} from '../src/memory/retrieval.js';
import {buildBm25Profile} from '../src/memory/bm25.js';
import {buildSemanticDocument,tokenizeMemoryText} from '../src/memory/semantic-document.js';
import type {MemoryRecord} from '../src/memory/types.js';
const time=Date.parse('2026-10-01T00:00:00Z');
const record=(id:string,content:string,extra:Partial<MemoryRecord>={}):MemoryRecord=>({version:1,id,content,keywords:[],context:'General',tags:[],category:'Uncategorized',links:[],createdAt:new Date(time).toISOString(),updatedAt:new Date(time).toISOString(),lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,...extra});
test('camel_boundaries_survive_score_record',()=>{
 const item=searchMemories([record('camel','ControllerSession coordinates MemoryRecall')],'controller session',{maxNeighbors:0},undefined,50,time)[0]!;
 expect(item.components.tokenOverlap).toBe(3);
});
test('bm25_and_overlap_share_tokens',()=>{
 const records=[record('camel','ControllerSession'),record('negative','irrelevant')];
 expect(buildBm25Profile(records,'controller session').scores.get('camel')).toBeGreaterThan(0);
 for(const profile of ['legacy','bm25','fusion'] as const)expect(searchMemories(records,'controller session',{rankingProfile:profile,maxNeighbors:0},undefined,50,time)[0]?.record.id).toBe('camel');
});
test('exact_error_code_and_path_gate_keep_full_identity',()=>{
 for(const [query,right,wrong] of [['ERR_CACHE_404','ERR_CACHE_404','ERR_CACHE_403'],['src/memory/controller-session.ts','src/memory/controller-session.ts','src/cache/controller-session.ts']]){
  const records=[record('right',right!),record('wrong',wrong!)];
  expect(searchMemories(records,query!,{rankingProfile:'fusion',maxNeighbors:0},undefined,50,time).map(r=>r.record.id)).toEqual(['right']);
  // Legacy/BM25 and pinned exemption remain explicitly weaker baseline contracts.
  for(const profile of ['legacy','bm25'] as const)expect(searchMemories(records,query!,{rankingProfile:profile,limit:2,maxNeighbors:0},undefined,50,time).some(r=>r.record.id==='wrong')).toBe(true);
  expect(searchMemories([record('pinned',wrong!,{pinned:true})],query!,{rankingProfile:'fusion',maxNeighbors:0},undefined,50,time).some(r=>r.record.id==='pinned')).toBe(true);
 }
});
test('query_overflow_rejected_and_document_fallback_is_visible',()=>{
 expect(()=>searchMemories([], 'x'.repeat(257))).toThrow('MEMORY_INPUT_INVALID');
 expect(()=>buildBm25Profile([], 'x'.repeat(257))).toThrow('MEMORY_INPUT_INVALID');
 const result=searchMemories([record('long','x'.repeat(257)+' ControllerSession')],'controller session',{maxNeighbors:0},undefined,50,time)[0]!;
 expect(result.components.lexicalTokenizationDegraded).toBe(true);
});
test('lexical_change_does_not_change_semantic_builder_or_legacy_tokenizer',()=>{
 const r=record('camel','ControllerSession');const before=buildSemanticDocument(r);
 searchMemories([r],'controller session',{rankingProfile:'fusion'},undefined,50,time);
 expect(buildSemanticDocument(r)).toBe(before);expect(tokenizeMemoryText('ControllerSession')).toEqual(['controllersession']);
});
test('expanded_query_occurrences_change_existing_bm25_weight_explicitly',()=>{
 const profile=buildBm25Profile([record('camel','ControllerSession')],'ControllerSession');
 expect(profile.meaningfulQueryTokens).toBe(3);expect(profile.weight).toBe(0.45);
});
