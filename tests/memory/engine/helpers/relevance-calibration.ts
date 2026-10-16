import {assessMemoryRelevance,type RelevancePolicy} from '../../../../src/memory/relevance.js';
import {disclosureDigest} from '../../../../src/memory/disclosure.js';
import {searchMemories,type MemorySearchResult} from '../../../../src/memory/retrieval.js';
import type {MemoryRecord} from '../../../../src/memory/types.js';
export interface RelevanceRow {id:string;family:string;group:string;label:boolean|null;query:string;content:string;semanticStatus:'available'|'unavailable'|'disabled';similarity:number;title?:string;keywords?:string[];context?:string;pinned?:boolean}
export interface RelevanceFixture {version:'relevance-fixtures/v1';partition:'development'|'heldout';clock:string;fakeIdentity:{provider:string;model:string;dimensions:number};rows:RelevanceRow[]}
interface Observation {id:string;family:string;group:string;label:boolean|null;baseline:boolean;candidate:boolean;coverage?:number;similarity?:number;error?:string}
export interface Confusion {total:number;TP:number;FP:number;TN:number;FN:number;unknown:number;precision:number|null;recall:number|null;falseAbstention:number|null;falseSupport:number|null;coverage:number;latency:'NOT RUN'}
export const PREREGISTRATION=Object.freeze({version:'relevance-preregistration/v1',minPrecision:1,minRecall:0.8,maxFalseSupport:0,selection:'precision-first; recall descending; lexical then semantic threshold ascending',latency:'NOT RUN: user deferred all latency/performance benchmarks',liveBenefit:'NOT RUN: offline fake vectors only'});
export const fixtureDigest=(fixture:RelevanceFixture)=>disclosureDigest(fixture);
export function assertDisjointFamilies(development:RelevanceFixture,heldout:RelevanceFixture):void {
 const families=new Set(development.rows.map(row=>row.family));
 if(heldout.rows.some(row=>families.has(row.family)))throw Error('family overlap');
 const ids=new Set(development.rows.map(row=>row.id));
 if(heldout.rows.some(row=>ids.has(row.id)))throw Error('row overlap');
}
function retrieve(row:RelevanceRow,clock:string):MemorySearchResult[]{
 const record:MemoryRecord={version:1,id:row.id,content:row.content,title:row.title,context:row.context??'',keywords:row.keywords??[],tags:[],category:'general',links:[],pinned:row.pinned??false,createdAt:clock,updatedAt:clock,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[]};
 // Analytic 2D fake vectors yield the requested cosine. No provider/network exists.
 const semantic=row.semanticStatus==='available'?{queryVector:[1,0],vectors:new Map([[row.id,[row.similarity,Math.sqrt(1-row.similarity**2)]]]),revision:disclosureDigest(['offline-two-vectors/v1',row.id,row.similarity])}:undefined;
 return searchMemories([record],row.query,{limit:1,maxNeighbors:0},semantic,1,Date.parse(clock));
}
function confusion(rows:Observation[],field:'baseline'|'candidate'):Confusion {
 let TP=0,FP=0,TN=0,FN=0,unknown=0,supported=0;
 for(const row of rows){const support=row[field];if(support)supported++;if(row.label===null||row.error){unknown++;continue;}if(row.label){if(support)TP++;else FN++;}else{if(support)FP++;else TN++;}}
 const rate=(numerator:number,denominator:number)=>denominator?numerator/denominator:null;
 return {total:rows.length,TP,FP,TN,FN,unknown,precision:rate(TP,TP+FP),recall:rate(TP,TP+FN),falseAbstention:rate(FN,TP+FN),falseSupport:rate(FP,FP+TN),coverage:rows.length?supported/rows.length:0,latency:'NOT RUN'};
}
export function evaluateRows(rows:RelevanceRow[],policy:RelevancePolicy,clock:string){
 const observations:Observation[]=rows.map(row=>{try{const results=retrieve(row,clock),decision=assessMemoryRelevance({results,eligibleCount:1,semanticStatus:row.semanticStatus,policy});return {id:row.id,family:row.family,group:row.group,label:row.label,baseline:results.length>0,candidate:decision.acceptedIds.length>0,coverage:results[0]?.components.contentLexicalCoverage,similarity:results[0]?.components.semanticSimilarity};}catch{return {id:row.id,family:row.family,group:row.group,label:row.label,baseline:false,candidate:false,error:'fixture-or-evidence-contract-error'};}});
 const groups=Object.fromEntries([...new Set(rows.map(row=>row.group))].sort().map(group=>{const members=observations.filter(row=>row.group===group);return [group,{baseline:confusion(members,'baseline'),candidate:confusion(members,'candidate')}];}));
 return {baseline:confusion(observations,'baseline'),candidate:confusion(observations,'candidate'),groups,observations};
}
export function calibrateDevelopment(fixture:RelevanceFixture){
 if(fixture.partition!=='development')throw Error('development only');
 const developmentDigest=fixtureDigest(fixture),baselineDigest=disclosureDigest(['relevance-baseline/v1',developmentDigest,'legacy',fixture.clock,fixture.fakeIdentity]);
 const evidence=fixture.rows.map(row=>retrieve(row,fixture.clock));
 const lexical=[...new Set([1,...evidence.flatMap(results=>results.map(result=>result.components.contentLexicalCoverage))])].filter(value=>Number.isFinite(value)&&value>0&&value<=1).sort((a,b)=>a-b);
 const semantic=[...new Set([1,...evidence.flatMap(results=>results.map(result=>result.components.semanticSimilarity))])].filter(value=>Number.isFinite(value)&&value>0&&value<=1).sort((a,b)=>a-b);
 const calibrationDigest=disclosureDigest(['relevance-calibration/v1',developmentDigest,PREREGISTRATION]);
 const candidates=lexical.flatMap(minLexicalCoverage=>semantic.map(minSemanticSimilarity=>{const policy:RelevancePolicy={version:'relevance/v1',calibrationDigest,minLexicalCoverage,minSemanticSimilarity};return {policy,report:evaluateRows(fixture.rows,policy,fixture.clock)};}));
 const qualifying=candidates.filter(({report:r})=>r.candidate.precision!==null&&r.candidate.precision>=PREREGISTRATION.minPrecision&&r.candidate.recall!==null&&r.candidate.recall>=PREREGISTRATION.minRecall&&r.candidate.falseSupport!==null&&r.candidate.falseSupport<=PREREGISTRATION.maxFalseSupport);
 qualifying.sort((a,b)=>(b.report.candidate.precision??0)-(a.report.candidate.precision??0)||(b.report.candidate.recall??0)-(a.report.candidate.recall??0)||a.policy.minLexicalCoverage-b.policy.minLexicalCoverage||a.policy.minSemanticSimilarity-b.policy.minSemanticSimilarity);
 const selected=qualifying[0]??candidates[candidates.length-1]!;
 return {...selected,go:qualifying.length>0,developmentDigest,baselineDigest,preregistration:PREREGISTRATION,enumeratedPairs:candidates.length};
}
export type Calibration=ReturnType<typeof calibrateDevelopment>;
export function sealCalibration(selected:Calibration,heldoutDigest:string,previous?:string):string {
 const seal=disclosureDigest(['relevance-seal/v1',selected.policy,selected.developmentDigest,selected.baselineDigest,selected.preregistration,heldoutDigest]);
 if(previous&&previous!==seal)throw Error('sealed calibration changed');
 return seal;
}
export function evaluateHeldout(fixture:RelevanceFixture,selected:Calibration,seal:string,heldoutDigest:string){
 sealCalibration(selected,heldoutDigest,seal);
 if(fixture.partition!=='heldout'||fixtureDigest(fixture)!==heldoutDigest)throw Error('heldout fixture digest mismatch');
 return evaluateRows(fixture.rows,selected.policy,fixture.clock);
}
