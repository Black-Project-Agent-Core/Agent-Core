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

test('fusion_lexical_diversity_is_content_only_bounded_and_preserves_vector_pairs', () => {
 const candidate = (id: string, content: string) =>
  record(id, content, {context: 'quasar ' + id, keywords: ['quasar']});
 const run = (records: MemoryRecord[], vectors?: Map<string, number[]>) =>
  searchMemories(records, 'quasar', {rankingProfile: 'fusion', limit: records.length, maxNeighbors: 0},
   vectors ? {queryVector: [1, 0], vectors, revision: 'fixture'} : undefined, records.length, time);
 const records = [candidate('a', 'alpha beta'), candidate('b', 'alpha beta'), candidate('c', 'gamma delta')];
 const original = JSON.stringify(records);
 const lexical = run(records);
 expect(lexical.map(item => item.record.id)).toEqual(['a', 'c', 'b']);
 expect(lexical[0]!.selection).toMatchObject({redundancy: 0, redundancyBasis: 'none'});
 expect(lexical.find(item => item.record.id === 'b')!.selection).toMatchObject({redundancy: 1, redundancyBasis: 'lexical'});
 expect(lexical.find(item => item.record.id === 'c')!.selection).toMatchObject({redundancy: 0, redundancyBasis: 'lexical'});
 expect(lexical.every(item => item.selection?.lexicalPairsEvaluated === 3
  && item.selection.lexicalPairsSkipped === 0 && item.selection.lexicalCoverage === 'complete')).toBe(true);
 const pair = records.slice(0, 2);
 expect(run(pair, new Map([['a', [1, 0]]]))[1]!.selection).toMatchObject({
  redundancy: 1, redundancyBasis: 'lexical', lexicalPairsEvaluated: 1});
 expect(run(pair, new Map([['a', [1, 0]], ['b', [0, 1]]]))[1]!.selection).toMatchObject({
  redundancy: 0, redundancyBasis: 'semantic', lexicalPairsEvaluated: 0, lexicalPairsSkipped: 0});
 for (const content of ['', 'x'.repeat(257), 'alpha '.repeat(1365) + 'abc',
  Array.from({length: 513}, (_, i) => 'token' + i).join(' ')]) {
  const bounded = run([candidate('a', 'alpha beta'), candidate('b', content)]);
  expect(bounded).toHaveLength(2);
  expect(bounded.every(item => item.selection?.lexicalPairsEvaluated === 0
   && item.selection.lexicalPairsSkipped === 1 && item.selection.lexicalCoverage === 'bounded')).toBe(true);
 }
 const unicode = run([candidate('a', 'alpha beta'), candidate('b', '🟢'.repeat(8182) + 'alpha beta')]);
 expect(unicode[1]!.selection).toMatchObject({redundancy: 1, lexicalPairsEvaluated: 1, lexicalPairsSkipped: 0});
 const large = run(Array.from({length: 260}, (_, i) => candidate('item-' + String(i).padStart(3, '0'), 'alpha beta')));
 expect(large).toHaveLength(260);
 expect(large.every(item => item.selection?.lexicalPairsEvaluated === 8192
  && item.selection.lexicalPairsSkipped === 260 * 259 / 2 - 8192
  && item.selection.lexicalCoverage === 'bounded')).toBe(true);
 expect(JSON.stringify(records)).toBe(original);
});
