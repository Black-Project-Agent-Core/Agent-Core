import { createHash } from 'node:crypto';
import type { MemoryScoreWeights } from '../../config.js';
import type { MemorySearchHit, MemorySearchRequest, MemorySearchResult, MemoryScoreExplanation } from '../types.js';
import type { FileNativeMemoryPaths } from './paths.js';
import { FileNativeMemoryRepository, segmentInScope } from './vault-repository.js';
import { buildRecallProbes, RipgrepVaultSearch, type RecallProbe } from './ripgrep.js';
import type { VaultMemoryEntry } from './types.js';

export interface FileNativeRetrieverOptions { itemBudget?:number; characterBudget?:number; rgPath?:string; graphProvider?:GraphRecallProvider; scoreWeights?:MemoryScoreWeights; repository?:FileNativeMemoryRepository; graphNodeCap?:number; diagnosticAllowGraphFailure?:boolean }
export interface GraphRecallHit { score:number; path:string[] }
export interface GraphRecallResults extends Map<string,GraphRecallHit> { truncated?:boolean }
export interface GraphRecallProvider { scoreRelated(seedMemoryIds:string[],budget:number):Promise<GraphRecallResults> }
/**
 * The ranking weights the memory quality corpus certifies. Injectable via `options.scoreWeights`,
 * so evaluation and callers holding a MemoryConfig can vary ranking without editing the scorer.
 * MemoryService supplies its configured weights; standalone retrievers use these defaults.
 */
export const DEFAULT_MEMORY_SCORE_WEIGHTS:MemoryScoreWeights={lexical:.40,exact:.20,graph:.20,state:.05,importance:.10,recency:.05};
function stateScore(state:string){return state==='active'?1:state==='superseded'?.5:state==='completed'?.45:state==='archived'?.2:0;}
// Whole-day granularity keeps a replayed recall byte-identical while still decaying with age. The
// pre-cutover scorer used continuous age, which moves every finalScore between two calls made
// milliseconds apart; tests/memory-performance.test.ts (equal snapshotHash for back-to-back
// searches) and tests/memory-preflight.test.ts (second preflight hashes equal to the first) pin the
// replay guarantee, so the quantisation stays deliberate. It can still flip at a UTC day boundary.
function recencyScore(updatedAt:number){const ageDays=Math.floor(Math.max(0,Date.now()-updatedAt)/86400000);return 1/(1+ageDays/30);}
function termsFor(entry:VaultMemoryEntry,probes:RecallProbe[]){const anchorText=(entry.anchors??[]).map(a=>a.value).join(' ');const hay=`${entry.canonicalKey} ${entry.title??''} ${entry.valueText} ${anchorText}`.toLowerCase();return probes.filter(p=>hay.includes(p.term));}
export function explanation(W:MemoryScoreWeights,entry:VaultMemoryEntry,probes:RecallProbe[],graph:number,graphPath?:string[]):MemoryScoreExplanation{
 const matched=termsFor(entry,probes);const lexical=probes.length?Math.min(1,matched.reduce((n,p)=>n+p.weight,0)/Math.max(1,probes.reduce((n,p)=>n+p.weight,0))):0;
 const key=entry.canonicalKey.toLowerCase();const exact=matched.length>0&&matched.every(p=>key.includes(p.term))?1:0;const state=stateScore(entry.state),recency=recencyScore(entry.updatedAt);const finalScore=W.lexical*lexical+W.exact*exact+W.graph*graph+W.state*state+W.importance*entry.importance+W.recency*recency;
 const anchorValues=(entry.anchors??[]).map(a=>a.value.toLowerCase());const matchedAnchors=matched.filter(p=>key.includes(p.term)||anchorValues.some(v=>v.includes(p.term))).map(p=>p.term);
 return{lexical,exact,graph,state,importance:entry.importance,recency,finalScore,lexicalTerms:matched.map(p=>p.term),matchedAnchors,...(graphPath&&graphPath.length>1?{graphPath}:{})};
}

export function canonicalSubject(entry:VaultMemoryEntry, query:string):boolean {
 if(entry.kind!=='project_state'||entry.state!=='active')return false;
 const normalized=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const question=` ${normalized(query)} `;
 return (entry.anchors??[]).some(a=>a.type==='subject_facet') && (entry.anchors??[]).some(a=>a.type==='subject_alias'&&normalized(a.value)&&question.includes(` ${normalized(a.value)} `));
}
export class FileNativeMemoryRetriever{
 readonly searcher:RipgrepVaultSearch; readonly itemBudget:number; readonly characterBudget:number;
 readonly weights:MemoryScoreWeights; private readonly repository:FileNativeMemoryRepository;
 constructor(readonly paths:FileNativeMemoryPaths,readonly options:FileNativeRetrieverOptions={}){this.searcher=new RipgrepVaultSearch(paths,options.rgPath);this.itemBudget=Math.max(1,options.itemBudget??24);this.characterBudget=Math.max(1,options.characterBudget??12000);this.weights=options.scoreWeights??DEFAULT_MEMORY_SCORE_WEIGHTS;this.repository=options.repository??new FileNativeMemoryRepository(paths);}
 async search(request:MemorySearchRequest):Promise<MemorySearchResult & {canonicalSubjectMemory:MemorySearchHit[]}>{
  const snapshot=await this.repository.readSnapshot();
  if(snapshot.malformedFiles.length)throw new Error('MEMORY_VAULT_INVALID');
  const W=this.weights;const probes=buildRecallProbes(request.query);const candidates=await this.searcher.findCandidateFiles(probes,snapshot);const rows:Array<{entry:VaultMemoryEntry;why:MemoryScoreExplanation}>=[];
  for(const candidate of candidates.slice(0,64)){const segment=await this.repository.readIndexedSegment(candidate.relativePath,snapshot);if(!segment||!segmentInScope(this.paths,segment,request.scope))continue;for(const entry of segment.entries){if(entry.state==='tombstoned')continue;const why=explanation(W,entry,probes,0);if(why.lexical>0||why.exact>0)rows.push({entry,why});}}
  let graphTruncated=false;
  rows.sort((a,b)=>b.why.finalScore-a.why.finalScore||a.entry.memoryId.localeCompare(b.entry.memoryId));
  if(this.options.graphProvider&&rows.length){
    try {
      // The budget is config.memory.graphNodeCap in product wiring; the provider caps its returned set to it.
      const related=await this.options.graphProvider.scoreRelated(rows.slice(0,8).map(r=>r.entry.memoryId),this.options.graphNodeCap??64);
      graphTruncated=related.truncated??false;
      const seen=new Set(rows.map(r=>r.entry.memoryId));
      for(const row of rows){const hit=related.get(row.entry.memoryId);const g=Math.max(0,Math.min(1,hit?.score??0));if(g>0)row.why=explanation(W,row.entry,probes,g,hit?.path);}
      // Relation neighbours the lexical probe never touched still belong in recall.
      const wanted=[...related.entries()].filter(([id])=>!seen.has(id)).sort((a,b)=>b[1].score-a[1].score||a[0].localeCompare(b[0])).slice(0,this.itemBudget);
      if(wanted.length){
        const byId=new Map(wanted);
        // Graph-only neighbours resolve through the segment index: one read per segment that holds one.
        for(const {entry} of await this.repository.findEntries(request.scope,[...byId.keys()],snapshot)){
          const hit=byId.get(entry.memoryId);if(!hit||entry.state==='tombstoned')continue;
          rows.push({entry,why:explanation(W,entry,probes,Math.max(0,Math.min(1,hit.score)),hit.path)});
        }
      }
      rows.sort((a,b)=>b.why.finalScore-a.why.finalScore||a.entry.memoryId.localeCompare(b.entry.memoryId));
    } catch(error) {
      if(!this.options.diagnosticAllowGraphFailure)throw error;
    }
  }
  const limit=Math.min(Math.max(1,request.limit??this.itemBudget),this.itemBudget,100);const budget=Math.min(Math.max(1,request.characterBudget??this.characterBudget),this.characterBudget);let used=0;const hits:MemorySearchHit[]=[];
  for(const row of rows){if(hits.length>=limit||used>=budget)break;const remaining=budget-used;const valueText=row.entry.valueText.length>remaining?row.entry.valueText.slice(0,remaining):row.entry.valueText;if(!valueText&&row.entry.valueText)break;used+=valueText.length;hits.push({memoryId:row.entry.memoryId,revisionId:row.entry.revisionId,revisionNo:row.entry.revisionNo,canonicalKey:row.entry.canonicalKey,kind:row.entry.kind,state:row.entry.state,enforcement:row.entry.enforcement,importance:row.entry.importance,pinned:row.entry.pinned,valueText,...(row.entry.sourceEventId?{sourceEventId:row.entry.sourceEventId}:{}),createdAt:row.entry.createdAt,updatedAt:row.entry.updatedAt,whyMatched:row.why});}
  const facets=['identity','raison_d_etre','primary_reference','production_substrate','non_goal','engineering_target'];
  const priority=(e:VaultMemoryEntry)=>{const at=facets.indexOf(e.anchors?.find(a=>a.type==='subject_facet')?.value??'');return at<0?facets.length:at;};
  let canonicalCharacters=0;
  const canonicalSubjectMemory:MemorySearchHit[]=rows.filter(r=>canonicalSubject(r.entry,request.query)).sort((a,b)=>priority(a.entry)-priority(b.entry)||b.why.finalScore-a.why.finalScore||a.entry.memoryId.localeCompare(b.entry.memoryId)).slice(0,8).map(({entry,why})=>{
    const valueText=entry.valueText.slice(0,Math.max(0,6000-canonicalCharacters));canonicalCharacters+=valueText.length;
    const {anchors:_,relations:__,valueHash:___,title:____,...hit}=entry;return {...hit,valueText,whyMatched:why};
  }).filter(h=>h.valueText.length>0);
  const snapshotHash=createHash('sha256').update(JSON.stringify(hits.map(h=>[h.memoryId,h.revisionId,h.whyMatched.finalScore]))).digest('hex');return{query:request.query,hits,graphTruncated,snapshotHash,canonicalSubjectMemory};
 }
}
