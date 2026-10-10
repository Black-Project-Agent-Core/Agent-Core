import {disclosureDigest,MemoryControllerError} from './disclosure.js';
import type {MemorySearchResult} from './retrieval.js';

/** Host-local opt-in; thresholds are evidence gates, never probabilities. */
export interface RelevancePolicy {
  version:'relevance/v1';
  calibrationDigest:string;
  minLexicalCoverage:number;
  minSemanticSimilarity:number;
}
export interface RelevanceInput {
  results:MemorySearchResult[];
  eligibleCount:number;
  semanticStatus:'available'|'unavailable'|'disabled';
  policy:RelevancePolicy;
}
export interface RelevanceDecision {
  status:'supported'|'insufficient-relevant-evidence'|'empty-corpus';
  acceptedIds:string[];
  policyDigest:string;
  semanticStatus:RelevanceInput['semanticStatus'];
}
const invalid=():never=>{throw new MemoryControllerError('MEMORY_INPUT_INVALID');};
const unit=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;

/** Validate and copy before any store initialization; retain no caller-owned object. */
export function validateRelevancePolicy(value:RelevancePolicy):Readonly<RelevancePolicy> {
  if(!value||value.version!=='relevance/v1'||typeof value.calibrationDigest!=='string'
    ||!value.calibrationDigest.trim()||value.calibrationDigest.length>256
    ||!unit(value.minLexicalCoverage)||value.minLexicalCoverage===0
    ||!unit(value.minSemanticSimilarity)||value.minSemanticSimilarity===0)invalid();
  return Object.freeze({version:'relevance/v1',calibrationDigest:value.calibrationDigest,
    minLexicalCoverage:value.minLexicalCoverage,minSemanticSimilarity:value.minSemanticSimilarity});
}

/** Deterministic admission after eligibility and ranking; ranking order/weights stay intact. */
export function assessMemoryRelevance(input:RelevanceInput):RelevanceDecision {
  const policy=validateRelevancePolicy(input?.policy);
  if(!Array.isArray(input.results)||!Number.isSafeInteger(input.eligibleCount)||input.eligibleCount<0
    ||!['available','unavailable','disabled'].includes(input.semanticStatus))invalid();
  const acceptedIds:string[]=[],seen=new Set<string>();
  for(const result of input.results){
    const evidence=result?.components;
    if(!result?.record||typeof result.record.id!=='string'||seen.has(result.record.id)
      ||!evidence||typeof evidence.contentExactPhrase!=='boolean'||!unit(evidence.contentLexicalCoverage)
      ||!unit(evidence.semanticSimilarity)||input.eligibleCount===0)invalid();
    seen.add(result.record.id);
    if(evidence.contentExactPhrase||evidence.contentLexicalCoverage>=policy.minLexicalCoverage
      ||(input.semanticStatus==='available'&&evidence.semanticSimilarity>=policy.minSemanticSimilarity))acceptedIds.push(result.record.id);
  }
  return {status:input.eligibleCount===0?'empty-corpus':acceptedIds.length?'supported':'insufficient-relevant-evidence',
    acceptedIds,policyDigest:disclosureDigest(['memory-relevance-policy/v1',policy]),semanticStatus:input.semanticStatus};
}
